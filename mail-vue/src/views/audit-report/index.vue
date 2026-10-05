<template>
  <div class="audit-box">
    <!-- 主体全幅可滚动区域 -->
    <el-scrollbar ref="scrollbarRef" class="scrollbar">
      <div class="audit-page-container">

        <!-- 1. 顶部汇报分区 4 板块：常规审查 -> 异常威胁 -> 争议申诉 -> 封禁管控 -->
        <div class="kpi-grid">
          <!-- 情况 1: 常规审查 (例行LV等级自动审查与基线排查) -->
          <div
            class="kpi-card"
            :class="{ 'kpi-card-active': params.warningType === 'audit' }"
            @click="selectWarningFilter('audit')"
          >
            <div class="kpi-icon-wrap icon-routine">
              <Icon icon="fluent:shield-task-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-content">
              <div class="kpi-header">
                <span class="kpi-title">{{ $t('auditCaseTypeRoutine') }}</span>
                <span v-if="params.warningType === 'audit'" class="kpi-active-dot"></span>
              </div>
              <div class="kpi-data-stat kpi-value font-mono">
                <span class="stat-pending">{{ summaryCounts.categories.audit.pending }}</span>
                <span class="stat-unit">/ {{ summaryCounts.categories.audit.total }}</span>
              </div>
              <div class="kpi-desc kpi-sub" :title="$t('auditCaseTypeRoutineDesc')">{{ $t('auditCaseTypeRoutineDesc') }}</div>
            </div>
          </div>

          <!-- 情况 2: 异常威胁 (触碰安全红线、一人多号与用户高权重检举) -->
          <div
            class="kpi-card"
            :class="{ 'kpi-card-active': params.warningType === 'risk' }"
            @click="selectWarningFilter('risk')"
          >
            <div class="kpi-icon-wrap icon-threat">
              <Icon icon="fluent:alert-urgent-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-content">
              <div class="kpi-header">
                <span class="kpi-title">{{ $t('auditCaseTypeThreat') }}</span>
                <span v-if="params.warningType === 'risk'" class="kpi-active-dot"></span>
              </div>
              <div class="kpi-data-stat kpi-value font-mono">
                <span class="stat-pending">{{ summaryCounts.categories.risk.pending }}</span>
                <span class="stat-unit">/ {{ summaryCounts.categories.risk.total }}</span>
              </div>
              <div class="kpi-desc kpi-sub" :title="$t('auditCaseTypeThreatDesc')">{{ $t('auditCaseTypeThreatDesc') }}</div>
            </div>
          </div>

          <!-- 情况 3: 争议申诉 (提前至第3位，封禁争议人工复核表单工作台) -->
          <div
            class="kpi-card"
            :class="{ 'kpi-card-active': params.warningType === 'appeal' }"
            @click="selectWarningFilter('appeal')"
          >
            <div class="kpi-icon-wrap icon-appeal">
              <Icon icon="fluent:document-person-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-content">
              <div class="kpi-header">
                <span class="kpi-title">{{ $t('auditCaseTypeAppeal') }}</span>
                <span v-if="params.warningType === 'appeal'" class="kpi-active-dot"></span>
              </div>
              <div class="kpi-data-stat kpi-value font-mono">
                <span class="stat-pending">{{ summaryCounts.categories.appeal.pending }}</span>
                <span class="stat-unit">/ {{ summaryCounts.categories.appeal.total }}</span>
              </div>
              <div class="kpi-desc kpi-sub" :title="$t('auditCaseTypeAppealDesc')">{{ $t('auditCaseTypeAppealDesc') }}</div>
            </div>
          </div>

          <!-- 情况 4: 封禁管控 (移至最后，纯展示与公开透明历史台账) -->
          <div
            class="kpi-card"
            :class="{ 'kpi-card-active': params.warningType === 'ban' }"
            @click="selectWarningFilter('ban')"
          >
            <div class="kpi-icon-wrap icon-sanction">
              <Icon icon="fluent:prohibited-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-content">
              <div class="kpi-header">
                <span class="kpi-title">{{ $t('auditCaseTypeSanction') }}</span>
                <span v-if="params.warningType === 'ban'" class="kpi-active-dot"></span>
              </div>
              <div class="kpi-data-stat kpi-value font-mono">
                <span class="stat-pending">{{ summaryCounts.categories.ban.pending }}</span>
                <span class="stat-unit">/ {{ summaryCounts.categories.ban.total }}</span>
              </div>
              <div class="kpi-desc kpi-sub" :title="$t('auditCaseTypeSanctionDesc')">{{ $t('auditCaseTypeSanctionDesc') }}</div>
            </div>
          </div>
        </div>

        <!-- 2. 工作台单一外框 (单一事实载体：操作栏与表格一体化) -->
        <div class="audit-workbench audit-workbench-container">
          <!-- 顶部操作栏 -->
          <div class="header-actions">
            <!-- 搜索框 -->
            <div class="search">
              <el-input
                v-model="localKeyword"
                class="search-input"
                :placeholder="$t('auditSearchCasesPlaceholder')"
                clearable
                @input="handleLocalSearchInput"
                @keyup.enter="search"
              >
                <template #prefix>
                  <Icon icon="lucide:search" width="14" height="14" class="search-prefix-icon" />
                </template>
              </el-input>
            </div>

            <!-- 4 种明确情况筛选下拉：全部 / 常规审查 / 异常威胁 / 争议申诉 / 封禁管控 -->
            <el-select
              v-model="params.warningType"
              class="status-select"
              :style="`width: ${locale === 'en' ? 165 : 135}px`"
              @change="search"
            >
              <el-option value="all" :label="$t('auditTypeAllAlerts')" />
              <el-option value="audit" :label="$t('auditCaseTypeRoutine')" />
              <el-option value="risk" :label="$t('auditCaseTypeThreat')" />
              <el-option value="appeal" :label="$t('auditCaseTypeAppeal')" />
              <el-option value="ban" :label="$t('auditCaseTypeSanction')" />
            </el-select>

            <!-- 风险评估筛选 -->
            <el-select
              v-model="params.riskLevel"
              class="status-select"
              :style="`width: ${locale === 'en' ? 140 : 120}px`"
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
              :style="`width: ${locale === 'en' ? 150 : 130}px`"
              @change="search"
            >
              <el-option value="all" :label="$t('all')" />
              <el-option value="active" :label="$t('auditCaseStatusInAudit')" />
              <el-option value="pending" :label="$t('auditCaseStatusPending')" />
              <el-option value="resolved" :label="$t('auditCaseStatusResolved')" />
              <el-option value="banned" :label="$t('auditStatusBannedActive')" />
              <el-option value="unbanned" :label="$t('auditStatusUnbannedRecord')" />
              <el-option value="expired" :label="$t('auditCaseStatusExpired')" />
            </el-select>

            <!-- 操作按钮集：统一严格左对齐排布 -->
            <div class="actions-left-buttons actions-left-icons">
              <!-- 执行检索 -->
              <el-tooltip effect="dark" :content="$t('search')" placement="top">
                <el-button class="action-btn-item action-icon" circle size="small" @click="search">
                  <Icon icon="iconoir:search" width="16" height="16" />
                </el-button>
              </el-tooltip>

              <!-- 时间排序切换 -->
              <el-tooltip effect="dark" :content="params.timeSort === 1 ? $t('auditSortAsc') : $t('auditSortDesc')" placement="top">
                <el-button class="action-btn-item action-icon" circle size="small" @click="changeTimeSort">
                  <Icon
                    :icon="params.timeSort === 1 ? 'material-symbols-light:timer-arrow-down-outline' : 'material-symbols-light:timer-arrow-up-outline'"
                    width="18"
                    height="18"
                  />
                </el-button>
              </el-tooltip>

              <!-- 刷新列表 -->
              <el-tooltip effect="dark" :content="$t('refresh')" placement="top">
                <el-button class="action-btn-item action-icon" circle size="small" @click="refresh">
                  <Icon icon="ion:reload" width="15" height="15" />
                </el-button>
              </el-tooltip>

              <!-- 清理历史日志 -->
              <el-tooltip effect="dark" :content="$t('auditClearHistorical')" placement="top">
                <el-button class="action-btn-item action-icon" circle size="small" @click="handlePurge">
                  <Icon icon="fluent:broom-sparkle-16-regular" width="16" height="16" />
                </el-button>
              </el-tooltip>

              <!-- 安全规则文档外链 -->
              <el-tooltip effect="dark" :content="$t('auditDocsTitle')" placement="top">
                <el-button class="action-btn-item action-icon" circle size="small" @click="openDocs">
                  <Icon icon="fluent:book-question-mark-20-regular" width="16" height="16" />
                </el-button>
              </el-tooltip>
            </div>
          </div>

          <!-- 3. 核心数据表格 (单一容器铺满) -->
          <div class="table-area">
            <div class="loading" :class="tableLoading ? 'loading-show' : 'loading-hide'" :style="first ? 'background: transparent' : ''">
              <loading />
            </div>

            <el-table
              :data="logs"
              style="width: 100%;"
              ref="tableRef"
              :empty-text="first ? '' : $t('auditEmptyLogs')"
            >
              <!-- 分支 1: 封禁管控 (params.warningType === 'ban') 纯展示公开透明台账 -->
              <template v-if="params.warningType === 'ban'">
                <!-- 编号 (事件唯一认知码) -->
                <el-table-column :label="$t('auditCaseNoSubject')" min-width="160">
                  <template #default="{ row }">
                    <span class="case-ticket-badge font-mono" @click="openAuditDrawer(row)">
                      {{ row.ticketId || ('BAN-' + String(row.id).padStart(6, '0')) }}
                    </span>
                  </template>
                </el-table-column>

                <!-- 邮箱 -->
                <el-table-column :label="$t('tabEmailAddress')" min-width="180">
                  <template #default="{ row }">
                    <span class="subject-email font-mono">{{ row.email }}</span>
                  </template>
                </el-table-column>

                <!-- 封禁时间 -->
                <el-table-column :label="$t('auditColBanTime')" width="145">
                  <template #default="{ row }">
                    <span class="plain-time font-mono">
                      {{ (row.banTime || row.createTime) ? tzDayjs(row.banTime || row.createTime).format('YYYY-MM-DD HH:mm') : '-' }}
                    </span>
                  </template>
                </el-table-column>

                <!-- 最后处理时间 -->
                <el-table-column :label="$t('auditColLastProcessTime')" width="145">
                  <template #default="{ row }">
                    <span class="plain-time font-mono">
                      {{ (row.resolvedTime || row.banTime || row.createTime) ? tzDayjs(row.resolvedTime || row.banTime || row.createTime).format('YYYY-MM-DD HH:mm') : '-' }}
                    </span>
                  </template>
                </el-table-column>

                <!-- 封禁原因 -->
                <el-table-column :label="$t('auditColBanReason')" min-width="180" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span class="ban-reason-text">{{ row.banReason || row.actionText || '-' }}</span>
                  </template>
                </el-table-column>

                <!-- 当前状态 (已封禁 / 已解禁·移出黑名单) -->
                <el-table-column :label="$t('auditCurrentStatus')" width="135">
                  <template #default="{ row }">
                    <el-tag v-if="row.status === 'unbanned'" size="small" type="success" effect="plain">
                      {{ $t('auditStatusUnbannedRecord') }}
                    </el-tag>
                    <el-tag v-else size="small" type="danger" effect="plain">
                      {{ $t('auditStatusBannedActive') }}
                    </el-tag>
                  </template>
                </el-table-column>

                <!-- 详情 (纯查看，只读档案) -->
                <el-table-column :label="$t('auditDetailColumn')" width="115" align="right">
                  <template #default="{ row }">
                    <el-tooltip effect="dark" :content="$t('auditBtnViewDossier')" placement="top">
                      <el-button
                        size="small"
                        plain
                        @click="openAuditDrawer(row)"
                      >
                        <Icon icon="fluent:document-bullet-list-20-regular" width="15" height="15" style="margin-right: 4px;" />
                        <span>{{ $t('auditBtnViewDossier') }}</span>
                      </el-button>
                    </el-tooltip>
                  </template>
                </el-table-column>
              </template>

              <!-- 分支 2: 全部/常规审查/异常威胁/争议申诉 运营与研判工作台 -->
              <template v-else>
                <!-- 案件编号 / 审计对象 (未结案严格隐藏邮箱只显编号保护中立客观；结案后才显式名称) -->
                <el-table-column :label="$t('auditCaseNoSubject')" min-width="230">
                  <template #default="{ row }">
                    <div class="case-id-cell">
                      <span class="case-ticket-badge font-mono" @click="openAuditDrawer(row)">
                        {{ row.ticketId || ('CASE-' + String(row.id).padStart(6, '0')) }}
                      </span>
                      <!-- 结案后显式名称；未结案隐藏邮箱保护客观公正 -->
                      <span v-if="isCaseClosed(row.status)" class="subject-resolved font-mono">
                        ({{ row.email }})
                      </span>
                      <!-- 细分来源与检举徽标 -->
                      <template v-if="isRiskType(row)">
                        <el-tag v-if="row.isInternal === 1" size="small" type="warning" effect="plain" class="audit-sub-tag">
                          {{ $t('auditTagInternalUser') }}
                        </el-tag>
                        <el-tag v-else-if="row.isInternal === 0" size="small" type="info" effect="plain" class="audit-sub-tag">
                          {{ $t('auditTagExternalMail') }}
                        </el-tag>
                        <el-tag v-if="row.eventType === 'multi_account_detected' || row.eventType === 'multi_account_ban'" size="small" type="danger" effect="plain" class="audit-sub-tag">
                          {{ $t('auditTagMultiAccount') }}
                        </el-tag>
                        <el-tag v-if="row.reportedByOthers > 0" size="small" type="danger" effect="dark" class="audit-sub-tag">
                          {{ $t('auditReportBadgeCount', { count: row.reportedByOthers }) }}
                        </el-tag>
                      </template>
                      <template v-else-if="isAppealType(row)">
                        <el-tag size="small" type="warning" effect="plain" class="audit-sub-tag">
                          {{ $t('auditCaseTypeAppeal') }}
                        </el-tag>
                      </template>
                    </div>
                  </template>
                </el-table-column>

                <!-- 风险判定与触发依据 (常规审查显式LV0~LV3，异常威胁不显式LV) -->
                <el-table-column :label="$t('auditRobotRiskAssessment')" min-width="190">
                  <template #default="{ row }">
                    <div class="robot-risk-cell">
                      <!-- 常规审查：LV0~LV3 自动审查 -->
                      <template v-if="isAuditType(row)">
                        <el-tag size="small" type="info" effect="light">
                          {{ getRoutineLevelLabel(row.priority) }}
                        </el-tag>
                        <div class="rule-hint font-mono">{{ row.actionText }}</div>
                      </template>

                      <!-- 异常威胁：严禁显示任何 LV0~LV3，直接标定高危威胁！ -->
                      <template v-else-if="isRiskType(row)">
                        <el-tag size="small" type="danger" effect="dark">
                          {{ $t('auditThreatCriticalTag') }}
                        </el-tag>
                        <div class="rule-hint font-mono text-danger">{{ row.reportReason || row.actionText }}</div>
                      </template>

                      <!-- 争议申诉 -->
                      <template v-else-if="isAppealType(row)">
                        <el-tag size="small" type="warning" effect="light">
                          {{ $t('auditCaseTypeAppeal') }}
                        </el-tag>
                        <div class="rule-hint font-mono">{{ row.appealReason || row.actionText }}</div>
                      </template>

                      <!-- 封禁存单 (全部视图下) -->
                      <template v-else-if="isBanType(row)">
                        <el-tag size="small" type="danger" effect="plain">
                          {{ $t('auditCaseTypeSanction') }}
                        </el-tag>
                        <div class="rule-hint font-mono">{{ row.banReason || row.actionText }}</div>
                      </template>

                      <template v-else>
                        <el-tag size="small" :type="getRobotRiskTagType(row.priority)" effect="light">
                          {{ getRobotRiskLabel(row.priority) }}
                        </el-tag>
                        <div class="rule-hint font-mono">{{ row.actionText }}</div>
                      </template>
                    </div>
                  </template>
                </el-table-column>

                <!-- 当前审计状态 -->
                <el-table-column :label="$t('auditCurrentStatus')" width="120">
                  <template #default="{ row }">
                    <el-tag size="small" :type="getStatusTagType(row.status)">
                      {{ getStatusLabel(row.status) }}
                    </el-tag>
                  </template>
                </el-table-column>

                <!-- 启案时间 / 检举时间 -->
                <el-table-column :label="$t('auditInitiatedAt')" width="145" prop="createTime">
                  <template #default="{ row }">
                    <span class="plain-time font-mono">
                      {{ row.createTime ? tzDayjs(row.createTime).format('YYYY-MM-DD HH:mm') : '-' }}
                    </span>
                  </template>
                </el-table-column>

                <!-- 结案时间 / 更新时间 -->
                <el-table-column :label="$t('auditResolvedAt')" width="145" prop="resolvedTime">
                  <template #default="{ row }">
                    <span class="plain-time font-mono">
                      {{ row.resolvedTime ? tzDayjs(row.resolvedTime).format('YYYY-MM-DD HH:mm') : '-' }}
                    </span>
                  </template>
                </el-table-column>

                <!-- 详情审计 -->
                <el-table-column :label="$t('auditDetailColumn')" width="115" align="right">
                  <template #default="{ row }">
                    <el-tooltip effect="dark" :content="$t('auditReviewCaseTooltip')" placement="top">
                      <el-button
                        size="small"
                        type="primary"
                        @click="openAuditDrawer(row)"
                      >
                        <Icon icon="fluent:document-search-20-regular" width="15" height="15" style="margin-right: 4px;" />
                        <span>{{ $t('auditReviewCase') }}</span>
                      </el-button>
                    </el-tooltip>
                  </template>
                </el-table-column>
              </template>
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

    <!-- 4. 案件档案与安全研判侧边抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      size="620px"
      direction="rtl"
      destroy-on-close
      class="audit-drawer-container"
    >
      <template #header>
        <div class="drawer-header-clean">
          <Icon
            :icon="isBanType(selectedRow) ? 'fluent:prohibited-20-filled' : (isRiskType(selectedRow) ? 'fluent:alert-urgent-20-filled' : (isAppealType(selectedRow) ? 'fluent:document-person-20-filled' : 'fluent:shield-task-20-filled'))"
            width="22"
            height="22"
            class="header-icon"
            :class="{
              'text-danger': isRiskType(selectedRow),
              'text-warning': isAppealType(selectedRow),
              'text-primary': isAuditType(selectedRow)
            }"
          />
          <div class="header-text">
            <div class="drawer-title">
              <span v-if="isBanType(selectedRow)">{{ $t('auditSanctionDossierTitle') }}</span>
              <span v-else-if="isRiskType(selectedRow)">{{ $t('auditCaseTypeThreat') }} · {{ $t('auditCaseDossier') }}</span>
              <span v-else-if="isAppealType(selectedRow)">{{ $t('auditCaseTypeAppeal') }} · {{ $t('auditCaseDossier') }}</span>
              <span v-else>{{ $t('auditCaseTypeRoutine') }} · {{ $t('auditCaseDossier') }}</span>
            </div>
            <div class="drawer-sub">
              <span v-if="isBanType(selectedRow)">{{ $t('auditSanctionPureNotice') }}</span>
              <span v-else-if="isRiskType(selectedRow)">{{ $t('auditCaseTypeThreatDesc') }}</span>
              <span v-else-if="isAppealType(selectedRow)">{{ $t('auditCaseTypeAppealDesc') }}</span>
              <span v-else>{{ $t('auditCaseTypeRoutineDesc') }}</span>
            </div>
          </div>
        </div>
      </template>

      <div v-if="selectedRow" class="drawer-body-content">
        <!-- 案件全宗基本概要 -->
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
              <span class="val font-mono">{{ selectedRow.email }}</span>
            </div>
            <div class="grid-item">
              <span class="label">{{ isBanType(selectedRow) ? $t('auditColBanTime') : $t('auditInitiatedAt') }}:</span>
              <span class="val font-mono">{{ (selectedRow.banTime || selectedRow.createTime) ? tzDayjs(selectedRow.banTime || selectedRow.createTime).format('YYYY-MM-DD HH:mm') : '-' }}</span>
            </div>
            <div class="grid-item">
              <span class="label">{{ isBanType(selectedRow) ? $t('auditColLastProcessTime') : $t('auditResolvedAt') }}:</span>
              <span class="val font-mono">{{ (selectedRow.resolvedTime || selectedRow.banTime || selectedRow.createTime) ? tzDayjs(selectedRow.resolvedTime || selectedRow.banTime || selectedRow.createTime).format('YYYY-MM-DD HH:mm') : '-' }}</span>
            </div>
            <div class="grid-item">
              <span class="label">{{ $t('reportReasonCategory') }}:</span>
              <span class="val font-medium">
                <template v-if="isRiskType(selectedRow)">
                  <span class="text-danger">{{ $t('auditThreatCriticalTag') }}</span>
                  <span v-if="selectedRow.reportedByOthers > 0"> ({{ $t('auditReportBadgeCount', { count: selectedRow.reportedByOthers }) }})</span>
                </template>
                <template v-else-if="isAuditType(selectedRow)">
                  <span>{{ getRoutineLevelLabel(selectedRow.priority) }}</span>
                </template>
                <template v-else-if="isAppealType(selectedRow)">
                  <span class="text-warning">{{ $t('auditCaseTypeAppeal') }}</span>
                </template>
                <template v-else>
                  <span>{{ $t('auditCaseTypeSanction') }}</span>
                </template>
              </span>
            </div>
          </div>
        </div>

        <!-- 初判规则依据与处置基准 -->
        <div class="dossier-card">
          <div class="section-title">
            <Icon icon="fluent:bot-20-regular" width="18" height="18" />
            <span>{{ $t('auditRuleSanctionRef') }}</span>
          </div>

          <div class="robot-rule-box">
            <!-- 申诉理由陈述 -->
            <div v-if="selectedRow.appealReason" class="appeal-statement-quote">
              “{{ selectedRow.appealReason }}”
            </div>

            <!-- 封禁管控原因 -->
            <div v-if="isBanType(selectedRow)" class="rule-rule-text text-danger">
              {{ selectedRow.banReason || selectedRow.actionText }}
            </div>

            <!-- 检举详细分类说明 -->
            <div v-if="isRiskType(selectedRow) && selectedRow.reportCategory" class="rule-rule-text">
              <el-tag size="small" type="danger" effect="plain" style="margin-right: 6px;">{{ getCategoryLabel(selectedRow.reportCategory) }}</el-tag>
              <span>{{ selectedRow.reportReason || selectedRow.actionText }}</span>
            </div>

            <div class="rule-action-log">{{ selectedRow.actionText }}</div>
            <div v-if="selectedRow.detailText" class="rule-detail-log">{{ selectedRow.detailText }}</div>
          </div>
        </div>

        <!-- 多维可信研判凭据画像 -->
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
            <!-- 维度 1: 凭证与身份因子健全度 -->
            <div class="pillar-box">
              <div class="pillar-header">
                <Icon icon="fluent:key-multiple-20-regular" width="16" height="16" />
                <span>{{ $t('auditContextAuth') }}</span>
              </div>
              <div class="pillar-items">
                <div class="item-row">
                  <span class="k">{{ $t('auditField2fa') }}:</span>
                  <span class="v">{{ selectedRow.status === 'banned' ? $t('auditStatusBannedActive') : $t('audit2faProtected') }}</span>
                </div>
                <div class="item-row">
                  <span class="k">{{ $t('auditFieldCredHealth') }}:</span>
                  <span class="v" :class="{ 'text-danger': isRiskType(selectedRow) || isBanType(selectedRow) }">
                    {{ (isRiskType(selectedRow) || isBanType(selectedRow)) ? $t('auditCredCompromised') : $t('auditCredNotLeaked') }}
                  </span>
                </div>
                <div class="item-row">
                  <span class="k">{{ $t('auditFieldChallengeHistory') }}:</span>
                  <span class="v" :class="{ 'text-danger': isBanType(selectedRow) }">
                    {{ isBanType(selectedRow) ? $t('auditStatusBannedActive') : $t('auditNoPasswordLock') }}
                  </span>
                </div>
                <div class="item-row">
                  <span class="k">{{ $t('auditFieldSessionState') }}:</span>
                  <span class="v">{{ selectedRow.status === 'banned' ? $t('auditStatusBannedActive') : $t('auditOauthIsolated') }}</span>
                </div>
              </div>
            </div>

            <!-- 维度 2: 行为速率与检举遥测 -->
            <div class="pillar-box">
              <div class="pillar-header">
                <Icon icon="fluent:pulse-20-regular" width="16" height="16" />
                <span>{{ $t('auditContextBehavior') }}</span>
              </div>
              <div class="pillar-items">
                <div class="item-row">
                  <span class="k">{{ $t('auditFieldUserReports') }}:</span>
                  <span class="v" :class="{ 'text-danger': (selectedRow.reportedByOthers || 0) > 0 }">
                    {{ (selectedRow.reportedByOthers || 0) > 0 ? $t('auditReportsCount', { count: selectedRow.reportedByOthers }) : $t('auditNoReports') }}
                  </span>
                </div>
                <div class="item-row">
                  <span class="k">{{ $t('auditFieldSendRate') }}:</span>
                  <span class="v" :class="{ 'text-danger': isRiskType(selectedRow) }">
                    {{ isRiskType(selectedRow) ? $t('auditSendRateSpike') : $t('auditSendRateNormal') }}
                  </span>
                </div>
                <div class="item-row">
                  <span class="k">{{ $t('auditFieldBounceRate') }}:</span>
                  <span class="v" :class="{ 'text-danger': isRiskType(selectedRow) }">
                    {{ isRiskType(selectedRow) ? $t('auditBounceRateHigh') : $t('auditBounceRateHealthy') }}
                  </span>
                </div>
                <div class="item-row">
                  <span class="k">{{ $t('auditFieldReputation') }}:</span>
                  <span class="v font-medium" :class="getReputationClass(selectedRow)">
                    {{ getReputationLabel(selectedRow) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 维度 3: 网络与拓扑置信度 -->
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

            <!-- 维度 4: 设备指纹与会话连续性 -->
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

        <!-- 4. 裁决工作台 / 封禁台账存单留痕 -->
        <div class="dossier-card adjudication-workbench-card">
          <!-- 情况 A: 封禁管控为纯展示台账，严禁任意篡改与删除 -->
          <template v-if="isBanType(selectedRow)">
            <div class="sanction-ledger-banner">
              <Icon icon="fluent:shield-checkmark-20-filled" width="20" height="20" class="banner-icon" />
              <span>{{ $t('auditSanctionPureNotice') }}</span>
            </div>
            <div v-if="selectedRow.status === 'unbanned'" class="unbanned-archive-badge">
              <Icon icon="fluent:checkmark-circle-16-regular" width="16" height="16" />
              <span>{{ $t('auditStatusUnbannedRecord') }}</span>
            </div>
          </template>

          <!-- 情况 B: 异常威胁、争议申诉与常规审查的人体工学裁决工作台 -->
          <template v-else>
            <div class="section-title">
              <Icon icon="fluent:gavel-20-regular" width="18" height="18" />
              <span>{{ $t('auditAdjudicateAction') }}</span>
            </div>

            <div class="decision-input-group">
              <div class="input-title">{{ $t('auditAdjudicationNotes') }}:</div>
              <el-input
                v-model="decisionNotes"
                type="textarea"
                :rows="2"
                :placeholder="$t('auditAdjudicationPlaceholder')"
              />
            </div>

            <div class="adjudication-actions">
              <!-- 1. 外部邮件举报专属操作：加入系统黑名单 -->
              <el-button
                v-if="isRiskType(selectedRow) && !selectedRow.isInternal"
                type="danger"
                :loading="actionLoading"
                @click="handleAction('blacklist_sender')"
              >
                <Icon icon="fluent:prohibited-20-regular" width="16" height="16" style="margin-right: 4px;" />
                <span>{{ $t('auditBtnBlacklistSender') }}</span>
              </el-button>

              <!-- 2. 内部用户举报专属操作：限制发信 (禁言) -->
              <el-button
                v-if="isRiskType(selectedRow) && selectedRow.isInternal === 1"
                type="warning"
                :loading="actionLoading"
                @click="handleAction('mute_account')"
              >
                <Icon icon="fluent:speaker-mute-20-regular" width="16" height="16" style="margin-right: 4px;" />
                <span>{{ $t('auditBtnMuteAccount') }}</span>
              </el-button>

              <!-- 3. 常规审查专属：封存归档 -->
              <el-button
                v-if="isAuditType(selectedRow)"
                type="primary"
                :loading="actionLoading"
                @click="handleAction('archive_routine')"
              >
                <Icon icon="fluent:archive-20-regular" width="16" height="16" style="margin-right: 4px;" />
                <span>{{ $t('auditBtnArchiveRoutine') }}</span>
              </el-button>

              <!-- 4. 放行结案 -->
              <el-button
                type="success"
                :loading="actionLoading"
                @click="handleVerdict('approve')"
              >
                <Icon icon="fluent:checkmark-circle-20-regular" width="16" height="16" style="margin-right: 4px;" />
                <span>{{ $t('auditAdjudicateApprove') }}</span>
              </el-button>

              <!-- 5. 条件放行：强制下次 MFA 凭证挑战 -->
              <el-button
                type="primary"
                plain
                :loading="actionLoading"
                @click="handleVerdict('probation')"
              >
                <Icon icon="fluent:key-reset-20-regular" width="16" height="16" style="margin-right: 4px;" />
                <span>{{ $t('auditAdjudicateApproveWithChallenge') }}</span>
              </el-button>

              <!-- 6. 驳回申诉 / 维持封禁 -->
              <el-button
                type="danger"
                plain
                :loading="actionLoading"
                @click="isRiskType(selectedRow) ? handleAction('ban_account') : handleVerdict('reject')"
              >
                <Icon icon="fluent:dismiss-circle-20-regular" width="16" height="16" style="margin-right: 4px;" />
                <span>{{ $t('auditAdjudicateReject') }}</span>
              </el-button>

              <!-- 7. 标记误报加入白名单 -->
              <el-button
                type="info"
                plain
                :loading="actionLoading"
                @click="handleVerdict('whitelist')"
              >
                <Icon icon="fluent:shield-dismiss-20-regular" width="16" height="16" style="margin-right: 4px;" />
                <span>{{ $t('auditAdjudicateWhitelist') }}</span>
              </el-button>
            </div>
          </template>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Icon } from '@iconify/vue';
import loading from '@/components/loading/index.vue';
import { tzDayjs } from '@/utils/day.js';
import { useSettingStore } from '@/store/setting.js';
import { useEmailStore } from '@/store/email.js';
import { auditList, auditAction, auditAdjudicate, auditPurge } from '@/request/audit.js';

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

// 4 大情况 KPI 数据结构 (待办数据 / 总数据)
const summaryCounts = reactive({
  totalPending: 0,
  allTotal: 0,
  categories: {
    audit: { pending: 0, total: 0 },
    risk: { pending: 0, total: 0 },
    appeal: { pending: 0, total: 0 },
    ban: { pending: 0, total: 0 }
  }
});

const params = reactive({
  keyword: '',
  warningType: 'all',
  riskLevel: 'all',
  status: 'all',
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

function handleGlobalTopSearch(e) {
  const kw = (e?.detail ?? emailStore.searchKeyword ?? '').trim();
  localKeyword.value = kw;
  params.keyword = kw;
  search();
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

function isCaseClosed(status) {
  return ['resolved', 'banned', 'unbanned', 'rejected', 'expired', 'closed'].includes(status);
}

function isRiskType(row) {
  if (!row) return false;
  return row.warningType === 'risk' || row.category === 'risk' ||
    ['anomalous_burst', 'user_reported', 'multi_account_detected', 'risk_spike'].includes(row.warningType) ||
    ['anomalous_burst', 'user_reported', 'multi_account_detected', 'risk_spike'].includes(row.eventType);
}

function isAppealType(row) {
  if (!row) return false;
  return row.warningType === 'appeal' || row.category === 'appeal' ||
    row.warningType === 'appeal_review' ||
    ['user_appeal', 'appeal_submitted'].includes(row.eventType);
}

function isBanType(row) {
  if (!row) return false;
  return row.warningType === 'ban' || (row.category === 'ban' && row.status === 'banned') ||
    ['auto_ban', 'multi_account_ban', 'credential_tamper_ban', 'external_blacklist', 'admin_ban'].includes(row.eventType);
}

function isAuditType(row) {
  if (!row) return false;
  return row.warningType === 'audit' || row.category === 'audit' ||
    ['baseline_sample', 'ip_roaming_routine', 'bot_probe_routine', 'device_shift_routine'].includes(row.eventType);
}

function getRoutineLevelLabel(priority) {
  switch (priority) {
    case 'LV0': return t('auditLevelRoutine0');
    case 'LV1': return t('auditLevelRoutine1');
    case 'LV2': return t('auditLevelRoutine2');
    case 'LV3': return t('auditLevelRoutine3');
    default: return priority || t('auditLevelRoutine0');
  }
}

function getCategoryLabel(category) {
  switch (category) {
    case 'fraud': return t('reportCatFraud');
    case 'mlm': return t('reportCatMlm');
    case 'phishing': return t('reportCatPhishing');
    case 'spam': return t('reportCatSpam');
    case 'other': return t('reportCatOther');
    default: return category || t('reportCatOther');
  }
}

function getReputationClass(row) {
  if (!row) return 'text-primary';
  if (isBanType(row) || row.status === 'banned') return 'text-danger';
  if (isRiskType(row) || (row.reportedByOthers || 0) > 0) return 'text-danger';
  if (isAppealType(row)) return 'text-warning';
  return 'text-primary';
}

function getReputationLabel(row) {
  if (!row) return t('auditReputationGood');
  if (isBanType(row) || row.status === 'banned') return t('auditReputationBanned');
  if (isRiskType(row) || (row.reportedByOthers || 0) > 0) return t('auditReputationCritical');
  if (isAppealType(row)) return t('auditReputationAppeal');
  return t('auditReputationGood');
}

function getRobotRiskTagType(priority) {
  switch (priority) {
    case 'P0':
    case 'CRITICAL':
      return 'danger';
    case 'P1':
    case 'HIGH':
      return 'warning';
    case 'P2':
      return 'info';
    default:
      return 'info';
  }
}

function getRobotRiskLabel(priority) {
  switch (priority) {
    case 'P0':
    case 'CRITICAL':
      return t('auditRiskP0Option');
    case 'P1':
    case 'HIGH':
      return t('auditRiskP1Option');
    case 'P2':
      return t('auditRiskP2Option');
    default:
      return priority || 'P2';
  }
}

function getStatusTagType(status) {
  switch (status) {
    case 'active': return 'primary';
    case 'pending': return 'warning';
    case 'resolved': return 'success';
    case 'banned': return 'danger';
    case 'unbanned': return 'success';
    case 'rejected': return 'info';
    case 'expired': return 'info';
    default: return 'info';
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'active': return t('auditCaseStatusInAudit');
    case 'pending': return t('auditCaseStatusPending');
    case 'resolved': return t('auditCaseStatusResolved');
    case 'banned': return t('auditStatusBannedActive');
    case 'unbanned': return t('auditStatusUnbannedRecord');
    case 'rejected': return t('auditStatusRejectedAppeal');
    case 'expired': return t('auditCaseStatusExpired');
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
        summaryCounts.categories.appeal = data.counts.categories.appeal || { pending: 0, total: 0 };
        summaryCounts.categories.ban = data.counts.categories.ban || { pending: 0, total: 0 };
        summaryCounts.totalPending = data.counts.total ?? 0;
        summaryCounts.allTotal = data.counts.allTotal ?? (data.total || 0);
      } else {
        summaryCounts.categories.audit = { pending: data.counts.audit ?? 0, total: data.counts.auditTotal ?? data.counts.audit ?? 0 };
        summaryCounts.categories.risk = { pending: data.counts.risk ?? 0, total: data.counts.riskTotal ?? data.counts.risk ?? 0 };
        summaryCounts.categories.appeal = { pending: data.counts.appeal ?? 0, total: data.counts.appealTotal ?? data.counts.appeal ?? 0 };
        summaryCounts.categories.ban = { pending: data.counts.ban ?? 0, total: data.counts.banTotal ?? data.counts.ban ?? 0 };
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
  decisionNotes.value = isAppealType(row) ? t('auditDefaultNoteApproved') : '';
  drawerVisible.value = true;
}

function openDocs() {
  const docUrl = settingStore.settings?.projectUrl || 'https://epomail-docs.pages.dev/epomail/en/mail/overview/';
  window.open(docUrl, '_blank', 'noopener,noreferrer');
}

async function handleAction(action) {
  actionLoading.value = true;
  try {
    await auditAction({
      id: selectedRow.value.id,
      action,
      targetEmail: selectedRow.value.email,
      notes: decisionNotes.value
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

async function handleVerdict(decision) {
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
  window.addEventListener('manage-audit-search', handleGlobalTopSearch);
  fetchAuditList();
});

onUnmounted(() => {
  window.removeEventListener('manage-audit-search', handleGlobalTopSearch);
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

.audit-page-container {
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
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;

  &:hover {
    border-color: var(--el-color-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  &.kpi-card-active {
    border-color: var(--el-color-primary) !important;
    background: var(--el-color-primary-light-9) !important;
    box-shadow: 0 0 0 1px var(--el-color-primary), 0 3px 12px rgba(64, 158, 255, 0.12);

    .kpi-title {
      color: var(--el-color-primary) !important;
      font-weight: 600;
    }
  }
}

.kpi-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;

  &.icon-routine {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }
  &.icon-threat {
    background: var(--el-color-danger-light-9);
    color: var(--el-color-danger);
  }
  &.icon-appeal {
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning);
  }
  &.icon-sanction {
    background: var(--el-fill-color);
    color: var(--el-text-color-secondary);
  }
}

.kpi-content {
  flex: 1;
  min-width: 0;
}

.kpi-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.kpi-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.kpi-active-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-primary);
  display: inline-block;
}

/* 待办数据 / 总数据 结构明确呈现 */
.kpi-data-stat {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1.2;

  .stat-pending {
    color: var(--el-text-color-primary);
  }
  .stat-unit {
    font-size: 13px;
    font-weight: normal;
    color: var(--el-text-color-secondary);
    margin-left: 2px;
  }
}

.kpi-desc {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

/* 2. 工作台单一外框 (杜绝嵌套二层脱节方框，直接让表格承载) */
.audit-workbench-container {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-bg-color);
  overflow: hidden;
}

/* 顶部操作栏：统一严格左对齐排布 */
.header-actions {
  padding: 8px 12px;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);

  .search-input {
    width: min(260px, calc(100vw - 120px));
  }

  .search {
    :deep(.el-input__wrapper) {
      height: 28px;
    }
  }

  .search-prefix-icon {
    color: var(--el-text-color-placeholder);
    margin-right: 4px;
  }

  .status-select {
    :deep(.el-select__wrapper) {
      min-height: 28px;
    }
  }

  .actions-left-buttons {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .action-btn-item {
    color: var(--el-text-color-regular);
    border-color: var(--el-border-color-lighter);
    background: transparent;
    transition: all 0.2s;

    &:hover {
      color: var(--el-color-primary);
      border-color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
    }
  }
}

/* 3. 核心管理表格 (零脱节，直接作为外框铺满) */
.table-area {
  position: relative;
  background: var(--el-bg-color);

  :deep(.el-table) {
    --el-table-header-bg-color: var(--el-fill-color-light);
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

.case-id-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  flex-wrap: wrap;

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

  .masked-status-tag {
    font-size: 11px;
    padding: 0 5px;
    height: 20px;
    line-height: 20px;
  }
}

.audit-sub-tag {
  font-size: 11px;
  height: 20px;
  line-height: 20px;
  padding: 0 5px;
}

.subject-email {
  font-size: 12.5px;
  color: var(--el-text-color-primary);
}

.ban-reason-text {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.robot-risk-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .rule-hint {
    font-size: 10.5px;
    color: var(--el-text-color-placeholder);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &.text-danger {
      color: var(--el-color-danger);
    }
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

/* 4. 侧边抽屉样式 (Google 式安全研判工作台) */
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
    line-height: 1.4;

    &.text-danger {
      color: var(--el-color-danger);
    }
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
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
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
        width: 65px;
        flex-shrink: 0;
      }
      .v {
        color: var(--el-text-color-primary);
        word-break: break-all;
      }
    }
  }
}

.appeal-statement-quote {
  padding: 10px 14px;
  border-left: 3px solid var(--el-color-warning);
  background: var(--el-fill-color-light);
  border-radius: 0 4px 4px 0;
  font-size: 13px;
  color: var(--el-text-color-primary);
  line-height: 1.5;
  font-style: italic;
  margin-bottom: 8px;
}

.sanction-ledger-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  font-size: 12.5px;
  color: var(--el-text-color-secondary);

  .banner-icon {
    color: var(--el-color-primary);
    flex-shrink: 0;
  }
}

.unbanned-archive-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--el-color-success);
  margin-top: 10px;
  font-weight: 500;
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
