import BizError from '../error/biz-error.js';

const SANDBOX_RECIPIENTS = ['delivered@resend.dev', 'bounced@resend.dev', 'complained@resend.dev'];

export function assertOutboundAllowed(c, recipients, { domains = [] } = {}) {
	const env = c?.env || {};
	if (!Array.isArray(recipients) || !recipients.length || recipients.length > 100) {
		throw new BizError('Invalid outbound recipient list', 400, 'invalid_recipient');
	}
	const addresses = recipients.map(value => typeof value === 'string' ? value.trim().toLowerCase() : '');
	if (addresses.some(value => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value))) {
		throw new BizError('Invalid outbound recipient address', 400, 'invalid_recipient');
	}
	const localDomains = new Set(domains.map(value => String(value).trim().toLowerCase().replace(/^@/, '')));
	const external = addresses.filter(value => !localDomains.has(value.slice(value.lastIndexOf('@') + 1)));
	if (!external.length) return;

	// Callers dispatching through a provider must not supply local domains: even
	// a same-domain security notice leaves the instance when sent by a provider.
	const enabled = env.EMAIL_OUTBOUND_ENABLED;
	if (enabled !== undefined && String(enabled).trim().toLowerCase() !== 'true') {
		throw new BizError('External email outbound is disabled in this environment', 403, 'outbound_disabled');
	}
	const enforce = String(env.ENVIRONMENT || '').trim().toLowerCase() === 'staging'
		|| String(env.OUTBOUND_WHITELIST_ENFORCE || '').trim().toLowerCase() === 'true';
	if (!enforce) return;
	const allowed = new Set([
		...SANDBOX_RECIPIENTS,
		...String(env.OUTBOUND_WHITELIST || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
	]);
	if (external.some(address => !allowed.has(address))) {
		throw new BizError('External recipient is not in the outbound whitelist', 403, 'outbound_recipient_blocked');
	}
}
