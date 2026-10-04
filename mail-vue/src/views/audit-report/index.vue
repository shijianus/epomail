<template>
  <div class="audit-box">
    <!-- 顶部统一操作栏 (学习“用户列表”模式) -->
    <div class="header-actions">
      <div class="search">
        <el-input
          v-model="params.email"
          class="search-input"
          :placeholder="$t('searchByEmail')"
          clearable
          @keyup.enter="search"
        />
      </div>

      <el-select
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

      <Icon class="icon" icon="iconoir:search" @click="search" width="20" height="20" :title="$t('search')" />

      <Icon
        class="icon"
        @click="changeTimeSort"
        icon="material-symbols-light:timer-arrow-down-outline"
        v-if="params.timeSort === 1"
        width="28"
        height="28"
        :title="$t('sort')"
      />
      <Icon
        class="icon"
        @click="changeTimeSort"
        icon="material-symbols-light:timer-arrow-up-outline"
        v-else
        width="28"
        height="28"
        :title="$t('sort')"
      />

      <Icon class="icon" icon="ion:reload" width="18" height="18" @click="refresh" :title="$t('refresh')" />
      <Icon class="icon" icon="fluent:broom-sparkle-16-regular" width="18" height="18" @click="handlePurge" :title="$t('auditClearHistorical')" />
    </div>

    <!-- 全幅滚动表格区域 -->
    <el-scrollbar ref="scrollbarRef" class="scrollbar">
      <div>
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
          <el-table-column :label="$t('tabStatus')" min-width="100">
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
          <el-table-column :label="$t('tabSetting')" min-width="140" align="right" fixed="right">
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

                <!-- 其他常规审计与风控：更多操作下拉菜单 -->
                <el-dropdown v-else trigger="click" @command="(cmd) => handleRowCommand(cmd, row)">
                  <el-button size="small" type="primary">
                    {{ $t('action') }}
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="details">{{ $t('auditViewDetails') }}</el-dropdown-item>
                      <el-dropdown-item command="ban" style="color: #f56c6c;">{{ $t('auditActionBanAccount') }}</el-dropdown-item>
                      <el-dropdown-item command="unban">{{ $t('auditActionDismissAlert') }}</el-dropdown-item>
                      <el-dropdown-item command="delete" divided>{{ $t('delete') }}</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <!-- 统一分页 -->
        <div class="pagination" v-if="total > 10">
          <el-pagination
            :current-page="params.num"
            :page-size="params.size"
            :page-sizes="[10, 15, 20, 30, 50]"
            background
            layout="prev, pager, next, sizes, total"
            :total="total"
            @size-change="handleSizeChange"
            @current-change="handleCurrentChange"
          />
        </div>
      </div>
    </el-scrollbar>

    <!-- 研判与审计详情弹窗 (单一事实来源，纯净无灰底框) -->
    <el-dialog
      v-model="detailsVisible"
      :title="$t('auditInspectDetails')"
      class="audit-dialog"
      width="580px"
      destroy-on-close
    >
      <div v-if="selectedRow" class="dialog-body-clean">
        <!-- 账号基本信息行 -->
        <div class="dialog-info-row">
          <span class="info-label">{{ $t('tabEmailAddress') }}:</span>
          <span class="info-value font-mono">{{ selectedRow.email }}</span>
          <el-tag size="small" :type="getStatusTagType(selectedRow.status)" style="margin-left: 8px;">
            {{ getStatusLabel(selectedRow.status) }}
          </el-tag>
        </div>

        <!-- 申诉自述 (如有) -->
        <div v-if="selectedRow.appealReason" class="dialog-appeal-box">
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
  } else if (cmd === 'ban') {
    await auditAction({ id: row.id, action: 'ban_account', targetEmail: row.email });
    ElMessage.success(t('saveSuccessMsg'));
    fetchAuditList();
  } else if (cmd === 'unban') {
    await auditAction({ id: row.id, action: 'unban', targetEmail: row.email });
    ElMessage.success(t('saveSuccessMsg'));
    fetchAuditList();
  } else if (cmd === 'delete') {
    await auditAction({ id: row.id, action: 'delete' });
    ElMessage.success(t('delSuccessMsg'));
    fetchAuditList();
  }
}

async function submitDecision(action) {
  if (!selectedRow.value) return;
  actionLoading.value = true;
  try {
    await auditAdjudicate({
      id: selectedRow.value.id,
      action,
      notes: decisionNotes.value,
      purgeOnRelease: true
    });
    ElMessage.success(t('saveSuccessMsg'));
    detailsVisible.value = false;
    fetchAuditList();
  } catch (e) {
    console.error('submitDecision error:', e);
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
}

.header-actions {
  padding: 9px 15px;
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
  align-items: center;
  box-shadow: var(--header-actions-border);
  font-size: 18px;

  .search-input {
    width: min(220px, calc(100vw - 140px));
  }

  .search {
    :deep(.el-input-group) {
      height: 28px;
    }
    :deep(.el-input__inner) {
      height: 28px;
    }
  }

  .status-select {
    :deep(.el-select__wrapper) {
      min-height: 28px;
    }
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

.scrollbar {
  width: 100%;
  overflow: auto;
  height: calc(100% - 50px);
  @media (max-width: 464px) {
    height: calc(100% - 90px);
  }
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
    flex-shrink: 0;
  }
}

/* 显式内容纯文本展示 (不打底、无多余长方框) */
.plain-action-text {
  font-size: 13px;
  color: var(--el-text-color-primary);
  line-height: 1.4;
  margin-bottom: 2px;
}

.plain-detail-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.3;
}

.plain-env-text {
  font-size: 12px;
  color: var(--el-text-color-primary);
  line-height: 1.4;
  .env-geo {
    color: var(--el-text-color-secondary);
  }
}

.plain-device-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.3;
  .env-fp {
    opacity: 0.8;
  }
}

.plain-concurrent-warn {
  font-size: 11px;
  color: var(--el-color-warning);
  margin-top: 2px;
}

.plain-time {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.table-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.pagination {
  margin-top: 15px;
  margin-bottom: 20px;
  padding-right: 30px;
  width: 100%;
  display: flex;
  justify-content: end;
  @media (max-width: 767px) {
    padding-right: 10px;
  }
}

/* 详情弹窗纯净化 (无嵌套灰底色块) */
.dialog-body-clean {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 4px;

  .dialog-info-row {
    display: flex;
    align-items: center;
    font-size: 14px;
    .info-label {
      color: var(--el-text-color-secondary);
      margin-right: 8px;
    }
    .info-value {
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
  }

  .dialog-appeal-box {
    .info-label {
      font-size: 13px;
      color: var(--el-text-color-secondary);
      margin-bottom: 4px;
    }
    .plain-appeal-content {
      font-size: 13px;
      line-height: 1.5;
      color: var(--el-text-color-primary);
      font-style: italic;
    }
  }

  .env-comparison-table {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 12px;
    border-top: 1px solid var(--el-border-color-lighter);
    border-bottom: 1px solid var(--el-border-color-lighter);
    padding: 12px 0;

    .comparison-col {
      font-size: 12px;
      line-height: 1.6;
      .col-title {
        font-weight: 600;
        margin-bottom: 4px;
        color: var(--el-text-color-primary);
      }
      .col-item {
        color: var(--el-text-color-regular);
        .k {
          color: var(--el-text-color-secondary);
          margin-right: 4px;
        }
      }
    }

    .comparison-divider {
      width: 1px;
      background-color: var(--el-border-color-lighter);
    }
  }

  .match-summary-row {
    font-size: 13px;
    color: var(--el-text-color-primary);
    display: flex;
    align-items: center;
    gap: 6px;
    .match-desc {
      color: var(--el-text-color-secondary);
      font-size: 12px;
    }
  }

  .decision-section {
    .decision-label {
      font-size: 13px;
      color: var(--el-text-color-secondary);
      margin-bottom: 6px;
    }
  }
}
</style>
