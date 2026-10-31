import { env, SELF } from 'cloudflare:test';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dbInit } from '../src/init/init.js';
import { email as inboundEmailHandler } from '../src/email/email.js';
import emailService from '../src/service/email-service.js';
import settingService from '../src/service/setting-service.js';
import cryptoUtils from '../src/utils/crypto-utils.js';
import jwtUtils from '../src/utils/jwt-utils.js';
import { emailConst } from '../src/const/entity-const.js';

vi.setConfig({ testTimeout: 60000 });

const BASE = 'http://example.com';
const enc = new TextEncoder();

function streamFromText(text) {
	const bytes = enc.encode(text);
	return new ReadableStream({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		}
	});
}

function base64(bytes) {
	let out = '';
	for (const byte of new Uint8Array(bytes)) out += String.fromCharCode(byte);
	return btoa(out);
}

async function svixHeaders(secret, id, timestamp, body) {
	let keyBytes;
	try {
		const clean = secret.replace(/^whsec_/, '');
		keyBytes = Uint8Array.from(atob(clean), c => c.charCodeAt(0));
	} catch (_) {
		keyBytes = enc.encode(secret.replace(/^whsec_/, ''));
	}
	const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const signature = await crypto.subtle.sign('HMAC', key, enc.encode(`${id}.${timestamp}.${body}`));
	return {
		'svix-id': id,
		'svix-timestamp': String(timestamp),
		'svix-signature': `v1,${base64(signature)}`,
		'Content-Type': 'application/json'
	};
}

async function prepareFullSchema() {
	const bootstrapEnv = {
		...env,
		admin_initial_password: 'Stage1-Bootstrap-StrongPassword-2026!'
	};
	const bootstrapCtx = {
		env: bootstrapEnv,
		get: () => undefined,
		set: () => {},
		json: (v) => v,
		text: (v) => v,
		req: {
			header: (name) => (name === 'X-Init-Secret' ? bootstrapEnv.jwt_secret : ''),
			param: () => bootstrapEnv.jwt_secret
		}
	};
	await dbInit.intDB(bootstrapCtx);
	await dbInit.v1_1DB(bootstrapCtx);
	await dbInit.v1_2DB(bootstrapCtx);
	await dbInit.v1_3DB(bootstrapCtx);
	await dbInit.v1_3_1DB(bootstrapCtx);
	await dbInit.v1_4DB(bootstrapCtx);
	await dbInit.v1_5DB(bootstrapCtx);
	await dbInit.v1_6DB(bootstrapCtx);
	await dbInit.v1_7DB(bootstrapCtx);
	await dbInit.init(bootstrapCtx);
}

async function createRole({
	name,
	roleCode = 'custom',
	permKeys = ['email:send', 'email:delete'],
	sendType = 'count',
	sendCount = 20,
	storageQuotaMb = 5,
	allowAttachment = 1
}) {
	const inserted = await env.db.prepare(
		`INSERT INTO role (name, key, role_code, is_default, send_type, send_count, storage_quota_mb, allow_attachment, avail_domain, ban_email)
		 VALUES (?, ?, ?, 0, ?, ?, ?, ?, '', '')`
	).bind(name, roleCode, roleCode, sendType, sendCount, storageQuotaMb, allowAttachment).run();
	const roleId = inserted.meta.last_row_id;

	for (const permKey of permKeys) {
		const permRow = await env.db.prepare('SELECT perm_id FROM perm WHERE perm_key = ?').bind(permKey).first();
		if (permRow?.perm_id) {
			await env.db.prepare('INSERT INTO role_perm (role_id, perm_id) VALUES (?, ?)').bind(roleId, permRow.perm_id).run();
		}
	}
	return roleId;
}

async function seedMailboxUser(emailAddr, roleId, { sendCount = 0, storageQuotaMb = 0 } = {}) {
	const { salt, hash } = await cryptoUtils.hashPassword('MailboxPass-2026!', env);
	const userIns = await env.db.prepare(
		`INSERT INTO user (email, type, password, salt, status, is_del, reg_key_id, send_count, storage_quota_mb, custom_labels)
		 VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, '[]')`
	).bind(emailAddr, roleId, hash, salt, sendCount, storageQuotaMb).run();
	const userId = userIns.meta.last_row_id;
	const accIns = await env.db.prepare(
		`INSERT INTO account (email, name, user_id, status, is_del, all_receive)
		 VALUES (?, ?, ?, 0, 0, 0)`
	).bind(emailAddr, emailAddr.split('@')[0], userId).run();
	const accountId = accIns.meta.last_row_id;

	const sessionToken = `sess-${userId}-${crypto.randomUUID()}`;
	await env.kv.put(`auth-uid:${userId}`, JSON.stringify({
		user: { userId, email: emailAddr, type: roleId, status: 0, isDel: 0 },
		tokens: [sessionToken],
		refreshTime: new Date().toISOString()
	}), { expirationTtl: 3600 });
	const jwt = await jwtUtils.generateToken({ env }, { userId, token: sessionToken, loginEmail: emailAddr }, 3600);

	return { userId, accountId, email: emailAddr, roleId, jwt, authKey: `auth-uid:${userId}` };
}

async function apiFetch(path, { method = 'GET', jwt, body } = {}) {
	const headers = {};
	if (jwt) headers.Authorization = jwt;
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	return SELF.fetch(`${BASE}${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body)
	});
}

describe('Module C: Core mail pipeline, isolation, outbound gates, and webhook convergence', () => {
	const trackedKvKeys = new Set();
	let standardRoleId;
	let tinyQuotaRoleId;
	let victim;
	let attacker;

	beforeAll(async () => {
		await prepareFullSchema();
		await env.db.prepare(`UPDATE setting SET resend_tokens = ?`).bind(JSON.stringify({
			'example.com': 're_test_token_not_live'
		})).run();
		await settingService.refresh({ env, get: () => undefined, set: () => {} });

		standardRoleId = await createRole({
			name: 'c-standard-sender',
			roleCode: 'user_l1',
			permKeys: ['email:send', 'email:delete'],
			sendType: 'count',
			sendCount: 20,
			storageQuotaMb: 5,
			allowAttachment: 1
		});
		tinyQuotaRoleId = await createRole({
			name: 'c-tiny-quota-sender',
			roleCode: 'user_l1',
			permKeys: ['email:send', 'email:delete'],
			sendType: 'count',
			sendCount: 10,
			storageQuotaMb: 1,
			allowAttachment: 1
		});

		victim = await seedMailboxUser('victim-c@example.com', standardRoleId);
		attacker = await seedMailboxUser('attacker-c@example.com', standardRoleId);
		trackedKvKeys.add(victim.authKey);
		trackedKvKeys.add(attacker.authKey);
	}, 120000);

	afterEach(() => {
		vi.restoreAllMocks();
	});

	afterAll(async () => {
		for (const table of [
			'attachments',
			'object_deletion_queue',
			'star',
			'email_status_event',
			'webhook_event',
			'notification_outbox',
			'email',
			'account',
			'user',
			'role_perm',
			'role',
			'setting_ext'
		]) {
			try {
				await env.db.prepare(`DELETE FROM ${table}`).run();
			} catch (_) {}
		}
		for (const key of trackedKvKeys) {
			await env.kv.delete(key);
		}
		await env.kv.delete('setting:');
		await env.kv.delete('roles_seeded_v2');
	});

	it('blocks cross-user physical & soft cascadeDeleteEmails from destroying victim mail, attachments, blobs, or stars', async () => {
		const blobKey = 'attachments/victim-confidential-c1.txt';
		trackedKvKeys.add(blobKey);
		await env.kv.put(blobKey, 'victim-secret-attachment-payload');

		const emailIns = await env.db.prepare(
			`INSERT INTO email (send_email, name, account_id, user_id, subject, content, text, recipient, type, status, unread, is_del)
			 VALUES (?, 'Sender', ?, ?, 'Confidential Spec', '<p>Top secret</p>', 'Top secret', ?, 0, 0, 0, 0)`
		).bind('sender@external.org', victim.accountId, victim.userId, JSON.stringify([{ address: victim.email, name: 'Victim' }])).run();
		const victimEmailId = emailIns.meta.last_row_id;

		await env.db.prepare(
			`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, type)
			 VALUES (?, ?, ?, ?, 'confidential.txt', 'text/plain', 32, 0)`
		).bind(victim.userId, victimEmailId, victim.accountId, blobKey).run();

		await env.db.prepare(
			`INSERT INTO star (user_id, email_id) VALUES (?, ?)`
		).bind(victim.userId, victimEmailId).run();

		// Attacker attempts soft delete and physical delete against victimEmailId
		const softDelRes = await apiFetch(`/api/email/delete?emailIds=${victimEmailId}`, {
			method: 'DELETE',
			jwt: attacker.jwt
		});
		expect((await softDelRes.json()).code).toBe(200);

		const physDelRes = await apiFetch(`/api/email/delete?emailIds=${victimEmailId}&physical=1`, {
			method: 'DELETE',
			jwt: attacker.jwt
		});
		expect((await physDelRes.json()).code).toBe(200);

		// Verify Victim's email, attachment row, KV blob, and star remain 100% intact
		const emailAfter = await env.db.prepare('SELECT email_id, is_del FROM email WHERE email_id = ?').bind(victimEmailId).first();
		expect(emailAfter).toEqual({ email_id: victimEmailId, is_del: 0 });

		const attAfter = await env.db.prepare('SELECT key FROM attachments WHERE email_id = ?').bind(victimEmailId).first();
		expect(attAfter?.key).toBe(blobKey);
		expect(await env.kv.get(blobKey)).toBe('victim-secret-attachment-payload');

		const starAfter = await env.db.prepare('SELECT star_id FROM star WHERE user_id = ? AND email_id = ?')
			.bind(victim.userId, victimEmailId).first();
		expect(starAfter?.star_id).toBeTruthy();
	});

	it('isolates cross-user get/list/latest/attList/star/read and persists read state via .run() for the true owner', async () => {
		const blobKey = 'attachments/victim-read-check-c2.txt';
		trackedKvKeys.add(blobKey);
		await env.kv.put(blobKey, 'owner-only-bytes');

		const emailIns = await env.db.prepare(
			`INSERT INTO email (send_email, name, account_id, user_id, subject, content, text, recipient, type, status, unread, is_del)
			 VALUES ('boss@external.org', 'Boss', ?, ?, 'Private Roadmap', '<p>Roadmap</p>', 'Roadmap', '[]', 0, 0, 0, 0)`
		).bind(victim.accountId, victim.userId).run();
		const victimEmailId = emailIns.meta.last_row_id;

		await env.db.prepare(
			`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, type)
			 VALUES (?, ?, ?, ?, 'roadmap.txt', 'text/plain', 16, 0)`
		).bind(victim.userId, victimEmailId, victim.accountId, blobKey).run();

		// 1. Attacker cannot fetch email detail, list victim's accountId, latest, or attList
		const getByAttacker = await (await apiFetch(`/api/email/get?emailId=${victimEmailId}`, { jwt: attacker.jwt })).json();
		expect(getByAttacker.code).not.toBe(200);

		const listByAttacker = await (await apiFetch(`/api/email/list?accountId=${victim.accountId}&type=0&size=20`, { jwt: attacker.jwt })).json();
		expect(listByAttacker.code).toBe(200);
		expect(listByAttacker.data.list).toHaveLength(0);

		const latestByAttacker = await (await apiFetch(`/api/email/latest?emailId=0&accountId=${victim.accountId}`, { jwt: attacker.jwt })).json();
		expect(latestByAttacker.code).toBe(200);
		expect(latestByAttacker.data).toHaveLength(0);

		const attListByAttacker = await (await apiFetch(`/api/email/attList?emailId=${victimEmailId}`, { jwt: attacker.jwt })).json();
		expect(attListByAttacker.code).toBe(200);
		expect(attListByAttacker.data).toHaveLength(0);

		// Missing emailId on attList returns [] safely instead of throwing 500
		const emptyAttList = await (await apiFetch('/api/email/attList', { jwt: attacker.jwt })).json();
		expect(emptyAttList.code).toBe(200);
		expect(emptyAttList.data).toEqual([]);

		// 2. Attacker cannot star victim's email
		const starByAttacker = await (await apiFetch('/api/star/add', {
			method: 'POST',
			jwt: attacker.jwt,
			body: { emailId: victimEmailId }
		})).json();
		expect(starByAttacker.code).not.toBe(200);

		// 3. Attacker calling PUT /api/email/read does not alter victim's unread state
		await apiFetch('/api/email/read', {
			method: 'PUT',
			jwt: attacker.jwt,
			body: { emailIds: [victimEmailId] }
		});
		const unreadStillZero = await env.db.prepare('SELECT unread FROM email WHERE email_id = ?').bind(victimEmailId).first();
		expect(unreadStillZero.unread).toBe(0);

		// 4. Victim calling PUT /api/email/read flips unread -> 1 in D1 (verifies .run() fix)
		const ownerRead = await (await apiFetch('/api/email/read', {
			method: 'PUT',
			jwt: victim.jwt,
			body: { emailIds: [victimEmailId] }
		})).json();
		expect(ownerRead.code).toBe(200);

		const unreadNowOne = await env.db.prepare('SELECT unread FROM email WHERE email_id = ?').bind(victimEmailId).first();
		expect(unreadNowOne.unread).toBe(1);
	});

	it('preserves content-addressed attachment objects until the last mailbox reference is physically deleted', async () => {
		const sharedKey = 'attachments/shared-dedupe-c3.txt';
		trackedKvKeys.add(sharedKey);
		await env.kv.put(sharedKey, 'shared-deduplicated-content');

		const insA = await env.db.prepare(
			`INSERT INTO email (send_email, name, account_id, user_id, subject, content, text, recipient, type, status, unread, is_del)
			 VALUES ('news@external.org', 'News', ?, ?, 'Shared A', '<p>A</p>', 'A', '[]', 0, 0, 0, 0)`
		).bind(victim.accountId, victim.userId).run();
		const emailA = insA.meta.last_row_id;

		const insB = await env.db.prepare(
			`INSERT INTO email (send_email, name, account_id, user_id, subject, content, text, recipient, type, status, unread, is_del)
			 VALUES ('news@external.org', 'News', ?, ?, 'Shared B', '<p>B</p>', 'B', '[]', 0, 0, 0, 0)`
		).bind(attacker.accountId, attacker.userId).run();
		const emailB = insB.meta.last_row_id;

		await env.db.prepare(
			`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, type)
			 VALUES (?, ?, ?, ?, 'shared.txt', 'text/plain', 27, 0)`
		).bind(victim.userId, emailA, victim.accountId, sharedKey).run();
		await env.db.prepare(
			`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, type)
			 VALUES (?, ?, ?, ?, 'shared.txt', 'text/plain', 27, 0)`
		).bind(attacker.userId, emailB, attacker.accountId, sharedKey).run();

		// User A physically deletes emailA -> User B still references sharedKey, so blob MUST remain
		const delA = await (await apiFetch(`/api/email/delete?emailIds=${emailA}&physical=1`, {
			method: 'DELETE',
			jwt: victim.jwt
		})).json();
		expect(delA.code).toBe(200);
		expect(await env.kv.get(sharedKey)).toBe('shared-deduplicated-content');

		// User B can still sign and download sharedKey
		const signB = await (await apiFetch('/api/oss-url/batch', {
			method: 'POST',
			jwt: attacker.jwt,
			body: { keys: [sharedKey] }
		})).json();
		expect(signB.code).toBe(200);
		expect(signB.data.urls[sharedKey]).toBeTruthy();
		const downloadB = await SELF.fetch(`${BASE}/api${signB.data.urls[sharedKey]}`);
		expect(downloadB.status).toBe(200);
		expect(await downloadB.text()).toBe('shared-deduplicated-content');

		// User B physically deletes emailB -> 0 remaining references -> blob deleted from KV
		const delB = await (await apiFetch(`/api/email/delete?emailIds=${emailB}&physical=1`, {
			method: 'DELETE',
			jwt: attacker.jwt
		})).json();
		expect(delB.code).toBe(200);
		expect(await env.kv.get(sharedKey)).toBeNull();
	});

	it('enforces EMAIL_OUTBOUND_ENABLED and staging OUTBOUND_WHITELIST before invoking external send or incrementing sendCount', async () => {
		const sender = await seedMailboxUser('gate-sender@example.com', standardRoleId);
		const internalRecipient = await seedMailboxUser('gate-recipient@example.com', standardRoleId);
		trackedKvKeys.add(sender.authKey);
		trackedKvKeys.add(internalRecipient.authKey);

		const resendSpy = vi.spyOn(emailService, 'sendByResend').mockResolvedValue({
			data: { id: 're_mock_gate_allowed_1' },
			error: null
		});

		// 1. EMAIL_OUTBOUND_ENABLED=false blocks external recipients
		const disabledCtx = {
			env: { ...env, EMAIL_OUTBOUND_ENABLED: 'false' },
			get: () => undefined,
			set: () => {}
		};
		await expect(emailService.send(disabledCtx, {
			accountId: sender.accountId,
			receiveEmail: ['outside@external.org'],
			subject: 'Blocked external',
			text: 'Should not leave environment',
			content: '<p>Should not leave environment</p>',
			attachments: []
		}, sender.userId)).rejects.toMatchObject({ code: 403 });
		expect(resendSpy).not.toHaveBeenCalled();

		const countAfterBlocked = await env.db.prepare('SELECT send_count FROM user WHERE user_id = ?').bind(sender.userId).first();
		expect(countAfterBlocked.send_count).toBe(0);

		// Internal mail (@example.com) still works when EMAIL_OUTBOUND_ENABLED=false
		const internalSent = await emailService.send(disabledCtx, {
			accountId: sender.accountId,
			receiveEmail: [internalRecipient.email],
			subject: 'Internal Memo',
			text: 'Internal delivery allowed',
			content: '<p>Internal delivery allowed</p>',
			attachments: []
		}, sender.userId);
		expect(internalSent).toHaveLength(1);
		expect(resendSpy).not.toHaveBeenCalled();

		const recipientInbox = await (await apiFetch(`/api/email/list?accountId=${internalRecipient.accountId}&type=0&size=10`, {
			jwt: internalRecipient.jwt
		})).json();
		expect(recipientInbox.code).toBe(200);
		expect(recipientInbox.data.list.some(row => row.subject === 'Internal Memo')).toBe(true);

		// 2. ENVIRONMENT=staging enforces OUTBOUND_WHITELIST + Resend sandbox addresses
		const stagingCtx = {
			env: {
				...env,
				ENVIRONMENT: 'staging',
				EMAIL_OUTBOUND_ENABLED: 'true',
				OUTBOUND_WHITELIST: 'qa@trusted.test'
			},
			get: () => undefined,
			set: () => {}
		};

		await expect(emailService.send(stagingCtx, {
			accountId: sender.accountId,
			receiveEmail: ['unlisted@external.org'],
			subject: 'Staging leak attempt',
			text: 'Must be blocked',
			content: '<p>Must be blocked</p>',
			attachments: []
		}, sender.userId)).rejects.toMatchObject({ code: 403 });
		expect(resendSpy).not.toHaveBeenCalled();

		const whitelistedSent = await emailService.send(stagingCtx, {
			accountId: sender.accountId,
			receiveEmail: ['qa@trusted.test', 'delivered@resend.dev'],
			subject: 'Staging whitelisted',
			text: 'Allowed external test',
			content: '<p>Allowed external test</p>',
			attachments: []
		}, sender.userId);
		expect(whitelistedSent[0].resendEmailId).toBe('re_mock_gate_allowed_1');
		expect(resendSpy).toHaveBeenCalledTimes(1);
	});

	it('aborts external send before provider call or sendCount increment when attachment count, quota, or provider fails', async () => {
		const quotaSender = await seedMailboxUser('quota-sender@example.com', tinyQuotaRoleId);
		trackedKvKeys.add(quotaSender.authKey);

		// Pre-fill 950 KB of 1 MB quota so a 120 KB attachment exceeds quota
		await env.db.prepare(
			`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, type)
			 VALUES (?, 99999, ?, 'attachments/existing-950kb.bin', 'existing.bin', 'application/octet-stream', ?, 0)`
		).bind(quotaSender.userId, quotaSender.accountId, 950 * 1024).run();

		const resendSpy = vi.spyOn(emailService, 'sendByResend').mockResolvedValue({
			data: { id: 're_should_never_fire' },
			error: null
		});

		// 1. >10 attachments rejected BEFORE Resend call
		const elevenAtts = Array.from({ length: 11 }, (_, idx) => ({
			filename: `f-${idx}.txt`,
			type: 'text/plain',
			content: 'data:text/plain;base64,' + btoa('hello')
		}));
		const tooManyRes = await (await apiFetch('/api/email/send', {
			method: 'POST',
			jwt: quotaSender.jwt,
			body: {
				accountId: quotaSender.accountId,
				receiveEmail: ['partner@external.org'],
				subject: '11 attachments',
				text: 'Too many',
				content: '<p>Too many</p>',
				attachments: elevenAtts
			}
		})).json();
		expect(tooManyRes.code).not.toBe(200);
		expect(resendSpy).not.toHaveBeenCalled();

		// 2. Over-quota attachment (120 KB + 950 KB > 1024 KB) rejected BEFORE Resend call
		const bigBytes = new Uint8Array(120 * 1024).fill(0x42);
		const overQuotaRes = await (await apiFetch('/api/email/send', {
			method: 'POST',
			jwt: quotaSender.jwt,
			body: {
				accountId: quotaSender.accountId,
				receiveEmail: ['partner@external.org'],
				subject: 'Over quota external send',
				text: 'Over quota',
				content: '<p>Over quota</p>',
				attachments: [{
					filename: 'oversize.bin',
					type: 'application/octet-stream',
					content: 'data:application/octet-stream;base64,' + base64(bigBytes)
				}]
			}
		})).json();
		expect(overQuotaRes.code).not.toBe(200);
		expect(resendSpy).not.toHaveBeenCalled();

		// 3. Upstream provider error leaves send_count untouched and writes 0 email rows
		resendSpy.mockResolvedValueOnce({
			data: null,
			error: { message: 'Resend upstream 502 error' }
		});
		const providerFailRes = await (await apiFetch('/api/email/send', {
			method: 'POST',
			jwt: quotaSender.jwt,
			body: {
				accountId: quotaSender.accountId,
				receiveEmail: ['partner@external.org'],
				subject: 'Provider failure check',
				text: 'Body',
				content: '<p>Body</p>',
				attachments: []
			}
		})).json();
		expect(providerFailRes.code).not.toBe(200);

		const userAfter = await env.db.prepare('SELECT send_count FROM user WHERE user_id = ?').bind(quotaSender.userId).first();
		expect(userAfter.send_count).toBe(0);

		const orphanEmails = await env.db.prepare('SELECT COUNT(*) AS cnt FROM email WHERE user_id = ?').bind(quotaSender.userId).first();
		expect(orphanEmails.cnt).toBe(0);
	});

	it('ingests inbound MIME + attachment, decrypts starred mail, and converges Resend webhooks across D1 failure, duplicates, and out-of-order events', async () => {
		const recipient = await seedMailboxUser('inbound-c@example.com', standardRoleId);
		trackedKvKeys.add(recipient.authKey);

		const rawMime = [
			'From: Alice Sender <alice@external.org>',
			`To: ${recipient.email}`,
			'Subject: Inbound Convergence Report',
			'Message-ID: <inbound-conv-001@external.org>',
			'MIME-Version: 1.0',
			'Content-Type: multipart/mixed; boundary="BOUNDARY42"',
			'',
			'--BOUNDARY42',
			'Content-Type: text/html; charset="UTF-8"',
			'',
			'<p>Verification code 849201 inside encrypted mailbox.</p>',
			'--BOUNDARY42',
			'Content-Type: text/plain; name="note.txt"',
			'Content-Disposition: attachment; filename="note.txt"',
			'Content-Transfer-Encoding: base64',
			'',
			btoa('inbound-attachment-body'),
			'--BOUNDARY42--',
			''
		].join('\r\n');

		const rejectSpy = vi.fn();
		await inboundEmailHandler(
			{ to: recipient.email, raw: streamFromText(rawMime), setReject: rejectSpy },
			env,
			{ waitUntil: () => {} }
		);
		expect(rejectSpy).not.toHaveBeenCalled();

		// Duplicate retry with identical Message-ID is suppressed idempotently
		await inboundEmailHandler(
			{ to: recipient.email, raw: streamFromText(rawMime), setReject: rejectSpy },
			env,
			{ waitUntil: () => {} }
		);
		const inboundRows = await env.db.prepare('SELECT email_id FROM email WHERE user_id = ?').bind(recipient.userId).all();
		expect(inboundRows.results).toHaveLength(1);
		const inboundEmailId = inboundRows.results[0].email_id;

		const attRows = await env.db.prepare('SELECT key FROM attachments WHERE email_id = ?').bind(inboundEmailId).all();
		expect(attRows.results).toHaveLength(1);
		trackedKvKeys.add(attRows.results[0].key);

		// Star + star/list returns decrypted subject/content for recipient only
		const starAdd = await (await apiFetch('/api/star/add', {
			method: 'POST',
			jwt: recipient.jwt,
			body: { emailId: inboundEmailId }
		})).json();
		expect(starAdd.code).toBe(200);

		const starList = await (await apiFetch('/api/star/list?size=10', { jwt: recipient.jwt })).json();
		expect(starList.code).toBe(200);
		expect(starList.data.list).toHaveLength(1);
		expect(starList.data.list[0].subject).toBe('Inbound Convergence Report');
		expect(starList.data.list[0].content).toContain('849201');

		// Outbound row for webhook convergence testing
		const resendEmailId = 're_webhook_conv_2026';
		const sentIns = await env.db.prepare(
			`INSERT INTO email (send_email, name, account_id, user_id, subject, content, text, recipient, type, status, resend_email_id)
			 VALUES (?, 'Recipient', ?, ?, 'Webhook Subject', '<p>Hi</p>', 'Hi', '[]', 1, ?, ?)`
		).bind(recipient.email, recipient.accountId, recipient.userId, emailConst.status.SENT, resendEmailId).run();
		const sentEmailId = sentIns.meta.last_row_id;

		const nowTs = Math.floor(Date.now() / 1000);
		const bounceEventId = 'msg_wh_bounce_c6';
		trackedKvKeys.add(`wh_resend:${bounceEventId}`);
		const bounceBody = JSON.stringify({
			type: 'email.bounced',
			data: { email_id: resendEmailId, bounce: { message: 'Mailbox unavailable' } }
		});
		const bounceHeaders = await svixHeaders(env.resend_webhook_secret, bounceEventId, nowTs, bounceBody);

		// 1. Simulated D1 projection failure returns 500 and does NOT poison webhook_event or KV
		vi.spyOn(emailService, 'updateEmailStatus').mockRejectedValueOnce(new Error('Simulated transient D1 write failure'));
		const failedWh = await SELF.fetch(`${BASE}/api/webhooks`, {
			method: 'POST',
			headers: bounceHeaders,
			body: bounceBody
		});
		expect(failedWh.status).toBe(500);
		const ledgerAfterFail = await env.db.prepare('SELECT event_id FROM webhook_event WHERE event_id = ?').bind(bounceEventId).first();
		expect(ledgerAfterFail).toBeNull();
		vi.restoreAllMocks();

		// 2. Retry with identical svix-id succeeds and transitions status -> BOUNCED
		const retryWh = await SELF.fetch(`${BASE}/api/webhooks`, {
			method: 'POST',
			headers: bounceHeaders,
			body: bounceBody
		});
		expect(retryWh.status).toBe(200);
		expect(await retryWh.json()).toMatchObject({ success: true, eventId: bounceEventId });

		const afterBounce = await env.db.prepare('SELECT status FROM email WHERE email_id = ?').bind(sentEmailId).first();
		expect(afterBounce.status).toBe(emailConst.status.BOUNCED);

		// 3. Duplicate delivery of same svix-id returns deduplicated: true
		const dupWh = await SELF.fetch(`${BASE}/api/webhooks`, {
			method: 'POST',
			headers: bounceHeaders,
			body: bounceBody
		});
		expect(dupWh.status).toBe(200);
		expect(await dupWh.json()).toMatchObject({ deduplicated: true, eventId: bounceEventId });

		// 4. Late out-of-order email.delivered must NOT regress terminal BOUNCED status
		const lateDeliveredId = 'msg_wh_late_delivered_c6';
		trackedKvKeys.add(`wh_resend:${lateDeliveredId}`);
		const deliveredBody = JSON.stringify({
			type: 'email.delivered',
			data: { email_id: resendEmailId }
		});
		const deliveredHeaders = await svixHeaders(env.resend_webhook_secret, lateDeliveredId, nowTs, deliveredBody);
		const lateWh = await SELF.fetch(`${BASE}/api/webhooks`, {
			method: 'POST',
			headers: deliveredHeaders,
			body: deliveredBody
		});
		expect(lateWh.status).toBe(200);

		const afterLateDelivered = await env.db.prepare('SELECT status FROM email WHERE email_id = ?').bind(sentEmailId).first();
		expect(afterLateDelivered.status).toBe(emailConst.status.BOUNCED);
	});

	// Regression: the snoozed-waiting aggregate once carried a stray parenthesis,
	// which made the whole statement a SQLite syntax error and turned every
	// sidebar request into a 500.
	it('serves sidebar counters for inbox, spam, trash, drafts, sent, and both snooze windows', async () => {
		const collector = await seedMailboxUser('sidebar-counters-c@example.com', standardRoleId);
		trackedKvKeys.add(collector.authKey);

		const insert = (values) => env.db.prepare(
			`INSERT INTO email (send_email, name, account_id, user_id, subject, content, text, recipient, labels, type, status, unread, is_del, is_spam, snoozed_time, snoozed_end_time)
			 VALUES (?, 'Counter', ?, ?, ?, '<p>x</p>', 'x', '[]', '[]', ?, ?, ?, ?, ?, ?, ?)`
		).bind('counter@external.org', collector.accountId, collector.userId, ...values).run();

		// inbox unread
		await insert(['Inbox', 0, 0, 0, 0, 0, null, null]);
		// spam unread
		await insert(['Spam', 0, 0, 0, 0, 1, null, null]);
		// trash read
		await insert(['Trash', 0, 0, 1, 1, 0, null, null]);
		// snoozed without an end time -> urgent
		await insert(['Snoozed Urgent', 0, 0, 1, 0, 0, '2026-01-01 00:00:00', null]);
		// snoozed with a future end time -> waiting
		await insert(['Snoozed Waiting', 0, 0, 1, 0, 0, '2026-01-01 00:00:00', '2099-01-01 00:00:00']);
		// draft + sent
		await insert(['Draft', 1, emailConst.status.SAVING, 0, 0, 0, null, null]);
		await insert(['Sent', 1, 0, 0, 0, 0, null, null]);

		const res = await apiFetch('/api/email/sidebarStats', { jwt: collector.jwt });
		const body = await res.json();
		expect(body.code).toBe(200);
		expect(body.data).toMatchObject({
			inboxUnread: 1,
			spamUnread: 1,
			spamRead: 0,
			trashUnread: 0,
			trashRead: 1,
			snoozedUrgent: 1,
			snoozedWaiting: 1,
			draftUnread: 1,
			sentUnread: 1,
			allUnread: 4
		});
	});
});
