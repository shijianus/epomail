import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const files = {
  '/dexie.js': '../mail-vue/node_modules/dexie/dist/dexie.mjs',
  '/compose-draft.js': '../mail-vue/src/utils/compose-draft.js',
  '/tab-session.js': '../mail-vue/src/utils/tab-session.js'
};

test('IndexedDB restores the original send, isolates accounts and atomically saves attachments', async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined
  });
  try {
    const context = await browser.newContext();
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://127.0.0.1') return route.abort();
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<title>Draft test</title>' });
      const file = files[url.pathname];
      if (!file) return route.fulfill({ status: 404 });
      await route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL(file, import.meta.url)) });
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1/');
    async function load() {
      await page.evaluate(async () => {
        const { default: Dexie } = await import('/dexie.js');
        const { createDraftSession } = await import('/compose-draft.js');
        window.dbFor = name => {
          const db = new Dexie(name);
          db.version(1).stores({ draft: '++draftId,createTime', att: 'draftId' });
          return db;
        };
        window.db = dbFor('owner-A');
        window.sessionFor = createDraftSession;
      });
    }
    await load();
    const body = { accountId: 10, subject: 'Original subject', receiveEmail: ['recipient@example.test'],
      attachments: [{ filename: 'tiny.txt', content: 'YWJj' }] };
    const attempt = await page.evaluate(async body => {
      const first = sessionFor(db);
      const draft = await first.persist(body);
      const stale = sessionFor(db, await db.draft.get(draft.id));
      const attempt = await first.persist(body, true);
      // The second editor still has the revision from before the send.
      const rejected = await stale.persist({ ...body, subject: 'other tab' }).then(() => false, () => true);
      return { ...attempt, rejected };
    }, body);
    assert.ok(attempt.key);
    assert.equal(attempt.rejected, true);
    await page.reload();
    await load();
    const restored = await page.evaluate(async ({attempt, body}) => {
      const draft = await db.draft.get(attempt.id);
      const reopened = sessionFor(db, draft);
      const retry = await reopened.persist({ ...body, accountId: 20, subject: 'different content' }, true);
      const otherCount = await dbFor('owner-B').draft.count();
      await reopened.finish(retry.key, false);
      const changed = await reopened.persist({ ...body, subject: 'corrected' }, true);
      await reopened.finish(changed.key, true);
      return { retry, otherCount, changed, messages: await db.draft.count(), attachments: await db.att.count() };
    }, {attempt, body});
    assert.deepEqual(restored.retry.body, body);
    assert.equal(restored.retry.key, attempt.key);
    assert.notEqual(restored.changed.key, attempt.key);
    assert.equal(restored.otherCount, 0);
    assert.equal(restored.messages, 0);
    assert.equal(restored.attachments, 0);
    const rollback = await page.evaluate(async body => {
      const session = sessionFor(db);
      const first = await session.persist(body);
      const bad = { ...body, subject: 'must roll back', attachments: [{ content: () => {} }] };
      const failed = await session.persist(bad, true).then(() => false, () => true);
      const row = await db.draft.get(first.id);
      return { failed, subject: row.subject, key: row.attemptKey, attachments: (await db.att.get(first.id)).attachments };
    }, body);
    assert.deepEqual(rollback, { failed: true, subject: body.subject, key: null, attachments: body.attachments });
  } finally {
    await browser.close();
  }
});
