// Imported only by the disposable local diagnostics entry. Never record SQL,
// bound parameters, keys, bodies, identities or headers in the measurements.
const now = () => performance.now();
export function observeD1(db, counts) {
  const native = new WeakMap();
  async function execute(statementCount, call, shape) {
    counts.d1Calls++;
    counts.statements += statementCount;
    const start = now();
    try {
      const result = await call();
      const entries = shape === 'batch' ? result : [result];
      if (shape === 'batch' || shape === 'result') {
        for (const entry of entries) {
          if (Number.isFinite(entry?.meta?.rows_read) && Number.isFinite(entry?.meta?.rows_written)) {
            counts.rowsRead += entry.meta.rows_read;
            counts.rowsWritten += entry.meta.rows_written;
            counts.statementsWithRowCounts++;
          }
        }
      }
      return result;
    } finally { counts.d1WaitMs += now() - start; }
  }
  function statement(stmt) {
    const wrapped = {
      bind: (...args) => statement(stmt.bind(...args)),
      run: (...args) => execute(1, () => stmt.run(...args), 'result'),
      all: (...args) => execute(1, () => stmt.all(...args), 'result'),
      // These methods return transformed values without D1's metadata. Keep
      // their original operation and expose the coverage of row counts.
      first: (...args) => execute(1, () => stmt.first(...args), 'value'),
      raw: (...args) => execute(1, () => stmt.raw(...args), 'value')
    };
    native.set(wrapped, stmt);
    return wrapped;
  }
  const measured = {
    prepare: sql => statement(db.prepare(sql)),
    batch: stmts => execute(stmts.length, () => db.batch(stmts.map(stmt => native.get(stmt) || stmt)), 'batch')
  };
  return new Proxy(db, {
    get(target, prop) {
      if (prop in measured) return measured[prop];
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function observeKV(kv, counts) {
  return new Proxy(kv, {
    get(target, prop) {
      const value = target[prop];
      if (typeof value !== 'function') return value;
      return async (...args) => {
        const start = now();
        if (prop === 'get' || prop === 'getWithMetadata' || prop === 'list') counts.kvReads++;
        if (prop === 'put' || prop === 'delete') counts.kvWrites++;
        try { return await value.apply(target, args); }
        finally { counts.kvWaitMs += now() - start; }
      };
    }
  });
}

export const diagnosticFields = ['handlerMs', 'd1Calls', 'statements', 'statementsWithRowCounts',
  'rowsRead', 'rowsWritten', 'd1WaitMs', 'kvReads', 'kvWrites', 'kvWaitMs'];

export function profileWorker(worker) {
  return {
    ...worker,
    async fetch(request, env, ctx) {
      if (request.headers.get('X-Local-Profile') !== '1') return worker.fetch(request, env, ctx);
      const counts = Object.fromEntries(diagnosticFields.map(field => [field, 0]));
      const measuredEnv = { ...env, db: observeD1(env.db, counts), kv: observeKV(env.kv, counts) };
      const start = now();
      const response = await worker.fetch(request, measuredEnv, ctx);
      counts.handlerMs = now() - start;
      const result = new Response(response.body, response);
      result.headers.set('X-Local-Profile', JSON.stringify(counts));
      return result;
    }
  };
}
