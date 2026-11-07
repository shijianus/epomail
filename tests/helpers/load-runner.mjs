import { setTimeout as delay } from 'node:timers/promises';

export const HARD_LIMITS = Object.freeze({
  maxConcurrency: 32,
  maxRequestsPerStage: 10_000,
  maxStageMs: 300_000,
  maxTotalMs: 30 * 60 * 1000,
  requestTimeoutMs: 8_000,
  shutdownGraceMs: 1_000
});

const LOOPBACK_HOST = '127.0.0.1';
const TIMEOUT = Symbol('load-runner-timeout');

function integer(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer in [${min}, ${max}]`);
  }
  return value;
}

export function assertLoopbackBase(base) {
  if (typeof base !== 'string' || !base) throw new TypeError('local stack base is required');
  let url;
  try {
    url = new URL(base);
  } catch (error) {
    throw new TypeError('local stack base must be a valid URL', { cause: error });
  }
  if (
    url.protocol !== 'http:' ||
    url.hostname !== LOOPBACK_HOST ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('refusing non-loopback or non-generated local-stack target');
  }
  integer(Number(url.port), 'local stack port', { min: 1, max: 65535 });
  return url.origin;
}

function assertRelativePath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) {
    throw new Error('request path must be an absolute path on the generated local stack');
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(pathname)) {
    throw new Error('request path must not contain a URL scheme');
  }
}

function mergeSignals(signal, timeoutMs) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason || new Error('request aborted'));
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error('request timeout')), timeoutMs);
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  };
}

function isAbortLike(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR' || /timeout|aborted/i.test(String(error?.message || ''));
}

export function createLoopbackClient(base, {
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = HARD_LIMITS.requestTimeoutMs
} = {}) {
  const origin = assertLoopbackBase(base);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  integer(requestTimeoutMs, 'request timeout', { min: 1, max: HARD_LIMITS.requestTimeoutMs });

  const performRequest = async (pathname, options = {}) => {
    const url = new URL(pathname, `${origin}/`);
    if (url.origin !== origin || url.hostname !== LOOPBACK_HOST) {
      throw new Error('refusing request outside the generated local-stack origin');
    }
    const started = performance.now();
    const merged = mergeSignals(options.signal, requestTimeoutMs);
    try {
      const response = await fetchImpl(url.href, {
        ...options,
        signal: merged.signal,
        redirect: 'error'
      });
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      return {
        endpoint: pathname.split('?')[0],
        method: options.method || 'GET',
        status: response.status,
        code: Number.isFinite(Number(json?.code)) ? Number(json.code) : response.status,
        json,
        text,
        latencyMs: Math.max(0, performance.now() - started),
        timeout: false,
        transportError: false
      };
    } catch (error) {
      return {
        endpoint: pathname.split('?')[0],
        method: options.method || 'GET',
        status: null,
        code: null,
        json: null,
        text: '',
        latencyMs: Math.max(0, performance.now() - started),
        timeout: isAbortLike(error),
        transportError: !isAbortLike(error)
      };
    } finally {
      merged.cleanup();
    }
  };

  const request = (pathname, options = {}) => {
    assertRelativePath(pathname);
    return performRequest(pathname, options);
  };
  return Object.assign(request, { base: origin });
}

export function percentile(values, percentileRank) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const rank = Math.min(100, Math.max(0, Number(percentileRank)));
  const sorted = values.slice().sort((a, b) => a - b);
  const index = (rank / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return Number(sorted[lower].toFixed(2));
  return Number((sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)).toFixed(2));
}

function newStats() {
  return {
    startedAt: performance.now(),
    finishedAt: performance.now(),
    total: 0,
    success: 0,
    expected4xx: 0,
    unexpected4xx: 0,
    unexpected5xx: 0,
    contractFailure: 0,
    operationFailure: 0,
    abortedByFuse: 0,
    timeout: 0,
    transportError: 0,
    ignoredAbort: 0,
    diagnostics: [],
    latencies: [],
    statusCounts: new Map()
  };
}

export function summarizeStats(stats) {
  const elapsedMs = Math.max(0, stats.finishedAt - stats.startedAt);
  const requests = stats.total;
  return {
    requests,
    diagnostics: stats.diagnostics,
    success: stats.success,
    expected4xx: stats.expected4xx,
    unexpected4xx: stats.unexpected4xx,
    unexpected5xx: stats.unexpected5xx,
    contractFailure: stats.contractFailure,
    operationFailure: stats.operationFailure,
    timeout: stats.timeout,
    transportError: stats.transportError,
    ignoredAbort: stats.ignoredAbort,
    latencyMs: {
      count: stats.latencies.length,
      p50: percentile(stats.latencies, 50),
      p95: percentile(stats.latencies, 95),
      p99: percentile(stats.latencies, 99)
    },
    throughputPerSecond: elapsedMs > 0 ? Number((requests / (elapsedMs / 1000)).toFixed(2)) : 0,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    statusCounts: Object.fromEntries([...stats.statusCounts.entries()].sort((a, b) => a[0] - b[0]))
  };
}

function effectiveCode(result) {
  const code = Number(result?.code);
  if (Number.isFinite(code) && code > 0) return code;
  const status = Number(result?.status);
  return Number.isFinite(status) && status > 0 ? status : null;
}

function record(stats, result) {
  stats.total++;
  if (Number.isFinite(result?.latencyMs)) stats.latencies.push(result.latencyMs);
  const code = effectiveCode(result);
  if (code !== null) stats.statusCounts.set(code, (stats.statusCounts.get(code) || 0) + 1);
  if (result?.contractFailure) {
    stats.contractFailure++;
    if (stats.diagnostics.length < 5) stats.diagnostics.push({ kind: result.kind, endpoint: result.endpoint,
      status: result.status, code: result.code, detail: result.diagnostic || null });
  }
  if (result?.operationFailure) stats.operationFailure++;
  if (result?.ignoredAbort) stats.ignoredAbort++;
  if (result?.timeout) {
    stats.timeout++;
    return;
  }
  if (result?.transportError) {
    stats.transportError++;
    return;
  }
  // HTTP classification is deliberately independent from operation/contract
  // diagnostics, so a failed operation with a 4xx/5xx cannot hide that code.
  if (code !== null && code >= 200 && code < 300) {
    stats.success++;
    return;
  }
  if (code !== null && code >= 400 && code < 500) {
    if (result.expected4xx || result.expectedStatuses?.includes(code)) stats.expected4xx++;
    else stats.unexpected4xx++;
    return;
  }
  if (code !== null && code >= 500) {
    stats.unexpected5xx++;
    return;
  }
  stats.transportError++;
}

function validateLimits(limits = HARD_LIMITS) {
  const hard = { ...HARD_LIMITS, ...limits };
  integer(hard.maxConcurrency, 'max concurrency', { min: 1, max: HARD_LIMITS.maxConcurrency });
  integer(hard.maxRequestsPerStage, 'max requests per stage', { min: 1, max: HARD_LIMITS.maxRequestsPerStage });
  integer(hard.maxStageMs, 'max stage duration', { min: 1, max: HARD_LIMITS.maxStageMs });
  integer(hard.maxTotalMs, 'max total duration', { min: 1, max: HARD_LIMITS.maxTotalMs });
  integer(hard.requestTimeoutMs, 'request timeout', { min: 1, max: HARD_LIMITS.requestTimeoutMs });
  integer(hard.shutdownGraceMs, 'shutdown grace', { min: 0, max: 10_000 });
  return hard;
}

async function operationWithDeadline(operation, context, timeoutMs, shutdownGraceMs) {
  let timer;
  let abortHandler;
  const operationPromise = Promise.resolve().then(() => operation(context));
  operationPromise.catch(() => {});
  const abortPromise = new Promise(resolve => {
    abortHandler = () => resolve({ value: TIMEOUT, timedOut: false, aborted: true });
    if (context.signal?.aborted) abortHandler();
    else context.signal?.addEventListener('abort', abortHandler, { once: true });
  });
  try {
    const outcome = await Promise.race([
      operationPromise.then(value => ({ value, timedOut: false, aborted: false })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ value: TIMEOUT, timedOut: true, aborted: false }), timeoutMs); }),
      abortPromise
    ]);
    if (!outcome.timedOut && !outcome.aborted) return { value: outcome.value, timedOut: false, aborted: false, ignoredAbort: false };
    const settled = await Promise.race([
      operationPromise.then(() => true, () => true),
      delay(shutdownGraceMs).then(() => false)
    ]);
    return { value: TIMEOUT, timedOut: outcome.timedOut, aborted: outcome.aborted, ignoredAbort: !settled };
  } finally {
    clearTimeout(timer);
    context.signal?.removeEventListener('abort', abortHandler);
  }
}

/**
 * Run a paced bounded stage. The stage deadline stops new dispatches only;
 * already-dispatched requests get their own request timeout and are drained.
 * Only a genuine request timeout or transport error aborts the shared signal.
 */
export async function runStage({
  name,
  concurrency,
  durationMs,
  maxRequests,
  ratePerSecond = Math.max(1, concurrency * 4),
  operation,
  limits = HARD_LIMITS,
  stopOnUnexpectedStatus = true,
  onComplete
}) {
  const hard = validateLimits(limits);
  if (typeof name !== 'string' || !name) throw new TypeError('stage name is required');
  integer(concurrency, 'stage concurrency', { min: 1, max: hard.maxConcurrency });
  integer(durationMs, 'stage duration', { min: 1, max: hard.maxStageMs });
  integer(maxRequests, 'stage request limit', { min: 1, max: hard.maxRequestsPerStage });
  if (!Number.isFinite(ratePerSecond) || ratePerSecond <= 0 || ratePerSecond > 1000) throw new RangeError('stage rate must be in (0, 1000] requests/sec');
  if (typeof operation !== 'function') throw new TypeError('stage operation is required');

  const startedAt = Date.now();
  const scheduleStarted = performance.now();
  const deadline = startedAt + durationMs;
  const controller = new AbortController();
  const stats = newStats();
  const groups = new Map();
  const active = new Set();
  let nextRequest = 0;
  let scheduling = true;
  let stopReason = 'stage_deadline';
  let timedOut = false;

  const groupFor = kind => {
    const key = typeof kind === 'string' && kind ? kind : 'unknown';
    if (!groups.has(key)) groups.set(key, newStats());
    return groups.get(key);
  };
  const stopScheduling = reason => {
    if (scheduling || reason === 'request_timeout' || reason === 'transport_error') {
      scheduling = false;
      stopReason = reason;
    }
  };
  const hardStop = reason => {
    stopScheduling(reason);
    if (!controller.signal.aborted) controller.abort(new Error(`stage stopped: ${reason}`));
  };
  const timer = setTimeout(() => stopScheduling('stage_deadline'), durationMs);

  const runOne = async (workerId, requestNumber) => {
    const context = { stageName: name, workerId, requestNumber, signal: controller.signal };
    let result;
    try {
      result = await operationWithDeadline(operation, context, hard.requestTimeoutMs, hard.shutdownGraceMs);
      if (result.timedOut) {
        timedOut = true;
        result = { timeout: true, transportError: false, ignoredAbort: result.ignoredAbort, latencyMs: hard.requestTimeoutMs };
        hardStop('request_timeout');
      } else {
        result = result.value;
      }
    } catch (_) {
      result = { timeout: false, transportError: true, latencyMs: 0 };
      hardStop('transport_error');
    }
    if (!result || typeof result !== 'object') result = { timeout: false, transportError: true, latencyMs: 0 };
    record(stats, result);
    record(groupFor(result.kind), result);
    if (result.timeout) {
      timedOut = true;
      hardStop('request_timeout');
    } else if (result.transportError) {
      hardStop('transport_error');
    } else if (stopOnUnexpectedStatus && (result.contractFailure || result.unexpected4xx || result.unexpected5xx || (effectiveCode(result) >= 400 && !result.expected4xx))) {
      stopScheduling('unexpected_status');
    }
  };

  while (scheduling && !controller.signal.aborted) {
    if (nextRequest >= maxRequests) {
      stopScheduling('request_limit');
      break;
    }
    if (Date.now() >= deadline) {
      stopScheduling('stage_deadline');
      break;
    }
    if (active.size >= concurrency) {
      await Promise.race(active);
      continue;
    }
    const scheduledAt = scheduleStarted + (nextRequest * 1000 / ratePerSecond);
    const waitMs = scheduledAt - performance.now();
    if (waitMs > 0) await delay(waitMs);
    if (!scheduling || controller.signal.aborted || Date.now() >= deadline) {
      stopScheduling('stage_deadline');
      break;
    }
    const requestNumber = nextRequest++;
    const workerId = requestNumber % concurrency;
    const promise = runOne(workerId, requestNumber);
    active.add(promise);
    promise.finally(() => active.delete(promise)).catch(() => {});
  }

  if (scheduling) stopScheduling(nextRequest >= maxRequests ? 'request_limit' : 'stage_deadline');
  await Promise.all(active);
  clearTimeout(timer);
  stats.finishedAt = performance.now();
  for (const group of groups.values()) group.finishedAt = stats.finishedAt;
  const finishedAt = Date.now();
  const drainMs = Math.max(0, finishedAt - deadline);
  const stageCompleted = (stopReason === 'stage_deadline' || stopReason === 'request_limit') &&
    !timedOut && stats.transportError === 0 && stats.operationFailure === 0 && stats.contractFailure === 0 &&
    stats.unexpected4xx === 0 && stats.unexpected5xx === 0;
  const result = {
    name,
    concurrency,
    ratePerSecond,
    durationMs,
    maxRequests,
    startedAt,
    finishedAt,
    elapsedMs: finishedAt - startedAt,
    drainMs,
    stageCompleted,
    scheduledRequests: stats.total,
    ignoredAbort: stats.ignoredAbort,
    stopReason,
    timedOut,
    timedOutRequests: stats.timeout,
    stats: summarizeStats(stats),
    byKind: Object.fromEntries([...groups.entries()].map(([kind, group]) => [kind, summarizeStats(group)]))
  };
  if (typeof onComplete === 'function') await onComplete(result);
  return result;
}

export async function runStages(stages, { limits = HARD_LIMITS, onStageComplete } = {}) {
  if (!Array.isArray(stages) || stages.length === 0) throw new TypeError('at least one stage is required');
  const hard = validateLimits(limits);
  const startedAt = Date.now();
  const totalDeadline = startedAt + hard.maxTotalMs;
  const results = [];
  let stopped = false;
  for (const stage of stages) {
    const remaining = totalDeadline - Date.now();
    if (remaining <= 0) {
      stopped = true;
      break;
    }
    const result = await runStage({
      ...stage,
      durationMs: Math.min(stage.durationMs, hard.maxStageMs, remaining),
      limits: hard,
      onComplete: onStageComplete
    });
    results.push(result);
    if (result.timedOut || result.stopReason === 'transport_error' || result.stats.unexpected4xx || result.stats.unexpected5xx || result.stats.contractFailure || !result.stageCompleted) {
      stopped = true;
      break;
    }
  }
  return { startedAt, finishedAt: Date.now(), stopped, results };
}

export function assessSlo(p95, { nominalMs }) {
  integer(nominalMs, 'nominal SLO', { min: 1, max: HARD_LIMITS.requestTimeoutMs });
  if (!Number.isFinite(p95)) return { status: 'unavailable', pass: false, p95: null, thresholdMs: nominalMs };
  if (p95 <= nominalMs) return { status: 'pass', pass: true, p95, thresholdMs: nominalMs };
  return { status: 'fail', pass: false, p95, thresholdMs: nominalMs };
}
