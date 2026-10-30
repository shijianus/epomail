import emailUtils from './email-utils.js';

export function isAdminEmail(c, email) {
	if (!email) return false;
	const clean = String(email).trim().toLowerCase();
	const adminEmail = c?.env?.admin ? String(c.env.admin).trim().toLowerCase() : 'admin@epomail.bond';
	return Boolean(adminEmail) && clean === adminEmail;
}

export function isAdminUser(c, userRow) {
	if (!userRow || !userRow.email) return false;
	return isAdminEmail(c, userRow.email);
}

export default {
	isAdminEmail,
	isAdminUser
};
