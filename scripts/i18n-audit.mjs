// i18n audit: compare used translation keys vs zh/en dictionaries; find dynamic usages
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'mail-vue', 'src');

const zh = (await import(pathToFileURL(join(srcDir, 'i18n', 'zh.js')))).default;
const en = (await import(pathToFileURL(join(srcDir, 'i18n', 'en.js')))).default;

function flat(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flat(v, key, out);
    else out[key] = v;
  }
  return out;
}
const zhKeys = flat(zh), enKeys = flat(en);
const zhSet = new Set(Object.keys(zhKeys)), enSet = new Set(Object.keys(enKeys));
console.log('=== dict stats ===');
console.log('zh keys:', zhSet.size, 'en keys:', enSet.size);
const onlyZh = [...zhSet].filter(k => !enSet.has(k));
const onlyEn = [...enSet].filter(k => !zhSet.has(k));
console.log('\n=== keys defined in zh but MISSING in en ===');
onlyZh.forEach(k => console.log(' -', k, '=>', JSON.stringify(zhKeys[k])));
console.log('\n=== keys defined in en but MISSING in zh ===');
onlyEn.forEach(k => console.log(' -', k, '=>', JSON.stringify(enKeys[k])));

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(vue|js|jsx|ts|tsx)$/.test(name)) files.push(p);
  }
  return files;
}
const files = walk(srcDir).filter(f => !/[\\\/]i18n[\\\/]/.test(f));

const used = new Map(); // key -> [locations]
const dynamic = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const rel = f.slice(srcDir.length + 1).split(/[\\\/]/).join('/');
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

console.log('\n=== used keys MISSING in BOTH zh & en ===');
for (const [k, locs] of [...used].sort()) {
  if (!zhSet.has(k) && !enSet.has(k)) console.log(` ! ${k}  (${locs.length}x) e.g. ${locs[0]}`);
}
console.log('\n=== used keys MISSING in zh (exist only in en) ===');
for (const [k, locs] of [...used].sort()) {
  if (!zhSet.has(k) && enSet.has(k)) console.log(` ! ${k}  ${locs[0]}`);
}
console.log('\n=== used keys MISSING in en (exist only in zh) ===');
for (const [k, locs] of [...used].sort()) {
  if (zhSet.has(k) && !enSet.has(k)) console.log(` ! ${k}  ${locs[0]}`);
}
console.log(`\n=== dynamic (non-literal) t() usages: ${dynamic.length} ===`);
dynamic.forEach(d => console.log(' ?', d));
console.log(`\ntotal literal keys used: ${used.size}`);
