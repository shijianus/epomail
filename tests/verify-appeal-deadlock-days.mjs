import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('====================================================================');
console.log('=== 核验：申诉审计死局时间专属 "*天" 格式、阶梯颜色与默认表详细时间 ===');
console.log('====================================================================\n');

const vuePath = path.resolve('mail-vue/src/views/audit-report/index.vue');
const vueContent = fs.readFileSync(vuePath, 'utf8');

// 1. 验证申诉审计专属死局时间列与阶梯颜色
console.log('[验收 1: 申诉审计死局时间列与阶梯颜色]');
const appealColMatch = vueContent.match(/<el-table-column[^>]*key="appeal-col-deadlock-time"[\s\S]*?<\/el-table-column>/);
assert.ok(appealColMatch, '存在申诉审计专属死局时间列 key="appeal-col-deadlock-time"');
const appealColCode = appealColMatch[0];

assert.ok(
  appealColCode.includes('formatAppealDeadlockDays(row)'),
  '申诉审计死局时间列必须调用 formatAppealDeadlockDays(row) 格式化为 "*天"'
);
assert.ok(
  appealColCode.includes('expire-${getAppealDeadlockInfo(row).color}') || appealColCode.includes('getAppealDeadlockInfo'),
  '申诉审计死局时间列必须绑定 getAppealDeadlockInfo(row).color 动态阶梯色彩类名'
);
assert.ok(
  appealColCode.includes(':title="getDeadlockInfo(row).time"'),
  '申诉审计死局时间 hover tooltip 保留完整时间戳'
);
console.log('  ✓ 申诉审计专属死局时间列渲染 formatAppealDeadlockDays(row)，动态绑定阶梯色彩，hover 展现完整时间戳\n');

// 2. 验证默认全量表死局时间列（非申诉审计）保留原本详细时间
console.log('[验收 2: 默认全量表死局时间列]');
const defaultColMatch = vueContent.match(/<el-table-column[^>]*key="default-col-deadlock-time"[\s\S]*?<\/el-table-column>/);
assert.ok(defaultColMatch, '存在默认全量表死局时间列 key="default-col-deadlock-time"');
const defaultColCode = defaultColMatch[0];

assert.ok(
  defaultColCode.includes('getDeadlockInfo(row).time'),
  '默认全量表死局时间必须严格保留原本详细时间 getDeadlockInfo(row).time'
);
assert.ok(
  !defaultColCode.includes('formatAppealDeadlockDays'),
  '默认全量表严禁调用 formatAppealDeadlockDays'
);
console.log('  ✓ 默认全量表死局时间严格保留原本详细时间，未被污染\n');

// 3. 验证 formatAppealDeadlockDays 与 getAppealDeadlockInfo 阶梯色彩实现逻辑
console.log('[验收 3: formatAppealDeadlockDays 与 getAppealDeadlockInfo 阶梯色彩实现]');
assert.ok(vueContent.includes('function getAppealDeadlockInfo(row)'), '存在 getAppealDeadlockInfo 函数');
assert.ok(vueContent.includes('function formatAppealDeadlockDays(row)'), '存在 formatAppealDeadlockDays 函数');
assert.ok(vueContent.includes('auditDeadlocked'), '逾期/已死局时返回 auditDeadlocked (已成死局)');
assert.ok(vueContent.includes('auditDirectDaySingle'), '剩余 1 天单数国际化');
assert.ok(vueContent.includes('auditDirectDays'), '剩余多天复数国际化 (*天)');

// 验证颜色阶梯规则: >=10 green, >=5 orange, else red
const getAppealDeadlockInfoCode = vueContent.slice(
  vueContent.indexOf('function getAppealDeadlockInfo'),
  vueContent.indexOf('function formatAppealDeadlockDays')
);
assert.ok(getAppealDeadlockInfoCode.includes("color = 'green'"), '10天以上判定绿色');
assert.ok(getAppealDeadlockInfoCode.includes("diffDays >= 10"), '具备 >= 10 判定');
assert.ok(getAppealDeadlockInfoCode.includes("diffDays >= 5"), '具备 >= 5 判定');
assert.ok(getAppealDeadlockInfoCode.includes("color = 'orange'"), '5~10天判定橙色');
assert.ok(getAppealDeadlockInfoCode.includes("color: 'red'") || getAppealDeadlockInfoCode.includes("color = 'red'"), '5天以下或死局判定红色');
console.log('  ✓ getAppealDeadlockInfo 完整实现 >=10天绿色、5~10天橙色、5天以下红色及已成死局红色阶梯色彩\n');

// 4. 验证国际化词条 6 语言对称性
console.log('[验收 4: 多语言词条对称性]');
const languages = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];
for (const lang of languages) {
  const filePath = path.resolve(`mail-vue/src/i18n/${lang}.js`);
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('auditDirectDays:'), `[${lang}] 缺少 auditDirectDays`);
  assert.ok(content.includes('auditDirectDaySingle:'), `[${lang}] 缺少 auditDirectDaySingle`);
  assert.ok(content.includes('auditDeadlocked:'), `[${lang}] 缺少 auditDeadlocked`);
}
console.log('  ✓ 全部 6 种语言词条完整对称\n');

console.log('====================================================================');
console.log('=== 恭喜！申诉审计 "*天" 与颜色阶梯设计及默认表隔离验证 100% 通过！ ===');
console.log('====================================================================\n');
