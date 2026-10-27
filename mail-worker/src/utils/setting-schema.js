/**
 * Setting table schema split.
 *
 * D1 rejects tables and result sets wider than 100 columns. The single-row
 * `setting` table grew to 102 columns, so a cold start could not even create
 * the schema and every `SELECT *` failed. The newest OAuth-login and
 * audit-policy settings live in `setting_ext`; callers still receive one
 * merged object from settingService, preserving the existing API surface.
 */

export const SETTING_EXT_COLUMNS = [
	{ name: 'oauth_login_enabled', ddl: 'INTEGER NOT NULL DEFAULT 0', fallback: '0' },
	{ name: 'oauth_providers', ddl: "TEXT NOT NULL DEFAULT '{}'", fallback: "'{}'" },
	{ name: 'audit_log_enabled', ddl: 'INTEGER NOT NULL DEFAULT 1', fallback: '1' },
	{ name: 'audit_max_ip_per_account', ddl: 'INTEGER NOT NULL DEFAULT 3', fallback: '3' },
	{ name: 'audit_max_device_per_account', ddl: 'INTEGER NOT NULL DEFAULT 3', fallback: '3' },
	{ name: 'audit_auto_clean_oldest', ddl: 'INTEGER NOT NULL DEFAULT 1', fallback: '1' },
	{ name: 'audit_prioritize_non_critical_clean', ddl: 'INTEGER NOT NULL DEFAULT 1', fallback: '1' },
	{ name: 'audit_critical_quota', ddl: 'INTEGER NOT NULL DEFAULT 3', fallback: '3' }
];

const EXT_COLUMN_NAMES = SETTING_EXT_COLUMNS.map(column => column.name);

function createTableSql() {
	const definitions = SETTING_EXT_COLUMNS.map(column => `\t\t\t\t${column.name} ${column.ddl}`).join(',\n');
	return `CREATE TABLE IF NOT EXISTS setting_ext (\n${definitions}\n\t\t\t)`;
}

async function tableColumns(db, table) {
	const info = await db.prepare(`PRAGMA table_info('${table}')`).all();
	return new Set((info?.results || []).map(row => row.name).filter(Boolean));
}

async function tableExists(db, table) {
	const info = await db.prepare(`PRAGMA table_info('${table}')`).all();
	return Array.isArray(info?.results) && info.results.length > 0;
}

/**
 * Create/upgrade setting_ext and move legacy values out of the base table.
 * Idempotent: repeated calls only add a missing ext row or columns.
 */
export async function ensureSettingExtSchema(db) {
	if (!db?.prepare) return;

	await db.prepare(createTableSql()).run();

	const extColumns = await tableColumns(db, 'setting_ext');
	for (const column of SETTING_EXT_COLUMNS) {
		if (extColumns.has(column.name)) continue;
		try {
			await db.prepare(`ALTER TABLE setting_ext ADD COLUMN ${column.name} ${column.ddl}`).run();
		} catch (error) {
			console.warn(`setting_ext add column ${column.name} skipped:`, error?.message);
		}
	}

	const baseExists = await tableExists(db, 'setting');
	if (!baseExists) return;

	const baseColumns = await tableColumns(db, 'setting');
	const extRow = await db.prepare('SELECT COUNT(*) AS total FROM setting_ext').first();
	const extEmpty = Number(extRow?.total || 0) === 0;

	if (extEmpty) {
		const names = EXT_COLUMN_NAMES.join(', ');
		const selects = SETTING_EXT_COLUMNS
			.map(column => baseColumns.has(column.name) ? `"${column.name}"` : column.fallback)
			.join(', ');
		await db.prepare(
			`INSERT INTO setting_ext (${names}) SELECT ${selects} FROM setting WHERE NOT EXISTS (SELECT 1 FROM setting_ext) LIMIT 1`
		).run();
	}

	// Once the values are copied, release the columns from the base table so
	// legacy databases created at the 100-column ceiling can still migrate.
	for (const column of SETTING_EXT_COLUMNS) {
		if (!baseColumns.has(column.name)) continue;
		try {
			await db.prepare(`ALTER TABLE setting DROP COLUMN ${column.name}`).run();
		} catch (error) {
			// Dropping is an optimization, not a correctness requirement: the
			// merged read path no longer selects these columns either way.
			console.warn(`setting drop legacy column ${column.name} skipped:`, error?.message);
		}
	}

	const seeded = await db.prepare('SELECT COUNT(*) AS total FROM setting_ext').first();
	if (Number(seeded?.total || 0) === 0) {
		const names = EXT_COLUMN_NAMES.join(', ');
		const values = SETTING_EXT_COLUMNS.map(column => column.fallback).join(', ');
		await db.prepare(`INSERT INTO setting_ext (${names}) VALUES (${values})`).run();
	}
}

export default { SETTING_EXT_COLUMNS, ensureSettingExtSchema };
