<template>
  <div class="audit-box">
    <!-- 主体可滚动区域 -->
    <el-scrollbar ref="scrollbarRef" class="scrollbar">
      <div class="audit-workspace-body">

        <!-- 1. 顶部汇报分区 4 板块 (The 4 Upper Reporting KPI Blocks) -->
        <div class="kpi-grid">
          <!-- Card 1: 审计警告 -->
          <div
            class="kpi-card category-card"
            :class="{ 'card-active': params.warningType === 'audit' }"
            @click="selectWarningFilter('audit')"
          >
            <div class="kpi-icon-wrap ops-icon">
              <Icon icon="fluent:shield-task-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-info">
              <div class="kpi-label">
                <span>{{ $t('auditTypeAuditWarning') }}</span>
                <span v-if="params.warningType === 'audit'" class="active-dot"></span>
              </div>
              <div class="kpi-value font-mono">
                {{ summaryCounts.audit }}
                <span class="kpi-unit">/ {{ summaryCounts.total }}</span>
              </div>
              <div class="kpi-sub">{{ $t('auditTypeAuditWarningDesc') }}</div>
              <div class="kpi-progress-bar">
                <div class="kpi-progress-fill ops-fill" :style="{ width: calcPercent(summaryCounts.audit) + '%' }"></div>
              </div>
            </div>
          </div>

          <!-- Card 2: 风控警告 -->
          <div
            class="kpi-card category-card"
            :class="{ 'card-active': params.warningType === 'risk' }"
            @click="selectWarningFilter('risk')"
          >
            <div class="kpi-icon-wrap risk-icon">
              <Icon icon="fluent:alert-urgent-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-info">
              <div class="kpi-label">
                <span>{{ $t('auditTypeRiskWarning') }}</span>
                <span v-if="params.warningType === 'risk'" class="active-dot"></span>
              </div>
              <div class="kpi-value font-mono text-danger">
                {{ summaryCounts.risk }}
                <span class="kpi-unit">/ {{ summaryCounts.total }}</span>
              </div>
              <div class="kpi-sub">{{ $t('auditTypeRiskWarningDesc') }}</div>
              <div class="kpi-progress-bar">
                <div class="kpi-progress-fill risk-fill" :style="{ width: calcPercent(summaryCounts.risk) + '%' }"></div>
              </div>
            </div>
          </div>

          <!-- Card 3: 封禁警告 -->
          <div
            class="kpi-card category-card"
            :class="{ 'card-active': params.warningType === 'ban' }"
            @click="selectWarningFilter('ban')"
          >
            <div class="kpi-icon-wrap ban-icon">
              <Icon icon="fluent:prohibited-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-info">
              <div class="kpi-label">
                <span>{{ $t('auditTypeBanWarning') }}</span>
                <span v-if="params.warningType === 'ban'" class="active-dot"></span>
              </div>
              <div class="kpi-value font-mono text-muted">
                {{ summaryCounts.ban }}
                <span class="kpi-unit">/ {{ summaryCounts.total }}</span>
              </div>
              <div class="kpi-sub">{{ $t('auditTypeBanWarningDesc') }}</div>
              <div class="kpi-progress-bar">
                <div class="kpi-progress-fill ban-fill" :style="{ width: calcPercent(summaryCounts.ban) + '%' }"></div>
              </div>
            </div>
          </div>

          <!-- Card 4: 申诉警告 (待研判高亮) -->
          <div
            class="kpi-card category-card highlight-card"
            :class="{ 'card-active': params.warningType === 'appeal' }"
            @click="selectWarningFilter('appeal')"
          >
            <div class="kpi-icon-wrap appeal-icon">
              <Icon icon="fluent:document-person-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-info">
              <div class="kpi-label">
                <span>{{ $t('auditTypeAppealWarning') }}</span>
                <span v-if="summaryCounts.appeal > 0" class="pulse-beacon"></span>
                <span v-if="params.warningType === 'appeal'" class="active-dot"></span>
              </div>
              <div class="kpi-value font-mono text-amber">
                {{ summaryCounts.appeal }}
                <span class="kpi-unit">/ {{ summaryCounts.total }}</span>
              </div>
              <div class="kpi-sub text-amber">{{ $t('auditTypeAppealWarningDesc') }}</div>
              <div class="kpi-progress-bar">
                <div class="kpi-progress-fill appeal-fill" :style="{ width: calcPercent(summaryCounts.appeal) + '%' }"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. 向下延申专门的层级分区 (Dedicated Operational Tier Partitions) -->
        <div class="tier-nav-container">
          <div class="tier-nav-bar">
            <!-- Tier 1: 预警时序总览 -->
            <div
              class="tier-tab-btn"
              :class="{ active: activeTier === 'stream' }"
              @click="switchTier('stream')"
            >
              <Icon icon="fluent:timeline-20-regular" width="18" height="18" />
              <span>{{ $t('auditTabStream') }}</span>
              <span class="tier-badge">{{ summaryCounts.total }}</span>
            </div>

            <!-- Tier 2: 待办研判队列 -->
            <div
              class="tier-tab-btn"
              :class="{ active: activeTier === 'triage' }"
              @click="switchTier('triage')"
            >
              <Icon icon="fluent:shield-badge-20-regular" width="18" height="18" />
              <span>{{ $t('auditTabRisk') }}</span>
              <span v-if="summaryCounts.appeal > 0" class="tier-badge alert-badge">{{ summaryCounts.appeal }}</span>
            </div>

            <!-- Tier 3: 防护基线与策略 -->
            <div
              class="tier-tab-btn"
              :class="{ active: activeTier === 'policy' }"
              @click="switchTier('policy')"
            >
              <Icon icon="fluent:slide-settings-20-regular" width="18" height="18" />
              <span>{{ $t('auditTabPolicy') }}</span>
            </div>
          </div>
        </div>

        <!-- 3. 操作栏 (Toolbar - 继承对齐用户管理精益风格，但具备审计领域特征) -->
        <div v-if="activeTier !== 'policy'" class="header-actions">
          <div class="search">
            <el-input
              v-model="params.email"
              class="search-input"
              :placeholder="$t('searchByEmail')"
              clearable
              @keyup.enter="search"
            />
          </div>

          <!-- 预警类别筛选 (时序总览模式) -->
          <el-select
            v-if="activeTier === 'stream'"
            v-model="params.warningType"
            class="status-select"
            :style="`width: ${locale === 'en' ? 140 : 110}px`"
            @change="search"
          >
            <el-option value="all" :label="$t('auditTypeAllAlerts')" />
            <el-option value="audit" :label="$t('auditTypeAuditWarning')" />
            <el-option value="risk" :label="$t('auditTypeRiskWarning')" />
            <el-option value="ban" :label="$t('auditTypeBanWarning')" />
            <el-option value="appeal" :label="$t('auditTypeAppealWarning')" />
          </el-select>

          <!-- 研判状态筛选 (待办研判队列模式) -->
          <el-select
            v-else-if="activeTier === 'triage'"
            v-model="params.status"
            class="status-select"
            :style="`width: ${locale === 'en' ? 140 : 110}px`"
            @change="search"
          >
            <el-option value="all" :label="$t('all')" />
            <el-option value="pending" :label="$t('auditAppealStatusPending')" />
            <el-option value="banned" :label="$t('banned')" />
            <el-option value="resolved" :label="$t('auditAppealStatusApproved')" />
            <el-option value="rejected" :label="$t('auditAppealStatusRejected')" />
          </el-select>

          <!-- 风险等级筛选 -->
          <el-select
            v-model="params.riskLevel"
            class="status-select"
            :style="`width: ${locale === 'en' ? 110 : 95}px`"
            @change="search"
          >
            <el-option value="all" :label="$t('all')" />
            <el-option value="high" :label="$t('auditRiskLevelHigh')" />
            <el-option value="medium" :label="$t('auditRiskLevelMedium')" />
            <el-option value="low" :label="$t('auditRiskLevelLow')" />
            <el-option value="normal" :label="$t('auditRiskLevelNormal')" />
          </el-select>

          <Icon class="icon" icon="iconoir:search" @click="search" width="20" height="20" />

          <Icon
            class="icon"
            @click="changeTimeSort"
            icon="material-symbols-light:timer-arrow-down-outline"
            v-if="params.timeSort === 1"
            width="28"
            height="28"
          />
          <Icon
            class="icon"
            @click="changeTimeSort"
            icon="material-symbols-light:timer-arrow-up-outline"
            v-else
            width="28"
            height="28"
          />

          <Icon class="icon" icon="ion:reload" width="18" height="18" @click="refresh" />
          <Icon class="icon" icon="fluent:broom-sparkle-16-regular" width="18" height="18" @click="handlePurge" :title="$t('auditClearHistorical')" />
        </div>

        <!-- 4. 核心表格 (Table - 纯文本不打底展示，人体工学按钮右对齐) -->
        <div v-if="activeTier !== 'policy'" class="table-wrap">
          <div class="loading" :class="tableLoading ? 'loading-show' : 'loading-hide'" :style="first ? 'background: transparent' : ''">
            <loading />
          </div>

          <el-table
            :data="logs"
            style="width: 100%;"
            ref="tableRef"
            :empty-text="first ? '' : $t('auditEmptyLogs')"
          >
            <!-- 目标账号列 (纯文本展示) -->
            <el-table-column :label="$t('tabEmailAddress')" min-width="170" show-overflow-tooltip>
              <template #default="{ row }">
                <div class="email-cell">
                  <span class="email-text" @click="openDetails(row)">{{ row.email }}</span>
                  <span v-if="row.ticketId" class="ticket-tag font-mono">{{ row.ticketId }}</span>
                </div>
              </template>
            </el-table-column>

            <!-- 预警类别 (语义化标签) -->
            <el-table-column :label="$t('auditSecurityLevelBadge')" width="105">
              <template #default="{ row }">
                <el-tag size="small" :type="getWarningTagType(row.warningType)" effect="plain">
                  {{ getWarningLabel(row.warningType) }}
                </el-tag>
              </template>
            </el-table-column>

            <!-- 事件说明与特征 (纯文本不打底展示，拒绝多层长方框与药丸盒) -->
            <el-table-column :label="$t('auditAlertExplanation')" min-width="220">
              <template #default="{ row }">
                <div class="plain-action-text">{{ row.actionText }}</div>
                <div v-if="row.detailText" class="plain-detail-text">{{ row.detailText }}</div>
              </template>
            </el-table-column>

            <!-- 环境与客户端 (纯文本展示：IP、地理位置、设备指纹) -->
            <el-table-column :label="$t('auditActiveEnvPool')" min-width="180">
              <template #default="{ row }">
                <div class="plain-env-text">
                  <span class="font-mono">{{ row.ip || '-' }}</span>
                  <span v-if="row.geo" class="env-geo"> ({{ row.geo }})</span>
                </div>
                <div class="plain-device-text">
                  <span>{{ row.device || '-' }}</span>
                  <span v-if="row.fingerprint" class="env-fp font-mono"> [{{ row.fingerprint }}]</span>
                </div>
                <div v-if="row.isMultiIp === 1" class="plain-concurrent-warn">
                  {{ $t('auditMultiIpConcurrent') }} ({{ row.activeIpCount }} IPs)
                </div>
              </template>
            </el-table-column>

            <!-- 优先级 / 风险等级 (简洁状态) -->
            <el-table-column :label="$t('auditPriority')" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="getPriorityTagType(row.priority)" effect="light">
                  {{ row.priority || 'P2' }}
                </el-tag>
              </template>
            </el-table-column>

            <!-- 状态列 -->
            <el-table-column :label="$t('tabStatus')" min-width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="getStatusTagType(row.status)">
                  {{ getStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>

            <!-- 时间戳列 (加密模式 Level 3 零知识脱敏隐藏，全部与隐私模式正常展示) -->
            <el-table-column v-if="currentMode !== 2" :label="$t('auditTimestampFull')" width="150" prop="createTime">
              <template #default="{ row }">
                <span class="plain-time font-mono">
                  {{ row.createTime ? tzDayjs(row.createTime).format('YYYY-MM-DD HH:mm') : '-' }}
                </span>
              </template>
            </el-table-column>

            <!-- 操作列 (人体工学设计，明确展示交互入口，右对齐固定) -->
            <el-table-column :label="$t('tabSetting')" min-width="150" align="right" fixed="right">
              <template #default="{ row }">
                <div class="table-actions">
                  <!-- 申诉警告：突出研判放行 -->
                  <el-button
                    v-if="row.warningType === 'appeal'"
                    size="small"
                    type="primary"
                    @click="openDetails(row)"
                  >
                    {{ $t('auditActionAdjudicateRelease') }}
                  </el-button>

                  <!-- 封禁警告：突出解除封禁 -->
                  <el-button
                    v-else-if="row.warningType === 'ban'"
                    size="small"
                    type="success"
                    plain
                    @click="handleQuickUnban(row)"
                  >
                    {{ $t('auditActionDismissAlert') }}
                  </el-button>

                  <!-- 常规审计/风控：标准下拉操作 -->
                  <el-dropdown v-else @command="(cmd) => handleRowCommand(cmd, row)">
                    <el-button size="small">
                      <span>{{ $t('action') }}</span>
                      <Icon icon="fluent:chevron-down-12-regular" width="12" height="12" style="margin-left: 4px;" />
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="details">
                          <Icon icon="fluent:eye-16-regular" width="14" height="14" style="margin-right: 6px;" />
                          <span>{{ $t('auditViewDetails') }}</span>
                        </el-dropdown-item>
                        <el-dropdown-item command="ban_24h" divided>
                          <Icon icon="fluent:clock-dismiss-20-regular" width="14" height="14" style="margin-right: 6px;" />
                          <span>{{ $t('auditActionTempBan24h') }}</span>
                        </el-dropdown-item>
                        <el-dropdown-item command="ban_account">
                          <Icon icon="fluent:person-prohibited-20-regular" width="14" height="14" style="margin-right: 6px;" />
                          <span>{{ $t('auditActionBanAccount') }}</span>
                        </el-dropdown-item>
                        <el-dropdown-item command="blacklist_ip">
                          <Icon icon="fluent:shield-dismiss-20-regular" width="14" height="14" style="margin-right: 6px;" />
                          <span>{{ $t('auditActionBlacklistIp') }}</span>
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <!-- 底部统一分页器 (对齐“用户列表”) -->
          <div class="pagination">
            <el-pagination
              v-model:current-page="params.num"
              v-model:page-size="params.size"
              :page-sizes="[10, 15, 20, 50]"
              layout="total, sizes, prev, pager, next, jumper"
              :total="total"
              @size-change="handleSizeChange"
              @current-change="handleCurrentChange"
            />
          </div>
        </div>

        <!-- 5. 策略与基线层级分区 (Policy Tier - 遵循 admin-ui-standards 标准卡片体系) -->
        <div v-else class="policy-tier-wrap">
          <div class="policy-grid">
            <!-- Policy Card 1: 邮件安全模式策略 -->
            <div class="policy-card">
              <div class="card-header">
                <Icon icon="fluent:shield-keyhole-20-regular" width="18" height="18" />
                <span class="card-title">{{ $t('auditSpecTitle') }}</span>
              </div>
              <div class="card-body">
                <div class="policy-item">
                  <div class="item-title">{{ $t('auditModeLevel1') }}</div>
                  <div class="item-desc">{{ $t('auditTimelineStreamPresentation') }}</div>
                </div>
                <div class="policy-item">
                  <div class="item-title">{{ $t('auditModeLevel2') }}</div>
                  <div class="item-desc">{{ $t('auditTypeAuditWarningDesc') }}</div>
                </div>
                <div class="policy-item">
                  <div class="item-title">{{ $t('auditModeLevel3') }}</div>
                  <div class="item-desc">{{ $t('auditEncryptedTablePresentation') }}</div>
                </div>
              </div>
            </div>

            <!-- Policy Card 2: 风险分级初判基准 -->
            <div class="policy-card">
              <div class="card-header">
                <Icon icon="fluent:slide-settings-20-regular" width="18" height="18" />
                <span class="card-title">{{ $t('auditRuleEvaluation') }}</span>
              </div>
              <div class="card-body">
                <div class="policy-item">
                  <div class="item-title font-medium text-danger">{{ $t('auditPriorityP0') }}</div>
                  <div class="item-desc">{{ $t('auditLevel3Desc') }}</div>
                </div>
                <div class="policy-item">
                  <div class="item-title font-medium text-amber">{{ $t('auditPriorityP1') }}</div>
                  <div class="item-desc">{{ $t('auditLevel2Desc') }}</div>
                </div>
                <div class="policy-item">
                  <div class="item-title font-medium text-muted">{{ $t('auditPriorityP2') }}</div>
                  <div class="item-desc">{{ $t('auditLevel1Desc') }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </el-scrollbar>

    <!-- 研判放行与双环境比对弹窗 (单一事实来源，无嵌套灰底块) -->
    <el-dialog
      v-model="detailsVisible"
      :title="$t('auditAdjudicationModalTitle')"
      width="640px"
      align-center
      destroy-on-close
      class="audit-dialog"
    >
      <div v-if="selectedRow" class="dialog-body-content">
        <!-- 账号信息纯净行 -->
        <div class="dialog-account-row">
          <span class="info-label">{{ $t('tabEmailAddress') }}:</span>
          <span class="info-value font-medium">{{ selectedRow.email }}</span>
          <el-tag size="small" :type="getStatusTagType(selectedRow.status)" style="margin-left: 8px;">
            {{ getStatusLabel(selectedRow.status) }}
          </el-tag>
        </div>

        <!-- 申诉理由展示 -->
        <div v-if="selectedRow.appealReason" class="appeal-reason-box">
          <div class="info-label">{{ $t('auditAppealReason') }}:</div>
          <div class="plain-appeal-content">“{{ selectedRow.appealReason }}”</div>
        </div>

        <!-- 双环境指标对比 (纯文本展示，不嵌套灰底块) -->
        <div class="env-comparison-table">
          <div class="comparison-col">
            <div class="col-title">{{ $t('auditDeviceRegistered') }}</div>
            <div class="col-item"><span class="k">IP:</span> {{ selectedRow.baseIp || '-' }}</div>
            <div class="col-item"><span class="k">Geo:</span> {{ selectedRow.baseGeo || '-' }}</div>
            <div class="col-item"><span class="k">Device:</span> {{ selectedRow.baseDevice || '-' }}</div>
            <div class="col-item font-mono"><span class="k">FP:</span> {{ selectedRow.baseFingerprint || '-' }}</div>
          </div>
          <div class="comparison-divider"></div>
          <div class="comparison-col">
            <div class="col-title">{{ $t('auditDeviceAppeal') }}</div>
            <div class="col-item"><span class="k">IP:</span> {{ selectedRow.ip || '-' }}</div>
            <div class="col-item"><span class="k">Geo:</span> {{ selectedRow.geo || '-' }}</div>
            <div class="col-item"><span class="k">Device:</span> {{ selectedRow.device || '-' }}</div>
            <div class="col-item font-mono"><span class="k">FP:</span> {{ selectedRow.fingerprint || '-' }}</div>
          </div>
        </div>

        <!-- 匹配结论 (纯文本显示) -->
        <div class="match-summary-row">
          <span>{{ $t('auditDeviceFingerprintMatch') }}: <strong>{{ selectedRow.matchScore || 85 }}%</strong></span>
          <span class="match-desc">({{ selectedRow.subnetMatch ? $t('auditIpSubnetMatch') : $t('auditIpSubnetMismatch') }})</span>
        </div>

        <!-- 研判意见输入 -->
        <div class="decision-section">
          <div class="decision-label">{{ $t('auditAdjudicationNotes') }}:</div>
          <el-input
            v-model="decisionNotes"
            type="textarea"
            :rows="3"
            :placeholder="$t('auditAdjudicationPlaceholder')"
          />
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="detailsVisible = false">{{ $t('cancel') }}</el-button>
          <el-button
            v-if="selectedRow && selectedRow.warningType === 'appeal'"
            type="danger"
            plain
            :loading="actionLoading"
            @click="submitDecision('reject')"
          >
            {{ $t('auditRejectAppeal') }}
          </el-button>
          <el-button
            type="primary"
            :loading="actionLoading"
            @click="submitDecision('approve')"
          >
            {{ $t('auditApproveUnban') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Icon } from '@iconify/vue';
import loading from '@/components/loading/index.vue';
import { tzDayjs } from '@/utils/day.js';
import { useSettingStore } from '@/store/setting.js';
import { auditList, auditAction, auditAdjudicate, auditPurge } from '@/request/audit.js';

defineOptions({
  name: 'audit-report'
});

const { t, locale } = useI18n();
const settingStore = useSettingStore();
const currentMode = computed(() => Number(settingStore.settings?.allMailMode ?? 1));

const tableLoading = ref(true);
const first = ref(true);
const scrollbarRef = ref(null);
const logs = ref([]);
const total = ref(0);

// 4 Upper Reporting KPI metrics
const summaryCounts = reactive({
  audit: 0,
  risk: 0,
  ban: 0,
  appeal: 0,
  total: 0
});

// Operational Tier Partition navigation
const activeTier = ref('stream'); // 'stream' | 'triage' | 'policy'

const params = reactive({
  email: '',
  warningType: 'all',
  riskLevel: 'all',
  status: 'all',
  timeSort: 0,
  num: 1,
  size: 15
});

const detailsVisible = ref(false);
const selectedRow = ref(null);
const decisionNotes = ref('');
const actionLoading = ref(false);

function calcPercent(count) {
  const tot = summaryCounts.total || 1;
  return Math.min(100, Math.round(((count || 0) / tot) * 100));
}

function selectWarningFilter(type) {
  if (params.warningType === type) {
    params.warningType = 'all';
  } else {
    params.warningType = type;
  }
  if (activeTier.value === 'policy') {
    activeTier.value = 'stream';
  }
  search();
}

function switchTier(tier) {
  activeTier.value = tier;
  if (tier === 'triage') {
    params.warningType = 'appeal';
    params.status = 'all';
  } else if (tier === 'stream') {
    params.warningType = 'all';
    params.status = 'all';
  }
  if (tier !== 'policy') {
    search();
  }
}

function getWarningTagType(type) {
  switch (type) {
    case 'audit': return 'warning';
    case 'risk': return 'danger';
    case 'ban': return 'info';
    case 'appeal': return 'primary';
    default: return 'info';
  }
}

function getWarningLabel(type) {
  switch (type) {
    case 'audit': return t('auditTypeAuditWarning');
    case 'risk': return t('auditTypeRiskWarning');
    case 'ban': return t('auditTypeBanWarning');
    case 'appeal': return t('auditTypeAppealWarning');
    default: return t('auditTypeAllAlerts');
  }
}

function getPriorityTagType(priority) {
  switch (priority) {
    case 'P0': return 'danger';
    case 'P1': return 'warning';
    case 'P2': return 'info';
    default: return 'info';
  }
}

function getStatusTagType(status) {
  switch (status) {
    case 'active':
    case 'resolved':
      return 'success';
    case 'banned':
      return 'danger';
    case 'pending':
      return 'warning';
    default:
      return 'info';
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'active': return t('active');
    case 'banned': return t('banned');
    case 'pending': return t('auditAppealStatusPending');
    case 'resolved': return t('auditAppealStatusApproved');
    case 'rejected': return t('auditAppealStatusRejected');
    default: return status || t('unknown');
  }
}

async function fetchAuditList() {
  tableLoading.value = true;
  try {
    const res = await auditList(params);
    const data = res?.list ? res : (res?.data || res || {});
    logs.value = data.list || [];
    total.value = data.total || 0;
    if (data.counts) {
      summaryCounts.audit = data.counts.audit ?? 0;
      summaryCounts.risk = data.counts.risk ?? 0;
      summaryCounts.ban = data.counts.ban ?? 0;
      summaryCounts.appeal = data.counts.appeal ?? 0;
      summaryCounts.total = data.counts.total ?? 0;
    }
  } catch (e) {
    console.error('fetchAuditList error:', e);
  } finally {
    tableLoading.value = false;
    first.value = false;
  }
}

function search() {
  params.num = 1;
  fetchAuditList();
}

function refresh() {
  fetchAuditList();
}

function changeTimeSort() {
  params.timeSort = params.timeSort === 1 ? 0 : 1;
  search();
}

function handleSizeChange(size) {
  params.size = size;
  params.num = 1;
  fetchAuditList();
}

function handleCurrentChange(num) {
  params.num = num;
  fetchAuditList();
}

function openDetails(row) {
  selectedRow.value = row;
  decisionNotes.value = row.warningType === 'appeal' ? t('auditDefaultNoteApproved') : '';
  detailsVisible.value = true;
}

async function handleQuickUnban(row) {
  try {
    await ElMessageBox.confirm(t('auditQuickUnbanConfirm'), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    });
    await auditAction({ id: row.id, action: 'dismiss_alert', targetEmail: row.email });
    ElMessage.success(t('saveSuccessMsg'));
    fetchAuditList();
  } catch (e) {
    if (e !== 'cancel') console.error(e);
  }
}

async function handleRowCommand(cmd, row) {
  if (cmd === 'details') {
    openDetails(row);
    return;
  }
  try {
    await auditAction({ id: row.id, action: cmd, targetEmail: row.email });
    ElMessage.success(t('auditActionSuccess'));
    fetchAuditList();
  } catch (e) {
    console.error(e);
  }
}

async function submitDecision(decision) {
  actionLoading.value = true;
  try {
    await auditAdjudicate({
      id: selectedRow.value.id,
      ticketId: selectedRow.value.ticketId,
      decision,
      notes: decisionNotes.value,
      email: selectedRow.value.email
    });
    ElMessage.success(t('auditActionSuccess'));
    detailsVisible.value = false;
    fetchAuditList();
  } catch (e) {
    console.error(e);
  } finally {
    actionLoading.value = false;
  }
}

async function handlePurge() {
  try {
    await ElMessageBox.confirm(t('auditClearHistoricalConfirm'), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    });
    await auditPurge();
    ElMessage.success(t('auditClearHistoricalSuccess'));
    fetchAuditList();
  } catch (e) {
    if (e !== 'cancel') console.error(e);
  }
}

onMounted(() => {
  fetchAuditList();
});
</script>

<style lang="scss" scoped>
.audit-box {
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.scrollbar {
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.audit-workspace-body {
  padding: 16px 20px 24px 20px;
}

/* 1. 顶部汇报分区 4 板块样式 */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 16px;

  @media (max-width: 1024px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

.kpi-card {
  padding: 14px 16px;
  border-radius: 8px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;

  &:hover {
    border-color: var(--el-color-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  &.highlight-card {
    border-color: var(--el-color-warning);
  }

  &.category-card {
    position: relative;

    &.card-active {
      border-color: var(--el-color-primary) !important;
      background: var(--el-color-primary-light-9) !important;
      box-shadow: 0 0 0 1px var(--el-color-primary), 0 3px 12px rgba(64, 158, 255, 0.12);

      .kpi-label {
        color: var(--el-color-primary) !important;
        font-weight: 600;
      }
    }

    .active-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--el-color-primary);
      display: inline-block;
    }
  }
}

.kpi-icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.ops-icon {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }
  &.risk-icon {
    background: var(--el-color-danger-light-9);
    color: var(--el-color-danger);
  }
  &.ban-icon {
    background: var(--el-fill-color);
    color: var(--el-text-color-secondary);
  }
  &.appeal-icon {
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning);
  }
}

.kpi-info {
  flex: 1;
  min-width: 0;
}

.kpi-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.pulse-beacon {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--el-color-warning);
  animation: pulse-ring 1.8s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite;
}

@keyframes pulse-ring {
  0% { transform: scale(0.9); opacity: 0.8; }
  50% { transform: scale(1.3); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.8; }
}

.kpi-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1.2;
}

.kpi-unit {
  font-size: 12px;
  font-weight: normal;
  color: var(--el-text-color-secondary);
}

.kpi-sub {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kpi-progress-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--el-fill-color-light);
  margin-top: 6px;
  overflow: hidden;
}

.kpi-progress-fill {
  height: 100%;
  border-radius: 2px;

  &.ops-fill { background: var(--el-color-primary); }
  &.risk-fill { background: var(--el-color-danger); }
  &.ban-fill { background: var(--el-text-color-placeholder); }
  &.appeal-fill { background: var(--el-color-warning); }
}

.text-danger { color: var(--el-color-danger) !important; }
.text-amber { color: #d97706 !important; }
.text-muted { color: var(--el-text-color-secondary) !important; }

/* 2. 专门的层级分区导航栏样式 */
.tier-nav-container {
  margin-bottom: 12px;
}

.tier-nav-bar {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--el-border-color);
  padding-bottom: 2px;
}

.tier-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
  user-select: none;

  &:hover {
    color: var(--el-color-primary);
  }

  &.active {
    color: var(--el-color-primary);
    font-weight: 600;

    &::after {
      content: '';
      position: absolute;
      bottom: -3px;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--el-color-primary);
      border-radius: 2px;
    }
  }
}

.tier-badge {
  font-size: 11px;
  background: var(--el-fill-color);
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 600;
  color: var(--el-text-color-regular);

  &.alert-badge {
    background: var(--el-color-danger);
    color: #fff;
  }
}

/* 3. 统一操作栏 (对齐用户列表) */
.header-actions {
  padding: 8px 12px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  font-size: 18px;

  .search-input {
    width: min(220px, calc(100vw - 140px));
  }

  .search {
    :deep(.el-input-group) { height: 28px; }
    :deep(.el-input__inner) { height: 28px; }
  }

  .status-select {
    :deep(.el-select__wrapper) { min-height: 28px; }
  }

  .icon {
    cursor: pointer;
    color: var(--el-text-color-regular);
    transition: color 0.2s;
    &:hover {
      color: var(--el-color-primary);
    }
  }
}

/* 4. 表格容器与分页 */
.table-wrap {
  position: relative;
  border: 1px solid var(--el-border-color);
  border-radius: 0 0 6px 6px;
  background: var(--el-bg-color);
  overflow: hidden;
}

.loading {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--loadding-background);
  left: 0;
  z-index: 2;
  top: 0;
  width: 100%;
  height: 100%;
}

.loading-show {
  transition: all 200ms ease 200ms;
  opacity: 1;
}

.loading-hide {
  pointer-events: none;
  transition: var(--loading-hide-transition);
  opacity: 0;
}

.email-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;

  .email-text {
    cursor: pointer;
    font-weight: 500;
    color: var(--el-color-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    &:hover {
      text-decoration: underline;
    }
  }

  .ticket-tag {
    font-size: 11px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color);
    padding: 1px 5px;
    border-radius: 3px;
    flex-shrink: 0;
  }
}

.plain-action-text {
  font-size: 13px;
  color: var(--el-text-color-primary);
  line-height: 1.4;
  word-break: break-word;
}

.plain-detail-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 3px;
  line-height: 1.35;
  word-break: break-word;
}

.plain-env-text {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.4;

  .env-geo {
    color: var(--el-text-color-secondary);
  }
}

.plain-device-text {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;

  .env-fp {
    color: var(--el-text-color-placeholder);
  }
}

.plain-concurrent-warn {
  font-size: 11px;
  color: var(--el-color-warning);
  font-weight: 500;
  margin-top: 2px;
}

.plain-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.table-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  padding: 10px 16px;
  background: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color-lighter);
}

/* 5. 策略分区样式 (Policy Tier) */
.policy-tier-wrap {
  margin-top: 4px;
}

.policy-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}

.policy-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 16px;

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    padding-bottom: 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    margin-bottom: 14px;
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .policy-item {
    .item-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--el-text-color-primary);
      margin-bottom: 2px;
    }
    .item-desc {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      line-height: 1.4;
    }
  }
}

/* 6. 弹窗详情样式 */
.audit-dialog {
  :deep(.el-dialog__body) {
    padding: 16px 20px;
  }
}

.dialog-body-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dialog-account-row {
  display: flex;
  align-items: center;
  font-size: 13.5px;

  .info-label {
    color: var(--el-text-color-secondary);
    margin-right: 8px;
  }
  .info-value {
    color: var(--el-text-color-primary);
  }
}

.appeal-reason-box {
  .info-label {
    font-size: 12.5px;
    color: var(--el-text-color-secondary);
    margin-bottom: 4px;
  }
  .plain-appeal-content {
    font-size: 13px;
    color: var(--el-text-color-primary);
    line-height: 1.5;
    font-style: italic;
  }
}

.env-comparison-table {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px 14px;

  .comparison-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;

    .col-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--el-text-color-regular);
      margin-bottom: 6px;
    }
    .col-item {
      font-size: 12px;
      color: var(--el-text-color-primary);
      line-height: 1.4;

      .k {
        color: var(--el-text-color-secondary);
        display: inline-block;
        width: 48px;
      }
    }
  }

  .comparison-divider {
    width: 1px;
    background: var(--el-border-color-lighter);
    margin: 0 16px;
  }
}

.match-summary-row {
  font-size: 13px;
  color: var(--el-text-color-primary);

  .match-desc {
    color: var(--el-text-color-secondary);
    margin-left: 8px;
    font-size: 12px;
  }
}

.decision-section {
  .decision-label {
    font-size: 12.5px;
    color: var(--el-text-color-secondary);
    margin-bottom: 6px;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
