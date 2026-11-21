import BizError from '../error/biz-error.js';
import constant from '../const/constant.js';
import { getUserDb } from './db-accessor.js';
import { permConst } from '../const/entity-const.js';
import { hashToken } from './one-time-credential.js';

export const USER_SESSION_LIMIT = 10;
export const USER_SESSION_DDL = `CREATE TABLE IF NOT EXISTS user_session (
	seq INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	token TEXT NOT NULL,
	token_hash TEXT,
	meta_json TEXT NOT NULL DEFAULT '{}',
	user_json TEXT NOT NULL DEFAULT '{}',
	refresh_time TEXT NOT NULL DEFAULT '',
	max_session_epoch INTEGER,
	expires_at INTEGER NOT NULL,
	UNIQUE(user_id, token)
)`;
export const SESSION_REVOCATION_SCHEMA = [
	USER_SESSION_DDL,
	`CREATE TABLE IF NOT EXISTS session_revocation (
		token_hash TEXT PRIMARY KEY NOT NULL CHECK (length(token_hash) = 64),
		user_id INTEGER NOT NULL CHECK (user_id > 0),
		expires_at INTEGER NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS idx_session_revocation_expiry ON session_revocation(expires_at)`,
	`CREATE TABLE IF NOT EXISTS session_capacity (
		user_id INTEGER PRIMARY KEY, token_hashes TEXT, expires_at INTEGER NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS idx_session_capacity_expiry ON session_capacity(expires_at)`,
	// Existing full v3_26 windows are already authoritative. NULL uses their
	// live positive rows until the next sign-in computes the ten digests.
	`INSERT INTO session_capacity(user_id,token_hashes,expires_at)
		SELECT user_id, NULL, max(expires_at) FROM user_session WHERE expires_at>unixepoch()
		GROUP BY user_id HAVING count(*)>=${USER_SESSION_LIMIT} ON CONFLICT(user_id) DO NOTHING`,
	// Older Workers insert only positive rows and do their own pruning. Apply
	// their slot consumption inside the same transaction, before a KV write.
	`CREATE TRIGGER IF NOT EXISTS session_capacity_on_insert AFTER INSERT ON user_session BEGIN
		INSERT INTO session_capacity(user_id,token_hashes,expires_at)
		SELECT NEW.user_id,NULL,max(expires_at) FROM user_session
		WHERE user_id=NEW.user_id AND expires_at>unixepoch()
		HAVING count(*)>=${USER_SESSION_LIMIT}
		ON CONFLICT(user_id) DO UPDATE SET token_hashes=NULL,expires_at=max(expires_at,excluded.expires_at);
		UPDATE session_capacity SET token_hashes=json_object('legacy', json((
			SELECT json_group_array(value) FROM (SELECT value FROM (
				SELECT value,CAST(key AS INTEGER) AS pos FROM json_each(session_capacity.token_hashes,'$.legacy')
				WHERE type='text' AND length(value)=64 ORDER BY pos DESC
				LIMIT max(0,${USER_SESSION_LIMIT}-(SELECT count(*) FROM user_session WHERE user_id=NEW.user_id AND expires_at>unixepoch()))
			) ORDER BY pos)
		))), expires_at=max(expires_at,NEW.expires_at)
		WHERE user_id=NEW.user_id AND expires_at>=unixepoch() AND json_type(token_hashes)='object';
	END`
];

function storage(c) {
	const db = getUserDb(c);
	if (!db?.prepare) throw new BizError('Session revocation storage is unavailable', 503, 'session_storage_unavailable');
	return db;
}

export async function ensureSessionRevocationSchema(c) {
	for (const sql of SESSION_REVOCATION_SCHEMA) await storage(c).prepare(sql).run();
}

// Once a user's ten slots have filled, an old KV replica may contain tokens
// which a newer replica has never seen. Only the durable window can admit them.
function revokedPredicate(userId, hash, token) {
	return `(EXISTS (SELECT 1 FROM session_revocation r WHERE r.user_id = ${userId}
			AND r.token_hash = ${hash} AND r.expires_at >= unixepoch())
		OR EXISTS (SELECT 1 FROM session_capacity w WHERE w.user_id = ${userId}
			AND w.expires_at >= unixepoch() AND NOT EXISTS (
				SELECT 1 FROM user_session s WHERE s.user_id=${userId} AND s.token=${token} AND s.expires_at>unixepoch()
			) AND NOT EXISTS (
				SELECT 1 FROM json_each(w.token_hashes,'$.legacy') j
				WHERE j.type='text' AND length(j.value)=64 AND j.value=${hash}
			)))`;
}

export async function isSessionRevoked(c, userId, token) {
	const row = await storage(c).prepare(`SELECT (${revokedPredicate('?1', '?2', '?3')} OR EXISTS (
		SELECT 1 FROM user_session s WHERE s.user_id=?1 AND s.token=?3 AND (s.expires_at<=unixepoch()
		OR (s.max_session_epoch IS NOT NULL AND (typeof(s.max_session_epoch)!='integer' OR s.max_session_epoch<=unixepoch())))
	)) AS revoked`)
		.bind(userId, await hashToken(token), token).first();
	return Number(row?.revoked) === 1;
}

// This statement reads the current role, permission and token state from one USER_DB snapshot.
export async function readMailboxAccess(c, { userId, token }, permissionKeys) {
	const permission = permissionKeys === null ? '1' : `EXISTS (
		SELECT 1 FROM role r JOIN role_perm rp ON rp.role_id = r.role_id
		JOIN perm p ON p.perm_id = rp.perm_id
		WHERE r.role_id = u.type AND p.type = ${permConst.type.BUTTON}
		  AND p.perm_key IN (SELECT value FROM json_each(?4))
	)`;
	const args = [userId, await hashToken(token), token];
	if (permissionKeys !== null) args.push(JSON.stringify(permissionKeys));
	return storage(c).prepare(`SELECT u.user_id, u.email, u.type, u.is_del, u.status, u.auth_version,
		${revokedPredicate('?1', '?2', '?3')} AS revoked, ${permission} AS allowed,
		s.seq AS session_id, s.expires_at > unixepoch() AS active_session, s.user_json AS session_user, s.refresh_time AS session_refresh, s.max_session_epoch AS session_horizon,
		date(s.refresh_time)=date('now') AS fresh_session
		FROM (SELECT 1) LEFT JOIN user u ON u.user_id = ?1
		LEFT JOIN user_session s ON s.user_id = ?1 AND s.token = ?3`).bind(...args).first();
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
	const candidates = tokens.map((token, index) => [token, hashes[index]]);
	const rows = await storage(c).prepare(`WITH candidates AS (
		SELECT json_extract(value,'$[0]') AS token, json_extract(value,'$[1]') AS hash FROM json_each(?1)
	) SELECT c.hash AS token_hash FROM candidates c WHERE ${revokedPredicate('?2','c.hash','c.token')}`)
		.bind(JSON.stringify(candidates), userId).all();
	const revoked = new Set(rows.results.map(row => row.token_hash));
	return tokens.filter((token, index) => token !== null && !revoked.has(hashes[index]));
}
