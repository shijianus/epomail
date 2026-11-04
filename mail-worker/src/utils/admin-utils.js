import emailUtils from './email-utils.js';

export function isAdminEmail(c, email) {
	if (!email) return false;
	const clean = String(email).trim().toLowerCase();
	// Fail closed when the deployment omitted its owner identity. A hard-coded
	// fallback would make a public address the owner on a typo/misconfiguration.
	const adminEmail = c?.env?.admin ? String(c.env.admin).trim().toLowerCase() : '';
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
