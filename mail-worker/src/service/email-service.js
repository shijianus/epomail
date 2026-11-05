import { mailOrm as orm, userOrm } from '../entity/orm';
import { getUserDb, getMailDb } from '../utils/db-accessor';
import email from '../entity/email';
import { auditLog } from '../entity/audit-log';
import auditService from './audit-service';
import { attConst, emailConst, isDel, settingConst } from '../const/entity-const';
import { and, desc, eq, gt, inArray, lt, count, asc, sql, ne, or, like, lte, gte } from 'drizzle-orm';
import { star } from '../entity/star';
import settingService from './setting-service';
import accountService from './account-service';
import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import fileUtils from '../utils/file-utils';
import { Resend } from 'resend';
import attService from './att-service';
import { parseHTML } from 'linkedom';
import userService from './user-service';
import roleService from './role-service';
import user from '../entity/user';
import starService from './star-service';
import dayjs from 'dayjs';
import kvConst from '../const/kv-const';
import { t } from '../i18n/i18n'
import domainUtils from '../utils/domain-uitls';
import account from "../entity/account";
import { att } from '../entity/att';
import telegramService from './telegram-service';
import emailCryptoUtils from '../utils/email-crypto-utils';
import { DEFAULT_WELCOME_SUBJECT, DEFAULT_WELCOME_CONTENT, getWelcomeTemplate, getGlobalAnnouncementTemplate, getLocaleByLang, getSenderNameByLang, getUserFallbackNameByLang, formatDateByLang, normalizeLangKey } from '../const/welcome-template';
import { isAdminEmail, isAdminUser } from '../utils/admin-utils';
import hashUtils from '../utils/hash-utils';
import verifyUtils from '../utils/verify-utils';
import storageQuotaService from './storage-quota-service';
import { assertOutboundAllowed } from '../utils/outbound-policy.js';
import { mailSha256, normalizeMailAddress, assertMailRowSize, buildBoundedInserts, prepareMailQuery } from '../utils/mail-pipeline.js';
import { mailTransactionGuard } from '../utils/mail-transaction.js';
import mailOutboundService from './mail-outbound-service.js';
import { deliverLocalMail } from './mail-local-delivery-service.js';
import mailLifecycleService from './mail-lifecycle-service.js';
import { reserveInboundQuota } from './mail-reliability-service.js';
import rateLimit from '../utils/rate-limit.js';

const ENCRYPTED_SEARCH_BATCH = 100;
// The default mailbox quota is 5,000 messages. Keep the scan bounded well above
// that while preventing an unbounded decrypt loop if a deployment raises it.
const ENCRYPTED_SEARCH_MAX_ROWS = 10000;

function includesNeedle(value, needle) {
	return String(value || '').toLowerCase().includes(String(needle || '').toLowerCase());
}

/**
 * Content matching for the encrypted-search path. SQLite cannot compare a
 * LIKE pattern against AES-GCM ciphertext, so the visible fields are compared
 * after decryption. All filters are combined with the same AND semantics as
 * the plaintext SQL path.
 */
export function matchesContentSearch(row, terms) {
	if (terms.subject && !includesNeedle(row.subject, terms.subject)) return false;
	if (terms.subjectOrBody
		&& !includesNeedle(row.subject, terms.subjectOrBody)
		&& !includesNeedle(row.text, terms.subjectOrBody)) return false;
	if (terms.body && !includesNeedle(row.text, terms.body)) return false;
	if (terms.keyword) {
		const keywordHit = ['subject', 'name', 'sendEmail', 'toEmail', 'text']
			.some(field => includesNeedle(row[field], terms.keyword));
		if (!keywordHit) return false;
	}
	const visibleSize = String(row.text || '').length + String(row.content || '').length;
	if (Number.isFinite(terms.sizeAtLeast) && visibleSize < terms.sizeAtLeast) return false;
	if (Number.isFinite(terms.sizeAtMost) && visibleSize > terms.sizeAtMost) return false;
	return true;
}

const emailService = {

	async list(c, params, userId) {
		if (userId) {
			try {
				await this.ensureWelcomeEmailForUser(c, userId);
			} catch (e) {
				console.warn('ensureWelcomeEmailForUser in list failed:', e.message);
			}
		}

		let { emailId, type, accountId, size, timeSort, allReceive, folder, keyword } = params;

		size = Number(size);
		emailId = Number(emailId);
		timeSort = Number(timeSort);
		accountId = Number(accountId);
		allReceive = Number(allReceive);

		// SQLite treats LIMIT -1 as "no limit". Clamp both ends so a crafted
		// negative size cannot dump the whole mailbox in one response.
		if (!Number.isInteger(size) || size < 1) size = 20;
		if (size > 50) {
			size = 50;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		if (accountId && !isNaN(accountId)) {
			const accountRow = await accountService.selectById(c, accountId);
			if (!accountRow || accountRow.userId !== userId) {
				return { list: [], total: 0, latestEmail: null };
			}
			if (isNaN(allReceive)) {
				allReceive = accountRow.allReceive;
			}
		} else if (isNaN(allReceive)) {
			allReceive = 1;
		}

		const query = orm(c)
			.select({
				...email,
				starId: star.starId
			})
			.from(email)
			.leftJoin(
				star,
				and(
					eq(star.emailId, email.emailId),
					eq(star.userId, userId)
				)
			).leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
		let isGlobal = false;
		let isSent = false;
		let isSpam = false;
		let isTrash = false;

		let pFrom = null;
		let pTo = null;
		let pSubject = null;
		let pSubjectOrBody = null;
		let pBody = null;
		let pSizeAtLeast = null;
		let pSizeAtMost = null;
		let pBefore = null;
		let pAfter = null;
		let pLabel = null;

		if (keyword) {
			isGlobal = /global:/i.test(keyword);
			isSent = /is:sent/i.test(keyword) || /from:me/i.test(keyword);
			isSpam = /is:spam/i.test(keyword);
			isTrash = /is:trash/i.test(keyword);

			const extractParam = (prefix) => {
				const regex = new RegExp(prefix + ':("([^"]+)"|([^\\s]+))', 'i');
				const match = keyword.match(regex);
				if (match) {
					keyword = keyword.replace(match[0], '');
					return match[2] || match[3];
				}
				return null;
			};

			pFrom = extractParam('from');
			pTo = extractParam('to');
			pSubject = extractParam('subject');
			pSubjectOrBody = extractParam('subject_or_body');
			pBody = extractParam('body');
			pSizeAtLeast = extractParam('larger');
			pSizeAtMost = extractParam('smaller');
			pBefore = extractParam('before');
			pAfter = extractParam('after');
			pLabel = extractParam('label');

			keyword = keyword.replace(/global:/ig, '')
				.replace(/is:sent/ig, '')
				.replace(/from:me/ig, '')
				.replace(/is:draft/ig, '') // drafts are local only, so we just strip it
				.replace(/is:spam/ig, '')
				.replace(/is:trash/ig, '')
				.replace(/hl:off/ig, '')
				.replace(/exact:true/ig, '')
				.replace(/case:true/ig, '')
				.trim();
		}

		const settingData = await settingService.query(c);
		const contentSearchRequested = Boolean(pSubject || pSubjectOrBody || pBody || pSizeAtLeast || pSizeAtMost || keyword);
		const encryptedSearch = contentSearchRequested && Number(settingData.allMailMode) !== 1;
		const parsedSizeAtLeast = pSizeAtLeast === null ? NaN : parseInt(pSizeAtLeast, 10);
		const parsedSizeAtMost = pSizeAtMost === null ? NaN : parseInt(pSizeAtMost, 10);
		const contentTerms = {
			subject: pSubject,
			subjectOrBody: pSubjectOrBody,
			body: pBody,
			keyword: keyword || null,
			sizeAtLeast: Number.isFinite(parsedSizeAtLeast) ? parsedSizeAtLeast : null,
			sizeAtMost: Number.isFinite(parsedSizeAtMost) ? parsedSizeAtMost : null
		};

		const commonConditions = [
			allReceive ? eq(1,1) : eq(email.accountId, accountId),
			eq(email.userId, userId),
			eq(account.isDel, isDel.NORMAL)
		];

		if (isGlobal) {
			// global search searches everywhere except maybe we only enforce account/user constraints
		} else {
			commonConditions.push(folder === 'trash' ? eq(email.isDel, 1) : (isTrash ? eq(email.isDel, 1) : eq(email.isDel, 0)));
			commonConditions.push(folder === 'spam' ? eq(email.isSpam, 1) : (isSpam ? eq(email.isSpam, 1) : (folder === 'trash' || folder === 'snoozed' || folder === 'all' ? eq(1,1) : eq(email.isSpam, 0))));
			commonConditions.push(folder === 'snoozed' ? sql`snoozed_time IS NOT NULL` : (folder === 'trash' || folder === 'spam' ? eq(1,1) : sql`(snoozed_time IS NULL OR send_email IN ('announcement@epocanvas.com', 'admin@epocanvas.com'))`));
			
			if (isSent) {
				const currentType = (folder === 'all' ? emailConst.type.RECEIVE : (type !== undefined ? type : emailConst.type.RECEIVE));
				commonConditions.push(inArray(email.type, [currentType, emailConst.type.SEND]));
			} else {
				commonConditions.push((!folder && type !== undefined) ? eq(email.type, type) : (folder === 'all' ? eq(email.type, 0) : eq(1,1)));
			}
		}

		if (pFrom) {
			commonConditions.push(
				or(like(email.sendEmail, '%'+ pFrom + '%'), like(email.name, '%'+ pFrom + '%'))
			);
		}
		if (pTo) {
			commonConditions.push(
				or(like(email.toEmail, '%'+ pTo + '%'), like(email.toName, '%'+ pTo + '%'))
			);
		}
		if (!encryptedSearch) {
			if (pSubject) {
				commonConditions.push(like(email.subject, '%'+ pSubject + '%'));
			}
			if (pSubjectOrBody) {
				commonConditions.push(
					or(like(email.subject, '%'+ pSubjectOrBody + '%'), like(email.text, '%'+ pSubjectOrBody + '%'))
				);
			}
			if (pBody) {
				commonConditions.push(like(email.text, '%'+ pBody + '%'));
			}
			if (pSizeAtLeast) {
				commonConditions.push(sql`ifnull(length(text), 0) + ifnull(length(content), 0) >= ${parseInt(pSizeAtLeast)}`);
			}
			if (pSizeAtMost) {
				commonConditions.push(sql`ifnull(length(text), 0) + ifnull(length(content), 0) <= ${parseInt(pSizeAtMost)}`);
			}
		}
		if (pBefore) {
			commonConditions.push(lt(email.createTime, pBefore));
		}
		if (pAfter) {
			commonConditions.push(gt(email.createTime, pAfter));
		}
		if (pLabel) {
			commonConditions.push(like(email.labels, '%"' + pLabel + '"%'));
		}

		if (!encryptedSearch && keyword) {
			commonConditions.push(
				or(
					like(email.subject, '%'+ keyword + '%'),
					like(email.name, '%'+ keyword + '%'),
					like(email.sendEmail, '%'+ keyword + '%'),
					like(email.toEmail, '%'+ keyword + '%'),
					like(email.text, '%'+ keyword + '%')
				)
			);
		}

		let listQuery = null;
		let totalQuery = null;
		if (!encryptedSearch) {
			query.where(
				and(
					...commonConditions,
					timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId)
				)
			);

			if (timeSort) {
				query.orderBy(asc(email.emailId));
			} else {
				query.orderBy(desc(email.emailId));
			}

			listQuery = query.limit(size).all();

			totalQuery = orm(c).select({ total: count() }).from(email)
				.leftJoin(
					account,
					eq(account.accountId, email.accountId)
				)
				.where(
					and(...commonConditions)
				).get();
		}

		const latestEmailQuery = orm(c).select().from(email).where(
			and(
				allReceive ? eq(1,1) : eq(email.accountId, accountId),
				eq(email.userId, userId),
				folder === 'trash' ? eq(email.isDel, 1) : eq(email.isDel, 0),
				folder === 'spam' ? eq(email.isSpam, 1) : (folder === 'trash' || folder === 'snoozed' || folder === 'all' ? eq(1,1) : eq(email.isSpam, 0)),
				folder === 'snoozed' ? sql`snoozed_time IS NOT NULL` : (folder === 'trash' || folder === 'spam' ? eq(1,1) : sql`(snoozed_time IS NULL OR send_email IN ('announcement@epocanvas.com', 'admin@epocanvas.com'))`),
				(!folder && type !== undefined) ? eq(email.type, type) : (folder === 'all' ? eq(email.type, 0) : eq(1,1))
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		if (settingData.welcomeExpireDays > 0) {
			// Auto-clean expired official welcome emails older than welcomeExpireDays
			await getMailDb(c).prepare(`
				UPDATE email 
				SET is_del = 1, trashed_at = COALESCE(trashed_at,CURRENT_TIMESTAMP), snoozed_time = NULL, snoozed_end_time = NULL
				WHERE user_id = ? 
				  AND send_email IN ('announcement@epocanvas.com', 'admin@epocanvas.com') 
				  AND is_del = 0 
				  AND datetime(create_time, '+' || ? || ' days') < datetime('now')
			`).bind(userId, settingData.welcomeExpireDays).run().catch(() => {});
		}

		let list;
		let totalRow;
		let latestEmail;
		if (encryptedSearch) {
			const scanned = await this.searchEncryptedEmails(c, {
				commonConditions, contentTerms, timeSort, emailId, size, userId
			});
			list = scanned.list;
			totalRow = { total: scanned.total };
			latestEmail = await latestEmailQuery;
		} else {
			[list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);
		}

		if (userId) {
			const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
			if (!encryptedSearch) list = await emailCryptoUtils.decryptEmailList(list, cryptoKey);
			if (latestEmail && latestEmail.emailId) {
				latestEmail = await emailCryptoUtils.decryptEmailRecord(latestEmail, cryptoKey);
			}
		}

		list = list.map(item => {
			const isOfficial = item.sendEmail === 'announcement@epocanvas.com' || item.sendEmail === 'admin@epocanvas.com' || (item.labels && item.labels.includes('官方'));
			return {
				...item,
				isStar: item.starId != null ? 1 : 0,
				isOfficial: isOfficial ? 1 : 0,
				content: (!item.content && isOfficial) ? (settingData.welcomeContent || DEFAULT_WELCOME_CONTENT) : item.content,
				expireDays: isOfficial ? (settingData.welcomeExpireDays ?? 7) : 0
			};
		});

		await this.emailAddAtt(c, list);

		await Promise.all(list.map(async (item) => {
			item.hash = await hashUtils.encodeEmailHash(item.emailId, userId, c.env.jwt_secret);
		}));

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: accountId,
				userId: userId,
			}
		}

		return { list, total: totalRow.total, latestEmail };
	},

	/**
	 * Bounded decrypted search for encrypted mail modes. SQL LIKE cannot see
	 * visible subject/text once AES-GCM is applied, so scan only the rows that
	 * already satisfy every plaintext filter, decrypt them in batches, and
	 * apply the same AND semantics to both the page and its total.
	 */
	async searchEncryptedEmails(c, { commonConditions, contentTerms, timeSort, emailId, size, userId }) {
		const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
		let cursor = timeSort ? 0 : Number.MAX_SAFE_INTEGER;
		let scanned = 0;
		let total = 0;
		const list = [];
		while (scanned < ENCRYPTED_SEARCH_MAX_ROWS) {
			const conditions = [
				...commonConditions,
				timeSort ? gt(email.emailId, cursor) : lt(email.emailId, cursor)
			];
			const rows = await orm(c)
				.select({ ...email, starId: star.starId })
				.from(email)
				.leftJoin(star, and(eq(star.emailId, email.emailId), eq(star.userId, userId)))
				.leftJoin(account, eq(account.accountId, email.accountId))
				.where(and(...conditions))
				.orderBy(timeSort ? asc(email.emailId) : desc(email.emailId))
				.limit(ENCRYPTED_SEARCH_BATCH)
				.all();
			if (!rows.length) break;
			const decrypted = await emailCryptoUtils.decryptEmailList(rows, cryptoKey);
			for (const row of decrypted) {
				scanned++;
				cursor = row.emailId;
				if (!matchesContentSearch(row, contentTerms)) continue;
				total++;
				const afterCursor = timeSort ? row.emailId > emailId : row.emailId < emailId;
				if (afterCursor && list.length < size) list.push(row);
			}
			if (rows.length < ENCRYPTED_SEARCH_BATCH) break;
		}
		if (scanned >= ENCRYPTED_SEARCH_MAX_ROWS) {
			throw new BizError('Search is too broad; narrow the filters', 400, 'search_too_broad');
		}
		return { list, total };
	},

	async delete(c, params, userId) {
		return mailLifecycleService.moveToTrash(c, params, userId);
	},

	async reportNotSpam(c, params, userId) {
		const emailRows = await mailLifecycleService.restoreMail(c, params, userId);

		if (emailRows.length === 0) return;

		// 2. Extract unique senders
		const senders = [];
		for (const row of emailRows) {
			if (row.sendEmail) {
				const match = row.sendEmail.match(/<([^>]+)>/);
				const cleanSender = match ? match[1].trim() : row.sendEmail.trim();
				if (!senders.includes(cleanSender)) {
					senders.push(cleanSender);
				}
			}
		}

		if (senders.length === 0) return;

		// 3. Add senders to user's Whitelist (信任名单)
		const userRow = await userOrm(c).select().from(user).where(eq(user.userId, userId)).get();
		let customLabels = userRow.customLabels;
		let labelsObj = [];
		try {
			labelsObj = JSON.parse(customLabels || '[]');
			if (!Array.isArray(labelsObj)) {
			   if (labelsObj && Array.isArray(labelsObj.customLabels)) {
				   labelsObj = labelsObj.customLabels;
			   } else {
				   labelsObj = [];
			   }
			}
		} catch (e) {
			labelsObj = [];
		}

		let whitelistLabel = labelsObj.find(l => l.name === '信任名单');
		if (!whitelistLabel) {
			whitelistLabel = {
				id: Date.now().toString(),
				name: '信任名单',
				actions: { priority: 1, stopProcessing: true },
				rules: [{
					id: Date.now().toString() + 'r',
					condition: { type: 'sender_is', value: '' },
					exception: { type: 'none', value: '' }
				}]
			};
			labelsObj.push(whitelistLabel);
		}

		// Update sender list
		const cond = whitelistLabel.rules[0].condition;
		const existingSenders = cond.value ? cond.value.split(',').map(s => s.trim()) : [];
		
		let updated = false;
		for (const s of senders) {
			if (!existingSenders.includes(s)) {
				existingSenders.push(s);
				updated = true;
			}
		}

		if (updated) {
			cond.value = existingSenders.join(',');
			
			// ensure priority
			whitelistLabel.actions = { priority: 1, stopProcessing: true };

			// Save back
			await userOrm(c).update(user).set({ customLabels: JSON.stringify(labelsObj) }).where(eq(user.userId, userId)).run();
			
			const authInfo = await c.env.kv.get(kvConst.AUTH_INFO + userId, { type: 'json' });
			if (authInfo && authInfo.user) {
				authInfo.user.customLabels = JSON.stringify(labelsObj);
				await c.env.kv.put(kvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: 60 * 60 * 24 * 7 });
			}
		}

		// In Mode 0 (Privacy Mail Mode): Restored emails are back in Inbox, so encrypt them
		const settingRow = await settingService.query(c);
		const mode = Number(settingRow?.allMailMode);
		if (mode === 0 && userId) {
			const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
			for (const row of emailRows) {
				const encrypted = await emailCryptoUtils.encryptEmailRecord(row, cryptoKey);
				await orm(c).update(email).set({
					subject: encrypted.subject,
					content: encrypted.content,
					text: encrypted.text,
					code: encrypted.code
				}).where(eq(email.emailId, row.emailId)).run();
			}
		}
	},

	async setSpam(c, params, userId) {
		return mailLifecycleService.setMailSpam(c, params, userId);
	},

	async reportSpam(c, params, userId) {
		const { emailIds } = params;
		const reportCategory = (typeof params.reportCategory === 'string' ? params.reportCategory : 'spam').trim().slice(0, 64) || 'spam';
		const reportReason = (typeof params.reportReason === 'string' ? params.reportReason : '').trim().slice(0, 2000);
		const emailIdList = Array.isArray(emailIds) ? emailIds.map(Number) : String(emailIds).split(',').map(Number);
		if (emailIdList.length === 0) return;

		await rateLimit.check(c, { scope: 'report-spam', limit: 30, windowSeconds: 3600, subject: `user:${userId}` });

		const emailRows = await mailLifecycleService.setMailSpam(c, { emailIds, isSpam: true }, userId);

		const senders = [];
		for (const row of emailRows) {
			const rawSender = row.sendEmail || '';
			const match = rawSender.match(/<([^>]+)>/);
			const cleanSender = (match ? match[1] : rawSender).trim().toLowerCase();
			if (cleanSender && !senders.includes(cleanSender)) {
				senders.push(cleanSender);
			}
		}

		if (senders.length === 0) return;

		// 3. Update user's personal customLabels
		const userRow = await userOrm(c).select().from(user).where(eq(user.userId, userId)).get();
		if (userRow) {
			let customLabels = userRow.customLabels;
			let labelsObj = [];
			try {
				const parsed = JSON.parse(customLabels || '[]');
				if (Array.isArray(parsed)) {
					labelsObj = parsed;
				} else if (parsed && typeof parsed === 'object') {
					if (Array.isArray(parsed.allLabels)) labelsObj = parsed.allLabels;
					else if (Array.isArray(parsed.customLabels)) labelsObj = parsed.customLabels;
				}
			} catch (e) {
				labelsObj = [];
			}

			// If present in 信任名单, remove from it
			const whitelistLabel = labelsObj.find(l => l.name === '信任名单');
			if (whitelistLabel && whitelistLabel.rules?.[0]?.condition) {
				const cond = whitelistLabel.rules[0].condition;
				const wSenders = cond.value ? cond.value.split(',').map(s => s.trim().toLowerCase()) : [];
				const filtered = wSenders.filter(s => !senders.includes(s));
				cond.value = filtered.join(',');
			}

			// Find or create user's personal blacklist / spam filter rule
			let blacklistLabel = labelsObj.find(l => l.name === '黑名单' || l.name === '个人拦截');
			if (!blacklistLabel) {
				blacklistLabel = {
					id: Date.now().toString(),
					name: '黑名单',
					color: '#ef4444',
					icon: 'fluent:shield-dismiss-20-regular',
					listVis: false,
					actions: { targetFolder: 'spam', priority: 1, stopProcessing: true },
					rules: [{
						id: Date.now().toString() + 'r',
						condition: { type: 'sender_is', value: '' },
						exception: { type: 'none', value: '' }
					}]
				};
				labelsObj.push(blacklistLabel);
			}

			if (!blacklistLabel.rules || blacklistLabel.rules.length === 0) {
				blacklistLabel.rules = [{
					id: Date.now().toString() + 'r',
					condition: { type: 'sender_is', value: '' },
					exception: { type: 'none', value: '' }
				}];
			}
			if (!blacklistLabel.actions) {
				blacklistLabel.actions = { targetFolder: 'spam', priority: 1, stopProcessing: true };
			} else {
				blacklistLabel.actions.targetFolder = 'spam';
				blacklistLabel.actions.priority = 1;
				blacklistLabel.actions.stopProcessing = true;
			}

			const bCond = blacklistLabel.rules[0].condition;
			const existingBlackSenders = bCond.value ? bCond.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];
			let updated = false;
			for (const s of senders) {
				if (!existingBlackSenders.includes(s)) {
					existingBlackSenders.push(s);
					updated = true;
				}
			}

			if (updated) {
				bCond.value = existingBlackSenders.join(',');
				const serialized = JSON.stringify(labelsObj);
				await userOrm(c).update(user).set({ customLabels: serialized }).where(eq(user.userId, userId)).run();
				const authInfo = await c.env.kv.get(kvConst.AUTH_INFO + userId, { type: 'json' });
				if (authInfo && authInfo.user) {
					authInfo.user.customLabels = serialized;
					await c.env.kv.put(kvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: 60 * 60 * 24 * 7 });
				}
			}
		}

		// 4. Report to Admin Audit Center as Anomalous Threat (异常威胁)
		try {
			const setting = await settingService.query(c).catch(() => ({}));
			if (setting?.auditLogEnabled !== 0) {
				await auditService.ensureTables(c);
				for (const cleanSender of senders) {
				// Check whether sender is an internal user
				const internalUser = await userOrm(c).select().from(user).where(eq(user.email, cleanSender)).get();
				const isInternal = !!internalUser ? 1 : 0;

				// Check if there is an active/pending report for this sender in audit_log
				const existingReport = await userOrm(c).select().from(auditLog).where(
					and(
						eq(auditLog.email, cleanSender),
						eq(auditLog.warningType, 'risk'),
						sql`${auditLog.status} IN ('active', 'pending')`
					)
				).get();

				const categoryLabel = reportCategory || 'spam';
				const appendNote = `[${new Date().toISOString().slice(0, 16)}] 用户检举: ${categoryLabel}${reportReason ? ` (${reportReason})` : ''}`;
				const dedupeKey = `report-spam:${userId}:${await mailSha256(cleanSender)}`;
				let duplicate = false;
				try { duplicate = (await c.env.kv.get(dedupeKey)) === '1'; } catch (_) {}

				if (existingReport) {
					// Aggregation within same active cycle: increment count and raise
					// priority. A single user reporting the same sender repeatedly
					// within the window must not keep inflating the risk score.
					if (!duplicate) {
						const newCount = (existingReport.reportedByOthers || 0) + 1;
						await userOrm(c).update(auditLog).set({
							reportedByOthers: newCount,
							priority: 'CRITICAL', // Higher weight
							riskLevel: 'high',
							detailText: (existingReport.detailText ? existingReport.detailText + '\n' : '') + appendNote
						}).where(eq(auditLog.id, existingReport.id)).run();
					}
				} else {
					// Historical count across closed/expired/banned records
					const histRow = await userOrm(c).select({ count: count() }).from(auditLog).where(
						and(
							eq(auditLog.email, cleanSender),
							eq(auditLog.eventType, 'user_reported')
						)
					).get();
					const historyReports = (histRow?.count || 0);
					const initialCount = historyReports + 1;

					await userOrm(c).insert(auditLog).values({
						ticketId: 'THR-' + Date.now().toString(36).toUpperCase(),
						email: cleanSender,
						warningType: 'risk',
						eventType: 'user_reported',
						category: 'security',
						actionText: isInternal
							? `{${cleanSender}} 站内用户被举报违规 (${categoryLabel})`
							: `{${cleanSender}} 外部邮件被站内用户检举 (${categoryLabel})`,
						detailText: `检举类别: ${categoryLabel}。描述: ${reportReason || '用户举报该邮件'}。主体类型: ${isInternal ? '站内注册用户 (内部邮件)' : '外部发信地址 (外部邮件)'}。` + (historyReports > 0 ? ` [历史累计举报 ${initialCount} 次]` : ''),
						ip: internalUser?.createIp || '',
						geo: '',
						device: internalUser?.device || 'Mail-Client',
						deviceType: 'desktop',
						fingerprint: '',
						isInternal,
						reportCategory: categoryLabel,
						reportReason: reportReason || '',
						reportedByOthers: initialCount,
						priority: initialCount >= 3 ? 'CRITICAL' : 'HIGH',
						riskLevel: 'high',
						status: 'active',
						recommendedAction: isInternal ? 'mute_account' : 'blacklist_sender'
					}).run();
				}
				if (!duplicate) {
					try {
						await c.env.kv.put(dedupeKey, '1', { expirationTtl: 86400 });
					} catch (_) {}
				}
			}
		}
		} catch (auditErr) {
			console.warn('reportSpam audit_log report failed:', auditErr.message);
		}
	},

	async updateLabels(c, params, userId) {
		const { emailId, labels } = params;
		const labelsStr = Array.isArray(labels) ? JSON.stringify(labels) : String(labels || '[]');
		await orm(c).update(email).set({ labels: labelsStr }).where(
			and(eq(email.userId, userId), eq(email.emailId, Number(emailId)))
		).run();
	},

	async setSnooze(c, params, userId) {
		const { emailIds, time, endTime } = params;
		const emailIdList = Array.isArray(emailIds) ? emailIds.map(Number) : String(emailIds).split(',').map(Number);
		await orm(c).update(email).set({ snoozedTime: time, snoozedEndTime: endTime }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)))
			.run();
	},

	async restore(c, params, userId) {
		return mailLifecycleService.restoreMail(c, params, userId);
	},

	async clearTrashAndSpam(c) {
		return mailLifecycleService.clearTrashAndSpam(c);
	},

	async receive(c, params, cidAttList, r2domain, recovery = null) {
		params.content = this.imgReplace(params.content, cidAttList, r2domain);
		const settingRow = await settingService.query(c);
		let dbParams = { ...params };
		if (params.userId && emailCryptoUtils.shouldEncryptEmail(settingRow?.allMailMode, params)) {
			const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, params.userId);
			dbParams = await emailCryptoUtils.encryptEmailRecord(dbParams, cryptoKey);
		}
		assertMailRowSize(dbParams);
		if (!params.receiveClaimKey) return orm(c).insert(email).values(dbParams).returning().get();
		if (!recovery?.leaseToken) throw new BizError('Inbound delivery requires a claim lease', 409, 'inbound_claim_lost');
		const existing = await orm(c).select().from(email).where(eq(email.receiveClaimKey, params.receiveClaimKey)).get();
		const stored = existing || dbParams;
		if (params.userId) {
			const quota = recovery.quota;
			if (!quota || quota.dbFull) throw new BizError('Recipient storage is unavailable', 503, 'quota_unavailable');
			const bodyBytes = ['subject', 'text', 'content', 'code'].reduce((sum, field) =>
				sum + new TextEncoder().encode(String(stored[field] || '')).byteLength, 0);
			await reserveInboundQuota(c, { claimKey: params.receiveClaimKey, leaseToken: recovery.leaseToken,
				userId: params.userId, incomingBytes: bodyBytes + recovery.attachmentBytes,
				maxStorageBytes: quota.maxStorageBytes, maxEmails: quota.maxEmails,
				bypass: quota.bypassStorage === true || quota.byoStorageEnabled === 1,
				quotaStorageBlocked: quota.quotaStorageBlocked === true });
		}
		if (existing) return existing;
		const db = getMailDb(c);
		const guard = mailTransactionGuard(c, `EXISTS(SELECT 1 FROM mail_receive_claim
			WHERE claim_key=? AND lease_token=? AND state='SAVING' AND lease_until>unixepoch())`, [params.receiveClaimKey, recovery.leaseToken]);
		const result = await db.batch([guard.before, prepareMailQuery(c, orm(c).insert(email).values(dbParams).returning()),
			db.prepare(`UPDATE mail_receive_claim SET reserved_bytes=?,reserved_count=0
				WHERE claim_key=? AND lease_token=? AND state='SAVING'`).bind(recovery.attachmentBytes, params.receiveClaimKey, recovery.leaseToken), guard.after]);
		const id = result[1].results?.[0]?.email_id;
		return orm(c).select().from(email).where(eq(email.emailId, id)).get();
	},

	async completeInboundReceive(c, { claimKey, leaseToken, emailId, status, isDel: delStatus, isSpam: spamStatus, attachmentRows = [] }) {
		const mailDb = getMailDb(c);
		const assertion = mailTransactionGuard(c, `EXISTS (
			SELECT 1 FROM mail_receive_claim c JOIN email e ON e.email_id=?
			WHERE c.claim_key=? AND c.lease_token=? AND c.state='SAVING' AND c.lease_until>unixepoch()
			AND e.receive_claim_key=c.claim_key AND e.status=?)`, [emailId, claimKey, leaseToken, emailConst.status.SAVING]);
		const statements = [assertion.before,
			mailDb.prepare('DELETE FROM attachments WHERE email_id=?').bind(emailId)];

		const rows = attachmentRows.map(row => ({
			userId: row.userId,
			emailId,
			accountId: row.accountId,
			key: row.key,
			filename: row.filename,
			mimeType: row.mimeType,
			size: row.size,
			type: row.type,
			disposition: row.disposition,
			related: row.related,
			contentId: row.contentId,
			encoding: row.encoding
		}));
		let chunk = [];
		for (const row of rows) {
			const candidate = [...chunk, row];
			const query = orm(c).insert(att).values(candidate);
			if (query.toSQL().params.length > 100) {
				if (!chunk.length) throw new Error('One attachment row exceeds the D1 bind limit');
				const compiled = orm(c).insert(att).values(chunk).toSQL();
				statements.push(mailDb.prepare(compiled.sql).bind(...compiled.params));
				chunk = [row];
				if (orm(c).insert(att).values(chunk).toSQL().params.length > 100) throw new Error('One attachment row exceeds the D1 bind limit');
			} else {
				chunk = candidate;
			}
		}
		if (chunk.length) {
			const compiled = orm(c).insert(att).values(chunk).toSQL();
			statements.push(mailDb.prepare(compiled.sql).bind(...compiled.params));
		}
		statements.push(mailDb.prepare(`
			UPDATE email SET status = ?, is_del = ?, is_spam = ?,
				trashed_at = CASE WHEN ? = 1 THEN COALESCE(trashed_at, CURRENT_TIMESTAMP) ELSE NULL END,
				spam_at = CASE WHEN ? = 1 THEN COALESCE(spam_at, CURRENT_TIMESTAMP) ELSE NULL END
			WHERE email_id = ? AND receive_claim_key = ? AND status = ?
				AND EXISTS (SELECT 1 FROM mail_receive_claim WHERE claim_key = ? AND lease_token = ? AND state = 'SAVING')
		`).bind(status, delStatus, spamStatus, delStatus, spamStatus, emailId, claimKey, emailConst.status.SAVING, claimKey, leaseToken));
		statements.push(mailDb.prepare(`
			UPDATE mail_receive_claim SET state = 'COMPLETE', email_id = ?, reserved_bytes = 0, reserved_count = 0,
				lease_until = 0, last_error = NULL, updated_at = CURRENT_TIMESTAMP
			WHERE claim_key = ? AND lease_token = ? AND state = 'SAVING'
				AND EXISTS (SELECT 1 FROM email WHERE email_id = ? AND receive_claim_key = ? AND status = ?)
		`).bind(emailId, claimKey, leaseToken, emailId, claimKey, status));

		for (const row of rows) statements.push(mailDb.prepare('DELETE FROM object_deletion_queue WHERE object_key=? AND user_id=?').bind(row.key, row.userId));
		statements.push(assertion.after);
		await mailDb.batch(statements);
		return await orm(c).select().from(email).where(eq(email.emailId, emailId)).get();
	},


	/**
	 * Inbound delivery can be retried by the sending MTA (and the same message
	 * can be delivered twice). A recent row with the same Message-ID for the
	 * same account is treated as a duplicate. Empty/missing Message-IDs never
	 * participate, and the window is deliberately short so a re-used ID cannot
	 * suppress later legitimate mail indefinitely.
	 */
	async findRecentDuplicate(c, messageId, accountId = 0, windowMinutes = 10) {
		const id = typeof messageId === 'string' ? messageId.trim() : '';
		if (!id) return null;

		const minutes = Math.max(1, Math.min(Number(windowMinutes) || 10, 60));
		try {
			return await getMailDb(c).prepare(`
				SELECT email_id AS emailId, user_id AS userId, account_id AS accountId, status
				FROM email
				WHERE message_id = ? AND account_id = ?
				  AND create_time >= datetime('now', ?)
				ORDER BY email_id DESC
				LIMIT 1
			`).bind(id, Number(accountId) || 0, `-${minutes} minutes`).first();
		} catch (_) {
			// A missing/legacy column must not block inbound delivery.
			return null;
		}
	},

	//邮件发送
	async send(c, params, userId) {

		let {
			accountId, //发送账号id
			name, //发件人名字
			sendType, //发件类型
			emailId, //邮件id，如果是回复邮件会带
			receiveEmail, //收件人邮箱
			text, //邮件纯文本
			content, //邮件内容
			subject, //邮件标题
			attachments = [],
			forwarding = false,
			idempotencyKey
		} = params;

		idempotencyKey ||= crypto.randomUUID();
		receiveEmail = [...new Set((Array.isArray(receiveEmail) ? receiveEmail : []).map(normalizeMailAddress))];

		if (!Array.isArray(receiveEmail) || receiveEmail.length === 0 || receiveEmail.length > 100) {
			throw new BizError('收件人列表无效 / Invalid recipient list');
		}
		for (const address of receiveEmail) {
			if (typeof address !== 'string' || !verifyUtils.isEmail(address)) {
				throw new BizError('收件人邮箱格式无效 / Invalid recipient address');
			}
		}
		if (subject !== undefined && (typeof subject !== 'string' || subject.length > 998)) {
			throw new BizError('邮件主题过长 / Email subject too long');
		}
		content = typeof content === 'string' ? content : '';
		text = typeof text === 'string' ? text : '';
		if (content.length > 5 * 1024 * 1024) {
			throw new BizError('邮件正文过大 / Email body too large');
		}
		if (!Array.isArray(attachments) || attachments.length > 50) {
			throw new BizError('附件数量无效 / Invalid attachment count');
		}

		const settingRow = await settingService.query(c);
		const { resendTokens, r2Domain, send, domainList } = settingRow;

		let { imageDataList, html } = await attService.toImageUrlHtml(c, content, userId);

		//判断是否关闭发件功能
		if (send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		const userRow = await userService.selectById(c, userId);
		if (!userRow) {
			throw new BizError(t('notExistUser') || '用户不存在', 404);
		}

		// 权威状态拦截：被限制/封禁用户严禁外发或站内发信 (权威 D1 来源防御)
		if (Number(userRow.status) === 1) {
			throw new BizError(t('isBanUser') || '账号已被系统安全管控限制，已暂停发信能力', 403);
		}

		const roleRow = await roleService.selectById(c, userRow.type);

		// 计算邮件总大小限制
		const isSuperAdmin = isAdminUser(c, userRow);
		const maxLimitMB = isSuperAdmin ? 100 : 25;
		const maxLimitBytes = maxLimitMB * 1024 * 1024;
		
		let totalSize = 0;
		if (text) totalSize += new Blob([text]).size;
		if (html) totalSize += new Blob([html]).size;
		
		imageDataList.forEach(img => {
			if (img.content) totalSize += (img.content.length * 3) / 4;
		});
		
		attachments.forEach(att => {
			if (att.content) totalSize += (att.content.length * 3) / 4;
		});

		if (totalSize > maxLimitBytes) {
			throw new BizError(t('emailSizeLimit', { msg: maxLimitMB + 'MB' }));
		}

		const allDomainNames = (domainList || []).map(value => String(value).replace(/^@/, '').toLowerCase());
		const allInternal = receiveEmail.every(address => allDomainNames.includes(emailUtils.getDomain(address).toLowerCase()));
		assertOutboundAllowed(c, receiveEmail, { domains: allInternal ? allDomainNames : [] });


		if (!isSuperAdmin) {

			// 检查附件发送权限 (如普通用户 / 普通用户 LV.0 仅支持纯文本，不允许发送附件)
			const hasAttachments = (attachments && attachments.length > 0) || (imageDataList && imageDataList.length > 0);
			if (hasAttachments && Number(roleRow.allowAttachment) === 0) {
				throw new BizError(t('visitorAttachmentBan'), 403);
			}

			// 发件被禁用 (如参观者)
			if (roleRow.sendType === 'ban') {
				throw new BizError(roleRow.roleCode === 'visitor' ? t('visitorSendBan') : t('bannedSend'), 403);
			}

			// 发件被禁用
			if (roleRow.sendType === 'internal' && !allInternal) {
				throw new BizError(t('onlyInternalSend'), 403);
			}

		}

		// Send-count limits are enforced atomically by reserveSendCount after
		// task replay, so ACCEPTED/UNKNOWN requests never consume quota again.
		const accountRow = await accountService.selectById(c, accountId);

		if (!accountRow) {
			throw new BizError(t('senderAccountNotExist'));
		}

		if (accountRow.userId !== userId) {
			throw new BizError(t('sendEmailNotCurUser'));
		}

		// 发信账号限制检查
		if (Number(accountRow.status) === 1) {
			throw new BizError('该发信邮箱已被系统安全策略限制使用', 403);
		}

		// 检查是否存在针对该邮箱或主账号的有效封禁管控案卷
		let activeBan = null;
		try {
			activeBan = await getUserDb(c).prepare(`SELECT 1 AS banned FROM audit_log
				WHERE email=? AND warning_type='ban' AND status='banned' LIMIT 1`).bind(accountRow.email).first();
		} catch (e) {
			throw new BizError('Send safety checks are unavailable', 503, 'send_policy_unavailable');
		}
		if (activeBan) {
			throw new BizError('该发信地址当前处于安全封禁状态，无法外发邮件', 403);
		}

		if (!isSuperAdmin) {
			//用户没有这个域名的使用权限
			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, accountRow.email)) {
				throw new BizError(t('noDomainPermSend'),403)
			}

		}

		const domain = emailUtils.getDomain(accountRow.email);
		const resendToken = resendTokens[domain];
		const useCloudflareEmail = !!c.env.email;

		// 分级外发闸门：对站外收件人强制校验 EMAIL_OUTBOUND_ENABLED 与 staging OUTBOUND_WHITELIST
		if (!allInternal) {
			const outboundDisabled = String(c.env?.EMAIL_OUTBOUND_ENABLED || '').trim().toLowerCase() === 'false';
			if (outboundDisabled) {
				throw new BizError('External email outbound is disabled in this environment (EMAIL_OUTBOUND_ENABLED=false)', 403, 'outbound_disabled');
			}

			const externalRecipients = receiveEmail.filter(addr => !domainList.includes('@' + emailUtils.getDomain(addr)));
			const customWhitelist = String(c.env?.OUTBOUND_WHITELIST || '')
				.split(',')
				.map(s => s.trim().toLowerCase())
				.filter(Boolean);
			const isStaging = c.env?.ENVIRONMENT === 'staging';

			if (isStaging || String(c.env?.OUTBOUND_WHITELIST_ENFORCE || '').toLowerCase() === 'true') {
				const officialResendSandbox = ['delivered@resend.dev', 'bounced@resend.dev', 'complained@resend.dev'];
				const allowedSet = new Set([...officialResendSandbox, ...customWhitelist]);
				const blockedRecipient = externalRecipients.find(addr => !allowedSet.has(String(addr || '').trim().toLowerCase()));
				if (blockedRecipient) {
					throw new BizError(`External recipient (${blockedRecipient}) is not in OUTBOUND_WHITELIST`, 403, 'outbound_recipient_blocked');
				}
			}
		}

		//如果接收方存在站外邮箱，又没有发信服务
		if (!useCloudflareEmail && !resendToken && !allInternal) {
			throw new BizError(t('noSendProvider'));
		}

		// Validate and decode before any provider call or send-count reservation.
		if (imageDataList.length > 10) throw new BizError(t('imageAttLimit'));
		// Inline parts already discovered in the HTML are re-attached as CID
		// images by toImageUrlHtml. Do not also send the original embed rows a
		// second time when forwarding a stored message.
		const embeddedKeys = new Set(imageDataList.map(item => item.key).filter(Boolean));
		const regularAttachments = attachments.filter(item => !item.key || !embeddedKeys.has(item.key));
		// Forwarding preserves the original MIME attachment set; user-authored
		// mail keeps the tighter compose limit at ten.
		if (regularAttachments.length > (forwarding ? 50 : 10)) throw new BizError(t('attLimit'));
		if (!name) name = emailUtils.getName(accountRow.email);

		let emailRow = { messageId: null };
		if (sendType === 'reply') {
			emailRow = await this.selectById(c, emailId, userId);
			if (!emailRow) throw new BizError(t('notExistEmailReply'));
		}

		const providerHtml = html;
		const attachmentItems = [...imageDataList, ...regularAttachments];
		const attachmentMeta = [];
		let attachmentBytes = 0;
		for (const [index, item] of attachmentItems.entries()) {
			const bytes = item.buff instanceof Uint8Array ? item.buff
				: item.buff ? new Uint8Array(item.buff) : new Uint8Array(await this.toAttachmentArrayBuffer(item) || 0);
			item.buff = bytes;
			const sizeCheck = await storageQuotaService.checkAttachmentSizeLimit(c, userId, bytes.byteLength);
			if (!sizeCheck.allowed) throw new BizError(sizeCheck.reason);
			attachmentBytes += bytes.byteLength;
			// Inline image filenames and CIDs are generated anew on every request.
			// The original HTML and image bytes identify the actual compose content.
			attachmentMeta.push({ filename: index < imageDataList.length ? '' : item.filename || '',
				mimeType: item.mimeType || item.contentType || (typeof item.type === 'string' ? item.type : ''),
				size: bytes.byteLength, hash: await mailSha256(bytes) });
		}
		if (new Blob([text, providerHtml]).size + attachmentBytes > maxLimitBytes) {
			throw new BizError(t('emailSizeLimit', { msg: maxLimitMB + 'MB' }));
		}
		const contentHash = await mailSha256(JSON.stringify({ accountId, receiveEmail, name, sendType,
			emailId, subject: subject || '', text, content, attachments: attachmentMeta }));
		for (const [index, item] of attachmentItems.entries()) {
			item.key = `attachments/out-${await mailSha256(`${userId}\n${accountId}\n${idempotencyKey}\n${index}\n${attachmentMeta[index].hash}`)}${fileUtils.getExtFileName(item.filename)}`;
		}
		const imageRows = imageDataList.map(item => ({ ...item,
			contentId: item.contentId ? `<${item.contentId.replace(/^<|>$/g, '')}>` : null }));
		const storedHtml = this.imgReplace(providerHtml, imageRows, r2Domain);
		const plainRecord = { sendEmail: accountRow.email, name, subject, content: storedHtml, text,
			accountId, userId, status: emailConst.status.SAVING, type: emailConst.type.SEND,
			recipient: JSON.stringify(receiveEmail.map(address => ({ address, name: '' }))),
			inReplyTo: sendType === 'reply' ? emailRow.messageId : '', relation: sendType === 'reply' ? emailRow.messageId : '' };
		let encryptedRecord = { ...plainRecord };
		if (emailCryptoUtils.shouldEncryptEmail(settingRow.allMailMode, plainRecord)) {
			encryptedRecord = await emailCryptoUtils.encryptEmailRecord(encryptedRecord, await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId));
		}
		assertMailRowSize(encryptedRecord);
		const bodyStorageBytes = ['subject', 'text', 'content', 'code'].reduce((total, field) =>
			total + new TextEncoder().encode(String(encryptedRecord[field] || '')).byteLength, 0);
		const reserveBytes = bodyStorageBytes + attachmentBytes;
		const mailDb = getMailDb(c);
		// A replay already owns its archive/reservation. Do not charge its bytes
		// again or reject ACCEPTED/UNKNOWN just because that send filled storage.
		const previousTask = typeof idempotencyKey === 'string' && idempotencyKey
			? await mailDb.prepare('SELECT task_id FROM mail_outbound_task WHERE user_id=? AND account_id=? AND idempotency_key=?')
				.bind(userId, accountId, idempotencyKey).first() : null;
		const storageCheck = previousTask ? null : await storageQuotaService.checkQuotaAvailable(c, userId, reserveBytes);
		if (storageCheck && !storageCheck.allowed) throw new BizError(storageCheck.reason);
		const quota = previousTask ? null : await userService.getUserQuota(c, userId);
		const providerName = allInternal
			? 'local'
			: (useCloudflareEmail ? 'cloudflare' : (String(resendToken || '').startsWith('mailjet:') ? 'mailjet' : 'resend'));
		const prepared = await mailOutboundService.prepareOutboundTask(c, { userId, accountId, idempotencyKey,
			contentHash, reservedBytes: reserveBytes, maxStorageBytes: quota?.maxStorageBytes, maxEmails: quota?.maxEmails,
			bypassStorage: quota?.bypassStorage || storageCheck?.usage?.byoStorageEnabled === 1,
			storageBlocked: quota?.quotaStorageBlocked || quota?.dbFull,
			payload: { recipients: receiveEmail, attachmentCount: attachmentItems.length,
				route: allInternal ? 'local' : 'external', providerName } });
		const readArchived = async task => {
			let row = await orm(c).select().from(email).where(and(eq(email.outboundTaskId, task.task_id), eq(email.userId, userId))).get();
			if (!row) throw new BizError('The accepted send record requires reconciliation', 503, 'outbound_archive_missing');
			if (emailCryptoUtils.ENCRYPTED_FIELDS.some(field => String(row[field] || '').startsWith(emailCryptoUtils.CIPHER_PREFIX))) {
				row = await emailCryptoUtils.decryptEmailRecord(row, await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId));
			}
			const attList = await attService.selectByEmailIds(c, [row.emailId]);
			return [{ ...row, attList }];
		};
		if (prepared.task.state === 'ACCEPTED') return readArchived(prepared.task);
		if (prepared.task.provider !== (allInternal ? 'local' : 'external')) {
			throw new BizError('This request was prepared under a different delivery route', 409, 'outbound_route_changed');
		}
		if (prepared.task.state === 'FAILED') {
			await mailOutboundService.compensateSendCount(c, { taskId: prepared.task.task_id });
		}
		const owned = await mailOutboundService.claimPreparation(c, prepared.task.task_id);
		if (!owned.leaseToken) return readArchived(owned.task);
		const task = owned.task;
		const leaseToken = owned.leaseToken;
		let archived;
		let staged = { rows: [], uploaded: [] };
		const guard = () => mailTransactionGuard(c,
			"EXISTS(SELECT 1 FROM mail_outbound_task WHERE task_id=? AND state='PREPARED' AND lease_token=? AND lease_until>unixepoch())",
			[task.task_id, leaseToken]);
		try {
			archived = await orm(c).select().from(email).where(and(eq(email.outboundTaskId, task.task_id), eq(email.userId, userId))).get();
			if (!archived) {
				const assertion = guard();
				await mailDb.batch([assertion.before,
					prepareMailQuery(c, orm(c).insert(email).values({ ...encryptedRecord, outboundTaskId: task.task_id })),
					mailDb.prepare("UPDATE mail_outbound_task SET reserved_bytes=?,reserved_count=0 WHERE task_id=? AND state='PREPARED' AND lease_token=?")
						.bind(attachmentBytes, task.task_id, leaseToken), assertion.after]);
				archived = await orm(c).select().from(email).where(eq(email.outboundTaskId, task.task_id)).get();
			}
			if (!task.email_id) {
				const sourceAttachments = attachmentItems.map((item, index) => ({ userId, accountId, emailId: archived.emailId,
					content: item.buff, size: item.buff.byteLength, filename: item.filename,
					mimeType: item.mimeType || item.type || 'application/octet-stream',
					key: item.key || '', type: index < imageDataList.length ? attConst.type.EMBED : attConst.type.ATT,
					contentId: index < imageDataList.length ? imageRows[index].contentId : null }));
				for (const item of sourceAttachments) {
					if (!item.key) item.key = 'attachments/' + await fileUtils.getBuffHash(item.content) + fileUtils.getExtFileName(item.filename);
				}
				for (const item of sourceAttachments) {
					await mailDb.prepare(`INSERT OR IGNORE INTO object_deletion_queue(object_key,user_id,next_retry_at)
						VALUES (?,?,datetime('now','+1 hour'))`).bind(item.key, userId).run();
				}
				staged = await attService.stageInboundAtt(c, sourceAttachments);
				const assertion = guard();
				const statements = [assertion.before,
					mailDb.prepare('DELETE FROM attachments WHERE email_id=? AND user_id=?').bind(archived.emailId, userId),
					...buildBoundedInserts(rows => orm(c).insert(att).values(rows), staged.rows.map(row => ({ ...row, emailId: archived.emailId })))
						.map(query => prepareMailQuery(c, query)),
						mailDb.prepare("UPDATE mail_outbound_task SET email_id=?,reserved_bytes=0,reserved_count=0,updated_at=CURRENT_TIMESTAMP WHERE task_id=? AND state='PREPARED' AND lease_token=?")
							.bind(archived.emailId, task.task_id, leaseToken),
						...sourceAttachments.map(item => mailDb.prepare('DELETE FROM object_deletion_queue WHERE object_key=? AND user_id=?').bind(item.key, userId)),
						assertion.after];
				await mailDb.batch(statements);
			}
		} catch (cause) {
			await attService.cleanupUnreferencedObjects(c, staged.uploaded).catch(() => {});
			await mailOutboundService.releasePreparation(c, task.task_id, leaseToken).catch(() => {});
			throw cause;
		}
		try {
			// This gate runs before quota/dispatch. A policy rejection is known
			// not to have reached a provider and must leave a retryable PREPARED.
			if (!allInternal) assertOutboundAllowed(c, receiveEmail);
			await mailOutboundService.reserveSendCount(c, { taskId: task.task_id, userId, quantity: receiveEmail.length,
				maxCount: isSuperAdmin || roleRow.sendType === 'internal' ? 0 : Number(roleRow.sendCount || 0),
				daily: roleRow.sendType === 'day' });
		} catch (cause) {
			await mailOutboundService.releasePreparation(c, task.task_id, leaseToken).catch(() => {});
			throw cause;
		}
		const currentSender = await getUserDb(c).prepare('SELECT status,is_del FROM user WHERE user_id=?').bind(userId).first();
		if (!currentSender || Number(currentSender.status) !== 0 || Number(currentSender.is_del) !== 0) {
			await mailOutboundService.releasePreparation(c, task.task_id, leaseToken);
			throw new BizError('Sender is unavailable', 403, 'account_unavailable');
		}
		let dispatch;
		try {
			dispatch = await mailOutboundService.claimOutboundTask(c, task.task_id, leaseToken);
		} catch (cause) {
			// Compensate only while this lease still owns PREPARED. An ambiguous
			// SENDING commit or a replacement lease must retain its reservation.
			const failed = await mailDb.prepare("UPDATE mail_outbound_task SET state='FAILED',reserved_bytes=0,reserved_count=0,lease_until=0,last_error='Dispatch was not started' WHERE task_id=? AND state='PREPARED' AND lease_token=? RETURNING task_id,email_id")
				.bind(task.task_id, leaseToken).first();
			if (failed) {
				// The archive row was created as SAVING. Leaving it there makes it
				// permanently invisible to retention and impossible for the user to
				// delete, because MUTABLE excludes SAVING.
				const emailId = failed.email_id || archived.emailId;
				if (emailId) {
					await mailDb.prepare('UPDATE email SET status=? WHERE email_id=? AND user_id=? AND status=?')
						.bind(emailConst.status.FAILED, emailId, userId, emailConst.status.SAVING).run();
				}
				await mailOutboundService.compensateSendCount(c, { taskId: task.task_id });
			}
			throw cause;
		}
		let providerId = null;
		try {
			if (allInternal) {
				const allAttachments = await orm(c).select().from(att).where(eq(att.emailId, archived.emailId)).all();
				await this.HandleOnSiteEmail(c, receiveEmail, { ...plainRecord, emailId: archived.emailId }, allAttachments,
					{ taskId: task.task_id, leaseToken });
			} else {
				const providerParams = { name, accountEmail: accountRow.email, receiveEmail, subject, text, html: providerHtml,
					attachments: attachmentItems, sendType, messageId: emailRow.messageId,
					idempotencyKey: `mail-${task.task_id}` };
				const result = useCloudflareEmail ? await this.sendByCloudflareEmail(c, providerParams) : await this.sendByResend(resendToken, providerParams);
				if (result.error) {
					// Preserve an acceptance identifier even when the response also
					// reports an error/transport ambiguity. The catch path writes it
					// to the UNKNOWN task so reconciliation can query the provider
					// instead of leaving an unresolvable task behind.
					if (result.data?.id) providerId = result.data.id;
					const statusCode = Number(result.error.statusCode || result.error.status);
					// Transport, timeout, conflict and 5xx results do not establish
					// rejection. Keep UNKNOWN rather than inviting another send.
					const rejected = statusCode >= 400 && statusCode < 500 && ![408, 409, 425].includes(statusCode);
					if (!rejected || result.data?.id) throw new Error('Provider acceptance is unknown');
					const assertion = mailTransactionGuard(c,
						"EXISTS(SELECT 1 FROM mail_outbound_task WHERE task_id=? AND state='SENDING' AND lease_token=?)", [task.task_id, leaseToken]);
					await mailDb.batch([assertion.before,
						mailDb.prepare('UPDATE email SET status=? WHERE email_id=? AND user_id=? AND status=?')
							.bind(emailConst.status.FAILED, archived.emailId, userId, emailConst.status.SAVING),
						mailDb.prepare("UPDATE mail_outbound_task SET state='FAILED',reserved_bytes=0,reserved_count=0,lease_until=0,last_error='Provider rejected request' WHERE task_id=? AND state='SENDING' AND lease_token=?")
							.bind(task.task_id, leaseToken), assertion.after]);
					await mailOutboundService.compensateSendCount(c, { taskId: task.task_id });
					throw new BizError('The provider rejected this send request', 502, 'provider_rejected');
				}
				providerId = result.data?.id || null;
				if (!providerId) throw new Error('Provider did not return an acceptance identifier');
			}
		} catch (cause) {
			if (allInternal) {
				await mailDb.prepare(`UPDATE mail_outbound_task SET state='PREPARED',lease_token=NULL,lease_until=0,
					last_error='Local delivery will resume from receipts',updated_at=CURRENT_TIMESTAMP
					WHERE task_id=? AND provider='local' AND state='SENDING' AND lease_token=?`).bind(task.task_id, leaseToken).run();
				throw new BizError('Local delivery is pending; retry the same request to resume safely', 503, 'local_delivery_pending');
			}
			await mailOutboundService.markOutboundUnknown(c, { taskId: task.task_id, leaseToken, providerId }).catch(() => {});
			if (cause.errorCode === 'provider_rejected') throw cause;
			throw new BizError('Send result requires reconciliation; retrying this request will not dispatch again', 503, 'provider_unknown');
		}
		if (!allInternal) {
			try {
				const assertion = mailTransactionGuard(c,
					"EXISTS(SELECT 1 FROM mail_outbound_task WHERE task_id=? AND state='SENDING' AND lease_token=?)", [task.task_id, leaseToken]);
				await mailDb.batch([assertion.before,
					mailDb.prepare('UPDATE email SET status=CASE WHEN status=? THEN ? ELSE status END,resend_email_id=? WHERE email_id=? AND user_id=?')
						.bind(emailConst.status.SAVING, emailConst.status.SENT, providerId, archived.emailId, userId),
					mailDb.prepare("UPDATE mail_outbound_task SET state='ACCEPTED',provider_id=?,reserved_bytes=0,reserved_count=0,lease_until=0,updated_at=CURRENT_TIMESTAMP WHERE task_id=? AND state='SENDING' AND lease_token=?")
						.bind(providerId, task.task_id, leaseToken), assertion.after]);
			} catch (_) {
				// Dispatch may already be accepted. A local commit failure must
				// never invite a second message or return its send-count reservation.
				await mailOutboundService.markOutboundUnknown(c, { taskId: task.task_id, leaseToken, providerId }).catch(() => {});
				throw new BizError('Send was submitted but its archive needs reconciliation', 503, 'provider_unknown');
			}
		}
		if (providerId && !useCloudflareEmail) {
			await this.replayProviderEventsFromLedger(c, providerId).catch(() => {});
		}
		try {
			const dayKey = kvConst.SEND_DAY_COUNT + dayjs().format('YYYY-MM-DD');
			const previous = Number(await c.env.kv.get(dayKey) || 0);
			await c.env.kv.put(dayKey, String(previous + receiveEmail.length), { expirationTtl: 86400 });
		} catch (_) { console.warn('Send statistics update failed'); }
		return readArchived({ task_id: dispatch.task.task_id });
	},

	async sendByCloudflareEmail(c, params) {
		const sendForm = {
			from: { email: params.accountEmail, name: params.name },
			to: [...params.receiveEmail],
			subject: params.subject
		};

		if (params.text) {
			sendForm.text = params.text;
		}

		if (params.html) {
			sendForm.html = params.html;
		}

		const attachments = await this.toCloudflareAttachments(params.attachments);
		if (attachments.length > 0) {
			sendForm.attachments = attachments;
		}

		if (params.sendType === 'reply' && params.messageId) {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		const result = await c.env.email.send(sendForm);

		return {
			data: {
				id: result.messageId
			}
		};
	},

	async sendByResend(resendToken, params) {
		if (resendToken && resendToken.startsWith('mailjet:')) {
			return await this.sendByMailjet(resendToken, params);
		}

		const resend = new Resend(resendToken);

		const sendForm = {
			from: `${params.name} <${params.accountEmail}>`,
			to: [...params.receiveEmail],
			subject: params.subject,
			text: params.text,
			html: params.html,
			attachments: await this.toResendAttachments(params.attachments)
		};

		if (params.sendType === 'reply') {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		return await resend.emails.send(sendForm, params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined);
	},

	async sendByMailjet(mailjetToken, params) {
		const parts = String(mailjetToken || '').split(':');
		const apiKey = parts[1];
		const apiSecret = parts[2];

		if (parts.length !== 3 || !apiKey || !apiSecret) {
			throw new BizError('Mailjet 凭据配置无效 / Invalid Mailjet credential configuration');
		}

		const messages = [
			{
				From: {
					Email: params.accountEmail,
					Name: params.name
				},
				To: params.receiveEmail.map(email => ({ Email: email })),
				Subject: params.subject,
				TextPart: params.text,
				HTMLPart: params.html
			}
		];

		const attachments = await this.toResendAttachments(params.attachments);
		if (attachments && attachments.length > 0) {
			messages[0].Attachments = attachments.filter(item => !item.contentId).map(item => ({
				ContentType: item.contentType, Filename: item.filename, Base64Content: item.content
			}));
			messages[0].InlinedAttachments = attachments.filter(item => item.contentId).map(item => ({
				ContentType: item.contentType, Filename: item.filename, Base64Content: item.content,
				ContentID: item.contentId.replace(/^<|>$/g, '')
			}));
		}

		if (params.sendType === 'reply' && params.messageId) {
			messages[0].Headers = {
				'In-Reply-To': params.messageId,
				'References': params.messageId
			};
		}

		let response;
		try {
			response = await fetch('https://api.mailjet.com/v3.1/send', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Basic ' + btoa(`${apiKey}:${apiSecret}`)
				},
				body: JSON.stringify({ Messages: messages }),
				signal: AbortSignal.timeout(15000)
			});
		} catch (err) {
			// 绝不回显请求头/凭据；仅保留可诊断的传输层错误类型
			throw new BizError(`Mailjet 请求失败 / Mailjet request failed: ${err.name || 'network_error'}`);
		}

		let result = {};
		try {
			result = await response.json();
		} catch (err) {
			result = {};
		}

		// 仅记录状态与消息数量，不记录收件人、正文或完整供应商响应
		console.log(`Mailjet response status=${response.status} messages=${Array.isArray(result?.Messages) ? result.Messages.length : 0}`);

		if (!response.ok) {
			return { data: null, error: { statusCode: response.status, message: `Mailjet returned HTTP ${response.status}` } };
		}

		const messageId = result?.Messages?.[0]?.To?.[0]?.MessageID;
		if (!messageId) {
			return { data: null, error: { message: 'Mailjet 未返回有效 MessageID' } };
		}

		return {
			data: {
				id: String(messageId)
			},
			error: null
		};
	},

	async toCloudflareAttachments(attachments) {
		const arrayBufferAttachments = await this.toArrayBufferAttachments(attachments);

		return arrayBufferAttachments.map(attachment => {
			const item = {
				content: attachment.content,
				filename: attachment.filename,
				type: attachment.mimeType || attachment.contentType || attachment.type || 'application/octet-stream',
				disposition: attachment.contentId ? 'inline' : 'attachment'
			};

			if (attachment.contentId) {
				item.contentId = attachment.contentId.replace(/^<|>$/g, '');
			}

			return item;
		});
	},

	async toResendAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentBase64(attachment);
			if (!content) {
				continue;
			}

			result.push({
				...attachment,
				content,
				contentType: attachment.contentType || attachment.mimeType || attachment.type || 'application/octet-stream'
			});
		}

		return result;
	},

	async toArrayBufferAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentArrayBuffer(attachment);
			if (!content) {
				continue;
			}

			result.push({ ...attachment, content });
		}

		return result;
	},

	async toAttachmentBase64(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return content.replace(/\s+/g, '');
		}

		const arrayBuffer = await this.toAttachmentArrayBuffer(attachment);
		if (!arrayBuffer) {
			return null;
		}

		const bytes = new Uint8Array(arrayBuffer);
		let binary = '';

		for (let i = 0; i < bytes.length; i += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}

		return btoa(binary);
	},

	async toAttachmentArrayBuffer(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (content instanceof ArrayBuffer) {
			return content;
		}

		if (content instanceof Uint8Array) {
			return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return fileUtils.base64ToUint8Array(content.replace(/\s+/g, '')).buffer;
		}

		return content;
	},

	async HandleOnSiteEmail(c, receiveEmail, sendEmailData, attList, outbound) {
		return deliverLocalMail(c, receiveEmail, sendEmailData, attList, outbound);
	},

	imgReplace(content, cidAttList, r2domain) {

		if (!content) {
			return ''
		}

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		const useAtts = []

		for (const img of images) {

			const src = img.getAttribute('src');
			if (src && src.startsWith('cid:') && cidAttList) {

				const cid = src.replace(/^cid:/, '');
				const attCidIndex = cidAttList.findIndex(cidAtt => cidAtt.contentId.replace(/^<|>$/g, '') === cid);

				if (attCidIndex > -1) {
					const cidAtt = cidAttList[attCidIndex];
					img.setAttribute('src', '{{domain}}' + cidAtt.key);
					useAtts.push(cidAtt)
				}

			}

			r2domain = domainUtils.toOssDomain(r2domain)

			if (src && src.startsWith(r2domain + '/')) {
				img.setAttribute('src', src.replace(r2domain + '/', '{{domain}}'));
			}

		}

		useAtts.forEach(att => {
			att.type = attConst.type.EMBED
		})

		return document.toString();
	},

	// Resolve a user's preferred email language: profile KV binding -> admin default -> zh
	async resolveUserLang(c, userId, settingData = null) {
		try {
			const profileStr = await c.env.kv.get('USER_PROFILE_' + userId);
			if (profileStr) {
				const profile = JSON.parse(profileStr);
				if (profile && profile.lang) {
					return normalizeLangKey(profile.lang);
				}
			}
		} catch (e) {}
		if (!settingData) {
			try {
				settingData = await settingService.query(c);
			} catch (e) {}
		}
		return normalizeLangKey(settingData?.welcomeLang || settingData?.defaultLang || 'zh');
	},

	async deliverWelcomeEmailToUser(c, userId, accountId, userEmail, overrideData = null) {
		const settingData = await settingService.query(c);
		if (!overrideData?.forceWelcome && !overrideData?.isBroadcast && settingData.welcomeAutoSend === 0) {
			return null;
		}

		// 系统邮件默认必须为管理员发送的版本（不随收件人个人语言自动修改）
		const adminLang = normalizeLangKey(overrideData?.lang || settingData.welcomeLang || settingData.defaultLang || 'zh');
		let tplLang = adminLang;
		const fallbackTpl = getWelcomeTemplate(tplLang);

		let customTemplates = {};
		try {
			if (typeof settingData.welcomeTemplates === 'string') {
				customTemplates = JSON.parse(settingData.welcomeTemplates || '{}');
			} else if (typeof settingData.welcomeTemplates === 'object' && settingData.welcomeTemplates) {
				customTemplates = settingData.welcomeTemplates;
			}
		} catch (e) {}

		const langTpl = customTemplates[tplLang] || {};
		let subject = overrideData?.subject || langTpl.welcomeSubject || langTpl.subject || (tplLang === 'zh' ? settingData.welcomeSubject : '') || fallbackTpl.subject;
		const expireDays = overrideData?.expireDays !== undefined ? Number(overrideData.expireDays) : (Number(settingData.welcomeExpireDays) >= 0 ? Number(settingData.welcomeExpireDays) : 7);
		let text = overrideData?.text || langTpl.welcomeText || langTpl.text || (tplLang === 'zh' ? settingData.welcomeText : '');
		let rawContent = overrideData?.content || langTpl.welcomeContent || langTpl.content || (tplLang === 'zh' ? settingData.welcomeContent : '') || fallbackTpl.content;
		if (!text && rawContent) {
			text = emailUtils.htmlToText(rawContent);
		}
		if (!text) {
			const welcomeFallbackTextMap = {
				zh: '欢迎使用 Epocanvas Mail，开启您的私密、高效云端邮件体验！',
				'zh-Hant': '歡迎使用 Epocanvas Mail，開啟您的私密、高效雲端郵件體驗！',
				en: 'Welcome to Epocanvas Mail — enjoy a private, efficient cloud email experience!',
				fr: 'Bienvenue sur Epocanvas Mail — profitez d\'une expérience de messagerie cloud privée et efficace !',
				es: '¡Bienvenido a Epocanvas Mail! Disfruta de una experiencia de correo en la nube privada y eficiente.',
				nl: 'Welkom bij Epocanvas Mail — geniet van een privé- en efficiënte cloud-e-mailervaring!'
			};
			text = welcomeFallbackTextMap[tplLang] || welcomeFallbackTextMap.zh;
		}

		// Interpolate dynamic template placeholders ({{user_name}}, {{user_id}}, {{user_email}}, {{domain}}, {{current_date}})
		let userName = emailUtils.getName(userEmail) || (userEmail ? userEmail.split('@')[0] : getUserFallbackNameByLang(tplLang));
		try {
			const userEntity = (await import('../entity/user')).default;
			const userRow = await userOrm(c).select({ nickname: userEntity.nickname, email: userEntity.email }).from(userEntity).where(eq(userEntity.userId, userId)).get();
			if (userRow && userRow.nickname) {
				userName = userRow.nickname;
			}
		} catch (e) {}

		const domain = userEmail ? (userEmail.split('@')[1] || 'epomail.bond') : 'epomail.bond';
		const dateStr = formatDateByLang(tplLang);

		const interpolate = (str) => {
			if (!str || typeof str !== 'string') return str;
			return str
				.replace(/\{\{\s*user_name\s*\}\}/gi, userName)
				.replace(/\{\{\s*username\s*\}\}/gi, userName)
				.replace(/\{\{\s*user_id\s*\}\}/gi, String(userId))
				.replace(/\{\{\s*user_email\s*\}\}/gi, userEmail || '')
				.replace(/\{\{\s*domain\s*\}\}/gi, domain)
				.replace(/\{\{\s*current_date\s*\}\}/gi, dateStr)
				.replace(/\{\{\s*date\s*\}\}/gi, dateStr);
		};

		subject = interpolate(subject);
		const contentSnapshot = interpolate(rawContent);
		text = interpolate(text);

		// Check if user already has an official welcome email (only check on auto-send on registration/ensure)
		if (!overrideData?.isBroadcast) {
			const existing = await orm(c).select({ emailId: email.emailId }).from(email).where(
				and(
					eq(email.userId, userId),
					inArray(email.sendEmail, ['announcement@epocanvas.com', 'admin@epocanvas.com'])
				)
			).limit(1).get();

			if (existing) {
				try {
					await c.env.kv.put('HAS_WELCOME_' + userId, '1');
					await c.env.kv.put('WELCOME_ISSUED_' + userId, '1');
				} catch (e) {}
				return null;
			}
		}

		const now = new Date().toISOString();
		const snoozedEndTime = expireDays > 0 ? new Date(Date.now() + expireDays * 86400000).toISOString() : null;

		let welcomeData = {
			userId: userId,
			accountId: accountId,
			sendEmail: 'announcement@epocanvas.com',
			name: getSenderNameByLang(tplLang),
			subject: subject,
			content: contentSnapshot, // Immutable snapshot with interpolated user variables
			text: text,
			toEmail: userEmail,
			toName: userName,
			recipient: JSON.stringify([{ address: userEmail, name: userName }]),
			cc: '[]',
			bcc: '[]',
			inReplyTo: '',
			relation: '',
			messageId: '',
			type: emailConst.type.RECEIVE,
			status: 0,
			unread: emailConst.unread.UNREAD,
			isDel: isDel.NORMAL,
			isSpam: 0,
			snoozedTime: now, // Automatically marked as Snoozed / 代办
			snoozedEndTime: snoozedEndTime,
			labels: JSON.stringify(['官方', '代办']),
			code: '',
			createTime: now
		};

		if (userId && emailCryptoUtils.shouldEncryptEmail(settingData?.allMailMode, welcomeData)) {
			const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
			welcomeData = await emailCryptoUtils.encryptEmailRecord(welcomeData, cryptoKey);
		}

		const emailRow = await orm(c).insert(email).values(welcomeData).returning().get();

		if (emailRow && emailRow.emailId) {
			// Automatically mark as Starred (重要)
			await orm(c).insert(star).values({
				userId: userId,
				emailId: emailRow.emailId,
				createTime: now
			}).run().catch(() => {});
		}

		try {
			await c.env.kv.put('HAS_WELCOME_' + userId, '1');
			await c.env.kv.put('WELCOME_ISSUED_' + userId, '1');
		} catch (e) {}

		return emailRow;
	},

	async ensureWelcomeEmailForUser(c, userId, userEmail = null) {
		if (!userId) return null;
		try {
			// Welcome mail is issued at most once per account. A separate marker
			// survives the user permanently deleting the message, so a read-path
			// ensure cannot recreate mail the user deliberately removed.
			if (await c.env.kv.get('WELCOME_ISSUED_' + userId) === '1') return null;
			// Migrate the legacy marker without re-sending: HAS_WELCOME_ was set
			// only after a successful delivery in previous versions.
			if (await c.env.kv.get('HAS_WELCOME_' + userId) === '1') {
				await c.env.kv.put('WELCOME_ISSUED_' + userId, '1');
				return null;
			}
		} catch (e) {}

		const existing = await orm(c).select({ emailId: email.emailId }).from(email).where(
			and(
				eq(email.userId, userId),
				inArray(email.sendEmail, ['announcement@epocanvas.com', 'admin@epocanvas.com'])
			)
		).limit(1).get();

		if (existing) {
			try {
				await c.env.kv.put('HAS_WELCOME_' + userId, '1');
				await c.env.kv.put('WELCOME_ISSUED_' + userId, '1');
			} catch (e) {}
			await this.ensureGlobalEmailForUser(c, userId, userEmail).catch(() => {});
			return null;
		}

		let emailAddress = userEmail;
		if (!emailAddress) {
			const userEntity = (await import('../entity/user')).default;
			const userRow = await userOrm(c).select({ email: userEntity.email }).from(userEntity).where(eq(userEntity.userId, userId)).get();
			if (userRow) {
				emailAddress = userRow.email;
			}
		}
		if (!emailAddress) return null;

		let accountRow = await accountService.selectByEmail(c, emailAddress);
		if (!accountRow) {
			accountRow = await orm(c).select().from(account).where(
				and(
					eq(account.userId, userId),
					eq(account.isDel, isDel.NORMAL)
				)
			).orderBy(desc(account.sort), asc(account.accountId)).limit(1).get();
		}
		if (!accountRow) return null;

		const welcomeRes = await this.deliverWelcomeEmailToUser(c, userId, accountRow.accountId, emailAddress, { forceWelcome: true });
		await this.ensureGlobalEmailForUser(c, userId, emailAddress).catch(() => {});
		return welcomeRes;
	},

	async deliverGlobalEmailToUser(c, userId, accountId, userEmail, options = {}) {
		const {
			subject,
			content,
			text,
			expireDays = 0,
			isStarred = 1,
			senderName,
			templates = null
		} = options;

		const settingData = await settingService.query(c);
		const now = new Date().toISOString();
		const snoozedEndTime = Number(expireDays) > 0 ? new Date(Date.now() + Number(expireDays) * 86400000).toISOString() : null;

		// 系统全域邮件默认必须为管理员发送的版本（不随收件人个人语言自动修改）
		const adminLang = normalizeLangKey(options?.lang || settingData.defaultLang || 'zh');
		const tplLang = adminLang;

		// 默认直接采用管理员撰写并发送的原始版本（无需按收件人语言修改），若未传递则采用管理员语言模板
		let tplSubject = subject;
		let tplContent = content;
		let tplText = text;
		if ((!tplSubject || !String(tplSubject).trim()) && templates && typeof templates === 'object' && templates[adminLang]) {
			const langTpl = templates[adminLang];
			if (langTpl.subject && String(langTpl.subject).trim()) tplSubject = langTpl.subject;
			if (langTpl.content && String(langTpl.content).trim()) tplContent = langTpl.content;
			if (langTpl.text && String(langTpl.text).trim()) tplText = langTpl.text;
		}
		if ((!tplSubject || !String(tplSubject).trim()) || (!tplContent || !String(tplContent).trim())) {
			const defTpl = getGlobalAnnouncementTemplate(adminLang);
			if (!tplSubject || !String(tplSubject).trim()) tplSubject = defTpl.subject;
			if (!tplContent || !String(tplContent).trim()) tplContent = defTpl.content;
		}

		let userName = emailUtils.getName(userEmail) || (userEmail ? userEmail.split('@')[0] : getUserFallbackNameByLang(tplLang));
		try {
			const userEntity = (await import('../entity/user')).default;
			const userRow = await userOrm(c).select({ nickname: userEntity.nickname, email: userEntity.email }).from(userEntity).where(eq(userEntity.userId, userId)).get();
			if (userRow && userRow.nickname) {
				userName = userRow.nickname;
			}
		} catch (e) {}

		const domain = userEmail ? (userEmail.split('@')[1] || 'epomail.bond') : 'epomail.bond';
		const dateStr = formatDateByLang(tplLang);

		const interpolate = (str) => {
			if (!str || typeof str !== 'string') return str;
			return str
				.replace(/\{\{\s*user_name\s*\}\}/gi, userName)
				.replace(/\{\{\s*username\s*\}\}/gi, userName)
				.replace(/\{\{\s*user_id\s*\}\}/gi, String(userId))
				.replace(/\{\{\s*user_email\s*\}\}/gi, userEmail || '')
				.replace(/\{\{\s*domain\s*\}\}/gi, domain)
				.replace(/\{\{\s*current_date\s*\}\}/gi, dateStr)
				.replace(/\{\{\s*date\s*\}\}/gi, dateStr);
		};

		const finalSubject = interpolate(tplSubject);
		const finalContent = interpolate(tplContent);
		const finalText = interpolate(tplText || emailUtils.htmlToText(tplContent));
		const resolvedSenderName = senderName || getSenderNameByLang(tplLang);

		let globalEmailData = {
			userId: userId,
			accountId: accountId,
			sendEmail: 'announcement@epocanvas.com',
			name: resolvedSenderName,
			subject: finalSubject,
			content: finalContent,
			text: finalText,
			toEmail: userEmail,
			toName: userName,
			recipient: JSON.stringify([{ address: userEmail, name: userName }]),
			cc: '[]',
			bcc: '[]',
			inReplyTo: '',
			relation: '',
			messageId: '',
			type: emailConst.type.RECEIVE,
			status: 0,
			unread: emailConst.unread.UNREAD,
			isDel: isDel.NORMAL,
			isSpam: 0,
			snoozedTime: snoozedEndTime ? now : null,
			snoozedEndTime: snoozedEndTime,
			labels: JSON.stringify(['全域公告', '官方']),
			code: '',
			createTime: now
		};

		if (userId && emailCryptoUtils.shouldEncryptEmail(settingData?.allMailMode, globalEmailData)) {
			const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
			globalEmailData = await emailCryptoUtils.encryptEmailRecord(globalEmailData, cryptoKey);
		}

		const emailRow = await orm(c).insert(email).values(globalEmailData).returning().get();

		if (emailRow && emailRow.emailId && isStarred) {
			await orm(c).insert(star).values({
				userId: userId,
				emailId: emailRow.emailId,
				createTime: now
			}).run().catch(() => {});
		}

		return emailRow;
	},

	async ensureGlobalEmailForUser(c, userId, userEmail = null) {
		if (!userId) return null;
		let globalConfig = null;
		try {
			globalConfig = await c.env.kv.get('ACTIVE_GLOBAL_EMAIL', { type: 'json' });
		} catch (e) {}

		if (!globalConfig || !globalConfig.active || !globalConfig.sendToNewUsers) {
			const settingData = await settingService.query(c);
			globalConfig = settingData?.globalEmailConfig;
			if (typeof globalConfig === 'string') {
				try { globalConfig = JSON.parse(globalConfig); } catch (e) { globalConfig = null; }
			}
		}

		if (!globalConfig || !globalConfig.active || !globalConfig.sendToNewUsers) {
			return null;
		}

		const userEntity = (await import('../entity/user')).default;
		const userRow = await userOrm(c).select().from(userEntity).where(eq(userEntity.userId, userId)).get();
		if (!userRow) return null;

		if (globalConfig.targetType === 'roles') {
			const allowedRoles = globalConfig.targetRoleIds || [];
			if (!allowedRoles.includes(userRow.type)) {
				return null;
			}
		}

		const kvKey = `HAS_GLOBAL_EMAIL_${userId}_${globalConfig.lastBroadcastTime || 'default'}`;
		try {
			const hasReceived = await c.env.kv.get(kvKey);
			if (hasReceived === '1') return null;
		} catch (e) {}

		const existing = await orm(c).select({ emailId: email.emailId }).from(email).where(
			and(
				eq(email.userId, userId),
				inArray(email.sendEmail, ['announcement@epocanvas.com', 'admin@epocanvas.com']),
				eq(email.subject, globalConfig.subject),
				eq(email.isDel, isDel.NORMAL)
			)
		).limit(1).get();

		if (existing) {
			try { await c.env.kv.put(kvKey, '1'); } catch (e) {}
			return null;
		}

		let emailAddress = userEmail || userRow.email;
		let accountRow = await accountService.selectByEmail(c, emailAddress);
		if (!accountRow) {
			accountRow = await orm(c).select().from(account).where(
				and(eq(account.userId, userId), eq(account.isDel, isDel.NORMAL))
			).orderBy(desc(account.sort), asc(account.accountId)).limit(1).get();
		}
		if (!accountRow) return null;

		const result = await this.deliverGlobalEmailToUser(c, userId, accountRow.accountId, emailAddress, globalConfig);
		try { await c.env.kv.put(kvKey, '1'); } catch (e) {}
		return result;
	},

	async selectById(c, emailId, expectedUserId = null, includeDel = false) {
		const conditions = [
			eq(email.emailId, emailId)
		];
		if (!includeDel) {
			conditions.push(eq(email.isDel, isDel.NORMAL));
		}
		if (expectedUserId !== null && expectedUserId !== undefined) {
			conditions.push(eq(email.userId, expectedUserId));
		}
		let emailRow = await orm(c)
			.select({
				...email,
				starId: star.starId
			})
			.from(email)
			.leftJoin(
				star,
				and(
					eq(star.emailId, email.emailId),
					eq(star.userId, expectedUserId || email.userId)
				)
			)
			.where(and(...conditions))
			.get();
		if (emailRow) {
			emailRow.isStar = emailRow.starId != null ? 1 : 0;
			if (emailRow.userId) {
				const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, emailRow.userId);
				emailRow = await emailCryptoUtils.decryptEmailRecord(emailRow, cryptoKey);
			}
			const isOfficial = emailRow.sendEmail === 'announcement@epocanvas.com' || emailRow.sendEmail === 'admin@epocanvas.com' || (emailRow.labels && emailRow.labels.includes('官方'));
			if (isOfficial) {
				emailRow.isOfficial = 1;
				const settingData = await settingService.query(c);
				const welcomeContent = settingData.welcomeContent || DEFAULT_WELCOME_CONTENT;
				if (!emailRow.content && welcomeContent) {
					emailRow.content = welcomeContent;
				}
				if (emailRow.content && emailRow.content.includes('{{')) {
					const userName = emailRow.toName || (emailRow.toEmail ? emailRow.toEmail.split('@')[0] : '用户');
					const domain = emailRow.toEmail ? (emailRow.toEmail.split('@')[1] || 'epomail.bond') : 'epomail.bond';
					const dateStr = new Date(emailRow.createTime || Date.now()).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
					emailRow.content = emailRow.content
						.replace(/\{\{\s*user_name\s*\}\}/gi, userName)
						.replace(/\{\{\s*username\s*\}\}/gi, userName)
						.replace(/\{\{\s*user_id\s*\}\}/gi, String(emailRow.userId || ''))
						.replace(/\{\{\s*user_email\s*\}\}/gi, emailRow.toEmail || '')
						.replace(/\{\{\s*domain\s*\}\}/gi, domain)
						.replace(/\{\{\s*current_date\s*\}\}/gi, dateStr)
						.replace(/\{\{\s*date\s*\}\}/gi, dateStr);
				}
				emailRow.expireDays = settingData.welcomeExpireDays ?? 7;
			}
			await this.emailAddAtt(c, [emailRow]);
			emailRow.hash = await hashUtils.encodeEmailHash(emailRow.emailId, emailRow.userId, c.env.jwt_secret);
		}
		return emailRow;
	},

	async latest(c, params, userId) {
		let { emailId, accountId, allReceive } = params;
		emailId = Number(emailId) || 0;
		accountId = Number(accountId);
		allReceive = Number(allReceive);

		if (accountId && !isNaN(accountId)) {
			const accountRow = await accountService.selectById(c, accountId);
			if (!accountRow || accountRow.userId !== userId) {
				return [];
			}
			if (isNaN(allReceive)) {
				allReceive = accountRow.allReceive;
			}
		} else if (isNaN(allReceive)) {
			const myAccounts = await accountService.list(c, { size: 1 }, userId);
			const accountRow = Array.isArray(myAccounts) ? myAccounts[0] : null;
			if (!accountRow) {
				return [];
			}
			allReceive = accountRow.allReceive;
			accountId = accountRow.accountId;
		} else {
			const myAccounts = await accountService.list(c, { size: 1 }, userId);
			const firstAccount = Array.isArray(myAccounts) ? myAccounts[0] : null;
			if (!firstAccount) {
				return [];
			}
			accountId = firstAccount.accountId;
		}

		let list = await orm(c).select({...email}).from(email)
			.leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.userId, userId),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL),
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.type, emailConst.type.RECEIVE)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		await this.emailAddAtt(c, list);

		if (userId) {
			const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
			list = await emailCryptoUtils.decryptEmailList(list, cryptoKey);
		}

		const settingData = await settingService.query(c);
		list.forEach(item => {
			const isOfficial = item.sendEmail === 'announcement@epocanvas.com' || item.sendEmail === 'admin@epocanvas.com' || (item.labels && item.labels.includes('官方'));
			if (isOfficial) {
				item.isOfficial = 1;
				const welcomeContent = settingData.welcomeContent || DEFAULT_WELCOME_CONTENT;
				if (!item.content && welcomeContent) {
					item.content = welcomeContent;
				}
				item.expireDays = settingData.welcomeExpireDays ?? 7;
			}
		});

		await Promise.all(list.map(async (item) => {
			item.hash = await hashUtils.encodeEmailHash(item.emailId, userId, c.env.jwt_secret);
		}));

		return list;
	},

	async physicsDelete(c, params) {
		const { emailIds } = params;
		const ids = Array.isArray(emailIds) ? emailIds : String(emailIds || '').split(',');
		return await mailLifecycleService.cascadeDeleteSystemEmails(c, ids);
	},

	async physicsDeleteUserIds(c, userIds) {
		await attService.removeByUserIds(c, userIds);
		await orm(c).delete(email).where(inArray(email.userId, userIds)).run();
	},

	// 实体删除用户本人的邮件并级联清理附件与星标（手动彻底删除、90% 配额清理共用）
	async cascadeDeleteEmails(c, userId, emailIdList) {
		return mailLifecycleService.cascadeDeleteEmails(c, userId, emailIdList);
	},

	/**
	 * 第二轮修复：普通 email 记录的提供商事件投影守卫。
	 *
	 * 旧实现 updateEmailStatus 无条件覆盖 status，迟到的 delivered 事件会覆盖已记录的 bounced，
	 * 发送线程迟到的写回也可能回退已确认事实。
	 *
	 * 现行契约（基于 Resend 真实提供商事件语义，与 notification_outbox 状态机严格对齐，
	 * 不引入"任意大小顺序"的单值排序）：
	 * - sent/failed 只允许从在途状态 (RECEIVE/SAVING/SENT/DELAYED/NOONE) 落地，不得覆盖任何终态；
	 * - delayed 只允许从在途状态落地；
	 * - delivered 只允许从在途状态落地 —— 迟到的 delivered 不得覆盖 bounced/failed（原缺陷核心）；
	 * - bounced 是终端负面事实，允许修正在途状态与 delivered（与 Outbox delivered→dead_letter 语义一致）；
	 * - complained 是投递后滥用事实，除 canceled 外均可记录（与 Outbox 语义一致）；
	 * - 被守卫拦截但属于新事实的事件（如 bounced/failed/complained 撞上已记录的不同终态），
	 *   以时间戳事实行追加进 message，不覆盖既有事实，实现投递/退信/投诉事实分别留痕。
	 */
	async updateEmailStatus(c, params) {
		const { status, resendEmailId, message, eventId } = params;
		const st = emailConst.status;
		const terminalStates = [st.BOUNCED, st.FAILED, st.COMPLAINED, st.DELIVERED];
		const inFlightStates = [st.RECEIVE, st.SAVING, st.SENT, st.DELAYED, st.NOONE];

		const EVENT_TRANSITIONS = {
			[emailConst.status.SENT]: { from: inFlightStates, fact: false },
			[emailConst.status.DELAYED]: { from: [st.RECEIVE, st.SAVING, st.SENT, st.NOONE], fact: false },
			[emailConst.status.DELIVERED]: { from: inFlightStates, fact: false },
			[emailConst.status.BOUNCED]: { from: [...inFlightStates, st.DELIVERED], fact: true },
			[emailConst.status.FAILED]: { from: inFlightStates, fact: true },
			[emailConst.status.COMPLAINED]: { from: [...inFlightStates, ...terminalStates], fact: true }
		};

		const transition = EVENT_TRANSITIONS[status];
		if (!transition || !resendEmailId) {
			// 未知事件状态或不携带邮件标识：不落任何投影，交由调用方记录
			return null;
		}

		const guardedResult = await orm(c).update(email).set({
			status: status,
			...(message !== undefined && message !== null ? { message: message } : {})
		}).where(
			and(
				eq(email.resendEmailId, resendEmailId),
				inArray(email.status, transition.from)
			)
		).run();

		const changes = guardedResult?.meta?.changes ?? guardedResult?.changes ?? 0;

		// 守卫放行路径返回受影响行；被守卫拦截且属于新事实的事件，向 message 追加事实行留痕
		if (changes === 0 && transition.fact) {
			const factKey = eventId ? `provider-fact:${eventId}` : `provider-fact:${status}:${new Date().toISOString()}`;
			const factLine = `[${factKey}] event status=${status}${message ? ' detail=' + String(message).slice(0, 500) : ''}`;
			const existing = await orm(c).select({ emailId: email.emailId, message: email.message }).from(email)
				.where(eq(email.resendEmailId, resendEmailId)).get();
			if (existing && !(existing.message || '').includes(factKey)) {
				await orm(c).update(email).set({
					message: (existing.message ? existing.message + '\n' : '') + factLine
				}).where(eq(email.emailId, existing.emailId)).run();
			}
		}

		if (changes === 0) {
			return null;
		}
		return await orm(c).select().from(email).where(eq(email.resendEmailId, resendEmailId)).get();
	},

	/**
	 * 第二轮修复：发送线程迟到写回保护。
	 * 发信线程在 INSERT 普通邮件记录时携带初始 status=SENT；若提供商事件（bounced/failed/
	 * delivered 等）已先一步落账于 webhook_event 台账，这里按台账已确认事实重新投影，
	 * 避免"事件已处理 → 记录随后以 SENT 插入"造成的投影回退。
	 * 以现有守卫投影（updateEmailStatus）执行，天然幂等且不覆盖更强事实。
	 */
	async replayProviderEventsFromLedger(c, resendEmailId) {
		if (!resendEmailId) return null;
		let eventRows = [];
		try {
			const userDb = getUserDb(c) || c?.env?.db;
			if (!userDb) return null;
			const result = await userDb.prepare(`
				SELECT event_type FROM webhook_event
				WHERE provider = 'resend' AND resource_id = ?
				ORDER BY create_time ASC, event_id ASC
			`).bind(resendEmailId).all();
			eventRows = result?.results || [];
		} catch (e) {
			return null; // 台账不可用时保持原状，不做投机投影
		}

		const EVENT_TO_STATUS = {
			'email.sent': emailConst.status.SENT,
			'email.delivery_delayed': emailConst.status.DELAYED,
			'email.delivered': emailConst.status.DELIVERED,
			'email.bounced': emailConst.status.BOUNCED,
			'email.failed': emailConst.status.FAILED,
			'email.complained': emailConst.status.COMPLAINED
		};

		// 逐事件按台账顺序重放真实守卫投影（单调，不会回退）
		for (const row of eventRows) {
			const target = EVENT_TO_STATUS[row.event_type];
			if (!target) continue;
			try {
				await this.updateEmailStatus(c, {
					resendEmailId,
					status: target,
					message: row.event_type === 'email.bounced' ? 'Bounced (replayed from webhook ledger)' : null
				});
			} catch (_) {}
		}
		return eventRows.length;
	},

	/**
	 * Reconcile UNKNOWN outbound tasks that have a durable provider id.
	 *
	 * A provider acceptance that could not be written back locally used to stay
	 * UNKNOWN forever, keeping its send-count reservation and archive pending.
	 * Resend exposes GET /emails/:id, so a bounded maintenance pass can turn a
	 * confirmed provider fact into ACCEPTED/FAILED without ever re-dispatching.
	 * Tasks without a provider id remain UNKNOWN for administrator review.
	 */
	async reconcileUnknownOutbound(c, { limit = 20 } = {}) {
		const db = getMailDb(c);
		const bound = Math.max(1, Math.min(Number(limit) || 20, 20));
		// Provider queries are sequential; cap the total wall-clock budget so a
		// slow/unreachable provider cannot delay the rest of the cron chain.
		const deadline = Date.now() + 15000;
		const candidates = await db.prepare(`SELECT task_id, user_id, account_id, provider_id, payload_json
			FROM mail_outbound_task
			WHERE state='UNKNOWN' AND provider='external' AND provider_id IS NOT NULL
				AND updated_at < datetime('now','-30 seconds')
			ORDER BY updated_at ASC LIMIT ?`).bind(bound).all();
		const rows = candidates.results || [];
		if (rows.length === 0) return { checked: 0, accepted: 0, failed: 0, stoppedEarly: false };

		const settings = await settingService.query(c);
		let checked = 0;
		let accepted = 0;
		let failed = 0;
		let stoppedEarly = false;
		for (const row of rows) {
			if (Date.now() >= deadline) {
				stoppedEarly = true;
				break;
			}
			const account = await accountService.selectById(c, row.account_id);
			const domain = emailUtils.getDomain(account?.email || '');
			const token = settings?.resendTokens?.[domain];
			if (!token) continue;
			let providerName = '';
			try {
				providerName = String(JSON.parse(row.payload_json || '{}')?.providerName || '');
			} catch (_) {}
			if (!providerName) providerName = String(token).startsWith('mailjet:') ? 'mailjet' : 'resend';
			// Cloudflare Email exposes no status lookup API; those tasks stay in
			// the administrator queue rather than being queried against Resend.
			if (providerName === 'cloudflare') continue;

			const accept = async (providerId, event) => {
				const updated = await db.prepare(`UPDATE mail_outbound_task
					SET state='ACCEPTED',reserved_bytes=0,reserved_count=0,lease_until=0,
						last_error='Reconciled from provider acceptance',updated_at=CURRENT_TIMESTAMP
					WHERE task_id=? AND state='UNKNOWN' AND provider_id=?
					RETURNING email_id`).bind(row.task_id, providerId).first();
				if (!updated) return;
				accepted++;
				if (updated.email_id) {
					const emailStatus = event === 'delivered' || event === 'opened' || event === 'clicked'
						? emailConst.status.DELIVERED : emailConst.status.SENT;
					await db.prepare(`UPDATE email SET status=CASE WHEN status=? THEN ? ELSE status END,
						resend_email_id=COALESCE(resend_email_id,?) WHERE email_id=? AND user_id=?`)
						.bind(emailConst.status.SAVING, emailStatus, providerId, updated.email_id, row.user_id).run();
				}
				if (event !== 'delivered') {
					await this.replayProviderEventsFromLedger(c, providerId).catch(() => {});
				}
			};
			const fail = async (providerId, emailStatus, reason) => {
				const updated = await db.prepare(`UPDATE mail_outbound_task
					SET state='FAILED',reserved_bytes=0,reserved_count=0,lease_until=0,
						last_error=?,updated_at=CURRENT_TIMESTAMP
					WHERE task_id=? AND state='UNKNOWN' AND provider_id=?
					RETURNING email_id`).bind(String(reason).slice(0, 500), row.task_id, providerId).first();
				if (!updated) return;
				failed++;
				if (updated.email_id) {
					await db.prepare('UPDATE email SET status=? WHERE email_id=? AND user_id=? AND status IN (?,?,?)')
						.bind(emailStatus, updated.email_id, row.user_id, emailConst.status.SAVING,
							emailConst.status.SENT, emailConst.status.DELAYED).run();
				}
				await mailOutboundService.compensateSendCount(c, { taskId: row.task_id }).catch(() => {});
			};

			if (providerName === 'mailjet') {
				const parts = String(token).split(':');
				if (parts.length !== 3 || !parts[1] || !parts[2]) continue;
				checked++;
				let response;
				try {
					response = await fetch(`https://api.mailjet.com/v3/REST/message/${encodeURIComponent(row.provider_id)}`, {
						headers: { Authorization: 'Basic ' + btoa(`${parts[1]}:${parts[2]}`) },
						signal: AbortSignal.timeout(5000)
					});
				} catch (_) {
					continue;
				}
				if (!response.ok) continue;
				const data = await response.json().catch(() => null);
				const status = String(data?.Data?.[0]?.Status || '').toLowerCase();
				if (['sent', 'queued', 'opened', 'clicked', 'delivered'].includes(status)) {
					await accept(row.provider_id, status);
				} else if (['bounced', 'hardbounced', 'blocked', 'spam', 'error'].includes(status)) {
					const emailStatus = status === 'bounced' || status === 'hardbounced'
						? emailConst.status.BOUNCED
						: status === 'spam' ? emailConst.status.COMPLAINED : emailConst.status.FAILED;
					await fail(row.provider_id, emailStatus, `Mailjet reported ${status}`);
				}
				continue;
			}

			checked++;
			let response;
			try {
				response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(row.provider_id)}`, {
					headers: { Authorization: `Bearer ${String(token)}` },
					signal: AbortSignal.timeout(5000)
				});
			} catch (_) {
				continue;
			}
			if (!response.ok) continue;
			const data = await response.json().catch(() => null);
			const event = String(data?.last_event || data?.status || '').toLowerCase();
			if (!event) continue;

			if (['sent', 'delivery_delayed', 'delivered'].includes(event)) {
				await accept(row.provider_id, event);
				continue;
			}

			if (['bounced', 'complained', 'failed'].includes(event)) {
				const emailStatus = event === 'bounced' ? emailConst.status.BOUNCED
					: event === 'complained' ? emailConst.status.COMPLAINED : emailConst.status.FAILED;
				await fail(row.provider_id, emailStatus, `Provider reported ${event}`);
			}
		}
		return { checked, accepted, failed, stoppedEarly };
	},

	async listUnknownOutbound(c, { limit = 50 } = {}) {
		const bound = Math.max(1, Math.min(Number(limit) || 50, 100));
		const result = await getMailDb(c).prepare(`SELECT task_id, user_id, account_id, provider_id,
			reserved_bytes, reserved_count, last_error, create_time, updated_at
			FROM mail_outbound_task WHERE state='UNKNOWN' ORDER BY updated_at ASC LIMIT ?`).bind(bound).all();
		return result.results || [];
	},

	/**
	 * Administrator resolution of an UNKNOWN task after checking the provider.
	 * ACCEPTED confirms delivery and keeps the consumed send-count reservation;
	 * FAILED is only valid for a confirmed provider rejection and compensates it.
	 */
	async resolveUnknownOutbound(c, { taskId, state, note = '' } = {}) {
		const target = String(state || '').toUpperCase();
		if (!['ACCEPTED', 'FAILED'].includes(target)) {
			throw new BizError('Unknown resolution state', 400, 'invalid_outbound_resolution');
		}
		if (typeof taskId !== 'string' || !taskId.trim()) {
			throw new BizError('Missing outbound task id', 400, 'invalid_outbound_resolution');
		}
		const db = getMailDb(c);
		const reason = `Administrator resolved ${target}${note ? `: ${String(note).slice(0, 300)}` : ''}`;
		const updated = await db.prepare(`UPDATE mail_outbound_task
			SET state=?,reserved_bytes=0,reserved_count=0,lease_until=0,last_error=?,updated_at=CURRENT_TIMESTAMP
			WHERE task_id=? AND state='UNKNOWN' RETURNING email_id,user_id`)
			.bind(target, reason, taskId.trim()).first();
		if (!updated) throw new BizError('Outbound task is not UNKNOWN or was already resolved', 409, 'outbound_task_state_changed');
		if (updated.email_id) {
			const emailStatus = target === 'ACCEPTED' ? emailConst.status.SENT : emailConst.status.FAILED;
			await db.prepare('UPDATE email SET status=CASE WHEN status=? THEN ? ELSE status END WHERE email_id=? AND user_id=?')
				.bind(emailConst.status.SAVING, emailStatus, updated.email_id, updated.user_id).run();
		}
		if (target === 'FAILED') {
			await mailOutboundService.compensateSendCount(c, { taskId: taskId.trim() });
		}
		return { taskId: taskId.trim(), state: target, emailId: updated.email_id || null };
	},

	async selectUserEmailCountList(c, userIds, type, del = isDel.NORMAL) {
		if (!userIds || userIds.length === 0) {
			return [];
		}
		const result = await orm(c)
			.select({
				userId: email.userId,
				count: count(email.emailId)
			})
			.from(email)
			.where(and(
				inArray(email.userId, userIds),
				eq(email.type, type),
				eq(email.isDel, del),
				ne(email.status, emailConst.status.SAVING),
			))
			.groupBy(email.userId);
		return result;
	},

	async allList(c, params) {

		let { emailId, size, name, subject, accountEmail, userEmail, type, timeSort } = params;

		size = Number(size);

		emailId = Number(emailId);
		timeSort = Number(timeSort);

		if (!Number.isInteger(size) || size < 1) size = 20;
		if (size > 50) {
			size = 50;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		const conditions = [];

		if (type === 'send') {
			conditions.push(eq(email.type, emailConst.type.SEND));
		}

		if (type === 'receive') {
			conditions.push(eq(email.type, emailConst.type.RECEIVE));
		}

		if (type === 'delete') {
			conditions.push(eq(email.isDel, isDel.DELETE));
		}

		if (type === 'noone') {
			conditions.push(eq(email.status, emailConst.status.NOONE));
		}

		if (userEmail) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${'%'+ userEmail + '%'}`);
		}

		if (accountEmail) {
			conditions.push(
				or(
					sql`${email.toEmail} COLLATE NOCASE LIKE ${'%'+ accountEmail + '%'}`,
					sql`${email.sendEmail} COLLATE NOCASE LIKE ${'%'+ accountEmail + '%'}`,
				)
			)
		}

		if (name) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${'%'+ name + '%'}`);
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${'%'+ subject + '%'}`);
		}

		// keyword = free-text search (no $-prefix), OR across name + subject + sendEmail
		if (params.keyword) {
			const kw = '%' + params.keyword + '%';
			conditions.push(
				or(
					sql`${email.name} COLLATE NOCASE LIKE ${kw}`,
					sql`${email.subject} COLLATE NOCASE LIKE ${kw}`,
					sql`${email.sendEmail} COLLATE NOCASE LIKE ${kw}`,
					sql`${email.toEmail} COLLATE NOCASE LIKE ${kw}`,
				)
			);
		}

		// Privacy mode filtering:
		// Mode 1 (allMailMode === 1): Admin sees all emails (plaintext)
		// Mode 0 (allMailMode === 0): Admin only sees spam / deleted / noone emails (plaintext in mode 0)
		// Mode 2 (allMailMode === 2): Admin strictly forbidden from listing/viewing any user emails
		const settingRow = await settingService.query(c);
		const mode = Number(settingRow?.allMailMode);
		if (mode === 2) {
			return { list: [], total: 0, latestEmail: { emailId: 0, accountId: 0, userId: 0 } };
		}
		if (mode === 0) {
			conditions.push(
				or(
					eq(email.isSpam, 1),
					eq(email.isDel, isDel.DELETE),
					eq(email.status, emailConst.status.NOONE)
				)
			);
		}

		conditions.push(ne(email.status, emailConst.status.SAVING));

		const countConditions = [...conditions];

		if (timeSort) {
			conditions.unshift(gt(email.emailId, emailId));
		} else {
			conditions.unshift(lt(email.emailId, emailId));
		}

		const query = orm(c).select()
			.from(email)
			.where(and(...conditions));

		const queryCount = orm(c).select({ total: count() })
			.from(email)
			.where(and(...countConditions));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();
		const totalQuery = queryCount.get();
		
		const latestConditions = [
			eq(email.type, emailConst.type.RECEIVE),
			ne(email.status, emailConst.status.SAVING)
		];
		if (mode === 0) {
			latestConditions.push(
				or(
					eq(email.isSpam, 1),
					eq(email.isDel, isDel.DELETE),
					eq(email.status, emailConst.status.NOONE)
				)
			);
		} else if (mode === 2) {
			latestConditions.push(
				eq(email.status, emailConst.status.NOONE)
			);
		}

		const latestEmailQuery = orm(c).select().from(email)
			.where(and(...latestConditions))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		const userIds = [...new Set(list.map(item => item.userId).filter(Boolean))];
		if (userIds.length > 0) {
			try {
				const userList = await userOrm(c).select({ userId: user.userId, email: user.email }).from(user).where(inArray(user.userId, userIds)).all();
				const userMap = new Map(userList.map(u => [u.userId, u.email]));
				list.forEach(item => {
					item.userEmail = userMap.get(item.userId) || '';
				});
			} catch (e) {
				list.forEach(item => {
					item.userEmail = '';
				});
			}
		} else {
			list.forEach(item => {
				item.userEmail = '';
			});
		}

		await this.emailAddAtt(c, list);

		await Promise.all(list.map(async (item) => {
			item.hash = await hashUtils.encodeEmailHash(item.emailId, item.userId || 0, c.env.jwt_secret);
		}));

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: 0,
				userId: 0,
			}
		}

		return { list: list, total: totalRow.total, latestEmail };
	},

	async allEmailLatest(c, params) {

		const { emailId } = params;
		const settingRow = await settingService.query(c);
		const mode = Number(settingRow?.allMailMode);
		if (mode === 2) {
			return [];
		}

		const conditions = [
			gt(email.emailId, emailId),
			eq(email.type, emailConst.type.RECEIVE),
			ne(email.status, emailConst.status.SAVING)
		];
		if (mode === 0) {
			conditions.push(
				or(
					eq(email.isSpam, 1),
					eq(email.isDel, isDel.DELETE),
					eq(email.status, emailConst.status.NOONE)
				)
			);
		}

		let list = await orm(c).select().from(email)
			.where(and(...conditions))
			.orderBy(desc(email.emailId))
			.limit(20);

		const userIds = [...new Set(list.map(item => item.userId).filter(Boolean))];
		if (userIds.length > 0) {
			try {
				const userList = await userOrm(c).select({ userId: user.userId, email: user.email }).from(user).where(inArray(user.userId, userIds)).all();
				const userMap = new Map(userList.map(u => [u.userId, u.email]));
				list.forEach(item => {
					item.userEmail = userMap.get(item.userId) || '';
				});
			} catch (e) {
				list.forEach(item => {
					item.userEmail = '';
				});
			}
		} else {
			list.forEach(item => {
				item.userEmail = '';
			});
		}

		await this.emailAddAtt(c, list);

		return list;
	},

	async emailAddAtt(c, list) {

		const emailIds = list.map(item => item.emailId);

		if (emailIds.length > 0) {

			const attList = await attService.selectByEmailIds(c, emailIds);

			list.forEach(emailRow => {
				const atts = attList.filter(attRow => attRow.emailId === emailRow.emailId);
				emailRow.attList = atts;
			});
		}
	},

	async restoreByUserId(c, userId) {
		let after = 0;
		while (true) {
			const rows = await getMailDb(c).prepare(`SELECT email_id FROM email
				WHERE user_id=? AND is_del=1 AND email_id>? ORDER BY email_id LIMIT 100`).bind(userId, after).all();
			if (!rows.results?.length) return;
			await mailLifecycleService.restoreMail(c, { emailIds: rows.results.map(row => row.email_id) }, userId);
			after = rows.results.at(-1).email_id;
		}
	},

	async completeReceive(c, status, emailId, delStatus) {
		return await orm(c).update(email).set({
			isDel: delStatus !== undefined ? delStatus : isDel.NORMAL,
			status: status
		}).where(eq(email.emailId, emailId)).returning().get();
	},

	async completeReceiveAll(c) {
		const mailDb = getMailDb(c);
		await mailDb.prepare(`UPDATE email as e SET status = ${emailConst.status.RECEIVE} WHERE status = ${emailConst.status.SAVING}
			AND receive_claim_key IS NULL AND outbound_task_id IS NULL
			AND EXISTS (SELECT 1 FROM account WHERE account_id = e.account_id)`).run();
		await mailDb.prepare(`UPDATE email as e SET status = ${emailConst.status.NOONE} WHERE status = ${emailConst.status.SAVING}
			AND receive_claim_key IS NULL AND outbound_task_id IS NULL
			AND NOT EXISTS (SELECT 1 FROM account WHERE account_id = e.account_id)`).run();
	},

	async batchDelete(c, params) {
		let { sendName, sendEmail, toEmail, subject, startTime, endTime, type  } = params

		let right = type === 'left' || type === 'include'
		let left = type === 'include'

		const conditions = []

		if (sendName) {
			conditions.push(like(email.name,`${left ? '%' : ''}${sendName}${right ? '%' : ''}`))
		}

		if (subject) {
			conditions.push(like(email.subject,`${left ? '%' : ''}${subject}${right ? '%' : ''}`))
		}

		if (sendEmail) {
			conditions.push(like(email.sendEmail,`${left ? '%' : ''}${sendEmail}${right ? '%' : ''}`))
		}

		if (toEmail) {
			conditions.push(like(email.toEmail,`${left ? '%' : ''}${toEmail}${right ? '%' : ''}`))
		}

		if (startTime && endTime) {
			conditions.push(gte(email.createTime,`${startTime}`))
			conditions.push(lte(email.createTime,`${endTime}`))
		}

		if (conditions.length === 0) {
			return;
		}

		const emailIdsRow = await orm(c).select({emailId: email.emailId}).from(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).all();

		const emailIds = emailIdsRow.map(row => row.emailId);

		if (emailIds.length === 0){
			return;
		}

		// Delete exactly this snapshot through the lifecycle transaction. Never
		// re-evaluate the dynamic filter after the attachment snapshot: a message
		// that arrived in between would otherwise lose its parent row without its
		// attachment/object cleanup.
		return await mailLifecycleService.cascadeDeleteSystemEmails(c, emailIds);
	},

	async physicsDeleteByAccountId(c, accountId) {
		await attService.removeByAccountId(c, accountId);
		await orm(c).delete(email).where(eq(email.accountId, accountId)).run();
	},

	async read(c, params, userId) {
		const { emailIds, unread } = params;
		const unreadValue = unread !== undefined ? Number(unread) : emailConst.unread.READ;
		const emailIdList = (Array.isArray(emailIds) ? emailIds.map(Number) : String(emailIds || '').split(',').map(Number))
			.filter(id => Number.isInteger(id) && id > 0);
		if (emailIdList.length === 0) return;
		await orm(c).update(email).set({ unread: unreadValue }).where(and(eq(email.userId, userId), inArray(email.emailId, emailIdList))).run();
	},

	async searchSuggestions(c, params, userId) {
		const { query, type, accountId } = params;
		if (!query || query.length < 1) return [];

		const searchPattern = `%${query}%`;
		const conditionList = [eq(email.userId, userId)];
		if (accountId && accountId > 0) {
			conditionList.push(eq(email.accountId, Number(accountId)));
		}

		let fieldToSelect = null;
		let results = [];
		const isFrom = ['from', 'sender_address_includes'].includes(type);
		const isTo = ['to', 'recipient_address_includes', 'email_received_for_others'].includes(type);
		const isSubject = ['subject_include', 'subject_or_body_include'].includes(type);

		if (isFrom) {
			conditionList.push(like(email.sendEmail, searchPattern));
			const list = await orm(c).select({ value: email.sendEmail }).from(email)
				.where(and(...conditionList))
				.groupBy(email.sendEmail)
				.limit(15);
			
			const extracted = list.map(item => {
				const match = (item.value || '').match(/<([^>]+)>/);
				let emailStr = match ? match[1].trim() : (item.value || '').trim();
				if (type === 'sender_address_includes') {
					const parts = emailStr.split('@');
					if (parts.length > 1) emailStr = parts[1];
				}
				return emailStr;
			});
			results = [...new Set(extracted)].filter(v => v.toLowerCase().includes(query.toLowerCase()));
		} else if (isTo) {
			conditionList.push(like(email.toEmail, searchPattern));
			const list = await orm(c).select({ value: email.toEmail }).from(email)
				.where(and(...conditionList))
				.groupBy(email.toEmail)
				.limit(15);
				
			const extracted = list.map(item => {
				const match = (item.value || '').match(/<([^>]+)>/);
				let emailStr = match ? match[1].trim() : (item.value || '').trim();
				if (type === 'recipient_address_includes') {
					const parts = emailStr.split('@');
					if (parts.length > 1) emailStr = parts[1];
				}
				return emailStr;
			});
			results = [...new Set(extracted)].filter(v => v.toLowerCase().includes(query.toLowerCase()));
		} else if (isSubject) {
			const list = await orm(c).select({ value: email.subject }).from(email)
				.where(and(...conditionList))
				.groupBy(email.subject)
				.limit(25);
			if (userId) {
				const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
				const decryptedSubjects = await Promise.all(list.map(async item => {
					try {
						const dec = await emailCryptoUtils.decryptText(item.value, cryptoKey);
						// 若解密结果依然是密文前缀，说明属于其他用户密文或解密未成功，予以安全剔除
						if (typeof dec === 'string' && dec.startsWith('enc:v1:')) return null;
						return dec;
					} catch {
						return null;
					}
				}));
				results = [...new Set(decryptedSubjects.filter(v => v && v.toLowerCase().includes(query.toLowerCase())))].slice(0, 15);
			} else {
				results = list.map(item => item.value);
			}
		}

		return results;
	},

	async getSidebarStats(c, userId) {
		const mailDb = getMailDb(c);
		const stats = await mailDb.prepare(`
			SELECT 
				SUM(CASE WHEN is_del = 0 AND is_spam = 0 AND (snoozed_time IS NULL OR send_email IN ('announcement@epocanvas.com', 'admin@epocanvas.com')) AND type = 0 AND unread = 0 THEN 1 ELSE 0 END) as inboxUnread,
				SUM(CASE WHEN is_del = 0 AND is_spam = 0 AND snoozed_time IS NULL AND type = 1 AND status = 6 AND unread = 0 THEN 1 ELSE 0 END) as draftUnread,
				SUM(CASE WHEN is_del = 0 AND is_spam = 0 AND snoozed_time IS NULL AND type = 1 AND status != 6 AND unread = 0 THEN 1 ELSE 0 END) as sentUnread,
				SUM(CASE WHEN is_del = 0 AND is_spam = 1 AND unread = 0 THEN 1 ELSE 0 END) as spamUnread,
				SUM(CASE WHEN is_del = 0 AND is_spam = 1 AND unread = 1 THEN 1 ELSE 0 END) as spamRead,
				SUM(CASE WHEN is_del = 1 AND unread = 0 THEN 1 ELSE 0 END) as trashUnread,
				SUM(CASE WHEN is_del = 1 AND unread = 1 THEN 1 ELSE 0 END) as trashRead,
				SUM(CASE WHEN is_del = 0 AND snoozed_time IS NOT NULL AND (snoozed_end_time IS NULL OR datetime(snoozed_end_time) <= datetime('now')) THEN 1 ELSE 0 END) as snoozedUrgent,
				SUM(CASE WHEN is_del = 0 AND snoozed_time IS NOT NULL AND snoozed_end_time IS NOT NULL AND datetime(snoozed_end_time) > datetime('now') THEN 1 ELSE 0 END) as snoozedWaiting,
				SUM(CASE WHEN is_del = 0 AND unread = 0 THEN 1 ELSE 0 END) as allUnread
			FROM email
			WHERE user_id = ?
		`).bind(userId).first();

		const labelEmails = await mailDb.prepare(`
			SELECT labels, unread FROM email WHERE user_id = ? AND is_del = 0 AND labels != '[]' AND labels IS NOT NULL
		`).bind(userId).all();

		const labelStats = {};
		if (labelEmails && labelEmails.results) {
			for (const row of labelEmails.results) {
				try {
					const labels = JSON.parse(row.labels);
					for (const lbl of labels) {
						if (!labelStats[lbl]) {
							labelStats[lbl] = { unread: 0, read: 0 };
						}
						if (row.unread === 0) {
							labelStats[lbl].unread++;
						} else {
							labelStats[lbl].read++;
						}
					}
				} catch (e) {}
			}
		}

		return {
			...stats,
			labelStats
		};
	},

	async getAnalytics(c, userId) {
		const result = {
			totalProcessed: 0,
			totalIntercepted: 0,
			interceptRate: '0%',
			trend: [],
			topRules: []
		};
		try {
			// Bug Fix #3: Use reliable count via .all() to avoid ambiguous column name
			const countRows = await orm(c).select({ cnt: sql`count(*) as cnt` }).from(email).where(eq(email.userId, userId)).all();
			result.totalProcessed = countRows && countRows[0] ? (countRows[0].cnt || 0) : 0;

			const allEmails = await orm(c).select({ createTime: email.createTime, labels: email.labels, isSpam: email.isSpam })
				.from(email).where(eq(email.userId, userId)).all();
				
			const trendMap = {};
			const ruleMap = {};
			const now = new Date();
			for (let i = 6; i >= 0; i--) {
				const d = new Date(now);
				d.setDate(d.getDate() - i);
				const dateStr = d.toISOString().split('T')[0];
				trendMap[dateStr] = 0;
			}
			
			let totalIntercepted = 0;
			allEmails.forEach(e => {
				// Bug Fix #2: SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" (no T).
				// new Date("2026-08-15 10:00:00") is Invalid Date in V8. Replace space with T.
				const rawTime = e.createTime ? String(e.createTime).replace(' ', 'T') : '';
				const dateObj = rawTime ? new Date(rawTime) : new Date();
				const dateStr = dateObj.toISOString().split('T')[0];
				
				let intercepted = false;
				if (e.isSpam === 1) intercepted = true;
				let labs = [];
				if (e.labels) {
					try {
						labs = JSON.parse(e.labels);
						if (Array.isArray(labs)) {
							if (labs.includes('推销') || labs.includes('垃圾')) intercepted = true;
							labs.forEach(l => {
								if (l !== '收件箱') {
									ruleMap[l] = (ruleMap[l] || 0) + 1;
								}
							});
						}
					} catch(err) {}
				}
				
				if (intercepted) totalIntercepted++;
				if (intercepted && trendMap[dateStr] !== undefined) {
					trendMap[dateStr]++;
				}
			});
			
			result.totalIntercepted = totalIntercepted;
			if (result.totalProcessed > 0) {
				result.interceptRate = ((result.totalIntercepted / result.totalProcessed) * 100).toFixed(1) + '%';
			}
			
			let maxTrend = 0;
			for (const k in trendMap) {
				if (trendMap[k] > maxTrend) maxTrend = trendMap[k];
			}
			
			for (const date in trendMap) {
				const count = trendMap[date];
				const label = date.substring(5);
				result.trend.push({
					date,
					label,
					count,
					percent: maxTrend === 0 ? 0 : Math.max(2, (count / maxTrend) * 100)
				});
			}
			
			let maxRule = 0;
			for (const k in ruleMap) {
				if (ruleMap[k] > maxRule) maxRule = ruleMap[k];
			}
			
			result.topRules = Object.keys(ruleMap).map(name => {
				return {
					name,
					count: ruleMap[name],
					percent: maxRule === 0 ? 0 : (ruleMap[name] / maxRule) * 100
				};
			}).sort((a,b) => b.count - a.count).slice(0, 5);
			
		} catch (e) {
			console.error('Analytics error:', e);
		}
		return result;
	}
};

export default emailService;
