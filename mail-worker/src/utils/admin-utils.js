import emailUtils from './email-utils.js';

export function isAdminEmail(c, email) {
	if (!email) return false;
	const clean = email.trim().toLowerCase();
	return !!(c?.env?.admin && clean === c.env.admin.toLowerCase());
}

export function isAdminUser(c, userRow) {
	if (!userRow) return false;
	if (userRow.userId === 1 && userRow.email?.toLowerCase() === c?.env?.admin?.toLowerCase()) return true;
	return isAdminEmail(c, userRow.email);
}

export default {
	isAdminEmail,
	isAdminUser
};
