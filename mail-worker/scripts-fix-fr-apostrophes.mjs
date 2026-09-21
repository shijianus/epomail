// 修复 scripts-add-i18n-keys.mjs 中 fr 块值内部的直撇号 → U+2019
import fs from 'node:fs';
const p = new URL('./scripts-add-i18n-keys.mjs', import.meta.url);
let s = fs.readFileSync(p, 'utf8');
const start = s.indexOf("'fr': `") ;
const end = s.indexOf('`,', start);
if (start === -1 || end === -1) throw new Error('fr block not found');
let block = s.slice(start, end);
// 逐行处理 "    key: 'value'," 形态：value 内的 ' 换成 ’
const lines = block.split('\n').map(line => {
  const m = line.match(/^(\s*[A-Za-z]+: ')(.*)(',)?$/);
  if (!m) return line;
  let value = m[2];
  // value 里可能混有应转义的内部直撇号：除首尾外全部替换
  value = value.replace(/'/g, '\u2019');
  return m[1] + value + (m[3] || '');
});
block = lines.join('\n');
s = s.slice(0, start) + block + s.slice(end);
fs.writeFileSync(p, s, 'utf8');
console.log('fr block apostrophes fixed');
