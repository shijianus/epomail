const fs = require('fs');
const path = require('path');
const dist = 'dist';
const pages = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'index.html') pages.push(p);
  }
})(dist);
let bad = 0, checked = 0;
for (const p of pages) {
  const html = fs.readFileSync(p, 'utf8');
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
  const hrefs = [...html.matchAll(/ href="#([^"]+)"/g)].map(m => decodeURIComponent(m[1]));
  for (const h of new Set(hrefs)) {
    checked++;
    if (!ids.has(h)) {
      console.log('BROKEN ANCHOR', p.split(path.sep).join('/'), '#' + h);
      if (/annexe|apéndice|apendice|bijlage|附录|附錄/.test(h)) {
        const near = [...ids].filter(id => /annexe|ap[eé]ndice|bijlage|附录|附錄|glossaire|glosario|woorden|术语|術語|速查/i.test(id));
        console.log('  candidates:', near.join(' | '));
      }
      bad++;
    }
  }
  const imgs = [...html.matchAll(/ src="(\/images\/[^"]+)"/g)].map(m => m[1]);
  for (const s of new Set(imgs)) {
    const f = path.join(dist, s.replace(/^\//, '').split('?')[0]);
    if (!fs.existsSync(f)) { console.log('MISSING IMAGE', p.split(path.sep).join('/'), s); bad++; }
  }
}
console.log('pages=' + pages.length, 'anchors-checked=' + checked, 'broken=' + bad);
process.exit(bad ? 1 : 0);
