import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { assertLoopbackBase } from './load-runner.mjs';

// Chromium routing and Playwright's APIRequestContext have separate network
// stacks. A single allowlisted forward proxy covers both, including redirects.
export async function launchForLoopbackOrigin(chromium, origin, options = {}, identities = {}) {
	const base = assertLoopbackBase(origin);
	if (origin !== base && origin !== base + '/') throw new Error('Expected a single loopback origin');
	const target = new URL(base);
	if (options.proxy || options.ignoreDefaultArgs || (options.args ?? []).some(arg => /^--(?:no-proxy|proxy-|host-resolver-|force-webrtc-|enable-quic)/.test(arg))) {
		throw new Error('The local browser supplies its own network settings');
	}
	const sockets = new Set();
	const proxy = createServer((incoming, response) => {
		let url;
		try { url = new URL(incoming.url); } catch { /* refuse a non-proxy request */ }
		if (url?.origin !== target.origin || url.username || url.password) {
			response.writeHead(403).end();
			return;
		}
		const { 'proxy-authorization': ignoredAuth, 'proxy-connection': ignoredConnection, ...headers } = incoming.headers;
		const outgoing = request(url, { method: incoming.method, headers: { ...headers, host: target.host } }, upstream => {
			response.writeHead(upstream.statusCode, upstream.headers);
			upstream.pipe(response);
		});
		outgoing.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
		response.on('close', () => outgoing.destroy());
		incoming.pipe(outgoing);
	});
	proxy.on('upgrade', (incoming, client, head) => {
		let url;
		try { url = new URL(incoming.url); } catch { /* refuse an invalid upgrade */ }
		if (!url || !['ws:', 'http:'].includes(url.protocol) || url.host !== target.host || url.username || url.password) {
			client.destroy();
			return;
		}
		url.protocol = 'http:';
		const outgoing = request(url, { headers: { ...incoming.headers, host: target.host } });
		outgoing.on('upgrade', (res, upstream, data) => {
			client.write('HTTP/1.1 101 Switching Protocols\r\n' + res.rawHeaders.reduce((lines, val, i, list) =>
				i % 2 ? lines : lines + val + ': ' + list[i + 1] + '\r\n', '') + '\r\n');
			if (head.length) upstream.write(head);
			if (data.length) client.write(data);
			client.on('error', () => upstream.destroy());
			client.on('close', () => upstream.destroy());
			upstream.on('error', () => client.destroy());
			client.pipe(upstream).pipe(client);
		});
		outgoing.on('response', () => { client.destroy(); outgoing.destroy(); });
		outgoing.on('error', () => client.destroy());
		outgoing.end();
	});
	proxy.on('connection', socket => {
		sockets.add(socket);
		socket.once('close', () => sockets.delete(socket));
	});
	// Playwright's Node HTTP client uses CONNECT even for a plain HTTP target.
	proxy.on('connect', (req, client, head) => {
		if (req.url !== target.host) {
			client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
			return;
		}
		const upstream = connect(Number(target.port), target.hostname, () => {
			client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
			if (head.length) upstream.write(head);
			client.pipe(upstream).pipe(client);
		});
		upstream.on('error', () => client.destroy());
		client.on('error', () => upstream.destroy());
		client.on('close', () => upstream.destroy());
	});
	await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve); });
	const stop = () => { proxy.close(); for (const socket of sockets) socket.destroy(); };
	const settings = { server: 'http://127.0.0.1:' + proxy.address().port, bypass: '<-loopback>' };
	try {
		const browser = await chromium.launch({
			...options,
			...(process.env.EPOMAIL_CHROMIUM_PATH && !options.executablePath ? { executablePath: process.env.EPOMAIL_CHROMIUM_PATH } : {}),
			proxy: settings,
			args: [...(options.args ?? []), '--disable-background-networking', '--disable-quic',
				'--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost']
		});
		browser.once('disconnected', stop);
		const newContext = browser.newContext.bind(browser);
		browser.newContext = async (contextOptions = {}) => {
			if (contextOptions.proxy) throw new Error('The local browser supplies its own proxy');
			const context = await newContext({ ...contextOptions, proxy: settings });
			if (!Object.keys(identities).length) return context;
			await context.addInitScript(({ allowedOrigin, values }) => {
				if (location.origin !== allowedOrigin) return;
				for (const [name, value] of Object.entries(values)) {
					Object.defineProperty(globalThis, name, { value, writable: false, configurable: false });
				}
			}, { allowedOrigin: base, values: identities });
			return context;
		};
		return browser;
	} catch (error) {
		stop();
		throw error;
	}
}
