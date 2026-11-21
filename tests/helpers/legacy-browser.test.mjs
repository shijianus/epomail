import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { chromium } from 'playwright';

async function listen(handler) {
	const server = createServer(handler);
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	return { server, origin: 'http://127.0.0.1:' + server.address().port,
		close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}

test('Chromium and its API clients only reach the selected local stack, including after redirects', async t => {
	const escaped = [];
	const denied = await listen((req, res) => { escaped.push(req.url); res.end('unexpected'); });
	t.after(denied.close);
	denied.server.on('upgrade', (req, socket) => { escaped.push(req.url); socket.destroy(); });
	const local = await listen((req, res) => {
		if (req.url === '/jump') return res.writeHead(302, { Location: denied.origin + '/redirected' }).end();
		if (req.url === '/same') return res.writeHead(302, { Location: '/ok' }).end();
		res.end('local fixture');
	});
	t.after(local.close);
	local.server.on('upgrade', (req, socket) => {
		const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
		socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
		socket.end(Buffer.from([0x81, 0x02, 0x6f, 0x6b]));
	});

	process.env.EPOMAIL_TEST_ORIGIN = local.origin;
	const { launchIsolatedChromium } = await import('./legacy-browser.mjs');
	const browser = await launchIsolatedChromium(chromium, { headless: true });
	try {
		const page = await browser.newPage();
		assert.equal((await page.goto(local.origin + '/same')).status(), 200);
		assert.equal(await page.locator('body').innerText(), 'local fixture');
		const identity = await page.evaluate(() => ({
			origin: globalThis.legacyOrigin,
			readonly: ['legacyOrigin', 'legacyAdminEmail', 'legacyUserEmail'].every(key =>
				Object.getOwnPropertyDescriptor(globalThis, key)?.writable === false)
		}));
		assert.deepEqual(identity, { origin: local.origin, readonly: true });
		const other = await browser.newContext();
		const api = other.request;
		assert.equal(await (await api.get(local.origin + '/same')).text(), 'local fixture');
		for (const url of [denied.origin + '/direct', local.origin + '/jump']) {
			for (const fetch of [() => page.goto(url), () => page.request.get(url), () => api.get(url)]) {
				const outcome = await fetch().catch(() => null);
				assert.ok(!outcome || outcome.status() >= 400, 'Off-origin request was allowed');
			}
		}
		const opened = await page.evaluate(async origins => {
			return Promise.all(origins.map(origin => new Promise(resolve => {
				const socket = new WebSocket(origin.replace('http:', 'ws:') + '/events');
				socket.onmessage = event => { resolve(event.data); socket.close(); };
				socket.onerror = () => resolve('blocked');
			})));
		}, [local.origin, denied.origin]);
		assert.deepEqual(opened, ['ok', 'blocked']);
		assert.deepEqual(escaped, []);
	} finally { await browser.close(); }
});
