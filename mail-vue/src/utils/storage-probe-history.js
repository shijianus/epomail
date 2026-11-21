const names = ['kv', 'd1', 'byo', 'orphans', 'deletionQueue', 'inboundRawCleanup', 's3', 'engine', 'settings'];

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

export function retainStorageProbeTimes(report, identity, storage) {
  if (!report?.probes || !/^\d+$/.test(String(identity?.userId)) ||
      typeof identity?.sessionId !== 'string' || !/^[\w-]{1,100}$/.test(identity.sessionId)) return report;
  const key = 'epo_probe_times:' + identity.userId + ':' + identity.sessionId;
  let cached;
  try {
    storage ??= globalThis.sessionStorage;
    cached = JSON.parse(storage?.getItem(key) || '{}');
  } catch { /* Scan remains available if session storage is blocked. */ }
  const saved = {};
  const probes = { ...report.probes };
  for (const name of names) {
    if (!probes[name]) continue;
    const previous = timestamp(cached?.[name]);
    const current = timestamp(probes[name].lastSuccessAt);
    const latest = previous && (!current || previous > current) ? previous : current;
    if (latest) saved[name] = latest;
    probes[name] = { ...probes[name], lastSuccessAt: latest };
  }
  try { storage?.setItem(key, JSON.stringify(saved)); } catch { /* Optional tab fallback. */ }
  return { ...report, probes };
}
