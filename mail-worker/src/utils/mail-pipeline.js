import { getMailDb } from './db-accessor.js';

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
