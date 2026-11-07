import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { getMailDb, getUserDb } from '../src/utils/db-accessor.js';
import { ensureMailReliabilitySchema } from '../src/utils/mail-reliability-schema.js';
import {
	prepareOutboundTask, reserveSendCount, claimPreparation, claimOutboundTask,
	maintainOutboundTasks, retireOutboundForUser
} from '../src/service/mail-outbound-service.js';
import { emailConst } from '../src/const/entity-const.js';

const c = { env: { ...env, orm_log: false } };
const db = getMailDb(c);
const userDb = getUserDb(c);

// This spec is independently runnable: the production migration owns the task,
// reservation, guard and outbox tables, and this file owns all base fixtures.
beforeAll(async () => {
	await userDb.prepare(`CREATE TABLE IF NOT EXISTS user (
		user_id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL,type INTEGER NOT NULL DEFAULT 1,
		password TEXT NOT NULL,salt TEXT NOT NULL,status INTEGER NOT NULL DEFAULT 0,
		create_time TEXT DEFAULT CURRENT_TIMESTAMP,active_time TEXT,create_ip TEXT,active_ip TEXT,
		os TEXT,browser TEXT,device TEXT,sort TEXT DEFAULT '0',send_count TEXT DEFAULT '0',
		reg_key_id INTEGER NOT NULL DEFAULT 0,is_del INTEGER NOT NULL DEFAULT 0,
		custom_labels TEXT NOT NULL DEFAULT '[]',totp_enabled INTEGER NOT NULL DEFAULT 0,
		totp_secret TEXT NOT NULL DEFAULT '',totp_key_version INTEGER NOT NULL DEFAULT 1,
		totp_backup_codes TEXT NOT NULL DEFAULT '[]',totp_created_at TEXT NOT NULL DEFAULT '',
		security_keys TEXT NOT NULL DEFAULT '[]',auth_version INTEGER NOT NULL DEFAULT 0,
		passkey_history INTEGER NOT NULL DEFAULT 0,storage_quota_mb INTEGER NOT NULL DEFAULT 0,
		byo_storage_enabled INTEGER NOT NULL DEFAULT 0,byo_storage_config TEXT NOT NULL DEFAULT '{}'
	)`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS account (
		account_id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL,name TEXT NOT NULL DEFAULT '',
		status INTEGER NOT NULL DEFAULT 0,latest_email_time TEXT,create_time TEXT DEFAULT CURRENT_TIMESTAMP,
		user_id INTEGER NOT NULL,all_receive INTEGER NOT NULL DEFAULT 0,sort INTEGER NOT NULL DEFAULT 0,
		is_del INTEGER NOT NULL DEFAULT 0
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
	await db.prepare(`CREATE TABLE IF NOT EXISTS attachments (
		att_id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,email_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL,key TEXT NOT NULL,filename TEXT,mime_type TEXT,size INTEGER,
		status TEXT NOT NULL DEFAULT '0',type INTEGER NOT NULL DEFAULT 0,disposition TEXT,related TEXT,
		content_id TEXT,encoding TEXT,create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`).run();
	await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_outbound_task
		ON email(outbound_task_id) WHERE outbound_task_id IS NOT NULL`).run();
	await ensureMailReliabilitySchema(c);
});

async function cleanup(f) {
	const errors = [];
	const attempt = async (label, operation) => {
		try { await operation(); }
		catch (cause) { errors.push(new Error(`Outbound maintenance cleanup failed: ${label}`, { cause })); }
	};
	await attempt('restore mocks', () => vi.restoreAllMocks());
	for (const taskId of f.taskIds) {
		await attempt('receipt', () => db.prepare('DELETE FROM mail_local_delivery WHERE task_id=?').bind(taskId).run());
		await attempt('send reservation', () => userDb.prepare('DELETE FROM mail_send_quota_reservation WHERE task_id=?').bind(taskId).run());
	}
	if (f.userId) {
		for (const table of ['attachments', 'email', 'account', 'object_deletion_queue', 'mail_receive_claim', 'mail_outbound_task']) {
			await attempt(table, () => db.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(f.userId).run());
		}
		await attempt('user send reservation', () => userDb.prepare('DELETE FROM mail_send_quota_reservation WHERE user_id=?').bind(f.userId).run());
		await attempt('user', () => userDb.prepare('DELETE FROM user WHERE user_id=?').bind(f.userId).run());
		await attempt('verify base fixture removal', async () => {
			const mail = await db.prepare(`SELECT (SELECT COUNT(*) FROM email WHERE user_id=?) +
				(SELECT COUNT(*) FROM attachments WHERE user_id=?) + (SELECT COUNT(*) FROM account WHERE user_id=?) +
				(SELECT COUNT(*) FROM mail_outbound_task WHERE user_id=?) + (SELECT COUNT(*) FROM object_deletion_queue WHERE user_id=?) +
				(SELECT COUNT(*) FROM mail_receive_claim WHERE user_id=?) AS n`)
				.bind(f.userId, f.userId, f.userId, f.userId, f.userId, f.userId).first();
			expect(mail.n).toBe(0);
			const identity = await userDb.prepare(`SELECT (SELECT COUNT(*) FROM user WHERE user_id=?) +
				(SELECT COUNT(*) FROM mail_send_quota_reservation WHERE user_id=?) AS n`).bind(f.userId, f.userId).first();
			expect(identity.n).toBe(0);
		});
	}
	await attempt('transaction guards', async () => {
		for (const row of (await db.prepare('SELECT token FROM mail_transaction_guard').all()).results || []) {
			if (!f.guardTokens.has(row.token)) await db.prepare('DELETE FROM mail_transaction_guard WHERE token=?').bind(row.token).run();
		}
	});
	for (const taskId of f.taskIds) {
		await attempt('verify receipt removal', async () => {
			expect((await db.prepare('SELECT COUNT(*) AS n FROM mail_local_delivery WHERE task_id=?').bind(taskId).first()).n).toBe(0);
		});
	}
	if (errors.length) throw new AggregateError(errors, 'Outbound maintenance fixture cleanup was incomplete');
}

async function withFixture(run) {
	const f = { id: crypto.randomUUID(), userId: null, accountId: null, taskIds: new Set(), guardTokens: new Set() };
	const errors = [];
	let network;
	try {
		f.guardTokens = new Set(((await db.prepare('SELECT token FROM mail_transaction_guard').all()).results || []).map(row => row.token));
		network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access in outbound maintenance test'));
		const address = `maintenance-${f.id}@test.invalid`;
		const owner = await userDb.prepare(`INSERT INTO user(email,password,salt,status,is_del,send_count)
			VALUES (?,'local-only-not-a-login-password',?,0,0,'0')`).bind(address, f.id).run();
		f.userId = Number(owner.meta.last_row_id);
		const account = await db.prepare('INSERT INTO account(email,name,user_id,status,is_del) VALUES (?, ?, ?,0,0)')
			.bind(address, 'Maintenance fixture', f.userId).run();
		f.accountId = Number(account.meta.last_row_id);
		await run(f);
		const guards = (await db.prepare('SELECT token FROM mail_transaction_guard').all()).results || [];
		expect(guards.filter(row => !f.guardTokens.has(row.token))).toEqual([]);
	} catch (cause) {
		errors.push(cause);
	} finally {
		try { if (network) expect(network).not.toHaveBeenCalled(); }
		catch (cause) { errors.push(cause); }
		try { await cleanup(f); }
		catch (cause) { errors.push(cause); }
	}
	if (errors.length === 1) throw errors[0];
	if (errors.length) throw new AggregateError(errors, 'Outbound maintenance assertion and/or cleanup failed');
}

async function prepared(f) {
	const result = await prepareOutboundTask(c, {
		userId: f.userId, accountId: f.accountId, idempotencyKey: `maintenance-${crypto.randomUUID()}`,
		contentHash: `hash-${crypto.randomUUID()}`, payload: { route: 'external', recipients: ['recipient@test.invalid'] },
		reservedBytes: 37, maxStorageBytes: 1024 * 1024, maxEmails: 100, bypassStorage: false
	});
	const taskId = result.task.task_id;
	f.taskIds.add(taskId);
	const archive = await db.prepare(`INSERT INTO email(user_id,account_id,subject,text,content,type,status,outbound_task_id)
		VALUES (?,?,'maintenance','body','<p>body</p>',?,?,?)`)
		.bind(f.userId, f.accountId, emailConst.type.SEND, emailConst.status.SAVING, taskId).run();
	const emailId = Number(archive.meta.last_row_id);
	await db.prepare('UPDATE mail_outbound_task SET email_id=? WHERE task_id=?').bind(emailId, taskId).run();
	await reserveSendCount(c, { taskId, userId: f.userId, quantity: 2, maxCount: 100, daily: false });
	return { taskId, emailId };
}

const taskRow = task => db.prepare('SELECT * FROM mail_outbound_task WHERE task_id=?').bind(task.taskId).first();
const archive = task => db.prepare('SELECT * FROM email WHERE email_id=?').bind(task.emailId).first();
const reservation = task => userDb.prepare('SELECT * FROM mail_send_quota_reservation WHERE task_id=?').bind(task.taskId).first();
const sendCount = async f => Number((await userDb.prepare('SELECT send_count FROM user WHERE user_id=?').bind(f.userId).first()).send_count);

describe('Real D1 outbound task maintenance', () => {
	it('expires a PREPARED task older than one day, marks its archive failed and compensates its send count only once', () => withFixture(async f => {
		const task = await prepared(f);
		await db.prepare("UPDATE mail_outbound_task SET updated_at=datetime('now','-25 hours'),lease_until=0 WHERE task_id=?").bind(task.taskId).run();
		expect(await sendCount(f)).toBe(2);
		await maintainOutboundTasks(c);
		expect(await taskRow(task)).toMatchObject({ state: 'FAILED', reserved_bytes: 0, reserved_count: 0, lease_until: 0, quota_reconciled: 1 });
		expect(await archive(task)).toMatchObject({ status: emailConst.status.FAILED, outbound_task_id: task.taskId });
		expect(await reservation(task)).toMatchObject({ quantity: 2, state: 'released' });
		expect(await sendCount(f)).toBe(0);
		const terminal = await taskRow(task);
		await maintainOutboundTasks(c);
		await maintainOutboundTasks(c);
		expect(await taskRow(task)).toEqual(terminal);
		expect(await reservation(task)).toMatchObject({ state: 'released' });
		expect(await sendCount(f)).toBe(0);
	}));

	it('quarantines expired external SENDING as UNKNOWN and never makes an ambiguous send dispatchable again', () => withFixture(async f => {
		const task = await prepared(f);
		const owned = await claimPreparation(c, task.taskId);
		await claimOutboundTask(c, task.taskId, owned.leaseToken);
		await db.prepare("UPDATE mail_outbound_task SET lease_until=unixepoch()-1,updated_at=datetime('now','-25 hours') WHERE task_id=?").bind(task.taskId).run();
		await maintainOutboundTasks(c);
		const unknown = await taskRow(task);
		expect(unknown).toMatchObject({ state: 'UNKNOWN', provider: 'external', lease_until: 0, quota_reconciled: 0, reserved_bytes: 37, reserved_count: 1 });
		for (let attempt = 0; attempt < 2; attempt++) {
			await expect(claimPreparation(c, task.taskId)).rejects.toMatchObject({ errorCode: 'provider_unknown' });
			await expect(claimOutboundTask(c, task.taskId, owned.leaseToken)).rejects.toMatchObject({ errorCode: 'outbound_lease_lost' });
			await maintainOutboundTasks(c);
		}
		expect(await taskRow(task)).toEqual(unknown);
		expect(await archive(task)).toMatchObject({ status: emailConst.status.SAVING });
		expect(await reservation(task)).toMatchObject({ state: 'reserved' });
		expect(await sendCount(f)).toBe(2);
	}));

	it('does not expire a recent preparation or an old preparation that still has an active lease', () => withFixture(async f => {
		const recent = await prepared(f);
		const leased = await prepared(f);
		await db.prepare("UPDATE mail_outbound_task SET updated_at=datetime('now','-23 hours') WHERE task_id=?").bind(recent.taskId).run();
		await db.prepare(`UPDATE mail_outbound_task SET updated_at=datetime('now','-25 hours'),lease_token=?,lease_until=unixepoch()+300
			WHERE task_id=?`).bind(crypto.randomUUID(), leased.taskId).run();
		const before = [await taskRow(recent), await taskRow(leased)];
		await maintainOutboundTasks(c);
		expect([await taskRow(recent), await taskRow(leased)]).toEqual(before);
		for (const task of [recent, leased]) {
			expect(await archive(task)).toMatchObject({ status: emailConst.status.SAVING });
			expect(await reservation(task)).toMatchObject({ state: 'reserved' });
		}
		expect(await sendCount(f)).toBe(4);
	}));

	it('refuses account retirement while a SENDING lease is live even after user and MAIL_DB mailboxes are disabled', () => withFixture(async f => {
		const task = await prepared(f);
		const owned = await claimPreparation(c, task.taskId);
		await claimOutboundTask(c, task.taskId, owned.leaseToken);
		await userDb.prepare('UPDATE user SET status=1,is_del=1 WHERE user_id=?').bind(f.userId).run();
		await db.prepare('UPDATE account SET status=1,is_del=1 WHERE user_id=?').bind(f.userId).run();
		const before = await taskRow(task);
		const beforeArchive = await archive(task);
		await expect(retireOutboundForUser(c, f.userId)).rejects.toMatchObject({ errorCode: 'outbound_delete_pending' });
		expect(await taskRow(task)).toEqual(before);
		expect(await archive(task)).toEqual(beforeArchive);
		expect(await reservation(task)).toMatchObject({ state: 'reserved' });
		expect(await sendCount(f)).toBe(2);
		await db.prepare('UPDATE mail_outbound_task SET lease_until=unixepoch()-1 WHERE task_id=?').bind(task.taskId).run();
		await retireOutboundForUser(c, f.userId);
		expect(await taskRow(task)).toMatchObject({ state: 'FAILED', payload_json: '{}', reserved_bytes: 0, reserved_count: 0, lease_until: 0 });
		expect(await archive(task)).toMatchObject({ status: emailConst.status.FAILED });
		await maintainOutboundTasks(c);
		expect(await reservation(task)).toMatchObject({ state: 'released' });
		expect(await sendCount(f)).toBe(0);
	}));
});
