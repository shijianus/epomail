import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, it, expect, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });
import { dbInit } from '../src/init/init.js';
import cryptoUtils from '../src/utils/crypto-utils.js';
import jwtUtils from '../src/utils/jwt-utils.js';
import userService from '../src/service/user-service.js';
import decisionNoticeService from '../src/service/decision-notice-service.js';
import { issueOAuthToken } from '../src/service/oauth-one-time-service.js';

const BASE = 'http://example.com';
const enc = new TextEncoder();

const ctx = { env, get: () => undefined, set: () => {} };

async function addColumn(table, definition) {
	try {
		await env.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run();
	} catch (_) {
		// Column already exists in this isolated schema.
	}
}

async function initMinimalSchema() {
	await dbInit.intDB(ctx);
	await dbInit.v1_1DB(ctx);

	for (const definition of [
		'reg_key_id INTEGER NOT NULL DEFAULT 0',
		'create_ip TEXT', 'active_ip TEXT', 'os TEXT', 'browser TEXT', 'device TEXT',
		'sort INTEGER NOT NULL DEFAULT 0', 'send_count INTEGER NOT NULL DEFAULT 0',
		'totp_enabled INTEGER NOT NULL DEFAULT 0', "totp_secret TEXT NOT NULL DEFAULT ''",
		'totp_key_version INTEGER NOT NULL DEFAULT 1', "totp_backup_codes TEXT NOT NULL DEFAULT '[]'",
		"totp_created_at TEXT NOT NULL DEFAULT ''", "security_keys TEXT NOT NULL DEFAULT '[]'",
		'storage_quota_mb INTEGER NOT NULL DEFAULT 0', 'byo_storage_enabled INTEGER NOT NULL DEFAULT 0',
		"byo_storage_config TEXT NOT NULL DEFAULT '{}'"
	]) {
		await addColumn('user', definition);
	}

	await env.db.prepare(`CREATE TABLE IF NOT EXISTS webhook_event (
		event_id TEXT PRIMARY KEY, provider TEXT NOT NULL, event_type TEXT NOT NULL,
		resource_id TEXT, payload TEXT, status TEXT NOT NULL DEFAULT 'processed',
		create_time DATETIME DEFAULT CURRENT_TIMESTAMP
	)`).run();
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS notification_outbox (
		id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL UNIQUE, case_id INTEGER,
		ticket_id TEXT, user_id INTEGER, recipient TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'internal',
		template_code TEXT NOT NULL, subject TEXT NOT NULL, content TEXT NOT NULL, reason_code TEXT,
		status TEXT NOT NULL DEFAULT 'pending', provider_message_id TEXT, retry_count INTEGER NOT NULL DEFAULT 0,
		max_retries INTEGER NOT NULL DEFAULT 5, last_error TEXT, next_retry_at TEXT, delivered_at TEXT,
		read_at TEXT, claimant_id TEXT, lease_expires_at TEXT, lease_version INTEGER DEFAULT 0,
		create_time DATETIME DEFAULT CURRENT_TIMESTAMP, update_time DATETIME DEFAULT CURRENT_TIMESTAMP
	)`).run();

	await env.db.prepare(`CREATE TABLE IF NOT EXISTS oauth (
		oauth_id INTEGER PRIMARY KEY AUTOINCREMENT, oauth_user_id TEXT, username TEXT, name TEXT,
		avatar TEXT, active INTEGER, trust_level INTEGER, silenced INTEGER,
		create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, user_id INTEGER NOT NULL DEFAULT 0
	)`).run();
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS verify_record (
		vr_id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT NOT NULL DEFAULT '',
		count INTEGER NOT NULL DEFAULT 1, type INTEGER NOT NULL DEFAULT 0,
		update_time DATETIME DEFAULT CURRENT_TIMESTAMP
	)`).run();
	await addColumn('role', "ban_email TEXT NOT NULL DEFAULT ''");
	await addColumn('role', 'ban_email_type INTEGER NOT NULL DEFAULT 0');
	await addColumn('role', "avail_domain TEXT DEFAULT ''");
	await addColumn('account', 'name TEXT');
	await addColumn('account', 'all_receive INTEGER NOT NULL DEFAULT 0');
	await addColumn('account', 'sort INTEGER NOT NULL DEFAULT 0');

	for (const definition of [
		"code TEXT NOT NULL DEFAULT ''", "cc TEXT NOT NULL DEFAULT '[]'", "bcc TEXT NOT NULL DEFAULT '[]'",
		"recipient TEXT NOT NULL DEFAULT '[]'", "to_email TEXT NOT NULL DEFAULT ''",
		"to_name TEXT NOT NULL DEFAULT ''", "in_reply_to TEXT NOT NULL DEFAULT ''",
		"relation TEXT NOT NULL DEFAULT ''", "message_id TEXT NOT NULL DEFAULT ''",
		'unread INTEGER NOT NULL DEFAULT 0', 'is_spam INTEGER NOT NULL DEFAULT 0',
		'snoozed_time DATETIME', 'snoozed_end_time DATETIME'
	]) {
		await addColumn('email', definition);
	}
}

async function permId(key) {
	const row = await env.db.prepare('SELECT perm_id FROM perm WHERE perm_key = ?').bind(key).first();
	if (!row) throw new Error(`missing perm ${key}`);
	return row.perm_id;
}

async function createRole(name, roleCode, permKeys = []) {
	const inserted = await env.db.prepare(
		`INSERT INTO role (name, key, role_code, is_default, send_type, storage_quota_mb, allow_attachment)
		 VALUES (?, ?, ?, 0, 'count', 5, 0)`
	).bind(name, roleCode, roleCode).run();
	const roleId = inserted.meta.last_row_id;
	for (const key of permKeys) {
		await env.db.prepare('INSERT INTO role_perm (role_id, perm_id) VALUES (?, ?)')
			.bind(roleId, await permId(key)).run();
	}
	return roleId;
}

async function seedUser(email, roleId, password = 'ProbePass123!') {
	const { salt, hash } = await cryptoUtils.hashPassword(password, env);
	const inserted = await env.db.prepare(
		`INSERT INTO user (email, type, password, salt, status, is_del, reg_key_id, custom_labels)
		 VALUES (?, ?, ?, ?, 0, 0, 0, '[]')`
	).bind(email, roleId, hash, salt).run();
	const userId = inserted.meta.last_row_id;
	const account = await env.db.prepare(
		'INSERT INTO account (email, user_id, status, is_del) VALUES (?, ?, 0, 0)'
	).bind(email, userId).run();
	return { userId, accountId: account.meta.last_row_id, email, roleId, password };
}

async function session(user) {
	const tokenId = crypto.randomUUID();
	await env.kv.put(`auth-uid:${user.userId}`, JSON.stringify({
		tokens: [tokenId],
		user: { userId: user.userId, email: user.email, type: user.roleId, status: 0, isDel: 0 },
		refreshTime: new Date().toISOString()
	}), { expirationTtl: 3600 });
	return jwtUtils.generateToken({ env }, { userId: user.userId, token: tokenId, loginEmail: user.email }, 3600);
}

async function api(path, { method = 'GET', token, body } = {}) {
	const headers = {};
	if (token) headers.token = token;
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	return SELF.fetch(`${BASE}${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body)
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
		'svix-timestamp': timestamp,
		'svix-signature': `v1,${base64(signature)}`,
		'Content-Type': 'application/json'
	};
}

describe('security delivery regressions', () => {
	let masterRole;
	let adminUser;

	beforeAll(async () => {
		await initMinimalSchema();
		masterRole = await createRole('probe-master', 'master');
		adminUser = await seedUser('admin@example.com', masterRole);
	}, 120000);

	it('rejects a master-role user created by a caller with only user:add', async () => {
		const callerRole = await createRole('probe-user-add', 'custom', ['user:add', 'email:send']);
		const caller = await seedUser('probe-user-add@example.com', callerRole);
		const token = await session(caller);

		const res = await api('/api/user/add', {
			method: 'POST',
			token,
			body: { email: 'probe-escalated@example.com', password: 'Escalate123!', type: masterRole }
		});
		const body = await res.json();
		console.log('user/add non-admin response', JSON.stringify(body));
		expect(body.code).toBe(403);

		const created = await env.db.prepare("SELECT user_id FROM user WHERE email = 'probe-escalated@example.com'").first();
		expect(created).toBeNull();
	});

	it('allows the site owner to create a master-role user', async () => {
		const token = await session(adminUser);
		const res = await api('/api/user/add', {
			method: 'POST',
			token,
			body: { email: 'probe-owner-created@example.com', password: 'OwnerPass123!', type: masterRole }
		});
		const body = await res.json();
		console.log('user/add admin response', JSON.stringify(body));
		expect(body.code).toBe(200);

		const created = await env.db.prepare("SELECT type FROM user WHERE email = 'probe-owner-created@example.com'").first();
		expect(created?.type).toBe(masterRole);
	});

	it('rejects demoting a higher-privileged target through setType', async () => {
		const highRole = await createRole('probe-high', 'custom', ['setting:set', 'email:send']);
		const lowRole = await createRole('probe-low', 'custom', ['email:send']);
		const target = await seedUser('probe-high-target@example.com', highRole);
		const callerRole = await createRole('probe-demoter', 'custom', ['user:set-type', 'role:set', 'email:send']);
		const caller = await seedUser('probe-demoter@example.com', callerRole);
		const token = await session(caller);

		const res = await api('/api/user/setType', {
			method: 'PUT',
			token,
			body: { userId: target.userId, type: lowRole }
		});
		const body = await res.json();
		expect(body.code).toBe(403);

		const after = await env.db.prepare('SELECT type FROM user WHERE user_id = ?').bind(target.userId).first();
		expect(after.type).toBe(highRole);
	});

	it('keeps legitimate owner role changes working', async () => {
		const lowRole = await createRole('probe-owner-low', 'custom', ['email:send']);
		const target = await seedUser('probe-owner-target@example.com', masterRole);
		const token = await session(adminUser);

		const res = await api('/api/user/setType', {
			method: 'PUT',
			token,
			body: { userId: target.userId, type: lowRole }
		});
		const body = await res.json();
		expect(body.code).toBe(200);

		const after = await env.db.prepare('SELECT type FROM user WHERE user_id = ?').bind(target.userId).first();
		expect(after.type).toBe(lowRole);
	});

	it('keeps normal users out of settings and visitor queries', async () => {
		const plainRole = await createRole('probe-plain', 'custom', ['email:send']);
		const plain = await seedUser('probe-plain@example.com', plainRole);
		const visitorRole = await createRole('probe-visitor', 'visitor');
		const visitor = await seedUser('probe-visitor@example.com', visitorRole);

		const settings = await api('/api/setting/query', { token: await session(plain) });
		expect((await settings.json()).code).toBe(403);

		const users = await api('/api/user/list?size=1', { token: await session(visitor) });
		expect((await users.json()).code).toBe(403);
	});

	it('ignores role mass-assignment fields while allowing scoped role creation', async () => {
		const callerRole = await createRole('probe-role-add', 'custom', ['role:add']);
		const caller = await seedUser('probe-role-add@example.com', callerRole);
		const token = await session(caller);

		const res = await api('/api/role/add', {
			method: 'POST',
			token,
			body: {
				name: 'probe-mass-role',
				permIds: [],
				roleCode: 'custom',
				isDefault: 1,
				userId: 999,
				createTime: '2000-01-01 00:00:00'
			}
		});
		expect((await res.json()).code).toBe(200);

		const role = await env.db.prepare("SELECT user_id, is_default, role_code FROM role WHERE name = 'probe-mass-role'").first();
		expect(role.is_default).toBe(0);
		expect(role.user_id).toBe(caller.userId);
		expect(role.role_code).toBe('custom');
	});

	it('does not let a non-admin grant setting:set through role creation', async () => {
		const callerRole = await createRole('probe-role-grant', 'custom', ['role:add']);
		const caller = await seedUser('probe-role-grant@example.com', callerRole);
		const token = await session(caller);

		const res = await api('/api/role/add', {
			method: 'POST',
			token,
			body: { name: 'probe-grant-setting', permIds: [await permId('setting:set')] }
		});
		const body = await res.json();
		expect(body.code).toBe(403);
	});

	it('binds only the exact OAuth identity, consumes the proof once, and refuses rebinding', async () => {
		const oauthUser = 'github:probe-bind';
		await env.db.prepare("INSERT INTO oauth (oauth_user_id, user_id) VALUES (?, 0)").bind(oauthUser).run();
		const bindToken = await issueOAuthToken({ env }, {
			kind: 'bind',
			provider: 'github',
			subject: oauthUser,
			payload: { oauthUserId: oauthUser, provider: 'github' },
			ttlSeconds: 600
		});

		const wrongIdentity = await api('/api/oauth/bindUser', {
			method: 'PUT',
			body: { email: 'probe-bind@example.com', oauthUserId: 'github:other', provider: 'github', bindToken }
		});
		const wrongBody = await wrongIdentity.json();
		expect(wrongBody.message).toMatch(/bind proof/i);

		const boundRole = await createRole('probe-bind-role', 'custom');
		const existingUser = await seedUser('probe-bind-existing@example.com', boundRole);
		await env.db.prepare('UPDATE oauth SET user_id = ? WHERE oauth_user_id = ?').bind(existingUser.userId, oauthUser).run();

		const rebind = await api('/api/oauth/bindUser', {
			method: 'PUT',
			body: { email: 'probe-bind@example.com', oauthUserId: oauthUser, provider: 'github', bindToken }
		});
		const rebindBody = await rebind.json();
		expect(rebindBody.message).toMatch(/已绑定/);

		const replay = await api('/api/oauth/bindUser', {
			method: 'PUT',
			body: { email: 'probe-bind@example.com', oauthUserId: oauthUser, provider: 'github', bindToken }
		});
		const replayBody = await replay.json();
		expect(replayBody.message).toMatch(/bind proof/i);
	});

	it('fails the webhook before dedup when mailbox projection fails, then converges on retry', async () => {
		const mailUser = await seedUser('probe-webhook@example.com', await createRole('probe-webhook-role', 'custom'));
		const insertedEmail = await env.db.prepare(
			`INSERT INTO email (send_email, account_id, user_id, subject, content, resend_email_id, status)
			 VALUES ('sender@example.com', ?, ?, 'subject', 'content', 're_projection_fail', 1)`
		).bind(mailUser.accountId, mailUser.userId).run();
		const emailId = insertedEmail.meta.last_row_id;

		await env.db.prepare(
			`CREATE TRIGGER probe_projection_fail BEFORE UPDATE ON email
			 WHEN NEW.resend_email_id = 're_projection_fail'
			 BEGIN SELECT RAISE(ABORT, 'forced projection failure'); END`
		).run();

		const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 're_projection_fail' } });
		const timestamp = String(Math.floor(Date.now() / 1000));
		const headers = await svixHeaders(env.resend_webhook_secret, 'msg_projection_fail', timestamp, body);

		const first = await SELF.fetch(`${BASE}/api/webhooks`, { method: 'POST', headers, body });
		expect(first.status).toBe(500);

		const ledgerAfterFailure = await env.db.prepare(
			"SELECT event_id FROM webhook_event WHERE event_id = 'msg_projection_fail'"
		).first();
		expect(ledgerAfterFailure).toBeNull();

		await env.db.prepare('DROP TRIGGER probe_projection_fail').run();

		const retry = await SELF.fetch(`${BASE}/api/webhooks`, { method: 'POST', headers, body });
		expect(retry.status).toBe(200);

		const updated = await env.db.prepare('SELECT status, message FROM email WHERE email_id = ?').bind(emailId).first();
		expect(updated.status).toBe(2);

		const ledger = await env.db.prepare(
			"SELECT status FROM webhook_event WHERE event_id = 'msg_projection_fail'"
		).first();
		expect(ledger.status).toBe('processed');
	});

	it('keeps valid webhook replay, stale delivery, and object isolation intact', async () => {
		const mailUser = await seedUser('probe-webhook-2@example.com', await createRole('probe-webhook-role-2', 'custom'));
		const firstInsert = await env.db.prepare(
			`INSERT INTO email (send_email, account_id, user_id, subject, content, resend_email_id, status)
			 VALUES ('sender@example.com', ?, ?, 's', 'c', 're_webhook_ok', 1)`
		).bind(mailUser.accountId, mailUser.userId).run();
		const first = { email_id: firstInsert.meta.last_row_id };
		const secondInsert = await env.db.prepare(
			`INSERT INTO email (send_email, account_id, user_id, subject, content, resend_email_id, status)
			 VALUES ('sender@example.com', ?, ?, 's', 'c', 're_webhook_other', 1)`
		).bind(mailUser.accountId, mailUser.userId).run();
		const second = { email_id: secondInsert.meta.last_row_id };

		const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 're_webhook_ok' } });
		const timestamp = String(Math.floor(Date.now() / 1000));
		const headers = await svixHeaders(env.resend_webhook_secret, 'msg_webhook_ok', timestamp, body);

		const delivered = await SELF.fetch(`${BASE}/api/webhooks`, { method: 'POST', headers, body });
		expect(delivered.status).toBe(200);

		const firstRow = await env.db.prepare('SELECT status FROM email WHERE email_id = ?').bind(first.email_id).first();
		const secondRow = await env.db.prepare('SELECT status FROM email WHERE email_id = ?').bind(second.email_id).first();
		expect(firstRow.status).toBe(2);
		expect(secondRow.status).toBe(1);

		const replay = await SELF.fetch(`${BASE}/api/webhooks`, { method: 'POST', headers, body });
		expect((await replay.json()).deduplicated).toBe(true);

		await env.db.prepare('UPDATE email SET status = 3 WHERE email_id = ?').bind(first.email_id).run();
		const lateBody = JSON.stringify({ type: 'email.delivered', data: { email_id: 're_webhook_ok' } });
		const lateHeaders = await svixHeaders(env.resend_webhook_secret, 'msg_webhook_late', timestamp, lateBody);
		await SELF.fetch(`${BASE}/api/webhooks`, { method: 'POST', headers: lateHeaders, body: lateBody });

		const afterLate = await env.db.prepare('SELECT status FROM email WHERE email_id = ?').bind(first.email_id).first();
		expect(afterLate.status).toBe(3);
	});

	it('rejects editing a higher-privileged role while keeping owner edits working', async () => {
		const highRole = await createRole('probe-role-high', 'custom', ['setting:set', 'email:send']);
		const callerRole = await createRole('probe-role-editor', 'custom', ['role:set', 'role:add', 'email:send']);
		const caller = await seedUser('probe-role-editor@example.com', callerRole);
		const token = await session(caller);

		const forbidden = await api('/api/role/set', {
			method: 'PUT',
			token,
			body: {
				roleId: highRole,
				name: 'probe-role-high-edited',
				permIds: [await permId('email:send')]
			}
		});
		expect((await forbidden.json()).code).toBe(403);

		const unchanged = await env.db.prepare('SELECT perm_id FROM role_perm WHERE role_id = ?').bind(highRole).all();
		expect(unchanged.results).toHaveLength(2);

		const ownerToken = await session(adminUser);
		const allowed = await api('/api/role/set', {
			method: 'PUT',
			token: ownerToken,
			body: {
				roleId: highRole,
				name: 'probe-role-high-edited',
				permIds: [await permId('email:send'), await permId('setting:set')]
			}
		});
		expect((await allowed.json()).code).toBe(200);
	});

	it('masks provider secrets for a non-admin with setting:query', async () => {
		const role = await createRole('probe-setting-reader', 'custom', ['setting:query']);
		const reader = await seedUser('probe-setting-reader@example.com', role);
		const token = await session(reader);
		const cachedSetting = {
			aiApiKey: 'sk-live-secret-value',
			secretKey: 'turnstile-secret-value',
			siteKey: 'turnstile-site-key',
			resendTokens: { 'example.com': 'mailjet:abcdef:ghijkl' },
			oauthProviders: { github: { clientId: 'client-id', clientSecret: 'client-secret-value', enabled: 1 } },
			s3AccessKey: 'AKIAEXAMPLEVALUE',
			s3SecretKey: 's3-secret-value',
			externalDbToken: 'db-token-value',
			tgBotToken: '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij'
		};
		await env.kv.put('setting:', JSON.stringify(cachedSetting));
		try {
			const response = await api('/api/setting/query', { token });
			const body = await response.json();
			expect(body.code).toBe(200);
			expect(body.data.aiApiKey).toContain('******');
			expect(body.data.aiApiKey).not.toContain('sk-live-secret-value');
			expect(body.data.secretKey).toContain('******');
			expect(body.data.secretKey).not.toContain('turnstile-secret-value');
			expect(body.data.oauthProviders.github.clientSecret).toBe('******');
			expect(body.data.resendTokens['example.com']).toContain('******');
			expect(body.data.s3SecretKey).not.toContain('s3-secret-value');
			expect(body.data.externalDbToken).not.toContain('db-token-value');
			expect(body.data.tgBotToken).toContain('******');
			expect(body.data.tgBotToken).not.toContain('IJKLMNOPQRSTUVWXYZ');

			const stored = await env.kv.get('setting:', { type: 'json' });
			expect(stored.aiApiKey).toBe('sk-live-secret-value');
		} finally {
			await env.kv.delete('setting:');
		}
	});

	it('requires the current password and revokes all sessions when changing it', async () => {
		const role = await createRole('probe-password', 'custom', ['email:send']);
		const target = await seedUser('probe-password@example.com', role, 'OldPass123!');
		const token = await session(target);
		const serviceContext = { env, get: () => undefined, set: () => {} };

		await expect(userService.resetPassword(
			serviceContext,
			{ password: 'NewPass123!', currentPassword: 'wrong-password' },
			target.userId,
			{ requireCurrent: true }
		)).rejects.toThrow();

		expect(await env.kv.get(`auth-uid:${target.userId}`)).not.toBeNull();
		const before = await env.db.prepare('SELECT password, salt FROM user WHERE user_id = ?').bind(target.userId).first();
		expect(await cryptoUtils.verifyPassword('OldPass123!', before.salt, before.password)).toBe(true);

		await userService.resetPassword(
			serviceContext,
			{ password: 'NewPass123!', currentPassword: 'OldPass123!' },
			target.userId,
			{ requireCurrent: true }
		);

		expect(await env.kv.get(`auth-uid:${target.userId}`)).toBeNull();
		const after = await env.db.prepare('SELECT password, salt FROM user WHERE user_id = ?').bind(target.userId).first();
		expect(await cryptoUtils.verifyPassword('NewPass123!', after.salt, after.password)).toBe(true);
		expect(await cryptoUtils.verifyPassword('OldPass123!', after.salt, after.password)).toBe(false);

		const oldSession = await api('/api/email/list?size=1', { token });
		expect((await oldSession.json()).code).toBe(401);
	});

	it('keeps legacy SHA-256 password verification semantics', async () => {
		const salt = cryptoUtils.generateSalt();
		const legacy = await cryptoUtils.genLegacyHashPassword('LegacyPass123!', salt);
		const accepted = await cryptoUtils.verifyPasswordWithUpgrade('LegacyPass123!', salt, legacy, env);
		expect(accepted.isValid).toBe(true);
		expect(accepted.isLegacy).toBe(true);
		const rejected = await cryptoUtils.verifyPasswordWithUpgrade('WrongPass123!', salt, legacy, env);
		expect(rejected.isValid).toBe(false);
	});

	it('rejects restricted-notice credentials on regular mailbox APIs', async () => {
		const token = await jwtUtils.generateToken({ env }, {
			userId: 1,
			purpose: 'restricted_notice',
			jti: 'probe-restricted-jti'
		}, 60);
		const response = await api('/api/email/list?size=1', { token });
		const body = await response.json();
		expect(body.code).toBe(403);
		expect(body.message).toContain('Restricted');
	});

	it('invalidates restricted notice tokens after deletion or unban', async () => {
		const role = await createRole('probe-restricted-user', 'custom');
		const target = await seedUser('probe-restricted-user@example.com', role);
		await env.db.prepare('UPDATE user SET status = 1 WHERE user_id = ?').bind(target.userId).run();
		const token = await jwtUtils.generateToken({ env }, {
			userId: target.userId,
			purpose: 'restricted_notice',
			jti: 'probe-restricted-object-jti'
		}, 60);
		const serviceContext = { env, get: () => undefined, set: () => {} };

		expect(await decisionNoticeService.verifyRestrictedToken(serviceContext, token)).toBeTruthy();

		await env.db.prepare('UPDATE user SET is_del = 1 WHERE user_id = ?').bind(target.userId).run();
		expect(await decisionNoticeService.verifyRestrictedToken(serviceContext, token)).toBeNull();

		await env.db.prepare('UPDATE user SET is_del = 0, status = 0 WHERE user_id = ?').bind(target.userId).run();
		expect(await decisionNoticeService.verifyRestrictedToken(serviceContext, token)).toBeNull();
	});
});
