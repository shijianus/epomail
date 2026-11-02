import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  getContentProcessingNoticeUrl,
  getContentProcessingPolicy,
  getPredefinedTranslation,
  interpolatePlaceholders,
  prepareMailTranslation
} from '../mail-vue/src/utils/mail-translation-helper.js';
import { WELCOME_TEMPLATES } from '../mail-vue/src/const/welcome-templates.js';

// Isolated synthetic messages only. No server, browser, build, or network calls.
const noticeUrl = 'https://docs.example.test/processing?version=2#recipients';
const makeSettings = (overrides = {}) => ({
  aiEnabled: 1,
  contentProcessing: { translationEnabled: true, ocrEnabled: true, noticeUrl, ...overrides }
});
const makeEmail = () => ({ emailId: 17, text: 'Example message for a unit test.', content: '', subject: 'Unit test' });
const makeOfficialEmail = () => {
  const toEmail = 'translation-test@example.test';
  const toName = 'Translation Test';
  return {
    emailId: 18,
    sendEmail: 'admin@epocanvas.com',
    toEmail,
    toName,
    subject: interpolatePlaceholders(WELCOME_TEMPLATES.en.subject, toEmail, toName),
    content: interpolatePlaceholders(WELCOME_TEMPLATES.en.content, toEmail, toName)
  };
};
const prepare = (overrides = {}) => prepareMailTranslation({
  email: makeEmail(), targetLang: 'fr', settings: makeSettings(), ...overrides
});

test('notice validation preserves the exact configured HTTPS value', () => {
  assert.equal(getContentProcessingNoticeUrl(noticeUrl), noticeUrl);
  assert.equal(getContentProcessingNoticeUrl('https://EXAMPLE.test:443/legal'), 'https://EXAMPLE.test:443/legal');
  for (const value of [undefined, null, '', '/processing', '//example.test/processing', ' https://example.test/processing ', 'file:///processing']) {
    assert.equal(getContentProcessingNoticeUrl(value), '');
  }
});

test('HTTP notices are limited to loopback development, never production', () => {
  for (const value of ['http://localhost:5173/notice', 'http://docs.localhost:5173/notice', 'http://127.0.0.1:5173/notice', 'http://[::1]:5173/notice']) {
    assert.equal(getContentProcessingNoticeUrl(value), '');
    assert.equal(getContentProcessingNoticeUrl(value, { isDev: true }), value);
  }
  assert.equal(getContentProcessingNoticeUrl('http://docs.example.test/notice', { isDev: true }), '');
});

test('remote payload requires explicit boolean confirmation and the exact current notice', () => {
  for (const confirmed of [undefined, false, 1, 'true']) {
    const decision = prepare({ confirmed, noticeUrl });
    assert.equal(decision.kind, 'confirmation');
    assert.equal(Object.hasOwn(decision, 'payload'), false);
  }
  for (const staleUrl of [undefined, '', `${noticeUrl}-old`]) {
    assert.equal(prepare({ confirmed: true, noticeUrl: staleUrl }).kind, 'confirmation');
  }
  assert.deepEqual(prepare({ confirmed: true, noticeUrl }).payload, {
    text: makeEmail().text,
    html: '',
    targetLang: 'fr',
    confirmed: true,
    noticeUrl,
    enableOcr: false
  });
});

test('OCR remains false unless both the current checkbox and configuration are true', () => {
  for (const enableOcr of [undefined, false, 1, 'true']) {
    assert.equal(prepare({ confirmed: true, noticeUrl, enableOcr }).payload.enableOcr, false);
  }
  for (const ocrEnabled of [undefined, false, 1, 'true']) {
    const settings = makeSettings({ ocrEnabled });
    assert.equal(prepare({ settings, confirmed: true, noticeUrl, enableOcr: true }).payload.enableOcr, false);
  }
  assert.equal(prepare({ confirmed: true, noticeUrl, enableOcr: true }).payload.enableOcr, true);
});

test('missing settings, notice, translation enablement or global AI fail closed', () => {
  const settingsCases = [
    undefined, {}, makeSettings({ translationEnabled: false }), makeSettings({ translationEnabled: 'true' }),
    makeSettings({ noticeUrl: '' }), makeSettings({ noticeUrl: '/notice' }),
    ...[undefined, false, 0, '0', 'false'].map(aiEnabled => ({ ...makeSettings(), aiEnabled }))
  ];
  for (const settings of settingsCases) {
    assert.equal(getContentProcessingPolicy(settings).enabled, false);
    assert.deepEqual(prepare({ settings, confirmed: true, noticeUrl, enableOcr: true }), { kind: 'blocked' });
  }
});

test('official local templates do not create external payloads even when processing is disabled', () => {
  const email = makeOfficialEmail();
  for (const targetLang of ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl']) {
    const decision = prepare({ email, targetLang, settings: {}, confirmed: false, enableOcr: true });
    assert.equal(decision.kind, 'local');
    assert.equal(decision.translation.engine, 'template');
    assert.equal(Object.hasOwn(decision, 'payload'), false);
  }
  const modified = { ...email, content: `${email.content}<p>Additional unit-test text.</p>` };
  assert.equal(prepare({ email: modified }).kind, 'confirmation');
  assert.equal(prepare({ email: modified, settings: {} }).kind, 'blocked');
});

// Execute only the existing translation block with Vue reactivity and an in-memory
// API stub, not a second implementation of its state transitions.
const require = createRequire(new URL('../mail-vue/package.json', import.meta.url));
const { parse, babelParse } = require('vue/compiler-sfc');
const { reactive, computed, watch, effectScope, nextTick } = require('vue');
const view = readFileSync(new URL('../mail-vue/src/views/content/index.vue', import.meta.url), 'utf8');
const parsed = parse(view, { filename: 'content/index.vue' });
assert.deepEqual(parsed.errors, []);
const script = parsed.descriptor.scriptSetup.content;
babelParse(script, { sourceType: 'module' });
const translationBlock = script.slice(script.indexOf('// Translation Handling'), script.indexOf('const isReporting = ref(false)'))
  .replaceAll('import.meta.env.DEV', 'false');
assert.ok(translationBlock.includes('const confirmTranslation'));
const exposed = [
  'toggleTranslateBar', 'handleTranslate', 'confirmTranslation', 'cancelTranslation', 'closeTranslate',
  'changeTranslationLanguage', 'targetLangMap', 'translationConfirmationMap', 'translationOcrMap',
  'translationErrorMap', 'isTranslatedMap', 'translatedTextMap', 'translatingMap', 'showOriginalMap'
];
function translationHarness(email = makeEmail()) {
  const scope = effectScope();
  const requests = [];
  const successes = [];
  const unmount = [];
  const settingStore = reactive({ settings: makeSettings() });
  const bindings = {
    reactive, computed, watch,
    onUnmounted: callback => unmount.push(callback),
    email, settingStore,
    threadMessages: computed(() => [email]),
    // This legacy preference must never opt the user into OCR.
    uiStore: { defaultTranslateLang: 'fr', enableImageOcr: true },
    getContentProcessingPolicy, getPredefinedTranslation, prepareMailTranslation,
    ElMessage: { success: message => successes.push(message) },
    t: key => key,
    emailTranslate: (payload, config) => new Promise((resolve, reject) => requests.push({ payload, config, resolve, reject }))
  };
  const state = scope.run(() => new Function(...Object.keys(bindings), `${translationBlock}\nreturn { ${exposed.join(', ')} };`)(...Object.values(bindings)));
  return { email, state, requests, successes, settingStore, dispose: () => { unmount.forEach(fn => fn()); scope.stop(); } };
}

test('opening, language selection and first activation send nothing; confirmation is single-use', async () => {
  const h = translationHarness();
  try {
    h.state.toggleTranslateBar(h.email);
    assert.equal(h.requests.length, 0);
    h.state.targetLangMap[h.email.emailId] = 'es';
    h.state.changeTranslationLanguage(h.email.emailId);
    assert.equal(h.requests.length, 0);
    h.state.handleTranslate(h.email);
    assert.equal(h.requests.length, 0);
    assert.ok(h.state.translationConfirmationMap[h.email.emailId]);
    const request = h.state.confirmTranslation(h.email);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].payload.confirmed, true);
    assert.equal(h.requests[0].payload.enableOcr, false);
    assert.equal(h.requests[0].payload.noticeUrl, noticeUrl);
    assert.equal(h.state.translationConfirmationMap[h.email.emailId], undefined);
    h.requests[0].resolve({ translatedText: 'Texto de prueba.' });
    await request;
    assert.equal(h.state.isTranslatedMap[h.email.emailId], true);
    h.state.handleTranslate(h.email);
    assert.equal(h.requests.length, 1);
    assert.equal(h.state.isTranslatedMap[h.email.emailId], false);
    assert.ok(h.state.translationConfirmationMap[h.email.emailId]);
  } finally { h.dispose(); }
});

test('cancel and language changes abort requests and suppress late success', async () => {
  for (const cancel of ['cancelTranslation', 'changeTranslationLanguage', 'closeTranslate']) {
    const h = translationHarness();
    try {
      h.state.toggleTranslateBar(h.email);
      h.state.handleTranslate(h.email);
      h.state.translationOcrMap[h.email.emailId] = true;
      const pending = h.state.confirmTranslation(h.email);
      assert.equal(h.requests[0].payload.enableOcr, true);
      assert.equal(h.state.translationOcrMap[h.email.emailId], false);
      h.state[cancel](h.email.emailId);
      assert.equal(h.requests[0].config.signal.aborted, true);
      h.requests[0].resolve({ translatedText: 'Late result' });
      await pending;
      assert.equal(h.state.isTranslatedMap[h.email.emailId], false);
      assert.equal(h.state.translatingMap[h.email.emailId], false);
      assert.deepEqual(h.successes, []);
    } finally { h.dispose(); }
  }
});

test('a cancelled attempt cannot overwrite a confirmed same-tick retry', async () => {
  const h = translationHarness();
  try {
    h.state.toggleTranslateBar(h.email);
    h.state.handleTranslate(h.email);
    const older = h.state.confirmTranslation(h.email);
    h.state.targetLangMap[h.email.emailId] = 'es';
    h.state.changeTranslationLanguage(h.email.emailId);
    h.state.handleTranslate(h.email);
    const newer = h.state.confirmTranslation(h.email);
    assert.equal(h.requests.length, 2);
    h.requests[0].resolve({ translatedText: 'Stale result' });
    await older;
    assert.equal(h.state.isTranslatedMap[h.email.emailId], false);
    assert.equal(h.state.translatingMap[h.email.emailId], true);
    h.requests[1].resolve({ translatedText: 'Current result' });
    await newer;
    assert.equal(h.state.translatedTextMap[h.email.emailId], 'Current result');
    assert.equal(h.state.translatingMap[h.email.emailId], false);
    assert.equal(h.successes.length, 1);
  } finally { h.dispose(); }
});

test('changed message content requires a new confirmation', async () => {
  const h = translationHarness();
  try {
    h.state.toggleTranslateBar(h.email);
    h.state.handleTranslate(h.email);
    h.email.text = 'Changed unit-test message.';
    await h.state.confirmTranslation(h.email);
    assert.equal(h.requests.length, 0);
    assert.equal(h.state.translationErrorMap[h.email.emailId], 'contentProcessingUi.confirmationRequired');
    assert.equal(h.state.translationConfirmationMap[h.email.emailId], undefined);
  } finally { h.dispose(); }
});

test('changed policy invalidates pending confirmation and cancels in-flight processing', async () => {
  const h = translationHarness();
  try {
    h.state.toggleTranslateBar(h.email);
    h.state.handleTranslate(h.email);
    h.state.translationOcrMap[h.email.emailId] = true;
    h.settingStore.settings.contentProcessing.noticeUrl = 'https://docs.example.test/updated';
    await nextTick();
    await h.state.confirmTranslation(h.email);
    assert.equal(h.requests.length, 0);
    assert.equal(h.state.translationOcrMap[h.email.emailId], false);
    h.state.handleTranslate(h.email);
    const pending = h.state.confirmTranslation(h.email);
    assert.equal(h.requests[0].payload.noticeUrl, 'https://docs.example.test/updated');
    h.settingStore.settings.aiEnabled = 0;
    assert.equal(h.requests[0].config.signal.aborted, true);
    h.requests[0].resolve({ translatedText: 'Late result' });
    await pending;
    assert.equal(h.state.isTranslatedMap[h.email.emailId], false);
  } finally { h.dispose(); }
});

test('API failures and original-content responses never leave a success state', async () => {
  for (const [code, key] of [
    ['privacy_processing_disabled', 'contentProcessingUi.unavailable'],
    ['privacy_confirmation_required', 'contentProcessingUi.confirmationRequired'],
    ['privacy_notice_changed', 'contentProcessingUi.noticeChanged']
  ]) {
    const h = translationHarness();
    try {
      h.state.toggleTranslateBar(h.email);
      h.state.handleTranslate(h.email);
      const pending = h.state.confirmTranslation(h.email);
      h.requests[0].reject({ code: code === 'privacy_processing_disabled' ? 403 : 409, message: 'Localized service message', errorCode: code });
      await pending;
      assert.equal(h.state.translationErrorMap[h.email.emailId], key);
      assert.equal(h.state.isTranslatedMap[h.email.emailId], false);
      assert.equal(h.state.translatingMap[h.email.emailId], false);
      assert.equal(h.state.translationConfirmationMap[h.email.emailId], undefined);
      assert.deepEqual(h.successes, []);
    } finally { h.dispose(); }
  }
  const h = translationHarness();
  try {
    h.state.toggleTranslateBar(h.email);
    h.state.handleTranslate(h.email);
    const pending = h.state.confirmTranslation(h.email);
    h.requests[0].resolve({ translatedText: h.email.text, model: 'original' });
    await pending;
    assert.equal(h.state.isTranslatedMap[h.email.emailId], false);
    assert.deepEqual(h.successes, []);
  } finally { h.dispose(); }
});

test('local template activation never invokes the API', () => {
  const h = translationHarness(makeOfficialEmail());
  try {
    h.settingStore.settings = {};
    h.state.toggleTranslateBar(h.email);
    h.state.handleTranslate(h.email);
    assert.equal(h.state.isTranslatedMap[h.email.emailId], true);
    assert.equal(h.state.translationConfirmationMap[h.email.emailId], undefined);
    assert.deepEqual(h.requests, []);
  } finally { h.dispose(); }
});

test('content-processing copy is present and symmetric in all six locales', async () => {
  let expected;
  for (const locale of ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl']) {
    const strings = (await import(`../mail-vue/src/i18n/${locale}.js`)).default.contentProcessingUi;
    const keys = Object.keys(strings).sort();
    expected ??= keys;
    assert.deepEqual(keys, expected);
    assert.equal(keys.length, 14);
    assert.ok(Object.values(strings).every(value => typeof value === 'string' && value.trim()));
  }
});
