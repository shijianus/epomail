// Run: node --test tests/test-i18n-gates.mjs
// All mutations stay in disposable fixtures; no app source, DB, KV or network.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { duplicateProperties, literalObjects } from '../scripts/i18n-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];
const AUTH = 'temp_login_ui/src/app/i18n/authLocale.ts';
const VUE = 'mail-vue/src';
const names = ['zh', 'zhHant', 'en', 'es', 'fr', 'nl'];

function authSource(entries = () => "  known: 'Known {name}',\n  indirect: 'Mapped',") {
  return `export const AUTH_LANGS = ${JSON.stringify(LANGS)} as const;\n` +
    'type Dict = Record<string, string>;\n' +
    names.map((name, i) => `const ${name}: Dict = {\n${entries(LANGS[i])}\n};\n`).join('\n') +
    "export const authDict = { zh, 'zh-Hant': zhHant, en, es, fr, nl };\n";
}

function fixture(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'epomail-i18n-gates-'));
  const write = (relative, text) => {
    const file = join(dir, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text, 'utf8');
  };
  const run = (name) => {
    // Deliberately unrelated cwd verifies that script-relative roots work.
    const result = spawnSync(process.execPath, [join(dir, 'scripts', `i18n-${name}.mjs`)], {
      cwd: tmpdir(), encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, 'gate must exit normally, not crash/timeout');
    return { code: result.status, output: result.stdout + result.stderr };
  };
  try {
    write('package.json', '{"type":"module"}\n');
    mkdirSync(join(dir, 'scripts'));
    for (const name of ['audit', 'hardcoded', 'auth-locale', 'symmetry', 'source']) {
      copyFileSync(join(ROOT, 'scripts', `i18n-${name}.mjs`), join(dir, 'scripts', `i18n-${name}.mjs`));
    }
    // Fixtures own their reviewed data; never copy the workspace exception list.
    write('scripts/i18n-data-exceptions.json', '[]\n');
    for (const family of ['mail-vue', 'mail-worker']) {
      for (const lang of LANGS) {
        write(`${family}/src/i18n/${lang}.js`, "export default { known: 'Known', indirect: 'Mapped', group: { leaf: 'Leaf' } };\n");
      }
    }
    write(`${VUE}/fixture.vue`, "<template><p>{{ $t('known') }}</p></template>\n");
    write(AUTH, authSource());
    write('temp_login_ui/src/app/fixture.ts', "t('known');\nconst mapping = { field: 'form', key: 'indirect' };\n");
    callback({ dir, write, run });
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    assert.equal(existsSync(dir), false, 'fixture must be physically removed');
  }
}

function expect(result, code, diagnostic) {
  assert.equal(result.code, code, result.output);
  if (diagnostic) assert.match(result.output, diagnostic);
}

test('all four gates pass a clean isolated project with exit code zero', () => fixture(({ run }) => {
  for (const name of ['symmetry', 'audit', 'hardcoded', 'auth-locale']) expect(run(name), 0, /PASS|ALL SYMMETRIC/);
}));

test('source duplicate scanner ignores comments/values and respects object scopes', () => {
  const source = String.raw`const dict = {
    known: 'old', "known": 'new', ['known']: 'latest',
    escaped: 'old', '\u0065scaped': 'new',
    left: { nested: 'one' }, right: { nested: 'two' },
    url: 'https://example.invalid/{same:}',
    text: 'known: "not a property", known: "still text"',
    pattern: /[{]fake:.*[}]/,
    // known: 'comment', known: 'comment'
    /* escaped: 'comment', escaped: 'comment' */
  };`;
  const duplicates = literalObjects(source).flatMap(duplicateProperties);
  assert.deepEqual(duplicates.map(([key]) => key), ['known', 'escaped']);
  assert.deepEqual(duplicates[0][1], [2, 2, 2]);
});

test('audit exits one for an unknown literal translation reference', () => fixture(({ write, run }) => {
  write(`${VUE}/fixture.vue`, "<template>{{ $t('missingFixtureKey') }}</template>\n");
  expect(run('audit'), 1, /FAIL MISSING reference missingFixtureKey.*fixture\.vue:1/);
}));

test('audit exits one for dictionary drift outside zh/en even without a reference', () => fixture(({ write, run }) => {
  write(`${VUE}/i18n/fr.js`, "export default { known: 'Known', group: { leaf: 'Leaf' } };\n");
  expect(run('audit'), 1, /FAIL fr MISSING dictionary key indirect/);
}));

test('audit catches duplicate keys in each of the six languages, including same-line quoted keys', () => {
  for (const lang of LANGS) fixture(({ write, run }) => {
    write(`${VUE}/i18n/${lang}.js`, `export default { known: 'first', "known": 'last', indirect: 'Mapped', group: { leaf: 'Leaf' } };\n`);
    const result = run('audit');
    expect(result, 1, /FAIL duplicate key known/);
    assert.ok(result.output.includes(`i18n/${lang}.js:1, 1`), result.output);
  });
});

test('symmetry fails a missing worker nested leaf, not just a top-level key', () => fixture(({ write, run }) => {
  write('mail-worker/src/i18n/nl.js', "export default { known: 'Known', indirect: 'Mapped', group: {} };\n");
  expect(run('symmetry'), 1, /group\.leaf/);
}));

test('auth catches a missing indirect key and ignores unrelated provider identifiers', () => fixture(({ write, run }) => {
  write('temp_login_ui/src/app/fixture.ts', `
    const providers = [{ key: 'google', name: 'Google', icon: null }];
    // { field: 'form', key: 'commentOnlyMissing' }
    const note = "{ field: 'form', key: 'stringOnlyMissing' }";
    const mapping = { "key" : 'missingIndirectKey', field: 'form' };
  `);
  const result = run('auth-locale');
  expect(result, 1, /missingIndirectKey.*间接 key: 引用/);
  assert.doesNotMatch(result.output, /缺少词条 (?:google|commentOnlyMissing|stringOnlyMissing)/);
}));

test('auth catches indirect keys even when a mapping has no field property', () => fixture(({ write, run }) => {
  write('temp_login_ui/src/app/fixture.ts', "const mappings = [{ key : 'missingBareKey' }];\n");
  expect(run('auth-locale'), 1, /missingBareKey.*间接 key: 引用/);
}));

test('auth indirect references cannot pass via inherited Object.prototype properties', () => fixture(({ write, run }) => {
  write('temp_login_ui/src/app/fixture.ts', "const mapping = { field: 'form', key: 'toString' };\n");
  expect(run('auth-locale'), 1, /缺少词条 toString/);
}));

test('auth indirect-only known references count as used and provider keys are not translations', () => fixture(({ write, run }) => {
  write('temp_login_ui/src/app/fixture.ts', `t('known');
    const mapping = { field: 'email', 'key' : 'indirect' };
    const providers = [{ key: 'google', name: 'Google', icon: null }];
  `);
  const result = run('auth-locale');
  expect(result, 0, /1 处间接 key: 引用/);
  assert.doesNotMatch(result.output, /代码未引用/);
}));

test('auth duplicate detection handles quoted and same-line definitions', () => fixture(({ write, run }) => {
  write(AUTH, authSource((lang) => "  known: 'Known {name}', indirect: 'Mapped'," + (lang === 'fr' ? " 'known': 'Last {name}'," : '')));
  expect(run('auth-locale'), 1, /字典 fr 重复定义 known/);
}));

test('auth reports placeholder drift and missing language registration', () => fixture(({ dir, write, run }) => {
  write(AUTH, authSource((lang) => `  known: 'Known {${lang === 'nl' ? 'other' : 'name'}}', indirect: 'Mapped',`));
  expect(run('auth-locale'), 1, /nl\.known 占位符不一致/);
  write(AUTH, readFileSync(join(dir, AUTH), 'utf8').replace("zhHant, en, es, fr, nl };", "zhHant, en, es, fr };"));
  expect(run('auth-locale'), 1, /缺少语言字典：nl/);
}));

for (const [name, text] of [
  ['plain Vue text', '<template><button>确认操作</button></template>'],
  ['static accessible attribute', '<template><button aria-label="确认操作" /></template>'],
  ['pure Chinese JS string', '<script setup>const title = "确认操作";</script>'],
  ['non-i18n fallback', '<template>{{ value || "操作失败" }}</template>'],
  ['dynamic attribute fallback', '<template><input :placeholder="value || \'请输入名称\'" /></template>'],
  ['Chinese following a URL', '<script setup>const title = "https://example.invalid/ 请确认";</script>'],
  ['template literal', '<script setup>const text = `请确认 ${count} 项`;</script>']
]) {
  test(`hardcoded rejects ${name} with exit code one`, () => fixture(({ write, run }) => {
    write(`${VUE}/fixture.vue`, text + '\n');
    expect(run('hardcoded'), 1, /fixture\.vue:1:/);
  }));
}

test('hardcoded keeps comments, console, regex and comparison operands out of UI findings', () => fixture(({ write, run }) => {
  write(`${VUE}/fixture.vue`, `<template>
    <!-- 注释中的 / 路径和 <p>文字</p> 都不是界面 -->
    <p>{{ $t('known') }}</p>
    <input :placeholder="t('known') || '已经翻译的后备文案'" />
  </template>
  <script setup>
    // 中文 / 单行注释
    /* 跨行注释
       第二行中文 */
    console.debug('调试日志');
    const pattern = /中文[\\w/]+/;
    const same = state === '已完成';
    const lookup = { '协议键': 'wire_value' };
    const starts = text.startsWith('回复：');
    const contains = text.includes('协议值');
    const members = ['协议值', '另一个值'].includes(state);
  </script>
  <style>/* 样式注释 */ .item { color: red; }</style>`);
  expect(run('hardcoded'), 0, /0 suspicious lines/);
}));

test('language self-names are allowed only when paired with their locale id', () => fixture(({ write, run }) => {
  write(`${VUE}/fixture.vue`, `<template><select><option label="中文 (简体)" value="zh" /><option label='日本語' value='ja' /></select></template>`);
  expect(run('hardcoded'), 0, /0 suspicious lines/);
  write(`${VUE}/fixture.vue`, `<template><button title="中文 (简体)" /></template>`);
  expect(run('hardcoded'), 1, /fixture\.vue:1/);
}));

test('verified theme tables fail when a locale disappears or a legacy mirror drifts', () => fixture(({ write, run }) => {
  const table = (langs) => '{' + langs.map((lang) => `${JSON.stringify(lang)}: ${JSON.stringify(lang === 'zh' ? '中文标题' : 'Title')}`).join(',') + '}';
  const resource = (langs, mirror = '中文标题') => `export const COVER_PRESETS = [{ id: 'cover', names: ${table(langs)}, nameZh: ${JSON.stringify(mirror)}, nameEn: 'Title' }];\n`;
  write(`${VUE}/utils/theme-presets.js`, resource(LANGS));
  expect(run('hardcoded'), 0, /locale tables and compatibility mirrors verified/);
  write(`${VUE}/utils/theme-presets.js`, resource(LANGS) + "export const unrelated = '普通界面';\n");
  expect(run('hardcoded'), 1, /unrelated/);
  write(`${VUE}/utils/theme-presets.js`, resource(LANGS.slice(0, -1)));
  expect(run('hardcoded'), 1, /six nonempty language entries/);
  write(`${VUE}/utils/theme-presets.js`, resource(LANGS, '不同文案'));
  expect(run('hardcoded'), 1, /differs from names.zh/);
}));

test('registered date locale functions must retain all six branches; adjacent UI still fails', () => fixture(({ write, run }) => {
  const functions = ['fromNow', 'formatDetailDate'];
  const source = (langs) => functions.map((name) => `export function ${name}(date) {
    const lang = setting.lang || 'zh';
    ${langs.map((lang) => `if (lang === ${JSON.stringify(lang)}) return 'localized';`).join('\n')}
    return '默认日期';
  }`).join('\n');
  write(`${VUE}/utils/day.js`, source(LANGS.slice(1)));
  expect(run('hardcoded'), 0, /six locale branches verified/);
  write(`${VUE}/utils/day.js`, source(LANGS.slice(1)) + "\nexport const extra = '未翻译日期';\n");
  expect(run('hardcoded'), 1, /extra/);
  write(`${VUE}/utils/day.js`, source(LANGS.slice(1, -1)));
  expect(run('hardcoded'), 1, /expected zh default and explicit/);
}));

const reviewedSnippet = "const protocol = { storedLabel: '持久化标识' };";
function writeDataException(write, overrides = {}) {
  write('scripts/i18n-data-exceptions.json', JSON.stringify([{
    file: 'reviewed.js', snippet: reviewedSnippet, occurrences: 1,
    reason: 'Fixture-only persisted identifier; display uses a separate dictionary key.',
    ...overrides
  }]));
  write(`${VUE}/reviewed.js`, reviewedSnippet + '\n');
}

test('exact data exceptions pass without skipping the file or adjacent UI', () => fixture(({ write, run }) => {
  writeDataException(write);
  expect(run('hardcoded'), 0, /DATA reviewed\.js: 1 reviewed records \/ 1 exact matches/);
  write(`${VUE}/reviewed.js`, reviewedSnippet + "\nexport const buttonLabel = '新增未翻译按钮';\n");
  expect(run('hardcoded'), 1, /reviewed\.js:2:.*buttonLabel/);
  write(`${VUE}/reviewed.js`, reviewedSnippet + " export const buttonLabel = '同一行的未翻译按钮';\n");
  expect(run('hardcoded'), 1, /reviewed\.js:1:.*buttonLabel/);
}));

test('identical strings in another file cannot inherit a data exception', () => fixture(({ write, run }) => {
  writeDataException(write);
  write(`${VUE}/another.js`, reviewedSnippet + '\n');
  expect(run('hardcoded'), 1, /another\.js:1:/);
}));

test('changed or translated exception values fail stale validation even with no CJK hits', () => fixture(({ write, run }) => {
  writeDataException(write);
  write(`${VUE}/reviewed.js`, reviewedSnippet.replace('持久化标识', '修改后的值') + '\n');
  expect(run('hardcoded'), 1, /FAIL data exception stale reviewed\.js: expected 1 exact occurrence\(s\), found 0/);
  write(`${VUE}/reviewed.js`, reviewedSnippet.replace('持久化标识', 'changed-wire-value') + '\n');
  const result = run('hardcoded');
  expect(result, 1, /data exception failures/);
  assert.match(result.output, /0 suspicious lines/);
}));

test('new occurrences and deletions invalidate reviewed counts', () => fixture(({ write, run }) => {
  writeDataException(write);
  write(`${VUE}/reviewed.js`, reviewedSnippet + '\n' + reviewedSnippet + '\n');
  expect(run('hardcoded'), 1, /expected 1 exact occurrence\(s\), found 2/);
  write(`${VUE}/reviewed.js`, 'export const removed = true;\n');
  expect(run('hardcoded'), 1, /expected 1 exact occurrence\(s\), found 0/);
}));

test('missing source files and missing exception manifests fail closed', () => fixture(({ dir, write, run }) => {
  writeDataException(write);
  rmSync(join(dir, VUE, 'reviewed.js'));
  expect(run('hardcoded'), 1, /stale reviewed\.js: source file missing/);
  rmSync(join(dir, 'scripts/i18n-data-exceptions.json'));
  expect(run('hardcoded'), 1, /cannot load i18n-data-exceptions\.json/);
}));

test('exception paths cannot be globs/traversals and records need reasons and positive counts', () => fixture(({ write, run }) => {
  for (const overrides of [{ file: '*.js' }, { file: '../reviewed.js' }, { occurrences: 0 }, { reason: '' }]) {
    writeDataException(write, overrides);
    expect(run('hardcoded'), 1, /exact file, nonempty snippet\/reason and positive occurrences required/);
  }
}));

test('data exception matching only normalizes LF/CRLF, never content or indentation', () => fixture(({ write, run }) => {
  const snippet = "const mapping = {\n  stored: '协议值'\n};";
  writeDataException(write, { snippet });
  write(`${VUE}/reviewed.js`, snippet.replace(/\n/g, '\r\n') + '\r\n');
  expect(run('hardcoded'), 0, /0 data exception failures/);
  write(`${VUE}/reviewed.js`, snippet.replace('  stored', ' stored') + '\n');
  expect(run('hardcoded'), 1, /FAIL data exception stale/);
}));

test('new text inserted inside an excepted data block invalidates the whole record', () => fixture(({ write, run }) => {
  const snippet = "const mapping = {\n  stored: '协议值'\n};";
  writeDataException(write, { snippet });
  write(`${VUE}/reviewed.js`, snippet.replace("'协议值'", "'协议值',\n  message: '真实新增界面文案'"));
  const result = run('hardcoded');
  expect(result, 1, /FAIL data exception stale/);
  assert.match(result.output, /message: '真实新增界面文案'/);
}));

test('hardcoded scans TypeScript source as well as Vue/JavaScript', () => fixture(({ write, run }) => {
  write(`${VUE}/fixture.ts`, "export const title: string = '未翻译标题';\n");
  expect(run('hardcoded'), 1, /fixture\.ts:1:/);
}));

test('verified six-language mail template resources are scoped and fail closed', () => fixture(({ write, run }) => {
  const resource = (langs) => `export const WELCOME_TEMPLATES = {\n${langs.map((lang) =>
    `${JSON.stringify(lang)}: { lang: ${JSON.stringify(lang)}, name: '资源名称', subject: '邮件主题', content: '<p>本地化内容</p>' }`
  ).join(',\n')}\n};\n`;
  write(`${VUE}/const/welcome-templates.js`, resource(LANGS));
  expect(run('hardcoded'), 0, /six language entries verified/);
  write(`${VUE}/const/welcome-templates.js`, resource(LANGS) + "export const extraUi = '未翻译界面';\n");
  expect(run('hardcoded'), 1, /extraUi/);
  write(`${VUE}/const/welcome-templates.js`, resource(LANGS.filter((lang) => lang !== 'nl')));
  expect(run('hardcoded'), 1, /FAIL resource.*expected exactly six language entries/);
}));
