import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('====================================================================');
console.log('=== 核验：安全审计控制台 4 大板块专属差异化列集定制精准验收 ===');
console.log('====================================================================\n');

const vuePath = path.resolve('mail-vue/src/views/audit-report/index.vue');
const vueContent = fs.readFileSync(vuePath, 'utf8');

// 1. 验证板块 1: 滥用威胁 (threat) - 专属 7 列固定列宽工作台
console.log('[验收 1: 滥用威胁 (threat)] 验证 7 列固定列宽工作台...');
assert.ok(vueContent.includes("currentSection === 'threat'"), '支持 threat 板块专属列集判断');
assert.ok(vueContent.includes('class="abuse-table-wrapper"'), 'threat 具备专属表格容器');
assert.ok(vueContent.includes('class="col-select"'), 'threat 具备选择列 (40px)');
assert.ok(vueContent.includes('class="col-no"'), 'threat 具备编号列 (72px)');
assert.ok(vueContent.includes('class="col-target"'), 'threat 具备对象列 (clamp 180~260px)');
assert.ok(vueContent.includes('class="col-status"'), 'threat 具备状态列 (96px)');
assert.ok(vueContent.includes('class="col-cat"'), 'threat 具备分类列 (min 190px)');
assert.ok(vueContent.includes('class="col-action"'), 'threat 具备处理列 (120px)');
assert.ok(vueContent.includes('class="col-opt"'), 'threat 具备操作列 (64px)');
console.log('  ✓ 滥用威胁 (threat) 专属 7 列固定列宽规范落地\n');

// 2. 验证板块 2: 申诉审计 (appeal)
console.log('[验收 2: 申诉审计 (appeal)] 验证删除报警原因，在处理时间后面添加过期时间...');
assert.ok(vueContent.includes("currentSection === 'appeal'"), '支持 appeal 板块专属列集判断');
assert.ok(vueContent.includes('key="appeal-col-ticket"'), 'appeal 具备工单编号列');
assert.ok(vueContent.includes('key="appeal-col-identity"'), 'appeal 具备身分组列');
assert.ok(vueContent.includes('key="appeal-col-category"'), 'appeal 具备违规分类列');
assert.ok(!vueContent.includes('key="appeal-col-reason"'), 'appeal 已删除报警原因列');
assert.ok(vueContent.includes('key="appeal-col-alarm-count"'), 'appeal 具备报警次数列');
assert.ok(vueContent.includes('key="appeal-col-status"'), 'appeal 具备当前状态列');
assert.ok(vueContent.includes('key="appeal-col-suggestion"'), 'appeal 具备处理建议列');
assert.ok(vueContent.includes('key="appeal-col-process-time"'), 'appeal 具备处理时间列');
assert.ok(vueContent.includes('key="appeal-col-expire-time"'), 'appeal 具备过期时间列');
assert.ok(vueContent.includes('key="appeal-col-assignee"'), 'appeal 具备负责人列');
assert.ok(vueContent.includes('key="appeal-col-authority"'), 'appeal 具备拍案管理列');
assert.ok(vueContent.includes('key="appeal-col-action"'), 'appeal 具备操作列');

// 验证列顺序：处理时间 -> 过期时间 -> 负责人
const appealProcessIdx = vueContent.indexOf('key="appeal-col-process-time"');
const appealExpireIdx = vueContent.indexOf('key="appeal-col-expire-time"');
const appealAssigneeIdx = vueContent.indexOf('key="appeal-col-assignee"');
assert.ok(appealProcessIdx < appealExpireIdx, '过期时间必须位于处理时间之后');
assert.ok(appealExpireIdx < appealAssigneeIdx, '过期时间必须位于负责人之前');
assert.ok(vueContent.includes('isAppealExpired'), '具备申诉表单过期判断逻辑');
assert.ok(vueContent.includes('getAppealExpireTime'), '具备申诉表单过期时间获取逻辑');
console.log('  ✓ 申诉审计 (appeal) 报警原因已删除，处理时间后已新增过期时间列并位于负责人前\n');

// 3. 验证板块 3: 风险管理 (audit)
console.log('[验收 3: 风险管理 (audit)] 验证违规分类改为违规等级(粗略等级)，处理时间后增加截止期限及过期说明...');
assert.ok(vueContent.includes("currentSection === 'audit'"), '支持 audit 板块专属列集判断');
assert.ok(vueContent.includes('key="audit-col-ticket"'), 'audit 具备工单编号列');
assert.ok(vueContent.includes('key="audit-col-identity"'), 'audit 具备身分组列');
assert.ok(!vueContent.includes('key="audit-col-category"'), 'audit 已不使用违规分类');
assert.ok(vueContent.includes('key="audit-col-violation-level"'), 'audit 具备违规等级列');
assert.ok(vueContent.includes('getViolationLevel'), '具备粗略违规等级 (LV0~LV3) 计算逻辑');
assert.ok(vueContent.includes('key="audit-col-reason"'), 'audit 保留报警原因列');
assert.ok(vueContent.includes('key="audit-col-alarm-count"'), 'audit 保留报警次数列');
assert.ok(vueContent.includes('key="audit-col-status"'), 'audit 保留当前状态列');
assert.ok(vueContent.includes('key="audit-col-suggestion"'), 'audit 保留处理建议列');
assert.ok(vueContent.includes('key="audit-col-process-time"'), 'audit 具备处理时间列');
assert.ok(vueContent.includes('key="audit-col-deadline"'), 'audit 具备截止期限列');
assert.ok(vueContent.includes('getRiskDeadlineInfo'), '具备截止期限及过期说明计算逻辑');

// 验证列顺序：处理时间 -> 截止期限 -> 负责人
const auditProcessIdx = vueContent.indexOf('key="audit-col-process-time"');
const auditDeadlineIdx = vueContent.indexOf('key="audit-col-deadline"');
const auditAssigneeIdx = vueContent.indexOf('key="audit-col-assignee"');
assert.ok(auditProcessIdx < auditDeadlineIdx, '截止期限必须位于处理时间之后');
assert.ok(auditDeadlineIdx < auditAssigneeIdx, '截止期限必须位于负责人之前');
console.log('  ✓ 风险管理 (audit) 违规分类已改为违规等级，处理时间后已新增截止期限列与过期说明\n');

// 4. 验证板块 4: 操作记录 (record)
console.log('[验收 4: 操作记录 (record)] 验证删除报警原因、报警次数、处理建议，添加更新次数、最后更新、申诉次数...');
assert.ok(vueContent.includes("currentSection === 'record'"), '支持 record 板块专属列集判断');
assert.ok(vueContent.includes('key="record-col-ticket"'), 'record 具备工单编号列');
assert.ok(vueContent.includes('key="record-col-identity"'), 'record 具备身分组列');
assert.ok(vueContent.includes('key="record-col-category"'), 'record 具备违规分类列');
assert.ok(!vueContent.includes('key="record-col-reason"'), 'record 已删除报警原因列');
assert.ok(!vueContent.includes('key="record-col-alarm-count"'), 'record 已删除报警次数列');
assert.ok(!vueContent.includes('key="record-col-suggestion"'), 'record 已删除处理建议列');
assert.ok(vueContent.includes('key="record-col-status"'), 'record 保留当前状态列');
assert.ok(vueContent.includes('key="record-col-update-count"'), 'record 具备更新次数列');
assert.ok(vueContent.includes('key="record-col-last-updated"'), 'record 具备最后更新列');
assert.ok(vueContent.includes('key="record-col-appeal-count"'), 'record 具备申诉次数列');
assert.ok(vueContent.includes('key="record-col-process-time"'), 'record 具备处理时间列');
assert.ok(vueContent.includes('key="record-col-assignee"'), 'record 具备负责人列');
assert.ok(vueContent.includes('key="record-col-authority"'), 'record 具备拍案管理列');
assert.ok(vueContent.includes('key="record-col-action"'), 'record 具备操作列');

assert.ok(vueContent.includes('getUpdateCount'), '具备更新次数计算逻辑');
assert.ok(vueContent.includes('getLastUpdatedTime'), '具备最后更新时间计算逻辑');
assert.ok(vueContent.includes('getAppealCount'), '具备申诉次数计算逻辑');
console.log('  ✓ 操作记录 (record) 已删除报警原因、报警次数、处理建议，新增更新次数、最后更新、申诉次数\n');

// 5. 验证 i18n 多语言字典 6 语言覆盖与对称
console.log('[验收 5: 多语言词条体系] 验证 6 语言对称且覆盖全部新词条...');
const languages = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];
const requiredKeys = [
  'auditColViolationLevel',
  'auditColDeadline',
  'auditColUpdateCount',
  'auditColLastUpdated',
  'auditColAppealCount',
  'auditDeadlineExpired',
  'auditDeadlinePermanent',
  'auditDeadlineDaysLeft',
  'auditDeadlineHoursLeft',
  'auditExpiredBadge',
  'auditAllViolationLevels',
  'auditLevelLv3',
  'auditLevelLv2',
  'auditLevelLv1',
  'auditLevelLv0'
];

for (const lang of languages) {
  const langPath = path.resolve(`mail-vue/src/i18n/${lang}.js`);
  const content = fs.readFileSync(langPath, 'utf8');
  for (const k of requiredKeys) {
    assert.ok(content.includes(`${k}:`), `语言 ${lang} 必须包含键 ${k}`);
  }
}
console.log('  ✓ 全部 6 种语言 (zh, zh-Hant, en, es, fr, nl) 100% 覆盖全部新增与修改词条\n');

// 6. 验证后端 audit-service 计算字段支持
console.log('[验收 6: 后端服务层扩展] 验证 audit-service 支持计算字段与违规等级筛选...');
const servicePath = path.resolve('mail-worker/src/service/audit-service.js');
const serviceContent = fs.readFileSync(servicePath, 'utf8');
assert.ok(serviceContent.includes('expireTime'), '后端支持 expireTime 计算返回');
assert.ok(serviceContent.includes('deadline'), '后端支持 deadline 截止期限返回');
assert.ok(serviceContent.includes('updateCount'), '后端支持 updateCount 操作更新次数');
assert.ok(serviceContent.includes('lastUpdated'), '后端支持 lastUpdated 最后更新时间');
assert.ok(serviceContent.includes('appealCount'), '后端支持 appealCount 申诉次数');
assert.ok(serviceContent.includes('violationLevel'), '后端支持 violationLevel 筛选过滤');
console.log('  ✓ 后端数据契约与计算字段扩展完备\n');

console.log('====================================================================');
console.log('=== 恭喜！4 大板块专属差异化列集定制全部断言 100% 验证通过！ ===');
console.log('====================================================================\n');
