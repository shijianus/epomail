import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise the actual Worker module graph, D1 and KV using the repository's locked dependencies.
const worker = fileURLToPath(new URL('../mail-worker/', import.meta.url));
const require = createRequire(new URL('../mail-worker/package.json', import.meta.url));
const runner = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const result = spawnSync(process.execPath, [runner, 'run', 'test/security-notice-contract.spec.js'], { cwd: worker, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
