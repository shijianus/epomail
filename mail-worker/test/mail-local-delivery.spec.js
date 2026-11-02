import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { getMailDb, getUserDb } from '../src/utils/db-accessor.js';
import { ensureMailReliabilitySchema } from '../src/utils/mail-reliability-schema.js';
import { deliverLocalMail } from '../src/service/mail-local-delivery-service.js';
import { claimPreparation, claimOutboundTask } from '../src/service/mail-outbound-service.js';
import { attConst, emailConst, settingConst } from '../src/const/entity-const.js';
import settingService from '../src/service/setting-service.js';
import userService from '../src/service/user-service.js';
import roleService from '../src/service/role-service.js';
import r2Service from '../src/service/r2-service.js';
import attService from '../src/service/att-service.js';

const DOMAIN = 'local-delivery.test.invalid';
const c = { env: { ...env, orm_log: false, admin: `admin@${DOMAIN}`, email_enc_key: 'local-delivery-test-only-encryption-key' } };
const db = getMailDb(c);
const userDb = getUserDb(c);
const encoder = new TextEncoder();
const bodyBytes = row => ['subject', 'text', 'content', 'code']
	.reduce((total, field) => total + encoder.encode(row[field] || '').byteLength, 0);

// This file owns its complete fixture schema. No init call, other spec, shared
// fixture, production KV, object backend, or mail provider is involved.
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
	await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_receive_claim
		ON email(receive_claim_key) WHERE receive_claim_key IS NOT NULL`).run();
	await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_outbound_task
		ON email(outbound_task_id) WHERE outbound_task_id IS NOT NULL`).run();
	await ensureMailReliabilitySchema(c);
});

function byo(bucket, type = 'USER_S3') {
	return { type, config: {
		endpoint: 'https://objects.test.invalid', bucket, region: 'auto', forcePathStyle: 1,
		s3AccessKey: 'local-test-access-only', s3SecretKey: 'local-test-secret-only'
	} };
}

function fixture() {
	const f = {
		c, id: crypto.randomUUID(), userIds: new Set(), taskIds: new Set(), triggers: new Set(),
		users: new Map(), quotas: new Map(), storages: new Map(), objects: new Map(), guardTokens: new Set(),
		settings: { receive: settingConst.receive.OPEN, noRecipient: settingConst.noRecipient.CLOSE, allMailMode: 1 },
		role: { roleId: 1, availDomain: DOMAIN, banEmail: '' }
	};
	f.storage = userId => {
		const value = f.storages.get(Number(userId));
		if (!value) throw new Error('Local fixture storage owner is unavailable');
		return value;
	};
	// Keys alone are not an object locator: two BYO buckets must have separate
	// bytes even if their users happen to upload the same attachment key.
	f.location = (userId, key) => {
		const storage = f.storage(userId);
		const identity = ['S3', 'USER_S3'].includes(storage.type)
			? ['s3', storage.config.endpoint, storage.config.bucket, storage.config.region]
			: [storage.type, 'shared-system-storage'];
		return JSON.stringify([...identity, key]);
	};
	f.readObject = async (_c, key, userId) => {
		const object = f.objects.get(f.location(userId, key));
		return object ? new Response(object.bytes.slice()) : null;
	};
	f.putObject = async (_c, key, value, metadata, userId) => {
		const bytes = value instanceof Uint8Array ? value.slice() : new Uint8Array(value).slice();
		f.objects.set(f.location(userId, key), { bytes, metadata: { ...metadata } });
	};
	return f;
}

function installMocks(f) {
	f.network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access in local delivery test'));
	vi.spyOn(settingService, 'query').mockImplementation(async () => ({ ...f.settings }));
	// USER_DB is a separate authority. These snapshots include explicit status
	// and isDel; the tests do not invent an atomic transaction across two DBs.
	vi.spyOn(userService, 'selectByIdIncludeDel').mockImplementation(async (_c, userId) => {
		const owner = f.users.get(Number(userId));
		return owner ? { ...owner } : undefined;
	});
	vi.spyOn(userService, 'getUserQuota').mockImplementation(async (_c, userId) => {
		const quota = f.quotas.get(Number(userId));
		if (!quota) throw new Error('Local fixture quota owner is unavailable');
		return { ...quota };
	});
	vi.spyOn(roleService, 'selectById').mockImplementation(async () => ({ ...f.role }));
	vi.spyOn(r2Service, 'resolveStorage').mockImplementation(async (_c, userId) => f.storage(userId));
	vi.spyOn(r2Service, 'getObj').mockImplementation(f.readObject);
	vi.spyOn(r2Service, 'putObj').mockImplementation(f.putObject);
	vi.spyOn(r2Service, 'delete').mockImplementation(async (_c, keys, userId) => {
		for (const key of Array.isArray(keys) ? keys : [keys]) f.objects.delete(f.location(userId, key));
	});
}

async function cleanup(f) {
	const errors = [];
	const attempt = async (label, operation) => {
		try { await operation(); }
		catch (cause) { errors.push(new Error(`Local delivery cleanup failed: ${label}`, { cause })); }
	};
	// Restore fault/timing spies before issuing cleanup SQL; still attempt every
	// physical delete if any one cleanup step fails, then report all failures.
	await attempt('restore mocks', () => vi.restoreAllMocks());
	for (const name of f.triggers) await attempt(name, () => db.prepare(`DROP TRIGGER IF EXISTS ${name}`).run());
	for (const taskId of f.taskIds) {
		await attempt('mail_local_delivery', () => db.prepare('DELETE FROM mail_local_delivery WHERE task_id=?').bind(taskId).run());
		await attempt('task send quota', () => userDb.prepare('DELETE FROM mail_send_quota_reservation WHERE task_id=?').bind(taskId).run());
	}
	for (const userId of f.userIds) {
		for (const table of ['attachments', 'email', 'account', 'object_deletion_queue', 'mail_receive_claim', 'mail_outbound_task']) {
			await attempt(table, () => db.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(userId).run());
		}
		await attempt('user send quota', () => userDb.prepare('DELETE FROM mail_send_quota_reservation WHERE user_id=?').bind(userId).run());
		await attempt('user', () => userDb.prepare('DELETE FROM user WHERE user_id=?').bind(userId).run());
	}
	await attempt('transaction guards', async () => {
		const rows = (await db.prepare('SELECT token FROM mail_transaction_guard').all()).results || [];
		for (const row of rows) {
			if (!f.guardTokens.has(row.token)) await db.prepare('DELETE FROM mail_transaction_guard WHERE token=?').bind(row.token).run();
		}
	});
	for (const taskId of f.taskIds) {
		await attempt('verify receipt removal', async () => {
			expect((await db.prepare('SELECT COUNT(*) AS n FROM mail_local_delivery WHERE task_id=?').bind(taskId).first()).n).toBe(0);
		});
	}
	for (const userId of f.userIds) {
		await attempt('verify mail fixture removal', async () => {
			const row = await db.prepare(`SELECT
				(SELECT COUNT(*) FROM attachments WHERE user_id=?) + (SELECT COUNT(*) FROM email WHERE user_id=?) +
				(SELECT COUNT(*) FROM account WHERE user_id=?) + (SELECT COUNT(*) FROM object_deletion_queue WHERE user_id=?) +
				(SELECT COUNT(*) FROM mail_receive_claim WHERE user_id=?) + (SELECT COUNT(*) FROM mail_outbound_task WHERE user_id=?) AS n`)
				.bind(userId, userId, userId, userId, userId, userId).first();
			expect(row.n).toBe(0);
			const identity = await userDb.prepare(`SELECT (SELECT COUNT(*) FROM user WHERE user_id=?) +
				(SELECT COUNT(*) FROM mail_send_quota_reservation WHERE user_id=?) AS n`).bind(userId, userId).first();
			expect(identity.n).toBe(0);
		});
	}
	f.objects.clear();
	f.users.clear();
	f.quotas.clear();
	f.storages.clear();
	if (errors.length) throw new AggregateError(errors, 'Local delivery fixture cleanup was incomplete');
}

async function withFixture(run) {
	const f = fixture();
	const errors = [];
	try {
		f.guardTokens = new Set(((await db.prepare('SELECT token FROM mail_transaction_guard').all()).results || []).map(row => row.token));
		installMocks(f);
		await run(f);
		const guards = (await db.prepare('SELECT token FROM mail_transaction_guard').all()).results || [];
		expect(guards.filter(row => !f.guardTokens.has(row.token))).toEqual([]);
	} catch (cause) {
		errors.push(cause);
	} finally {
		try { if (f.network) expect(f.network).not.toHaveBeenCalled(); }
		catch (cause) { errors.push(cause); }
		try { await cleanup(f); }
		catch (cause) { errors.push(cause); }
	}
	if (errors.length === 1) throw errors[0];
	if (errors.length) throw new AggregateError(errors, 'Local delivery assertion and/or cleanup failed');
}

async function mailbox(f, label, storage = { type: 'R2', config: null }) {
	const address = `${label}-${f.id}@${DOMAIN}`;
	const result = await userDb.prepare(`INSERT INTO user(email,password,salt,type,status,is_del,custom_labels)
		VALUES (?,'local-only-not-a-login-password',?,1,0,0,'[]')`).bind(address, f.id).run();
	const userId = Number(result.meta.last_row_id);
	f.userIds.add(userId);
	f.users.set(userId, { userId, email: address, type: 1, status: 0, isDel: 0 });
	f.quotas.set(userId, { maxStorageBytes: 1024 * 1024, maxEmails: 100, quotaStorageBlocked: false, dbFull: false, bypassStorage: false, byoStorageEnabled: 0 });
	f.storages.set(userId, storage);
	const account = await db.prepare(`INSERT INTO account(email,name,user_id,status,is_del,all_receive)
		VALUES (?, ?, ?, 0, 0, 0)`).bind(address, label, userId).run();
	return { userId, accountId: Number(account.meta.last_row_id), address, normalized: address.toLowerCase() };
}

async function sendTask(f, owner, body = {}) {
	const taskId = `local-spec-${crypto.randomUUID()}`;
	const leaseToken = crypto.randomUUID();
	f.taskIds.add(taskId);
	const sender = {
		userId: owner.userId, accountId: owner.accountId, sendEmail: owner.address, name: 'Local sender',
		subject: 'Local subject', text: 'Local body', content: '<p>Local body</p>', code: '123456',
		inReplyTo: '<thread@test.invalid>', relation: 'local-thread', ...body, outboundTaskId: taskId
	};
	const archive = await db.prepare(`INSERT INTO email
		(user_id,account_id,send_email,name,subject,text,content,code,in_reply_to,relation,type,status,outbound_task_id,cc,bcc)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'["private-cc@test.invalid"]','["private-bcc@test.invalid"]')`)
		.bind(sender.userId, sender.accountId, sender.sendEmail, sender.name, sender.subject, sender.text, sender.content,
			sender.code, sender.inReplyTo, sender.relation, emailConst.type.SEND, emailConst.status.SAVING, taskId).run();
	sender.emailId = Number(archive.meta.last_row_id);
	await db.prepare(`INSERT INTO mail_outbound_task
		(task_id,user_id,account_id,idempotency_key,content_hash,state,provider,lease_token,lease_until,email_id,reserved_bytes,reserved_count,payload_json)
		VALUES (?,?,?,?,?,'SENDING','local',?,unixepoch()+300,?,0,0,'{"route":"local"}')`)
		.bind(taskId, owner.userId, owner.accountId, taskId, `hash-${taskId}`, leaseToken, sender.emailId).run();
	return { taskId, leaseToken, sender };
}

async function attachments(f, task, count = 2) {
	const rows = [];
	for (let i = 0; i < count; i++) {
		const inline = i === 0;
		const bytes = new Uint8Array([i + 1, 0, 255, 7]);
		const row = {
			userId: task.sender.userId, accountId: task.sender.accountId, emailId: task.sender.emailId,
			key: `attachments/${task.taskId}-${i}.${inline ? 'png' : 'bin'}`,
			filename: inline ? 'inline-image.png' : `attachment-${i}.bin`,
			mimeType: inline ? 'image/png' : 'application/octet-stream', size: bytes.byteLength,
			type: inline ? attConst.type.EMBED : attConst.type.ATT,
			contentId: inline ? `<image-${f.id}>` : null, disposition: inline ? 'inline' : 'attachment',
			related: inline ? 'multipart/related' : null, encoding: 'base64'
		};
		await db.prepare(`INSERT INTO attachments
			(user_id,account_id,email_id,key,filename,mime_type,size,type,content_id,disposition,related,encoding)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(row.userId, row.accountId, row.emailId, row.key, row.filename,
			row.mimeType, row.size, row.type, row.contentId, row.disposition, row.related, row.encoding).run();
		f.objects.set(f.location(row.userId, row.key), { bytes, metadata: { contentType: row.mimeType } });
		rows.push(row);
	}
	return rows;
}

const receipts = task => db.prepare('SELECT * FROM mail_local_delivery WHERE task_id=? ORDER BY recipient').bind(task.taskId).all().then(result => result.results || []);
const archive = task => db.prepare('SELECT * FROM email WHERE email_id=?').bind(task.sender.emailId).first();
const taskRow = task => db.prepare('SELECT * FROM mail_outbound_task WHERE task_id=?').bind(task.taskId).first();
const inbox = owner => db.prepare('SELECT * FROM email WHERE user_id=? AND receive_claim_key IS NOT NULL ORDER BY email_id').bind(owner.userId).all().then(result => result.results || []);
const attachmentRows = emailId => db.prepare('SELECT * FROM attachments WHERE email_id=? ORDER BY att_id').bind(emailId).all().then(result => result.results || []);
const queuedObjects = owner => db.prepare('SELECT * FROM object_deletion_queue WHERE user_id=? ORDER BY id').bind(owner.userId).all().then(result => result.results || []);
const deliver = (task, recipients, rows = []) => deliverLocalMail(c, recipients.map(item => typeof item === 'string' ? item : item.address), task.sender, rows, task);

async function expectPending(task, recipients) {
	expect(await receipts(task)).toEqual([]);
	expect(await taskRow(task)).toMatchObject({ state: 'SENDING' });
	for (const owner of recipients) {
		expect(await inbox(owner)).toEqual([]);
		expect((await db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE user_id=?').bind(owner.userId).first()).n).toBe(0);
	}
}

async function expectFinished(task, status = emailConst.status.DELIVERED) {
	expect(await archive(task)).toMatchObject({ status, outbound_task_id: task.taskId });
	expect(await taskRow(task)).toMatchObject({ state: 'ACCEPTED', provider: 'local', lease_until: 0, reserved_bytes: 0, reserved_count: 0 });
}

async function trigger(f, suffix, ddl) {
	const name = `local_spec_${f.id.replaceAll('-', '')}_${suffix}`;
	f.triggers.add(name);
	await db.prepare(`CREATE TRIGGER ${name} ${ddl}`).run();
	return name;
}

async function dropTrigger(f, name) {
	await db.prepare(`DROP TRIGGER ${name}`).run();
	f.triggers.delete(name);
}

async function retryWithNewLease(task) {
	// emailService.Send owns this recovery transition. Exercise the real lease
	// services afterwards rather than pretending the delivery entry owns it.
	const result = await db.prepare(`UPDATE mail_outbound_task SET state='PREPARED',lease_token=NULL,lease_until=0
		WHERE task_id=? AND provider='local' AND state='SENDING' AND lease_token=?`).bind(task.taskId, task.leaseToken).run();
	expect(result.meta.changes).toBe(1);
	expect(await taskRow(task)).toMatchObject({ state: 'PREPARED', lease_token: null });
	const owned = await claimPreparation(c, task.taskId);
	expect(owned.leaseToken).not.toBe(task.leaseToken);
	await claimOutboundTask(c, task.taskId, owned.leaseToken);
	task.leaseToken = owned.leaseToken;
}

async function quotaReservations(f, owner) {
	for (const [label, active] of [['live', true], ['expired', false]]) {
		await db.prepare(`INSERT INTO mail_receive_claim
			(claim_key,recipient,raw_sha256,raw_object_key,raw_expires_at,user_id,account_id,state,lease_token,lease_until,reserved_bytes,reserved_count)
			VALUES (?,?,?,'mail-raw/inbound/local-test.enc',unixepoch()+600,?,?,'CLAIMED',?,unixepoch()+?,?,?)`)
			.bind(`${f.id}-${label}`, owner.address, `${f.id}-${label}`, owner.userId, owner.accountId, crypto.randomUUID(),
				active ? 300 : -300, active ? 11 : 9000, active ? 1 : 99).run();
	}
	for (const [state, bytes, count] of [['PREPARED', 13, 1], ['FAILED', 9000, 99]]) {
		const taskId = `quota-${crypto.randomUUID()}`;
		f.taskIds.add(taskId);
		await db.prepare(`INSERT INTO mail_outbound_task
			(task_id,user_id,account_id,idempotency_key,content_hash,state,provider,reserved_bytes,reserved_count)
			VALUES (?,?,?,?,?,?,'external',?,?)`).bind(taskId, owner.userId, owner.accountId, taskId, taskId, state, bytes, count).run();
	}
}

describe('deliverLocalMail with real D1 transactions and local-only object storage', () => {
	it('normalizes mixed-case recipients, deduplicates them, and never copies the outbound task id', () => withFixture(async f => {
		const sender = await mailbox(f, 'sender');
		const recipient = await mailbox(f, 'MiXeD');
		const task = await sendTask(f, sender);
		const source = await attachments(f, task);
		const originalMetadata = await attachmentRows(task.sender.emailId);
		await db.prepare('UPDATE mail_outbound_task SET reserved_bytes=17,reserved_count=1 WHERE task_id=?').bind(task.taskId).run();
		const result = await deliver(task, [`  ${recipient.address.toUpperCase()}  `, recipient.normalized, recipient.address], source);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ recipient: recipient.normalized, state: 'DELIVERED' });
		const [received] = await inbox(recipient);
		expect(await inbox(recipient)).toHaveLength(1);
		expect(received).toMatchObject({ user_id: recipient.userId, account_id: recipient.accountId,
			to_email: recipient.normalized, type: emailConst.type.RECEIVE, status: emailConst.status.RECEIVE,
			outbound_task_id: null, subject: task.sender.subject, text: task.sender.text, content: task.sender.content,
			code: task.sender.code, in_reply_to: task.sender.inReplyTo, relation: task.sender.relation, cc: '[]', bcc: '[]' });
		expect(JSON.parse(received.recipient)).toEqual([{ address: recipient.normalized, name: '' }]);
		expect(received.receive_claim_key).toMatch(/^local:[a-f0-9]{64}$/);
		expect((await receipts(task))[0]).toMatchObject({ email_id: received.email_id });
		expect((await db.prepare('SELECT COUNT(*) AS n FROM email WHERE outbound_task_id=?').bind(task.taskId).first()).n).toBe(1);
		const cloned = await attachmentRows(received.email_id);
		expect(cloned).toHaveLength(source.length);
		for (const [i, row] of cloned.entries()) {
			expect(row).toMatchObject({ key: source[i].key, user_id: recipient.userId, account_id: recipient.accountId,
				size: source[i].size, type: source[i].type, content_id: source[i].contentId, encoding: source[i].encoding });
		}
		expect(await attachmentRows(task.sender.emailId)).toEqual(originalMetadata);
		expect(r2Service.getObj).toHaveBeenCalledTimes(source.length);
		expect(r2Service.putObj).not.toHaveBeenCalled();
		await expectFinished(task);
	}));

	it.each(['disabled user', 'deleted user', 'missing user', 'disabled account', 'deleted account', 'missing account'])(
		'bounces a %s without recipient mail or attachment metadata', state => withFixture(async f => {
			const sender = await mailbox(f, 'sender');
			const recipient = await mailbox(f, 'recipient');
			const task = await sendTask(f, sender);
			const source = await attachments(f, task, 1);
			if (state === 'missing user') {
				await userDb.prepare('DELETE FROM user WHERE user_id=?').bind(recipient.userId).run();
				f.users.delete(recipient.userId);
			} else if (state.endsWith('user')) {
				const disabled = state.startsWith('disabled');
				await userDb.prepare(`UPDATE user SET ${disabled ? 'status' : 'is_del'}=1 WHERE user_id=?`).bind(recipient.userId).run();
				f.users.get(recipient.userId)[disabled ? 'status' : 'isDel'] = 1;
			} else if (state === 'missing account') {
				await db.prepare('DELETE FROM account WHERE account_id=?').bind(recipient.accountId).run();
			} else {
				await db.prepare(`UPDATE account SET ${state.startsWith('disabled') ? 'status' : 'is_del'}=1 WHERE account_id=?`).bind(recipient.accountId).run();
			}
			await deliver(task, [recipient], source);
			expect(await receipts(task)).toMatchObject([{ recipient: recipient.normalized, state: 'BOUNCED', email_id: null,
				reason: state === 'missing account' ? 'Recipient not found' : 'Recipient is unavailable' }]);
			expect(await inbox(recipient)).toEqual([]);
			expect((await db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE user_id=?').bind(recipient.userId).first()).n).toBe(0);
			expect(r2Service.getObj).not.toHaveBeenCalled();
			expect(r2Service.putObj).not.toHaveBeenCalled();
			await expectFinished(task, emailConst.status.BOUNCED);
		}));

	it.each(['quotaStorageBlocked', 'dbFull'])('bounces when %s is authoritative', flag => withFixture(async f => {
		const sender = await mailbox(f, 'sender');
		const recipient = await mailbox(f, 'recipient');
		const task = await sendTask(f, sender);
		const source = await attachments(f, task, 1);
		f.quotas.get(recipient.userId)[flag] = true;
		await deliver(task, [recipient], source);
		expect(await receipts(task)).toMatchObject([{ state: 'BOUNCED', email_id: null, reason: 'Recipient storage is unavailable' }]);
		expect(await inbox(recipient)).toEqual([]);
		expect(r2Service.getObj).not.toHaveBeenCalled();
		await expectFinished(task, emailConst.status.BOUNCED);
	}));

	it.each(['maxStorageBytes', 'maxEmails'])('fails closed when quota field %s is missing', field => withFixture(async f => {
		const sender = await mailbox(f, 'sender');
		const recipient = await mailbox(f, 'recipient');
		const task = await sendTask(f, sender);
		const source = await attachments(f, task, 1);
		delete f.quotas.get(recipient.userId)[field];
		await expect(deliver(task, [recipient], source)).rejects.toMatchObject({ errorCode: 'quota_unavailable' });
		await expectPending(task, [recipient]);
		expect(await archive(task)).toMatchObject({ status: emailConst.status.SAVING });
		expect(r2Service.getObj).not.toHaveBeenCalled();
	}));

	it.each([
		['bytes', false], ['bytes', true], ['count', false], ['count', true]
	])('counts stored UTF-8 bodies, attachments and active reservations at the %s boundary (fits=%s)', (dimension, fits) => withFixture(async f => {
		const sender = await mailbox(f, 'sender');
		const recipient = await mailbox(f, 'recipient');
		const existingBody = { subject: '界', text: 'é', content: '😀', code: '' };
		const old = await db.prepare('INSERT INTO email(user_id,account_id,subject,text,content,code) VALUES (?,?,?,?,?,?)')
			.bind(recipient.userId, recipient.accountId, existingBody.subject, existingBody.text, existingBody.content, existingBody.code).run();
		const existing = { taskId: `existing-${f.id}`, sender: { ...recipient, emailId: Number(old.meta.last_row_id) } };
		const existingAttachments = await attachments(f, existing, 1);
		await quotaReservations(f, recipient);
		const task = await sendTask(f, sender, { subject: '中文😀', text: 'é', content: '<p>界</p>', code: '42' });
		const source = await attachments(f, task, 1);
		const neededBytes = bodyBytes(existingBody) + existingAttachments[0].size + 11 + 13 + bodyBytes(task.sender) + source[0].size;
		f.quotas.set(recipient.userId, { ...f.quotas.get(recipient.userId),
			maxStorageBytes: dimension === 'bytes' ? neededBytes - (fits ? 0 : 1) : 0,
			maxEmails: dimension === 'count' ? 4 - (fits ? 0 : 1) : 0 });
		await deliver(task, [recipient], source);
		expect(await receipts(task)).toMatchObject([{ state: fits ? 'DELIVERED' : 'BOUNCED' }]);
		expect(await inbox(recipient)).toHaveLength(fits ? 1 : 0);
		expect(await attachmentRows(existing.sender.emailId)).toHaveLength(1);
		expect((await db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE user_id=?').bind(recipient.userId).first()).n).toBe(fits ? 2 : 1);
		if (!fits) expect((await receipts(task))[0].reason).toBe('Recipient quota is exhausted');
		await expectFinished(task, fits ? emailConst.status.DELIVERED : emailConst.status.BOUNCED);
	}));

	it.each(['bytes', 'count'])('admits only one concurrent delivery to the last %s slot using the real D1 guard', dimension => withFixture(async f => {
		const sender = await mailbox(f, 'sender');
		const recipient = await mailbox(f, 'recipient');
		const tasks = [await sendTask(f, sender), await sendTask(f, sender)];
		const source = [await attachments(f, tasks[0], 1), await attachments(f, tasks[1], 1)];
		f.quotas.set(recipient.userId, { ...f.quotas.get(recipient.userId),
			maxStorageBytes: dimension === 'bytes' ? bodyBytes(tasks[0].sender) + source[0][0].size : 0,
			maxEmails: dimension === 'count' ? 1 : 0 });
		const realBatch = db.batch.bind(db);
		let arrivals = 0;
		let release;
		let timer;
		const gate = new Promise((resolve, reject) => {
			release = resolve;
			timer = setTimeout(() => reject(new Error('Both real D1 delivery batches did not reach the quota race barrier')), 5000);
		});
		// Only scheduling is controlled: both preflight reads see free quota,
		// and both original batches/constraints still execute against real D1.
		const timing = vi.spyOn(db, 'batch').mockImplementation(async statements => {
			if (arrivals < 2) {
				arrivals++;
				if (arrivals === 2) { clearTimeout(timer); release(); }
				await gate;
			}
			return realBatch(statements);
		});
		let settled;
		try { settled = await Promise.allSettled(tasks.map((task, i) => deliver(task, [recipient], source[i]))); }
		finally { clearTimeout(timer); release(); timing.mockRestore(); }
		expect(arrivals).toBe(2);
		expect(settled.filter(item => item.status === 'fulfilled')).toHaveLength(1);
		expect(settled.filter(item => item.status === 'rejected')).toHaveLength(1);
		expect(await inbox(recipient)).toHaveLength(1);
		expect((await db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE user_id=?').bind(recipient.userId).first()).n).toBe(1);
		const loserIndex = settled.findIndex(item => item.status === 'rejected');
		const loser = tasks[loserIndex];
		expect(await receipts(loser)).toEqual([]);
		expect(await archive(loser)).toMatchObject({ status: emailConst.status.SAVING });
		await retryWithNewLease(loser);
		await deliver(loser, [recipient], source[loserIndex]);
		expect(await receipts(loser)).toMatchObject([{ state: 'BOUNCED', reason: 'Recipient quota is exhausted' }]);
		const allReceipts = (await Promise.all(tasks.map(receipts))).flat();
		expect(allReceipts.filter(row => row.state === 'DELIVERED')).toHaveLength(1);
		expect(allReceipts.filter(row => row.state === 'BOUNCED')).toHaveLength(1);
		expect(await inbox(recipient)).toHaveLength(1);
		await expectFinished(loser, emailConst.status.BOUNCED);
	}));

	it.each(['external provider', 'missing archive', 'wrong sender', 'wrong account', 'expired lease', 'stale token'])(
		'rejects a %s without accepting or publishing the task', invalid => withFixture(async f => {
			const sender = await mailbox(f, 'sender');
			const recipient = await mailbox(f, 'recipient');
			const task = await sendTask(f, sender);
			if (invalid === 'external provider') await db.prepare("UPDATE mail_outbound_task SET provider='external' WHERE task_id=?").bind(task.taskId).run();
			if (invalid === 'missing archive') await db.prepare('DELETE FROM email WHERE email_id=?').bind(task.sender.emailId).run();
			if (invalid === 'wrong sender') task.sender.userId = recipient.userId;
			if (invalid === 'wrong account') task.sender.accountId = recipient.accountId;
			if (invalid === 'expired lease') await db.prepare('UPDATE mail_outbound_task SET lease_until=unixepoch()-1 WHERE task_id=?').bind(task.taskId).run();
			if (invalid === 'stale token') task.leaseToken = crypto.randomUUID();
			await expect(deliver(task, [recipient])).rejects.toThrow();
			await expectPending(task, [recipient]);
			expect(r2Service.putObj).not.toHaveBeenCalled();
		}));

	it.each(['status', 'is_del'])('rolls back when account.%s changes after its lookup but before publication', column => withFixture(async f => {
		const sender = await mailbox(f, 'sender');
		const recipient = await mailbox(f, 'recipient');
		const task = await sendTask(f, sender);
		const source = await attachments(f, task, 1);
		const realBatch = db.batch.bind(db);
		vi.spyOn(db, 'batch').mockImplementationOnce(async statements => {
			await db.prepare(`UPDATE account SET ${column}=1 WHERE account_id=?`).bind(recipient.accountId).run();
			return realBatch(statements);
		});
		await expect(deliver(task, [recipient], source)).rejects.toThrow();
		await expectPending(task, [recipient]);
		expect(await archive(task)).toMatchObject({ status: emailConst.status.SAVING });
	}));

	it('replays durable receipts under a new lease after sender finalization fails, without re-reading or duplicating mail', () => withFixture(async f => {
		const sender = await mailbox(f, 'sender');
		const recipient = await mailbox(f, 'recipient');
		const task = await sendTask(f, sender);
		const source = await attachments(f, task);
		const fault = await trigger(f, 'archive', `BEFORE UPDATE OF status ON email
			WHEN OLD.email_id=${task.sender.emailId} AND NEW.status<>${emailConst.status.SAVING}
			BEGIN SELECT RAISE(ABORT, 'local archive finalization fault'); END`);
		await expect(deliver(task, [recipient], source)).rejects.toThrow(/local archive finalization fault/);
		const before = await inbox(recipient);
		const metadata = await attachmentRows(before[0].email_id);
		const savedReceipts = await receipts(task);
		expect(before).toHaveLength(1);
		expect(savedReceipts).toMatchObject([{ state: 'DELIVERED', email_id: before[0].email_id }]);
		expect(await taskRow(task)).toMatchObject({ state: 'SENDING' });
		expect(await archive(task)).toMatchObject({ status: emailConst.status.SAVING });
		await dropTrigger(f, fault);
		await retryWithNewLease(task);
		r2Service.getObj.mockClear().mockRejectedValue(new Error('A replay must not read source objects'));
		userService.getUserQuota.mockClear().mockRejectedValue(new Error('A replay must not recompute recipient quota'));
		userService.selectByIdIncludeDel.mockClear().mockRejectedValue(new Error('A replay must use its existing receipt'));
		await deliver(task, [recipient.address.toUpperCase(), recipient.normalized], source);
		expect(await receipts(task)).toEqual(savedReceipts);
		expect(await inbox(recipient)).toEqual(before);
		expect(await attachmentRows(before[0].email_id)).toEqual(metadata);
		expect(r2Service.getObj).not.toHaveBeenCalled();
		expect(userService.getUserQuota).not.toHaveBeenCalled();
		expect(userService.selectByIdIncludeDel).not.toHaveBeenCalled();
		await expectFinished(task);
	}));

	it('keeps earlier recipients and retries only missing receipts after a later multi-attachment D1 batch fails', () => withFixture(async f => {
		const sender = await mailbox(f, 'sender');
		const recipients = [await mailbox(f, 'first'), await mailbox(f, 'second'), await mailbox(f, 'third')];
		const task = await sendTask(f, sender);
		// Nine full metadata rows exceed one 100-bind insert, so a receipt fault
		// occurs after multiple real attachment statements in the same batch.
		const source = await attachments(f, task, 9);
		const fault = await trigger(f, 'receipt', `BEFORE INSERT ON mail_local_delivery
			WHEN NEW.task_id='${task.taskId}' AND NEW.recipient='${recipients[1].normalized}'
			BEGIN SELECT RAISE(ABORT, 'local second receipt fault'); END`);
		await expect(deliver(task, recipients, source)).rejects.toThrow(/local second receipt fault/);
		const first = (await inbox(recipients[0]))[0];
		expect(await receipts(task)).toMatchObject([{ recipient: recipients[0].normalized, state: 'DELIVERED', email_id: first.email_id }]);
		expect(await attachmentRows(first.email_id)).toHaveLength(9);
		for (const owner of recipients.slice(1)) {
			expect(await inbox(owner)).toEqual([]);
			expect((await db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE user_id=?').bind(owner.userId).first()).n).toBe(0);
		}
		expect(await archive(task)).toMatchObject({ status: emailConst.status.SAVING });
		await dropTrigger(f, fault);
		await retryWithNewLease(task);
		r2Service.getObj.mockClear();
		await deliver(task, recipients, source);
		expect(await receipts(task)).toHaveLength(3);
		expect((await inbox(recipients[0]))[0]).toEqual(first);
		for (const owner of recipients) {
			const rows = await inbox(owner);
			expect(rows).toHaveLength(1);
			expect(rows[0].outbound_task_id).toBeNull();
			expect(await attachmentRows(rows[0].email_id)).toHaveLength(9);
		}
		expect(r2Service.getObj).toHaveBeenCalledTimes(18);
		await expectFinished(task);
	}));

	it('copies normal and CID objects across distinct BYO buckets and rewrites every body placeholder to recipient keys', () => withFixture(async f => {
		const sender = await mailbox(f, 'sender', byo('source-bucket'));
		const recipients = [await mailbox(f, 'first', byo('first-bucket')), await mailbox(f, 'second', byo('second-bucket'))];
		const task = await sendTask(f, sender);
		const source = await attachments(f, task);
		task.sender.content = `<img src="{{domain}}${source[0].key}"><img src="{{domain}}${source[0].key}"><a href="{{domain}}${source[1].key}">file</a>`;
		await db.prepare('UPDATE email SET content=? WHERE email_id=?').bind(task.sender.content, task.sender.emailId).run();
		const originalMetadata = await attachmentRows(task.sender.emailId);
		await deliver(task, recipients, source);
		const copiedKeys = new Set();
		for (const owner of recipients) {
			const [received] = await inbox(owner);
			const copied = await attachmentRows(received.email_id);
			expect(copied).toHaveLength(2);
			let expectedBody = task.sender.content;
			for (const [i, row] of copied.entries()) {
				expect(row.key).not.toBe(source[i].key);
				expect(row.key).toMatch(/^attachments\/local-[a-f0-9]{64}\.(png|bin)$/);
				expect(copiedKeys.has(row.key)).toBe(false);
				copiedKeys.add(row.key);
				expect(row).toMatchObject({ user_id: owner.userId, account_id: owner.accountId, filename: source[i].filename,
					mime_type: source[i].mimeType, size: source[i].size, type: source[i].type, content_id: source[i].contentId,
					disposition: source[i].disposition, related: source[i].related, encoding: source[i].encoding });
				expect(f.objects.get(f.location(owner.userId, row.key)).bytes).toEqual(f.objects.get(f.location(sender.userId, source[i].key)).bytes);
				expect(f.objects.has(f.location(owner.userId, source[i].key))).toBe(false);
				expect(r2Service.putObj).toHaveBeenCalledWith(c, row.key, expect.any(Uint8Array), expect.objectContaining({
					contentType: source[i].mimeType, contentDisposition: expect.stringMatching(i === 0 ? /^inline/ : /^attachment/)
				}), owner.userId);
				expectedBody = expectedBody.replaceAll(`{{domain}}${source[i].key}`, `{{domain}}${row.key}`);
			}
			expect(received.content).toBe(expectedBody);
			expect(received.outbound_task_id).toBeNull();
			expect(await queuedObjects(owner)).toEqual([]);
		}
		expect(r2Service.putObj).toHaveBeenCalledTimes(4);
		expect(f.objects.size).toBe(6);
		expect(await attachmentRows(task.sender.emailId)).toEqual(originalMetadata);
		expect((await archive(task)).content).toBe(task.sender.content);
		await expectFinished(task);
	}));

	it.each([-1, 1])('rejects source bytes when metadata size differs by %i instead of publishing a forged size', difference => withFixture(async f => {
		const sender = await mailbox(f, 'sender', byo('source-bucket'));
		const recipient = await mailbox(f, 'recipient', byo('destination-bucket'));
		const task = await sendTask(f, sender);
		const source = await attachments(f, task, 1);
		source[0].size += difference;
		await db.prepare('UPDATE attachments SET size=? WHERE email_id=?').bind(source[0].size, task.sender.emailId).run();
		await expect(deliver(task, [recipient], source)).rejects.toThrow(/length does not match metadata/);
		await expectPending(task, [recipient]);
		expect(await queuedObjects(recipient)).toEqual([]);
		expect(r2Service.putObj).not.toHaveBeenCalled();
		expect(f.objects.size).toBe(1);
	}));

	it.each(['missing object', 'read failure', 'storage resolution failure'])('does not publish a receipt or metadata on %s', failure => withFixture(async f => {
		const sender = await mailbox(f, 'sender', byo('source-bucket'));
		const recipient = await mailbox(f, 'recipient', byo('destination-bucket'));
		const task = await sendTask(f, sender);
		const source = await attachments(f, task, 1);
		if (failure === 'missing object') f.objects.delete(f.location(sender.userId, source[0].key));
		if (failure === 'read failure') r2Service.getObj.mockRejectedValueOnce(new Error('local source GET fault'));
		if (failure === 'storage resolution failure') r2Service.resolveStorage.mockRejectedValueOnce(new Error('local storage owner unavailable'));
		await expect(deliver(task, [recipient], source)).rejects.toThrow();
		await expectPending(task, [recipient]);
		expect(await queuedObjects(recipient)).toEqual([]);
		expect(await attachmentRows(task.sender.emailId)).toHaveLength(1);
		expect(r2Service.putObj).not.toHaveBeenCalled();
	}));

	it.each([false, true])('keeps only durable object cleanup entries on a second PUT failure (ambiguous write=%s)', ambiguous => withFixture(async f => {
		const sender = await mailbox(f, 'sender', byo('source-bucket'));
		const recipient = await mailbox(f, 'recipient', byo('destination-bucket'));
		const task = await sendTask(f, sender);
		const source = await attachments(f, task);
		let writes = 0;
		r2Service.putObj.mockImplementation(async (...args) => {
			writes++;
			if (writes === 2) {
				if (ambiguous) await f.putObject(...args);
				throw new Error('local second PUT fault');
			}
			return f.putObject(...args);
		});
		await expect(deliver(task, [recipient], source)).rejects.toThrow(/local second PUT fault/);
		await expectPending(task, [recipient]);
		expect(await archive(task)).toMatchObject({ status: emailConst.status.SAVING });
		const pending = await queuedObjects(recipient);
		expect(pending).toHaveLength(2);
		expect(pending.every(row => row.status === 'pending' && !source.some(item => item.key === row.object_key))).toBe(true);
		expect(f.objects.size).toBe(ambiguous ? 4 : 3);
		// Exercise the production deletion outbox too, but only our own keys.
		const drained = await attService.drainObjectDeletionQueue(c, pending.map(row => ({ key: row.object_key, userId: row.user_id })));
		expect(drained).toMatchObject({ processed: 2, deleted: 2, failed: 0 });
		expect(await queuedObjects(recipient)).toEqual([]);
		expect(f.objects.size).toBe(2);
		for (const item of source) expect(f.objects.has(f.location(sender.userId, item.key))).toBe(true);
		r2Service.putObj.mockImplementation(f.putObject);
		await retryWithNewLease(task);
		await deliver(task, [recipient], source);
		const [received] = await inbox(recipient);
		expect(await attachmentRows(received.email_id)).toHaveLength(2);
		expect(await receipts(task)).toHaveLength(1);
		expect(await queuedObjects(recipient)).toEqual([]);
		await expectFinished(task);
	}));

	it.each(['R2', 'S3', 'USER_S3'])('preserves a shared %s object until its last mailbox reference is physically deleted', type => withFixture(async f => {
		const storage = type === 'R2' ? { type, config: null } : byo('same-physical-bucket', type);
		const sender = await mailbox(f, 'sender', storage);
		const recipient = await mailbox(f, 'recipient', structuredClone(storage));
		const task = await sendTask(f, sender);
		const source = await attachments(f, task);
		await deliver(task, [recipient], source);
		const [received] = await inbox(recipient);
		const copied = await attachmentRows(received.email_id);
		expect(copied.map(row => row.key)).toEqual(source.map(row => row.key));
		expect(r2Service.putObj).not.toHaveBeenCalled();
		await attService.removeByEmailIds(c, [task.sender.emailId]);
		expect(await attachmentRows(task.sender.emailId)).toEqual([]);
		expect(await attachmentRows(received.email_id)).toEqual(copied);
		expect(r2Service.delete).not.toHaveBeenCalled();
		for (const item of source) {
			const object = await r2Service.getObj(c, item.key, recipient.userId);
			expect(new Uint8Array(await object.arrayBuffer()).byteLength).toBe(item.size);
		}
		await attService.removeByEmailIds(c, [received.email_id]);
		expect(await attachmentRows(received.email_id)).toEqual([]);
		expect(f.objects.size).toBe(0);
		// USER_S3 conservatively retains ambiguous cross-owner deletion entries
		// while another owner still references the key. They are safe to finish now.
		const pending = [...await queuedObjects(sender), ...await queuedObjects(recipient)];
		if (pending.length) {
			const drained = await attService.drainObjectDeletionQueue(c, pending.map(row => ({ key: row.object_key, userId: row.user_id })));
			expect(drained.failed).toBe(0);
		}
		expect(await queuedObjects(sender)).toEqual([]);
		expect(await queuedObjects(recipient)).toEqual([]);
		await expectFinished(task);
	}));
});
