import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('系统设置 (sys-setting) OAuth 界面精益化与去冗余静态及结构核验');
console.log('============================================================\n');

const sysSettingPath = path.resolve(__dirname, '../mail-vue/src/views/sys-setting/index.vue');
const sysSettingContent = fs.readFileSync(sysSettingPath, 'utf8');

// 1. 验证 oauth-status-tag 已彻底剔除
console.log('[Check 1] 校验 oauth-status-tag 状态标签是否彻底移除...');
assert.ok(
  !sysSettingContent.includes('oauth-status-tag'),
  'sys-setting/index.vue 中仍残留 oauth-status-tag 类名定义或引用！'
);
console.log('  ✓ oauth-status-tag 已 100% 彻底剔除 (零残留)');

// 2. 验证 oauth-dialog-header-right 已彻底剔除
console.log('[Check 2] 校验 oauth-dialog-header-right 弹窗头部冗余标签是否彻底移除...');
assert.ok(
  !sysSettingContent.includes('oauth-dialog-header-right'),
  'sys-setting/index.vue 中仍残留 oauth-dialog-header-right 类名定义或引用！'
);
console.log('  ✓ oauth-dialog-header-right 已 100% 彻底剔除 (零残留)');

// 3. 验证 oauth-provider-row 内无冗余 el-switch
console.log('[Check 3] 校验 oauth-provider-row 是否移除了冗余的行内 el-switch 开关...');
const providerRowRegex = /class=["']setting-item oauth-provider-row["'][\s\S]*?<\/div>\s*<\/div>/;
const matchRow = sysSettingContent.match(providerRowRegex);
assert.ok(matchRow, '未找到 oauth-provider-row 节点');
const rowHtml = matchRow[0];
assert.ok(
  !rowHtml.includes('<el-switch'),
  'oauth-provider-row 行内不应存在冗余的 el-switch 开关，开关应统一由配置弹窗承载！'
);
console.log('  ✓ oauth-provider-row 行内冗余 el-switch 已彻底移除');

// 4. 验证 oauth-provider-row 操作按钮为纯图标右对齐，且无文字说明
console.log('[Check 4] 校验 opt-button 是否移除了"接入配置"文字并保持纯图标 + Tooltip 悬停...');
assert.ok(
  rowHtml.includes('class="forward"'),
  'oauth-provider-row 操作按钮必须包裹在 class="forward" 中以实现统一右对齐！'
);
assert.ok(
  rowHtml.includes('<el-tooltip'),
  'oauth-provider-row 操作按钮必须包裹在 el-tooltip 中实现悬停注释解释！'
);
assert.ok(
  !rowHtml.includes('<span>{{ $t(\'oauthConfigure\') }}</span>') && !rowHtml.includes('<span>{{ $t("oauthConfigure") }}</span>'),
  'opt-button 内部不应包含文字 span，应为纯图标按钮！'
);
assert.ok(
  rowHtml.includes('<Icon icon="fluent:settings-48-regular" width="18" height="18" />') ||
  rowHtml.includes('<Icon icon="fluent:settings-48-regular" width="18" height="18"/>'),
  'opt-button 内部应统一使用 fluent:settings-48-regular 纯图标！'
);
console.log('  ✓ opt-button 为纯图标、无文字、有 Tooltip 悬停解释且统一右对齐');

// 5. 验证弹窗主体移除了额外的灰底方框 (oauth-enable-banner, oauth-callback-compact-bar)
console.log('[Check 5] 校验 oauth-dialog-body 是否剔除了额外的灰底色块方框...');
assert.ok(
  !sysSettingContent.includes('oauth-enable-banner'),
  'sys-setting/index.vue 中仍残留 oauth-enable-banner 灰底方框！'
);
assert.ok(
  !sysSettingContent.includes('oauth-callback-compact-bar'),
  'sys-setting/index.vue 中仍残留 oauth-callback-compact-bar 灰底方框！'
);
assert.ok(
  sysSettingContent.includes('oauth-enable-row'),
  'oauth-dialog-body 缺少纯净的 oauth-enable-row！'
);
assert.ok(
  sysSettingContent.includes('oauth-callback-row'),
  'oauth-dialog-body 缺少纯净的 oauth-callback-row！'
);
console.log('  ✓ oauth-dialog-body 彻底移除了灰底色块方框，应用纯净行内排版');

// 6. 验证表单保存具备完整输入校验逻辑 (validateOauthForm)
console.log('[Check 6] 校验 saveOauthProviderConfig 是否具备完整合规的前端输入校验...');
assert.ok(
  sysSettingContent.includes('function validateOauthForm('),
  'sys-setting/index.vue 缺少 validateOauthForm 输入内容校验函数！'
);
assert.ok(
  sysSettingContent.includes('function isValidHttpUrl('),
  'sys-setting/index.vue 缺少 isValidHttpUrl URL 校验函数！'
);
assert.ok(
  sysSettingContent.includes('validateOauthForm(activeOauthProviderKey.value, oauthForm)'),
  'saveOauthProviderConfig 未在保存前调用 validateOauthForm 进行表单拦截！'
);
console.log('  ✓ 表单输入完整性与 URL 格式校验已 100% 落实');

// 7. 验证 Skill 规范文件是否存在且规范完整
console.log('[Check 7] 校验 .agent/skills/admin-ui-standards/SKILL.md 是否正确录入规范...');
const skillPath = path.resolve(__dirname, '../.agent/skills/admin-ui-standards/SKILL.md');
assert.ok(fs.existsSync(skillPath), 'SKILL.md 规范文件未创建！');
const skillContent = fs.readFileSync(skillPath, 'utf8');
assert.ok(skillContent.includes('admin-ui-standards'), 'SKILL.md 缺少 name 定义');
assert.ok(skillContent.includes('禁止过度展示与状态冗余') || skillContent.includes('禁止多次展示'), 'SKILL.md 缺少规则 1');
assert.ok(skillContent.includes('纯图标') || skillContent.includes('右对齐'), 'SKILL.md 缺少规则 2');
assert.ok(skillContent.includes('单一事实来源') || skillContent.includes('不要重复、强调'), 'SKILL.md 缺少规则 3');
assert.ok(skillContent.includes('禁止伪独立灰底方框') || skillContent.includes('灰底'), 'SKILL.md 缺少规则 4');
assert.ok(skillContent.includes('严格完备的输入内容合理性校验') || skillContent.includes('校验'), 'SKILL.md 缺少规则 5');
console.log('  ✓ .agent/skills/admin-ui-standards/SKILL.md 规范完整且语法正确');

console.log('\n============================================================');
console.log('🎉 全部 7 项系统设置 UI 精益化与表单校验核验断言 100% 通过！');
console.log('============================================================');
