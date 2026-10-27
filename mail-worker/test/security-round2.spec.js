import { env, SELF } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { dbInit } from '../src/init/init.js';
import cryptoUtils from '../src/utils/crypto-utils.js';
import jwtUtils from '../src/utils/jwt-utils.js';
import settingService from '../src/service/setting-service.js';
import attService from '../src/service/att-service.js';
import telegramService from '../src/service/telegram-service.js';
import oauthService from '../src/service/oauth-service.js';
import { issueOAuthToken, consumeOAuthToken } from '../src/service/oauth-one-time-service.js';
import { ensureSettingExtSchema } from '../src/utils/setting-schema.js';
import { getUserDb } from '../src/utils/db-accessor.js';
import { FULL_SETTING_COLUMNS } from './fixtures/full-setting-schema.js';

vi.setConfig({ testTimeout: 60000 });

const BASE = 'http://example.com';
const encoder = new TextEncoder();

const ctx = { env, get: () => undefined, set: () => {} };

async function addColumn(table, definition) {
	try {
		await env.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run();
	} catch (_) {}
}

async function installTestSchema() {
	await dbInit.intDB(ctx);
	await dbInit.v1_1DB(ctx);
	await dbInit.v1_4DB(ctx);
	await dbInit.v1_5DB(ctx);

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

	for (const definition of [
		"code TEXT NOT NULL DEFAULT ''", "cc TEXT NOT NULL DEFAULT '[]'", "bcc TEXT NOT NULL DEFAULT '[]'",
		"recipient TEXT NOT NULL DEFAULT '[]'", "to_email TEXT NOT NULL DEFAULT ''",
		"to_name TEXT NOT NULL DEFAULT ''", "in_reply_to TEXT NOT NULL DEFAULT ''",
		"relation TEXT NOT NULL DEFAULT ''", "message_id TEXT NOT NULL DEFAULT ''",
		'unread INTEGER NOT NULL DEFAULT 0', 'is_spam INTEGER NOT NULL DEFAULT 0',
		'snoozed_time DATETIME', 'snoozed_end_time DATETIME', "labels TEXT NOT NULL DEFAULT '[]'"
	]) {
		await addColumn('email', definition);
	}

	await addColumn('role', "ban_email TEXT NOT NULL DEFAULT ''");
	await addColumn('role', 'ban_email_type INTEGER NOT NULL DEFAULT 0');
	await addColumn('account', 'name TEXT');
	await addColumn('account', 'all_receive INTEGER NOT NULL DEFAULT 0');
	await addColumn('account', 'sort INTEGER NOT NULL DEFAULT 0');
	await addColumn('attachments', "status TEXT NOT NULL DEFAULT '0'");
	await addColumn('attachments', 'type INTEGER NOT NULL DEFAULT 0');

	// Replace the narrow bootstrap setting table with the full pre-split
	// production shape (94 columns) so settingService can run unchanged.
	await env.db.prepare('DROP TABLE IF EXISTS setting').run();
	await env.db.prepare(`CREATE TABLE setting (${FULL_SETTING_COLUMNS.join(', ')})`).run();
	await env.db.prepare('INSERT INTO setting (register) VALUES (0)').run();

	await env.db.prepare(`
		CREATE TABLE IF NOT EXISTS verify_record (
			vr_id INTEGER PRIMARY KEY AUTOINCREMENT,
			ip TEXT NOT NULL DEFAULT '',
			count INTEGER NOT NULL DEFAULT 1,
			type INTEGER NOT NULL DEFAULT 0,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`).run();

	await env.db.prepare(`
		CREATE TABLE IF NOT EXISTS oauth (
			oauth_id INTEGER PRIMARY KEY AUTOINCREMENT,
			oauth_user_id TEXT,
			username TEXT,
			name TEXT,
			avatar TEXT,
			active INTEGER,
			trust_level INTEGER,
			silenced INTEGER,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			platform INTEGER NOT NULL DEFAULT 0,
			user_id INTEGER NOT NULL DEFAULT 0
		)
	`).run();
}

async function permId(key) {
	const row = await env.db.prepare('SELECT perm_id FROM perm WHERE perm_key = ?').bind(key).first();
	if (!row) throw new Error(`missing perm ${key}`);
	return row.perm_id;
}

async function createRole(name, roleCode, permKeys = [], isDefault = 0) {
	const inserted = await env.db.prepare(
		`INSERT INTO role (name, key, role_code, is_default, send_type, storage_quota_mb, allow_attachment)
		 VALUES (?, ?, ?, ?, 'count', 5, 1)`
	).bind(name, roleCode, roleCode, isDefault).run();
	const roleId = inserted.meta.last_row_id;
	for (const key of permKeys) {
		await env.db.prepare('INSERT INTO role_perm (role_id, perm_id) VALUES (?, ?)')
			.bind(roleId, await permId(key)).run();
	}
	return roleId;
}

async function seedUser(email, roleId, password = 'ProbePass123!', overrides = {}) {
	const { salt, hash } = await cryptoUtils.hashPassword(password, env);
	const inserted = await env.db.prepare(
		`INSERT INTO user (email, type, password, salt, status, is_del, reg_key_id, custom_labels,
			totp_enabled, totp_secret)
		 VALUES (?, ?, ?, ?, ?, 0, 0, '[]', ?, ?)`
	).bind(
		email,
		roleId,
		hash,
		salt,
		overrides.status ?? 0,
		overrides.totpEnabled ?? 0,
		overrides.totpSecret ?? ''
	).run();
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

function base64url(bytes) {
	let binary = '';
	for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function sha256Hex(value) {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
	return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function signExpiredObjectUrl(key, userId, exp = Math.floor(Date.now() / 1000) - 60) {
	const cryptoKey = await crypto.subtle.importKey(
		'raw', encoder.encode(env.jwt_secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
	);
	const signature = await crypto.subtle.sign(
		'HMAC', cryptoKey, encoder.encode(`epomail-object-v1\n${key}\n${exp}\n${userId}`)
	);
	return `/oss/${key}?exp=${exp}&uid=${userId}&sig=${base64url(signature)}`;
}

async function createAppleJwks() {
	const pair = await crypto.subtle.generateKey(
		{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
		true,
		['sign', 'verify']
	);
	const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
	jwk.kid = 'round2-apple-kid';
	jwk.use = 'sig';
	await env.kv.put('apple_jwks_v1', JSON.stringify({ keys: [jwk] }));
	return { pair, jwk };
}

async function signAppleIdToken(privateKey, payload) {
	const headerPart = base64url(encoder.encode(JSON.stringify({ alg: 'RS256', kid: 'round2-apple-kid' })));
	const payloadPart = base64url(encoder.encode(JSON.stringify(payload)));
	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5', privateKey, encoder.encode(`${headerPart}.${payloadPart}`)
	);
	return `${headerPart}.${payloadPart}.${base64url(signature)}`;
}

async function startAppleFlow() {
	const authorize = await api('/api/oauth/authorize/apple', { method: 'GET' });
	const authorizeBody = await authorize.json();
	expect(authorizeBody.code).toBe(200);
	const authorizeUrl = new URL(authorizeBody.data.url);
	const state = authorizeUrl.searchParams.get('state');
	const nonce = authorizeUrl.searchParams.get('nonce');
	const cookie = authorize.headers.get('Set-Cookie') || '';
	return { state, nonce, cookie: cookie.split(';')[0] };
}

async function appleCallback(idToken, state, cookie) {
	return SELF.fetch(`${BASE}/api/oauth/callback/apple?id_token=${encodeURIComponent(idToken)}&state=${encodeURIComponent(state)}`, {
		redirect: 'manual',
		headers: { cookie }
	});
}

async function exchangeLoginCode(loginCode) {
	const response = await api('/api/oauth/exchange', {
		method: 'POST',
		body: { code: loginCode }
	});
	return response.json();
}

function locationUrl(response) {
	return new URL(response.headers.get('Location') || '/', BASE);
}

describe('round 2 blocking fixes', () => {
	let masterRole;
	let defaultRole;
	let adminUser;
	let adminToken;
	let normalRole;
	let normalUser;
	let readerRole;
	let settingsReader;

	beforeAll(async () => {
		await installTestSchema();
		const masterRow = await env.db.prepare(
			"SELECT role_id FROM role WHERE role_code = 'master' OR name = 'master' LIMIT 1"
		).first();
		masterRole = masterRow?.role_id || await createRole('round2-master', 'master');
		adminUser = await seedUser('admin@example.com', masterRole);
		const defaultRow = await env.db.prepare('SELECT role_id FROM role WHERE is_default = 1 LIMIT 1').first();
		defaultRole = defaultRow?.role_id || await createRole('round2-default', 'user_lv0', [], 1);
		normalRole = await createRole('round2-normal', 'custom', ['email:send']);
		readerRole = await createRole('round2-setting-reader', 'custom', ['setting:query']);
		normalUser = await seedUser('round2-normal@example.com', normalRole);
		settingsReader = await seedUser('round2-reader@example.com', readerRole);
		adminToken = await session(adminUser);

		await api('/api/setting/set', {
			method: 'PUT',
			token: adminToken,
			body: {
				title: 'Round2',
				oauthLoginEnabled: 1,
				oauthProviders: {
					apple: {
						enabled: 1,
						clientId: 'round2-client',
						clientSecret: 'round2-client-secret'
					}
				},
				r2Domain: 'https://cdn.round2.test',
				auditLogEnabled: 1,
				auditCriticalQuota: 4,
				regKey: 1
			}
		});
	});

	describe('signed attachment URLs', () => {
		it('serves the URL returned by the signing API verbatim at the Worker root', async () => {
			await env.kv.put('attachments/round2-root.png', 'round2-image-bytes', {
				metadata: { contentType: 'image/png', contentDisposition: 'inline' }
			});
			try {
				await env.db.prepare(
					`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, status, type, disposition)
					 VALUES (?, 0, 0, 'attachments/round2-root.png', 'round2-root.png', 'image/png', 19, 0, 1, 'inline')`
				).bind(adminUser.userId).run();

				const signed = await api('/api/oss-url/attachments/round2-root.png', { token: adminToken });
				const signedBody = await signed.json();
				expect(signedBody.code).toBe(200);
				const url = signedBody.data.url;
				expect(url.startsWith('/oss/attachments/round2-root.png?')).toBe(true);
				expect(url).not.toContain('/api/');
				expect(url).not.toContain('cdn.round2.test');

				// The returned value is used exactly; no /api prefix, no rewrite.
				const raw = await SELF.fetch(`${BASE}${url}`);
				expect(raw.status).toBe(200);
				expect(await raw.text()).toBe('round2-image-bytes');
				expect(raw.headers.get('Content-Type')).toBe('image/png');
				expect(raw.headers.get('X-Content-Type-Options')).toBe('nosniff');
				expect(raw.headers.get('Cache-Control')).toBe('private, no-store');
			} finally {
				await env.db.prepare("DELETE FROM attachments WHERE key = 'attachments/round2-root.png'").run();
				await env.kv.delete('attachments/round2-root.png');
			}
		});

		it('rejects unsigned, tampered, expired and wrong-object URLs', async () => {
			await env.kv.put('attachments/round2-negative.txt', 'negative-secret', {
				metadata: { contentType: 'text/plain' }
			});
			await env.kv.put('attachments/round2-other.txt', 'other-secret', {
				metadata: { contentType: 'text/plain' }
			});
			try {
				await env.db.prepare(
					`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, status, type)
					 VALUES (?, 0, 0, 'attachments/round2-negative.txt', 'round2-negative.txt', 'text/plain', 14, 0, 0)`
				).bind(adminUser.userId).run();

				const signed = await api('/api/oss-url/attachments/round2-negative.txt', { token: adminToken });
				const url = (await signed.json()).data.url;

				expect((await SELF.fetch(`${BASE}/oss/attachments/round2-negative.txt`)).status).toBe(404);
				expect((await SELF.fetch(`${BASE}${url.replace(/sig=[^&]+/, 'sig=AAAA')}`)).status).toBe(404);
				expect((await SELF.fetch(`${BASE}${url.replace('round2-negative.txt', 'round2-other.txt')}`)).status).toBe(404);
				const expired = await signExpiredObjectUrl('attachments/round2-negative.txt', adminUser.userId);
				expect((await SELF.fetch(`${BASE}${expired}`)).status).toBe(404);
				expect((await SELF.fetch(`${BASE}${url}`)).status).toBe(200);
			} finally {
				await env.db.prepare("DELETE FROM attachments WHERE key = 'attachments/round2-negative.txt'").run();
				await env.kv.delete('attachments/round2-negative.txt');
				await env.kv.delete('attachments/round2-other.txt');
			}
		});

		it('keeps static assets public and rejects encoded traversal', async () => {
			await env.kv.put('static/avatar/1/round2.png', 'static-bytes', {
				metadata: { contentType: 'image/png', contentDisposition: 'inline' }
			});
			try {
				const staticRes = await SELF.fetch(`${BASE}/oss/static/avatar/1/round2.png`);
				expect(staticRes.status).toBe(200);
				expect(await staticRes.text()).toBe('static-bytes');
				expect(staticRes.headers.get('Cache-Control')).toContain('public');

				const traversal = await SELF.fetch(`${BASE}/oss/..%2Fauth-uid%3A2`);
				expect(traversal.status).toBe(404);
				expect(await traversal.text()).not.toContain('session');
			} finally {
				await env.kv.delete('static/avatar/1/round2.png');
			}
		});
	});

	describe('r2Domain cannot bypass the signed path', () => {
		it('signs attachments for an r2Domain instance and never emits the public attachment link', async () => {
			await env.kv.put('attachments/round2-r2domain.png', 'r2domain-bytes', {
				metadata: { contentType: 'image/png', contentDisposition: 'inline' }
			});
			try {
				await env.db.prepare(
					`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, status, type, disposition)
					 VALUES (?, 0, 0, 'attachments/round2-r2domain.png', 'round2-r2domain.png', 'image/png', 14, 0, 1, 'inline')`
				).bind(adminUser.userId).run();

				const batch = await api('/api/oss-url/batch', {
					method: 'POST',
					token: adminToken,
					body: { keys: ['attachments/round2-r2domain.png'] }
				});
				const urls = (await batch.json()).data.urls;
				const url = urls['attachments/round2-r2domain.png'];
				expect(url.startsWith('/oss/attachments/round2-r2domain.png?')).toBe(true);
				expect(url).not.toContain('cdn.round2.test');
				expect((await SELF.fetch(`${BASE}${url}`)).status).toBe(200);

				const content = '<p>x</p><img src="{{domain}}attachments/round2-r2domain.png">';
				const signedContent = await attService.signContentAttachmentUrls(ctx, content, adminUser.userId, 60);
				expect(signedContent).toContain('/oss/attachments/round2-r2domain.png?');
				expect(signedContent).not.toContain('cdn.round2.test/attachments');
			} finally {
				await env.db.prepare("DELETE FROM attachments WHERE key = 'attachments/round2-r2domain.png'").run();
				await env.kv.delete('attachments/round2-r2domain.png');
			}
		});

		it('refuses to sign another user\'s attachment and rejects the unsigned Worker path', async () => {
			await env.kv.put('attachments/round2-foreign.txt', 'foreign-bytes', {
				metadata: { contentType: 'text/plain' }
			});
			try {
				await env.db.prepare(
					`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, status, type)
					 VALUES (?, 0, 0, 'attachments/round2-foreign.txt', 'round2-foreign.txt', 'text/plain', 13, 0, 0)`
				).bind(adminUser.userId).run();

				const normalToken = await session(normalUser);
				const batch = await api('/api/oss-url/batch', {
					method: 'POST',
					token: normalToken,
					body: { keys: ['attachments/round2-foreign.txt'] }
				});
				const urls = (await batch.json()).data.urls;
				expect(urls['attachments/round2-foreign.txt']).toBeUndefined();
				expect((await SELF.fetch(`${BASE}/oss/attachments/round2-foreign.txt`)).status).toBe(404);
			} finally {
				await env.db.prepare("DELETE FROM attachments WHERE key = 'attachments/round2-foreign.txt'").run();
				await env.kv.delete('attachments/round2-foreign.txt');
			}
		});

		it('signs inline images in the Telegram template path and neutralizes unowned placeholders', async () => {
			const inserted = await env.db.prepare(
				`INSERT INTO email (send_email, account_id, user_id, subject, text, content, to_email, type, status)
				 VALUES ('sender@round2.test', ?, ?, 'Round2 Telegram', 'telegram', ?, 'admin@example.com', 0, 0)`
			).bind(adminUser.accountId, adminUser.userId,
				'<p>ok</p><img src="{{domain}}attachments/round2-telegram.png"><img src="{{domain}}attachments/round2-unowned.png">'
			).run();
			const emailId = inserted.meta.last_row_id;
			await env.kv.put('attachments/round2-telegram.png', 'telegram-bytes', {
				metadata: { contentType: 'image/png', contentDisposition: 'inline' }
			});
			try {
				await env.db.prepare(
					`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, status, type, content_id)
					 VALUES (?, ?, ?, 'attachments/round2-telegram.png', 'round2-telegram.png', 'image/png', 14, 0, 1, 'round2-tg')`
				).bind(adminUser.userId, emailId, adminUser.accountId).run();

				const shareToken = await jwtUtils.generateToken({ env }, { emailId }, 3600);
				const html = await telegramService.getEmailContent(ctx, { token: shareToken }, 'round2nonce');
				const match = html.match(/\/oss\/attachments\/round2-telegram\.png\?[^"'\\\s]+/);
				expect(match).toBeTruthy();
				expect(html).not.toContain('cdn.round2.test/attachments/round2-telegram.png');
				expect(html).not.toContain('cdn.round2.test/attachments/round2-unowned.png');
				expect(html).toContain('/attachments/round2-unowned.png');

				const raw = await SELF.fetch(`${BASE}${match[0].replace(/&amp;/g, '&')}`);
				expect(raw.status).toBe(200);
				expect(await raw.text()).toBe('telegram-bytes');
			} finally {
				await env.db.prepare('DELETE FROM attachments WHERE email_id = ?').bind(emailId).run();
				await env.db.prepare('DELETE FROM email WHERE email_id = ?').bind(emailId).run();
				await env.kv.delete('attachments/round2-telegram.png');
			}
		});
	});

	describe('setting schema split and migration', () => {
		it('keeps base and companion tables within D1 limits and the schema step is idempotent', async () => {
			await ensureSettingExtSchema(getUserDb(ctx));
			await ensureSettingExtSchema(getUserDb(ctx));

			const widths = await env.db.prepare(
				`SELECT (SELECT COUNT(*) FROM pragma_table_info('setting')) AS base_cols,
					(SELECT COUNT(*) FROM pragma_table_info('setting_ext')) AS ext_cols,
					(SELECT COUNT(*) FROM setting) AS base_rows,
					(SELECT COUNT(*) FROM setting_ext) AS ext_rows`
			).first();
			expect(widths.base_cols).toBeLessThanOrEqual(100);
			expect(widths.ext_cols).toBeLessThanOrEqual(100);
			expect(widths.base_rows).toBe(1);
			expect(widths.ext_rows).toBe(1);

			const query = await api('/api/setting/query', { token: adminToken });
			const setting = (await query.json()).data;
			expect(setting.oauthLoginEnabled).toBe(1);
			expect(setting.oauthProviders.apple.clientId).toBe('round2-client');
			expect(setting.auditCriticalQuota).toBe(4);
		});

		it('migrates a legacy 100-column setting table while preserving values and the administrator', async () => {
			for (const [name, ddl] of [
				['audit_log_enabled', 'INTEGER DEFAULT 1'],
				['audit_max_ip_per_account', 'INTEGER DEFAULT 3'],
				['audit_max_device_per_account', 'INTEGER DEFAULT 3'],
				['audit_auto_clean_oldest', 'INTEGER DEFAULT 1'],
				['audit_prioritize_non_critical_clean', 'INTEGER DEFAULT 1'],
				['audit_critical_quota', 'INTEGER DEFAULT 3']
			]) {
				await addColumn('setting', `${name} ${ddl}`);
			}
			await env.db.prepare('DROP TABLE IF EXISTS setting_ext').run();
			await env.db.prepare(
				`UPDATE setting SET title = 'LegacyRound2', r2_domain = 'legacy.round2.test',
					audit_log_enabled = 0, audit_max_ip_per_account = 8, audit_critical_quota = 9`
			).run();
			await env.kv.delete('setting:');

			const widthsBefore = await env.db.prepare("SELECT COUNT(*) AS total FROM pragma_table_info('setting')").first();
			expect(widthsBefore.total).toBe(100);

			// Same migration entry point used by /api/init (intDB, v3_16, v3_18,
			// v3_19 all call ensureSettingExtSchema).
			await ensureSettingExtSchema(getUserDb(ctx));

			const after = await env.db.prepare(
				`SELECT (SELECT COUNT(*) FROM pragma_table_info('setting')) AS base_cols,
					(SELECT COUNT(*) FROM pragma_table_info('setting_ext')) AS ext_cols,
					(SELECT title FROM setting) AS title,
					(SELECT r2_domain FROM setting) AS r2_domain,
					(SELECT audit_log_enabled FROM setting_ext) AS audit_log,
					(SELECT audit_max_ip_per_account FROM setting_ext) AS audit_ip,
					(SELECT audit_critical_quota FROM setting_ext) AS audit_quota,
					(SELECT COUNT(*) FROM user WHERE user_id = ? AND email = 'admin@example.com') AS admin_kept`
			).bind(adminUser.userId).first();
			expect(after.base_cols).toBe(94);
			expect(after.ext_cols).toBe(8);
			expect(after.title).toBe('LegacyRound2');
			expect(after.r2_domain).toBe('legacy.round2.test');
			expect(after.audit_log).toBe(0);
			expect(after.audit_ip).toBe(8);
			expect(after.audit_quota).toBe(9);
			expect(after.admin_kept).toBe(1);
		});

		it('keeps raw provider secrets hidden from a non-owner', async () => {
			const readerToken = await session(settingsReader);
			const response = await api('/api/setting/query', { token: readerToken });
			const body = await response.json();
			expect(body.code).toBe(200);
			expect(body.data.oauthProviders.apple.clientSecret).toBe('******');
			expect(body.data.secretKey === null || String(body.data.secretKey).includes('******')).toBe(true);
			expect(JSON.stringify(body.data)).not.toContain('round2-client-secret');
		});
	});

	describe('OAuth contract and single-use credentials', () => {
		let applePrivateKey;

		beforeAll(async () => {
			const material = await createAppleJwks();
			applePrivateKey = material.pair.privateKey;
		});

		beforeEach(async () => {
			// Earlier migration/binding cases may rewrite the single-row setting
			// table; restore the provider config each case starts from.
			await env.kv.delete('setting:');
			await settingService.set(ctx, {
				title: 'Round2',
				oauthLoginEnabled: 1,
				oauthProviders: {
					apple: { enabled: 1, clientId: 'round2-client', clientSecret: 'round2-client-secret' }
				},
				r2Domain: 'https://cdn.round2.test',
				allMailMode: 0,
				regKey: 1,
				register: 0
			});
			await env.kv.put('setting_totp_status', '1');
		});

		async function bindExistingOauth(email, sub) {
			const user = await env.db.prepare('SELECT user_id, email FROM user WHERE email = ?').bind(email).first();
			expect(user).toBeTruthy();
			await env.db.prepare(
				'INSERT INTO oauth (oauth_user_id, username, name, user_id) VALUES (?, ?, ?, ?)'
			).bind(sub, sub, 'Round2', user.user_id).run();
			return user;
		}

		async function runExistingLogin(email, sub, extraPayload = {}) {
			await bindExistingOauth(email, sub);
			const { state, nonce, cookie } = await startAppleFlow();
			const idToken = await signAppleIdToken(applePrivateKey, {
				iss: 'https://appleid.apple.com',
				aud: 'round2-client',
				sub,
				exp: Math.floor(Date.now() / 1000) + 300,
				nonce,
				email,
				email_verified: true,
				...extraPayload
			});
			const callback = await appleCallback(idToken, state, cookie);
			expect(callback.status).toBe(302);
			return locationUrl(callback);
		}

		it('returns the real success object and a working session for a normal OAuth login', async () => {
			const callbackUrl = await runExistingLogin('round2-normal@example.com', 'round2-normal');
			const loginCode = callbackUrl.searchParams.get('oauth_code');
			expect(loginCode).toBeTruthy();

			const exchange = await exchangeLoginCode(loginCode);
			expect(exchange.code).toBe(200);
			expect(typeof exchange.data.token).toBe('string');
			expect(exchange.data.token.length).toBeGreaterThan(20);
			expect(exchange.data.mfa).toBeUndefined();
			expect(exchange.data.mfaRequired).toBeUndefined();
			expect(exchange.data.email).toBe('round2-normal@example.com');

			const me = await api('/api/my/loginUserInfo', { token: exchange.data.token });
			const meBody = await me.json();
			expect(meBody.code).toBe(200);
			expect(meBody.data.email).toBe('round2-normal@example.com');

			const replay = await exchangeLoginCode(loginCode);
			expect(replay.code).toBe(401);
		});

		it('does not issue a full session before the local TOTP challenge completes', async () => {
			await seedUser('round2-mfa@example.com', normalRole, 'ProbePass123!', {
				totpEnabled: 1,
				totpSecret: 'JBSWY3DPEHPK3PXP'
			});
			await env.db.prepare("UPDATE setting SET all_mail_mode = 1 WHERE 1 = 1").run();
			await env.kv.put('setting_totp_status', '1');
			await env.kv.delete('setting:');

			const callbackUrl = await runExistingLogin('round2-mfa@example.com', 'round2-mfa');
			const loginCode = callbackUrl.searchParams.get('oauth_code');
			const exchange = await exchangeLoginCode(loginCode);
			expect(exchange.code).toBe(200);
			expect(exchange.data.mfaRequired).toBe(true);
			expect(exchange.data.token).toBeUndefined();
			expect(exchange.data.tempToken).toMatch(/^totp_tmp_/);
			expect(exchange.data.email).toBe('round2-mfa@example.com');
		});

		it('propagates the restricted-account object instead of a session token', async () => {
			await seedUser('round2-banned@example.com', normalRole, 'ProbePass123!', { status: 1 });
			const callbackUrl = await runExistingLogin('round2-banned@example.com', 'round2-banned');
			const loginCode = callbackUrl.searchParams.get('oauth_code');
			const exchange = await exchangeLoginCode(loginCode);
			expect(exchange.code).toBe(200);
			expect(exchange.data.isRestricted).toBe(true);
			expect(exchange.data.restrictedToken).toBeTruthy();
			expect(exchange.data.token).toBeUndefined();
		});

		it('binds a new OAuth identity through the callback proof and the real registration policy', async () => {
			await settingService.set(ctx, { regKey: 0, register: 0, registerVerify: 1 });
			await env.db.prepare(
				`INSERT INTO reg_key (code, count, role_id, user_id, expire_time)
				 VALUES ('ROUND2-INVITE', 5, ?, 0, '2099-01-01 00:00:00')`
			).bind(defaultRole).run();

			const startBindFlow = async () => {
				const { state, nonce, cookie } = await startAppleFlow();
				const idToken = await signAppleIdToken(applePrivateKey, {
					iss: 'https://appleid.apple.com',
					aud: 'round2-client',
					sub: 'round2-bind',
					exp: Math.floor(Date.now() / 1000) + 300,
					nonce,
					email: 'round2-bind@example.com',
					email_verified: true
				});
				const callbackUrl = locationUrl(await appleCallback(idToken, state, cookie));
				const bindProof = new URLSearchParams(callbackUrl.hash.replace(/^#/, '')).get('oauth_bind');
				expect(bindProof).toBeTruthy();
				expect(callbackUrl.searchParams.get('oauth_provider')).toBe('apple');
				return { bindProof, oauthUserId: callbackUrl.searchParams.get('oauth_user_id') };
			};

			const firstAttempt = await startBindFlow();
			expect(firstAttempt.oauthUserId).toBe('apple:round2-bind');

			const wrongCode = await api('/api/oauth/bindUser', {
				method: 'PUT',
				body: {
					email: 'round2-bind@example.com', code: 'WRONG-INVITE',
					oauthUserId: firstAttempt.oauthUserId, provider: 'apple', bindToken: firstAttempt.bindProof
				}
			});
			expect((await wrongCode.json()).code).not.toBe(200);

			// A failed registration consumes the one-time proof; the user
			// restarts the OAuth callback and submits the correct invite code.
			const secondAttempt = await startBindFlow();
			const { oauthUserId, bindProof } = secondAttempt;
			const bound = await api('/api/oauth/bindUser', {
				method: 'PUT',
				body: {
					email: 'round2-bind@example.com', code: 'ROUND2-INVITE',
					oauthUserId, provider: 'apple', bindToken: bindProof
				}
			});
			const boundBody = await bound.json();
			expect(boundBody.code).toBe(200);
			expect(typeof boundBody.data.token).toBe('string');
			expect(boundBody.data.mfa).toBeUndefined();

			const linked = await env.db.prepare('SELECT user_id FROM oauth WHERE oauth_user_id = ?').bind(oauthUserId).first();
			expect(linked.user_id).toBeGreaterThan(0);
			const user = await env.db.prepare('SELECT user_id, email FROM user WHERE user_id = ?').bind(linked.user_id).first();
			expect(user.email).toBe('round2-bind@example.com');

			const me = await api('/api/my/loginUserInfo', { token: boundBody.data.token });
			expect((await me.json()).data.email).toBe('round2-bind@example.com');

			const replay = await api('/api/oauth/bindUser', {
				method: 'PUT',
				body: {
					email: 'round2-bind@example.com', code: 'ROUND2-INVITE',
					oauthUserId, provider: 'apple', bindToken: bindProof
				}
			});
			expect((await replay.json()).code).not.toBe(200);
		});

		it('disables the legacy state-less LinuxDo login endpoint', async () => {
			const response = await api('/api/oauth/linuxDo/login', {
				method: 'POST',
				body: { code: 'legacy-code' }
			});
			const body = await response.json();
			expect(response.status).toBe(410);
			expect(body.code).toBe(410);
		});

		it('atomically consumes state, login codes and bind proofs exactly once under concurrency', async () => {
			const { state } = await startAppleFlow();
			const stateResults = await Promise.allSettled(
				Array.from({ length: 8 }, () => oauthService.consumeState(ctx, 'apple', state))
			);
			expect(stateResults.filter(result => result.status === 'fulfilled').length).toBe(1);
			expect(stateResults.filter(result => result.status === 'rejected').length).toBe(7);

			const code = await oauthService.createLoginExchangeCode(ctx, {
				token: 'round2-jwt', userInfo: { oauthUserId: 'apple:round2' }, provider: 'apple'
			});
			const codeResults = await Promise.allSettled(
				Array.from({ length: 8 }, () => oauthService.consumeLoginExchangeCode(ctx, code))
			);
			expect(codeResults.filter(result => result.status === 'fulfilled').length).toBe(1);

			const bindToken = await issueOAuthToken(ctx, {
				kind: 'bind', provider: 'apple', subject: 'apple:round2-concurrent',
				payload: { oauthUserId: 'apple:round2-concurrent', provider: 'apple' }, ttlSeconds: 600
			});
			const wrongSubject = await consumeOAuthToken(ctx, {
				kind: 'bind', provider: 'apple', subject: 'apple:other', token: bindToken
			});
			expect(wrongSubject).toBeNull();
			const bindResults = await Promise.allSettled(
				Array.from({ length: 8 }, () => consumeOAuthToken(ctx, {
					kind: 'bind', provider: 'apple', subject: 'apple:round2-concurrent', token: bindToken
				}))
			);
			const bindWinners = bindResults.filter(result => result.status === 'fulfilled' && result.value);
			expect(bindWinners.length).toBe(1);
		});

		it('rejects expired credentials and reports wrong kind/provider without consuming them', async () => {
			await issueOAuthToken(ctx, { kind: 'state', provider: 'apple', payload: { provider: 'apple' }, ttlSeconds: 600 });
			await env.db.prepare(
				`INSERT INTO oauth_one_time_token (token_hash, kind, provider, subject, payload, expires_at)
				 VALUES (?, 'login_code', '', '', ?, ?)`
			).bind(await sha256Hex('round2-expired-code'), JSON.stringify({ token: 'stale' }), Date.now() - 1000).run();
			expect(await consumeOAuthToken(ctx, { kind: 'login_code', token: 'round2-expired-code' })).toBeNull();

			const bindToken = await issueOAuthToken(ctx, {
				kind: 'bind', provider: 'apple', subject: 'apple:wrong-object',
				payload: { oauthUserId: 'apple:wrong-object', provider: 'apple' }, ttlSeconds: 600
			});
			expect(await consumeOAuthToken(ctx, { kind: 'bind', provider: 'google', subject: 'apple:wrong-object', token: bindToken })).toBeNull();
			expect(await consumeOAuthToken(ctx, { kind: 'bind', provider: 'apple', subject: 'apple:other', token: bindToken })).toBeNull();
			const valid = await consumeOAuthToken(ctx, {
				kind: 'bind', provider: 'apple', subject: 'apple:wrong-object', token: bindToken
			});
			expect(valid.oauthUserId).toBe('apple:wrong-object');
			expect(await consumeOAuthToken(ctx, {
				kind: 'bind', provider: 'apple', subject: 'apple:wrong-object', token: bindToken
			})).toBeNull();
		});
	});
});
