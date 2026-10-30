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
import { normalizeObjectKey } from '../utils/object-key-utils';

const ATTACHMENT_CONTENT_PATTERN = /{{domain}}(attachments\/[A-Za-z0-9._-]+)/g;

// Whitelist: these column names are interpolated into SQL below, so callers
// must never be able to pass an arbitrary identifier.
const DELETION_FIELDS = new Set(['user_id', 'email_id', 'account_id']);
const DELETION_QUEUE_MAX_ATTEMPTS = 10;
const OBJECT_DELETE_CHUNK = 100;
const deletionQueueReady = new WeakSet();

/**
 * Durable outbox for storage objects whose D1 metadata has already been
 * removed. D1 and object storage cannot share a transaction, so the queue is
 * written in the same D1 batch as the row deletion and replayed until the
 * backend confirms the delete (or the retry budget is exhausted).
 */
async function ensureDeletionQueueTable(c) {
	const mailDb = getMailDb(c);
	if (deletionQueueReady.has(mailDb)) return mailDb;

	await mailDb.prepare(`
		CREATE TABLE IF NOT EXISTS object_deletion_queue (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			object_key TEXT NOT NULL,
			user_id INTEGER NOT NULL DEFAULT 0,
			attempts INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'pending',
			last_error TEXT,
			next_retry_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			UNIQUE(object_key, user_id)
		)
	`).run();
	await mailDb.prepare(
		`CREATE INDEX IF NOT EXISTS idx_object_deletion_queue_due ON object_deletion_queue(status, next_retry_at)`
	).run();
	deletionQueueReady.add(mailDb);
	return mailDb;
}

function queueOwner(userId) {
	const owner = Number(userId);
	return Number.isSafeInteger(owner) && owner > 0 ? owner : 0;
}

function collectContentAttachmentKeys(content) {
	const keys = new Set();
	if (typeof content !== 'string' || !content) return [];
	let match;
	const pattern = new RegExp(ATTACHMENT_CONTENT_PATTERN.source, 'g');
	while ((match = pattern.exec(content)) !== null) {
		keys.add(match[1]);
	}
	return [...keys];
}

const attService = {

	async addAtt(c, attachments) {
		if (!attachments || attachments.length === 0) return;

		const userId = attachments[0]?.userId;
		if (userId) {
			const totalIncomingBytes = attachments.reduce((sum, item) => sum + Number(item.size || item.content?.byteLength || item.content?.length || 0), 0);
			const quotaCheck = await storageQuotaService.checkQuotaAvailable(c, userId, totalIncomingBytes);
			if (!quotaCheck.allowed) {
				console.warn(`User ${userId} storage quota exceeded: ${quotaCheck.reason}`);
				return;
			}
		}

		const stored = [];
		const uploaded = [];

		for (let attachment of attachments) {
			const attSize = Number(attachment.size || attachment.content?.byteLength || attachment.content?.length || 0);
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

			const ownerUserId = attachment.userId || userId || null;
			try {
				await r2Service.putObj(c, attachment.key, attachment.content, metadate, ownerUserId);
				uploaded.push({ key: attachment.key, userId: ownerUserId });
				stored.push(attachment);
			} catch (e) {
				// Keep the rest of the message: one bad object must not drop every
				// other attachment, but it must never produce a metadata row either.
				console.error(`[attachment-store] failed to store ${attachment.key}:`, e.message);
			}
		}

		if (stored.length === 0) return;

		const rows = stored.map(attachment => ({
			userId: attachment.userId,
			emailId: attachment.emailId,
			accountId: attachment.accountId,
			key: attachment.key,
			filename: attachment.filename || null,
			mimeType: attachment.mimeType || null,
			size: attachment.size || 0,
			type: typeof attachment.type === 'number' ? attachment.type : attConst.type.ATT,
			contentId: attachment.contentId || null,
			disposition: attachment.disposition || null,
			related: attachment.related || null,
			encoding: attachment.encoding || null
		}));

		try {
			await orm(c).insert(att).values(rows).run();
		} catch (e) {
			// The insert failed after the objects were written: remove the
			// unreferenced objects so D1 and storage do not diverge.
			await this.cleanupUnreferencedObjects(c, uploaded);
			throw e;
		}
	},

	async list(c, params, userId) {
		const emailId = Number(params?.emailId);
		if (!Number.isInteger(emailId) || emailId <= 0 || !userId) {
			return [];
		}

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

			const obj = await r2Service.getObj(c, image.key, userId);
			if (!obj) {
				return;
			}

			image.content = obj instanceof ArrayBuffer ? obj : await obj.arrayBuffer();
		}))

		imageDataList = imageDataList.filter(image => image.content);

		return { imageDataList, html: document.toString() };
	},

	async saveSendAtt(c, attList, userId, accountId, emailId) {
		if (!attList || attList.length === 0) return;

		const prepared = [];
		let totalBytes = 0;

		for (let att of attList) {
			att.buff = fileUtils.base64ToUint8Array(att.content);

			// 校验单个附件大小限制 (仅在用户使用管理员公共DB/存储时限制，BYO存储用户不限)
			const sizeCheck = await storageQuotaService.checkAttachmentSizeLimit(c, userId, att.buff.length);
			if (!sizeCheck.allowed) {
				throw new BizError(sizeCheck.reason);
			}

			att.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(att.buff) + fileUtils.getExtFileName(att.filename);
			totalBytes += att.buff.length;
			prepared.push(att);
		}

		const quotaCheck = await storageQuotaService.checkQuotaAvailable(c, userId, totalBytes);
		if (!quotaCheck.allowed) {
			throw new BizError(quotaCheck.reason);
		}

		// Objects first, metadata second. If the upload fails no D1 row is
		// written, and a failed insert is compensated by deleting the objects
		// that have no metadata reference.
		const uploaded = [];
		try {
			for (let att of prepared) {
				await r2Service.putObj(c, att.key, att.buff, {
					contentType: att.type,
					contentDisposition: fileUtils.encodeContentDisposition(att.filename, 'attachment')
				}, userId);
				uploaded.push({ key: att.key, userId });
			}
		} catch (e) {
			await this.cleanupUnreferencedObjects(c, uploaded);
			throw e;
		}

		const rows = prepared.map(att => ({
			userId,
			accountId,
			emailId,
			key: att.key,
			filename: att.filename || null,
			mimeType: att.type || null,
			size: att.buff.length,
			type: attConst.type.ATT
		}));

		try {
			await orm(c).insert(att).values(rows).run();
		} catch (e) {
			await this.cleanupUnreferencedObjects(c, uploaded);
			throw e;
		}
	},

	async saveArticleAtt(c, attDataList, userId, accountId, emailId) {
		if (!attDataList || attDataList.length === 0) return;

		const prepared = [];
		let totalBytes = 0;

		for (let attData of attDataList) {
			if (!attData.buff) {
				continue;
			}
			attData.userId = userId;
			attData.emailId = emailId;
			attData.accountId = accountId;
			attData.type = attConst.type.EMBED;
			totalBytes += attData.buff.byteLength || attData.buff.length || 0;
			prepared.push(attData);
		}

		if (prepared.length === 0) return;

		const quotaCheck = await storageQuotaService.checkQuotaAvailable(c, userId, totalBytes);
		if (!quotaCheck.allowed) {
			throw new BizError(quotaCheck.reason);
		}

		const uploaded = [];
		try {
			for (let attData of prepared) {
				await r2Service.putObj(c, attData.key, attData.buff, {
					contentType: attData.mimeType,
					cacheControl: `max-age=259200`,
					contentDisposition: fileUtils.encodeContentDisposition(attData.filename, 'inline')
				}, userId);
				uploaded.push({ key: attData.key, userId });
			}
		} catch (e) {
			await this.cleanupUnreferencedObjects(c, uploaded);
			throw e;
		}

		const rows = prepared.map(attData => ({
			userId,
			emailId,
			accountId,
			key: attData.key,
			filename: attData.filename || null,
			mimeType: attData.mimeType || attData.contentType || null,
			size: attData.size || attData.buff.byteLength || attData.buff.length || 0,
			type: attConst.type.EMBED,
			contentId: attData.contentId || null
		}));

		try {
			await orm(c).insert(att).values(rows).run();
		} catch (e) {
			await this.cleanupUnreferencedObjects(c, uploaded);
			throw e;
		}
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

	async removeAttByField(c, fieldName, fieldValues) {
		if (!DELETION_FIELDS.has(fieldName)) {
			throw new Error('Invalid attachment deletion field');
		}
		const values = (fieldValues || []).filter(value => value !== undefined && value !== null);
		if (values.length === 0) return;

		const mailDb = await ensureDeletionQueueTable(c);
		const candidates = new Map();

		// Collect every key touched by this delete, with the storage owner.
		// The key may still be referenced by another mailbox (content-addressed
		// dedupe), so the object is only removed after the post-delete refcount
		// check below.
		for (const value of values) {
			const rows = await mailDb.prepare(
				`SELECT DISTINCT key, user_id FROM attachments WHERE ${fieldName} = ?`
			).bind(value).all();
			for (const row of rows.results || []) {
				const key = normalizeObjectKey(row.key);
				if (!key) continue;
				if (!candidates.has(key)) candidates.set(key, new Set());
				candidates.get(key).add(queueOwner(row.user_id));
			}
		}

		const statements = values.map(value =>
			mailDb.prepare(`DELETE FROM attachments WHERE ${fieldName} = ?`).bind(value)
		);

		const entries = [];
		for (const [key, owners] of candidates) {
			for (const owner of owners) {
				entries.push({ key, userId: owner });
				statements.push(
					mailDb.prepare(`
						INSERT OR IGNORE INTO object_deletion_queue (object_key, user_id, next_retry_at)
						VALUES (?, ?, CURRENT_TIMESTAMP)
					`).bind(key, owner)
				);
			}
		}

		// D1 batch is transactional: metadata deletion and the durable delete
		// outbox either both commit or both roll back. Object deletion happens
		// afterwards and is retried by the queue when the backend fails.
		await mailDb.batch(statements);

		if (entries.length > 0) {
			await this.drainObjectDeletionQueue(c, entries).catch(e => {
				console.warn('[object-delete] immediate drain failed; queued for retry:', e.message);
			});
		}
	},

	/**
	 * Replay the durable deletion outbox. Passing `entries` drains exactly the
	 * keys touched by the current request; omitting it drains all due rows and
	 * is used by the scheduled task.
	 */
	async drainObjectDeletionQueue(c, entries = null, { limit = 100 } = {}) {
		const mailDb = await ensureDeletionQueueTable(c);

		let rows;
		if (Array.isArray(entries) && entries.length > 0) {
			const seen = new Set();
			rows = [];
			for (const entry of entries) {
				const key = normalizeObjectKey(entry.key);
				if (!key) continue;
				const owner = queueOwner(entry.userId);
				const dedupe = `${owner}:${key}`;
				if (seen.has(dedupe)) continue;
				seen.add(dedupe);
				rows.push({ object_key: key, user_id: owner, attempts: 0 });
			}
		} else {
			const result = await mailDb.prepare(`
				SELECT object_key, user_id, attempts
				FROM object_deletion_queue
				WHERE status = 'pending' AND next_retry_at <= CURRENT_TIMESTAMP
				ORDER BY id
				LIMIT ?
			`).bind(Math.max(1, Math.min(Number(limit) || 100, 500))).all();
			rows = result.results || [];
		}

		let deleted = 0;
		let skipped = 0;
		let failed = 0;

		for (const row of rows) {
			const key = normalizeObjectKey(row.object_key);
			const owner = queueOwner(row.user_id);

			if (!key) {
				await mailDb.prepare(
					`DELETE FROM object_deletion_queue WHERE object_key = ? AND user_id = ?`
				).bind(row.object_key, owner).run();
				skipped++;
				continue;
			}

			let referenced;
			try {
				referenced = await mailDb.prepare(
					`SELECT 1 AS present FROM attachments WHERE key = ? LIMIT 1`
				).bind(key).first();
			} catch (e) {
				// Cannot prove the object is unreferenced: never delete blind.
				await this.scheduleDeletionRetry(mailDb, key, owner, Number(row.attempts) || 0,
					`reference check failed: ${e.message}`);
				failed++;
				continue;
			}

			if (referenced) {
				// A surviving row owns the object; its eventual deletion will
				// enqueue the key again. Drop this stale queue entry.
				await mailDb.prepare(
					`DELETE FROM object_deletion_queue WHERE object_key = ? AND user_id = ?`
				).bind(key, owner).run();
				skipped++;
				continue;
			}

			try {
				await r2Service.delete(c, key, owner > 0 ? owner : null);
				await mailDb.prepare(
					`DELETE FROM object_deletion_queue WHERE object_key = ? AND user_id = ?`
				).bind(key, owner).run();
				deleted++;
			} catch (e) {
				await this.scheduleDeletionRetry(mailDb, key, owner, Number(row.attempts) || 0, e.message);
				failed++;
			}
		}

		return { processed: rows.length, deleted, skipped, failed };
	},

	async scheduleDeletionRetry(mailDb, key, owner, currentAttempts, message) {
		const attempts = currentAttempts + 1;
		const exhausted = attempts >= DELETION_QUEUE_MAX_ATTEMPTS;
		const delayMinutes = Math.min(5 * Math.pow(2, Math.min(currentAttempts, 7)), 720);

		await mailDb.prepare(`
			UPDATE object_deletion_queue
			SET attempts = ?,
				status = ?,
				last_error = ?,
				next_retry_at = datetime('now', ?)
			WHERE object_key = ? AND user_id = ?
		`).bind(
			attempts,
			exhausted ? 'failed' : 'pending',
			String(message || '').slice(0, 500),
			`+${delayMinutes} minutes`,
			key,
			owner
		).run();

		console.warn(`[object-delete-retry] key=${key} owner=${owner} attempts=${attempts} status=${exhausted ? 'failed' : 'pending'}: ${message}`);
	},

	/**
	 * Best-effort compensation after a failed metadata insert. A key that is
	 * still referenced is left alone; a failed reference check is queued so the
	 * retry worker can re-evaluate it instead of guessing.
	 */
	async cleanupUnreferencedObjects(c, uploaded) {
		if (!uploaded || uploaded.length === 0) return;

		const mailDb = getMailDb(c);
		const seen = new Set();

		for (const item of uploaded) {
			const key = normalizeObjectKey(item.key);
			if (!key) continue;
			const owner = queueOwner(item.userId);
			const dedupe = `${owner}:${key}`;
			if (seen.has(dedupe)) continue;
			seen.add(dedupe);

			try {
				const ref = await mailDb.prepare(
					`SELECT 1 AS present FROM attachments WHERE key = ? LIMIT 1`
				).bind(key).first();
				if (ref) continue;
			} catch (e) {
				console.warn('[storage-compensation] reference check failed; deferring delete:', key, e.message);
				await this.enqueueObjectDeletions(c, [{ key, userId: owner }]);
				continue;
			}

			try {
				await r2Service.delete(c, key, owner > 0 ? owner : null);
			} catch (e) {
				console.warn('[storage-compensation] delete failed; queuing retry:', key, e.message);
				await this.enqueueObjectDeletions(c, [{ key, userId: owner }]);
			}
		}
	},

	async enqueueObjectDeletions(c, entries) {
		if (!entries || entries.length === 0) return;
		const mailDb = await ensureDeletionQueueTable(c);
		const seen = new Set();
		const statements = [];

		for (const entry of entries) {
			const key = normalizeObjectKey(entry.key);
			if (!key) continue;
			const owner = queueOwner(entry.userId);
			const dedupe = `${owner}:${key}`;
			if (seen.has(dedupe)) continue;
			seen.add(dedupe);
			statements.push(
				mailDb.prepare(`
					INSERT OR IGNORE INTO object_deletion_queue (object_key, user_id, next_retry_at)
					VALUES (?, ?, CURRENT_TIMESTAMP)
				`).bind(key, owner)
			);
		}

		if (statements.length > 0) {
			await mailDb.batch(statements);
		}
	},

	async batchDelete(c, keys, userId = null) {
		const normalized = [...new Set((keys || []).map(normalizeObjectKey).filter(Boolean))];
		if (normalized.length === 0) return;

		for (let i = 0; i < normalized.length; i += OBJECT_DELETE_CHUNK) {
			await r2Service.delete(c, normalized.slice(i, i + OBJECT_DELETE_CHUNK), userId);
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
	 * Resolve the owner of each attachment key. Passing userId restricts the
	 * lookup to that mailbox; passing null is reserved for administrators.
	 * Returns a Map<key, userId> containing only keys that actually exist.
	 */
	async findOwnedKeyOwners(c, keys, userId = null) {
		const uniqueKeys = [...new Set((keys || []).filter(key => typeof key === 'string' && key))];
		if (uniqueKeys.length === 0) return new Map();

		const owners = new Map();
		// D1 caps bound parameters per statement (100); keep headroom.
		for (let i = 0; i < uniqueKeys.length; i += 90) {
			const chunk = uniqueKeys.slice(i, i + 90);
			const conditions = [inArray(att.key, chunk)];
			if (userId !== null && userId !== undefined) {
				conditions.push(eq(att.userId, userId));
			}
			const rows = await orm(c).select({ key: att.key, userId: att.userId })
				.from(att)
				.where(and(...conditions))
				.orderBy(asc(att.attId))
				.all();
			for (const row of rows) {
				if (!owners.has(row.key)) owners.set(row.key, row.userId);
			}
		}
		return owners;
	},

	/**
	 * Replace {{domain}}attachments/<key> placeholders with short-lived signed
	 * worker URLs. Only keys that belong to the mailbox owner are signed, so a
	 * malicious message body cannot mint capabilities for someone else's file.
	 */
	async signContentAttachmentUrls(c, content, userId, ttlSeconds = 3600) {
		const keys = collectContentAttachmentKeys(content);
		if (keys.length === 0 || !userId) return content;

		const owners = await this.findOwnedKeyOwners(c, keys, userId);
		if (owners.size === 0) return content;

		const replacements = new Map();
		for (const [key, ownerUserId] of owners) {
			replacements.set(key, await buildSignedObjectUrl(c, key, { userId: ownerUserId, ttlSeconds }));
		}

		return content.replace(
			new RegExp(ATTACHMENT_CONTENT_PATTERN.source, 'g'),
			(match, key) => replacements.get(key) || match
		);
	}
};

export default attService;
