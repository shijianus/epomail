import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseArgs,
  CheckSuite,
  checkBuildArtifacts,
  checkWranglerConfig,
  MANDATORY_SECRETS
} from '../scripts/verify-production-readiness.mjs';

test('parseArgs parses all arguments accurately', () => {
  const args = parseArgs([
    '--base-url', 'https://mail.epocanvas.com',
    '--init-secret', 'test-secret-123',
    '--json',
    '--skip-tests'
  ]);
  assert.equal(args.baseUrl, 'https://mail.epocanvas.com');
  assert.equal(args.initSecret, 'test-secret-123');
  assert.equal(args.json, true);
  assert.equal(args.skipTests, true);
  assert.equal(args.help, false);
});

test('parseArgs handles equals format and flags', () => {
  const args = parseArgs([
    '--base-url=https://staging.epocanvas.com',
    '--init-secret=sec456',
    '-h'
  ]);
  assert.equal(args.baseUrl, 'https://staging.epocanvas.com');
  assert.equal(args.initSecret, 'sec456');
  assert.equal(args.help, true);
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
  const cfg02 = results.find(r => r.id === 'CFG-02');
  assert.ok(cfg02 && cfg02.status === 'PASS', 'ALLOW_URL_INIT must be verified');

  const cfg04 = results.find(r => r.id === 'CFG-04');
  assert.ok(cfg04 && cfg04.status === 'PASS', 'No secrets in wrangler.toml');
});

test('MANDATORY_SECRETS contains required 6 secrets', () => {
  const secretNames = MANDATORY_SECRETS.map(s => s.name);
  assert.ok(secretNames.includes('jwt_secret'));
  assert.ok(secretNames.includes('totp_enc_key'));
  assert.ok(secretNames.includes('email_enc_key'));
  assert.ok(secretNames.includes('init_secret'));
  assert.ok(secretNames.includes('resend_webhook_secret'));
  assert.ok(secretNames.includes('admin_initial_password'));
});
