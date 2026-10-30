import { env, SELF } from 'cloudflare:test';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dbInit } from '../src/init/init.js';
import oauthService from '../src/service/oauth-service.js';
import settingService from '../src/service/setting-service.js';
import cryptoUtils from '../src/utils/crypto-utils.js';
import jwtUtils from '../src/utils/jwt-utils.js';
import oneTimeCredential, { OTC_PURPOSE } from '../src/utils/one-time-credential.js';

vi.setConfig({ testTimeout: 60000 });

const BASE = 'http://example.com';

async function sha256Base64Url(value) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	const bytes = new Uint8Array(digest);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function seedAuthenticatedUser(email, passwordPlain) {
	const { hash, salt } = await cryptoUtils.hashPassword(passwordPlain);
	const role = await env.db.prepare(`SELECT role_id FROM role WHERE role_code = 'user_base' LIMIT 1`).first();
	const roleId = role?.role_id || 1;
	const inserted = await env.db.prepare(`
		INSERT INTO user (email, password, salt, type, status, is_del)
		VALUES (?, ?, ?, ?, 0, 0)
	`).bind(email, hash, salt, roleId).run();
	const userId = Number(inserted?.meta?.last_row_id);
	await env.db.prepare(`
		INSERT INTO account (email, name, status, user_id, is_del)
		VALUES (?, ?, 0, ?, 0)
	`).bind(email, email.split('@')[0], userId).run();

	const sessionToken = `sess-${crypto.randomUUID()}`;
	const jwt = await jwtUtils.generateToken({ env }, { userId, token: sessionToken }, 3600);
	await env.kv.put(`auth-uid:${userId}`, JSON.stringify({
		user: { userId, email, type: roleId, status: 0, isDel: 0 },
		tokens: [sessionToken],
		refreshTime: new Date().toISOString()
	}), { expirationTtl: 3600 });
	return { userId, jwt, sessionToken };
}

async function putSettings(overrides = {}) {
	await env.kv.put('setting:', JSON.stringify({
		register: 0,
		regKey: 1,
		registerVerify: 1,
		minEmailPrefix: 1,
		emailPrefixFilter: '',
		oauthLoginEnabled: 1,
		oauthProviders: {
			github: { clientId: 'gh-client-id', clientSecret: 'gh-client-secret', enabled: 1 },
			google: { clientId: 'gg-client-id', clientSecret: 'gg-client-secret', enabled: 1 }
		},
		...overrides
	}), { expirationTtl: 3600 });
}

describe('Module A: OAuth switch enforcement, stale state/token revocation, PKCE S256, and fail-closed config', () => {
	beforeAll(async () => {
		const initRes = await dbInit.init({
			env: { ...env, admin_initial_password: 'TestInitOwner#2026!Safe' },
			req: {
				method: 'POST',
				header: (name) => (name === 'X-Init-Secret' ? env.jwt_secret : ''),
				param: () => undefined,
				json: async () => ({})
			},
			get: () => undefined,
			set: () => {},
			text: (body, status = 200) => new Response(body, { status })
		});
		expect(initRes.status).toBe(200);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	afterAll(async () => {
		await env.db.prepare(`DELETE FROM oauth`).run().catch(() => {});
		await env.db.prepare(`DELETE FROM oauth_one_time_credential`).run().catch(() => {});
		await env.db.prepare(`DELETE FROM oauth_bind_claim`).run().catch(() => {});
		await env.db.prepare(`DELETE FROM user WHERE email LIKE 'oauth-conv-%'`).run().catch(() => {});
		await env.db.prepare(`DELETE FROM account WHERE email LIKE 'oauth-conv-%'`).run().catch(() => {});
		await env.kv.delete('setting:');
	});

	it('enforces global oauthLoginEnabled=0 and per-provider enabled=0 across authorize, direct login, stale state callback, exchange, bindUser, and signed-in bind flows', async () => {
		// 1. Issue valid state, login exchange code, unbound bind proof, and signed-in bind claim while enabled
		await putSettings();

		const authRes = await SELF.fetch(`${BASE}/api/oauth/authorize/github?state=browser-csrf-1`);
		const authJson = await authRes.json();
		expect(authJson.code).toBe(200);
		const preIssuedState = new URL(authJson.data.url).searchParams.get('state');
		expect(preIssuedState).toBeTruthy();

		const preIssuedLoginCode = await oauthService.createLoginExchangeCode({ env }, {
			token: 'pre-issued-jwt',
			userInfo: { oauthUserId: 'github:stale-1' },
			provider: 'github'
		});
		await env.db.prepare(`INSERT INTO oauth (oauth_user_id, username, name, user_id) VALUES ('github:stale-bind', 'stale', 'Stale', 0)`).run();
		const preIssuedBindToken = await oauthService.createBindProof({ env }, {
			oauthUserId: 'github:stale-bind',
			provider: 'github'
		});

		const { userId, jwt } = await seedAuthenticatedUser('oauth-conv-owner@example.com', 'OwnerPass#2026!');
		const reauthRes = await SELF.fetch(`${BASE}/api/my/oauthIdentities/reauth`, {
			method: 'POST',
			headers: { Authorization: jwt, 'Content-Type': 'application/json' },
			body: JSON.stringify({ password: 'OwnerPass#2026!' })
		});
		const stepUpToken = (await reauthRes.json()).data.stepUpToken;
		const startBindRes = await SELF.fetch(`${BASE}/api/my/oauthIdentities/bind/start`, {
			method: 'POST',
			headers: { Authorization: jwt, 'Content-Type': 'application/json' },
			body: JSON.stringify({ provider: 'github', stepUpToken })
		});
		const bindStartBody = await startBindRes.json();
		expect(bindStartBody.code).toBe(200);
		const bindState = new URL(bindStartBody.data.url).searchParams.get('state');

		// Mint a BIND_LINK claim while still enabled, then test redeeming it after disable
		const fetchSpy = vi.fn(async (input) => {
			const url = typeof input === 'string' ? input : input.url;
			if (url.includes('github.com/login/oauth/access_token')) {
				return new Response(JSON.stringify({ access_token: 'gho_bind_token' }), { status: 200 });
			}
			if (url === 'https://api.github.com/user') {
				return new Response(JSON.stringify({ id: 99101, login: 'octo-bind', name: 'Octo Bind' }), { status: 200 });
			}
			if (url === 'https://api.github.com/user/emails') {
				return new Response(JSON.stringify([]), { status: 200 });
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal('fetch', fetchSpy);

		const bindCb = await SELF.fetch(
			`${BASE}/api/oauth/callback/github?code=gh-code-1&state=${encodeURIComponent(bindState)}`,
			{ redirect: 'manual' }
		);
		const bindLoc = bindCb.headers.get('Location') || '';
		const preIssuedClaimToken = decodeURIComponent((/#oauth_link=([^&]+)/.exec(bindLoc) || [])[1] || '');
		expect(preIssuedClaimToken).toBeTruthy();
		fetchSpy.mockClear();

		// 2. Disable ONLY github while global oauthLoginEnabled stays 1
		await putSettings({
			oauthLoginEnabled: 1,
			oauthProviders: {
				github: { clientId: 'gh-client-id', clientSecret: 'gh-client-secret', enabled: 0 },
				google: { clientId: 'gg-client-id', clientSecret: 'gg-client-secret', enabled: 1 }
			}
		});

		const pubProviders = await (await SELF.fetch(`${BASE}/api/oauth/providers`)).json();
		expect(pubProviders.data.map(p => p.key)).toEqual(['google']);

		const disabledAuth = await (await SELF.fetch(`${BASE}/api/oauth/authorize/github?state=s2`)).json();
		expect(disabledAuth.code).toBe(403);

		const directLogin = await (await SELF.fetch(`${BASE}/api/oauth/github/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: 'stolen-code', state: 'any-state' })
		})).json();
		expect(directLogin.code).toBe(403);

		// Stale pre-issued state on callback MUST burn the state AND block without calling upstream GitHub
		const staleCb = await SELF.fetch(
			`${BASE}/api/oauth/callback/github?code=gh-code-stale&state=${encodeURIComponent(preIssuedState)}`,
			{ redirect: 'manual' }
		);
		expect(staleCb.status).toBe(302);
		expect(staleCb.headers.get('Location') || '').toContain('error=oauth_disabled');
		expect(fetchSpy).not.toHaveBeenCalled();

		// Re-enabling GitHub later CANNOT resurrect the burned state
		await putSettings();
		const replayStaleCb = await SELF.fetch(
			`${BASE}/api/oauth/callback/github?code=gh-code-stale&state=${encodeURIComponent(preIssuedState)}`,
			{ redirect: 'manual' }
		);
		expect(replayStaleCb.headers.get('Location') || '').toContain('error=oauth_state_invalid');

		// 3. Disable global oauthLoginEnabled = 0: blocks Google, exchange code, bindUser, linuxDo, and bind/complete
		await putSettings({ oauthLoginEnabled: 0 });

		expect((await (await SELF.fetch(`${BASE}/api/oauth/providers`)).json()).data).toEqual([]);
		expect((await (await SELF.fetch(`${BASE}/api/oauth/authorize/google?state=s3`)).json()).code).toBe(403);
		expect((await (await SELF.fetch(`${BASE}/api/oauth/linuxDo/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: 'ld-code', state: 'ld-state' })
		})).json()).code).toBe(403);

		const blockedExchange = await (await SELF.fetch(`${BASE}/api/oauth/exchange`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: preIssuedLoginCode })
		})).json();
		expect(blockedExchange.code).toBe(403);

		const blockedBindUser = await (await SELF.fetch(`${BASE}/api/oauth/bindUser`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: 'oauth-conv-new@example.com',
				oauthUserId: 'github:stale-bind',
				bindToken: preIssuedBindToken,
				provider: 'github'
			})
		})).json();
		expect(blockedBindUser.code).toBe(403);

		const blockedCompleteBind = await (await SELF.fetch(`${BASE}/api/my/oauthIdentities/bind/complete`, {
			method: 'POST',
			headers: { Authorization: jwt, 'Content-Type': 'application/json' },
			body: JSON.stringify({ token: preIssuedClaimToken })
		})).json();
		expect(blockedCompleteBind.code).toBe(403);

		await env.kv.delete(`auth-uid:${userId}`);
	});

	it('blocks direct POST /api/oauth/:provider/login code submission without a valid server-issued state', async () => {
		await putSettings();
		const noState = await (await SELF.fetch(`${BASE}/api/oauth/github/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: 'forged-code' })
		})).json();
		expect(noState.code).toBe(400);
		expect(noState.errorCode).toBe('oauth_state_required');
	});

	it('generates S256 PKCE code_challenge on authorize and sends matching code_verifier on callback token exchange', async () => {
		await putSettings();

		const authRes = await SELF.fetch(`${BASE}/api/oauth/authorize/google?state=pkce-client-state`);
		const authJson = await authRes.json();
		expect(authJson.code).toBe(200);

		const authUrl = new URL(authJson.data.url);
		const state = authUrl.searchParams.get('state');
		const challenge = authUrl.searchParams.get('code_challenge');
		const method = authUrl.searchParams.get('code_challenge_method');
		expect(challenge).toBeTruthy();
		expect(method).toBe('S256');

		let capturedVerifier = '';
		vi.stubGlobal('fetch', vi.fn(async (input, init) => {
			const url = typeof input === 'string' ? input : input.url;
			if (url === 'https://oauth2.googleapis.com/token') {
				const form = new URLSearchParams(String(init?.body || ''));
				capturedVerifier = form.get('code_verifier') || '';
				return new Response(JSON.stringify({ access_token: 'gg_access_token' }), { status: 200 });
			}
			if (url === 'https://www.googleapis.com/oauth2/v3/userinfo') {
				return new Response(JSON.stringify({
					sub: 'gg-pkce-sub-1',
					email: 'pkce-user@gmail.com',
					email_verified: true,
					name: 'PKCE User'
				}), { status: 200 });
			}
			throw new Error(`Unexpected fetch: ${url}`);
		}));

		const cb = await SELF.fetch(
			`${BASE}/api/oauth/callback/google?code=gg-auth-code&state=${encodeURIComponent(state)}`,
			{ redirect: 'manual' }
		);
		expect(cb.status).toBe(302);
		expect(cb.headers.get('Location') || '').toContain('#oauth_bind=');
		expect(capturedVerifier.length).toBeGreaterThanOrEqual(40);
		expect(await sha256Base64Url(capturedVerifier)).toBe(challenge);
	});

	it('fails closed when clientSecret is missing and never marks half-configured Apple as configured', async () => {
		const sanitized = settingService.sanitizeOAuthProviders({
			apple: {
				enabled: 1,
				clientId: 'com.epomail.web',
				clientSecret: '',
				teamId: 'TEAM123',
				keyId: 'KEY123'
			}
		});
		expect(sanitized.apple.configured).toBe(0);

		await putSettings({
			oauthLoginEnabled: 1,
			oauthProviders: {
				github: { clientId: 'gh-only-id', clientSecret: '', enabled: 1 }
			}
		});

		const pub = await (await SELF.fetch(`${BASE}/api/oauth/providers`)).json();
		expect(pub.data).toEqual([]);

		const auth = await (await SELF.fetch(`${BASE}/api/oauth/authorize/github?state=missing-secret`)).json();
		expect(auth.code).toBe(503);
		expect(auth.errorCode).toBe('oauth_provider_unconfigured');
	});

	it('revokes pending one-time credentials in D1 when settingService.set disables a provider or global OAuth', async () => {
		const ctx = { env, get: () => undefined, set: () => {} };
		await settingService.set(ctx, {
			oauthLoginEnabled: 1,
			oauthProviders: {
				github: { clientId: 'gh-id', clientSecret: 'gh-sec', enabled: 1 },
				google: { clientId: 'gg-id', clientSecret: 'gg-sec', enabled: 1 }
			}
		});

		const ghState = await oneTimeCredential.issue(ctx, {
			purpose: OTC_PURPOSE.STATE,
			provider: 'github',
			payload: { redirectUri: `${BASE}/api/oauth/callback/github`, nonce: 'n1' },
			ttlSeconds: 600
		});
		const ggState = await oneTimeCredential.issue(ctx, {
			purpose: OTC_PURPOSE.STATE,
			provider: 'google',
			payload: { redirectUri: `${BASE}/api/oauth/callback/google`, nonce: 'n2' },
			ttlSeconds: 600
		});

		// Disable only GitHub: GitHub state is marked consumed=1, Google state stays unconsumed
		await settingService.set(ctx, {
			oauthProviders: {
				github: { clientId: 'gh-id', clientSecret: '******', enabled: 0 }
			}
		});
		expect((await oneTimeCredential.inspect(ctx, { purpose: OTC_PURPOSE.STATE, token: ghState })).consumed).toBe(true);
		expect((await oneTimeCredential.inspect(ctx, { purpose: OTC_PURPOSE.STATE, token: ggState })).consumed).toBe(false);

		// Disable global OAuth: Google state is also marked consumed=1
		await settingService.set(ctx, { oauthLoginEnabled: 0 });
		expect((await oneTimeCredential.inspect(ctx, { purpose: OTC_PURPOSE.STATE, token: ggState })).consumed).toBe(true);
	});
});
