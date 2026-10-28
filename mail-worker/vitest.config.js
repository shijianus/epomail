import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				// A dedicated test config avoids the production AI binding, which
				// the installed workerd/miniflare version cannot resolve locally.
				wrangler: { configPath: './wrangler-vitest.toml' },
				miniflare: {
					bindings: {
						jwt_secret: 'test-jwt-secret-for-unit-tests',
						totp_enc_key: 'test-totp-encryption-key-for-unit-tests',
						// Test-only declaration of an explicitly identified legacy
						// object domain for the B2 Telegram neutralization probe.
						LEGACY_ATTACHMENT_DOMAINS: 'cdn.legacy.test',
						resend_webhook_secret: 'whsec_test_only_not_a_real_secret'
					}
				}
			},
		},
	},
});
