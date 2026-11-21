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
 *   node tests/backend-stress.mjs --profile=capacity --soak=1m --out=tests/artifacts/capacity.json
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
  planSoak,
  runStages
} from './helpers/load-runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRESS_LIMITS = HARD_LIMITS;
const DEFAULT_SOAK_MS = 3 * 60 * 1000;
const MAX_SOAK_MS = STRESS_LIMITS.maxStageMs;
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
  const args = { soakMs: DEFAULT_SOAK_MS, out: null, profile: 'limited-beta' };
  for (const arg of argv) {
    if (arg.startsWith('--soak=')) args.soakMs = parseDuration(arg.slice('--soak='.length));
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg.startsWith('--profile=')) {
      args.profile = arg.slice('--profile='.length);
      if (!['capacity', 'limited-beta'].includes(args.profile)) throw new Error('unknown pressure profile');
    }
    else if (arg === '--help') {
      console.log('Usage: node tests/backend-stress.mjs [--soak=3m] [--profile=limited-beta|capacity] [--out=path] (local only, maximum soak 30m)');
      process.exit(0);
    } else {
      throw new Error(`unknown argument ${arg}; expected --soak, --profile or --out`);
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
  return String(value || '').split('\n[wrangler tail]\n', 1)[0]
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

function failedRequest(result) {
  return result.timeout || result.transportError || result.abortedByFuse;
}

function expectedStatus(result, status, errorCode = null) {
  if (failedRequest(result)) return result;
  const actualStatus = Number(result?.status);
  const actualCode = Number(result?.code);
  // HTTP error status contract: HTTP status and JSON code must be identical
  const matchesStatus = actualCode === status && actualStatus === status && Number(result.json?.code) === status;
  const matchesErrorCode = errorCode === null || result?.json?.errorCode === errorCode;
  return { ...result, expected4xx: matchesStatus && matchesErrorCode, contractFailure: !matchesStatus || !matchesErrorCode };
}

function requireOk(result) {
  if (failedRequest(result)) return result;
  return result.status === 200 && result.code === 200 && Number(result.json?.code) === 200
    ? result : { ...result, contractFailure: true };
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
  const entry = await fs.readFile(stack.entryPath, 'utf8');
  assert.match(entry, /Object\.defineProperty\(globalThis, ['"]fetch['"]/);
  assert.match(entry, /writable:\s*false/);
  assert.match(entry, /configurable:\s*false/);
  assert.match(entry, /External network is disabled/);
}

export async function bootstrap({ base, jwtSecret }, client = createLoopbackClient(base)) {
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

export function operationMix({ user, accountId, syntheticEmail }) {
  const operations = {
    list: async request => requireOk(await request('/api/email/list?size=10&type=0')),
    sidebar: async request => requireOk(await request('/api/email/sidebarStats')),
    search: async request => requireOk(await request(`/api/email/searchSuggestions?query=stress&type=subject_include&accountId=${accountId}`)),
    account: async request => requireOk(await request('/api/account/list')),
    detail: async request => {
      const list = requireOk(await request('/api/email/list?size=1&type=0'));
      if (failedRequest(list) || list.contractFailure) return list;
      const row = list.json?.data?.list?.[0];
      if (!row?.emailId) return { ...list, contractFailure: true };
      return requireOk(await request(`/api/email/get?emailId=${encodeURIComponent(row.emailId)}`));
    },
    'send-internal': async (request, { requestNumber }) => {
      const idempotencyKey = `local-stress-${requestNumber}-${sha().slice(0, 10)}`;
      const result = await request('/api/email/send', {
        method: 'POST',
        headers: jsonHeaders({ 'Idempotency-Key': idempotencyKey }),
        body: JSON.stringify({
          accountId, receiveEmail: [syntheticEmail], subject: `local stress ${requestNumber}`,
          content: '<p>local stress</p>', text: 'local stress', sendType: 0, attachments: [], idempotencyKey
        })
      });
      return requireOk(result);
    },
    'send-replay': async (request, { requestNumber }) => {
      const idempotencyKey = `local-stress-replay-${requestNumber}-${sha().slice(0, 10)}`;
      const subject = `local replay ${requestNumber}-${sha().slice(0, 8)}`;
      const options = {
        method: 'POST',
        headers: jsonHeaders({ 'Idempotency-Key': idempotencyKey }),
        body: JSON.stringify({
          accountId, receiveEmail: [syntheticEmail], subject,
          content: '<p>local replay</p>', text: 'local replay', sendType: 0, attachments: [], idempotencyKey
        })
      };
      const first = requireOk(await request('/api/email/send', options));
      if (failedRequest(first) || first.contractFailure) return first;
      const replay = requireOk(await request('/api/email/send', options));
      if (failedRequest(replay) || replay.contractFailure) return replay;
      const verify = requireOk(await request('/api/email/list?size=50&type=1'));
      if (failedRequest(verify) || verify.contractFailure) return verify;
      const rows = Array.isArray(verify.json?.data?.list) ? verify.json.data.list : [];
      const matchingRows = rows.filter(row => row.subject === subject && row.sendEmail === syntheticEmail);
      const firstId = emailIdFrom(first);
      const replayId = emailIdFrom(replay);
      const deduplicated = firstId !== null && firstId === replayId &&
        matchingRows.length === 1 && Number(matchingRows[0].emailId) === firstId;
      return { ...verify, contractFailure: !deduplicated,
        diagnostic: { firstId, replayId, matching: matchingRows.length } };
    },
    'send-external-disabled': async (request, { requestNumber }) => {
      const idempotencyKey = `local-stress-external-${requestNumber}-${sha().slice(0, 10)}`;
      return expectedStatus(await request('/api/email/send', {
        method: 'POST',
        headers: jsonHeaders({ 'Idempotency-Key': idempotencyKey }),
        body: JSON.stringify({
          accountId, receiveEmail: ['outside@not-in-local-domain.test'], subject: 'local outbound negative',
          content: '<p>blocked local outbound</p>', text: 'blocked local outbound', sendType: 0, attachments: [], idempotencyKey
        })
      }), 403, 'outbound_disabled');
    }
  };
  return Object.entries(operations).map(([kind, run]) => async context => {
    context.kind = kind;
    context.subrequest = 0;
    let latencyMs = 0;
    const request = async (path, options) => {
      context.endpoint = path.split('?', 1)[0];
      context.method = options?.method || 'GET';
      context.subrequest++;
      const result = await user(path, { ...options, signal: context.signal });
      latencyMs += result.latencyMs || 0;
      return result;
    };
    const result = await run(request, context);
    return { ...result, kind, httpRequests: context.subrequest, latencyMs };
  });
}

function sampleCoverage(stage) {
  const planned = Math.min(stage.maxRequests, Math.max(1, Math.floor(stage.durationMs * stage.ratePerSecond / 1000)));
  return {
    plannedRequests: planned,
    sampleFloor: Math.max(1, Math.floor(planned * 0.75)),
    sampleRatio: Number((stage.stats.requests / planned).toFixed(3))
  };
}

async function runPressure(fixture, soakMs, log, profile) {
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
    { ...planSoak(soakMs, limited), operation: safeOperation }
  ];
  const pressure = await runStages(stages, {
    limits: STRESS_LIMITS,
    onStageComplete: stage => {
      log.push({ event: 'stage-complete', at: nowIso(), ...stage, ...sampleCoverage(stage) });
    }
  });

  return assessCompletedPressure(pressure, fixture, profile);
}

export async function assessCompletedPressure(pressure, fixture, profile) {
  const stageNames = pressure.results.map(stage => stage.name);
  const limited = profile === 'limited-beta';
  const expectedStageNames = limited
    ? ['baseline', 'ramp-1', 'ramp-2', 'ramp-4', 'burst', 'recovery', 'soak']
    : ['baseline', 'ramp-1', 'ramp-4', 'ramp-8', 'ramp-16', 'ramp-32', 'burst', 'recovery', 'soak'];
  if (pressure.stopped) {
    const stopped = pressure.results.find(stage => !stage.stageCompleted);
    throw new Error(`pressure must not stop early (${stopped?.name ?? 'stage budget'}: ${stopped?.stopReason ?? 'no further stage fits'})`);
  }
  assert.deepEqual(stageNames, expectedStageNames, 'all pressure stages must complete in order');
  const sampleFailures = [];
  for (const stage of pressure.results) {
    assert.equal(stage.stageCompleted, true, `stage ${stage.name} did not complete safely`);
    Object.assign(stage, sampleCoverage(stage));
    if (stage.stats.requests < stage.sampleFloor) {
      sampleFailures.push(`stage ${stage.name} sample count too low (${stage.stats.requests}/${stage.plannedRequests}, floor ${stage.sampleFloor})`);
    }
  }
  const readP95Values = [];
  const missingKinds = [];
  for (const kind of ['list', 'sidebar', 'search', 'account', 'detail']) {
    const values = pressure.results.map(stage => stage.byKind[kind]?.latencyMs?.p95).filter(Number.isFinite);
    if (!values.length) missingKinds.push(kind);
    readP95Values.push(...values);
  }
  const readP95 = missingKinds.length ? null : Math.max(...readP95Values);
  const readSlo = { ...assessSlo(readP95, { nominalMs: 2_000 }), missingKinds };
  const authStartedAt = Date.now();
  const authResults = [];
  for (let i = 0; i < 5; i++) {
    const result = await fixture.client('/api/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: fixture.syntheticEmail, password: fixture.password })
    });
    authResults.push(result);
    if (result.status !== 200 || result.code !== 200 || Number(result.json?.code) !== 200 || !result.json?.data?.token) {
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
  return { pressure, slo, sampleFailures };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = nowIso();
  const reportSha = currentGitSha();
  let testedWorker = { mode: 'source-checkout', sourceSha: reportSha };
  const log = [];
  let cleanupVerified = false;
  let stackCompleted = false;
  let observedStack = null;
  let runtimeBeforeShutdown = null;
  let egressConfigured = false;
  let reportPath = null;
  let report;
  try {
    const archive = process.env.EPOMAIL_CANDIDATE_DIR;
    if (archive) {
      testedWorker = { mode: 'extracted-archive', sourceSha: null };
      const sourceSha = (await fs.readFile(path.join(archive, 'SOURCE_SHA'), 'utf8')).trim();
      assert.match(sourceSha, /^[a-f0-9]{40}$/);
      const bundle = await fs.readFile(path.join(archive, 'bundle/index.js'));
      testedWorker = { mode: 'extracted-archive', sourceSha, bundleSha256: crypto.createHash('sha256').update(bundle).digest('hex') };
    }
    await withLocalStack(async stack => {
      observedStack = stack;
      stack.addCleanup(() => { runtimeBeforeShutdown = stack.runtimeStatus(); });
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
        gitSha: reportSha, testedWorker,
        environment: { localOnly: true, host: '127.0.0.1', egressBlockedByHarness: egressConfigured, providerCalls: 'not-measured', browser: false, deployment: false },
        limits: STRESS_LIMITS,
        configuration: { soakMs: args.soakMs, profile: args.profile },
        stages: result.pressure.results,
        sampleFailures: result.sampleFailures,
        slo: result.slo,
        log,
        cleanup: { processTreeStopped: 'pending', temporaryDirectoryRemoved: 'pending' }
      };
      // Preserve the measured SLOs and every failed floor in the failure report.
      if (report.sampleFailures.length) throw new Error(report.sampleFailures.join('; '));
      stackCompleted = true;
    });
    cleanupVerified = true;
    report.cleanup = { processTreeStopped: true, temporaryDirectoryRemoved: true };
    report.finishedAt = nowIso();
    report.runtimeBeforeShutdown = runtimeBeforeShutdown;
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
      gitSha: reportSha, testedWorker,
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
    report.runtimeBeforeShutdown = runtimeBeforeShutdown;
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

const directEntry = import.meta.main ?? (process.argv[1] &&
  (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
   await fs.realpath(process.argv[1]).catch(() => null) === fileURLToPath(import.meta.url)));
if (directEntry) {
  try {
    await main();
  } catch (error) {
    console.error(`backend stress FAIL: ${redactText(error.message)}`);
    process.exitCode = 1;
  }
}
