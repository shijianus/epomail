import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOAuthBindPayload,
  classifyBindPolicyError,
  classifyBindResponse,
  hasOAuthBindReturn,
  normalizeDomains,
  parseOAuthBindReturn,
  validateBindEmail
} from '../src/app/oauth-bind.ts';
import { AUTH_LANGS, authDict } from '../src/app/i18n/authLocale.ts';

const validReturn = {
  search: '?oauth_user_id=apple%3Auser-1&oauth_provider=apple&oauth_client_state=state-1',
  hash: '#oauth_bind=proof-token',
  expectedClientState: 'state-1'
};

test('accepts a bind return only when identity and client state agree', () => {
  assert.equal(hasOAuthBindReturn(validReturn.hash), true);
  assert.equal(hasOAuthBindReturn('#oauth_code=short-lived'), false);
  assert.deepEqual(parseOAuthBindReturn(validReturn), {
    ok: true,
    context: {
      bindToken: 'proof-token',
      oauthUserId: 'apple:user-1',
      provider: 'apple'
    }
  });
});

test('rejects missing or oversized bind proofs', () => {
  assert.deepEqual(parseOAuthBindReturn({ ...validReturn, hash: '' }), {
    ok: false,
    reason: 'missing_proof'
  });
  assert.deepEqual(parseOAuthBindReturn({ ...validReturn, hash: '#oauth_bind=' }), {
    ok: false,
    reason: 'missing_proof'
  });
  assert.deepEqual(
    parseOAuthBindReturn({ ...validReturn, hash: `#oauth_bind=${'a'.repeat(257)}` }),
    { ok: false, reason: 'missing_proof' }
  );
});

test('rejects missing or malformed provider identities', () => {
  assert.deepEqual(
    parseOAuthBindReturn({ ...validReturn, search: '?oauth_provider=apple&oauth_client_state=state-1' }),
    { ok: false, reason: 'missing_identity' }
  );
  assert.deepEqual(
    parseOAuthBindReturn({
      ...validReturn,
      search: '?oauth_user_id=apple%3Auser-1&oauth_client_state=state-1'
    }),
    { ok: false, reason: 'missing_identity' }
  );
  assert.deepEqual(
    parseOAuthBindReturn({
      ...validReturn,
      search: '?oauth_user_id=apple%3Auser-1&oauth_provider=../evil&oauth_client_state=state-1'
    }),
    { ok: false, reason: 'missing_identity' }
  );
});

test('fails closed when this browser did not start the OAuth flow', () => {
  assert.deepEqual(parseOAuthBindReturn({ ...validReturn, expectedClientState: null }), {
    ok: false,
    reason: 'state_mismatch'
  });
  assert.deepEqual(parseOAuthBindReturn({ ...validReturn, expectedClientState: 'other-state' }), {
    ok: false,
    reason: 'state_mismatch'
  });
  const withoutReturnedState = validReturn.search.replace('&oauth_client_state=state-1', '');
  assert.deepEqual(parseOAuthBindReturn({ ...validReturn, search: withoutReturnedState }), {
    ok: false,
    reason: 'state_mismatch'
  });
});

test('builds a bind payload without leaking the proof into other fields', () => {
  const context = {
    bindToken: 'proof-token',
    oauthUserId: 'apple:user-1',
    provider: 'apple'
  };
  assert.deepEqual(buildOAuthBindPayload(context, { email: '  bind@example.com  ', code: '  INVITE ' }), {
    email: 'bind@example.com',
    code: 'INVITE',
    oauthUserId: 'apple:user-1',
    provider: 'apple',
    bindToken: 'proof-token'
  });
  assert.deepEqual(buildOAuthBindPayload(context, { email: 'bind@example.com', code: '   ' }), {
    email: 'bind@example.com',
    oauthUserId: 'apple:user-1',
    provider: 'apple',
    bindToken: 'proof-token'
  });
});

test('classifies server responses so only a spent proof forces a restart', () => {
  // A policy rejection keeps the proof alive: the form must retain its
  // context and let the user correct the invite code.
  assert.deepEqual(classifyBindResponse({ code: 400, message: 'notExistRegKey' }), {
    kind: 'retry',
    reason: 'policy'
  });
  // An in-flight bind is also retryable with the same proof.
  assert.deepEqual(classifyBindResponse({ code: 425, message: 'in progress' }), {
    kind: 'retry',
    reason: 'in_progress'
  });
  assert.deepEqual(classifyBindResponse({ code: 429, message: 'slow down' }), {
    kind: 'retry',
    reason: 'rate_limited'
  });
  // A spent or invalid proof can never be resubmitted.
  assert.deepEqual(classifyBindResponse({ code: 409, message: 'used' }), {
    kind: 'restart',
    reason: 'spent_proof'
  });
  assert.deepEqual(classifyBindResponse({ code: 410, message: 'expired' }), {
    kind: 'restart',
    reason: 'invalid_proof'
  });
  // Unknown/5xx and transport failures are safe to retry: the server resolves
  // the final state on the next submit.
  assert.deepEqual(classifyBindResponse({ code: 500, message: 'oops' }), {
    kind: 'retry',
    reason: 'server'
  });
  assert.deepEqual(classifyBindResponse(null), { kind: 'retry', reason: 'network' });
});

test('classifies a committed bind without a session as already bound', () => {
  assert.deepEqual(classifyBindResponse({ code: 200, data: { token: null, alreadyBound: true } }), {
    kind: 'already_bound'
  });
  assert.deepEqual(classifyBindResponse({ code: 200, data: { token: 'session-jwt' } }), {
    kind: 'success',
    payload: { token: 'session-jwt' }
  });
});

test('all six locales expose the OAuth bind copy', () => {
  const keys = [
    'oauthBindTitle',
    'oauthBindSubtitle',
    'oauthBindSubmit',
    'oauthBindRestart',
    'oauthBindSuccess',
    'oauthBindExpired',
    'oauthBindStateMismatch',
    'oauthBindFailed',
    'oauthBindAlreadyBound',
    'oauthBindInProgress',
    'oauthBindCompletedSignIn',
    'oauthBindRetry',
    'oauthBindPasswordNote'
  ];
  for (const lang of AUTH_LANGS) {
    for (const key of keys) {
      assert.equal(
        typeof authDict[lang][key],
        'string',
        `locale ${lang} is missing ${key}`
      );
      assert.ok(authDict[lang][key].trim().length > 0, `locale ${lang} has an empty ${key}`);
    }
  }
});

test('all six locales keep an identical key set', () => {
  const reference = Object.keys(authDict.zh).sort();
  for (const lang of AUTH_LANGS) {
    assert.deepEqual(Object.keys(authDict[lang]).sort(), reference, `locale ${lang} key set drifted`);
  }
});

test('normalises the published domain list without trusting its shape', () => {
  assert.deepEqual(normalizeDomains(['@Example.com', 'example.com', '  @mail.example.com  ', '', null, 42]), [
    'example.com',
    'mail.example.com'
  ]);
  assert.deepEqual(normalizeDomains(undefined), []);
  assert.deepEqual(normalizeDomains('example.com'), []);
});

test('composes a domain-list email from the local part and selected domain', () => {
  assert.deepEqual(
    validateBindEmail({ raw: '  alice ', domains: ['example.com', 'mail.example.com'], selectedDomain: 'mail.example.com' }),
    { ok: true, email: 'alice@mail.example.com' }
  );
  // A pasted full address is accepted only for a published domain.
  assert.deepEqual(
    validateBindEmail({ raw: 'alice@example.com', domains: ['@example.com'] }),
    { ok: true, email: 'alice@example.com' }
  );
  assert.deepEqual(
    validateBindEmail({ raw: 'alice@evil.example', domains: ['example.com'] }),
    { ok: false, reason: 'domain_not_allowed' }
  );
});

test('rejects empty, malformed and out-of-policy local parts', () => {
  assert.deepEqual(validateBindEmail({ raw: '   ', domains: ['example.com'] }), {
    ok: false,
    reason: 'empty'
  });
  assert.deepEqual(
    validateBindEmail({ raw: 'bad name', domains: ['example.com'] }),
    { ok: false, reason: 'invalid_local' }
  );
  assert.deepEqual(
    validateBindEmail({ raw: 'a'.repeat(65), domains: ['example.com'] }),
    { ok: false, reason: 'prefix_too_long' }
  );
  assert.deepEqual(
    validateBindEmail({ raw: 'ab', domains: ['example.com'], minPrefix: 3 }),
    { ok: false, reason: 'prefix_too_short' }
  );
});

test('requires a syntactically valid full address when no domain list is published', () => {
  assert.deepEqual(validateBindEmail({ raw: 'user@domain.com', domains: [] }), {
    ok: true,
    email: 'user@domain.com'
  });
  assert.deepEqual(validateBindEmail({ raw: 'user', domains: [] }), {
    ok: false,
    reason: 'invalid_email'
  });
  assert.deepEqual(validateBindEmail({ raw: 'user@localhost', domains: [] }), {
    ok: false,
    reason: 'invalid_email'
  });
});

test('maps policy protocol keys to the field that caused them', () => {
  assert.deepEqual(classifyBindPolicyError('notExistRegKey'), {
    field: 'code',
    key: 'notExistRegKey'
  });
  assert.deepEqual(classifyBindPolicyError('regKeyExpire'), {
    field: 'code',
    key: 'regKeyExpire'
  });
  assert.deepEqual(classifyBindPolicyError('isRegAccount'), {
    field: 'email',
    key: 'isRegAccount'
  });
  assert.deepEqual(classifyBindPolicyError('notEmailDomain'), {
    field: 'email',
    key: 'notEmailDomain'
  });
  assert.deepEqual(classifyBindPolicyError('regDisabled'), {
    field: 'form',
    key: 'regDisabled'
  });
  assert.deepEqual(classifyBindPolicyError('This identity is already bound'), {
    field: 'form',
    key: 'oauthBindAlreadyBound'
  });
  assert.deepEqual(classifyBindPolicyError('OAuth bind proof was already used'), {
    field: 'form',
    key: 'oauthBindExpired'
  });
  assert.equal(classifyBindPolicyError('some unexpected server text'), null);
  assert.equal(classifyBindPolicyError(''), null);
  assert.equal(classifyBindPolicyError(null), null);
});

test('every policy error key returned by the classifier exists in all six locales', () => {
  // The classifier hands back dictionary keys indirectly (the component looks
  // them up dynamically), so the static i18n audit cannot see them. Check the
  // contract here to keep a missing translation from surfacing a raw key.
  const samples = [
    'regDisabled',
    'emptyRegKey',
    'notExistRegKey',
    'noRegKeyTotal',
    'noRegKeyCount',
    'regKeyExpire',
    'isRegAccount',
    'isDelAccount',
    'isDelUser',
    'notEmailDomain',
    'notEmail',
    'banEmailPrefix',
    'minEmailPrefix',
    'emailLengthLimit',
    'adminReserved',
    'pwdMinLength',
    'pwdLengthLimit',
    'already bound',
    'OAuth bind proof expired'
  ];
  for (const sample of samples) {
    const classified = classifyBindPolicyError(sample);
    assert.ok(classified, `no classification for ${sample}`);
    for (const lang of AUTH_LANGS) {
      assert.ok(
        typeof authDict[lang][classified.key] === 'string' && authDict[lang][classified.key].trim(),
        `locale ${lang} is missing ${classified.key} (from ${sample})`
      );
    }
  }
});
