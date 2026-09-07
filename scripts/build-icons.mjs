import fs from 'fs';
import path from 'path';

async function generate() {
  function getFiles(dir) {
    let results = [];
    fs.readdirSync(dir).forEach(file => {
      const p = path.join(dir, file);
      if (fs.statSync(p).isDirectory()) results = results.concat(getFiles(p));
      else if (file.endsWith('.vue') || file.endsWith('.js')) results.push(p);
    });
    return results;
  }

  const files = getFiles('mail-vue/src');
  const iconSet = new Set();
  const iconRegexes = [
    /icon=[\"']([^\"']+)[\"']/g,
    /icon:\s*[\"']([^\"']+)[\"']/g,
    /<Icon\s+icon=[\"']([^\"']+)[\"']/g,
    /['\"\`]([a-z0-9-]+:[a-z0-9-]+)['\"\`]/g
  ];

  const ignoredPrefixes = new Set([
    'http', 'https', 'is', 'has', 'label', 'email', 'account', 'user', 'role',
    'setting', 'analysis', 'reg-key', 'my', 'cursor', 'overflow', 'all-email'
  ]);

  files.forEach(file => {
    if (file.includes('icons/index.js') || file.includes('content-icons.js')) return;
    const text = fs.readFileSync(file, 'utf8');
    iconRegexes.forEach(re => {
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m[1].includes(':')) {
          const [p, n] = m[1].split(':');
          if (!ignoredPrefixes.has(p) && !n.includes('/') && !n.includes(' ')) {
            iconSet.add(m[1]);
          }
        }
      }
    });
  });

  console.log(`Discovered ${iconSet.size} icon references in mail-vue/src`);

  // Read existing icons/index.js
  const existingCode = fs.readFileSync('mail-vue/src/icons/index.js', 'utf8');
  const collections = {};

  const colRegex = /addCollection\((\{[\s\S]*?\})\)/g;
  let m;
  while ((m = colRegex.exec(existingCode)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      const prefix = parsed.prefix;
      if (!collections[prefix]) {
        collections[prefix] = {
          prefix,
          width: parsed.width,
          height: parsed.height,
          aliases: parsed.aliases || {},
          icons: {}
        };
      }
      if (parsed.width) collections[prefix].width = parsed.width;
      if (parsed.height) collections[prefix].height = parsed.height;
      if (parsed.aliases) Object.assign(collections[prefix].aliases, parsed.aliases);
      if (parsed.icons) Object.assign(collections[prefix].icons, parsed.icons);
    } catch (e) {
      // ignore
    }
  }

  // Find missing icons
  const missingByPrefix = {};
  for (const icon of iconSet) {
    const [p, n] = icon.split(':');
    if (!collections[p] || !collections[p].icons[n]) {
      if (!missingByPrefix[p]) missingByPrefix[p] = new Set();
      missingByPrefix[p].add(n);
    }
  }

  // Aliases for fluent
  if (missingByPrefix['fluent']) {
    missingByPrefix['fluent'].add('calendar-16-regular');
    missingByPrefix['fluent'].add('arrow-forward-20-regular');
    missingByPrefix['fluent'].add('arrow-forward-20-filled');
    missingByPrefix['fluent'].delete('calendar-weekend-16-regular');
    missingByPrefix['fluent'].delete('mail-forward-20-regular');
    missingByPrefix['fluent'].delete('mail-forward-20-filled');
  }

  // Fetch missing icons from Iconify API
  for (const [p, set] of Object.entries(missingByPrefix)) {
    const list = Array.from(set);
    const apiPrefix = p.replace('_', '-');
    console.log(`Fetching ${list.length} icons for prefix '${apiPrefix}'...`);
    for (let i = 0; i < list.length; i += 40) {
      const chunk = list.slice(i, i + 40);
      const url = `https://api.iconify.design/${apiPrefix}.json?icons=${chunk.join(',')}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!collections[p]) {
        collections[p] = {
          prefix: p,
          width: data.width || 24,
          height: data.height || 24,
          aliases: {},
          icons: {}
        };
      }
      if (data.icons) {
        Object.assign(collections[p].icons, data.icons);
      }
      if (data.aliases) {
        Object.assign(collections[p].aliases, data.aliases);
      }
    }
  }

  // Ensure special aliases are registered
  if (collections['fluent']) {
    if (collections['fluent'].icons['calendar-16-regular']) {
      collections['fluent'].icons['calendar-weekend-16-regular'] = collections['fluent'].icons['calendar-16-regular'];
    }
    if (collections['fluent'].icons['arrow-forward-20-regular']) {
      collections['fluent'].icons['mail-forward-20-regular'] = collections['fluent'].icons['arrow-forward-20-regular'];
    }
    if (collections['fluent'].icons['arrow-forward-20-filled']) {
      collections['fluent'].icons['mail-forward-20-filled'] = collections['fluent'].icons['arrow-forward-20-filled'];
    }
  }

  // Generate clean icons/index.js file
  const lines = [
    '// 自动化生成的全量离线图标注册表 (100% Offline Built-in Icon Bundle)',
    '// 涵盖项目所有 300+ 矢量图标，杜绝任何外部 API 网络延迟与缺失',
    'import { addCollection } from "@iconify/vue";',
    ''
  ];

  const sortedPrefixes = Object.keys(collections).sort();
  for (const prefix of sortedPrefixes) {
    const col = collections[prefix];
    lines.push(`addCollection(${JSON.stringify(col, null, 2)});`);
    lines.push('');
  }

  const generatedCode = lines.join('\n');
  fs.writeFileSync('mail-vue/src/icons/index.js', generatedCode, 'utf8');
  console.log(`Successfully wrote ${sortedPrefixes.length} collections into mail-vue/src/icons/index.js!`);
}

generate().catch(err => {
  console.error('Generation error:', err);
  process.exit(1);
});
