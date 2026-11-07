/**
 * Local full-stack smoke test: real workerd via `wrangler dev`, a throwaway
 * D1/KV persistence directory, and the production frontend build served from
 * mail-worker/dist.
 *
 * What it proves that the unit suites cannot:
 *   - a cold database bootstraps through POST /api/init alone (no manual SQL);
 *   - the site owner is created and can sign in through the real login route;
 *   - the API contracts the frontends depend on answer with the expected shape
 *     after the Stage 1 backend hardening (websiteConfig, OAuth fail-closed,
 *     sidebar counters, account list, list);
 *   - the outbound gate rejects站外 recipients with 403 outbound_disabled;
 *   - an unauthenticated request is a 401, and /login/ serves the built app.
 *
 * Wrangler configuration, generated test secrets and all local state live in
 * one temporary directory. Process-tree shutdown and directory removal must
 * both succeed before the run is reported as passing. No credentials are printed.
 *
 * Usage: node tests/fullstack-smoke.mjs
 */
import assert from 'node:assert/strict';
import { withLocalStack } from './helpers/local-stack.mjs';

async function call(base, pathname, options = {}) {
	const res = await fetch(base + pathname, {
		...options,
		headers: {
			...(options.body ? { 'content-type': 'application/json' } : {}),
			...(options.headers || {})
		},
		signal: AbortSignal.timeout(30000)
	});
	const body = await res.text();
	let json = null;
	try { json = JSON.parse(body); } catch (_) {}
	return { status: res.status, body, json };
}

const results = [];
function check(name, fn) {
	try {
		fn();
		results.push(`PASS ${name}`);
	} catch (err) {
		results.push(`FAIL ${name}: ${err.message}`);
		throw err;
	}
}

await withLocalStack(async ({ base, jwtSecret }) => {

	// 1. Cold start: the only bootstrap call is /api/init with the secret header.
	const init1 = await call(base, '/api/init', {
		method: 'POST',
		headers: { 'x-init-secret': jwtSecret }
	});
	check('cold init succeeds', () => {
		assert.equal(init1.status, 200, init1.body.slice(0, 200));
		assert.match(init1.body, /success/i);
	});
	const passwordMatch = init1.body.match(/Initial admin password:\s*(\S+)/);
	check('init returns a one-time admin password in development', () => {
		assert.ok(passwordMatch, init1.body.slice(0, 200));
	});
	const adminPassword = passwordMatch[1];

	// 2. Idempotency: running init again must not fail or reseed over the owner.
	const init2 = await call(base, '/api/init', {
		method: 'POST',
		headers: { 'x-init-secret': jwtSecret }
	});
	check('init is idempotent', () => {
		assert.equal(init2.status, 200, init2.body.slice(0, 200));
	});

	// 3. The seeded owner signs in through the real login route.
	const login = await call(base, '/api/login', {
		method: 'POST',
		body: JSON.stringify({ email: 'admin@example.com', password: adminPassword })
	});
	check('site owner login returns a session token', () => {
		assert.equal(login.json?.code, 200, login.body.slice(0, 300));
		assert.ok(login.json?.data?.token, 'missing token');
	});
	const token = login.json.data.token;
	const auth = { token };

	// 4. Public website config drives the login UI (OAuth switches included).
	const config = await call(base, '/api/setting/websiteConfig');
	check('websiteConfig exposes OAuth switches', () => {
		assert.equal(config.json?.code, 200);
		assert.equal(config.json.data.oauthLoginEnabled, 0);
		assert.equal(typeof config.json.data.oauthProviders, 'object');
	});

	// 5. OAuth is disabled server-side, not just hidden client-side.
	const providers = await call(base, '/api/oauth/providers');
	check('oauth providers list answers', () => {
		assert.equal(providers.json?.code, 200);
		assert.ok(Array.isArray(providers.json.data));
	});
	const authorize = await call(base, '/api/oauth/authorize/github?redirect_uri=&state=x');
	check('oauth authorize fails closed while disabled', () => {
		assert.equal(authorize.json?.code, 403, authorize.body.slice(0, 200));
		assert.equal(authorize.json?.errorCode, 'oauth_disabled');
	});

	// 6. Mailbox endpoints the frontend renders from.
	const stats = await call(base, '/api/email/sidebarStats', { headers: auth });
	check('sidebarStats returns counters', () => {
		assert.equal(stats.json?.code, 200, stats.body.slice(0, 300));
		assert.equal(typeof stats.json.data.inboxUnread, 'number');
		assert.equal(typeof stats.json.data.labelStats, 'object');
	});
	const list = await call(base, '/api/email/list?size=10&type=0', { headers: auth });
	check('email list returns a page', () => {
		assert.equal(list.json?.code, 200, list.body.slice(0, 300));
		assert.ok(Array.isArray(list.json.data.list));
	});
	const accounts = await call(base, '/api/account/list', { headers: auth });
	check('account list contains the seeded mailbox', () => {
		assert.equal(accounts.json?.code, 200, accounts.body.slice(0, 300));
		const rows = Array.isArray(accounts.json.data) ? accounts.json.data : accounts.json.data.list;
		assert.ok(Array.isArray(rows) && rows.length > 0, 'no account rows');
	});
	const accountRows = Array.isArray(accounts.json.data) ? accounts.json.data : accounts.json.data.list;

	// 7. Outbound gate rejects an external recipient before any provider call.
	const send = await call(base, '/api/email/send', {
		method: 'POST',
		headers: auth,
		body: JSON.stringify({
			accountId: accountRows[0].accountId,
			receiveEmail: ['outside@not-in-domain.test'],
			subject: 'smoke',
			content: '<p>smoke</p>',
			text: 'smoke',
			sendType: 0,
			attachments: []
		})
	});
	check('outbound gate returns 403 outbound_disabled', () => {
		assert.equal(send.json?.code, 403, send.body.slice(0, 300));
		assert.equal(send.json?.errorCode, 'outbound_disabled');
	});

	// 8. Session expiry path used by both frontends.
	const anonymous = await call(base, '/api/email/list?size=1&type=0');
	check('unauthenticated request is rejected with 401', () => {
		const is401 = anonymous.status === 401 || anonymous.json?.code === 401;
		assert.ok(is401, `status=${anonymous.status} body=${anonymous.body.slice(0, 200)}`);
	});

	// 9. The built login app is actually served by the Worker.
	const loginPage = await fetch(`${base}/login/`);
	const loginHtml = await loginPage.text();
	check('built login app is served at /login/', () => {
		assert.equal(loginPage.status, 200);
		assert.match(loginHtml, /<div id="root">/);
	});

});

console.log(results.join('\n'));
console.log(`\n${results.length}/${results.length} full-stack checks passed (cleanup complete)`);
