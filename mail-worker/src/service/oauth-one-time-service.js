import { getUserDb, getEnv } from '../utils/db-accessor';

const TABLE = 'oauth_one_time_token';

function randomToken() {
	return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
}

async function hashToken(token) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token)));
	return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function dbFor(c) {
	const db = getUserDb(c) || getEnv(c)?.db;
	if (!db?.prepare) {
		throw new Error('OAuth single-use storage unavailable');
	}
	return db;
}

/**
 * CREATE IF NOT EXISTS on every credential operation keeps the guarantee even
 * when the local test storage is reset between runs; the statement is cheap
 * and this path only runs for OAuth callbacks.
 */
export async function ensureOAuthTokenTable(c) {
	const db = dbFor(c);
	await db.prepare(`
		CREATE TABLE IF NOT EXISTS ${TABLE} (
			token_hash TEXT PRIMARY KEY,
			kind TEXT NOT NULL,
			provider TEXT NOT NULL DEFAULT '',
			subject TEXT NOT NULL DEFAULT '',
			payload TEXT NOT NULL,
			expires_at INTEGER NOT NULL,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`).run();
	const info = await db.prepare(`PRAGMA table_info('${TABLE}')`).all();
	const columns = new Set((info?.results || []).map(row => row.name));
	if (!columns.has('subject')) {
		await db.prepare(`ALTER TABLE ${TABLE} ADD COLUMN subject TEXT NOT NULL DEFAULT ''`).run().catch(() => {});
	}
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_oauth_one_time_expires ON ${TABLE}(expires_at)`).run();
	return db;
}

/**
 * Persist a one-time OAuth credential (state / login code / bind proof) in D1.
 * Only the SHA-256 hash is stored; the raw token is returned to the caller.
 */
export async function issueOAuthToken(c, { kind, provider = '', subject = '', payload, ttlSeconds }) {
	const db = await ensureOAuthTokenTable(c);
	const token = randomToken();
	const now = Date.now();
	const expiresAt = now + Math.max(1, Number(ttlSeconds) || 0) * 1000;

	await db.prepare(`DELETE FROM ${TABLE} WHERE expires_at <= ?`).bind(now).run().catch(() => {});
	await db.prepare(
		`INSERT INTO ${TABLE} (token_hash, kind, provider, subject, payload, expires_at) VALUES (?, ?, ?, ?, ?, ?)`
	).bind(
		await hashToken(token),
		kind,
		provider || '',
		String(subject || ''),
		JSON.stringify(payload || {}),
		expiresAt
	).run();

	return token;
}

/**
 * Atomically consume a credential. DELETE ... RETURNING guarantees that only
 * one concurrent caller receives the payload; expired, wrong-kind or
 * wrong-subject records return nothing and are not readable afterwards.
 */
export async function consumeOAuthToken(c, { kind, provider = '', subject = null, token }) {
	if (!token || typeof token !== 'string') return null;
	const db = await ensureOAuthTokenTable(c);
	const now = Date.now();
	let sql = `DELETE FROM ${TABLE}
		 WHERE token_hash = ? AND kind = ? AND provider = ? AND expires_at > ?`;
	const args = [await hashToken(token), kind, provider || '', now];
	if (subject !== null) {
		sql += ' AND subject = ?';
		args.push(String(subject));
	}
	sql += ' RETURNING payload';

	const row = await db.prepare(sql).bind(...args).first();
	if (!row?.payload) return null;
	try {
		return JSON.parse(row.payload);
	} catch (_) {
		return null;
	}
}

export default { ensureOAuthTokenTable, issueOAuthToken, consumeOAuthToken };
