import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import oauthService from '../src/service/oauth-service.js';
import { issueOAuthToken } from '../src/service/oauth-one-time-service.js';
import loginService from '../src/service/login-service.js';
import userService from '../src/service/user-service.js';
import settingService from '../src/service/setting-service.js';
import { verifyAppleIdToken } from '../src/utils/oauth-jwt-utils.js';

const encoder = new TextEncoder();

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

function base64url(bytes) {
	let binary = '';
	for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function sha256Hex(value) {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
	return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function createSigningMaterial() {
	const pair = await crypto.subtle.generateKey(
		{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
		true,
		['sign', 'verify']
	);
	const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
	jwk.kid = 'apple-test-kid';
	jwk.use = 'sig';
	return { pair, jwk };
}

async function signRs256(privateKey, header, payload) {
	const headerPart = base64url(encoder.encode(JSON.stringify(header)));
	const payloadPart = base64url(encoder.encode(JSON.stringify(payload)));
	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		privateKey,
		encoder.encode(`${headerPart}.${payloadPart}`)
	);
	return `${headerPart}.${payloadPart}.${base64url(signature)}`;
}

function applePayload(overrides = {}) {
	return {
		iss: 'https://appleid.apple.com',
		aud: 'test-client-id',
		sub: 'apple-user-1',
		exp: Math.floor(Date.now() / 1000) + 300,
		nonce: 'test-nonce',
		...overrides
	};
}

describe('OAuth state, nonce and callback exchange', () => {
	let kv;
	let c;

	beforeEach(() => {
		kv = createMockKv();
		c = {
			env: { kv, db: env.db, jwt_secret: 'oauth-unit-test-secret' },
			req: { url: 'https://mail.example.com/api/oauth/authorize/apple', header: () => null }
		};
		vi.spyOn(settingService, 'query').mockResolvedValue({
			oauthProviders: {
				apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 }
			}
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('issues a server-side single-use state bound to provider and redirect URI', async () => {
		const authorizeUrl = new URL(await oauthService.getAuthorizeUrl(
			c,
			'apple',
			'https://mail.example.com/api/oauth/callback/apple',
			'client-state-123'
		));
		const state = authorizeUrl.searchParams.get('state');
		const nonce = authorizeUrl.searchParams.get('nonce');
		expect(state).toBeTruthy();
		expect(nonce).toBeTruthy();
		expect(authorizeUrl.searchParams.get('redirect_uri')).toBe('https://mail.example.com/api/oauth/callback/apple');

		await expect(oauthService.consumeState(c, 'google', state)).rejects.toThrow('state');
		const row = await oauthService.consumeState(c, 'apple', state);
		expect(row.provider).toBe('apple');
		expect(row.nonce).toBe(nonce);
		expect(row.clientState).toBe('client-state-123');
		await expect(oauthService.consumeState(c, 'apple', state)).rejects.toThrow('state');
	});

	it('rejects an unregistered redirect_uri instead of reflecting it', async () => {
		await expect(oauthService.getAuthorizeUrl(
			c,
			'apple',
			'https://attacker.example/callback'
		)).rejects.toThrow('redirect_uri');
	});

	it('rejects custom provider endpoints that target internal networks', async () => {
		settingService.query.mockResolvedValue({
			oauthProviders: {
				custom: {
					clientId: 'custom-client',
					clientSecret: 'custom-secret',
					enabled: 1,
					authUrl: 'http://169.254.169.254/latest/meta-data',
					tokenUrl: 'http://127.0.0.1:8080/token',
					userInfoUrl: 'https://sso.example.com/userinfo'
				}
			}
		});
		await expect(oauthService.getAuthorizeUrl(
			c,
			'custom',
			'https://mail.example.com/api/oauth/callback/custom'
		)).rejects.toThrow('restricted');
		await expect(oauthService.exchangeCodeAndLogin(c, 'custom', {
			code: 'fake',
			redirectUri: 'https://mail.example.com/api/oauth/callback/custom'
		})).rejects.toThrow('restricted');
	});

	it('exchanges a login code exactly once', async () => {
		const code = await oauthService.createLoginExchangeCode(c, {
			token: 'session-jwt',
			userInfo: { oauthUserId: 'apple:user-1' },
			provider: 'apple'
		});
		const first = await oauthService.consumeLoginExchangeCode(c, code);
		expect(first.token).toBe('session-jwt');
		await expect(oauthService.consumeLoginExchangeCode(c, code)).rejects.toThrow('login code');

		// Expired rows are removed by the same atomic DELETE; the payload never
		// leaves storage.
		await env.db.prepare(
			`INSERT INTO oauth_one_time_token (token_hash, kind, provider, payload, expires_at)
			 VALUES (?, 'login_code', '', ?, ?)`
		).bind(await sha256Hex('expired-code'), JSON.stringify({ token: 'stale-jwt' }), Date.now() - 1000).run();
		await expect(oauthService.consumeLoginExchangeCode(c, 'expired-code')).rejects.toThrow('login code');
	});
});

describe('Apple id_token verification', () => {
	let kv;
	let c;
	let pair;
	let jwk;

	beforeEach(async () => {
		kv = createMockKv();
		c = { env: { kv } };
		({ pair, jwk } = await createSigningMaterial());
		await kv.put('apple_jwks_v1', JSON.stringify({ keys: [{ ...jwk }] }));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('accepts a correctly signed token with a matching nonce', async () => {
		const token = await signRs256(pair.privateKey, { alg: 'RS256', kid: 'apple-test-kid' }, applePayload());
		const payload = await verifyAppleIdToken(c, token, 'test-client-id', { nonce: 'test-nonce' });
		expect(payload.sub).toBe('apple-user-1');
	});

	it('rejects nonce mismatch, expiry, missing expiry, wrong issuer and wrong audience', async () => {
		const token = await signRs256(pair.privateKey, { alg: 'RS256', kid: 'apple-test-kid' }, applePayload());
		await expect(verifyAppleIdToken(c, token, 'test-client-id', { nonce: 'other-nonce' })).rejects.toThrow('nonce');
		await expect(verifyAppleIdToken(c, await signRs256(pair.privateKey, { alg: 'RS256', kid: 'apple-test-kid' }, applePayload({ exp: Math.floor(Date.now() / 1000) - 600 })), 'test-client-id')).rejects.toThrow('expired');
		const noExp = applePayload();
		delete noExp.exp;
		await expect(verifyAppleIdToken(c, await signRs256(pair.privateKey, { alg: 'RS256', kid: 'apple-test-kid' }, noExp), 'test-client-id')).rejects.toThrow('expiry');
		await expect(verifyAppleIdToken(c, await signRs256(pair.privateKey, { alg: 'RS256', kid: 'apple-test-kid' }, applePayload({ iss: 'https://evil.example' })), 'test-client-id')).rejects.toThrow('issuer');
		await expect(verifyAppleIdToken(c, await signRs256(pair.privateKey, { alg: 'RS256', kid: 'apple-test-kid' }, applePayload({ aud: 'other-client' })), 'test-client-id')).rejects.toThrow('audience');
	});

	it('rejects forged signatures, unsupported algorithms and unknown kids', async () => {
		const other = await createSigningMaterial();
		const forged = await signRs256(other.pair.privateKey, { alg: 'RS256', kid: 'apple-test-kid' }, applePayload());
		await expect(verifyAppleIdToken(c, forged, 'test-client-id')).rejects.toThrow('signature');

		const algNoneHeader = base64url(encoder.encode(JSON.stringify({ alg: 'none', kid: 'apple-test-kid' })));
		const algNonePayload = base64url(encoder.encode(JSON.stringify(applePayload())));
		await expect(verifyAppleIdToken(c, `${algNoneHeader}.${algNonePayload}.`, 'test-client-id')).rejects.toThrow();

		const unknownKid = await signRs256(pair.privateKey, { alg: 'RS256', kid: 'rotated-kid' }, applePayload());
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'rotated-kid' }] }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		}));
		vi.stubGlobal('fetch', fetchMock);
		const payload = await verifyAppleIdToken(c, unknownKid, 'test-client-id');
		expect(payload.sub).toBe('apple-user-1');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe('OAuth account binding proof', () => {
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

	let kv;
	let c;

	beforeAll(async () => {
		await env.db.prepare(CREATE_OAUTH).run();
	});

	beforeEach(async () => {
		kv = createMockKv();
		await env.db.prepare('DELETE FROM oauth').run();
		await env.db.prepare('INSERT INTO oauth (oauth_user_id, username, name, user_id) VALUES (?, ?, ?, ?)')
			.bind('apple:bind-user', 'bind-user', 'Bind User', 0).run();
		c = {
			env: {
				kv,
				db: env.db,
				jwt_secret: 'oauth-unit-test-secret',
				domain: ['example.com'],
				admin: 'admin@example.com'
			},
			req: { url: 'https://mail.example.com/api/oauth/bindUser', header: () => null }
		};
		vi.spyOn(loginService, 'register').mockResolvedValue();
		vi.spyOn(loginService, 'login').mockResolvedValue({ token: 'bound-session-jwt', email: 'bound@example.com', userId: 2 });
		vi.spyOn(userService, 'selectByIdIncludeDel').mockResolvedValue(null);
		vi.spyOn(userService, 'selectByEmail').mockResolvedValue({ userId: 2, email: 'bound@example.com' });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	afterAll(async () => {
		await env.db.prepare('DELETE FROM oauth').run();
		await env.db.prepare('DROP TABLE IF EXISTS oauth').run();
	});

	it('requires a server-issued proof, consumes it once and refuses rebinding', async () => {
		await expect(oauthService.bindUser(c, {
			email: 'bound@example.com',
			oauthUserId: 'apple:bind-user',
			code: 'invite',
			bindToken: 'guessed-token',
			provider: 'apple'
		})).rejects.toThrow('bind proof');

		const bindToken = await issueOAuthToken(c, {
			kind: 'bind',
			provider: 'apple',
			subject: 'apple:bind-user',
			payload: { oauthUserId: 'apple:bind-user', provider: 'apple' },
			ttlSeconds: 600
		});

		const result = await oauthService.bindUser(c, {
			email: 'bound@example.com',
			oauthUserId: 'apple:bind-user',
			code: 'invite',
			bindToken,
			provider: 'apple'
		});
		expect(result.token).toBe('bound-session-jwt');

		const row = await env.db.prepare('SELECT user_id FROM oauth WHERE oauth_user_id = ?')
			.bind('apple:bind-user').first();
		expect(row.user_id).toBe(2);

		await expect(oauthService.bindUser(c, {
			email: 'second@example.com',
			oauthUserId: 'apple:bind-user',
			code: 'invite',
			bindToken,
			provider: 'apple'
		})).rejects.toThrow();

		const secondToken = await issueOAuthToken(c, {
			kind: 'bind',
			provider: 'apple',
			subject: 'apple:bind-user',
			payload: { oauthUserId: 'apple:bind-user', provider: 'apple' },
			ttlSeconds: 600
		});
		await expect(oauthService.bindUser(c, {
			email: 'second@example.com',
			oauthUserId: 'apple:bind-user',
			code: 'invite',
			bindToken: secondToken,
			provider: 'apple'
		})).rejects.toThrow('已绑定');
	});
});
