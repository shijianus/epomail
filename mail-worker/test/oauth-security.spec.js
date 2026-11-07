import { env } from 'cloudflare:test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import oauthService from '../src/service/oauth-service.js';
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
		}
	};
}

function base64url(bytes) {
	let binary = '';
	for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
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

async function signRs256(privateKey, payload) {
	const headerPart = base64url(encoder.encode(JSON.stringify({ alg: 'RS256', kid: 'apple-test-kid' })));
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

describe('OAuth authorization state', () => {
	let c;
	let flowId;

	beforeEach(() => {
		flowId = '';
		c = {
			env: { kv: createMockKv(), jwt_secret: 'oauth-unit-test-secret' },
			req: {
				url: 'https://mail.example.com/api/oauth/authorize/apple',
				header: name => name.toLowerCase() === 'cookie' && flowId ? `epo_oauth_flow=${flowId}` : null
			}
		};
		vi.spyOn(settingService, 'query').mockResolvedValue({
			oauthProviders: { apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 } }
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('issues and consumes server-generated state bound to provider, redirect and nonce', async () => {
		const authorizeUrl = new URL(await oauthService.getAuthorizeUrl(
			c,
			'apple',
			'https://mail.example.com/api/oauth/callback/apple',
			'client-state-123'
		));
		const state = authorizeUrl.searchParams.get('state');
		flowId = state;
		const nonce = authorizeUrl.searchParams.get('nonce');
		expect(state).toBeTruthy();
		expect(state).not.toBe('client-state-123');
		expect(nonce).toBeTruthy();

		await expect(oauthService.consumeState(c, 'google', state)).rejects.toThrow('state');
		const row = await oauthService.consumeState(c, 'apple', state);
		expect(row.redirectUri).toBe('https://mail.example.com/api/oauth/callback/apple');
		expect(row.nonce).toBe(nonce);
		expect(row.clientState).toBe('client-state-123');
		await expect(oauthService.consumeState(c, 'apple', state)).rejects.toThrow('state');
	});

	it('rejects an unregistered redirect URI', async () => {
		await expect(oauthService.getAuthorizeUrl(c, 'apple', 'https://attacker.example/callback'))
			.rejects.toThrow('redirect_uri');
	});
});

describe('Apple signed identity samples with local JWKS', () => {
	let c;
	let pair;

	beforeEach(async () => {
		const kv = createMockKv();
		c = { env: { kv } };
		const material = await createSigningMaterial();
		pair = material.pair;
		await kv.put('apple_jwks_v1', JSON.stringify({ keys: [material.jwk] }));
	});

	it('accepts a valid token and rejects nonce mismatch', async () => {
		const valid = await signRs256(pair.privateKey, applePayload());
		const payload = await verifyAppleIdToken(c, valid, 'test-client-id', { nonce: 'test-nonce' });
		expect(payload.sub).toBe('apple-user-1');
		await expect(verifyAppleIdToken(c, valid, 'test-client-id', { nonce: 'other-nonce' })).rejects.toThrow('nonce');
	});
});

describe('OAuth bind proof session binding', () => {
	let c;

	beforeAll(async () => {
		await env.db.prepare(`CREATE TABLE IF NOT EXISTS oauth (
			oauth_id INTEGER PRIMARY KEY AUTOINCREMENT, oauth_user_id TEXT, username TEXT, name TEXT,
			avatar TEXT, active INTEGER, trust_level INTEGER, silenced INTEGER,
			create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, user_id INTEGER DEFAULT 0 NOT NULL
		)`).run();
	});

	beforeEach(async () => {
		await env.db.prepare('DELETE FROM oauth').run();
		await env.db.prepare("INSERT INTO oauth (oauth_user_id, username, user_id) VALUES ('apple:bind-user', 'bind-user', 0)").run();
		c = {
			env: { kv: createMockKv(), db: env.db, jwt_secret: 'oauth-unit-test-secret', domain: ['example.com'] },
			req: {
				url: 'https://mail.example.com/api/oauth/bindUser',
				header: name => name.toLowerCase() === 'cookie' ? 'epo_oauth_flow=flow-a' : null
			}
		};
		vi.spyOn(loginService, 'register').mockResolvedValue();
		vi.spyOn(loginService, 'login').mockResolvedValue('synthetic-bound-session');
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

	it('rejects redemption from another browser flow without consuming the proof', async () => {
		await c.env.kv.put('oauth_bind:proof', JSON.stringify({
			oauthUserId: 'apple:bind-user', provider: 'apple', flowId: 'flow-b', createdAt: Date.now()
		}));
		await expect(oauthService.bindUser(c, {
			email: 'bound@example.com', oauthUserId: 'apple:bind-user', provider: 'apple', bindToken: 'proof'
		})).rejects.toThrow('flow');
		expect(await c.env.kv.get('oauth_bind:proof')).not.toBeNull();
	});

	it('allows the initiating flow once and rejects replay', async () => {
		await c.env.kv.put('oauth_bind:proof', JSON.stringify({
			oauthUserId: 'apple:bind-user', provider: 'apple', flowId: 'flow-a', createdAt: Date.now()
		}));
		const params = { email: 'bound@example.com', oauthUserId: 'apple:bind-user', provider: 'apple', bindToken: 'proof' };
		const result = await oauthService.bindUser(c, params);
		expect(result.token).toBe('synthetic-bound-session');
		await expect(oauthService.bindUser(c, params)).rejects.toThrow('bind proof');
	});
});
