#!/usr/bin/env node
/**
 * OAuth staging preflight.
 *
 * Default: static audit of mail-worker/wrangler.toml only. No network, no
 * writes, no secret values read.
 *
 * With --live: additionally performs read-only GET/OPTIONS probes against a
 * staging origin. It never calls /api/oauth/authorize (that writes a D1 state
 * row) and never exchanges a provider code.
 *
 * Usage:
 *   node scripts/oauth-staging-preflight.mjs
 *   node scripts/oauth-staging-preflight.mjs --json
 *   node scripts/oauth-staging-preflight.mjs --base-url https://staging.example.com --live
 *
 * Exit codes: 0 = no failures, 1 = at least one failure, 2 = config missing.
 */
import {
	DEFAULT_CONFIG,
	Checks,
	assertSafeBaseUrl,
	currentCommit,
	isProductionHost,
	parseArgs,
	runLivePreflight,
	runStaticChecks
} from './lib/oauth-staging.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(`OAuth staging preflight

  --config <path>     wrangler config (default: mail-worker/wrangler.toml)
  --base-url <url>    staging origin; checked for HTTPS and non-production
  --live              run read-only GET/OPTIONS probes against --base-url
  --allow-local       allow http://127.0.0.1 for local rehearsal only
  --json              machine-readable output
  --help              this message

Real provider login is never performed by this script. It reports
"REAL PROVIDER ACCEPTANCE: NOT RUN" unless the acceptance runner is used
with real staging credentials and a human completes the provider steps.
`);
	process.exit(0);
}

const checks = new Checks({ color: !args.json });
runStaticChecks({ configPath: args.config ? args.config : DEFAULT_CONFIG, checks });

let base = '';
if (args['base-url']) {
	try {
		base = assertSafeBaseUrl(args['base-url'], { allowLocal: Boolean(args['allow-local']) });
		checks.pass('ENV-01', 'staging base URL is HTTPS and not production', base);
		if (isProductionHost(new URL(base).hostname)) {
			checks.fail('ENV-01', 'staging base URL is HTTPS and not production', 'production host');
		}
		for (const provider of ['google', 'github', 'apple', 'microsoft']) {
			checks.info('ENV-02', `${provider} callback URI`, `${base}/api/oauth/callback/${provider}`);
		}
	} catch (error) {
		checks.fail('ENV-01', 'staging base URL is HTTPS and not production', error.message);
	}
} else {
	checks.warn('ENV-01', 'staging base URL was not supplied', 'pass --base-url with --live to probe the deployed staging Worker');
}

if (args.live) {
	if (!base) {
		checks.fail('LIVE-00', 'live preflight requires a valid --base-url', 'refusing to derive a target');
	} else {
		await runLivePreflight(base, checks);
	}
} else {
	checks.skip('LIVE-00', 'live read-only probes were not requested', 'add --live --base-url <staging-origin>');
}

if (args.json) {
	console.log(JSON.stringify({
		timestamp: new Date().toISOString(),
		commit: currentCommit(),
		base: base || null,
		config: args.config || DEFAULT_CONFIG,
		checks: checks.toJSON(),
		realProviderAcceptance: 'NOT RUN'
	}, null, 2));
} else {
	checks.print('OAuth staging preflight');
	console.log('\nMode: static configuration audit' + (args.live ? ' + read-only live probes' : ''));
	console.log('No remote writes were performed. No provider login was attempted.');
	console.log('REAL PROVIDER ACCEPTANCE: NOT RUN');
}

process.exit(checks.hasFailures() ? 1 : 0);
