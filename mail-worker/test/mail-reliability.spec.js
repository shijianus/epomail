import { env, fetchMock } from 'cloudflare:test';
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { ensureMailReliabilitySchema } from '../src/utils/mail-reliability-schema.js';
import { getMailDb } from '../src/utils/db-accessor.js';
import emailService from '../src/service/email-service.js';
import { cascadeDeleteEmails } from '../src/service/mail-lifecycle-service.js';
import attService from '../src/service/att-service.js';
import r2Service from '../src/service/r2-service.js';
import { acquireInboundClaim, failInboundClaim, reserveInboundQuota, cleanupExpiredInboundClaims, getInboundRawMaxBytes, inboundContentSha256 } from '../src/service/mail-reliability-service.js';
import mailOutboundService from '../src/service/mail-outbound-service.js';
import { assertMailRowSize, buildBoundedInserts } from '../src/utils/mail-pipeline.js';
import { mailOrm } from '../src/entity/orm.js';
import { att } from '../src/entity/att.js';
import { email as handleInbound } from '../src/email/email.js';
import accountService from '../src/service/account-service.js';
import settingService from '../src/service/setting-service.js';
import userService from '../src/service/user-service.js';
import roleService from '../src/service/role-service.js';
import storageQuotaService from '../src/service/storage-quota-service.js';
import telegramService from '../src/service/telegram-service.js';
import aiService from '../src/service/ai-service.js';
import PostalMime from 'postal-mime';
import { emailConst, settingConst } from '../src/const/entity-const.js';
import { mailSha256 } from '../src/utils/mail-pipeline.js';

const c = { env: { ...env, email_enc_key: 'local-only-mail-recovery-test-key-not-live' } };
const db = getMailDb(c);
const encoder = new TextEncoder();

async function clean(keys, ids = []) {
	for (const id of ids) {
		await db.prepare('DELETE FROM attachments WHERE email_id = ?').bind(id).run();
		await db.prepare('DELETE FROM email WHERE email_id = ?').bind(id).run();
	}
	for (const key of keys) {
		const rows = await db.prepare('SELECT email_id FROM email WHERE receive_claim_key = ?').bind(key).all();
		for (const row of rows.results || []) {
			await db.prepare('DELETE FROM attachments WHERE email_id = ?').bind(row.email_id).run();
			await db.prepare('DELETE FROM email WHERE email_id = ?').bind(row.email_id).run();
		}
		await db.prepare('DELETE FROM mail_receive_claim WHERE claim_key = ?').bind(key).run();
	}
}

function objects() {
	const store = new Map();
	vi.spyOn(r2Service, 'resolveStorage').mockResolvedValue({ type: 'KV', config: null });
	vi.spyOn(r2Service, 'putObj').mockImplementation(async (_c, key, value) => { store.set(key, value); });
	vi.spyOn(r2Service, 'getObj').mockImplementation(async (_c, key) => store.has(key) ? new Response(store.get(key)) : null);
	vi.spyOn(r2Service, 'delete').mockImplementation(async (_c, key) => { store.delete(key); });
	vi.spyOn(r2Service, 'putInboundRawObj').mockImplementation(async (_c, key, value) => { store.set(key, value); });
	vi.spyOn(r2Service, 'getInboundRawObj').mockImplementation(async (_c, key) => store.has(key) ? new Response(store.get(key)) : null);
	vi.spyOn(r2Service, 'deleteInboundRawObj').mockImplementation(async (_c, key) => { store.delete(key); });
	return store;
}

async function seedSaving(claim) {
	const result = await db.prepare(`INSERT INTO email
		(account_id,user_id,subject,text,content,status,receive_claim_key)
		VALUES (0,0,'local mail test','body','<p>body</p>',6,?)`).bind(claim.claimKey).run();
	return result.meta.last_row_id;
}

function attachments(n, emailId = 0) {
	return Array.from({ length: n }, (_, i) => ({
		userId: 0, accountId: 0, emailId,
		key: `attachments/local-reliability-${crypto.randomUUID()}-${i}.bin`,
		filename: `${i}.bin`, mimeType: 'application/octet-stream', size: 3,
		content: new Uint8Array([1, 2, 3]), type: i % 2,
		contentId: i % 2 ? `<cid-${i}>` : null,
		disposition: null, related: null, encoding: null
	}));
}

beforeAll(async () => {
	await db.prepare(`CREATE TABLE IF NOT EXISTS email (
		is_official INTEGER NOT NULL DEFAULT 0,
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
	await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_receive_claim_key ON email(receive_claim_key) WHERE receive_claim_key IS NOT NULL`).run();
	await db.prepare('CREATE TABLE IF NOT EXISTS star (email_id INTEGER NOT NULL, user_id INTEGER NOT NULL)').run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS attachments (
		att_id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,email_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL,key TEXT NOT NULL,filename TEXT,mime_type TEXT,size INTEGER,
		status TEXT NOT NULL DEFAULT 0,type INTEGER NOT NULL DEFAULT 0,disposition TEXT,related TEXT,
		content_id TEXT,encoding TEXT,create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`).run();
		await db.prepare(`CREATE TABLE IF NOT EXISTS object_deletion_queue (
			id INTEGER PRIMARY KEY AUTOINCREMENT,object_key TEXT NOT NULL,user_id INTEGER NOT NULL DEFAULT 0,
			attempts INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'pending',last_error TEXT,
			next_retry_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(object_key,user_id)
		)`).run();
		await ensureMailReliabilitySchema(c);
});

afterEach(() => vi.restoreAllMocks());

function inboundMime(recipient, { id = '<handler@local.test>', subject = 'Local inbound', body = '正文 body', files = 0, trace = '' } = {}) {
	const headers = [trace, 'From: Local Sender <sender@local.test>', `To: ${recipient}`,
		`Subject: ${subject}`, ...(id ? [`Message-ID: ${id}`] : []), 'MIME-Version: 1.0'].filter(Boolean);
	if (!files) return encoder.encode([...headers, 'Content-Type: text/plain; charset=UTF-8', '', body].join('\r\n'));
	return encoder.encode([...headers, 'Content-Type: multipart/mixed; boundary="local-boundary"', '',
		'--local-boundary', 'Content-Type: text/plain; charset=UTF-8', '', body,
		...Array.from({ length: files }, (_, index) => [
			'--local-boundary', `Content-Type: application/octet-stream; name="part-${index}.bin"`,
			`Content-Disposition: attachment; filename="part-${index}.bin"`,
			'Content-Transfer-Encoding: base64', '', 'AP9BQkM='
		].join('\r\n')), '--local-boundary--', ''].join('\r\n'));
}

async function handlerFixture(run) {
	const userId = 10000000 + Math.floor(Math.random() * 1000000000);
	const recipient = `${crypto.randomUUID()}@local.test`;
	const store = objects();
	const profile = new Map();
	const localEnv = { ...c.env, admin: 'admin@local.test', domain: ['local.test'], kv: {
		get: vi.fn(async (key, options) => {
			const value = profile.get(key) ?? null;
			return options?.type === 'json' && typeof value === 'string' ? JSON.parse(value) : value;
		}),
		put: vi.fn(async (key, value) => { profile.set(key, value); }),
		delete: vi.fn(async key => { profile.delete(key); })
	} };
	const settings = { receive: settingConst.receive.OPEN, noRecipient: settingConst.noRecipient.CLOSE,
		tgBotStatus: settingConst.tgBotStatus.CLOSE, forwardStatus: settingConst.forwardStatus.CLOSE,
		ruleType: settingConst.ruleType.ALL, allMailMode: 1, blackSubject: '', blackContent: '', blackFrom: '',
		r2Domain: '', userTgForward: 0, userEmailForward: 0, aiCode: 1 };
	const owner = { userId, email: recipient, isDel: 0, status: 0, customLabels: '[]' };
	const account = { accountId: userId, userId, email: recipient, isDel: 0, status: 0 };
	const quota = { maxEmails: 100, maxStorageMB: 10, maxStorageBytes: 10 * 1024 * 1024,
		bypassStorage: false, byoStorageEnabled: 0, quotaStorageBlocked: false, isVisitor: false };
	const forwards = [];
	try {
		vi.spyOn(settingService, 'query').mockResolvedValue(settings);
		vi.spyOn(accountService, 'selectByEmailIncludeDel').mockResolvedValue(account);
		vi.spyOn(userService, 'selectByIdIncludeDel').mockResolvedValue(owner);
		vi.spyOn(userService, 'getUserQuota').mockResolvedValue(quota);
		vi.spyOn(roleService, 'selectByUserId').mockResolvedValue({ banEmail: '', availDomain: '' });
		vi.spyOn(roleService, 'hasAvailDomainPerm').mockReturnValue(true);
		vi.spyOn(roleService, 'isBanEmail').mockReturnValue(false);
		vi.spyOn(storageQuotaService, 'checkAttachmentSizeLimit').mockResolvedValue({ allowed: true });
		const ai = vi.spyOn(aiService, 'extractCode').mockResolvedValue('驗證碼');
		const tg = vi.spyOn(telegramService, 'sendEmailToBot').mockResolvedValue(undefined);
		vi.spyOn(telegramService, 'sendPersonalEmailToBot').mockResolvedValue(undefined);
		vi.spyOn(emailService, 'send').mockResolvedValue(undefined);
		vi.spyOn(emailService, 'sendByCloudflareEmail').mockRejectedValue(new Error('Unexpected local-only provider call'));
		vi.spyOn(emailService, 'sendByResend').mockRejectedValue(new Error('Unexpected local-only provider call'));
		const receive = vi.spyOn(emailService, 'receive');
		const publish = vi.spyOn(emailService, 'completeInboundReceive');
		const message = (bytes = inboundMime(recipient), to = recipient) => {
			const forward = vi.fn().mockResolvedValue(undefined);
			forwards.push(forward);
			return { to, from: 'sender@local.test', raw: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
				setReject: vi.fn(), forward };
		};
		const rows = () => db.prepare('SELECT * FROM email WHERE user_id=? ORDER BY email_id').bind(userId).all();
		const claims = () => db.prepare('SELECT * FROM mail_receive_claim WHERE user_id=? ORDER BY created_at').bind(userId).all();
		await run({ localEnv, recipient, userId, store, profile, settings, owner, account, quota, message, rows, claims, ai, tg, receive, publish, forwards });
	} finally {
		try {
			await db.prepare('DELETE FROM attachments WHERE user_id=? OR email_id IN (SELECT email_id FROM email WHERE receive_claim_key IN (SELECT claim_key FROM mail_receive_claim WHERE recipient=?))').bind(userId, recipient).run();
			await db.prepare('DELETE FROM email WHERE user_id=? OR receive_claim_key IN (SELECT claim_key FROM mail_receive_claim WHERE recipient=?)').bind(userId, recipient).run();
			await db.prepare('DELETE FROM mail_receive_claim WHERE user_id=? OR recipient=?').bind(userId, recipient).run();
			await db.prepare('DELETE FROM object_deletion_queue WHERE user_id=?').bind(userId).run();
		} finally { store.clear(); profile.clear(); vi.restoreAllMocks(); }
	}
}

describe('Production inbound email handler with local D1 and stubbed providers', () => {
	it.each(['account-deleted', 'account-disabled', 'owner-deleted', 'owner-disabled', 'unknown-recipient', 'missing-from'])('rejects %s before claim, AI, persistence or forwarding', async (reason) => {
		await handlerFixture(async ({ localEnv, account, owner, recipient, message, claims, rows, ai, receive, publish }) => {
			if (reason === 'account-deleted') account.isDel = 1;
			if (reason === 'account-disabled') account.status = 1;
			if (reason === 'owner-deleted') owner.isDel = 1;
			if (reason === 'owner-disabled') owner.status = 1;
			if (reason === 'unknown-recipient') accountService.selectByEmailIncludeDel.mockResolvedValue(null);
			const incoming = message(reason === 'missing-from' ? encoder.encode('Subject: no sender\r\n\r\nbody') : inboundMime(recipient));
			await handleInbound(incoming, localEnv, {});
			expect(incoming.setReject).toHaveBeenCalledOnce();
			expect((await claims()).results).toHaveLength(0);
			expect((await rows()).results).toHaveLength(0);
			expect(ai).not.toHaveBeenCalled(); expect(receive).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
			expect(incoming.forward).not.toHaveBeenCalled();
		});
	});

	it('rejects malformed MIME and excessive attachments through the actual handler', async () => {
		await handlerFixture(async ({ localEnv, recipient, message, claims, ai, receive }) => {
			vi.spyOn(PostalMime, 'parse').mockRejectedValueOnce(new Error('local malformed MIME'));
			const malformed = message();
			await handleInbound(malformed, localEnv, {});
			expect(malformed.setReject).toHaveBeenCalledWith('Malformed message');
			const excessive = message(inboundMime(recipient, { files: 201 }));
			await handleInbound(excessive, localEnv, {});
			expect(excessive.setReject).toHaveBeenCalledWith('Too many attachments (max 200)');
			expect((await claims()).results).toHaveLength(0);
			expect(ai).not.toHaveBeenCalled(); expect(receive).not.toHaveBeenCalled();
		});
	});

	it('cancels an over-limit raw stream before parsing, raw storage or AI', async () => {
		await handlerFixture(async ({ localEnv, recipient, claims, ai, receive }) => {
			const chunk = new Uint8Array(1024 * 1024);
			const cancel = vi.fn();
			const parse = vi.spyOn(PostalMime, 'parse');
			let reads = 0;
			const incoming = { to: recipient, setReject: vi.fn(), forward: vi.fn(), raw: new ReadableStream({
				pull(controller) { reads++; controller.enqueue(chunk); }, cancel
			}, { highWaterMark: 0 }) };
			await handleInbound(incoming, localEnv, {});
			expect(incoming.setReject).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledOnce();
			expect(reads).toBe(25); expect(incoming.raw.locked).toBe(false);
			expect(parse).not.toHaveBeenCalled(); expect(ai).not.toHaveBeenCalled(); expect(receive).not.toHaveBeenCalled();
			expect(r2Service.putInboundRawObj).not.toHaveBeenCalled(); expect((await claims()).results).toHaveLength(0);
		});
	});

	it('preserves binary attachments and delivers a trace-only duplicate once', async () => {
		await handlerFixture(async ({ localEnv, recipient, settings, message, rows, claims, ai, tg, store, publish }) => {
			settings.tgBotStatus = settingConst.tgBotStatus.OPEN; settings.tgChatId = 'local-stub';
			settings.forwardStatus = settingConst.forwardStatus.OPEN; settings.forwardEmail = 'local-forward@local.test';
			localEnv.EMAIL_OUTBOUND_ENABLED = 'true';
			localEnv.OUTBOUND_WHITELIST = settings.forwardEmail;
			const first = message(inboundMime(recipient, { files: 2 }));
			await handleInbound(first, localEnv, {});
			expect(first.setReject).not.toHaveBeenCalled(); expect(first.forward).toHaveBeenCalledOnce();
			const firstRow = (await rows()).results[0];
			expect(firstRow.status).toBe(emailConst.status.RECEIVE);
			const storedAttachments = await db.prepare('SELECT key FROM attachments WHERE email_id=?').bind(firstRow.email_id).all();
			expect(storedAttachments.results).toHaveLength(2);
			expect(new Set(storedAttachments.results.map(item => item.key)).size).toBe(2);
			for (const item of storedAttachments.results) expect(Array.from(store.get(item.key))).toEqual([0, 255, 65, 66, 67]);
			const replay = message(inboundMime(recipient, { files: 2, trace: 'Received: retried hop\r\nReturn-Path: <sender@local.test>' }));
			await handleInbound(replay, localEnv, {});
			expect(replay.setReject).not.toHaveBeenCalled(); expect(replay.forward).not.toHaveBeenCalled();
			expect((await rows()).results).toHaveLength(1); expect((await claims()).results[0].state).toBe('COMPLETE');
			expect(ai).toHaveBeenCalledOnce(); expect(tg).toHaveBeenCalledOnce(); expect(publish).toHaveBeenCalledOnce();
			expect(r2Service.putInboundRawObj).toHaveBeenCalledOnce();
			await expect(handleInbound(message(inboundMime(recipient, { files: 2, body: 'different body' })), localEnv, {})).rejects.toMatchObject({ code: 'inbound_content_conflict' });
			expect((await rows()).results).toHaveLength(1);
		});
	});

	it('stores inbound mail without dispatching native forwards when outbound is disabled', async () => {
		await handlerFixture(async ({ localEnv, userId, settings, profile, message, rows }) => {
			settings.forwardStatus = settingConst.forwardStatus.OPEN;
			settings.forwardEmail = 'system-forward@external.test';
			settings.userEmailForward = 1;
			profile.set(`USER_PROFILE_${userId}`, JSON.stringify({ personalForwarding: {
				enabled: true, mode: 'all', targets: 'personal-forward@external.test'
			} }));
			const incoming = message();
			await handleInbound(incoming, localEnv, {});
			expect(incoming.forward).not.toHaveBeenCalled();
			expect(emailService.send).not.toHaveBeenCalled();
			expect((await rows()).results).toHaveLength(1);
		});
	});

	it.each(['<three-deliveries@local.test>', ''])('deduplicates each delivery generation after repeated deletion (%s)', async (id) => {
		await handlerFixture(async ({ localEnv, recipient, userId, message, rows, claims, publish }) => {
			const deliver = (trace = '') => handleInbound(message(inboundMime(recipient, { id, trace })), localEnv, {});
			const generations = [];
			for (let generation = 0; generation < 3; generation++) {
				await deliver();
				const [row] = (await rows()).results;
				expect(row).toBeDefined();
				generations.push(row.receive_claim_key);
				await deliver('Received: retry');
				expect((await rows()).results.map(mail => mail.email_id)).toEqual([row.email_id]);
				if (generation !== 2) {
					expect(await cascadeDeleteEmails({ env: localEnv }, userId, [row.email_id])).toHaveLength(1);
				}
				if (generation === 1) {
					// A pre-upgrade reissue has no stored generation number.
					await db.prepare('UPDATE mail_receive_claim SET generation = 0 WHERE claim_key = ?').bind(row.receive_claim_key).run();
				}
			}
			expect(new Set(generations).size).toBe(3);
			expect((await claims()).results).toHaveLength(3);
			expect(publish).toHaveBeenCalledTimes(3);
		});
	});

	it('never conflates distinct envelope recipients sharing the same Message-ID', async () => {
		await handlerFixture(async ({ localEnv, recipient, account, owner, message, rows, store }) => {
			const raw = inboundMime(recipient, { files: 1 });
			await handleInbound(message(raw), localEnv, {});
			const other = `other-${recipient}`;
			account.email = other; owner.email = other;
			await handleInbound(message(raw, other), localEnv, {});
			expect((await rows()).results).toHaveLength(2);
			const keys = Array.from(store.keys()).filter(key => !key.startsWith('attachments/mail-raw-'));
			expect(new Set(keys).size).toBe(2);
		});
	});

	it.each(['raw-put', 'attachment-put', 'd1-publish'])('propagates %s failure, preserves recovery and completes the same email on retry', async (failure) => {
		await handlerFixture(async ({ localEnv, recipient, userId, store, message, rows, claims, publish }) => {
			const raw = inboundMime(recipient, { files: 2 });
			if (failure === 'raw-put') r2Service.putInboundRawObj.mockRejectedValueOnce(new Error('local raw PUT failure'));
			if (failure === 'attachment-put') {
				r2Service.putObj.mockImplementationOnce(async (_c, key, value) => { store.set(key, value); })
					.mockRejectedValueOnce(new Error('local attachment PUT failure'));
			}
			if (failure === 'd1-publish') {
				let inject = true;
				localEnv.MAIL_DB = new Proxy(db, { get(target, property) {
					if (property === 'batch') return statements => {
						if (!inject) return target.batch(statements);
						inject = false;
						return target.batch([...statements, target.prepare('INSERT INTO attachments(user_id,email_id,account_id,key) VALUES (NULL,NULL,NULL,NULL)')]);
					};
					return typeof target[property] === 'function' ? target[property].bind(target) : target[property];
				} });
			}
			const first = message(raw);
			await expect(handleInbound(first, localEnv, {})).rejects.toThrow();
			expect(first.setReject).not.toHaveBeenCalled(); expect(first.forward).not.toHaveBeenCalled();
			const failed = (await claims()).results[0];
			expect(failed).toMatchObject({ state: 'FAILED', lease_until: 0, reserved_bytes: 0, reserved_count: 0 });
			const incomplete = (await rows()).results;
			expect(incomplete.every(row => row.status === emailConst.status.SAVING)).toBe(true);
			expect((await db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE user_id=?').bind(userId).first()).n).toBe(0);
			expect(Array.from(store.keys()).every(key => key.startsWith('attachments/mail-raw-'))).toBe(true);
			if (failure !== 'd1-publish') expect(publish).not.toHaveBeenCalled();
			await handleInbound(message(raw), localEnv, {});
			const completed = (await rows()).results;
			expect(completed).toHaveLength(1); expect(completed[0].status).toBe(emailConst.status.RECEIVE);
			if (incomplete.length) expect(completed[0].email_id).toBe(incomplete[0].email_id);
			expect((await claims()).results[0].state).toBe('COMPLETE');
			expect((await db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE user_id=?').bind(userId).first()).n).toBe(2);
		});
	});

	it('refuses a stale handler publication after attachment staging loses its lease', async () => {
		await handlerFixture(async ({ localEnv, recipient, store, message, rows, claims }) => {
			r2Service.putObj.mockImplementationOnce(async (_c, key, value) => {
				store.set(key, value);
				const claim = (await claims()).results[0];
				await db.prepare('UPDATE mail_receive_claim SET lease_until=0 WHERE claim_key=?').bind(claim.claim_key).run();
			});
			const incoming = message(inboundMime(recipient, { files: 1 }));
			await expect(handleInbound(incoming, localEnv, {})).rejects.toThrow();
			expect(incoming.setReject).not.toHaveBeenCalled(); expect(incoming.forward).not.toHaveBeenCalled();
			expect((await rows()).results[0].status).toBe(emailConst.status.SAVING);
			expect((await claims()).results[0].state).toBe('FAILED');
			expect(Array.from(store.keys()).every(key => key.startsWith('attachments/mail-raw-'))).toBe(true);
		});
	});

	it('rejects authenticated raw corruption on handler recovery without overwriting the evidence', async () => {
		await handlerFixture(async ({ localEnv, recipient, store, message, claims, publish }) => {
			const raw = inboundMime(recipient, { files: 1 });
			r2Service.putObj.mockRejectedValueOnce(new Error('local staging failure'));
			await expect(handleInbound(message(raw), localEnv, {})).rejects.toThrow('local staging failure');
			const claim = (await claims()).results[0];
			const encrypted = store.get(claim.raw_object_key).slice();
			encrypted[encrypted.length - 1] ^= 1;
			store.set(claim.raw_object_key, encrypted);
			await expect(handleInbound(message(raw), localEnv, {})).rejects.toThrow();
			expect(store.get(claim.raw_object_key)).toBe(encrypted);
			expect(r2Service.putInboundRawObj).toHaveBeenCalledOnce(); expect(publish).not.toHaveBeenCalled();
			expect((await claims()).results[0].state).toBe('FAILED');
		});
	});

	it('enforces full byte usage including encrypted subject/code and trash before staging attachments', async () => {
		await handlerFixture(async ({ localEnv, recipient, settings, userId, quota, message, rows, claims }) => {
			settings.allMailMode = 2;
			await db.prepare(`INSERT INTO email(account_id,user_id,subject,text,content,code,status,is_del) VALUES (?,?,'主','','','碼',0,1)`).bind(userId, userId).run();
			quota.maxStorageBytes = 7;
			const raw = inboundMime(recipient, { files: 1 });
			await expect(handleInbound(message(raw), localEnv, {})).rejects.toMatchObject({ code: 'inbound_quota_exceeded' });
			expect(r2Service.putObj).not.toHaveBeenCalled();
			const saving = (await rows()).results.find(row => row.status === emailConst.status.SAVING);
			expect(saving).toBeUndefined();
			expect((await rows()).results).toHaveLength(1);
			quota.maxStorageBytes = 1024 * 1024;
			await handleInbound(message(raw), localEnv, {});
			const received = (await rows()).results.find(row => row.status === emailConst.status.RECEIVE && row.is_del === 0);
			expect(received.subject).toMatch(/^enc:v1:/); expect(received.code).toMatch(/^enc:v1:/);
			expect((await claims()).results[0].state).toBe('COMPLETE');
			expect((await rows()).results).toHaveLength(2);
		});
	});

	it.each(['byo-count', 'visitor-zero', 'unknown-quota'])('fails closed for %s without bypassing mailbox count or uploading attachments', async (kind) => {
		await handlerFixture(async ({ localEnv, recipient, userId, quota, message, claims }) => {
			if (kind === 'byo-count') {
				quota.bypassStorage = true; quota.byoStorageEnabled = 1; quota.maxStorageBytes = 1; quota.maxEmails = 1;
				await db.prepare(`INSERT INTO email(account_id,user_id,subject,status,is_del) VALUES (?,?,'trash counts',0,1)`).bind(userId, userId).run();
			} else if (kind === 'visitor-zero') {
				quota.maxStorageBytes = 0; quota.isVisitor = true; quota.quotaStorageBlocked = true;
			} else {
				userService.getUserQuota.mockRejectedValueOnce(new Error('local quota unavailable'));
			}
			const incoming = message(inboundMime(recipient, { files: 1 }));
			await expect(handleInbound(incoming, localEnv, {})).rejects.toThrow();
			expect(incoming.forward).not.toHaveBeenCalled(); expect(r2Service.putObj).not.toHaveBeenCalled();
			expect((await claims()).results[0].state).toBe('FAILED');
		});
	});

	it('honors zero as unlimited storage for a nonvisitor while keeping count CAS', async () => {
		await handlerFixture(async ({ localEnv, recipient, quota, message, rows }) => {
			quota.maxStorageBytes = 0; quota.maxStorageMB = 0; quota.maxEmails = 1;
			await handleInbound(message(inboundMime(recipient, { files: 1 })), localEnv, {});
			expect((await rows()).results[0].status).toBe(emailConst.status.RECEIVE);
		});
	});

	it('treats an active claim as busy rather than acknowledging a duplicate before completion', async () => {
		await handlerFixture(async ({ localEnv, recipient, userId, message, rows }) => {
			const raw = inboundMime(recipient);
			await acquireInboundClaim({ env: localEnv }, { recipient, messageId: '<handler@local.test>', rawBytes: raw, userId, accountId: userId });
			const incoming = message(raw);
			await expect(handleInbound(incoming, localEnv, {})).rejects.toMatchObject({ code: 'inbound_claim_busy' });
			expect(incoming.setReject).not.toHaveBeenCalled(); expect(incoming.forward).not.toHaveBeenCalled();
			expect((await rows()).results).toHaveLength(0);
		});
	});
});

describe('Real D1 mail reliability transactions', () => {
	it('waits for the matching provider configuration before querying an earlier send', async () => {
		const taskId = crypto.randomUUID();
		const settings = { resendTokens: { 'configured.test': 'mailjet:fixture:fixture' } };
		vi.spyOn(settingService, 'query').mockResolvedValue(settings);
		vi.spyOn(accountService, 'selectById').mockResolvedValue({ email: 'sender@configured.test' });
		try {
			await db.prepare(`INSERT INTO mail_outbound_task
				(task_id,user_id,account_id,idempotency_key,content_hash,state,provider,payload_json,provider_id,updated_at)
				VALUES (?,42,7,?,'hash','UNKNOWN','external','{"providerName":"resend"}',?,datetime('now','-1 hour'))`)
				.bind(taskId, taskId, taskId).run();
			expect(await emailService.reconcileUnknownOutbound(c)).toMatchObject({ checked: 0, accepted: 0, failed: 0 });
			settings.resendTokens['configured.test'] = 'fixture';
			await db.prepare("UPDATE mail_outbound_task SET updated_at=datetime('now','-1 minute') WHERE task_id=?")
				.bind(taskId).run();
			fetchMock.get('https://api.resend.com').intercept({ path: '/emails/' + taskId, method: 'GET' })
				.reply(200, { last_event: 'delivered' });
			expect(await emailService.reconcileUnknownOutbound(c)).toMatchObject({ checked: 1, accepted: 1, failed: 0 });
		} finally {
			await db.prepare('DELETE FROM mail_outbound_task WHERE task_id=?').bind(taskId).run();
		}
	});

	it('rotates stalled UNKNOWN lookups so a later healthy task can complete', async () => {
		const group = crypto.randomUUID();
		const id = i => group + '-' + i;
		const insert = (i, accountId, provider, age) => db.prepare(`INSERT INTO mail_outbound_task
			(task_id,user_id,account_id,idempotency_key,content_hash,state,provider,payload_json,provider_id,updated_at)
			VALUES (?,42,?,?,'hash','UNKNOWN','external',?,?,datetime('now',?))`)
			.bind(id(i), accountId, id(i), JSON.stringify({ providerName: provider }), id(i), age);
		vi.spyOn(settingService, 'query').mockResolvedValue({ resendTokens: { 'configured.test': 'fixture' } });
		vi.spyOn(accountService, 'selectById').mockImplementation(async (_c, accountId) =>
			({ email: accountId === 1 ? 'sender@unconfigured.test' : 'sender@configured.test' }));
		const provider = fetchMock.get('https://api.resend.com');
		const receipt = i => ({ path: '/emails/' + id(i), method: 'GET' });
		try {
			await db.batch([
				insert('manual', 2, 'cloudflare', '-3 hours'),
				...Array.from({ length: 19 }, (_, i) => insert(i, 1, 'resend', '-2 hours')),
				insert(19, 2, 'resend', '-2 hours'),
				insert(20, 2, 'resend', '-1 hour')
			]);
			provider.intercept(receipt(19)).reply(503);
			expect(await emailService.reconcileUnknownOutbound(c)).toMatchObject({ checked: 1, accepted: 0, failed: 0 });

			// Advance the age of all rows so failures are eligible *again*. The unattempted task must still win.
			await db.prepare("UPDATE mail_outbound_task SET updated_at=datetime(updated_at,'-5 minutes') WHERE task_id LIKE ?")
				.bind(group + '-%').run();
			provider.intercept(receipt(20)).reply(200, { last_event: 'delivered' });
			const status = await emailService.reconcileUnknownOutbound(c, { limit: 1 });
			expect(status).toMatchObject({ checked: 1, accepted: 1, failed: 0 });
			expect(await db.prepare("SELECT task_id FROM mail_outbound_task WHERE task_id LIKE ? AND state='ACCEPTED'")
				.bind(group + '-%').first('task_id')).toBe(id(20));
			expect(await db.prepare("SELECT COUNT(*) FROM mail_outbound_task WHERE task_id LIKE ? AND state='UNKNOWN'")
				.bind(group + '-%').first('COUNT(*)')).toBe(21);

			// Other workers may select the same due rows, but only one should perform the provider lookup.
			provider.intercept(receipt(19)).reply(200, { last_event: 'sent' });
			const runs = await Promise.all([emailService.reconcileUnknownOutbound(c), emailService.reconcileUnknownOutbound(c)]);
			expect(runs[0].checked + runs[1].checked).toBe(1);
			expect(runs[0].accepted + runs[1].accepted).toBe(1);
		} finally {
			await db.prepare('DELETE FROM mail_outbound_task WHERE task_id LIKE ?').bind(group + '-%').run();
		}
	});

	it('upgrades legacy deferred cleanup once and uses the due and manual review indexes', async () => {
		const legacy = env.NOTICE_MAIL_DB;
		const legacyContext = { env: { MAIL_DB: legacy, USER_DB: env.NOTICE_USER_DB } };
		await legacy.prepare(`CREATE TABLE mail_receive_claim(claim_key TEXT PRIMARY KEY, recipient TEXT,
			message_id TEXT, raw_object_key TEXT, raw_expires_at INTEGER, cleanup_retry_at INTEGER,
			state TEXT, lease_until INTEGER, last_error TEXT)`).run();
		try {
			await legacy.prepare(`INSERT INTO mail_receive_claim VALUES ('fixture-legacy','','','fixture',0,92,'COMPLETE',0,'raw_cleanup_failed')`).run();
			await ensureMailReliabilitySchema(legacyContext);
			await ensureMailReliabilitySchema(legacyContext);
			expect(await legacy.prepare('SELECT cleanup_attempts, cleanup_retry_at, cleanup_review_at FROM mail_receive_claim').first())
				.toEqual({ cleanup_attempts: 1, cleanup_retry_at: 92, cleanup_review_at: 0 });
			const plan = async sql => (await legacy.prepare('EXPLAIN QUERY PLAN ' + sql).all()).results.map(row => row.detail).join(' ');
			expect(await plan(`SELECT 1 FROM mail_receive_claim WHERE raw_object_key <> '' AND cleanup_attempts > 0 AND cleanup_review_at > 0 LIMIT 1`))
				.toContain('idx_mail_receive_claim_cleanup_failures');
			expect(await plan(`SELECT claim_key FROM mail_receive_claim WHERE raw_object_key <> '' AND cleanup_review_at = 0
				AND MAX(raw_expires_at, cleanup_retry_at) <= unixepoch() AND lease_until <= unixepoch()
				ORDER BY MAX(raw_expires_at, cleanup_retry_at), rowid LIMIT 100`)).toContain('idx_mail_receive_claim_cleanup_due');
		} finally { await legacy.prepare('DROP TABLE mail_receive_claim').run(); }
	});

	it('reconciles a Mailjet UNKNOWN task through the provider status endpoint', async () => {
		const taskId = crypto.randomUUID();
		const accountSpy = vi.spyOn(accountService, 'selectById').mockResolvedValue({ email: 'mailjet-user@example.com' });
		const settingSpy = vi.spyOn(settingService, 'query').mockResolvedValue({
			resendTokens: { 'example.com': 'mailjet:test-key:test-secret' }
		});
		await db.prepare(`INSERT INTO mail_outbound_task
			(task_id,user_id,account_id,idempotency_key,content_hash,state,provider,payload_json,provider_id,updated_at)
			VALUES (?,?,?,?,?,'UNKNOWN','external',?,?,datetime('now','-1 minute'))`)
			.bind(taskId, 42, 7, 'mailjet-' + taskId, 'hash', JSON.stringify({ providerName: 'mailjet' }), 'mailjet-1').run();
		fetchMock.get('https://api.mailjet.com').intercept({ path: '/v3/REST/message/mailjet-1' })
			.reply(200, { Data: [{ Status: 'sent' }] });
		try {
			const result = await emailService.reconcileUnknownOutbound(c, { limit: 1 });
			expect(result).toMatchObject({ checked: 1, accepted: 1, failed: 0 });
			expect(await db.prepare('SELECT state FROM mail_outbound_task WHERE task_id=?').bind(taskId).first())
				.toEqual({ state: 'ACCEPTED' });
		} finally {
			accountSpy.mockRestore();
			settingSpy.mockRestore();
			await db.prepare('DELETE FROM mail_outbound_task WHERE task_id=?').bind(taskId).run();
		}
	});

	it.each([7, 8, 200])('publishes all %i attachments using actual <=100-bind statements', async (n) => {
		const store = objects();
		const claim = await acquireInboundClaim(c, { recipient: `${crypto.randomUUID()}@local.test`, rawBytes: encoder.encode('From: local@test.invalid\r\n\r\nbody') });
		let emailId;
		try {
			emailId = await seedSaving(claim);
			const incoming = attachments(n, emailId);
			const staged = await attService.stageInboundAtt(c, incoming);
			const queries = buildBoundedInserts(rows => mailOrm(c).insert(att).values(rows), staged.rows.map(row => ({ ...row, emailId })));
			expect(queries.every(query => query.params.length <= 100)).toBe(true);
			await emailService.completeInboundReceive(c, { ...claim, emailId, status: 0, isDel: 0, isSpam: 0, attachmentRows: staged.rows });
			expect((await db.prepare('SELECT count(*) AS n FROM attachments WHERE email_id = ?').bind(emailId).first()).n).toBe(n);
			expect((await db.prepare('SELECT state FROM mail_receive_claim WHERE claim_key = ?').bind(claim.claimKey).first()).state).toBe('COMPLETE');
		} finally {
			await clean([claim.claimKey], emailId ? [emailId] : []);
			store.clear();
		}
	});

	it('rolls back every attachment and publication when a later D1 insert fails', async () => {
		const store = objects();
		const claim = await acquireInboundClaim(c, { recipient: `${crypto.randomUUID()}@local.test`, rawBytes: encoder.encode('raw rollback') });
		let emailId;
		try {
			emailId = await seedSaving(claim);
			const rows = attachments(20, emailId);
			rows[19].key = null;
			await expect(emailService.completeInboundReceive(c, { ...claim, emailId, status: 0, isDel: 0, isSpam: 0, attachmentRows: rows })).rejects.toThrow();
			expect((await db.prepare('SELECT count(*) AS n FROM attachments WHERE email_id = ?').bind(emailId).first()).n).toBe(0);
			expect((await db.prepare('SELECT status FROM email WHERE email_id = ?').bind(emailId).first()).status).toBe(6);
			expect((await db.prepare('SELECT state FROM mail_receive_claim WHERE claim_key = ?').bind(claim.claimKey).first()).state).toBe('SAVING');
		} finally {
			await clean([claim.claimKey], emailId ? [emailId] : []);
			store.clear();
		}
	});

	it('allows exactly one claim per normalized envelope recipient and resumes stored raw MIME', async () => {
		const store = objects();
		const recipient = `${crypto.randomUUID()}@local.test`;
		const input = { recipient, messageId: '<claim@test.invalid>', rawBytes: encoder.encode('unchanged raw MIME') };
		const keys = [];
		try {
			const results = await Promise.allSettled([acquireInboundClaim(c, input), acquireInboundClaim(c, { ...input, recipient: recipient.toUpperCase() })]);
			const winners = results.filter(result => result.status === 'fulfilled').map(result => result.value);
			expect(winners).toHaveLength(1);
			keys.push(winners[0].claimKey);
			await failInboundClaim(c, winners[0].claimKey, winners[0].leaseToken, new Error('local injected D1 fault'));
			const putCount = r2Service.putInboundRawObj.mock.calls.length;
			const resumed = await acquireInboundClaim(c, input);
			expect(resumed.claimKey).toBe(winners[0].claimKey);
			expect(r2Service.putInboundRawObj.mock.calls.length).toBe(putCount);
			const other = await acquireInboundClaim(c, { ...input, recipient: `other-${recipient}` });
			keys.push(other.claimKey);
			expect(other.claimKey).not.toBe(resumed.claimKey);
		} finally { await clean(keys); store.clear(); }
	});

	it('never publishes on lost lease or raw object PUT failure', async () => {
		const store = objects();
			const claim = await acquireInboundClaim(c, { recipient: `${crypto.randomUUID()}@local.test`, messageId: '<lost-lease@test.invalid>', rawBytes: encoder.encode('lost lease') });

		let emailId;
		try {
			emailId = await seedSaving(claim);
			await expect(emailService.completeInboundReceive(c, { ...claim, leaseToken: 'wrong', emailId, status: 0, isDel: 0, isSpam: 0, attachmentRows: attachments(8, emailId) })).rejects.toThrow();
			expect((await db.prepare('SELECT count(*) AS n FROM attachments WHERE email_id = ?').bind(emailId).first()).n).toBe(0);
			await failInboundClaim(c, claim.claimKey, claim.leaseToken, new Error('release lease'));
			store.clear();
			r2Service.putInboundRawObj.mockRejectedValueOnce(new Error('local injected PUT failure'));
			await expect(acquireInboundClaim(c, { recipient: (await db.prepare('SELECT recipient FROM mail_receive_claim WHERE claim_key=?').bind(claim.claimKey).first()).recipient, messageId: '<lost-lease@test.invalid>', rawBytes: encoder.encode('lost lease') })).rejects.toThrow('PUT failure');
			expect((await db.prepare('SELECT state FROM mail_receive_claim WHERE claim_key=?').bind(claim.claimKey).first()).state).toBe('FAILED');
		} finally { await clean([claim.claimKey], emailId ? [emailId] : []); store.clear(); }
	});

	it('reserves near-limit storage atomically for concurrent inbound claims', async () => {
		const store = objects();
		const keys = [];
		const userId = 920001;
		try {
			const one = await acquireInboundClaim(c, { recipient: `${crypto.randomUUID()}@local.test`, userId, rawBytes: encoder.encode('quota-one') });
			const two = await acquireInboundClaim(c, { recipient: `${crypto.randomUUID()}@local.test`, userId, rawBytes: encoder.encode('quota-two') });
			keys.push(one.claimKey, two.claimKey);
			const results = await Promise.allSettled([one, two].map(claim => reserveInboundQuota(c, { ...claim, userId, incomingBytes: 80, maxStorageBytes: 100, maxEmails: 10 })));
			expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
			expect((await db.prepare('SELECT SUM(reserved_bytes) AS n FROM mail_receive_claim WHERE user_id=?').bind(userId).first()).n).toBe(80);
		} finally { await clean(keys); store.clear(); }
	});

		it.each(['SAVING', 'FAILED', 'COMPLETE'])('rechecks the concurrent INSERT winner content in %s state', async (state) => {
			const store = objects();
			const input = { recipient: `${crypto.randomUUID()}@local.test`, messageId: '<winner@local.test>', rawBytes: encoder.encode('Subject: first\r\n\r\nfirst body') };
			let claim;
			try {
				claim = await acquireInboundClaim(c, input);
				await db.prepare('UPDATE mail_receive_claim SET state=?,lease_until=0 WHERE claim_key=?').bind(state, claim.claimKey).run();
				let generationReads = 0;
				let winnerReads = 0;
				// Reproduce a missed initial read followed by an INSERT conflict on
				// the real D1 winner, rather than mocking acquireInboundClaim itself.
				const racingDb = new Proxy(db, { get(target, property) {
					if (property !== 'prepare') return typeof target[property] === 'function' ? target[property].bind(target) : target[property];
					return sql => {
						const statement = target.prepare(sql);
						if (sql.includes('SELECT * FROM mail_receive_claim WHERE claim_key = ?')) winnerReads++;
						if (sql.includes('SELECT * FROM mail_receive_claim WHERE recipient = ? AND message_id = ?') && generationReads++ === 0) {
							return { bind: () => ({ first: async () => null }) };
						}
						return statement;
					};
				} });
				await expect(acquireInboundClaim({ env: { ...c.env, MAIL_DB: racingDb } }, {
					...input, rawBytes: encoder.encode('Subject: changed\r\n\r\nchanged body')
				})).rejects.toMatchObject({ code: 'inbound_content_conflict' });
				expect(generationReads).toBe(1);
				expect(winnerReads).toBe(1);
				expect(r2Service.putInboundRawObj).toHaveBeenCalledTimes(1);
				expect((await db.prepare('SELECT state,raw_sha256 FROM mail_receive_claim WHERE claim_key=?').bind(claim.claimKey).first()))
					.toMatchObject({ state, raw_sha256: claim.rawSha256 });
			} finally { if (claim) await clean([claim.claimKey]); store.clear(); }
		});

		it('preserves body significance while ignoring delivery trace and retaining binary recovery bytes', async () => {
			const store = objects();
			const recipient = `${crypto.randomUUID()}@local.test`;
			const original = encoder.encode('Received: first hop\r\n\twith folding\r\nSubject: stable\r\n\r\nReceived: body content\r\n');
			const retried = encoder.encode('Received: another hop\r\nReturn-Path: <sender@local.test>\r\nSubject: stable\r\n\r\nReceived: body content\r\n');
			let claim;
			try {
				expect(await inboundContentSha256(original)).toBe(await inboundContentSha256(retried));
				expect(await inboundContentSha256(original)).not.toBe(await inboundContentSha256(encoder.encode('Subject: stable\r\n\r\nReceived: different body\r\n')));
				claim = await acquireInboundClaim(c, { recipient, rawBytes: original });
				const encrypted = store.get(claim.rawObjectKey);
				expect(encrypted).toBeInstanceOf(Uint8Array);
				expect(encrypted.byteLength).toBe(original.byteLength + 35);
				expect(new TextDecoder().decode(encrypted.subarray(0, 7))).toBe('raw:v2:');
				await failInboundClaim(c, claim.claimKey, claim.leaseToken, new Error('retry'));
				const resumed = await acquireInboundClaim(c, { recipient, rawBytes: retried });
				expect(resumed.claimKey).toBe(claim.claimKey);
				expect(r2Service.putInboundRawObj).toHaveBeenCalledTimes(1);
				expect((await db.prepare('SELECT raw_sha256 FROM mail_receive_claim WHERE claim_key=?').bind(claim.claimKey).first()).raw_sha256).toBe(claim.rawSha256);
			} finally { if (claim) await clean([claim.claimKey]); store.clear(); }
		});

		it('limits encrypted KV values before a PUT and preserves the failed claim for recovery', async () => {
			const store = objects();
			const recipient = `${crypto.randomUUID()}@local.test`;
			const rawBytes = new Uint8Array(25 * 1024 * 1024 - 34);
			const key = await mailSha256(`${recipient}\nmessage:<kv-limit@local.test>`);
			try {
				expect(await getInboundRawMaxBytes(c)).toBe(25 * 1024 * 1024 - 35);
				await expect(acquireInboundClaim(c, { recipient, messageId: '<kv-limit@local.test>', rawBytes })).rejects.toMatchObject({ code: 'inbound_raw_too_large' });
				expect(r2Service.putInboundRawObj).not.toHaveBeenCalled();
				expect((await db.prepare('SELECT state FROM mail_receive_claim WHERE claim_key=?').bind(key).first()).state).toBe('FAILED');
			} finally { await clean([key]); store.clear(); }
		});

		it('reads legacy encrypted raw:v1 recovery without rewriting it', async () => {
			const store = objects();
			const input = { recipient: `${crypto.randomUUID()}@local.test`, messageId: '<legacy@local.test>', rawBytes: encoder.encode('Subject: legacy\r\n\r\nold bytes') };
			let claim;
			try {
				claim = await acquireInboundClaim(c, input);
				const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(c.env.email_enc_key), 'HKDF', false, ['deriveKey']);
				const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('epomail:inbound-raw-mime:v1'), info: encoder.encode('mail-receive-claim') }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
				const iv = crypto.getRandomValues(new Uint8Array(12));
				const base64 = bytes => btoa(String.fromCharCode(...bytes));
				const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(base64(input.rawBytes))));
				const legacy = `raw:v1:${base64(iv)}:${base64(cipher)}`;
				store.set(claim.rawObjectKey, legacy);
				await failInboundClaim(c, claim.claimKey, claim.leaseToken, new Error('retry legacy'));
				await db.prepare('UPDATE mail_receive_claim SET content_sha256=NULL WHERE claim_key=?').bind(claim.claimKey).run();
				const resumed = await acquireInboundClaim(c, { ...input, rawBytes: encoder.encode('Received: new trace\r\nSubject: legacy\r\n\r\nold bytes') });
				expect(resumed.claimKey).toBe(claim.claimKey);
				expect(store.get(claim.rawObjectKey)).toBe(legacy);
			} finally { if (claim) await clean([claim.claimKey]); store.clear(); }
		});

		it('does not double-count the claim email and attachments when renewing a quota reservation', async () => {
			const store = objects();
			const userId = 920002;
			let claim;
			let emailId;
			try {
				claim = await acquireInboundClaim(c, { recipient: `${crypto.randomUUID()}@local.test`, userId, rawBytes: encoder.encode('recovery quota') });
				const row = await db.prepare(`INSERT INTO email(account_id,user_id,subject,text,content,code,status,is_del,receive_claim_key)
					VALUES (0,?,'主','文','<p>文</p>','碼',6,1,?)`).bind(userId, claim.claimKey).run();
				emailId = row.meta.last_row_id;
				await db.prepare(`INSERT INTO attachments(user_id,account_id,email_id,key,size) VALUES (?,0,?,'attachments/local-resume.bin',5)`).bind(userId, emailId).run();
				const total = encoder.encode('主文<p>文</p>碼').byteLength + 5;
				await reserveInboundQuota(c, { ...claim, userId, incomingBytes: total, maxStorageBytes: total, maxEmails: 1 });
				await reserveInboundQuota(c, { ...claim, userId, incomingBytes: total, maxStorageBytes: total, maxEmails: 1 });
				expect(await db.prepare('SELECT reserved_bytes,reserved_count FROM mail_receive_claim WHERE claim_key=?').bind(claim.claimKey).first())
					.toEqual({ reserved_bytes: 0, reserved_count: 0 });
				await db.prepare('UPDATE mail_receive_claim SET lease_until=0 WHERE claim_key=?').bind(claim.claimKey).run();
				await expect(reserveInboundQuota(c, { ...claim, userId, incomingBytes: total, maxStorageBytes: total, maxEmails: 1 })).rejects.toMatchObject({ code: 'inbound_claim_lost' });
			} finally { if (claim) await clean([claim.claimKey], emailId ? [emailId] : []); store.clear(); }
		});

		it('ignores expired inbound reservations but includes active outbound email counts', async () => {
			const store = objects();
			const userId = 920003;
			const keys = [];
			const taskId = crypto.randomUUID();
			try {
				const expired = await acquireInboundClaim(c, { recipient: `${crypto.randomUUID()}@local.test`, userId, rawBytes: encoder.encode('old quota') });
				keys.push(expired.claimKey);
				await db.prepare('UPDATE mail_receive_claim SET reserved_bytes=999,reserved_count=9,lease_until=0 WHERE claim_key=?').bind(expired.claimKey).run();
				const current = await acquireInboundClaim(c, { recipient: `${crypto.randomUUID()}@local.test`, userId, rawBytes: encoder.encode('current quota') });
				keys.push(current.claimKey);
				await db.prepare(`INSERT INTO mail_outbound_task(task_id,user_id,account_id,idempotency_key,content_hash,state,reserved_bytes,reserved_count)
					VALUES (?,?,0,?,'local','UNKNOWN',5,1)`).bind(taskId, userId, taskId).run();
				await expect(reserveInboundQuota(c, { ...current, userId, incomingBytes: 5, maxStorageBytes: 10, maxEmails: 1, bypass: true })).rejects.toMatchObject({ code: 'inbound_quota_exceeded' });
				await reserveInboundQuota(c, { ...current, userId, incomingBytes: 5, maxStorageBytes: 10, maxEmails: 2 });
			} finally {
				await db.prepare('DELETE FROM mail_outbound_task WHERE task_id=?').bind(taskId).run();
				await clean(keys); store.clear();
			}
		});

		it('never deletes active raw leases and removes abandoned SAVING rows with an attachment outbox', async () => {
			const store = objects();
			let claim;
			let emailId;
			const objectKey = `attachments/expiry-${crypto.randomUUID()}.bin`;
			try {
				claim = await acquireInboundClaim(c, { recipient: `${crypto.randomUUID()}@local.test`, rawBytes: encoder.encode('expire safely') });
				emailId = await seedSaving(claim);
				await db.prepare('INSERT INTO attachments(user_id,account_id,email_id,key,size) VALUES (0,0,?,?,3)').bind(emailId, objectKey).run();
				await db.prepare('UPDATE mail_receive_claim SET raw_expires_at=0 WHERE claim_key=?').bind(claim.claimKey).run();
				expect(await cleanupExpiredInboundClaims(c)).toEqual({ processed: 0, deleted: 0 });
				expect(r2Service.deleteInboundRawObj).not.toHaveBeenCalled();
				await failInboundClaim(c, claim.claimKey, claim.leaseToken, new Error('expired fixture'));
				r2Service.deleteInboundRawObj.mockImplementationOnce(async (_c, key) => {
					// A re-delivery while the cleaner owns its CAS lease must not be
					// allowed to stage a replacement object that the cleaner deletes.
					await expect(acquireInboundClaim(c, { recipient: (await db.prepare('SELECT recipient FROM mail_receive_claim WHERE claim_key=?').bind(claim.claimKey).first()).recipient, rawBytes: encoder.encode('expire safely') })).rejects.toMatchObject({ code: 'inbound_claim_busy' });
					store.delete(key);
				});
				expect(await cleanupExpiredInboundClaims(c)).toEqual({ processed: 1, deleted: 1 });
				expect(await db.prepare('SELECT email_id FROM email WHERE email_id=?').bind(emailId).first()).toBeNull();
				expect(await db.prepare('SELECT att_id FROM attachments WHERE email_id=?').bind(emailId).first()).toBeNull();
				expect(await db.prepare('SELECT object_key FROM object_deletion_queue WHERE object_key=?').bind(objectKey).first()).toEqual({ object_key: objectKey });
			} finally {
				if (claim) await clean([claim.claimKey], emailId ? [emailId] : []);
				await db.prepare('DELETE FROM object_deletion_queue WHERE object_key=?').bind(objectKey).run();
				store.clear();
			}
		});

		it('retains failed-delete recovery and completed deduplication after raw expiry', async () => {
			const store = objects();
			const input = { recipient: `${crypto.randomUUID()}@local.test`, messageId: '<tombstone@local.test>', rawBytes: encoder.encode('Subject: expiry\r\n\r\nbody') };
			let claim;
			let emailId;
			try {
				claim = await acquireInboundClaim(c, input);
				emailId = await seedSaving(claim);
				await emailService.completeInboundReceive(c, { ...claim, emailId, status: 0, isDel: 0, isSpam: 0 });
				await db.prepare('UPDATE mail_receive_claim SET raw_expires_at=0 WHERE claim_key=?').bind(claim.claimKey).run();
				r2Service.deleteInboundRawObj.mockRejectedValueOnce(new Error('local deletion unavailable'));
				await expect(cleanupExpiredInboundClaims(c)).rejects.toMatchObject({ summary: { processed: 1, deleted: 0, failed: 1 } });
				expect(store.has(claim.rawObjectKey)).toBe(true);
				expect((await db.prepare('SELECT state,lease_until FROM mail_receive_claim WHERE claim_key=?').bind(claim.claimKey).first())).toEqual({ state: 'COMPLETE', lease_until: 0 });
				expect(await cleanupExpiredInboundClaims(c)).toEqual({ processed: 0, deleted: 0 });
				await db.prepare('UPDATE mail_receive_claim SET cleanup_retry_at=0 WHERE claim_key=?').bind(claim.claimKey).run();
				expect(await cleanupExpiredInboundClaims(c)).toEqual({ processed: 1, deleted: 1 });
				expect(store.has(claim.rawObjectKey)).toBe(false);
				expect((await db.prepare('SELECT state,raw_object_key FROM mail_receive_claim WHERE claim_key=?').bind(claim.claimKey).first())).toEqual({ state: 'COMPLETE', raw_object_key: '' });
				expect(await acquireInboundClaim(c, { ...input, rawBytes: encoder.encode('Received: replay hop\r\nSubject: expiry\r\n\r\nbody') })).toMatchObject({ complete: true, emailId });
				expect(await cleanupExpiredInboundClaims(c)).toEqual({ processed: 0, deleted: 0 });
			} finally { if (claim) await clean([claim.claimKey], emailId ? [emailId] : []); store.clear(); }
		});

		it('backs off, queues persistent raw cleanup failures, and recovers with one scoped operator reset', async () => {
			const store = objects();
			const alert = vi.spyOn(console, 'error').mockImplementation(() => {});
			const claims = [];
			try {
				for (let i = 0; i < 2; i++) {
					const claim = await acquireInboundClaim(c, { recipient: `${crypto.randomUUID()}@local.test`, rawBytes: encoder.encode('Subject: retention\r\n\r\nbody') });
					claims.push(claim);
					const emailId = await seedSaving(claim);
					await emailService.completeInboundReceive(c, { ...claim, emailId, status: 0, isDel: 0, isSpam: 0 });
					await db.prepare('UPDATE mail_receive_claim SET raw_expires_at=? WHERE claim_key=?').bind(i, claim.claimKey).run();
				}
				const [poisoned, healthy] = claims;
				r2Service.deleteInboundRawObj.mockImplementation(async (_c, key) => {
					if (key === poisoned.rawObjectKey) throw new Error('sensitive-upstream-error');
					store.delete(key);
				});
				let reviewAt;
				for (let attempt = 1; attempt <= 5; attempt++) {
					await expect(cleanupExpiredInboundClaims(c)).rejects.toMatchObject({ summary: {
						deleted: attempt === 1 ? 1 : 0, failed: 1, reviewAdded: attempt === 5 ? 1 : 0, infrastructureFailures: 0
					} });
					const row = await db.prepare(`SELECT cleanup_attempts, cleanup_retry_at, cleanup_review_at, unixepoch() AS now
						FROM mail_receive_claim WHERE claim_key=?`).bind(poisoned.claimKey).first();
					expect(row.cleanup_attempts).toBe(attempt);
					expect(store.has(healthy.rawObjectKey)).toBe(false);
					expect(await cleanupExpiredInboundClaims(c)).toEqual({ processed: 0, deleted: 0 });
					if (attempt < 5) {
						const delay = 300 * 2 ** (attempt - 1);
						expect(row.cleanup_retry_at - row.now).toBeGreaterThanOrEqual(delay - 2);
						expect(row.cleanup_retry_at - row.now).toBeLessThanOrEqual(delay);
						expect(row.cleanup_review_at).toBe(0);
						await db.prepare('UPDATE mail_receive_claim SET cleanup_retry_at=0 WHERE claim_key=?').bind(poisoned.claimKey).run();
					} else {
						expect(row.cleanup_retry_at).toBe(0);
						reviewAt = row.cleanup_review_at;
						expect(reviewAt).toBeGreaterThan(0);
					}
				}
				expect(alert.mock.calls.map(([line]) => JSON.parse(line))).toEqual([{
					event: 'inbound_raw_cleanup_review_required', processed: 1, deleted: 0, failed: 1, infrastructureFailures: 0, reviewAdded: 1
				}, {
					event: 'inbound_raw_cleanup_review_required', processed: 0, deleted: 0, failed: 0, infrastructureFailures: 0, reviewAdded: 0
				}]);
				expect(store.has(poisoned.rawObjectKey)).toBe(true);
				const reset = (key, at) => db.prepare(env.TEST_RETRY_REVIEWED_RAW_SQL).bind(key, at).first();
				expect(await reset(healthy.claimKey, reviewAt)).toBeNull();
				expect(await reset(poisoned.claimKey, reviewAt - 1)).toBeNull();
				await db.prepare('UPDATE mail_receive_claim SET lease_until=unixepoch()+300 WHERE claim_key=?').bind(poisoned.claimKey).run();
				expect(await reset(poisoned.claimKey, reviewAt)).toBeNull();
				await db.prepare('UPDATE mail_receive_claim SET lease_until=0 WHERE claim_key=?').bind(poisoned.claimKey).run();
				r2Service.deleteInboundRawObj.mockImplementation(async (_c, key) => { store.delete(key); });
				expect(await reset(poisoned.claimKey, reviewAt)).toEqual({ cleanup_attempts: 0, cleanup_retry_at: 0, cleanup_review_at: 0 });
				expect(await reset(poisoned.claimKey, reviewAt)).toBeNull();
				expect(await cleanupExpiredInboundClaims(c)).toEqual({ processed: 1, deleted: 1 });
				expect(store.size).toBe(0);
				expect((await db.prepare('SELECT raw_object_key FROM mail_receive_claim WHERE claim_key=?').bind(poisoned.claimKey).first()).raw_object_key).toBe('');
			} finally { await clean(claims.map(claim => claim.claimKey)); store.clear(); }
		});

		it('leaves the successor lease and attempt count intact when cleanup loses ownership', async () => {
			const store = objects();
			let claim;
			try {
				claim = await acquireInboundClaim(c, { recipient: `${crypto.randomUUID()}@local.test`, rawBytes: encoder.encode('Subject: stolen lease\r\n\r\nbody') });
				await db.prepare('UPDATE mail_receive_claim SET raw_expires_at=0, lease_until=0, cleanup_attempts=4 WHERE claim_key=?').bind(claim.claimKey).run();
				r2Service.deleteInboundRawObj.mockImplementationOnce(async () => {
					await db.prepare("UPDATE mail_receive_claim SET lease_token='new-owner', lease_until=unixepoch()+100 WHERE claim_key=?").bind(claim.claimKey).run();
					throw new Error('old worker lost ownership');
				});
				expect(await cleanupExpiredInboundClaims(c)).toEqual({ processed: 1, deleted: 0 });
				expect(await db.prepare('SELECT lease_token, cleanup_attempts, cleanup_retry_at, cleanup_review_at FROM mail_receive_claim WHERE claim_key=?').bind(claim.claimKey).first())
					.toEqual({ lease_token: 'new-owner', cleanup_attempts: 4, cleanup_retry_at: 0, cleanup_review_at: 0 });
			} finally { if (claim) await clean([claim.claimKey]); store.clear(); }
		});

		it('continues past a failed D1 finalization and retries after deleting the legacy raw object', async () => {
			const store = objects();
			const keys = [];
			const inputs = [0, 1, 2].map(i => ({
				recipient: `${crypto.randomUUID()}@local.test`,
				rawBytes: encoder.encode(`Subject: cleanup ${i}\r\n\r\nbody`)
			}));
			try {
				for (const [i, input] of inputs.entries()) {
					const claim = await acquireInboundClaim(c, input);
					keys.push(claim.claimKey);
					const emailId = await seedSaving(claim);
					await emailService.completeInboundReceive(c, { ...claim, emailId, status: 0, isDel: 0, isSpam: 0 });
					await db.prepare('UPDATE mail_receive_claim SET content_sha256=NULL, raw_expires_at=? WHERE claim_key=?').bind(i, claim.claimKey).run();
				}
				// Fail only the final D1 change for the first row, after its object is gone.
				await db.prepare(`CREATE TRIGGER fail_first_cleanup BEFORE UPDATE OF raw_object_key ON mail_receive_claim
					WHEN OLD.claim_key = '${keys[0]}' AND NEW.raw_object_key = ''
					BEGIN SELECT RAISE(ABORT, 'test cleanup write unavailable'); END`).run();
				await expect(cleanupExpiredInboundClaims(c, { limit: 2 })).rejects.toMatchObject({ summary: { processed: 2, deleted: 1, failed: 1 } });
				const blocked = await db.prepare('SELECT raw_object_key, content_sha256, cleanup_retry_at FROM mail_receive_claim WHERE claim_key=?').bind(keys[0]).first();
				expect(store.has(blocked.raw_object_key)).toBe(false);
				expect(blocked.content_sha256).toBe(await inboundContentSha256(inputs[0].rawBytes));
				expect(blocked.cleanup_retry_at).toBeGreaterThan(0);
				expect(await cleanupExpiredInboundClaims(c, { limit: 1 })).toEqual({ processed: 1, deleted: 1 });
				await db.prepare('DROP TRIGGER fail_first_cleanup').run();
				await db.prepare('UPDATE mail_receive_claim SET cleanup_retry_at=0 WHERE claim_key=?').bind(keys[0]).run();
				expect(await cleanupExpiredInboundClaims(c, { limit: 1 })).toEqual({ processed: 1, deleted: 1 });
				expect(await acquireInboundClaim(c, inputs[0])).toMatchObject({ complete: true, claimKey: keys[0] });
			} finally {
				await db.prepare('DROP TRIGGER IF EXISTS fail_first_cleanup').run();
				await clean(keys);
				store.clear();
			}
		});

		it('re-delivers a completed message after its email row is permanently deleted', async () => {
			const store = objects();
			const input = { recipient: `${crypto.randomUUID()}@local.test`, messageId: '<reissue@local.test>', rawBytes: encoder.encode('Subject: reissue\r\n\r\nbody') };
			let claim;
			let again;
			let emailId;
			try {
				claim = await acquireInboundClaim(c, input);
				emailId = await seedSaving(claim);
				await emailService.completeInboundReceive(c, { ...claim, emailId, status: 0, isDel: 0, isSpam: 0 });
				await db.prepare('DELETE FROM email WHERE email_id=?').bind(emailId).run();
				emailId = null;
				again = await acquireInboundClaim(c, input);
				expect(again.complete).toBeFalsy();
				expect(again.claimKey).not.toBe(claim.claimKey);
			} finally {
				await clean([claim?.claimKey, again?.claimKey].filter(Boolean), emailId ? [emailId] : []);
				store.clear();
			}
		});

		it('keeps the delivery clock through raw cleanup and elects one successor after the retry window', async () => {
			const store = objects();
			const input = { recipient: `${crypto.randomUUID()}@local.test`, messageId: '<rotation@local.test>', rawBytes: encoder.encode('body') };
			const keys = [];
			try {
				const first = await acquireInboundClaim(c, input);
				keys.push(first.claimKey);
				const firstId = await seedSaving(first);
				await emailService.completeInboundReceive(c, { ...first, emailId: firstId, status: 0, isDel: 0, isSpam: 0 });
				await db.prepare(`UPDATE mail_receive_claim SET raw_expires_at=0, updated_at=datetime('now','-31 days') WHERE claim_key=?`).bind(first.claimKey).run();
				expect(await cleanupExpiredInboundClaims(c)).toEqual({ processed: 1, deleted: 1 });
				const attempts = await Promise.allSettled([acquireInboundClaim(c, input), acquireInboundClaim(c, input)]);
				const winners = attempts.filter(result => result.status === 'fulfilled').map(result => result.value);
				keys.push(...winners.map(winner => winner.claimKey));
				expect(winners).toHaveLength(1);
				const [next] = winners;
				expect(next).toMatchObject({ complete: false });
				expect(next.claimKey).not.toBe(first.claimKey);
				expect(attempts.find(result => result.status === 'rejected').reason.code).toBe('inbound_claim_busy');
				const secondId = await seedSaving(next);
				await emailService.completeInboundReceive(c, { ...next, emailId: secondId, status: 0, isDel: 0, isSpam: 0 });
				expect(await acquireInboundClaim(c, input)).toMatchObject({ complete: true, claimKey: next.claimKey, emailId: secondId });
				expect(await db.prepare('SELECT email_id FROM email WHERE email_id=?').bind(firstId).first()).not.toBeNull();
			} finally {
				await clean(keys);
				store.clear();
			}
		});

		it('discards the raw recovery copy on a terminal quota rejection', async () => {
			const store = objects();
			const input = { recipient: `${crypto.randomUUID()}@local.test`, userId: 7, messageId: '<discard@local.test>', rawBytes: encoder.encode('Subject: discard\r\n\r\nbody') };
			let claim;
			try {
				claim = await acquireInboundClaim(c, input);
				expect(store.has(claim.rawObjectKey)).toBe(true);
				await failInboundClaim(c, claim.claimKey, claim.leaseToken,
					Object.assign(new Error('recipient quota is full'), { code: 'inbound_quota_exceeded' }), { deleteRaw: true });
				expect(store.has(claim.rawObjectKey)).toBe(false);
				expect(await db.prepare('SELECT state, raw_object_key FROM mail_receive_claim WHERE claim_key=?').bind(claim.claimKey).first())
					.toEqual({ state: 'FAILED', raw_object_key: '' });
			} finally {
				if (claim) await clean([claim.claimKey]);
				store.clear();
			}
		});

		it('does not drain a staged attachment while its inbound claim is active', async () => {
			const store = objects();
			const input = { recipient: `${crypto.randomUUID()}@local.test`, userId: 7, messageId: '<protected-drain@local.test>', rawBytes: encoder.encode('Subject: drain\r\n\r\nbody') };
			let claim;
			try {
				claim = await acquireInboundClaim(c, input);
				const protectedKey = `attachments/${claim.claimKey}-0-protected.bin`;
				store.set(protectedKey, new Uint8Array([1]));
				await db.prepare(`INSERT INTO object_deletion_queue(object_key,user_id,status,attempts)
					VALUES (?,?,'pending',0)`).bind(protectedKey, 7).run();
				expect(await attService.drainObjectDeletionQueue(c)).toMatchObject({ skipped: 1, deleted: 0 });
				expect(store.has(protectedKey)).toBe(true);
				await db.prepare('DELETE FROM object_deletion_queue WHERE object_key=?').bind(protectedKey).run();
			} finally {
				if (claim) await clean([claim.claimKey]);
				store.clear();
			}
		});

		it('rejects oversized multibyte body rows before any provider work', () => {
		expect(() => assertMailRowSize({ content: '界'.repeat(700000), text: '' })).toThrow(/row size/i);
	});

	it('keeps same-key outbound preparation idempotent and binds hash conflicts', async () => {
		const key = `mail-test-${crypto.randomUUID()}`;
		const first = await mailOutboundService.prepareOutboundTask(c, {
			userId: 930001, accountId: 1, idempotencyKey: key, contentHash: 'hash-a',
			reservedBytes: 10, maxStorageBytes: 1000, maxEmails: 5000, bypassStorage: true, payload: { recipients: ['test@local.test'] }
		});
		try {
			const concurrent = await Promise.all([
				mailOutboundService.prepareOutboundTask(c, { userId: 930001, accountId: 1, idempotencyKey: key, contentHash: 'hash-a', reservedBytes: 10, maxStorageBytes: 1000, maxEmails: 5000, bypassStorage: true, payload: {} }),
				mailOutboundService.prepareOutboundTask(c, { userId: 930001, accountId: 1, idempotencyKey: key, contentHash: 'hash-a', reservedBytes: 10, maxStorageBytes: 1000, maxEmails: 5000, bypassStorage: true, payload: {} })
			]);
			expect(new Set(concurrent.map(item => item.task.task_id)).size).toBe(1);
			await expect(mailOutboundService.prepareOutboundTask(c, { userId: 930001, accountId: 1, idempotencyKey: key, contentHash: 'hash-b', reservedBytes: 10, maxStorageBytes: 1000, maxEmails: 5000, bypassStorage: true, payload: {} })).rejects.toMatchObject({ errorCode: 'idempotency_conflict' });
		} finally {
			await db.prepare('DELETE FROM mail_outbound_task WHERE task_id = ?').bind(first.task.task_id).run();
		}
	});
});
