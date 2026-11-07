import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import emailService from '../src/service/email-service.js';
import mailOutboundService from '../src/service/mail-outbound-service.js';
import settingService from '../src/service/setting-service.js';
import userService from '../src/service/user-service.js';
import roleService from '../src/service/role-service.js';
import accountService from '../src/service/account-service.js';
import attService from '../src/service/att-service.js';
import r2Service from '../src/service/r2-service.js';
import storageQuotaService from '../src/service/storage-quota-service.js';
import emailCryptoUtils from '../src/utils/email-crypto-utils.js';
import { ensureMailReliabilitySchema } from '../src/utils/mail-reliability-schema.js';
import { emailConst } from '../src/const/entity-const.js';
import { Resend } from 'resend';
import { getTableColumns } from 'drizzle-orm';
import { auditLog } from '../src/entity/audit-log.js';

// Only the local cloudflare:test D1 binding is used. Providers, object storage
// and statistics KV are mocked; every fixture is physically removed in finally.
const db = env.db;

beforeAll(async () => {
	// Exercise the real ban lookup without missing-table warnings. No audit
	// rows are inserted; column names/types come from the production entity.
	const auditColumns = Object.values(getTableColumns(auditLog))
		.map(column => `"${column.name}" ${column.getSQLType()}`);
	await db.prepare(`CREATE TABLE IF NOT EXISTS audit_log (${auditColumns.join(',')})`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS user (
		user_id INTEGER PRIMARY KEY, email TEXT, type INTEGER, status INTEGER DEFAULT 0,
		is_del INTEGER DEFAULT 0, send_count INTEGER DEFAULT 0
	)`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS account (
		account_id INTEGER PRIMARY KEY,email TEXT NOT NULL,name TEXT NOT NULL DEFAULT '',
		status INTEGER NOT NULL DEFAULT 0,latest_email_time TEXT,create_time TEXT DEFAULT CURRENT_TIMESTAMP,
		user_id INTEGER NOT NULL,all_receive INTEGER NOT NULL DEFAULT 0,sort INTEGER DEFAULT 0,is_del INTEGER DEFAULT 0
	)`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS email (
		email_id INTEGER PRIMARY KEY AUTOINCREMENT,send_email TEXT,name TEXT,
		account_id INTEGER NOT NULL,user_id INTEGER NOT NULL,subject TEXT,code TEXT NOT NULL DEFAULT '',
		text TEXT,content TEXT,cc TEXT DEFAULT '[]',bcc TEXT DEFAULT '[]',recipient TEXT,
		to_email TEXT NOT NULL DEFAULT '',to_name TEXT NOT NULL DEFAULT '',in_reply_to TEXT DEFAULT '',
		relation TEXT DEFAULT '',message_id TEXT DEFAULT '',type INTEGER NOT NULL DEFAULT 0,
		status INTEGER NOT NULL DEFAULT 0,resend_email_id TEXT,message TEXT,unread INTEGER NOT NULL DEFAULT 0,
		create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,is_del INTEGER NOT NULL DEFAULT 0,
		is_spam INTEGER NOT NULL DEFAULT 0,snoozed_time TEXT,snoozed_end_time TEXT,
		labels TEXT NOT NULL DEFAULT '[]',trashed_at TEXT,spam_at TEXT,receive_claim_key TEXT,outbound_task_id TEXT
	)`).run();
	await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_outbound_task
		ON email(outbound_task_id) WHERE outbound_task_id IS NOT NULL`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS attachments (
		att_id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,email_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL,key TEXT NOT NULL,filename TEXT,mime_type TEXT,size INTEGER,
		status TEXT NOT NULL DEFAULT 0,type INTEGER NOT NULL DEFAULT 0,disposition TEXT,related TEXT,
		content_id TEXT,encoding TEXT,create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`).run();
	await ensureMailReliabilitySchema({ env: { db } });
});

async function fixture(run, { sendLimit = 20 } = {}) {
	const userId = 970000 + Math.floor(Math.random() * 100000);
	const recipientId = userId + 100000;
	const accountId = userId;
	const sender = `sender-${userId}@local.test`;
	const recipient = `recipient-${recipientId}@local.test`;
	const objects = new Map();
	const stats = new Map();
	const c = { env: { db, EMAIL_OUTBOUND_ENABLED: 'true', kv: {
		get: vi.fn(async key => stats.get(key) ?? null),
		put: vi.fn(async (key, value) => { stats.set(key, value); })
	} }, get: () => undefined, set: () => {} };
	const setting = { send: 0, domainList: ['@local.test'], r2Domain: '', allMailMode: 1,
		noRecipient: 1, resendTokens: { 'local.test': 're_local_mock_never_sent' } };
	const role = { sendType: 'count', sendCount: sendLimit, allowAttachment: 1, availDomain: '', banEmail: '' };
	const params = { accountId, idempotencyKey: crypto.randomUUID(), name: 'Local sender',
		receiveEmail: ['recipient@example.test'], subject: 'Local outbound regression', text: 'body',
		content: '<p>body</p>', attachments: [] };
	try {
		await db.prepare('INSERT INTO user(user_id,email,type,status,is_del,send_count) VALUES (?,?,1,0,0,0),(?,?,1,0,0,0)')
			.bind(userId, sender, recipientId, recipient).run();
		await db.prepare('INSERT INTO account(account_id,email,user_id) VALUES (?,?,?),(?,?,?)')
			.bind(accountId, sender, userId, recipientId, recipient, recipientId).run();
		vi.spyOn(settingService, 'query').mockResolvedValue(setting);
		vi.spyOn(userService, 'selectById').mockImplementation(async (_c, id) => {
			const row = await db.prepare('SELECT * FROM user WHERE user_id=?').bind(id).first();
			return row && { userId: row.user_id, email: row.email, type: row.type, status: row.status, sendCount: row.send_count };
		});
		vi.spyOn(userService, 'getUserQuota').mockResolvedValue({ maxStorageBytes: 5 * 1024 * 1024, maxEmails: 5000, byoStorageEnabled: 0 });
		vi.spyOn(userService, 'selectByIdIncludeDel').mockImplementation(async (_c, id) => {
			const row = await db.prepare('SELECT * FROM user WHERE user_id=?').bind(id).first();
			return row && { userId: row.user_id, email: row.email, type: row.type, status: row.status, isDel: row.is_del };
		});
		vi.spyOn(r2Service, 'resolveStorage').mockResolvedValue({ type: 'KV', config: null });
		vi.spyOn(roleService, 'selectById').mockResolvedValue(role);
		vi.spyOn(roleService, 'selectByUserIds').mockResolvedValue([{ ...role, userId: recipientId }]);
		vi.spyOn(roleService, 'hasAvailDomainPerm').mockReturnValue(true);
		vi.spyOn(roleService, 'isBanEmail').mockReturnValue(false);
		vi.spyOn(accountService, 'selectById').mockResolvedValue({ accountId, userId, email: sender, status: 0 });
		vi.spyOn(emailCryptoUtils, 'shouldEncryptEmail').mockReturnValue(false);
		vi.spyOn(storageQuotaService, 'checkQuotaAvailable').mockResolvedValue({ allowed: true,
			usage: { byoStorageEnabled: 0, quotaBytes: 5 * 1024 * 1024, isVisitor: false } });
		vi.spyOn(storageQuotaService, 'checkAttachmentSizeLimit').mockResolvedValue({ allowed: true });
		vi.spyOn(r2Service, 'putObj').mockImplementation(async (_c, key, bytes) => { objects.set(key, bytes); });
		vi.spyOn(r2Service, 'getObj').mockImplementation(async (_c, key) => objects.has(key) ? new Response(objects.get(key)) : null);
		vi.spyOn(r2Service, 'delete').mockImplementation(async (_c, key) => { objects.delete(key); });
		vi.spyOn(emailService, 'sendByCloudflareEmail').mockRejectedValue(new Error('Unexpected Cloudflare provider call'));
		const provider = vi.spyOn(emailService, 'sendByResend').mockResolvedValue({ data: { id: 'local-accepted' }, error: null });
		const replay = vi.spyOn(emailService, 'replayProviderEventsFromLedger').mockResolvedValue(0);
		const task = () => db.prepare('SELECT * FROM mail_outbound_task WHERE user_id=? AND idempotency_key=?').bind(userId, params.idempotencyKey).first();
		const count = async () => (await db.prepare('SELECT send_count AS n FROM user WHERE user_id=?').bind(userId).first()).n;
		await run({ c, params, userId, recipientId, recipient, objects, stats, provider, replay, task, count });
	} finally {
		vi.restoreAllMocks();
		try {
			await db.prepare('DELETE FROM attachments WHERE user_id IN (?,?)').bind(userId, recipientId).run();
			await db.prepare('DELETE FROM email WHERE user_id IN (?,?)').bind(userId, recipientId).run();
			await db.prepare('DELETE FROM mail_send_quota_reservation WHERE user_id IN (?,?)').bind(userId, recipientId).run();
			await db.prepare('DELETE FROM mail_local_delivery WHERE task_id IN (SELECT task_id FROM mail_outbound_task WHERE user_id IN (?,?))').bind(userId, recipientId).run();
			await db.prepare('DELETE FROM object_deletion_queue WHERE user_id IN (?,?)').bind(userId, recipientId).run();
			await db.prepare('DELETE FROM mail_outbound_task WHERE user_id IN (?,?)').bind(userId, recipientId).run();
			await db.prepare('DELETE FROM account WHERE user_id IN (?,?)').bind(userId, recipientId).run();
			await db.prepare('DELETE FROM user WHERE user_id IN (?,?)').bind(userId, recipientId).run();
		} finally { objects.clear(); stats.clear(); }
	}
}

const attachment = { filename: 'local.txt', type: 'text/plain', content: btoa('local attachment') };
const imageContent = '<p>body<img src="data:image/png;base64,AQIDBA=="></p>';

describe('Outbound send integration and replay', () => {
	it('passes the server task key through Resend options without a network request', async () => {
		const post = vi.spyOn(Resend.prototype, 'post').mockResolvedValue({ data: { id: 'local-sdk-accepted' }, error: null });
		try {
			await emailService.sendByResend('re_local_mock_never_sent', {
				name: 'Local sender', accountEmail: 'sender@local.test', receiveEmail: ['recipient@example.test'],
				subject: 'Local SDK boundary', text: 'body', html: '<p>body</p>', attachments: [],
				idempotencyKey: 'mail-local-server-task'
			});
			expect(post).toHaveBeenCalledTimes(1);
			expect(post).toHaveBeenCalledWith('/emails', expect.any(Object), expect.objectContaining({ idempotencyKey: 'mail-local-server-task' }));
		} finally { post.mockRestore(); }
	});

	it('persists sender and all attachments before exactly one CID-preserving provider call, then replays events', async () => {
		await fixture(async ({ c, params, userId, provider, objects, replay, task, count }) => {
			params.content = imageContent;
			params.attachments = [{ ...attachment }];
			provider.mockImplementation(async (_token, form) => {
				const current = await task();
				expect(current.state).toBe('SENDING');
				const row = await db.prepare('SELECT * FROM email WHERE email_id=?').bind(current.email_id).first();
				expect(row.status).toBe(emailConst.status.SAVING);
				expect(row.content).toContain('{{domain}}attachments/');
				expect(form.html).toContain('cid:');
				expect(form.html).not.toContain('{{domain}}');
				const inline = form.attachments.find(item => item.contentId);
				expect(form.html).toContain(`cid:${inline.contentId.replace(/^<|>$/g, '')}`);
				const stored = await db.prepare('SELECT key FROM attachments WHERE email_id=?').bind(current.email_id).all();
				expect(stored.results).toHaveLength(2);
				for (const item of stored.results) expect(objects.has(item.key)).toBe(true);
				expect(form.idempotencyKey).toBeTruthy();
				return { data: { id: 'local-accepted' }, error: null };
			});
			replay.mockImplementation(async () => {
				await db.prepare('UPDATE email SET status=? WHERE user_id=?').bind(emailConst.status.BOUNCED, userId).run();
			});
			const sent = await emailService.send(c, structuredClone(params), userId);
			expect(sent[0].status).toBe(emailConst.status.BOUNCED);
			expect(sent[0].attList).toHaveLength(1);
			expect(provider).toHaveBeenCalledTimes(1);
			expect((await task()).state).toBe('ACCEPTED');
			expect((await task()).reserved_bytes).toBe(0);
			expect(await count()).toBe(1);
		});
	});

	it('replays ACCEPTED at the send limit without dispatching or counting twice', async () => {
		await fixture(async ({ c, params, userId, provider, count }) => {
			const first = await emailService.send(c, structuredClone(params), userId);
			const second = await emailService.send(c, structuredClone(params), userId);
			expect(second[0].emailId).toBe(first[0].emailId);
			expect(provider).toHaveBeenCalledTimes(1);
			expect(await count()).toBe(1);
			expect(c.env.kv.put).toHaveBeenCalledTimes(1);
		}, { sendLimit: 1 });
	});

	it('keeps the same image request identity when generated CID and filename change', async () => {
		await fixture(async ({ c, params, userId, provider }) => {
			params.content = imageContent;
			const original = attService.toImageUrlHtml.bind(attService);
			let conversion = 0;
			vi.spyOn(attService, 'toImageUrlHtml').mockImplementation(async (...args) => {
				const result = await original(...args);
				for (const item of result.imageDataList) item.filename = `image_${++conversion}.png`;
				return result;
			});
			const first = await emailService.send(c, structuredClone(params), userId);
			const second = await emailService.send(c, structuredClone(params), userId);
			expect(second[0].emailId).toBe(first[0].emailId);
			expect(provider).toHaveBeenCalledTimes(1);
		});
	});

	it('blocks dispatch and send-count reservation when attachment upload fails', async () => {
		await fixture(async ({ c, params, userId, provider, count }) => {
			params.attachments = [{ ...attachment }];
			r2Service.putObj.mockRejectedValueOnce(new Error('Local injected object failure'));
			await expect(emailService.send(c, params, userId)).rejects.toThrow('object failure');
			expect(provider).not.toHaveBeenCalled();
			expect(await count()).toBe(0);
			expect((await db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE user_id=?').bind(userId).first()).n).toBe(0);
		});
	});

	it.each(['network', '5xx'])('retains UNKNOWN and reserved send count after %s ambiguity without redispatch', async kind => {
		await fixture(async ({ c, params, userId, provider, task, count }) => {
			if (kind === 'network') provider.mockRejectedValueOnce(new Error('Local injected timeout'));
			else provider.mockResolvedValueOnce({ data: null, error: { statusCode: 502, name: 'application_error', message: 'Local upstream failure' } });
			await expect(emailService.send(c, structuredClone(params), userId)).rejects.toMatchObject({ errorCode: 'provider_unknown' });
			expect((await task()).state).toBe('UNKNOWN');
			expect(await count()).toBe(1);
			await expect(emailService.send(c, structuredClone(params), userId)).rejects.toMatchObject({ errorCode: 'provider_unknown' });
			expect(provider).toHaveBeenCalledTimes(1);
			expect(await count()).toBe(1);
		});
	});

	it('releases send count after a definitive rejection and does not retry the failed key', async () => {
		await fixture(async ({ c, params, userId, provider, task, count }) => {
			provider.mockResolvedValueOnce({ data: null, error: { statusCode: 422, name: 'validation_error', message: 'Local rejected request' } });
			await expect(emailService.send(c, structuredClone(params), userId)).rejects.toMatchObject({ errorCode: 'provider_rejected' });
			expect((await task()).state).toBe('FAILED');
			expect(await count()).toBe(0);
			await expect(emailService.send(c, structuredClone(params), userId)).rejects.toMatchObject({ errorCode: 'outbound_task_failed' });
			expect(provider).toHaveBeenCalledTimes(1);
		});
	});

	it('delivers internal mail and embedded attachment ownership once without copying the outbound unique key', async () => {
		await fixture(async ({ c, params, userId, recipientId, recipient, provider }) => {
			params.receiveEmail = [recipient];
			params.content = imageContent;
			params.attachments = [{ ...attachment }];
			const first = await emailService.send(c, structuredClone(params), userId);
			await emailService.send(c, structuredClone(params), userId);
			expect(provider).not.toHaveBeenCalled();
			expect(first[0].status).toBe(emailConst.status.DELIVERED);
			const inbox = await db.prepare('SELECT * FROM email WHERE user_id=?').bind(recipientId).all();
			expect(inbox.results).toHaveLength(1);
			expect(inbox.results[0].outbound_task_id).toBeNull();
			const stored = await db.prepare('SELECT * FROM attachments WHERE user_id=?').bind(recipientId).all();
			expect(stored.results).toHaveLength(2);
		});
	});

	it('never dispatches twice when the same key arrives while its provider is pending', async () => {
		await fixture(async ({ c, params, userId, provider, count }) => {
			let signalStarted;
			let finish;
			const started = new Promise(resolve => { signalStarted = resolve; });
			const pending = new Promise(resolve => { finish = resolve; });
			provider.mockImplementation(async () => { signalStarted(); return pending; });
			const first = emailService.send(c, structuredClone(params), userId);
			try {
				// A failure before dispatch must reject this wait rather than hang it.
				await Promise.race([started, first.then(() => { throw new Error('Provider was not held'); })]);
				await expect(emailService.send(c, structuredClone(params), userId)).rejects.toMatchObject({ errorCode: 'provider_unknown' });
			} finally {
				finish({ data: { id: 'local-pending-accepted' }, error: null });
				await first;
			}
			expect(provider).toHaveBeenCalledTimes(1);
			expect(await count()).toBe(1);
		});
	});
});
