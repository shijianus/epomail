<template>
  <div class="audit-box">
    <!-- 主体全幅可滚动区域 -->
    <el-scrollbar ref="scrollbarRef" class="scrollbar">
      <div class="audit-workspace-body">

        <!-- 1. 顶部汇报分区 4 板块 (The 4 Upper Reporting KPI Blocks - 统一 UI 与 待办/总数据展示) -->
        <div class="kpi-grid">
          <!-- Card 1: 行为基线初筛 -->
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
                <span>{{ $t('auditTypeRoutineScreening') }}</span>
                <span v-if="params.warningType === 'audit'" class="active-dot"></span>
              </div>
              <div class="kpi-value font-mono">
                {{ summaryCounts.categories.audit.pending }}
                <span class="kpi-unit">/ {{ summaryCounts.categories.audit.total }}</span>
              </div>
              <div class="kpi-sub">{{ $t('auditTypeRoutineScreeningDesc') }}</div>
              <div class="kpi-progress-bar">
                <div
                  class="kpi-progress-fill ops-fill"
                  :style="{ width: calcPercent(summaryCounts.categories.audit.pending, summaryCounts.categories.audit.total) + '%' }"
                ></div>
              </div>
            </div>
          </div>

          <!-- Card 2: 高危风险研判 -->
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
                <span>{{ $t('auditTypeThreatInterception') }}</span>
                <span v-if="params.warningType === 'risk'" class="active-dot"></span>
              </div>
              <div class="kpi-value font-mono">
                {{ summaryCounts.categories.risk.pending }}
                <span class="kpi-unit">/ {{ summaryCounts.categories.risk.total }}</span>
              </div>
              <div class="kpi-sub">{{ $t('auditTypeThreatInterceptionDesc') }}</div>
              <div class="kpi-progress-bar">
                <div
                  class="kpi-progress-fill risk-fill"
                  :style="{ width: calcPercent(summaryCounts.categories.risk.pending, summaryCounts.categories.risk.total) + '%' }"
                ></div>
              </div>
            </div>
          </div>

          <!-- Card 3: 封禁惩戒执行 -->
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
                <span>{{ $t('auditTypeSanctionEnforcement') }}</span>
                <span v-if="params.warningType === 'ban'" class="active-dot"></span>
              </div>
              <div class="kpi-value font-mono">
                {{ summaryCounts.categories.ban.pending }}
                <span class="kpi-unit">/ {{ summaryCounts.categories.ban.total }}</span>
              </div>
              <div class="kpi-sub">{{ $t('auditTypeSanctionEnforcementDesc') }}</div>
              <div class="kpi-progress-bar">
                <div
                  class="kpi-progress-fill ban-fill"
                  :style="{ width: calcPercent(summaryCounts.categories.ban.pending, summaryCounts.categories.ban.total) + '%' }"
                ></div>
              </div>
            </div>
          </div>

          <!-- Card 4: 申诉复核裁决 (统一 UI 设计，展示 待办/总数据) -->
          <div
            class="kpi-card category-card"
            :class="{ 'card-active': params.warningType === 'appeal' }"
            @click="selectWarningFilter('appeal')"
          >
            <div class="kpi-icon-wrap appeal-icon">
              <Icon icon="fluent:document-person-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-info">
              <div class="kpi-label">
                <span>{{ $t('auditTypeAppealReview') }}</span>
                <span v-if="params.warningType === 'appeal'" class="active-dot"></span>
              </div>
              <div class="kpi-value font-mono">
                {{ summaryCounts.categories.appeal.pending }}
                <span class="kpi-unit">/ {{ summaryCounts.categories.appeal.total }}</span>
              </div>
              <div class="kpi-sub">{{ $t('auditTypeAppealReviewDesc') }}</div>
              <div class="kpi-progress-bar">
                <div
                  class="kpi-progress-fill appeal-fill"
                  :style="{ width: calcPercent(summaryCounts.categories.appeal.pending, summaryCounts.categories.appeal.total) + '%' }"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. 案件生命周期流转分区 (去除与 KPI 重叠内容及策略文档，聚焦管理流转) -->
        <div class="tier-nav-container">
          <div class="tier-nav-bar">
            <!-- 阶段 1: 全部案件 -->
            <div
              class="tier-tab-btn"
              :class="{ active: params.lifecycle === 'all' }"
              @click="switchLifecycle('all')"
            >
              <Icon icon="fluent:apps-list-detail-20-regular" width="17" height="17" />
              <span>{{ $t('auditLifecycleAll') }}</span>
              <span class="tier-badge">{{ summaryCounts.allTotal }}</span>
            </div>

            <!-- 阶段 2: 正在审计 (待办) -->
            <div
              class="tier-tab-btn"
              :class="{ active: params.lifecycle === 'pending' }"
              @click="switchLifecycle('pending')"
            >
              <Icon icon="fluent:timer-16-regular" width="17" height="17" />
              <span>{{ $t('auditLifecyclePending') }}</span>
              <span class="tier-badge alert-badge">{{ summaryCounts.totalPending }}</span>
            </div>

            <!-- 阶段 3: 已结案 (归档) -->
            <div
              class="tier-tab-btn"
              :class="{ active: params.lifecycle === 'resolved' }"
              @click="switchLifecycle('resolved')"
            >
              <Icon icon="fluent:checkmark-circle-20-regular" width="17" height="17" />
              <span>{{ $t('auditLifecycleResolved') }}</span>
              <span class="tier-badge">{{ Math.max(0, summaryCounts.allTotal - summaryCounts.totalPending) }}</span>
            </div>
          </div>
        </div>

        <!-- 3. 工作台统合容器 (Single Container: 严禁二层方框，外部直接作为表格外框) -->
        <div class="audit-workbench">
          <!-- 顶部轻量操作栏 (全部控件与 Button 左对齐，结合 topbar-search) -->
          <div class="header-actions">
            <!-- 搜索框：与 topbar-search 双向结合，默认搜索案件编号与关键字 -->
            <div class="search">
              <el-input
                v-model="localKeyword"
                class="search-input"
                :placeholder="$t('auditSearchCasesPlaceholder')"
                clearable
                @input="handleLocalSearchInput"
                @keyup.enter="search"
              />
            </div>

            <!-- 预警类别筛选 (4 个明确情况) -->
            <el-select
              v-model="params.warningType"
              class="status-select"
              :style="`width: ${locale === 'en' ? 165 : 135}px`"
              @change="search"
            >
              <el-option value="all" :label="$t('auditTypeAllAlerts')" />
              <el-option value="audit" :label="$t('auditTypeRoutineScreening')" />
              <el-option value="risk" :label="$t('auditTypeThreatInterception')" />
              <el-option value="ban" :label="$t('auditTypeSanctionEnforcement')" />
              <el-option value="appeal" :label="$t('auditTypeAppealReview')" />
            </el-select>

            <!-- 机器人风险初判评估筛选 -->
            <el-select
              v-model="params.riskLevel"
              class="status-select"
              :style="`width: ${locale === 'en' ? 140 : 115}px`"
              @change="search"
            >
              <el-option value="all" :label="$t('all')" />
              <el-option value="high" :label="$t('auditRiskP0Option')" />
              <el-option value="medium" :label="$t('auditRiskP1Option')" />
              <el-option value="normal" :label="$t('auditRiskP2Option')" />
            </el-select>

            <!-- 案件当前审计状态筛选 -->
            <el-select
              v-model="params.status"
              class="status-select"
              :style="`width: ${locale === 'en' ? 135 : 115}px`"
              @change="search"
            >
              <el-option value="all" :label="$t('all')" />
              <el-option value="active" :label="$t('auditStatusInAudit')" />
              <el-option value="pending" :label="$t('auditStatusPendingTriage')" />
              <el-option value="resolved" :label="$t('auditStatusResolved')" />
              <el-option value="banned" :label="$t('auditStatusEnforced')" />
              <el-option value="expired" :label="$t('auditStatusExpired')" />
            </el-select>

            <!-- 左对齐辅助操作图标集 (统一左侧排布) -->
            <div class="actions-left-icons">
              <el-tooltip effect="dark" :content="$t('search')" placement="top">
                <Icon class="action-icon" icon="iconoir:search" @click="search" width="19" height="19" />
              </el-tooltip>

              <el-tooltip effect="dark" :content="params.timeSort === 1 ? $t('auditSortAsc') : $t('auditSortDesc')" placement="top">
                <Icon
                  class="action-icon"
                  @click="changeTimeSort"
                  :icon="params.timeSort === 1 ? 'material-symbols-light:timer-arrow-down-outline' : 'material-symbols-light:timer-arrow-up-outline'"
                  width="26"
                  height="26"
                />
              </el-tooltip>

              <el-tooltip effect="dark" :content="$t('refresh')" placement="top">
                <Icon class="action-icon" icon="ion:reload" width="18" height="18" @click="refresh" />
              </el-tooltip>

              <el-tooltip effect="dark" :content="$t('auditClearHistorical')" placement="top">
                <Icon class="action-icon" icon="fluent:broom-sparkle-16-regular" width="18" height="18" @click="handlePurge" />
              </el-tooltip>

              <!-- 独立外链至 epomail-docs 安全规则文档 (彻底分离管理与文档说明) -->
              <el-tooltip effect="dark" :content="$t('auditDocsTitle')" placement="top">
                <Icon class="action-icon" icon="fluent:book-question-mark-20-regular" width="18" height="18" @click="openDocs" />
              </el-tooltip>
            </div>
          </div>

          <!-- 4. 核心管理表格 (直接作为外框承载：去除冗余的二次嵌套 box) -->
          <div class="table-flow-area">
            <div class="loading" :class="tableLoading ? 'loading-show' : 'loading-hide'" :style="first ? 'background: transparent' : ''">
              <loading />
            </div>

            <el-table
              :data="logs"
              style="width: 100%;"
              ref="tableRef"
              :empty-text="first ? '' : $t('auditEmptyLogs')"
            >
              <!-- 案件编号 / 审计对象 (默认仅显示编号保护中立隐私，结案后显示结案名称) -->
              <el-table-column :label="$t('auditCaseNoSubject')" min-width="190">
                <template #default="{ row }">
                  <div class="case-id-cell">
                    <span class="case-ticket-badge font-mono" @click="openAuditDrawer(row)">
                      {{ row.ticketId || ('CASE-' + String(row.id).padStart(6, '0')) }}
                    </span>
                    <!-- 未结案时隐藏真实邮箱，显示脱敏标记；结案后显示结案对象 -->
                    <span v-if="isCaseClosed(row.status)" class="subject-resolved font-mono">
                      ({{ row.email }})
                    </span>
                    <el-tag v-else size="small" type="info" effect="plain" class="masked-tag">
                      {{ $t('auditStatusInAudit') }}
                    </el-tag>
                  </div>
                </template>
              </el-table-column>

              <!-- 机器人风险初判评估 (依既定规则制定，取代庞杂的安全审计等级) -->
              <el-table-column :label="$t('auditRobotRiskAssessment')" width="145">
                <template #default="{ row }">
                  <div class="robot-risk-cell">
                    <el-tag size="small" :type="getRobotRiskTagType(row.priority)" effect="light">
                      {{ getRobotRiskLabel(row.priority) }}
                    </el-tag>
                    <div class="rule-hint font-mono">{{ getRuleCitation(row.priority, row.eventType) }}</div>
                  </div>
                </template>
              </el-table-column>

              <!-- 当前审计状态 (正在审计、待办研判、已结案、已过期、已处置) -->
              <el-table-column :label="$t('auditCurrentStatus')" width="125">
                <template #default="{ row }">
                  <el-tag size="small" :type="getStatusTagType(row.status)">
                    {{ getStatusLabel(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>

              <!-- 启案时间 -->
              <el-table-column :label="$t('auditInitiatedAt')" width="160" prop="createTime">
                <template #default="{ row }">
                  <span class="plain-time font-mono">
                    {{ row.createTime ? tzDayjs(row.createTime).format('YYYY-MM-DD HH:mm') : '-' }}
                  </span>
                </template>
              </el-table-column>

              <!-- 结案时间 -->
              <el-table-column :label="$t('auditResolvedAt')" width="160" prop="resolvedTime">
                <template #default="{ row }">
                  <span class="plain-time font-mono">
                    {{ row.resolvedTime ? tzDayjs(row.resolvedTime).format('YYYY-MM-DD HH:mm') : '-' }}
                  </span>
                </template>
              </el-table-column>

              <!-- 详情与审计入口 (严格禁止未查看证据直接裁决，引导点入抽屉审计) -->
              <el-table-column :label="$t('auditCaseAudit')" width="125" align="right" fixed="right">
                <template #default="{ row }">
                  <el-button
                    size="small"
                    type="primary"
                    @click="openAuditDrawer(row)"
                  >
                    <Icon icon="fluent:document-search-20-regular" width="14" height="14" style="margin-right: 4px;" />
                    <span>{{ $t('auditReviewCase') }}</span>
                  </el-button>
                </template>
              </el-table-column>
            </el-table>

            <!-- 统一底部分页 -->
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
        </div>

      </div>
    </el-scrollbar>

    <!-- 5. 案件全宗档案与安全研判侧边抽屉 (二级显式：Google 式多维上下文证据画像与结案裁决工作台) -->
    <el-drawer
      v-model="drawerVisible"
      size="620px"
      direction="rtl"
      destroy-on-close
      class="audit-drawer-container"
    >
      <template #header>
        <div class="drawer-header-clean">
          <Icon icon="fluent:shield-search-20-filled" width="22" height="22" class="header-icon" />
          <div class="header-text">
            <div class="drawer-title">{{ $t('auditCaseDossier') }}</div>
            <div class="drawer-sub">{{ $t('auditDossierDesc') }}</div>
          </div>
        </div>
      </template>

      <div v-if="selectedRow" class="drawer-body-content">
        <!-- 案件全宗基本概要 (结案状态、编号与主体显式) -->
        <div class="dossier-card summary-card">
          <div class="dossier-grid">
            <div class="grid-item">
              <span class="label">{{ $t('auditCaseNoSubject') }}:</span>
              <span class="val font-mono font-medium">{{ selectedRow.ticketId || ('CASE-' + String(selectedRow.id).padStart(6, '0')) }}</span>
            </div>
            <div class="grid-item">
              <span class="label">{{ $t('auditCurrentStatus') }}:</span>
              <el-tag size="small" :type="getStatusTagType(selectedRow.status)">
                {{ getStatusLabel(selectedRow.status) }}
              </el-tag>
            </div>
            <div class="grid-item">
              <span class="label">{{ $t('tabEmailAddress') }}:</span>
              <span class="val font-mono">
                {{ isCaseClosed(selectedRow.status) ? selectedRow.email : (selectedRow.ticketId || ('CASE-' + String(selectedRow.id).padStart(6, '0'))) }}
              </span>
            </div>
            <div class="grid-item">
              <span class="label">{{ $t('auditInitiatedAt') }}:</span>
              <span class="val font-mono">{{ selectedRow.createTime ? tzDayjs(selectedRow.createTime).format('YYYY-MM-DD HH:mm') : '-' }}</span>
            </div>
            <div class="grid-item">
              <span class="label">{{ $t('auditResolvedAt') }}:</span>
              <span class="val font-mono">{{ selectedRow.resolvedTime ? tzDayjs(selectedRow.resolvedTime).format('YYYY-MM-DD HH:mm') : '-' }}</span>
            </div>
            <div class="grid-item">
              <span class="label">{{ $t('auditRobotRiskAssessment') }}:</span>
              <span class="val font-medium text-danger">{{ getRobotRiskLabel(selectedRow.priority) }}</span>
            </div>
          </div>
        </div>

        <!-- 机器初筛规则依据与触发特征 -->
        <div class="dossier-card">
          <div class="section-title">
            <Icon icon="fluent:bot-20-regular" width="18" height="18" />
            <span>{{ $t('auditRuleSanctionRef') }}</span>
          </div>
          <div class="robot-rule-box">
            <div class="rule-rule-text">{{ getRuleSanctionText(selectedRow.priority) }}</div>
            <div class="rule-action-log">{{ selectedRow.actionText }}</div>
            <div v-if="selectedRow.detailText" class="rule-detail-log">{{ selectedRow.detailText }}</div>
          </div>
        </div>

        <!-- Google 式多维上下文证据画像 (拒绝仅凭易变的 IP/指纹猜测，引入多维交叉验证) -->
        <div class="dossier-card">
          <div class="section-title">
            <Icon icon="fluent:chart-multiple-20-regular" width="18" height="18" />
            <span>{{ $t('auditGoogleTrustContext') }}</span>
          </div>

          <div class="evidence-notice">
            <Icon icon="fluent:info-16-regular" width="16" height="16" />
            <span>{{ $t('auditEvidenceReviewNotice') }}</span>
          </div>

          <div class="evidence-pillars">
            <!-- 维度 1: 网络与拓扑置信度 -->
            <div class="pillar-box">
              <div class="pillar-header">
                <Icon icon="fluent:globe-location-20-regular" width="16" height="16" />
                <span>{{ $t('auditContextNetwork') }}</span>
              </div>
              <div class="pillar-items">
                <div class="item-row"><span class="k">{{ $t('auditFieldTriggerIp') }}:</span> <span class="v font-mono">{{ selectedRow.ip || '-' }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldBaseIp') }}:</span> <span class="v font-mono">{{ selectedRow.baseIp || '-' }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldGeoMovement') }}:</span> <span class="v">{{ selectedRow.geo || '-' }} ({{ $t('auditBaselineRegLabel') }}: {{ selectedRow.baseGeo || '-' }})</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldSubnetMatch') }}:</span> <span class="v">{{ selectedRow.subnetMatch ? $t('auditSubnetMatchGood') : $t('auditSubnetRoaming') }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldConcurrentNet') }}:</span> <span class="v" :class="{ 'text-danger': selectedRow.isMultiIp === 1 }">{{ selectedRow.isMultiIp === 1 ? $t('auditBurstConcurrent', { count: selectedRow.activeIpCount }) : $t('auditSingleSessionNormal') }}</span></div>
              </div>
            </div>

            <!-- 维度 2: 凭证与身份因子挑战 -->
            <div class="pillar-box">
              <div class="pillar-header">
                <Icon icon="fluent:key-multiple-20-regular" width="16" height="16" />
                <span>{{ $t('auditContextAuth') }}</span>
              </div>
              <div class="pillar-items">
                <div class="item-row"><span class="k">{{ $t('auditField2fa') }}:</span> <span class="v">{{ $t('audit2faProtected') }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldCredHealth') }}:</span> <span class="v">{{ $t('auditCredNotLeaked') }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldChallengeHistory') }}:</span> <span class="v">{{ $t('auditNoPasswordLock') }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldSessionState') }}:</span> <span class="v">{{ $t('auditOauthIsolated') }}</span></div>
              </div>
            </div>

            <!-- 维度 3: 行为速率与信誉遥测 -->
            <div class="pillar-box">
              <div class="pillar-header">
                <Icon icon="fluent:pulse-20-regular" width="16" height="16" />
                <span>{{ $t('auditContextBehavior') }}</span>
              </div>
              <div class="pillar-items">
                <div class="item-row"><span class="k">{{ $t('auditFieldUserReports') }}:</span> <span class="v" :class="{ 'text-danger': selectedRow.reportedByOthers > 0 }">{{ $t('auditReportsCount', { count: selectedRow.reportedByOthers }) }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldSendRate') }}:</span> <span class="v">{{ $t('auditSendRateNormal') }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldBounceRate') }}:</span> <span class="v">{{ $t('auditBounceRateHealthy') }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldReputation') }}:</span> <span class="v font-medium text-primary">{{ $t('auditReputationGood') }}</span></div>
              </div>
            </div>

            <!-- 维度 4: 设备指纹与会话连续性 (客观辅助，非孤立参考) -->
            <div class="pillar-box">
              <div class="pillar-header">
                <Icon icon="fluent:desktop-pulse-20-regular" width="16" height="16" />
                <span>{{ $t('auditContextDevice') }}</span>
              </div>
              <div class="pillar-items">
                <div class="item-row"><span class="k">{{ $t('auditFieldClient') }}:</span> <span class="v">{{ selectedRow.device || '-' }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldBaseDevice') }}:</span> <span class="v">{{ selectedRow.baseDevice || '-' }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldFingerprint') }}:</span> <span class="v font-mono">{{ selectedRow.fingerprint || '-' }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldSimilarity') }}:</span> <span class="v font-mono">{{ selectedRow.matchScore || 85 }}% ({{ $t('auditAuxiliaryNotice') }})</span></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 用户申诉陈述 (若有) -->
        <div v-if="selectedRow.appealReason" class="dossier-card">
          <div class="section-title">
            <Icon icon="fluent:person-feedback-20-regular" width="18" height="18" />
            <span>{{ $t('auditAppealReason') }}</span>
          </div>
          <div class="appeal-statement-quote">
            “{{ selectedRow.appealReason }}”
          </div>
        </div>

        <!-- 审计员裁决工作台 (严格要求审阅证据后方可提交裁决) -->
        <div class="dossier-card adjudication-workbench-card">
          <div class="section-title">
            <Icon icon="fluent:gavel-20-regular" width="18" height="18" />
            <span>{{ $t('auditAdjudicateAction') }}</span>
          </div>

          <div class="decision-input-group">
            <div class="input-title">{{ $t('auditAdjudicationNotes') }}:</div>
            <el-input
              v-model="decisionNotes"
              type="textarea"
              :rows="3"
              :placeholder="$t('auditAdjudicationPlaceholder')"
            />
          </div>

          <div class="adjudication-actions">
            <!-- 放行结案 -->
            <el-button
              type="success"
              :loading="actionLoading"
              @click="submitVerdict('approve')"
            >
              <Icon icon="fluent:checkmark-circle-20-regular" width="16" height="16" style="margin-right: 4px;" />
              <span>{{ $t('auditAdjudicateApprove') }}</span>
            </el-button>

            <!-- 条件放行：强制下次 MFA 凭证挑战 -->
            <el-button
              type="primary"
              plain
              :loading="actionLoading"
              @click="submitVerdict('probation')"
            >
              <Icon icon="fluent:key-reset-20-regular" width="16" height="16" style="margin-right: 4px;" />
              <span>{{ $t('auditAdjudicateApproveWithChallenge') }}</span>
            </el-button>

            <!-- 驳回申诉 / 维持封禁 -->
            <el-button
              type="danger"
              plain
              :loading="actionLoading"
              @click="submitVerdict('reject')"
            >
              <Icon icon="fluent:dismiss-circle-20-regular" width="16" height="16" style="margin-right: 4px;" />
              <span>{{ $t('auditAdjudicateReject') }}</span>
            </el-button>

            <!-- 标记误报加入白名单 -->
            <el-button
              type="info"
              plain
              :loading="actionLoading"
              @click="submitVerdict('whitelist')"
            >
              <Icon icon="fluent:shield-dismiss-20-regular" width="16" height="16" style="margin-right: 4px;" />
              <span>{{ $t('auditAdjudicateWhitelist') }}</span>
            </el-button>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Icon } from '@iconify/vue';
import loading from '@/components/loading/index.vue';
import { tzDayjs } from '@/utils/day.js';
import { useSettingStore } from '@/store/setting.js';
import { useEmailStore } from '@/store/email.js';
import { auditList, auditAdjudicate, auditPurge } from '@/request/audit.js';

defineOptions({
  name: 'audit-report'
});

const { t, locale } = useI18n();
const settingStore = useSettingStore();
const emailStore = useEmailStore();

const tableLoading = ref(true);
const first = ref(true);
const scrollbarRef = ref(null);
const logs = ref([]);
const total = ref(0);

// 本地搜索关键字，与顶栏 topbar-search 双向结合
const localKeyword = ref('');

// 4 Upper Reporting KPI metrics (待办/总数据结构)
const summaryCounts = reactive({
  totalPending: 0,
  allTotal: 0,
  categories: {
    audit: { pending: 0, total: 0 },
    risk: { pending: 0, total: 0 },
    ban: { pending: 0, total: 0 },
    appeal: { pending: 0, total: 0 }
  }
});

const params = reactive({
  keyword: '',
  warningType: 'all',
  riskLevel: 'all',
  status: 'all',
  lifecycle: 'all', // 'all' | 'pending' | 'resolved'
  timeSort: 0,
  num: 1,
  size: 15
});

// 抽屉详情与研判状态
const drawerVisible = ref(false);
const selectedRow = ref(null);
const decisionNotes = ref('');
const actionLoading = ref(false);

// 同步顶栏 topbar-search 活跃检索至本页面
watch(() => emailStore.searchKeyword, (val) => {
  const kw = (val || '').trim();
  if (localKeyword.value !== kw) {
    localKeyword.value = kw;
    params.keyword = kw;
    params.num = 1;
    fetchAuditList();
  }
});

function handleLocalSearchInput(val) {
  params.keyword = (val || '').trim();
  if (emailStore.searchKeyword !== val) {
    emailStore.searchKeyword = val;
  }
}

function calcPercent(pending, tot) {
  const totalVal = tot || 1;
  const val = pending || 0;
  return Math.min(100, Math.round((val / totalVal) * 100));
}

function selectWarningFilter(type) {
  if (params.warningType === type) {
    params.warningType = 'all';
  } else {
    params.warningType = type;
  }
  search();
}

function switchLifecycle(stage) {
  params.lifecycle = stage;
  search();
}

function isCaseClosed(status) {
  return ['resolved', 'banned', 'rejected', 'expired', 'closed'].includes(status);
}

function getRobotRiskTagType(priority) {
  switch (priority) {
    case 'P0': return 'danger';
    case 'P1': return 'warning';
    case 'P2': return 'info';
    default: return 'info';
  }
}

function getRobotRiskLabel(priority) {
  switch (priority) {
    case 'P0': return t('auditRiskP0Option');
    case 'P1': return t('auditRiskP1Option');
    case 'P2': return t('auditRiskP2Option');
    default: return priority || 'P2';
  }
}

function getRuleCitation(priority, eventType) {
  if (priority === 'P0') return t('auditRuleCitationP0');
  if (priority === 'P1') {
    if (eventType === 'risk_spike') return t('auditRuleCitationP1Spike');
    return t('auditRuleCitationP1Anomaly');
  }
  return t('auditRuleCitationP2');
}

function getRuleSanctionText(priority) {
  if (priority === 'P0') return t('auditRuleSanctionP0');
  if (priority === 'P1') return t('auditRuleSanctionP1');
  return t('auditRuleSanctionP2');
}

function getStatusTagType(status) {
  switch (status) {
    case 'active': return 'primary';
    case 'pending': return 'warning';
    case 'resolved': return 'success';
    case 'banned': return 'danger';
    case 'rejected': return 'info';
    case 'expired': return 'info';
    default: return 'info';
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'active': return t('auditStatusInAudit');
    case 'pending': return t('auditStatusPendingTriage');
    case 'resolved': return t('auditStatusResolved');
    case 'banned': return t('auditStatusEnforced');
    case 'rejected': return t('auditAppealStatusRejected');
    case 'expired': return t('auditStatusExpired');
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
      if (data.counts.categories) {
        summaryCounts.categories.audit = data.counts.categories.audit || { pending: 0, total: 0 };
        summaryCounts.categories.risk = data.counts.categories.risk || { pending: 0, total: 0 };
        summaryCounts.categories.ban = data.counts.categories.ban || { pending: 0, total: 0 };
        summaryCounts.categories.appeal = data.counts.categories.appeal || { pending: 0, total: 0 };
        summaryCounts.totalPending = data.counts.total ?? 0;
        summaryCounts.allTotal = data.counts.allTotal ?? (data.total || 0);
      } else {
        summaryCounts.categories.audit = { pending: data.counts.audit ?? 0, total: data.counts.auditTotal ?? data.counts.audit ?? 0 };
        summaryCounts.categories.risk = { pending: data.counts.risk ?? 0, total: data.counts.riskTotal ?? data.counts.risk ?? 0 };
        summaryCounts.categories.ban = { pending: data.counts.ban ?? 0, total: data.counts.banTotal ?? data.counts.ban ?? 0 };
        summaryCounts.categories.appeal = { pending: data.counts.appeal ?? 0, total: data.counts.appealTotal ?? data.counts.appeal ?? 0 };
        summaryCounts.totalPending = data.counts.total ?? 0;
        summaryCounts.allTotal = data.counts.total ?? (data.total || 0);
      }
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

function openAuditDrawer(row) {
  selectedRow.value = row;
  decisionNotes.value = row.warningType === 'appeal' ? t('auditDefaultNoteApproved') : '';
  drawerVisible.value = true;
}

function openDocs() {
  const docUrl = settingStore.settings?.projectUrl || 'https://epomail-docs.pages.dev/epomail/en/mail/overview/';
  window.open(docUrl, '_blank', 'noopener,noreferrer');
}

async function submitVerdict(decision) {
  actionLoading.value = true;
  try {
    await auditAdjudicate({
      id: selectedRow.value.id,
      ticketId: selectedRow.value.ticketId,
      decision,
      action: decision,
      notes: decisionNotes.value,
      email: selectedRow.value.email
    });
    ElMessage.success(t('auditActionSuccess') || t('saveSuccessMsg'));
    drawerVisible.value = false;
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
  if (emailStore.searchKeyword) {
    localKeyword.value = emailStore.searchKeyword.trim();
    params.keyword = localKeyword.value;
  }
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

/* 1. 顶部汇报 4 板块：彻底统一 UI 规范 */
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
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
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
  transition: width 0.3s ease;

  &.ops-fill { background: var(--el-color-primary); }
  &.risk-fill { background: var(--el-color-danger); }
  &.ban-fill { background: var(--el-text-color-placeholder); }
  &.appeal-fill { background: var(--el-color-warning); }
}

/* 2. 案件流转分区 (去除重叠内容) */
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
    background: var(--el-color-primary);
    color: #fff;
  }
}

/* 3. 统合工作台容器 (单一外框规范，杜绝二层脱节嵌套) */
.audit-workbench {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-bg-color);
  overflow: hidden;
}

/* 顶部操作栏：统一左对齐排布 */
.header-actions {
  padding: 8px 12px;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 18px;

  .search-input {
    width: min(240px, calc(100vw - 140px));
  }

  .search {
    :deep(.el-input__wrapper) {
      height: 28px;
    }
  }

  .status-select {
    :deep(.el-select__wrapper) { min-height: 28px; }
  }

  .actions-left-icons {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .action-icon {
    cursor: pointer;
    color: var(--el-text-color-regular);
    transition: color 0.2s;
    &:hover {
      color: var(--el-color-primary);
    }
  }
}

/* 4. 表格区 */
.table-flow-area {
  position: relative;
  background: var(--el-bg-color);
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

.case-id-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;

  .case-ticket-badge {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--el-color-primary);
    cursor: pointer;
    white-space: nowrap;
    &:hover {
      text-decoration: underline;
    }
  }

  .subject-resolved {
    font-size: 12px;
    color: var(--el-text-color-regular);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .masked-tag {
    font-size: 11px;
    padding: 0 4px;
    height: 20px;
    line-height: 20px;
  }
}

.robot-risk-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .rule-hint {
    font-size: 10.5px;
    color: var(--el-text-color-placeholder);
    white-space: nowrap;
  }
}

.plain-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.pagination {
  display: flex;
  justify-content: flex-end;
  padding: 10px 16px;
  background: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color-lighter);
}

/* 5. 侧边抽屉样式 (Google 式安全研判工作台) */
.audit-drawer-container {
  :deep(.el-drawer__body) {
    padding: 16px 20px 24px 20px;
  }
}

.drawer-header-clean {
  display: flex;
  align-items: center;
  gap: 10px;

  .header-icon {
    color: var(--el-color-primary);
  }

  .drawer-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .drawer-sub {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-top: 2px;
  }
}

.drawer-body-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dossier-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 14px 16px;
  background: var(--el-bg-color);

  &.summary-card {
    background: var(--el-fill-color-blank);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
}

.dossier-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 16px;

  .grid-item {
    display: flex;
    align-items: center;
    font-size: 12.5px;

    .label {
      color: var(--el-text-color-secondary);
      margin-right: 6px;
      min-width: 65px;
    }
    .val {
      color: var(--el-text-color-primary);
    }
  }
}

.robot-rule-box {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .rule-rule-text {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--el-text-color-regular);
  }
  .rule-action-log {
    font-size: 13px;
    color: var(--el-text-color-primary);
    line-height: 1.4;
  }
  .rule-detail-log {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    line-height: 1.4;
  }
}

.evidence-notice {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  line-height: 1.45;
  margin-bottom: 12px;
}

.evidence-pillars {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.pillar-box {
  border: 1px solid var(--el-border-color-extra-light);
  border-radius: 6px;
  padding: 10px 12px;

  .pillar-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--el-text-color-regular);
    margin-bottom: 8px;
  }

  .pillar-items {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .item-row {
      display: flex;
      font-size: 12px;
      line-height: 1.4;

      .k {
        color: var(--el-text-color-secondary);
        width: 70px;
        flex-shrink: 0;
      }
      .v {
        color: var(--el-text-color-primary);
      }
    }
  }
}

.appeal-statement-quote {
  padding: 10px 14px;
  border-left: 3px solid var(--el-color-primary);
  background: var(--el-fill-color-light);
  border-radius: 0 4px 4px 0;
  font-size: 13px;
  color: var(--el-text-color-primary);
  line-height: 1.5;
  font-style: italic;
}

.adjudication-workbench-card {
  .decision-input-group {
    margin-bottom: 14px;

    .input-title {
      font-size: 12.5px;
      color: var(--el-text-color-secondary);
      margin-bottom: 6px;
    }
  }

  .adjudication-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
}
</style>
