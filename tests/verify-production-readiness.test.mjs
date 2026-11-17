import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseArgs,
  CheckSuite,
  checkBuildArtifacts,
  checkWranglerConfig,
  runLiveProbes,
  MANDATORY_SECRETS
} from '../scripts/verify-production-readiness.mjs';

mkdirSync(tmpdir(), { recursive: true });

test('parseArgs accepts a probe origin and refuses obsolete or incomplete flags', () => {
  assert.deepEqual(parseArgs(['--base-url', 'https://mail.example.test', '--json']),
    { baseUrl: 'https://mail.example.test', json: true, help: false });
  assert.equal(parseArgs(['--base-url=https://mail.example.test']).baseUrl, 'https://mail.example.test');
  assert.throws(() => parseArgs(['--base-url', '--json']), /requires an origin/);
  assert.throws(() => parseArgs(['--init-secret', 'synthetic-value']), /Unsupported option/);
  assert.throws(() => parseArgs(['--skip-tests']), /Unsupported option/);
});

test('CheckSuite tracks pass, fail, warn, info accurately', () => {
  const suite = new CheckSuite({ json: true });
  assert.equal(suite.hasFailures(), false);

  suite.pass('TEST-01', 'Pass title', 'pass detail');
  suite.warn('TEST-02', 'Warn title', 'warn detail');
  suite.info('TEST-03', 'Info title', 'info detail');
  assert.equal(suite.hasFailures(), false);

  suite.fail('TEST-04', 'Fail title', 'fail detail');
  assert.equal(suite.hasFailures(), true);

  const json = suite.toJSON();
  assert.equal(json.length, 4);
  assert.equal(json[0].status, 'PASS');
  assert.equal(json[1].status, 'WARN');
  assert.equal(json[2].status, 'INFO');
  assert.equal(json[3].status, 'FAIL');
});

test('checkBuildArtifacts succeeds against built dist', () => {
  const suite = new CheckSuite({ json: true });
  checkBuildArtifacts(suite);
  assert.equal(suite.hasFailures(), false);
  const passes = suite.toJSON().filter(r => r.status === 'PASS');
  assert.ok(passes.length >= 2, 'Build artifacts must include main and login apps');
});

test('checkWranglerConfig validates security baselines in repo', () => {
  const suite = new CheckSuite({ json: true });
  checkWranglerConfig(suite);
  assert.equal(suite.hasFailures(), false);

  const results = suite.toJSON();
  const cfg01 = results.find(r => r.id === 'CFG-01');
  assert.ok(cfg01 && cfg01.status === 'PASS', 'Production environment must be explicit');

  const cfg02 = results.find(r => r.id === 'CFG-02');
  assert.ok(cfg02 && cfg02.status === 'PASS', 'ALLOW_URL_INIT must be verified');

  const cfg04 = results.find(r => r.id === 'CFG-04');
  assert.ok(cfg04 && cfg04.status === 'PASS', 'No secrets in wrangler.toml');
});

test('MANDATORY_SECRETS includes bootstrap and scheduled credentials', () => {
  const secretNames = MANDATORY_SECRETS.map(s => s.name);
  assert.ok(secretNames.includes('jwt_secret'));
  assert.ok(secretNames.includes('totp_enc_key'));
  assert.ok(secretNames.includes('oauth_client_enc_key'));
  assert.ok(secretNames.includes('email_enc_key'));
  assert.ok(secretNames.includes('init_secret'));
  assert.ok(secretNames.includes('resend_webhook_secret'));
  assert.ok(secretNames.includes('admin_initial_password'));
});

test('production preflight rejects missing production values despite valid staging settings', t => {
  const dir = mkdtempSync(join(tmpdir(), 'epomail-preflight-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = join(dir, 'wrangler.toml');
  const source = readFileSync(new URL('../mail-worker/wrangler.toml', import.meta.url), 'utf8');
  writeFileSync(config, source.replace(/^ALLOW_URL_INIT = "false"$/m, '# ALLOW_URL_INIT = "false"')
    .replace(/^EMAIL_OUTBOUND_ENABLED = "false"$/m, '# EMAIL_OUTBOUND_ENABLED = "false"'));
  const suite = new CheckSuite({ json: true });
  checkWranglerConfig(suite, config);
  assert.deepEqual(suite.toJSON().filter(item => item.status === 'FAIL').map(item => item.id),
    ['CFG-02', 'CFG-05']);
});

test('online preflight only reads config, login HTML and same-origin login assets', async () => {
  const suite = new CheckSuite({ json: true });
  const requests = [];
  await runLiveProbes('https://staging.example.test', suite, async (url, options) => {
    requests.push(url.pathname);
    assert.equal(options.method, undefined);
    assert.equal(options.redirect, 'error');
    if (url.pathname.startsWith('/api/')) return Response.json({ code: 200, data: { oauthLoginEnabled: 0, oauthProviders: {} } });
    if (url.pathname === '/login/') return new Response('<script type="module" src="/login/assets/main.js"></script>', { headers: { 'Content-Type': 'text/html' } });
    return new Response('void 0', { headers: { 'Content-Type': 'text/javascript' } });
  });
  assert.equal(suite.hasFailures(), false);
  assert.deepEqual(requests, ['/api/setting/websiteConfig', '/login/', '/login/assets/main.js']);
});

test('Staging preflight requires explicit sandbox scope and an enforced recipient list', async t => {
  const { runStaticChecks, Checks } = await import('../scripts/lib/oauth-staging.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'epomail-staging-policy-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const configPath = join(dir, 'wrangler.toml');
  const source = readFileSync(new URL('../mail-worker/wrangler.toml', import.meta.url), 'utf8');
  const enabled = source.replace(/(\[env\.staging\.vars\][\s\S]*?)EMAIL_OUTBOUND_ENABLED = "false"/,
    '$1EMAIL_OUTBOUND_ENABLED = "true"\nOUTBOUND_WHITELIST_ENFORCE = "true"');
  writeFileSync(configPath, enabled);
  function state(allowSandboxOutbound) {
    const checks = runStaticChecks({ configPath, checks: new Checks({ color: false }), allowSandboxOutbound });
    return checks.toJSON().items.find(item => item.id === 'CFG-11').status;
  }
  assert.equal(state(false), 'FAIL');
  assert.equal(state(true), 'PASS');
  writeFileSync(configPath, enabled.replace('OUTBOUND_WHITELIST_ENFORCE = "true"', 'OUTBOUND_WHITELIST_ENFORCE = "false"'));
  assert.equal(state(true), 'FAIL');
});
