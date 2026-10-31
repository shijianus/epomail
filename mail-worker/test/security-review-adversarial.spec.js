/**
 * Independent security-review adversarial cases (2026-10-26 review round).
 *
 * These tests complement the first-round suite by probing boundary conditions
 * that were claimed fixed but not directly asserted:
 *  - object capability token clamping / uid binding / expiry edges
 *  - encoded-traversal variants on the root /static and /api/oss entry points
 *  - the bearer-capability model (any holder of a signed URL may read it)
 *  - OAuth authorize initiated WITHOUT a client state (server-side enabler of
 *    the empty-client-state login CSRF residual documented in the review)
 *  - bindUser provider mismatch handling
 *  - toImageUrlHtml ownership filter for the direct `attachments/` and
 *    `/oss/attachments/` content forms
 *
 * All seeded state is physically removed in afterAll (zero fake data).
 */
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { buildSignedObjectUrl, signObjectAccess, verifyObjectAccess } from '../src/utils/object-token.js';
import oauthService from '../src/service/oauth-service.js';
import settingService from '../src/service/setting-service.js';
import attService from '../src/service/att-service.js';
import loginService from '../src/service/login-service.js';
import userService from '../src/service/user-service.js';
import jwtUtils from '../src/utils/jwt-utils.js';
import { ensureOtcTable, seedOtc, clearOtc, ensureBindClaimTable, clearBindClaim } from './helpers/one-time-credential.js';

const MAX_TTL = 7 * 24 * 3600;

const CREATE_ATTACHMENTS = `
CREATE TABLE IF NOT EXISTS attachments (
	att_id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	email_id INTEGER NOT NULL,
	account_id INTEGER NOT NULL,
	key TEXT NOT NULL,
	filename TEXT,
	mime_type TEXT,
	size INTEGER,
	status TEXT DEFAULT '0' NOT NULL,
	type INTEGER DEFAULT 0 NOT NULL,
	disposition TEXT,
	related TEXT,
	content_id TEXT,
	encoding TEXT,
	create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
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
	create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
	user_id INTEGER DEFAULT 0 NOT NULL
)`;

beforeAll(async () => {
	await env.db.prepare(CREATE_ATTACHMENTS).run();
	await env.db.prepare(CREATE_OAUTH).run();
	await ensureOtcTable(env.db);
	await ensureBindClaimTable(env.db);
});

afterAll(async () => {
	await env.db.prepare('DELETE FROM attachments').run();
	await env.db.prepare('DELETE FROM oauth').run();
	await clearOtc(env.db);
	await clearBindClaim(env.db);
	for (const key of [
		'auth-uid:2', 'auth-uid:3',
		'attachments/adv-owned-by-2.txt',
		'attachments/adv-foreign-img.txt',
		'attachments/adv-own-img.txt',
		'static/avatar/9/adv.png'
	]) {
		await env.kv.delete(key);
	}
	await env.db.prepare('DELETE FROM attachments').run();
	await env.db.prepare('DELETE FROM oauth').run();
});

function createMockKv() {
	const store = new Map();
	return {
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
		},
		_raw: store
	};
}

async function seedAuth(userId, email, sessionToken) {
	const token = await jwtUtils.generateToken({ env }, { userId, token: sessionToken }, 3600);
	await env.kv.put(`auth-uid:${userId}`, JSON.stringify({
		user: { userId, email, isDel: 0, status: 0, type: 2 },
		tokens: [sessionToken],
		refreshTime: new Date().toISOString()
	}), { expirationTtl: 3600 });
	return token;
}

describe('Object capability token boundaries', () => {
	const c = { env: { jwt_secret: 'test-jwt-secret-for-unit-tests' } };

	it('clamps an oversized requested TTL to the 7-day ceiling', async () => {
		const token = await signObjectAccess(c, 'attachments/a.txt', { ttlSeconds: 365 * 24 * 3600, userId: 1 });
		const now = Math.floor(Date.now() / 1000);
		expect(token.exp - now).toBeLessThanOrEqual(MAX_TTL);
		expect(token.exp - now).toBeGreaterThan(MAX_TTL - 60);
	});

	it('binds the signature to the uid parameter; swapping uid invalidates it', async () => {
		const token = await signObjectAccess(c, 'attachments/a.txt', { ttlSeconds: 60, userId: 7 });
		const forgedParams = new URLSearchParams({ exp: String(token.exp), uid: '8', sig: token.sig });
		const url = new URL(`https://x.test/oss/attachments/a.txt?${forgedParams.toString()}`);
		const access = await verifyObjectAccess(c, 'attachments/a.txt', url);
		expect(access).toBeNull();
	});

	it('rejects an expired capability', async () => {
		const token = await signObjectAccess(c, 'attachments/a.txt', { ttlSeconds: 1, userId: 7 });
		const pastExp = token.exp - 120;
		const forgedParams = new URLSearchParams({ exp: String(pastExp), uid: String(token.uid), sig: token.sig });
		const url = new URL(`https://x.test/oss/attachments/a.txt?${forgedParams.toString()}`);
		expect(await verifyObjectAccess(c, 'attachments/a.txt', url)).toBeNull();
	});

	it('fails closed when jwt_secret is missing', async () => {
		await expect(signObjectAccess({ env: {} }, 'attachments/a.txt', {})).rejects.toThrow('jwt_secret');
		const url = new URL('https://x.test/oss/attachments/a.txt?exp=9999999999&uid=1&sig=AAAA');
		expect(await verifyObjectAccess({ env: {} }, 'attachments/a.txt', url)).toBeNull();
	});
});

describe('Object route adversarial entry points', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('never leaks session state through encoded traversal on the root /static route', async () => {
		await seedAuth(2, 'user2@example.com', 'adv-session-2');
		// A malformed key must produce an ordinary 404 rather than propagating a
		// null Response out of the worker: workerd raises an uncaught exception
		// for a null handler return, which is a robustness defect even though no
		// data is exposed.
		const response = await SELF.fetch('http://example.com/static/..%2Fauth-uid%3A2');
		const text = await response.text();
		expect(response.status).toBe(404);
		expect(text).not.toContain('adv-session-2');
		expect(text).not.toContain('tokens');
	});

	it('rejects encoded traversal on /api/oss', async () => {
		const response = await SELF.fetch('http://example.com/api/oss/static/..%2Fauth-uid%3A2');
		expect(response.status).toBe(404);
	});

	it('serves another user’s static avatar anonymously (documented public-static model)', async () => {
		await env.kv.put('static/avatar/9/adv.png', 'avatar-bytes', {
			metadata: { contentType: 'image/png', contentDisposition: 'inline' }
		});
		const response = await SELF.fetch('http://example.com/api/oss/static/avatar/9/adv.png');
		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toContain('no-store');
	});

	it('rejects an expired signed attachment URL', async () => {
		await env.kv.put('attachments/adv-owned-by-2.txt', 'adv-secret-body', {
			metadata: { contentType: 'text/plain' }
		});
		const signedUrl = await buildSignedObjectUrl({ env }, 'attachments/adv-owned-by-2.txt', { userId: 2, ttlSeconds: 60 });
		const expiredUrl = signedUrl.replace(/exp=\d+/, `exp=${Math.floor(Date.now() / 1000) - 10}`);
		const response = await SELF.fetch(`http://example.com/api${expiredUrl}`);
		expect(response.status).toBe(404);
	});

	it('treats a signed URL as a bearer capability (any holder may read within TTL)', async () => {
		await env.db.prepare('DELETE FROM attachments').run();
		await env.db.prepare('INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(2, 10, 20, 'attachments/adv-owned-by-2.txt', 'adv-owned-by-2.txt', 15, 0).run();
		await env.kv.put('attachments/adv-owned-by-2.txt', 'adv-secret-body', {
			metadata: { contentType: 'text/plain' }
		});

		const user2Token = await seedAuth(2, 'user2@example.com', 'adv-session-2');
		const signed = await SELF.fetch('http://example.com/api/oss-url/batch', {
			method: 'POST',
			headers: { Authorization: user2Token, 'Content-Type': 'application/json' },
			body: JSON.stringify({ keys: ['attachments/adv-owned-by-2.txt'] })
		});
		const signedBody = await signed.json();
		const url = signedBody.data.urls['attachments/adv-owned-by-2.txt'];
		expect(url).toBeTruthy();

		const user3Token = await seedAuth(3, 'user3@example.com', 'adv-session-3');
		const asUser3 = await SELF.fetch(`http://example.com/api${url}`, {
			headers: { Authorization: user3Token }
		});
		expect(asUser3.status).toBe(200);
		expect(await asUser3.text()).toBe('adv-secret-body');

		const anonymous = await SELF.fetch(`http://example.com/api${url}`);
		expect(anonymous.status).toBe(200);
	});

	it('caps batch signing at 200 keys and never signs non-object keys', async () => {
		const user2Token = await seedAuth(2, 'user2@example.com', 'adv-session-2');
		const keys = [];
		for (let i = 0; i < 260; i++) keys.push(`attachments/adv-missing-${i}.txt`);
		keys.push('auth-uid:1', 'setting:');

		const response = await SELF.fetch('http://example.com/api/oss-url/batch', {
			method: 'POST',
			headers: { Authorization: user2Token, 'Content-Type': 'application/json' },
			body: JSON.stringify({ keys })
		});
		const body = await response.json();
		expect(body.code).toBe(200);
		expect(Object.keys(body.data.urls || {})).toHaveLength(0);
	});
});

describe('OAuth server-side boundary probes', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('rejects authorize initiation without a browser client state', async () => {
		const kv = createMockKv();
		const c = {
			env: { kv, db: env.db, jwt_secret: 'test-jwt-secret-for-unit-tests' },
			req: { url: 'https://mail.example.com/api/oauth/authorize/apple', header: () => null }
		};
		vi.spyOn(settingService, 'query').mockResolvedValue({
			oauthLoginEnabled: 1,
			oauthProviders: {
				apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 }
			}
		});

		// No `state` query parameter, as a crafted attacker-initiated flow would.
		// Issuing a state here would let the callback omit `oauth_client_state`
		// and satisfy the login page's empty-vs-empty comparison.
		await expect(oauthService.getAuthorizeUrl(c, 'apple', '', '')).rejects.toMatchObject({
			code: 400,
			errorCode: 'oauth_state_required'
		});
	});

	it('rejects a bind proof whose provider does not match, but allows an omitted provider', async () => {
		await env.db.prepare('DELETE FROM oauth').run();
		await env.db.prepare('INSERT INTO oauth (oauth_user_id, username, name, user_id) VALUES (?, ?, ?, ?)')
			.bind('apple:adv-bind', 'adv-bind', 'Adv Bind', 0).run();

		const kv = createMockKv();
		const c = {
			env: {
				kv,
				db: env.db,
				jwt_secret: 'test-jwt-secret-for-unit-tests',
				domain: ['example.com'],
				admin: 'admin@example.com'
			},
			req: { url: 'https://mail.example.com/api/oauth/bindUser', header: () => null }
		};
		vi.spyOn(settingService, 'query').mockResolvedValue({
			oauthLoginEnabled: 1,
			oauthProviders: {
				apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 }
			}
		});
		vi.spyOn(loginService, 'validateRegistration').mockResolvedValue({});
		vi.spyOn(loginService, 'register').mockResolvedValue({ userId: 5, reservedRegKey: false });
		vi.spyOn(loginService, 'login').mockResolvedValue('bound-session-jwt');
		vi.spyOn(userService, 'selectByIdIncludeDel').mockResolvedValue(null);
		vi.spyOn(userService, 'selectByEmail').mockResolvedValue({ userId: 5, email: 'adv-bound@example.com' });

		const bindToken = 'adv-bind-proof-token';
		await seedOtc(env.db, {
			purpose: 'oauth_bind',
			token: bindToken,
			provider: 'apple',
			oauthUserId: 'apple:adv-bind',
			payload: {
				oauthUserId: 'apple:adv-bind',
				provider: 'apple',
				createdAt: Date.now()
			}
		});

		// Wrong provider in the request body is rejected.
		await expect(oauthService.bindUser(c, {
			email: 'adv-bound@example.com',
			oauthUserId: 'apple:adv-bind',
			code: 'invite',
			bindToken,
			provider: 'github'
		})).rejects.toThrow('bind proof');

		// Omitted provider still binds (documented behaviour).
		const result = await oauthService.bindUser(c, {
			email: 'adv-bound@example.com',
			oauthUserId: 'apple:adv-bind',
			code: 'invite',
			bindToken
		});
		expect(result.token).toBe('bound-session-jwt');

		await env.db.prepare('DELETE FROM oauth').run();
	});
});

describe('toImageUrlHtml direct-prefix ownership forms', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('filters foreign keys referenced via bare attachments/ and /oss/attachments/ forms', async () => {
		await env.db.prepare('DELETE FROM attachments').run();
		await env.db.prepare('INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(3, 11, 21, 'attachments/adv-foreign-img.txt', 'adv-foreign-img.txt', 12, 2).run();
		await env.db.prepare('INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(2, 10, 20, 'attachments/adv-own-img.txt', 'adv-own-img.txt', 12, 2).run();
		await env.kv.put('attachments/adv-foreign-img.txt', 'foreign-image');
		await env.kv.put('attachments/adv-own-img.txt', 'own-image');
		vi.spyOn(settingService, 'query').mockResolvedValue({ r2Domain: '' });

		const foreign = await attService.toImageUrlHtml(
			{ env },
			'<img src="attachments/adv-foreign-img.txt"><img src="/oss/attachments/adv-foreign-img.txt">',
			2
		);
		expect(foreign.imageDataList.some(item => item.key === 'attachments/adv-foreign-img.txt')).toBe(false);

		const own = await attService.toImageUrlHtml(
			{ env },
			'<img src="attachments/adv-own-img.txt"><img src="/oss/attachments/adv-own-img.txt">',
			2
		);
		expect(own.imageDataList.some(item => item.key === 'attachments/adv-own-img.txt')).toBe(true);
	});
});
