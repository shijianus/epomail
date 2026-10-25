import { Hono } from 'hono';
const app = new Hono();

import result from '../model/result';
import { cors } from 'hono/cors';

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

app.onError((err, c) => {
	if (err?.name === 'BizError') {
		console.log(err.message);
		return c.json(result.fail(err.message, err.code));
	}

	// Internal database/provider errors can contain SQL fragments, binding
	// names or request parameters. Log them server-side, but never reflect the
	// raw message to the caller.
	console.error(err);
	return c.json(result.fail('Internal Server Error', 500));
});

export default app;
