import assert from 'node:assert/strict';
import test from 'node:test';
import { retainStorageProbeTimes } from '../mail-vue/src/utils/storage-probe-history.js';

test('only success times survive a failed scan in the same admin session', () => {
  const items = new Map();
  const storage = { getItem: k => items.get(k), setItem: (k,v) => items.set(k,v) };
  const admin = { userId: 7, sessionId: 'fixture', email: 'admin@example.invalid', token: 'private' };
  const time = '2026-10-11T10:07:12.000Z';
  const unknown = { healthScore: null, d1: { totalBytes: null }, probes: { d1: { status: 'unknown', lastSuccessAt: null } } };
  retainStorageProbeTimes({ probes: { d1: { status: 'ok', lastSuccessAt: time } }, samples: ['attachments/private'] }, admin, storage);
  const result = retainStorageProbeTimes(unknown, admin, storage);
  assert.deepEqual(result, { ...unknown, probes: { d1: { status: 'unknown', lastSuccessAt: time } } });
  const earlier = { probes: { d1: { status: 'ok', lastSuccessAt: '2026-09-01T00:00:00.000Z' } } };
  assert.equal(retainStorageProbeTimes(earlier, admin, storage).probes.d1.lastSuccessAt, time);
  assert.deepEqual([...items], [['epo_probe_times:7:fixture', JSON.stringify({ d1: time })]]);
  assert.deepEqual(retainStorageProbeTimes(unknown, { ...admin, sessionId: 'new' }, storage), unknown);
  assert.deepEqual(retainStorageProbeTimes(unknown, admin, { getItem() { throw Error(); }, setItem() { throw Error(); } }), unknown);
  assert.deepEqual(retainStorageProbeTimes({ healthScore: 80 }, admin, storage), { healthScore: 80 });
});
