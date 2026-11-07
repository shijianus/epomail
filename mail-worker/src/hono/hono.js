import { Hono } from 'hono';
const app = new Hono();

import result from '../model/result';
import { cors } from 'hono/cors';
import safeLogger from '../utils/safe-logger';

const OAUTH_CORS_PATHS = new Set([
	'/oauth/token',
	'/api/oauth/token',
	'/oauth/userinfo',
	'/api/oauth/userinfo',
	'/oauth/openid-configuration',
	'/api/oauth/openid-configuration',
	'/.well-known/openid-configuration'
]);

function configuredOrigins(c) {
	const raw = c.env?.CORS_ORIGINS;
	if (Array.isArray(raw)) return raw.map(item => String(item).trim()).filter(Boolean);
	if (typeof raw === 'string') return raw.split(',').map(item => item.trim()).filter(Boolean);
	return [];
}

function resolveCorsOrigin(origin, c) {
	if (!origin) return null;
	try {
		const selfOrigin = new URL(c.req.url).origin;
		if (origin === selfOrigin) return origin;
	} catch (_) {}

	// OAuth token / userinfo / discovery endpoints are intentionally callable
	// by third-party browser clients. They never rely on cookies and the
	// Authorization header is explicit, so a wildcard is safe there.
	if (OAUTH_CORS_PATHS.has(c.req.path)) return '*';

	if (configuredOrigins(c).includes(origin)) return origin;
	return null;
}

app.use('*', cors({
	origin: resolveCorsOrigin,
	allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
	allowHeaders: [
		'Content-Type',
		'Authorization',
		'token',
		'x-device-tag',
		'x-device-trust',
		'x-init-secret',
		'x-requested-with'
	],
	maxAge: 600,
	credentials: false
}));

// API responses may contain mailbox contents and session metadata. Never let
// an intermediary or the browser cache them.
app.use('*', async (c, next) => {
	await next();
	c.header('Cache-Control', 'no-store');
});

export const errorHandler = (err, c) => {
	if (err?.name === 'BizError') {
		const rawCode = Number(err.code);
		const status = (Number.isInteger(rawCode) && rawCode >= 400 && rawCode <= 599) ? rawCode : 400;

		safeLogger.warn('BizError', {
			route: c?.req?.path,
			method: c?.req?.method,
			status,
			errorCode: err.errorCode,
			message: err.message
		});

		const body = result.fail(err.message, status, err.errorCode);
		if (typeof err.proofConsumed === 'boolean') body.proofConsumed = err.proofConsumed;
		if (err.retryAfter !== undefined) {
			c.header('Retry-After', String(err.retryAfter));
		}
		return c.json(body, status);
	}

	// Internal database/provider errors can contain SQL fragments, binding
	// names or request parameters. Log them safely server-side without secrets,
	// and never reflect the raw error message to the client.
	safeLogger.error('UnhandledException', {
		route: c?.req?.path,
		method: c?.req?.method,
		status: 500,
		error: err
	});

	return c.json(result.fail('Internal Server Error', 500, 'INTERNAL_SERVER_ERROR'), 500);
};

app.onError(errorHandler);

export default app;
