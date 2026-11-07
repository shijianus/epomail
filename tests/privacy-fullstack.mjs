import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { withLocalStack } from './helpers/local-stack.mjs';
import { checkPrivacyReadiness } from '../scripts/check-privacy-readiness.mjs';

const hold = process.argv.includes('--hold');
const assetsIndex = process.argv.indexOf('--assets');
const assetsDir = assetsIndex < 0 ? undefined : process.argv[assetsIndex + 1];
if (assetsIndex >= 0 && (!assetsDir || assetsDir.startsWith('--'))) throw new Error('--assets requires a compiled asset directory');
const checks = [];
const notice = {
  operatorName: 'Local synthetic test operator',
  operatorCountry: 'Test environment',
  contactEmail: 'privacy@example.com',
  policyVersion: 'local-privacy-review-1',
  termsUrl: 'https://docs.epocanvas.com/epomail/mail/terms-of-service/',
  privacyUrl: 'https://docs.epocanvas.com/epomail/mail/privacy-policy/',
  recipientsUrl: 'https://docs.epocanvas.com/epomail/mail/sub-processors/',
  retentionUrl: 'https://docs.epocanvas.com/epomail/mail/data/'
};
const processing = {
  verificationCodeEnabled: false,
  translationEnabled: false,
  ocrEnabled: false,
  publicTranslationFallbackEnabled: false,
  noticeUrl: ''
};
const userEmail = 'privacy-review@example.com';
const userPassword = 'Local-privacy-review-26';
const adminPassword = 'Local-admin-review-26';

async function request(base, path, { token, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...headers,
      ...(token ? { Authorization: token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch (_) { json = null; }
  return { response, text, json };
}
function passed(name) { checks.push(name); console.log(`PASS ${name}`); }
function expectSuccess(result, label) {
  assert.equal(result.json?.code, 200, `${label}: code=${result.json?.code}, errorCode=${result.json?.errorCode || 'none'}`);
  return result.json.data;
}

await withLocalStack(async stack => {
  const { base, jwtSecret } = stack;
  const initial = await request(base, '/api/init', { method: 'POST', headers: { 'x-init-secret': jwtSecret } });
  assert.equal(initial.response.status, 200);
  const initialPassword = initial.text.match(/Initial admin password:\s*(\S+)/)?.[1];
  assert.ok(initialPassword, 'cold initialization must provide its development credential');
  const again = await request(base, '/api/init', { method: 'POST', headers: { 'x-init-secret': jwtSecret } });
  assert.equal(again.response.status, 200);
  assert.match(again.text, /success/i);
  passed('cold initialization and privacy migrations are idempotent');

  let adminToken = expectSuccess(await request(base, '/api/login', {
    method: 'POST', body: { email: 'admin@example.com', password: initialPassword }
  }), 'admin login').token;
  assert.ok(adminToken);
  expectSuccess(await request(base, '/api/my/resetPassword', {
    token: adminToken, method: 'PUT', body: { currentPassword: initialPassword, password: adminPassword }
  }), 'synthetic admin password update');
  adminToken = expectSuccess(await request(base, '/api/login', {
    method: 'POST', body: { email: 'admin@example.com', password: adminPassword }
  }), 'admin re-login').token;
  passed('existing administrator can sign in before operator disclosures are configured');

  const emptyConfig = expectSuccess(await request(base, '/api/setting/websiteConfig'), 'empty public config');
  assert.equal(emptyConfig.registrationReadiness.ready, false);
  assert.ok(emptyConfig.registrationReadiness.missing.includes('operatorName'));
  assert.deepEqual(emptyConfig.contentProcessing, processing);
  const registration = { email: userEmail, password: userPassword, acceptedTerms: true, termsVersion: notice.policyVersion, locale: 'en', sourceUrl: notice.termsUrl };
  const blocked = await request(base, '/api/register', { method: 'POST', body: registration });
  assert.notEqual(blocked.json?.code, 200);
  passed('incomplete disclosures keep registration and optional content processing closed');

  expectSuccess(await request(base, '/api/setting/set', {
    token: adminToken, method: 'PUT', body: { ...notice, register: 0, regKey: 1, registerVerify: 1, contentProcessing: processing }
  }), 'synthetic operator configuration');
  const config = expectSuccess(await request(base, '/api/setting/websiteConfig'), 'configured public config');
  assert.equal(config.registrationReadiness.ready, true);
  assert.equal(config.legalNotice.termsVersion, notice.policyVersion);
  const readiness = await checkPrivacyReadiness({ base });
  assert.equal(readiness.status, 'ready', readiness.checks.filter(check => check.status === 'fail').map(check => check.field).join(', '));
  passed('configured public disclosure contract matches the registration form');

  for (const [patch, code] of [
    [{ acceptedTerms: false }, 'terms_acceptance_required'],
    [{ termsVersion: 'old' }, 'terms_version_mismatch'],
    [{ sourceUrl: 'https://example.com/stale' }, 'terms_source_mismatch']
  ]) {
    const rejected = await request(base, '/api/register', { method: 'POST', body: { ...registration, ...patch } });
    assert.equal(rejected.json?.errorCode, code);
  }
  passed('unchecked, outdated and changed-source acceptance is rejected before account creation');
  expectSuccess(await request(base, '/api/register', { method: 'POST', body: registration }), 'registration');
  const userToken = expectSuccess(await request(base, '/api/login', {
    method: 'POST', body: { email: userEmail, password: userPassword }
  }), 'new user login').token;
  assert.ok(userToken);
  const user = expectSuccess(await request(base, '/api/my/loginUserInfo', { token: userToken }), 'new user info');
  assert.equal(user.privacyPreferences.aiVerificationCode, false);
  passed('a newly accepted user can sign in with optional AI processing off');

  const disabled = await request(base, '/api/email/translate', {
    token: userToken, method: 'POST', body: { text: 'Synthetic content only', targetLang: 'fr', confirmed: true, noticeUrl: notice.recipientsUrl, enableOcr: false }
  });
  assert.equal(disabled.json?.errorCode, 'privacy_processing_disabled');
  passed('disabled translation is denied by the real API');
  expectSuccess(await request(base, '/api/my/updateProfile', {
    token: userToken, method: 'PUT', body: { privacyPreferences: { aiVerificationCode: true } }
  }), 'save optional preference');
  const changed = expectSuccess(await request(base, '/api/my/loginUserInfo', { token: userToken }), 'saved preference');
  assert.equal(changed.privacyPreferences.aiVerificationCode, true);
  expectSuccess(await request(base, '/api/my/updateProfile', {
    token: userToken, method: 'PUT', body: { privacyPreferences: { aiVerificationCode: false } }
  }), 'withdraw optional preference');
  passed('optional processing preference can be set and withdrawn without closing the account');

  const revoked = expectSuccess(await request(base, '/api/my/telegram/revokeLinks', {
    token: userToken, method: 'POST', body: {}
  }), 'revoke reading links');
  assert.equal(revoked.scope, 'all_existing_telegram_links');
  passed('authenticated reading-link revocation is available independently of notifications');

  const accounts = expectSuccess(await request(base, '/api/account/list', { token: adminToken }), 'admin account list');
  const rows = Array.isArray(accounts) ? accounts : accounts.list;
  const sender = rows.find(row => row.email === 'admin@example.com');
  assert.ok(sender);
  expectSuccess(await request(base, '/api/email/send', {
    token: adminToken, method: 'POST', body: {
      accountId: sender.accountId, receiveEmail: [userEmail], sendType: 0,
      subject: 'Privacy controls review', text: 'This synthetic message is used only for local UI review.',
      content: '<h2>Privacy controls review</h2><p>This synthetic message is used only for local UI review.</p><p>Remote images should remain blocked until you choose to load them.</p><img src="https://tracking.invalid/review.png" alt="Synthetic remote image">',
      attachments: []
    }
  }), 'local synthetic message');
  passed('synthetic UI review mail is delivered locally without an external email provider');

  if (hold) {
    console.log(`LOCAL_REVIEW_BASE=${base}`);
    console.log('Synthetic GUI accounts: privacy-review@example.com / Local-privacy-review-26; admin@example.com / Local-admin-review-26');
    console.log('The isolated local stack remains open for browser review; stopping it removes all test state.');
    const stopFile = path.join(stack.tempDir, 'browser-review.complete');
    console.log(`LOCAL_REVIEW_STOP_FILE=${stopFile}`);
    const requestedStop = async () => {
      for (let i = 0; i < 90 * 60; i++) {
        try { await access(stopFile); return; } catch (_) {}
        await delay(1000, undefined, { signal: stack.signal });
      }
    };
    await Promise.race([requestedStop(), stack.failure]);
  } else {
    const deleted = expectSuccess(await request(base, '/api/my/delete', { token: userToken, method: 'DELETE' }), 'self deletion');
    assert.equal(deleted.accountDisabled, true);
    assert.equal(deleted.physicalDeletionComplete, false);
    assert.equal(deleted.deletionStatus, 'manual_review');
    const denied = await request(base, '/api/my/geo', { token: userToken });
    assert.equal(denied.json?.code, 401);
    const newLogin = await request(base, '/api/login', { method: 'POST', body: { email: userEmail, password: userPassword } });
    assert.notEqual(newLogin.json?.code, 200);
    passed('self deletion disables sessions and future login while preserving an honest manual-review status');
  }
}, assetsDir ? { assetsDir: path.resolve(assetsDir) } : undefined);
console.log(`${checks.length} privacy full-stack checks passed; isolated process and data cleanup complete.`);
