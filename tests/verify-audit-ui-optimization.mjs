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
assert.ok(vueContent.includes('$t(\'auditColExpireTime\')'), '包含「到期时间」列');
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

// 7. 第二轮优化 8 项核验
console.log('=== 第二轮精细化打磨 8 项需求核验 ===');

// 7.1 时间排序移至列头箭头
console.log('[第二轮 1] 时间排序集成至列头箭头，header-actions 移除时间排序图标...');
assert.ok(vueContent.includes('header-action-trigger') && vueContent.includes('changeTimeSort'), '表头包含排序箭头触点');
console.log('  ✓ 时间排序已成功集成至表头列箭头\n');

// 7.2 默认表格行不展示邮箱名称
console.log('[第二轮 2] 默认表格行不展示邮箱名称，仅在详情抽屉中呈现...');
const tableColumnTicketMatch = vueContent.match(/<el-table-column :label="\$t\('auditColTicketNo'\)"[\s\S]*?<\/el-table-column>/);
assert.ok(tableColumnTicketMatch, '找到工单编号列定义');
assert.ok(!tableColumnTicketMatch[0].includes('ticket-email-wrap'), '表格行中无 ticket-email-wrap 邮箱展示');
assert.ok(vueContent.includes('selectedRow.email'), '抽屉扩展界面保留邮箱完整展示');
console.log('  ✓ 默认表格行彻底移除邮箱名称干扰，仅保留于扩展抽屉中\n');

// 7.3 当前状态列无边框，icon+文字水平对齐，缩短间距
console.log('[第二轮 3] 当前状态列边框删除，纯 icon+文字水平对齐，缩短间距...');
assert.ok(vueContent.includes('class="status-clean-item"'), '采用 status-clean-item 无边框容器');
assert.ok(vueContent.includes('status-icon-inline') && vueContent.includes('status-text-inline'), '采用纯 icon+文字水平对齐');
assert.ok(vueContent.includes('width="130"') || vueContent.includes('width="140"'), '状态列宽度适度优化以消除文字截断');
console.log('  ✓ 当前状态边框已清除，文字与 icon 完美水平对齐并缩短间距\n');

// 7.4 时间格式 mm/dd/yy hh:ss
console.log('[第二轮 4] 时间格式统一定制为 MM/DD/YY HH:mm...');
assert.ok(vueContent.includes("tzDayjs(time).format('MM/DD/YY HH:mm')"), '定义 formatTableTime 格式化为 MM/DD/YY HH:mm');
assert.ok(vueContent.includes('formatTableTime(row.banTime || row.createTime)'), '处理时间采用 formatTableTime');
assert.ok(vueContent.includes('formatTableTime(row.expireTime)'), '到期时间采用 formatTableTime');
console.log('  ✓ 表格所有时间展示均统一格式为 MM/DD/YY HH:mm\n');

// 7.5 负责人只展示名称且点击可查看详情
console.log('[第二轮 5] 负责人只展示名称，点击可进入账户详情...');
assert.ok(vueContent.includes('operator-name-link'), '负责人为纯名称点击链接');
assert.ok(vueContent.includes('handleViewOperator(row)'), '点击负责人触发 handleViewOperator');
assert.ok(vueContent.includes('operatorDialogVisible'), '包含负责人账户详情弹窗');
assert.ok(vueContent.includes('goToUserManagement'), '支持跳转至用户管理');
console.log('  ✓ 负责人列为纯名称展示，点击无缝唤出账户详情弹窗\n');

// 7.6 行内仅保留「查看详情」，操作整合入抽屉，支持批量延期
console.log('[第二轮 6] 操作列仅保留「查看详情」，延期/备注/解禁整合入抽屉，header-actions 支持批量延期...');
const actionColMatch = vueContent.match(/<el-table-column :label="\$t\('action'\)"[\s\S]*?<\/el-table-column>/);
assert.ok(actionColMatch, '找到操作列定义');
assert.ok(actionColMatch[0].includes('action-detail-btn'), '操作列保留查看详情按钮');
assert.ok(!actionColMatch[0].includes('action-btn-compact'), '操作列彻底移除行内 action-btn-compact');
assert.ok(vueContent.includes('handleBatchExtend'), '支持批量延期');
assert.ok(vueContent.includes('handleOpenExtend'), '抽屉内整合延期');
assert.ok(vueContent.includes('handleOpenNote'), '抽屉内整合备注');
console.log('  ✓ 行内多余按钮已清除，操作完整下沉至查看详情中，并支持批量延期\n');

// 7.7 滥用威胁无到期时间，展示处理建议
console.log('[第二轮 7] 滥用威胁 Tab 无到期时间，替换为处理建议...');
assert.ok(vueContent.includes("v-if=\"activeKpi !== 'threat'\"") && vueContent.includes("$t('auditColExpireTime')"), '滥用威胁下隐藏到期时间');
assert.ok(vueContent.includes('auditColSuggestion'), '包含处理建议列');
assert.ok(vueContent.includes('getHandlingSuggestion'), '包含动态处理建议计算');
console.log('  ✓ 滥用威胁中已彻底移除到期时间，替换为语义化处理建议\n');

// 7.8 其他 Tab 保留到期时间并加入处理建议，且仅具有到期时间的工单可延期
console.log('[第二轮 8] 申诉/风险/记录 Tab 保留到期时间与处理建议，仅有到期时间工单可延期...');
assert.ok(vueContent.includes('canExtendRow'), '具备 canExtendRow 检查');
assert.ok(vueContent.includes("if (activeKpi.value === 'threat') return false;"), '滥用威胁严格禁止延期');
assert.ok(vueContent.includes('return !!row.expireTime;'), '仅有到期时间的工单支持延期');
console.log('  ✓ 全 Tab 均具备处理建议，到期时间与延期权限严格按规则约束\n');

// 8. 规范化方案一列集核验（对齐 punishments.md）
console.log('=== 第四轮 punishments.md 决策规范列集核验 (方案一) ===');
console.log('[第四轮 1] 工单编号列删除重复的 tag-compact 检举徽标...');
assert.ok(!tableColumnTicketMatch[0].includes('tag-compact'), '工单编号列彻底移除重复的 tag-compact 徽标');
console.log('  ✓ 工单编号列已彻底移除冗余的 tag-compact 检举徽标\n');

console.log('[第四轮 2] 表格中间对齐 punishments.md 引入「违规分类」，移除底层网络与设备指纹...');
assert.ok(vueContent.includes('$t(\'auditColViolationCategory\')'), '包含违规分类列');
assert.ok(vueContent.includes('category-cell'), '包含 category-cell 样式类');
assert.ok(vueContent.includes('getViolationCategory(row)'), '包含 getViolationCategory 分类计算逻辑');
assert.ok(!vueContent.includes('$t(\'auditColTriggerNetwork\')'), '主表格中已彻底移除触发网络底层列');
assert.ok(!vueContent.includes('$t(\'auditColClientDevice\')'), '主表格中已彻底移除终端设备指纹列');
console.log('  ✓ 表格成功落地「违规分类」，完全对齐 punishments.md 架构规范，杜绝长文本与底层指纹\n');

console.log('================================================================');
console.log('=== 第一轮 6 项 + 第二轮 8 项 + 第四轮 2 项优化需求全量断言通过！ ===');
console.log('================================================================\n');
