// Fail on duplicate dictionary keys, six-language drift or missing literal references.
// Dynamic references are reported for review, not treated as proven missing keys.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { duplicateProperties, literalObjects } from './i18n-source.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'mail-vue', 'src');
const langs = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];
let duplicates = 0;
let mismatches = 0;
let missingRefs = 0;

function flat(obj, prefix = '', out = Object.create(null)) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out);
    else out[key] = v;
  }
  return out;
}

const sets = {};
console.log('=== duplicate dictionary keys (source, before runtime overwrites) ===');
for (const lang of langs) {
  const file = join(srcDir, 'i18n', `${lang}.js`);
  for (const object of literalObjects(readFileSync(file, 'utf8'))) {
    for (const [key, lines] of duplicateProperties(object)) {
      duplicates++;
      console.log(`FAIL duplicate key ${key}: i18n/${lang}.js:${lines.join(', ')} (last definition silently wins)`);
    }
  }
  const dictionary = (await import(pathToFileURL(file).href)).default;
  sets[lang] = new Set(Object.keys(flat(dictionary)));
}

console.log('\n=== dict stats / six-language symmetry ===');
for (const lang of langs) {
  console.log(`${lang} keys: ${sets[lang].size}`);
  if (lang === 'zh') continue;
  const missing = [...sets.zh].filter(key => !sets[lang].has(key));
  const extra = [...sets[lang]].filter(key => !sets.zh.has(key));
  mismatches += missing.length + extra.length;
  missing.forEach(key => console.log(`FAIL ${lang} MISSING dictionary key ${key} (defined in zh)`));
  extra.forEach(key => console.log(`FAIL zh MISSING dictionary key ${key} (defined in ${lang})`));
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(vue|js|jsx|ts|tsx)$/.test(name)) files.push(p);
  }
  return files;
}
const files = walk(srcDir).filter(f => !/[\\/]i18n[\\/]/.test(f));

const used = new Map(); // key -> [locations]
const dynamic = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const rel = f.slice(srcDir.length + 1).split(/[\\/]/).join('/');
  const lines = text.split('\n');
  for (const [i, line] of lines.entries()) {
    let m;
    const re = /(?:[^$\w]|^)(?:\$t|\$rt|\$tc|\$tn|\$te|i18n\.global\.t|\bt)\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
    while ((m = re.exec(line))) {
      const key = m[2].replace(/\\'/g, "'");
      if (!key) continue;
      if (!used.has(key)) used.set(key, []);
      used.get(key).push(`${rel}:${i + 1}`);
    }
    const dynRe = /(?:\$(?:t|rt|tc|tn)|i18n\.global\.t)\(\s*[^'"`]/g;
    while ((m = dynRe.exec(line))) {
      dynamic.push(`${rel}:${i + 1}: ${line.trim().slice(0, 160)}`);
    }
  }
}

console.log('\n=== literal references missing from dictionaries ===');
for (const [key, locations] of [...used].sort()) {
  const missing = langs.filter(lang => !sets[lang].has(key));
  if (!missing.length) continue;
  missingRefs++;
  console.log(`FAIL MISSING reference ${key} in ${missing.join(' / ')} (${locations.length}x), first at ${locations[0]}`);
}
console.log(`\n=== dynamic (non-literal) t() usages: ${dynamic.length} ===`);
dynamic.forEach(d => console.log(' ?', d));
console.log(`\ntotal literal keys used: ${used.size}`);
const failed = duplicates + mismatches + missingRefs > 0;
console.log(`[i18n-audit] ${failed ? 'FAIL' : 'PASS'}: duplicate keys=${duplicates}, dictionary differences=${mismatches}, missing references=${missingRefs}`);
process.exitCode = failed ? 1 : 0;
