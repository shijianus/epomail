import { mailOrm as orm } from '../entity/orm';
import { att } from '../entity/att';
import { and, eq, isNull, inArray, desc, asc } from 'drizzle-orm';
import r2Service from './r2-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { attConst } from '../const/entity-const';
import { parseHTML } from 'linkedom';
import { v4 as uuidv4 } from 'uuid';
import domainUtils from '../utils/domain-uitls';
import settingService from "./setting-service";
import BizError from '../error/biz-error';
import { buildSignedObjectUrl } from '../utils/object-token';

import storageQuotaService from './storage-quota-service';
import { getMailDb } from '../utils/db-accessor';

const ATTACHMENT_CONTENT_PATTERN = /\{\{domain\}\}\/*(attachments\/[A-Za-z0-9._-]+)/g;
const ATTACHMENT_ROOT_RELATIVE_PATTERN = /(^|["'(=\s])\/(attachments\/[A-Za-z0-9._-]+)/g;
const ATTACHMENT_RELATIVE_PATTERN = /(^|["'(=\s])(attachments\/[A-Za-z0-9._-]+)/g;
// Absolute and protocol-relative URLs. Hosts are checked against this site's
// object hosts before anything is rewritten; third-party hosts are untouched.
const ATTACHMENT_ABSOLUTE_PATTERN = /(?:https?:)?\/\/[^\s"'<>]+/gi;
const ATTACHMENT_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

function normalizeHostname(value) {
	return String(value || '').toLowerCase().replace(/\.$/, '');
}

/**
 * The mailbox that owns a row vs. the mailbox whose storage holds the bytes.
 * Internal delivery copies rows to every recipient, but those copies still
 * point at the sender's physical object (which may live in a BYO bucket).
 */
function storageOwnerId(row) {
	const storageUserId = Number(row?.storageUserId);
	return Number.isSafeInteger(storageUserId) && storageUserId > 0 ? storageUserId : row?.userId;
}

function attachmentKeyFromAbsoluteUrl(token) {
	let url;
	try {
		url = new URL(token.startsWith('//') ? `https:${token}` : token);
	} catch (_) {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	const marker = '/attachments/';
	const index = url.pathname.indexOf(marker);
	if (index === -1) return null;
	const filename = url.pathname.slice(index + marker.length);
	return {
		host: normalizeHostname(url.hostname),
		key: ATTACHMENT_KEY_PATTERN.test(filename) ? `attachments/${filename}` : null,
		path: `/attachments/${filename}`
	};
}

function hostnameFromSetting(value) {
	if (typeof value !== 'string' || !value.trim()) return '';
	try {
		return normalizeHostname(
			new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`).hostname
		);
	} catch (_) {
		return '';
	}
}

async function trustedAttachmentHosts(c) {
	const hosts = new Set();
	try {
		const setting = await settingService.query(c);
		for (const value of [setting?.r2Domain, setting?.customDomain]) {
			const host = hostnameFromSetting(value);
			if (host) hosts.add(host);
		}
	} catch (_) {}
	for (const value of String(c?.env?.LEGACY_ATTACHMENT_DOMAINS || '').split(',')) {
		const host = hostnameFromSetting(value);
		if (host) hosts.add(host);
	}
	try {
		const host = normalizeHostname(new URL(c.req.url).hostname);
		if (host) hosts.add(host);
	} catch (_) {}
	return hosts;
}

function collectContentAttachmentKeys(content) {
	const keys = new Set();
	if (typeof content !== 'string' || !content) return [];
	for (const match of content.matchAll(ATTACHMENT_CONTENT_PATTERN)) keys.add(match[1]);
	for (const match of content.matchAll(ATTACHMENT_ROOT_RELATIVE_PATTERN)) keys.add(match[2]);
	for (const match of content.matchAll(ATTACHMENT_RELATIVE_PATTERN)) keys.add(match[2]);
	for (const match of content.matchAll(ATTACHMENT_ABSOLUTE_PATTERN)) {
		const parsed = attachmentKeyFromAbsoluteUrl(match[0]);
		if (parsed?.key) keys.add(parsed.key);
	}
	return [...keys];
}

const attService = {

	async addAtt(c, attachments) {
		if (!attachments || attachments.length === 0) return;

		const userId = attachments[0]?.userId;
		if (userId) {
			const totalIncomingBytes = attachments.reduce((sum, item) => sum + Number(item.size || item.content?.length || 0), 0);
			const quotaCheck = await storageQuotaService.checkQuotaAvailable(c, userId, totalIncomingBytes);
			if (!quotaCheck.allowed) {
				console.warn(`User ${userId} storage quota exceeded: ${quotaCheck.reason}`);
				return;
			}
		}

		for (let attachment of attachments) {
			const attSize = Number(attachment.size || attachment.content?.length || 0);
			if (userId && attSize > 0) {
				const sizeCheck = await storageQuotaService.checkAttachmentSizeLimit(c, userId, attSize);
				if (!sizeCheck.allowed) {
					console.warn(`Attachment ${attachment.filename} skipped: ${sizeCheck.reason}`);
					continue;
				}
			}
			let metadate = {
				contentType: attachment.mimeType,
			};

			if (!attachment.contentId) {
				metadate.contentDisposition = fileUtils.encodeContentDisposition(attachment.filename, 'attachment');
			} else {
				metadate.contentDisposition = fileUtils.encodeContentDisposition(attachment.filename, 'inline');
				metadate.cacheControl = `max-age=259200`;
			}

			await r2Service.putObj(c, attachment.key, attachment.content, metadate, attachment.userId || userId);
		}

		await orm(c).insert(att).values(attachments).run();
	},

	list(c, params, userId) {
		const { emailId } = params;

		return orm(c).select().from(att).where(
			and(
				eq(att.emailId, emailId),
				eq(att.userId, userId),
				eq(att.type, attConst.type.ATT),
				isNull(att.contentId)
			)
		).all();
	},

	async toImageUrlHtml(c, content, userId = null) {

		const { r2Domain } = await settingService.query(c);
		const ossDomain = domainUtils.toOssDomain(r2Domain);

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		let imageDataList = [];

		for (const img of images) {

			//邮件正文base64图片转cid附件
			const src = img.getAttribute('src');
			if (src && src.startsWith('data:image')) {
				const file = fileUtils.base64ToFile(src);
				const buff = await file.arrayBuffer();
				const cid = uuidv4().replace(/-/g, '');
				const key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(buff) + fileUtils.getExtFileName(file.name);

				img.setAttribute('src', 'cid:' + cid);

				const attData = {};
				attData.key = key;
				attData.filename = file.name;
				attData.mimeType = file.type;
				attData.size = file.size;
				attData.buff = buff;
				attData.content = fileUtils.base64ToDataStr(src);
				attData.contentId = cid;

				imageDataList.push(attData);
			}

			//邮件正文站内图片转cid附件
			if (src && ((ossDomain && src.startsWith(ossDomain)) || src.startsWith('{{domain}}attachments/') || src.startsWith('attachments/') || src.startsWith('/oss/attachments/'))) {

				const cid = uuidv4().replace(/-/g, '')
				img.setAttribute('src', 'cid:' + cid);

				const attData = {};

				if (ossDomain && src.startsWith(ossDomain)) {
					attData.key = src.replace(ossDomain + '/','');
				}

				if (src.startsWith('{{domain}}attachments/')) {
					attData.key = src.slice('{{domain}}'.length).split('?')[0];
				}

				if (src.startsWith('attachments/')) {
					attData.key = src;
				}

				if (src.startsWith('/oss/attachments/')) {
					attData.key = src.slice('/oss/'.length).split('?')[0];
				}

				attData.contentId = cid;
				attData.type = attConst.type.EMBED;
				imageDataList.push(attData);

			}

			const hasInlineWidth = img.hasAttribute('width');
			const style = img.getAttribute('style') || '';
			const hasStyleWidth = /(^|\s)width\s*:\s*[^;]+/.test(style);

			if (!hasInlineWidth && !hasStyleWidth) {
				const newStyle = (style ? style.trim().replace(/;$/, '') + '; ' : '') + 'max-width: 100%;';
				img.setAttribute('style', newStyle);
			}
		}

		//查询已有内嵌url图片信息
		const keys = [...new Set(imageDataList.filter(item => !item.content && item.key).map(item => item.key))];
		const dbImageList  = await this.selectOneByKeys(c, keys, userId);

		//设置给当前附件
		await Promise.all(imageDataList.map(async image => {
			if (image.content) {
				return;
			}

			const dbImage = dbImageList.find(dbImage => image.key === dbImage.key);
			if (!dbImage) {
				return;
			}

			image.size = dbImage.size;
			image.filename = dbImage.filename;
			image.mimeType = dbImage.mimeType;
			image.contentType = dbImage.mimeType;

			const obj = await r2Service.getObj(c, image.key, storageOwnerId(dbImage));
			if (!obj) {
				return;
			}

			image.content = obj instanceof ArrayBuffer ? obj : await obj.arrayBuffer();
		}))

		imageDataList = imageDataList.filter(image => image.content);

		return { imageDataList, html: document.toString() };
	},

	async saveSendAtt(c, attList, userId, accountId, emailId) {

		const attDataList = [];

		for (let att of attList) {
			att.buff = fileUtils.base64ToUint8Array(att.content);

			// 校验单个附件大小限制 (仅在用户使用管理员公共DB/存储时限制，BYO存储用户不限)
			const sizeCheck = await storageQuotaService.checkAttachmentSizeLimit(c, userId, att.buff.length);
			if (!sizeCheck.allowed) {
				throw new BizError(sizeCheck.reason);
			}

			att.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(att.buff) + fileUtils.getExtFileName(att.filename);
			const attData = { userId, accountId, emailId };
			attData.key = att.key;
			attData.size = att.buff.length;
			attData.filename = att.filename;
			attData.mimeType = att.type;
			attData.type = attConst.type.ATT;
			attDataList.push(attData);
		}

		await orm(c).insert(att).values(attDataList).run();

		for (let att of attList) {
			await r2Service.putObj(c, att.key, att.buff, {
				contentType: att.type,
				contentDisposition: fileUtils.encodeContentDisposition(att.filename, 'attachment')
			}, userId);
		}

	},

	async saveArticleAtt(c, attDataList, userId, accountId, emailId) {

		for (let attData of attDataList) {
			attData.userId = userId;
			attData.emailId = emailId;
			attData.accountId = accountId;
			attData.type = attConst.type.EMBED;
			if (!attData.buff) {
				continue;
			}
			await r2Service.putObj(c, attData.key, attData.buff, {
				contentType: attData.mimeType,
				cacheControl: `max-age=259200`,
				contentDisposition: fileUtils.encodeContentDisposition(attData.filename, 'inline')
			}, userId);
			delete attData.buff;
		}

		await orm(c).insert(att).values(attDataList).run();

	},

	async removeByUserIds(c, userIds) {
		await this.removeAttByField(c, 'user_id', userIds);
	},

	async removeByEmailIds(c, emailIds) {
		await this.removeAttByField(c, 'email_id', emailIds);
	},

	selectByEmailIds(c, emailIds) {
		return orm(c).select().from(att).where(
			and(
				inArray(att.emailId, emailIds),
				eq(att.type, attConst.type.ATT)
			))
			.all();
	},

	/**
	 * Every attachment row for the given messages, including inline EMBED rows.
	 * Used when delivering internal mail so the recipient receives the same
	 * content relations (not just the downloadable ATT rows).
	 */
	selectAllByEmailIds(c, emailIds) {
		return orm(c).select().from(att).where(inArray(att.emailId, emailIds)).all();
	},

	async removeAttByField(c, fieldName, fieldValues) {

		const mailDb = getMailDb(c);
		const sqlList = [];

		fieldValues.forEach(value => {

			sqlList.push(

				mailDb.prepare(
					`SELECT a.key, a.att_id
						FROM attachments a
							   JOIN (SELECT key
									 FROM attachments
									 GROUP BY key
									 HAVING COUNT (*) = 1) t
									ON a.key = t.key
						WHERE a.${fieldName} = ?;`
					).bind(value)
			)

			sqlList.push(mailDb.prepare(`DELETE FROM attachments WHERE ${fieldName} = ?`).bind(value))

		});

		const attListResult = await mailDb.batch(sqlList);

		const delKeyList = attListResult.flatMap(r => r.results ? r.results.map(row => row.key) : []);

		if (delKeyList.length > 0) {
			await this.batchDelete(c, delKeyList);
		}

	},

	async batchDelete(c, keys) {
		if (!keys.length) return;

		const BATCH_SIZE = 1000;

		for (let i = 0; i < keys.length; i += BATCH_SIZE) {
			const batch = keys.slice(i, i + BATCH_SIZE);
			await r2Service.delete(c, batch);
		}

	},

	async removeByAccountId(c, accountId) {
		await this.removeAttByField(c, "account_id", [accountId])
	},

	selectOneByKeys(c, keys, userId = null) {
		if (!keys || keys.length === 0) {
			return []
		}
		const uniqueKeys = [...new Set(keys)];
		const selectChunk = (chunk) => {
			const conditions = [inArray(att.key, chunk)];
			if (userId !== null && userId !== undefined) {
				conditions.push(eq(att.userId, userId));
			}
			return orm(c).select().from(att).where(and(...conditions)).orderBy(desc(att.attId)).groupBy(att.key).all();
		};
		if (uniqueKeys.length <= 90) {
			return selectChunk(uniqueKeys);
		}
		return (async () => {
			const rows = [];
			for (let i = 0; i < uniqueKeys.length; i += 90) {
				rows.push(...await selectChunk(uniqueKeys.slice(i, i + 90)));
			}
			return rows;
		})();
	},

	async existsForUser(c, key, userId) {
		if (!key || !userId) return false;
		const row = await orm(c).select({ attId: att.attId }).from(att).where(
			and(eq(att.key, key), eq(att.userId, userId))
		).get();
		return !!row;
	},

	/**
	 * Access rows for the current viewer. Passing userId restricts the lookup
	 * to rows delivered to that mailbox; null is reserved for administrators.
	 * Each result keeps both the mailbox owner and the mailbox whose storage
	 * physically holds the object (they differ for internal delivery copies).
	 */
	async findAccessibleAttachmentRows(c, keys, userId = null) {
		const uniqueKeys = [...new Set((keys || []).filter(key => typeof key === 'string' && key))];
		if (uniqueKeys.length === 0) return new Map();

		const rowsByKey = new Map();
		// D1 caps bound parameters per statement (100); keep headroom.
		for (let i = 0; i < uniqueKeys.length; i += 90) {
			const chunk = uniqueKeys.slice(i, i + 90);
			const conditions = [inArray(att.key, chunk)];
			if (userId !== null && userId !== undefined) {
				conditions.push(eq(att.userId, userId));
			}
			const rows = await orm(c).select({
				key: att.key,
				userId: att.userId,
				storageUserId: att.storageUserId
			})
				.from(att)
				.where(and(...conditions))
				.orderBy(asc(att.attId))
				.all();
			for (const row of rows) {
				if (!rowsByKey.has(row.key)) {
					rowsByKey.set(row.key, { ...row, storageOwnerId: storageOwnerId(row) });
				}
			}
		}
		return rowsByKey;
	},

	storageOwnerId,

	/**
	 * Replace attachment placeholders or legacy public-domain attachment URLs
	 * with short-lived signed worker URLs. Only keys that the mailbox has an
	 * attachment row for are signed, so a malicious message body cannot mint
	 * capabilities for someone else's file. The signature is bound to the
	 * mailbox whose storage holds the bytes, not to the viewing mailbox.
	 * Recognized attachment URLs on this site's object hosts that cannot be
	 * signed are neutralized to an unsigned /attachments/ path instead of
	 * retaining a public link. Third-party absolute URLs are matched by host,
	 * not by the string "attachments", and are left untouched.
	 */
	async signContentAttachmentUrls(c, content, userId, ttlSeconds = 3600) {
		if (typeof content !== 'string' || !content) return content;

		const keys = collectContentAttachmentKeys(content);
		const replacements = new Map();
		if (userId && keys.length > 0) {
			const rows = await this.findAccessibleAttachmentRows(c, keys, userId);
			for (const [key, row] of rows) {
				try {
					replacements.set(key, await buildSignedObjectUrl(c, key, {
						userId: row.storageOwnerId,
						ttlSeconds
					}));
				} catch (_) {
					// Signing failed; fall through to the neutralized path.
				}
			}
		}

		const trustedHosts = await trustedAttachmentHosts(c);
		const signedOrNeutral = key => replacements.get(key) || `/${key}`;

		return content
			.replace(ATTACHMENT_CONTENT_PATTERN, (match, key) => signedOrNeutral(key))
			.replace(ATTACHMENT_ABSOLUTE_PATTERN, (match) => {
				const parsed = attachmentKeyFromAbsoluteUrl(match);
				if (!parsed || !trustedHosts.has(parsed.host)) return match;
				return parsed.key ? signedOrNeutral(parsed.key) : parsed.path;
			})
			.replace(ATTACHMENT_ROOT_RELATIVE_PATTERN, (match, prefix, key) => prefix + signedOrNeutral(key))
			.replace(ATTACHMENT_RELATIVE_PATTERN, (match, prefix, key) => prefix + signedOrNeutral(key));
	}
};

export default attService;
