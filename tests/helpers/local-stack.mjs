import { spawn, execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parseLocalStackReadyUrl } from './local-stack-runtime.mjs';

const helperDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(helperDir, '../..');
const execFileAsync = promisify(execFile);

// Wait for the child runtime to emit its validated loopback HTTP origin.
function awaitRuntimeUrl(child, signal, timeoutMs) {
	let stdoutBuffer = '';
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = fn => value => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal.removeEventListener('abort', onAbort);
			child.stdout.off('data', onStdout);
			child.stdout.off('end', onEnd);
			fn(value);
		};
		const consumeLine = line => {
			const readyUrl = parseLocalStackReadyUrl(line);
			if (readyUrl) finish(resolve)(readyUrl);
		};
		const onStdout = data => {
			stdoutBuffer += data.toString();
			const lines = stdoutBuffer.split(/\r?\n/);
			stdoutBuffer = lines.pop() ?? '';
			for (const line of lines) consumeLine(line);
		};
		const onEnd = () => {
			if (stdoutBuffer) consumeLine(stdoutBuffer);
		};
		const onAbort = () => finish(reject)(signal.reason || new Error('Local stack aborted before runtime ready'));
		const timer = setTimeout(() => finish(reject)(new Error(`Timed out waiting ${timeoutMs}ms for local runtime URL`)), timeoutMs);
		if (signal.aborted) {
			onAbort();
			return;
		}
		signal.addEventListener('abort', onAbort, { once: true });
		child.stdout.on('data', onStdout);
		child.stdout.on('end', onEnd);
	});
}

// Keep credentials, NODE_OPTIONS, proxy settings and Wrangler overrides out of
// the child. Its config, secrets, home, logs and persistent state are disposable.
export function localEnvironment(directory, source = process.env) {
	const env = Object.fromEntries(Object.entries(source).filter(([key]) =>
		/^(path|systemroot|windir|comspec|pathext|lang|lc_all|tz)$/i.test(key)
	));
	return {
		...env,
		HOME: directory,
		USERPROFILE: directory,
		APPDATA: directory,
		LOCALAPPDATA: directory,
		XDG_CONFIG_HOME: directory,
		XDG_CACHE_HOME: directory,
		XDG_STATE_HOME: directory,
		TMPDIR: directory,
		TEMP: directory,
		TMP: directory,
		CI: '1',
		BROWSER: 'none',
		NO_COLOR: '1',
		WRANGLER_SEND_METRICS: 'false',
		WRANGLER_LOG_PATH: path.join(directory, 'wrangler.log'),
		CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
		CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false'
	};
}

export async function writeLocalConfig(directory, workerDir, assetsDir = path.join(workerDir, 'dist'), workerEntry = path.join(workerDir, 'src/index.js'), prebuilt = false) {
	const secrets = {
		jwt_secret: randomBytes(32).toString('base64url'),
		totp_enc_key: randomBytes(32).toString('base64'),
		email_enc_key: randomBytes(32).toString('base64')
	};
	const moduleDir = prebuilt ? path.join(directory, 'modules') : directory;
	const entryPath = path.join(moduleDir, 'isolated-worker.mjs');
	let mainPath = path.resolve(workerEntry).replaceAll('\\', '/');
	if (prebuilt) {
		await fs.mkdir(moduleDir, { recursive: true });
		await fs.cp(path.dirname(mainPath), path.join(moduleDir, 'bundle'), { recursive: true });
		mainPath = './bundle/' + path.basename(mainPath);
	}
	await fs.writeFile(entryPath, `import worker from ${JSON.stringify(mainPath)};\nObject.defineProperty(globalThis, 'fetch', { value: async () => { throw new Error('External network is disabled in the isolated test worker'); }, writable: false, configurable: false });\nexport default worker;\n`, { mode: 0o600, flag: 'wx' });
	const configPath = path.join(directory, 'wrangler.json');
	await fs.writeFile(configPath, JSON.stringify({
		name: 'epomail-local-test',
		main: entryPath,
		...(prebuilt ? {
			no_bundle: true,
			base_dir: moduleDir,
			find_additional_modules: true,
			rules: [{ type: 'ESModule', globs: ['bundle/**/*.js'], fallthrough: true }]
		} : {}),
		compatibility_date: '2025-06-04',
		compatibility_flags: ['nodejs_als'],
		send_metrics: false,
		assets: {
			binding: 'assets',
			directory: path.resolve(assetsDir),
			not_found_handling: 'single-page-application',
			run_worker_first: true
		},
		d1_databases: [{
			binding: 'db',
			database_name: 'epomail-local-test',
			database_id: '00000000-0000-4000-8000-000000000000',
			remote: false
		}],
		kv_namespaces: [{ binding: 'kv', id: '00000000000000000000000000000000', remote: false }],
		vars: {
			DEV: 'true',
			ENVIRONMENT: 'smoke',
			EMAIL_OUTBOUND_ENABLED: 'false',
			OUTBOUND_WHITELIST_ENFORCE: 'true',
			OUTBOUND_WHITELIST: '',
			ALLOW_URL_INIT: 'false',
			ai_model: '',
			analysis_cache: false,
			orm_log: false,
			domain: ['example.com'],
			admin: 'admin@example.com'
		}
	}, null, 2), { mode: 0o600 });
	await fs.writeFile(path.join(directory, '.dev.vars'),
		Object.entries(secrets).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n',
		{ mode: 0o600 }
	);
	return { configPath, entryPath, secrets };
}

export async function verifyProductionAssets(workerDir, assetsDir = path.join(workerDir, 'dist')) {
	const directory = path.resolve(assetsDir);
	for (const entry of ['index.html', 'login/index.html']) {
		try {
			const html = await fs.readFile(path.join(directory, entry), 'utf8');
			const script = [...html.matchAll(/<script\b[^>]*>/gi)]
				.find(([tag]) => /\btype=["']module["']/.test(tag));
			const src = script?.[0].match(/\bsrc=["']([^"']+)["']/)?.[1];
			if (!src || !src.endsWith('.js') || html.includes('/@vite/client')) {
				throw new Error('expected a compiled module script');
			}
			const asset = src.startsWith('/')
				? path.resolve(directory, '.' + src)
				: path.resolve(directory, path.dirname(entry), src);
			const relative = path.relative(directory, asset);
			if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('asset is outside dist');
			await fs.access(asset);
		} catch (cause) {
			throw new Error(`Production dist is missing or incomplete (${entry}); run node scripts/build-prod.mjs first`, { cause });
		}
	}
}

// Attach before awaiting anything: spawn failures are asynchronous, and exit
// does not mean the inherited pipes (or descendants using them) have closed.
export function observeProcess(child) {
	const state = { closed: false, exited: false, error: null };
	state.failure = new Promise((_, reject) => {
		child.once('error', error => {
			state.error = error;
			reject(error);
		});
		child.once('exit', (code, signal) => {
			state.exited = true;
			reject(new Error(`Wrangler exited before cleanup (code=${code}, signal=${signal})`));
		});
		child.once('close', () => { state.closed = true; });
	});
	// Cleanup can happen before a caller races the failure promise.
	state.failure.catch(() => {});
	return state;
}

async function waitUntil(predicate, timeoutMs, pollMs) {
	const deadline = Date.now() + timeoutMs;
	do {
		if (await predicate()) return true;
		await delay(pollMs);
	} while (Date.now() < deadline);
	return Boolean(await predicate());
}

export async function hasLiveProcessGroupMembers(pid, {
	platform = process.platform,
	kill = process.kill.bind(process),
	exec = execFileAsync
} = {}) {
	if (platform === 'linux') {
		// kill(-pgid, 0) also succeeds for zombies, which cannot hold files or
		// respond to SIGKILL. Inspect the whole table so an absent group is not
		// confused with ps failing to select any processes (exit status 1).
		const { stdout } = await exec('/bin/ps', ['-eo', 'pgid=,stat='], {
			encoding: 'utf8', timeout: 5000
		});
		if (!stdout.trim()) throw new Error('Unable to inspect Linux process groups: empty ps output');
		let alive = false;
		for (const line of stdout.trim().split(/\r?\n/)) {
			const entry = /^\s*(\d+)\s+([A-Za-z][\w+<]*)\s*$/.exec(line);
			if (!entry) throw new Error('Unable to inspect Linux process groups: malformed ps output');
			if (Number(entry[1]) === pid && !/^[ZX]/.test(entry[2])) alive = true;
		}
		return alive;
	}
	try {
		kill(-pid, 0);
		return true;
	} catch (error) {
		if (error.code === 'ESRCH') return false;
		throw error;
	}
}

export async function stopProcessTree(child, state, {
	platform = process.platform,
	kill = process.kill.bind(process),
	exec = execFileAsync,
	graceMs = 5000,
	timeoutMs = 10000,
	pollMs = 50
} = {}) {
	if (!child?.pid) return; // A failed spawn has no tree to terminate.
	const pid = child.pid;
	if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) {
		throw new Error('Refusing to terminate an invalid local-stack PID');
	}
	if (platform === 'win32') {
		// Never use a shell or fall back to killing just the wrapper. A failed
		// taskkill cannot prove its descendants are gone, even if the root exited.
		const taskkill = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
		await exec(taskkill, ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: timeoutMs });
		if (!await waitUntil(() => state.closed, timeoutMs, pollMs)) {
			throw new Error(`Timed out waiting for local process tree ${pid} to close`);
		}
		return;
	}

	const signalGroup = signal => {
		try {
			kill(-pid, signal);
			return true;
		} catch (error) {
			if (error.code === 'ESRCH') return false;
			throw error;
		}
	};
	const stopped = async () => !(await hasLiveProcessGroupMembers(pid, { platform, kill, exec })) && state.closed;
	signalGroup('SIGTERM');
	if (await waitUntil(stopped, graceMs, pollMs)) return;
	signalGroup('SIGKILL');
	if (!await waitUntil(stopped, timeoutMs, pollMs)) {
		throw new Error(`Timed out waiting for local process group ${pid} to exit`);
	}
}

export async function removeTemporaryDirectory(directory, { rm = fs.rm, maxRetries = 10, retryDelay = 200 } = {}) {
	try {
		await rm(directory, { recursive: true, force: true, maxRetries, retryDelay });
	} catch (cause) {
		throw new Error(`Unable to remove local-stack directory ${directory}`, { cause });
	}
}

export async function cleanupLocalStackDirectory(directory, {
	removeDirectory = true,
	rm = fs.rm,
	removeDir = removeTemporaryDirectory
} = {}) {
	if (!directory) return;
	const errors = [];
	// Destroy the secret file independently, even when the process tree failed
	// to stop or another state file prevents directory removal. recursive enables
	// Node's rm retries for transient locks on this known disposable path.
	try {
		await rm(path.join(directory, '.dev.vars'), {
			recursive: true, force: true, maxRetries: 10, retryDelay: 200
		});
	} catch (cause) {
		errors.push(new Error(`Unable to remove local-stack secrets from ${directory}`, { cause }));
	}
	if (removeDirectory) {
		try { await removeDir(directory); } catch (error) { errors.push(error); }
	}
	if (errors.length) throw new AggregateError(errors, `Local-stack file cleanup failed for ${directory}`);
}

async function waitForLogin(base, signal, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		signal.throwIfAborted();
		try {
			const response = await fetch(`${base}/login/`, {
				signal: AbortSignal.any([signal, AbortSignal.timeout(5000)])
			});
			const html = await response.text();
			if (response.status === 200 && /<div id="root">/.test(html)) return;
		} catch (error) {
			if (signal.aborted) throw signal.reason;
		}
		await delay(200, undefined, { signal });
	}
	throw new Error(`Timed out waiting for the built login app at ${base}/login/`);
}

// Can also be held open for an official browser session. The caller owns stop()
// in finally; signals still request shutdown when no callback wrapper is used.
export async function startLocalStack({
	workerDir = path.join(root, 'mail-worker'),
	assetsDir = process.env.EPOMAIL_CANDIDATE_DIR ? path.resolve(process.env.EPOMAIL_CANDIDATE_DIR, 'dist') : path.join(workerDir, 'dist'),
	workerEntry = process.env.EPOMAIL_CANDIDATE_DIR ? path.resolve(process.env.EPOMAIL_CANDIDATE_DIR, 'bundle/index.js') : path.join(workerDir, 'src/index.js'),
	startupTimeoutMs = 180000
} = {}) {
	let directory, child, state, stopPromise;
	let starting = true;
	let log = '';
	let secrets = {};
	const cleanups = [];
	const controller = new AbortController();
	const interrupted = new Promise((_, reject) => {
		controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
	});
	interrupted.catch(() => {});
	const failureMessage = errors => {
		let tail = log;
		for (const secret of Object.values(secrets)) tail = tail.replaceAll(secret, '[redacted]');
		tail = tail.split(/\r?\n/).slice(-20).join('\n');
		return new AggregateError(errors, `Local full-stack run failed: ${errors.map(error => error.message).join('; ')}${tail ? `\n[wrangler tail]\n${tail}` : ''}`);
	};
	const stop = () => stopPromise ??= (async () => {
		const errors = [];
		controller.abort(new Error('Local stack is closing'));
		try {
			for (const cleanup of cleanups.reverse()) {
				try { await cleanup(); } catch (error) { errors.push(error); }
			}
			let stopped = true;
			try { await stopProcessTree(child, state); } catch (error) {
				stopped = false;
				errors.push(new Error(`Process-tree cleanup failed; state retained at ${directory}`, { cause: error }));
			}
			try { await cleanupLocalStackDirectory(directory, { removeDirectory: stopped }); }
			catch (error) { errors.push(error); }
		} finally {
			process.off('SIGINT', onInt);
			process.off('SIGTERM', onTerm);
		}
		if (errors.length) throw failureMessage(errors);
	})();
	const onSignal = signal => {
		process.exitCode = signal === 'SIGINT' ? 130 : 143;
		controller.abort(new Error(`Local full-stack run interrupted by ${signal}`));
		if (!starting) {
			stop().catch(error => {
				process.exitCode = 1;
				console.error(error.message);
			});
		}
	};
	const onInt = () => onSignal('SIGINT');
	const onTerm = () => onSignal('SIGTERM');
	// During startup, abort first and let its catch clean up after pending writes.
	// Once ready, signals also stop a stack held open for an official browser.
	process.on('SIGINT', onInt);
	process.on('SIGTERM', onTerm);
	try {
		await verifyProductionAssets(workerDir, assetsDir);
		const require = createRequire(path.join(workerDir, 'package.json'));
		require.resolve('wrangler');
		// Run Miniflare directly inside an isolated process without Wrangler's ProxyWorker hop:
		// ProxyWorker's workerd-to-workerd loopback pool hits Miniflare's 5s HTTP keep-alive close,
		// and Wrangler's ProxyWorker misclassifies non-root errors as mid-request restarts (503).
		const runtimeEntry = path.resolve(helperDir, 'local-stack-runtime.mjs');
		await fs.mkdir(os.tmpdir(), { recursive: true });
		directory = await fs.mkdtemp(path.join(os.tmpdir(), 'epomail-local-'));
		const config = await writeLocalConfig(directory, workerDir, assetsDir, workerEntry, Boolean(process.env.EPOMAIL_CANDIDATE_DIR));
		secrets = config.secrets;
		controller.signal.throwIfAborted();
		child = spawn(process.execPath, [
			'--no-warnings', '--experimental-vm-modules', runtimeEntry,
			config.configPath, path.join(directory, 'state'), workerDir
		], {
			cwd: directory,
			env: localEnvironment(directory),
			stdio: ['ignore', 'pipe', 'pipe'],
			shell: false,
			detached: process.platform !== 'win32',
			windowsHide: true
		});
		state = observeProcess(child);
		const collect = data => { log = (log + data.toString()).slice(-32768); };
		child.stdout.on('data', collect);
		child.stderr.on('data', collect);
		const startedAt = Date.now();
		const remainingStartupMs = () => Math.max(1_000, startupTimeoutMs - (Date.now() - startedAt));
		const runtimeUrlPromise = awaitRuntimeUrl(child, controller.signal, remainingStartupMs());
		const failure = Promise.race([state.failure, interrupted]);
		failure.catch(() => {});
		const base = await Promise.race([runtimeUrlPromise, failure]);
		await Promise.race([waitForLogin(base, controller.signal, remainingStartupMs()), failure]);
		controller.signal.throwIfAborted();
		starting = false;
		return {
			base,
			jwtSecret: secrets.jwt_secret,
			secret: secrets.jwt_secret,
			tempDir: directory,
			entryPath: config.entryPath,
			signal: controller.signal,
			failure,
			addCleanup: cleanup => {
				if (stopPromise) throw new Error('Cannot register a resource after local-stack shutdown');
				cleanups.push(cleanup);
			},
			stop
		};
	} catch (error) {
		const errors = [error];
		try { await stop(); } catch (cleanupError) { errors.push(cleanupError); }
		throw failureMessage(errors);
	}
}

// Own partial startup, callback failures and resource cleanup. A test cannot
// report success before both the process tree and the temporary state are gone.
export async function withLocalStack(run, options) {
	const stack = await startLocalStack(options);
	let value;
	const errors = [];
	try {
		value = await Promise.race([
			Promise.resolve().then(() => run(stack)),
			stack.failure
		]);
	} catch (error) {
		errors.push(error);
	} finally {
		try { await stack.stop(); } catch (error) { errors.push(error); }
	}
	if (errors.length) {
		throw new AggregateError(errors, errors.map(error => error.message).join('; '));
	}
	return value;
}
