/**
 * B4 — first-password capability for OAuth-created accounts.
 *
 * The account-creation contract is unchanged: the bind flow still seeds a
 * random password. What is new is a *narrow* way for the owner to replace it:
 *
 *   - the session must have been issued by a provider login,
 *   - that provider login must be fresh (INITIAL_PASSWORD_WINDOW_MS),
 *   - the stored password must still be the exact hash generated at bind,
 *   - the account must be linked to a provider identity.
 *
 * There is deliberately no path that accepts an email address or an
 * oauthUserId as proof. These tests assert each gate independently so a future
 * refactor cannot quietly drop one.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import userService from '../src/service/user-service.js';
import loginService from '../src/service/login-service.js';
import settingService from '../src/service/setting-service.js';
import cryptoUtils from '../src/utils/crypto-utils.js';
import JwtUtils from '../src/utils/jwt-utils.js';
import KvConst from '../src/const/kv-const.js';
import constant from '../src/const/constant.js';

const CREATE_USER = `
CREATE TABLE IF NOT EXISTS user (
	user_id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL,
	type INTEGER DEFAULT 1 NOT NULL,
	password TEXT NOT NULL,
	salt TEXT NOT NULL,
	status INTEGER DEFAULT 0 NOT NULL,
	create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
	active_time DATETIME,
	create_ip TEXT,
	active_ip TEXT,
	os TEXT,
	browser TEXT,
	device TEXT,
	sort TEXT DEFAULT 0,
	send_count TEXT DEFAULT 0,
	reg_key_id INTEGER DEFAULT 0 NOT NULL,
	is_del INTEGER DEFAULT 0 NOT NULL,
	custom_labels TEXT NOT NULL DEFAULT '[]',
	totp_enabled INTEGER DEFAULT 0 NOT NULL,
	totp_secret TEXT DEFAULT '' NOT NULL,
	totp_key_version INTEGER DEFAULT 1 NOT NULL,
	totp_backup_codes TEXT DEFAULT '[]' NOT NULL,
	totp_created_at TEXT DEFAULT '' NOT NULL,
	security_keys TEXT DEFAULT '[]' NOT NULL,
	storage_quota_mb INTEGER DEFAULT 0 NOT NULL,
	byo_storage_enabled INTEGER DEFAULT 0 NOT NULL,
	byo_storage_config TEXT DEFAULT '{}' NOT NULL
)`;

const CREATE_OAUTH = `
CREATE TABLE IF NOT EXISTS oauth (
	oauth_id INTEGER PRIMARY KEY AUTOINCREMENT,
	oauth_user_id TEXT,
	username TEXT,
	name TEXT,
	avatar TEXT,
	active INTEGER,
	trust_level INTEGER,
	silenced INTEGER,
	create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
	platform INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL DEFAULT 0
)`;

const USER_ID = 7;
const EMAIL = 'oauth.user@example.com';
const GENERATED_HASH = 'generated-hash-never-chosen';
const GENERATED_SALT = 'generated-salt';

function createMockKv() {
	const store = new Map();
	return {
		store,
		async get(key, options) {
			const value = store.get(key);
			if (value === undefined) return null;
			if (options?.type === 'json') {
				try { return JSON.parse(value); } catch (_) { return null; }
			}
			return value;
		},
		async put(key, value) {
			store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
		},
		async delete(key) {
			store.delete(key);
		}
	};
}

function context(kv, jwt) {
	return {
		env: {
			db: env.db,
			kv,
			jwt_secret: 'b4-initial-password-test-secret',
			domain: ['example.com'],
			admin: 'admin@example.com'
		},
		req: {
			url: 'https://mail.example.com/api/my/setInitialPassword',
			header: (name) => (String(name).toLowerCase() === 'authorization' ? jwt : null)
		}
	};
}

async function seedUser({ password = GENERATED_HASH, salt = GENERATED_SALT } = {}) {
	await env.db.prepare('DELETE FROM user WHERE user_id = ?').bind(USER_ID).run();
	await env.db.prepare(
		'INSERT INTO user (user_id, email, password, salt, is_del, status) VALUES (?, ?, ?, ?, 0, 0)'
	).bind(USER_ID, EMAIL, password, salt).run();
}

async function seedOauthLink(userId = USER_ID) {
	await env.db.prepare('DELETE FROM oauth').run();
	await env.db.prepare(
		'INSERT INTO oauth (oauth_user_id, username, name, user_id) VALUES (?, ?, ?, ?)'
	).bind('apple:user-7', 'oauth-user', 'OAuth User', userId).run();
}

async function issueSession(c, kv, { method = 'oauth', at = Date.now(), provider = 'apple', withMeta = true } = {}) {
	const token = 'session-token-uuid';
	const jwt = await JwtUtils.generateToken(c, { userId: USER_ID, loginEmail: EMAIL, token });
	const authInfo = { tokens: [token], user: { userId: USER_ID, email: EMAIL }, refreshTime: new Date().toISOString() };
	if (withMeta) authInfo.tokenMeta = { [token]: { method, provider, at } };
	await kv.put(KvConst.AUTH_INFO + USER_ID, JSON.stringify(authInfo));
	return jwt;
}

async function reloadUser() {
	return await env.db.prepare('SELECT password, salt FROM user WHERE user_id = ?').bind(USER_ID).first();
}

beforeAll(async () => {
	await env.db.prepare(CREATE_USER).run();
	await env.db.prepare(CREATE_OAUTH).run();
});

beforeEach(async () => {
	await seedUser();
	await seedOauthLink();
});

afterEach(() => {
	vi.restoreAllMocks();
});

afterAll(async () => {
	await env.db.prepare('DELETE FROM user WHERE user_id = ?').bind(USER_ID).run();
	await env.db.prepare('DELETE FROM oauth').run();
	await env.db.prepare('DROP TABLE IF EXISTS user').run();
	await env.db.prepare('DROP TABLE IF EXISTS oauth').run();
});

describe('eligibility gates for the first password', () => {
	it('allows a fresh provider session for an account that still has the generated password', async () => {
		const kv = createMockKv();
		const c = context(kv, 'placeholder');
		const jwt = await issueSession(c, kv);
		c.req.header = (name) => (String(name).toLowerCase() === 'authorization' ? jwt : null);
		await kv.put(KvConst.INITIAL_PASSWORD + USER_ID, GENERATED_HASH);

		const eligibility = await userService.evaluateInitialPassword(c, USER_ID);
		expect(eligibility.canSet).toBe(true);
		expect(eligibility.generatedHash).toBe(GENERATED_HASH);
	});

	it('denies a session that was not issued by a provider login', async () => {
		const kv = createMockKv();
		const c = context(kv, 'placeholder');
		const jwt = await issueSession(c, kv, { withMeta: false });
		c.req.header = (name) => (String(name).toLowerCase() === 'authorization' ? jwt : null);
		await kv.put(KvConst.INITIAL_PASSWORD + USER_ID, GENERATED_HASH);

		expect((await userService.evaluateInitialPassword(c, USER_ID)).canSet).toBe(false);
	});

	it('denies a provider session older than the freshness window', async () => {
		const kv = createMockKv();
		const c = context(kv, 'placeholder');
		const jwt = await issueSession(c, kv, { at: Date.now() - constant.INITIAL_PASSWORD_WINDOW_MS - 1000 });
		c.req.header = (name) => (String(name).toLowerCase() === 'authorization' ? jwt : null);
		await kv.put(KvConst.INITIAL_PASSWORD + USER_ID, GENERATED_HASH);

		expect((await userService.evaluateInitialPassword(c, USER_ID)).canSet).toBe(false);
	});

	it('denies when the stored password is no longer the generated one', async () => {
		const kv = createMockKv();
		const c = context(kv, 'placeholder');
		const jwt = await issueSession(c, kv);
		c.req.header = (name) => (String(name).toLowerCase() === 'authorization' ? jwt : null);
		// The user (or an admin) already chose a password; the marker is stale.
		await seedUser({ password: 'user-chosen-hash', salt: 'user-chosen-salt' });
		await kv.put(KvConst.INITIAL_PASSWORD + USER_ID, GENERATED_HASH);

		expect((await userService.evaluateInitialPassword(c, USER_ID)).canSet).toBe(false);
	});

	it('denies an account with no provider link even if a marker exists', async () => {
		const kv = createMockKv();
		const c = context(kv, 'placeholder');
		const jwt = await issueSession(c, kv);
		c.req.header = (name) => (String(name).toLowerCase() === 'authorization' ? jwt : null);
		await kv.put(KvConst.INITIAL_PASSWORD + USER_ID, GENERATED_HASH);
		await env.db.prepare('DELETE FROM oauth').run();

		expect((await userService.evaluateInitialPassword(c, USER_ID)).canSet).toBe(false);
	});
});

describe('setting the first password', () => {
	it('replaces the generated password, revokes sessions and consumes the marker', async () => {
		const kv = createMockKv();
		const c = context(kv, 'placeholder');
		const jwt = await issueSession(c, kv);
		c.req.header = (name) => (String(name).toLowerCase() === 'authorization' ? jwt : null);
		await kv.put(KvConst.INITIAL_PASSWORD + USER_ID, GENERATED_HASH);

		const result = await userService.setInitialPassword(c, { password: 'new-user-password' }, USER_ID);
		expect(result).toEqual({ success: true });

		const row = await reloadUser();
		expect(row.password).not.toBe(GENERATED_HASH);
		const check = await cryptoUtils.verifyPasswordWithUpgrade('new-user-password', row.salt, row.password, c.env);
		expect(check.isValid).toBe(true);

		expect(await kv.get(KvConst.INITIAL_PASSWORD + USER_ID)).toBeNull();
		expect(await kv.get(KvConst.AUTH_INFO + USER_ID)).toBeNull();
	});

	it('refuses without a provider-issued session', async () => {
		const kv = createMockKv();
		const c = context(kv, 'placeholder');
		const jwt = await issueSession(c, kv, { withMeta: false });
		c.req.header = (name) => (String(name).toLowerCase() === 'authorization' ? jwt : null);
		await kv.put(KvConst.INITIAL_PASSWORD + USER_ID, GENERATED_HASH);

		await expect(userService.setInitialPassword(c, { password: 'new-user-password' }, USER_ID))
			.rejects.toMatchObject({ code: 403 });
		expect((await reloadUser()).password).toBe(GENERATED_HASH);
	});

	it('refuses a second time once a password exists', async () => {
		const kv = createMockKv();
		const c = context(kv, 'placeholder');
		const jwt = await issueSession(c, kv);
		c.req.header = (name) => (String(name).toLowerCase() === 'authorization' ? jwt : null);
		await kv.put(KvConst.INITIAL_PASSWORD + USER_ID, GENERATED_HASH);

		await userService.setInitialPassword(c, { password: 'first-password' }, USER_ID);
		const afterFirst = await reloadUser();

		// A new provider session arrives, but the generated hash is gone.
		const kv2 = createMockKv();
		const c2 = context(kv2, 'placeholder');
		const jwt2 = await issueSession(c2, kv2);
		c2.req.header = (name) => (String(name).toLowerCase() === 'authorization' ? jwt2 : null);
		await kv2.put(KvConst.INITIAL_PASSWORD + USER_ID, GENERATED_HASH);

		await expect(userService.setInitialPassword(c2, { password: 'second-password' }, USER_ID))
			.rejects.toMatchObject({ code: 403 });
		expect((await reloadUser()).password).toBe(afterFirst.password);
	});

	it('enforces the shared password policy', async () => {
		const kv = createMockKv();
		const c = context(kv, 'placeholder');
		const jwt = await issueSession(c, kv);
		c.req.header = (name) => (String(name).toLowerCase() === 'authorization' ? jwt : null);
		await kv.put(KvConst.INITIAL_PASSWORD + USER_ID, GENERATED_HASH);

		await expect(userService.setInitialPassword(c, { password: '12345' }, USER_ID))
			.rejects.toMatchObject({ code: 400 });
		await expect(userService.setInitialPassword(c, { password: 'x'.repeat(31) }, USER_ID))
			.rejects.toMatchObject({ code: 400 });
		expect((await reloadUser()).password).toBe(GENERATED_HASH);
	});
});

describe('session provenance', () => {
	it('records provider provenance for an OAuth login and omits it for a normal one', async () => {
		const kv = createMockKv();
		const c = context(kv, null);
		vi.spyOn(userService, 'selectByEmailIncludeDel').mockResolvedValue({
			userId: USER_ID,
			email: EMAIL,
			password: GENERATED_HASH,
			salt: GENERATED_SALT,
			status: 0,
			isDel: 0
		});
		vi.spyOn(settingService, 'isTotpEnabled').mockResolvedValue(false);
		vi.spyOn(userService, 'updateUserInfo').mockResolvedValue();

		await loginService.login(c, {
			email: EMAIL,
			password: null,
			authMethod: 'oauth',
			authProvider: 'apple'
		}, true);

		const authInfo = await kv.get(KvConst.AUTH_INFO + USER_ID, { type: 'json' });
		expect(authInfo.tokens).toHaveLength(1);
		const meta = authInfo.tokenMeta[authInfo.tokens[0]];
		expect(meta).toMatchObject({ method: 'oauth', provider: 'apple' });
		expect(Number.isFinite(meta.at)).toBe(true);

		// A noVerifyPwd call without provenance (e.g. an internal flow) must not
		// inherit the previous session's marker.
		await loginService.login(c, { email: EMAIL, password: null }, true);
		const after = await kv.get(KvConst.AUTH_INFO + USER_ID, { type: 'json' });
		const newest = after.tokens[after.tokens.length - 1];
		expect(after.tokenMeta[newest]).toBeUndefined();
	});
});
