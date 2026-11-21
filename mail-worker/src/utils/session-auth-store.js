import KvConst from '../const/kv-const.js';
import constant from '../const/constant.js';
import { getUserDb } from './db-accessor.js';
import { USER_SESSION_LIMIT, USER_SESSION_DDL, ensureSessionRevocationSchema, revokeSessionToken, withoutRevokedTokens, isSessionRevoked } from './session-revocation.js';
import { hashToken } from './one-time-credential.js';
import safeLogger from './safe-logger.js';
import jwtUtils from './jwt-utils.js';

const ensuredSessionDbs = new WeakSet();

const USER_SESSION_IDX = `CREATE INDEX IF NOT EXISTS idx_user_session_uid_seq ON user_session(user_id, seq DESC)`;

function sessionKey(userId) {
	return KvConst.AUTH_INFO + userId;
}

function normalizeTokens(value) {
	return Array.isArray(value) ? [...new Set(value.filter(token => typeof token === 'string' && token))] : [];
}

function resolveSessionDb(c) {
	const db = getUserDb(c);
	return db && typeof db.prepare === 'function' ? db : null;
}

function isMissingSessionTableError(err) {
	return /no such table:\s*user_session/i.test(String(err?.message || ''));
}

export async function ensureUserSessionTable(db) {
	if (!db || typeof db.prepare !== 'function') return false;
	if (ensuredSessionDbs.has(db)) return true;
	await db.prepare(USER_SESSION_DDL).run();
	const hashColumn = () => db.prepare("SELECT 1 AS found FROM pragma_table_info('user_session') WHERE name='token_hash'").first();
	if (!await hashColumn()) {
		try {
			await db.prepare('ALTER TABLE user_session ADD COLUMN token_hash TEXT').run();
		} catch (error) {
			if (!await hashColumn()) throw error;
		}
	}
	await db.prepare(USER_SESSION_IDX).run();
	ensuredSessionDbs.add(db);
	return true;
}

async function withSessionTable(db, fn) {
	await ensureUserSessionTable(db);
	try {
		return await fn(db);
	} catch (err) {
		if (!isMissingSessionTableError(err)) throw err;
		ensuredSessionDbs.delete(db);
		await ensureUserSessionTable(db);
		return await fn(db);
	}
}

function parseJsonSafe(raw, fallback) {
	if (!raw || typeof raw !== 'string') return fallback;
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? parsed : fallback;
	} catch (_) {
		return fallback;
	}
}

function buildRecordFromDbRows(rows, fallbackRecord = null) {
	if (!Array.isArray(rows) || rows.length === 0) return null;
	const tokens = [];
	const tokenMeta = {};
	let latestUser = fallbackRecord?.user || null;
	let refreshTime = fallbackRecord?.refreshTime || '';
	const sessionHorizons = {};

	for (const row of rows) {
		if (typeof row?.token !== 'string' || !row.token) continue;
		if (!tokens.includes(row.token)) tokens.push(row.token);
		const meta = parseJsonSafe(row.meta_json, null);
		if (meta && Object.keys(meta).length > 0) {
			tokenMeta[row.token] = meta;
		}
		const rowUser = parseJsonSafe(row.user_json, null);
		if (rowUser && Object.keys(rowUser).length > 0) {
			latestUser = { ...(latestUser || {}), ...rowUser };
		}
		if (row.refresh_time) refreshTime = row.refresh_time;
		sessionHorizons[row.token] = row.max_session_epoch ?? null;
	}

	if (tokens.length === 0) return null;
	const record = {
		...(fallbackRecord || {}),
		user: latestUser,
		tokens: tokens.slice(-USER_SESSION_LIMIT),
		sessionHorizons,
		tokenMeta,
		refreshTime: refreshTime || new Date().toISOString()
	};
	for (const key of Object.keys(record.tokenMeta)) {
		if (!record.tokens.includes(key)) delete record.tokenMeta[key];
	}
	delete record.maxSessionEpoch;
	delete record.trustEpoch;
	return record;
}

async function readActiveDbRows(c, userId) {
	const db = resolveSessionDb(c);
	if (!db) return null;
	const nowSec = Math.floor(Date.now() / 1000);
	try {
		const res = await db.prepare(`
			SELECT token, meta_json, user_json, refresh_time, max_session_epoch
			FROM user_session
			WHERE user_id = ? AND expires_at > ?
			ORDER BY seq ASC
		`).bind(Number(userId), nowSec).all();
		return res?.results || [];
	} catch (err) {
		if (isMissingSessionTableError(err)) return null;
		throw err;
	}
}

// Old KV-only sessions shared one horizon. Preserve that bound until their
// own D1 row is available. New logins explicitly record null for an uncapped token.
function sessionHorizon(record, token) {
	if (Object.hasOwn(record?.sessionHorizons || {}, token)) return record.sessionHorizons[token];
	return record?.maxSessionEpoch ?? null;
}

function validAtHorizon(record, token) {
	const horizon = sessionHorizon(record, token);
	return horizon === null || (Number.isSafeInteger(horizon) && horizon > Math.floor(Date.now() / 1000));
}

export function mergeSessionRecords(current, incoming) {
	const currentTokens = normalizeTokens(current?.tokens);
	const incomingTokens = normalizeTokens(incoming?.tokens);
	const tokens = [...new Set([...currentTokens, ...incomingTokens])].slice(-USER_SESSION_LIMIT);
	const tokenMeta = { ...(current?.tokenMeta || {}), ...(incoming?.tokenMeta || {}) };
	for (const token of Object.keys(tokenMeta)) {
		if (!tokens.includes(token)) delete tokenMeta[token];
	}
	const sessionHorizons = {};
	for (const token of tokens) {
		const source = incomingTokens.includes(token) ? incoming : current;
		const hasHorizon = Object.hasOwn(source?.sessionHorizons || {}, token);
		const previous = currentTokens.includes(token) ? sessionHorizon(current, token) : null;
		sessionHorizons[token] = hasHorizon ? source.sessionHorizons[token] : (source?.maxSessionEpoch ?? previous);
	}
	const result = {
		...(current || {}),
		...(incoming || {}),
		tokens,
		sessionHorizons,
		tokenMeta,
		refreshTime: incoming?.refreshTime || current?.refreshTime || new Date().toISOString()
	};
	delete result.maxSessionEpoch;
	delete result.trustEpoch;
	return result;
}

function sameTokenSet(left, right) {
	const a = normalizeTokens(left?.tokens).sort();
	const b = normalizeTokens(right?.tokens).sort();
	return a.length === b.length && a.every((token, index) => token === b[index]);
}

// Retain the newest D1 sessions first. Old KV-only sessions fill spare slots in
// their issuance order. After reaching the limit, use the previous durable
// window as the only source of legacy survivors, even if KV reads regress.
const updateSessionCapacity = `
	WITH active AS (
		SELECT token_hash, seq FROM user_session WHERE user_id = ?1 ORDER BY seq DESC LIMIT ?2
	), previous AS (
		SELECT token_hashes FROM session_capacity WHERE user_id = ?1 AND expires_at >= ?3
	), legacy AS (
		SELECT j.value AS token_hash, CAST(j.key AS INTEGER) AS entry_order
		FROM json_each(COALESCE((SELECT COALESCE(json_extract(token_hashes,'$.legacy'), '[]') FROM previous), ?4)) j
		WHERE j.type='text' AND length(j.value)=64
		  AND NOT EXISTS (SELECT 1 FROM active WHERE active.token_hash=j.value)
		  AND NOT EXISTS (SELECT 1 FROM session_revocation r WHERE r.user_id = ?1
		                  AND r.token_hash = j.value AND r.expires_at >= ?3)
		ORDER BY entry_order DESC LIMIT max(0, ?2 - (SELECT count(*) FROM active))
	)
	INSERT INTO session_capacity(user_id, token_hashes, expires_at)
	SELECT ?1, json_object('legacy', json((SELECT json_group_array(token_hash)
		FROM (SELECT token_hash FROM legacy ORDER BY entry_order)))), ?5
	WHERE (SELECT count(*) FROM active)+(SELECT count(*) FROM legacy)>=?2 OR EXISTS (SELECT 1 FROM previous)
	ON CONFLICT(user_id) DO UPDATE SET token_hashes=excluded.token_hashes, expires_at=excluded.expires_at`;

/**
 * Persist a newly minted session token. When a D1 user DB is bound, writes
 * atomically to `user_session` first so high-concurrency logins never lose
 * sessions to KV eventual consistency, then updates KV edge cache.
 */
export async function persistSessionRecord(c, userId, authInfo, token) {
	const key = sessionKey(userId);
	const db = resolveSessionDb(c);
	if (db) {
		const uid = Number(userId);
		const nowSec = Math.floor(Date.now() / 1000);
		const expiresAt = nowSec + constant.TOKEN_EXPIRE;
		const tokenMeta = authInfo?.tokenMeta?.[token] || null;
		const metaJson = tokenMeta ? JSON.stringify(tokenMeta) : '{}';
		const userJson = authInfo?.user ? JSON.stringify(authInfo.user) : '{}';
		const refreshTime = authInfo?.refreshTime || new Date().toISOString();
		const maxEpoch = sessionHorizon(authInfo, token);

		const tokenHash = await hashToken(token);
		const latestKv = await c.env.kv?.get(key, { type: 'json' }).catch(() => null);
		const sameUserKv = latestKv && (!latestKv.user?.email || !authInfo?.user?.email || latestKv.user.email === authInfo.user.email)
			? latestKv : null;
		const cachedTokens = normalizeTokens(sameUserKv?.tokens);
		const cachedHashes = await Promise.all(cachedTokens.filter(t => validAtHorizon(sameUserKv, t)).map(hashToken));
		const persist = () => withSessionTable(db, async sessionDb => {
			// Deployed v3_26 rows have no digest. Compute it for this user's live
			// rows on the first login; all concurrent new writers persist digests.
			const oldRows = await sessionDb.prepare('SELECT token FROM user_session WHERE user_id=? AND token_hash IS NULL AND expires_at>?')
				.bind(uid, nowSec).all();
			const backfill = await Promise.all(oldRows.results.map(async row => sessionDb.prepare(
				'UPDATE user_session SET token_hash=? WHERE user_id=? AND token=? AND token_hash IS NULL'
			).bind(await hashToken(row.token), uid, row.token)));
			return sessionDb.batch([
				...backfill,
				sessionDb.prepare(`DELETE FROM user_session WHERE user_id=?1 AND (expires_at<=?2 OR EXISTS (
					SELECT 1 FROM session_revocation r WHERE r.user_id=?1 AND r.token_hash=user_session.token_hash AND r.expires_at>=?2
				))`).bind(uid, nowSec),
				// The explicit logout ledger also prevents a pending persist from
				// winning a race against logout. A newly minted token can enter a full window.
				sessionDb.prepare(`
					INSERT INTO user_session(user_id, token, token_hash, meta_json, user_json, refresh_time, max_session_epoch, expires_at)
					SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
					WHERE NOT EXISTS (SELECT 1 FROM session_revocation WHERE token_hash=?3 AND user_id=?1 AND expires_at>=?9)
					ON CONFLICT(user_id, token) DO NOTHING
				`).bind(uid, token, tokenHash, metaJson, userJson, refreshTime, maxEpoch, expiresAt, nowSec),
				sessionDb.prepare(`
					INSERT INTO session_revocation (token_hash,user_id,expires_at)
					SELECT token_hash,user_id,max(expires_at,?2) FROM user_session WHERE user_id=?1
					ORDER BY seq DESC LIMIT -1 OFFSET ?3
					ON CONFLICT(token_hash) DO UPDATE SET expires_at=max(session_revocation.expires_at,excluded.expires_at)
				`).bind(uid, expiresAt, USER_SESSION_LIMIT),
				sessionDb.prepare(`DELETE FROM user_session WHERE user_id=?1 AND seq NOT IN
					(SELECT seq FROM user_session WHERE user_id=?1 ORDER BY seq DESC LIMIT ?2)`).bind(uid, USER_SESSION_LIMIT),
				sessionDb.prepare(updateSessionCapacity).bind(uid, USER_SESSION_LIMIT, nowSec, JSON.stringify(cachedHashes), expiresAt),
				sessionDb.prepare(`
					SELECT token, meta_json, user_json, refresh_time, max_session_epoch FROM user_session
					WHERE user_id=? AND expires_at>? ORDER BY seq ASC
				`).bind(uid, nowSec)
			]);
		});

		let batchResults;
		for (let attempt = 1; ; attempt++) {
			try {
				batchResults = await persist();
				break;
			} catch (error) {
				// A pre-upgrade writer can commit an undigested row after the
				// backfill read. D1 rolled back the entire pruning transaction.
				if (!/NOT NULL constraint failed: session_revocation\.token_hash/i.test(String(error?.message))) throw error;
				if (attempt >= 3) return null;
			}
		}

		const dbRows = batchResults.at(-1).results;
		if (!dbRows.some(row => row.token === token)) return null;
		const dbRecord = buildRecordFromDbRows(dbRows, authInfo);
		if (c?.env?.kv) {
			const allowed = new Set(await withoutRevokedTokens(c, uid, [...new Set([...cachedTokens, ...dbRecord.tokens])]));
			const legacy = cachedTokens.filter(t => allowed.has(t) && !dbRecord.tokens.includes(t));
			const merged = mergeSessionRecords({ ...sameUserKv, tokens: legacy },
				{ ...dbRecord, tokens: dbRecord.tokens.filter(t => allowed.has(t)) });
			await c.env.kv.put(key, JSON.stringify(merged), { expirationTtl: constant.TOKEN_EXPIRE }).catch(() => {});
			return merged;
		}
		return dbRecord;
	}

	const latest = await c.env.kv.get(key, { type: 'json' });
	const sameUserLatest = latest && (!latest.user?.email || !authInfo?.user?.email || latest.user.email === authInfo.user.email)
		? latest
		: null;
	let candidate = mergeSessionRecords(sameUserLatest, authInfo);
	for (let attempt = 0; attempt < 6; attempt++) {
		await c.env.kv.put(key, JSON.stringify(candidate), { expirationTtl: constant.TOKEN_EXPIRE });
		const observed = await c.env.kv.get(key, { type: 'json' });
		if (Array.isArray(observed?.tokens) && observed.tokens.includes(token)) {
			const missed = candidate.tokens.filter(item => !observed.tokens.includes(item));
			const shiftedByCapacity = missed.length > 0 && observed.tokens.length >= USER_SESSION_LIMIT
				&& missed.length <= Math.max(0, candidate.tokens.length + observed.tokens.length - USER_SESSION_LIMIT);
			if (missed.length === 0 || shiftedByCapacity) return observed;
		}
		if (attempt < 5) {
			const jitterMs = 25 + Math.floor(Math.random() * 65 * (attempt + 1));
			await new Promise(resolve => setTimeout(resolve, jitterMs));
		}
		const refreshed = await c.env.kv.get(key, { type: 'json' });
		candidate = mergeSessionRecords(refreshed || observed, candidate);
	}
	return null;
}

// Consume the revocation result only inside this verification call. Standalone
// lookups, the next request and explicit reauthentication perform their own checks.
export async function readVerifiedBearerSession(c, bearer, permissionKeys = null) {
	const { claims, currentUser } = await jwtUtils.verifyMailboxAccess(c, bearer, permissionKeys);
	if (!currentUser || !c.env?.kv) return { claims, session: null, currentUser };

	// The issued token's own positive row is authoritative for its trust bound.
	// Stale or missing KV cannot extend the bound. Older KV-only sessions and
	// the daily metadata refresh still use the existing recovery/merge path.
	if (currentUser.session_id != null) {
		if (!currentUser.active_session) return { claims, session: null, currentUser };
		const horizon = currentUser.session_horizon;
		if (horizon != null && (!Number.isSafeInteger(horizon) || horizon <= Math.floor(Date.now() / 1000))) {
			return { claims, session: null, currentUser };
		}
		const user = currentUser.fresh_session ? parseJsonSafe(currentUser.session_user, null) : null;
		if (user && Number(user.userId) === Number(claims.userId)) {
			return { claims, currentUser, session: { user, tokens: [claims.token], refreshTime: currentUser.session_refresh } };
		}
	}
	const session = await readSessionRecord(c, claims.userId, claims.token, false);
	return { claims, session, currentUser };
}

export function readAuthorizedSession(c, userId, token) {
	return readSessionRecord(c, userId, token, true);
}

/**
 * Resolve an active session record from KV edge cache first, falling back to
 * D1 `user_session` only when KV missed a validly signed bearer token and
 * self-healing KV when D1 confirms the session is active.
 */
async function readSessionRecord(c, userId, token, checkRevocation) {
	if (!c?.env?.kv || typeof token !== 'string' || !token) return null;
	if (checkRevocation && resolveSessionDb(c) && await isSessionRevoked(c, userId, token)) return null;
	const key = sessionKey(userId);
	const authInfo = await c.env.kv.get(key, { type: 'json' });
	const cached = Array.isArray(authInfo?.tokens) && authInfo.tokens.includes(token);
	if (cached && Object.hasOwn(authInfo.sessionHorizons || {}, token)) {
		return validAtHorizon(authInfo, token) ? authInfo : null;
	}

	const dbRows = await readActiveDbRows(c, userId);
	if (!dbRows || !dbRows.some(row => row.token === token)) {
		return cached && validAtHorizon(authInfo, token) ? authInfo : null;
	}

	const dbRecord = buildRecordFromDbRows(dbRows, authInfo);
	if (!dbRecord || !dbRecord.tokens.includes(token) || !validAtHorizon(dbRecord, token)) return null;

	const sameUserKv = authInfo && (!authInfo.user?.email || !dbRecord.user?.email || authInfo.user.email === dbRecord.user.email)
		? authInfo
		: null;
	const healed = mergeSessionRecords(sameUserKv, dbRecord);
	await c.env.kv.put(key, JSON.stringify(healed), { expirationTtl: constant.TOKEN_EXPIRE }).catch(() => {});
	return healed;
}

/**
 * Refresh only the session metadata while preserving tokens written by a
 * concurrent login. KV has no compare-and-swap, so the write is verified and
 * merged for a bounded number of attempts.
 */
export async function refreshSessionAuthInfo(c, userId, authInfo) {
	const key = sessionKey(userId);
	const refreshTime = new Date().toISOString();
	const db = resolveSessionDb(c);
	if (db) {
		try {
			await db.prepare('UPDATE user_session SET refresh_time = ? WHERE user_id = ?')
				.bind(refreshTime, Number(userId)).run();
		} catch (err) {
			if (!isMissingSessionTableError(err)) throw err;
		}
	}
	let candidate = { ...authInfo, refreshTime };
	for (let attempt = 0; attempt < 3; attempt++) {
		const latest = await c.env.kv.get(key, { type: 'json' });
		if (!latest) return null;
		candidate = { ...latest, tokens: normalizeTokens(latest.tokens), tokenMeta: { ...(latest.tokenMeta || {}) }, refreshTime };
		if (db) candidate.tokens = await withoutRevokedTokens(c, userId, candidate.tokens);
		for (const token of Object.keys(candidate.tokenMeta)) {
			if (!candidate.tokens.includes(token)) delete candidate.tokenMeta[token];
		}
		await c.env.kv.put(key, JSON.stringify(candidate), { expirationTtl: constant.TOKEN_EXPIRE });
		const observed = await c.env.kv.get(key, { type: 'json' });
		if (!observed || sameTokenSet(observed, candidate)) return observed || candidate;
		candidate = mergeSessionRecords(observed, candidate);
	}
	return candidate;
}

/**
 * Patch cached session user fields (e.g. profile/labels) on D1 & latest KV record
 * without overwriting tokens written concurrently or truncating session TTL.
 */
export async function updateSessionUserFields(c, userId, userPatch) {
	if (!c?.env?.kv || !userPatch || typeof userPatch !== 'object') return null;
	const key = sessionKey(userId);
	const db = resolveSessionDb(c);
	if (db) {
		try {
			const dbRows = await readActiveDbRows(c, userId);
			if (dbRows && dbRows.length > 0) {
				const mergedUser = { ...(parseJsonSafe(dbRows[dbRows.length - 1]?.user_json, {})), ...userPatch };
				await db.prepare('UPDATE user_session SET user_json = ? WHERE user_id = ?')
					.bind(JSON.stringify(mergedUser), Number(userId)).run();
			}
		} catch (err) {
			if (!isMissingSessionTableError(err)) throw err;
		}
	}
	for (let attempt = 0; attempt < 3; attempt++) {
		const latest = await c.env.kv.get(key, { type: 'json' });
		if (!latest || !latest.user) return null;
		const candidate = {
			...latest,
			user: {
				...latest.user,
				...userPatch
			}
		};
		await c.env.kv.put(key, JSON.stringify(candidate), { expirationTtl: constant.TOKEN_EXPIRE });
		const observed = await c.env.kv.get(key, { type: 'json' });
		if (!observed || sameTokenSet(observed, candidate)) return observed || candidate;
	}
	return null;
}

/**
 * Remove any tokens matching a predicate from both D1 and KV while preserving concurrent logins.
 */
export async function removeSessionTokens(c, userId, shouldDrop) {
	if (!c?.env?.kv || typeof shouldDrop !== 'function') return 0;
	const key = sessionKey(userId);
	const droppedSet = new Set();

	const db = resolveSessionDb(c);
	if (db) {
		const dbRows = await readActiveDbRows(c, userId);
		if (dbRows && dbRows.length > 0) {
			const dbDrops = [];
			for (const row of dbRows) {
				const meta = parseJsonSafe(row.meta_json, null);
				if (typeof row.token === 'string' && row.token && shouldDrop(row.token, meta)) {
					dbDrops.push(row.token);
					droppedSet.add(row.token);
				}
			}
			for (const tok of dbDrops) {
				await revokeSessionToken(c, userId, tok);
				await db.prepare('DELETE FROM user_session WHERE user_id = ? AND token = ?')
					.bind(Number(userId), tok).run();
			}
		}
	}

	for (let attempt = 0; attempt < 3; attempt++) {
		const current = await c.env.kv.get(key, { type: 'json' });
		if (!current || !Array.isArray(current.tokens)) return droppedSet.size;
		const metaMap = current.tokenMeta && typeof current.tokenMeta === 'object' ? current.tokenMeta : {};
		const drop = new Set(droppedSet);
		for (const token of normalizeTokens(current.tokens)) {
			if (shouldDrop(token, metaMap[token] || null)) {
				drop.add(token);
				droppedSet.add(token);
			}
		}
		if (drop.size === 0) return droppedSet.size;
		if (db) {
			for (const token of drop) {
				await revokeSessionToken(c, userId, token);
			}
		}
		const tokens = normalizeTokens(current.tokens).filter(token => !drop.has(token));
		const nextMeta = { ...metaMap };
		for (const token of drop) delete nextMeta[token];
		if (tokens.length === 0 && Object.keys(nextMeta).length === 0) {
			await c.env.kv.delete(key);
		} else {
			const next = { ...current, tokens, tokenMeta: nextMeta };
			await c.env.kv.put(key, JSON.stringify(next), { expirationTtl: constant.TOKEN_EXPIRE });
		}
		const observed = await c.env.kv.get(key, { type: 'json' });
		if (!observed) return droppedSet.size;
		const stillPresent = normalizeTokens(observed.tokens).some(token => drop.has(token));
		if (!stillPresent) return droppedSet.size;
	}
	return droppedSet.size;
}

/**
 * Remove one bearer token from D1 and KV without overwriting concurrent logins.
 */
export async function removeSessionToken(c, userId, token, { expiresAt = 0 } = {}) {
	if (!token) return null;
	const db = resolveSessionDb(c);
	if (db) await revokeSessionToken(c, userId, token, expiresAt);
	try {
		if (db) {
			try {
				await db.prepare('DELETE FROM user_session WHERE user_id = ? AND token = ?')
					.bind(Number(userId), token).run();
			} catch (err) {
				if (!isMissingSessionTableError(err)) throw err;
			}
		}
		const key = sessionKey(userId);
		for (let attempt = 0; attempt < 3; attempt++) {
			const current = await c.env.kv.get(key, { type: 'json' });
			if (!current || !Array.isArray(current.tokens)) return null;
			const tokens = normalizeTokens(current.tokens).filter(item => item !== token);
			const next = { ...current, tokens };
			if (tokens.length === 0) {
				await c.env.kv.delete(key);
			} else {
				if (next.tokenMeta && typeof next.tokenMeta === 'object') delete next.tokenMeta[token];
				await c.env.kv.put(key, JSON.stringify(next), { expirationTtl: constant.TOKEN_EXPIRE });
			}
			const observed = await c.env.kv.get(key, { type: 'json' });
			if (!observed || !normalizeTokens(observed.tokens).includes(token)) return observed;
		}
	} catch (error) {
		safeLogger.warn('session_revoked_cleanup_failed', { userId, error });
	}
	return null;
}

/** Delete all D1 `user_session` rows for a user without touching KV. */
export async function deleteUserSessionsFromDb(c, userId) {
	const db = resolveSessionDb(c);
	if (!db || userId === undefined || userId === null) return;
	const uid = Number(userId);
	const clear = () => db.batch([
		db.prepare('DELETE FROM user_session WHERE user_id=?').bind(uid),
		db.prepare(`INSERT INTO session_capacity(user_id,token_hashes,expires_at) VALUES(?,'[]',?)
			ON CONFLICT(user_id) DO UPDATE SET token_hashes='[]', expires_at=max(expires_at,excluded.expires_at)`)
			.bind(uid, Math.floor(Date.now() / 1000) + constant.TOKEN_EXPIRE)
	]);
	try {
		await clear();
	} catch (error) {
		// Account cleanup can also be invoked during upgrade on a KV-only database.
		if (!/no such table:\s*(?:user_session|session_capacity)\b/i.test(String(error?.message))) throw error;
		await ensureSessionRevocationSchema(c);
		await clear();
	}
}

/** Revoke all sessions across both D1 `user_session` and KV `AUTH_INFO`. */
export async function revokeAllUserSessions(c, userId, { ignoreKvError = false } = {}) {
	await deleteUserSessionsFromDb(c, userId);
	if (!c?.env?.kv || userId === undefined || userId === null) return;
	const key = sessionKey(userId);
	if (ignoreKvError) {
		await c.env.kv.delete(key).catch(() => {});
	} else {
		await c.env.kv.delete(key);
	}
}

export default {
	ensureUserSessionTable,
	mergeSessionRecords,
	persistSessionRecord,
	readAuthorizedSession,
	refreshSessionAuthInfo,
	updateSessionUserFields,
	removeSessionTokens,
	removeSessionToken,
	deleteUserSessionsFromDb,
	revokeAllUserSessions
};
