import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENDPOINT_PATH, MAX_RESPONSE_BYTES, NETWORK_TIMEOUT_MS,
  checkPrivacyReadiness, evaluatePrivacyReadiness, formatReport,
  runCli, validateBaseOrigin, validateHttpUrl
} from '../scripts/check-privacy-readiness.mjs';

// Synthetic, in-memory fixtures only. These are not operator identities,
// accepted contracts or deployment configurations, and are never sent anywhere.
function fixture() {
  return {
    code: 200,
    message: 'success',
    data: {
      legalNotice: {
        operatorName: 'Synthetic Fixture — Not an Operator',
        operatorCountry: 'Synthetic test jurisdiction',
        contactEmail: 'fixture@example.test',
        contactAddress: '',
        termsVersion: 'synthetic-v1',
        termsUrl: 'https://example.test/terms',
        privacyUrl: 'https://example.test/privacy',
        recipientsUrl: '',
        retentionUrl: ''
      },
      registrationReadiness: { ready: true, missing: [] },
      contentProcessing: {
        verificationCodeEnabled: false,
        translationEnabled: false,
        ocrEnabled: false,
        publicTranslationFallbackEnabled: false,
        noticeUrl: ''
      }
    }
  };
}

const jsonResponse = (value = fixture(), options = {}) => new Response(JSON.stringify(value), {
  status: 200, headers: { 'content-type': 'application/json; charset=utf-8' }, ...options
});
const failures = result => result.checks.filter(check => check.status === 'fail').map(check => check.field);

// The global fetch is a tripwire: every test supplies a fake or uses pure helpers.
// An accidental network fallback fails locally before opening a socket.
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error('Network is forbidden in this suite'); };
test.after(() => { globalThis.fetch = originalFetch; });

test('base is explicit; valid loopback HTTP and explicit HTTPS normalize safely', () => {
  for (const [input, expected] of [
    ['http://127.0.0.1:8787', 'http://127.0.0.1:8787'],
    ['http://127.2.3.4/', 'http://127.2.3.4'],
    ['http://localhost:8787/', 'http://localhost:8787'],
    ['http://[::1]:8787', 'http://[::1]:8787'],
    ['https://example.test:443/', 'https://example.test'],
    ['HTTPS://EXAMPLE.TEST', 'https://example.test']
  ]) assert.equal(validateBaseOrigin(input), expected);
});

test('dangerous or ambiguous origins are rejected before any request', async () => {
  const values = [
    undefined, '', null, 0, {}, '//localhost:8787', 'localhost:8787',
    'javascript:alert(1)', 'file:///tmp/config.json', 'ftp://localhost',
    'http://example.test', 'http://192.168.1.5', 'http://0.0.0.0',
    'http://[::]', 'http://[::ffff:127.0.0.1]', 'http://localhost.example.test',
    'http://localhost.', 'http://127.0.0.1.example.test',
    'http://127.1', 'http://2130706433', 'http://0177.0.0.1', 'http://0x7f000001',
    'https://user:synthetic-password@example.test', 'https://@example.test',
    'https://example.test/path', 'https://example.test/?token=synthetic',
    'https://example.test?', 'https://example.test/#', 'https://example.test/.',
    ' https://example.test', 'https://example.test\n', 'https://example.test\\@evil.test',
    'https:///example.test', 'https://%65xample.test', 'https://example.test:',
    'https://example.test:99999', 'http://127.999.0.1'
  ];
  let calls = 0;
  for (const base of values) {
    assert.throws(() => validateBaseOrigin(base));
    const result = await checkPrivacyReadiness({ base, fetchImpl: async () => { calls++; return jsonResponse(); } });
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, 'error');
  }
  assert.equal(calls, 0);
});

test('all required and supplied optional disclosure URLs are validated', () => {
  const fields = ['termsUrl', 'privacyUrl', 'recipientsUrl', 'retentionUrl'];
  for (const field of fields) {
    for (const value of ['javascript:alert(1)', '/privacy', '//example.test/privacy', 'http://example.test/privacy',
      'https://user:password@example.test/privacy', 'https://example.test/unsafe%0a', 'https://example.test\\path',
      'https://example.test/space here', 1, null]) {
      const input = fixture();
      input.data.legalNotice[field] = value;
      assert.ok(failures(evaluatePrivacyReadiness(input)).includes(`legalNotice.${field}`), field);
    }
  }
  assert.equal(validateHttpUrl('https://example.test/policy?lang=zh#scope').hostname, 'example.test');
  assert.equal(validateHttpUrl('http://127.0.0.1:8787/privacy').hostname, '127.0.0.1');
});

test('successful envelope is required, not arbitrary truthy data or status strings', () => {
  for (const value of [null, [], {}, '', true, { code: '200', data: fixture().data },
    { code: 500, data: fixture().data }, { code: 200, data: [] }, fixture().data]) {
    const result = evaluatePrivacyReadiness(value);
    assert.equal(result.exitCode, 1);
    assert.ok(failures(result).includes('response'));
  }
});

test('all six required legal fields fail closed on missing, empty and placeholder values', () => {
  for (const field of ['operatorName', 'operatorCountry', 'contactEmail', 'termsVersion', 'termsUrl', 'privacyUrl']) {
    for (const value of [undefined, null, '', '   ', true, 1, [], {}, 'TODO', '待填写', '<operator-name>']) {
      const input = fixture();
      input.data.legalNotice[field] = value;
      const result = evaluatePrivacyReadiness(input);
      assert.equal(result.status, 'notReady', field);
      assert.equal(result.exitCode, 1, field);
      assert.ok(failures(result).includes(`legalNotice.${field}`), field);
    }
  }
});

test('an API ready flag never overrides missing identity even with registration closed', () => {
  const input = fixture();
  input.data.register = 1;
  input.data.legalNotice.operatorName = '';
  assert.equal(evaluatePrivacyReadiness(input).exitCode, 1);
  delete input.data.legalNotice;
  assert.equal(evaluatePrivacyReadiness(input).exitCode, 1);
});

test('ready is strict boolean true and missing must be an empty string array', () => {
  for (const value of [false, undefined, null, '', 'true', '1', 1, {}, []]) {
    const input = fixture();
    input.data.registrationReadiness.ready = value;
    assert.ok(failures(evaluatePrivacyReadiness(input)).includes('registrationReadiness.ready'));
  }
  for (const missing of [undefined, null, '', {}, [false], [''], ['operatorName']]) {
    const input = fixture();
    input.data.registrationReadiness.missing = missing;
    assert.ok(failures(evaluatePrivacyReadiness(input)).includes('registrationReadiness.missing'));
  }
  const input = fixture();
  delete input.data.registrationReadiness;
  assert.equal(evaluatePrivacyReadiness(input).exitCode, 1);
});

test('every optional-content flag must be explicitly boolean, never a truthy substitute', () => {
  for (const field of ['verificationCodeEnabled', 'translationEnabled', 'ocrEnabled', 'publicTranslationFallbackEnabled']) {
    for (const value of [undefined, null, '', 0, 1, 'false', 'true', [], {}]) {
      const input = fixture();
      input.data.contentProcessing[field] = value;
      assert.ok(failures(evaluatePrivacyReadiness(input)).includes(`contentProcessing.${field}`), field);
    }
  }
  const input = fixture();
  delete input.data.contentProcessing;
  assert.equal(evaluatePrivacyReadiness(input).exitCode, 1);
});

test('unconfigured or unsafe content notice blocks each enabled content gate', () => {
  for (const field of ['verificationCodeEnabled', 'translationEnabled', 'ocrEnabled', 'publicTranslationFallbackEnabled']) {
    for (const value of [undefined, null, '', ' ', 'javascript:alert(1)', 'http://example.test/privacy',
      'https://user:password@example.test/privacy']) {
      const input = fixture();
      input.data.contentProcessing[field] = true;
      input.data.contentProcessing.noticeUrl = value;
      assert.ok(failures(evaluatePrivacyReadiness(input)).includes('contentProcessing.noticeUrl'));
    }
  }
});

test('disabled content does not require notice but still rejects a supplied dangerous URL', () => {
  assert.equal(evaluatePrivacyReadiness(fixture()).exitCode, 0);
  const input = fixture();
  input.data.contentProcessing.noticeUrl = 'javascript:alert(1)';
  assert.equal(evaluatePrivacyReadiness(input).exitCode, 1);
});

test('OCR requires translation, while public fallback remains unavailable even with translation and valid notice', async () => {
  const input = fixture();
  input.data.contentProcessing.ocrEnabled = true;
  input.data.contentProcessing.noticeUrl = 'https://example.test/processing';
  assert.ok(failures(evaluatePrivacyReadiness(input)).includes('contentProcessing.translationDependency'));
  input.data.contentProcessing.translationEnabled = true;
  assert.equal(evaluatePrivacyReadiness(input).exitCode, 0);

  input.data.contentProcessing.publicTranslationFallbackEnabled = true;
  for (const translationEnabled of [false, true]) {
    input.data.contentProcessing.translationEnabled = translationEnabled;
    const result = evaluatePrivacyReadiness(input);
    assert.equal(result.status, 'notReady');
    assert.equal(result.configCheckPassed, false);
    assert.equal(result.exitCode, 1);
    assert.ok(failures(result).includes('contentProcessing.publicTranslationFallbackEnabled'));
  }
  input.data.contentProcessing.translationEnabled = true;
  assert.deepEqual(failures(evaluatePrivacyReadiness(input)), ['contentProcessing.publicTranslationFallbackEnabled']);
  for (const json of [false, true]) {
    let output = '';
    const exitCode = await runCli(['--base=http://localhost', ...(json ? ['--json'] : [])], {
      fetchImpl: async () => jsonResponse(input),
      write: text => { output += text; }
    });
    assert.equal(exitCode, 1);
    if (json) assert.equal(JSON.parse(output).status, 'notReady');
    else assert.match(output, /notReady/);
    assert.match(output, /公共翻译后备服务不可用/);
  }
});

test('complete configuration reports ready only as a configuration result, without mutating input', () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = evaluatePrivacyReadiness(input);
  assert.equal(result.status, 'ready');
  assert.equal(result.configCheckPassed, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.scope, 'configuration-only');
  assert.deepEqual(input, before);
  assert.match(formatReport(result), /非合规认证/);
  assert.match(formatReport(result, true), /DPA\/SCC/);
  assert.match(result.limitations.join(' '), /地区.*留存.*请求/);
  input.data.contentProcessing.verificationCodeEnabled = true;
  input.data.contentProcessing.translationEnabled = true;
  input.data.contentProcessing.ocrEnabled = true;
  input.data.contentProcessing.publicTranslationFallbackEnabled = false;
  input.data.contentProcessing.noticeUrl = 'https://example.test/processing';
  assert.equal(evaluatePrivacyReadiness(input).exitCode, 0);
});

test('optional contact address and disclosure links are not blanket launch requirements', () => {
  const input = fixture();
  delete input.data.legalNotice.contactAddress;
  delete input.data.legalNotice.recipientsUrl;
  delete input.data.legalNotice.retentionUrl;
  const result = evaluatePrivacyReadiness(input);
  assert.equal(result.exitCode, 0);
  assert.ok(result.checks.some(check => check.field === 'legalNotice.contactAddress' && check.status === 'info'));
});

test('one anonymous GET uses only the explicit origin and fixed endpoint', async () => {
  const calls = [];
  const result = await checkPrivacyReadiness({
    base: 'http://127.0.0.1:8787',
    fetchImpl: async (url, options) => { calls.push({ url, options }); return jsonResponse(); }
  });
  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `http://127.0.0.1:8787${ENDPOINT_PATH}`);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.deepEqual(calls[0].options.headers, { accept: 'application/json' });
  assert.equal(calls[0].options.body, undefined);
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('redirects, changed response targets, HTTP errors and non-JSON bodies fail without retry', async () => {
  const redirected = jsonResponse();
  Object.defineProperty(redirected, 'redirected', { value: true });
  const changedTarget = jsonResponse();
  Object.defineProperty(changedTarget, 'url', { value: 'https://example.test/other' });
  for (const response of [
    new Response(null, { status: 302, headers: { location: 'https://user:secret@evil.test/' } }),
    redirected, changedTarget,
    new Response('private upstream failure', { status: 503 }),
    new Response('<html>not json</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    new Response('{broken', { status: 200, headers: { 'content-type': 'application/json' } })
  ]) {
    let calls = 0;
    const result = await checkPrivacyReadiness({ base: 'http://localhost', fetchImpl: async () => { calls++; return response; } });
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, 'error');
    assert.equal(calls, 1);
    assert.doesNotMatch(formatReport(result, true), /private upstream|evil\.test|user:secret/);
  }
});

test('fetch failures exit 1 and redact the exception, URL and raw response fields', async () => {
  const marker = 'DO-NOT-PRINT-SYNTHETIC-SECRET';
  const result = await checkPrivacyReadiness({
    base: 'https://example.test', fetchImpl: async () => { throw new Error(`password=${marker}`); }
  });
  assert.equal(result.exitCode, 1);
  for (const json of [false, true]) assert.ok(!formatReport(result, json).includes(marker));
  const input = fixture();
  input.message = marker;
  input.data.legalNotice.operatorName = marker;
  input.data.legalNotice.contactAddress = marker;
  input.data.legalNotice.termsUrl = `https://user:${marker}@example.test`;
  input.data.registrationReadiness.missing = [marker];
  input.data.secret = marker;
  for (const json of [false, true]) assert.ok(!formatReport(evaluatePrivacyReadiness(input), json).includes(marker));
});

test('network and stalled response bodies have a bounded deadline, even if fetch ignores abort', async () => {
  assert.equal(NETWORK_TIMEOUT_MS, 10_000);
  let signal;
  const result = await checkPrivacyReadiness({
    base: 'http://localhost', timeoutMs: 10,
    fetchImpl: (_, options) => { signal = options.signal; return new Promise(() => {}); }
  });
  assert.equal(result.exitCode, 1);
  assert.ok(failures(result).includes('technical.timeout'));
  assert.equal(signal.aborted, true);
  let streamController;
  const body = new ReadableStream({ start(controller) { streamController = controller; } });
  try {
    const stalled = await checkPrivacyReadiness({
      base: 'http://localhost', timeoutMs: 10,
      fetchImpl: async () => new Response(body, { headers: { 'content-type': 'application/json' } })
    });
    assert.ok(failures(stalled).includes('technical.timeout'));
  } finally {
    streamController.close();
  }
  for (const timeoutMs of [0, -1, 10_001, Infinity, NaN, '10000']) {
    let called = false;
    const invalid = await checkPrivacyReadiness({ base: 'http://localhost', timeoutMs,
      fetchImpl: async () => { called = true; return jsonResponse(); } });
    assert.equal(invalid.exitCode, 1);
    assert.equal(called, false);
  }
});

test('response-size limits apply to both claimed and streamed bytes', async () => {
  for (const response of [
    jsonResponse(fixture(), { headers: { 'content-type': 'application/json', 'content-length': String(MAX_RESPONSE_BYTES + 1) } }),
    new Response(' '.repeat(MAX_RESPONSE_BYTES + 1), { headers: { 'content-type': 'application/json' } })
  ]) {
    const result = await checkPrivacyReadiness({ base: 'http://localhost', fetchImpl: async () => response });
    assert.ok(failures(result).includes('technical.size'));
  }
});

test('CLI never requests a default origin; help, invalid options and credential URLs do not fetch', async () => {
  for (const argv of [[], ['--json'], ['--base'], ['--base', '--json'], ['--unknown=synthetic-secret'],
    ['--base', 'http://localhost', '--base', 'http://localhost'],
    ['--base', 'https://user:synthetic-secret@example.test']]) {
    let calls = 0;
    let output = '';
    const code = await runCli(argv, {
      fetchImpl: async () => { calls++; return jsonResponse(); }, write: text => { output += text; }
    });
    assert.equal(code, 1);
    assert.equal(calls, 0);
    assert.doesNotMatch(output, /synthetic-secret/);
    if (argv.includes('--json')) assert.equal(JSON.parse(output).exitCode, 1);
  }
  let calls = 0;
  let output = '';
  assert.equal(await runCli(['--help'], {
    fetchImpl: async () => { calls++; return jsonResponse(); }, write: text => { output += text; }
  }), 0);
  assert.equal(calls, 0);
  assert.match(output, /不执行配置检查/);
});

test('CLI JSON and human output distinguish ready, notReady and fetch failure', async () => {
  for (const json of [false, true]) {
    for (const status of ['ready', 'notReady', 'error']) {
      const input = fixture();
      if (status === 'notReady') input.data.registrationReadiness.ready = false;
      let output = '';
      const argv = ['--base=http://localhost:8787', ...(json ? ['--json'] : [])];
      const code = await runCli(argv, {
        fetchImpl: async () => {
          if (status === 'error') throw new Error('synthetic fetch failure');
          return jsonResponse(input);
        },
        write: text => { output += text; }
      });
      assert.equal(code, status === 'ready' ? 0 : 1);
      if (json) assert.equal(JSON.parse(output).status, status);
      else assert.ok(output.includes(status));
    }
  }
});
