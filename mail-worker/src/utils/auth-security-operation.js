import BizError from '../error/biz-error.js';
import { getUserDb } from './db-accessor.js';
import oneTimeCredential, { hashToken } from './one-time-credential.js';

// Install from both cold-start and upgrade migrations. Request paths never run
// DDL or fall back to KV. auth_version remains owned by the user migration.
export const AUTH_SECURITY_OPERATION_SCHEMA = Object.freeze([
	`CREATE TABLE IF NOT EXISTS auth_security_operation (
		token_hash TEXT PRIMARY KEY NOT NULL CHECK (length(token_hash) = 64),
		user_id INTEGER NOT NULL,
		target TEXT NOT NULL,
		session_hash TEXT NOT NULL CHECK (length(session_hash) = 64),
		auth_version INTEGER NOT NULL CHECK (auth_version >= 0),
		purpose TEXT NOT NULL,
		payload TEXT NOT NULL,
		attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
		max_attempts INTEGER NOT NULL CHECK (max_attempts > 0 AND attempts <= max_attempts),
		expires_at INTEGER NOT NULL,
		consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0, 1))
	)`,
	`CREATE INDEX IF NOT EXISTS idx_auth_security_operation_expiry ON auth_security_operation(expires_at)`,
	`CREATE TABLE IF NOT EXISTS auth_totp_replay (
		user_id INTEGER NOT NULL,
		time_step INTEGER NOT NULL CHECK (time_step >= 0),
		expires_at INTEGER NOT NULL,
		PRIMARY KEY (user_id, time_step)
	)`,
	`CREATE INDEX IF NOT EXISTS idx_auth_totp_replay_expiry ON auth_totp_replay(expires_at)`,
	`CREATE TABLE IF NOT EXISTS rate_limit_counter (
		scope TEXT NOT NULL,
		subject TEXT NOT NULL,
		window_start INTEGER NOT NULL,
		count INTEGER NOT NULL CHECK (count >= 0),
		expires_at INTEGER NOT NULL,
		PRIMARY KEY (scope, subject, window_start)
	)`,
	`CREATE INDEX IF NOT EXISTS idx_rate_limit_counter_expiry ON rate_limit_counter(expires_at)`
]);

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const MAX_TTL_SECONDS = 86400;
const encoder = new TextEncoder();
const COLUMNS = `user_id, target, session_hash, auth_version, purpose, payload,
	attempts, max_attempts, expires_at, consumed, (expires_at <= unixepoch()) AS expired`;
const CURRENT_USER = `EXISTS (
	SELECT 1 FROM user
	WHERE user.user_id = auth_security_operation.user_id
		AND user.auth_version = auth_security_operation.auth_version AND user.is_del = 0
)`;

function storage(c) {
	const db = typeof c?.prepare === 'function' ? c : getUserDb(c);
	if (!db || typeof db.prepare !== 'function') {
		throw new BizError('Security operation storage is unavailable', 500);
	}
	return db;
}

function integer(value, field, min = 0, max = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < min || value > max) {
		throw new BizError(`Invalid security operation ${field}`, 400);
	}
	return value;
}

function text(value, field, maxLength) {
	if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
		throw new BizError(`Invalid security operation ${field}`, 400);
	}
	return value;
}

function binding({ userId, target, sessionHash, authVersion, purpose }) {
	if (typeof sessionHash !== 'string' || !HASH_PATTERN.test(sessionHash)) {
		throw new BizError('Invalid security operation session hash', 400);
	}
	return [
		integer(userId, 'user', 1),
		text(typeof target === 'number' ? String(integer(target, 'target', 1)) : target, 'target', 512),
		sessionHash.toLowerCase(),
		integer(authVersion, 'auth version'),
		text(purpose, 'purpose', 64)
	];
}

async function predicate(options) {
	if (typeof options.token !== 'string' || !TOKEN_PATTERN.test(options.token)) return null;
	return {
		sql: `token_hash = ? AND user_id = ? AND target = ? AND session_hash = ?
			AND auth_version = ? AND purpose = ? AND ${CURRENT_USER}`,
		values: [await hashToken(options.token), ...binding(options)]
	};
}

function operation(row) {
	if (!row) return null;
	let payload;
	try {
		payload = JSON.parse(row.payload);
	} catch (_) {
		throw new BizError('Security operation payload is corrupted', 500);
	}
	return {
		userId: Number(row.user_id),
		target: row.target,
		sessionHash: row.session_hash,
		authVersion: Number(row.auth_version),
		purpose: row.purpose,
		payload,
		attempts: Number(row.attempts),
		maxAttempts: Number(row.max_attempts),
		expiry: Number(row.expires_at),
		consumed: Number(row.consumed) === 1,
		expired: Number(row.expired) === 1
	};
}

/** Accepts a Hono context, environment bindings, or the identity-domain D1 DB. */
export async function ensureAuthSecurityOperationSchema(c) {
	const db = storage(c);
	for (const sql of AUTH_SECURITY_OPERATION_SCHEMA) await db.prepare(sql).run();
	return db;
}

/**
 * Return a fresh 256-bit bearer token; persist only its SHA-256 digest.
 * Bind every operation to the actor, exact target, hashed session, actor's
 * current authVersion and purpose. All bindings must come from trusted state.
 * payload must contain no plaintext credentials (encrypt setup secrets first).
 */
export async function issue(c, options) {
	const values = binding(options);
	const ttlSeconds = integer(options.ttlSeconds, 'lifetime', 1, MAX_TTL_SECONDS);
	const maxAttempts = integer(options.maxAttempts ?? 5, 'attempt limit', 1, 100);
	let payload;
	try {
		payload = JSON.stringify(options.payload ?? {});
	} catch (_) {
		throw new BizError('Security operation payload is not serializable', 400);
	}
	if (typeof payload !== 'string' || encoder.encode(payload).length > 16384) {
		throw new BizError('Invalid security operation payload', 400);
	}
	const token = oneTimeCredential.generateToken();
	const row = await storage(c).prepare(`
		INSERT INTO auth_security_operation
			(token_hash, user_id, target, session_hash, auth_version, purpose,
			 payload, attempts, max_attempts, expires_at, consumed)
		SELECT ?, ?, ?, ?, ?, ?, ?, 0, ?, unixepoch() + ?, 0
		WHERE EXISTS (SELECT 1 FROM user WHERE user_id = ? AND auth_version = ? AND is_del = 0)
		RETURNING token_hash
	`).bind(await hashToken(token), ...values, payload, maxAttempts, ttlSeconds, values[0], values[3]).first();
	if (!row) throw new BizError('Security operation account version is stale', 409);
	return token;
}

/** Read-only lifecycle inspection. Never use its result as permission to write. */
export async function inspect(c, options) {
	const filter = await predicate(options);
	if (!filter) return null;
	return operation(await storage(c).prepare(`
		SELECT ${COLUMNS} FROM auth_security_operation WHERE ${filter.sql}
	`).bind(...filter.values).first());
}

/**
 * Atomically reserve an attempt BEFORE checking a proof. Returns its positive
 * counter, or null when invalid/expired/spent/exhausted. On success, pass this
 * counter as `attempt` to consume. A newer attempt supersedes older reservations.
 */
export async function incrementAttempt(c, options) {
	const filter = await predicate(options);
	if (!filter) return null;
	const row = await storage(c).prepare(`
		UPDATE auth_security_operation SET attempts = attempts + 1
		WHERE ${filter.sql} AND consumed = 0 AND expires_at > unixepoch()
			AND attempts < max_attempts
		RETURNING attempts
	`).bind(...filter.values).first();
	return row ? Number(row.attempts) : null;
}

/**
 * Atomic single-use consumption. `attempt` must match the reserved counter;
 * its default 0 is for flows with no proof attempts. The last allowed attempt
 * can succeed, but an exhausted token cannot be spent without that reservation.
 * A later authVersion change also invalidates the token inside this statement.
 */
export async function consume(c, options) {
	const filter = await predicate(options);
	if (!filter) return null;
	const attempt = integer(options.attempt ?? 0, 'attempt', 0, 100);
	return operation(await storage(c).prepare(`
		UPDATE auth_security_operation SET consumed = 1
		WHERE ${filter.sql} AND consumed = 0 AND expires_at > unixepoch()
			AND attempts = ? AND attempts <= max_attempts
		RETURNING ${COLUMNS}
	`).bind(...filter.values, attempt).first());
}

/** Compare-and-swap the account epoch. Exactly one caller gets the new version. */
export async function bumpAuthVersionExpected(c, { userId, expectedAuthVersion }) {
	integer(userId, 'user', 1);
	integer(expectedAuthVersion, 'expected auth version', 0, Number.MAX_SAFE_INTEGER - 1);
	const row = await storage(c).prepare(`
		UPDATE user SET auth_version = auth_version + 1
		WHERE user_id = ? AND auth_version = ? AND is_del = 0
		RETURNING auth_version
	`).bind(userId, expectedAuthVersion).first();
	return row ? Number(row.auth_version) : null;
}

/**
 * Call ONLY after verifyTOTP succeeds, with its matched timeStep. A separate
 * (user, step) key blocks reuse across sessions, purposes and authVersion bumps.
 * INSERT ... ON CONFLICT is the reservation: there is no prior read/delete.
 * Rows may be purged after expires_at; retain through the full +/-1, 30s window.
 */
export async function consumeTotpStep(c, { userId, timeStep }) {
	integer(userId, 'user', 1);
	integer(timeStep, 'TOTP time step', 0, Math.floor(Number.MAX_SAFE_INTEGER / 30) - 2);
	const row = await storage(c).prepare(`
		INSERT INTO auth_totp_replay (user_id, time_step, expires_at)
		VALUES (?, ?, max(unixepoch() + 120, (? + 2) * 30))
		ON CONFLICT (user_id, time_step) DO NOTHING
		RETURNING time_step
	`).bind(userId, timeStep, timeStep).first();
	return row !== null;
}

export default {
	ensureSchema: ensureAuthSecurityOperationSchema,
	issue,
	inspect,
	incrementAttempt,
	consume,
	bumpAuthVersionExpected,
	consumeTotpStep
};
