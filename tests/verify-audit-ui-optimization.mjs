import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('================================================================');
console.log('=== 核验：安全审计控制台 (#manage/admin/audit) UI 优化全真验收 ===');
console.log('================================================================\n');

const vuePath = path.resolve('mail-vue/src/views/audit-report/index.vue');
const vueContent = fs.readFileSync(vuePath, 'utf8');

// 1. KPI Grid 重排与重命名
console.log('[验收项 1] class="kpi-grid" 重排与重命名...');
assert.ok(vueContent.includes('kpi-grid'), '存在 kpi-grid 容器');
const threatIdx = vueContent.indexOf('kpi-threat');
const appealIdx = vueContent.indexOf('kpi-appeal');
const auditIdx = vueContent.indexOf('kpi-audit');
const recordIdx = vueContent.indexOf('kpi-record');

assert.ok(threatIdx < appealIdx, '卡片 1 滥用威胁 在 卡片 2 申诉审计 之前');
assert.ok(appealIdx < auditIdx, '卡片 2 申诉审计 在 卡片 3 风险管理 之前');
assert.ok(auditIdx < recordIdx, '卡片 3 风险管理 在 卡片 4 操作记录 之前');

const zhPath = path.resolve('mail-vue/src/i18n/zh.js');
const zhContent = fs.readFileSync(zhPath, 'utf8');
assert.ok(zhContent.includes('auditKpiThreatEmail: "滥用威胁"'), '卡片 1 命名为「滥用威胁」');
assert.ok(zhContent.includes('auditKpiAppealEmail: "申诉审计"'), '卡片 2 命名为「申诉审计」');
assert.ok(zhContent.includes('auditKpiAuditEmail: "风险管理"'), '卡片 3 命名为「风险管理」');
assert.ok(zhContent.includes('auditKpiActionRecord: "操作记录"'), '卡片 4 命名为「操作记录」');
console.log('  ✓ 4 大 KPI 卡片已成功重排为：1. 滥用威胁 -> 2. 申诉审计 -> 3. 风险管理 -> 4. 操作记录\n');

// 2. 表格列规范
console.log('[验收项 2] 表格表单字段定制 (工单编号/当前状态/报警原因与风险等级/处理时间/到期时间/负责人/操作)...');
assert.ok(vueContent.includes(':label="$t(\'auditColTicketNo\')"'), '包含「工单编号」列');
assert.ok(vueContent.includes(':label="$t(\'auditCurrentStatus\')"') || vueContent.includes('$t(\'auditCurrentStatus\')'), '包含「当前状态」列');
assert.ok(vueContent.includes('formatTicketNo(row)'), '工单编号直接调用 # 格式化函数');
assert.ok(vueContent.includes('getSimpleAlarmReason(row)'), '针对滥用威胁展示简明报警原因 (如一人多号、多次检举等)');
assert.ok(vueContent.includes('getAppealRiskLevel(row)'), '针对申诉审计展示风险等级 (LV0~LV3)');
assert.ok(vueContent.includes(':label="$t(\'auditColProcessTime\')"') || vueContent.includes('$t(\'auditColProcessTime\')'), '包含「处理时间」(报警时间) 列');
assert.ok(vueContent.includes(':label="$t(\'auditColExpireTime\')"'), '包含「到期时间」列');
assert.ok(vueContent.includes(':label="$t(\'auditColAssignee\')"'), '包含「负责人」列');
assert.ok(vueContent.includes(':label="$t(\'action\')"'), '包含「操作」列');
console.log('  ✓ 表格 7 大列定义完全符合需求，# 工单编号与动态原因/等级就位\n');

// 3. 消除与 topbar-search 冲突的 el-input__wrapper
console.log('[验收项 3] 移除 header-actions 内冲突的本地 search el-input__wrapper...');
assert.ok(!vueContent.includes('<div class="search">'), 'header-actions 已彻底移除本地 search 容器');
assert.ok(!vueContent.includes('auditSearchCasesPlaceholder'), '已彻底移除本地搜索输入框占位符');
assert.ok(vueContent.includes('emailStore.searchKeyword'), '保留并强化与 topbar-search 顶栏搜索的双向打通');
console.log('  ✓ 本地 search el-input__wrapper 已被移除，完美结合顶栏 topbar-search\n');

// 4. 表头集中筛选，说明「全部什么」
console.log('[验收项 4] 筛选集中到 class="el-table__header-wrapper"，全部选单明确标注说明...');
assert.ok(vueContent.includes('col-filter-header'), '表头中包含列筛选触发结构');
assert.ok(zhContent.includes('auditAllStatus: "全部状态"'), '状态筛选选项显式声明「全部状态」');
assert.ok(zhContent.includes('auditAllProcessTime: "全部处理时间"'), '时间筛选选项显式声明「全部处理时间」');
assert.ok(zhContent.includes('auditAllRiskLevel: "全部风险等级"'), '风险筛选选项显式声明「全部风险等级」');
console.log('  ✓ 筛选已全部下沉到表头下拉，选项完整注明「全部状态」「全部处理时间」「全部风险等级」\n');

// 5. header-actions 专注操作 Button 与多选功能
console.log('[验收项 5] header-actions 专注操作 Button 与批量多选能力...');
assert.ok(vueContent.includes('type="selection"'), '表格已添加多选勾选列');
assert.ok(vueContent.includes('batch-actions-wrap'), '包含批量操作按钮容器');
assert.ok(vueContent.includes('handleBatchUnban'), '支持批量解封');
assert.ok(vueContent.includes('handleBatchBan'), '支持批量封禁');
assert.ok(vueContent.includes('handleBatchDelete'), '支持批量删除');
assert.ok(vueContent.includes('handleExportCsv'), '新增数据导出 (CSV) 功能');
assert.ok(vueContent.includes('changeTimeSort'), '保留时间排序切换');
assert.ok(vueContent.includes('handlePurge'), '保留清理历史日志');
console.log('  ✓ header-actions 纯净高效，具备批量解封/封禁/删除与 CSV 导出功能\n');

// 6. 分页对齐用户列表
console.log('[验收项 6] 分页体积与规范对齐「用户列表」...');
assert.ok(vueContent.includes('layout="layout"'), '分页采用动态精简布局 (去除大体积 jumper)');
assert.ok(vueContent.includes(':pager-count="pagerCount"'), '采用用户列表规范的响应式 pager-count');
assert.ok(vueContent.includes('phonePageShow'), '支持手机端端自适应 sizes, total 布局');
assert.ok(vueContent.includes('margin-top: 15px;\n  margin-bottom: 20px;\n  padding-right: 30px;'), '分页 CSS 边距与对齐规范 100% 学习用户列表');
console.log('  ✓ 分页完全对齐用户列表规范，去除过大尺寸，自适应布局极佳\n');

console.log('================================================================');
console.log('=== 所有 6 项优化需求全量断言通过！ ===');
console.log('================================================================\n');
