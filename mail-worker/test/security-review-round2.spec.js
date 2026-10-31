/**
 * 2026-10-26 second independent review probes.
 *
 * These tests deliberately consume the production HTTP entry points where
 * possible. Tests marked `it.fails` describe confirmed defects in the current
 * tree; they are expected to start passing once the defects are fixed.
 */
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import oauthService from '../src/service/oauth-service.js';
import loginService from '../src/service/login-service.js';
import userService from '../src/service/user-service.js';
import roleService from '../src/service/role-service.js';
import accountService from '../src/service/account-service.js';
import rbacGuard from '../src/service/rbac-guard-service.js';
import saltHashUtils from '../src/utils/crypto-utils.js';
import jwtUtils from '../src/utils/jwt-utils.js';
import { buildSignedObjectUrl } from '../src/utils/object-token.js';
import { ensureOtcTable, seedOtc, ensureBindClaimTable, clearBindClaim } from './helpers/one-time-credential.js';

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

const encoder = new TextEncoder();

function b64url(bytes) {
	let binary = '';
	for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function createSigningMaterial(kid = 'review-kid') {
	const pair = await crypto.subtle.generateKey(
		{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
		true,
		['sign', 'verify']
	);
	const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
	jwk.kid = kid;
	jwk.use = 'sig';
	return { pair, jwk };
}

async function signRs256(privateKey, header, payload) {
	const headerPart = b64url(encoder.encode(JSON.stringify(header)));
	const payloadPart = b64url(encoder.encode(JSON.stringify(payload)));
	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		privateKey,
		encoder.encode(`${headerPart}.${payloadPart}`)
	);
	return `${headerPart}.${payloadPart}.${b64url(signature)}`;
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

async function cleanupObjectRows() {
	await env.db.prepare('DELETE FROM attachments').run();
	await env.db.prepare('DELETE FROM oauth_one_time_credential').run();
	for (const key of [
		'auth-uid:2',
		'attachments/review-round2.txt',
		'setting:',
		'apple_jwks_v1'
	]) {
		await env.kv.delete(key);
	}
}

beforeAll(async () => {
	await env.db.prepare(CREATE_OAUTH).run();
	await env.db.prepare(CREATE_ATTACHMENTS).run();
	await ensureOtcTable(env.db);
	await ensureBindClaimTable(env.db);
});

afterAll(async () => {
	await cleanupObjectRows();
	await env.db.prepare('DELETE FROM oauth').run();
	await clearBindClaim(env.db);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('Apple id_token is verified on the real HTTP login route', () => {
	it('accepts a correctly signed id_token and returns only a bind proof for a new identity', async () => {
		const { pair, jwk } = await createSigningMaterial('review-kid');
		await env.kv.put('apple_jwks_v1', JSON.stringify({ keys: [jwk] }), { expirationTtl: 3600 });
		await env.kv.put('setting:', JSON.stringify({
			oauthLoginEnabled: 1,
			oauthProviders: {
				apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 }
			}
		}), { expirationTtl: 3600 });

		// The probe is about Apple verification and saveUser, not account lookup;
		// keep the test database free of an unrelated full user schema.
		vi.spyOn(userService, 'selectByEmail').mockResolvedValue(null);

		const token = await signRs256(
			pair.privateKey,
			{ alg: 'RS256', kid: 'review-kid' },
			{
				iss: 'https://appleid.apple.com',
				aud: 'test-client-id',
				sub: 'review-apple-user',
				exp: Math.floor(Date.now() / 1000) + 300,
				email: 'review-apple@example.com',
				email_verified: 'true'
			}
		);

		const response = await SELF.fetch('http://example.com/api/oauth/apple/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id_token: token })
		});
		const body = await response.json();
		expect(body.code, JSON.stringify(body)).toBe(200);
		expect(body.data.bindToken).toBeTruthy();
		expect(body.data.token).toBeFalsy();

		await env.db.prepare('DELETE FROM oauth WHERE oauth_user_id = ?').bind('apple:review-apple-user').run();
	});

	it('runs the real authorize -> form callback path, binds the Apple nonce and puts only a bind proof in the fragment', async () => {
		const { pair, jwk } = await createSigningMaterial('review-callback-kid');
		await env.kv.put('apple_jwks_v1', JSON.stringify({ keys: [jwk] }), { expirationTtl: 3600 });
		await env.kv.put('setting:', JSON.stringify({
			oauthLoginEnabled: 1,
			oauthProviders: {
				apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 }
			}
		}), { expirationTtl: 3600 });
		vi.spyOn(userService, 'selectByEmail').mockResolvedValue(null);

		const redirectUri = 'http://example.com/api/oauth/callback/apple';
		const authorize = await SELF.fetch(
			`http://example.com/api/oauth/authorize/apple?redirect_uri=${encodeURIComponent(redirectUri)}&state=review-client-state`
		);
		const authorizeBody = await authorize.json();
		expect(authorizeBody.code).toBe(200);
		const authorizeUrl = new URL(authorizeBody.data.url);
		const state = authorizeUrl.searchParams.get('state');
		const nonce = authorizeUrl.searchParams.get('nonce');
		expect(state).toBeTruthy();
		expect(nonce).toBeTruthy();

		const idToken = await signRs256(
			pair.privateKey,
			{ alg: 'RS256', kid: 'review-callback-kid' },
			{
				iss: 'https://appleid.apple.com',
				aud: 'test-client-id',
				sub: 'review-callback-user',
				exp: Math.floor(Date.now() / 1000) + 300,
				nonce,
				email: 'review-callback@example.com',
				email_verified: 'true'
			}
		);
		const tokenFetch = vi.fn(async (url) => {
			if (String(url) === 'https://appleid.apple.com/auth/token') {
				return new Response(JSON.stringify({ id_token: idToken }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			throw new Error(`Unexpected outbound fetch in review probe: ${url}`);
		});
		vi.stubGlobal('fetch', tokenFetch);

		const callback = await SELF.fetch(
			`http://example.com/api/oauth/callback/apple?code=review-code&state=${encodeURIComponent(state)}`,
			{ redirect: 'manual' }
		);
		expect(callback.status).toBe(302);
		const location = callback.headers.get('Location') || '';
		expect(location).toContain('oauth_bind=');
		expect(location).toContain('oauth_client_state=review-client-state');
		expect(location).not.toContain('oauth_code=');
		expect(location).not.toContain('token=');
		expect(location).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
		// The login UI can only complete binding if the redirect carries the
		// identity it must echo back and the client state it must match.
		const bindLocation = new URL(location, 'http://example.com');
		const bindFragment = new URLSearchParams(bindLocation.hash.slice(1));
		expect(bindFragment.get('oauth_bind')).toBeTruthy();
		expect(bindLocation.searchParams.get('oauth_user_id')).toBe('apple:review-callback-user');
		expect(bindLocation.searchParams.get('oauth_provider')).toBe('apple');
		expect(bindLocation.searchParams.get('oauth_client_state')).toBe('review-client-state');

		// The state was consumed before the exchange, so replaying it is rejected.
		const replay = await SELF.fetch(
			`http://example.com/api/oauth/callback/apple?code=review-code&state=${encodeURIComponent(state)}`,
			{ redirect: 'manual' }
		);
		expect((replay.headers.get('Location') || '')).toContain('oauth_state_invalid');

		await env.db.prepare('DELETE FROM oauth WHERE oauth_user_id = ?').bind('apple:review-callback-user').run();
	});

	it('rejects a callback whose Apple id_token nonce does not match the server nonce', async () => {
		const { pair, jwk } = await createSigningMaterial('review-nonce-kid');
		await env.kv.put('apple_jwks_v1', JSON.stringify({ keys: [jwk] }), { expirationTtl: 3600 });
		await env.kv.put('setting:', JSON.stringify({
			oauthLoginEnabled: 1,
			oauthProviders: {
				apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 }
			}
		}), { expirationTtl: 3600 });
		vi.spyOn(userService, 'selectByEmail').mockResolvedValue(null);

		const redirectUri = 'http://example.com/api/oauth/callback/apple';
		const authorize = await SELF.fetch(
			`http://example.com/api/oauth/authorize/apple?redirect_uri=${encodeURIComponent(redirectUri)}&state=review-nonce-client-state`
		);
		const authorizeBody = await authorize.json();
		const authorizeUrl = new URL(authorizeBody.data.url);
		const state = authorizeUrl.searchParams.get('state');

		const idToken = await signRs256(
			pair.privateKey,
			{ alg: 'RS256', kid: 'review-nonce-kid' },
			{
				iss: 'https://appleid.apple.com',
				aud: 'test-client-id',
				sub: 'review-nonce-user',
				exp: Math.floor(Date.now() / 1000) + 300,
				nonce: 'wrong-nonce',
				email: 'review-nonce@example.com',
				email_verified: 'true'
			}
		);
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id_token: idToken }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})));

		const callback = await SELF.fetch(
			`http://example.com/api/oauth/callback/apple?code=review-code&state=${encodeURIComponent(state)}`,
			{ redirect: 'manual' }
		);
		expect((callback.headers.get('Location') || '')).toContain('oauth_failed');
		const row = await env.db.prepare('SELECT oauth_user_id FROM oauth WHERE oauth_user_id = ?').bind('apple:review-nonce-user').first();
		expect(row).toBeFalsy();
	});

	it('rejects a forged signature before creating any OAuth identity', async () => {
		const { jwk } = await createSigningMaterial('review-kid');
		await env.kv.put('apple_jwks_v1', JSON.stringify({ keys: [jwk] }), { expirationTtl: 3600 });
		await env.kv.put('setting:', JSON.stringify({
			oauthLoginEnabled: 1,
			oauthProviders: {
				apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 }
			}
		}), { expirationTtl: 3600 });

		const other = await createSigningMaterial('review-kid');
		const forged = await signRs256(
			other.pair.privateKey,
			{ alg: 'RS256', kid: 'review-kid' },
			{
				iss: 'https://appleid.apple.com',
				aud: 'test-client-id',
				sub: 'forged-user',
				exp: Math.floor(Date.now() / 1000) + 300
			}
		);

		const response = await SELF.fetch('http://example.com/api/oauth/apple/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id_token: forged })
		});
		const body = await response.json();
		expect(body.code).not.toBe(200);
		expect(JSON.stringify(body)).not.toContain('bindToken');
		const row = await env.db.prepare('SELECT oauth_user_id FROM oauth WHERE oauth_user_id = ?').bind('apple:forged-user').first();
		expect(row).toBeFalsy();
	});
});

describe('OAuth bind result shape at the production login service boundary', () => {
	it('returns the mailbox token at the top level when loginService returns its real object shape', async () => {
		await env.db.prepare('DELETE FROM oauth').run();
		await env.db.prepare('INSERT INTO oauth (oauth_user_id, username, name, user_id) VALUES (?, ?, ?, ?)')
			.bind('apple:review-bind-shape', 'review-bind-shape', 'Review Bind Shape', 0).run();
		const proof = 'review-bind-proof';
		await seedOtc(env.db, {
			purpose: 'oauth_bind',
			token: proof,
			provider: 'apple',
			oauthUserId: 'apple:review-bind-shape',
			payload: {
				oauthUserId: 'apple:review-bind-shape',
				provider: 'apple',
				createdAt: Date.now()
			},
			ttlSeconds: 600
		});

		await env.kv.put('setting:', JSON.stringify({
			oauthLoginEnabled: 1,
			oauthProviders: {
				apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 }
			}
		}), { expirationTtl: 3600 });
		vi.spyOn(loginService, 'validateRegistration').mockResolvedValue({});
		vi.spyOn(loginService, 'register').mockResolvedValue({ userId: 2, reservedRegKey: false });
		vi.spyOn(loginService, 'login').mockResolvedValue({
			token: 'real-shaped-mailbox-jwt',
			email: 'review-bind@example.com',
			userId: 2
		});
		vi.spyOn(userService, 'selectByIdIncludeDel').mockResolvedValue(null);
		vi.spyOn(userService, 'selectByEmail').mockResolvedValue({ userId: 2, email: 'review-bind@example.com' });

		const result = await oauthService.bindUser(
			{ env, req: { url: 'https://mail.example.com/api/oauth/bindUser', header: () => null } },
			{
				email: 'review-bind@example.com',
				oauthUserId: 'apple:review-bind-shape',
				code: 'invite',
				bindToken: proof,
				provider: 'apple'
			}
		);
		expect(result.token).toBe('real-shaped-mailbox-jwt');
	});
});

describe('Role assignment boundary on privileged creation paths', () => {
	it('user/add refuses a role above the caller (moderator -> master escalation)', async () => {
		const guard = vi.spyOn(rbacGuard, 'assertCanAssignRole');
		// Deny, as the real guard does for a non-owner caller.
		guard.mockRejectedValue(new Error('仅站长本人可分配站长角色'));
		vi.spyOn(roleService, 'selectById').mockResolvedValue({ roleId: 6, roleCode: 'master', key: 'master' });
		vi.spyOn(accountService, 'selectByEmailIncludeDel').mockResolvedValue(null);
		vi.spyOn(accountService, 'selectByNameIncludeDel').mockResolvedValue(null);
		vi.spyOn(saltHashUtils, 'hashPassword').mockResolvedValue({ salt: 'salt', hash: 'hash' });
		const insert = vi.spyOn(userService, 'insert').mockResolvedValue(99);
		vi.spyOn(userService, 'updateUserInfo').mockResolvedValue();
		vi.spyOn(accountService, 'insert').mockResolvedValue({ accountId: 1, email: 'puppet@example.com' });

		const c = { env: { domain: ['example.com'], admin: 'admin@example.com' } };
		await expect(
			userService.add(c, { email: 'puppet@example.com', type: 6, password: 'secret1' }, 5)
		).rejects.toThrow('仅站长本人可分配站长角色');

		// The role check must run before any account row is created.
		expect(guard).toHaveBeenCalledWith(c, 5, 6);
		expect(insert).not.toHaveBeenCalled();
	});

	it('user/add still creates accounts when the caller may assign the role', async () => {
		const guard = vi.spyOn(rbacGuard, 'assertCanAssignRole').mockResolvedValue({ userId: 1 });
		vi.spyOn(roleService, 'selectById').mockResolvedValue({ roleId: 2, roleCode: 'normal', key: 'normal' });
		vi.spyOn(accountService, 'selectByEmailIncludeDel').mockResolvedValue(null);
		vi.spyOn(accountService, 'selectByNameIncludeDel').mockResolvedValue(null);
		vi.spyOn(saltHashUtils, 'hashPassword').mockResolvedValue({ salt: 'salt', hash: 'hash' });
		const insert = vi.spyOn(userService, 'insert').mockResolvedValue(99);
		vi.spyOn(userService, 'updateUserInfo').mockResolvedValue();
		vi.spyOn(accountService, 'insert').mockResolvedValue({ accountId: 1, email: 'member@example.com' });

		const c = { env: { domain: ['example.com'], admin: 'admin@example.com' } };
		await userService.add(c, { email: 'member@example.com', type: 2, password: 'secret1' }, 1);

		expect(guard).toHaveBeenCalledWith(c, 1, 2);
		expect(insert).toHaveBeenCalledWith(c, expect.objectContaining({ type: 2 }));
	});
});

describe('Signed object URL as consumed by the browser', () => {
	it('serves the same capability on the root attachment route', async () => {
		await env.db.prepare('DELETE FROM attachments').run();
		await env.db.prepare('INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(2, 10, 20, 'attachments/review-round2.txt', 'review-round2.txt', 17, 0).run();
		await env.kv.put('attachments/review-round2.txt', 'round-two-secret', {
			metadata: { contentType: 'text/plain' }
		});
		const signed = await buildSignedObjectUrl({ env }, 'attachments/review-round2.txt', { userId: 2, ttlSeconds: 60 });
		const rootSigned = signed.replace(/^\/oss\/attachments\//, '/attachments/');
		const response = await SELF.fetch(`http://example.com${rootSigned}`);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('round-two-secret');
	});

	it('returns a signed URL that the browser can fetch without manually inserting /api', async () => {
		await env.db.prepare('DELETE FROM attachments').run();
		await env.db.prepare('INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(2, 10, 20, 'attachments/review-round2.txt', 'review-round2.txt', 17, 0).run();
		await env.kv.put('attachments/review-round2.txt', 'round-two-secret', {
			metadata: { contentType: 'text/plain' }
		});
		const token = await seedAuth(2, 'review2@example.com', 'review-session-2');
		const response = await SELF.fetch('http://example.com/api/oss-url/batch', {
			method: 'POST',
			headers: { Authorization: token, 'Content-Type': 'application/json' },
			body: JSON.stringify({ keys: ['attachments/review-round2.txt'] })
		});
		const body = await response.json();
		const url = body.data.urls['attachments/review-round2.txt'];
		expect(url).toBeTruthy();
		// This is exactly how mail-vue and the Telegram share page consume the
		// returned URL: as an origin-relative <img src>/<a href>, without /api.
		const browserResponse = await SELF.fetch(`http://example.com${url}`);
		expect(await browserResponse.text()).toBe('round-two-secret');
	});
});

describe('Exception sanitization at the public OAuth entry point', () => {
	it('returns a generic 500 body for a malformed JSON request', async () => {
		const response = await SELF.fetch('http://example.com/api/oauth/github/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{'
		});
		const body = await response.json();
		expect(body.code).toBe(500);
		expect(body.message).toBe('Internal Server Error');
		expect(JSON.stringify(body)).not.toMatch(/SyntaxError|at JSON\.parse|\/D:/);
	});
});

describe('Capacity unit semantics', () => {
	it('shows SQLite length() counts characters while the byte quota boundary counts bytes', async () => {
		const row = await env.db.prepare("SELECT length('中') AS sql_length").first();
		expect(row.sql_length).toBe(1);
		expect(new Blob(['中']).size).toBe(3);
	});
});
