<template>
  <div class="audit-box">
    <!-- 主体全幅可滚动区域 -->
    <el-scrollbar ref="scrollbarRef" class="scrollbar">
      <div class="audit-page-container">

        <!-- 1. 顶部汇报分区 4 板块：严格 4 层分界与操作态图标 -->
        <div class="kpi-grid">
          <!-- 卡片 1: 滥用威胁 (展示所有 LV3 以上威胁账户：1人多号、被举报等) -->
          <div
            class="kpi-card kpi-threat"
            :class="{ 'kpi-card-active': activeKpi === 'threat' || (params.riskLevel === 'high' && activeKpi !== 'all') }"
            @click="selectKpiFilter('threat')"
          >
            <div class="kpi-icon-wrap icon-threat">
              <Icon icon="fluent:shield-dismiss-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-content">
              <div class="kpi-header">
                <span class="kpi-title">{{ $t('auditKpiThreatEmail') }}</span>
              </div>
              <div class="kpi-data-stat kpi-value font-mono">
                <span class="stat-number stat-danger">{{ summaryCounts.threat }}</span>
              </div>
              <div class="kpi-desc kpi-sub" :title="$t('auditKpiThreatEmailDesc')">
                {{ $t('auditKpiThreatEmailSub') }}
              </div>
            </div>
          </div>

          <!-- 卡片 2: 申诉审计 (通过填写符合表格对于已做出的判决的邮箱进行申诉的邮箱) -->
          <div
            class="kpi-card kpi-appeal"
            :class="{ 'kpi-card-active': activeKpi === 'appeal' || (params.warningType === 'appeal' && activeKpi !== 'all') }"
            @click="selectKpiFilter('appeal')"
          >
            <div class="kpi-icon-wrap icon-appeal">
              <Icon icon="fluent:person-feedback-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-content">
              <div class="kpi-header">
                <span class="kpi-title">{{ $t('auditKpiAppealEmail') }}</span>
              </div>
              <div class="kpi-data-stat kpi-value font-mono">
                <span class="stat-number stat-primary">{{ summaryCounts.appeal }}</span>
              </div>
              <div class="kpi-desc kpi-sub" :title="$t('auditKpiAppealEmailDesc')">
                {{ $t('auditKpiAppealEmailSub') }}
              </div>
            </div>
          </div>

          <!-- 卡片 3: 风险管理 (所有 LV0~LV3 邮箱：接发垃圾邮件、多次跳IP登录等) -->
          <div
            class="kpi-card kpi-audit"
            :class="{ 'kpi-card-active': activeKpi === 'audit' || (params.warningType === 'audit' && activeKpi !== 'all') }"
            @click="selectKpiFilter('audit')"
          >
            <div class="kpi-icon-wrap icon-audit">
              <Icon icon="fluent:clipboard-search-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-content">
              <div class="kpi-header">
                <span class="kpi-title">{{ $t('auditKpiAuditEmail') }}</span>
              </div>
              <div class="kpi-data-stat kpi-value font-mono">
                <span class="stat-number stat-warning">{{ summaryCounts.audit }}</span>
              </div>
              <div class="kpi-desc kpi-sub" :title="$t('auditKpiAuditEmailDesc')">
                {{ $t('auditKpiAuditEmailSub') }}
              </div>
            </div>
          </div>

          <!-- 卡片 4: 操作记录 (所有以上邮箱最终处理后(包括封禁、解禁等操作的更新)、过期后(不符合要求)等等) -->
          <div
            class="kpi-card kpi-record"
            :class="{ 'kpi-card-active': activeKpi === 'record' || (params.warningType === 'ban' && activeKpi !== 'all') }"
            @click="selectKpiFilter('record')"
          >
            <div class="kpi-icon-wrap icon-record">
              <Icon icon="fluent:history-20-filled" width="22" height="22" />
            </div>
            <div class="kpi-content">
              <div class="kpi-header">
                <span class="kpi-title">{{ $t('auditKpiActionRecord') }}</span>
              </div>
              <div class="kpi-data-stat kpi-value font-mono">
                <span class="stat-number stat-success">{{ summaryCounts.record }}</span>
              </div>
              <div class="kpi-desc kpi-sub" :title="$t('auditKpiActionRecordDesc')">
                {{ $t('auditKpiActionRecordSub') }}
              </div>
            </div>
          </div>
        </div>

        <!-- 2. 工作台单一外框 (单一事实载体：操作栏与表格一体化) -->
        <div class="audit-workbench audit-workbench-container">
          <!-- 顶部操作栏 (学习用户列表风格：纯图标交互、删除冗余输入框、支持批量操作与批量延期) -->
          <div class="header-actions">
            <!-- 批量延期 (快捷操作) -->
            <el-tooltip effect="dark" :content="$t('auditBatchExtend')" placement="top">
              <Icon class="icon" icon="fluent:calendar-clock-20-regular" width="20" height="20" @click="handleBatchExtend" />
            </el-tooltip>

            <!-- 刷新列表 -->
            <el-tooltip effect="dark" :content="$t('refresh')" placement="top">
              <Icon class="icon" icon="ion:reload" width="18" height="18" @click="refresh" />
            </el-tooltip>

            <!-- 重置筛选 -->
            <el-tooltip effect="dark" :content="$t('reset')" placement="top">
              <Icon class="icon" icon="fluent:arrow-rotate-clockwise-20-regular" width="18" height="18" @click="handleReset" />
            </el-tooltip>

            <!-- 导出审计数据 (CSV) -->
            <el-tooltip effect="dark" :content="$t('auditExportLogs')" placement="top">
              <Icon class="icon" icon="fluent:arrow-download-20-regular" width="19" height="19" @click="handleExportCsv" />
            </el-tooltip>

            <!-- 清理历史日志 -->
            <el-tooltip effect="dark" :content="$t('auditClearHistorical')" placement="top">
              <Icon class="icon" icon="fluent:broom-sparkle-16-regular" width="18" height="18" @click="handlePurge" />
            </el-tooltip>

            <!-- 安全规则文档外链 -->
            <el-tooltip effect="dark" :content="$t('auditDocsTitle')" placement="top">
              <Icon class="icon" icon="fluent:book-question-mark-20-regular" width="18" height="18" @click="openDocs" />
            </el-tooltip>

            <!-- 多选批量操作组 (选中有项时优雅显示) -->
            <transition name="fade">
              <div v-if="selectedRows.length > 0" class="batch-actions-wrap">
                <span class="batch-selected-count">{{ $t('auditSelectedCount', { count: selectedRows.length }) }}</span>
                <el-button size="small" type="success" plain @click="handleBatchUnban">
                  <Icon icon="fluent:lock-open-16-regular" width="14" height="14" style="margin-right: 3px;" />
                  {{ $t('auditBatchUnban') }}
                </el-button>
                <el-button size="small" type="danger" plain @click="handleBatchBan">
                  <Icon icon="fluent:prohibited-16-regular" width="14" height="14" style="margin-right: 3px;" />
                  {{ $t('auditBatchBan') }}
                </el-button>
                <el-button size="small" type="primary" plain @click="handleBatchExtend">
                  <Icon icon="fluent:calendar-clock-20-regular" width="14" height="14" style="margin-right: 3px;" />
                  {{ $t('auditBatchExtend') }}
                </el-button>
                <el-button size="small" type="danger" link @click="handleBatchDelete">
                  <Icon icon="fluent:delete-16-regular" width="14" height="14" style="margin-right: 3px;" />
                  {{ $t('auditBatchDelete') }}
                </el-button>
              </div>
            </transition>
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
              @selection-change="handleSelectionChange"
            >
              <!-- 0. 多选列 -->
              <el-table-column type="selection" width="40" align="center" />

              <!-- 列 1: 工单编号 (无邮箱与重复徽标干扰，仅显示简洁 #编号) -->
              <el-table-column :label="$t('auditColTicketNo')" width="80">
                <template #default="{ row }">
                  <div class="ticket-cell">
                    <span class="ticket-id font-mono font-medium clickable-ticket" @click="openAuditDrawer(row)">
                      {{ formatTicketNo(row) }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 2: 当前状态 (无边框，纯icon+文字说明水平对齐，缩短与工单编号距离) -->
              <el-table-column width="140">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditCurrentStatus') }}</span>
                    <el-dropdown trigger="click" @command="handleStatusFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.status !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.status === 'all' }">
                            {{ $t('auditAllStatus') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="banned" :class="{ 'is-selected': params.status === 'banned' }">
                            {{ $t('auditStatusBannedActive') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="pending" :class="{ 'is-selected': params.status === 'pending' }">
                            {{ $t('auditCaseStatusPending') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="unbanned" :class="{ 'is-selected': params.status === 'unbanned' }">
                            {{ $t('auditStatusUnbannedRecord') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="watching" :class="{ 'is-selected': params.status === 'watching' }">
                            {{ $t('auditStatusWatching') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="status-clean-item" :class="`status-${row.status}`" :title="getStatusLabel(row.status)">
                    <Icon :icon="getStatusIcon(row.status)" width="14" height="14" class="status-icon-inline" />
                    <span class="status-text-inline">{{ getStatusLabel(row.status) }}</span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 3: 报警原因 / 风险等级 (表头集成风险筛选，滥用威胁显示原因，申诉审计显示风险等级LV0~LV3) -->
              <el-table-column min-width="120">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ activeKpi === 'threat' ? $t('auditColAlarmReason') : (activeKpi === 'appeal' ? $t('auditRiskLevel') : `${$t('auditColAlarmReason')} / ${$t('auditRiskLevel')}`) }}</span>
                    <el-dropdown trigger="click" @command="handleRiskFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.riskLevel !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.riskLevel === 'all' }">
                            {{ $t('auditAllRiskLevel') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="high" :class="{ 'is-selected': params.riskLevel === 'high' }">
                            LV3 · {{ $t('auditRiskLevelHigh') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="medium" :class="{ 'is-selected': params.riskLevel === 'medium' }">
                            LV2 · {{ $t('auditRiskLevelMedium') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="normal" :class="{ 'is-selected': params.riskLevel === 'normal' }">
                            LV1 · {{ $t('auditRiskLevelLow') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <!-- 申诉审计：显示风险等级 LV0~LV3 -->
                  <template v-if="activeKpi === 'appeal'">
                    <el-tag size="small" :type="getRiskTagType(row.priority || row.riskLevel)" effect="plain">
                      {{ getAppealRiskLevel(row) }}
                    </el-tag>
                  </template>
                  <!-- 滥用威胁：只显示简单的报警原因，如一人多号、多次检举等 -->
                  <template v-else-if="activeKpi === 'threat'">
                    <span class="plain-reason-text">{{ getSimpleAlarmReason(row) }}</span>
                  </template>
                  <!-- 其他（风险管理/操作记录）：综合显示原因与等级 -->
                  <template v-else>
                    <div class="hybrid-reason-cell">
                      <span class="plain-reason-text">{{ getSimpleAlarmReason(row) }}</span>
                      <el-tag v-if="row.priority || (row.riskLevel && row.riskLevel !== 'normal')" size="small" :type="getRiskTagType(row.priority || row.riskLevel)" effect="plain" class="tag-compact">
                        {{ getAppealRiskLevel(row) }}
                      </el-tag>
                    </div>
                  </template>
                </template>
              </el-table-column>

              <!-- 列 4: 触发网络 (展示 IP 归属与物理地理位置，填补中间空白) -->
              <el-table-column :label="$t('auditColTriggerNetwork')" width="160">
                <template #default="{ row }">
                  <div class="network-cell font-mono">
                    <span class="network-ip font-medium">{{ row.ip || '-' }}</span>
                    <span v-if="row.geo" class="network-geo text-muted" :title="row.geo">({{ row.geo }})</span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 5: 终端设备 (展示客户端环境与系统特征，填补中间空白) -->
              <el-table-column :label="$t('auditColClientDevice')" width="145" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="device-cell" :title="row.device || '-'">
                    <Icon :icon="getDeviceIcon(row)" width="14" height="14" class="device-icon" />
                    <span class="device-text">{{ row.device || '-' }}</span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 6: 处理时间 (格式 mm/dd/yy hh:ss，表头集成时间筛选与排序箭头) -->
              <el-table-column width="135">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColProcessTime') }}</span>
                    <!-- 时间排序箭头 -->
                    <span class="header-action-trigger" :class="{ 'sort-active': params.timeSort !== 0 }" :title="params.timeSort === 1 ? $t('auditSortAsc') : $t('auditSortDesc')" @click.stop="changeTimeSort">
                      <Icon :icon="params.timeSort === 1 ? 'fluent:arrow-up-16-regular' : (params.timeSort === 2 ? 'fluent:arrow-down-16-regular' : 'fluent:arrow-sort-16-regular')" width="13" height="13" />
                    </span>
                    <el-dropdown trigger="click" @command="handleTimeFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.timeRange !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.timeRange === 'all' }">
                            {{ $t('auditAllProcessTime') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="today" :class="{ 'is-selected': params.timeRange === 'today' }">
                            {{ $t('auditTimeToday') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="7days" :class="{ 'is-selected': params.timeRange === '7days' }">
                            {{ $t('auditTime7Days') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="30days" :class="{ 'is-selected': params.timeRange === '30days' }">
                            {{ $t('auditTime30Days') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <span class="plain-time font-mono">
                    {{ formatTableTime(row.banTime || row.createTime) }}
                  </span>
                </template>
              </el-table-column>

              <!-- 列 5: 处理建议 (包括封禁、解禁、暂禁dd天等等；全 Tab 均展示) -->
              <el-table-column :label="$t('auditColSuggestion')" width="115">
                <template #default="{ row }">
                  <div class="suggestion-tag-cell">
                    <el-tag
                      size="small"
                      :type="getHandlingSuggestion(row).type"
                      effect="plain"
                      class="suggestion-tag"
                    >
                      {{ getHandlingSuggestion(row).text }}
                    </el-tag>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 6: 到期时间 (滥用威胁中无到期时间；其他 Tab 保留并使用 mm/dd/yy hh:ss 格式与排序箭头) -->
              <el-table-column v-if="activeKpi !== 'threat'" width="135">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColExpireTime') }}</span>
                    <!-- 到期时间排序箭头 -->
                    <span class="header-action-trigger" :class="{ 'sort-active': params.timeSort !== 0 }" :title="params.timeSort === 1 ? $t('auditSortAsc') : $t('auditSortDesc')" @click.stop="changeTimeSort">
                      <Icon :icon="params.timeSort === 1 ? 'fluent:arrow-up-16-regular' : (params.timeSort === 2 ? 'fluent:arrow-down-16-regular' : 'fluent:arrow-sort-16-regular')" width="13" height="13" />
                    </span>
                  </div>
                </template>
                <template #default="{ row }">
                  <span v-if="row.expireTime" class="plain-time font-mono">
                    {{ formatTableTime(row.expireTime) }}
                  </span>
                  <span v-else class="plain-dash-text font-mono">
                    -
                  </span>
                </template>
              </el-table-column>

              <!-- 列 7: 负责人 (只展示名称，点击可进入账户详情) -->
              <el-table-column :label="$t('auditColAssignee')" width="105">
                <template #default="{ row }">
                  <span class="operator-name-link font-medium" :title="getOperatorName(row)" @click.stop="handleViewOperator(row)">
                    {{ getOperatorName(row) }}
                  </span>
                </template>
              </el-table-column>

              <!-- 列 8: 操作 (只保留查看详情，解封/封禁/延期/备注均整合入详情中) -->
              <el-table-column :label="$t('action')" width="95" align="right">
                <template #default="{ row }">
                  <el-button
                    size="small"
                    type="primary"
                    link
                    class="action-detail-btn"
                    @click="openAuditDrawer(row)"
                  >
                    {{ $t('auditBtnViewDetails') }}
                  </el-button>
                </template>
              </el-table-column>
            </el-table>

            <!-- 统一底部分页 (完全对齐用户列表规范与响应式) -->
            <div class="pagination" v-if="total > 10">
              <el-pagination
                :size="pageSize"
                :current-page="params.num"
                :page-size="params.size"
                :pager-count="pagerCount"
                :page-sizes="[10, 15, 20, 25, 30, 50]"
                background
                :layout="layout"
                :total="total"
                @size-change="handleSizeChange"
                @current-change="handleCurrentChange"
              />
              <el-pagination
                v-if="phonePageShow"
                :size="pageSize"
                :current-page="params.num"
                :page-size="params.size"
                :pager-count="pagerCount"
                :page-sizes="[10, 15, 20, 25, 30, 50]"
                background
                layout="sizes, total"
                :total="total"
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
            icon="fluent:prohibited-20-filled"
            width="22"
            height="22"
            class="header-icon text-danger"
          />
          <div class="header-text">
            <div class="drawer-title">
              <span>{{ $t('auditSanctionDossierTitle') }}</span>
            </div>
            <div class="drawer-sub">
              <span>{{ $t('auditSanctionPureNotice') }}</span>
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

        <!-- 初判规则依据与处置基准 -> 风险研判与处置依据 -->
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

            <!-- 保留红色警示文案：突出封禁管控原因与触发规则 -->
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

        <!-- 【证据对比布局】多维风险画像两列对比卡片：左侧当前账号实际证据值，右侧系统基准/风险阈值，标红超标项，默认完全展开 -->
        <div class="dossier-card evidence-compare-card-wrapper">
          <div class="section-title">
            <Icon icon="fluent:chart-multiple-20-regular" width="18" height="18" />
            <span>{{ $t('auditGoogleTrustContext') }}</span>
          </div>

          <div class="evidence-notice">
            <Icon icon="fluent:info-16-regular" width="16" height="16" />
            <span>{{ $t('auditEvidenceReviewNotice') }}</span>
          </div>

          <div class="compare-container">
            <!-- 左侧卡片：当前账号实际证据值 -->
            <div class="compare-card compare-card-actual">
              <div class="compare-card-header actual-header">
                <Icon icon="fluent:person-warning-20-filled" width="16" height="16" class="card-header-icon text-danger" />
                <span class="card-header-title">{{ $t('auditCompareActualTitle') }}</span>
              </div>
              <div class="compare-card-body">
                <!-- 维度 1: 设备指纹与会话连续性 -->
                <div class="compare-section-badge">{{ $t('auditContextDevice') }}</div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldFingerprint') }}:</span>
                  <span class="compare-v font-mono" :class="{ 'text-danger font-semibold': (selectedRow.matchScore || 85) < 70 }">
                    {{ selectedRow.fingerprint || '-' }}
                  </span>
                </div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldClient') }}:</span>
                  <span class="compare-v">{{ selectedRow.device || '-' }}</span>
                </div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldSimilarity') }}:</span>
                  <span class="compare-v font-mono" :class="{ 'text-danger font-semibold': (selectedRow.matchScore || 85) < 70 }">
                    {{ selectedRow.matchScore || 85 }}%
                    <span v-if="(selectedRow.matchScore || 85) < 70" class="anomaly-tag text-danger">({{ $t('auditRiskLevelHigh') }})</span>
                  </span>
                </div>

                <!-- 维度 2: 网络与拓扑置信度 -->
                <div class="compare-section-badge">{{ $t('auditContextNetwork') }}</div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldTriggerIp') }}:</span>
                  <span class="compare-v font-mono">{{ selectedRow.ip || '-' }} ({{ selectedRow.geo || '-' }})</span>
                </div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditCompareIpAccounts') }}:</span>
                  <span class="compare-v font-mono" :class="{ 'text-danger font-semibold': (selectedRow.activeIpCount > 1 || selectedRow.isMultiIp === 1) }">
                    {{ selectedRow.activeIpCount > 1 ? selectedRow.activeIpCount : (selectedRow.isMultiIp === 1 ? 8 : 1) }}
                    <span v-if="selectedRow.activeIpCount > 1 || selectedRow.isMultiIp === 1" class="anomaly-tag text-danger">({{ $t('auditRiskLevelHigh') }})</span>
                  </span>
                </div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldSubnetMatch') }}:</span>
                  <span class="compare-v" :class="{ 'text-danger font-semibold': !selectedRow.subnetMatch }">
                    {{ selectedRow.subnetMatch ? $t('auditSubnetMatchGood') : $t('auditSubnetRoaming') }}
                  </span>
                </div>

                <!-- 维度 3: 行为速率与检举遥测 -->
                <div class="compare-section-badge">{{ $t('auditContextBehavior') }}</div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldUserReports') }}:</span>
                  <span class="compare-v" :class="{ 'text-danger font-semibold': (selectedRow.reportedByOthers || 0) > 0 }">
                    {{ (selectedRow.reportedByOthers || 0) > 0 ? $t('auditReportsCount', { count: selectedRow.reportedByOthers }) : $t('auditNoReports') }}
                  </span>
                </div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldSendRate') }}:</span>
                  <span class="compare-v" :class="{ 'text-danger font-semibold': isRiskType(selectedRow) }">
                    {{ isRiskType(selectedRow) ? $t('auditSendRateSpike') : $t('auditSendRateNormal') }}
                  </span>
                </div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldBounceRate') }}:</span>
                  <span class="compare-v" :class="{ 'text-danger font-semibold': isRiskType(selectedRow) }">
                    {{ isRiskType(selectedRow) ? $t('auditBounceRateHigh') : $t('auditBounceRateHealthy') }}
                  </span>
                </div>

                <!-- 维度 4: 凭证与身份安全 -->
                <div class="compare-section-badge">{{ $t('auditContextAuth') }}</div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldCredHealth') }}:</span>
                  <span class="compare-v" :class="{ 'text-danger font-semibold': (isRiskType(selectedRow) || isBanType(selectedRow)) }">
                    {{ (isRiskType(selectedRow) || isBanType(selectedRow)) ? $t('auditCredCompromised') : $t('auditCredNotLeaked') }}
                  </span>
                </div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditField2fa') }}:</span>
                  <span class="compare-v">
                    {{ selectedRow.status === 'banned' ? $t('auditStatusBannedActive') : $t('audit2faProtected') }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 右侧卡片：系统基准 / 正常值 / 风险阈值 -->
            <div class="compare-card compare-card-baseline">
              <div class="compare-card-header baseline-header">
                <Icon icon="fluent:shield-checkmark-20-filled" width="16" height="16" class="card-header-icon text-success" />
                <span class="card-header-title">{{ $t('auditCompareBaselineTitle') }}</span>
              </div>
              <div class="compare-card-body">
                <!-- 维度 1: 设备指纹与会话连续性 -->
                <div class="compare-section-badge">{{ $t('auditContextDevice') }}</div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldFingerprint') }}:</span>
                  <span class="compare-v font-mono text-muted">{{ selectedRow.baseFingerprint || selectedRow.fingerprint || '-' }}</span>
                </div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldBaseDevice') }}:</span>
                  <span class="compare-v text-muted">{{ selectedRow.baseDevice || selectedRow.device || '-' }}</span>
                </div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldSimilarity') }}:</span>
                  <span class="compare-v font-mono text-muted">{{ $t('auditCompareDeviceThreshold') }}</span>
                </div>

                <!-- 维度 2: 网络与拓扑置信度 -->
                <div class="compare-section-badge">{{ $t('auditContextNetwork') }}</div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldBaseIp') }}:</span>
                  <span class="compare-v font-mono text-muted">{{ selectedRow.baseIp || '-' }} ({{ selectedRow.baseGeo || '-' }})</span>
                </div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditCompareIpAccounts') }}:</span>
                  <span class="compare-v font-mono text-muted">{{ $t('auditCompareIpAccountsThreshold') }}</span>
                </div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldSubnetMatch') }}:</span>
                  <span class="compare-v text-muted">{{ $t('auditSubnetMatchGood') }}</span>
                </div>

                <!-- 维度 3: 行为速率与检举遥测 -->
                <div class="compare-section-badge">{{ $t('auditContextBehavior') }}</div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldUserReports') }}:</span>
                  <span class="compare-v text-muted">{{ $t('auditCompareReportsThreshold') }}</span>
                </div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldSendRate') }}:</span>
                  <span class="compare-v text-muted">{{ $t('auditCompareSendRateThreshold') }}</span>
                </div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldBounceRate') }}:</span>
                  <span class="compare-v text-muted">{{ $t('auditCompareBounceRateThreshold') }}</span>
                </div>

                <!-- 维度 4: 凭证与身份安全 -->
                <div class="compare-section-badge">{{ $t('auditContextAuth') }}</div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditFieldCredHealth') }}:</span>
                  <span class="compare-v text-muted">{{ $t('auditCompareCredThreshold') }}</span>
                </div>
                <div class="compare-item-row">
                  <span class="compare-k">{{ $t('auditField2fa') }}:</span>
                  <span class="compare-v text-muted">{{ $t('audit2faProtected') }}</span>
                </div>
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

      <!-- 【用词统一 & 层级优化】抽屉底部主操作栏 (用词与表格行内完全一致：解封 / 重新封禁) -->
      <template #footer>
        <div class="drawer-footer-actions">
          <el-button @click="drawerVisible = false">{{ $t('close') }}</el-button>

          <!-- 延期 (仅对具有到期时间的工单展示) -->
          <el-button
            v-if="canExtendRow(selectedRow)"
            type="primary"
            plain
            :loading="actionLoading"
            @click="handleOpenExtend(selectedRow)"
          >
            <Icon icon="fluent:calendar-clock-20-regular" width="14" height="14" style="margin-right: 4px;" />
            <span>{{ $t('auditBtnExtend') }}</span>
          </el-button>

          <!-- 备注 -->
          <el-button
            v-if="selectedRow"
            type="info"
            plain
            :loading="actionLoading"
            @click="handleOpenNote(selectedRow)"
          >
            <Icon icon="fluent:note-edit-20-regular" width="14" height="14" style="margin-right: 4px;" />
            <span>{{ $t('auditBtnNote') }}</span>
          </el-button>

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

    <!-- 5. 负责人账户详情弹窗 -->
    <el-dialog
      v-model="operatorDialogVisible"
      :title="$t('auditOperatorAccountDetails')"
      width="440px"
      append-to-body
      destroy-on-close
      class="operator-account-dialog"
    >
      <div v-if="currentOperator" class="operator-dialog-body">
        <div class="operator-profile-card">
          <div class="operator-dialog-avatar">
            {{ currentOperator.avatar }}
          </div>
          <div class="operator-dialog-title">
            <span class="operator-dialog-name">{{ currentOperator.name }}</span>
            <span class="operator-dialog-role-badge">{{ currentOperator.role }}</span>
          </div>
        </div>
        <div class="operator-info-list">
          <div class="operator-info-item">
            <span class="info-label">{{ $t('auditOperatorAccount') }}</span>
            <span class="info-val font-mono">{{ currentOperator.email }}</span>
          </div>
          <div class="operator-info-item">
            <span class="info-label">{{ $t('auditOperatorType') }}</span>
            <span class="info-val">{{ currentOperator.typeLabel }}</span>
          </div>
          <div class="operator-info-item">
            <span class="info-label">{{ $t('auditCurrentStatus') }}</span>
            <span class="info-val" style="color: #10b981;">{{ $t('normal') }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="operatorDialogVisible = false">{{ $t('close') }}</el-button>
          <el-button type="primary" @click="goToUserManagement">
            {{ $t('auditGoToUserList') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
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

const router = useRouter();
const { t, locale } = useI18n();
const settingStore = useSettingStore();
const emailStore = useEmailStore();

const tableLoading = ref(true);
const first = ref(true);
const scrollbarRef = ref(null);
const logs = ref([]);
const total = ref(0);
const selectedRows = ref([]);
const operatorDialogVisible = ref(false);
const currentOperator = ref(null);

// 响应式分页状态 (完全对齐用户列表规范)
const layout = ref('prev, pager, next, sizes, total');
const pageSize = ref('');
const pagerCount = ref(10);
const phonePageShow = ref(false);

function handleResize() {
  const width = window.innerWidth;
  phonePageShow.value = width < 768;
  pagerCount.value = width < 768 ? 7 : 11;
  layout.value = width < 768 ? 'pager' : 'prev, pager, next, sizes, total';
  pageSize.value = width < 380 ? 'small' : '';
}

// 本地搜索关键字，与顶栏 topbar-search 双向结合
const localKeyword = ref('');

// 4 大情况 KPI 数据结构 (严格 4 层分界：威胁邮箱 / 待审计邮箱 / 申诉邮箱 / 操作记录)
const summaryCounts = reactive({
  threat: 0,
  audit: 0,
  appeal: 0,
  record: 0,
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

// 当前选中的 KPI 卡片 (默认高亮选中威胁邮箱)
const activeKpi = ref('threat');

const params = reactive({
  keyword: '',
  warningType: 'all',
  riskLevel: 'high',
  status: 'all',
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
    params.warningType = 'all';
    params.riskLevel = 'all';
    params.status = 'all';
    params.timeRange = 'all';
  } else {
    activeKpi.value = type;
    params.timeRange = 'all';
    if (type === 'threat' || type === 'highrisk') {
      // 1. 滥用威胁：展示所有LV3以上的威胁账户，主要包含1人多号、被举报等
      params.riskLevel = 'high';
      params.warningType = 'all';
      params.status = 'all';
    } else if (type === 'appeal' || type === 'pending') {
      // 2. 申诉审计：通过填写符合表格对于已做出的判决的邮箱进行申诉的邮箱
      params.warningType = 'appeal';
      params.riskLevel = 'all';
      params.status = 'all';
    } else if (type === 'audit') {
      // 3. 风险管理：所有LV0~LV3的邮箱，主要包括接发垃圾邮件、多次跳IP登录等等
      params.warningType = 'audit';
      params.riskLevel = 'all';
      params.status = 'all';
    } else if (type === 'record' || type === 'banned') {
      // 4. 操作记录：所有以上邮箱最终处理后(包括封禁、解禁等操作的更新)、过期后(不符合要求)等等
      params.warningType = 'ban';
      params.riskLevel = 'all';
      params.status = 'all';
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
  params.timeSort = 0;
  activeKpi.value = 'all';
  search();
}

function formatTicketNo(row) {
  if (!row) return '#-';
  if (row.id) return `#${10000 + Number(row.id)}`;
  if (row.ticketId) {
    const digits = row.ticketId.replace(/\D/g, '');
    return `#${digits || '10001'}`;
  }
  return '#10001';
}

function formatTableTime(time) {
  if (!time) return '-';
  return tzDayjs(time).format('MM/DD/YY HH:mm');
}

function getDeviceIcon(row) {
  const dev = (row?.device || '').toLowerCase();
  if (dev.includes('curl') || dev.includes('bot') || dev.includes('terminal') || dev.includes('monitor') || dev.includes('headless')) {
    return 'fluent:terminal-16-regular';
  }
  if (dev.includes('phone') || dev.includes('ios') || dev.includes('android') || dev.includes('mobile')) {
    return 'fluent:phone-16-regular';
  }
  if (dev.includes('mac') || dev.includes('laptop')) {
    return 'fluent:laptop-16-regular';
  }
  return 'fluent:desktop-16-regular';
}

function getHandlingSuggestion(row) {
  if (!row) return { text: '-', type: 'info' };
  if (row.suggestion) {
    return { text: row.suggestion, type: 'warning' };
  }
  // 1. 滥用威胁 (threat)
  if (activeKpi.value === 'threat' || row.warningType === 'ban') {
    if (row.status === 'unbanned') {
      return { text: t('auditSuggestionUnban'), type: 'success' };
    }
    if (row.reportedByOthers && row.reportedByOthers >= 3) {
      return { text: t('auditSuggestionPermanentBan'), type: 'danger' };
    }
    if (row.status === 'banned') {
      return { text: t('auditSuggestionKeepBan'), type: 'danger' };
    }
    return { text: t('auditSuggestionBan'), type: 'danger' };
  }

  // 2. 申诉审计 (appeal)
  if (activeKpi.value === 'appeal' || row.warningType === 'appeal') {
    if (row.status === 'unbanned' || row.status === 'resolved') {
      return { text: t('auditSuggestionUnban'), type: 'success' };
    }
    const p = (row?.priority || '').toUpperCase();
    if (['P0', 'CRITICAL', 'LV3'].includes(p) || row?.riskLevel === 'high') {
      return { text: t('auditSuggestionTempBan30'), type: 'danger' };
    }
    if (['P1', 'LV2'].includes(p) || row?.riskLevel === 'medium') {
      return { text: t('auditSuggestionTempBan15'), type: 'warning' };
    }
    return { text: t('auditSuggestionTempBan7'), type: 'warning' };
  }

  // 3. 风险管理 (audit) 与 操作记录 (record)
  if (row.status === 'unbanned') {
    return { text: t('auditSuggestionUnban'), type: 'success' };
  }
  if (row.status === 'watching') {
    return { text: t('auditSuggestionWatch'), type: 'info' };
  }
  if (row.priority === 'P0' || row.riskLevel === 'high') {
    return { text: t('auditSuggestionTempBan30'), type: 'danger' };
  }
  if (row.priority === 'P1' || row.riskLevel === 'medium') {
    return { text: t('auditSuggestionTempBan7'), type: 'warning' };
  }
  return { text: t('auditSuggestionTempBan3'), type: 'warning' };
}

function canExtendRow(row) {
  if (!row) return false;
  // 滥用威胁没有到期时间，不支持延期
  if (activeKpi.value === 'threat') return false;
  // 有到期时间的才能延时
  return !!row.expireTime;
}

function getSimpleAlarmReason(row) {
  if (!row) return '-';
  if (row.reportedByOthers && row.reportedByOthers > 0) {
    return `${t('auditReasonUserReported')} (${row.reportedByOthers})`;
  }
  if (row.eventType === 'multi_account_ban' || row.eventType === 'multi_account_detected' || (row.banReason && row.banReason.includes('一人多号'))) {
    return t('auditReasonMultiAccount');
  }
  if (row.eventType === 'auto_ban' || (row.banReason && (row.banReason.includes('频率') || row.banReason.includes('超频')))) {
    return t('auditReasonRateLimit');
  }
  if (row.eventType === 'credential_tamper_ban' || (row.banReason && (row.banReason.includes('密保') || row.banReason.includes('换机')))) {
    return t('auditReasonCredentialAnomaly');
  }
  if (row.eventType === 'ip_roaming_routine' || (row.actionText && row.actionText.includes('漫游'))) {
    return t('auditReasonRoaming');
  }
  if (row.banReason) {
    return row.banReason.split(/[（(，,]/)[0].trim() || row.banReason;
  }
  if (row.reportCategory) {
    return getCategoryLabel(row.reportCategory);
  }
  if (row.actionText) {
    const clean = row.actionText.replace(/\{[^}]+\}\s*/, '');
    return clean.split(/[（(，,]/)[0].trim() || clean;
  }
  return '-';
}

function getAppealRiskLevel(row) {
  const p = (row?.priority || '').toUpperCase();
  if (['P0', 'CRITICAL', 'LV3'].includes(p) || row?.riskLevel === 'high') return 'LV3 · ' + t('auditRiskLevelHigh');
  if (['P1', 'LV2'].includes(p) || row?.riskLevel === 'medium') return 'LV2 · ' + t('auditRiskLevelMedium');
  if (['P2', 'LV1'].includes(p) || row?.riskLevel === 'low') return 'LV1 · ' + t('auditRiskLevelLow');
  return 'LV0 · ' + t('auditRiskLevelNormal');
}

function getStatusIcon(status) {
  switch (status) {
    case 'banned': return 'fluent:prohibited-16-regular';
    case 'pending':
    case 'active': return 'fluent:clock-16-regular';
    case 'resolved':
    case 'unbanned': return 'fluent:checkmark-circle-16-regular';
    case 'rejected': return 'fluent:dismiss-circle-16-regular';
    case 'expired': return 'fluent:timer-16-regular';
    default: return 'fluent:eye-16-regular';
  }
}

function handleStatusFilterCommand(cmd) {
  params.status = cmd;
  search();
}

function handleRiskFilterCommand(cmd) {
  params.riskLevel = cmd;
  search();
}

function handleTimeFilterCommand(cmd) {
  params.timeRange = cmd;
  search();
}

function handleSelectionChange(rows) {
  selectedRows.value = rows || [];
}

async function handleBatchUnban() {
  if (!selectedRows.value.length) return;
  try {
    await ElMessageBox.confirm(
      t('auditBatchUnbanConfirm', { count: selectedRows.value.length }),
      t('auditBatchUnban'),
      {
        confirmButtonText: t('auditBatchUnban'),
        cancelButtonText: t('cancel'),
        type: 'success'
      }
    );
    actionLoading.value = true;
    for (const row of selectedRows.value) {
      try {
        await auditAction({
          id: row.id,
          action: 'unban',
          targetEmail: row.email,
          notes: `${t('auditBatchUnban')} (${row.email})`
        });
      } catch (err) {
        console.error(err);
      }
    }
    ElMessage.success(t('auditActionSuccess') || t('saveSuccessMsg'));
    selectedRows.value = [];
    fetchAuditList();
  } catch (e) {
    if (e !== 'cancel') console.error(e);
  } finally {
    actionLoading.value = false;
  }
}

async function handleBatchBan() {
  if (!selectedRows.value.length) return;
  try {
    await ElMessageBox.confirm(
      t('auditBatchBanConfirm', { count: selectedRows.value.length }),
      t('auditBatchBan'),
      {
        confirmButtonText: t('auditBatchBan'),
        cancelButtonText: t('cancel'),
        type: 'warning'
      }
    );
    actionLoading.value = true;
    for (const row of selectedRows.value) {
      try {
        await auditAction({
          id: row.id,
          action: 'ban',
          targetEmail: row.email,
          notes: `${t('auditBatchBan')} (${row.email})`
        });
      } catch (err) {
        console.error(err);
      }
    }
    ElMessage.success(t('auditActionSuccess') || t('saveSuccessMsg'));
    selectedRows.value = [];
    fetchAuditList();
  } catch (e) {
    if (e !== 'cancel') console.error(e);
  } finally {
    actionLoading.value = false;
  }
}

async function handleBatchDelete() {
  if (!selectedRows.value.length) return;
  try {
    await ElMessageBox.confirm(
      t('auditBatchDeleteConfirm', { count: selectedRows.value.length }),
      t('auditBatchDelete'),
      {
        confirmButtonText: t('auditBatchDelete'),
        cancelButtonText: t('cancel'),
        type: 'danger'
      }
    );
    actionLoading.value = true;
    for (const row of selectedRows.value) {
      try {
        await auditAction({
          id: row.id,
          action: 'delete',
          targetEmail: row.email
        });
      } catch (err) {
        console.error(err);
      }
    }
    ElMessage.success(t('auditActionSuccess') || t('saveSuccessMsg'));
    selectedRows.value = [];
    fetchAuditList();
  } catch (e) {
    if (e !== 'cancel') console.error(e);
  } finally {
    actionLoading.value = false;
  }
}

function handleExportCsv() {
  if (!logs.value || logs.value.length === 0) {
    ElMessage.info(t('auditEmptyLogs') || '无数据可导出');
    return;
  }
  const headers = [
    t('auditColTicketNo'),
    t('tabEmailAddress'),
    t('auditCurrentStatus'),
    t('auditColAlarmReason'),
    t('auditColTriggerNetwork'),
    t('auditColClientDevice'),
    t('auditColProcessTime'),
    t('auditColSuggestion'),
    t('auditColExpireTime'),
    t('auditColAssignee')
  ];
  const csvRows = [headers.join(',')];
  for (const row of logs.value) {
    const networkVal = row.ip ? `${row.ip}${row.geo ? ` (${row.geo})` : ''}` : '-';
    const rowValues = [
      formatTicketNo(row),
      `"${row.email || ''}"`,
      `"${getStatusLabel(row.status)}"`,
      `"${getSimpleAlarmReason(row)}"`,
      `"${networkVal}"`,
      `"${row.device || '-'}"`,
      `"${formatTableTime(row.banTime || row.createTime)}"`,
      `"${getHandlingSuggestion(row).text}"`,
      `"${row.expireTime ? formatTableTime(row.expireTime) : '-'}"`,
      `"${getOperatorName(row)}"`
    ];
    csvRows.push(rowValues.join(','));
  }
  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `audit_logs_${tzDayjs().format('YYYYMMDD_HHmmss')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  ElMessage.success(t('copySuccessMsg') || '导出成功');
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
  if (!canExtendRow(row)) {
    ElMessage.warning(t('auditExtendOnlyWithExpireTime'));
    return;
  }
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

async function handleBatchExtend() {
  if (!selectedRows.value.length) {
    ElMessage.warning(t('auditBatchSelectRequired') || '请先勾选需要延期的工单');
    return;
  }
  const extendableRows = selectedRows.value.filter(r => canExtendRow(r));
  if (!extendableRows.length) {
    ElMessage.warning(t('auditExtendOnlyWithExpireTime'));
    return;
  }
  try {
    const { value } = await ElMessageBox.prompt(
      t('auditBatchExtendPrompt', { count: extendableRows.length }),
      t('auditBatchExtendTitle'),
      {
        confirmButtonText: t('confirm'),
        cancelButtonText: t('cancel'),
        inputValue: '7',
        inputPattern: /^[1-9]\d*$/,
        inputErrorMessage: t('auditPromptDaysInvalid'),
        inputPlaceholder: '7'
      }
    );
    if (value) {
      const days = Number(value);
      actionLoading.value = true;
      for (const row of extendableRows) {
        try {
          const base = row.expireTime ? tzDayjs(row.expireTime) : tzDayjs();
          const newExpire = base.add(days, 'day').toISOString();
          await auditAction({
            id: row.id,
            action: 'extend',
            targetEmail: row.email,
            extendDays: days,
            expireTime: newExpire,
            notes: `批量延期: ${days}d`
          });
          row.expireTime = newExpire;
        } catch (err) {
          console.error(err);
        }
      }
      ElMessage.success(t('auditBatchExtendSuccess', { count: extendableRows.length, days }));
      selectedRows.value = [];
      fetchAuditList();
    }
  } catch (e) {
    if (e !== 'cancel') console.error(e);
  } finally {
    actionLoading.value = false;
  }
}

function handleViewOperator(row) {
  const name = getOperatorName(row);
  const isSys = row?.status === 'banned' || name.toLowerCase().includes('bot') || name.toLowerCase().includes('system');
  currentOperator.value = {
    name,
    avatar: getOperatorAvatar(row),
    role: getOperatorRole(row),
    email: row?.operatorEmail || (isSys ? 'system-daemon@epocanvas.com' : 'security-admin@epomail.cyou'),
    typeLabel: isSys ? t('auditOperatorTypeSystem') : t('auditOperatorTypeHuman'),
    id: row?.operatorId || 'ADM-01'
  };
  operatorDialogVisible.value = true;
}

function goToUserManagement() {
  operatorDialogVisible.value = false;
  router.push('/manage/admin/users').catch(() => {
    router.push('/manage/moderator/users').catch(() => {
      router.push('/all-users').catch(() => {});
    });
  });
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
      summaryCounts.threat = data.counts.highRisk ?? data.counts.riskTotal ?? (data.counts.categories?.risk?.total ?? 0);
      summaryCounts.audit = data.counts.auditTotal ?? data.counts.audit ?? (data.counts.categories?.audit?.total ?? 0);
      summaryCounts.appeal = data.counts.appealTotal ?? data.counts.appeal ?? (data.counts.categories?.appeal?.total ?? 0);
      summaryCounts.record = data.counts.banTotal ?? data.counts.banned ?? (data.counts.categories?.ban?.total ?? 0);

      if (summaryCounts.threat === 0 && logs.value.length > 0) {
        summaryCounts.threat = logs.value.filter(l => l.riskLevel === 'high' || l.priority === 'CRITICAL' || l.priority === 'P0').length;
      }
      if (summaryCounts.record === 0 && logs.value.length > 0) {
        summaryCounts.record = logs.value.filter(l => l.warningType === 'ban' || l.status === 'banned' || l.status === 'unbanned').length;
      }

      summaryCounts.banned = data.counts.banned ?? summaryCounts.record;
      summaryCounts.today = data.counts.today ?? Math.max(1, summaryCounts.record);
      summaryCounts.pending = data.counts.pending ?? summaryCounts.audit;
      summaryCounts.highRisk = data.counts.highRisk ?? summaryCounts.threat;
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
      summaryCounts.threat = logs.value.filter(l => l.riskLevel === 'high' || l.priority === 'CRITICAL' || l.priority === 'P0').length;
      summaryCounts.audit = logs.value.filter(l => l.warningType === 'audit').length;
      summaryCounts.appeal = logs.value.filter(l => l.warningType === 'appeal').length;
      summaryCounts.record = logs.value.filter(l => l.warningType === 'ban' || l.status === 'banned' || l.status === 'unbanned').length;
      summaryCounts.banned = summaryCounts.record;
      summaryCounts.today = Math.max(1, summaryCounts.record);
      summaryCounts.pending = summaryCounts.audit;
      summaryCounts.highRisk = summaryCounts.threat;
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
  handleResize();
  window.addEventListener('resize', handleResize);
  if (emailStore.searchKeyword) {
    localKeyword.value = emailStore.searchKeyword.trim();
    params.keyword = localKeyword.value;
  }
  window.addEventListener('manage-audit-search', handleGlobalTopSearch);
  fetchAuditList();
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
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

/* 1. 顶部汇报 4 板块：精益美化与专属安全色彩体系 */
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
  position: relative;
  overflow: hidden;
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  display: flex;
  align-items: flex-start;
  gap: 14px;
  cursor: pointer;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;

  /* 顶部微发光指示条 */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--kpi-theme-color, var(--el-color-primary));
    opacity: 0;
    transform: scaleX(0.7);
    transition: opacity 0.22s ease, transform 0.22s ease;
  }

  &:hover {
    border-color: var(--el-border-color);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px -6px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04);
  }

  &.kpi-card-active {
    border-color: var(--kpi-theme-color) !important;
    background: var(--kpi-theme-bg) !important;
    box-shadow: 0 6px 20px -4px var(--kpi-theme-glow) !important;
    transform: translateY(-2px);

    &::before {
      opacity: 1;
      transform: scaleX(1);
    }

    .kpi-title {
      color: var(--kpi-theme-color) !important;
      font-weight: 600;
    }
  }

  /* 专属 4 大分类视觉主题 (威胁 / 待审计 / 申诉 / 操作记录) */
  &.kpi-threat {
    --kpi-theme-color: #ef4444;
    --kpi-theme-bg: rgba(239, 68, 68, 0.04);
    --kpi-theme-glow: rgba(239, 68, 68, 0.16);

    .kpi-icon-wrap {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }
  }

  &.kpi-audit {
    --kpi-theme-color: #f59e0b;
    --kpi-theme-bg: rgba(245, 158, 11, 0.04);
    --kpi-theme-glow: rgba(245, 158, 11, 0.16);

    .kpi-icon-wrap {
      background: rgba(245, 158, 11, 0.1);
      color: #f59e0b;
    }
  }

  &.kpi-appeal {
    --kpi-theme-color: #6366f1;
    --kpi-theme-bg: rgba(99, 102, 241, 0.04);
    --kpi-theme-glow: rgba(99, 102, 241, 0.16);

    .kpi-icon-wrap {
      background: rgba(99, 102, 241, 0.1);
      color: #6366f1;
    }
  }

  &.kpi-record {
    --kpi-theme-color: #10b981;
    --kpi-theme-bg: rgba(16, 185, 129, 0.04);
    --kpi-theme-glow: rgba(16, 185, 129, 0.16);

    .kpi-icon-wrap {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
    }
  }
}

.kpi-icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.kpi-card:hover .kpi-icon-wrap {
  transform: scale(1.05);
}

.kpi-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.kpi-header {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.kpi-title {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--el-text-color-regular);
  line-height: 1.3;
  transition: color 0.18s ease;
}

.kpi-data-stat {
  margin-bottom: 4px;
  line-height: 1.1;

  .stat-number {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.5px;
    color: var(--el-text-color-primary);

    &.stat-danger { color: #ef4444; }
    &.stat-warning { color: #f59e0b; }
    &.stat-primary { color: #6366f1; }
    &.stat-success { color: #10b981; }
  }
}

.kpi-desc {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.1px;
}

/* 2. 工作台单一外框 (杜绝嵌套二层脱节方框，直接让表格承载) */
.audit-workbench-container {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-bg-color);
  overflow: hidden;
}

/* 顶部操作栏：学习用户列表标准操作栏风格 (纯图标排布，支持多选批量) */
.header-actions {
  padding: 9px 15px;
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
  align-items: center;
  box-shadow: var(--header-actions-border);
  font-size: 18px;
  background: var(--el-bg-color);

  .icon {
    cursor: pointer;
    color: var(--el-text-color-regular);
    transition: color 0.15s, transform 0.15s;

    &:hover {
      color: var(--el-color-primary);
      transform: translateY(-1px);
    }
  }

  .batch-actions-wrap {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-left: 8px;
    padding-left: 14px;
    border-left: 1px solid var(--el-border-color-lighter);

    .batch-selected-count {
      font-size: 13px;
      font-weight: 500;
      color: var(--el-color-primary);
    }
  }
}

.col-filter-header {
  display: inline-flex;
  align-items: center;
  gap: 5px;

  .header-action-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 3px;
    cursor: pointer;
    color: var(--el-text-color-placeholder);
    transition: all 0.2s;

    &:hover {
      color: var(--el-color-primary);
      background: var(--el-fill-color-light);
    }

    &.sort-active {
      color: var(--el-color-primary);
      font-weight: bold;
    }
  }

  .filter-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--el-text-color-placeholder);
    transition: all 0.2s;

    &:hover {
      color: var(--el-color-primary);
      background: var(--el-fill-color-light);
    }

    &.filter-active {
      color: #fff;
      background: var(--el-color-primary);
    }
  }
}

.ticket-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  .ticket-id {
    font-weight: 600;
    font-size: 13px;
    color: var(--el-color-primary);
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }
}

.plain-reason-text {
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
}

.hybrid-reason-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.tag-compact {
  font-size: 11px;
  height: 20px;
  line-height: 18px;
  padding: 0 5px;
}

.plain-dash-text {
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}

.network-cell {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  white-space: nowrap;
  line-height: 1.3;

  .network-ip {
    color: var(--el-text-color-primary);
    font-weight: 500;
  }

  .network-geo {
    color: var(--el-text-color-secondary);
    font-size: 11px;
    opacity: 0.85;
  }
}

.device-cell {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;

  .device-icon {
    flex-shrink: 0;
    color: var(--el-text-color-placeholder);
  }

  .device-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  gap: 6px;
  min-width: 0;
}

.clickable-email {
  font-weight: 600;
  font-size: 12.5px;
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition: color 0.15s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
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

.status-clean-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  line-height: 1.2;

  .status-icon-inline {
    flex-shrink: 0;
  }

  &.status-banned {
    color: var(--el-color-danger);
  }
  &.status-pending {
    color: var(--el-color-warning);
  }
  &.status-unbanned,
  &.status-resolved {
    color: var(--el-color-success);
  }
  &.status-watching {
    color: var(--el-color-primary);
  }
}

.suggestion-tag-cell {
  display: flex;
  align-items: center;
}

.suggestion-tag {
  font-size: 11.5px;
  font-weight: 500;
  height: 22px;
  line-height: 20px;
  padding: 0 6px;
  border-radius: 4px;
}

.operator-name-link {
  font-size: 12.5px;
  color: var(--el-color-primary);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
  max-width: 95px;
  transition: color 0.15s;

  &:hover {
    color: var(--el-color-primary-light-3);
    text-decoration: underline;
  }
}

/* 【操作列重构】统一右对齐紧凑间距，各按钮尺寸人体工学对齐，彻底消除 margin-left 冗余与截断 */
.table-actions-group {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  white-space: nowrap;
  flex-shrink: 0;

  :deep(.el-button),
  .el-button {
    margin: 0 !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
  }

  :deep(.el-button + .el-button),
  .el-button + .el-button {
    margin-left: 0 !important;
  }

  .action-btn-compact {
    padding: 0 6px;
    font-size: 12px;
    height: 26px;
    border-radius: 4px;
    white-space: nowrap;
    flex-shrink: 0;
    margin: 0 !important;
  }

  .action-icon-compact {
    width: 26px;
    height: 26px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-color: var(--el-border-color-lighter);
    color: var(--el-text-color-regular);
    margin: 0 !important;
    &:hover {
      color: var(--el-color-primary);
      border-color: var(--el-color-primary-light-7);
      background: var(--el-color-primary-light-9);
    }
  }

  .action-detail-btn {
    font-size: 12px;
    font-weight: 500;
    padding: 0 4px;
    height: 26px;
    white-space: nowrap;
    flex-shrink: 0;
    color: var(--el-color-primary);
    margin: 0 !important;

    &:hover {
      color: var(--el-color-primary-light-3);
    }
  }
}

:deep(.el-table) {
  td.el-table__cell.is-right .cell,
  th.el-table__cell.is-right .cell {
    padding-left: 4px !important;
    padding-right: 8px !important;
    overflow: visible !important;
  }
}

:deep(.el-table__row) {
  td.el-table__cell {
    padding: 12px 0 !important;

    &.is-right .cell {
      padding-left: 4px !important;
      padding-right: 8px !important;
      display: flex;
      justify-content: flex-end;
      align-items: center;
      overflow: visible !important;
    }
  }
}

html.dark {
  .kpi-card {
    &.kpi-threat {
      --kpi-theme-bg: rgba(239, 68, 68, 0.12);
      --kpi-theme-glow: rgba(239, 68, 68, 0.28);
    }
    &.kpi-audit {
      --kpi-theme-bg: rgba(245, 158, 11, 0.12);
      --kpi-theme-glow: rgba(245, 158, 11, 0.28);
    }
    &.kpi-appeal {
      --kpi-theme-bg: rgba(99, 102, 241, 0.14);
      --kpi-theme-glow: rgba(99, 102, 241, 0.28);
    }
    &.kpi-record {
      --kpi-theme-bg: rgba(16, 185, 129, 0.12);
      --kpi-theme-glow: rgba(16, 185, 129, 0.28);
    }
  }
}

html.dark {
  .compare-card.compare-card-actual {
    border-color: rgba(245, 108, 108, 0.35);
  }
  .compare-card.compare-card-baseline {
    border-color: rgba(103, 194, 58, 0.35);
  }
  .compare-card-header.actual-header {
    background: rgba(245, 108, 108, 0.15);
    color: #f89898;
  }
  .compare-card-header.baseline-header {
    background: rgba(103, 194, 58, 0.15);
    color: #95d475;
  }
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

/* 【表格列宽与截断修复】高风险标签紧凑无截断：padding 减小、字号 11px、不换行不截断 */
.audit-sub-tag {
  font-size: 11px;
  height: 20px;
  line-height: 18px;
  padding: 0 6px;
  white-space: nowrap;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
  margin-top: 15px;
  margin-bottom: 20px;
  padding-right: 30px;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: end;
  gap: 10px;
  @media (max-width: 767px) {
    padding-right: 10px;
  }

  .el-pagination {
    align-self: end;
  }
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

/* 【证据对比布局】多维风险画像两列对比卡片样式 */
.evidence-compare-card-wrapper {
  .section-title {
    margin-bottom: 8px;
  }
}

.compare-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  @media (max-width: 580px) {
    grid-template-columns: 1fr;
  }
}

.compare-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-blank);
  overflow: hidden;
  display: flex;
  flex-direction: column;

  &.compare-card-actual {
    border-color: rgba(245, 108, 108, 0.3);
  }

  &.compare-card-baseline {
    border-color: rgba(103, 194, 58, 0.3);
  }
}

.compare-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--el-border-color-lighter);

  .card-header-icon {
    flex-shrink: 0;
  }

  .card-header-title {
    font-size: 12px;
    font-weight: 600;
  }

  &.actual-header {
    background: var(--el-color-danger-light-9);
    color: var(--el-color-danger);
  }

  &.baseline-header {
    background: var(--el-color-success-light-9);
    color: var(--el-color-success);
  }
}

.compare-card-body {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.compare-section-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  padding: 4px 0 2px 0;
  margin-top: 4px;
  border-bottom: 1px dashed var(--el-border-color-lighter);

  &:first-child {
    margin-top: 0;
  }
}

.compare-item-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
  line-height: 1.45;

  .compare-k {
    color: var(--el-text-color-secondary);
    flex-shrink: 0;
  }

  .compare-v {
    color: var(--el-text-color-primary);
    text-align: right;
    word-break: break-all;

    &.text-muted {
      color: var(--el-text-color-secondary);
    }
  }

  .anomaly-tag {
    margin-left: 2px;
    font-size: 10.5px;
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

.operator-account-dialog {
  .operator-dialog-body {
    padding: 10px 0;
  }
  .operator-profile-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 8px;
    background: var(--el-fill-color-lighter);
    margin-bottom: 16px;
  }
  .operator-dialog-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--el-color-primary-light-8);
    color: var(--el-color-primary);
    font-weight: 600;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .operator-dialog-title {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .operator-dialog-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
  .operator-dialog-role-badge {
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }
  .operator-info-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0 4px;
  }
  .operator-info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
    border-bottom: 1px dashed var(--el-border-color-lighter);
    padding-bottom: 8px;

    .info-label {
      color: var(--el-text-color-secondary);
    }
    .info-val {
      color: var(--el-text-color-primary);
      font-weight: 500;
    }
  }
}
</style>
