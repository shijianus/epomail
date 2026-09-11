import emailUtils from './email-utils.js';

export function isAdminEmail(c, email) {
	if (!email) return false;
	const clean = email.trim().toLowerCase();
	if (c?.env?.admin && clean === c.env.admin.toLowerCase()) return true;
	const adminLocal = c?.env?.admin ? emailUtils.getName(c.env.admin).toLowerCase() : 'admin';
	const local = emailUtils.getName(clean).toLowerCase();
	const domain = emailUtils.getDomain(clean);
	const configuredDomains = Array.isArray(c?.env?.domain) ? c.env.domain : (c?.env?.domain ? [c.env.domain] : []);
	return local === adminLocal && configuredDomains.includes(domain);
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
