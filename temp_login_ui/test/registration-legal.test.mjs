import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildTermsAcceptance, readRegistrationPolicy, registrationErrorKey, registrationNoticeUrl
} from '../src/app/registration-legal.ts';
import { buildOAuthBindPayload, classifyBindPolicyError, classifyBindResponse } from '../src/app/oauth-bind.ts';
import { AUTH_LANGS, authDict } from '../src/app/i18n/authLocale.ts';

// In-memory synthetic fixtures only; no identity/configuration is written anywhere.
const fixture = () => ({
  legalNotice: {
    operatorName: 'Synthetic test operator', operatorCountry: 'Test jurisdiction',
    contactEmail: 'fixture@example.test', contactAddress: '', termsVersion: 'test-v1',
    termsUrl: 'https://example.test/terms?lang=zh#v1',
    privacyUrl: 'https://example.test/privacy', recipientsUrl: '', retentionUrl: ''
  },
  registrationReadiness: { ready: true, missing: [] }
});
const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('requires strict readiness and all required operator notice fields', () => {
  for (const ready of [undefined, null, false, 1, 'true', [], {}]) {
    const config = fixture();
    config.registrationReadiness.ready = ready;
    assert.equal(readRegistrationPolicy(config).ready, false);
  }
  for (const field of ['operatorName', 'operatorCountry', 'contactEmail', 'termsVersion', 'termsUrl', 'privacyUrl']) {
    for (const value of [undefined, null, '', ' ', true, 1, {}, []]) {
      const config = fixture();
      config.legalNotice[field] = value;
      assert.equal(readRegistrationPolicy(config).ready, false, field);
    }
  }
  for (const config of [null, undefined, {}, [], { registrationReadiness: { ready: true, missing: [] } }]) {
    assert.equal(readRegistrationPolicy(config).ready, false);
  }
  for (const missing of [undefined, null, '', ['operatorName'], {}]) {
    const config = fixture();
    config.registrationReadiness.missing = missing;
    assert.equal(readRegistrationPolicy(config).ready, false);
  }
});

test('optional address and policy links never invent identity or impose a home-address requirement', () => {
  const config = fixture();
  delete config.legalNotice.contactAddress;
  delete config.legalNotice.recipientsUrl;
  delete config.legalNotice.retentionUrl;
  const policy = readRegistrationPolicy(config);
  assert.equal(policy.ready, true);
  assert.equal(policy.notice.contactAddress, '');
  assert.equal(policy.notice.recipientsUrl, '');
  assert.equal(readRegistrationPolicy(null).notice.operatorName, '');
});

test('URL validation rejects unsafe schemes, credentials, ambiguous inputs and insecure public HTTP', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', '/terms', '//example.test/terms',
    'http://example.test/terms', 'https://user:password@example.test/terms', 'https://@example.test',
    ' https://example.test/terms', 'https://example.test/unsafe%0a', 'https://example.test\\terms',
    'https://example.test/terms\n']) {
    assert.equal(registrationNoticeUrl(url), '', url);
    assert.equal(registrationNoticeUrl(url, true), '', url);
    const config = fixture();
    config.legalNotice.termsUrl = url;
    assert.equal(readRegistrationPolicy(config).ready, false);
  }
  assert.equal(registrationNoticeUrl('http://127.0.0.1:8787/terms'), '');
  assert.equal(registrationNoticeUrl('http://127.0.0.1:8787/terms', true), 'http://127.0.0.1:8787/terms');
  const config = fixture();
  config.legalNotice.recipientsUrl = 'javascript:alert(1)';
  config.legalNotice.retentionUrl = 'https://user:password@example.test';
  assert.equal(readRegistrationPolicy(config).notice.recipientsUrl, '');
  assert.equal(readRegistrationPolicy(config).notice.retentionUrl, '');
});

test('acceptance starts unchecked and payload retains exact terms URL/version and one of six locales', () => {
  const config = fixture();
  config.legalNotice.termsUrl = 'HTTPS://EXAMPLE.TEST:443/terms?b=2&a=%7E#v1';
  const policy = readRegistrationPolicy(config);
  assert.equal(buildTermsAcceptance(policy, null, 'en'), null);
  assert.equal(buildTermsAcceptance(policy, true, 'en'), null);
  assert.equal(buildTermsAcceptance(policy, '', 'en'), null);
  for (const locale of AUTH_LANGS) {
    assert.deepEqual(buildTermsAcceptance(policy, policy.revision, locale), {
      acceptedTerms: true,
      termsVersion: config.legalNotice.termsVersion,
      sourceUrl: config.legalNotice.termsUrl,
      locale
    });
  }
  assert.equal(buildTermsAcceptance(policy, policy.revision, 'de'), null);
});

test('version, exact source, identity or notice changes invalidate the old confirmation immediately', () => {
  const original = readRegistrationPolicy(fixture());
  for (const [field, value] of [
    ['termsVersion', 'test-v2'], ['termsUrl', 'https://example.test/terms?lang=fr#v1'],
    ['privacyUrl', 'https://example.test/privacy-v2'], ['operatorName', 'Changed synthetic operator'],
    ['contactEmail', 'changed@example.test']
  ]) {
    const config = fixture();
    config.legalNotice[field] = value;
    const changed = readRegistrationPolicy(config);
    assert.equal(changed.ready, true);
    assert.equal(buildTermsAcceptance(changed, original.revision, 'en'), null, field);
  }
  assert.equal(buildTermsAcceptance(readRegistrationPolicy(null), original.revision, 'en'), null);
  // DEV only permits loopback notice URLs, never bypasses readiness or acceptance.
  const dev = fixture();
  dev.legalNotice.termsUrl = 'http://localhost:8787/terms';
  dev.legalNotice.privacyUrl = 'http://localhost:8787/privacy';
  assert.equal(buildTermsAcceptance(readRegistrationPolicy(dev, true), null, 'en'), null);
  dev.legalNotice.operatorName = '';
  assert.equal(readRegistrationPolicy(dev, true).ready, false);
});

test('OAuth create-and-bind adds the same exact acceptance, without changing proof identity or existing payloads', () => {
  const context = { provider: 'apple', oauthUserId: 'synthetic-user', bindToken: 'synthetic-proof' };
  const policy = readRegistrationPolicy(fixture());
  const acceptance = buildTermsAcceptance(policy, policy.revision, 'zh-Hant');
  const input = { email: ' fixture@example.test ', code: ' INVITE ' };
  const payload = buildOAuthBindPayload(context, input, acceptance);
  assert.deepEqual(payload, { email: 'fixture@example.test', code: 'INVITE', ...acceptance, ...context });
  assert.equal(Object.hasOwn(buildOAuthBindPayload(context, input), 'acceptedTerms'), false);
});

test('only explicit unconsumed legal failures override the normal OAuth 409 restart rule', () => {
  for (const errorCode of ['legal_registration_unready', 'terms_acceptance_required', 'terms_version_mismatch', 'terms_source_mismatch']) {
    for (const code of [400, 409, 503]) {
      assert.deepEqual(classifyBindResponse({ code, errorCode, proofConsumed: false }), {
        kind: 'retry', reason: 'policy', errorCode
      });
    }
    for (const proofConsumed of [true, undefined, null, 0, 'false']) {
      assert.deepEqual(classifyBindResponse({ code: 409, errorCode, proofConsumed }), {
        kind: 'restart', reason: 'spent_proof', errorCode
      });
    }
    assert.deepEqual(classifyBindPolicyError('translated server message', errorCode), {
      field: 'form', key: registrationErrorKey(errorCode)
    });
  }
  assert.equal(classifyBindResponse({ code: 409, errorCode: 'bind_proof_used', proofConsumed: false }).kind, 'restart');
  assert.deepEqual(classifyBindResponse({ code: 200, data: { alreadyBound: true } }), { kind: 'already_bound' });
  assert.equal(registrationErrorKey('unexpected_code'), null);
  assert.equal(registrationErrorKey('__proto__'), null);
});

test('every new notice/error string exists in all six symmetric dictionaries', () => {
  const keys = Object.keys(authDict.en).filter(key => key.startsWith('legal'));
  assert.equal(keys.length, 20);
  for (const locale of AUTH_LANGS) {
    for (const key of keys) assert.ok(authDict[locale][key]?.trim(), `${locale}: ${key}`);
    assert.deepEqual(Object.keys(authDict[locale]).sort(), Object.keys(authDict.en).sort());
    assert.ok(!/privacy|隐私|隱私|confidentialité|privacidad/i.test(authDict[locale].legalAcceptTerms));
  }
});

test('React integration guards both create paths without gating normal login or provider login', async () => {
  const register = await source('../src/app/components/epomail/RegisterForm.tsx');
  const auth = await source('../src/app/components/epomail/AuthForm.tsx');
  const registrationSubmit = register.slice(register.indexOf('const handleSubmit ='), register.indexOf('const getPositionStyle ='));
  assert.ok(registrationSubmit.indexOf('if (!acceptance)') < registrationSubmit.indexOf('fetch("/api/register"'));
  assert.match(registrationSubmit, /\.\.\.acceptance/);
  assert.match(registrationSubmit, /legal\.handleError\(data\.errorCode\)/);
  assert.match(register, /disabled=\{status !== "idle" \|\| isRegisterClosed \|\| !legal\.payload\}/);
  const bind = auth.slice(auth.indexOf('const handleBindSubmit ='), auth.indexOf('const getFactorName ='));
  assert.ok(bind.indexOf('if (!acceptance)') < bind.indexOf("fetch('/api/oauth/bindUser'"));
  assert.match(bind, /buildOAuthBindPayload\(bindContext, \{ email: cleanEmail, code: bindCode \}, acceptance\)/);
  assert.match(bind, /bindLegal\.handleError\(data\.errorCode\)/);
  assert.match(auth, /disabled=\{status !== "idle" \|\| isRegisterClosed \|\| !bindLegal\.payload\}/);
  const passwordView = auth.slice(auth.indexOf('{stage === "password" ?'), auth.indexOf(') : stage === "bind" ?'));
  assert.doesNotMatch(passwordView, /RegistrationNotice|bindLegal\.payload|legal\.payload/);
  const oauthLogin = auth.slice(auth.indexOf('const handleOAuthProviderClick ='), auth.indexOf('const renderOAuthButton ='));
  assert.doesNotMatch(oauthLogin, /bindLegal|registrationReadiness|acceptedTerms/);
});

test('notice uses an accessible unchecked native checkbox, safe links and separate privacy explanation', async () => {
  const notice = await source('../src/app/components/epomail/RegistrationNotice.tsx');
  assert.match(notice, /type="checkbox"/);
  assert.match(notice, /checked=\{legal\.accepted\}/);
  assert.doesNotMatch(notice, /defaultChecked|dangerouslySetInnerHTML/);
  assert.match(notice, /htmlFor=\{`\$\{id\}-accept`\}/);
  assert.match(notice, /legalPrivacyExplanation/);
  assert.match(notice, /rel="noopener noreferrer"/);
  assert.match(notice, /focus-visible:ring/);
  assert.match(notice, /flex-wrap/);
  for (const name of ['RegisterCard', 'LoginCard']) {
    const card = await source(`../src/app/components/epomail/${name}.tsx`);
    assert.doesNotMatch(card, /(?:^|\s)max-h-\[/);
  }
});
