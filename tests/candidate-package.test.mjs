import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../scripts/package-candidate.mjs', import.meta.url));
function write(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, value);
}
function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.email=fixture@localhost', '-c', 'user.name=Fixture', '-c', 'commit.gpgSign=false', ...args], { cwd, encoding: 'utf8' }).trim();
}
function fixture(t) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'epomail-freeze-test-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const repo = path.join(tmp, 'source');
  write(path.join(repo, '.gitignore'), 'mail-worker/dist/\n');
  write(path.join(repo, 'mail-worker/wrangler.toml'), 'main = "src/index.js"\n');
  write(path.join(repo, 'mail-worker/src/index.js'), 'export default {};\n');
  write(path.join(repo, 'mail-vue/public/_headers'), '/assets/*\n');
  write(path.join(repo, 'temp_login_ui/public/logo.svg'), '<svg/>');
  git(repo, 'init', '-q');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'fixture');
  return { tmp, repo, sha: git(repo, 'rev-parse', 'HEAD') };
}
function build(repo, raw) {
  const dist = path.join(repo, 'mail-worker/dist');
  for (const prefix of ['', 'login/']) {
    write(path.join(dist, prefix, 'index.html'), '<html></html>');
    write(path.join(dist, prefix, 'assets/index-abcdefgh.js'), 'export default {};');
    write(path.join(dist, prefix, '.vite/manifest.json'), JSON.stringify({ 'index.html': { isEntry: true, file: 'assets/index-abcdefgh.js' } }));
  }
  for (const name of ['sw.js', 'registerSW.js', 'manifest.webmanifest']) write(path.join(dist, name), '');
  write(path.join(dist, '_headers'), '/assets/*\n');
  write(path.join(dist, 'login/logo.svg'), '<svg/>');
  write(path.join(raw, 'index.js'), 'export default {};');
  write(path.join(raw, 'README.md'), raw);
  write(path.join(raw, 'index.js.map'), JSON.stringify({ version: 3, sourceRoot: raw,
    sources: [path.relative(raw, path.join(repo, 'mail-worker/src/index.js'))], sourcesContent: ['export default {};'] }));
}
function pack(repo, worker, dest, sha) {
  return spawnSync(process.execPath, [script, worker, dest, sha], { cwd: repo, encoding: 'utf8' });
}

test('real packer produces identical bytes across checkouts, file modes, clock and output paths', t => {
  const { tmp, repo, sha } = fixture(t);
  const second = path.join(tmp, 'other', 'long-checkout-name');
  git(repo, 'clone', '-q', repo, second);
  const hashes = [repo, second].map((checkout, i) => {
    const raw = path.join(tmp, 'worker-output-' + i), dest = path.join(tmp, 'result-' + i);
    build(checkout, raw);
    const index = path.join(raw, 'index.js');
    chmodSync(index, i ? 0o755 : 0o644);
    utimesSync(index, 100 + i, 100 + i);
    const run = pack(checkout, raw, dest, sha);
    assert.equal(run.status, 0, run.stderr);
    const archive = path.join(dest, 'epomail-candidate.tar.gz');
    const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
    assert.equal(readFileSync(archive + '.sha256', 'utf8'), digest + '  epomail-candidate.tar.gz\n');
    assert.equal(execFileSync('tar', ['-xOzf', archive, './SOURCE_SHA'], { encoding: 'utf8' }).trim(), sha);
    const map = JSON.parse(execFileSync('tar', ['-xOzf', archive, './bundle/index.js.map']));
    assert.deepEqual(map.sources, ['mail-worker/src/index.js']);
    assert.equal(map.sourceRoot, '');
    assert.doesNotMatch(execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }), /README\.md|\.vite/);
    assert.notEqual(pack(checkout, raw, dest, sha).status, 0);
    return digest;
  });
  assert.equal(hashes[0], hashes[1]);
});

test('candidate rejects extra assets, unexpected Worker outputs, symlinks and an incorrect SHA before publishing', t => {
  const { tmp, repo, sha } = fixture(t);
  const raw = path.join(tmp, 'raw'), dest = path.join(tmp, 'candidate'), dist = path.join(repo, 'mail-worker/dist');
  build(repo, raw);
  for (const [file, link] of [[path.join(dist, '.env'), false], [path.join(dist, 'assets', 'unexpected-abcdefgh.js'), false],
    [path.join(raw, 'extra.key'), false], [path.join(dist, 'assets', 'extra.css'), true]]) {
    if (link) symlinkSync(path.join(raw, 'index.js'), file);
    else write(file, 'fixture');
    assert.notEqual(pack(repo, raw, dest, sha).status, 0);
    assert.equal(existsSync(dest), false);
    rmSync(file);
  }
  assert.notEqual(pack(repo, raw, dest, '0'.repeat(40)).status, 0);
  assert.equal(existsSync(dest), false);
});
