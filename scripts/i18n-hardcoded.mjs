// Refined: find user-facing hardcoded CJK strings (strip i18n calls, fallbacks, console, comments, regex)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'mail-vue', 'src');
function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(vue|js)$/.test(name)) files.push(p);
  }
  return files;
}
const files = walk(srcDir).filter(f => !/[\\\/]i18n[\\\/]/.test(f));

const cjk = /[\u4e00-\u9fff\u3400-\u4dbf]/;
let hits = 0;
for (const f of files) {
  const rel = f.slice(srcDir.length + 1).split(/[\\\/]/).join('/');
  const lines = readFileSync(f, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!cjk.test(raw)) continue;
    let l = raw;
    // strip full-line and trailing comments
    l = l.replace(/<!--[\s\S]*?-->/g, '');
    // strip i18n-wrapped calls incl. chained || 'fallback'
    for (let k = 0; k < 5; k++) {
      l = l.replace(/\$?\s*t\s*\(\s*(['"`])(?:\\.|(?!\1).)*\1(\s*,[^)]*)?\)/g, '');
      l = l.replace(/\|\|\s*(['"])(?:\\.|(?!\1).)*\1/g, '');
    }
    // strip console.* statements
    l = l.replace(/console\.\w+\s*\([^;]*\);?/g, '');
    // strip string comparisons against CJK data values (label matching etc.)
    l = l.replace(/(===|!==|==|!=|includes\()?\s*(['"])([\u4e00-\u9fff]+)\2/g, '$1');
    // strip regex literals containing CJK
    l = l.replace(/\/(?:\\.|[^\/\n])+\/[gimsuy]*/g, (m) => cjk.test(m) ? '' : m);
    const ci = l.indexOf('//');
    if (ci >= 0) l = l.slice(0, ci);
    if (cjk.test(l)) {
      hits++;
      console.log(`${rel}:${i + 1}: ${raw.trim().slice(0, 220)}`);
    }
  }
}
console.log(`\n=== total suspicious lines: ${hits} ===`);
