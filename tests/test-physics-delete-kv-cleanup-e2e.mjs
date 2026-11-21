// Install the locked mail-worker dev dependencies before running this entry point.
// The suite exercises the production services against isolated workerd D1 and KV.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../mail-worker/', import.meta.url));
const cli = fileURLToPath(new URL('../mail-worker/node_modules/vitest/vitest.mjs', import.meta.url));
const result = spawnSync(process.execPath, [cli, 'run', 'test/privacy-closure.spec.js'], { cwd, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
