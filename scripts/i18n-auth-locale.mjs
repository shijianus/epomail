// temp_login_ui（登录/注册子应用）六语言字典门禁。
//
// 覆盖三类 tsc 单文件检查看不到、又会静默降级到英文的缺陷：
//   1. 定义了字典常量却忘记登记进 authDict —— 该语言整体失效
//   2. 同一字典内重复词条 —— 后者静默覆盖前者，翻译丢失
//   3. 界面字面量 t()/tr() 引用到字典里不存在的词条 —— 用户看到裸 key
// 同时断言六语言键集合完全一致、无空词条、占位符（{s} / {factor}）对齐。
//
// 该检查依赖 Node >= 22.18 的原生 TypeScript 类型擦除来直接加载 authLocale.ts；
// 更低版本 Node 会以明确的错误信息失败，而不是静默跳过。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { duplicateProperties, literalObjects } from './i18n-source.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'temp_login_ui');
const srcDir = join(appDir, 'src');
const localeFile = join(srcDir, 'app', 'i18n', 'authLocale.ts');
const LANGS = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];
const BASELINE = 'zh';

const failures = [];
const warnings = [];
const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);
const rel = (file) => file.slice(root.length + 1).split(sep).join('/');

let authDict;
let declaredLangs;
try {
  ({ authDict, AUTH_LANGS: declaredLangs } = await import(pathToFileURL(localeFile).href));
} catch (error) {
  console.error(`[i18n-auth-locale] 无法加载 ${rel(localeFile)}: ${error.message}`);
  console.error('[i18n-auth-locale] 需要 Node >= 22.18（原生 TS 类型擦除），或显式追加 --experimental-strip-types。');
  process.exit(1);
}

// 门禁自身的语言清单必须与 AUTH_LANGS 同步，否则新增语言会绕过检查。
const declaredLangList = Array.isArray(declaredLangs) ? [...declaredLangs] : [];
if (declaredLangList.join(',') !== LANGS.join(',')) {
  console.error(`[i18n-auth-locale] AUTH_LANGS [${declaredLangList.join(', ')}] 与本门禁的语言清单 [${LANGS.join(', ')}] 不一致；请同步更新 scripts/i18n-auth-locale.mjs。`);
  process.exit(1);
}

// ---------------------------------------------------------------- 1. 字典结构
const tables = {};
for (const lang of LANGS) {
  const table = authDict && authDict[lang];
  if (!table || typeof table !== 'object' || Array.isArray(table)) {
    fail(`缺少语言字典：${lang}`);
    continue;
  }
  tables[lang] = table;
  for (const [key, value] of Object.entries(table)) {
    if (typeof value !== 'string') fail(`${lang}.${key} 不是字符串（实际 ${typeof value}）`);
    else if (!value.trim()) fail(`${lang}.${key} 是空词条`);
  }
}

// ------------------------------------------------- 2. 跨语言键集合与占位符一致
const baseline = tables[BASELINE];
if (!baseline) {
  fail(`缺少基准语言字典：${BASELINE}`);
} else {
  const refKeys = Object.keys(baseline);
  const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  const fmt = (list) => `${list.slice(0, 10).join(', ')}${list.length > 10 ? ` …(+${list.length - 10})` : ''}`;

  for (const lang of LANGS) {
    const table = tables[lang];
    if (!table || lang === BASELINE) continue;
    const keys = new Set(Object.keys(table));
    const missing = refKeys.filter((key) => !keys.has(key));
    const extra = [...keys].filter((key) => !(key in baseline));
    if (missing.length) fail(`${lang} 缺少 ${missing.length} 个词条：${fmt(missing)}`);
    if (extra.length) fail(`${lang} 多出 ${extra.length} 个词条：${fmt(extra)}`);

    for (const key of refKeys) {
      if (!keys.has(key) || typeof table[key] !== 'string' || typeof baseline[key] !== 'string') continue;
      const want = placeholders(baseline[key]);
      const got = placeholders(table[key]);
      if (want !== got) {
        fail(`${lang}.${key} 占位符不一致：基准 [${want || '无'}] vs 实际 [${got || '无'}]`);
      }
    }
  }
}

// ------------------------------------------------ 3. 源码层：重复键 / 登记遗漏
const source = readFileSync(localeFile, 'utf8').replace(/\r\n?/g, '\n');
const objects = literalObjects(source);
const blocks = [];
for (const match of source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*:\s*Dict\s*=\s*\{/g)) {
  const object = objects.find((entry) => entry.start === match.index + match[0].length - 1);
  // A declaration inside a comment/string is deliberately not in objects.
  if (object) blocks.push({ ...object, name: match[1] });
}

if (blocks.length !== LANGS.length) {
  fail(`源码中解析到 ${blocks.length} 个字典常量，预期 ${LANGS.length} 个（${LANGS.join(' / ')}）`);
}
for (const block of blocks) {
  for (const [key, lines] of duplicateProperties(block)) {
    fail(`字典 ${block.name} 重复定义 ${key}：第 ${lines.join('、')} 行（后者会静默覆盖前者）`);
  }
}

const registeredBlock = /export const authDict[^{]*\{([\s\S]*?)\}/.exec(source);
if (!registeredBlock) {
  fail('未找到 authDict 注册表（export const authDict = { ... }）');
} else {
  const declared = new Set(blocks.map((block) => block.name));
  const wired = [];
  for (const rawEntry of registeredBlock[1].split(',')) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const parsed = /^(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*(?::\s*([A-Za-z_$][\w$]*))?$/.exec(entry);
    if (!parsed) {
      warn(`无法解析 authDict 条目：${entry}`);
      continue;
    }
    const langKey = parsed[1] || parsed[2] || parsed[3];
    const variable = parsed[4] || langKey;
    wired.push(langKey);
    if (!declared.has(variable)) fail(`authDict.${langKey} 指向未定义的字典常量 ${variable}`);
  }
  for (const lang of LANGS) {
    if (!wired.includes(lang)) fail(`authDict 未登记语言 ${lang}`);
  }
  for (const lang of wired) {
    if (!LANGS.includes(lang)) fail(`authDict 登记了未受支持的语言 ${lang}`);
  }
  for (const block of blocks) {
    if (!new RegExp(`\\b${block.name}\\b`).test(registeredBlock[1])) {
      fail(`字典 ${block.name}（第 ${block.line} 行）未登记进 authDict，该语言在运行时不可达`);
    }
  }
}

// ------------------------------------- 4. 界面字面量引用的词条必须六语言齐备
function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) files.push(path);
  }
  return files;
}

const callSites = [];
const mapRefs = [];
for (const file of walk(srcDir).filter((file) => !/[\\/]i18n[\\/]/.test(file))) {
  const text = readFileSync(file, 'utf8');
  const pattern = /(?:^|[^\w$.])(t|tr)\(\s*(['"])((?:\\.|(?!\2)[^\\])*)\2/g;
  let match;
  while ((match = pattern.exec(text))) {
    const name = match[1];
    const first = match[3].replace(/\\(['"\\])/g, '$1');
    if (!first) continue;
    const secondArg = /^\s*,\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/.exec(text.slice(pattern.lastIndex));
    const second = secondArg ? secondArg[2].replace(/\\(['"\\])/g, '$1') : '';
    const line = text.slice(0, match.index).split('\n').length;
    callSites.push({
      key: name === 'tr' && second ? second : first,
      adminKey: name === 'tr' && second ? first : '',
      location: `${rel(file)}:${line}`
    });
  }
  // 间接引用：映射对象的 key 保存稍后传入 t()/tr() 的词条。
  // 当前 OAuth 元数据的 { key, name, icon } 是协议标识；只排除此结构，
  // 不能按 key 的值（如 google）豁免，否则同名缺失翻译也会逃过检查。
  for (const object of literalObjects(text)) {
    const fields = new Set(object.properties.map((property) => property.name));
    if (fields.has('name') && fields.has('icon') && !fields.has('field')) continue;
    for (const property of object.properties) {
      if (property.name !== 'key' || !property.value) continue;
      mapRefs.push({ key: property.value, location: `${rel(file)}:${property.line}`, indirect: true });
    }
  }
}

const missingRefs = new Map();
for (const site of [...callSites, ...mapRefs]) {
  const missing = LANGS.filter((lang) => tables[lang] && !Object.hasOwn(tables[lang], site.key));
  if (missing.length && !missingRefs.has(site.key)) {
    missingRefs.set(site.key, `${site.location} (${missing.join(' / ')})${site.indirect ? ' [间接 key: 引用]' : ''}`);
  }
}
for (const [key, where] of missingRefs) fail(`界面引用但字典缺少词条 ${key}，首次出现于 ${where}`);

for (const site of callSites) {
  if (!site.adminKey) continue;
  if (!(site.adminKey in (baseline || {})) && !missingRefs.has(site.adminKey)) {
    warn(`tr() 管理后台覆盖键 ${site.adminKey} 不在字典中（仅作管理后台覆盖键，可接受）：${site.location}`);
  }
}

const referencedKeys = new Set([
  ...callSites.flatMap((site) => [site.key, site.adminKey]).filter(Boolean),
  ...mapRefs.map((ref) => ref.key)
]);
const unused = baseline ? Object.keys(baseline).filter((key) => !referencedKeys.has(key)) : [];
if (unused.length) {
  warn(`字典中存在 ${unused.length} 个代码未引用的词条（可能是历史残留）：${unused.join(', ')}`);
}

// -------------------------------------------------------------------- 5. 汇报
for (const warning of warnings) console.log(`WARN ${warning}`);
if (failures.length) {
  for (const failure of failures) console.log(`FAIL ${failure}`);
  console.log(`\n[i18n-auth-locale] ${failures.length} 项失败`);
} else {
  const keyCount = baseline ? Object.keys(baseline).length : 0;
  console.log(`[i18n-auth-locale] ${LANGS.join(' / ')}：各 ${keyCount} 个词条，键集合一致；`);
  console.log(`[i18n-auth-locale] 无重复键、无空词条、占位符对齐；`);
  console.log(`[i18n-auth-locale] ${callSites.length} 处界面字面量引用、${mapRefs.length} 处间接 key: 引用全部命中字典。`);
  console.log('[i18n-auth-locale] PASS');
}
process.exitCode = failures.length ? 1 : 0;
