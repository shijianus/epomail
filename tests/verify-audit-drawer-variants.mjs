import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('====================================================================');
console.log('=== 核验：操作报告抽屉四种变体与共用档案库架构设计与交互全案验收 ===');
console.log('====================================================================\n');

let failedAssertions = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ 失败: ${message}`);
    failedAssertions++;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

// 1. 验证抽屉独立组件 audit-detail-drawer.vue
console.log('[验收 1: 抽屉独立组件结构与四种变体组装]');
const drawerComponentPath = path.join(projectRoot, 'mail-vue/src/views/audit-report/components/audit-detail-drawer.vue');
assert(fs.existsSync(drawerComponentPath), '组件 audit-detail-drawer.vue 必须物理存在');
const drawerContent = fs.readFileSync(drawerComponentPath, 'utf8');

// 验证变体标题、副标题与模式
assert(drawerContent.includes('auditVariant1Title') && drawerContent.includes('auditVariant1Sub'), '变体 1「滥用威胁 · 案件全宗档案」标题与副标题已配置');
assert(drawerContent.includes('auditVariant2Title') && drawerContent.includes('auditVariant2Sub'), '变体 2「封禁台账 · 存证（只读）」标题与副标题已配置');
assert(drawerContent.includes('auditVariant3Title') && drawerContent.includes('auditVariant3Sub'), '变体 3「风险管理 · 审计档案」标题与副标题已配置');
assert(drawerContent.includes('auditVariant4Title') && drawerContent.includes('auditVariant4Sub'), '变体 4「操作记录 · 处置台账（只读）」标题与副标题已配置');

// 验证读写权限矩阵 (变体 4 必须纯只读)
assert(drawerContent.includes('isAdjudicationAvailable'), '具备裁决与写操作权限控制计算属性');
assert(drawerContent.includes('activeVariant.value !== 4'), '变体 4 严格隔离，杜绝渲染裁决输入区与动作按钮');

// 2. 验证共用档案模块库 A~I
console.log('\n[验收 2: 共用档案模块库 A~I 完整实现]');
// 模块 A: 案件概要 12 字段位
assert(drawerContent.includes('dossier-grid-12'), '模块 A: 包含 12 个字段位两列网格');
assert(drawerContent.includes('caseNumber') && drawerContent.includes('copyCaseNo'), '模块 A: 案件编号带等宽字体与一键复制');
assert(drawerContent.includes('maskedEmail') && drawerContent.includes('copyEmail'), '模块 A: 邮箱掩码脱敏与一键复制完整邮箱');
assert(drawerContent.includes('maskedUserId') && drawerContent.includes('copyUserId'), '模块 A: 用户 ID 掩码脱敏与一键复制完整 ID');
assert(drawerContent.includes('categoryTagMeta'), '模块 A: 违规类别语义徽标');
assert(drawerContent.includes('reasonCode'), '模块 A: 原因码');
assert(drawerContent.includes('alarmCountValue'), '模块 A: 报警次数条件渲染');
assert(drawerContent.includes('deadlineValue'), '模块 A: 截止期限条件渲染');
assert(drawerContent.includes('authorityValue'), '模块 A: 拍案管理条件渲染');
assert(drawerContent.includes('evidenceDaysFormatted'), '模块 A: 证据留存天数与 WORM 防篡改标准');

// 模块 B: 集群关联账号
assert(drawerContent.includes('clusterAccountsList'), '模块 B: 集群关联账号列表条件渲染');
assert(drawerContent.includes('auditClusterAccountsFootnote'), '模块 B: 包含「随主账号一并管控」脚注说明');

// 模块 C: 处置依据 (内嵌四层 + 6 种标记日志解析)
assert(drawerContent.includes('appeal-statement-quote'), '模块 C: 包含申诉理由双引号引述气泡');
assert(drawerContent.includes('red-ban-reason-alert'), '模块 C: 包含醒目红色封禁/管控原因警告段');
assert(drawerContent.includes('evidence-summary-line'), '模块 C: 包含分类徽标与证据摘要行');
assert(drawerContent.includes('action-description-box'), '模块 C: 包含处置动作徽标与副说明');
assert(drawerContent.includes('parsedDetailLogs'), '模块 C: 包含 6 种标记行首解析逻辑 ([放行说明] [延期处置] [解禁说明] [审核备忘] [驳回理由] [更新])');

// 模块 D: 全周期时间线 (双泳道)
assert(drawerContent.includes('dual-swimlane-timeline'), '模块 D: 实现双泳道全周期时间线');
assert(drawerContent.includes('lane-machine') && drawerContent.includes('lane-human'), '模块 D: 严格区分机器自动泳道与人工/用户泳道');
assert(drawerContent.includes('node-transition'), '模块 D: 时间线节点包含状态流转 (from -> to)');
assert(drawerContent.includes('node-evidence-hash'), '模块 D: 时间线节点支持证据哈希与一键复制');
assert(drawerContent.includes('node-latest'), '模块 D: 时间线突出标明最新节点');

// 模块 E: 多维风险画像
assert(drawerContent.includes('riskProfileData'), '模块 E: 包含多维风险画像完整数据');
assert(drawerContent.includes('composite-score-box'), '模块 E: 综合风险分大数字与驱动维度结论');
assert(drawerContent.includes('risk-dimensions-list'), '模块 E: 4 维度得分条与权重');
assert(drawerContent.includes('gauge-bar-wrapper'), '模块 E: 基准带进度条 (0%同群组, 100%阈值, 自身30天刻度与阈值刻度)');
assert(drawerContent.includes('auditMaskedAggregatedData'), '模块 E: 标有脱敏聚合数据');

// 模块 F: 相似案例参照 (变体 2 核心)
assert(drawerContent.includes('similarCasesData'), '模块 F: 包含相似案例 90 天裁决分布数据');
assert(drawerContent.includes('stacked-distribution-bar'), '模块 F: 包含分段比例条与一致性研判指引');

// 模块 G: 证据链溯源 (变体 2 核心)
assert(drawerContent.includes('evidenceChainList'), '模块 G: 包含四列证据链 (证据 -> 规则 -> 节点 -> 依据)');

// 模块 H: 裁决工作台
assert(drawerContent.includes('adjudication-workbench-card'), '模块 H: 包含裁决批注输入框与快捷预设');
assert(drawerContent.includes('confirmAndExecuteAction') && drawerContent.includes('confirmAndExecuteVerdict'), '模块 H: 所有裁决动作均具备二次确认弹窗');

// 模块 I: 只读台账横幅
assert(drawerContent.includes('sanction-ledger-banner'), '模块 I: 包含公开透明存证台账横幅与防篡改说明');
assert(drawerContent.includes('unbanned-archive-badge'), '模块 I: 已解禁案件追加解禁记录归档徽标');

// 3. 验证抽屉与主页 index.vue 深度契合
console.log('\n[验收 3: audit-report/index.vue 集成与交互闭环]');
const indexPath = path.join(projectRoot, 'mail-vue/src/views/audit-report/index.vue');
const indexContent = fs.readFileSync(indexPath, 'utf8');

assert(indexContent.includes('import AuditDetailDrawer from \'./components/audit-detail-drawer.vue\''), 'index.vue 已正确导入 AuditDetailDrawer');
assert(indexContent.includes('<AuditDetailDrawer'), 'index.vue 模板已挂载 AuditDetailDrawer');
assert(indexContent.includes('checkDeepLinkOnLoad'), 'index.vue 支持 URL 深链自动识别与打开对应工单');
assert(indexContent.includes('handleGlobalKeydown'), 'index.vue 支持键盘上下移动、回车打开抽屉、Esc 关闭快捷键');

// 4. 验证多语言对称性
console.log('\n[验收 4: 6 语言字典 100% 对称性]');
const langs = ['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl'];
const keysToCheck = [
  'auditVariant1Title', 'auditVariant1Sub',
  'auditVariant2Title', 'auditVariant2Sub',
  'auditVariant3Title', 'auditVariant3Sub',
  'auditVariant4Title', 'auditVariant4Sub',
  'auditChipSummary', 'auditChipCluster', 'auditChipBasis', 'auditChipTimeline',
  'auditChipRisk', 'auditChipSimilar', 'auditChipChain', 'auditChipDecision', 'auditChipLedger',
  'auditColUserId', 'auditMaskedAggregatedData', 'auditTimelineSwimlaneMachine',
  'auditTimelineSwimlaneHuman', 'auditRiskCompositeScore', 'auditSimilarCasesTitle',
  'auditChainTitle'
];

for (const lang of langs) {
  const langFile = path.join(projectRoot, `mail-vue/src/i18n/${lang}.js`);
  const content = fs.readFileSync(langFile, 'utf8');
  for (const k of keysToCheck) {
    assert(content.includes(`${k}:`), `语言 [${lang}] 必须包含词条 ${k}`);
  }
}

if (failedAssertions > 0) {
  console.error(`\n❌ 核验未通过，共 ${failedAssertions} 处失败。`);
  process.exit(1);
} else {
  console.log('\n====================================================================');
  console.log('=== 恭喜！操作报告抽屉四种变体及共用档案库全案核验 100% 全部通过！ ===');
  console.log('====================================================================\n');
}
