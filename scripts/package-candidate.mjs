// Build a canonical release archive from a clean checkout and its Wrangler dry-run.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { candidateConfig } from './candidate-config.mjs';

const [worker, output, expectedSha] = process.argv.slice(2);
if (!worker || !output || !/^[0-9a-f]{40}$/.test(expectedSha ?? '')) {
  throw new Error('Usage from repository root: node scripts/package-candidate.mjs <wrangler-outdir> <new-output-directory> <commit-sha>');
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const root = git('rev-parse', '--show-toplevel').trim();
const dist = path.join(root, 'mail-worker/dist');
const dest = path.resolve(output);
function verifyCheckout() {
  if (git('rev-parse', 'HEAD').trim() !== expectedSha || git('status', '--porcelain', '-z')) {
    throw new Error('Candidate requires the exact clean Git checkout');
  }
}
function regularTree(directory) {
  if (!lstatSync(directory).isDirectory()) throw new Error('Expected a build directory');
  const result = [];
  function walk(prefix) {
    for (const entry of readdirSync(path.join(directory, prefix), { withFileTypes: true })) {
      const name = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) result.push(name);
      else throw new Error('Unexpected link or special file in build output');
    }
  }
  walk('');
  return result;
}
function canonicalMap(filename) {
  const map = JSON.parse(readFileSync(filename, 'utf8'));
  const sourceBase = path.resolve(path.dirname(path.resolve(filename)), map.sourceRoot || '');
  map.sources = map.sources.map(source => {
    if (/^https?:\/\//.test(source)) {
      const url = new URL(source);
      if (url.username || url.password || url.search) throw new Error('Unexpected credentials or query in source-map URL');
      return source;
    }
    if (/^[a-z][\w+.-]*:/i.test(source)) throw new Error('Unexpected source-map URL scheme');
    const relative = path.relative(root, path.resolve(sourceBase, source));
    if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
      throw new Error('Worker source map refers outside the candidate checkout');
    }
    return relative.split(path.sep).join('/');
  });
  if (map.file) map.file = path.basename(map.file);
  map.sourceRoot = '';
  return JSON.stringify(map) + '\n';
}
function staticInputs() {
  const expected = new Set(['index.html', 'login/index.html', 'manifest.webmanifest', 'registerSW.js', 'sw.js']);
  for (const match of readFileSync(path.join(dist, 'sw.js'), 'utf8').matchAll(/\b(workbox-[a-f0-9]{8})\b/g)) expected.add(match[1] + '.js');
  const manifests = new Set();
  for (const [source, prefix] of [['mail-vue/public/', ''], ['temp_login_ui/public/', 'login/']]) {
    const manifest = prefix + '.vite/manifest.json';
    manifests.add(manifest);
    const document = JSON.parse(readFileSync(path.join(dist, manifest), 'utf8'));
    if (!document['index.html']?.isEntry) throw new Error('Missing Vite entry in ' + manifest);
    for (const item of Object.values(document)) {
      for (const file of [item.file, ...(item.assets || []), ...(item.css || [])]) {
        if (expected.has(prefix + file)) continue;
        if (!/^assets\/[\w.-]+\.(?:js|css|svg|png|webp|gif|jpe?g|avif|woff2?|ttf|otf|ico|wasm)$/i.test(file)) {
          throw new Error('Unexpected generated asset in ' + manifest);
        }
        expected.add(prefix + file);
      }
    }
    for (const tracked of git('ls-files', '-z', '--', source).split('\0').filter(Boolean)) {
      const publicName = tracked.slice(source.length);
      if (!lstatSync(path.join(root, tracked)).isFile()) throw new Error('Expected a tracked regular public asset');
      if (publicName.split('/').some(part => part.startsWith('.')) || !(publicName === '_headers' || /\.(?:js|css|ts|svg|png|webp|jpe?g|woff2?|ico|md|txt)$/i.test(publicName))) {
        throw new Error('Unexpected file type in tracked public assets');
      }
      const name = prefix + publicName;
      if (!readFileSync(path.join(root, tracked)).equals(readFileSync(path.join(dist, name)))) throw new Error('Public asset differs from its source: ' + name);
      expected.add(name);
    }
  }
  return { expected, manifests };
}
verifyCheckout();
if (existsSync(dest)) throw new Error('Choose a new candidate output directory');
const rawFiles = regularTree(worker);
if (!rawFiles.includes('index.js') || !rawFiles.includes('index.js.map') || rawFiles.some(file => !['index.js', 'index.js.map', 'README.md'].includes(file))) {
  throw new Error('Unexpected Wrangler outputs');
}
const allStatic = regularTree(dist);
const { expected, manifests } = staticInputs();
if (allStatic.length !== expected.size + manifests.size || allStatic.some(file => !expected.has(file) && !manifests.has(file))) {
  throw new Error('Static output does not match the Vite manifests, PWA files and tracked public assets');
}
const tmp = mkdtempSync(path.join(path.dirname(dest), '.candidate-build-'));
try {
  const stage = path.join(tmp, 'contents');
  const publish = path.join(tmp, 'result');
  mkdirSync(path.join(stage, 'bundle'), { recursive: true });
  mkdirSync(publish);
  copyFileSync(path.join(worker, 'index.js'), path.join(stage, 'bundle/index.js'));
  writeFileSync(path.join(stage, 'bundle/index.js.map'), canonicalMap(path.join(worker, 'index.js.map')));
  writeFileSync(path.join(stage, 'wrangler.toml'), candidateConfig(readFileSync(path.join(root, 'mail-worker/wrangler.toml'), 'utf8')));
  writeFileSync(path.join(stage, 'SOURCE_SHA'), expectedSha + '\n');
  for (const name of expected) {
    const to = path.join(stage, 'dist', name);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(path.join(dist, name), to);
  }
  const archive = 'epomail-candidate.tar.gz';
  execFileSync('tar', ['--format=gnu', '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '--mode=a=,u+rw,go+r,a+X',
    '--use-compress-program=gzip -n -9', '-cf', path.join(publish, archive), '-C', stage, '.'], { env: { ...process.env, LC_ALL: 'C', TAR_OPTIONS: '', GZIP: '' } });
  const hash = createHash('sha256').update(readFileSync(path.join(publish, archive))).digest('hex');
  writeFileSync(path.join(publish, archive + '.sha256'), hash + '  ' + archive + '\n');
  verifyCheckout();
  renameSync(publish, dest);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
