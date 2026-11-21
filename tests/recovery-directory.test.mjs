import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/create-recovery-dir.sh', import.meta.url));

test('recovery directories are private, unique and physically outside Git', t => {
  const root = mkdtempSync(join(tmpdir(), 'epomail-recovery-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'source');
  execFileSync('git', ['init', '--quiet', repo]);
  const subdir = join(repo, 'nested');
  mkdirSync(subdir);
  const alias = join(root, 'link-to-source');
  symlinkSync(subdir, alias);
  for (const path of [repo, subdir, alias, join(root, 'missing')]) {
    assert.notEqual(spawnSync('bash', [script, path]).status, 0);
  }
  assert.deepEqual(readdirSync(subdir), []);
  const backupRoot = join(root, 'private backups');
  mkdirSync(backupRoot);
  const allocate = () => execFileSync('bash', [script, backupRoot], { encoding: 'utf8' }).trim();
  const first = allocate();
  const second = allocate();
  assert.notEqual(first, second);
  for (const path of [first, second]) {
    assert.equal(dirname(path), realpathSync(backupRoot));
    assert.equal(statSync(path).mode & 0o777, 0o700);
  }
});
