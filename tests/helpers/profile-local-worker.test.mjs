import test from 'node:test';
import assert from 'node:assert/strict';
import { observeD1, diagnosticFields, profileWorker } from './profile-local-worker.mjs';

test('D1 counters preserve native return values, bound statements and partial row metadata', async () => {
  const counters = Object.fromEntries(diagnosticFields.map(key => [key, 0]));
  const meta = { rows_read: 21, rows_written: 1 };
  let native;
  const db = {
    prepare() {
      native = { bind: () => native, all: async () => ({ results: ['private row'], meta }),
        first: async () => 'private row', raw: async () => [['private row']] };
      return native;
    },
    batch(stmts) {
      assert.deepEqual(stmts, [native, native]);
      return [{ meta }, { meta }];
    }
  };
  const binding = observeD1(db, counters);
  const stmt = binding.prepare('private query').bind('private value');
  assert.deepEqual((await stmt.all()).results, ['private row']);
  assert.equal(await stmt.first(), 'private row');
  assert.deepEqual(await stmt.raw(), [['private row']]);
  await binding.batch([stmt, stmt]);
  assert.equal(counters.d1Calls, 4);
  assert.equal(counters.statements, 5);
  assert.equal(counters.statementsWithRowCounts, 3);
  assert.equal(counters.rowsRead, 63);
  assert.equal(counters.rowsWritten, 3);
  assert.ok(!JSON.stringify(counters).includes('private'));
});

test('the diagnostic wrapper leaves unmarked requests alone and emits only counters on opt-in', async () => {
  const kv = { async get() { return 'private value'; } };
  const worker = profileWorker({ async fetch(_request, env) {
    await env.kv.get('secret key');
    return new Response('ok', { status: 202 });
  } });
  const env = { kv, db: {} };
  const plain = await worker.fetch(new Request('http://127.0.0.1/'), env);
  assert.equal(plain.headers.get('X-Local-Profile'), null);
  const traced = await worker.fetch(new Request('http://127.0.0.1/', { headers: { 'X-Local-Profile': '1' } }), env);
  assert.equal(traced.status, 202);
  assert.equal(await traced.text(), 'ok');
  const metrics = JSON.parse(traced.headers.get('X-Local-Profile'));
  assert.deepEqual(Object.keys(metrics), diagnosticFields);
  assert.equal(metrics.kvReads, 1);
  assert.ok(Object.values(metrics).every(Number.isFinite));
});
