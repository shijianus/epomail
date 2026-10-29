#!/usr/bin/env node
/**
 * Real-provider OAuth acceptance runner for an isolated staging environment.
 *
 * Two modes:
 *   --plan   print the manual provider checklist and the static blocking
 *            findings. No network, no writes.
 *   --run    run protocol-level checks against a staging origin. This creates
 *            short-lived D1 `oauth_state` rows and KV rate-limit keys; it never
 *            creates a mailbox account and never calls a provider's login page.
 *
 * The runner can prove the protocol boundary (state, redirect URI, cancellation,
 * replay, concurrency, cookie independence, CORS). It cannot prove a real
 * Google/GitHub/Apple login, bind UI, MFA or re-login: those require staging
 * OAuth clients and a human at the provider. The report therefore keeps every
 * provider row at NOT RUN unless a human signs it off in the manual section.
 *
 * Usage:
 *   node tests/oauth-staging-acceptance.mjs --plan
 *   node tests/oauth-staging-acceptance.mjs --run \
 *     --base-url https://staging.example.com --confirm-staging \
 *     --providers google,github,apple --report doc/oauth-staging-run.md
 *
 * Safety:
 *   - production hosts are refused by name;
 *   - HTTPS is mandatory outside localhost;
 *   - --confirm-staging is required for --run;
 *   - no client secret, authorization code or state token is printed or
 *     written to the report.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
	ROOT,
	Checks,
	PROVIDER_META,
	assertNoSecretInLocation,
	assertSafeBaseUrl,
	appCookies,
	currentCommit,
	errorFromLocation,
	parseArgs,
	renderReport,
	request,
	runLivePreflight,
	runStaticChecks,
	writeReport
} from '../scripts/lib/oauth-staging.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(`OAuth staging acceptance runner

  --plan                 print checklist + static findings; no network
  --run                  run protocol checks (requires --base-url + --confirm-staging)
  --base-url <url>       staging origin, e.g. https://staging.example.com
  --confirm-staging      explicit acknowledgement that this target is staging
  --providers <list>     comma list from: google,github,apple (default all three)
  --report <path>        write a Markdown report
  --allow-local          allow http://127.0.0.1 for rehearsal only
  --ignore-config        continue even when wrangler staging placeholders remain
  --help                 this message

Real provider login, bind UI, MFA and re-login are NEVER marked PASS by this
script. They stay NOT RUN until a human completes them against staging.
`);
	process.exit(0);
}

const SELECTED = String(args.providers || 'google,github,apple')
	.split(',')
	.map(item => item.trim().toLowerCase())
	.filter(Boolean);
const UNKNOWN = SELECTED.filter(item => !['google', 'github', 'apple'].includes(item));
if (UNKNOWN.length) {
	console.error(`Unknown provider(s): ${UNKNOWN.join(', ')}. Use google,github,apple.`);
	process.exit(2);
}

const checks = new Checks({ color: !args.report });
const notes = [];

runStaticChecks({ checks });
checkLoginUiStateGuard(checks);
checkServerStateGuard(checks);

if (args.plan) {
	printPlan();
	finish({ run: false, printChecks: false });
	process.exit(0);
}

function hasBlockingFailure() {
	return checks.items.some(item =>
		item.status === 'FAIL' && !(args['ignore-config'] && item.id.startsWith('CFG-')));
}

if (!args.run) {
	console.error('Nothing to do. Use --plan for the checklist or --run with --base-url and --confirm-staging.');
	process.exit(2);
}
if (!args['confirm-staging']) {
	console.error('Refusing to run: --confirm-staging is required. This runner creates short-lived staging state rows.');
	process.exit(2);
}
if (!args['base-url']) {
	console.error('Refusing to run: --base-url is required.');
	process.exit(2);
}

let base;
try {
	base = assertSafeBaseUrl(args['base-url'], { allowLocal: Boolean(args['allow-local']) });
} catch (error) {
	console.error(`Refusing target: ${error.message}`);
	process.exit(2);
}

const staticFailures = checks.items.filter(item => item.status === 'FAIL' && item.id.startsWith('CFG-'));
if (staticFailures.length && !args['ignore-config']) {
	checks.print('OAuth staging acceptance — BLOCKED by configuration');
	console.error('\nStaging configuration is not provisioned. Fix the CFG-* failures, or pass --ignore-config');
	console.error('only when the deployed target is known to be isolated by another mechanism.');
	console.error('REAL PROVIDER ACCEPTANCE: NOT RUN');
	finish({ run: false, printChecks: false });
	process.exit(2);
}

console.log(`\nTarget: ${base}`);
console.log('Write scope: short-lived oauth_state D1 rows and rate-limit KV keys. No mailbox accounts are created.');
console.log('Real provider login is not automated by this runner.\n');

await runLivePreflight(base, checks);

const providerResponse = await request(base, '/api/oauth/providers').catch(error => ({ error }));
const enabled = providerResponse?.json?.data;
if (!Array.isArray(enabled)) {
	checks.blocked('RUN-01', 'provider list is available', providerResponse?.error?.message || `HTTP ${providerResponse?.status}`);
	console.error('\nBLOCKED: /api/oauth/providers did not return a provider list.');
	console.error('REAL PROVIDER ACCEPTANCE: NOT RUN');
	finish({ run: true, base });
	process.exit(2);
}

const enabledKeys = new Set(enabled.map(item => item.key));
const activeProviders = SELECTED.filter(key => enabledKeys.has(key));
await runDisabledProviderChecks(base, checks);
for (const provider of SELECTED) {
	if (!enabledKeys.has(provider)) {
		checks.blocked(`PROVIDER-${provider}`, `${PROVIDER_META[provider].label} is enabled in staging`,
			'not returned by /api/oauth/providers (master switch off, provider disabled, or missing client id)');
	}
}
if (!activeProviders.length) {
	console.error('\nBLOCKED: none of the requested providers are enabled on this staging target.');
	console.error('REAL PROVIDER ACCEPTANCE: NOT RUN');
	finish({ run: true, base });
	process.exit(2);
}

for (const provider of activeProviders) {
	await runProviderProtocolChecks(base, provider, checks);
}
await runSessionBoundaryChecks(base, checks);
await runCorsChecks(base, checks);
runUnrunnableChecks(checks, activeProviders);

checks.gap('PKCE-01', 'PKCE is verified',
	'No code_challenge was observed on any provider; the implementation does not use PKCE. See the report finding.');

finish({ run: true, base });
process.exit(hasBlockingFailure() ? 1 : 0);

/* ------------------------------------------------------------------------- *
 * Static checks for the two login-CSRF gates
 * ------------------------------------------------------------------------- */

function checkLoginUiStateGuard(targetChecks) {
	const file = path.join(ROOT, 'temp_login_ui', 'src', 'app', 'components', 'epomail', 'AuthForm.tsx');
	let text = '';
	try {
		text = fs.readFileSync(file, 'utf8');
	} catch (error) {
		targetChecks.blocked('UI-STATE-01', 'login UI requires a non-empty client state', error.message);
		return;
	}
	const compares = /returnedClientState\s*!==\s*expectedClientState/.test(text);
	const rejectsEmpty = /!\s*expectedClientState\b/.test(text) || /expectedClientState\.trim\(\)/.test(text);
	if (compares && rejectsEmpty) {
		targetChecks.pass('UI-STATE-01', 'login UI requires a non-empty client state');
	} else {
		targetChecks.fail('UI-STATE-01', 'login UI requires a non-empty client state',
			'AuthForm.tsx compares returnedClientState with expectedClientState but does not reject an empty expected value; an attacker-initiated flow with no client state can satisfy "" === ""');
	}
}

function checkServerStateGuard(targetChecks) {
	const file = path.join(ROOT, 'mail-worker', 'src', 'service', 'oauth-service.js');
	let text = '';
	try {
		text = fs.readFileSync(file, 'utf8');
	} catch (error) {
		targetChecks.blocked('SRV-STATE-01', 'authorize endpoint requires a client state', error.message);
		return;
	}
	const guarded = /oauth_state_required|Missing OAuth client state/i.test(text);
	if (guarded) {
		targetChecks.pass('SRV-STATE-01', 'authorize endpoint requires a client state');
	} else {
		targetChecks.fail('SRV-STATE-01', 'authorize endpoint requires a client state',
			'getAuthorizeUrl accepts an omitted client state; the public /api/oauth/authorize/:provider URL can be minted by an attacker');
	}
}

/* ------------------------------------------------------------------------- *
 * Provider protocol checks
 * ------------------------------------------------------------------------- */

async function authorize(provider, { clientState, redirectUri } = {}) {
	const state = clientState || `probe-${crypto.randomUUID()}`;
	const callback = redirectUri || `${base}/api/oauth/callback/${provider}`;
	const response = await request(base,
		`/api/oauth/authorize/${provider}?redirect_uri=${encodeURIComponent(callback)}&state=${encodeURIComponent(state)}`);
	return { response, clientState: state, redirectUri: callback };
}

function authorizeFailure(response) {
	const message = response?.json?.message || response?.text || '';
	return { status: response?.status, message: String(message).slice(0, 200) };
}

async function runProviderProtocolChecks(targetBase, provider, targetChecks) {
	const meta = PROVIDER_META[provider];
	const label = meta.label;
	const redirectUri = `${targetBase}/api/oauth/callback/${provider}`;

	// 1. Authorization URL contract.
	let auth;
	try {
		auth = await authorize(provider);
	} catch (error) {
		targetChecks.fail(`AUTH-${provider}`, `${label} authorization URL is issued`, error.message);
		return;
	}
	if (auth.response.status !== 200 || auth.response.json?.code !== 200 || !auth.response.json?.data?.url) {
		const failure = authorizeFailure(auth.response);
		targetChecks.blocked(`AUTH-${provider}`, `${label} authorization URL is issued`,
			`HTTP ${failure.status}: ${failure.message || 'no authorization URL'}`);
		return;
	}

	const url = new URL(auth.response.json.data.url);
	const stateToken = url.searchParams.get('state') || '';
	const nonce = url.searchParams.get('nonce') || '';
	const issues = [];
	if (meta.authOrigin && url.origin !== meta.authOrigin) issues.push(`origin=${url.origin}`);
	if (!url.searchParams.get('client_id')) issues.push('missing client_id');
	if (url.searchParams.get('redirect_uri') !== redirectUri) issues.push(`redirect_uri=${url.searchParams.get('redirect_uri')}`);
	if (url.searchParams.get('response_type') !== 'code') issues.push('response_type');
	if (!String(url.searchParams.get('scope') || '').includes(meta.scope)) issues.push(`scope=${url.searchParams.get('scope')}`);
	if (stateToken.length < 32 || !/^[A-Za-z0-9_-]+$/.test(stateToken)) issues.push('state is not a strong opaque token');
	if (stateToken === auth.clientState) issues.push('server state reflects the client value');
	if (meta.nonce && !nonce) issues.push('missing nonce');
	if (!meta.nonce && nonce) issues.push('unexpected nonce');
	if (meta.responseMode && url.searchParams.get('response_mode') !== meta.responseMode) issues.push('response_mode');
	if (url.searchParams.has('client_secret') || url.searchParams.has('code_verifier')) issues.push('secret material in authorize URL');

	const hasPkce = url.searchParams.has('code_challenge');
	if (hasPkce) {
		targetChecks.pass(`PKCE-${provider}`, `${label} PKCE challenge is sent`, `method=${url.searchParams.get('code_challenge_method') || '<none>'}`);
	} else {
		targetChecks.gap(`PKCE-${provider}`, `${label} PKCE challenge is sent`,
			'no code_challenge; authorization-code interception relies on client authentication, exact redirect URI and state');
	}

	if (issues.length) {
		targetChecks.fail(`AUTH-${provider}`, `${label} authorization URL contract`, issues.join('; '));
		return;
	}
	targetChecks.pass(`AUTH-${provider}`, `${label} authorization URL contract`,
		`state=${stateToken.length} chars, nonce=${nonce ? 'present' : 'not applicable'}`);

	// 2. Missing client state must be refused.
	try {
		const noState = await request(targetBase, `/api/oauth/authorize/${provider}?redirect_uri=${encodeURIComponent(redirectUri)}`);
		if (noState.status === 200 && noState.json?.data?.url) {
			targetChecks.fail(`STATE-${provider}`, `${label} authorize refuses an empty client state`,
				'HTTP 200 with an authorization URL; attacker-minted login flow is possible (login CSRF residual)');
		} else if (noState.status === 400 && /state|client/i.test(String(noState.json?.message || ''))) {
			targetChecks.pass(`STATE-${provider}`, `${label} authorize refuses an empty client state`);
		} else {
			targetChecks.blocked(`STATE-${provider}`, `${label} authorize refuses an empty client state`,
				`HTTP ${noState.status}: ${String(noState.json?.message || '').slice(0, 160)}`);
		}
	} catch (error) {
		targetChecks.fail(`STATE-${provider}`, `${label} authorize refuses an empty client state`, error.message);
	}

	// 3. A foreign redirect_uri must not be reflected.
	try {
		const foreign = await request(targetBase,
			`/api/oauth/authorize/${provider}?redirect_uri=${encodeURIComponent('https://evil.example/callback')}&state=probe-${crypto.randomUUID()}`);
		if (foreign.status === 200 && foreign.json?.data?.url) {
			const foreignUrl = new URL(foreign.json.data.url);
			targetChecks.fail(`REDIR-${provider}`, `${label} authorize rejects a foreign redirect_uri`,
				`HTTP 200 redirect_uri=${foreignUrl.searchParams.get('redirect_uri')}`);
		} else if (/redirect_uri/i.test(String(foreign.json?.message || ''))) {
			targetChecks.pass(`REDIR-${provider}`, `${label} authorize rejects a foreign redirect_uri`);
		} else {
			targetChecks.pass(`REDIR-${provider}`, `${label} authorize rejects a foreign redirect_uri`, `HTTP ${foreign.status}`);
		}
	} catch (error) {
		targetChecks.fail(`REDIR-${provider}`, `${label} authorize rejects a foreign redirect_uri`, error.message);
	}

	// 4. Cancellation is reported, and does not burn the state.
	try {
		const cancelled = await callback(provider, `?error=access_denied&state=${encodeURIComponent(stateToken)}`);
		const cancelError = errorFromLocation(cancelled.location);
		const afterCancel = await callback(provider, `?code=probe&state=${encodeURIComponent(stateToken)}`);
		const afterError = errorFromLocation(afterCancel.location);
		if (cancelError !== 'oauth_denied') {
			targetChecks.fail(`CANCEL-${provider}`, `${label} cancellation is reported`,
				`error=${cancelError || '<none>'}`);
		} else if (afterError !== 'oauth_failed') {
			targetChecks.fail(`CANCEL-${provider}`, `${label} cancellation does not burn the state`,
				`subsequent exchange returned error=${afterError || '<none>'}`);
		} else {
			targetChecks.pass(`CANCEL-${provider}`, `${label} cancellation is reported without burning state`);
		}
	} catch (error) {
		targetChecks.fail(`CANCEL-${provider}`, `${label} cancellation is reported`, error.message);
	}

	// 5. Missing code is distinguished, and does not burn the state.
	try {
		const fresh = await authorize(provider);
		const freshState = new URL(fresh.response.json.data.url).searchParams.get('state');
		const missing = await callback(provider, `?state=${encodeURIComponent(freshState)}`);
		const missingError = errorFromLocation(missing.location);
		const after = await callback(provider, `?code=probe&state=${encodeURIComponent(freshState)}`);
		const afterError = errorFromLocation(after.location);
		if (missingError !== 'oauth_missing_code' || afterError !== 'oauth_failed') {
			targetChecks.fail(`MISSING-${provider}`, `${label} missing code does not burn the state`,
				`missing=${missingError || '<none>'}, subsequent=${afterError || '<none>'}`);
		} else {
			targetChecks.pass(`MISSING-${provider}`, `${label} missing code is distinguished and state survives`);
		}
	} catch (error) {
		targetChecks.fail(`MISSING-${provider}`, `${label} missing code is distinguished`, error.message);
	}

	// 6. State replay is refused after a failed exchange.
	try {
		const fresh = await authorize(provider);
		const freshState = new URL(fresh.response.json.data.url).searchParams.get('state');
		const first = await callback(provider, `?code=probe&state=${encodeURIComponent(freshState)}`);
		const replay = await callback(provider, `?code=probe&state=${encodeURIComponent(freshState)}`);
		const firstError = errorFromLocation(first.location);
		const replayError = errorFromLocation(replay.location);
		if (firstError !== 'oauth_failed' || replayError !== 'oauth_state_invalid') {
			targetChecks.fail(`REPLAY-${provider}`, `${label} state replay is refused`,
				`first=${firstError || '<none>'}, replay=${replayError || '<none>'}`);
		} else {
			targetChecks.pass(`REPLAY-${provider}`, `${label} state replay is refused`);
		}
	} catch (error) {
		targetChecks.fail(`REPLAY-${provider}`, `${label} state replay is refused`, error.message);
	}

	// 7. A state minted for one provider cannot be redeemed on another.
	if (activeProviders.length > 1) {
		const other = activeProviders.find(item => item !== provider);
		try {
			const fresh = await authorize(provider);
			const freshState = new URL(fresh.response.json.data.url).searchParams.get('state');
			const cross = await callback(other, `?code=probe&state=${encodeURIComponent(freshState)}`);
			const crossError = errorFromLocation(cross.location);
			const legitimate = await callback(provider, `?code=probe&state=${encodeURIComponent(freshState)}`);
			const legitError = errorFromLocation(legitimate.location);
			if (crossError !== 'oauth_state_invalid' || legitError !== 'oauth_failed') {
				targetChecks.fail(`CROSS-${provider}`, `${label} state is provider-bound`,
					`cross=${crossError || '<none>'}, legitimate=${legitError || '<none>'}`);
			} else {
				targetChecks.pass(`CROSS-${provider}`, `${label} state is provider-bound`);
			}
		} catch (error) {
			targetChecks.fail(`CROSS-${provider}`, `${label} state is provider-bound`, error.message);
		}
	}

	// 8. Concurrent callbacks: exactly one consumes the state.
	try {
		const fresh = await authorize(provider);
		const freshState = new URL(fresh.response.json.data.url).searchParams.get('state');
		const responses = await Promise.all(Array.from({ length: 8 }, () =>
			callback(provider, `?code=probe&state=${encodeURIComponent(freshState)}`)));
		const errors = responses.map(item => errorFromLocation(item.location));
		const failed = errors.filter(item => item === 'oauth_failed').length;
		const invalid = errors.filter(item => item === 'oauth_state_invalid').length;
		if (failed !== 1 || invalid !== 7) {
			targetChecks.fail(`CONC-${provider}`, `${label} concurrent callbacks have one winner`,
				`oauth_failed=${failed}, oauth_state_invalid=${invalid}, other=${errors.length - failed - invalid}`);
		} else {
			targetChecks.pass(`CONC-${provider}`, `${label} concurrent callbacks have one winner`);
		}
	} catch (error) {
		targetChecks.fail(`CONC-${provider}`, `${label} concurrent callbacks have one winner`, error.message);
	}

	// 9. Apple's form_post is parsed as a POST body, not as a query string.
	if (provider === 'apple') {
		try {
			const fresh = await authorize('apple');
			const freshState = new URL(fresh.response.json.data.url).searchParams.get('state');
			const posted = await callback('apple', '', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ code: 'probe', state: freshState }).toString()
			});
			const postedError = errorFromLocation(posted.location);
			const replay = await callback('apple', `?code=probe&state=${encodeURIComponent(freshState)}`);
			const replayError = errorFromLocation(replay.location);
			if (postedError !== 'oauth_failed' || replayError !== 'oauth_state_invalid') {
				targetChecks.fail('FORM-APPLE', 'Apple form_post callback is parsed',
					`post=${postedError || '<none>'}, replay=${replayError || '<none>'}`);
			} else {
				targetChecks.pass('FORM-APPLE', 'Apple form_post callback is parsed');
			}
		} catch (error) {
			targetChecks.fail('FORM-APPLE', 'Apple form_post callback is parsed', error.message);
		}
	}

	// 10. Nonce is present but its verification is provider-specific.
	if (meta.nonce) {
		targetChecks.notRun(`NONCE-${provider}`, `${label} nonce is verified by the provider response`,
			'Authorize URL carries a nonce. Google/Microsoft resolve identity from the userinfo endpoint and do not compare id_token nonce; Apple verifies it. Real verification needs a provider login.');
	}
}

async function callback(provider, query = '', options = {}) {
	const suffix = query || '';
	return request(base, `/api/oauth/callback/${provider}${suffix}`, options);
}

/* ------------------------------------------------------------------------- *
 * Session, CORS and callback boundary checks
 * ------------------------------------------------------------------------- */

async function runSessionBoundaryChecks(targetBase, targetChecks) {
	const endpoints = [
		['GET', '/api/my/oauthIdentities', undefined],
		['POST', '/api/my/oauthIdentities/reauth', {}],
		['POST', '/api/my/oauthIdentities/bind/start', {}],
		['POST', '/api/my/oauthIdentities/bind/complete', {}],
		['DELETE', '/api/my/oauthIdentities/1', {}]
	];
	const failures = [];
	for (const [method, pathname, body] of endpoints) {
		try {
			const response = await request(targetBase, pathname, {
				method,
				headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body)
			});
			if (response.status !== 401) failures.push(`${method} ${pathname} -> ${response.status}`);
		} catch (error) {
			failures.push(`${method} ${pathname} -> ${error.message}`);
		}
	}
	if (failures.length) {
		targetChecks.fail('SESS-01', 'identity endpoints reject unauthenticated requests', failures.join('; '));
	} else {
		targetChecks.pass('SESS-01', 'identity endpoints reject unauthenticated requests');
	}

	try {
		const cookieOnly = await request(targetBase, '/api/my/oauthIdentities', {
			headers: { 'Cookie': 'epo_restricted_session=probe; token=probe; session=probe' }
		});
		if (cookieOnly.status === 401) {
			targetChecks.pass('SESS-02', 'identity endpoints do not authenticate from cookies');
		} else {
			targetChecks.fail('SESS-02', 'identity endpoints do not authenticate from cookies', `HTTP ${cookieOnly.status}`);
		}
	} catch (error) {
		targetChecks.fail('SESS-02', 'identity endpoints do not authenticate from cookies', error.message);
	}

	try {
		const fakeToken = await request(targetBase, '/api/my/oauthIdentities', {
			headers: { 'token': 'not-a-session' }
		});
		if (fakeToken.status === 401) {
			targetChecks.pass('SESS-03', 'identity endpoints reject a forged Bearer token');
		} else {
			targetChecks.fail('SESS-03', 'identity endpoints reject a forged Bearer token', `HTTP ${fakeToken.status}`);
		}
	} catch (error) {
		targetChecks.fail('SESS-03', 'identity endpoints reject a forged Bearer token', error.message);
	}

	// The callback must never set an application session cookie or leak a JWT
	// into the redirect Location.
	try {
		const response = await request(targetBase, '/api/oauth/callback/google?code=probe&state=probe-invalid-state');
		const cookies = appCookies(response.setCookies);
		assertNoSecretInLocation(response.location);
		if (cookies.length) {
			targetChecks.fail('CALLBACK-01', 'OAuth callback sets no application cookie', cookies.map(item => String(item).split('=')[0]).join(', '));
		} else {
			targetChecks.pass('CALLBACK-01', 'OAuth callback sets no application cookie');
		}
	} catch (error) {
		targetChecks.fail('CALLBACK-01', 'OAuth callback sets no application cookie', error.message);
	}

	// A callback without any cookies must still reach the state check: the flow
	// is cookie-independent, and losing browser cookies must not turn into a 500.
	try {
		const response = await request(targetBase, '/api/oauth/callback/google?code=probe&state=probe-invalid-state', {
			headers: { 'Cookie': '' }
		});
		const error = errorFromLocation(response.location);
		if (response.status === 302 && error === 'oauth_state_invalid') {
			targetChecks.pass('COOKIE-01', 'OAuth callback works without application cookies');
		} else {
			targetChecks.fail('COOKIE-01', 'OAuth callback works without application cookies', `HTTP ${response.status}, error=${error || '<none>'}`);
		}
	} catch (error) {
		targetChecks.fail('COOKIE-01', 'OAuth callback works without application cookies', error.message);
	}
}

async function runCorsChecks(targetBase, targetChecks) {
	try {
		const session = await request(targetBase, '/api/my/oauthIdentities', {
			method: 'OPTIONS',
			headers: {
				'Origin': 'https://evil.example',
				'Access-Control-Request-Method': 'GET'
			}
		});
		const allowOrigin = session.headers.get('access-control-allow-origin') || '';
		const allowCredentials = session.headers.get('access-control-allow-credentials') || '';
		if (allowOrigin === 'https://evil.example' || allowOrigin === '*' || allowCredentials === 'true') {
			targetChecks.fail('CORS-01', 'session endpoints refuse cross-origin callers',
				`ACAO=${allowOrigin || '<missing>'}, ACAC=${allowCredentials || '<missing>'}`);
		} else {
			targetChecks.pass('CORS-01', 'session endpoints refuse cross-origin callers');
		}
	} catch (error) {
		targetChecks.fail('CORS-01', 'session endpoints refuse cross-origin callers', error.message);
	}

	try {
		const token = await request(targetBase, '/api/oauth/token', {
			method: 'OPTIONS',
			headers: {
				'Origin': 'https://partner.example',
				'Access-Control-Request-Method': 'POST'
			}
		});
		const allowOrigin = token.headers.get('access-control-allow-origin') || '';
		const allowCredentials = token.headers.get('access-control-allow-credentials') || '';
		if (allowOrigin === '*' && allowCredentials !== 'true') {
			targetChecks.pass('CORS-02', 'OAuth token endpoint keeps its documented wildcard');
		} else {
			targetChecks.fail('CORS-02', 'OAuth token endpoint keeps its documented wildcard',
				`ACAO=${allowOrigin || '<missing>'}, ACAC=${allowCredentials || '<missing>'}`);
		}
	} catch (error) {
		targetChecks.fail('CORS-02', 'OAuth token endpoint keeps its documented wildcard', error.message);
	}
}

async function runDisabledProviderChecks(targetBase, targetChecks) {
	let site;
	try {
		site = await request(targetBase, '/api/setting/websiteConfig');
	} catch (error) {
		targetChecks.blocked('DISABLED-01', 'disabled providers cannot mint authorization URLs', error.message);
		return;
	}
	const data = site.json?.data;
	if (!data) {
		targetChecks.blocked('DISABLED-01', 'disabled providers cannot mint authorization URLs', `HTTP ${site.status}`);
		return;
	}
	const providers = data.oauthProviders && typeof data.oauthProviders === 'object' ? data.oauthProviders : {};
	const configured = Object.entries(providers).filter(([, value]) =>
		value && (value.configured === 1 || value.configured === true));
	const disabled = configured.filter(([, value]) => !(value.enabled === 1 || value.enabled === true));
	const masterOff = Number(data.oauthLoginEnabled) !== 1;
	const targets = new Map();
	if (masterOff) {
		const first = configured[0]?.[0] || 'google';
		targets.set(first, 'master switch is off');
	}
	for (const [key] of disabled) {
		if (!targets.has(key)) targets.set(key, 'provider is disabled');
	}
	if (!targets.size) {
		targetChecks.info('DISABLED-01', 'disabled providers cannot mint authorization URLs',
			'no configured-but-disabled provider and master switch is on; nothing to probe');
		return;
	}
	for (const [provider, reason] of targets) {
		const clientState = `probe-${crypto.randomUUID()}`;
		const redirectUri = `${targetBase}/api/oauth/callback/${provider}`;
		try {
			const response = await request(targetBase,
				`/api/oauth/authorize/${provider}?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(clientState)}`);
			if (response.status === 200 && response.json?.data?.url) {
				targetChecks.fail(`DISABLED-${provider}`, `${provider} cannot mint an authorization URL while ${reason}`,
					'HTTP 200 with an authorization URL; the admin switch is UI-only (F9)');
			} else if ([400, 403].includes(response.status)) {
				targetChecks.pass(`DISABLED-${provider}`, `${provider} cannot mint an authorization URL while ${reason}`);
			} else {
				targetChecks.blocked(`DISABLED-${provider}`, `${provider} cannot mint an authorization URL while ${reason}`,
					`HTTP ${response.status}: ${String(response.json?.message || '').slice(0, 160)}`);
			}
		} catch (error) {
			targetChecks.fail(`DISABLED-${provider}`, `${provider} cannot mint an authorization URL while ${reason}`, error.message);
		}
	}
}

function runUnrunnableChecks(targetChecks, providers) {
	const list = providers.map(key => PROVIDER_META[key].label).join(', ');
	targetChecks.notRun('BIND-UI-01', 'unbound provider identity renders the bind UI',
		`Requires a real ${list} login with an identity that has no mailbox. The callback must redirect to /login?oauth_user_id=...&oauth_provider=...#oauth_bind=<proof>.`);
	targetChecks.notRun('BIND-01', 'bind completes and creates one mailbox',
		'Requires the bind UI, a staging invite code and a test mailbox address. Verify exactly one account and one oauth row, then clean both.');
	targetChecks.notRun('RELOGIN-01', 'bound identity logs in again without a bind prompt',
		'Sign out, repeat the provider flow, and verify the mailbox opens directly.');
	targetChecks.notRun('MFA-01', 'MFA challenge follows a provider login',
		'Use an account with TOTP enabled: wrong code fails, correct code creates a session; a backup code also works.');
	targetChecks.notRun('STATE-EXPIRY-01', 'state expires after 10 minutes',
		'Authorize, wait >600s at the provider, then complete. Expected: oauth_state_invalid. A D1-assisted variant is documented in the report; it requires staging D1 write access.');
	targetChecks.notRun('DUP-01', 'one provider identity cannot bind two accounts',
		'Complete a bind with account A, then attempt the same provider identity with account B. Expected: bind UI reports already bound/conflict.');
	targetChecks.notRun('CROSSUSER-01', 'another session cannot redeem a bind claim',
		'Start a bind in session A, copy only the callback URL to session B, redeem there. Expected: 410 bind_claim_invalid; identity remains unbound.');
	targetChecks.notRun('REFRESH-01', 'browser refresh does not replay a login',
		'Refresh the callback/login URL after a successful exchange. Expected: oauth_state_invalid or a consumed-code error; no second session.');
	targetChecks.notRun('MOBILE-01', 'mobile provider flow and settings UI',
		'Run 390x844 and a real iOS/Android browser: provider consent, callback, bind UI, settings identity card, no horizontal overflow.');
	targetChecks.notRun('DESKTOP-01', 'desktop provider flow and settings UI',
		'Run 1440x900 Chrome/Firefox/Safari: consent, callback, bind UI, settings identity card, no console errors.');
}

/* ------------------------------------------------------------------------- *
 * Reporting
 * ------------------------------------------------------------------------- */

function printPlan() {
	checks.print('OAuth staging acceptance — plan');
	console.log(`
Manual provider matrix (all rows remain NOT RUN until executed against staging):

  Google:
    1. OAuth client: Web application; redirect URI <staging>/api/oauth/callback/google; scopes openid email profile.
    2. Consent screen in Testing mode with the test Google account added as a test user.
    3. Click Google on /login -> consent -> callback.
    4. New identity: bind UI (email + optional invite code) -> bind -> mailbox.
    5. Existing identity: direct mailbox; MFA account: TOTP challenge.
    6. Cancel on the consent screen -> oauth_denied; no session.
    7. Replay the callback URL -> oauth_state_invalid; no second session.
    8. Wait >10 minutes at consent -> oauth_state_invalid.
    9. Sign out and repeat -> direct mailbox.
   10. Clear sessionStorage between authorize and callback -> login page rejects (no session); retry works.

  GitHub:
    1. Separate GitHub OAuth App (one callback URL per app); callback <staging>/api/oauth/callback/github.
    2. Scopes read:user user:email; test account with a verified primary email.
    3. Same eight flow checks as Google; also test a private-email account (no auto-link, bind UI still works).
    4. Cancel -> oauth_denied; replay/expiry -> oauth_state_invalid.

  Apple:
    1. Service ID + Sign in with Apple, return URL <staging>/api/oauth/callback/apple, verified domain.
       Apple domain verification requires a custom domain you control; a workers.dev host is not sufficient.
    2. Generate the ES256 client-secret JWT from the .p8 key (Team ID + Key ID + Service ID); paste the JWT
       into Client Secret. The backend does not generate it and the Team ID/Key ID fields are not used.
    3. Apple posts the callback (response_mode=form_post); confirm the POST is not blocked by WAF/Access.
    4. New identity: bind UI; note email is returned only on first authorization.
    5. Re-login: no email in the response; the stored email must be preserved.
    6. Hide My Email: @privaterelay.appleid.com; verify bind behavior.
    7. Cancel -> oauth_denied; replay/expiry -> oauth_state_invalid.

Cross-cutting manual checks:
  - Duplicate identity across two accounts -> conflict, one row only.
  - Cross-user claim redemption -> 410, identity stays unbound.
  - Cookie loss between authorize and callback -> login page rejects; retry succeeds.
  - Refresh after success -> no second session.
  - Mobile 390x844 and desktop 1440x900; real iOS/Android browsers.
  - Cleanup: delete test users, oauth rows, audit rows, auth KV keys; restore invite slot; rotate/delete OAuth clients.

Static findings are printed below. To run protocol checks:
  node tests/oauth-staging-acceptance.mjs --run \\
    --base-url https://<staging-host> --confirm-staging \\
    --providers google,github,apple --report doc/oauth-staging-run.md

REAL PROVIDER ACCEPTANCE: NOT RUN`);
}

function buildFindings() {
	const list = [];
	if (hasBlockingFailure()) {
		list.push('Automated protocol/security checks have at least one FAIL. Treat the acceptance gate as blocked.');
	}
	const openLoginCsrf = checks.items.some(item =>
		(item.id === 'UI-STATE-01' || item.id === 'SRV-STATE-01' || item.id.startsWith('STATE-')) && item.status === 'FAIL');
	if (openLoginCsrf) {
		list.unshift('**P0 (open) login CSRF / empty client state**: the public authorize endpoint accepts an omitted client state and the login UI compares "" with "", so an attacker-minted callback can log a victim into the attacker\'s mailbox. Fix both gates before release. Evidence: `mail-worker/test/security-review-adversarial.spec.js` (residual test) and `temp_login_ui/src/app/components/epomail/AuthForm.tsx`.');
	}
	list.push('**P1 (open) Apple "configured" can be true without a usable client secret**: `sanitizeOAuthProviders` accepts `teamId && keyId` as configured, but the backend never derives `clientSecret` from the `.p8` key and the admin form does not save `privateKey`. Apple then appears enabled and fails at token exchange.');
	list.push('**P2 (open) PKCE is not implemented**: no `code_challenge`/`code_verifier` is used. With confidential clients, exact redirect URI + client authentication + state are the compensating controls; record this as an accepted risk or add PKCE before broader rollout.');
	list.push('**P2 (open) Google/Microsoft/custom nonce is sent but not verified**: identity is resolved from the userinfo endpoint with an access token, so the id_token nonce is never compared. Apple does verify it.');
	list.push('**P1 (open) OAuth client secrets live in the settings row and the KV settings cache in plaintext, while env-only secrets do not set the public "configured" flag**: keep staging D1/KV access restricted, prefer Worker Secrets for the staging lifecycle, and rotate/delete the test client secrets afterwards.');
	list.push('**P1 (open) disabling OAuth does not stop server-side authorization**: `getAuthorizeUrl` and the callback path never check `oauthLoginEnabled` or the provider `enabled` flag. The admin switch only hides UI; a previously issued authorize URL (10-minute state) or a direct API call still completes login. For emergency rollback, block `/api/oauth/*` at the edge, rotate/remove the provider client secret, and purge unused `oauth_state` rows.');
	list.push('**P2 (open) the public authorize endpoint has no rate limit**: each call inserts an `oauth_state` row; a scripted caller can grow the staging D1 table. Add a per-IP limit or require a signed initiation.');
	list.push('**P2 (open) the admin "verify" action only checks provider discovery connectivity**: it does not validate the client secret, redirect URI or scopes. Do not treat a green verify as provider acceptance.');
	return list;
}

function finish({ run, base: targetBase = '', printChecks = true }) {
	const finalFindings = buildFindings();
	const providerRows = SELECTED.map(provider => {
		const auth = checks.items.find(item => item.id === `AUTH-${provider}`);
		const cancel = checks.items.find(item => item.id === `CANCEL-${provider}`);
		const replay = checks.items.find(item => item.id === `REPLAY-${provider}`);
		const state = checks.items.find(item => item.id === `STATE-${provider}`);
		return {
			provider: PROVIDER_META[provider].label,
			authorize: auth?.status === 'PASS' ? 'PASS (URL contract)' : auth?.status || 'NOT RUN',
			stateNonce: state?.status === 'PASS' ? 'PARTIAL (state gate; nonce verification NOT RUN)' : 'NOT RUN',
			callback: replay?.status === 'PASS' ? 'PARTIAL (invalid-state/replay only)' : 'NOT RUN',
			bindUi: 'NOT RUN',
			bind: 'NOT RUN',
			relogin: 'NOT RUN',
			mfa: 'NOT RUN',
			cancel: cancel?.status === 'PASS' ? 'PASS (protocol)' : 'NOT RUN',
			expiryReplay: replay?.status === 'PASS' ? 'PARTIAL (replay only; expiry NOT RUN)' : 'NOT RUN'
		};
	});

	const manualRows = [
		'Google: consent screen in Testing mode; test account added; callback registered exactly.',
		'Google: new identity -> bind UI -> bind -> mailbox; existing identity -> direct mailbox.',
		'Google: MFA account -> TOTP/backup code challenge; wrong code rejected.',
		'Google: cancel, replay, >10 minute expiry, post-bind re-login, sessionStorage loss.',
		'GitHub: separate OAuth App; verified primary email; private-email account.',
		'GitHub: bind UI, MFA, cancel, replay, expiry, re-login.',
		'Apple: custom domain verified; Service ID; ES256 client secret JWT; form_post callback.',
		'Apple: bind UI, first-login email, re-login without email, Hide My Email, cancel, replay, expiry.',
		'Duplicate identity across two accounts; cross-user claim redemption.',
		'Cookie loss, refresh, mobile 390x844 and desktop 1440x900.',
		'Cleanup: test users, oauth rows, audit rows, auth KV keys, invite slot, OAuth clients/secrets.'
	];

	notes.push('This runner never opens a provider login page. Rows marked NOT RUN are not evidence of provider acceptance.');
	notes.push('Protocol checks create short-lived oauth_state rows (10-minute TTL) and rate-limit KV keys; they create no mailbox account.');
	notes.push('The report is only meaningful for an isolated staging origin. The runner refuses production hosts and requires --confirm-staging.');
	notes.push('For state-expiry testing with D1 access: read the state from the authorize URL, compute its SHA-256, set expires_at=1 for that token_hash, then call the callback. Expected: oauth_state_invalid.');

	if (args.report) {
		const report = renderReport({
			base: targetBase,
			commit: currentCommit(),
			checks,
			providerRows,
			findings: finalFindings,
			manualRows,
			notes
		});
		const written = writeReport(args.report, report);
		console.log(`\nReport written: ${written}`);
	}

	if (!args.report && printChecks) checks.print(run ? 'OAuth staging acceptance — protocol run' : 'OAuth staging acceptance — plan');
	if (finalFindings.length) {
		console.log('\nFindings:');
		for (const finding of finalFindings) console.log(`- ${finding}`);
	}
	console.log(`
Release gate: ${hasBlockingFailure() ? 'FAIL' : 'NO AUTOMATED FAILURES (manual provider rows still NOT RUN)'}
REAL PROVIDER ACCEPTANCE: NOT RUN — no real Google/GitHub/Apple login was performed.
`);
}
