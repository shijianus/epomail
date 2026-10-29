/**
 * Atomic single-use credential storage backed by D1.
 *
 * Why not KV: a `get()` followed by `delete()` is two independent operations
 * with no compare-and-set. KV is also eventually consistent across the
 * network, so two concurrent callback requests can both observe the record
 * before either delete lands, and both consume a credential that is supposed
 * to be single-use. A "check then delete" sequence cannot provide a strong
 * guarantee on KV.
 *
 * Why D1: a single `UPDATE ... WHERE consumed = 0 ... RETURNING` statement is
 * executed atomically by SQLite. The read (predicate) and the write
 * (`consumed = 1`) happen inside one statement, and D1 routes writes to a
 * single primary database instance that serialises writers. Exactly one
 * concurrent statement flips `consumed` from 0 to 1 and receives a RETURNING
 * row; every other statement matches zero rows and therefore returns nothing.
 * The winner is decided by the database, not by application-level ordering.
 *
 * Only a SHA-256 digest of the bearer token is persisted as the primary key,
 * so a database dump does not expose usable credentials.
 */
import BizError from '../error/biz-error.js';
import { getUserDb } from './db-accessor.js';

export const OTC_PURPOSE = Object.freeze({
	STATE: 'oauth_state',
	LOGIN_CODE: 'oauth_login_code',
	BIND: 'oauth_bind',
	// Binding an additional identity to an account that is already signed in.
	// Distinct from BIND (which creates/associates a mailbox for a brand-new
	// identity) so a proof minted for one flow can never be redeemed by the
	// other.
	BIND_LINK: 'oauth_bind_link',
	// Short-lived proof that the account owner re-authenticated moments ago.
	// Required before a sensitive identity bind/unbind.
	STEP_UP: 'oauth_step_up',
	AUTHORIZATION_CODE: 'oauth_authorization_code'
});

const PURPOSES = new Set(Object.values(OTC_PURPOSE));
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,512}$/;
const MAX_PROVIDER_LENGTH = 64;
const MAX_IDENTITY_LENGTH = 512;
const MAX_TTL_SECONDS = 24 * 60 * 60;

const encoder = new TextEncoder();

function storage(c) {
	const db = getUserDb(c);
	if (!db || typeof db.prepare !== 'function') {
		// Fail closed: never fall back to a weaker (non-atomic) store.
		throw new BizError('One-time credential storage is unavailable', 500);
	}
	return db;
}

async function sha256Hex(value) {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
	return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Digest used to bind a credential payload to a caller-supplied secret (for
 * example the current session token). Exported so callers can compare without
 * ever persisting the plaintext.
 */
export function hashToken(value) {
	return sha256Hex(String(value ?? ''));
}

function assertPurpose(purpose) {
	if (!PURPOSES.has(purpose)) {
		throw new BizError('Unsupported one-time credential purpose', 500);
	}
}

function assertBinding(value, { field, maxLength }) {
	if (value === null || value === undefined || value === '') return '';
	// Bindings are always passed as SQL parameters, never interpolated, so the
	// only hard requirement is a bounded, non-empty string.
	if (typeof value !== 'string' || value.length > maxLength) {
		throw new BizError(`Invalid one-time credential ${field}`, 400);
	}
	return value;
}

function generateToken() {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

const oneTimeCredential = {
	PURPOSE: OTC_PURPOSE,

	generateToken,

	/**
	 * Persist a credential and return the raw bearer token. The raw value is
	 * never written to storage or logs.
	 */
	async issue(c, { purpose, token = null, provider = '', oauthUserId = '', payload = {}, ttlSeconds }) {
		assertPurpose(purpose);
		if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_TTL_SECONDS) {
			throw new BizError('Invalid one-time credential lifetime', 500);
		}
		const boundProvider = assertBinding(provider, { field: 'provider', maxLength: MAX_PROVIDER_LENGTH });
		const boundIdentity = assertBinding(oauthUserId, { field: 'identity', maxLength: MAX_IDENTITY_LENGTH });

		const rawToken = token === null ? generateToken() : token;
		if (typeof rawToken !== 'string' || !TOKEN_PATTERN.test(rawToken)) {
			throw new BizError('Invalid one-time credential token format', 500);
		}

		let serialized;
		try {
			serialized = JSON.stringify(payload ?? {});
		} catch (_) {
			throw new BizError('One-time credential payload is not serializable', 500);
		}

		const db = storage(c);
		const tokenHash = await sha256Hex(rawToken);
		const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

		await db.prepare(`
			INSERT INTO oauth_one_time_credential
				(token_hash, purpose, provider, oauth_user_id, payload, consumed, expires_at)
			VALUES (?, ?, ?, ?, ?, 0, ?)
		`).bind(tokenHash, purpose, boundProvider, boundIdentity, serialized, expiresAt).run();

		// Opportunistic, bounded housekeeping. Failure here must never block
		// credential issuance.
		try {
			await this.purgeExpired(c);
		} catch (_) {}

		return rawToken;
	},

	/**
	 * Read-only inspection. Returns the credential's binding, lifecycle flags
	 * and payload for a caller that must decide *before* spending the token,
	 * or `null` when no row matches the purpose (and optional
	 * provider/identity binding).
	 *
	 * This never mutates the row. A binding mismatch is simply "not found",
	 * so inspecting with the wrong identity cannot burn the credential.
	 */
	async inspect(c, { purpose, token, provider = null, oauthUserId = null }) {
		assertPurpose(purpose);
		if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
			return null;
		}

		const db = storage(c);
		const tokenHash = await sha256Hex(token);

		const filters = ['token_hash = ?', 'purpose = ?'];
		const binds = [tokenHash, purpose];

		if (provider !== null) {
			filters.push('provider = ?');
			binds.push(assertBinding(provider, { field: 'provider', maxLength: MAX_PROVIDER_LENGTH }));
		}
		if (oauthUserId !== null) {
			filters.push('oauth_user_id = ?');
			binds.push(assertBinding(oauthUserId, { field: 'identity', maxLength: MAX_IDENTITY_LENGTH }));
		}

		const row = await db.prepare(`
			SELECT provider, oauth_user_id, payload, consumed, expires_at
			FROM oauth_one_time_credential
			WHERE ${filters.join(' AND ')}
			LIMIT 1
		`).bind(...binds).first();

		if (!row) return null;

		let payload = null;
		try {
			payload = JSON.parse(row.payload);
		} catch (_) {
			// A corrupted payload must not crash a read-only probe; a caller
			// that needs the payload will fail its own shape validation.
		}

		return {
			provider: row.provider || '',
			oauthUserId: row.oauth_user_id || '',
			payload,
			consumed: Number(row.consumed) === 1,
			expired: Number(row.expires_at) <= Math.floor(Date.now() / 1000)
		};
	},

	/**
	 * Atomically consume a credential. Returns `{ payload, provider,
	 * oauthUserId }` for exactly one caller, or `null` when the token is
	 * unknown, malformed, expired, already consumed, or bound to a different
	 * provider/identity.
	 *
	 * A binding mismatch is a predicate failure, so it does NOT burn the
	 * credential for the legitimate owner.
	 */
	async consume(c, { purpose, token, provider = null, oauthUserId = null }) {
		assertPurpose(purpose);
		if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
			return null;
		}

		const db = storage(c);
		const tokenHash = await sha256Hex(token);
		const nowSec = Math.floor(Date.now() / 1000);

		const filters = ['token_hash = ?', 'purpose = ?', 'consumed = 0', 'expires_at > ?'];
		const binds = [tokenHash, purpose, nowSec];

		if (provider !== null) {
			const boundProvider = assertBinding(provider, { field: 'provider', maxLength: MAX_PROVIDER_LENGTH });
			filters.push('provider = ?');
			binds.push(boundProvider);
		}
		if (oauthUserId !== null) {
			const boundIdentity = assertBinding(oauthUserId, { field: 'identity', maxLength: MAX_IDENTITY_LENGTH });
			filters.push('oauth_user_id = ?');
			binds.push(boundIdentity);
		}

		const row = await db.prepare(`
			UPDATE oauth_one_time_credential
			SET consumed = 1
			WHERE ${filters.join(' AND ')}
			RETURNING provider, oauth_user_id, payload
		`).bind(...binds).first();

		if (!row) return null;

		let payload;
		try {
			payload = JSON.parse(row.payload);
		} catch (_) {
			throw new BizError('One-time credential payload is corrupted', 500);
		}

		return {
			payload,
			provider: row.provider || '',
			oauthUserId: row.oauth_user_id || ''
		};
	},

	/**
	 * Delete a bounded batch of expired rows. Consumed rows are kept until
	 * their natural expiry so an audit query can still see that they were
	 * used exactly once.
	 */
	async purgeExpired(c, { limit = 50 } = {}) {
		const db = storage(c);
		const nowSec = Math.floor(Date.now() / 1000);
		await db.prepare(`
			DELETE FROM oauth_one_time_credential
			WHERE token_hash IN (
				SELECT token_hash FROM oauth_one_time_credential
				WHERE expires_at < ?
				LIMIT ?
			)
		`).bind(nowSec, limit).run();
	}
};

export default oneTimeCredential;
