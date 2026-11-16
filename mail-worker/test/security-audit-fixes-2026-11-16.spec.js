import { env, SELF, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { dbInit } from '../src/init/init.js';
import cryptoUtils from '../src/utils/crypto-utils.js';
import JwtUtils from '../src/utils/jwt-utils.js';
import loginService from '../src/service/login-service.js';
import userService from '../src/service/user-service.js';
import accountService from '../src/service/account-service.js';
import oauthAppService from '../src/service/oauth-app-service.js';
import oauthProviderService from '../src/service/oauth-provider-service.js';
import oneTimeCredential, { OTC_PURPOSE } from '../src/utils/one-time-credential.js';

const UID_USER = 987101;
const UID_ADMIN = 987102;
const EMAIL_USER = 'audit20261116-user@example.com';
const EMAIL_DEL = 'audit20261116-del@example.com';
const PASSWORD = 'AuditPassword#2026!';

// Minimal valid 1x1 transparent PNG
const TINY_PNG = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
	0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
	0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
	0x42, 0x60, 0x82
]);

async function cleanDbAndKv() {
	for (const table of ['user', 'account', 'email', 'attachments', 'role']) {
		await env.db.prepare(`DELETE FROM ${table} WHERE user_id >= 987100`).run().catch(() => {});
	}
	await env.db.prepare('DELETE FROM role WHERE role_id = 987101').run().catch(() => {});
	await env.db.prepare('DELETE FROM user WHERE email IN (?, ?)').bind(EMAIL_USER, EMAIL_DEL).run().catch(() => {});
	await env.db.prepare("DELETE FROM oauth_app WHERE name LIKE 'Audit20261116%'").run().catch(() => {});
	await env.db.prepare('DELETE FROM oauth_one_time_credential').run().catch(() => {});
	let cursor;
	do {
		const page = await env.kv.list({ ...(cursor ? { cursor } : {}) });
		for (const key of page.keys) await env.kv.delete(key.name);
		cursor = page.list_complete ? null : page.cursor;
	} while (cursor);
}

beforeAll(async () => {
	const initCtx = {
		env: {
			...env,
			admin: 'audit-init-admin@example.com',
			admin_initial_password: 'TestOnlyInitPass#2026',
			PBKDF2_WRITER_ITERATIONS: '1000',
			ENVIRONMENT: 'test'
		},
		set: () => {}
	};
	const steps = [
		'intDB', 'v3_18DB', 'v1_1DB', 'v1_2DB', 'v1_3DB', 'v1_3_1DB', 'v1_4DB',
		'v1_5DB', 'v1_6DB', 'v1_7DB', 'v2DB', 'v2_3DB', 'v2_4DB', 'v2_5DB', 'v2_6DB',
		'v2_7DB', 'v2_8DB', 'v2_9DB', 'v3_0DB', 'v3_1DB', 'v3_2DB', 'v3_3DB', 'v3_4DB',
		'v3_5DB', 'v3_6DB', 'v3_7DB', 'v3_8DB', 'v3_9DB', 'v3_10DB', 'v3_11DB', 'v3_12DB',
		'v3_13DB', 'v3_14DB', 'v3_15DB', 'v3_16DB', 'v3_17DB', 'v3_19DB', 'v3_20DB',
		'v3_21DB', 'v3_22DB', 'v3_23DB', 'v3_24DB', 'v3_25DB'
	];
	for (const step of steps) {
		await dbInit[step](initCtx);
	}
	await env.db.prepare("DELETE FROM user WHERE email = 'audit-init-admin@example.com'").run().catch(() => {});
});

beforeEach(async () => {
	fetchMock.activate();
	fetchMock.disableNetConnect();
	await cleanDbAndKv();
	await env.kv.put('setting:', JSON.stringify({
		allMailMode: 0,
		defaultStorageQuotaMb: 500,
		userByoStorage: 1
	}));
});

afterEach(async () => {
	vi.restoreAllMocks();
	try {
		await cleanDbAndKv();
	} finally {
		fetchMock.deactivate();
	}
});

describe('Security audit hardening regressions (2026-11-16)', () => {
	it('passes c.env to PBKDF2 timing equalization for unknown and deleted accounts', async () => {
		const creds = await cryptoUtils.hashPassword(PASSWORD, { PBKDF2_WRITER_ITERATIONS: '100000' });
		await env.db.prepare(
			'INSERT INTO user (user_id, email, password, salt, status, is_del, type) VALUES (?, ?, ?, ?, 0, 1, 1)'
		).bind(UID_ADMIN, EMAIL_DEL, creds.hash, creds.salt).run();

		const spy = vi.spyOn(cryptoUtils, 'genHashPassword');
		const testEnv = { ...env, PBKDF2_WRITER_ITERATIONS: '100000', ENVIRONMENT: 'test' };
		const ctx = {
			env: testEnv,
			req: { header: () => '' },
			get: () => null
		};

		await expect(loginService.login(ctx, { email: 'missing-audit@example.com', password: 'WrongPassword1!' }))
			.rejects.toThrow();
		expect(spy).toHaveBeenCalledWith('WrongPassword1!', 'epomail-timing-equalization-salt', testEnv);

		spy.mockClear();
		await expect(loginService.login(ctx, { email: EMAIL_DEL, password: 'WrongPassword1!' }))
			.rejects.toThrow();
		expect(spy).toHaveBeenCalledWith('WrongPassword1!', 'epomail-timing-equalization-salt', testEnv);
	});

	it('uploadImage enforces checkQuotaAvailable instead of ignoring denied quota', async () => {
		const creds = await cryptoUtils.hashPassword(PASSWORD, { PBKDF2_WRITER_ITERATIONS: '1000' });
		await env.db.prepare(`
			INSERT INTO role (role_id, name, key, description, is_default, send_type, account_count, storage_quota_mb, role_code)
			VALUES (987101, 'TightQuota', 'tight_quota', 'tight', 0, 'ban', 1, 1, 'user_base')
		`).run();
		await env.db.prepare(
			'INSERT INTO user (user_id, email, password, salt, status, is_del, type, storage_quota_mb) VALUES (?, ?, ?, ?, 0, 0, 987101, 1)'
		).bind(UID_USER, EMAIL_USER, creds.hash, creds.salt).run();
		// Fill 1 MiB quota with an attachment row
		await env.db.prepare(`
			INSERT INTO attachments (user_id, email_id, account_id, key, size, status, type)
			VALUES (?, 1, 1, 'att/test-full', ?, '0', 0)
		`).bind(UID_USER, 1024 * 1024).run();

		const blob = new Blob([TINY_PNG], { type: 'image/png' });
		const formData = new FormData();
		formData.append('file', blob, 'avatar.png');
		const ctx = {
			env,
			req: { formData: async () => formData }
		};

		await expect(userService.uploadImage(ctx, UID_USER)).rejects.toMatchObject({
			code: 413,
			errorCode: 'storage_quota_exceeded'
		});
		const kvList = await env.kv.list({ prefix: `static/avatar/${UID_USER}/` });
		expect(kvList.keys).toHaveLength(0);
	});

	it('PKCE /oauth/token signs id_token with app decrypted secret, ignoring unverified body.client_secret and failing closed when ciphertext cannot decrypt', async () => {
		const creds = await cryptoUtils.hashPassword(PASSWORD, { PBKDF2_WRITER_ITERATIONS: '1000' });
		await env.db.prepare(`
			INSERT INTO user (user_id, email, password, salt, status, is_del, type, auth_version)
			VALUES (?, ?, ?, ?, 0, 0, 1, 1)
		`).bind(UID_USER, EMAIL_USER, creds.hash, creds.salt).run();

		const oauthEnv = {
			...env,
			oauth_client_enc_key: 'audit-oauth-enc-key-32bytes-!!',
			jwt_secret: 'audit-jwt-secret-32bytes-long!!'
		};
		const appCtx = { env: oauthEnv };
		const created = await oauthAppService.add(appCtx, {
			name: 'Audit20261116 PKCE App',
			homepageUrl: 'https://rp.example.com',
			redirectUris: ['https://rp.example.com/callback'],
			scopes: 'openid profile email'
		});

		const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
		const challengeBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
		let bin = '';
		for (const b of new Uint8Array(challengeBuf)) bin += String.fromCharCode(b);
		const challenge = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

		const authCode = await oneTimeCredential.issue({ env: oauthEnv }, {
			purpose: OTC_PURPOSE.AUTHORIZATION_CODE,
			ttlSeconds: 300,
			payload: {
				clientId: created.clientId,
				userId: UID_USER,
				authVersion: 1,
				redirectUri: 'https://rp.example.com/callback',
				scopes: 'openid email',
				codeChallenge: challenge,
				codeChallengeMethod: 'S256',
				authTime: Math.floor(Date.now() / 1000)
			}
		});

		// Attack: submit a forged client_secret alongside valid PKCE verifier
		const tokenResp = await oauthProviderService.token({
			env: oauthEnv,
			req: { url: 'https://mail.example.com/api/oauth/token' }
		}, {
			grant_type: 'authorization_code',
			code: authCode,
			redirect_uri: 'https://rp.example.com/callback',
			code_verifier: verifier,
			client_secret: 'attacker-forged-secret'
		});

		const verifiedWithRealSecret = await JwtUtils.verifyToken(
			{ env: { jwt_secret: created.clientSecretPlain } },
			tokenResp.id_token
		);
		expect(verifiedWithRealSecret?.sub).toBe(String(UID_USER));

		const verifiedWithAttackerSecret = await JwtUtils.verifyToken(
			{ env: { jwt_secret: 'attacker-forged-secret' } },
			tokenResp.id_token
		);
		expect(verifiedWithAttackerSecret).toBeNull();

		// Fail closed if decryption key is unavailable rather than signing with v1:... ciphertext
		const code2 = await oneTimeCredential.issue({ env }, {
			purpose: OTC_PURPOSE.AUTHORIZATION_CODE,
			ttlSeconds: 300,
			payload: {
				clientId: created.clientId,
				userId: UID_USER,
				authVersion: 1,
				redirectUri: 'https://rp.example.com/callback',
				scopes: 'openid email',
				codeChallenge: challenge,
				codeChallengeMethod: 'S256'
			}
		});
		const envNoKey = { ...env, jwt_secret: 'audit-jwt-secret-32bytes-long!!' };
		delete envNoKey.oauth_client_enc_key;
		await expect(oauthProviderService.token({
			env: envNoKey,
			req: { url: 'https://mail.example.com/api/oauth/token' }
		}, {
			grant_type: 'authorization_code',
			code: code2,
			redirect_uri: 'https://rp.example.com/callback',
			code_verifier: verifier
		})).rejects.toMatchObject({ errorCode: 'oauth_client_enc_key_missing' });
	});

	it('accountService guards against nonexistent accountId without crashing 500', async () => {
		const creds = await cryptoUtils.hashPassword(PASSWORD, { PBKDF2_WRITER_ITERATIONS: '1000' });
		await env.db.prepare(
			'INSERT INTO user (user_id, email, password, salt, status, is_del, type) VALUES (?, ?, ?, ?, 0, 0, 1)'
		).bind(UID_USER, EMAIL_USER, creds.hash, creds.salt).run();

		await expect(accountService.delete({ env }, { accountId: 99999999 }, UID_USER)).rejects.toMatchObject({ code: 404 });
		await expect(accountService.setName({ env }, { accountId: 99999999, name: 'x' }, UID_USER)).rejects.toMatchObject({ code: 404 });
		await expect(accountService.setAllReceive({ env }, { accountId: 99999999 }, UID_USER)).rejects.toMatchObject({ code: 404 });
		await expect(accountService.setAsTop({ env }, { accountId: 99999999 }, UID_USER)).rejects.toMatchObject({ code: 404 });
	});

	it('rejects scalar/array/malformed JSON bodies across protected endpoints with 400 INVALID_JSON instead of 500', async () => {
		const creds = await cryptoUtils.hashPassword(PASSWORD, { PBKDF2_WRITER_ITERATIONS: '1000' });
		await env.db.prepare(
			'INSERT INTO user (user_id, email, password, salt, status, is_del, type, auth_version) VALUES (?, ?, ?, ?, 0, 0, 1, 1)'
		).bind(UID_USER, EMAIL_USER, creds.hash, creds.salt).run();
		const token = 'audit-json-session-token';
		const jwt = await JwtUtils.generateToken({ env }, { userId: UID_USER, token, authVersion: 1 });
		await env.kv.put(`auth-uid:${UID_USER}`, JSON.stringify({
			tokens: [token],
			user: { userId: UID_USER, email: EMAIL_USER, isDel: 0, status: 0, type: 1 },
			refreshTime: new Date().toISOString()
		}));

		const checks = [
			['POST', '/star/add'],
			['POST', '/account/add'],
			['PUT', '/email/read'],
			['PUT', '/my/resetPassword']
		];

		for (const [method, path] of checks) {
			for (const payload of ['null', '[]', '{"bad":']) {
				const res = await SELF.fetch(`https://example.com/api${path}`, {
					method,
					headers: { 'content-type': 'application/json', Authorization: jwt },
					body: payload
				});
				expect(res.status, `${method} ${path} with ${payload}`).toBe(400);
				const data = await res.json();
				expect(data.errorCode).toBe('INVALID_JSON');
			}
		}
	});
});
