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
