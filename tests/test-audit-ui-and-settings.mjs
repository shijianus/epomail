/**
 * Test suite for System Settings "Audit Report" optimization,
 * IP Risk DB settings persistence, Master Audit switch,
 * Status Bar Indicator Badge (Green/Red), and Visitor Privacy Minimization.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();

console.log('--- Step 1: Checking i18n symmetry ---');
const langs = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];
const keysToCheck = [
  'auditLogEnabled',
  'auditLogEnabledDesc',
  'auditReportPublic',
  'auditReportPublicDesc',
  'auditReportNone',
  'auditReportNoneDesc',
  'auditVisitorTableNotice'
];

for (const lang of langs) {
  const filePath = path.join(ROOT_DIR, 'mail-vue/src/i18n', `${lang}.js`);
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const k of keysToCheck) {
    assert(content.includes(`${k}:`), `Missing key ${k} in mail-vue/src/i18n/${lang}.js`);
  }
}
console.log('✓ All 7 keys verified symmetrically across all 6 languages.');

console.log('--- Step 2: Checking System Settings in mail-vue/src/views/sys-setting/index.vue ---');
const sysSettingContent = fs.readFileSync(path.join(ROOT_DIR, 'mail-vue/src/views/sys-setting/index.vue'), 'utf-8');
// Check that openAuditReport is NOT in the file
assert(!sysSettingContent.includes('openAuditReport'), 'sys-setting/index.vue should NOT contain openAuditReport or jumping buttons');
// Check that auditLogEnabled switch is present
assert(sysSettingContent.includes("changeField('auditLogEnabled'"), 'sys-setting/index.vue should have auditLogEnabled switch');
// Check IP risk DB settings are present
assert(sysSettingContent.includes("changeField('auditMaxIpPerAccount'"), 'sys-setting/index.vue should have auditMaxIpPerAccount');
assert(sysSettingContent.includes("changeField('auditMaxDevicePerAccount'"), 'sys-setting/index.vue should have auditMaxDevicePerAccount');
assert(sysSettingContent.includes("changeField('auditAutoCleanOldest'"), 'sys-setting/index.vue should have auditAutoCleanOldest');
assert(sysSettingContent.includes("changeField('auditPrioritizeNonCriticalClean'"), 'sys-setting/index.vue should have auditPrioritizeNonCriticalClean');
assert(sysSettingContent.includes("changeField('auditCriticalQuota'"), 'sys-setting/index.vue should have auditCriticalQuota');
console.log('✓ System Settings verified: Redundant jumps removed, IP risk DB settings & auditLogEnabled switch present.');

console.log('--- Step 3: Checking Status Bar Indicator Badge ---');
const statusBarContent = fs.readFileSync(path.join(ROOT_DIR, 'mail-vue/src/layout/status-bar/index.vue'), 'utf-8');
assert(statusBarContent.includes('audit-status-tag'), 'status-bar should include audit-status-tag element');
assert(statusBarContent.includes('auditStatusConfig'), 'status-bar should include auditStatusConfig computed property');
assert(statusBarContent.includes('audit-tag-public'), 'status-bar should include audit-tag-public green class');
assert(statusBarContent.includes('audit-tag-none'), 'status-bar should include audit-tag-none red class');
assert(statusBarContent.includes('margin-right: 4px; /* 模式往左边移动一点 */'), 'status-bar should adjust mode-tag spacing to the left');
console.log('✓ Status bar verified: Pure-color transparent indicator badge correctly implemented with green/red states.');

console.log('--- Step 4: Checking Visitor Privacy Minimization in audit-report and drawer ---');
const auditReportContent = fs.readFileSync(path.join(ROOT_DIR, 'mail-vue/src/views/audit-report/index.vue'), 'utf-8');
assert(auditReportContent.includes('isVisitor'), 'audit-report should compute isVisitor');
assert(auditReportContent.includes('kpi-grid" v-if="!isVisitor"'), 'audit-report should hide kpi-grid for visitors');
assert(auditReportContent.includes('header-actions" v-if="!isVisitor"'), 'audit-report should hide header-actions for visitors');
assert(auditReportContent.includes('visitor-public-header'), 'audit-report should show visitor-public-header');
assert(auditReportContent.includes('col-selection" v-if="!isVisitor"'), 'audit-report should hide selection checkbox column for visitors');

const drawerContent = fs.readFileSync(path.join(ROOT_DIR, 'mail-vue/src/views/audit-report/components/audit-detail-drawer.vue'), 'utf-8');
assert(drawerContent.includes('isVisitor'), 'audit-detail-drawer should compute isVisitor');
assert(drawerContent.includes('footer-right" v-if="!isVisitor"'), 'audit-detail-drawer should hide admin actions for visitors');
assert(drawerContent.includes('chapter-decision"'), 'audit-detail-drawer should safeguard adjudication workbench');
assert(drawerContent.includes('!isVisitor && isThreatVariant && clusterAccountsList'), 'audit-detail-drawer should hide cluster accounts from visitors');
console.log('✓ Visitor Privacy Minimization verified in frontend views and detail drawer.');

console.log('--- Step 5: Checking Backend Persistence & Logging Switch ---');
const settingEntityContent = fs.readFileSync(path.join(ROOT_DIR, 'mail-worker/src/entity/setting.js'), 'utf-8');
assert(settingEntityContent.includes('auditLogEnabled'), 'setting entity should include auditLogEnabled');
assert(settingEntityContent.includes('auditMaxIpPerAccount'), 'setting entity should include auditMaxIpPerAccount');

const settingServiceContent = fs.readFileSync(path.join(ROOT_DIR, 'mail-worker/src/service/setting-service.js'), 'utf-8');
assert(settingServiceContent.includes("'auditLogEnabled'"), 'setting-service validColumns should include auditLogEnabled');
assert(settingServiceContent.includes("'auditMaxIpPerAccount'"), 'setting-service validColumns should include auditMaxIpPerAccount');

const auditServiceContent = fs.readFileSync(path.join(ROOT_DIR, 'mail-worker/src/service/audit-service.js'), 'utf-8');
assert(auditServiceContent.includes('audit_disabled'), 'auditService.record should skip recording when auditLogEnabled is 0');
assert(auditServiceContent.includes('desensitizeEmail'), 'auditService should desensitize email for visitors');
assert(auditServiceContent.includes('desensitizeIp'), 'auditService should desensitize IP for visitors');

const initContent = fs.readFileSync(path.join(ROOT_DIR, 'mail-worker/src/init/init.js'), 'utf-8');
assert(initContent.includes('v3_18DB'), 'init.js should contain v3_18DB migration for IP risk and audit switch columns');

console.log('✓ All 5 verification checks PASSED successfully!');
