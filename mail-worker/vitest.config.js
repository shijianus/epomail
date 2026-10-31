import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		// The default 5s budget is not enough for the password/TOTP specs once
		// several workerd runtimes share a slow CI or laptop CPU; the assertions
		// are unchanged, only the wall-clock ceiling is raised.
		testTimeout: 20000,
		// `svix` and `uuid` ship CommonJS builds inside `"type": "module"`
		// packages, which the pool's module fallback misreads as ESM when they are
		// externalised. Inlining them lets Vite bundle them instead of routing the
		// import through that fallback service.
		server: {
			deps: {
				inline: ['svix', 'uuid']
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
				// A dedicated test config avoids the production AI binding, which
				// the installed workerd/miniflare version cannot resolve locally.
				wrangler: { configPath: './wrangler-vitest.toml' },
				miniflare: {
					bindings: {
						jwt_secret: 'test-jwt-secret-for-unit-tests',
						totp_enc_key: 'test-totp-encryption-key-for-unit-tests',
						resend_webhook_secret: 'whsec_test_only_not_a_real_secret'
					}
				}
			},
		},
	},
});
