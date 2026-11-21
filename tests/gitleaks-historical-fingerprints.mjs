import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import workflows from '../scripts/lib/release-workflows.cjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const hashes = {
  commit: 'de5d15077972c7c70778aea66777a6cd7a766857',
  file: 'mail-worker/src/service/oauth-app-service.js',
  rule: 'generic-api-key', lines: [44, 45], end: 45
};
const example = {
  commit: '9fd02b75dcaa31e1c12c2424b3b9c52b19eab203',
  file: 'mail-vue/src/views/oauth-app/index.vue',
  rule: 'curl-auth-header', lines: [619], end: 620
};

test('release and new branches scan all refs; existing feature branches scan their full push', () => {
  const before = hashes.commit;
  const after = example.commit;
  for (const branch of ['main', 'master', 'release/beta', 'release/2026/candidate']) {
    assert.equal(workflows.gitleaksPushRange(branch, before, after), '--all');
  }
  for (const branch of ['fix/public-beta', 'review/release/example']) {
    assert.equal(workflows.gitleaksPushRange(branch, before, after), before + '..' + after);
    assert.equal(workflows.gitleaksPushRange(branch, '0'.repeat(40), after), '--all');
    assert.equal(workflows.gitleaksPushRange(branch, '', after), '--all');
  }
});

test('Gitleaks exceptions match only the reviewed historical occurrences', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'epo-gitleaks-'));
  const report = join(temp, 'findings.json');
  const ignore = join(root, '.gitleaksignore');
  const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trimEnd();
  async function scan(cwd, range, ignoreFile, expectedStatus) {
    const args = ['git', '--no-banner', '--redact=100', '--log-opts', range, '--report-path', report, '--report-format', 'json'];
    if (ignoreFile) args.push('--gitleaks-ignore-path', ignoreFile);
    const result = spawnSync('gitleaks', args, { cwd, stdio: 'ignore' });
    assert.equal(result.status, expectedStatus, 'unexpected Gitleaks exit status');
    return JSON.parse(await readFile(report, 'utf8')).map(row => row.Fingerprint).sort();
  }
  const fingerprints = (entry, commit) => entry.lines.map(line => [commit, entry.file, entry.rule, line].join(':'));
  try {
    // A bare local clone has no working-tree ignore file of its own.
    const history = join(temp, 'history.git');
    git(temp, ['clone', '--bare', '--shared', '--quiet', root, history]);
    const repo = join(temp, 'new-commit');
    await mkdir(repo);
    git(repo, ['init', '--quiet']);
    for (const entry of [hashes, example]) {
      const range = `${entry.commit}^..${entry.commit}`;
      assert.deepEqual(await scan(history, range, null, 1), fingerprints(entry, entry.commit));
      assert.deepEqual(await scan(history, range, ignore, 0), []);
      const source = git(root, ['show', entry.commit + ':' + entry.file]);
      const start = entry.lines[0] - 1;
      const lines = source.split('\n').slice(start, entry.end);
      if (entry === hashes) {
        assert.ok(lines.every(line => /^const LEGACY_(SAMPLE|IMAGE)_SECRET_SHA256 = '[a-f0-9]{64}';$/.test(line)));
        assert.ok(source.includes('LEGACY_SECRET_HASHES.has(await sha256Hex(row.client_secret))'));
      } else {
        const sample = lines.join('\n').match(/Bearer\s+([a-z_-]+)"/i)?.[1];
        assert.ok(sample && /^epo[_-]access[_-]token[_-](here|demo|test)$/.test(sample));
        const provider = git(root, ['show', entry.commit + ':mail-worker/src/service/oauth-provider-service.js']);
        const verifier = git(root, ['show', entry.commit + ':mail-worker/src/utils/jwt-utils.js']);
        assert.ok(provider.includes('const accessToken = await jwtUtils.generateToken('));
        assert.ok(verifier.includes("token.split('.')") && verifier.includes('!headerB64 || !payloadB64 || !signatureB64'));
      }
      // Reintroducing the same bytes at the same path/lines in a new commit must alert.
      await mkdir(join(repo, dirname(entry.file)), { recursive: true });
      await writeFile(join(repo, entry.file), '\n'.repeat(start) + lines.join('\n') + '\n');
    }
    git(repo, ['add', '.']);
    git(repo, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '-qm', 'reintroduce reviewed examples']);
    const newCommit = git(repo, ['rev-parse', 'HEAD']);
    const expected = [hashes, example].flatMap(entry => fingerprints(entry, newCommit)).sort();
    assert.deepEqual(await scan(repo, 'HEAD', ignore, 1), expected);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
