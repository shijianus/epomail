/**
 * B2 — OAuth single-use credential atomicity.
 *
 * These probes drive the real service and HTTP entry points against the
 * D1-backed credential store and assert the security invariant that matters:
 * a single-use credential yields at most one successful consumption, even
 * when every request is in flight at the same time.
 *
 * A control test at the bottom reproduces the legacy KV `get()` then
 * `delete()` algorithm to show that the harness does observe the race, and
 * that switching to an atomic compare-and-set is what closes it.
 */
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import oauthService from '../src/service/oauth-service.js';
import oauthProviderService from '../src/service/oauth-provider-service.js';
import oauthAppService from '../src/service/oauth-app-service.js';
import loginService from '../src/service/login-service.js';
import userService from '../src/service/user-service.js';
import settingService from '../src/service/setting-service.js';
import oneTimeCredential, { OTC_PURPOSE } from '../src/utils/one-time-credential.js';
import { dbInit } from '../src/init/init.js';
import {
	ensureOtcTable,
	seedOtc,
	clearOtc,
	countOtc,
	dropOtcTable,
	sha256Hex,
	ensureBindClaimTable,
	clearBindClaim
} from './helpers/one-time-credential.js';

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

const encoder = new TextEncoder();

function b64url(bytes) {
	let binary = '';
	for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function createSigningMaterial(kid = 'atomicity-kid') {
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

async function resetRateLimits() {
	for (const scope of ['oauth-login', 'oauth-bind', 'oauth-exchange']) {
		await env.kv.delete(`rate-limit:${scope}:local`);
	}
}

function counts(results) {
	return {
		successes: results.filter(r => r && r.ok).length,
		failures: results.filter(r => !r || !r.ok).length
	};
}

beforeAll(async () => {
	await env.db.prepare(CREATE_OAUTH).run();
	await ensureOtcTable(env.db);
	await ensureBindClaimTable(env.db);
});

beforeEach(async () => {
	await env.db.prepare('DELETE FROM oauth').run();
	await clearOtc(env.db);
	await clearBindClaim(env.db);
	await resetRateLimits();
	await env.kv.delete('apple_jwks_v1');
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

afterAll(async () => {
	await env.db.prepare('DELETE FROM oauth').run();
	await clearOtc(env.db);
	await clearBindClaim(env.db);
	await env.kv.delete('apple_jwks_v1');
	await resetRateLimits();
	await env.db.prepare('DROP TABLE IF EXISTS oauth').run();
	await env.db.prepare('DROP TABLE IF EXISTS oauth_bind_claim').run();
	await dropOtcTable(env.db);
});

describe('D1 single-use store: atomic compare-and-set', () => {
	it('lets exactly one of 32 concurrent consumers win', async () => {
		const token = await oneTimeCredential.issue({ env }, {
			purpose: OTC_PURPOSE.LOGIN_CODE,
			payload: { marker: 'once' },
			ttlSeconds: 60
		});

		const results = await Promise.all(Array.from({ length: 32 }, () =>
			oneTimeCredential.consume({ env }, { purpose: OTC_PURPOSE.LOGIN_CODE, token })
		));

		expect(results.filter(Boolean).length).toBe(1);
		expect(results.filter(Boolean)[0].payload.marker).toBe('once');
	});

	it('rejects a sequential replay after the first consumption', async () => {
		const token = await oneTimeCredential.issue({ env }, {
			purpose: OTC_PURPOSE.LOGIN_CODE,
			payload: { marker: 'sequential' },
			ttlSeconds: 60
		});

		expect(await oneTimeCredential.consume({ env }, { purpose: OTC_PURPOSE.LOGIN_CODE, token })).toBeTruthy();
		expect(await oneTimeCredential.consume({ env }, { purpose: OTC_PURPOSE.LOGIN_CODE, token })).toBeNull();
	});

	it('refuses an expired credential without consuming anything else', async () => {
		const token = 'expired-token-value-0123456789abcdef';
		await seedOtc(env.db, {
			purpose: OTC_PURPOSE.LOGIN_CODE,
			token,
			payload: { marker: 'expired' },
			expiresAt: Math.floor(Date.now() / 1000) - 1
		});
		expect(await oneTimeCredential.consume({ env }, { purpose: OTC_PURPOSE.LOGIN_CODE, token })).toBeNull();
	});

	it('refuses forged and wrong-purpose tokens', async () => {
		expect(await oneTimeCredential.consume({ env }, {
			purpose: OTC_PURPOSE.LOGIN_CODE,
			token: 'f'.repeat(64)
		})).toBeNull();

		const token = await oneTimeCredential.issue({ env }, {
			purpose: OTC_PURPOSE.STATE,
			provider: 'apple',
			payload: { redirectUri: 'https://mail.example.com/cb' },
			ttlSeconds: 60
		});
		expect(await oneTimeCredential.consume({ env }, { purpose: OTC_PURPOSE.LOGIN_CODE, token })).toBeNull();
	});

	it('a provider mismatch is a predicate failure and does not burn the credential', async () => {
		const token = await oneTimeCredential.issue({ env }, {
			purpose: OTC_PURPOSE.STATE,
			provider: 'apple',
			payload: { redirectUri: 'https://mail.example.com/cb', marker: 'apple-only' },
			ttlSeconds: 60
		});

		expect(await oneTimeCredential.consume({ env }, {
			purpose: OTC_PURPOSE.STATE,
			token,
			provider: 'github'
		})).toBeNull();

		const winner = await oneTimeCredential.consume({ env }, {
			purpose: OTC_PURPOSE.STATE,
			token,
			provider: 'apple'
		});
		expect(winner?.payload.marker).toBe('apple-only');
	});

	it('an identity mismatch is a predicate failure and does not burn the credential', async () => {
		const token = await oneTimeCredential.issue({ env }, {
			purpose: OTC_PURPOSE.BIND,
			provider: 'apple',
			oauthUserId: 'apple:owner',
			payload: { oauthUserId: 'apple:owner', marker: 'owner-only' },
			ttlSeconds: 60
		});

		expect(await oneTimeCredential.consume({ env }, {
			purpose: OTC_PURPOSE.BIND,
			token,
			oauthUserId: 'apple:attacker'
		})).toBeNull();

		const winner = await oneTimeCredential.consume({ env }, {
			purpose: OTC_PURPOSE.BIND,
			token,
			oauthUserId: 'apple:owner'
		});
		expect(winner?.payload.marker).toBe('owner-only');
	});

	it('persists only a digest of the bearer token', async () => {
		const token = await oneTimeCredential.issue({ env }, {
			purpose: OTC_PURPOSE.LOGIN_CODE,
			payload: { marker: 'digest' },
			ttlSeconds: 60
		});
		const rows = await env.db.prepare('SELECT * FROM oauth_one_time_credential').all();
		expect(rows.results.length).toBe(1);
		expect(JSON.stringify(rows.results[0])).not.toContain(token);
		expect(rows.results[0].token_hash).toBe(await sha256Hex(token));
	});

	it('fails closed when the database is unavailable and never falls back to KV', async () => {
		const kvCalls = [];
		const failingDb = {
			prepare() {
				throw new Error('D1 unavailable');
			}
		};
		const c = {
			env: {
				db: failingDb,
				kv: {
					async get(key) { kvCalls.push(['get', key]); return null; },
					async put(key) { kvCalls.push(['put', key]); },
					async delete(key) { kvCalls.push(['delete', key]); }
				}
			}
		};

		await expect(oneTimeCredential.consume(c, {
			purpose: OTC_PURPOSE.LOGIN_CODE,
			token: 'a'.repeat(64)
		})).rejects.toThrow();
		await expect(oauthService.consumeLoginExchangeCode(c, 'a'.repeat(64))).rejects.toThrow();
		expect(kvCalls).toEqual([]);
	});

	it('fails closed when no D1 binding is configured at all', async () => {
		await expect(oauthService.createLoginExchangeCode({ env: {} }, {
			token: 'session-jwt',
			userInfo: { oauthUserId: 'apple:no-db' },
			provider: 'apple'
		})).rejects.toThrow(/storage is unavailable/i);
	});
});

describe('Legacy KV get-then-delete control', () => {
	it('demonstrates that the retired pattern can report two winners', async () => {
		const store = new Map([['legacy', JSON.stringify({ marker: 'legacy' })]]);
		const racyKv = {
			async get(key) {
				const value = store.get(key);
				await new Promise(resolve => setTimeout(resolve, 5));
				return value ? JSON.parse(value) : null;
			},
			async delete(key) {
				await new Promise(resolve => setTimeout(resolve, 5));
				store.delete(key);
			}
		};
		const legacyConsume = async (key) => {
			const row = await racyKv.get(key);
			if (!row) return null;
			await racyKv.delete(key);
			return row;
		};

		const results = await Promise.all(Array.from({ length: 8 }, () => legacyConsume('legacy')));
		expect(results.filter(Boolean).length).toBeGreaterThan(1);
	});
});

describe('OAuth state', () => {
	function statePayload() {
		return {
			redirectUri: 'https://mail.example.com/api/oauth/callback/apple',
			nonce: 'nonce-value',
			clientState: 'client-state',
			createdAt: Date.now()
		};
	}

	it('lets exactly one of 8 concurrent callbacks consume the same state', async () => {
		const state = 'a'.repeat(64);
		await seedOtc(env.db, {
			purpose: OTC_PURPOSE.STATE,
			token: state,
			provider: 'apple',
			payload: statePayload()
		});

		const results = await Promise.all(Array.from({ length: 8 }, () =>
			oauthService.consumeState({ env }, 'apple', state)
				.then(row => ({ ok: true, row }))
				.catch(() => ({ ok: false }))
		));
		expect(counts(results).successes).toBe(1);
		expect(counts(results).failures).toBe(7);
	});

	it('rejects a cross-provider redemption without consuming the legitimate state', async () => {
		const state = 'b'.repeat(64);
		await seedOtc(env.db, {
			purpose: OTC_PURPOSE.STATE,
			token: state,
			provider: 'apple',
			payload: statePayload()
		});

		await expect(oauthService.consumeState({ env }, 'github', state)).rejects.toThrow(/state/i);
		const row = await oauthService.consumeState({ env }, 'apple', state);
		expect(row.clientState).toBe('client-state');
	});

	it('rejects an expired state', async () => {
		const state = 'c'.repeat(64);
		await seedOtc(env.db, {
			purpose: OTC_PURPOSE.STATE,
			token: state,
			provider: 'apple',
			payload: statePayload(),
			expiresAt: Math.floor(Date.now() / 1000) - 1
		});
		await expect(oauthService.consumeState({ env }, 'apple', state)).rejects.toThrow(/state/i);
	});

	it('rejects forged state values', async () => {
		await expect(oauthService.consumeState({ env }, 'apple', 'd'.repeat(64))).rejects.toThrow(/state/i);
	});
});

describe('OAuth login exchange code', () => {
	beforeEach(() => {
		vi.spyOn(settingService, 'query').mockResolvedValue({
			oauthLoginEnabled: 1,
			oauthProviders: {
				apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 }
			}
		});
	});

	async function issueCode(marker = 'code') {
		return oauthService.createLoginExchangeCode({ env }, {
			token: `session-jwt-${marker}`,
			userInfo: { oauthUserId: 'apple:exchange-user' },
			provider: 'apple'
		});
	}

	it('lets exactly one of 8 concurrent consumers win at the service layer', async () => {
		const code = await issueCode('concurrent');
		const results = await Promise.all(Array.from({ length: 8 }, () =>
			oauthService.consumeLoginExchangeCode({ env }, code)
				.then(row => ({ ok: true, row }))
				.catch(() => ({ ok: false }))
		));
		expect(counts(results).successes).toBe(1);
		const winner = results.find(r => r.ok);
		expect(winner.row.token).toBe('session-jwt-concurrent');
	});

	it('serves exactly one HTTP exchange out of 8 concurrent requests', async () => {
		const code = await issueCode('http');
		const responses = await Promise.all(Array.from({ length: 8 }, () =>
			SELF.fetch('http://example.com/api/oauth/exchange', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			}).then(async response => ({ status: response.status, body: await response.json() }))
		));

		const okResponses = responses.filter(r => r.body.code === 200);
		expect(okResponses.length).toBe(1);
		expect(okResponses[0].body.data.token).toBe('session-jwt-http');
		expect(responses.filter(r => r.body.code === 401).length).toBe(7);
	});

	it('rejects sequential replay, expired codes and forged codes over HTTP', async () => {
		const code = await issueCode('replay');
		const first = await SELF.fetch('http://example.com/api/oauth/exchange', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code })
		});
		expect((await first.json()).code).toBe(200);
		const replay = await SELF.fetch('http://example.com/api/oauth/exchange', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code })
		});
		expect((await replay.json()).code).toBe(401);

		await seedOtc(env.db, {
			purpose: OTC_PURPOSE.LOGIN_CODE,
			token: 'expired-http-code-0123456789',
			payload: { token: 'jwt', createdAt: Date.now() - 120000 },
			expiresAt: Math.floor(Date.now() / 1000) - 1
		});
		const expired = await SELF.fetch('http://example.com/api/oauth/exchange', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: 'expired-http-code-0123456789' })
		});
		expect((await expired.json()).code).toBe(401);

		const forged = await SELF.fetch('http://example.com/api/oauth/exchange', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code: 'e'.repeat(64) })
		});
		expect((await forged.json()).code).toBe(401);
	});
});

describe('OAuth bind proof', () => {
	async function seedBindIdentity(oauthUserId = 'apple:bind-target') {
		await env.db.prepare('DELETE FROM oauth').run();
		await env.db.prepare('INSERT INTO oauth (oauth_user_id, username, name, user_id) VALUES (?, ?, ?, ?)')
			.bind(oauthUserId, 'bind-target', 'Bind Target', 0).run();
	}

	function bindContext(extra = {}) {
		return {
			env: {
				db: env.db,
				kv: env.kv,
				jwt_secret: 'test-jwt-secret-for-unit-tests',
				domain: ['example.com'],
				admin: 'admin@example.com',
				...extra
			},
			req: { url: 'https://mail.example.com/api/oauth/bindUser', header: () => null }
		};
	}

	beforeEach(() => {
		vi.spyOn(settingService, 'query').mockResolvedValue({
			oauthLoginEnabled: 1,
			oauthProviders: {
				apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 }
			}
		});
		vi.spyOn(loginService, 'validateRegistration').mockResolvedValue({});
		vi.spyOn(loginService, 'register').mockResolvedValue({
			userId: 5,
			email: 'bind@example.com',
			reservedRegKey: false
		});
		vi.spyOn(loginService, 'login').mockResolvedValue('bound-session-jwt');
		vi.spyOn(userService, 'selectByIdIncludeDel').mockResolvedValue(null);
		vi.spyOn(userService, 'selectByEmail').mockResolvedValue({ userId: 5, email: 'bind@example.com' });
	});

	it('lets exactly one of 8 concurrent binds succeed and registers one account', async () => {
		await seedBindIdentity();
		const bindToken = await oauthService.createBindProof({ env }, {
			oauthUserId: 'apple:bind-target',
			provider: 'apple'
		});
		const c = bindContext();

		const results = await Promise.all(Array.from({ length: 8 }, () =>
			oauthService.bindUser(c, {
				email: 'bind@example.com',
				oauthUserId: 'apple:bind-target',
				code: 'invite',
				bindToken,
				provider: 'apple'
			}).then(result => ({ ok: true, result })).catch(() => ({ ok: false }))
		));

		// Late arrivals may observe the committed association and receive the
		// idempotent `alreadyBound` answer. Exactly one request may receive a
		// session token, and only one account may be created.
		expect(results.filter(r => r?.ok && r.result?.token)).toHaveLength(1);
		expect(results.filter(r => r?.ok && r.result?.alreadyBound).length)
			.toBe(results.filter(r => r?.ok).length - 1);
		expect(loginService.register).toHaveBeenCalledTimes(1);

		const row = await env.db.prepare('SELECT user_id FROM oauth WHERE oauth_user_id = ?')
			.bind('apple:bind-target').first();
		expect(row.user_id).toBe(5);

		const claims = await env.db.prepare('SELECT count(*) AS count FROM oauth_bind_claim').first();
		expect(Number(claims.count)).toBe(0);
	});

	it('does not burn the proof on an identity mismatch', async () => {
		await seedBindIdentity();
		const bindToken = await oauthService.createBindProof({ env }, {
			oauthUserId: 'apple:bind-target',
			provider: 'apple'
		});
		const c = bindContext();

		await expect(oauthService.bindUser(c, {
			email: 'attacker@example.com',
			oauthUserId: 'apple:other-identity',
			code: 'invite',
			bindToken,
			provider: 'apple'
		})).rejects.toThrow(/bind proof/i);

		const result = await oauthService.bindUser(c, {
			email: 'bind@example.com',
			oauthUserId: 'apple:bind-target',
			code: 'invite',
			bindToken,
			provider: 'apple'
		});
		expect(result.token).toBe('bound-session-jwt');
	});

	it('does not burn the proof on a provider mismatch, and still requires the right provider later', async () => {
		await seedBindIdentity();
		const bindToken = await oauthService.createBindProof({ env }, {
			oauthUserId: 'apple:bind-target',
			provider: 'apple'
		});
		const c = bindContext();

		await expect(oauthService.bindUser(c, {
			email: 'bind@example.com',
			oauthUserId: 'apple:bind-target',
			code: 'invite',
			bindToken,
			provider: 'github'
		})).rejects.toThrow(/bind proof/i);

		const result = await oauthService.bindUser(c, {
			email: 'bind@example.com',
			oauthUserId: 'apple:bind-target',
			code: 'invite',
			bindToken,
			provider: 'apple'
		});
		expect(result.token).toBe('bound-session-jwt');
	});

	it('consumes the proof before account creation, so a failed registration requires a restart', async () => {
		await seedBindIdentity();
		const bindToken = await oauthService.createBindProof({ env }, {
			oauthUserId: 'apple:bind-target',
			provider: 'apple'
		});
		const c = bindContext();
		loginService.register.mockRejectedValueOnce(new Error('database exploded with internal SQL'));

		await expect(oauthService.bindUser(c, {
			email: 'taken@example.com',
			oauthUserId: 'apple:bind-target',
			code: 'invite',
			bindToken,
			provider: 'apple'
		})).rejects.toThrow(/restart the OAuth login flow/);

		// The proof was spent by the winning (but failed) request. This is the
		// deliberate fail-closed trade-off: a consumed credential is never
		// resurrected, even when the failure happened after the CAS.
		await expect(oauthService.bindUser(c, {
			email: 'taken@example.com',
			oauthUserId: 'apple:bind-target',
			code: 'invite',
			bindToken,
			provider: 'apple'
		})).rejects.toThrow(/bind proof/i);

		// The lease must not outlive the failed attempt.
		const claims = await env.db.prepare('SELECT count(*) AS count FROM oauth_bind_claim').first();
		expect(Number(claims.count)).toBe(0);
		expect(loginService.login).not.toHaveBeenCalled();
	});

	it('rejects expired, forged and replayed proofs', async () => {
		await seedBindIdentity();
		const c = bindContext();

		await seedOtc(env.db, {
			purpose: OTC_PURPOSE.BIND,
			token: 'expired-bind-proof-0123456789',
			provider: 'apple',
			oauthUserId: 'apple:bind-target',
			payload: { oauthUserId: 'apple:bind-target', provider: 'apple', createdAt: Date.now() - 900000 },
			expiresAt: Math.floor(Date.now() / 1000) - 1
		});
		await expect(oauthService.bindUser(c, {
			email: 'bind@example.com',
			oauthUserId: 'apple:bind-target',
			code: 'invite',
			bindToken: 'expired-bind-proof-0123456789',
			provider: 'apple'
		})).rejects.toThrow(/bind proof/i);

		await expect(oauthService.bindUser(c, {
			email: 'bind@example.com',
			oauthUserId: 'apple:bind-target',
			code: 'invite',
			bindToken: 'a'.repeat(64),
			provider: 'apple'
		})).rejects.toThrow(/bind proof/i);

		const bindToken = await oauthService.createBindProof({ env }, {
			oauthUserId: 'apple:bind-target',
			provider: 'apple'
		});
		const first = await oauthService.bindUser(c, {
			email: 'bind@example.com',
			oauthUserId: 'apple:bind-target',
			code: 'invite',
			bindToken,
			provider: 'apple'
		});
		expect(first.token).toBe('bound-session-jwt');

		// A replay is answered with the committed state, never with a session.
		const replay = await oauthService.bindUser(c, {
			email: 'bind@example.com',
			oauthUserId: 'apple:bind-target',
			code: 'invite',
			bindToken,
			provider: 'apple'
		});
		expect(replay).toMatchObject({ token: null, alreadyBound: true });
	});
});

describe('OAuth callback end-to-end concurrency', () => {
	it('runs the provider exchange exactly once for 8 simultaneous callbacks sharing a state', async () => {
		const { pair, jwk } = await createSigningMaterial('atomicity-callback-kid');
		await env.kv.put('apple_jwks_v1', JSON.stringify({ keys: [jwk] }), { expirationTtl: 3600 });
		vi.spyOn(settingService, 'query').mockResolvedValue({
			oauthLoginEnabled: 1,
			oauthProviders: {
				apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 }
			}
		});
		vi.spyOn(userService, 'selectByEmail').mockResolvedValue(null);

		const redirectUri = 'http://example.com/api/oauth/callback/apple';
		const authorize = await SELF.fetch(
			`http://example.com/api/oauth/authorize/apple?redirect_uri=${encodeURIComponent(redirectUri)}&state=conc-client-state`
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
			{ alg: 'RS256', kid: 'atomicity-callback-kid' },
			{
				iss: 'https://appleid.apple.com',
				aud: 'test-client-id',
				sub: 'conc-user',
				exp: Math.floor(Date.now() / 1000) + 300,
				nonce,
				email: 'conc@example.com',
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
			throw new Error(`Unexpected outbound fetch: ${url}`);
		});
		vi.stubGlobal('fetch', tokenFetch);

		const callbacks = await Promise.all(Array.from({ length: 8 }, () =>
			SELF.fetch(
				`http://example.com/api/oauth/callback/apple?code=conc-code&state=${encodeURIComponent(state)}`,
				{ redirect: 'manual' }
			)
		));
		const locations = callbacks.map(response => response.headers.get('Location') || '');

		expect(locations.filter(location => location.includes('oauth_bind=')).length).toBe(1);
		expect(locations.filter(location => location.includes('oauth_state_invalid')).length).toBe(7);
		expect(tokenFetch).toHaveBeenCalledTimes(1);
		expect(await countOtc(env.db, OTC_PURPOSE.BIND)).toBe(1);

		const bindLocation = new URL(locations.find(location => location.includes('oauth_bind=')), 'http://example.com');
		expect(bindLocation.searchParams.get('oauth_user_id')).toBe('apple:conc-user');
		expect(bindLocation.searchParams.get('oauth_client_state')).toBe('conc-client-state');

		await env.db.prepare('DELETE FROM oauth WHERE oauth_user_id = ?').bind('apple:conc-user').run();
	});

	it('burns the state when the provider exchange fails, and creates no session', async () => {
		const { jwk } = await createSigningMaterial('atomicity-failure-kid');
		await env.kv.put('apple_jwks_v1', JSON.stringify({ keys: [jwk] }), { expirationTtl: 3600 });
		vi.spyOn(settingService, 'query').mockResolvedValue({
			oauthLoginEnabled: 1,
			oauthProviders: {
				apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 }
			}
		});

		const redirectUri = 'http://example.com/api/oauth/callback/apple';
		const authorize = await SELF.fetch(
			`http://example.com/api/oauth/authorize/apple?redirect_uri=${encodeURIComponent(redirectUri)}&state=atomicity-failure-client-state`
		);
		const authorizeBody = await authorize.json();
		const state = new URL(authorizeBody.data.url).searchParams.get('state');
		expect(state).toBeTruthy();

		vi.stubGlobal('fetch', vi.fn(async () => {
			throw new Error('provider unreachable');
		}));

		const callback = await SELF.fetch(
			`http://example.com/api/oauth/callback/apple?code=fail-code&state=${encodeURIComponent(state)}`,
			{ redirect: 'manual' }
		);
		const location = callback.headers.get('Location') || '';
		expect(location).toContain('oauth_failed');
		expect(location).not.toContain('oauth_code=');
		expect(location).not.toContain('oauth_bind=');

		// Fail-closed: the one-time state is spent, so the callback cannot be
		// replayed after the provider failure. No login code or bind proof was
		// minted, so no session exists to leak.
		const replay = await SELF.fetch(
			`http://example.com/api/oauth/callback/apple?code=fail-code&state=${encodeURIComponent(state)}`,
			{ redirect: 'manual' }
		);
		expect(replay.headers.get('Location') || '').toContain('oauth_state_invalid');
		expect(await countOtc(env.db, OTC_PURPOSE.LOGIN_CODE)).toBe(0);
		expect(await countOtc(env.db, OTC_PURPOSE.BIND)).toBe(0);
	});
});

describe('OAuth provider authorization code', () => {
	const CODE = `epo_code_${'a'.repeat(32)}`;

	function tokenContext() {
		return {
			env,
			req: { url: 'https://mail.example.com/api/oauth/token', header: () => null }
		};
	}

	beforeEach(async () => {
		vi.spyOn(oauthAppService, 'getByClientId').mockResolvedValue({
			id: 1,
			name: 'Atomicity App',
			clientId: 'client-1',
			clientSecret: 'secret-1',
			status: 1,
			redirectUris: JSON.stringify(['https://app.example/cb']),
			scopes: 'openid profile email'
		});
		vi.spyOn(userService, 'selectById').mockResolvedValue({
			userId: 7,
			email: 'provider@example.com',
			name: 'Provider User',
			status: 0,
			avatar: ''
		});
		await seedOtc(env.db, {
			purpose: OTC_PURPOSE.AUTHORIZATION_CODE,
			token: CODE,
			provider: 'client-1',
			oauthUserId: '7',
			payload: {
				userId: 7,
				userEmail: 'provider@example.com',
				clientId: 'client-1',
				redirectUri: 'https://app.example/cb',
				scopes: 'openid profile email',
				codeChallenge: '',
				codeChallengeMethod: 'S256',
				createdAt: Date.now()
			}
		});
	});

	it('lets exactly one of 8 concurrent token requests exchange the code', async () => {
		const c = tokenContext();
		const results = await Promise.all(Array.from({ length: 8 }, () =>
			oauthProviderService.token(c, {
				grant_type: 'authorization_code',
				code: CODE,
				client_id: 'client-1',
				client_secret: 'secret-1',
				redirect_uri: 'https://app.example/cb'
			}).then(result => ({ ok: true, result })).catch(() => ({ ok: false }))
		));

		expect(counts(results).successes).toBe(1);
		expect(counts(results).failures).toBe(7);
		const winner = results.find(r => r.ok);
		expect(winner.result.access_token).toBeTruthy();
		expect(winner.result.id_token).toBeTruthy();
	});

	it('rejects a replayed and an expired authorization code', async () => {
		const c = tokenContext();
		const body = {
			grant_type: 'authorization_code',
			code: CODE,
			client_id: 'client-1',
			client_secret: 'secret-1',
			redirect_uri: 'https://app.example/cb'
		};
		await oauthProviderService.token(c, body);
		await expect(oauthProviderService.token(c, body)).rejects.toThrow(/invalid_grant/);

		await seedOtc(env.db, {
			purpose: OTC_PURPOSE.AUTHORIZATION_CODE,
			token: `epo_code_${'b'.repeat(32)}`,
			provider: 'client-1',
			oauthUserId: '7',
			payload: { userId: 7, clientId: 'client-1', redirectUri: 'https://app.example/cb', scopes: 'openid email' },
			expiresAt: Math.floor(Date.now() / 1000) - 1
		});
		await expect(oauthProviderService.token(c, {
			...body,
			code: `epo_code_${'b'.repeat(32)}`
		})).rejects.toThrow(/invalid_grant/);
	});
});

describe('Schema migration', () => {
	it('v3_19DB is idempotent and creates the expected columns', async () => {
		await dbInit.v3_19DB({ env });
		await dbInit.v3_19DB({ env });

		const info = await env.db.prepare(`PRAGMA table_info('oauth_one_time_credential')`).all();
		const names = info.results.map(row => row.name);
		expect(names).toEqual(expect.arrayContaining([
			'token_hash', 'purpose', 'provider', 'oauth_user_id', 'payload', 'consumed', 'expires_at'
		]));
	});

	it('intDB bootstraps the credential table on a cold start and is repeatable', async () => {
		await dbInit.intDB({ env });
		await dbInit.intDB({ env });
		const row = await env.db.prepare(
			`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'oauth_one_time_credential'`
		).first();
		expect(row?.name).toBe('oauth_one_time_credential');
	});
});
