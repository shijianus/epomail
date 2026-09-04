/**
 * Database Accessor & Multi-DB Routing Layer for EpoCanvas Mail
 * 
 * Supports both:
 * 1. Single-DB mode (Default): All tables reside in c.env.db / c.env.DB
 * 2. Dual-DB mode (Optional): 
 *    - USER_DB: user, role, perm, role_perm, setting, oauth, oauth_app, oauth_grant, reg_key, verify_record
 *    - MAIL_DB: email, account, star, attachments
 */

export function getEnv(c) {
	return c?.env || c || {};
}

/**
 * Get User / Identity Domain D1 Database Binding
 * Falls back to default `db` or `DB` if USER_DB is not configured
 */
export function getUserDb(c) {
	const env = getEnv(c);
	return env.USER_DB || env.user_db || env.db || env.DB;
}

/**
 * Get Mail / Asset Domain D1 Database Binding
 * Falls back to default `db` or `DB` if MAIL_DB is not configured
 */
export function getMailDb(c) {
	const env = getEnv(c);
	return env.MAIL_DB || env.mail_db || env.db || env.DB;
}

/**
 * Check if the current environment is running in physically separated Dual-DB mode
 */
export function isDualDbMode(c) {
	const env = getEnv(c);
	const userDb = env.USER_DB || env.user_db;
	const mailDb = env.MAIL_DB || env.mail_db;
	return !!(userDb && mailDb);
}

/**
 * Get database configuration diagnostics for logging / health check
 */
export function getDbModeInfo(c) {
	const env = getEnv(c);
	const hasUserDb = !!(env.USER_DB || env.user_db);
	const hasMailDb = !!(env.MAIL_DB || env.mail_db);
	const hasDefaultDb = !!(env.db || env.DB);
	const dual = isDualDbMode(c);

	return {
		mode: dual ? 'dual' : 'single',
		isDual: dual,
		hasUserDb,
		hasMailDb,
		hasDefaultDb
	};
}
