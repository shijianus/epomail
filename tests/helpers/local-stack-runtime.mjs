import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const READY_URL_PREFIX = 'EPOMAIL_LOCAL_STACK_URL=';

/**
 * Validate and format a Miniflare user-worker loopback origin from DevEnv parts.
 */
export function formatLoopbackWorkerUrl(parts) {
	if (!parts || typeof parts !== 'object') return null;
	const protocol = parts.protocol || 'http:';
	const hostname = parts.hostname;
	const port = Number(parts.port);
	if (protocol !== 'http:' || hostname !== '127.0.0.1' || !Number.isInteger(port) || port < 1 || port > 65535) {
		return null;
	}
	return `http://127.0.0.1:${port}`;
}

/**
 * Parse a ready-URL status line emitted by local-stack-runtime.
 */
export function parseLocalStackReadyUrl(line) {
	if (typeof line !== 'string' || !line.startsWith(READY_URL_PREFIX)) return null;
	const candidate = line.slice(READY_URL_PREFIX.length).trim();
	if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(candidate)) return null;
	const parsed = new URL(candidate);
	return formatLoopbackWorkerUrl({
		protocol: parsed.protocol,
		hostname: parsed.hostname,
		port: parsed.port
	});
}

/**
 * Create a lightweight Wrangler DevEnv proxy controller that exposes the
 * direct Miniflare user-worker HTTP listener without launching Wrangler's
 * secondary ProxyWorker/InspectorProxyWorker hop.
 */
export function createDirectProxyController({ onUrl } = {}) {
	let resolveReady;
	let rejectReady;
	let settled = false;
	let lastUrl = null;
	const promise = new Promise((resolve, reject) => {
		resolveReady = resolve;
		rejectReady = reject;
	});
	// Attach no-op rejection handler so early teardown never triggers unhandledRejection.
	promise.catch(() => {});

	return {
		ready: {
			promise,
			resolve: resolveReady,
			reject: rejectReady
		},
		async onBundleStart() {},
		async onBundleComplete() {},
		async onReloadStart() {},
		onReloadComplete(event) {
			const url = formatLoopbackWorkerUrl(event?.proxyData?.userWorkerUrl);
			if (!url) return;
			if (url !== lastUrl) {
				lastUrl = url;
				onUrl?.(url);
			}
			if (!settled) {
				settled = true;
				resolveReady({ proxyWorker: null, userWorkerUrl: url });
			}
		},
		async onConfigUpdate() {},
		async onPreviewSessionStart() {},
		async onPreviewSessionEnd() {},
		async teardown() {
			if (!settled) {
				settled = true;
				rejectReady(new Error('Local stack runtime stopped before becoming ready'));
			}
		}
	};
}

async function run() {
	const [, , configPath, persistDir, workerDir] = process.argv;
	if (!configPath || !persistDir || !workerDir) {
		throw new Error('Usage: local-stack-runtime.mjs <configPath> <persistDir> <workerDir>');
	}
	const require = createRequire(path.join(workerDir, 'package.json'));
	const { unstable_DevEnv } = await import(pathToFileURL(require.resolve('wrangler')).href);

	let devEnv;
	let shuttingDown = false;
	const shutdown = async (code = 0) => {
		if (shuttingDown) return;
		shuttingDown = true;
		try {
			await devEnv?.teardown();
		} catch (error) {
			process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
			process.exitCode = 1;
		}
		process.exit(process.exitCode ?? code);
	};

	process.on('SIGINT', () => { void shutdown(0); });
	process.on('SIGTERM', () => { void shutdown(0); });

	const controller = createDirectProxyController({
		onUrl: url => {
			process.stdout.write(`${READY_URL_PREFIX}${url}\n`);
		}
	});
	devEnv = new unstable_DevEnv({
		proxyFactory: () => controller
	});
	devEnv.on('error', event => {
		const message = event?.cause?.message || event?.reason || 'Unknown DevEnv runtime error';
		process.stderr.write(`Local stack DevEnv error (${event?.source || 'unknown'}): ${message}\n`);
		controller.ready.reject(event?.cause instanceof Error ? event.cause : new Error(message));
	});

	try {
		await devEnv.config.set({
			config: configPath,
			dev: {
				remote: false,
				server: { hostname: '127.0.0.1', port: 0 },
				inspector: false,
				liveReload: false,
				persist: persistDir,
				logLevel: 'warn'
			}
		}, true);

		await controller.ready.promise;
		// Stay alive serving requests until parent sends SIGTERM/SIGINT.
		await new Promise(() => {});
	} catch (error) {
		await devEnv?.teardown().catch(() => {});
		throw error;
	}
}

const isDirectRun = Boolean(
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
);
if (isDirectRun) {
	run().catch(error => {
		process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
		process.exit(1);
	});
}
