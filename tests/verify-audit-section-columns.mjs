import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('====================================================================');
console.log('=== 核验：安全审计控制台 4 大板块与默认总表差异化列集精准验收 ===');
console.log('====================================================================\n');

const vuePath = path.resolve('mail-vue/src/views/audit-report/index.vue');
const vueContent = fs.readFileSync(vuePath, 'utf8');

// 1. 验证板块 1: 滥用威胁 (threat) - 10 列对齐列集工作台与 "00/00" 进度卡片
console.log('[验收 1: 滥用威胁 (threat)] 验证 10 列对齐列集与 00/00 进度...');
assert.ok(vueContent.includes("currentSection === 'threat'"), '支持 threat 板块专属列集判断');
assert.ok(vueContent.includes('key="threat-col-ticket"'), 'threat 具备工单编号列');
assert.ok(vueContent.includes('key="threat-col-identity"'), 'threat 具备身分组列');
assert.ok(vueContent.includes('key="threat-col-content"'), 'threat 具备违规内容列');
assert.ok(vueContent.includes('key="threat-col-reason"'), 'threat 具备报警原因列');
assert.ok(vueContent.includes('key="threat-col-alarm-count"'), 'threat 具备报警次数列');
assert.ok(vueContent.includes('key="threat-col-status"'), 'threat 具备当前状态列');
assert.ok(vueContent.includes('key="threat-col-alarm-time"'), 'threat 具备报警时间列');
assert.ok(vueContent.includes('key="threat-col-assignee"'), 'threat 具备负责人列');
assert.ok(vueContent.includes('key="threat-col-authority"'), 'threat 具备拍案管理列');
assert.ok(vueContent.includes('key="threat-col-action"'), 'threat 具备操作列');

// 验证 threat 列顺序: 工单编号 -> 身分组 -> 违规内容 -> 报警原因 -> 报警次数 -> 当前状态 -> 报警时间 -> 负责人 -> 拍案管理 -> 操作
const threatTicketIdx = vueContent.indexOf('key="threat-col-ticket"');
const threatIdentityIdx = vueContent.indexOf('key="threat-col-identity"');
const threatContentIdx = vueContent.indexOf('key="threat-col-content"');
const threatReasonIdx = vueContent.indexOf('key="threat-col-reason"');
const threatAlarmCountIdx = vueContent.indexOf('key="threat-col-alarm-count"');
const threatStatusIdx = vueContent.indexOf('key="threat-col-status"');
const threatAlarmTimeIdx = vueContent.indexOf('key="threat-col-alarm-time"');
const threatAssigneeIdx = vueContent.indexOf('key="threat-col-assignee"');
const threatAuthorityIdx = vueContent.indexOf('key="threat-col-authority"');
const threatActionIdx = vueContent.indexOf('key="threat-col-action"');

assert.ok(threatTicketIdx < threatIdentityIdx, '工单编号位于身分组之前');
assert.ok(threatIdentityIdx < threatContentIdx, '身分组位于违规内容之前');
assert.ok(threatContentIdx < threatReasonIdx, '违规内容位于报警原因之前');
assert.ok(threatReasonIdx < threatAlarmCountIdx, '报警原因位于报警次数之前');
assert.ok(threatAlarmCountIdx < threatStatusIdx, '报警次数位于当前状态之前');
assert.ok(threatStatusIdx < threatAlarmTimeIdx, '当前状态位于报警时间之前');
assert.ok(threatAlarmTimeIdx < threatAssigneeIdx, '报警时间位于负责人之前');
assert.ok(threatAssigneeIdx < threatAuthorityIdx, '负责人位于拍案管理之前');
assert.ok(threatAuthorityIdx < threatActionIdx, '拍案管理位于操作之前');

// 验证 KPI 卡片 1 的真实数据同步（非硬编码 00/00，直接展示原始整数）与违规内容简洁说明
assert.ok(vueContent.includes('summaryCounts.threat'), '滥用威胁 KPI 卡片直接展示真实处理数据 summaryCounts.threat');
assert.ok(vueContent.includes('getViolationContentSummary'), '违规内容通过 getViolationContentSummary 统一简洁处理');
console.log('  ✓ 滥用威胁 (threat) 10 列严格对齐，KPI 卡片真实数据同步与违规内容显式简洁\n');

// 2. 验证板块 2: 申诉审计 (appeal)
// 要求: 删除"报警原因"，将"报警次数"改为"申诉次数"，将"处理时间"改为"申请时间"，在后面添加"死局时间"
console.log('[验收 2: 申诉审计 (appeal)] 验证列集定制、申诉次数与死局时间...');
assert.ok(vueContent.includes("currentSection === 'appeal'"), '支持 appeal 板块专属列集判断');
assert.ok(vueContent.includes('key="appeal-col-ticket"'), 'appeal 具备工单编号列');
assert.ok(vueContent.includes('key="appeal-col-identity"'), 'appeal 具备身分组列');
assert.ok(vueContent.includes('key="appeal-col-category"'), 'appeal 具备违规分类列');
assert.ok(!vueContent.includes('key="appeal-col-reason"'), 'appeal 已删除报警原因列');
assert.ok(!vueContent.includes('key="appeal-col-alarm-count"'), 'appeal 已不使用通用报警次数列');
assert.ok(vueContent.includes('key="appeal-col-same-category-appeal-count"'), 'appeal 具备申诉次数列');
assert.ok(vueContent.includes('key="appeal-col-status"'), 'appeal 具备当前状态列');
assert.ok(vueContent.includes('key="appeal-col-suggestion"'), 'appeal 具备处理建议列');
assert.ok(!vueContent.includes('key="appeal-col-process-time"'), 'appeal 已将处理时间改为申请时间');
assert.ok(vueContent.includes('key="appeal-col-apply-time"'), 'appeal 具备申请时间列');
assert.ok(vueContent.includes('key="appeal-col-deadlock-time"'), 'appeal 具备死局时间列');
assert.ok(vueContent.includes('key="appeal-col-assignee"'), 'appeal 具备负责人列');
assert.ok(vueContent.includes('key="appeal-col-authority"'), 'appeal 具备拍案管理列');
assert.ok(vueContent.includes('key="appeal-col-action"'), 'appeal 具备操作列');

// 验证 appeal 列顺序与隔离
const appealApplyIdx = vueContent.indexOf('key="appeal-col-apply-time"');
const appealDeadlockIdx = vueContent.indexOf('key="appeal-col-deadlock-time"');
const appealAssigneeIdx = vueContent.indexOf('key="appeal-col-assignee"');
assert.ok(appealApplyIdx < appealDeadlockIdx, '死局时间必须位于申请时间之后');
assert.ok(appealDeadlockIdx < appealAssigneeIdx, '死局时间必须位于负责人之前');
assert.ok(vueContent.includes('getSameCategoryAppealCount'), '具备同类申诉次数获取逻辑');
assert.ok(vueContent.includes('getDeadlockInfo'), '具备死局时间计算逻辑');
assert.ok(vueContent.includes('isDeadlocked'), '具备死局判断逻辑');
console.log('  ✓ 申诉审计 (appeal) 报警原因已删除，已改用申诉次数，申请时间后添加死局时间\n');

// 3. 验证板块 3: 风险管理 (audit)
// 要求: 将"违规分类"改为"违规等级"(展示LV0~LV3)、"处理时间"改为"报警时间"，在其后面添加"过期时间"；删除"拍案管理"列；隔离"一人多号"
console.log('[验收 3: 风险管理 (audit)] 验证违规等级、报警时间、过期时间、删除拍案管理与隔离...');
assert.ok(vueContent.includes("currentSection === 'audit'"), '支持 audit 板块专属列集判断');
assert.ok(vueContent.includes('key="audit-col-ticket"'), 'audit 具备工单编号列');
assert.ok(vueContent.includes('key="audit-col-identity"'), 'audit 具备身分组列');
assert.ok(!vueContent.includes('key="audit-col-category"'), 'audit 已不使用违规分类');
assert.ok(vueContent.includes('key="audit-col-violation-level"'), 'audit 具备违规等级列 (展示LV0~LV3)');
assert.ok(vueContent.includes('getViolationLevel'), '具备粗略违规等级 (LV0~LV3) 计算逻辑');
assert.ok(vueContent.includes('key="audit-col-reason"'), 'audit 具备报警原因列');
assert.ok(vueContent.includes('key="audit-col-alarm-count"'), 'audit 具备报警次数列');
assert.ok(vueContent.includes('key="audit-col-status"'), 'audit 具备当前状态列');
assert.ok(vueContent.includes('key="audit-col-suggestion"'), 'audit 具备处理建议列');
assert.ok(!vueContent.includes('key="audit-col-process-time"'), 'audit 已将处理时间改为报警时间');
assert.ok(vueContent.includes('key="audit-col-alarm-time"'), 'audit 具备报警时间列');
assert.ok(vueContent.includes('key="audit-col-expire-time"'), 'audit 具备过期时间列');
assert.ok(vueContent.includes('key="audit-col-assignee"'), 'audit 具备负责人列');
assert.ok(!vueContent.includes('key="audit-col-authority"'), 'audit 已按要求彻底删除拍案管理列');
assert.ok(vueContent.includes('key="audit-col-action"'), 'audit 具备操作列');

// 验证 audit 列顺序：报警时间 -> 过期时间 -> 负责人 -> 操作
const auditAlarmIdx = vueContent.indexOf('key="audit-col-alarm-time"');
const auditExpireIdx = vueContent.indexOf('key="audit-col-expire-time"');
const auditAssigneeIdx = vueContent.indexOf('key="audit-col-assignee"');
const auditActionIdx = vueContent.indexOf('key="audit-col-action"');
assert.ok(auditAlarmIdx < auditExpireIdx, '过期时间必须位于报警时间之后');
assert.ok(auditExpireIdx < auditAssigneeIdx, '过期时间必须位于负责人之前');
assert.ok(auditAssigneeIdx < auditActionIdx, '负责人必须位于操作之前');

// 验证 audit 报警原因下拉不包含 multi_account (一人多号属于滥用威胁，做严格隔离)
const auditReasonStart = vueContent.indexOf('key="audit-col-reason"');
const auditReasonEnd = vueContent.indexOf('key="audit-col-alarm-count"');
const auditReasonBlock = vueContent.slice(auditReasonStart, auditReasonEnd);
assert.ok(!auditReasonBlock.includes('command="multi_account"'), '风险管理报警原因筛选下拉已剔除一人多号(隔离至滥用威胁)');
console.log('  ✓ 风险管理 (audit) 违规分类改为违规等级，报警时间后添加过期时间，拍案管理列已成功删除\n');

// 4. 验证板块 4: 操作记录 (record)
// 要求: 删除"处理建议"，在"处理时间"添加"死局时间"，删除"申诉次数"
console.log('[验收 4: 操作记录 (record)] 验证删除处理建议与申诉次数，在处理时间后添加死局时间...');
assert.ok(vueContent.includes("currentSection === 'record'"), '支持 record 板块专属列集判断');
assert.ok(vueContent.includes('key="record-col-ticket"'), 'record 具备工单编号列');
assert.ok(vueContent.includes('key="record-col-identity"'), 'record 具备身分组列');
assert.ok(vueContent.includes('key="record-col-category"'), 'record 具备违规分类列');
assert.ok(!vueContent.includes('key="record-col-reason"'), 'record 已删除报警原因列');
assert.ok(!vueContent.includes('key="record-col-alarm-count"'), 'record 已删除报警次数列');
assert.ok(!vueContent.includes('key="record-col-suggestion"'), 'record 已删除处理建议列');
assert.ok(vueContent.includes('key="record-col-status"'), 'record 具备当前状态列');
assert.ok(vueContent.includes('key="record-col-update-count"'), 'record 具备更新次数列');
assert.ok(vueContent.includes('key="record-col-last-updated"'), 'record 具备最后更新列');
assert.ok(!vueContent.includes('key="record-col-appeal-count"'), 'record 已按要求彻底删除申诉次数列');
assert.ok(vueContent.includes('key="record-col-process-time"'), 'record 具备处理时间列');
assert.ok(vueContent.includes('key="record-col-deadlock-time"'), 'record 具备死局时间列');
assert.ok(vueContent.includes('key="record-col-assignee"'), 'record 具备负责人列');
assert.ok(vueContent.includes('key="record-col-authority"'), 'record 具备拍案管理列');
assert.ok(vueContent.includes('key="record-col-action"'), 'record 具备操作列');

// 验证 record 列顺序：处理时间 -> 死局时间 -> 负责人
const recordProcessIdx = vueContent.indexOf('key="record-col-process-time"');
const recordDeadlockIdx = vueContent.indexOf('key="record-col-deadlock-time"');
const recordAssigneeIdx = vueContent.indexOf('key="record-col-assignee"');
assert.ok(recordProcessIdx < recordDeadlockIdx, '死局时间必须位于处理时间之后');
assert.ok(recordDeadlockIdx < recordAssigneeIdx, '死局时间必须位于负责人之前');
console.log('  ✓ 操作记录 (record) 处理建议与申诉次数已删除，处理时间后已添加死局时间列\n');

// 5. 验证默认列集 (currentSection === 'all')
// 要求: 删除"报警次数""处理建议"，将"违规分类"改为"违规等级"(包含LV0~LV3以及Threat)，在"处理时间"后添加"死局时间"，包含全部筛选条件，统一每条只能出现1次(整合去重)
console.log('[验收 5: 默认列集 (all)] 验证默认状态专属列集、全部筛选条件与去重整合...');
assert.ok(vueContent.includes("currentSection === 'all'"), '支持 all 默认状态专属列集判断');
assert.ok(vueContent.includes('key="default-col-ticket"'), '默认列集具备工单编号列');
assert.ok(vueContent.includes('key="default-col-identity"'), '默认列集具备身分组列');
assert.ok(!vueContent.includes('key="default-col-category"'), '默认列集已将违规分类改为违规等级');
assert.ok(vueContent.includes('key="default-col-violation-level"'), '默认列集具备违规等级列');
assert.ok(!vueContent.includes('key="default-col-alarm-count"'), '默认列集已删除报警次数');
assert.ok(vueContent.includes('key="default-col-reason"'), '默认列集具备报警原因列');
assert.ok(vueContent.includes('key="default-col-status"'), '默认列集具备当前状态列');
assert.ok(!vueContent.includes('key="default-col-suggestion"'), '默认列集已删除处理建议');
assert.ok(vueContent.includes('key="default-col-process-time"'), '默认列集具备处理时间列');
assert.ok(vueContent.includes('key="default-col-deadlock-time"'), '默认列集具备死局时间列');
assert.ok(vueContent.includes('key="default-col-assignee"'), '默认列集具备负责人列');
assert.ok(vueContent.includes('key="default-col-authority"'), '默认列集具备拍案管理列');
assert.ok(vueContent.includes('key="default-col-action"'), '默认列集具备操作列');

// 验证默认列集顺序：处理时间 -> 死局时间 -> 负责人
const defaultProcessIdx = vueContent.indexOf('key="default-col-process-time"');
const defaultDeadlockIdx = vueContent.indexOf('key="default-col-deadlock-time"');
const defaultAssigneeIdx = vueContent.indexOf('key="default-col-assignee"');
assert.ok(defaultProcessIdx < defaultDeadlockIdx, '默认列集中死局时间必须位于处理时间之后');
assert.ok(defaultDeadlockIdx < defaultAssigneeIdx, '默认列集中死局时间必须位于负责人之前');

// 验证违规等级包含 LV0~LV3 与 Threat
const defaultLevelStart = vueContent.indexOf('key="default-col-violation-level"');
const defaultLevelEnd = vueContent.indexOf('key="default-col-reason"');
const defaultLevelBlock = vueContent.slice(defaultLevelStart, defaultLevelEnd);
assert.ok(defaultLevelBlock.includes('command="threat"'), '默认违规等级筛选包含 Threat(滥用威胁)');
assert.ok(defaultLevelBlock.includes('command="lv3"'), '默认违规等级筛选包含 lv3');
assert.ok(defaultLevelBlock.includes('command="lv2"'), '默认违规等级筛选包含 lv2');
assert.ok(defaultLevelBlock.includes('command="lv1"'), '默认违规等级筛选包含 lv1');
assert.ok(defaultLevelBlock.includes('command="lv0"'), '默认违规等级筛选包含 lv0');
assert.ok(vueContent.includes('getDefaultViolationLevel'), '具备全量默认违规等级(LV0~LV3+Threat)渲染函数');

// 验证默认状态前端去重整合 (每条只能出现1次)
assert.ok(vueContent.includes("currentSection.value === 'all'"), '具备 currentSection === all 前端去重判定');
console.log('  ✓ 默认列集 (all) 删除报警次数与处理建议，违规分类改为违规等级(含LV0~LV3与Threat)，处理时间后添加死局时间，具备完整筛选与去重整合\n');

// 6. 验证 i18n 6 语言对称性
console.log('[验收 6: 多语言词条体系] 验证 6 语言对称且覆盖全部新词条...');
const languages = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];
const requiredKeys = [
  'auditColSameCategoryAppealCount',
  'auditColViolationContent',
  'auditColApplyTime',
  'auditColAlarmTime',
  'auditColDeadlockTime',
  'auditLevelThreat',
  'auditDeadlocked',
  'auditDeadlockDaysLeft',
  'auditDeadlockHoursLeft',
  'auditAllSameCategoryAppealCounts',
  'auditColViolationLevel',
  'auditColExpireTime',
  'auditColUpdateCount',
  'auditColLastUpdated',
  'auditColAppealCount',
  'abuseKpiStatFormat'
];

for (const lang of languages) {
  const langPath = path.resolve(`mail-vue/src/i18n/${lang}.js`);
  const content = fs.readFileSync(langPath, 'utf8');
  for (const k of requiredKeys) {
    assert.ok(content.includes(`${k}:`), `语言 ${lang} 必须包含键 ${k}`);
  }
}
console.log('  ✓ 全部 6 种语言 (zh, zh-Hant, en, es, fr, nl) 100% 覆盖全部新增与修改词条\n');

// 7. 验证后端服务层扩展
console.log('[验收 7: 后端服务层扩展] 验证 audit-service 字段计算、筛选与去重...');
const servicePath = path.resolve('mail-worker/src/service/audit-service.js');
const serviceContent = fs.readFileSync(servicePath, 'utf8');
assert.ok(serviceContent.includes('deadlockTime'), '后端支持 deadlockTime 死局时间计算');
assert.ok(serviceContent.includes('sameCategoryAppealCount'), '后端支持 sameCategoryAppealCount 计算');
assert.ok(serviceContent.includes('expireTime'), '后端支持 expireTime 过期时间');
assert.ok(serviceContent.includes('violationLevel'), '后端支持 violationLevel 等级过滤');
assert.ok(serviceContent.includes('seenEmails.add(key)'), '后端支持 warningType=all 默认全量跨板块排重整合');
console.log('  ✓ 后端数据契约与计算字段扩展完备\n');

console.log('====================================================================');
console.log('=== 恭喜！操作报告 4 大板块与默认列集精准定制全部断言 100% 通过！ ===');
console.log('====================================================================\n');
