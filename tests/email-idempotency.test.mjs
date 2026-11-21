import test from 'node:test';
import assert from 'node:assert/strict';
import { composeFingerprint, idempotencyKeyForCompose } from '../mail-vue/src/utils/tab-session.js';

test('compose retries keep key and content edits create a new key', () => {
  const state = new WeakMap();
  const form = { accountId: 1, sendEmail: 'a@example.test', receiveEmail: ['b@example.test'], subject: 'hello', content: '<p>one</p>', attachments: [] };
  const first = idempotencyKeyForCompose(form, state);
  assert.equal(idempotencyKeyForCompose(form, state), first);
  assert.equal(composeFingerprint(form), composeFingerprint(form));
  form.content = '<p>two</p>';
  const second = idempotencyKeyForCompose(form, state);
  assert.notEqual(second, first);
  form.subject = 'changed';
  assert.notEqual(idempotencyKeyForCompose(form, state), second);
});

test('new form object gets a distinct key even when content matches', () => {
  const state = new WeakMap();
  const a = { subject: 'same', content: 'same', receiveEmail: ['x@example.test'] };
  const b = { subject: 'same', content: 'same', receiveEmail: ['x@example.test'] };
  assert.notEqual(idempotencyKeyForCompose(a, state), idempotencyKeyForCompose(b, state));
});

import { composePayload, createDraftSession } from '../mail-vue/src/utils/compose-draft.js';

// Atomic in-memory table adapter for the unit suite. compose-draft-browser.mjs
// runs the same contract against Dexie and the browser's IndexedDB.
function memoryDraftDB() {
  const db = { draft: table(), att: table() };
  let queue = Promise.resolve();
  let next = 1;
  function table() {
    return {
      rows: new Map(),
      get(id) { return structuredClone(this.rows.get(id)); },
      put(row) {
        const id = row.draftId ?? next++;
        this.rows.set(id, structuredClone({ ...row, draftId: id }));
        return id;
      },
      delete(id) { this.rows.delete(id); },
      update(id, fields) { this.put({ ...this.get(id), ...fields }); }
    };
  }
  db.transaction = (_mode, draft, att, fn) => {
    const result = queue.then(async () => {
      const rows = [structuredClone(draft.rows), structuredClone(att.rows)];
      try { return await fn(); }
      catch (error) { [draft.rows, att.rows] = rows; throw error; }
    });
    queue = result.catch(() => {});
    return result;
  };
  return db;
}

test('reopened pending attempts replay their saved payload and key; a stale tab cannot overwrite them', async () => {
  const db = memoryDraftDB();
  const edit = createDraftSession(db);
  const body = composePayload({ accountId: 8, receiveEmail: ['alice@example.test'], subject: 'one', attachments: [{ filename: 'x', content: 'eA==' }] });
  const draft = await edit.persist(body);
  const stale = createDraftSession(db, db.draft.get(draft.id));
  const attempt = await edit.persist(body, true);
  await assert.rejects(stale.persist({ ...body, subject: 'stale' }), /draft_conflict/);
  const reopened = createDraftSession(db, db.draft.get(draft.id));
  const retry = await reopened.persist({ ...body, accountId: 13, attachments: [] }, true);
  assert.equal(retry.key, attempt.key);
  assert.deepEqual(retry.body, body);
  await reopened.finish(retry.key, false);
  const next = await reopened.persist(body, true);
  assert.notEqual(next.key, attempt.key);
  await reopened.finish(next.key, true);
  assert.equal(db.draft.rows.size + db.att.rows.size, 0);
});

test('attachment write failure rolls back both the edited message and its pending key', async () => {
  const db = memoryDraftDB();
  const session = createDraftSession(db);
  const body = { subject: 'before', attachments: [{ filename: 'saved' }] };
  const { id } = await session.persist(body);
  await assert.rejects(session.persist({ subject: 'after', attachments: [() => {}] }, true));
  assert.equal(db.draft.get(id).subject, 'before');
  assert.equal(db.draft.get(id).attemptKey, null);
  assert.deepEqual(db.att.get(id).attachments, body.attachments);
  const retried = await session.persist(body, true);
  assert.ok(retried.key);
});
