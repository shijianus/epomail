/**
 * Test helpers for the D1-backed single-use credential store.
 *
 * Production code issues credentials through `oauthService`; these helpers
 * exist for the few cases where a test must seed an already-expired or
 * already-issued row without waiting for a real TTL.
 */

const CREATE_OTC = `
CREATE TABLE IF NOT EXISTS oauth_one_time_credential (
	token_hash TEXT PRIMARY KEY,
	purpose TEXT NOT NULL,
	provider TEXT NOT NULL DEFAULT '',
	oauth_user_id TEXT NOT NULL DEFAULT '',
	payload TEXT NOT NULL,
	consumed INTEGER NOT NULL DEFAULT 0,
	expires_at INTEGER NOT NULL,
	create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

const CREATE_BIND_CLAIM = `
CREATE TABLE IF NOT EXISTS oauth_bind_claim (
	oauth_user_id TEXT PRIMARY KEY,
	claim_token TEXT NOT NULL,
	email TEXT NOT NULL DEFAULT '',
	user_id INTEGER NOT NULL DEFAULT 0,
	reserved_reg_key INTEGER NOT NULL DEFAULT 0,
	code TEXT NOT NULL DEFAULT '',
	expires_at INTEGER NOT NULL,
	create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

const encoder = new TextEncoder();

export async function sha256Hex(value) {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
	return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function ensureOtcTable(db) {
	await db.prepare(CREATE_OTC).run();
}

export async function seedOtc(db, {
	purpose,
	token,
	provider = '',
	oauthUserId = '',
	payload = {},
	ttlSeconds = 600,
	expiresAt = null,
	consumed = 0
}) {
	const tokenHash = await sha256Hex(token);
	const expiry = expiresAt === null
		? Math.floor(Date.now() / 1000) + ttlSeconds
		: expiresAt;
	await db.prepare(`
		INSERT INTO oauth_one_time_credential
			(token_hash, purpose, provider, oauth_user_id, payload, consumed, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`).bind(tokenHash, purpose, provider, oauthUserId, JSON.stringify(payload), consumed, expiry).run();
}

export async function clearOtc(db) {
	await db.prepare('DELETE FROM oauth_one_time_credential').run();
}

export async function countOtc(db, purpose = null) {
	const statement = purpose
		? db.prepare('SELECT count(*) AS count FROM oauth_one_time_credential WHERE purpose = ?').bind(purpose)
		: db.prepare('SELECT count(*) AS count FROM oauth_one_time_credential');
	const row = await statement.first();
	return Number(row?.count || 0);
}

export async function dropOtcTable(db) {
	await clearOtc(db);
}

export async function ensureBindClaimTable(db) {
	await db.prepare(CREATE_BIND_CLAIM).run();
}

export async function clearBindClaim(db) {
	await db.prepare('DELETE FROM oauth_bind_claim').run();
}
