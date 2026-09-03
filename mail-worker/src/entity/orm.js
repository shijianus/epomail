import { drizzle } from 'drizzle-orm/d1';
import { getUserDb, getMailDb, getEnv } from '../utils/db-accessor';

/**
 * ORM instance for User / Identity domain tables (user, role, perm, setting, oauth_app, etc.)
 */
export function userOrm(c) {
	const env = getEnv(c);
	const db = getUserDb(c);
	return drizzle(db, { logger: env.orm_log });
}

/**
 * ORM instance for Mail / Asset domain tables (email, account, star, attachments)
 */
export function mailOrm(c) {
	const env = getEnv(c);
	const db = getMailDb(c);
	return drizzle(db, { logger: env.orm_log });
}

/**
 * Default universal ORM accessor with domain selector
 * @param {object} c - Hono context or env wrapper
 * @param {'user'|'mail'} [target='user'] - Target database domain
 */
export default function orm(c, target = 'user') {
	if (target === 'mail') {
		return mailOrm(c);
	}
	return userOrm(c);
}
