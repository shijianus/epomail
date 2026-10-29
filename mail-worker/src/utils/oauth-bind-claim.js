/**
 * Per-identity bind lease backed by D1.
 *
 * A bind proof is single-use, but it is minted per OAuth *flow*, not per
 * identity: two completed flows for the same third-party identity yield two
 * independent proofs. Without a second interlock, two concurrent requests
 * could each spend their own proof, each create an account, and race to
 * associate the same identity with two mailboxes.
 *
 * The lease closes that gap:
 *   - `oauth_bind_claim.oauth_user_id` is the primary key, so exactly one
 *     request can hold the identity at a time (a plain INSERT decides the
 *     winner; no read-then-write window).
 *   - The lease carries a strict TTL. An expired lease can be taken over with
 *     one conditional UPSERT, so a crashed request cannot block the identity
 *     forever.
 *   - `finalizeBind` folds the lease check and the association write into a
 *     single UPDATE, so "the claim is still mine" and "the identity is still
 *     unbound" are evaluated atomically by SQLite.
 *
 * The lease is not an authorization credential: it never grants a session and
 * is never returned to a client. It only serialises writers.
 */
import BizError from '../error/biz-error.js';
import { getUserDb } from './db-accessor.js';

export const BIND_CLAIM_TTL_SECONDS = 120;

const MAX_IDENTITY_LENGTH = 512;
const MAX_EMAIL_LENGTH = 320;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,512}$/;

function storage(c) {
	const db = getUserDb(c);
	if (!db || typeof db.prepare !== 'function') {
		// Fail closed: without the lease there is no concurrency guarantee.
		throw new BizError('OAuth bind claim storage is unavailable', 500);
	}
	return db;
}

function nowSeconds() {
	return Math.floor(Date.now() / 1000);
}

function identity(value) {
	if (typeof value !== 'string' || !value || value.length > MAX_IDENTITY_LENGTH) {
		throw new BizError('Invalid OAuth identity for bind claim', 400);
	}
	return value;
}

function email(value) {
	if (typeof value !== 'string') return '';
	return value.length > MAX_EMAIL_LENGTH ? value.slice(0, MAX_EMAIL_LENGTH) : value;
}

function generateClaimToken() {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function changes(result) {
	return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

const oauthBindClaim = {
	TTL_SECONDS: BIND_CLAIM_TTL_SECONDS,

	/**
	 * Acquire the lease for an identity.
	 *
	 * Returns `{ claimToken, stale }` for exactly one concurrent caller, or
	 * `null` when a live lease is already held. `stale` carries the previous
	 * holder's recorded account (if any) so the caller can compensate an
	 * attempt that crashed after account creation but before binding.
	 *
	 * Atomicity: the INSERT ... ON CONFLICT DO UPDATE ... WHERE ... RETURNING
	 * statement both decides the winner and surfaces the stale row in one
	 * serialised write.
	 */
	async acquire(c, { oauthUserId, email: intendedEmail = '', ttlSeconds = BIND_CLAIM_TTL_SECONDS }) {
		const id = identity(oauthUserId);
		if (!Number.isInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 600) {
			throw new BizError('Invalid OAuth bind claim lifetime', 500);
		}

		const db = storage(c);
		const claimToken = generateClaimToken();
		const now = nowSeconds();
		const expiresAt = now + ttlSeconds;

		const row = await db.prepare(`
			INSERT INTO oauth_bind_claim
				(oauth_user_id, claim_token, email, user_id, reserved_reg_key, code, expires_at)
			VALUES (?, ?, '', 0, 0, '', ?)
			ON CONFLICT(oauth_user_id) DO UPDATE SET
				claim_token = excluded.claim_token,
				expires_at = excluded.expires_at
			WHERE oauth_bind_claim.expires_at < ?
			RETURNING claim_token, email, user_id, reserved_reg_key, code
		`).bind(id, claimToken, expiresAt, now).first();

		if (!row || row.claim_token !== claimToken) {
			return null;
		}

		const stale = {
			email: row.email || '',
			userId: Number(row.user_id) || 0,
			reservedRegKey: Number(row.reserved_reg_key) === 1,
			code: row.code || ''
		};

		// The takeover deliberately preserved the previous values until they
		// were read. Reset the account marker now so a later takeover cannot
		// compensate this (still running) attempt's account prematurely.
		await db.prepare(`
			UPDATE oauth_bind_claim
			SET email = ?, user_id = 0, reserved_reg_key = 0, code = ''
			WHERE oauth_user_id = ? AND claim_token = ?
		`).bind(email(intendedEmail), id, claimToken).run();

		// Bounded housekeeping; a stale lease is otherwise harmless because
		// acquisition always checks its expiry.
		try {
			await db.prepare(`
				DELETE FROM oauth_bind_claim
				WHERE oauth_user_id IN (
					SELECT oauth_user_id FROM oauth_bind_claim
					WHERE expires_at < ?
					LIMIT 20
				)
			`).bind(now - 3600).run();
		} catch (_) {}

		return { claimToken, stale };
	},

	/**
	 * Record the account created by this attempt so a crash before binding can
	 * be compensated by the next holder. Best effort: failing here only loses
	 * the crash-compensation marker, not the binding itself.
	 */
	async recordUser(c, { oauthUserId, claimToken, userId, email: boundEmail = '', reservedRegKey = false, code = '' }) {
		const id = identity(oauthUserId);
		if (typeof claimToken !== 'string' || !TOKEN_PATTERN.test(claimToken)) return false;
		const numericUserId = Number(userId);
		if (!Number.isInteger(numericUserId) || numericUserId <= 0) return false;

		const db = storage(c);
		const result = await db.prepare(`
			UPDATE oauth_bind_claim
			SET email = ?, user_id = ?, reserved_reg_key = ?, code = ?
			WHERE oauth_user_id = ? AND claim_token = ?
		`).bind(
			email(boundEmail),
			numericUserId,
			reservedRegKey ? 1 : 0,
			typeof code === 'string' ? code.slice(0, 128) : '',
			id,
			claimToken
		).run();

		return changes(result) === 1;
	},

	async release(c, { oauthUserId, claimToken }) {
		const id = identity(oauthUserId);
		if (typeof claimToken !== 'string' || !TOKEN_PATTERN.test(claimToken)) return;
		const db = storage(c);
		await db.prepare(`
			DELETE FROM oauth_bind_claim WHERE oauth_user_id = ? AND claim_token = ?
		`).bind(id, claimToken).run();
	},

	async inspect(c, { oauthUserId }) {
		const id = identity(oauthUserId);
		const db = storage(c);
		const row = await db.prepare(`
			SELECT oauth_user_id, claim_token, email, user_id, reserved_reg_key, code, expires_at
			FROM oauth_bind_claim
			WHERE oauth_user_id = ?
		`).bind(id).first();

		if (!row) return null;

		return {
			oauthUserId: row.oauth_user_id,
			claimToken: row.claim_token,
			email: row.email || '',
			userId: Number(row.user_id) || 0,
			reservedRegKey: Number(row.reserved_reg_key) === 1,
			code: row.code || '',
			expiresAt: Number(row.expires_at) || 0,
			active: Number(row.expires_at) > nowSeconds()
		};
	},

	/**
	 * Commit the association. Returns true only when this exact lease is still
	 * held AND every row for the identity is still unbound. The claim check,
	 * the unbound check and the write are one SQL statement, so no other
	 * writer can slip between them.
	 */
	async finalize(c, { oauthUserId, claimToken, userId }) {
		const id = identity(oauthUserId);
		if (typeof claimToken !== 'string' || !TOKEN_PATTERN.test(claimToken)) {
			throw new BizError('Invalid OAuth bind claim', 400);
		}
		const numericUserId = Number(userId);
		if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
			throw new BizError('Invalid local account for OAuth binding', 500);
		}

		const db = storage(c);
		const row = await db.prepare(`
			UPDATE oauth
			SET user_id = ?
			WHERE oauth_user_id = ?
				AND user_id = 0
				AND NOT EXISTS (
					SELECT 1 FROM oauth AS bound
					WHERE bound.oauth_user_id = ? AND bound.user_id > 0
				)
				AND EXISTS (
					SELECT 1 FROM oauth_bind_claim
					WHERE oauth_user_id = ? AND claim_token = ?
				)
			RETURNING oauth_id
		`).bind(numericUserId, id, id, id, claimToken).first();

		return !!row;
	}
};

export default oauthBindClaim;
