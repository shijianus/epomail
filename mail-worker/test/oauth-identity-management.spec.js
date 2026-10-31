/**
 * B5 — OAuth identity management for an already signed-in account.
 *
 * These probes exercise the real HTTP entry points (auth middleware included)
 * against a real D1/KV isolate. They assert the properties that make the
 * feature safe rather than merely functional:
 *
 *   - the account always comes from the session, never from the request body;
 *   - bind/unbind require a fresh, single-use step-up grant bound to the exact
 *     session token;
 *   - the provider callback never binds; it hands out a claim that only the
 *     initiating session can redeem (cross-user and replay attacks fail);
 *   - one provider identity can never live on two accounts (lease + CAS);
 *   - the last usable login method cannot be removed;
 *   - GET never mutates an identity;
 *   - audit rows record the event without any one-time secret.
 */
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import cryptoUtils from '../src/utils/crypto-utils.js';
import totpUtils from '../src/utils/totp-utils.js';
import JwtUtils from '../src/utils/jwt-utils.js';
import oauthService from '../src/service/oauth-service.js';
import oauthIdentityService from '../src/service/oauth-identity-service.js';
import securityNoticeService from '../src/service/security-notice-service.js';
import { dbInit } from '../src/init/init.js';
import { ensureOtcTable, ensureBindClaimTable, clearOtc, clearBindClaim } from './helpers/one-time-credential.js';

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
	sort TEXT DEFAULT '0',
	send_count TEXT DEFAULT '0',
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

const PASSWORD = 'CorrectHorseBattery1';
const USER_A = 7;
const USER_B = 8;
const USER_C = 9;
const EMAIL_A = 'identity.a@example.com';
const EMAIL_B = 'identity.b@example.com';
const EMAIL_C = 'identity.c@example.com';
const GITHUB_ID = 424242;

let passwordHash = null;
let passwordSalt = null;
let totpSecret = null;

function api(path, { method = 'GET', token = null, body } = {}) {
	const headers = {};
	if (token) headers.Authorization = token;
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	return SELF.fetch(`http://example.com/api${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
		redirect: 'manual'
	});
}

async function readJson(response) {
	return await response.json();
}

async function seedUser({ userId, email, password = passwordHash, salt = passwordSalt, totpEnabled = 0, totpEncrypted = '' }) {
	await env.db.prepare('DELETE FROM user WHERE user_id = ?').bind(userId).run();
	await env.db.prepare(`
		INSERT INTO user (user_id, email, password, salt, is_del, status, totp_enabled, totp_secret)
		VALUES (?, ?, ?, ?, 0, 0, ?, ?)
	`).bind(userId, email, password, salt, totpEnabled, totpEncrypted).run();
}

async function seedSession(userId, email, token, meta = null) {
	const jwt = await JwtUtils.generateToken({ env }, { userId, loginEmail: email, token }, 3600);
	const authInfo = {
		tokens: [token],
		user: { userId, email, isDel: 0, status: 0, type: 2 },
		refreshTime: new Date().toISOString()
	};
	if (meta) authInfo.tokenMeta = { [token]: meta };
	await env.kv.put(`auth-uid:${userId}`, JSON.stringify(authInfo), { expirationTtl: 3600 });
	return jwt;
}

async function addSession(userId, token, meta = null) {
	const authInfo = await env.kv.get(`auth-uid:${userId}`, { type: 'json' });
	authInfo.tokens = Array.isArray(authInfo.tokens) ? authInfo.tokens : [];
	if (!authInfo.tokens.includes(token)) authInfo.tokens.push(token);
	if (meta) {
		authInfo.tokenMeta = authInfo.tokenMeta || {};
		authInfo.tokenMeta[token] = meta;
	}
	await env.kv.put(`auth-uid:${userId}`, JSON.stringify(authInfo), { expirationTtl: 3600 });
}

async function seedIdentity(oauthUserId, userId, { name = 'Linked User', username = 'linked' } = {}) {
	const result = await env.db.prepare(
		'INSERT INTO oauth (oauth_user_id, username, name, active, trust_level, silenced, user_id) VALUES (?, ?, ?, 1, 1, 0, ?)'
	).bind(oauthUserId, username, name, userId).run();
	return Number(result.meta?.last_row_id || 0);
}

async function identityRows() {
	const { results } = await env.db.prepare('SELECT oauth_id, oauth_user_id, user_id FROM oauth ORDER BY oauth_id').all();
	return results || [];
}

async function auditRows(userId = null) {
	const statement = userId
		? env.db.prepare('SELECT event, provider, oauth_user_id, outcome, detail FROM oauth_identity_audit WHERE user_id = ? ORDER BY audit_id')
			.bind(userId)
		: env.db.prepare('SELECT event, provider, oauth_user_id, outcome, detail FROM oauth_identity_audit ORDER BY audit_id');
	const { results } = await statement.all();
	return results || [];
}

async function seedSettings() {
	await env.kv.put('setting:', JSON.stringify({
		oauthLoginEnabled: 1,
		oauthProviders: {
			github: { clientId: 'gh-test-client', clientSecret: 'gh-test-secret', enabled: 1 },
			google: { clientId: 'google-test-client', clientSecret: 'google-test-secret', enabled: 1 }
		}
	}), { expirationTtl: 3600 });
}

function stubGithubFetch({ id = GITHUB_ID, login = 'octo-linked' } = {}) {
	vi.stubGlobal('fetch', vi.fn(async (input) => {
		const url = typeof input === 'string' ? input : input.url;
		if (url.includes('github.com/login/oauth/access_token')) {
			return new Response(JSON.stringify({ access_token: 'gho_fake_access_token' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		if (url === 'https://api.github.com/user/emails') {
			return new Response(JSON.stringify([
				{ email: 'linked@example.com', verified: true, primary: true }
			]), { status: 200, headers: { 'Content-Type': 'application/json' } });
		}
		if (url === 'https://api.github.com/user') {
			return new Response(JSON.stringify({ id, login, name: 'Linked User', avatar_url: '' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		throw new Error(`Unexpected outbound fetch: ${url}`);
	}));
}

async function reauth(token, extra = {}) {
	const response = await api('/my/oauthIdentities/reauth', {
		method: 'POST',
		token,
		body: { password: PASSWORD, ...extra }
	});
	return { response, body: await readJson(response) };
}

function stateFromAuthorizeUrl(url) {
	return new URL(url).searchParams.get('state');
}

function claimFromLocation(location) {
	const url = new URL(location);
	const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
	const queryIndex = hash.indexOf('?');
	const params = new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : hash);
	return params.get('oauth_link') || '';
}

async function startGithubBind(token, extra = {}) {
	const grant = await reauth(token);
	expect(grant.response.status, JSON.stringify(grant.body)).toBe(200);
	const response = await api('/my/oauthIdentities/bind/start', {
		method: 'POST',
		token,
		body: { provider: 'github', stepUpToken: grant.body.data.stepUpToken, ...extra }
	});
	const body = await readJson(response);
	return { response, body, state: body?.data?.url ? stateFromAuthorizeUrl(body.data.url) : '' };
}

async function providerCallback(state, { id = GITHUB_ID, login = 'octo-linked' } = {}) {
	stubGithubFetch({ id, login });
	return await api(`/oauth/callback/github?code=fake-code&state=${encodeURIComponent(state)}`);
}

async function bindGithubFor(token) {
	const started = await startGithubBind(token);
	expect(started.response.status, JSON.stringify(started.body)).toBe(200);
	const callback = await providerCallback(started.state);
	const location = callback.headers.get('Location') || '';
	return { location, claim: claimFromLocation(location) };
}

function resetRateLimits() {
	const keys = [
		'rate-limit:oauth-identity-reauth:user:7',
		'rate-limit:oauth-identity-reauth:user:8',
		'rate-limit:oauth-identity-reauth:user:9',
		'rate-limit:oauth-identity-bind:user:7',
		'rate-limit:oauth-identity-bind:user:8',
		'rate-limit:oauth-identity-bind:user:9',
		'rate-limit:oauth-identity-complete:user:7',
		'rate-limit:oauth-identity-complete:user:8',
		'rate-limit:oauth-identity-complete:user:9',
		'rate-limit:oauth-identity-unbind:user:7',
		'rate-limit:oauth-identity-unbind:user:8',
		'rate-limit:oauth-identity-unbind:user:9',
		'rate-limit:oauth-identity-callback:local'
	];
	return Promise.all(keys.map(key => env.kv.delete(key)));
}

beforeAll(async () => {
	await env.db.prepare(CREATE_USER).run();
	await env.db.prepare(CREATE_OAUTH).run();
	await ensureOtcTable(env.db);
	await ensureBindClaimTable(env.db);
	await dbInit.v3_21DB({ env });
	// Idempotent on a second run, exactly like the upgrade chain.
	await dbInit.v3_21DB({ env });

	const hashed = await cryptoUtils.hashPassword(PASSWORD, env);
	passwordHash = hashed.hash;
	passwordSalt = hashed.salt;
	totpSecret = totpUtils.generateSecret();

	// Notice delivery needs the full mail schema; the audit table is what
	// these probes assert, so keep the security-notice path inert.
	vi.spyOn(securityNoticeService, 'sendNotice').mockResolvedValue(null);
});

beforeEach(async () => {
	await env.db.prepare('DELETE FROM oauth').run();
	await env.db.prepare('DELETE FROM oauth_identity_audit').run();
	await env.db.prepare('DELETE FROM user').run();
	await clearOtc(env.db);
	await clearBindClaim(env.db);

	await seedUser({ userId: USER_A, email: EMAIL_A });
	await seedUser({ userId: USER_B, email: EMAIL_B });
	// USER_C is an OAuth-created account: its password is a random hash the
	// owner never saw, marked in KV.
	await seedUser({
		userId: USER_C,
		email: EMAIL_C,
		password: 'generated-hash-never-chosen',
		salt: 'generated-salt'
	});
	await env.kv.put(`initial_pwd:${USER_C}`, 'generated-hash-never-chosen');

	await seedSettings();
	await resetRateLimits();

	for (const key of [
		'auth-uid:7', 'auth-uid:8', 'auth-uid:9',
		'initial_pwd:7', 'initial_pwd:8',
		'apple_jwks_v1'
	]) {
		await env.kv.delete(key);
	}
	await env.kv.put(`initial_pwd:${USER_C}`, 'generated-hash-never-chosen');
});

afterAll(async () => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	await env.db.prepare('DELETE FROM oauth').run();
	await env.db.prepare('DELETE FROM oauth_identity_audit').run();
	await env.db.prepare('DELETE FROM user').run();
	await clearOtc(env.db);
	await clearBindClaim(env.db);
	for (const key of ['auth-uid:7', 'auth-uid:8', 'auth-uid:9', 'initial_pwd:7', 'initial_pwd:8', 'initial_pwd:9', 'setting:']) {
		await env.kv.delete(key);
	}
	await env.db.prepare('DELETE FROM oauth').run();
	await env.db.prepare('DELETE FROM oauth_identity_audit').run();
	await env.db.prepare('DELETE FROM oauth_bind_claim').run();
	await env.db.prepare('DELETE FROM oauth_one_time_credential').run();
	await env.db.prepare('DELETE FROM user WHERE user_id IN (7, 8, 9)').run();
});

describe('listing linked identities', () => {
	it('requires a valid session', async () => {
		const response = await api('/my/oauthIdentities');
		const body = await readJson(response);
		expect(body.code).toBe(401);
	});

	it('reports enabled providers, bound state and never leaks the provider identity', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		await seedIdentity(`github:${GITHUB_ID}`, USER_A);

		const response = await api('/my/oauthIdentities', { token: tokenA });
		const body = await readJson(response);
		expect(body.code, JSON.stringify(body)).toBe(200);

		const github = body.data.providers.find(item => item.key === 'github');
		const google = body.data.providers.find(item => item.key === 'google');
		expect(github.bound).toBe(true);
		expect(google.bound).toBe(false);
		expect(body.data.identities).toHaveLength(1);
		expect(body.data.identities[0].provider).toBe('github');
		expect(body.data.login.hasPassword).toBe(true);
		expect(body.data.login.canRemoveIdentity).toBe(true);

		const raw = JSON.stringify(body.data);
		expect(raw).not.toContain(`github:${GITHUB_ID}`);
	});

	it('marks an OAuth-only account with a single identity as last-method protected', async () => {
		const tokenC = await seedSession(USER_C, EMAIL_C, 'session-c', {
			method: 'oauth', provider: 'github', at: Date.now()
		});
		await seedIdentity(`github:${GITHUB_ID}`, USER_C);

		const body = await readJson(await api('/my/oauthIdentities', { token: tokenC }));
		expect(body.data.login.hasPassword).toBe(false);
		expect(body.data.login.canRemoveIdentity).toBe(false);
	});
});

describe('re-authentication before a sensitive identity operation', () => {
	it('rejects a wrong password and records the failure without a secret', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const response = await api('/my/oauthIdentities/reauth', {
			method: 'POST',
			token: tokenA,
			body: { password: 'definitely-wrong' }
		});
		const body = await readJson(response);
		expect(body.code).toBe(403);
		expect(body.errorCode).toBe('reauth_failed');

		const rows = await auditRows(USER_A);
		expect(rows.some(row => row.event === 'reauth_failed')).toBe(true);
		expect(JSON.stringify(rows)).not.toContain('definitely-wrong');
	}, 20000);

	it('rejects a request with no body password', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const body = await readJson(await api('/my/oauthIdentities/reauth', {
			method: 'POST',
			token: tokenA,
			body: {}
		}));
		expect(body.code).toBe(400);
		expect(body.errorCode).toBe('password_required');
	});

	it('requires the second factor when TOTP is enabled, and accepts a valid code', async () => {
		const encrypted = await totpUtils.encryptSecret(totpSecret, env);
		await seedUser({ userId: USER_A, email: EMAIL_A, totpEnabled: 1, totpEncrypted: encrypted });
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');

		const missing = await reauth(tokenA);
		expect(missing.body.code).toBe(400);
		expect(missing.body.errorCode).toBe('totp_required');

		const wrong = await reauth(tokenA, { code: '000000' });
		expect(wrong.body.code).toBe(403);

		const code = await totpUtils.generateTOTP(totpSecret);
		const ok = await reauth(tokenA, { code });
		expect(ok.response.status, JSON.stringify(ok.body)).toBe(200);
		expect(ok.body.data.stepUpToken).toBeTruthy();
		expect(ok.body.data.method).toBe('password+totp');
	}, 30000);

	it('lets an OAuth-only account use a fresh provider session instead of a password', async () => {
		const tokenC = await seedSession(USER_C, EMAIL_C, 'session-c', {
			method: 'oauth', provider: 'github', at: Date.now()
		});
		const response = await api('/my/oauthIdentities/reauth', {
			method: 'POST',
			token: tokenC,
			body: {}
		});
		const body = await readJson(response);
		expect(body.code, JSON.stringify(body)).toBe(200);
		expect(body.data.method).toBe('provider_session');
	});

	it('rejects a stale provider session for an OAuth-only account', async () => {
		const tokenC = await seedSession(USER_C, EMAIL_C, 'session-c', {
			method: 'oauth', provider: 'github', at: Date.now() - 16 * 60 * 1000
		});
		const body = await readJson(await api('/my/oauthIdentities/reauth', {
			method: 'POST',
			token: tokenC,
			body: {}
		}));
		expect(body.code).toBe(403);
		expect(body.errorCode).toBe('reauth_provider_required');
	});

	it('rejects a password-based session that never had a recent provider login', async () => {
		// Password is usable, so the password path is the only accepted proof;
		// an empty body must not fall back to the session.
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const body = await readJson(await api('/my/oauthIdentities/reauth', {
			method: 'POST',
			token: tokenA,
			body: {}
		}));
		expect(body.code).toBe(400);
		expect(body.errorCode).toBe('password_required');
	});
});

describe('binding an additional identity', () => {
	it('binds to the session account and ignores a forged userId in the body', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const grant = await reauth(tokenA);
		const started = await api('/my/oauthIdentities/bind/start', {
			method: 'POST',
			token: tokenA,
			// A caller-supplied userId must be ignored.
			body: { provider: 'github', userId: USER_B, stepUpToken: grant.body.data.stepUpToken }
		});
		const startBody = await readJson(started);
		expect(startBody.code, JSON.stringify(startBody)).toBe(200);

		const state = stateFromAuthorizeUrl(startBody.data.url);
		const authBefore = await env.kv.get(`auth-uid:${USER_A}`, { type: 'json' });
		const callback = await providerCallback(state);
		const authAfter = await env.kv.get(`auth-uid:${USER_A}`, { type: 'json' });
		// A bind callback must never mint a session or add a token.
		expect(authAfter.tokens).toEqual(authBefore.tokens);
		const location = callback.headers.get('Location') || '';
		expect(location).toContain('oauth_bind=linked');
		const claim = claimFromLocation(location);
		expect(claim).toBeTruthy();

		const completed = await api('/my/oauthIdentities/bind/complete', {
			method: 'POST',
			token: tokenA,
			body: { token: claim }
		});
		const completedBody = await readJson(completed);
		expect(completedBody.code, JSON.stringify(completedBody)).toBe(200);

		const rows = await identityRows();
		expect(rows).toHaveLength(1);
		expect(rows[0].oauth_user_id).toBe(`github:${GITHUB_ID}`);
		expect(rows[0].user_id).toBe(USER_A);

		const audit = await auditRows(USER_A);
		expect(audit.some(row => row.event === 'identity_bind_started')).toBe(true);
		expect(audit.some(row => row.event === 'identity_bound' && row.outcome === 'success')).toBe(true);
		// No one-time credential material in the audit trail.
		expect(JSON.stringify(audit)).not.toContain(claim);
		expect(JSON.stringify(audit)).not.toContain(grant.body.data.stepUpToken);
	});

	it('returns the claim to the account slot that started the bind', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const started = await startGithubBind(tokenA, { accountIndex: 3 });
		expect(started.response.status, JSON.stringify(started.body)).toBe(200);

		const callback = await providerCallback(started.state);
		const location = callback.headers.get('Location') || '';
		const url = new URL(location);
		expect(url.pathname).toBe('/mail/u/3/');
		expect(url.hash.startsWith('#settings/security?')).toBe(true);
		expect(new URLSearchParams(url.hash.split('?')[1]).get('oauth_bind')).toBe('linked');
		expect(claimFromLocation(location)).toBeTruthy();
	});

	it('refuses a second bind of the same provider for the same account', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const first = await bindGithubFor(tokenA);
		expect(first.claim).toBeTruthy();
		await api('/my/oauthIdentities/bind/complete', {
			method: 'POST', token: tokenA, body: { token: first.claim }
		});

		const second = await startGithubBind(tokenA);
		expect(second.body.code).toBe(409);
		expect(second.body.errorCode).toBe('identity_already_bound');
		expect(await identityRows()).toHaveLength(1);
	});

	it('rejects an identity that already belongs to another account', async () => {
		await seedIdentity(`github:${GITHUB_ID}`, USER_A);
		const tokenB = await seedSession(USER_B, EMAIL_B, 'session-b');

		const started = await startGithubBind(tokenB);
		expect(started.response.status, JSON.stringify(started.body)).toBe(200);

		const callback = await providerCallback(started.state);
		const location = callback.headers.get('Location') || '';
		expect(location).toContain('oauth_bind=conflict');
		expect(claimFromLocation(location)).toBe('');

		const rows = await identityRows();
		expect(rows).toHaveLength(1);
		expect(rows[0].user_id).toBe(USER_A);

		const audit = await auditRows(USER_B);
		expect(audit.some(row => row.event === 'identity_bind_rejected' && row.detail === 'identity_owned_by_other_account')).toBe(true);
	});

	it('never treats the provider-returned email as account ownership', async () => {
		// The mocked GitHub profile returns linked@example.com as a verified
		// address. USER_B already owns that address locally. A bind started by
		// USER_A must attach to USER_A (the session), not to the mailbox whose
		// address the provider reported.
		await seedUser({ userId: USER_B, email: 'linked@example.com' });
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const tokenB = await seedSession(USER_B, 'linked@example.com', 'session-b');
		expect(tokenB).toBeTruthy();

		const { claim } = await bindGithubFor(tokenA);
		const completed = await api('/my/oauthIdentities/bind/complete', {
			method: 'POST', token: tokenA, body: { token: claim }
		});
		expect((await readJson(completed)).code).toBe(200);

		const rows = await identityRows();
		expect(rows).toHaveLength(1);
		expect(rows[0].user_id).toBe(USER_A);
	});

	it('does not let another account redeem a bind claim', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const tokenB = await seedSession(USER_B, EMAIL_B, 'session-b');

		const { claim } = await bindGithubFor(tokenA);
		expect(claim).toBeTruthy();

		const stolen = await api('/my/oauthIdentities/bind/complete', {
			method: 'POST', token: tokenB, body: { token: claim }
		});
		const stolenBody = await readJson(stolen);
		expect(stolenBody.code).toBe(410);
		expect(stolenBody.errorCode).toBe('bind_claim_invalid');

		const rows = await identityRows();
		expect(rows[0].user_id).toBe(0);

		// The legitimate session can still redeem it.
		const legit = await api('/my/oauthIdentities/bind/complete', {
			method: 'POST', token: tokenA, body: { token: claim }
		});
		expect((await readJson(legit)).code).toBe(200);
		expect((await identityRows())[0].user_id).toBe(USER_A);
	});

	it('burns a bind claim exactly once', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const { claim } = await bindGithubFor(tokenA);

		const first = await api('/my/oauthIdentities/bind/complete', {
			method: 'POST', token: tokenA, body: { token: claim }
		});
		expect((await readJson(first)).code).toBe(200);

		const replay = await api('/my/oauthIdentities/bind/complete', {
			method: 'POST', token: tokenA, body: { token: claim }
		});
		expect((await readJson(replay)).code).toBe(410);
	});

	it('does not accept a bind claim after the session changed', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const { claim } = await bindGithubFor(tokenA);

		// Simulate a re-login: a new session token replaces the old one.
		const tokenA2 = await seedSession(USER_A, EMAIL_A, 'session-a2');
		const response = await api('/my/oauthIdentities/bind/complete', {
			method: 'POST', token: tokenA2, body: { token: claim }
		});
		expect((await readJson(response)).code).toBe(410);
		expect((await identityRows())[0].user_id).toBe(0);
	});

	it('rejects a replayed OAuth state on the callback', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const started = await startGithubBind(tokenA);

		const first = await providerCallback(started.state);
		expect(first.headers.get('Location')).toContain('oauth_bind=linked');

		const replay = await providerCallback(started.state);
		expect(replay.headers.get('Location')).toContain('oauth_state_invalid');
	});

	it('rejects a callback with a guessed state', async () => {
		stubGithubFetch();
		const response = await api('/oauth/callback/github?code=fake-code&state=guessed-state');
		expect(response.headers.get('Location')).toContain('oauth_state_invalid');
	});

	it('keeps exactly one winner when the same identity is bound concurrently', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const tokenB = await seedSession(USER_B, EMAIL_B, 'session-b');

		// Both accounts complete a provider flow for the same GitHub identity.
		const flowA = await bindGithubFor(tokenA);
		const flowB = await bindGithubFor(tokenB);
		expect(flowA.claim).toBeTruthy();
		expect(flowB.claim).toBeTruthy();

		const [a, b] = await Promise.all([
			api('/my/oauthIdentities/bind/complete', { method: 'POST', token: tokenA, body: { token: flowA.claim } }),
			api('/my/oauthIdentities/bind/complete', { method: 'POST', token: tokenB, body: { token: flowB.claim } })
		]);
		const results = [await readJson(a), await readJson(b)];

		expect(results.filter(item => item.code === 200)).toHaveLength(1);
		expect(results.filter(item => item.code !== 200)).toHaveLength(1);

		const rows = await identityRows();
		expect(rows.filter(row => row.oauth_user_id === `github:${GITHUB_ID}`)).toHaveLength(1);
		expect([USER_A, USER_B]).toContain(rows[0].user_id);
	});

	it('does not bind without a step-up grant and refuses a grant from another session', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const tokenB = await seedSession(USER_B, EMAIL_B, 'session-b');

		const noGrant = await api('/my/oauthIdentities/bind/start', {
			method: 'POST', token: tokenA, body: { provider: 'github' }
		});
		expect((await readJson(noGrant)).code).toBe(403);

		const grant = await reauth(tokenA);
		const stolenGrant = await api('/my/oauthIdentities/bind/start', {
			method: 'POST', token: tokenB, body: { provider: 'github', stepUpToken: grant.body.data.stepUpToken }
		});
		expect((await readJson(stolenGrant)).code).toBe(403);
	});
});

describe('unbinding an identity', () => {
	it('removes only the caller\'s row and revokes sessions issued by that provider', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		await addSession(USER_A, 'session-a-github', { method: 'oauth', provider: 'github', at: Date.now() });
		const oauthId = await seedIdentity(`github:${GITHUB_ID}`, USER_A);

		const grant = await reauth(tokenA);
		const response = await api(`/my/oauthIdentities/${oauthId}`, {
			method: 'DELETE',
			token: tokenA,
			body: { stepUpToken: grant.body.data.stepUpToken }
		});
		const body = await readJson(response);
		expect(body.code, JSON.stringify(body)).toBe(200);
		expect(body.data.unbound).toBe(true);
		expect(body.data.revokedSessions).toBe(1);

		expect(await identityRows()).toHaveLength(0);

		const authInfo = await env.kv.get(`auth-uid:${USER_A}`, { type: 'json' });
		expect(authInfo.tokens).toEqual(['session-a']);
		expect(authInfo.tokenMeta['session-a-github']).toBeUndefined();

		const audit = await auditRows(USER_A);
		expect(audit.some(row => row.event === 'identity_unbound')).toBe(true);
		expect(audit.some(row => row.event === 'identity_sessions_revoked')).toBe(true);
	});

	it('cannot unbind another account\'s identity', async () => {
		const tokenB = await seedSession(USER_B, EMAIL_B, 'session-b');
		const oauthId = await seedIdentity(`github:${GITHUB_ID}`, USER_A);

		const grant = await reauth(tokenB);
		const response = await api(`/my/oauthIdentities/${oauthId}`, {
			method: 'DELETE',
			token: tokenB,
			body: { stepUpToken: grant.body.data.stepUpToken }
		});
		const body = await readJson(response);
		expect(body.code).toBe(404);
		expect(body.errorCode).toBe('identity_not_found');
		expect(await identityRows()).toHaveLength(1);
	});

	it('requires a step-up grant', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const oauthId = await seedIdentity(`github:${GITHUB_ID}`, USER_A);

		const response = await api(`/my/oauthIdentities/${oauthId}`, {
			method: 'DELETE', token: tokenA, body: { stepUpToken: 'not-a-real-grant' }
		});
		expect((await readJson(response)).code).toBe(403);
		expect(await identityRows()).toHaveLength(1);
	});

	it('never mutates an identity on GET', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const oauthId = await seedIdentity(`github:${GITHUB_ID}`, USER_A);
		const grant = await reauth(tokenA);

		for (const path of [
			`/my/oauthIdentities/${oauthId}`,
			`/my/oauthIdentities/${oauthId}?stepUpToken=${encodeURIComponent(grant.body.data.stepUpToken)}`
		]) {
			const response = await api(path, { token: tokenA });
			expect(response.status).toBe(404);
		}
		expect(await identityRows()).toHaveLength(1);
	});

	it('protects the last usable login method of an OAuth-only account', async () => {
		const tokenC = await seedSession(USER_C, EMAIL_C, 'session-c', {
			method: 'oauth', provider: 'github', at: Date.now()
		});
		const oauthId = await seedIdentity(`github:${GITHUB_ID}`, USER_C);

		const grant = await api('/my/oauthIdentities/reauth', {
			method: 'POST', token: tokenC, body: {}
		});
		const grantBody = await readJson(grant);
		expect(grantBody.code).toBe(200);

		const response = await api(`/my/oauthIdentities/${oauthId}`, {
			method: 'DELETE',
			token: tokenC,
			body: { stepUpToken: grantBody.data.stepUpToken }
		});
		const body = await readJson(response);
		expect(body.code).toBe(409);
		expect(body.errorCode).toBe('last_login_method');
		expect(await identityRows()).toHaveLength(1);
	});

	it('allows removing the last identity when a password is usable', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const oauthId = await seedIdentity(`github:${GITHUB_ID}`, USER_A);

		const grant = await reauth(tokenA);
		const response = await api(`/my/oauthIdentities/${oauthId}`, {
			method: 'DELETE',
			token: tokenA,
			body: { stepUpToken: grant.body.data.stepUpToken }
		});
		expect((await readJson(response)).code).toBe(200);
		expect(await identityRows()).toHaveLength(0);
	});
});

describe('session invalidation', () => {
	it('rejects every identity endpoint after the session is revoked', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const grant = await reauth(tokenA);
		await env.kv.delete(`auth-uid:${USER_A}`);

		for (const [path, method, body] of [
			['/my/oauthIdentities', 'GET', undefined],
			['/my/oauthIdentities/reauth', 'POST', { password: PASSWORD }],
			['/my/oauthIdentities/bind/start', 'POST', { provider: 'github', stepUpToken: grant.body.data.stepUpToken }],
			['/my/oauthIdentities/bind/complete', 'POST', { token: 'whatever' }]
		]) {
			const response = await api(path, { method, token: tokenA, body });
			expect((await readJson(response)).code).toBe(401);
		}
	});

	it('rejects a step-up grant after the session token changes', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const grant = await reauth(tokenA);

		const tokenA2 = await seedSession(USER_A, EMAIL_A, 'session-a2');
		const response = await api('/my/oauthIdentities/bind/start', {
			method: 'POST',
			token: tokenA2,
			body: { provider: 'github', stepUpToken: grant.body.data.stepUpToken }
		});
		expect((await readJson(response)).code).toBe(403);
	});
});

describe('cross-site request forgery surface', () => {
	it('rejects a cross-origin mutation that carries only cookies, and never reflects CORS', async () => {
		const oauthId = await seedIdentity(`github:${GITHUB_ID}`, USER_A);

		// The API authenticates with an Authorization bearer token, never a
		// cookie, so a cross-site form post cannot forge an authenticated call.
		const post = await SELF.fetch('http://example.com/api/my/oauthIdentities/reauth', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Origin: 'https://evil.example',
				Cookie: 'token=stolen-cookie'
			},
			body: 'password=guess'
		});
		expect((await post.json()).code).toBe(401);
		expect(post.headers.get('Access-Control-Allow-Origin')).toBeNull();

		const del = await SELF.fetch(`http://example.com/api/my/oauthIdentities/${oauthId}`, {
			method: 'DELETE',
			headers: { Origin: 'https://evil.example', Cookie: 'token=stolen-cookie' }
		});
		expect((await del.json()).code).toBe(401);
		expect(del.headers.get('Access-Control-Allow-Origin')).toBeNull();
		expect(await identityRows()).toHaveLength(1);
	});
});

describe('upgrade migration', () => {
	it('keeps the audit table and its index idempotent', async () => {
		await dbInit.v3_21DB({ env });
		const table = await env.db.prepare(
			`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'oauth_identity_audit'`
		).first();
		const index = await env.db.prepare(
			`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_oauth_identity_audit_user'`
		).first();
		expect(table?.name).toBe('oauth_identity_audit');
		expect(index?.name).toBe('idx_oauth_identity_audit_user');
	});
});

describe('service-level guards', () => {
	it('exposes no path that accepts a userId from the caller', async () => {
		// completeBind ignores any extra body fields; only the session decides.
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const { claim } = await bindGithubFor(tokenA);
		const response = await api('/my/oauthIdentities/bind/complete', {
			method: 'POST',
			token: tokenA,
			body: { token: claim, userId: USER_B }
		});
		expect((await readJson(response)).code).toBe(200);
		expect((await identityRows())[0].user_id).toBe(USER_A);
	});

	it('rejects a bind start for a provider the operator has not enabled', async () => {
		const tokenA = await seedSession(USER_A, EMAIL_A, 'session-a');
		const grant = await reauth(tokenA);
		const response = await api('/my/oauthIdentities/bind/start', {
			method: 'POST',
			token: tokenA,
			body: { provider: 'linode', stepUpToken: grant.body.data.stepUpToken }
		});
		const body = await readJson(response);
		expect(body.code).toBe(400);
		expect(body.errorCode).toBe('provider_unavailable');
	});
});
