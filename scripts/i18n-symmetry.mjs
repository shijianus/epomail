// Verify all 6 language dictionaries have identical key sets
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'mail-vue', 'src', 'i18n');
const langs = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];
const sets = {};
for (const l of langs) {
  const m = await import(pathToFileURL(join(dir, l + '.js')));
  sets[l] = new Set(Object.keys(m.default));
}
const ref = sets.zh;
let ok = true;
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
console.log(ok ? 'ALL SYMMETRIC' : 'ASYMMETRY FOUND');
