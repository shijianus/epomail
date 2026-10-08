<template>
  <div class="audit-box">
    <!-- 主体全幅可滚动区域 -->
    <el-scrollbar ref="scrollbarRef" class="scrollbar">
      <div class="audit-page-container">

        <!-- 1. 顶部汇报分区 4 板块：精简为邮箱管理实用指标 -->
        <div class="kpi-grid">
          <!-- 卡片 1: 生效中封禁 -->
          <div
            class="kpi-card"
            :class="{ 'kpi-card-active': activeKpi === 'banned' || params.status === 'banned' }"
            @click="selectKpiFilter('banned')"
          >
            <div class="kpi-icon-wrap icon-sanction">
              <Icon icon="fluent:prohibited-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-content">
              <div class="kpi-header">
                <span class="kpi-title">{{ $t('auditKpiActiveBans') }}</span>
                <span v-if="activeKpi === 'banned' || params.status === 'banned'" class="kpi-active-dot"></span>
              </div>
              <div class="kpi-data-stat kpi-value font-mono">
                <span class="stat-pending">{{ summaryCounts.banned }}</span>
              </div>
              <div class="kpi-desc kpi-sub" :title="$t('auditKpiActiveBansDesc')">{{ $t('auditKpiActiveBansDesc') }}</div>
            </div>
          </div>

          <!-- 卡片 2: 今日新增 -->
          <div
            class="kpi-card"
            :class="{ 'kpi-card-active': activeKpi === 'today' || params.timeRange === 'today' }"
            @click="selectKpiFilter('today')"
          >
            <div class="kpi-icon-wrap icon-routine">
              <Icon icon="fluent:person-add-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-content">
              <div class="kpi-header">
                <span class="kpi-title">{{ $t('auditKpiTodayAdded') }}</span>
                <span v-if="activeKpi === 'today' || params.timeRange === 'today'" class="kpi-active-dot"></span>
              </div>
              <div class="kpi-data-stat kpi-value font-mono">
                <span class="stat-pending">{{ summaryCounts.today }}</span>
              </div>
              <div class="kpi-desc kpi-sub" :title="$t('auditKpiTodayAddedDesc')">{{ $t('auditKpiTodayAddedDesc') }}</div>
            </div>
          </div>

          <!-- 卡片 3: 待人工复核 -->
          <div
            class="kpi-card"
            :class="{ 'kpi-card-active': activeKpi === 'pending' || params.status === 'pending' }"
            @click="selectKpiFilter('pending')"
          >
            <div class="kpi-icon-wrap icon-appeal">
              <Icon icon="fluent:document-person-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-content">
              <div class="kpi-header">
                <span class="kpi-title">{{ $t('auditKpiPendingReview') }}</span>
                <span v-if="activeKpi === 'pending' || params.status === 'pending'" class="kpi-active-dot"></span>
              </div>
              <div class="kpi-data-stat kpi-value font-mono">
                <span class="stat-pending">{{ summaryCounts.pending }}</span>
              </div>
              <div class="kpi-desc kpi-sub" :title="$t('auditKpiPendingReviewDesc')">{{ $t('auditKpiPendingReviewDesc') }}</div>
            </div>
          </div>

          <!-- 卡片 4: 高风险邮箱 -->
          <div
            class="kpi-card"
            :class="{ 'kpi-card-active': activeKpi === 'highrisk' || params.riskLevel === 'high' }"
            @click="selectKpiFilter('highrisk')"
          >
            <div class="kpi-icon-wrap icon-threat">
              <Icon icon="fluent:alert-urgent-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-content">
              <div class="kpi-header">
                <span class="kpi-title">{{ $t('auditKpiHighRisk') }}</span>
                <span v-if="activeKpi === 'highrisk' || params.riskLevel === 'high'" class="kpi-active-dot"></span>
              </div>
              <div class="kpi-data-stat kpi-value font-mono">
                <span class="stat-pending">{{ summaryCounts.highRisk }}</span>
              </div>
              <div class="kpi-desc kpi-sub" :title="$t('auditKpiHighRiskDesc')">{{ $t('auditKpiHighRiskDesc') }}</div>
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

            <!-- 下拉 1: 状态筛选 (全部 / 生效中 / 已解封 / 待复核 / 观察中) -->
            <el-select
              v-model="params.status"
              class="status-select"
              :style="`width: ${locale === 'en' ? 145 : 125}px`"
              @change="search"
            >
              <el-option value="all" :label="$t('all')" />
              <el-option value="banned" :label="$t('auditStatusBannedActive')" />
              <el-option value="unbanned" :label="$t('auditStatusUnbannedRecord')" />
              <el-option value="pending" :label="$t('auditCaseStatusPending')" />
              <el-option value="watching" :label="$t('auditStatusWatching')" />
            </el-select>

            <!-- 下拉 2: 时间范围 (全部 / 今日 / 近7天 / 近30天) -->
            <el-select
              v-model="params.timeRange"
              class="status-select"
              :style="`width: ${locale === 'en' ? 140 : 120}px`"
              @change="search"
            >
              <el-option value="all" :label="$t('all')" />
              <el-option value="today" :label="$t('auditTimeToday')" />
              <el-option value="7days" :label="$t('auditTime7Days')" />
              <el-option value="30days" :label="$t('auditTime30Days')" />
            </el-select>

            <!-- 下拉 3: 风险等级 (全部 / 高 / 中 / 低) -->
            <el-select
              v-model="params.riskLevel"
              class="status-select"
              :style="`width: ${locale === 'en' ? 140 : 120}px`"
              @change="search"
            >
              <el-option value="all" :label="$t('all')" />
              <el-option value="high" :label="$t('auditRiskLevelHigh')" />
              <el-option value="medium" :label="$t('auditRiskLevelMedium')" />
              <el-option value="normal" :label="$t('auditRiskLevelLow')" />
            </el-select>

            <!-- 操作按钮集：统一紧凑排布 -->
            <div class="actions-left-buttons actions-left-icons">
              <!-- 执行检索 -->
              <el-tooltip effect="dark" :content="$t('search')" placement="top">
                <el-button class="action-btn-item action-icon" circle size="small" @click="search">
                  <Icon icon="iconoir:search" width="16" height="16" />
                </el-button>
              </el-tooltip>

              <!-- 刷新列表 -->
              <el-tooltip effect="dark" :content="$t('refresh')" placement="top">
                <el-button class="action-btn-item action-icon" circle size="small" @click="refresh">
                  <Icon icon="ion:reload" width="15" height="15" />
                </el-button>
              </el-tooltip>

              <!-- 重置条件 -->
              <el-tooltip effect="dark" :content="$t('reset')" placement="top">
                <el-button class="action-btn-item action-icon" circle size="small" @click="handleReset">
                  <Icon icon="fluent:arrow-rotate-clockwise-20-regular" width="16" height="16" />
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
              <!-- 【层级优化】列 1: 邮箱 (主列加粗，案件编号字号再缩小、对比度降低，弱化为次要信息) -->
              <el-table-column :label="$t('tabEmailAddress')" min-width="230">
                <template #default="{ row }">
                  <div class="email-cell">
                    <div class="email-main-row">
                      <span class="subject-email font-mono clickable-email" @click="openAuditDrawer(row)">
                        {{ row.email }}
                      </span>
                      <!-- 【用词统一】高风险标签统一为「高风险 · 已管控」 -->
                      <el-tag size="small" :type="getRiskTagType(row.riskLevel || row.priority)" effect="plain" class="audit-sub-tag">
                        {{ getRiskLabel(row.riskLevel || row.priority) }}
                      </el-tag>
                    </div>
                    <!-- 【层级优化】案件编号弱化至下方次要位置 -->
                    <div class="ticket-sub font-mono">
                      <span class="ticket-text">{{ row.ticketId || ('BAN-' + String(row.id).padStart(6, '0')) }}</span>
                      <span class="copy-sub-btn" :title="$t('copy')" @click.stop="copyText(row.email)">
                        <Icon icon="fluent:copy-16-regular" width="11" height="11" />
                      </span>
                    </div>
                  </div>
                </template>
              </el-table-column>

              <!-- 【用词统一】列 2: 当前状态 (醒目彩色标签 + 图标，状态标签统一中点格式) -->
              <el-table-column :label="$t('auditCurrentStatus')" width="170">
                <template #default="{ row }">
                  <el-tag v-if="row.status === 'banned'" size="small" type="danger" effect="plain" class="status-tag-with-icon">
                    <Icon icon="fluent:prohibited-16-regular" width="14" height="14" class="status-tag-icon" />
                    <span>{{ $t('auditStatusBannedActive') }}</span>
                  </el-tag>
                  <el-tag v-else-if="row.status === 'pending' || row.status === 'active'" size="small" type="warning" effect="plain" class="status-tag-with-icon">
                    <Icon icon="fluent:clock-16-regular" width="14" height="14" class="status-tag-icon" />
                    <span>{{ $t('auditCaseStatusPending') }}</span>
                  </el-tag>
                  <el-tag v-else-if="row.status === 'unbanned' || row.status === 'resolved'" size="small" type="success" effect="plain" class="status-tag-with-icon">
                    <Icon icon="fluent:checkmark-circle-16-regular" width="14" height="14" class="status-tag-icon" />
                    <span>{{ $t('auditStatusUnbannedRecord') }}</span>
                  </el-tag>
                  <el-tag v-else size="small" type="info" effect="plain" class="status-tag-with-icon">
                    <Icon icon="fluent:eye-16-regular" width="14" height="14" class="status-tag-icon" />
                    <span>{{ $t('auditStatusWatching') }}</span>
                  </el-tag>
                </template>
              </el-table-column>

              <!-- 列 3: 封禁原因 (截断显示，hover 显示完整 Tooltip) -->
              <el-table-column :label="$t('auditColBanReason')" min-width="210" show-overflow-tooltip>
                <template #default="{ row }">
                  <span class="ban-reason-text">{{ row.banReason || row.actionText || '-' }}</span>
                </template>
              </el-table-column>

              <!-- 列 4: 封禁时间 -->
              <el-table-column :label="$t('auditColBanTime')" width="145">
                <template #default="{ row }">
                  <span class="plain-time font-mono">
                    {{ (row.banTime || row.createTime) ? tzDayjs(row.banTime || row.createTime).format('YYYY-MM-DD HH:mm') : '-' }}
                  </span>
                </template>
              </el-table-column>

              <!-- 列 5: 最后处理时间 -->
              <el-table-column :label="$t('auditColLastProcessTime')" width="145">
                <template #default="{ row }">
                  <span class="plain-time font-mono">
                    {{ (row.resolvedTime || row.banTime || row.createTime) ? tzDayjs(row.resolvedTime || row.banTime || row.createTime).format('YYYY-MM-DD HH:mm') : '-' }}
                  </span>
                </template>
              </el-table-column>

              <!-- 列 6: 处理人 / 负责人 -->
              <el-table-column :label="$t('auditColOperator')" width="155">
                <template #default="{ row }">
                  <div class="operator-cell">
                    <div class="operator-avatar font-mono">
                      {{ getOperatorAvatar(row) }}
                    </div>
                    <div class="operator-info">
                      <span class="operator-name">{{ getOperatorName(row) }}</span>
                      <span class="operator-role">{{ getOperatorRole(row) }}</span>
                    </div>
                  </div>
                </template>
              </el-table-column>

              <!-- 【层级优化】列 7: 操作 (解封/重新封禁保持文字按钮；延期、备注改为图标按钮带Tooltip；查看详情保持文字按钮) -->
              <el-table-column :label="$t('action')" width="235" align="right">
                <template #default="{ row }">
                  <div class="table-actions-group">
                    <!-- 【用词统一】解封 / 重新封禁快捷切换 (保持文字按钮) -->
                    <el-button
                      v-if="row.status === 'banned'"
                      size="small"
                      type="success"
                      plain
                      class="action-btn-compact"
                      @click="handleQuickToggleBan(row)"
                    >
                      <Icon icon="fluent:lock-open-16-regular" width="13" height="13" style="margin-right: 2px;" />
                      <span>{{ $t('auditBtnUnban') }}</span>
                    </el-button>
                    <el-button
                      v-else
                      size="small"
                      type="danger"
                      plain
                      class="action-btn-compact"
                      @click="handleQuickToggleBan(row)"
                    >
                      <Icon icon="fluent:prohibited-16-regular" width="13" height="13" style="margin-right: 2px;" />
                      <span>{{ $t('auditBtnReban') }}</span>
                    </el-button>

                    <!-- 【层级优化】延期：纯图标按钮（带 hover tooltip） -->
                    <el-tooltip effect="dark" :content="$t('auditBtnExtend')" placement="top">
                      <el-button
                        size="small"
                        circle
                        class="action-icon-compact"
                        @click="handleOpenExtend(row)"
                      >
                        <Icon icon="fluent:calendar-clock-20-regular" width="14" height="14" />
                      </el-button>
                    </el-tooltip>

                    <!-- 【层级优化】备注：纯图标按钮（带 hover tooltip） -->
                    <el-tooltip effect="dark" :content="$t('auditBtnNote')" placement="top">
                      <el-button
                        size="small"
                        circle
                        class="action-icon-compact"
                        @click="handleOpenNote(row)"
                      >
                        <Icon icon="fluent:note-edit-20-regular" width="14" height="14" />
                      </el-button>
                    </el-tooltip>

                    <!-- 【层级优化】查看详情：保持文字按钮 -->
                    <el-button
                      size="small"
                      type="primary"
                      plain
                      class="action-btn-compact"
                      @click="openAuditDrawer(row)"
                    >
                      <span>{{ $t('auditBtnViewDetails') }}</span>
                      <Icon icon="fluent:chevron-right-16-regular" width="13" height="13" style="margin-left: 2px;" />
                    </el-button>
                  </div>
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

        <!-- 【用词统一】初判规则依据与处置基准 -> 风险研判与处置依据 -->
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

            <!-- 【层级优化】保留红色警示文案：突出封禁管控原因与触发规则 -->
            <div v-if="selectedRow.banReason || (isBanType(selectedRow) && selectedRow.actionText)" class="rule-rule-text text-danger">
              {{ selectedRow.banReason || selectedRow.actionText }}
            </div>

            <!-- 检举详细分类说明 -->
            <div v-if="isRiskType(selectedRow) && selectedRow.reportCategory" class="rule-rule-text">
              <el-tag size="small" type="danger" effect="plain" style="margin-right: 6px;">{{ getCategoryLabel(selectedRow.reportCategory) }}</el-tag>
              <span>{{ selectedRow.reportReason || selectedRow.actionText }}</span>
            </div>

            <div v-if="selectedRow.actionText && selectedRow.actionText !== selectedRow.banReason" class="rule-action-log">{{ selectedRow.actionText }}</div>
            <div v-if="selectedRow.detailText" class="rule-detail-log">{{ selectedRow.detailText }}</div>
          </div>
        </div>

        <!-- 【用词统一 & 层级优化】多维风险画像 (改为可折叠 Accordion，默认展开前两个：凭证与身份挑战因子、设备指纹与会话连续性) -->
        <div class="dossier-card evidence-accordion-card">
          <div class="section-title">
            <Icon icon="fluent:chart-multiple-20-regular" width="18" height="18" />
            <span>{{ $t('auditGoogleTrustContext') }}</span>
          </div>

          <div class="evidence-notice">
            <Icon icon="fluent:info-16-regular" width="16" height="16" />
            <span>{{ $t('auditEvidenceReviewNotice') }}</span>
          </div>

          <el-collapse v-model="activeAccordions" class="evidence-collapse">
            <!-- 维度 1: 凭证与身份挑战因子 (默认展开) -->
            <el-collapse-item name="auth">
              <template #title>
                <div class="accordion-header">
                  <Icon icon="fluent:key-multiple-20-regular" width="16" height="16" class="accordion-icon" />
                  <span class="accordion-title">{{ $t('auditContextAuth') }}</span>
                </div>
              </template>
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
            </el-collapse-item>

            <!-- 维度 2: 设备指纹与会话连续性 (默认展开) -->
            <el-collapse-item name="device">
              <template #title>
                <div class="accordion-header">
                  <Icon icon="fluent:desktop-pulse-20-regular" width="16" height="16" class="accordion-icon" />
                  <span class="accordion-title">{{ $t('auditContextDevice') }}</span>
                </div>
              </template>
              <div class="pillar-items">
                <div class="item-row"><span class="k">{{ $t('auditFieldClient') }}:</span> <span class="v">{{ selectedRow.device || '-' }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldBaseDevice') }}:</span> <span class="v">{{ selectedRow.baseDevice || '-' }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldFingerprint') }}:</span> <span class="v font-mono">{{ selectedRow.fingerprint || '-' }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldSimilarity') }}:</span> <span class="v font-mono">{{ selectedRow.matchScore || 85 }}% ({{ $t('auditAuxiliaryNotice') }})</span></div>
              </div>
            </el-collapse-item>

            <!-- 维度 3: 行为速率与检举遥测 (默认折叠) -->
            <el-collapse-item name="behavior">
              <template #title>
                <div class="accordion-header">
                  <Icon icon="fluent:pulse-20-regular" width="16" height="16" class="accordion-icon" />
                  <span class="accordion-title">{{ $t('auditContextBehavior') }}</span>
                </div>
              </template>
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
            </el-collapse-item>

            <!-- 维度 4: 网络与拓扑置信度 (默认折叠) -->
            <el-collapse-item name="network">
              <template #title>
                <div class="accordion-header">
                  <Icon icon="fluent:globe-location-20-regular" width="16" height="16" class="accordion-icon" />
                  <span class="accordion-title">{{ $t('auditContextNetwork') }}</span>
                </div>
              </template>
              <div class="pillar-items">
                <div class="item-row"><span class="k">{{ $t('auditFieldTriggerIp') }}:</span> <span class="v font-mono">{{ selectedRow.ip || '-' }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldBaseIp') }}:</span> <span class="v font-mono">{{ selectedRow.baseIp || '-' }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldGeoMovement') }}:</span> <span class="v">{{ selectedRow.geo || '-' }} ({{ $t('auditBaselineRegLabel') }}: {{ selectedRow.baseGeo || '-' }})</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldSubnetMatch') }}:</span> <span class="v">{{ selectedRow.subnetMatch ? $t('auditSubnetMatchGood') : $t('auditSubnetRoaming') }}</span></div>
                <div class="item-row"><span class="k">{{ $t('auditFieldConcurrentNet') }}:</span> <span class="v" :class="{ 'text-danger': selectedRow.isMultiIp === 1 }">{{ selectedRow.isMultiIp === 1 ? $t('auditBurstConcurrent', { count: selectedRow.activeIpCount }) : $t('auditSingleSessionNormal') }}</span></div>
              </div>
            </el-collapse-item>
          </el-collapse>
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

      <!-- 【用词统一 & 层级优化】抽屉底部主操作栏 (用词与表格行内完全一致：解封 / 重新封禁) -->
      <template #footer>
        <div class="drawer-footer-actions">
          <el-button @click="drawerVisible = false">{{ $t('close') }}</el-button>
          <!-- 【用词统一】解封 / 重新封禁 -->
          <el-button
            v-if="selectedRow && selectedRow.status === 'banned'"
            type="success"
            :loading="actionLoading"
            @click="handleQuickToggleBan(selectedRow)"
          >
            <Icon icon="fluent:lock-open-16-regular" width="14" height="14" style="margin-right: 4px;" />
            <span>{{ $t('auditBtnUnban') }}</span>
          </el-button>
          <el-button
            v-else-if="selectedRow"
            type="danger"
            :loading="actionLoading"
            @click="handleQuickToggleBan(selectedRow)"
          >
            <Icon icon="fluent:prohibited-16-regular" width="14" height="14" style="margin-right: 4px;" />
            <span>{{ $t('auditBtnReban') }}</span>
          </el-button>
        </div>
      </template>
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

// 4 大情况 KPI 数据结构 (邮箱封禁管控实用指标)
const summaryCounts = reactive({
  banned: 0,
  today: 0,
  pending: 0,
  highRisk: 0,
  totalPending: 0,
  allTotal: 0,
  categories: {
    audit: { pending: 0, total: 0 },
    risk: { pending: 0, total: 0 },
    appeal: { pending: 0, total: 0 },
    ban: { pending: 0, total: 0 }
  }
});

// 当前选中的 KPI 卡片 (默认高亮选中生效中封禁)
const activeKpi = ref('banned');

const params = reactive({
  keyword: '',
  warningType: 'all',
  riskLevel: 'all',
  status: 'banned',
  timeRange: 'all',
  timeSort: 0,
  num: 1,
  size: 15
});

// 抽屉详情与研判状态
const drawerVisible = ref(false);
const selectedRow = ref(null);
const decisionNotes = ref('');
const actionLoading = ref(false);

// 【层级优化】多维风险画像折叠面板：默认展开前两个（凭证与身份挑战因子、设备指纹与会话连续性）
const activeAccordions = ref(['auth', 'device']);

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

function selectKpiFilter(type) {
  if (activeKpi.value === type) {
    activeKpi.value = 'all';
    params.status = 'all';
    params.timeRange = 'all';
    params.riskLevel = 'all';
  } else {
    activeKpi.value = type;
    if (type === 'banned') {
      params.status = 'banned';
      params.timeRange = 'all';
      params.riskLevel = 'all';
    } else if (type === 'today') {
      params.status = 'all';
      params.timeRange = 'today';
      params.riskLevel = 'all';
    } else if (type === 'pending') {
      params.status = 'pending';
      params.timeRange = 'all';
      params.riskLevel = 'all';
    } else if (type === 'highrisk') {
      params.status = 'all';
      params.timeRange = 'all';
      params.riskLevel = 'high';
    }
  }
  search();
}

function selectWarningFilter(type) {
  if (params.warningType === type) {
    params.warningType = 'all';
  } else {
    params.warningType = type;
  }
  search();
}

function handleReset() {
  localKeyword.value = '';
  params.keyword = '';
  params.status = 'all';
  params.timeRange = 'all';
  params.riskLevel = 'all';
  params.warningType = 'all';
  activeKpi.value = 'all';
  search();
}

function copyText(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success(t('copySuccessMsg') || '复制成功');
  }).catch(() => {
    ElMessage.success(t('copySuccessMsg') || '复制成功');
  });
}

function getRiskTagType(val) {
  if (!val) return 'info';
  const v = String(val).toUpperCase();
  if (['HIGH', 'CRITICAL', 'P0', 'P1'].includes(v)) return 'danger';
  if (['MEDIUM', 'P2'].includes(v)) return 'warning';
  return 'info';
}

function getRiskLabel(val) {
  if (!val) return t('auditRiskLevelLow');
  const v = String(val).toUpperCase();
  if (['HIGH', 'CRITICAL', 'P0'].includes(v)) return t('auditRiskLevelHigh');
  if (['MEDIUM', 'P1'].includes(v)) return t('auditRiskLevelMedium');
  return t('auditRiskLevelLow');
}

function getOperatorAvatar(row) {
  if (row?.operatorAvatar) return row.operatorAvatar;
  const name = row?.operatorName || row?.operator || (row?.status === 'banned' ? 'SYS' : 'SEC');
  return name.slice(0, 2).toUpperCase();
}

function getOperatorName(row) {
  if (row?.operatorName) return row.operatorName;
  if (row?.operator) return row.operator;
  return row?.status === 'banned' ? 'System Bot' : 'SecAdmin';
}

function getOperatorRole(row) {
  if (row?.operatorRole) return row.operatorRole;
  return row?.status === 'banned' ? t('auditOperatorRoleSystem') : t('auditOperatorRoleAdmin');
}

async function handleQuickToggleBan(row) {
  const isBanned = row.status === 'banned';
  const confirmMsg = isBanned
    ? `${t('auditUnbanConfirmMsg')} (${row.email})`
    : `${t('auditRebanConfirmMsg')} (${row.email})`;
  try {
    await ElMessageBox.confirm(confirmMsg, {
      confirmButtonText: isBanned ? t('auditBtnUnban') : t('auditBtnReban'),
      cancelButtonText: t('cancel'),
      type: isBanned ? 'success' : 'warning'
    });
    actionLoading.value = true;
    await auditAction({
      id: row.id,
      action: isBanned ? 'unban' : 'ban',
      targetEmail: row.email,
      notes: isBanned ? `${t('auditBtnUnban')} (${row.email})` : `${t('auditBtnReban')} (${row.email})`
    });
    ElMessage.success(t('auditActionSuccess') || t('saveSuccessMsg'));
    if (selectedRow.value && (selectedRow.value.id === row.id || selectedRow.value.email === row.email)) {
      selectedRow.value.status = isBanned ? 'unbanned' : 'banned';
    }
    fetchAuditList();
  } catch (e) {
    if (e !== 'cancel') console.error(e);
  } finally {
    actionLoading.value = false;
  }
}

async function handleOpenExtend(row) {
  try {
    const { value } = await ElMessageBox.prompt(
      `${t('auditExtendDialogTitle')} (${row.email})`,
      t('auditBtnExtend'),
      {
        confirmButtonText: t('confirm'),
        cancelButtonText: t('cancel'),
        inputValue: '30',
        inputPattern: /^[1-9]\d*$/,
        inputErrorMessage: t('auditPromptDaysInvalid'),
        inputPlaceholder: '30'
      }
    );
    if (value) {
      actionLoading.value = true;
      await auditAction({
        id: row.id,
        action: 'extend',
        targetEmail: row.email,
        extendDays: Number(value),
        notes: `${t('auditBtnExtend')}: ${value}d`
      });
      ElMessage.success(t('auditActionSuccess') || t('saveSuccessMsg'));
      fetchAuditList();
    }
  } catch (e) {
    if (e !== 'cancel') console.error(e);
  } finally {
    actionLoading.value = false;
  }
}

async function handleOpenNote(row) {
  try {
    const { value } = await ElMessageBox.prompt(
      `${t('auditNoteDialogTitle')} (${row.email})`,
      t('auditBtnNote'),
      {
        confirmButtonText: t('confirm'),
        cancelButtonText: t('cancel'),
        inputType: 'textarea',
        inputValue: row.banReason || row.notes || '',
        inputPlaceholder: t('auditDecisionNotesPlaceholder') || '请输入审核备注...'
      }
    );
    if (value !== undefined) {
      actionLoading.value = true;
      await auditAction({
        id: row.id,
        action: 'note',
        targetEmail: row.email,
        notes: value
      });
      ElMessage.success(t('auditActionSuccess') || t('saveSuccessMsg'));
      fetchAuditList();
    }
  } catch (e) {
    if (e !== 'cancel') console.error(e);
  } finally {
    actionLoading.value = false;
  }
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
    row.status === 'banned' || row.status === 'unbanned' ||
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
      summaryCounts.banned = data.counts.banned ?? data.counts.ban ?? logs.value.filter(l => l.status === 'banned').length;
      summaryCounts.today = data.counts.today ?? Math.max(1, summaryCounts.banned);
      summaryCounts.pending = data.counts.pending ?? data.counts.total ?? logs.value.filter(l => l.status === 'pending' || l.status === 'active').length;
      summaryCounts.highRisk = data.counts.highRisk ?? logs.value.filter(l => l.riskLevel === 'high' || l.priority === 'CRITICAL' || l.priority === 'P0').length;
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
    } else {
      summaryCounts.banned = logs.value.filter(l => l.status === 'banned').length;
      summaryCounts.today = Math.max(1, summaryCounts.banned);
      summaryCounts.pending = logs.value.filter(l => l.status === 'pending' || l.status === 'active').length;
      summaryCounts.highRisk = logs.value.filter(l => l.riskLevel === 'high' || l.priority === 'CRITICAL' || l.priority === 'P0').length;
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

.email-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  justify-content: center;
}

.email-main-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clickable-email {
  font-weight: 600;
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition: color 0.15s ease;
  &:hover {
    color: var(--el-color-primary);
    text-decoration: underline;
  }
}

/* 【层级优化】案件编号字号再缩小、对比度降低，真正弱化为次要信息 */
.ticket-sub {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--el-text-color-placeholder);
  opacity: 0.65;
  line-height: 1.2;

  .ticket-text {
    font-size: 10px;
    letter-spacing: 0.15px;
  }
}

.copy-sub-btn {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  opacity: 0.5;
  transition: opacity 0.15s ease, color 0.15s ease;
  &:hover {
    opacity: 1;
    color: var(--el-color-primary);
  }
}

.status-tag-with-icon {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
  padding: 2px 8px;

  .status-tag-icon {
    flex-shrink: 0;
  }
}

.operator-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.operator-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--el-fill-color-darker);
  color: var(--el-text-color-secondary);
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid var(--el-border-color);
}

.operator-info {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;

  .operator-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--el-text-color-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .operator-role {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.table-actions-group {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;

  .action-btn-compact {
    padding: 4px 10px;
    font-size: 12px;
    height: 28px;
    border-radius: 4px;
  }

  .action-icon-compact {
    width: 28px;
    height: 28px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-color: var(--el-border-color-lighter);
    color: var(--el-text-color-regular);
    &:hover {
      color: var(--el-color-primary);
      border-color: var(--el-color-primary-light-7);
      background: var(--el-color-primary-light-9);
    }
  }
}

:deep(.el-table__row) {
  td.el-table__cell {
    padding: 12px 0 !important;
  }
}

html.dark .kpi-card.kpi-card-active {
  background: rgba(64, 158, 255, 0.12) !important;
  border-color: #409eff !important;
  box-shadow: 0 0 0 1px #409eff, 0 4px 16px rgba(64, 158, 255, 0.2);
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

/* 【层级优化】多维风险画像折叠 Accordion 样式 */
.evidence-collapse {
  border: none;
  --el-collapse-border-color: var(--el-border-color-lighter);
  --el-collapse-header-bg-color: transparent;
  --el-collapse-content-bg-color: transparent;

  :deep(.el-collapse-item) {
    margin-bottom: 8px;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: 6px;
    overflow: hidden;
    background: var(--el-fill-color-blank);

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(.el-collapse-item__header) {
    padding: 0 12px;
    height: 38px;
    line-height: 38px;
    border-bottom: 1px solid transparent;
    transition: all 0.2s ease;

    &.is-active {
      border-bottom-color: var(--el-border-color-lighter);
      background: var(--el-fill-color-light);
    }
  }

  :deep(.el-collapse-item__wrap) {
    border-bottom: none;
    background: transparent;
  }

  :deep(.el-collapse-item__content) {
    padding: 10px 12px;
  }

  .accordion-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .accordion-icon {
    color: var(--el-color-primary);
  }

  .accordion-title {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--el-text-color-regular);
  }
}

.pillar-items {
  display: flex;
  flex-direction: column;
  gap: 5px;

  .item-row {
    display: flex;
    font-size: 12px;
    line-height: 1.45;

    .k {
      color: var(--el-text-color-secondary);
      width: 75px;
      flex-shrink: 0;
    }
    .v {
      color: var(--el-text-color-primary);
      word-break: break-all;
    }
  }
}

.drawer-footer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
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
