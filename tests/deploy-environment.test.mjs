import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { candidateConfig } from '../scripts/candidate-config.mjs';

const workerDir = fileURLToPath(new URL('../mail-worker', import.meta.url));
const requireWorker = createRequire(new URL('../mail-worker/package.json', import.meta.url));
const { experimental_readRawConfig } = requireWorker('wrangler');
const source = readFileSync(path.join(workerDir, 'wrangler.toml'), 'utf8');
const pkg = JSON.parse(readFileSync(path.join(workerDir, 'package.json'), 'utf8'));

test('default npm deploy fails locally and tells the operator to select an environment', () => {
  const result = spawnSync('npm', ['run', 'deploy'], { cwd: workerDir, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /deploy:staging.*deploy:prod/);
  assert.match(pkg.scripts['deploy:staging'], /wrangler deploy --env staging$/);
  assert.match(pkg.scripts['deploy:prod'], /wrangler deploy --env production$/);
});

test('source and packaged configurations have no default target and preserve explicit production bindings', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'epomail-deploy-guard-'));
  try {
    for (const [label, content] of [['source', source], ['candidate', candidateConfig(source)]]) {
      const file = path.join(directory, 'wrangler.toml');
      writeFileSync(file, content);
      const { rawConfig } = experimental_readRawConfig({ config: file });
      for (const key of ['main', 'assets', 'vars', 'd1_databases', 'kv_namespaces', 'triggers', 'route', 'routes']) {
        assert.equal(rawConfig[key], undefined, `${label}: default ${key}`);
      }
      assert.equal(rawConfig.workers_dev, false);
      assert.equal(rawConfig.env.production.name, 'epomail');
      assert.equal(rawConfig.env.production.vars.ENVIRONMENT, 'production');
      assert.equal(rawConfig.env.production.d1_databases.length, 3);
      assert.equal(rawConfig.env.production.kv_namespaces.length, 1);
      for (const name of ['production', 'staging']) {
        assert.equal(rawConfig.env[name].main, label === 'source' ? 'src/index.js' : 'bundle/index.js');
      }
    }
    const result = spawnSync(process.execPath, [path.join(workerDir, 'node_modules/wrangler/bin/wrangler.js'),
      'deploy', '--dry-run', '--config', path.join(directory, 'wrangler.toml')], {
      encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr + result.stdout, /Missing entry-point|Missing entry point/i);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
