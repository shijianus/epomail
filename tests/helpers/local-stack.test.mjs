import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once, EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import {
	localEnvironment, writeLocalConfig, verifyProductionAssets,
	observeProcess, stopProcessTree, removeTemporaryDirectory,
	hasLiveProcessGroupMembers, cleanupLocalStackDirectory
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
			assert.equal(config.main, path.join(firstDir, 'isolated-worker.mjs'));
			const entry = await fs.readFile(config.main, 'utf8');
			assert.ok(entry.includes(JSON.stringify(path.join(workerDir, 'src/index.js').replaceAll('\\', '/'))));
			assert.ok(entry.includes("Object.defineProperty(globalThis, 'fetch'"));
			assert.ok(entry.includes('writable: false, configurable: false'));
		assert.deepEqual(config.compatibility_flags, ['nodejs_als']);
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

test('config and asset verification use an explicitly isolated build without falling back to repository dist', async () => {
	await withDirectory(async directory => {
		const workerDir = path.join(directory, 'repository', 'mail-worker');
		const configDir = path.join(directory, 'config');
		const assetsDir = path.join(directory, 'isolated build');
		await fs.mkdir(configDir);
		const { configPath } = await writeLocalConfig(configDir, workerDir, assetsDir);
		const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
		assert.equal(config.assets.directory, assetsDir);
		await assert.rejects(verifyProductionAssets(workerDir, assetsDir), /Production dist is missing/);
		await fs.mkdir(path.join(assetsDir, 'assets'), { recursive: true });
		await fs.mkdir(path.join(assetsDir, 'login/assets'), { recursive: true });
		await fs.writeFile(path.join(assetsDir, 'index.html'), '<script type="module" src="/assets/mail.js"></script>');
		await fs.writeFile(path.join(assetsDir, 'assets/mail.js'), 'export {};');
		await fs.writeFile(path.join(assetsDir, 'login/index.html'), '<script type="module" src="/login/assets/login.js"></script>');
		await fs.writeFile(path.join(assetsDir, 'login/assets/login.js'), 'export {};');
		await verifyProductionAssets(workerDir, assetsDir);
		await assert.rejects(verifyProductionAssets(workerDir), /Production dist is missing/);
	});
});

test('child environment excludes inherited secrets, overrides, proxies and Node injection', () => {
	const directory = path.resolve(os.tmpdir(), 'local-stack');
	const env = localEnvironment(directory, {
		Path: '/test/bin', SystemRoot: 'C:\\Windows', LANG: 'en_US.UTF-8',
		jwt_secret: randomBytes(32).toString('hex'), totp_enc_key: randomBytes(32).toString('hex'),
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

test('simulated Linux shutdown waits for both group disappearance and child close', async () => {
	const state = { closed: false };
	const signals = [];
	let alive = true;
	const killing = stopProcessTree({ pid: 900001 }, state, {
		platform: 'linux', graceMs: 100, timeoutMs: 100, pollMs: 2,
		kill(pid, signal) {
			assert.equal(pid, -900001);
			if (signal !== 0) signals.push(signal);
			if (!alive) throw missingProcess();
		},
		async exec(command, args) {
			assert.equal(command, '/bin/ps');
			assert.deepEqual(args, ['-eo', 'pgid=,stat=']);
			return { stdout: alive ? '1 Ss\n900001 Ssl\n' : '1 Ss\n' };
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

test('simulated Linux ps inspection ignores only Z/X members of the target PGID', async () => {
	for (const status of ['Z', 'Zs', 'X', 'S', 'Ssl', 'R+', 'D', 'T', 't', 'I']) {
		assert.equal(await hasLiveProcessGroupMembers(910001, {
			platform: 'linux', async exec(command, args, options) {
				assert.equal(command, '/bin/ps');
				assert.deepEqual(args, ['-eo', 'pgid=,stat=']);
				assert.equal(options.shell, undefined);
				assert.ok(options.timeout > 0);
				return { stdout: `1 Ss\n910001 Z\n910001 ${status}\n910002 R+\n` };
			}
		}), !/^[ZX]/.test(status), status);
	}
	assert.equal(await hasLiveProcessGroupMembers(910001, {
		platform: 'linux', async exec() { return { stdout: '1 Ss\n910002 R\n' }; }
	}), false, 'other process groups must not hold up cleanup');
});

test('simulated Linux ps errors and malformed or empty output fail closed', async () => {
	for (const stdout of ['', '910001\n', '910001 ?\n', '910001 Z\nunparseable\n']) {
		await assert.rejects(hasLiveProcessGroupMembers(910001, {
			platform: 'linux', async exec() { return { stdout }; }
		}), /Unable to inspect Linux process groups/);
	}
	const error = Object.assign(new Error('ps unavailable'), { code: 'ENOENT' });
	await assert.rejects(stopProcessTree({ pid: 910001 }, { closed: true }, {
		platform: 'linux', kill() {}, async exec() { throw error; }
	}), error);
});

test('simulated Linux zombie-only group still waits for root close without SIGKILL', async () => {
	const state = { closed: false };
	const signals = [];
	let settled = false;
	const killing = stopProcessTree({ pid: 910002 }, state, {
		platform: 'linux', graceMs: 100, timeoutMs: 100, pollMs: 2,
		kill(pid, signal) { assert.equal(pid, -910002); signals.push(signal); },
		async exec() { return { stdout: '1 Ss\n910002 Z\n' }; }
	});
	killing.then(() => { settled = true; });
	await delay(10);
	assert.equal(settled, false);
	state.closed = true;
	await killing;
	assert.deepEqual(signals, ['SIGTERM']);
});

test('simulated Linux shutdown escalates for live members but accepts remaining zombies', async () => {
	const signals = [];
	let status = 'S';
	await stopProcessTree({ pid: 910003 }, { closed: true, exited: true }, {
		platform: 'linux', graceMs: 0, timeoutMs: 100, pollMs: 1,
		kill(pid, signal) {
			assert.equal(pid, -910003);
			signals.push(signal);
			if (signal === 'SIGKILL') status = 'Z';
		},
		async exec() { return { stdout: `1 Ss\n910003 ${status}\n` }; }
	});
	assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
});

test('simulated Darwin shutdown retains kill(0) and escalates after root exit', async () => {
	const state = { closed: true, exited: true };
	let alive = true;
	const signals = [];
	await stopProcessTree({ pid: 900002 }, state, {
		platform: 'darwin', graceMs: 0, timeoutMs: 100, pollMs: 1,
		async exec() { assert.fail('Darwin must not use Linux ps inspection'); },
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
		platform: 'linux', kill() {}, graceMs: 0, timeoutMs: 0, pollMs: 1,
		async exec() { return { stdout: '1 Ss\n900003 S\n900003 Z\n' }; }
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

for (const removeDirectory of [false, true]) {
	test(`secret cleanup runs before directory removal (tree stopped: ${removeDirectory})`, async () => {
		await withDirectory(async directory => {
			const secretPath = path.join(directory, '.dev.vars');
			await fs.writeFile(secretPath, randomBytes(32));
			let removedDirectory = false;
			await cleanupLocalStackDirectory(directory, {
				removeDirectory,
				async removeDir(target) {
					assert.equal(target, directory);
					await assert.rejects(fs.access(secretPath), { code: 'ENOENT' });
					removedDirectory = true;
					await removeTemporaryDirectory(target);
				}
			});
			assert.equal(removedDirectory, removeDirectory);
			await assert.rejects(fs.access(secretPath), { code: 'ENOENT' });
			if (!removeDirectory) await fs.access(directory);
		});
	});
}

test('directory removal failure cannot retain the independently deleted secret file', async () => {
	await withDirectory(async directory => {
		const secretPath = path.join(directory, '.dev.vars');
		await fs.writeFile(secretPath, randomBytes(32));
		const error = Object.assign(new Error('state directory locked'), { code: 'EBUSY' });
		await assert.rejects(cleanupLocalStackDirectory(directory, {
			async removeDir() {
				await assert.rejects(fs.access(secretPath), { code: 'ENOENT' });
				throw error;
			}
		}), failure => {
			assert.deepEqual(failure.errors, [error]);
			return true;
		});
		await assert.rejects(fs.access(secretPath), { code: 'ENOENT' });
		await fs.access(directory);
	});
});

test('secret removal errors stay fatal even when directory removal subsequently succeeds', async () => {
	await withDirectory(async directory => {
		const secretPath = path.join(directory, '.dev.vars');
		await fs.writeFile(secretPath, randomBytes(32));
		const error = Object.assign(new Error('secret locked'), { code: 'EBUSY' });
		await assert.rejects(cleanupLocalStackDirectory(directory, {
			async rm(target, options) {
				assert.equal(target, secretPath);
				assert.equal(options.recursive, true, 'Node rm retries require recursive');
				assert.equal(options.force, true);
				assert.ok(options.maxRetries > 0);
				assert.ok(options.retryDelay > 0);
				throw error;
			}
		}), failure => {
			assert.equal(failure.errors.length, 1);
			assert.equal(failure.errors[0].cause, error);
			return true;
		});
		await assert.rejects(fs.access(directory), { code: 'ENOENT' });
	});
});

test('secret and directory failures are both reported without skipping either cleanup', async () => {
	await withDirectory(async directory => {
		const secretError = new Error('secret unavailable');
		const directoryError = new Error('directory unavailable');
		await assert.rejects(cleanupLocalStackDirectory(directory, {
			async rm() { throw secretError; },
			async removeDir() { throw directoryError; }
		}), failure => {
			assert.equal(failure.errors.length, 2);
			assert.equal(failure.errors[0].cause, secretError);
			assert.equal(failure.errors[1], directoryError);
			return true;
		});
		await assert.rejects(cleanupLocalStackDirectory(directory, {
			removeDirectory: false,
			async rm() { throw secretError; },
			async removeDir() { assert.fail('live process state must be retained'); }
		}), failure => failure.errors.length === 1 && failure.errors[0].cause === secretError);
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
		if (process.platform === 'linux') {
			// Linux may retain an exited descendant as a zombie until its reaper
			// runs; kill(pid, 0) alone does not establish that it is still alive.
			const stdout = execFileSync('/bin/ps', ['-eo', 'pid=,stat='], { encoding: 'utf8', timeout: 5000 });
			assert.ok(stdout.trim());
			const entry = stdout.trim().split(/\r?\n/).map(line => line.trim().split(/\s+/))
				.find(([pid]) => Number(pid) === descendant);
			if (entry) assert.match(entry[1], /^[ZX]/, 'descendant must be gone or exited, never alive');
		} else {
			assert.throws(() => process.kill(descendant, 0), { code: 'ESRCH' });
		}
		await removeTemporaryDirectory(directory);
		await assert.rejects(fs.access(directory), { code: 'ENOENT' });
	});
});
