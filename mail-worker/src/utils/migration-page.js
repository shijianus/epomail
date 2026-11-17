import BizError from '../error/biz-error.js';

export function migrationCursor(value = 0) {
	if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') {
		throw new BizError('Invalid migration cursor', 400, 'invalid_migration_cursor');
	}
	const cursor = Number(value);
	if (!Number.isSafeInteger(cursor) || cursor < 0) throw new BizError('Invalid migration cursor', 400, 'invalid_migration_cursor');
	return cursor;
}

export function migrationLimit(value = 500) {
	const limit = Number(value);
	if (!['number', 'string'].includes(typeof value) || !Number.isSafeInteger(limit) || limit < 1 || limit > 5000) {
		throw new BizError('Migration limit must be an integer between 1 and 5000', 400, 'invalid_migration_limit');
	}
	return limit;
}

export function migrationUserId(value = null) {
	if (value === null || value === undefined) return null;
	const id = Number(value);
	if (!['number', 'string'].includes(typeof value) || !Number.isSafeInteger(id) || id <= 0) {
		throw new BizError('Invalid migration user id', 400, 'invalid_migration_scope');
	}
	return id;
}

export function migrationIds(value = null) {
	if (value === null || value === undefined) return null;
	if (!Array.isArray(value) || value.length > 50 || value.some(id => id === null || migrationUserId(id) === null)) {
		throw new BizError('Migration scope must be a list of at most 50 positive ids', 400, 'invalid_migration_scope');
	}
	return [...new Set(value.map(id => migrationUserId(id)))];
}

export function migrationPage(rows, limit, cursor, idColumn) {
	const hasMore = rows.length > limit;
	const page = rows.slice(0, limit);
	return { rows: page, hasMore,
		nextCursor: hasMore ? Number(page[page.length - 1][idColumn]) : null,
		inspectionComplete: cursor === 0 && !hasMore };
}
