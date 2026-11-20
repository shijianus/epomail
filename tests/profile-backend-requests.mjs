// Per-request diagnostics for the independent, local-only backend-stress mix.
// No capacity thresholds or production targets. Usage: node tests/profile-backend-requests.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { bootstrap, operationMix } from './backend-stress.mjs';
import { createLoopbackClient } from './helpers/load-runner.mjs';
import { withLocalStack } from './helpers/local-stack.mjs';
import { diagnosticFields } from './helpers/profile-local-worker.mjs';

const { values } = parseArgs({ options: {
  'warm-cycles': { type: 'string', default: '3' },
  cycles: { type: 'string', default: '3' }
} });
function bound(s, min, max) {
  const n = Number(s);
  if (!/^\d+$/.test(s) || !Number.isSafeInteger(n) || n < min || n > max) throw new Error('Invalid number of cycles');
  return n;
}
const warm = bound(values['warm-cycles'], 1, 100);
const measured = bound(values.cycles, 1, 20);
const artifact = process.env.EPOMAIL_CANDIDATE_DIR;
const report = {
  mode: 'isolated-sequential-diagnostics', warmCycles: warm, measuredCycles: measured,
  measurement: {
    clientMs: 'Loopback request through response body parsing.',
    handlerMs: 'Worker fetch entry to response headers; excludes client transport.',
    d1Calls: 'Executed D1 binding calls. A batch counts once.',
    statements: 'Executed prepared statements. A batch contributes its length.',
    rowCoverage: 'rowsRead/rowsWritten sum metadata only for statementsWithRowCounts; first/raw omit metadata. Zero coverage means unknown.',
    bindingWaitMs: 'Sum of awaited D1 or KV call durations; parallel calls overlap and can exceed handlerMs.',
    clientEventLoop: 'Measures the Node load driver only, during the serial measured cycles.'
  },
  worker: artifact ? {
    sourceSha: (await readFile(path.join(artifact, 'SOURCE_SHA'), 'utf8')).trim(),
    bundleSha256: createHash('sha256').update(await readFile(path.join(artifact, 'bundle/index.js'))).digest('hex')
  } : { mode: 'source-checkout' },
  rows: []
};
const stages = ['list','sidebar','search','account','detail','send-internal','send-replay','send-external-disabled'];
await withLocalStack(async stack => {
  let current = null;
  const plain = createLoopbackClient(stack.base);
  const client = async (pathname, opts) => {
    if (!current) return plain(pathname, opts);
    let counters;
    const instrumented = createLoopbackClient(stack.base, { fetchImpl: async (address, options) => {
      const headers = new Headers(options.headers);
      headers.set('X-Local-Profile', '1');
      const res = await fetch(address, { ...options, headers });
      counters = JSON.parse(res.headers.get('X-Local-Profile') || 'null');
      return res;
    } });
    const result = await instrumented(pathname, opts);
    assert.ok(counters && diagnosticFields.every(key => Number.isFinite(counters[key])), 'Missing Worker profiling counters');
    current.push({
      method: opts?.method || 'GET', route: new URL(pathname, stack.base).pathname,
      status: result.status, clientMs: result.latencyMs, ...counters
    });
    return result;
  };
  const fixture = await bootstrap(stack, client);
  const operations = operationMix(fixture);
  assert.equal(operations.length, stages.length);
  const delay = monitorEventLoopDelay({ resolution: 10 });
  let startUtil;
  try {
    for (let cycle = 0; cycle < warm + measured; cycle++) {
      if (cycle === warm) { delay.enable(); startUtil = performance.eventLoopUtilization(); }
      for (let i = 0; i < operations.length; i++) {
        current = cycle >= warm ? [] : null;
        const result = await operations[i]({ requestNumber: cycle * operations.length + i });
        assert.equal(result.kind, stages[i]);
        assert.ok(!result.contractFailure && !result.timeout && !result.transportError, 'Unexpected workload outcome: ' + result.kind);
        if (current) report.rows.push({ operation: result.kind, requests: current });
      }
    }
    report.clientEventLoop = {
      utilization: performance.eventLoopUtilization(startUtil).utilization,
      delayP99Ms: delay.percentile(99) / 1e6
    };
  } finally { delay.disable(); }
}, { profileRequests: true });
console.log(JSON.stringify(report, null, 2));
