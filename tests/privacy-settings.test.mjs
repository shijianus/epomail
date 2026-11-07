import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  clearCurrentSession, clearDeviceData, deleteDraftsAndAttachments,
  deleteLocalDatabase, isAppStorageKey, isAppCacheName,
  rememberDraftDatabase, registerDatabaseCloser, DRAFT_DATABASE_REGISTRY,
  isLocalSessionEnded
} from '../mail-vue/src/utils/device-privacy.js';
import { prepareMailContent, safeMailStyle } from '../mail-vue/src/utils/mail-content-privacy.js';
import { privacyPreferences, verificationCodeNotice, withVerificationCodePreference } from '../mail-vue/src/utils/privacy-preferences.js';
import { createSessionManager, TAB_IDENTITY_KEY } from '../mail-vue/src/utils/tab-session.js';

// In-memory fakes and installed DOM/parser dependencies only: no browser, server,
// real IndexedDB, profile, credentials, file writes or network requests.
const workerRequire = createRequire(new URL('../mail-worker/package.json', import.meta.url));
const vueRequire = createRequire(new URL('../mail-vue/package.json', import.meta.url));
const { parseHTML } = workerRequire('linkedom');
const { parse, compileScript, compileTemplate } = vueRequire('vue/compiler-sfc');
const origin = 'https://mail.example.test';
const render = (html, options = {}) => prepareMailContent(html, {
  document: parseHTML('<html><body></body></html>').document,
  baseUrl: `${origin}/mail/u/0/`, ...options
});
const parsedBody = html => parseHTML(`<html><body>${html}</body></html>`).document.body;

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    entries: () => Object.fromEntries(data)
  };
}

function fakeIndexedDB(definitions, { blocked = [], fail = [], enumerationFails = false } = {}) {
  const databases = new Map(Object.entries(definitions));
  const removed = [];
  const inspected = [];
  const closed = [];
  return {
    removed, inspected, closed, databasesMap: databases,
    async databases() {
      if (enumerationFails) throw new Error('unavailable');
      return [...databases.keys()].map(name => ({ name, version: 10 }));
    },
    open(name) {
      inspected.push(name);
      const request = {};
      queueMicrotask(() => {
        const definition = databases.get(name);
        if (!definition) {
          request.transaction = { abort() {} };
          request.onupgradeneeded?.();
          return;
        }
        request.result = {
          objectStoreNames: Object.keys(definition),
          transaction() { return { objectStore: key => definition[key] }; },
          close() { closed.push(name); }
        };
        request.onsuccess?.();
      });
      return request;
    },
    deleteDatabase(name) {
      const request = {};
      queueMicrotask(() => {
        if (blocked.includes(name)) { request.onblocked?.(); return; }
        if (fail.includes(name)) { request.onerror?.(); return; }
        removed.push(name);
        databases.delete(name);
        request.onsuccess?.();
      });
      return request;
    }
  };
}
const draftSchema = () => ({
  draft: { keyPath: 'draftId', autoIncrement: true }, att: { keyPath: 'draftId', autoIncrement: false }
});

test('default blocks img, srcset, CSS URLs, background attributes and active resource tags', () => {
  const result = render(`<body background="https://tracker.test/bg" style="color:red;background-image:url(https://tracker.test/css)">
    <style>@import 'https://tracker.test/style';</style><link rel="stylesheet" href="https://tracker.test/style">
    <meta http-equiv="refresh" content="0;url=https://tracker.test"><base href="https://tracker.test">
    <img src="https://tracker.test/pixel" srcset="https://tracker.test/retina 2x" onerror="alert(1)">
    <img srcset="//tracker.test/only 1x, //tracker.test/large 2x">
    <table background="https://tracker.test/table"><tr><td style="color:blue; background:u\\72l(https://tracker.test);width:10px">Mail</td></tr></table>
    <svg><image href="https://tracker.test/svg" /></svg><video poster="https://tracker.test/poster"><source src="https://tracker.test/movie"></video>
    <iframe srcdoc="<img src='https://tracker.test/frame'>"></iframe><input type="image" src="https://tracker.test/input">
    <a href="https://example.test" ping="https://tracker.test/ping">Read</a></body>`);
  const body = parsedBody(result.html);
  assert.equal(result.remoteImageCount, 2);
  assert.equal(body.querySelectorAll('[src], [srcset], [background], [poster], [ping], [onerror]').length, 0);
  assert.equal(body.querySelectorAll('style, link, meta, base, svg, iframe, source, video, input').length, 0);
  assert.equal(body.querySelector('td').getAttribute('style'), 'color: blue; width: 10px');
  assert.equal(body.querySelector('a').getAttribute('rel'), 'noopener noreferrer');
  assert.equal(result.bodyStyle, 'color: red');
});

test('per-message approval restores images only, sets no-referrer and never restores CSS/srcset', () => {
  const input = '<p style="background-image:url(https://tracker.test/bg);color:red"><img src="https://images.test/a" srcset="https://images.test/b 2x"><img srcset="https://images.test/c 1x, https://images.test/d 2x"></p>';
  const allowed = parsedBody(render(input, { allowRemoteImages: true }).html);
  assert.deepEqual([...allowed.querySelectorAll('img')].map(img => img.getAttribute('src')), ['https://images.test/a', 'https://images.test/c']);
  assert.equal(allowed.querySelectorAll('img[referrerpolicy="no-referrer"]').length, 2);
  assert.equal(allowed.querySelectorAll('[srcset]').length, 0);
  assert.doesNotMatch(allowed.innerHTML, /background-image|tracker\.test/);
  assert.equal(parsedBody(render(input).html).querySelectorAll('[src]').length, 0, 'a different render is blocked by default');
});

test('inline raster and exact trusted attachment URLs remain; origin alone is not trusted', () => {
  const trusted = `${origin}/api/object/a?signature=fixture`;
  const input = `<img src="${trusted}"><img src="${origin}/api/unknown-tracker"><img src="data:image/png;base64,YQ=="><img src="data:image/svg+xml;base64,PHN2Zz4="><img src="javascript:alert(1)">`;
  const result = render(input, { trustedImageUrls: [trusted] });
  const images = [...parsedBody(result.html).querySelectorAll('img')];
  assert.equal(images[0].getAttribute('src'), trusted);
  assert.equal(images[1].hasAttribute('src'), false);
  assert.equal(images[2].getAttribute('src'), 'data:image/png;base64,YQ==');
  assert.equal(images[3].hasAttribute('src'), false);
  assert.equal(images[4].hasAttribute('src'), false);
});

test('safe formatting survives but custom properties, CSS escapes and resource functions do not', () => {
  assert.equal(safeMailStyle('font-weight:700; padding:8px 12px; color:rgb(1, 2, 3)'), 'font-weight: 700; padding: 8px 12px; color: rgb(1, 2, 3)');
  assert.equal(safeMailStyle('--x:url(https://tracker.test);background-color:var(--x);font-family:u\\72l(x);color:expression(x);width:attr(src url)'), '');
  assert.equal(render('literal &lt;img src=x&gt; &amp; text').html, 'literal &lt;img src=x&gt; &amp; text');
});

test('ordinary logout removes current credentials, email/recipient caches, not drafts or other sessions', () => {
  const current = { u: 1, sessionId: 'fixture-current-id', token: 'fixture-current', email: 'first@example.test' };
  const other = { u: 0, sessionId: 'fixture-other-id', token: 'fixture-other', email: 'second@example.test' };
  const local = storage({
    token: 'fixture-current', loginEmail: 'first@example.test', email: 'mail-cache', writer: 'recipients', ui: 'settings',
    epo_trusted_device_token: 'fixture-trust', DEV_TRUST: 'fixture-legacy',
    epo_sessions: JSON.stringify([current, other]),
    [DRAFT_DATABASE_REGISTRY]: '["first@example.test","second@example.test"]',
    siblingApp: 'keep'
  });
  const session = storage({ epo_2fa_challenge_session: 'challenge', epomail_restricted_token: 'restricted', siblingApp: 'keep' });
  // Exercise the production manager against the same in-memory storage, not an
  // invalidate() stub or the unrelated module singleton's captured storage.
  const sessionManager = createSessionManager({ localStorage: local, sessionStorage: session, pathname: () => '/mail/u/1/' });
  assert.equal(sessionManager.bootstrap().token, 'fixture-current');
  let closeCount = 0;
  const unregister = registerDatabaseCloser(() => closeCount++);
  try {
    assert.equal(clearCurrentSession({ localStorage: local, sessionStorage: session, sessionManager }), true);
  } finally { unregister(); }
  for (const key of ['token', 'loginEmail', 'email', 'writer', 'ui', 'epo_trusted_device_token', 'DEV_TRUST']) assert.equal(local.getItem(key), null, key);
  assert.deepEqual(JSON.parse(local.getItem('epo_sessions')), [other]);
  assert.equal(local.getItem(DRAFT_DATABASE_REGISTRY), '["first@example.test","second@example.test"]');
  assert.equal(local.getItem('siblingApp'), 'keep');
  assert.deepEqual(session.entries(), { siblingApp: 'keep', [TAB_IDENTITY_KEY]: JSON.stringify({ status: 'signed-out', u: 1 }) });
  assert.equal(local.getItem('epo_session_revoked:fixture-current-id'), '1');
  assert.equal(sessionManager.current(), null);
  assert.equal(sessionManager.bootstrap(), null, 'a signed-out tab cannot bootstrap the other account');
  assert.equal(closeCount, 1);
  assert.equal(isLocalSessionEnded(), true);
});

test('expired session can preserve address, malformed stored sessions do not prevent cleanup', () => {
  const current = { u: 0, sessionId: 'fixture-expired-id', token: 'fixture', email: 'first@example.test', status: 'active' };
  const local = storage({ token: 'fixture', loginEmail: 'first@example.test', epo_sessions: '{bad', email: 'cache' });
  const session = storage({ [TAB_IDENTITY_KEY]: JSON.stringify(current) });
  const sessionManager = createSessionManager({ localStorage: local, sessionStorage: session, pathname: () => '/mail/u/0/' });
  assert.equal(clearCurrentSession({ localStorage: local, sessionStorage: session, sessionManager, preserveEmail: true }), true);
  assert.equal(local.getItem('token'), null);
  assert.equal(local.getItem('email'), null);
  assert.equal(local.getItem('loginEmail'), null, 'do not repopulate the retired shared identity');
  assert.equal(session.getItem('epomail_login_email'), 'first@example.test', 'prefill is tab-local');
  assert.deepEqual(JSON.parse(local.getItem('epo_sessions')), [], 'empty registry blocks legacy token resurrection');
  assert.equal(JSON.parse(session.getItem(TAB_IDENTITY_KEY)).status, 'signed-out');
});

test('unpinned legacy logout still removes the token synchronously and preserves other account slots', () => {
  const other = { u: 0, sessionId: 'fixture-other-id', token: 'fixture-other', email: 'second@example.test' };
  const local = storage({ token: 'fixture', loginEmail: 'first@example.test', epo_sessions: JSON.stringify([other]) });
  const session = storage();
  const sessionManager = createSessionManager({ localStorage: local, sessionStorage: session, pathname: () => '/mail/u/1/' });
  assert.equal(clearCurrentSession({ localStorage: local, sessionStorage: session, sessionManager, preserveEmail: true }), true);
  assert.equal(local.getItem('token'), null);
  assert.equal(local.getItem('loginEmail'), null);
  assert.equal(session.getItem('epomail_login_email'), 'first@example.test');
  assert.deepEqual(JSON.parse(local.getItem('epo_sessions')), [other]);
  assert.equal(sessionManager.bootstrap(), null);
});

test('logout does not remove a different account legacy token or its registry slot', () => {
  const current = { u: 1, sessionId: 'fixture-current-id', token: 'fixture-current', email: 'first@example.test' };
  const other = { u: 0, sessionId: 'fixture-other-id', token: 'fixture-other', email: 'second@example.test' };
  const local = storage({ token: other.token, loginEmail: other.email, epo_sessions: JSON.stringify([current, other]) });
  const session = storage();
  const sessionManager = createSessionManager({ localStorage: local, sessionStorage: session, pathname: () => '/mail/u/1/' });
  sessionManager.bootstrap();
  assert.equal(clearCurrentSession({ localStorage: local, sessionStorage: session, sessionManager }), true);
  assert.equal(local.getItem('token'), other.token);
  assert.equal(local.getItem('loginEmail'), other.email);
  assert.deepEqual(JSON.parse(local.getItem('epo_sessions')), [other]);
});

test('late logout from an old identity, including a null snapshot, cannot clear a new login', () => {
  const previous = { u: 0, sessionId: 'fixture-previous-id', token: 'fixture-previous', email: 'same@example.test' };
  const local = storage({ epo_sessions: JSON.stringify([previous]) });
  const session = storage();
  const sessionManager = createSessionManager({
    localStorage: local, sessionStorage: session, pathname: () => '/mail/u/0/', randomId: () => 'fixture-new-id'
  });
  const stale = sessionManager.bootstrap();
  const current = sessionManager.signIn({ token: 'fixture-new', email: previous.email });
  local.setItem('token', current.token);
  local.setItem('loginEmail', current.email);
  local.setItem('email', 'new-mail-cache');
  local.setItem('writer', 'new-recipients');
  local.setItem('epo_trusted_device_token', 'new-trust');
  session.setItem('epo_oauth_state', 'new-oauth-state');
  let closeCount = 0;
  const unregister = registerDatabaseCloser(() => closeCount++);
  try {
    for (const snapshot of [stale, null]) {
      assert.equal(clearCurrentSession({ localStorage: local, sessionStorage: session, sessionManager, session: snapshot }), false);
      assert.equal(sessionManager.current().token, current.token);
      assert.equal(local.getItem('token'), current.token);
      assert.equal(local.getItem('email'), 'new-mail-cache');
      assert.equal(local.getItem('writer'), 'new-recipients');
      assert.equal(local.getItem('epo_trusted_device_token'), 'new-trust');
      assert.equal(session.getItem('epo_oauth_state'), 'new-oauth-state');
    }
  } finally { unregister(); }
  assert.equal(closeCount, 0, 'a stale request must not close the new account draft database');
});

test('a storage removal failure retains a failed result rather than bypassing the token assertion', () => {
  const local = storage({ token: 'fixture', email: 'cache' });
  const originalRemove = local.removeItem;
  local.removeItem = key => {
    if (key === 'token') throw new Error('fixture storage denied');
    originalRemove(key);
  };
  const session = storage();
  const sessionManager = createSessionManager({ localStorage: local, sessionStorage: session });
  assert.equal(clearCurrentSession({ localStorage: local, sessionStorage: session, sessionManager }), false);
  assert.equal(local.getItem('token'), 'fixture', 'failure cannot be reported as successful cleanup');
  assert.equal(local.getItem('email'), null, 'continue independent cache cleanup after a failed removal');
});

test('explicit device cleanup discovers all legacy draft DBs by schema without reading records', async () => {
  const local = storage({
    token: 'fixture', loginEmail: 'first@example.test',
    epo_sessions: JSON.stringify([{ email: 'first@example.test' }]),
    writer: 'recipients', email: 'mail', setting: 'prefs', DEV_TRUST: 'legacy',
    'dev_trust:fixture': 'legacy', epo_device_tag: 'device', siblingApp: 'keep'
  });
  rememberDraftDatabase('first@example.test', local);
  const session = storage({ epo_oauth_state: 'state', siblingApp: 'keep' });
  const idb = fakeIndexedDB({
    'first@example.test': draftSchema(), 'older@example.test': draftSchema(),
    'sibling@example.test': { documents: { keyPath: 'id' } },
    'unrelated': { draft: { keyPath: 'draftId', autoIncrement: true }, att: { keyPath: 'draftId' } }
  });
  const deletedCaches = [];
  const result = await clearDeviceData({
    localStorage: local, sessionStorage: session, indexedDB: idb, origin,
    caches: { async keys() { return ['epomail-mail', `workbox-precache-v2-${origin}/`, 'sibling-cache', 'workbox-precache-v2-https://other.example.test/']; }, async delete(name) { deletedCaches.push(name); return true; } }
  });
  assert.equal(result.complete, true);
  assert.deepEqual(idb.removed.sort(), ['first@example.test', 'older@example.test']);
  assert.ok(idb.closed.includes('sibling@example.test'));
  assert.ok(!idb.inspected.includes('unrelated'));
  assert.deepEqual(deletedCaches.sort(), ['epomail-mail', `workbox-precache-v2-${origin}/`].sort());
  assert.deepEqual(local.entries(), { siblingApp: 'keep' });
  assert.deepEqual(session.entries(), { siblingApp: 'keep' });
});

test('blocked deletion returns honest partial result and retains only retry inventory', async () => {
  const local = storage({ token: 'fixture', email: 'cache', loginEmail: 'first@example.test' });
  const idb = fakeIndexedDB({ 'first@example.test': draftSchema() }, { blocked: ['first@example.test'] });
  const result = await clearDeviceData({ localStorage: local, sessionStorage: storage(), indexedDB: idb, caches: null, timeoutMs: 5 });
  assert.equal(result.complete, false);
  assert.equal(result.blocked, 1);
  assert.equal(local.getItem('token'), null);
  assert.equal(local.getItem('email'), null);
  assert.deepEqual(JSON.parse(local.getItem(DRAFT_DATABASE_REGISTRY)), ['first@example.test']);
});

test('unsupported full enumeration and storage failures are not reported as complete', async () => {
  const idb = fakeIndexedDB({ 'first@example.test': draftSchema() });
  delete idb.databases;
  const local = storage({ loginEmail: 'first@example.test', epo_sessions: '{"not":"array"}' });
  const result = await clearDeviceData({ localStorage: local, sessionStorage: storage(), indexedDB: idb, caches: null, listDatabaseNames: async () => ['first@example.test'] });
  assert.equal(result.complete, false);
  assert.equal(result.failed, 1);
  assert.deepEqual(idb.removed, ['first@example.test']);
});

test('database deletion error is propagated, not interpreted as successful erasure', async () => {
  await assert.rejects(deleteLocalDatabase(fakeIndexedDB({ fixture: draftSchema() }, { fail: ['fixture'] }), 'fixture', 5), { code: 'database' });
});

test('draft rows and attachments are deleted in one transaction and rollback together', async () => {
  let drafts = [1, 2];
  let attachments = [1, 2];
  let fail = false;
  const database = {
    draft: { async bulkDelete(ids) { drafts = drafts.filter(id => !ids.includes(id)); } },
    att: { async bulkDelete(ids) { if (fail) throw new Error('attachment write failed'); attachments = attachments.filter(id => !ids.includes(id)); } },
    async transaction(mode, draftTable, attTable, action) {
      assert.equal(mode, 'rw'); assert.equal(draftTable, database.draft); assert.equal(attTable, database.att);
      const previous = [drafts.slice(), attachments.slice()];
      try { await action(); } catch (error) { [drafts, attachments] = previous; throw error; }
    }
  };
  fail = true;
  await assert.rejects(deleteDraftsAndAttachments(database, [1]));
  assert.deepEqual([drafts, attachments], [[1, 2], [1, 2]]);
  fail = false;
  await deleteDraftsAndAttachments(database, 1);
  assert.deepEqual([drafts, attachments], [[2], [2]]);
});

test('optional verification-code preference is strict and preserves unrelated profile preferences', () => {
  assert.deepEqual(privacyPreferences('broken'), {});
  assert.deepEqual(privacyPreferences('[]'), {});
  assert.equal(verificationCodeNotice({ contentProcessing: { verificationCodeEnabled: 'true', noticeUrl: 'https://docs.example.test/privacy' } }), '');
  assert.equal(verificationCodeNotice({ contentProcessing: { verificationCodeEnabled: true, noticeUrl: 'javascript:alert(1)' } }), '');
  assert.equal(verificationCodeNotice({ contentProcessing: { verificationCodeEnabled: true, noticeUrl: 'https://user:pass@docs.example.test/privacy' } }), '');
  assert.equal(verificationCodeNotice({ contentProcessing: { verificationCodeEnabled: true, noticeUrl: 'https://docs.example.test/privacy' } }), 'https://docs.example.test/privacy');
  const preferences = { otherChoice: false, nested: { keep: true }, aiVerificationCode: true };
  assert.deepEqual(withVerificationCodePreference(preferences, false), { ...preferences, aiVerificationCode: false });
  assert.equal(preferences.aiVerificationCode, true, 'no optimistic mutation before the API succeeds');
});

test('storage/cache allowlists leave other applications alone', () => {
  for (const key of ['email', 'writer', 'epo_sessions', 'DEV_TRUST', 'dev_trust:fixture']) assert.equal(isAppStorageKey(key), true);
  for (const key of ['otherApp', 'another_token', 'theme']) assert.equal(isAppStorageKey(key), false);
  assert.equal(isAppCacheName(`workbox-precache-v2-${origin}/other-app/`, origin), false);
});

for (const locale of ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl']) {
  test(`privacySettings ${locale}: translated and symmetric`, async () => {
    const en = (await import('../mail-vue/src/i18n/en.js')).default.privacySettings;
    const dictionary = (await import(`../mail-vue/src/i18n/${locale}.js`)).default.privacySettings;
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(en).sort());
    for (const value of Object.values(dictionary)) {
      assert.equal(typeof value, 'string');
      assert.ok(value.trim());
      if (!locale.startsWith('zh')) assert.doesNotMatch(value, /\p{Script=Han}/u);
    }
  });
}

for (const component of [
  'components/shadow-html/index.vue', 'views/data-setting/index.vue',
  'views/setting/index.vue', 'views/draft/index.vue', 'views/content/index.vue',
  'views/all-email/index.vue', 'layout/header/index.vue'
]) {
  test(`Vue syntax and template compilation: ${component}`, () => {
    const source = readFileSync(new URL(`../mail-vue/src/${component}`, import.meta.url), 'utf8');
    const { descriptor, errors } = parse(source, { filename: component });
    assert.deepEqual(errors, []);
    const script = compileScript(descriptor, { id: 'privacy-regression' });
    const template = compileTemplate({ source: descriptor.template.content, filename: component, id: 'privacy-regression', compilerOptions: { bindingMetadata: script.bindings } });
    assert.deepEqual(template.errors, []);
  });
}
