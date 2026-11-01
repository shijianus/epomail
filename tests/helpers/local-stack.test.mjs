import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once, EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import {
	localEnvironment, writeLocalConfig, verifyProductionAssets,
	observeProcess, stopProcessTree, removeTemporaryDirectory
} from './local-stack.mjs';

const missingProcess = () => Object.assign(new Error('no such process'), { code: 'ESRCH' });

async function withDirectory(run) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'epomail-helper-test-'));
	try { return await run(directory); }
	finally { await removeTemporaryDirectory(directory); }
}

test('config uses only local dummy bindings and absolute repository assets; each run has fresh secrets', async () => {
	await withDirectory(async directory => {
		const workerDir = path.join(directory, 'repository with spaces', 'mail-worker');
		const firstDir = path.join(directory, 'first');
		const secondDir = path.join(directory, 'second');
		await fs.mkdir(firstDir);
		await fs.mkdir(secondDir);
		// No repository .dev.vars exists: configuration never needs to read it.
		const first = await writeLocalConfig(firstDir, workerDir);
		const second = await writeLocalConfig(secondDir, workerDir);
		const config = JSON.parse(await fs.readFile(first.configPath, 'utf8'));
		assert.equal(config.main, path.join(workerDir, 'src/index.js'));
		assert.equal(config.assets.directory, path.join(workerDir, 'dist'));
		assert.equal(config.assets.run_worker_first, true);
		assert.deepEqual(config.d1_databases, [{
			binding: 'db', database_name: 'epomail-local-test',
			database_id: '00000000-0000-4000-8000-000000000000', remote: false
		}]);
		assert.deepEqual(config.kv_namespaces, [{
			binding: 'kv', id: '00000000000000000000000000000000', remote: false
		}]);
		assert.equal(config.vars.EMAIL_OUTBOUND_ENABLED, 'false');
		assert.equal(config.vars.OUTBOUND_WHITELIST_ENFORCE, 'true');
		assert.equal(config.vars.OUTBOUND_WHITELIST, '');
		assert.equal(config.vars.ALLOW_URL_INIT, 'false');
		for (const key of ['account_id', 'routes', 'send_email', 'services', 'ai', 'triggers', 'build', 'env']) {
			assert.equal(Object.hasOwn(config, key), false, key);
		}
		const vars = await fs.readFile(path.join(firstDir, '.dev.vars'), 'utf8');
		for (const key of ['jwt_secret', 'totp_enc_key', 'email_enc_key']) {
			assert.equal(Buffer.from(first.secrets[key], 'base64').length, 32);
			assert.notEqual(first.secrets[key], second.secrets[key]);
			assert.ok(vars.includes(`${key}=${JSON.stringify(first.secrets[key])}`));
			assert.ok(!JSON.stringify(config).includes(first.secrets[key]));
		}
		if (process.platform !== 'win32') {
			assert.equal((await fs.stat(path.join(firstDir, '.dev.vars'))).mode & 0o777, 0o600);
		}
	});
});

test('child environment excludes inherited secrets, overrides, proxies and Node injection', () => {
	const directory = path.resolve(os.tmpdir(), 'local-stack');
	const env = localEnvironment(directory, {
		Path: '/test/bin', SystemRoot: 'C:\\Windows', LANG: 'en_US.UTF-8',
		jwt_secret: 'host-secret', totp_enc_key: 'host-secret',
		CLOUDFLARE_API_TOKEN: 'host-token', CLOUDFLARE_ENV: 'production',
		NODE_OPTIONS: '--require injected.cjs', HTTPS_PROXY: 'http://proxy.invalid',
		WRANGLER_LOG_PATH: '/host/log', WRANGLER_SEND_METRICS: 'true',
		CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true', HOME: '/host/home'
	});
	assert.equal(env.Path, '/test/bin');
	assert.equal(env.SystemRoot, 'C:\\Windows');
	assert.equal(env.LANG, 'en_US.UTF-8');
	for (const key of ['jwt_secret', 'totp_enc_key', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ENV', 'NODE_OPTIONS', 'HTTPS_PROXY']) {
		assert.equal(Object.hasOwn(env, key), false, key);
	}
	assert.equal(env.HOME, directory);
	assert.equal(env.USERPROFILE, directory);
	assert.equal(env.WRANGLER_LOG_PATH, path.join(directory, 'wrangler.log'));
	assert.equal(env.WRANGLER_SEND_METRICS, 'false');
	assert.equal(env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV, 'false');
	assert.equal(env.CLOUDFLARE_INCLUDE_PROCESS_ENV, 'false');
});

test('production asset validation rejects missing builds, dev HTML and missing JS bundles', async () => {
	await withDirectory(async workerDir => {
		await assert.rejects(verifyProductionAssets(workerDir), /Production dist is missing/);
		const dist = path.join(workerDir, 'dist');
		await fs.mkdir(path.join(dist, 'login'), { recursive: true });
		await fs.mkdir(path.join(dist, 'assets'));
		await fs.mkdir(path.join(dist, 'login/assets'));
		await fs.writeFile(path.join(dist, 'index.html'), '<script type="module" src="/src/main.js"></script><script src="/@vite/client"></script>');
		await assert.rejects(verifyProductionAssets(workerDir), /Production dist is missing/);
		await fs.writeFile(path.join(dist, 'index.html'), '<script type="module" src="/assets/mail-built.js"></script>');
		await fs.writeFile(path.join(dist, 'login/index.html'), '<script type="module" src="/login/assets/login-built.js"></script>');
		await assert.rejects(verifyProductionAssets(workerDir), /Production dist is missing/);
		await fs.writeFile(path.join(dist, 'assets/mail-built.js'), 'export {};');
		await fs.writeFile(path.join(dist, 'login/assets/login-built.js'), 'export {};');
		await verifyProductionAssets(workerDir);
		await fs.writeFile(path.join(dist, 'login/index.html'), '<script type="module" src="../../escape.js"></script>');
		await assert.rejects(verifyProductionAssets(workerDir), /Production dist is missing/);
	});
});

test('spawn error and unexpected exit reject immediately, even if close has not arrived', async () => {
	const child = new EventEmitter();
	const state = observeProcess(child);
	const error = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
	child.emit('error', error);
	await assert.rejects(state.failure, error);
	assert.equal(state.closed, false);
	child.emit('close');
	assert.equal(state.closed, true);
	await stopProcessTree(child, state);

	const exitedChild = new EventEmitter();
	const exited = observeProcess(exitedChild);
	exitedChild.emit('exit', 7, null);
	await assert.rejects(exited.failure, /code=7/);
	assert.equal(exited.exited, true);
	assert.equal(exited.closed, false);
});

test('POSIX shutdown waits for both the group to disappear and child close', async () => {
	const state = { closed: false };
	const signals = [];
	let alive = true;
	const killing = stopProcessTree({ pid: 900001 }, state, {
		platform: 'linux', graceMs: 100, timeoutMs: 100, pollMs: 2,
		kill(pid, signal) {
			assert.equal(pid, -900001);
			if (signal !== 0) signals.push(signal);
			if (!alive) throw missingProcess();
		}
	});
	alive = false;
	let settled = false;
	killing.then(() => { settled = true; });
	await delay(10);
	assert.equal(settled, false, 'group disappearance alone must not release file cleanup');
	state.closed = true;
	await killing;
	assert.deepEqual(signals, ['SIGTERM']);
});

test('POSIX shutdown escalates to SIGKILL for surviving descendants after root exit', async () => {
	const state = { closed: true, exited: true };
	let alive = true;
	const signals = [];
	await stopProcessTree({ pid: 900002 }, state, {
		platform: 'darwin', graceMs: 0, timeoutMs: 100, pollMs: 1,
		kill(pid, signal) {
			assert.equal(pid, -900002);
			if (signal !== 0) signals.push(signal);
			if (signal === 'SIGKILL') alive = false;
			else if (!alive) throw missingProcess();
		}
	});
	assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
});

test('POSIX permission errors and surviving groups are fatal', async () => {
	await assert.rejects(stopProcessTree({ pid: 900003 }, { closed: true }, {
		platform: 'linux', kill() { throw Object.assign(new Error('denied'), { code: 'EPERM' }); }
	}), { code: 'EPERM' });
	await assert.rejects(stopProcessTree({ pid: 900003 }, { closed: true }, {
		platform: 'linux', kill() {}, graceMs: 0, timeoutMs: 0, pollMs: 1
	}), /Timed out waiting for local process group/);
	await assert.rejects(stopProcessTree({ pid: process.pid }, {}, { platform: 'linux' }), /invalid local-stack PID/);
});

test('Windows taskkill terminates the tree without a shell and awaits child close', async () => {
	const state = { closed: false };
	let settled = false;
	const killing = stopProcessTree({ pid: 900004 }, state, {
		platform: 'win32', timeoutMs: 100, pollMs: 2,
		async exec(command, args, options) {
			assert.ok(path.win32.isAbsolute(command));
			assert.match(command, /\\System32\\taskkill\.exe$/i);
			assert.deepEqual(args, ['/PID', '900004', '/T', '/F']);
			assert.equal(options.windowsHide, true);
			assert.equal(options.shell, undefined);
			assert.equal(options.timeout, 100);
		}
	});
	killing.then(() => { settled = true; });
	await delay(10);
	assert.equal(settled, false);
	state.closed = true;
	await killing;
});

test('Windows taskkill errors and missing close are fatal; an exited root does not skip tree cleanup', async () => {
	const error = new Error('taskkill denied or root gone');
	await assert.rejects(stopProcessTree({ pid: 900005 }, { closed: true, exited: true }, {
		platform: 'win32', async exec() { throw error; }
	}), error);
	await assert.rejects(stopProcessTree({ pid: 900005 }, { closed: false }, {
		platform: 'win32', async exec() {}, timeoutMs: 0, pollMs: 1
	}), /Timed out waiting for local process tree/);
});

test('directory removal retries locks and propagates the final failure with its cause', async () => {
	const error = Object.assign(new Error('locked'), { code: 'EBUSY' });
	await assert.rejects(removeTemporaryDirectory('/temporary/local-stack', {
		async rm(directory, options) {
			assert.equal(directory, '/temporary/local-stack');
			assert.equal(options.recursive, true);
			assert.equal(options.force, true);
			assert.ok(options.maxRetries > 0);
			assert.ok(options.retryDelay > 0);
			throw error;
		}
	}), failure => {
		assert.match(failure.message, /Unable to remove local-stack directory/);
		assert.equal(failure.cause, error);
		return true;
	});
	await withDirectory(async directory => {
		await fs.writeFile(path.join(directory, 'temporary-state'), 'test');
		await removeTemporaryDirectory(directory);
		await assert.rejects(fs.access(directory), { code: 'ENOENT' });
	});
});

test('real native process tree exits before locked state is removed', { timeout: 20000 }, async () => {
	await withDirectory(async directory => {
		const descendantFile = path.join(directory, 'descendant.pid');
		const heldFile = path.join(directory, 'held-state');
		const child = spawn(process.execPath, ['-e', `
			const {spawn} = require('node:child_process');
			const fs = require('node:fs');
			fs.openSync(${JSON.stringify(heldFile)}, 'w');
			const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'ignore'});
			fs.writeFileSync(${JSON.stringify(descendantFile)}, String(descendant.pid));
			setInterval(() => {}, 1000);
		`], {
			cwd: directory, shell: false, windowsHide: true,
			detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']
		});
		const state = observeProcess(child);
		let descendant;
		try {
			await Promise.race([once(child, 'spawn'), state.failure]);
			for (let i = 0; i < 200; i++) {
				try { descendant = Number(await fs.readFile(descendantFile, 'utf8')); break; }
				catch (error) { if (error.code !== 'ENOENT') throw error; }
				await delay(10);
			}
			assert.ok(descendant, 'descendant never started');
		} finally {
			await stopProcessTree(child, state);
		}
		assert.equal(state.closed, true);
		assert.throws(() => process.kill(descendant, 0), { code: 'ESRCH' });
		await removeTemporaryDirectory(directory);
		await assert.rejects(fs.access(directory), { code: 'ENOENT' });
	});
});
