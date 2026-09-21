// Verify all 6 language dictionaries have identical key sets.
// Covers BOTH dictionary families and flattens nested groups (e.g. worker `perms.*`),
// so a missing sub-key fails the check instead of hiding behind its parent object.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const langs = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];
const families = [
  { name: 'mail-vue', dir: join(root, 'mail-vue', 'src', 'i18n') },
  { name: 'mail-worker', dir: join(root, 'mail-worker', 'src', 'i18n') }
];

function flatKeys(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatKeys(v, key));
    else out.push(key);
  }
  return out;
}

let ok = true;

for (const { name, dir } of families) {
  console.log(`\n[${name}]`);
  const sets = {};
  for (const l of langs) {
    const m = await import(pathToFileURL(join(dir, l + '.js')).href);
    sets[l] = new Set(flatKeys(m.default));
  }
  const ref = sets.zh;
  for (const l of langs.slice(1)) {
    const missing = [...ref].filter(k => !sets[l].has(k));
    const extra = [...sets[l]].filter(k => !ref.has(k));
    if (missing.length || extra.length) {
      ok = false;
      console.log(`${l}: missing=${missing.length} extra=${extra.length}`);
      missing.slice(0, 10).forEach(k => console.log('  -', k));
      extra.slice(0, 10).forEach(k => console.log('  +', k));
    } else {
      console.log(`${l}: ✓ identical (${sets[l].size} keys)`);
    }
  }
  console.log(`zh: ${ref.size} keys (baseline)`);
}

console.log(ok ? '\nALL SYMMETRIC' : '\nASYMMETRY FOUND');
process.exitCode = ok ? 0 : 1;
