import emailUtils from './email-utils.js';

export function isAdminEmail(c, email) {
	if (!email) return false;
	const clean = email.trim().toLowerCase();
	const adminEmail = c?.env?.admin ? c.env.admin.toLowerCase() : 'admin@epomail.bond';
	return clean === adminEmail;
}

export function isAdminUser(c, userRow) {
	if (!userRow) return false;
	if (userRow.userId === 1) return true;
	return isAdminEmail(c, userRow.email);
}

export default {
	isAdminEmail,
	isAdminUser
};
