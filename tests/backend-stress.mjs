/**
 * Local-only backend pressure suite.
 *
 * This file intentionally owns no configurable target URL. It creates the
 * target through tests/helpers/local-stack.mjs, which binds Wrangler to a
 * random 127.0.0.1 port and removes D1/KV state in finally.
 *
 * Usage:
 *   node tests/backend-stress.mjs
 *   node tests/backend-stress.mjs --soak=2m --out=tests/artifacts/backend-stress.json
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withLocalStack } from './helpers/local-stack.mjs';
import {
  HARD_LIMITS,
  assessSlo,
  createLoopbackClient,
  percentile,
  runStages
} from './helpers/load-runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRESS_LIMITS = Object.freeze({
  ...HARD_LIMITS,
  maxConcurrency: 32,
  maxRequestsPerStage: 10_000,
  maxStageMs: 5 * 60 * 1000,
  maxTotalMs: 30 * 60 * 1000,
  requestTimeoutMs: 8_000
});
const DEFAULT_SOAK_MS = 3 * 60 * 1000;
const MAX_SOAK_MS = 5 * 60 * 1000;
function parseDuration(value) {
  if (value === undefined || value === '') return DEFAULT_SOAK_MS;
  const match = /^(\d+)(ms|s|m)$/i.exec(String(value));
  if (!match) throw new Error('--soak must use a bounded duration such as 2m or 30s');
  const multiplier = { ms: 1, s: 1000, m: 60_000 }[match[2].toLowerCase()];
  const duration = Number(match[1]) * multiplier;
  if (!Number.isSafeInteger(duration) || duration < 1 || duration > MAX_SOAK_MS) {
    throw new Error(`--soak must be between 1ms and ${MAX_SOAK_MS}ms`);
  }
  return duration;
}

function parseArgs(argv) {
  const args = { soakMs: DEFAULT_SOAK_MS, out: null, profile: 'capacity' };
  for (const arg of argv) {
    if (arg.startsWith('--soak=')) args.soakMs = parseDuration(arg.slice('--soak='.length));
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg.startsWith('--profile=')) {
      args.profile = arg.slice('--profile='.length);
      if (!['capacity', 'limited-beta'].includes(args.profile)) throw new Error('unknown pressure profile');
    }
    else if (arg === '--help') {
      console.log('Usage: node tests/backend-stress.mjs [--soak=3m] [--profile=capacity|limited-beta] [--out=path]');
      process.exit(0);
    } else {
      throw new Error(`unknown argument ${arg}; only --soak and --out are accepted`);
    }
  }
  if (args.out && /https?:\/\//i.test(args.out)) throw new Error('--out must be a local filesystem path');
  return args;
}

function nowIso() {
  return new Date().toISOString();
}

function sha() {
  return crypto.createHash('sha1').update(crypto.randomBytes(16)).digest('hex');
}

function redactText(value) {
  return String(value || '')
    .replace(/[A-Za-z0-9_-]{30,}/g, '[redacted]')
    .replace(/password\s*[:=]\s*[^,\s}]+/gi, 'password=[redacted]')
    .replace(/token\s*[:=]\s*[^,\s}]+/gi, 'token=[redacted]');
}

function safeError(error) {
  return { name: error?.name || 'Error', message: redactText(error?.message || error) };
}

function jsonHeaders(extra = {}) {
  return { 'content-type': 'application/json', ...extra };
}

async function writeReport(out, report) {
  const target = out
    ? path.resolve(ROOT, out)
    : path.join(os.tmpdir(), `epomail-backend-stress-${Date.now()}-${sha().slice(0, 8)}.json`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const handle = await fs.open(target, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await handle.close();
  }
  return target;
}

function currentGitSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', timeout: 5_000 }).trim();
}

function expectedStatus(result, status, errorCode = null) {
  const actualStatus = Number(result?.status);
  const actualCode = Number(result?.code);
  // The Worker contract carries BizError status in JSON `code`; the current
  // Hono error handler may serialize that body with HTTP 200.
  const matchesStatus = actualCode === status && (actualStatus === 200 || actualStatus === status);
  const matchesErrorCode = errorCode === null || result?.json?.errorCode === errorCode;
  return { ...result, expected4xx: matchesStatus && matchesErrorCode, contractFailure: !matchesStatus || !matchesErrorCode };
}

function requireOk(result, label) {
  if (result.status !== 200 || result.code !== 200) {
    return { ...result, contractFailure: true, kind: label };
  }
  return { ...result, kind: label };
}

function makeRequest(client, auth = {}) {
  return async (pathname, options = {}) => client(pathname, {
    ...options,
    headers: {
      ...(auth.token ? { Authorization: auth.token } : {}),
      ...(options.headers || {})
    }
  });
}

async function assertEgressHarness(stack) {
  const entryPath = path.join(stack.tempDir, 'isolated-worker.mjs');
  const entry = await fs.readFile(entryPath, 'utf8');
  assert.match(entry, /Object\.defineProperty\(globalThis, ['"]fetch['"]/);
  assert.match(entry, /writable:\s*false/);
  assert.match(entry, /configurable:\s*false/);
  assert.match(entry, /External network is disabled/);
}

async function bootstrap({ base, jwtSecret }) {
  const client = createLoopbackClient(base);
  const init = await client('/api/init', { method: 'POST', headers: { 'x-init-secret': jwtSecret } });
  assert.equal(init.status, 200, 'local init must succeed');

  const adminLogin = await client('/api/login', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email: 'admin@example.com', password: init.text.match(/Initial admin password:\s*(\S+)/)?.[1] })
  });
  assert.equal(adminLogin.json?.code, 200, 'local admin login must succeed');
  const adminToken = adminLogin.json?.data?.token;
  assert.ok(adminToken, 'local admin token missing');

  const admin = makeRequest(client, { token: adminToken });
  const roles = await admin('/api/role/list');
  assert.equal(roles.json?.code, 200, 'role listing must succeed');
  const normalRole = (roles.json?.data || []).find(row => row.roleCode === 'user_base');
  assert.ok(normalRole?.roleId, 'user_base role must be seeded');
  assert.ok(Number(normalRole.storageQuotaMb) > 0, 'synthetic user must have storage quota');

  const suffix = `${Date.now()}-${process.pid}-${sha().slice(0, 8)}`;
  const roleName = `Local stress ${suffix}`;
  const stressRole = await admin('/api/role/add', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      name: roleName,
      key: `stress-${suffix}`,
      roleCode: 'custom',
      description: 'Disposable local stress role',
      sendCount: 10000,
      sendType: 'count',
      accountCount: 1,
      storageQuotaMb: 64,
      allowAttachment: 0,
      availDomain: ['example.com'],
      permIds: normalRole.permIds
    })
  });
  assert.equal(stressRole.json?.code, 200, 'stress role creation must succeed');
  const refreshedRoles = await admin('/api/role/list');
  const stressRoleRow = (refreshedRoles.json?.data || []).find(row => row.name === roleName);
  assert.ok(stressRoleRow?.roleId, 'stress role must be visible');
  assert.equal(Number(stressRoleRow.sendCount), 10000, 'stress role must have finite send quota');
  assert.equal(Number(stressRoleRow.storageQuotaMb), 64, 'stress role must have positive storage quota');

  const email = `stress-${suffix}@example.com`;
  const password = `LocalStress-${sha().slice(0, 18)}`;
  const created = await admin('/api/user/add', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password, type: stressRoleRow.roleId, name: `stress-${suffix}` })
  });
  assert.equal(created.json?.code, 200, 'synthetic user creation must succeed');

  const login = await client('/api/login', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password })
  });
  assert.equal(login.json?.code, 200, 'synthetic user login must succeed');
  const token = login.json?.data?.token;
  assert.ok(token, 'synthetic user token missing');

  const user = makeRequest(client, { token });
  const accounts = await user('/api/account/list');
  assert.equal(accounts.json?.code, 200, 'synthetic account listing must succeed');
  const accountRows = Array.isArray(accounts.json?.data) ? accounts.json.data : accounts.json?.data?.list;
  assert.ok(accountRows?.[0]?.accountId, 'synthetic mailbox account missing');

  return {
    client,
    admin,
    user,
    accountId: accountRows[0].accountId,
    syntheticEmail: email,
    password,
    role: { name: roleName, roleId: stressRoleRow.roleId, sendCount: 10000, storageQuotaMb: 64 }
  };
}

function emailIdFrom(result) {
  const data = result?.json?.data;
  const row = Array.isArray(data) ? data[0] : data;
  return Number(row?.emailId || row?.id || 0) || null;
}

function operationMix({ user, accountId, syntheticEmail }) {
  const operations = [
    async ({ signal }) => requireOk(await user('/api/email/list?size=10&type=0', { signal }), 'list'),
    async ({ signal }) => requireOk(await user('/api/email/sidebarStats', { signal }), 'sidebar'),
    async ({ signal }) => requireOk(await user(`/api/email/searchSuggestions?query=stress&type=subject_include&accountId=${accountId}`, { signal }), 'search'),
    async ({ signal }) => requireOk(await user('/api/account/list', { signal }), 'account'),
    async ({ signal }) => {
      const list = requireOk(await user('/api/email/list?size=1&type=0', { signal }), 'detail-list');
      const row = list.json?.data?.list?.[0];
      if (!row?.emailId) return { kind: 'detail', contractFailure: true, status: 200, code: 200, latencyMs: list.latencyMs };
      if (list.contractFailure) return { ...list, kind: 'detail' };
      const detail = requireOk(await user(`/api/email/get?emailId=${encodeURIComponent(row.emailId)}`, { signal }), 'detail');
      return { ...detail, httpRequests: 2, latencyMs: list.latencyMs + detail.latencyMs };
    },
    async ({ signal, requestNumber }) => {
      const idempotencyKey = `local-stress-${requestNumber}-${sha().slice(0, 10)}`;
      const result = await user('/api/email/send', {
        method: 'POST',
        headers: jsonHeaders({ 'Idempotency-Key': idempotencyKey }),
        body: JSON.stringify({
          accountId,
          receiveEmail: [syntheticEmail],
          subject: `local stress ${requestNumber}`,
          content: '<p>local stress</p>',
          text: 'local stress',
          sendType: 0,
          attachments: [],
          idempotencyKey
        }),
        signal
      });
      return { kind: 'send-internal', ...requireOk(result, 'send-internal') };
    },
    async ({ signal, requestNumber }) => {
      const idempotencyKey = `local-stress-replay-${requestNumber}-${sha().slice(0, 10)}`;
      const subject = `local replay ${requestNumber}-${sha().slice(0, 8)}`;
      const body = {
        accountId,
        receiveEmail: [syntheticEmail],
        subject,
        content: '<p>local replay</p>',
        text: 'local replay',
        sendType: 0,
        attachments: [],
        idempotencyKey
      };
      const first = await user('/api/email/send', {
        method: 'POST',
        headers: jsonHeaders({ 'Idempotency-Key': idempotencyKey }),
        body: JSON.stringify(body),
        signal
      });
      const replay = await user('/api/email/send', {
        method: 'POST',
        headers: jsonHeaders({ 'Idempotency-Key': idempotencyKey }),
        body: JSON.stringify(body),
        signal
      });
      const verify = await user('/api/email/list?size=50&type=1', { signal });
      const rows = Array.isArray(verify.json?.data?.list) ? verify.json.data.list : [];
      const matchingRows = rows.filter(row => row.subject === subject && row.sendEmail === syntheticEmail);
      const firstId = emailIdFrom(first);
      const replayId = emailIdFrom(replay);
      const deduplicated = first.status === 200 && first.code === 200 && replay.status === 200 && replay.code === 200 &&
        verify.status === 200 && verify.code === 200 && firstId !== null && firstId === replayId &&
        matchingRows.length === 1 && Number(matchingRows[0].emailId) === firstId;
      const subrequests = [first, replay, verify];
      const failure = subrequests.find(result => result.status !== 200 || result.code !== 200 || result.timeout || result.transportError);
      return {
        kind: 'send-replay',
        status: failure?.status ?? 200,
        code: failure?.code ?? 200,
        timeout: subrequests.some(result => result.timeout),
        transportError: subrequests.some(result => result.transportError),
        diagnostic: { first: first.code, replay: replay.code, verify: verify.code, firstId, replayId, matching: matchingRows.length },
        httpRequests: subrequests.length,
        latencyMs: subrequests.reduce((sum, result) => sum + (result.latencyMs || 0), 0),
        contractFailure: !deduplicated
      };
    },
    async ({ signal, requestNumber }) => {
      const idempotencyKey = `local-stress-external-${requestNumber}-${sha().slice(0, 10)}`;
      const result = await user('/api/email/send', {
        method: 'POST',
        headers: jsonHeaders({ 'Idempotency-Key': idempotencyKey }),
        body: JSON.stringify({
          accountId,
          receiveEmail: ['outside@not-in-local-domain.test'],
          subject: 'local outbound negative',
          content: '<p>blocked local outbound</p>',
          text: 'blocked local outbound',
          sendType: 0,
          attachments: [],
          idempotencyKey
        }),
        signal
      });
      return { kind: 'send-external-disabled', ...expectedStatus(result, 403, 'outbound_disabled') };
    }
  ];
  return operations;
}

async function runPressure(fixture, soakMs, log, profile) {
  const { user, accountId, syntheticEmail, password } = fixture;
  const mix = operationMix(fixture);
  const safeOperation = async context => {
    const operation = mix[context.requestNumber % mix.length];
    return operation(context);
  };
  const limited = profile === 'limited-beta';
  const ramps = limited ? [1, 2, 4] : [1, 4, 8, 16, 32];
  const stages = [
    { name: 'baseline', concurrency: 1, durationMs: 10_000, ratePerSecond: 2, maxRequests: 30, operation: safeOperation },
    ...ramps.map(concurrency => ({
      name: `ramp-${concurrency}`,
      concurrency,
      durationMs: 10_000,
      ratePerSecond: Math.min(1000, concurrency * 4),
      maxRequests: Math.min(STRESS_LIMITS.maxRequestsPerStage, concurrency * 40),
      operation: safeOperation
    })),
    { name: 'burst', concurrency: limited ? 4 : 32, durationMs: 5_000, ratePerSecond: limited ? 8 : 32, maxRequests: limited ? 40 : 160, operation: safeOperation },
    { name: 'recovery', concurrency: 2, durationMs: 10_000, ratePerSecond: 2, maxRequests: 30, operation: safeOperation },
    { name: 'soak', concurrency: limited ? 4 : 8, durationMs: soakMs, ratePerSecond: limited ? 8 : 32, maxRequests: STRESS_LIMITS.maxRequestsPerStage, operation: safeOperation }
  ];
  const pressure = await runStages(stages, {
    limits: STRESS_LIMITS,
    onStageComplete: stage => {
      log.push({ event: 'stage-complete', at: nowIso(), ...stage });
    }
  });

  const stageNames = pressure.results.map(stage => stage.name);
  const expectedStageNames = limited
    ? ['baseline', 'ramp-1', 'ramp-2', 'ramp-4', 'burst', 'recovery', 'soak']
    : ['baseline', 'ramp-1', 'ramp-4', 'ramp-8', 'ramp-16', 'ramp-32', 'burst', 'recovery', 'soak'];
  assert.deepEqual(stageNames, expectedStageNames, 'all pressure stages must complete in order');
  assert.equal(pressure.stopped, false, 'pressure must not stop early');
  for (const stage of pressure.results) {
    assert.equal(stage.stageCompleted, true, `stage ${stage.name} did not complete safely`);
    const scheduled = Math.min(stage.maxRequests, Math.max(1, Math.floor(stage.durationMs * stage.ratePerSecond / 1000)));
    const sampleFloor = Math.max(1, Math.floor(scheduled * 0.75));
    stage.sampleFloor = sampleFloor;
    stage.sampleRatio = Number((stage.stats.requests / scheduled).toFixed(3));
    assert.ok(stage.stats.requests >= sampleFloor, `stage ${stage.name} sample count too low (${stage.stats.requests}/${scheduled}, floor ${sampleFloor})`);
  }
  const readP95Values = pressure.results.flatMap(stage => Object.entries(stage.byKind)
    .filter(([kind]) => ['list', 'sidebar', 'search', 'account', 'detail'].includes(kind))
    .map(([, stats]) => stats.latencyMs?.p95)).filter(Number.isFinite);
  if (readP95Values.length < 5) throw new Error('insufficient read SLO samples across pressure stages');
  const readP95 = Math.max(...readP95Values);
  const readSlo = assessSlo(readP95, { nominalMs: 2_000 });
  const authStartedAt = Date.now();
  const authResults = [];
  for (let i = 0; i < 5; i++) {
    const result = await fixture.client('/api/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: syntheticEmail, password })
    });
    authResults.push(result);
    if (result.status !== 200 || result.code !== 200 || !result.json?.data?.token) {
      throw new Error('positive login contract failed during bounded auth stage');
    }
  }
  const authElapsed = Math.max(1, Date.now() - authStartedAt);
  const authP95 = authResults.map(row => row.latencyMs).sort((a, b) => a - b)[authResults.length - 1];
  const slo = {
    readP95: readSlo,
    auth: {
      p95: Number(authP95?.toFixed(2) || 0),
      thresholdMs: 8_000,
      elapsedMs: authElapsed,
      pass: Number.isFinite(authP95) && authP95 <= 8_000,
      status: 'positive-login-bounded-five-requests'
    }
  };
  return { pressure, slo };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = nowIso();
  const reportSha = currentGitSha();
  const log = [];
  let cleanupVerified = false;
  let stackCompleted = false;
  let observedStack = null;
  let egressConfigured = false;
  let reportPath = null;
  let report;
  try {
    await withLocalStack(async stack => {
      observedStack = stack;
      assert.match(stack.base, /^http:\/\/127\.0\.0\.1:\d+$/);
      log.push({ event: 'stack-started', at: nowIso(), host: '127.0.0.1', port: Number(new URL(stack.base).port) });
      const fixture = await bootstrap(stack);
      await assertEgressHarness(stack);
      egressConfigured = true;
      log.push({
        event: 'fixture-ready',
        at: nowIso(),
        role: fixture.role,
        quota: 'positive-finite',
        egress: 'blocked-by-harness',
        providerCalls: 'not-measured'
      });
      const result = await runPressure(fixture, args.soakMs, log, args.profile);
      report = {
        schema: 'epomail.backend-stress.v1',
        startedAt,
        finishedAt: nowIso(),
        gitSha: reportSha,
        environment: { localOnly: true, host: '127.0.0.1', egressBlockedByHarness: egressConfigured, providerCalls: 'not-measured', browser: false, deployment: false },
        limits: STRESS_LIMITS,
        configuration: { soakMs: args.soakMs, profile: args.profile },
        stages: result.pressure.results,
        slo: result.slo,
        log,
        cleanup: { processTreeStopped: 'pending', temporaryDirectoryRemoved: 'pending' }
      };
      stackCompleted = true;
    });
    cleanupVerified = true;
    report.cleanup = { processTreeStopped: true, temporaryDirectoryRemoved: true };
    report.finishedAt = nowIso();
    reportPath = await writeReport(args.out, report);
  } catch (error) {
    if (observedStack) {
      try {
        await observedStack.stop();
        cleanupVerified = !await fs.stat(observedStack.tempDir).then(() => true, () => false);
      } catch (_) { cleanupVerified = false; }
    }
    const failure = safeError(error);
    report = report || {
      schema: 'epomail.backend-stress.v1',
      startedAt,
      finishedAt: nowIso(),
      gitSha: reportSha,
      environment: { localOnly: true, host: '127.0.0.1', egressBlockedByHarness: egressConfigured, providerCalls: 'not-measured', browser: false, deployment: false },
      limits: STRESS_LIMITS,
      configuration: { soakMs: args.soakMs, profile: args.profile },
      stages: log.filter(event => event.event === 'stage-complete'),
      slo: null,
      log,
      cleanup: { processTreeStopped: 'failed-or-unknown', temporaryDirectoryRemoved: 'failed-or-unknown' },
      error: failure
    };
    report.cleanup = { processTreeStopped: cleanupVerified, temporaryDirectoryRemoved: cleanupVerified };
    report.error = failure;
    try { reportPath = await writeReport(args.out, report); } catch (_) {}
    if (reportPath) console.error(`backend stress failed; report: ${reportPath}`);
    throw error;
  }
  if (!stackCompleted || !cleanupVerified || report.cleanup.processTreeStopped !== true || report.cleanup.temporaryDirectoryRemoved !== true) {
    throw new Error('pressure run cannot PASS without verified local-stack process and directory cleanup');
  }
  const stageFailure = report.stages.some(stage =>
    stage.stats.unexpected4xx || stage.stats.unexpected5xx || stage.stats.contractFailure ||
    stage.stats.timeout || stage.stats.transportError || stage.stats.success === 0
  );
  if (stageFailure || !report.slo?.readP95?.pass || !report.slo?.auth?.pass) {
    throw new Error(`pressure run failed contract or SLO safety criteria; report: ${reportPath}`);
  }
  console.log(`backend stress PASS; report: ${reportPath}`);
}

try {
  await main();
} catch (error) {
  console.error(`backend stress FAIL: ${redactText(error.message)}`);
  process.exitCode = 1;
}
