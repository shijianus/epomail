import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('底层特性开关 (ENABLE_OAUTH_INTEGRATION) 默认关闭与隐藏核验');
console.log('============================================================\n');

// 1. 验证 feature-flags.js 存在且 ENABLE_OAUTH_INTEGRATION = false
console.log('[Check 1] 校验 feature-flags.js 常量定义与默认值...');
const featureFlagsPath = path.resolve(__dirname, '../mail-vue/src/const/feature-flags.js');
assert.ok(fs.existsSync(featureFlagsPath), 'mail-vue/src/const/feature-flags.js 文件不存在！');
const featureFlagsContent = fs.readFileSync(featureFlagsPath, 'utf8');

assert.ok(
  featureFlagsContent.includes('export const ENABLE_OAUTH_INTEGRATION = false;'),
  'ENABLE_OAUTH_INTEGRATION 默认值必须为 false (关闭第三方接入)！'
);
console.log('  ✓ ENABLE_OAUTH_INTEGRATION 默认状态为 false (确保专案独立性)');

// 2. 验证 sys-setting/index.vue 导入并应用了 ENABLE_OAUTH_INTEGRATION
console.log('[Check 2] 校验 sys-setting/index.vue 是否受底层开关受控隐藏...');
const sysSettingPath = path.resolve(__dirname, '../mail-vue/src/views/sys-setting/index.vue');
const sysSettingContent = fs.readFileSync(sysSettingPath, 'utf8');

assert.ok(
  sysSettingContent.includes("import { ENABLE_OAUTH_INTEGRATION } from \"@/const/feature-flags.js\";") ||
  sysSettingContent.includes("import {ENABLE_OAUTH_INTEGRATION} from \"@/const/feature-flags.js\";"),
  'sys-setting/index.vue 必须正确导入 ENABLE_OAUTH_INTEGRATION！'
);

assert.ok(
  sysSettingContent.includes('<div v-if="ENABLE_OAUTH_INTEGRATION" class="settings-card oauth-sso-card">'),
  'oauth-sso-card 必须具备 v-if="ENABLE_OAUTH_INTEGRATION" 条件渲染，确保默认彻底隐藏！'
);
console.log('  ✓ oauth-sso-card 具备 v-if="ENABLE_OAUTH_INTEGRATION" 并在默认 false 时彻底隐藏');

console.log('\n============================================================');
console.log('🎉 底层特性开关与默认隐藏核验 100% 通过！');
console.log('============================================================');
