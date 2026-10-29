/**
 * B3 — OAuth bind recovery, atomicity and idempotency.
 *
 * The bind flow must satisfy two apparently conflicting requirements:
 *   - a rejected registration (wrong invite code, closed registration,
 *     duplicate email) must be correctable without a new OAuth round trip,
 *   - a single-use proof must never become reusable.
 *
 * The tests below drive the real service against the real D1 credential and
 * lease tables. Registration policy is evaluated by the real shared validator;
 * only the account-writing services are mocked, so ordering (preflight before
 * consumption) is what is actually being measured.
 */
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import oauthService from '../src/service/oauth-service.js';
import loginService from '../src/service/login-service.js';
import settingService from '../src/service/setting-service.js';
import accountService from '../src/service/account-service.js';
import roleService from '../src/service/role-service.js';
import regKeyService from '../src/service/reg-key-service.js';
import userService from '../src/service/user-service.js';
import emailService from '../src/service/email-service.js';
import oneTimeCredential, { OTC_PURPOSE } from '../src/utils/one-time-credential.js';
import oauthBindClaim from '../src/utils/oauth-bind-claim.js';
import { dbInit } from '../src/init/init.js';
import { t } from '../src/i18n/i18n.js';
import {
	ensureOtcTable,
	seedOtc,
	clearOtc,
	clearBindClaim,
	sha256Hex
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

const IDENTITY = 'apple:bind-target';
const PROVIDER = 'apple';
const GOOD_CODE = 'GOOD-CODE';
const BAD_CODE = 'BAD-CODE';

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

let settings;

function context(overrides = {}) {
	return {
		env: {
			db: env.db,
			kv: createMockKv(),
			jwt_secret: 'b3-unit-test-secret',
			domain: ['example.com'],
			admin: 'admin@example.com',
			...overrides
		},
		req: { url: 'https://mail.example.com/api/oauth/bindUser', header: () => null }
	};
}

function applyPolicyMocks({ mockRegister = true } = {}) {
	settings = {
		register: 0,
		regKey: 0,
		registerVerify: 1,
		regVerifyCount: 5,
		minEmailPrefix: 1,
		emailPrefixFilter: []
	};

	vi.spyOn(settingService, 'query').mockImplementation(async () => ({ ...settings }));
	vi.spyOn(regKeyService, 'selectByCode').mockImplementation(async (_c, code) => {
		if (code === GOOD_CODE) {
			return { regKeyId: 1, code, count: 1, roleId: 3, expireTime: '2099-01-01 00:00:00' };
		}
		if (code === 'EMPTY-CODE') {
			return { regKeyId: 2, code, count: 0, roleId: 3, expireTime: '2099-01-01 00:00:00' };
		}
		if (code === 'OLD-CODE') {
			return { regKeyId: 3, code, count: 1, roleId: 3, expireTime: '2020-01-01 00:00:00' };
		}
		return null;
	});
	vi.spyOn(accountService, 'selectByEmailIncludeDel').mockResolvedValue(null);
	vi.spyOn(accountService, 'selectByNameIncludeDel').mockResolvedValue(null);
	vi.spyOn(roleService, 'selectDefaultRole').mockResolvedValue({ roleId: 3 });
	vi.spyOn(roleService, 'selectById').mockResolvedValue({ roleId: 3, availDomain: '' });
	vi.spyOn(userService, 'selectByEmail').mockResolvedValue(null);
	vi.spyOn(userService, 'selectByIdIncludeDel').mockResolvedValue(null);

	if (mockRegister) {
		vi.spyOn(loginService, 'register').mockImplementation(async (_c, params) => ({
			regVerifyOpen: false,
			userId: 42,
			email: params.email,
			reservedRegKey: params.code === GOOD_CODE
		}));
		vi.spyOn(loginService, 'login').mockResolvedValue({
			token: 'bound-session-jwt',
			email: 'bind@example.com',
			userId: 42
		});
	}
}

async function seedIdentity(oauthUserId = IDENTITY, userId = 0) {
	await env.db.prepare('DELETE FROM oauth').run();
	await env.db.prepare('INSERT INTO oauth (oauth_user_id, username, name, user_id) VALUES (?, ?, ?, ?)')
		.bind(oauthUserId, 'bind-target', 'Bind Target', userId).run();
}

async function createProof(oauthUserId = IDENTITY, provider = PROVIDER) {
	return await oauthService.createBindProof({ env }, { oauthUserId, provider });
}

async function proofRow(token) {
	const hash = await sha256Hex(token);
	return await env.db.prepare(
		'SELECT consumed, expires_at FROM oauth_one_time_credential WHERE token_hash = ?'
	).bind(hash).first();
}

async function wasConsumed(token) {
	const row = await proofRow(token);
	return Number(row?.consumed) === 1;
}

async function oauthAssociations(oauthUserId = IDENTITY) {
	const { results } = await env.db.prepare(
		'SELECT user_id FROM oauth WHERE oauth_user_id = ?'
	).bind(oauthUserId).all();
	return results;
}

async function claimCount() {
	const row = await env.db.prepare('SELECT count(*) AS count FROM oauth_bind_claim').first();
	return Number(row.count);
}

function bindParams(token, overrides = {}) {
	return {
		email: 'bind@example.com',
		oauthUserId: IDENTITY,
		code: GOOD_CODE,
		bindToken: token,
		provider: PROVIDER,
		...overrides
	};
}

beforeAll(async () => {
	await env.db.prepare(CREATE_OAUTH).run();
	await ensureOtcTable(env.db);
	// Also exercises the migration twice: it must be idempotent.
	await dbInit.v3_20DB({ env });
	await dbInit.v3_20DB({ env });
});

beforeEach(async () => {
	await env.db.prepare('DELETE FROM oauth').run();
	await clearOtc(env.db);
	await clearBindClaim(env.db);
	applyPolicyMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

afterAll(async () => {
	await env.db.prepare('DELETE FROM oauth').run();
	await clearOtc(env.db);
	await clearBindClaim(env.db);
	await env.db.prepare('DROP TABLE IF EXISTS oauth_bind_claim').run();
	await env.db.prepare('DROP TABLE IF EXISTS oauth').run();
	await env.db.prepare('DROP TABLE IF EXISTS oauth_one_time_credential').run();
});

describe('OAuth bind: recoverable rejections never spend the proof', () => {
	it('binds successfully and creates exactly one association', async () => {
		await seedIdentity();
		const token = await createProof();
		const c = context();

		const result = await oauthService.bindUser(c, bindParams(token));

		expect(result.token).toBe('bound-session-jwt');
		expect(await wasConsumed(token)).toBe(true);
		expect(await claimCount()).toBe(0);

		const associations = await oauthAssociations();
		expect(associations).toHaveLength(1);
		expect(associations[0].user_id).toBe(42);
		expect(loginService.register).toHaveBeenCalledTimes(1);
		expect(loginService.login).toHaveBeenCalledTimes(1);
	});

	it('keeps the proof alive after a wrong invite code and accepts a corrected retry', async () => {
		await seedIdentity();
		const token = await createProof();
		const c = context();

		await expect(oauthService.bindUser(c, bindParams(token, { code: BAD_CODE })))
			.rejects.toMatchObject({ code: 400 });

		// Nothing was consumed and no account was created.
		expect(await wasConsumed(token)).toBe(false);
		expect(loginService.register).not.toHaveBeenCalled();
		expect(await claimCount()).toBe(0);
		expect(await oauthAssociations()).toEqual([{ user_id: 0 }]);

		// The same proof, same identity, corrected code.
		const result = await oauthService.bindUser(c, bindParams(token));
		expect(result.token).toBe('bound-session-jwt');
		expect(await wasConsumed(token)).toBe(true);
	});

	it('keeps the proof alive when registration is closed, and never bypasses the policy', async () => {
		await seedIdentity();
		const token = await createProof();
		const c = context();

		settings.register = 1;
		await expect(oauthService.bindUser(c, bindParams(token)))
			.rejects.toMatchObject({ code: 400 });
		expect(await wasConsumed(token)).toBe(false);
		expect(loginService.register).not.toHaveBeenCalled();

		settings.register = 0;
		const result = await oauthService.bindUser(c, bindParams(token));
		expect(result.token).toBe('bound-session-jwt');
	});

	it('keeps the proof alive when the target email is already registered', async () => {
		await seedIdentity();
		const token = await createProof();
		const c = context();

		accountService.selectByEmailIncludeDel.mockResolvedValue({ userId: 7, isDel: 0 });

		await expect(oauthService.bindUser(c, bindParams(token, { email: 'taken@example.com' })))
			.rejects.toMatchObject({ code: 400 });
		expect(await wasConsumed(token)).toBe(false);
		expect(loginService.register).not.toHaveBeenCalled();

		// Correcting the address with the same proof succeeds.
		accountService.selectByEmailIncludeDel.mockResolvedValue(null);
		const result = await oauthService.bindUser(c, bindParams(token, { email: 'fresh@example.com' }));
		expect(result.token).toBe('bound-session-jwt');
	});

	it('rejects an expired proof without creating a lease or an account', async () => {
		await seedIdentity();
		await seedOtc(env.db, {
			purpose: OTC_PURPOSE.BIND,
			token: 'expired-bind-proof-0123456789',
			provider: PROVIDER,
			oauthUserId: IDENTITY,
			payload: { oauthUserId: IDENTITY, provider: PROVIDER, createdAt: Date.now() - 900000 },
			expiresAt: Math.floor(Date.now() / 1000) - 1
		});

		await expect(oauthService.bindUser(
			context(),
			bindParams('expired-bind-proof-0123456789')
		)).rejects.toMatchObject({ code: 410 });

		expect(await claimCount()).toBe(0);
		expect(loginService.register).not.toHaveBeenCalled();
	});

	it('rejects a proof issued for another identity or provider without burning it', async () => {
		await seedIdentity();
		const c = context();

		const otherIdentityProof = await createProof('apple:someone-else', PROVIDER);
		await expect(oauthService.bindUser(c, bindParams(otherIdentityProof, {
			oauthUserId: IDENTITY
		}))).rejects.toMatchObject({ code: 410 });
		expect(await wasConsumed(otherIdentityProof)).toBe(false);

		const otherProviderProof = await createProof(IDENTITY, 'github');
		await expect(oauthService.bindUser(c, bindParams(otherProviderProof, {
			provider: PROVIDER
		}))).rejects.toMatchObject({ code: 410 });
		expect(await wasConsumed(otherProviderProof)).toBe(false);

		// The legitimate proof is still spendable.
		const legitimate = await createProof();
		const result = await oauthService.bindUser(c, bindParams(legitimate));
		expect(result.token).toBe('bound-session-jwt');
	});
});

describe('OAuth bind: idempotent final-state confirmation', () => {
	it('answers a duplicate submit after success with alreadyBound and no session', async () => {
		await seedIdentity();
		const token = await createProof();
		const c = context();

		const first = await oauthService.bindUser(c, bindParams(token));
		expect(first.token).toBe('bound-session-jwt');

		// Simulates a client that never saw the first response (network
		// timeout) and re-submits the same request.
		const replay = await oauthService.bindUser(c, bindParams(token));
		expect(replay).toMatchObject({ token: null, alreadyBound: true });

		expect(loginService.register).toHaveBeenCalledTimes(1);
		expect(loginService.login).toHaveBeenCalledTimes(1);
		expect(await oauthAssociations()).toEqual([{ user_id: 42 }]);
	});

	it('reports an already bound identity without consuming a fresh proof or adding an association', async () => {
		await seedIdentity(IDENTITY, 9);
		const token = await createProof();
		const c = context();

		const result = await oauthService.bindUser(c, bindParams(token, { email: 'other@example.com' }));

		expect(result).toMatchObject({ token: null, alreadyBound: true });
		expect(await wasConsumed(token)).toBe(false);
		expect(loginService.register).not.toHaveBeenCalled();
		expect(await oauthAssociations()).toEqual([{ user_id: 9 }]);
	});

	it('distinguishes an in-flight bind from a failed one', async () => {
		await seedIdentity();
		const token = await createProof();
		const c = context();

		// Simulate a concurrent holder: an active lease plus a spent proof.
		await oauthBindClaim.acquire(c, { oauthUserId: IDENTITY, email: 'bind@example.com' });
		await oneTimeCredential.consume(c, {
			purpose: OTC_PURPOSE.BIND,
			token,
			provider: PROVIDER,
			oauthUserId: IDENTITY
		});

		await expect(oauthService.bindUser(c, bindParams(token)))
			.rejects.toMatchObject({ code: 425 });
		expect(loginService.register).not.toHaveBeenCalled();

		// Once the lease expires, the same spent proof is a definitive failure:
		// the client must restart, never replay.
		await env.db.prepare('UPDATE oauth_bind_claim SET expires_at = ? WHERE oauth_user_id = ?')
			.bind(Math.floor(Date.now() / 1000) - 1, IDENTITY).run();

		await expect(oauthService.bindUser(c, bindParams(token)))
			.rejects.toMatchObject({ code: 409 });
		expect(loginService.register).not.toHaveBeenCalled();
	});

	it('returns alreadyBound when the association committed but session creation failed', async () => {
		await seedIdentity();
		const token = await createProof();
		const c = context();
		loginService.login.mockRejectedValueOnce(new Error('session store unavailable'));

		const result = await oauthService.bindUser(c, bindParams(token));

		expect(result).toMatchObject({ token: null, alreadyBound: true });
		expect(await oauthAssociations()).toEqual([{ user_id: 42 }]);
		expect(await claimCount()).toBe(0);

		// The retry confirms the durable association without a new session.
		const retry = await oauthService.bindUser(c, bindParams(token));
		expect(retry).toMatchObject({ token: null, alreadyBound: true });
		expect(loginService.register).toHaveBeenCalledTimes(1);
	});

	it('auto-links a verified email only while the identity is unbound', async () => {
		await seedIdentity();
		const c = context();
		userService.selectByEmail.mockResolvedValue({ userId: 9, email: 'bind@example.com' });
		userService.selectByIdIncludeDel.mockResolvedValue({ userId: 9, email: 'bind@example.com' });

		const linked = await oauthService.linkVerifiedEmail(c, IDENTITY, 'bind@example.com');
		expect(linked).toMatchObject({ userId: 9 });
		expect(await oauthAssociations()).toEqual([{ user_id: 9 }]);

		// The conditional UPDATE must not move an existing association to a
		// second account discovered by a later email match. The helper reports
		// the user the identity is actually associated with.
		userService.selectByEmail.mockResolvedValue({ userId: 11, email: 'other@example.com' });
		userService.selectByIdIncludeDel.mockResolvedValue({ userId: 9, email: 'bind@example.com' });
		const second = await oauthService.linkVerifiedEmail(c, IDENTITY, 'other@example.com');
		expect(second?.userId).toBe(9);
		expect(await oauthAssociations()).toEqual([{ user_id: 9 }]);
	});

	it('forwards an MFA challenge after committing the association', async () => {
		await seedIdentity();
		const token = await createProof();
		const c = context();
		loginService.login.mockResolvedValueOnce({
			mfaRequired: true,
			tempToken: 'mfa-temp-token',
			authType: 'totp',
			email: 'bind@example.com'
		});

		const result = await oauthService.bindUser(c, bindParams(token));

		expect(result.token).toBeNull();
		expect(result.mfa).toMatchObject({ mfaRequired: true, tempToken: 'mfa-temp-token' });
		expect(await oauthAssociations()).toEqual([{ user_id: 42 }]);
		expect(await claimCount()).toBe(0);
	});
});

describe('OAuth bind: concurrency and failure compensation', () => {
	it('lets exactly one of 8 concurrent duplicate submits mint a session', async () => {
		await seedIdentity();
		const token = await createProof();
		const c = context();

		const results = await Promise.all(Array.from({ length: 8 }, () =>
			oauthService.bindUser(c, bindParams(token))
				.then(result => ({ ok: true, result }))
				.catch(error => ({ ok: false, error }))
		));

		expect(results.filter(r => r.ok && r.result.token)).toHaveLength(1);
		// Every other resolved request is the idempotent confirmation; every
		// rejected one is a retryable in-flight signal, never a second session.
		for (const outcome of results) {
			if (outcome.ok) {
				if (!outcome.result.token) expect(outcome.result.alreadyBound).toBe(true);
			} else {
				expect([409, 425]).toContain(Number(outcome.error?.code));
			}
		}

		expect(loginService.register).toHaveBeenCalledTimes(1);
		expect(await oauthAssociations()).toEqual([{ user_id: 42 }]);
		expect(await claimCount()).toBe(0);
	});

	it('creates at most one association when two flows for the same identity race', async () => {
		await seedIdentity();
		const tokenA = await createProof();
		const tokenB = await createProof();
		const c = context();

		const [a, b] = await Promise.allSettled([
			oauthService.bindUser(c, bindParams(tokenA, { email: 'first@example.com' })),
			oauthService.bindUser(c, bindParams(tokenB, { email: 'second@example.com' }))
		]);

		const fulfilled = [a, b].filter(r => r.status === 'fulfilled');
		const tokensIssued = fulfilled.filter(r => r.value?.token);
		expect(tokensIssued).toHaveLength(1);

		for (const settled of [a, b]) {
			if (settled.status === 'rejected') {
				expect([409, 425]).toContain(Number(settled.reason?.code));
			} else if (!settled.value.token) {
				expect(settled.value.alreadyBound).toBe(true);
			}
		}

		expect(loginService.register).toHaveBeenCalledTimes(1);
		expect(await oauthAssociations()).toEqual([{ user_id: 42 }]);

		// The losing proof is not burned by a request that never reached the
		// commit point. It becomes useless only because the identity is now
		// bound — and a retry confirms that state without a session.
		const spent = (await wasConsumed(tokenA)) + (await wasConsumed(tokenB));
		expect(spent).toBe(1);
		const loserToken = (await wasConsumed(tokenA)) ? tokenB : tokenA;
		const loser = await oauthService.bindUser(c, bindParams(loserToken));
		expect(loser).toMatchObject({ token: null, alreadyBound: true });
		expect(loginService.register).toHaveBeenCalledTimes(1);
	});

	it('releases the lease and never creates a session when registration fails after consumption', async () => {
		await seedIdentity();
		const token = await createProof();
		const c = context();
		loginService.register.mockRejectedValueOnce(new Error('sqlite: internal failure details'));

		await expect(oauthService.bindUser(c, bindParams(token)))
			.rejects.toMatchObject({ code: 409 });

		expect(await wasConsumed(token)).toBe(true);
		expect(await claimCount()).toBe(0);
		expect(loginService.login).not.toHaveBeenCalled();
		expect(await oauthAssociations()).toEqual([{ user_id: 0 }]);

		// A spent proof is never resurrected.
		await expect(oauthService.bindUser(c, bindParams(token)))
			.rejects.toMatchObject({ code: 409 });
		expect(loginService.register).toHaveBeenCalledTimes(1);
	});

	it('compensates the created account when the atomic association loses a race', async () => {
		await seedIdentity();
		const token = await createProof();
		const c = context();

		vi.spyOn(oauthBindClaim, 'finalize').mockResolvedValueOnce(false);
		const rollback = vi.spyOn(loginService, 'rollbackPartialRegistration').mockResolvedValue();
		vi.spyOn(regKeyService, 'restoreOne').mockResolvedValue();

		await expect(oauthService.bindUser(c, bindParams(token)))
			.rejects.toMatchObject({ code: 409 });

		expect(rollback).toHaveBeenCalledWith(c, 42);
		expect(regKeyService.restoreOne).toHaveBeenCalledWith(c, GOOD_CODE);
		expect(await claimCount()).toBe(0);
		expect(loginService.login).not.toHaveBeenCalled();
		expect(await oauthAssociations()).toEqual([{ user_id: 0 }]);
	});

	it('compensates an abandoned account recorded by an expired lease', async () => {
		await seedIdentity();
		const c = context();
		const stale = await oauthBindClaim.acquire(c, { oauthUserId: IDENTITY, email: 'abandoned@example.com' });
		await oauthBindClaim.recordUser(c, {
			oauthUserId: IDENTITY,
			claimToken: stale.claimToken,
			userId: 77,
			email: 'abandoned@example.com',
			reservedRegKey: true,
			code: GOOD_CODE
		});
		await env.db.prepare('UPDATE oauth_bind_claim SET expires_at = ? WHERE oauth_user_id = ?')
			.bind(Math.floor(Date.now() / 1000) - 1, IDENTITY).run();

		const rollback = vi.spyOn(loginService, 'rollbackPartialRegistration').mockResolvedValue();
		const restore = vi.spyOn(regKeyService, 'restoreOne').mockResolvedValue();

		const token = await createProof();
		const result = await oauthService.bindUser(c, bindParams(token));

		expect(result.token).toBe('bound-session-jwt');
		expect(rollback).toHaveBeenCalledWith(c, 77);
		expect(restore).toHaveBeenCalledWith(c, GOOD_CODE);
		expect(await oauthAssociations()).toEqual([{ user_id: 42 }]);
		expect(await claimCount()).toBe(0);
	});
});

describe('Registration policy preflight (shared validator)', () => {
	const base = { email: 'bind@example.com', password: 'abcdef', code: GOOD_CODE };

	it('rejects a closed registration before any write', async () => {
		settings.register = 1;
		await expect(loginService.validateRegistration(context(), base, true))
			.rejects.toThrow(t('regDisabled'));
	});

	it('enforces the invite-code policy exactly like the write path', async () => {
		await expect(loginService.validateRegistration(
			context(), { ...base, code: '' }, true
		)).rejects.toThrow(t('emptyRegKey'));

		await expect(loginService.validateRegistration(
			context(), { ...base, code: BAD_CODE }, true
		)).rejects.toThrow(t('notExistRegKey'));

		await expect(loginService.validateRegistration(
			context(), { ...base, code: 'EMPTY-CODE' }, true
		)).rejects.toThrow(t('noRegKeyCount'));

		await expect(loginService.validateRegistration(
			context(), { ...base, code: 'OLD-CODE' }, true
		)).rejects.toThrow(t('regKeyExpire'));

		// OPTIONAL mode ignores an unknown code and falls back to the default
		// role, matching register()'s behaviour.
		settings.regKey = 2;
		const optional = await loginService.validateRegistration(
			context(), { ...base, code: BAD_CODE }, true
		);
		expect(optional.type).toBeFalsy();
	});

	it('rejects duplicate addresses, domain mismatches and short prefixes', async () => {
		accountService.selectByEmailIncludeDel.mockResolvedValue({ userId: 7, isDel: 0 });
		await expect(loginService.validateRegistration(context(), base, true))
			.rejects.toThrow(t('isRegAccount'));

		accountService.selectByEmailIncludeDel.mockResolvedValue(null);
		await expect(loginService.validateRegistration(
			context(), { ...base, email: 'bind@other.example' }, true
		)).rejects.toThrow(t('notEmailDomain'));

		settings.minEmailPrefix = 10;
		await expect(loginService.validateRegistration(context(), base, true))
			.rejects.toThrow(t('minEmailPrefix', { msg: 10 }));
	});
});

describe('Register write path after the validator extraction', () => {
	beforeEach(() => {
		// The outer hook installs a register mock for the bind-flow tests.
		// This block exercises the real register(), so only the policy reads
		// and the write-side services are mocked.
		vi.restoreAllMocks();
		applyPolicyMocks({ mockRegister: false });

		vi.spyOn(regKeyService, 'consumeOne').mockResolvedValue(true);
		vi.spyOn(regKeyService, 'restoreOne').mockResolvedValue();
		vi.spyOn(userService, 'insert').mockResolvedValue(42);
		vi.spyOn(accountService, 'insert').mockResolvedValue({ accountId: 9, userId: 42 });
		vi.spyOn(userService, 'updateUserInfo').mockResolvedValue();
		vi.spyOn(accountService, 'selectByEmail').mockResolvedValue(null);
		vi.spyOn(emailService, 'deliverWelcomeEmailToUser').mockResolvedValue();
	});

	it('still consumes the invite atomically and reports the created account for OAuth', async () => {
		const result = await loginService.register(context(), {
			email: 'bind@example.com',
			password: 'abcdef',
			code: GOOD_CODE
		}, true);

		expect(result).toMatchObject({ userId: 42, reservedRegKey: true, regVerifyOpen: false });
		expect(regKeyService.consumeOne).toHaveBeenCalledWith(expect.anything(), GOOD_CODE);
		expect(userService.insert).toHaveBeenCalledTimes(1);
	});

	it('rejects before consuming the invite when registration is closed', async () => {
		settings.register = 1;
		await expect(loginService.register(context(), {
			email: 'bind@example.com',
			password: 'abcdef',
			code: GOOD_CODE
		}, true)).rejects.toThrow(t('regDisabled'));
		expect(regKeyService.consumeOne).not.toHaveBeenCalled();
		expect(userService.insert).not.toHaveBeenCalled();
	});

	it('restores the invite and compensates the partial user row when account creation fails', async () => {
		accountService.insert.mockRejectedValueOnce(new Error('account insert failed'));
		const rollback = vi.spyOn(loginService, 'rollbackPartialRegistration').mockResolvedValue();

		await expect(loginService.register(context(), {
			email: 'bind@example.com',
			password: 'abcdef',
			code: GOOD_CODE
		}, true)).rejects.toThrow(/account insert failed/);

		expect(regKeyService.restoreOne).toHaveBeenCalledWith(expect.anything(), GOOD_CODE);
		expect(rollback).toHaveBeenCalledWith(expect.anything(), 42);
	});
});

describe('OAuth bind claim schema and migration', () => {
	it('creates the lease table and the partial unique identity index idempotently', async () => {
		const columns = await env.db.prepare(`PRAGMA table_info('oauth_bind_claim')`).all();
		expect(columns.results.map(row => row.name)).toEqual(expect.arrayContaining([
			'oauth_user_id', 'claim_token', 'email', 'user_id', 'reserved_reg_key', 'code', 'expires_at'
		]));

		const index = await env.db.prepare(
			`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_oauth_user_id_unique'`
		).first();
		expect(index?.name).toBe('idx_oauth_user_id_unique');
	});

	it('rejects a second row for the same OAuth identity', async () => {
		await seedIdentity();
		await expect(env.db.prepare(
			`INSERT INTO oauth (oauth_user_id, username, name, user_id) VALUES (?, ?, ?, 0)`
		).bind(IDENTITY, 'duplicate', 'Duplicate').run()).rejects.toThrow();
		expect(await oauthAssociations()).toHaveLength(1);
	});

	it('skips the unique index instead of rewriting legacy duplicates', async () => {
		await env.db.prepare('DROP INDEX IF EXISTS idx_oauth_user_id_unique').run();
		await env.db.prepare('DELETE FROM oauth').run();
		for (const name of ['one', 'two']) {
			await env.db.prepare(
				`INSERT INTO oauth (oauth_user_id, username, name, user_id) VALUES (?, ?, ?, 0)`
			).bind(IDENTITY, name, name).run();
		}

		await dbInit.v3_20DB({ env });

		const skipped = await env.db.prepare(
			`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_oauth_user_id_unique'`
		).first();
		expect(skipped).toBeNull();

		// Clean up the synthetic legacy rows and let the migration restore the
		// index for the rest of the suite.
		await env.db.prepare('DELETE FROM oauth').run();
		await dbInit.v3_20DB({ env });
		const restored = await env.db.prepare(
			`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_oauth_user_id_unique'`
		).first();
		expect(restored?.name).toBe('idx_oauth_user_id_unique');
	});
});
