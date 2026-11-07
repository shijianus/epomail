import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const vueRequire = createRequire(new URL('../mail-vue/package.json', import.meta.url));
const { parse, babelParse } = vueRequire('vue/compiler-sfc');
const readVue = path => readFileSync(new URL(`../mail-vue/src/${path}`, import.meta.url), 'utf8');

function parseScript(path) {
  const source = readVue(path);
  const parsed = parse(source, { filename: path });
  assert.deepEqual(parsed.errors, []);
  return { source, script: parsed.descriptor.scriptSetup.content, ast: babelParse(parsed.descriptor.scriptSetup.content, { sourceType: 'module' }) };
}

function productionFunction(module, name, bindings) {
  const declaration = module.ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id?.name === name);
  assert.ok(declaration, `Expected production function ${name}`);
  return new Function(...Object.keys(bindings), `${module.script.slice(declaration.start, declaration.end)}\nreturn ${name};`)(...Object.values(bindings));
}

function productionComputed(module, name, props, isVisitor) {
  const declaration = module.ast.program.body
    .flatMap(node => node.type === 'VariableDeclaration' ? node.declarations : [])
    .find(node => node.id.type === 'Identifier' && node.id.name === name);
  assert.ok(declaration, `Expected production computed value ${name}`);
  const computed = getter => ({ get value() { return getter(); } });
  return new Function('computed', 'props', 'isVisitor', `return ${module.script.slice(declaration.init.start, declaration.init.end)};`)(
    computed, { selectedRow: props }, { value: isVisitor }
  ).value;
}

const auditIndex = parseScript('views/audit-report/index.vue');
const drawer = parseScript('views/audit-report/components/audit-detail-drawer.vue');

test('visitor list displays unknown operator and alarm count as a dash', () => {
  const visitor = { value: true };
  const getAlarmCount = productionFunction(auditIndex, 'getAlarmCount', { isVisitor: visitor });
  const getOperatorName = productionFunction(auditIndex, 'getOperatorName', { isVisitor: visitor });
  const row = { status: 'banned' };

  assert.equal(getAlarmCount(row), '—');
  assert.equal(getAlarmCount(null), '—');
  assert.equal(getOperatorName(row), '—');
  assert.equal(getAlarmCount({ reportedByOthers: 5 }), 5);
  assert.equal(getOperatorName({ operator: 'Recorded operator' }), 'Recorded operator');
  assert.equal((auditIndex.source.match(/<template v-if="getAlarmCount\(row\) !== '—'">/g) || []).length, 2);
  const operatorCallbacks = [...auditIndex.source.matchAll(/@click\.stop="([^"]*handleView(?:Operator|Adjudicator)\(row\)[^"]*)"/g)];
  assert.ok(operatorCallbacks.length > 0);
  assert.ok(operatorCallbacks.every(([, expression]) => expression.startsWith('!isVisitor && ')));
});

test('visitor drawer displays unknown authority and alarm count as a dash', () => {
  const row = { status: 'banned' };
  assert.equal(productionComputed(drawer, 'authorityValue', row, true), '—');
  assert.equal(productionComputed(drawer, 'alarmCountValue', row, true), '—');
  assert.equal(productionComputed(drawer, 'alarmCountValue', { reportedByOthers: 4 }, true), 4);
  assert.ok(drawer.source.includes("alarmCountValue !== '—'"), 'dash must not be followed by a fabricated times-unit count');
});

test('administrator list and drawer retain existing fallbacks', () => {
  const getAlarmCount = productionFunction(auditIndex, 'getAlarmCount', { isVisitor: { value: false } });
  const getOperatorName = productionFunction(auditIndex, 'getOperatorName', { isVisitor: { value: false } });
  assert.equal(getAlarmCount({ eventType: 'auto_ban' }), 4);
  assert.equal(getOperatorName({ status: 'banned' }), 'System Bot');
  assert.equal(productionComputed(drawer, 'authorityValue', { status: 'pending' }, false), 'SecAdmin');
  assert.equal(productionComputed(drawer, 'alarmCountValue', { status: 'pending' }, false), 1);
});
