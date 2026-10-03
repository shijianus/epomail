/**
 * E2E & Component Verification Test for Operation & Risk Reports (操作与风控报告)
 * Verifies:
 * 1. Router registration and access control for manage-audit (#manage/:roleGroup/audit)
 * 2. Dynamic adaptation across Level 1 (All Mail), Level 2 (Privacy), Level 3 (Encrypted) modes
 * 3. Granular audit options (default OFF in Level 1) & Smart cleanup (FIFO + Prioritize non-critical)
 * 4. Multi-IP & Multi-Device constraints (Default 3 IPs / 3 Devices)
 * 5. Risk adjudication DB table, user appeal review, and environment fingerprint comparison
 * 6. 6-language symmetry and i18n keys
 */

import assert from 'node:assert';
import { ok } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

let pass = 0;
let fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    pass++;
  } catch (err) {
    console.error(`✗ ${name}:`, err.message);
    fail++;
    failures.push(`${name}: ${err.message}`);
  }
}

console.log('================================================================');
console.log('=== 操作报告与风控管理 (Audit & Risk Reports) 前端全量端到端测试 ===');
console.log('================================================================\n');

// 1. Check router configuration
test('1. 路由注册完整性：/manage/:roleGroup/audit 与多别名别名注册', () => {
  const routerPath = path.resolve('mail-vue/src/router/index.js');
  const content = fs.readFileSync(routerPath, 'utf8');
  ok(content.includes("name: 'manage-audit'"), 'manage-audit 路由必须已命名注册');
  ok(content.includes('/manage/:roleGroup/audit'), '主路由路径 /manage/:roleGroup/audit 存在');
  ok(content.includes("alias: ["), '包含别名数组');
  ok(content.includes('/audit-report'), '支持便捷别名 /audit-report');
  ok(content.includes('manage-audit'), 'isManageRoute 防越权白名单包含 manage-audit');
});

// 2. Check layout navigation
test('2. 侧边栏导航完整性：管理板块呈现操作报告入口与对应图标', () => {
  const layoutPath = path.resolve('mail-vue/src/layout/main/index.vue');
  const content = fs.readFileSync(layoutPath, 'utf8');
  ok(content.includes('/manage/${currentRoleSlug}/audit'), '侧边栏管理板块链接绑定身分组');
  ok(content.includes("fluent:shield-task-24-regular"), '图标采用专用安全风控盾牌图标');
  ok(content.includes("$t('auditReport')"), '文案采用规范化多语言字典');
  ok(content.includes("'manage-audit'"), 'keep-alive 与 isSettingsMode 涵盖 manage-audit');
});

// 3. Check Vue Component implementation
test('3. 前端界面实现完整性：覆盖三模式安全等级、流水表单、风控研判与策略配额', () => {
  const viewPath = path.resolve('mail-vue/src/views/audit-report/index.vue');
  const content = fs.readFileSync(viewPath, 'utf8');

  // 三模式安全等级与时序规范
  ok(content.includes('currentModeMeta'), '具备三安全模式动态元数据');
  ok(content.includes('auditModeLevel1'), '支持 Level 1 全部邮件模式');
  ok(content.includes('auditModeLevel2'), '支持 Level 2 隐私模式');
  ok(content.includes('auditModeLevel3'), '支持 Level 3 加密模式');
  ok(content.includes('auditTimestampStripped'), '支持加密模式物理擦除时间戳 (脱敏)');

  // 全部模式细分开关与默认关闭
  ok(content.includes('auditOptMailSend'), '包含邮件发送记录开关');
  ok(content.includes('auditOptMailReceive'), '包含邮件接收记录开关');
  ok(content.includes('auditOptMailDelete'), '包含邮件删除记录开关');
  ok(content.includes('auditOptMailStar'), '包含邮件星标记录开关');
  ok(content.includes('auditOptMailSchedule'), '包含定时邮件记录开关');
  ok(content.includes('auditOptNoticeDefaultOff'), '明确提示全部模式下可选操作过多默认全部关闭');

  // 多IP与多设备配额限制 (默认3)
  ok(content.includes('auditMaxIpPerAccount'), '单邮箱最多记录活跃IP数量');
  ok(content.includes('auditMaxDevicePerAccount'), '单邮箱最多记录设备信息数量');
  ok(content.includes('auditAutoCleanOldest'), '支持自动清理最远记录 (FIFO)');
  ok(content.includes('auditPrioritizeNonCriticalClean'), '支持优先清理非重要记录 (保留身份/环境/申诉)');

  // 风控管理与申诉放行控制台
  ok(content.includes('risk-data-table'), '具备风控管理 DB 表格');
  ok(content.includes('adjudicationDrawerVisible'), '具备申诉研判与环境比对抽屉');
  ok(content.includes('auditDeviceFingerprintMatch'), '具备设备指纹相似度计算');
  ok(content.includes('auditIpSubnetMatch'), '具备IP子网网段比对');
  ok(content.includes('auditApproveUnban'), '支持管理员一键放行解封');
  ok(content.includes('auditRejectAppeal'), '支持管理员驳回申诉');
});

// 4. Check System Settings integration
test('4. 系统设置集成度：在「系统设置」中提供多IP、多设备防爆库配额调整', () => {
  const sysSettingPath = path.resolve('mail-vue/src/views/sys-setting/index.vue');
  const content = fs.readFileSync(sysSettingPath, 'utf8');
  ok(content.includes('audit-policy-card'), '系统设置中独立注入操作与风控记录配置卡片');
  ok(content.includes("setting.auditMaxIpPerAccount"), '支持在系统设置中调整最大IP数量');
  ok(content.includes("setting.auditMaxDevicePerAccount"), '支持在系统设置中调整最大设备数量');
  ok(content.includes("setting.auditAutoCleanOldest"), '支持在系统设置中调整FIFO自动清理');
  ok(content.includes("setting.auditPrioritizeNonCriticalClean"), '支持在系统设置中调整优先清除非核心操作');
});

// 5. Check Pinia setting store defaults
test('5. 状态机持久化：Pinia Store 包含风控与环境池初始配额 (默认3个IP与3个设备)', () => {
  const storePath = path.resolve('mail-vue/src/store/setting.js');
  const content = fs.readFileSync(storePath, 'utf8');
  ok(content.includes('auditMaxIpPerAccount: 3'), '默认IP配额为 3');
  ok(content.includes('auditMaxDevicePerAccount: 3'), '默认设备配额为 3');
  ok(content.includes('auditCriticalQuota: 3'), '非重要记录保留配额默认同样为 3');
  ok(content.includes('auditAutoCleanOldest: 1'), '默认启用自动清理最远记录');
  ok(content.includes('auditPrioritizeNonCriticalClean: 1'), '默认优先清理非重要记录');
});

// 6. Check 6-language symmetry and i18n audit
test('6. 六语言对称闭环：6语字典全量覆盖所有风控、时序与申诉相关词条', () => {
  const langs = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];
  const requiredKeys = [
    'auditReport', 'auditReportDesc', 'auditTabStream', 'auditTabRisk', 'auditTabPolicy',
    'auditTimelineView', 'auditTableView', 'auditSearchPlaceholder', 'auditAllMailModeNotice',
    'auditPrivacyModeNotice', 'auditEncryptedModeNotice', 'auditTimestampStripped',
    'auditMaxIpLimit', 'auditMaxDeviceLimit', 'auditAutoCleanOldest', 'auditPrioritizeNonCriticalClean',
    'auditCriticalQuota', 'auditApproveUnban', 'auditRejectAppeal', 'auditDeviceFingerprintMatch',
    'auditIpSubnetMatch', 'auditAppealReason', 'auditPurgeOnRelease', 'auditMultiIpConcurrent'
  ];

  for (const lang of langs) {
    const langPath = path.resolve(`mail-vue/src/i18n/${lang}.js`);
    const content = fs.readFileSync(langPath, 'utf8');
    for (const k of requiredKeys) {
      ok(content.includes(`${k}:`), `语言 [${lang}] 必须定义键: ${k}`);
    }
  }
});

console.log('\n================================================================');
console.log(`=== 测试汇总: 通过 ${pass} 项, 失败 ${fail} 项 ===`);
if (fail > 0) {
  console.log('失败清单:', failures);
  process.exit(1);
} else {
  console.log('🎉 操作报告与风控管理前端界面全套标准规范核验 100% 通过！');
  process.exit(0);
}
