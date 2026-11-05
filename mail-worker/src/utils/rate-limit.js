import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import { getUserDb } from './db-accessor.js';

const RATE_PREFIX = 'rate-limit:';
const SENSITIVE_SCOPE = /^(login|login-totp|register|security-|oauth-|oidc-|initial-password)/;

function clientIp(c) {
	// Only trust the header Cloudflare writes. X-Forwarded-For is caller
	// controlled and must not be used for a security decision.
	const ip = c?.req?.header ? c.req.header('CF-Connecting-IP') : null;
	return ip || 'local';
}

function rateKey(c, scope, subject) {
	return `${RATE_PREFIX}${scope}:${subject || clientIp(c)}`;
}

function durableCountersEnabled(c) {
	// Tests share one D1 database across files; a real fixed-window counter
	// would leak login attempts between unrelated specs. Production and
	// staging always use D1.
	return String(c?.env?.ENVIRONMENT || '').toLowerCase() !== 'test';
}

/**
 * Atomic fixed-window counter. D1's ON CONFLICT update is the only place a
 * concurrent burst can mutate the count, so two simultaneous login attempts
 * cannot both observe "under the limit" and then overwrite each other.
 */
async function incrementD1(c, scope, subject, windowSeconds) {
	const db = getUserDb(c);
	if (!db?.prepare) throw new Error('D1 rate-limit storage is unavailable');
	const now = Math.floor(Date.now() / 1000);
	const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
	const expiresAt = windowStart + windowSeconds;
	const row = await db.prepare(`
		INSERT INTO rate_limit_counter (scope, subject, window_start, count, expires_at)
		VALUES (?, ?, ?, 1, ?)
		ON CONFLICT(scope, subject, window_start)
		DO UPDATE SET count = count + 1
		RETURNING count
	`).bind(scope, subject, windowStart, expiresAt).first();
	const count = Number(row?.count);
	if (!Number.isSafeInteger(count) || count < 1) throw new Error('Rate-limit counter did not return a count');
	return count;
}

async function checkKv(c, key, limit, windowSeconds, failClosed) {
	const now = Date.now();
	const windowMs = windowSeconds * 1000;
	let entry;
	try {
		entry = await c.env.kv.get(key, { type: 'json' });
	} catch (_) {
		if (failClosed) throw new BizError('Rate limit storage is unavailable', 503, 'rate_limit_unavailable');
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
		// A failed KV write must not silently grant unlimited attempts on a
		// sensitive path. Non-sensitive best-effort limits keep their old
		// availability behavior.
		if (failClosed) throw new BizError('Rate limit storage is unavailable', 503, 'rate_limit_unavailable');
	}
	if (entry.count > limit) {
		throw new BizError(t('tooManyRequests'), 429, 'rate_limited');
	}
}

const rateLimit = {
	clientIp,

	async check(c, { scope, limit, windowSeconds, subject = null }) {
		if (!scope || !limit || !windowSeconds) return;
		const keySubject = subject || clientIp(c);
		const failClosed = SENSITIVE_SCOPE.test(scope);
		if (!durableCountersEnabled(c)) {
			await checkKv(c, rateKey(c, scope, keySubject), limit, windowSeconds, failClosed);
			return;
		}
		try {
			const count = await incrementD1(c, scope, keySubject, windowSeconds);
			if (count > limit) {
				throw new BizError(t('tooManyRequests'), 429, 'rate_limited');
			}
			return;
		} catch (error) {
			if (error instanceof BizError) throw error;
			// Sensitive paths must not silently downgrade to non-atomic KV just
			// because the migration has not run yet. Deployment runs /api/init,
			// which installs rate_limit_counter.
			if (failClosed) {
				throw new BizError('Rate limit storage is unavailable', 503, 'rate_limit_unavailable');
			}
		}
		await checkKv(c, rateKey(c, scope, keySubject), limit, windowSeconds, failClosed);
	},

	async reset(c, { scope, subject = null }) {
		const keySubject = subject || clientIp(c);
		if (durableCountersEnabled(c)) {
			try {
				const db = getUserDb(c);
				if (db?.prepare) {
					await db.prepare('DELETE FROM rate_limit_counter WHERE scope = ? AND subject = ?')
						.bind(scope, keySubject).run();
				}
			} catch (_) {}
		}
		try {
			await c.env.kv.delete(rateKey(c, scope, keySubject));
		} catch (_) {}
	}
};

export default rateLimit;
