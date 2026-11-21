import { getMailDb } from './db-accessor.js';

export const MAIL_BODY_BYTES_SQL = `LENGTH(CAST(IFNULL(subject,'') AS BLOB))+LENGTH(CAST(IFNULL(text,'') AS BLOB))+
		LENGTH(CAST(IFNULL(content,'') AS BLOB))+LENGTH(CAST(IFNULL(code,'') AS BLOB))`;

// NULL means an invalid accounting row, independently of the owner's limits.
// It must neither authorize an insert nor commit a permanent quota bounce.
// TOTAL avoids an overflowing SQLite integer SUM before the safe-integer checks.
export function validatedMailQuotaCondition({ userId, incomingBytes, maxStorageBytes, maxEmails, bypassStorage }, { reportUsage = false } = {}) {
	const within = [];
	const params = [];
	if (!bypassStorage && maxStorageBytes > 0) {
		within.push('m.bytes + a.bytes + i.bytes + o.bytes + ? <= ?'); params.push(incomingBytes, maxStorageBytes);
	}
	if (maxEmails > 0) { within.push('m.n + i.n + o.n + 1 <= ?'); params.push(maxEmails); }
	const reservations = `TOTAL(reserved_bytes) AS bytes, TOTAL(reserved_count) AS n,
		COUNT(CASE WHEN typeof(reserved_bytes)<>'integer' OR reserved_bytes<0 OR
			typeof(reserved_count)<>'integer' OR reserved_count<0 THEN 1 END) AS bad`;
	return {
		sql: `(SELECT CASE WHEN a.bad=0 AND i.bad=0 AND o.bad=0 AND m.bytes+a.bytes BETWEEN 0 AND 9007199254740991
			AND i.bytes+o.bytes BETWEEN 0 AND 9007199254740991 - (m.bytes+a.bytes)
			AND i.n+o.n BETWEEN 0 AND 9007199254740991 - m.n
			THEN ${within.join(' AND ') || '1'} ELSE NULL END${reportUsage ? ' AS allowed, m.bytes+a.bytes AS usedBytes' : ''}
			FROM (SELECT COUNT(*) AS n, TOTAL(${MAIL_BODY_BYTES_SQL}) AS bytes FROM email WHERE user_id=?) AS m
			CROSS JOIN (SELECT TOTAL(size) AS bytes, COUNT(CASE WHEN typeof(size)<>'integer' OR size<0 THEN 1 END) AS bad
				FROM attachments WHERE user_id=?) AS a
			CROSS JOIN (SELECT ${reservations} FROM mail_receive_claim WHERE user_id=?
				AND state IN ('CLAIMED','SAVING','RETRY') AND lease_until>unixepoch()) AS i
			CROSS JOIN (SELECT ${reservations} FROM mail_outbound_task WHERE user_id=?
				AND state IN ('PREPARED','SENDING','UNKNOWN')) AS o)`,
		params: [...params, userId, userId, userId, userId]
	};
}

// Diagnose a rejected write with the very same predicate. Keep corruption
// distinguishable from a full mailbox, including after concurrent changes.
export async function quotaWriteStatus(db, condition) {
	const row = await db.prepare('SELECT ' + condition.sql + ' AS allowed').bind(...condition.params).first();
	return row?.allowed ?? null;
}

export function mailQuotaCondition({ userId, incomingBytes, maxStorageBytes, maxEmails, bypassStorage }) {
	const checkBytes = !bypassStorage && maxStorageBytes !== 0;
	const checkCount = maxEmails !== 0;
	if (!checkBytes && !checkCount) return { sql: '1', params: [] };
	const totals = (bytes, count) => [
		checkBytes && `COALESCE(SUM(${bytes}),0) AS bytes`,
		checkCount && `${count} AS n`
	].filter(Boolean).join(', ');
	const reserved = totals('reserved_bytes', 'COALESCE(SUM(reserved_count),0)');
	const conditions = [];
	const params = [];
	if (checkBytes) {
		conditions.push(`m.bytes + i.bytes + o.bytes + COALESCE((SELECT SUM(size) FROM attachments WHERE user_id=?),0) + ? <= ?`);
		params.push(userId, incomingBytes, maxStorageBytes);
	}
	if (checkCount) {
		conditions.push('m.n + i.n + o.n + 1 <= ?');
		params.push(maxEmails);
	}
	return {
		sql: `(SELECT ${conditions.join(' AND ')}
			FROM (SELECT ${totals(MAIL_BODY_BYTES_SQL, 'COUNT(*)')} FROM email WHERE user_id=?) AS m
			CROSS JOIN (SELECT ${reserved} FROM mail_receive_claim WHERE user_id=?
				AND state IN ('CLAIMED','SAVING','RETRY') AND lease_until>unixepoch()) AS i
			CROSS JOIN (SELECT ${reserved} FROM mail_outbound_task WHERE user_id=?
				AND state IN ('PREPARED','SENDING','UNKNOWN')) AS o)`,
		params: [...params, userId, userId, userId]
	};
}

export const D1_BIND_LIMIT = 100;
// Leave room for SQLite's row overhead and future columns below D1's 2 MiB row limit.
export const MAX_MAIL_ROW_BYTES = 1800 * 1024;
const encoder = new TextEncoder();

export function normalizeMailAddress(value) {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function mailRowBytes(row) {
	return Object.values(row).reduce((sum, value) => sum + (typeof value === 'string' ? encoder.encode(value).byteLength : 8), 256);
}

export function assertMailRowSize(row) {
	if (mailRowBytes(row) > MAX_MAIL_ROW_BYTES) {
		const error = new Error('Mail row exceeds the safe D1 row size limit');
		error.code = 'mail_row_too_large';
		throw error;
	}
}

export async function mailSha256(value) {
	const bytes = typeof value === 'string' ? encoder.encode(value) : value;
	return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}

/** Split using actual Drizzle toSQL().params rather than a guessed column count. */
export function buildBoundedInserts(makeQuery, rows, limit = D1_BIND_LIMIT) {
	const queries = [];
	let chunk = [];
	for (const row of rows) {
		const candidate = [...chunk, row];
		if (makeQuery(candidate).toSQL().params.length > limit) {
			if (!chunk.length) throw new Error('One mail metadata row exceeds the D1 bind limit');
			queries.push(makeQuery(chunk).toSQL());
			chunk = [row];
			if (makeQuery(chunk).toSQL().params.length > limit) throw new Error('One mail metadata row exceeds the D1 bind limit');
		} else {
			chunk = candidate;
		}
	}
	if (chunk.length) queries.push(makeQuery(chunk).toSQL());
	return queries;
}

export function prepareMailQuery(c, query) {
	const compiled = typeof query.toSQL === 'function' ? query.toSQL() : query;
	if (compiled.params.length > D1_BIND_LIMIT) throw new Error('Mail query exceeds the D1 bind limit');
	return getMailDb(c).prepare(compiled.sql).bind(...compiled.params);
}
