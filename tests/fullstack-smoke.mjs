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
 * Nothing outside the temporary persist directory is written, and that
 * directory is removed in `finally`. No credentials are printed.
 *
 * Usage: node tests/fullstack-smoke.mjs
 */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = path.join(root, 'mail-worker');
const pnpmBin = process.env.EPOMAIL_PNPM || (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');

function readSecret(name) {
	if (process.env[name]) return process.env[name];
	const varsFile = path.join(workerDir, '.dev.vars');
	if (!fs.existsSync(varsFile)) return '';
	const line = fs.readFileSync(varsFile, 'utf8')
		.split(/\r?\n/)
		.find(row => row.trim().startsWith(`${name}=`));
	if (!line) return '';
	return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
}

function freePort() {
	return new Promise((resolve, reject) => {
		const srv = createServer();
		srv.once('error', reject);
		srv.listen(0, '127.0.0.1', () => {
			const { port } = srv.address();
			srv.close(() => resolve(port));
		});
	});
}

async function waitFor(url, timeoutMs = 180000) {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
			if (res.status < 500) return;
		} catch (_) {}
		await new Promise(r => setTimeout(r, 1000));
	}
	throw new Error(`timed out waiting for ${url}`);
}

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

const jwtSecret = readSecret('jwt_secret');
if (!jwtSecret) {
	console.error('BLOCKED: jwt_secret is not present in the environment or mail-worker/.dev.vars');
	process.exit(2);
}

const distIndex = path.join(workerDir, 'dist', 'index.html');
if (!fs.existsSync(distIndex)) {
	console.error('BLOCKED: mail-worker/dist is missing; run `node scripts/build-prod.mjs` first');
	process.exit(2);
}

const persistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epomail-smoke-'));
const port = await freePort();
const base = `http://127.0.0.1:${port}`;

const args = [
	'exec', 'wrangler', 'dev',
	'--config', 'wrangler-dev.toml',
	'--ip', '127.0.0.1',
	'--port', String(port),
	'--persist-to', persistDir,
	'--var', 'EMAIL_OUTBOUND_ENABLED:false',
	'--var', 'OUTBOUND_WHITELIST_ENFORCE:true',
	'--var', 'ENVIRONMENT:smoke'
];

let child;
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

try {
	child = spawn(pnpmBin, args, {
		cwd: workerDir,
		stdio: ['ignore', 'pipe', 'pipe'],
		shell: process.platform === 'win32',
		env: { ...process.env, CI: '1' }
	});
	let log = '';
	child.stdout.on('data', d => { log += d.toString(); });
	child.stderr.on('data', d => { log += d.toString(); });
	child.on('exit', code => {
		if (code !== 0 && code !== null) {
			const tail = log.split(/\r?\n/).slice(-25).join('\n');
			process.stderr.write(`[wrangler dev exited ${code}]\n${tail}\n`);
		}
	});

	await waitFor(`${base}/login/`);

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

	console.log(results.join('\n'));
	console.log(`\n${results.length}/${results.length} full-stack checks passed`);
} finally {
	if (child && child.pid) {
		try {
			if (process.platform === 'win32') {
				execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
			} else {
				process.kill(-child.pid, 'SIGKILL');
			}
		} catch (_) {
			try { child.kill('SIGKILL'); } catch (_) {}
		}
	}
	for (let i = 0; i < 30; i++) {
		try {
			fs.rmSync(persistDir, { recursive: true, force: true });
			break;
		} catch (_) {
			await new Promise(r => setTimeout(r, 500));
		}
	}
}
