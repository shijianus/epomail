import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const RATE_PREFIX = 'rate-limit:';

function clientIp(c) {
	// Only trust the header Cloudflare writes. X-Forwarded-For is caller
	// controlled and must not be used for a security decision.
	const ip = c?.req?.header ? c.req.header('CF-Connecting-IP') : null;
	return ip || 'local';
}

function rateKey(c, scope, subject) {
	return `${RATE_PREFIX}${scope}:${subject || clientIp(c)}`;
}

const rateLimit = {
	clientIp,

	async check(c, { scope, limit, windowSeconds, subject = null }) {
		if (!scope || !limit || !windowSeconds) return;
		const key = rateKey(c, scope, subject);
		const now = Date.now();
		const windowMs = windowSeconds * 1000;

		let entry = null;
		try {
			entry = await c.env.kv.get(key, { type: 'json' });
		} catch (_) {
			return;
		}

		if (!entry || typeof entry.count !== 'number' || typeof entry.resetAt !== 'number' || now >= entry.resetAt) {
			entry = { count: 0, resetAt: now + windowMs };
		}

		entry.count += 1;
		try {
			await c.env.kv.put(key, JSON.stringify(entry), {
				expirationTtl: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
			});
		} catch (_) {
			// KV is best-effort; a write failure must not take the API down.
		}

		if (entry.count > limit) {
			throw new BizError(t('tooManyRequests'), 429, 'rate_limited');
		}
	},

	async reset(c, { scope, subject = null }) {
		try {
			await c.env.kv.delete(rateKey(c, scope, subject));
		} catch (_) {}
	}
};

export default rateLimit;
