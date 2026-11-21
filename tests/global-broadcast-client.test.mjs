import test from 'node:test';
import assert from 'node:assert/strict';
import { submitGlobalBroadcast } from '../mail-vue/src/utils/global-broadcast.js';

test('admin retries recover the pending campaign across chunks and a lost response', async () => {
  const entries = new Map();
  const storage = { getItem: k => entries.get(k), setItem: (k,v) => entries.set(k,v), removeItem: k => entries.delete(k) };
  let sequence = 0, calls = 0;
  const ids = [];
  const options = { identity: () => 'same-tab', storage, newId: () => 'operation-' + ++sequence,
    post: async body => {
      ids.push(body.operationId);
      if (++calls === 1) return { complete: false };
      if (calls === 2) throw new Error('response lost');
      return { complete: true };
    } };
  const payload = { subject: 'Subject', content: 'Private mail body' };
  await assert.rejects(submitGlobalBroadcast(payload, options), /response lost/);
  assert.equal(entries.size,1);
  assert.doesNotMatch([...entries.values()].join(''), /Private mail body/);
  await submitGlobalBroadcast(payload, options);
  await submitGlobalBroadcast(payload, options);
  assert.deepEqual(ids, ['operation-1','operation-1','operation-1','operation-2']);
  assert.equal(entries.size,0);
});
