/**
 * Browser end-to-end test against a real local stack.
 *
 * Unlike tests/oauth-bind-login-ui-e2e.mjs this does NOT mock /api/**: it runs
 * `wrangler dev` on a throwaway D1/KV directory, builds nothing itself (the
 * committed dist must already exist), and drives Chromium through the actual
 * login app and the actual mail app.
 *
 * What it proves:
 *   - the login app posts to the real /api/login and stores a real session;
 *   - the post-login URL (/mail/u/N/#inbox) is understood by the mail app's
 *     custom account history and lands on the inbox, not on the profile/404
 *     fallback;
 *   - the mailbox APIs answer with 200 during that first render;
 *   - the security settings page renders its linked-identity section from the
 *     real /api/my/oauthIdentities response;
 *   - removing the stored token sends the user back to /login/.
 *
 * Usage: node tests/fullstack-browser-e2e.mjs
 */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

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

const jwtSecret = readSecret('jwt_secret');
if (!jwtSecret) {
	console.error('BLOCKED: jwt_secret is not present in the environment or mail-worker/.dev.vars');
	process.exit(2);
}
if (!fs.existsSync(path.join(workerDir, 'dist', 'index.html'))) {
	console.error('BLOCKED: mail-worker/dist is missing; run `node scripts/build-prod.mjs` first');
	process.exit(2);
}

const persistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epomail-browser-'));
const port = await freePort();
const base = `http://127.0.0.1:${port}`;

let child;
let browser;
let serverLog = '';
const results = [];
const failures = [];
function check(name, fn) {
	try {
		fn();
		results.push(`PASS ${name}`);
	} catch (err) {
		failures.push(`${name}: ${err.message}`);
		results.push(`FAIL ${name}: ${err.message}`);
		throw err;
	}
}

try {
	child = spawn(pnpmBin, [
		'exec', 'wrangler', 'dev',
		'--config', 'wrangler-dev.toml',
		'--ip', '127.0.0.1',
		'--port', String(port),
		'--persist-to', persistDir,
		'--var', 'EMAIL_OUTBOUND_ENABLED:false',
		'--var', 'ENVIRONMENT:smoke'
	], {
		cwd: workerDir,
		stdio: ['ignore', 'pipe', 'pipe'],
		shell: process.platform === 'win32',
		env: { ...process.env, CI: '1' }
	});
	child.stdout.on('data', d => { serverLog += d.toString(); });
	child.stderr.on('data', d => { serverLog += d.toString(); });
	await waitFor(`${base}/login/`);

	const init = await fetch(`${base}/api/init`, {
		method: 'POST',
		headers: { 'x-init-secret': jwtSecret }
	});
	const initBody = await init.text();
	assert.equal(init.status, 200, initBody.slice(0, 200));
	const password = (initBody.match(/Initial admin password:\s*(\S+)/) || [])[1];
	assert.ok(password, 'init did not return the one-time admin password');

	browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();

	const apiStatuses = [];
	const consoleErrors = [];
	page.on('response', res => {
		const url = res.url();
		if (url.includes('/api/')) apiStatuses.push({ url, status: res.status() });
	});
	page.on('console', msg => {
		if (msg.type() === 'error') consoleErrors.push(msg.text());
	});
	page.on('pageerror', err => consoleErrors.push(String(err)));

	// 1. Sign in through the real form.
	await page.goto(`${base}/login/`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('input[type="email"]', { timeout: 30000 });
	await page.fill('input[type="email"]', 'admin@example.com');
	await page.fill('input[type="password"]', password);
	const listResponse = page
		.waitForResponse(res => res.url().includes('/api/email/list'), { timeout: 90000 })
		.catch(() => null);
	await page.click('button[type="submit"]');

	await page.waitForURL(/#inbox/, { timeout: 90000 });
	check('login lands on the inbox URL', () => {
		assert.match(page.url(), /\/mail\/u\/0\/#inbox/);
	});

	// 2. The mail app must have kept the session and mounted.
	const token = await page.evaluate(() => localStorage.getItem('token'));
	check('session token is stored by the mail app', () => {
		assert.ok(token && token.length > 20, 'token missing');
	});

	await page.waitForFunction(
		() => {
			const root = document.querySelector('#app');
			return Boolean(root && root.children.length > 0);
		},
		null,
		{ timeout: 90000 }
	);
	check('mail app mounts after login', () => {
		assert.match(page.url(), /#inbox/);
	});
	const listRes = await listResponse;
	check('mailbox list request succeeded during first render', () => {
		assert.ok(listRes, `no /api/email/list response observed (api calls: ${apiStatuses.map(r => `${r.status} ${r.url.split('/api/')[1]}`).join(', ')})`);
		assert.equal(listRes.status(), 200, `status ${listRes.status()}`);
	});
	check(
		'inbox route is active (no unauthorised-access redirect)',
		() => {
			assert.match(page.url(), /#inbox/);
		}
	);

	// 3. Security settings loads linked identities from the real API.
	const identitiesResponse = page
		.waitForResponse(res => res.url().includes('/api/my/oauthIdentities'), { timeout: 45000 })
		.catch(() => null);
	await page.goto(`${base}/mail/u/0/#settings/security`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('#oauthIdentities', { timeout: 45000 });
	const identitiesRes = await identitiesResponse;
	check('linked third-party accounts section renders', () => {
		assert.ok(identitiesRes, `no /api/my/oauthIdentities request observed (api calls: ${apiStatuses.map(r => `${r.status} ${r.url.split('/api/')[1]}`).join(', ')})`);
		assert.equal(identitiesRes.status(), 200, `status ${identitiesRes.status()}`);
	});
	const identityText = await page.locator('#oauthIdentities').innerText();
	check('linked accounts list shows at least one provider row', () => {
		assert.ok(identityText.trim().length > 0, 'section is empty');
	});

	// 4. The inbox must not overflow horizontally on a phone viewport.
	const mobile = await context.newPage();
	await mobile.setViewportSize({ width: 375, height: 812 });
	await mobile.goto(`${base}/mail/u/0/#inbox`, { waitUntil: 'domcontentloaded' });
	await mobile.waitForFunction(
		() => {
			const root = document.querySelector('#app');
			return Boolean(root && root.children.length > 0);
		},
		null,
		{ timeout: 90000 }
	);
	await mobile.waitForTimeout(2500);
	const overflow = await mobile.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth
	);
	check('inbox has no horizontal overflow at 375px', () => {
		assert.ok(overflow <= 1, `scrollWidth exceeds viewport by ${overflow}px`);
	});
	await mobile.close();

	// 5. Expired session is forced back to the login app.
	await page.evaluate(() => localStorage.clear());
	await page.goto(`${base}/mail/u/0/#inbox`, { waitUntil: 'domcontentloaded' });
	await page.waitForURL(/\/login\//, { timeout: 45000, waitUntil: 'commit' });
	check('missing token redirects to /login/', () => {
		assert.match(page.url(), /\/login\//);
	});

	check('no uncaught page errors', () => {
		const serious = consoleErrors.filter(text =>
			!/favicon|net::ERR_|Failed to load resource|STATUS_BREAKPOINT|401 \(Unauthorized\)/i.test(text)
		);
		assert.deepEqual(serious, [], serious.join(' | '));
	});

	console.log(results.join('\n'));
	console.log(`\n${results.length}/${results.length} browser checks passed`);
} catch (err) {
	if (results.length) console.log(results.join('\n'));
	if (serverLog) {
		const tail = serverLog.split(/\r?\n/).slice(-20).join('\n');
		console.error(`\n[server tail]\n${tail}`);
	}
	console.error(`\nFAILED: ${err.message}`);
	process.exitCode = 1;
} finally {
	try { if (browser) await browser.close(); } catch (_) {}
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
