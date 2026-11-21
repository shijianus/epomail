import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspectStagedChanges, validateStagedFile } from '../scripts/check-staged-files.mjs';

const baseline = () => ({
  description: 'Reviewed synthetic historical fixture',
  allow: [{ rule: 'hardcoded_jwt_key', fingerprint: '736340e6842adca3', path: 'tests/helpers/local-stack.test.mjs', reason: 'Synthetic isolation input; never used for authentication.' }]
});

test('public release config allows documented keys only', () => {
  assert.equal(validateStagedFile('mail-vue/.env.release', "VITE_BASE_URL='/api'\nVITE_PWA_NAME='Mail'\n"), null);
  for (const source of ['jwt_secret=fixture\n', 'VITE_PRIVATE_KEY=fixture\n', 'VITE_BASE_URL=/api\nVITE_BASE_URL=/other\n', 'malformed']) {
    assert.ok(validateStagedFile('mail-vue/.env.release', source));
  }
});

test('private environment files and credential dumps remain blocked', () => {
  for (const file of ['.env', '.env.local', 'mail-worker/.dev.vars', 'nested/credentials.json', 'some private/.env', 'my-secret.json', 'nested/.secret-scan-baseline.json']) {
    assert.ok(validateStagedFile(file, '{}'), file);
  }
});

test('dev.vars.example template is committable but never a credential carrier', () => {
  // 与 .gitignore 的 !.dev.vars.example 白名单对齐：占位模板必须可持续维护
  assert.equal(validateStagedFile('mail-worker/.dev.vars.example', 'jwt_secret=<your-strong-random-secret>\n'), null);
  // 模板路径变体不得打开豁免口子
  for (const file of ['mail-worker/.dev.vars', 'mail-worker/.dev.vars.local', 'nested/mail-worker/.dev.vars.example/real']) {
    assert.ok(validateStagedFile(file, '{}'), file);
  }
  // 内容层防护不在本函数职责内：模板正文的凭据由 scan-staged-secrets 与
  // inspectStagedChanges 的 staged-additions 扫描拦截（见下方 index inspection 用例）。
});

test('only the root baseline accepts reviewed fingerprint metadata', () => {
  assert.equal(validateStagedFile('.secret-scan-baseline.json', JSON.stringify(baseline())), null);
  const noPath = baseline();
  delete noPath.allow[0].path;
  assert.equal(validateStagedFile('.secret-scan-baseline.json', JSON.stringify(noPath)), null);
});

test('baseline rejects malformed schema and credential value fields', () => {
  for (const input of ['{', 'null', '[]', '{}', '{"description":"review","allow":{}}']) {
    assert.ok(validateStagedFile('.secret-scan-baseline.json', input));
  }
  for (const key of ['value', 'secret', 'token', 'password']) {
    const data = baseline();
    data.allow[0][key] = 'synthetic-fixture';
    assert.ok(validateStagedFile('.secret-scan-baseline.json', JSON.stringify(data)), key);
  }
  const extra = baseline();
  extra.value = 'synthetic-fixture';
  assert.ok(validateStagedFile('.secret-scan-baseline.json', JSON.stringify(extra)));
});

test('baseline rejects unbounded or malformed fingerprints and paths', () => {
  for (const update of [{ fingerprint: '' }, { fingerprint: 'x'.repeat(16) }, { fingerprint: 42 }, { rule: '*' }, { reason: '' }, { path: '' }, { path: '../test' }, { path: 'tests/*' }]) {
    const data = baseline();
    Object.assign(data.allow[0], update);
    assert.ok(validateStagedFile('.secret-scan-baseline.json', JSON.stringify(data)));
  }
});

test('provider literals remain blocked even inside public configuration or baseline reasons', () => {
  const synthetic = 'sk-' + 'A'.repeat(28);
  assert.ok(validateStagedFile('mail-vue/.env.release', `VITE_APP_TITLE='${synthetic}'`));
  const data = baseline();
  data.allow[0].reason = synthetic;
  assert.ok(validateStagedFile('.secret-scan-baseline.json', JSON.stringify(data)));
});

test('index inspection uses staged content, not unstaged replacement', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'epomail-index-check-'));
  const git = args => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git(['init', '--quiet']);
    await fs.mkdir(path.join(directory, 'mail-vue'));
    const file = path.join(directory, 'mail-vue/.env.release');
    await fs.writeFile(file, 'jwt_secret=fixture\n');
    git(['add', '.']);
    await fs.writeFile(file, 'VITE_BASE_URL=/api\n');
    assert.ok(inspectStagedChanges(directory).some(f => f.includes('documented public')));
    git(['add', '.']);
    assert.deepEqual(inspectStagedChanges(directory), []);
    await fs.mkdir(path.join(directory, 'space directory'));
    await fs.writeFile(path.join(directory, 'space directory/credentials.json'), '{}');
    git(['add', '.']);
    assert.ok(inspectStagedChanges(directory).some(f => f.startsWith('space directory/credentials.json:')));
  } finally {
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('index inspection rejects provider credentials in ordinary source additions', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'epomail-index-check-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: directory, stdio: 'pipe' });
    await fs.writeFile(path.join(directory, 'example.js'), `const value = '${'sk-' + 'B'.repeat(28)}';\n`);
    execFileSync('git', ['add', '.'], { cwd: directory, stdio: 'pipe' });
    assert.ok(inspectStagedChanges(directory).some(f => f.includes('provider credential detected')));
  } finally {
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
