import assert from 'node:assert/strict';
import test from 'node:test';
import { assessCompletedPressure } from '../backend-stress.mjs';
import {
  HARD_LIMITS,
  assessSlo,
  assertLoopbackBase,
  createLoopbackClient,
  planSoak,
  runStage,
  runStages
} from './load-runner.mjs';

test('completed under-sampled stages keep their failures and independent latency evidence', async () => {
  const names = ['baseline', 'ramp-1', 'ramp-2', 'ramp-4', 'burst', 'recovery', 'soak'];
  const pressure = { stopped: false, results: names.map(name => ({
    name, stageCompleted: true, durationMs: 1000, ratePerSecond: 4, maxRequests: 4,
    stats: { requests: name === 'burst' || name === 'ramp-4' ? 2 : 3 },
    byKind: { list: { latencyMs: { p95: 20 } } }
  })) };
  let probes = 0;
  const fixture = { client: async route => {
    assert.equal(route, '/api/login');
    probes++;
    return { status: 200, code: 200, latencyMs: 12, json: { data: { token: 'fixture' } } };
  } };
  const result = await assessCompletedPressure(pressure, fixture, 'limited-beta');
  assert.deepEqual(result.sampleFailures, [
    'stage ramp-4 sample count too low (2/4, floor 3)', 'stage burst sample count too low (2/4, floor 3)'
  ]);
  assert.ok(pressure.results.every(stage => stage.sampleFloor === 3));
  assert.equal(probes, 5);
  assert.equal(result.slo.readP95.pass, true);
  assert.equal(result.slo.auth.pass, true);
  pressure.stopped = true;
  await assert.rejects(assessCompletedPressure(pressure, fixture, 'limited-beta'), /must not stop early/);
  assert.equal(probes, 5);
});

test('assertLoopbackBase accepts only generated 127.0.0.1 origins', () => {
  assert.equal(assertLoopbackBase('http://127.0.0.1:43127'), 'http://127.0.0.1:43127');
  for (const target of [
    'https://127.0.0.1:43127',
    'http://localhost:43127',
    'http://127.0.0.2:43127',
    'http://example.test:43127',
    'http://127.0.0.1:43127/api',
    'http://127.0.0.1:43127?remote=1',
    'http://127.0.0.1:43127#remote'
  ]) {
    assert.throws(() => assertLoopbackBase(target), /refusing|valid URL/);
  }
});

test('createLoopbackClient only resolves relative paths on its fixed origin', async () => {
  const calls = [];
  const client = createLoopbackClient('http://127.0.0.1:43128', {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ code: 200, data: { ok: true } }), { status: 200 });
    },
    requestTimeoutMs: 100
  });
  const result = await client('/api/health?x=1');
  assert.equal(result.status, 200);
  assert.equal(result.code, 200);
  assert.equal(result.json.data.ok, true);
  assert.equal(calls[0].url, 'http://127.0.0.1:43128/api/health?x=1');
  assert.equal(calls[0].options.redirect, 'error');
  assert.throws(() => client('https://example.test/escape'), /absolute path|scheme/);
  assert.throws(() => client('//example.test/escape'), /absolute path/);
});

test('createLoopbackClient classifies an aborted request as timeout without throwing', async () => {
  const client = createLoopbackClient('http://127.0.0.1:43129', {
    fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('request timeout');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
    requestTimeoutMs: 10
  });
  const result = await client('/api/slow');
  assert.equal(result.timeout, true);
  assert.equal(result.transportError, false);
  assert.equal(result.status, null);
});

test('runStage enforces request limit and records response classes', async () => {
  let calls = 0;
  const result = await runStage({
    name: 'unit-metrics',
    concurrency: 2,
    durationMs: 500,
    maxRequests: 3,
    ratePerSecond: 100,
    operation: async () => {
      const index = calls++;
      if (index === 0) return { kind: 'read', status: 200, code: 200, latencyMs: 10 };
      if (index === 1) return { kind: 'read', status: 403, code: 403, expected4xx: true, latencyMs: 20 };
      return { kind: 'read', status: 500, code: 500, latencyMs: 30 };
    }
  });
  assert.equal(result.stats.requests, 3);
  assert.equal(result.stats.success, 1);
  assert.equal(result.stats.expected4xx, 1);
  assert.equal(result.stats.unexpected5xx, 1);
  assert.equal(result.stats.contractFailure, 0);
  assert.equal(result.stats.latencyMs.p50, 20);
  assert.equal(result.stats.latencyMs.p95, 29);
  assert.equal(result.stopReason, 'request_limit');
  assert.equal(result.byKind.read.requests, 3);
});

test('runStage stops dispatching after a request timeout', async () => {
  let calls = 0;
  const result = await runStage({
    name: 'unit-timeout',
    concurrency: 4,
    durationMs: 100,
    maxRequests: 100,
    limits: { ...HARD_LIMITS, requestTimeoutMs: 10, maxStageMs: 100 },
    ratePerSecond: 1000,
    operation: async () => {
      calls++;
      return new Promise(() => {});
    }
  });
  assert.equal(result.timedOut, true);
  assert.equal(result.stats.timeout, 4);
  assert.equal(result.stopReason, 'request_timeout');
  assert.equal(calls, 4);
});

test('runStages stops later stages after a failed local request', async () => {
  const names = [];
  const result = await runStages([
    {
      name: 'first',
      concurrency: 1,
      durationMs: 100,
      maxRequests: 1,
      limits: { ...HARD_LIMITS, requestTimeoutMs: 5, maxStageMs: 100 },
      operation: async context => {
        names.push(context.stageName);
        return new Promise(() => {});
      }
    },
    {
      name: 'must-not-run',
      concurrency: 1,
      durationMs: 100,
      maxRequests: 1,
      operation: async context => {
        names.push(context.stageName);
        return { status: 200, code: 200, latencyMs: 1 };
      }
    }
  ], { limits: { ...HARD_LIMITS, requestTimeoutMs: 5, maxStageMs: 100, maxTotalMs: 200 } });
  assert.equal(result.stopped, true);
  assert.deepEqual(names, ['first']);
  assert.equal(result.results.length, 1);
});

test('assessSlo applies one strict threshold', () => {
  assert.deepEqual(assessSlo(100, { nominalMs: 200 }), {
    status: 'pass', pass: true, p95: 100, thresholdMs: 200
  });
  assert.deepEqual(assessSlo(300, { nominalMs: 200 }), {
    status: 'fail', pass: false, p95: 300, thresholdMs: 200
  });
  assert.deepEqual(assessSlo(null, { nominalMs: 200 }), {
    status: 'unavailable', pass: false, p95: null, thresholdMs: 200
  });
});

test('15- and 30-minute local soaks retain each profile rate within a finite stage budget', () => {
  for (const minutes of [3, 15, 30]) {
    for (const limited of [true, false]) {
      const soak = planSoak(minutes * 60_000, limited);
      const rate = limited ? 8 : 32;
      assert.equal(soak.ratePerSecond, rate);
      assert.equal(soak.concurrency, limited ? 4 : 8);
      assert.equal(soak.maxRequests, minutes * 60 * rate + 1);
      assert.ok(soak.maxRequests <= HARD_LIMITS.maxRequestsPerStage);
      assert.ok(soak.durationMs + 75_000 < HARD_LIMITS.maxTotalMs);
      assert.equal(soak.requireFullDuration, true);
    }
  }
  assert.throws(() => planSoak(30 * 60_000 + 1, true), /soak duration/);
});

test('a full-duration stage cannot pass by reaching an undersized request cap', async () => {
  const result = await runStage({
    ...planSoak(15 * 60_000, true), maxRequests: 1,
    operation: async () => ({ status: 200, code: 200 })
  });
  assert.equal(result.stats.requests, 1);
  assert.equal(result.stopReason, 'request_limit');
  assert.equal(result.stageCompleted, false);
  assert.ok(result.schedulingMs < result.durationMs);
});

test('a short remaining total budget cannot silently shorten the requested soak', async () => {
  const result = await runStages([{
    ...planSoak(15 * 60_000, true),
    operation: () => assert.fail('no partial soak should start')
  }], { limits: { ...HARD_LIMITS, maxTotalMs: 60_000 } });
  assert.equal(result.stopped, true);
  assert.equal(result.results.length, 0);
});
