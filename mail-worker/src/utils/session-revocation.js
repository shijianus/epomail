import BizError from '../error/biz-error.js';
import constant from '../const/constant.js';
import { getUserDb } from './db-accessor.js';
import { hashToken } from './one-time-credential.js';

export const SESSION_REVOCATION_SCHEMA = [
	`CREATE TABLE IF NOT EXISTS session_revocation (
		token_hash TEXT PRIMARY KEY NOT NULL CHECK (length(token_hash) = 64),
		user_id INTEGER NOT NULL CHECK (user_id > 0),
		expires_at INTEGER NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS idx_session_revocation_expiry ON session_revocation(expires_at)`
];

function storage(c) {
	const db = getUserDb(c);
	if (!db?.prepare) throw new BizError('Session revocation storage is unavailable', 503, 'session_storage_unavailable');
	return db;
}

export async function ensureSessionRevocationSchema(c) {
	for (const sql of SESSION_REVOCATION_SCHEMA) await storage(c).prepare(sql).run();
}

export async function isSessionRevoked(c, userId, token) {
	const row = await storage(c).prepare(`SELECT 1 AS revoked FROM session_revocation
		WHERE token_hash = ? AND user_id = ? AND expires_at >= unixepoch()`)
		.bind(await hashToken(token), userId).first();
	return Number(row?.revoked) === 1;
}

export async function revokeSessionToken(c, userId, token, expiresAt = 0) {
	if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0 || typeof token !== 'string' || !token) {
		throw new BizError('Invalid session', 400, 'invalid_session');
	}
	const expiry = Math.max(Math.floor(Date.now() / 1000) + constant.TOKEN_EXPIRE,
		Number.isSafeInteger(expiresAt) ? expiresAt : 0);
	await storage(c).prepare(`INSERT INTO session_revocation (token_hash, user_id, expires_at)
		VALUES (?, ?, ?) ON CONFLICT(token_hash) DO UPDATE SET
		expires_at = max(session_revocation.expires_at, excluded.expires_at)`)
		.bind(await hashToken(token), Number(userId), expiry).run();
}

export async function withoutRevokedTokens(c, userId, tokens) {
	if (!tokens.length) return [];
	const hashes = await Promise.all(tokens.map(hashToken));
	// Bind one JSON array so existing KV records of any size use one D1 read.
	const rows = await storage(c).prepare(`SELECT token_hash FROM session_revocation
		WHERE token_hash IN (SELECT value FROM json_each(?)) AND user_id = ? AND expires_at >= unixepoch()`)
		.bind(JSON.stringify(hashes), userId).all();
	const revoked = new Set(rows.results.map(row => row.token_hash));
	return tokens.filter((token, index) => token !== null && !revoked.has(hashes[index]));
}
