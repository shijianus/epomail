import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import authSecurityOperation, {
	AUTH_SECURITY_OPERATION_SCHEMA,
	ensureAuthSecurityOperationSchema,
	issue,
	inspect,
	incrementAttempt,
	consume,
	bumpAuthVersionExpected,
	consumeTotpStep
} from '../src/utils/auth-security-operation.js';
import { hashToken } from '../src/utils/one-time-credential.js';

beforeAll(async () => {
	// Only the real identity columns this module uses; no app/API dependencies.
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS user (
		user_id INTEGER PRIMARY KEY AUTOINCREMENT,
		email TEXT NOT NULL,
		password TEXT NOT NULL,
		salt TEXT NOT NULL,
		auth_version INTEGER NOT NULL DEFAULT 0,
		is_del INTEGER NOT NULL DEFAULT 0
	)`).run();
	await ensureAuthSecurityOperationSchema({ env });
});

// Every data-writing case physically removes its own rows, even on assertion
// failure. allSettled waits for all contenders before the finally cleanup runs.
async function fixture(run) {
	const users = [];
	try {
		for (let i = 0; i < 2; i++) {
			const row = await env.db.prepare(`
				INSERT INTO user (email, password, salt) VALUES (?, ?, ?) RETURNING user_id
			`).bind(`auth-operation-${crypto.randomUUID()}@example.test`, 'test-only-unusable', 'test-only').first();
			users.push(Number(row.user_id));
		}
		const options = {
			userId: users[0],
			target: 'totp',
			sessionHash: await hashToken(`test-session-${crypto.randomUUID()}`),
			authVersion: 0,
			purpose: 'totp_disable'
		};
		await run({ c: { env }, options, userId: users[0], otherUserId: users[1] });
	} finally {
		for (const userId of users) {
			await env.db.batch([
				env.db.prepare('DELETE FROM auth_security_operation WHERE user_id = ?').bind(userId),
				env.db.prepare('DELETE FROM auth_totp_replay WHERE user_id = ?').bind(userId),
				env.db.prepare('DELETE FROM user WHERE user_id = ?').bind(userId)
			]);
			for (const table of ['auth_security_operation', 'auth_totp_replay', 'user']) {
				const row = await env.db.prepare(`SELECT count(*) AS count FROM ${table} WHERE user_id = ?`).bind(userId).first();
				expect(Number(row.count)).toBe(0);
			}
		}
	}
}

async function race(count, task) {
	const results = await Promise.allSettled(Array.from({ length: count }, task));
	const rejected = results.find(result => result.status === 'rejected');
	if (rejected) throw rejected.reason;
	return results.map(result => result.value);
}

async function mint(c, options, extra = {}) {
	const token = await issue(c, { ...options, ttlSeconds: 60, ...extra });
	return { ...options, token };
}

describe('D1 security operation primitives', () => {
	it('exports idempotent schema and supports USER_DB routing and raw D1 bindings', async () => {
		expect(AUTH_SECURITY_OPERATION_SCHEMA).toHaveLength(6);
		expect(AUTH_SECURITY_OPERATION_SCHEMA.some(sql => sql.includes('rate_limit_counter'))).toBe(true);
		expect(authSecurityOperation.ensureSchema).toBe(ensureAuthSecurityOperationSchema);
		await ensureAuthSecurityOperationSchema(env.db);
		await fixture(async ({ options }) => {
			const c = { env: { USER_DB: env.db, db: { prepare() { throw new Error('Wrong database'); } } } };
			await ensureAuthSecurityOperationSchema(c);
			const proof = await mint(c, options);
			expect(await consume(c, proof)).toMatchObject({ userId: options.userId, consumed: true });
		});
	});

	it('stores only a SHA-256 token digest and round-trips all bindings and payload', async () => {
		await fixture(async ({ c, options }) => {
			const payload = { keyId: 'key-test', nested: { enabled: true } };
			const proof = await mint(c, options, { payload });
			expect(proof.token).toMatch(/^[a-f0-9]{64}$/);
			const row = await env.db.prepare('SELECT * FROM auth_security_operation WHERE user_id = ?').bind(options.userId).first();
			expect(row.token_hash).toBe(await hashToken(proof.token));
			expect(JSON.stringify(row)).not.toContain(proof.token);
			const before = await inspect(c, proof);
			expect(before).toMatchObject({ ...options, payload, attempts: 0, maxAttempts: 5, consumed: false, expired: false });
			expect(before.expiry).toBeGreaterThan(Math.floor(Date.now() / 1000));
			expect(await inspect(c, proof)).toEqual(before);
		});
	});

	it('allows exactly one of 32 simultaneous consumers and rejects sequential replay', async () => {
		await fixture(async ({ c, options }) => {
			const proof = await mint(c, options);
			const results = await race(32, () => consume(c, proof));
			expect(results.filter(Boolean)).toHaveLength(1);
			expect(await consume(c, proof)).toBeNull();
			expect(await inspect(c, proof)).toMatchObject({ consumed: true });
			expect(await incrementAttempt(c, proof)).toBeNull();
		});
	});

	it('mismatched bindings never inspect, increment or burn the legitimate token', async () => {
		await fixture(async ({ c, options, otherUserId }) => {
			const proof = await mint(c, options);
			const variants = [
				{ userId: otherUserId },
				{ target: 'another-key' },
				{ sessionHash: await hashToken('another-test-session') },
				{ authVersion: 1 },
				{ purpose: 'totp_setup' },
				{ token: '0'.repeat(64) },
				{ token: 'not-a-token' }
			];
			for (const variant of variants) {
				const wrong = { ...proof, ...variant };
				expect(await inspect(c, wrong)).toBeNull();
				expect(await incrementAttempt(c, wrong)).toBeNull();
				expect(await consume(c, wrong)).toBeNull();
			}
			expect(await inspect(c, proof)).toMatchObject({ attempts: 0, consumed: false });
			expect(await consume(c, proof)).not.toBeNull();
		});
	});

	it('reserves attempts atomically with no lost updates or caller-raised limit', async () => {
		await fixture(async ({ c, options }) => {
			const proof = await mint(c, options, { maxAttempts: 5 });
			const results = await race(32, () => incrementAttempt(c, { ...proof, maxAttempts: 100 }));
			expect(results.filter(value => value !== null).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
			expect(await inspect(c, proof)).toMatchObject({ attempts: 5, maxAttempts: 5, consumed: false });
			expect(await incrementAttempt(c, proof)).toBeNull();
			expect(await consume(c, proof)).toBeNull();
			expect(await consume(c, { ...proof, attempt: 4 })).toBeNull();
			const winners = await race(16, () => consume(c, { ...proof, attempt: 5 }));
			expect(winners.filter(Boolean)).toHaveLength(1);
		});
	});

	it('supersedes older attempts but allows the reserved final attempt to succeed', async () => {
		await fixture(async ({ c, options }) => {
			const proof = await mint(c, options, { maxAttempts: 2 });
			expect(await incrementAttempt(c, proof)).toBe(1);
			expect(await incrementAttempt(c, proof)).toBe(2);
			expect(await consume(c, { ...proof, attempt: 1 })).toBeNull();
			expect(await consume(c, { ...proof, attempt: 2 })).toMatchObject({ consumed: true, attempts: 2 });
		});
	});

	it('expires at the database-clock boundary, retaining read-only lifecycle state', async () => {
		await fixture(async ({ c, options }) => {
			const proof = await mint(c, options);
			await env.db.prepare('UPDATE auth_security_operation SET expires_at = unixepoch() WHERE user_id = ?').bind(options.userId).run();
			expect(await inspect(c, proof)).toMatchObject({ expired: true, consumed: false });
			expect(await incrementAttempt(c, proof)).toBeNull();
			expect(await consume(c, proof)).toBeNull();
		});
	});

	it('CAS bumps authVersion once and invalidates all old session operations', async () => {
		await fixture(async ({ c, options }) => {
			const proof = await mint(c, options);
			const attempt = await incrementAttempt(c, proof);
			const versions = await race(32, () => bumpAuthVersionExpected(c, { userId: options.userId, expectedAuthVersion: 0 }));
			expect(versions.filter(value => value !== null)).toEqual([1]);
			expect(await inspect(c, proof)).toBeNull();
			expect(await incrementAttempt(c, proof)).toBeNull();
			expect(await consume(c, { ...proof, attempt })).toBeNull();
			await expect(mint(c, options)).rejects.toMatchObject({ code: 409 });
			const current = await mint(c, { ...options, authVersion: 1 });
			expect(await consume(c, current)).toMatchObject({ authVersion: 1 });
		});
	});

	it('does not issue, consume or bump versions for a deleted or absent account', async () => {
		await fixture(async ({ c, options }) => {
			const proof = await mint(c, options);
			await env.db.prepare('UPDATE user SET is_del = 1 WHERE user_id = ?').bind(options.userId).run();
			expect(await inspect(c, proof)).toBeNull();
			expect(await incrementAttempt(c, proof)).toBeNull();
			expect(await consume(c, proof)).toBeNull();
			expect(await bumpAuthVersionExpected(c, { userId: options.userId, expectedAuthVersion: 0 })).toBeNull();
			await expect(mint(c, options)).rejects.toMatchObject({ code: 409 });
			await env.db.prepare('DELETE FROM user WHERE user_id = ?').bind(options.userId).run();
			await expect(mint(c, options)).rejects.toMatchObject({ code: 409 });
			expect(await bumpAuthVersionExpected(c, { userId: options.userId, expectedAuthVersion: 0 })).toBeNull();
		});
	});

	it('fails closed on invalid bindings, payload, lifetime, limits and missing storage', async () => {
		await fixture(async ({ c, options }) => {
			const circular = {};
			circular.self = circular;
			for (const extra of [
				{ userId: 0 }, { target: '' }, { sessionHash: 'plaintext-session' },
				{ sessionHash: null }, { authVersion: -1 }, { authVersion: '0' },
				{ purpose: '' }, { ttlSeconds: 0 }, { ttlSeconds: 1.5 },
				{ ttlSeconds: 86401 }, { maxAttempts: 0 }, { maxAttempts: 101 },
				{ payload: circular }, { payload: () => {} }, { payload: 'x'.repeat(16385) }
			]) {
				await expect(mint(c, options, extra)).rejects.toMatchObject({ code: 400 });
			}
			await expect(mint({}, options)).rejects.toMatchObject({ code: 500 });
			await expect(bumpAuthVersionExpected(c, { userId: options.userId, expectedAuthVersion: Number.MAX_SAFE_INTEGER })).rejects.toMatchObject({ code: 400 });
			const proof = await mint(c, options);
			await expect(inspect(c, { ...proof, target: undefined })).rejects.toMatchObject({ code: 400 });
			await expect(consume(c, { ...proof, attempt: -1 })).rejects.toMatchObject({ code: 400 });
		});
	});

	it('does not swallow database failures or recreate missing schema during requests', async () => {
		const failure = new Error('D1_ERROR: no such table: auth_security_operation');
		const c = { env: { db: { prepare() { throw failure; } } } };
		const proof = { userId: 1, target: 'totp', sessionHash: 'a'.repeat(64), authVersion: 0, purpose: 'totp_disable', token: 'b'.repeat(64) };
		await expect(issue(c, { ...proof, ttlSeconds: 60 })).rejects.toBe(failure);
		await expect(inspect(c, proof)).rejects.toBe(failure);
		await expect(incrementAttempt(c, proof)).rejects.toBe(failure);
		await expect(consume(c, proof)).rejects.toBe(failure);
		await expect(bumpAuthVersionExpected(c, { userId: 1, expectedAuthVersion: 0 })).rejects.toBe(failure);
		await expect(consumeTotpStep(c, { userId: 1, timeStep: 1 })).rejects.toBe(failure);
	});

	it('never releases corrupted payloads and still spends them at most once', async () => {
		await fixture(async ({ c, options }) => {
			const proof = await mint(c, options);
			await env.db.prepare('UPDATE auth_security_operation SET payload = ? WHERE user_id = ?').bind('{broken', options.userId).run();
			await expect(inspect(c, proof)).rejects.toMatchObject({ code: 500 });
			await expect(consume(c, proof)).rejects.toMatchObject({ code: 500 });
			expect(await consume(c, proof)).toBeNull();
		});
	});
});

describe('D1 TOTP replay reservation', () => {
	it('gives exactly one of 32 claimants a step and isolates different users/steps', async () => {
		await fixture(async ({ c, userId, otherUserId }) => {
			const timeStep = Math.floor(Date.now() / 30000);
			const results = await race(32, () => consumeTotpStep(c, { userId, timeStep }));
			expect(results.filter(Boolean)).toHaveLength(1);
			expect(await consumeTotpStep(c, { userId, timeStep })).toBe(false);
			expect(await consumeTotpStep(c, { userId: otherUserId, timeStep })).toBe(true);
			expect(await consumeTotpStep(c, { userId, timeStep: timeStep + 1 })).toBe(true);
			const row = await env.db.prepare('SELECT expires_at, unixepoch() AS now FROM auth_totp_replay WHERE user_id = ? AND time_step = ?').bind(userId, timeStep).first();
			expect(row.expires_at).toBeGreaterThanOrEqual((timeStep + 2) * 30);
			expect(row.expires_at - row.now).toBeGreaterThan(110);
		});
	});

	it('shares replay keys across purposes, sessions and authVersion changes', async () => {
		await fixture(async ({ c, options }) => {
			const timeStep = Math.floor(Date.now() / 30000);
			expect(await consumeTotpStep(c, { ...options, timeStep })).toBe(true);
			expect(await bumpAuthVersionExpected(c, { userId: options.userId, expectedAuthVersion: 0 })).toBe(1);
			expect(await consumeTotpStep(c, { ...options, authVersion: 1, purpose: 'login', sessionHash: await hashToken('other-test-session'), timeStep })).toBe(false);
			// Expiry is cleanup metadata, not permission to overwrite a claim.
			await env.db.prepare('UPDATE auth_totp_replay SET expires_at = 0 WHERE user_id = ?').bind(options.userId).run();
			expect(await consumeTotpStep(c, { ...options, timeStep })).toBe(false);
		});
	});

	it('rejects malformed steps and unavailable storage without a KV fallback', async () => {
		await expect(consumeTotpStep({ env }, { userId: 0, timeStep: 1 })).rejects.toMatchObject({ code: 400 });
		for (const timeStep of [-1, 1.5, '1', null, NaN, Number.MAX_SAFE_INTEGER]) {
			await expect(consumeTotpStep({ env }, { userId: 1, timeStep })).rejects.toMatchObject({ code: 400 });
		}
		await expect(consumeTotpStep({}, { userId: 1, timeStep: 1 })).rejects.toMatchObject({ code: 500 });
	});
});
