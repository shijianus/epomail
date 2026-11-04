import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ensureMailReliabilitySchema } from '../src/utils/mail-reliability-schema.js';
import { getMailDb, getUserDb } from '../src/utils/db-accessor.js';
import lifecycle, { MAIL_LIFECYCLE_LIMITS } from '../src/service/mail-lifecycle-service.js';
import attService from '../src/service/att-service.js';
import r2Service from '../src/service/r2-service.js';
import emailCryptoUtils from '../src/utils/email-crypto-utils.js';
import { emailConst } from '../src/const/entity-const.js';
import { assertSystemStorageCanChange } from '../src/service/privacy-revocation-service.js';

// vitest.config.js has no shared schema setup. Use its two independent real D1
// bindings and bootstrap this file alone; never depend on another spec's tables.
const baseEnv = { ...env, MAIL_DB: env.NOTICE_MAIL_DB, USER_DB: env.NOTICE_USER_DB,
	r2: undefined, email_enc_key: 'local-only-lifecycle-test-key-not-live' };
const db = getMailDb({ env: baseEnv });
const userDb = getUserDb({ env: baseEnv });
const OLD = '2000-01-01T00:00:00.000Z';
const read = id => db.prepare('SELECT * FROM email WHERE email_id = ?').bind(id).first();
const count = async (table, id) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE email_id = ?`).bind(id).first()).n;

beforeAll(async () => {
	await db.prepare(`CREATE TABLE IF NOT EXISTS email (
		email_id INTEGER PRIMARY KEY AUTOINCREMENT, send_email TEXT, name TEXT,
		account_id INTEGER NOT NULL, user_id INTEGER NOT NULL, subject TEXT, code TEXT NOT NULL DEFAULT '',
		text TEXT, content TEXT, cc TEXT DEFAULT '[]', bcc TEXT DEFAULT '[]', recipient TEXT,
		to_email TEXT NOT NULL DEFAULT '', to_name TEXT NOT NULL DEFAULT '', in_reply_to TEXT DEFAULT '',
		relation TEXT DEFAULT '', message_id TEXT DEFAULT '', type INTEGER NOT NULL DEFAULT 0,
		status INTEGER NOT NULL DEFAULT 0, resend_email_id TEXT, message TEXT, unread INTEGER NOT NULL DEFAULT 0,
		create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, is_del INTEGER NOT NULL DEFAULT 0,
		is_spam INTEGER NOT NULL DEFAULT 0, snoozed_time TEXT, snoozed_end_time TEXT,
		labels TEXT NOT NULL DEFAULT '[]', trashed_at TEXT, spam_at TEXT, receive_claim_key TEXT, outbound_task_id TEXT
	)`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS attachments (
		att_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, email_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL, key TEXT NOT NULL, filename TEXT, mime_type TEXT, size INTEGER,
		status TEXT NOT NULL DEFAULT 0, type INTEGER NOT NULL DEFAULT 0, disposition TEXT, related TEXT,
		content_id TEXT, encoding TEXT, create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS star (star_id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL, email_id INTEGER NOT NULL, create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS account (account_id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
		status INTEGER NOT NULL DEFAULT 0, is_del INTEGER NOT NULL DEFAULT 0, all_receive INTEGER NOT NULL DEFAULT 0)`).run();
	await userDb.prepare(`CREATE TABLE IF NOT EXISTS user (user_id INTEGER PRIMARY KEY AUTOINCREMENT,
		email TEXT NOT NULL, password TEXT NOT NULL, salt TEXT NOT NULL, type INTEGER NOT NULL DEFAULT 1,
		status INTEGER NOT NULL DEFAULT 0, is_del INTEGER NOT NULL DEFAULT 0,
		byo_storage_enabled INTEGER NOT NULL DEFAULT 0, byo_storage_config TEXT NOT NULL DEFAULT '{}')`).run();
	await ensureMailReliabilitySchema({ env: baseEnv });
});

async function withFixture(run, settings = {}) {
	const owners = [];
	const keys = new Set();
	const taskIds = new Set();
	const triggers = [];
	const config = { allMailMode: 1, spamRetentionDays: 7, ...settings };
	const c = { env: baseEnv, get: name => name === 'setting' ? config : undefined };
	const seedOwner = async () => {
		const address = `lifecycle-${crypto.randomUUID()}@local.test`;
		const user = await userDb.prepare("INSERT INTO user(email,password,salt) VALUES (?,'test-only','test-only')").bind(address).run();
		const owner = { userId: user.meta.last_row_id, accountId: null };
		owners.push(owner);
		const account = await db.prepare('INSERT INTO account(user_id,email) VALUES (?,?)').bind(owner.userId, address).run();
		owner.accountId = account.meta.last_row_id;
		return owner;
	};
	try {
		const owner = await seedOwner();
		const mail = async (data = {}, who = owner) => {
			const result = await db.prepare(`INSERT INTO email
				(user_id,account_id,send_email,subject,content,text,code,status,type,is_del,is_spam,
				trashed_at,spam_at,create_time,snoozed_time,snoozed_end_time,receive_claim_key,outbound_task_id)
				VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
				who.userId, who.accountId, 'Sender <sender@local.test>', data.subject ?? 'subject',
				data.content ?? '<p>body</p>', data.text ?? 'body', data.code ?? '123',
				data.status ?? 0, data.type ?? 0, data.isDel ?? 0, data.isSpam ?? 0,
				data.trashedAt ?? null, data.spamAt ?? null, data.createTime ?? OLD,
				data.snoozedTime ?? null, data.snoozedEndTime ?? null, data.receiveClaimKey ?? null,
				data.outboundTaskId ?? null).run();
			return result.meta.last_row_id;
		};
		const attachment = async (id, key = `attachments/lifecycle-${crypto.randomUUID()}.txt`, who = owner) => {
			keys.add(key);
			await db.prepare('INSERT INTO attachments(user_id,email_id,account_id,key,size) VALUES (?,?,?,?,4)')
				.bind(who.userId, id, who.accountId, key).run();
			await env.kv.put(key, 'blob');
			return key;
		};
		const star = id => db.prepare('INSERT INTO star(user_id,email_id) VALUES (?,?)').bind(owner.userId, id).run();
		const task = async (state, id, { linkFromEmail = true } = {}) => {
			const taskId = crypto.randomUUID();
			taskIds.add(taskId);
			await db.prepare(`INSERT INTO mail_outbound_task(task_id,user_id,account_id,idempotency_key,content_hash,state,email_id)
				VALUES (?,?,?,?,'local-test',?,?)`).bind(taskId, owner.userId, owner.accountId, taskId, state, id).run();
			if (linkFromEmail) await db.prepare('UPDATE email SET outbound_task_id=? WHERE email_id=?').bind(taskId, id).run();
			return taskId;
		};
		await run({ c, owner, mail, attachment, star, task, seedOwner, triggers });
	} finally {
		vi.restoreAllMocks();
		// Physical cleanup also runs when setup/assertions/production calls fail.
		for (const trigger of triggers) await db.prepare(`DROP TRIGGER IF EXISTS ${trigger}`).run();
		for (const taskId of taskIds) {
			await db.prepare('DELETE FROM mail_local_delivery WHERE task_id=?').bind(taskId).run();
		}
		for (const owner of owners) {
			await db.prepare('DELETE FROM attachments WHERE user_id=? OR email_id IN (SELECT email_id FROM email WHERE user_id=?)').bind(owner.userId, owner.userId).run();
			await db.prepare('DELETE FROM star WHERE user_id=? OR email_id IN (SELECT email_id FROM email WHERE user_id=?)').bind(owner.userId, owner.userId).run();
			await db.prepare('DELETE FROM email WHERE user_id=?').bind(owner.userId).run();
			await db.prepare('DELETE FROM mail_receive_claim WHERE user_id=?').bind(owner.userId).run();
			await db.prepare('DELETE FROM mail_outbound_task WHERE user_id=?').bind(owner.userId).run();
			await db.prepare('DELETE FROM object_deletion_queue WHERE user_id=?').bind(owner.userId).run();
			await db.prepare('DELETE FROM account WHERE user_id=?').bind(owner.userId).run();
			await userDb.prepare('DELETE FROM user WHERE user_id=?').bind(owner.userId).run();
		}
		for (const key of keys) await env.kv.delete(key);
	}
}

// Only interpose scheduling/bind measurement. Every SELECT/UPDATE and batch
// still runs on real workerd D1, including constraints and transactional rollback.
function observedContext(c, { beforeBatch, bindCounts = [], batchSizes = [] } = {}) {
	let intercepted = false;
	const mailDb = {
		prepare(sql) {
			const statement = db.prepare(sql);
			return new Proxy(statement, {
				get(target, property) {
					if (property === 'bind') return (...values) => {
						bindCounts.push(values.length);
						expect(values.length).toBeLessThanOrEqual(100);
						return target.bind(...values);
					};
					const value = Reflect.get(target, property);
					return typeof value === 'function' ? value.bind(target) : value;
				}
			});
		},
		async batch(statements) {
			batchSizes.push(statements.length);
			if (beforeBatch && !intercepted) { intercepted = true; await beforeBatch(); }
			return db.batch(statements);
		}
	};
	return { ...c, env: { ...c.env, MAIL_DB: mailDb } };
}

async function queue(key) {
	return (await db.prepare('SELECT * FROM object_deletion_queue WHERE object_key=? ORDER BY user_id').bind(key).all()).results;
}

describe('Production mail lifecycle on independent real D1 databases', () => {
	it('records entry times once, clears snooze, and preserves mode-0 plaintext/encrypted transitions', async () => {
		await withFixture(async f => {
			const key = await emailCryptoUtils.getUserEmailCryptoKey(f.c.env, f.owner.userId);
			const encrypted = await emailCryptoUtils.encryptEmailRecord({ subject: 'private', content: '<p>private</p>', text: 'private', code: '123' }, key);
			const id = await f.mail({ ...encrypted, status: emailConst.status.DELIVERED, trashedAt: OLD,
				snoozedTime: OLD, snoozedEndTime: OLD });
			const moved = await lifecycle.moveToTrash(f.c, { emailIds: `${id},${id}` }, f.owner.userId);
			expect(moved).toHaveLength(1);
			const first = await read(id);
			expect(first).toMatchObject({ is_del: 1, subject: 'private', text: 'private', snoozed_time: null, snoozed_end_time: null });
			expect(Date.parse(first.trashed_at)).toBeGreaterThan(Date.now() - 60000);
			await db.prepare('UPDATE email SET trashed_at=? WHERE email_id=?').bind(OLD, id).run();
			expect(await lifecycle.moveToTrash(f.c, { emailIds: [id] }, f.owner.userId)).toEqual([]);
			expect((await read(id)).trashed_at).toBe(OLD);
			await lifecycle.setMailSpam(f.c, { emailIds: [id], isSpam: 'true' }, f.owner.userId);
			const spam = await read(id);
			expect(spam.spam_at).toBeTruthy();
			expect(spam.trashed_at).toBe(OLD);
			await db.prepare('UPDATE email SET spam_at=? WHERE email_id=?').bind(OLD, id).run();
			expect(await lifecycle.setMailSpam(f.c, { emailIds: [id], isSpam: 1 }, f.owner.userId)).toEqual([]);
			expect((await read(id)).spam_at).toBe(OLD);
			await lifecycle.setMailSpam(f.c, { emailIds: [id], isSpam: 'false' }, f.owner.userId);
			expect(await read(id)).toMatchObject({ is_del: 1, is_spam: 0, spam_at: null, trashed_at: OLD, subject: 'private' });
			const restored = await lifecycle.restoreMail(f.c, { emailIds: [id] }, f.owner.userId);
			expect(restored).toHaveLength(1);
			expect(restored[0]).toMatchObject({ emailId: id, sendEmail: 'Sender <sender@local.test>', isDel: 0, isSpam: 0, trashedAt: null, spamAt: null });
			expect((await read(id)).subject).toMatch(/^enc:v1:/);
			expect((await emailCryptoUtils.decryptEmailRecord(await read(id), key)).subject).toBe('private');
			expect(await lifecycle.restoreMail(f.c, { emailIds: [id] }, f.owner.userId)).toEqual([]);
			await lifecycle.moveToTrash(f.c, { emailIds: id }, f.owner.userId);
			expect((await read(id)).trashed_at).not.toBe(OLD);
		}, { allMailMode: 0 });
	});

	it('never physically deletes for false-like values and requires an explicit true physical flag', async () => {
		await withFixture(async f => {
			const id = await f.mail();
			const key = await f.attachment(id);
			await f.star(id);
			const storageDelete = vi.spyOn(r2Service, 'delete');
			for (const physical of [undefined, false, 0, '0', 'false', '', 'yes', '2']) {
				await lifecycle.moveToTrash(f.c, { emailIds: [id], physical }, f.owner.userId);
				expect(await read(id)).toMatchObject({ is_del: 1 });
				expect(await count('attachments', id)).toBe(1);
				expect(await count('star', id)).toBe(1);
				expect(await queue(key)).toEqual([]);
			}
			await lifecycle.moveToTrash(f.c, { emailIds: [id], physical: '1' }, f.owner.userId);
			expect(await read(id)).toBeNull();
			expect(await queue(key)).toHaveLength(1);
			expect(await env.kv.get(key)).toBe('blob');
			expect(storageDelete).not.toHaveBeenCalled();
			for (const physical of [true, 1, 'true']) {
				const other = await f.mail();
				await lifecycle.moveToTrash(f.c, { emailIds: other, physical }, f.owner.userId);
				expect(await read(other)).toBeNull();
			}
		});
	});

	it('uses spam_at then a fresh trash window, never create_time or legacy NULL/invalid entry times', async () => {
		await withFixture(async f => {
			const now = new Date().toISOString();
			const spamOld = await f.mail({ isSpam: 1, spamAt: OLD });
			const trashOld = await f.mail({ isDel: 1, trashedAt: OLD });
			const key = await f.attachment(trashOld);
			await f.star(trashOld);
			const kept = [];
			for (const timestamp of [null, now, 'not-a-time']) {
				kept.push(await f.mail({ isSpam: 1, spamAt: timestamp }));
				kept.push(await f.mail({ isDel: 1, trashedAt: timestamp }));
			}
			expect(await lifecycle.clearTrashAndSpam(f.c)).toMatchObject({ spamMoved: 1, trashDeleted: 1 });
			expect(await read(trashOld)).toBeNull();
			expect(await count('star', trashOld)).toBe(0);
			expect(await queue(key)).toHaveLength(1);
			const moved = await read(spamOld);
			expect(moved).toMatchObject({ is_del: 1, is_spam: 1, spam_at: OLD });
			expect(Date.parse(moved.trashed_at)).toBeGreaterThan(Date.now() - 60000);
			expect(await lifecycle.clearTrashAndSpam(f.c)).toMatchObject({ spamMoved: 0, trashDeleted: 0 });
			for (const id of kept) expect(await read(id)).not.toBeNull();
			await db.prepare('UPDATE email SET trashed_at=? WHERE email_id=?').bind(OLD, spamOld).run();
			expect(await lifecycle.clearTrashAndSpam(f.c)).toMatchObject({ trashDeleted: 1 });
			expect(await read(spamOld)).toBeNull();
		}, { spamRetentionDays: 3 });
	});

	it('does not decrypt mode-2 trash and encrypts mode-0 inbox when spam is removed', async () => {
		await withFixture(async f => {
			const key = await emailCryptoUtils.getUserEmailCryptoKey(f.c.env, f.owner.userId);
			const encoded = await emailCryptoUtils.encryptEmailRecord({ subject: 'secret' }, key);
			const id = await f.mail(encoded);
			await lifecycle.moveToTrash(f.c, { emailIds: [id] }, f.owner.userId);
			expect((await read(id)).subject).toBe(encoded.subject);
		}, { allMailMode: 2 });
		await withFixture(async f => {
			const id = await f.mail({ isSpam: 1, spamAt: OLD });
			await lifecycle.setMailSpam(f.c, { emailIds: [id], isSpam: 0 }, f.owner.userId);
			expect(await read(id)).toMatchObject({ is_del: 0, is_spam: 0, spam_at: null });
			expect((await read(id)).subject).toMatch(/^enc:v1:/);
		}, { allMailMode: 0 });
	});

	it('scopes all production operations to the owner and makes repeated deletes no-ops', async () => {
		await withFixture(async f => {
			const other = await f.seedOwner();
			const id = await f.mail({ isDel: 1, isSpam: 1, trashedAt: OLD, spamAt: OLD }, other);
			const key = await f.attachment(id, undefined, other);
			await f.star(id);
			const original = await read(id);
			for (const action of [
				() => lifecycle.moveToTrash(f.c, { emailIds: [id] }, f.owner.userId),
				() => lifecycle.setMailSpam(f.c, { emailIds: [id], isSpam: false }, f.owner.userId),
				() => lifecycle.restoreMail(f.c, { emailIds: [id] }, f.owner.userId),
				() => lifecycle.cascadeDeleteEmails(f.c, f.owner.userId, [id])
			]) expect(await action()).toEqual([]);
			expect(await read(id)).toEqual(original);
			expect(await count('attachments', id)).toBe(1);
			expect(await count('star', id)).toBe(1);
			expect(await queue(key)).toEqual([]);
			expect(await lifecycle.cascadeDeleteEmails(f.c, other.userId, [id, id, 0, -1, 'invalid'])).toHaveLength(1);
			expect(await lifecycle.cascadeDeleteEmails(f.c, other.userId, [id])).toEqual([]);
			expect(await queue(key)).toHaveLength(1);
		});
	});

	it('rolls back GC when restore wins after candidate selection, preserving attachments and objects', async () => {
		await withFixture(async f => {
			const id = await f.mail({ isDel: 1, trashedAt: OLD });
			const key = await f.attachment(id);
			await f.star(id);
			const c = observedContext(f.c, { beforeBatch: async () => {
				expect(await lifecycle.restoreMail(f.c, { emailIds: [id] }, f.owner.userId)).toHaveLength(1);
			} });
			expect(await lifecycle.clearTrashAndSpam(c)).toMatchObject({ trashDeleted: 0, conflicted: 1 });
			expect(await read(id)).toMatchObject({ is_del: 0, trashed_at: null });
			expect((await read(id)).subject).toMatch(/^enc:v1:/);
			expect(await count('attachments', id)).toBe(1);
			expect(await count('star', id)).toBe(1);
			expect(await queue(key)).toEqual([]);
			expect(await env.kv.get(key)).toBe('blob');
		}, { allMailMode: 0 });
	});

	it('does not resurrect a deleted row when GC wins while restore is encrypting', async () => {
		await withFixture(async f => {
			const id = await f.mail({ isDel: 1, trashedAt: OLD });
			const key = await f.attachment(id);
			const encrypt = emailCryptoUtils.encryptEmailRecord.bind(emailCryptoUtils);
			vi.spyOn(emailCryptoUtils, 'encryptEmailRecord').mockImplementationOnce(async (row, cryptoKey) => {
				expect(await lifecycle.clearTrashAndSpam(f.c)).toMatchObject({ trashDeleted: 1 });
				return encrypt(row, cryptoKey);
			});
			expect(await lifecycle.restoreMail(f.c, { emailIds: [id] }, f.owner.userId)).toEqual([]);
			expect(await read(id)).toBeNull();
			expect(await queue(key)).toHaveLength(1);
		}, { allMailMode: 0 });
	});

	it('rolls back email, attachments, stars and outbox together when a late batch statement fails', async () => {
		await withFixture(async f => {
			const ids = [await f.mail(), await f.mail()];
			const keys = [];
			for (const id of ids) { keys.push(await f.attachment(id)); await f.star(id); }
			await db.prepare("INSERT INTO object_deletion_queue(object_key,user_id,status,attempts) VALUES (?,?,'failed',10)").bind(keys[0], f.owner.userId).run();
			const trigger = `lifecycle_rollback_${crypto.randomUUID().replaceAll('-', '')}`;
			f.triggers.push(trigger);
			await db.prepare(`CREATE TRIGGER ${trigger} BEFORE DELETE ON email WHEN OLD.email_id=${ids[1]}
				BEGIN SELECT RAISE(ABORT, 'lifecycle late batch fault'); END`).run();
			await expect(lifecycle.cascadeDeleteEmails(f.c, f.owner.userId, ids)).rejects.toThrow(/lifecycle late batch fault/);
			for (const id of ids) {
				expect(await read(id)).not.toBeNull();
				expect(await count('attachments', id)).toBe(1);
				expect(await count('star', id)).toBe(1);
			}
			expect((await queue(keys[0]))[0]).toMatchObject({ status: 'failed', attempts: 10 });
			expect(await queue(keys[1])).toEqual([]);
			expect((await db.prepare('SELECT COUNT(*) AS n FROM mail_transaction_guard').first()).n).toBe(0);
			await db.prepare(`DROP TRIGGER ${trigger}`).run();
			expect(await lifecycle.cascadeDeleteEmails(f.c, f.owner.userId, ids)).toHaveLength(2);
			expect((await queue(keys[0]))[0]).toMatchObject({ status: 'pending', attempts: 0 });
		});
	});

	it('protects SAVING/nonterminal archives and retains terminal tasks, receipts and inbound dedupe', async () => {
		await withFixture(async f => {
			const protectedIds = [await f.mail({ status: emailConst.status.SAVING, isDel: 1, trashedAt: OLD })];
			for (const state of ['PREPARED', 'SENDING', 'UNKNOWN']) {
				const id = await f.mail({ isDel: 1, trashedAt: OLD });
				await f.task(state, id, { linkFromEmail: state !== 'UNKNOWN' });
				protectedIds.push(id);
			}
			const missingTask = await f.mail({ isDel: 1, trashedAt: OLD, outboundTaskId: crypto.randomUUID() });
			protectedIds.push(missingTask);
			const claimKey = crypto.randomUUID();
			const inbound = await f.mail({ isDel: 1, trashedAt: OLD, receiveClaimKey: claimKey });
			await db.prepare(`INSERT INTO mail_receive_claim
				(claim_key,recipient,raw_sha256,raw_object_key,raw_expires_at,user_id,account_id,state,email_id)
				VALUES (?,'lifecycle@local.test','test-only','unused-test-raw-key',0,?,?,'SAVING',?)`)
				.bind(claimKey, f.owner.userId, f.owner.accountId, inbound).run();
			protectedIds.push(inbound);
			for (const id of protectedIds) { await f.attachment(id); await f.star(id); }
			expect(await lifecycle.cascadeDeleteEmails(f.c, f.owner.userId, protectedIds)).toEqual([]);
			expect(await lifecycle.restoreMail(f.c, { emailIds: protectedIds }, f.owner.userId)).toEqual([]);
			expect(await lifecycle.setMailSpam(f.c, { emailIds: protectedIds, isSpam: 1 }, f.owner.userId)).toEqual([]);
			expect(await lifecycle.clearTrashAndSpam(f.c)).toMatchObject({ trashDeleted: 0 });
			for (const id of protectedIds) { expect(await read(id)).not.toBeNull(); expect(await count('attachments', id)).toBe(1); }
			const accepted = await f.mail({ isDel: 1, trashedAt: OLD });
			const taskId = await f.task('ACCEPTED', accepted);
			await db.prepare("INSERT INTO mail_local_delivery(task_id,recipient,email_id,state) VALUES (?,'receipt@local.test',?,'DELIVERED')").bind(taskId, accepted).run();
			await db.prepare("UPDATE mail_receive_claim SET state='COMPLETE' WHERE claim_key=?").bind(claimKey).run();
			expect(await lifecycle.cascadeDeleteEmails(f.c, f.owner.userId, [accepted, inbound])).toHaveLength(2);
			expect(await db.prepare('SELECT state FROM mail_outbound_task WHERE task_id=?').bind(taskId).first()).toEqual({ state: 'ACCEPTED' });
			expect(await db.prepare('SELECT email_id FROM mail_local_delivery WHERE task_id=?').bind(taskId).first()).toEqual({ email_id: accepted });
			expect(await db.prepare('SELECT state FROM mail_receive_claim WHERE claim_key=?').bind(claimKey).first()).toEqual({ state: 'COMPLETE' });
		});
	});

	it('rechecks task state inside the deletion transaction and includes newly committed attachment metadata', async () => {
		await withFixture(async f => {
			const id = await f.mail({ isDel: 1, trashedAt: OLD });
			const taskId = await f.task('ACCEPTED', id);
			const blocked = observedContext(f.c, { beforeBatch: () => db.prepare("UPDATE mail_outbound_task SET state='PREPARED' WHERE task_id=?").bind(taskId).run() });
			expect(await lifecycle.cascadeDeleteEmails(blocked, f.owner.userId, [id])).toEqual([]);
			expect(await read(id)).not.toBeNull();
			await db.prepare("UPDATE mail_outbound_task SET state='ACCEPTED' WHERE task_id=?").bind(taskId).run();
			let key;
			const added = observedContext(f.c, { beforeBatch: async () => { key = await f.attachment(id); } });
			expect(await lifecycle.cascadeDeleteEmails(added, f.owner.userId, [id])).toHaveLength(1);
			expect(await queue(key)).toHaveLength(1);
			expect(await count('attachments', id)).toBe(0);
		});
	});

	it('keeps shared objects, then reliably retries the queued final-reference deletion on real KV', async () => {
		await withFixture(async f => {
			const other = await f.seedOwner();
			const one = await f.mail();
			const two = await f.mail({}, other);
			const key = await f.attachment(one);
			await f.attachment(two, key, other);
			await lifecycle.cascadeDeleteEmails(f.c, f.owner.userId, [one]);
			expect(await queue(key)).toHaveLength(1);
			expect(await attService.drainObjectDeletionQueue(f.c)).toMatchObject({ skipped: 1, deleted: 0 });
			expect(await env.kv.get(key)).toBe('blob');
			await lifecycle.cascadeDeleteEmails(f.c, other.userId, [two]);
			vi.spyOn(r2Service, 'delete').mockRejectedValueOnce(new Error('test-only object outage'));
			expect(await attService.drainObjectDeletionQueue(f.c)).toMatchObject({ failed: 1 });
			expect((await queue(key))[0]).toMatchObject({ user_id: other.userId, status: 'pending', attempts: 1 });
			expect(await env.kv.get(key)).toBe('blob');
			await db.prepare('UPDATE object_deletion_queue SET next_retry_at=? WHERE object_key=?').bind(OLD, key).run();
			expect(await attService.drainObjectDeletionQueue(f.c)).toMatchObject({ deleted: 1 });
			expect(await env.kv.get(key)).toBeNull();
			expect(await queue(key)).toEqual([]);
		});
	});

	it('preserves the attachment BYO owner and refuses ambiguous cross-owner object deletion', async () => {
		await withFixture(async f => {
			const storageOwner = await f.seedOwner();
			const id = await f.mail();
			const key = await f.attachment(id, undefined, storageOwner);
			const survivor = await f.mail();
			await f.attachment(survivor, key);
			vi.spyOn(r2Service, 'resolveStorage').mockResolvedValue({ type: 'USER_S3', config: {} });
			const deleted = vi.spyOn(r2Service, 'delete').mockResolvedValue(undefined);
			await lifecycle.cascadeDeleteEmails(f.c, f.owner.userId, [id]);
			expect((await queue(key))[0]).toMatchObject({ user_id: storageOwner.userId });
			expect(await attService.drainObjectDeletionQueue(f.c)).toMatchObject({ failed: 1 });
			expect(deleted).not.toHaveBeenCalled();
			expect((await queue(key))[0].last_error).toMatch(/ambiguous/);
			await lifecycle.cascadeDeleteEmails(f.c, f.owner.userId, [survivor]);
			await db.prepare('UPDATE object_deletion_queue SET next_retry_at=? WHERE object_key=?').bind(OLD, key).run();
			await attService.drainObjectDeletionQueue(f.c);
			expect(deleted.mock.calls.some(call => call[2] === storageOwner.userId)).toBe(true);
		});
	});

	it('bounds request bindings and cron work and converges through repeated invocations', async () => {
		await withFixture(async f => {
			const ids = [];
			for (let i = 0; i < 115; i++) ids.push(await f.mail({ isDel: 1, trashedAt: OLD }));
			const bindCounts = [];
			const batchSizes = [];
			const c = observedContext(f.c, { bindCounts, batchSizes });
			expect(await lifecycle.restoreMail(c, { emailIds: ids }, f.owner.userId)).toHaveLength(ids.length);
			expect(await lifecycle.moveToTrash(c, { emailIds: ids }, f.owner.userId)).toHaveLength(ids.length);
			await db.prepare('UPDATE email SET trashed_at=? WHERE user_id=?').bind(OLD, f.owner.userId).run();
			expect(await lifecycle.clearTrashAndSpam(c)).toMatchObject({ trashDeleted: MAIL_LIFECYCLE_LIMITS.cronPerPhase, limitReached: true });
			expect(await lifecycle.clearTrashAndSpam(c)).toMatchObject({ trashDeleted: MAIL_LIFECYCLE_LIMITS.cronPerPhase, limitReached: true });
			expect(await lifecycle.clearTrashAndSpam(c)).toMatchObject({ trashDeleted: 15, limitReached: false });
			expect(Math.max(...bindCounts)).toBeLessThanOrEqual(100);
			expect(batchSizes.every(size => size === 6)).toBe(true);
			const retained = await f.mail();
			await expect(lifecycle.cascadeDeleteEmails(c, f.owner.userId,
				Array.from({ length: MAIL_LIFECYCLE_LIMITS.requestIds + 1 }, (_, i) => retained + i)))
				.rejects.toMatchObject({ errorCode: 'mail_lifecycle_selection_limit' });
			expect(await read(retained)).not.toBeNull();
		});
	});

	it('administrator deletion uses a fixed ID snapshot and cleans attachments', async () => {
		await withFixture(async f => {
			const target = await f.mail({ subject: 'admin-delete-target' });
			const survivor = await f.mail({ subject: 'admin-delete-survivor' });
			const key = await f.attachment(target);
			await f.star(target);

			const deleted = await lifecycle.cascadeDeleteSystemEmails(f.c, [target]);
			expect(deleted).toHaveLength(1);
			expect(await read(target)).toBeNull();
			expect(await read(survivor)).not.toBeNull();
			expect(await count('attachments', target)).toBe(0);
			expect(await count('star', target)).toBe(0);
			const queued = await db.prepare('SELECT object_key FROM object_deletion_queue WHERE object_key=?').bind(key).first();
			expect(queued?.object_key).toBe(key);
		});
	});

	it('blocks a system storage change while any mail or object deletion remains', async () => {
		await withFixture(async f => {
			const id = await f.mail();
			const key = await f.attachment(id);
			await expect(assertSystemStorageCanChange(f.c)).rejects.toMatchObject({ code: 409 });
			await lifecycle.cascadeDeleteSystemEmails(f.c, [id]);
			await expect(assertSystemStorageCanChange(f.c)).rejects.toMatchObject({ code: 409 });
			await db.prepare('DELETE FROM object_deletion_queue WHERE object_key=?').bind(key).run();
			await expect(assertSystemStorageCanChange(f.c)).resolves.toBeUndefined();
		});
	});
});
