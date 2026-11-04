import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Wrangler resolves .dev.vars beside its config, so keep the test config in a
// fresh directory and disable its .env/process-environment fallback as well.
process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false';

const require = createRequire(import.meta.url);
// linkedom's ESM entry imports the CJS cssom package through extensionless
// relative requires. The Windows pool module-fallback cannot resolve those,
// so tests use linkedom's self-contained worker bundle instead.
const linkedomWorker = path.resolve(path.dirname(require.resolve('linkedom')), '..', 'worker.js');

const workerDir = path.dirname(fileURLToPath(import.meta.url));
const tempConfigDir = mkdtempSync(path.join(os.tmpdir(), 'epomail-vitest-'));
const tempConfigPath = path.join(tempConfigDir, 'wrangler-vitest.toml');
try {
	const testConfig = readFileSync(path.join(workerDir, 'wrangler-vitest.toml'), 'utf8');
	const mainPath = path.join(workerDir, 'src/index.js').replaceAll('\\', '/');
	const isolatedConfig = testConfig.replace(/^main\s*=.*$/m, `main = '${mainPath}'`);
	if (isolatedConfig === testConfig) throw new Error('Missing main entry in wrangler-vitest.toml');
	writeFileSync(tempConfigPath, isolatedConfig, { flag: 'wx' });
} catch (error) {
	rmSync(tempConfigDir, { recursive: true, force: true });
	throw error;
}
process.once('exit', () => rmSync(tempConfigDir, { recursive: true, force: true }));

export default defineWorkersConfig({
	test: {
		// The default 5s budget is not enough for the password/TOTP specs once
		// several workerd runtimes share a slow CI or laptop CPU; the assertions
		// are unchanged, only the wall-clock ceiling is raised.
		testTimeout: 20000,
		// Full-schema cold-start in beforeAll can exceed the 10s default on a
		// loaded Windows host. When it does, the suite aborts while Miniflare
		// still holds the D1/KV files, which surfaces as a misleading
		// "Isolated storage failed" teardown error.
		hookTimeout: 60000,
		setupFiles: ['./test/setup-network.js'],
		alias: [{ find: /^linkedom$/, replacement: linkedomWorker }],
		// These packages trigger the pool's module fallback when externalised.
		// Inlining lets Vite bundle them instead of routing imports through it.
		server: {
			deps: {
				inline: ['svix', 'uuid', '@noble/hashes', 'linkedom', 'cssom']
			}
		},
		poolOptions: {
			workers: {
				// Files create the full schema from `beforeAll`. Running several
				// files in separate workerd runtimes lets one file's storage
				// rollback remove tables another file is still using, which CI
				// observed as `no such table: user`. One worker serialises files
				// and keeps each file's beforeAll schema inside its own storage
				// scope. It also avoids the Windows loopback module-fallback
				// failures seen when ~17 runtimes start at once.
				singleWorker: true,
				// The isolated config dir ensures Wrangler cannot see project secrets.
				wrangler: { configPath: tempConfigPath },
					miniflare: {
						d1Databases: {
							NOTICE_USER_DB: { id: '00000000-0000-4000-8000-000000000011' },
							NOTICE_MAIL_DB: { id: '00000000-0000-4000-8000-000000000012' }
						},
						bindings: {
						jwt_secret: 'test-jwt-secret-for-unit-tests',
						totp_enc_key: 'test-totp-encryption-key-for-unit-tests',
							resend_webhook_secret: ['whsec_', 'test_only_not_a_real_secret'].join(''),
							ENVIRONMENT: 'test',
							EMAIL_OUTBOUND_ENABLED: 'false',
							OUTBOUND_WHITELIST_ENFORCE: 'true',
							OUTBOUND_WHITELIST: ''
					}
				}
			},
		},
	},
});
