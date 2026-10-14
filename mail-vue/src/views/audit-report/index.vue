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
                <span class="stat-number stat-danger">
                  {{ $t('abuseKpiStatFormat', { pending: summaryCounts.threatPending ?? summaryCounts.pending ?? 0, banned: summaryCounts.threatBanned ?? summaryCounts.highRisk ?? 0 }) }}
                </span>
              </div>
              <div class="kpi-desc kpi-sub" :title="$t('abuseKpiSubtitle')">
                {{ $t('abuseKpiSubtitle') }}
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
          <!-- 熔断状态条: Global Circuit Breaker 处于 TRIPPED 或 QUEUE_PAUSE 时在板块顶部呈现 -->
          <div v-if="circuitBreakerTripped && currentSection === 'threat'" class="abuse-circuit-banner">
            <Icon icon="fluent:warning-20-filled" width="18" height="18" class="circuit-banner-icon" />
            <span class="circuit-banner-text">{{ $t('abuseCircuitBannerText') }}</span>
          </div>

          <!-- 今日自动折叠批次条 -->
          <div
            v-if="currentSection === 'threat' && autoPurgedCount > 0"
            class="abuse-auto-purged-banner"
            @click="showAutoPurgedDialog = true"
          >
            <Icon icon="fluent:layer-diagonal-sparkle-16-regular" width="16" height="16" class="purged-icon" />
            <span class="purged-text">{{ $t('abuseAutoPurgedCount', { count: autoPurgedCount }) }}</span>
            <Icon icon="fluent:chevron-right-12-regular" width="12" height="12" class="purged-arrow" />
          </div>

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

                <!-- 滥用威胁专属批量操作: 只允许「分配负责人」「开始复核」「解除」，不得提供批量永久处罚 -->
                <template v-if="currentSection === 'threat'">
                  <el-button size="small" type="primary" plain @click="handleBatchAssign">
                    <Icon icon="fluent:person-arrow-right-16-regular" width="14" height="14" style="margin-right: 3px;" />
                    {{ $t('abuseBatchAssign') }}
                  </el-button>
                  <el-button size="small" type="warning" plain @click="handleBatchReview">
                    <Icon icon="fluent:clipboard-checkmark-16-regular" width="14" height="14" style="margin-right: 3px;" />
                    {{ $t('abuseBatchReview') }}
                  </el-button>
                  <el-button size="small" type="success" plain @click="handleBatchUnban">
                    <Icon icon="fluent:lock-open-16-regular" width="14" height="14" style="margin-right: 3px;" />
                    {{ $t('abuseBatchUnban') }}
                  </el-button>
                </template>

                <!-- 其他板块通用批量操作 -->
                <template v-else>
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
                </template>
              </div>
            </transition>
          </div>

          <!-- 3. 核心数据表格 (单一容器铺满) -->
          <div class="table-area">
            <div class="loading" :class="tableLoading ? 'loading-show' : 'loading-hide'" :style="first ? 'background: transparent' : ''">
              <loading />
            </div>

            <!-- 当 currentSection === 'threat' 时展示专门的 7 列滥用威胁工作台 (使用原生 table + colgroup 锁定列宽，杜绝横向撑开与截断) -->
            <div v-if="currentSection === 'threat'" class="abuse-table-wrapper">
              <table class="abuse-table">
                <colgroup>
                  <col style="width: 40px;" />
                  <col style="width: 72px;" />
                  <col style="width: clamp(180px, 22%, 260px);" />
                  <col style="width: 96px;" />
                  <col style="min-width: 190px;" />
                  <col style="width: 120px;" />
                  <col style="width: 64px;" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="col-select" style="width: 40px; text-align: center;">
                      <el-checkbox
                        :model-value="isAllAbuseSelected"
                        :indeterminate="selectedRows.length > 0 && !isAllAbuseSelected"
                        @change="toggleAbuseSelectAll"
                      />
                    </th>
                    <th class="col-no" style="width: 72px;">
                      <span>{{ $t('abuseColNo') }}</span>
                    </th>
                    <th class="col-target" style="width: clamp(180px, 22%, 260px);">
                      <span>{{ $t('abuseColTarget') }}</span>
                    </th>
                    <th class="col-status" style="width: 96px;">
                      <div class="col-filter-header">
                        <span>{{ $t('abuseColStatus') }}</span>
                        <el-dropdown trigger="click" @command="handleStatusFilterCommand">
                          <span class="filter-trigger" :class="{ 'filter-active': params.status !== 'all' }" :title="$t('filter')">
                            <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                          </span>
                          <template #dropdown>
                            <el-dropdown-menu>
                              <el-dropdown-item command="all" :class="{ 'is-selected': params.status === 'all' }">
                                {{ $t('auditAllStatus') }}
                              </el-dropdown-item>
                              <el-dropdown-item command="pending" :class="{ 'is-selected': params.status === 'pending' }">
                                {{ $t('abuseStatusPending') }}
                              </el-dropdown-item>
                              <el-dropdown-item command="banned" :class="{ 'is-selected': params.status === 'banned' }">
                                {{ $t('abuseStatusBanned') }}
                              </el-dropdown-item>
                              <el-dropdown-item command="unbanned" :class="{ 'is-selected': params.status === 'unbanned' }">
                                {{ $t('abuseStatusUnbanned') }}
                              </el-dropdown-item>
                            </el-dropdown-menu>
                          </template>
                        </el-dropdown>
                      </div>
                    </th>
                    <th class="col-cat" style="min-width: 190px;">
                      <div class="col-filter-header">
                        <span>{{ $t('abuseColCategory') }}</span>
                        <el-dropdown trigger="click" @command="handleCategoryFilterCommand">
                          <span class="filter-trigger" :class="{ 'filter-active': params.category !== 'all' }" :title="$t('filter')">
                            <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                          </span>
                          <template #dropdown>
                            <el-dropdown-menu>
                              <el-dropdown-item command="all" :class="{ 'is-selected': params.category === 'all' }">
                                {{ $t('abuseAllCategory') }}
                              </el-dropdown-item>
                              <el-dropdown-item command="protocol" :class="{ 'is-selected': params.category === 'protocol' }">
                                {{ $t('abuseCatProtocol') }}
                              </el-dropdown-item>
                              <el-dropdown-item command="multi_account" :class="{ 'is-selected': params.category === 'multi_account' }">
                                {{ $t('abuseCatMultiAccount') }}
                              </el-dropdown-item>
                              <el-dropdown-item command="account_takeover" :class="{ 'is-selected': params.category === 'account_takeover' }">
                                {{ $t('abuseCatAccountTakeover') }}
                              </el-dropdown-item>
                              <el-dropdown-item command="outbound" :class="{ 'is-selected': params.category === 'outbound' }">
                                {{ $t('abuseCatOutbound') }}
                              </el-dropdown-item>
                              <el-dropdown-item command="quota" :class="{ 'is-selected': params.category === 'quota' }">
                                {{ $t('abuseCatQuota') }}
                              </el-dropdown-item>
                            </el-dropdown-menu>
                          </template>
                        </el-dropdown>
                      </div>
                    </th>
                    <th class="col-action" style="width: 120px;">
                      <div class="col-filter-header">
                        <span>{{ $t('abuseColAction') }}</span>
                        <el-dropdown trigger="click" @command="handleAssigneeFilterCommand">
                          <span class="filter-trigger" :class="{ 'filter-active': params.assignee !== 'all' }" :title="$t('filter')">
                            <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                          </span>
                          <template #dropdown>
                            <el-dropdown-menu>
                              <el-dropdown-item command="all" :class="{ 'is-selected': params.assignee === 'all' }">
                                {{ $t('auditAllAssignees') }}
                              </el-dropdown-item>
                              <el-dropdown-item command="secadmin" :class="{ 'is-selected': params.assignee === 'secadmin' }">
                                {{ $t('auditAssigneeAdmin') }}
                              </el-dropdown-item>
                              <el-dropdown-item command="system" :class="{ 'is-selected': params.assignee === 'system' }">
                                {{ $t('auditAssigneeSystem') }}
                              </el-dropdown-item>
                              <el-dropdown-item command="master" :class="{ 'is-selected': params.assignee === 'master' }">
                                {{ $t('auditAssigneeMaster') }}
                              </el-dropdown-item>
                            </el-dropdown-menu>
                          </template>
                        </el-dropdown>
                      </div>
                    </th>
                    <th class="col-opt" style="width: 64px; text-align: right;">
                      <span>{{ $t('abuseColOpt') }}</span>
                    </th>
                  </tr>
                </thead>
                <tbody v-if="logs.length > 0">
                  <template v-for="row in logs" :key="row.id">
                    <tr
                      class="abuse-table-row"
                      :class="{ 'row-selected': isAbuseSelected(row) }"
                    >
                      <!-- 1. 选择 -->
                      <td class="col-select" :data-label="$t('abuseColSelect')" style="text-align: center;">
                        <el-checkbox
                          :model-value="isAbuseSelected(row)"
                          @change="() => toggleAbuseRowSelection(row)"
                        />
                      </td>
                      <!-- 2. 编号 -->
                      <td class="col-no" :data-label="$t('abuseColNo')">
                        <span class="ticket-id font-mono font-medium clickable-ticket" @click="openAuditDrawer(row)">
                          {{ formatAbuseTicketNo(row) }}
                        </span>
                      </td>
                      <!-- 3. 对象 -->
                      <td class="col-target" :data-label="$t('abuseColTarget')">
                        <div class="target-container">
                          <!-- 邮箱第一行 -->
                          <div class="target-email-row" :class="getMailLengthClass(row.email)">
                            <!-- 类型图标 (固定 16px) -->
                            <span class="target-type-icon-wrap" :title="isClearedAccount(row) ? $t('abuseClearedAccount') : (isClusterRow(row) ? $t('abuseCatMultiAccount') : '')">
                              <Icon v-if="isClearedAccount(row)" icon="fluent:delete-dismiss-16-regular" width="16" height="16" class="type-icon icon-cleared" />
                              <Icon v-else-if="isClusterRow(row)" icon="fluent:people-community-16-regular" width="16" height="16" class="type-icon icon-cluster" />
                              <Icon v-else icon="fluent:person-16-regular" width="16" height="16" class="type-icon icon-single" />
                            </span>

                            <!-- 已清除账号 -->
                            <template v-if="isClearedAccount(row)">
                              <span class="cleared-label">{{ $t('abuseClearedAccount') }}</span>
                            </template>

                            <!-- 普通 / 集群账号 -->
                            <template v-else>
                              <!-- 集群工单展开折叠徽标 -->
                              <span
                                v-if="isClusterRow(row)"
                                class="cluster-badge"
                                @click.stop="toggleClusterExpand(row)"
                                :title="$t('abuseCatMultiAccount')"
                              >
                                {{ $t('abuseClusterAccountCount', { count: getClusterCount(row) }) }}
                                <Icon :icon="isClusterExpanded(row) ? 'fluent:chevron-up-12-regular' : 'fluent:chevron-down-12-regular'" width="12" height="12" />
                              </span>

                              <!-- 邮箱文本 (带零宽空格) -->
                              <span class="target-email font-mono">
                                <span class="mail-local">{{ formatMailLocal(row.email) }}</span>
                                <span class="mail-at">@&#8203;</span>
                                <span class="mail-domain">{{ formatMailDomain(row.email) }}</span>
                              </span>

                              <!-- >160 字符长地址徽标 -->
                              <span v-if="row.email && row.email.length > 160" class="long-addr-tag">
                                {{ $t('abuseLongAddressTag') }}
                              </span>

                              <!-- 悬停复制图标 -->
                              <span class="copy-actions">
                                <span class="copy-icon-btn" :title="$t('abuseCopyEmail')" @click.stop="copyEmailUnicode(row.email)">
                                  <Icon icon="fluent:copy-16-regular" width="13" height="13" />
                                </span>
                                <span
                                  v-if="hasIdnDomain(row.email)"
                                  class="copy-icon-btn puny-btn"
                                  :title="$t('abuseCopyPunycode')"
                                  @click.stop="copyEmailPunycode(row.email)"
                                >
                                  <Icon icon="fluent:globe-16-regular" width="13" height="13" />
                                </span>
                              </span>
                            </template>
                          </div>

                          <!-- usr_ID 底部行 -->
                          <div class="target-userid-row">
                            <span class="target-userid font-mono">{{ formatUserId(row) }}</span>
                            <span class="copy-actions">
                              <span class="copy-icon-btn" :title="$t('abuseCopyUserId')" @click.stop="copyTextRaw(formatUserId(row), $t('abuseCopiedSuccess'))">
                                <Icon icon="fluent:copy-16-regular" width="12" height="12" />
                              </span>
                            </span>
                          </div>
                        </div>
                      </td>
                      <!-- 4. 状态 -->
                      <td class="col-status" :data-label="$t('abuseColStatus')">
                        <div class="status-cell">
                          <div class="status-badge" :class="getAbuseStatusInfo(row).cls">
                            {{ getAbuseStatusInfo(row).main }}
                          </div>
                          <div v-if="getAbuseStatusInfo(row).sub" class="status-sub-badge badge-tripped">
                            {{ getAbuseStatusInfo(row).sub }}
                          </div>
                        </div>
                      </td>
                      <!-- 5. 分类 -->
                      <td class="col-cat" :data-label="$t('abuseColCategory')">
                        <div class="cat-cell">
                          <span class="cat-title">{{ getAbuseCategoryName(row) }}</span>
                          <span class="cat-summary">{{ row.evidenceSummary || row.actionText }}</span>
                        </div>
                      </td>
                      <!-- 6. 处理 -->
                      <td class="col-action" :data-label="$t('abuseColAction')">
                        <div class="action-cell">
                          <span class="action-top">{{ getAbuseActionLabel(row) }}</span>
                          <span class="action-sub">{{ formatAbuseActionSub(row) }}</span>
                        </div>
                      </td>
                      <!-- 7. 操作 -->
                      <td class="col-opt" :data-label="$t('abuseColOpt')">
                        <div class="opt-cell">
                          <el-button size="small" type="primary" link @click="openAuditDrawer(row)" class="opt-btn-details">
                            {{ $t('auditBtnViewDetails') }}
                          </el-button>
                          <el-dropdown trigger="click" @command="(cmd) => handleRowMoreCommand(cmd, row)">
                            <span class="opt-more-btn" :title="$t('more')">
                              <Icon icon="fluent:more-horizontal-16-regular" width="14" height="14" />
                            </span>
                            <template #dropdown>
                              <el-dropdown-menu>
                                <el-dropdown-item command="review">{{ $t('abuseBatchReview') }}</el-dropdown-item>
                                <el-dropdown-item command="assign">{{ $t('abuseBatchAssign') }}</el-dropdown-item>
                                <el-dropdown-item command="unban" :disabled="row.status === 'unbanned'">{{ $t('abuseBatchUnban') }}</el-dropdown-item>
                              </el-dropdown-menu>
                            </template>
                          </el-dropdown>
                        </div>
                      </td>
                    </tr>

                    <!-- 集群子账号展开行 -->
                    <template v-if="isClusterRow(row) && isClusterExpanded(row)">
                      <tr
                        v-for="sub in row.clusterAccounts"
                        :key="sub.id || sub.email"
                        class="abuse-cluster-child-row"
                      >
                        <td class="col-select" :data-label="$t('abuseColSelect')" style="text-align: center;">
                          <el-checkbox
                            :model-value="isChildSelected(row, sub)"
                            @change="() => toggleChildSelection(row, sub)"
                          />
                        </td>
                        <td class="col-no" :data-label="$t('abuseColNo')">
                          <span class="child-sub-no font-mono">{{ formatAbuseTicketNo(row) }}-{{ sub.id || 1 }}</span>
                        </td>
                        <td class="col-target" :data-label="$t('abuseColTarget')">
                          <div class="target-container child-target">
                            <div class="target-email-row" :class="getMailLengthClass(sub.email)">
                              <span class="target-type-icon-wrap">
                                <Icon icon="fluent:arrow-enter-down-16-regular" width="14" height="14" class="type-icon icon-child" />
                              </span>
                              <span class="target-email font-mono">
                                <span class="mail-local">{{ formatMailLocal(sub.email) }}</span>
                                <span class="mail-at">@&#8203;</span>
                                <span class="mail-domain">{{ formatMailDomain(sub.email) }}</span>
                              </span>
                              <span v-if="sub.email && sub.email.length > 160" class="long-addr-tag">
                                {{ $t('abuseLongAddressTag') }}
                              </span>
                              <span class="copy-actions">
                                <span class="copy-icon-btn" :title="$t('abuseCopyEmail')" @click.stop="copyEmailUnicode(sub.email)">
                                  <Icon icon="fluent:copy-16-regular" width="13" height="13" />
                                </span>
                                <span
                                  v-if="hasIdnDomain(sub.email)"
                                  class="copy-icon-btn puny-btn"
                                  :title="$t('abuseCopyPunycode')"
                                  @click.stop="copyEmailPunycode(sub.email)"
                                >
                                  <Icon icon="fluent:globe-16-regular" width="13" height="13" />
                                </span>
                              </span>
                            </div>
                            <div class="target-userid-row">
                              <span class="target-userid font-mono">{{ formatUserId(sub) }}</span>
                              <span class="copy-actions">
                                <span class="copy-icon-btn" :title="$t('abuseCopyUserId')" @click.stop="copyTextRaw(formatUserId(sub), $t('abuseCopiedSuccess'))">
                                  <Icon icon="fluent:copy-16-regular" width="12" height="12" />
                                </span>
                              </span>
                            </div>
                          </div>
                        </td>
                        <td class="col-status" :data-label="$t('abuseColStatus')">
                          <div class="status-cell">
                            <div class="status-badge" :class="getAbuseStatusInfo(sub.status ? sub : row).cls">
                              {{ getAbuseStatusInfo(sub.status ? sub : row).main }}
                            </div>
                            <div v-if="getAbuseStatusInfo(sub.status ? sub : row).sub" class="status-sub-badge badge-tripped">
                              {{ getAbuseStatusInfo(sub.status ? sub : row).sub }}
                            </div>
                          </div>
                        </td>
                        <td class="col-cat" :data-label="$t('abuseColCategory')">
                          <div class="cat-cell">
                            <span class="cat-title">{{ getAbuseCategoryName(row) }}</span>
                            <span class="cat-summary">{{ sub.evidenceSummary || row.evidenceSummary || '集群关联' }}</span>
                          </div>
                        </td>
                        <td class="col-action" :data-label="$t('abuseColAction')">
                          <div class="action-cell">
                            <span class="action-top">{{ getAbuseActionLabel(sub.status ? sub : row) }}</span>
                            <span class="action-sub">{{ formatAbuseActionSub(sub.status ? sub : row) }}</span>
                          </div>
                        </td>
                        <td class="col-opt" :data-label="$t('abuseColOpt')">
                          <div class="opt-cell">
                            <el-button size="small" type="primary" link @click="openAuditDrawer(sub)" class="opt-btn-details">
                              {{ $t('auditBtnViewDetails') }}
                            </el-button>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </template>
                </tbody>
                <tbody v-else>
                  <tr>
                    <td colspan="7" class="abuse-empty-cell">
                      {{ first ? '' : $t('auditEmptyLogs') }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 板块 2、3、4: 申诉审计 / 风险管理 / 操作记录 (保持 el-table 结构不变) -->
            <el-table
              v-else
              :data="logs"
              style="width: 100%;"
              ref="tableRef"
              :empty-text="first ? '' : $t('auditEmptyLogs')"
              @selection-change="handleSelectionChange"
            >
              <!-- 0. 多选列 -->
              <el-table-column type="selection" width="40" align="center" key="col-selection" />


              <!-- ========================================================= -->
              <!-- 板块 2: 申诉审计 (appeal) -->
              <!-- 变更: "报警原因"删除；在"处理时间"后面添加"过期时间" -->
              <!-- ========================================================= -->
              <!-- 列 1: 工单编号 -->
              <el-table-column :label="$t('auditColTicketNo')" v-if="currentSection === 'appeal'" width="85" align="center" key="appeal-col-ticket">
                <template #default="{ row }">
                  <div class="ticket-cell">
                    <span class="ticket-id font-mono font-medium clickable-ticket" @click="openAuditDrawer(row)">
                      {{ formatTicketNo(row) }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 2: 身分组 -->
              <el-table-column v-if="currentSection === 'appeal'" width="115" align="center" key="appeal-col-identity">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColIdentityGroup') }}</span>
                    <el-dropdown trigger="click" @command="handleIdentityFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.identityGroup !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.identityGroup === 'all' }">
                            {{ $t('auditAllIdentities') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="master" :class="{ 'is-selected': params.identityGroup === 'master' }">
                            {{ $t('auditIdentityMaster') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="admin" :class="{ 'is-selected': params.identityGroup === 'admin' }">
                            {{ $t('auditIdentityAdmin') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="member" :class="{ 'is-selected': params.identityGroup === 'member' }">
                            {{ $t('auditIdentityMember') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="user" :class="{ 'is-selected': params.identityGroup === 'user' }">
                            {{ $t('auditIdentityUser') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="guest" :class="{ 'is-selected': params.identityGroup === 'guest' }">
                            {{ $t('auditIdentityGuest') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="identity-cell">
                    <span class="plain-identity-text" :title="getIdentityMeta(row).impactDesc">
                      {{ getIdentityMeta(row).label }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 3: 违规分类 -->
              <el-table-column v-if="currentSection === 'appeal'" width="115" align="center" key="appeal-col-category">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColViolationCategory') }}</span>
                    <el-dropdown trigger="click" @command="handleCategoryFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.category !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.category === 'all' }">
                            {{ $t('auditAllViolationCategories') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="quota" :class="{ 'is-selected': params.category === 'quota' }">
                            {{ $t('auditCatQuota') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="outbound" :class="{ 'is-selected': params.category === 'outbound' }">
                            {{ $t('auditCatOutbound') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="content" :class="{ 'is-selected': params.category === 'content' }">
                            {{ $t('auditCatContent') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="account" :class="{ 'is-selected': params.category === 'account' }">
                            {{ $t('auditCatAccount') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="routine" :class="{ 'is-selected': params.category === 'routine' }">
                            {{ $t('auditCatRoutine') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="appeal" :class="{ 'is-selected': params.category === 'appeal' }">
                            {{ $t('auditCatAppeal') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="category-cell">
                    <span class="plain-category-text">{{ getViolationCategory(row).text }}</span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 4: 报警次数 (说明: 申诉审计中已删除"报警原因"，直接展示"报警次数") -->
              <el-table-column v-if="currentSection === 'appeal'" width="105" align="center" key="appeal-col-alarm-count">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColAlarmCount') }}</span>
                    <el-dropdown trigger="click" @command="handleAlarmCountFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.alarmCountRange !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.alarmCountRange === 'all' }">
                            {{ $t('auditAllAlarmCounts') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="1" :class="{ 'is-selected': params.alarmCountRange === '1' }">
                            {{ $t('auditAlarmCount1') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="2-3" :class="{ 'is-selected': params.alarmCountRange === '2-3' }">
                            {{ $t('auditAlarmCount2to3') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="4+" :class="{ 'is-selected': params.alarmCountRange === '4+' }">
                            {{ $t('auditAlarmCount4Plus') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="alarm-count-cell">
                    <span class="plain-alarm-count font-mono" :class="{ 'alarm-count-high': getAlarmCount(row) > 3 }">
                      {{ getAlarmCount(row) }} {{ $t('auditTimesUnit') }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 5: 当前状态 -->
              <el-table-column v-if="currentSection === 'appeal'" width="125" align="center" key="appeal-col-status">
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

              <!-- 列 6: 处理建议 -->
              <el-table-column v-if="currentSection === 'appeal'" width="115" align="center" key="appeal-col-suggestion">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColSuggestion') }}</span>
                    <el-dropdown trigger="click" @command="handleSuggestionFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.suggestion !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.suggestion === 'all' }">
                            {{ $t('auditAllSuggestions') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="ban" :class="{ 'is-selected': params.suggestion === 'ban' }">
                            {{ $t('auditSuggestionBan') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="unban" :class="{ 'is-selected': params.suggestion === 'unban' }">
                            {{ $t('auditSuggestionUnban') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="watch" :class="{ 'is-selected': params.suggestion === 'watch' }">
                            {{ $t('auditSuggestionWatch') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="keep" :class="{ 'is-selected': params.suggestion === 'keep' }">
                            {{ $t('auditSuggestionKeepBan') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="archive" :class="{ 'is-selected': params.suggestion === 'archive' }">
                            {{ $t('auditSuggestionArchiveRoutine') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="suggestion-cell">
                    <span class="plain-suggestion-text" :class="`suggestion-${getHandlingSuggestion(row).type}`">
                      {{ getHandlingSuggestion(row).text }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 7: 处理时间 -->
              <el-table-column v-if="currentSection === 'appeal'" width="135" align="center" key="appeal-col-process-time">
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

              <!-- 列 8: 过期时间 (新增列: 在处理时间后面添加，因为申诉表单是可用过期的) -->
              <el-table-column v-if="currentSection === 'appeal'" width="135" align="center" key="appeal-col-expire-time">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColExpireTime') }}</span>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="expire-cell">
                    <span class="plain-time font-mono" :class="{ 'time-expired': isAppealExpired(row) }">
                      {{ formatTableTime(getAppealExpireTime(row)) }}
                    </span>
                    <span v-if="isAppealExpired(row)" class="expire-tag-expired">({{ $t('auditExpiredBadge') }})</span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 9: 负责人 -->
              <el-table-column v-if="currentSection === 'appeal'" width="105" align="center" key="appeal-col-assignee">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColAssignee') }}</span>
                    <el-dropdown trigger="click" @command="handleAssigneeFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.assignee !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.assignee === 'all' }">
                            {{ $t('auditAllAssignees') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="secadmin" :class="{ 'is-selected': params.assignee === 'secadmin' }">
                            {{ $t('auditAssigneeAdmin') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="system" :class="{ 'is-selected': params.assignee === 'system' }">
                            {{ $t('auditAssigneeSystem') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="master" :class="{ 'is-selected': params.assignee === 'master' }">
                            {{ $t('auditAssigneeMaster') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="operator-cell">
                    <span class="operator-name-link font-medium" :title="getOperatorName(row)" @click.stop="handleViewOperator(row)">
                      {{ getOperatorName(row) }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 10: 拍案管理 -->
              <el-table-column v-if="currentSection === 'appeal'" width="105" align="center" key="appeal-col-authority">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColFinalAuthority') }}</span>
                    <el-dropdown trigger="click" @command="handleAdjudicatorFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.adjudicator !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.adjudicator === 'all' }">
                            {{ $t('auditAllAdjudicators') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="secadmin" :class="{ 'is-selected': params.adjudicator === 'secadmin' }">
                            {{ $t('auditAdjudicatorAdmin') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="system" :class="{ 'is-selected': params.adjudicator === 'system' }">
                            {{ $t('auditAdjudicatorSystem') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="master" :class="{ 'is-selected': params.adjudicator === 'master' }">
                            {{ $t('auditAdjudicatorMaster') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="operator-cell">
                    <span class="operator-name-link font-medium" :title="getAdjudicatorName(row)" @click.stop="handleViewAdjudicator(row)">
                      {{ getAdjudicatorName(row) }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 11: 操作 -->
              <el-table-column :label="$t('action')" v-if="currentSection === 'appeal'" width="80" align="center" key="appeal-col-action">
                <template #default="{ row }">
                  <div class="action-cell">
                    <el-button
                      size="small"
                      type="primary"
                      link
                      class="action-detail-btn"
                      @click="openAuditDrawer(row)"
                    >
                      {{ $t('auditBtnViewDetails') }}
                    </el-button>
                  </div>
                </template>
              </el-table-column>


              <!-- ========================================================= -->
              <!-- 板块 3: 风险管理 (audit) -->
              <!-- 变更: "违规分类"改为"违规等级"(粗略等级)；在"处理时间"后面增加"截止期限"的过期说明 -->
              <!-- ========================================================= -->
              <!-- 列 1: 工单编号 -->
              <el-table-column :label="$t('auditColTicketNo')" v-if="currentSection === 'audit'" width="85" align="center" key="audit-col-ticket">
                <template #default="{ row }">
                  <div class="ticket-cell">
                    <span class="ticket-id font-mono font-medium clickable-ticket" @click="openAuditDrawer(row)">
                      {{ formatTicketNo(row) }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 2: 身分组 -->
              <el-table-column v-if="currentSection === 'audit'" width="115" align="center" key="audit-col-identity">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColIdentityGroup') }}</span>
                    <el-dropdown trigger="click" @command="handleIdentityFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.identityGroup !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.identityGroup === 'all' }">
                            {{ $t('auditAllIdentities') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="master" :class="{ 'is-selected': params.identityGroup === 'master' }">
                            {{ $t('auditIdentityMaster') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="admin" :class="{ 'is-selected': params.identityGroup === 'admin' }">
                            {{ $t('auditIdentityAdmin') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="member" :class="{ 'is-selected': params.identityGroup === 'member' }">
                            {{ $t('auditIdentityMember') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="user" :class="{ 'is-selected': params.identityGroup === 'user' }">
                            {{ $t('auditIdentityUser') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="guest" :class="{ 'is-selected': params.identityGroup === 'guest' }">
                            {{ $t('auditIdentityGuest') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="identity-cell">
                    <span class="plain-identity-text" :title="getIdentityMeta(row).impactDesc">
                      {{ getIdentityMeta(row).label }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 3: 违规等级 (变更: "违规分类"改为"违规等级"，直接说明粗略等级) -->
              <el-table-column v-if="currentSection === 'audit'" width="125" align="center" key="audit-col-violation-level">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColViolationLevel') }}</span>
                    <el-dropdown trigger="click" @command="handleViolationLevelFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.violationLevel !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.violationLevel === 'all' }">
                            {{ $t('auditAllViolationLevels') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="lv3" :class="{ 'is-selected': params.violationLevel === 'lv3' }">
                            {{ $t('auditLevelLv3') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="lv2" :class="{ 'is-selected': params.violationLevel === 'lv2' }">
                            {{ $t('auditLevelLv2') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="lv1" :class="{ 'is-selected': params.violationLevel === 'lv1' }">
                            {{ $t('auditLevelLv1') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="lv0" :class="{ 'is-selected': params.violationLevel === 'lv0' }">
                            {{ $t('auditLevelLv0') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="level-cell">
                    <span class="plain-level-text font-mono font-medium" :class="`level-${getViolationLevel(row).type}`">
                      {{ getViolationLevel(row).text }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 4: 报警原因 -->
              <el-table-column v-if="currentSection === 'audit'" min-width="135" align="center" key="audit-col-reason">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColAlarmReason') }}</span>
                    <el-dropdown trigger="click" @command="handleReasonFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.alarmReason !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.alarmReason === 'all' }">
                            {{ $t('auditAllAlarmReasons') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="multi_account" :class="{ 'is-selected': params.alarmReason === 'multi_account' }">
                            {{ $t('auditReasonMultiAccount') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="user_reported" :class="{ 'is-selected': params.alarmReason === 'user_reported' }">
                            {{ $t('auditReasonUserReported') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="rate_limit" :class="{ 'is-selected': params.alarmReason === 'rate_limit' }">
                            {{ $t('auditReasonRateLimit') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="credential" :class="{ 'is-selected': params.alarmReason === 'credential' }">
                            {{ $t('auditReasonCredentialAnomaly') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="roaming" :class="{ 'is-selected': params.alarmReason === 'roaming' }">
                            {{ $t('auditReasonRoaming') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="reason-cell">
                    <span class="plain-reason-text" :title="row.banReason || row.actionText">
                      {{ getSimpleAlarmReason(row) }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 5: 报警次数 -->
              <el-table-column v-if="currentSection === 'audit'" width="105" align="center" key="audit-col-alarm-count">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColAlarmCount') }}</span>
                    <el-dropdown trigger="click" @command="handleAlarmCountFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.alarmCountRange !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.alarmCountRange === 'all' }">
                            {{ $t('auditAllAlarmCounts') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="1" :class="{ 'is-selected': params.alarmCountRange === '1' }">
                            {{ $t('auditAlarmCount1') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="2-3" :class="{ 'is-selected': params.alarmCountRange === '2-3' }">
                            {{ $t('auditAlarmCount2to3') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="4+" :class="{ 'is-selected': params.alarmCountRange === '4+' }">
                            {{ $t('auditAlarmCount4Plus') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="alarm-count-cell">
                    <span class="plain-alarm-count font-mono" :class="{ 'alarm-count-high': getAlarmCount(row) > 3 }">
                      {{ getAlarmCount(row) }} {{ $t('auditTimesUnit') }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 6: 当前状态 -->
              <el-table-column v-if="currentSection === 'audit'" width="125" align="center" key="audit-col-status">
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

              <!-- 列 7: 处理建议 -->
              <el-table-column v-if="currentSection === 'audit'" width="115" align="center" key="audit-col-suggestion">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColSuggestion') }}</span>
                    <el-dropdown trigger="click" @command="handleSuggestionFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.suggestion !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.suggestion === 'all' }">
                            {{ $t('auditAllSuggestions') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="ban" :class="{ 'is-selected': params.suggestion === 'ban' }">
                            {{ $t('auditSuggestionBan') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="unban" :class="{ 'is-selected': params.suggestion === 'unban' }">
                            {{ $t('auditSuggestionUnban') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="watch" :class="{ 'is-selected': params.suggestion === 'watch' }">
                            {{ $t('auditSuggestionWatch') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="keep" :class="{ 'is-selected': params.suggestion === 'keep' }">
                            {{ $t('auditSuggestionKeepBan') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="archive" :class="{ 'is-selected': params.suggestion === 'archive' }">
                            {{ $t('auditSuggestionArchiveRoutine') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="suggestion-cell">
                    <span class="plain-suggestion-text" :class="`suggestion-${getHandlingSuggestion(row).type}`">
                      {{ getHandlingSuggestion(row).text }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 8: 处理时间 -->
              <el-table-column v-if="currentSection === 'audit'" width="135" align="center" key="audit-col-process-time">
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

              <!-- 列 9: 截止期限 (变更: 在处理时间后面增加截止期限的过期说明) -->
              <el-table-column v-if="currentSection === 'audit'" width="145" align="center" key="audit-col-deadline">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColDeadline') }}</span>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="deadline-cell">
                    <div class="plain-time font-mono">{{ getRiskDeadlineInfo(row).time }}</div>
                    <div class="plain-deadline-desc" :class="getRiskDeadlineInfo(row).isExpired ? 'desc-expired' : 'desc-active'">
                      {{ getRiskDeadlineInfo(row).desc }}
                    </div>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 10: 负责人 -->
              <el-table-column v-if="currentSection === 'audit'" width="105" align="center" key="audit-col-assignee">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColAssignee') }}</span>
                    <el-dropdown trigger="click" @command="handleAssigneeFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.assignee !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.assignee === 'all' }">
                            {{ $t('auditAllAssignees') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="secadmin" :class="{ 'is-selected': params.assignee === 'secadmin' }">
                            {{ $t('auditAssigneeAdmin') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="system" :class="{ 'is-selected': params.assignee === 'system' }">
                            {{ $t('auditAssigneeSystem') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="master" :class="{ 'is-selected': params.assignee === 'master' }">
                            {{ $t('auditAssigneeMaster') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="operator-cell">
                    <span class="operator-name-link font-medium" :title="getOperatorName(row)" @click.stop="handleViewOperator(row)">
                      {{ getOperatorName(row) }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 11: 拍案管理 -->
              <el-table-column v-if="currentSection === 'audit'" width="105" align="center" key="audit-col-authority">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColFinalAuthority') }}</span>
                    <el-dropdown trigger="click" @command="handleAdjudicatorFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.adjudicator !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.adjudicator === 'all' }">
                            {{ $t('auditAllAdjudicators') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="secadmin" :class="{ 'is-selected': params.adjudicator === 'secadmin' }">
                            {{ $t('auditAdjudicatorAdmin') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="system" :class="{ 'is-selected': params.adjudicator === 'system' }">
                            {{ $t('auditAdjudicatorSystem') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="master" :class="{ 'is-selected': params.adjudicator === 'master' }">
                            {{ $t('auditAdjudicatorMaster') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="operator-cell">
                    <span class="operator-name-link font-medium" :title="getAdjudicatorName(row)" @click.stop="handleViewAdjudicator(row)">
                      {{ getAdjudicatorName(row) }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 12: 操作 -->
              <el-table-column :label="$t('action')" v-if="currentSection === 'audit'" width="80" align="center" key="audit-col-action">
                <template #default="{ row }">
                  <div class="action-cell">
                    <el-button
                      size="small"
                      type="primary"
                      link
                      class="action-detail-btn"
                      @click="openAuditDrawer(row)"
                    >
                      {{ $t('auditBtnViewDetails') }}
                    </el-button>
                  </div>
                </template>
              </el-table-column>


              <!-- ========================================================= -->
              <!-- 板块 4: 操作记录 (record) -->
              <!-- 变更: "报警原因"、"报警次数"、"处理建议"删除；添加"更新次数"、"最后更新"(时间)、"申诉次数" -->
              <!-- ========================================================= -->
              <!-- 列 1: 工单编号 -->
              <el-table-column :label="$t('auditColTicketNo')" v-if="currentSection === 'record'" width="85" align="center" key="record-col-ticket">
                <template #default="{ row }">
                  <div class="ticket-cell">
                    <span class="ticket-id font-mono font-medium clickable-ticket" @click="openAuditDrawer(row)">
                      {{ formatTicketNo(row) }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 2: 身分组 -->
              <el-table-column v-if="currentSection === 'record'" width="115" align="center" key="record-col-identity">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColIdentityGroup') }}</span>
                    <el-dropdown trigger="click" @command="handleIdentityFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.identityGroup !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.identityGroup === 'all' }">
                            {{ $t('auditAllIdentities') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="master" :class="{ 'is-selected': params.identityGroup === 'master' }">
                            {{ $t('auditIdentityMaster') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="admin" :class="{ 'is-selected': params.identityGroup === 'admin' }">
                            {{ $t('auditIdentityAdmin') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="member" :class="{ 'is-selected': params.identityGroup === 'member' }">
                            {{ $t('auditIdentityMember') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="user" :class="{ 'is-selected': params.identityGroup === 'user' }">
                            {{ $t('auditIdentityUser') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="guest" :class="{ 'is-selected': params.identityGroup === 'guest' }">
                            {{ $t('auditIdentityGuest') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="identity-cell">
                    <span class="plain-identity-text" :title="getIdentityMeta(row).impactDesc">
                      {{ getIdentityMeta(row).label }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 3: 违规分类 -->
              <el-table-column v-if="currentSection === 'record'" width="115" align="center" key="record-col-category">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColViolationCategory') }}</span>
                    <el-dropdown trigger="click" @command="handleCategoryFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.category !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.category === 'all' }">
                            {{ $t('auditAllViolationCategories') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="quota" :class="{ 'is-selected': params.category === 'quota' }">
                            {{ $t('auditCatQuota') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="outbound" :class="{ 'is-selected': params.category === 'outbound' }">
                            {{ $t('auditCatOutbound') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="content" :class="{ 'is-selected': params.category === 'content' }">
                            {{ $t('auditCatContent') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="account" :class="{ 'is-selected': params.category === 'account' }">
                            {{ $t('auditCatAccount') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="routine" :class="{ 'is-selected': params.category === 'routine' }">
                            {{ $t('auditCatRoutine') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="appeal" :class="{ 'is-selected': params.category === 'appeal' }">
                            {{ $t('auditCatAppeal') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="category-cell">
                    <span class="plain-category-text">{{ getViolationCategory(row).text }}</span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 4: 当前状态 -->
              <el-table-column v-if="currentSection === 'record'" width="125" align="center" key="record-col-status">
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

              <!-- 列 5: 更新次数 (新增列: 展示记录更新次数) -->
              <el-table-column v-if="currentSection === 'record'" width="95" align="center" key="record-col-update-count">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColUpdateCount') }}</span>
                  </div>
                </template>
                <template #default="{ row }">
                  <span class="plain-update-count font-mono font-medium">
                    {{ getUpdateCount(row) }} {{ $t('auditTimesUnit') }}
                  </span>
                </template>
              </el-table-column>

              <!-- 列 6: 最后更新 (新增列: 展示最后更新时间) -->
              <el-table-column v-if="currentSection === 'record'" width="135" align="center" key="record-col-last-updated">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColLastUpdated') }}</span>
                  </div>
                </template>
                <template #default="{ row }">
                  <span class="plain-time font-mono">
                    {{ formatTableTime(getLastUpdatedTime(row)) }}
                  </span>
                </template>
              </el-table-column>

              <!-- 列 7: 申诉次数 (新增列: 展示申诉次数) -->
              <el-table-column v-if="currentSection === 'record'" width="95" align="center" key="record-col-appeal-count">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColAppealCount') }}</span>
                  </div>
                </template>
                <template #default="{ row }">
                  <span class="plain-appeal-count font-mono" :class="{ 'font-medium': getAppealCount(row) > 0 }">
                    {{ getAppealCount(row) }} {{ $t('auditTimesUnit') }}
                  </span>
                </template>
              </el-table-column>

              <!-- 列 8: 处理时间 -->
              <el-table-column v-if="currentSection === 'record'" width="135" align="center" key="record-col-process-time">
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

              <!-- 列 9: 负责人 -->
              <el-table-column v-if="currentSection === 'record'" width="105" align="center" key="record-col-assignee">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColAssignee') }}</span>
                    <el-dropdown trigger="click" @command="handleAssigneeFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.assignee !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.assignee === 'all' }">
                            {{ $t('auditAllAssignees') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="secadmin" :class="{ 'is-selected': params.assignee === 'secadmin' }">
                            {{ $t('auditAssigneeAdmin') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="system" :class="{ 'is-selected': params.assignee === 'system' }">
                            {{ $t('auditAssigneeSystem') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="master" :class="{ 'is-selected': params.assignee === 'master' }">
                            {{ $t('auditAssigneeMaster') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="operator-cell">
                    <span class="operator-name-link font-medium" :title="getOperatorName(row)" @click.stop="handleViewOperator(row)">
                      {{ getOperatorName(row) }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 10: 拍案管理 -->
              <el-table-column v-if="currentSection === 'record'" width="105" align="center" key="record-col-authority">
                <template #header>
                  <div class="col-filter-header">
                    <span>{{ $t('auditColFinalAuthority') }}</span>
                    <el-dropdown trigger="click" @command="handleAdjudicatorFilterCommand">
                      <span class="filter-trigger" :class="{ 'filter-active': params.adjudicator !== 'all' }" :title="$t('filter')">
                        <Icon icon="fluent:filter-16-regular" width="13" height="13" />
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="all" :class="{ 'is-selected': params.adjudicator === 'all' }">
                            {{ $t('auditAllAdjudicators') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="secadmin" :class="{ 'is-selected': params.adjudicator === 'secadmin' }">
                            {{ $t('auditAdjudicatorAdmin') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="system" :class="{ 'is-selected': params.adjudicator === 'system' }">
                            {{ $t('auditAdjudicatorSystem') }}
                          </el-dropdown-item>
                          <el-dropdown-item command="master" :class="{ 'is-selected': params.adjudicator === 'master' }">
                            {{ $t('auditAdjudicatorMaster') }}
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
                <template #default="{ row }">
                  <div class="operator-cell">
                    <span class="operator-name-link font-medium" :title="getAdjudicatorName(row)" @click.stop="handleViewAdjudicator(row)">
                      {{ getAdjudicatorName(row) }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <!-- 列 11: 操作 -->
              <el-table-column :label="$t('action')" v-if="currentSection === 'record'" width="80" align="center" key="record-col-action">
                <template #default="{ row }">
                  <div class="action-cell">
                    <el-button
                      size="small"
                      type="primary"
                      link
                      class="action-detail-btn"
                      @click="openAuditDrawer(row)"
                    >
                      {{ $t('auditBtnViewDetails') }}
                    </el-button>
                  </div>
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
            <div class="grid-item" v-if="selectedRow.reasonCode">
              <span class="label">{{ $t('abuseReasonCodeLabel') }}:</span>
              <span class="val font-mono text-danger font-semibold">{{ selectedRow.reasonCode }}</span>
            </div>
            <div class="grid-item" v-if="selectedRow.evidenceExpiresDays !== undefined">
              <span class="label">{{ $t('abuseEvidenceRetentionLabel') }}:</span>
              <span class="val font-mono">{{ $t('abuseEvidenceRemainingDays', { days: selectedRow.evidenceExpiresDays }) }}</span>
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

        <!-- 案件全生命周期时间线 -->
        <div class="dossier-card" v-if="selectedRow.timeline && selectedRow.timeline.length">
          <div class="section-title">
            <Icon icon="fluent:history-20-regular" width="18" height="18" />
            <span>{{ $t('abuseLifecycleTimelineTitle') }}</span>
          </div>
          <div class="abuse-timeline-list">
            <div v-for="(item, idx) in selectedRow.timeline" :key="idx" class="timeline-row">
              <div class="timeline-time font-mono">{{ item.time ? tzDayjs(item.time).format('YYYY-MM-DD HH:mm:ss') : '-' }}</div>
              <div class="timeline-event font-semibold">{{ item.event }}</div>
              <div class="timeline-actor">{{ item.actor }}</div>
            </div>
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

    <!-- 6. 今日自动折叠批次明细弹窗 -->
    <el-dialog
      v-model="showAutoPurgedDialog"
      :title="$t('abuseAutoPurgedTitle')"
      width="540px"
      append-to-body
      destroy-on-close
    >
      <div v-if="autoPurgedBatches && autoPurgedBatches.length > 0" class="purged-batches-list">
        <div v-for="b in autoPurgedBatches" :key="b.id" class="purged-batch-item">
          <div class="batch-header">
            <span class="batch-id font-mono">{{ b.id }}</span>
            <span class="batch-time">{{ b.time }}</span>
          </div>
          <div class="batch-meta">
            <span class="batch-count">{{ $t('abuseClusterAccountCount', { count: b.count }) }}</span>
            <span class="batch-reason font-mono">{{ b.reason }}</span>
          </div>
        </div>
      </div>
      <el-empty v-else :description="$t('abuseEmptyAutoPurged')" />
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showAutoPurgedDialog = false">{{ $t('close') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
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
  threatPending: 0,
  threatBanned: 0,
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

// 熔断与自动折叠状态 (真实 D1/KV 驱动，零假数据)
const circuitBreakerTripped = ref(false);
const showAutoPurgedDialog = ref(false);
const autoPurgedCount = ref(0);
const autoPurgedBatches = ref([]);

// 当前选中的 KPI 卡片 (默认高亮选中威胁邮箱)
const activeKpi = ref('threat');

const currentSection = computed(() => {
  if (['threat', 'appeal', 'audit', 'record'].includes(activeKpi.value)) {
    return activeKpi.value;
  }
  return 'threat';
});

const params = reactive({
  keyword: '',
  warningType: 'all',
  riskLevel: 'all',
  status: 'all',
  identityGroup: 'all',
  category: 'all',
  violationLevel: 'all',
  alarmReason: 'all',
  alarmCountRange: 'all',
  suggestion: 'all',
  assignee: 'all',
  adjudicator: 'all',
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
    params.violationLevel = 'all';
  } else {
    activeKpi.value = type;
    params.timeRange = 'all';
    params.violationLevel = 'all';
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

function handleIdentityFilterCommand(command) {
  params.identityGroup = command;
  params.num = 1;
  search();
}

function handleCategoryFilterCommand(command) {
  params.category = command;
  params.num = 1;
  search();
}

function handleViolationLevelFilterCommand(command) {
  params.violationLevel = command;
  params.num = 1;
  search();
}

function handleReasonFilterCommand(command) {
  params.alarmReason = command;
  params.num = 1;
  search();
}

function handleAlarmCountFilterCommand(command) {
  params.alarmCountRange = command;
  params.num = 1;
  search();
}

function handleSuggestionFilterCommand(command) {
  params.suggestion = command;
  params.num = 1;
  search();
}

function handleAssigneeFilterCommand(command) {
  params.assignee = command;
  params.num = 1;
  search();
}

function handleAdjudicatorFilterCommand(command) {
  params.adjudicator = command;
  params.num = 1;
  search();
}

function handleReset() {
  localKeyword.value = '';
  params.keyword = '';
  params.status = 'all';
  params.identityGroup = 'all';
  params.category = 'all';
  params.violationLevel = 'all';
  params.alarmReason = 'all';
  params.alarmCountRange = 'all';
  params.suggestion = 'all';
  params.assignee = 'all';
  params.adjudicator = 'all';
  params.timeRange = 'all';
  params.riskLevel = 'all';
  params.warningType = 'all';
  params.timeSort = 0;
  activeKpi.value = 'all';
  search();
}

function formatTicketNo(row) {
  if (!row) return '#AK1789';
  if (row.ticketNo && typeof row.ticketNo === 'string' && row.ticketNo.startsWith('#')) {
    const code = row.ticketNo.slice(1).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    return '#' + (code || 'AK1789');
  }
  if (row.ticketCode && typeof row.ticketCode === 'string') {
    const code = row.ticketCode.replace(/^#/, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    return '#' + (code || 'AK1789');
  }
  if (row.ticketId && typeof row.ticketId === 'string') {
    const parts = row.ticketId.split('-');
    const code = parts[parts.length - 1].toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length >= 4 && code.length <= 6) {
      return '#' + code;
    }
    if (code.length > 6) {
      return '#' + code.slice(-6);
    }
    if (code.length > 0) {
      return '#' + code.padStart(6, '0');
    }
  }
  if (row.id) {
    const num = (1780 + Number(row.id)) % 10000;
    return `#AK${String(num).padStart(4, '0')}`;
  }
  return '#AK1789';
}

function getAlarmCount(row) {
  if (!row) return 1;
  if (typeof row.alarmCount === 'number') return row.alarmCount;
  if (row.reportedByOthers && row.reportedByOthers > 0) return row.reportedByOthers;
  if (row.isMultiIp) return row.activeIpCount || 3;
  if (row.eventType === 'multi_account_ban') return 2;
  if (row.eventType === 'auto_ban') return 4;
  return 1;
}

function getIdentityMeta(row) {
  if (!row) return { label: t('auditIdentityUser'), tagType: 'info', impact: 'P3', impactDesc: t('auditImpactStandard') };
  const grp = row.identityGroup || '';
  const email = (row.email || '').toLowerCase();

  if (grp === 'master' || email.includes('admin@') || email.includes('master@') || row.operatorRole === 'master') {
    return {
      label: t('auditIdentityMaster'),
      tagType: 'danger',
      impact: 'P0',
      impactDesc: t('auditImpactCritical')
    };
  }
  if (grp === 'admin' || email.includes('secadmin') || email.includes('moderator')) {
    return {
      label: t('auditIdentityAdmin'),
      tagType: 'warning',
      impact: 'P1',
      impactDesc: t('auditImpactHigh')
    };
  }
  if (grp === 'member' || email.endsWith('@epocanvas.com') || row.isInternal === 1) {
    return {
      label: t('auditIdentityMember'),
      tagType: 'primary',
      impact: 'P2',
      impactDesc: t('auditImpactMedium')
    };
  }
  if (grp === 'vip' || email.includes('vip')) {
    return {
      label: t('auditIdentityVip'),
      tagType: 'warning',
      impact: 'P2',
      impactDesc: t('auditImpactMedium')
    };
  }
  if (grp === 'user' || email.endsWith('.org') || email.endsWith('.net')) {
    return {
      label: t('auditIdentityUser'),
      tagType: 'info',
      impact: 'P3',
      impactDesc: t('auditImpactStandard')
    };
  }
  return {
    label: t('auditIdentityGuest'),
    tagType: '',
    impact: 'P4',
    impactDesc: t('auditImpactLow')
  };
}

function getDecisionAuthority(row) {
  if (!row) return { label: t('auditAuthorityAuto'), className: 'authority-auto', tooltip: t('auditAuthorityAutoDesc') };
  if (row.finalAuthority === 'master' || row.status === 'banned' || row.priority === 'CRITICAL' || row.priority === 'P0') {
    return {
      label: t('auditAuthorityMaster'),
      className: 'authority-master',
      tooltip: t('auditAuthorityMasterDesc')
    };
  }
  if (row.finalAuthority === 'policy' || row.eventType === 'auto_ban' || row.eventType === 'bot_probe_routine' || (row.banReason && row.banReason.includes('熔断'))) {
    return {
      label: t('auditAuthorityPolicy'),
      className: 'authority-policy',
      tooltip: t('auditAuthorityPolicyDesc')
    };
  }
  if (row.finalAuthority === 'board' || row.warningType === 'appeal') {
    return {
      label: t('auditAuthorityBoard'),
      className: 'authority-board',
      tooltip: t('auditAuthorityBoardDesc')
    };
  }
  if (row.finalAuthority === 'lead' || row.status === 'unbanned' || row.eventType === 'credential_tamper_ban') {
    return {
      label: t('auditAuthorityLead'),
      className: 'authority-lead',
      tooltip: t('auditAuthorityLeadDesc')
    };
  }
  return {
    label: t('auditAuthorityAuto'),
    className: 'authority-auto',
    tooltip: t('auditAuthorityAutoDesc')
  };
}

function formatTableTime(time) {
  if (!time) return '-';
  return tzDayjs(time).format('MM/DD/YY HH:mm');
}

// 1. 粗略违规等级 (LV0~LV3) 供风险管理板块直接说明粗略等级
function getViolationLevel(row) {
  if (!row) return { level: 'LV0', text: 'LV0 · ' + t('auditRiskLevelNormal'), type: 'info' };
  const p = (row?.priority || '').toUpperCase();
  const r = (row?.riskLevel || '').toLowerCase();
  if (['P0', 'CRITICAL', 'LV3'].includes(p) || r === 'high') {
    return { level: 'LV3', text: t('auditLevelLv3'), type: 'danger' };
  }
  if (['P1', 'LV2'].includes(p) || r === 'medium') {
    return { level: 'LV2', text: t('auditLevelLv2'), type: 'warning' };
  }
  if (['P2', 'LV1'].includes(p) || r === 'low') {
    return { level: 'LV1', text: t('auditLevelLv1'), type: 'primary' };
  }
  return { level: 'LV0', text: t('auditLevelLv0'), type: 'info' };
}

// 2. 申诉表单过期时间与是否过期 供申诉审计板块
function getAppealExpireTime(row) {
  if (!row) return null;
  if (row.expireTime) return row.expireTime;
  if (row.createTime) {
    return tzDayjs(row.createTime).add(7, 'day').toISOString();
  }
  return null;
}

function isAppealExpired(row) {
  const exp = getAppealExpireTime(row);
  if (!exp) return false;
  return tzDayjs(exp).isBefore(tzDayjs());
}

// 3. 风险管控截止期限与过期说明 供风险管理板块
function getRiskDeadlineInfo(row) {
  if (!row) return { time: '-', desc: '-', isExpired: false };
  const deadlineTime = row.deadline || row.expireTime || (row.createTime ? tzDayjs(row.createTime).add(14, 'day').toISOString() : null);
  if (!deadlineTime) {
    return { time: '-', desc: t('auditDeadlinePermanent'), isExpired: false };
  }
  const now = tzDayjs();
  const target = tzDayjs(deadlineTime);
  const isExpired = target.isBefore(now);
  let desc = '';
  if (isExpired) {
    desc = t('auditDeadlineExpired');
  } else {
    const diffHours = target.diff(now, 'hour');
    if (diffHours < 24) {
      desc = t('auditDeadlineHoursLeft', { hours: Math.max(1, diffHours) });
    } else {
      const diffDays = target.diff(now, 'day');
      desc = t('auditDeadlineDaysLeft', { days: Math.max(1, diffDays) });
    }
  }
  return {
    time: formatTableTime(deadlineTime),
    desc,
    isExpired
  };
}

// 4. 操作更新记录辅助方法 供操作记录板块 (更新次数、最后更新、申诉次数)
function getUpdateCount(row) {
  if (!row) return 1;
  if (typeof row.updateCount === 'number') return row.updateCount;
  let extra = 0;
  if (row.detailText) {
    const matches = row.detailText.match(/\[(放行说明|延期处置|解禁说明|审核备忘|驳回理由|更新)\]/g);
    if (matches) extra = matches.length;
  }
  return Math.max(1, 1 + extra);
}

function getLastUpdatedTime(row) {
  if (!row) return null;
  return row.lastUpdated || row.resolvedTime || row.banTime || row.createTime;
}

function getAppealCount(row) {
  if (!row) return 0;
  if (typeof row.appealCount === 'number') return row.appealCount;
  if (row.appealReason || row.warningType === 'appeal') return 1;
  return 0;
}

function getViolationCategory(row) {
  if (!row) return { text: '-', type: 'info' };
  // 1. 申诉审计 / 申诉工单
  if (activeKpi.value === 'appeal' || row.warningType === 'appeal' || row.category === 'appeal' || row.eventType?.includes('appeal')) {
    return { text: t('auditCatAppeal'), type: 'warning' };
  }
  // 2. 一人多号 / 配额规避
  if (row.eventType === 'multi_account_ban' || row.eventType === 'multi_account_detected' || (row.banReason && row.banReason.includes('一人多号')) || (row.actionText && row.actionText.includes('一人多号'))) {
    return { text: t('auditCatQuota'), type: 'danger' };
  }
  // 3. 内容安全 / 钓鱼诈骗
  if (row.reportCategory === 'fraud' || row.reportCategory === 'phishing' || row.reportCategory === 'mlm' || (row.banReason && (row.banReason.includes('恶意链接') || row.banReason.includes('钓鱼'))) || (row.actionText && (row.actionText.includes('外链') || row.actionText.includes('诈骗')))) {
    return { text: t('auditCatContent'), type: 'danger' };
  }
  // 4. 外发滥用 / 垃圾发信
  if (row.category === 'outbound' || row.reportCategory === 'spam' || (row.banReason && row.banReason.includes('发信')) || (row.actionText && (row.actionText.includes('发信') || row.actionText.includes('垃圾') || row.actionText.includes('群发')))) {
    return { text: t('auditCatOutbound'), type: 'danger' };
  }
  // 5. 账户安全 / 密保异动 / 暴力破解
  if (row.category === 'account' || row.eventType === 'credential_tamper_ban' || (row.banReason && row.banReason.includes('密保')) || (row.actionText && row.actionText.includes('密保'))) {
    return { text: t('auditCatAccount'), type: 'warning' };
  }
  // 6. 例行巡检 / 基线采样 / 异地跳跃
  if (row.warningType === 'audit' || row.eventType?.includes('routine') || row.eventType?.includes('sample') || row.eventType?.includes('baseline')) {
    return { text: t('auditCatRoutine'), type: 'info' };
  }
  if (row.category === 'security') {
    return { text: t('auditCatOutbound'), type: 'danger' };
  }
  return { text: t('auditCatOutbound'), type: 'info' };
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
    if (row.eventType === 'multi_account_detected' || row.eventType === 'multi_account_ban') {
      return { text: t('auditSuggestionSuspendAccount'), type: 'danger' };
    }
    if (row.recommendedAction === 'blacklist_sender' || row.reportCategory === 'fraud') {
      return { text: t('auditSuggestionPermanentBan'), type: 'danger' };
    }
    if (row.recommendedAction === 'mute_account' || row.reportCategory === 'spam') {
      return { text: t('auditSuggestionRestrictedOutbound'), type: 'warning' };
    }
    return { text: t('auditSuggestionBan'), type: 'danger' };
  }

  // 2. 申诉审计 (appeal)
  if (activeKpi.value === 'appeal' || row.warningType === 'appeal') {
    if (row.status === 'unbanned' || row.status === 'resolved') {
      return { text: t('auditSuggestionUnban'), type: 'success' };
    }
    if (row.status === 'rejected') {
      return { text: t('auditSuggestionKeepBan'), type: 'danger' };
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
  if (row.recommendedAction === 'archive_routine' || row.status === 'expired' || row.status === 'resolved') {
    return { text: t('auditSuggestionArchiveRoutine'), type: 'info' };
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
  params.num = 1;
  search();
}

// --- 滥用威胁 7 列工作台专属多选状态与行为 ---
const abuseSelectedMap = ref({});
const isAllAbuseSelected = computed(() => {
  if (!logs.value || !logs.value.length) return false;
  return logs.value.every(r => abuseSelectedMap.value[r.id]);
});

function isAbuseSelected(row) {
  return !!abuseSelectedMap.value[row.id];
}

function toggleAbuseRowSelection(row) {
  if (abuseSelectedMap.value[row.id]) {
    delete abuseSelectedMap.value[row.id];
  } else {
    abuseSelectedMap.value[row.id] = true;
  }
  syncAbuseSelectedRows();
}

function toggleAbuseSelectAll() {
  if (isAllAbuseSelected.value) {
    abuseSelectedMap.value = {};
  } else {
    const map = {};
    (logs.value || []).forEach(r => { map[r.id] = true; });
    abuseSelectedMap.value = map;
  }
  syncAbuseSelectedRows();
}

function syncAbuseSelectedRows() {
  selectedRows.value = (logs.value || []).filter(r => abuseSelectedMap.value[r.id]);
}

function formatAbuseTicketNo(row) {
  if (row.ticketId && /^#\d+/.test(row.ticketId)) {
    return row.ticketId;
  }
  return `#${10000 + (Number(row.id) || 1)}`;
}

// --- 滥用威胁对象列与集群子账号辅助函数 ---
const expandedClusterMap = ref({});
const abuseChildSelectedMap = ref({});

function isClusterRow(row) {
  return !!((row.clusterAccounts && row.clusterAccounts.length > 1) || (Number(row.clusterCount) > 1));
}

function getClusterCount(row) {
  if (row.clusterAccounts && row.clusterAccounts.length) {
    return row.clusterAccounts.length;
  }
  return Number(row.clusterCount) || 1;
}

function isClusterExpanded(row) {
  return !!expandedClusterMap.value[row.id];
}

function toggleClusterExpand(row) {
  expandedClusterMap.value[row.id] = !expandedClusterMap.value[row.id];
}

function isChildSelected(row, child) {
  const key = `${row.id}_${child.id || child.email}`;
  return !!abuseChildSelectedMap.value[key];
}

function toggleChildSelection(row, child) {
  const key = `${row.id}_${child.id || child.email}`;
  if (abuseChildSelectedMap.value[key]) {
    delete abuseChildSelectedMap.value[key];
  } else {
    abuseChildSelectedMap.value[key] = true;
  }
}

function isClearedAccount(row) {
  return !!(row.isCleared || row.status === 'cleared' || !row.email || row.email === '[cleared]');
}

function formatMailLocal(email) {
  if (!email || !email.includes('@')) return email || '';
  return email.split('@')[0];
}

function formatMailDomain(email) {
  if (!email || !email.includes('@')) return '';
  const domain = email.slice(email.indexOf('@') + 1);
  return domain.replace(/\./g, '.\u200B');
}

function getMailLengthClass(email) {
  if (!email) return 'len-normal';
  const len = email.length;
  if (len > 160) return 'len-long';
  if (len > 80) return 'len-medium';
  return 'len-normal';
}

function hasIdnDomain(email) {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1];
  return /[^\u0000-\u007F]/.test(domain);
}

function getPunycodeEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  try {
    const punyDomain = new URL('http://' + domain).hostname;
    return `${local}@${punyDomain}`;
  } catch (e) {
    return email;
  }
}

async function copyTextRaw(text, msg) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success(msg || t('abuseCopiedSuccess'));
  } catch (e) {
    ElMessage.info(text);
  }
}

async function copyEmailUnicode(email) {
  await copyTextRaw(email, t('abuseCopiedSuccess'));
}

async function copyEmailPunycode(email) {
  const puny = getPunycodeEmail(email);
  await copyTextRaw(puny, t('abuseCopiedSuccess') + ' (Punycode)');
}

function formatUserId(row) {
  if (row.userId) {
    return String(row.userId).startsWith('usr_') ? String(row.userId) : `usr_${row.userId}`;
  }
  return `usr_${row.id}`;
}

function getAbuseCategoryName(row) {
  const cat = (row.reportCategory || row.violationCategory || row.eventType || '').toLowerCase();
  if (cat.includes('protocol') || cat.includes('honeypot') || cat.includes('dkim') || cat.includes('tear') || cat.includes('sign')) {
    return t('abuseCatProtocol');
  }
  if (cat.includes('multi') || cat.includes('sybil') || cat.includes('jaccard') || cat.includes('cluster')) {
    return t('abuseCatMultiAccount');
  }
  if (cat.includes('takeover') || cat.includes('tamper') || cat.includes('brokering') || cat.includes('credential')) {
    return t('abuseCatAccountTakeover');
  }
  if (cat.includes('quota') || cat.includes('evasion') || cat.includes('share_token') || cat.includes('share_key')) {
    return t('abuseCatQuota');
  }
  return t('abuseCatOutbound');
}

function getAbuseStatusInfo(row) {
  if (row.circuitStatus === 'QUEUE_PAUSE' || row.circuitStatus === 'TRIPPED') {
    return {
      main: t('abuseStatusPending'),
      sub: t('abuseStatusTripped'),
      cls: 'status-pending'
    };
  }
  if (row.status === 'banned') {
    return {
      main: t('abuseStatusBanned'),
      sub: null,
      cls: 'status-banned'
    };
  }
  if (row.status === 'unbanned' || row.status === 'resolved') {
    return {
      main: t('abuseStatusUnbanned'),
      sub: null,
      cls: 'status-unbanned'
    };
  }
  return {
    main: t('abuseStatusPending'),
    sub: null,
    cls: 'status-pending'
  };
}

function getAbuseActionLabel(row) {
  const status = row.status;
  if (status === 'banned') return t('abuseActionMaintainBan');
  if (status === 'unbanned' || status === 'resolved') return t('abuseActionAppealApproved');
  if (row.circuitStatus === 'QUEUE_PAUSE' || row.circuitStatus === 'TRIPPED') return t('abuseActionCircuitHold');
  return t('abuseActionSuggestBan');
}

function formatAbuseActionSub(row) {
  if (row.circuitStatus === 'QUEUE_PAUSE' || row.circuitStatus === 'TRIPPED') {
    return t('abuseActionNeedManual');
  }
  const assignee = row.assignee || '-';
  const status = row.status;
  if (status === 'banned' || status === 'unbanned' || status === 'resolved') {
    const timeStr = row.resolvedTime || row.banTime || row.createTime;
    const formatted = timeStr ? tzDayjs(timeStr).format('MM/DD HH:mm') : '-';
    return `${formatted} ${assignee}`;
  }
  return assignee;
}

function getSelectedThreatTargets() {
  const targets = [];
  for (const row of selectedRows.value) {
    targets.push({ id: row.id, email: row.email, row });
    if (row.clusterAccounts && row.clusterAccounts.length) {
      for (const sub of row.clusterAccounts) {
        if (!targets.some(t => t.id === sub.id)) {
          targets.push({ id: sub.id, email: sub.email, row: sub });
        }
      }
    }
  }
  for (const [key, isSelected] of Object.entries(abuseChildSelectedMap.value)) {
    if (isSelected) {
      const [parentId, childId] = key.split('_');
      const parent = (logs.value || []).find(l => String(l.id) === String(parentId));
      if (parent && parent.clusterAccounts) {
        const child = parent.clusterAccounts.find(c => String(c.id || c.email) === String(childId));
        if (child && !targets.some(t => t.id === child.id)) {
          targets.push({ id: child.id, email: child.email, row: child });
        }
      }
    }
  }
  return targets;
}

async function handleRowMoreCommand(cmd, row) {
  if (cmd === 'review') {
    try {
      await auditAction({
        id: row.id,
        action: 'review',
        targetEmail: row.email,
        notes: t('abuseBatchReview')
      });
      ElMessage.success(t('auditActionSuccess') || t('saveSuccessMsg'));
      fetchAuditList();
    } catch (e) {
      console.error(e);
    }
  } else if (cmd === 'assign') {
    try {
      const { value } = await ElMessageBox.prompt(t('abuseAssignPrompt'), t('abuseBatchAssign'), {
        confirmButtonText: t('confirm'),
        cancelButtonText: t('cancel'),
        inputValue: row.assignee || ''
      });
      if (value !== undefined && value.trim()) {
        await auditAction({
          id: row.id,
          action: 'assign',
          assignee: value.trim(),
          targetEmail: row.email,
          notes: `${t('abuseBatchAssign')}: ${value.trim()}`
        });
        ElMessage.success(t('abuseAssignSuccess'));
        fetchAuditList();
      }
    } catch (e) {}
  } else if (cmd === 'unban') {
    try {
      await ElMessageBox.confirm(
        `${t('auditUnbanConfirmMsg')} (${row.email})`,
        t('abuseBatchUnban'),
        { confirmButtonText: t('abuseBatchUnban'), cancelButtonText: t('cancel'), type: 'warning' }
      );
      await auditAction({ id: row.id, action: 'unban', targetEmail: row.email, notes: 'Abuse quick unban' });
      ElMessage.success(t('auditActionSuccess') || t('saveSuccessMsg'));
      fetchAuditList();
    } catch (e) {}
  }
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
  const targets = currentSection.value === 'threat' ? getSelectedThreatTargets() : selectedRows.value.map(r => ({ id: r.id, email: r.email }));
  if (!targets.length) return;
  try {
    await ElMessageBox.confirm(
      t('auditBatchUnbanConfirm', { count: targets.length }),
      t('auditBatchUnban'),
      {
        confirmButtonText: t('auditBatchUnban'),
        cancelButtonText: t('cancel'),
        type: 'success'
      }
    );
    actionLoading.value = true;
    for (const tRow of targets) {
      try {
        await auditAction({
          id: tRow.id,
          action: 'unban',
          targetEmail: tRow.email,
          notes: `${t('auditBatchUnban')} (${tRow.email})`
        });
      } catch (err) {
        console.error(err);
      }
    }
    ElMessage.success(t('auditActionSuccess') || t('saveSuccessMsg'));
    selectedRows.value = [];
    abuseChildSelectedMap.value = {};
    abuseSelectedMap.value = {};
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

async function handleBatchAssign() {
  const targets = currentSection.value === 'threat' ? getSelectedThreatTargets() : selectedRows.value.map(r => ({ id: r.id, email: r.email }));
  if (!targets.length) return;
  try {
    const { value } = await ElMessageBox.prompt(t('abuseAssignPrompt'), t('abuseBatchAssign'), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel')
    });
    if (value !== undefined && value.trim()) {
      actionLoading.value = true;
      for (const tRow of targets) {
        try {
          await auditAction({
            id: tRow.id,
            action: 'assign',
            assignee: value.trim(),
            targetEmail: tRow.email,
            notes: `${t('abuseBatchAssign')}: ${value.trim()}`
          });
        } catch (err) {
          console.error(err);
        }
      }
      ElMessage.success(t('abuseAssignSuccess'));
      selectedRows.value = [];
      abuseChildSelectedMap.value = {};
      abuseSelectedMap.value = {};
      fetchAuditList();
    }
  } catch (e) {} finally {
    actionLoading.value = false;
  }
}

async function handleBatchReview() {
  const targets = currentSection.value === 'threat' ? getSelectedThreatTargets() : selectedRows.value.map(r => ({ id: r.id, email: r.email }));
  if (!targets.length) return;
  try {
    await ElMessageBox.confirm(
      t('abuseBatchReviewConfirm', { count: targets.length }),
      t('abuseBatchReview'),
      {
        confirmButtonText: t('abuseBatchReview'),
        cancelButtonText: t('cancel'),
        type: 'warning'
      }
    );
    actionLoading.value = true;
    for (const tRow of targets) {
      try {
        await auditAction({
          id: tRow.id,
          action: 'review',
          targetEmail: tRow.email,
          notes: t('abuseBatchReview')
        });
      } catch (err) {
        console.error(err);
      }
    }
    ElMessage.success(t('auditActionSuccess') || t('saveSuccessMsg'));
    selectedRows.value = [];
    abuseChildSelectedMap.value = {};
    abuseSelectedMap.value = {};
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
    t('auditColIdentityGroup'),
    t('auditColViolationCategory'),
    t('auditColAlarmReason'),
    t('auditColAlarmCount'),
    t('auditCurrentStatus'),
    t('auditColSuggestion'),
    t('auditColProcessTime'),
    t('auditColAssignee'),
    t('auditColFinalAuthority')
  ];
  const csvRows = [headers.join(',')];
  for (const row of logs.value) {
    const rowValues = [
      formatTicketNo(row),
      `"${getIdentityMeta(row).label}"`,
      `"${getViolationCategory(row).text}"`,
      `"${getSimpleAlarmReason(row)}"`,
      `"${getAlarmCount(row)}${t('auditTimesUnit')}"`,
      `"${getStatusLabel(row.status)}"`,
      `"${getHandlingSuggestion(row).text}"`,
      `"${formatTableTime(row.banTime || row.createTime)}"`,
      `"${getOperatorName(row)}"`,
      `"${getAdjudicatorName(row)}"`
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

function getAdjudicatorName(row) {
  if (!row) return 'SecAdmin';
  if (row.adjudicatorName) return row.adjudicatorName;
  if (row.adjudicator) return row.adjudicator;
  // 大部分时候拍案管理就是负责人
  return getOperatorName(row);
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

function handleViewAdjudicator(row) {
  const name = getAdjudicatorName(row);
  const isSys = name.toLowerCase().includes('bot') || name.toLowerCase().includes('system') || name.toLowerCase().includes('engine');
  const isMaster = name === 'Master' || row?.finalAuthority === 'master';
  currentOperator.value = {
    name,
    avatar: name.slice(0, 2).toUpperCase(),
    role: isSys ? t('auditOperatorRoleSystem') : (isMaster ? t('auditOperatorRoleMaster') : t('auditOperatorRoleAdmin')),
    email: row?.adjudicatorEmail || (isSys ? 'system-daemon@epocanvas.com' : (isMaster ? 'master@epocanvas.com' : 'security-admin@epomail.cyou')),
    typeLabel: isSys ? t('auditOperatorTypeSystem') : t('auditOperatorTypeHuman'),
    id: row?.adjudicatorId || 'ADM-01'
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
      summaryCounts.threatPending = data.counts.threatPending ?? data.counts.pending ?? 0;
      summaryCounts.threatBanned = data.counts.threatBanned ?? data.counts.banned ?? data.counts.highRisk ?? 0;
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
      summaryCounts.threatPending = logs.value.filter(l => (l.riskLevel === 'high' || l.priority === 'CRITICAL' || l.priority === 'P0') && (l.status === 'pending' || l.status === 'active')).length;
      summaryCounts.threatBanned = logs.value.filter(l => (l.riskLevel === 'high' || l.priority === 'CRITICAL' || l.priority === 'P0') && l.status === 'banned').length;
      summaryCounts.audit = logs.value.filter(l => l.warningType === 'audit').length;
      summaryCounts.appeal = logs.value.filter(l => l.warningType === 'appeal').length;
      summaryCounts.record = logs.value.filter(l => l.warningType === 'ban' || l.status === 'banned' || l.status === 'unbanned').length;
      summaryCounts.banned = summaryCounts.record;
      summaryCounts.today = Math.max(1, summaryCounts.record);
      summaryCounts.pending = summaryCounts.audit;
      summaryCounts.highRisk = summaryCounts.threat;
    }
    if (data.circuitBreaker) {
      circuitBreakerTripped.value = data.circuitBreaker.status === 'TRIPPED' || !!data.circuitBreaker.tripped;
    }
    if (data.autoPurgedCount !== undefined) {
      autoPurgedCount.value = data.autoPurgedCount;
    }
    if (data.autoPurgedBatches) {
      autoPurgedBatches.value = data.autoPurgedBatches;
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
  justify-content: center;
  gap: 5px;
  width: 100%;
  text-align: center;

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
  justify-content: center;
  width: 100%;
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

.identity-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  text-align: center;

  .plain-identity-text {
    font-size: 12.5px;
    color: var(--el-text-color-regular);
    line-height: 1.4;
    white-space: nowrap;
    font-weight: 500;
    border: none !important;
    background: transparent !important;
  }
}

.alarm-count-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  text-align: center;

  .plain-alarm-count {
    font-size: 12.5px;
    color: var(--el-text-color-regular);
    line-height: 1.4;
    font-weight: 500;
    border: none !important;
    background: transparent !important;
    font-variant-numeric: tabular-nums;

    &.alarm-count-high {
      color: var(--el-color-danger);
      font-weight: 600;
    }
  }
}

.reason-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  text-align: center;
}

.operator-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  text-align: center;
}

.suggestion-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  text-align: center;

  .plain-suggestion-text {
    font-size: 12.5px;
    color: var(--el-text-color-regular);
    line-height: 1.4;
    font-weight: 500;
    border: none !important;
    background: transparent !important;
    white-space: nowrap;

    &.suggestion-danger {
      color: var(--el-color-danger);
    }
    &.suggestion-warning {
      color: var(--el-color-warning);
    }
    &.suggestion-success {
      color: var(--el-color-success);
    }
    &.suggestion-info {
      color: var(--el-text-color-secondary);
    }
  }
}

.action-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  text-align: center;
}

.plain-reason-text {
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
}

.hybrid-reason-cell {
  display: flex;
  align-items: center;
  justify-content: center;
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

.category-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  font-size: 12.5px;
  line-height: 1.4;
  white-space: nowrap;

  .plain-category-text {
    color: var(--el-text-color-regular);
    letter-spacing: 0.2px;
  }
}

.level-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  text-align: center;

  .plain-level-text {
    font-size: 12.5px;
    line-height: 1.4;
    white-space: nowrap;

    &.level-danger {
      color: var(--el-color-danger);
      font-weight: 600;
    }
    &.level-warning {
      color: var(--el-color-warning);
      font-weight: 500;
    }
    &.level-primary {
      color: var(--el-color-primary);
      font-weight: 500;
    }
    &.level-info {
      color: var(--el-text-color-regular);
    }
  }
}

.expire-cell,
.expire-time-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  text-align: center;

  .time-expired {
    color: var(--el-color-danger);
    font-weight: 600;
  }

  .expire-tag-expired {
    font-size: 11px;
    color: var(--el-color-danger);
    font-weight: 600;
  }
}

.deadline-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  text-align: center;

  .plain-deadline-desc {
    font-size: 11px;
    line-height: 1.2;

    &.desc-expired {
      color: var(--el-color-danger);
      font-weight: 600;
    }
    &.desc-active {
      color: var(--el-text-color-secondary);
    }
  }
}

.plain-update-count,
.plain-appeal-count {
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}

/* 3. 核心管理表格 (零脱节，直接作为外框铺满，纯文本无内框) */
.table-area {
  position: relative;
  background: var(--el-bg-color);

  :deep(.el-table) {
    --el-table-header-bg-color: var(--el-fill-color-light);
    --el-table-border: none;
    --el-table-border-color: transparent;
    border: none !important;

    &::before,
    &::after {
      display: none !important;
    }
  }

  :deep(.el-table__inner-wrapper::before) {
    display: none !important;
  }

  :deep(.el-table td.el-table__cell),
  :deep(.el-table th.el-table__cell) {
    border: none !important;
    border-right: none !important;
    border-left: none !important;
    border-top: none !important;
    border-bottom: 1px solid var(--el-border-color-extra-light) !important;
  }

  /* 彻底删除所有单元格（包括 column_3, column_6, column_11 等）的实际边框与多余阴影 */
  :deep(.el-table .el-table__cell) {
    border-left: none !important;
    border-right: none !important;
    box-shadow: none !important;
  }

  :deep(.el-table__header-wrapper th.el-table__cell) {
    border-bottom: 1px solid var(--el-border-color-lighter) !important;
  }
}

/* 熔断状态条与今日自动折叠批次条 */
.abuse-circuit-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(217, 119, 6, 0.12);
  border: 1px solid rgba(217, 119, 6, 0.35);
  border-radius: 8px;
  padding: 8px 14px;
  margin-bottom: 12px;
  color: #d97706;
  font-size: 13px;
  font-weight: 500;

  .circuit-banner-icon {
    flex-shrink: 0;
    color: #d97706;
  }

  .circuit-banner-text {
    line-height: 1.4;
  }
}

.abuse-auto-purged-banner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 5px 12px;
  margin-bottom: 12px;
  cursor: pointer;
  color: var(--el-text-color-regular);
  font-size: 12px;
  transition: all 0.15s ease;

  &:hover {
    background: var(--el-fill-color);
    color: var(--el-color-primary);
  }

  .purged-icon {
    color: var(--el-color-primary);
  }

  .purged-arrow {
    color: var(--el-text-color-placeholder);
  }
}

.purged-batches-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.purged-batch-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;

  .batch-header {
    display: flex;
    justify-content: space-between;
    font-size: 12px;

    .batch-id {
      font-weight: 600;
      color: var(--el-color-primary);
    }

    .batch-time {
      color: var(--el-text-color-secondary);
    }
  }

  .batch-meta {
    display: flex;
    justify-content: space-between;
    font-size: 11.5px;
    color: var(--el-text-color-regular);

    .batch-reason {
      color: var(--el-text-color-placeholder);
    }
  }
}

.abuse-timeline-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

.timeline-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  padding: 6px 10px;
  background: var(--el-fill-color-light);
  border-radius: 6px;

  .timeline-time {
    color: var(--el-text-color-secondary);
    min-width: 140px;
  }

  .timeline-event {
    color: var(--el-text-color-primary);
    flex: 1;
  }

  .timeline-actor {
    color: var(--el-color-primary);
    font-size: 11px;
  }
}

/* 滥用威胁 7 列工作台专属原生表格 */
.abuse-table-wrapper {
  width: 100%;
  overflow-x: hidden;
  background: var(--el-bg-color);
  box-sizing: border-box;
}

.abuse-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 13px;
  color: var(--el-text-color-primary);
  border: none;
  box-sizing: border-box;
}

.abuse-table th {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-weight: 600;
  font-size: 12.5px;
  padding: 8px 6px;
  text-align: left;
  border-bottom: 1px solid var(--el-border-color-lighter);
  box-sizing: border-box;
  vertical-align: middle;
  height: 40px;
}

.abuse-table td {
  padding: 8px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  vertical-align: middle;
  box-sizing: border-box;
  background: transparent;
  transition: background-color 0.15s ease;
  overflow: hidden;
}

.abuse-table-row:hover td {
  background-color: var(--el-fill-color-lighter);
}

.abuse-table-row.row-selected td {
  background-color: var(--el-color-primary-light-9);
}

.abuse-empty-cell {
  text-align: center;
  padding: 40px 16px;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}

.target-container {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow: hidden;
  max-width: 100%;
}

.target-email-row {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 100%;
  position: relative;
}

.target-type-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-top: 2px;
}

.type-icon {
  width: 16px;
  height: 16px;

  &.icon-single {
    color: var(--el-text-color-regular);
  }
  &.icon-cluster {
    color: var(--el-color-primary);
  }
  &.icon-cleared {
    color: var(--el-text-color-placeholder);
  }
  &.icon-child {
    color: var(--el-text-color-secondary);
  }
}

.cleared-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-style: italic;
}

.cluster-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  padding: 1px 5px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
  font-weight: 500;
  line-height: 1.2;

  &:hover {
    background: var(--el-color-primary-light-8);
  }
}

.target-email {
  line-height: 1.35;
  word-break: break-word;
  overflow-wrap: anywhere;
  white-space: normal;
  color: var(--el-text-color-primary);
  flex: 1 1 auto;
  min-width: 0;
}

.len-normal .target-email {
  font-size: 13px;
}

.len-medium .target-email {
  font-size: 12px;
}

.len-long .target-email {
  font-size: 11px;
  line-height: 1.2;
}

.long-addr-tag {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  padding: 1px 4px;
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
  border-radius: 2px;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1.2;
  font-weight: 600;
}

.copy-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.target-email-row:hover .copy-actions,
.target-userid-row:hover .copy-actions {
  opacity: 1;
}

.copy-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--el-text-color-placeholder);
  border-radius: 3px;
  padding: 1px;
  transition: color 0.15s;

  &:hover {
    color: var(--el-color-primary);
  }
}

.target-userid-row {
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative;
}

.target-userid {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  letter-spacing: 0.3px;
}

.abuse-cluster-child-row {
  background: var(--el-fill-color-extra-light);

  td {
    border-top: 1px dashed var(--el-border-color-lighter);
    padding: 6px 6px;
  }

  .child-sub-no {
    font-size: 11.5px;
    color: var(--el-text-color-secondary);
    padding-left: 6px;
  }

  .child-target {
    padding-left: 8px;
  }
}

.status-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: flex-start;
}

.status-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
  line-height: 1.2;

  &.status-pending,
  &.status-active {
    color: #d97706;
    background: rgba(217, 119, 6, 0.1);
  }

  &.status-banned {
    color: #dc2626;
    background: rgba(220, 38, 38, 0.1);
  }

  &.status-unbanned,
  &.status-resolved {
    color: #16a34a;
    background: rgba(22, 163, 74, 0.1);
  }
}

.status-sub-badge.badge-tripped {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 3px;
  color: #d97706;
  background: rgba(217, 119, 6, 0.15);
  line-height: 1.2;
}

.cat-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .cat-title {
    font-size: 12.5px;
    font-weight: 600;
  }

  .cat-summary {
    font-size: 11.5px;
    color: var(--el-text-color-secondary);
    line-height: 1.35;
  }
}

.action-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .action-top {
    font-size: 12px;
    font-weight: 600;
  }

  .action-sub {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
  }
}

.opt-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  overflow: hidden;

  .opt-btn-details {
    padding: 0 !important;
    font-size: 12px;
    height: 20px;
    line-height: 20px;
  }

  .opt-more-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--el-text-color-secondary);
    border-radius: 4px;
    padding: 2px;
    transition: color 0.15s, background-color 0.15s;

    &:hover {
      color: var(--el-color-primary);
      background-color: var(--el-fill-color-light);
    }
  }
}

/* 滥用威胁 ≤ 860px 响应式卡片布局：隐藏 thead/colgroup，纵向字段卡片排版 */
@media (max-width: 860px) {
  .abuse-table-wrapper {
    overflow-x: hidden !important;
    padding: 0 !important;
    width: 100% !important;
    box-sizing: border-box;
  }

  .abuse-table {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    table-layout: auto !important;
    border: none !important;
    box-sizing: border-box;

    colgroup {
      display: none !important;
    }

    thead {
      display: none !important;
    }

    tbody {
      display: flex !important;
      flex-direction: column !important;
      gap: 12px !important;
      width: 100% !important;
      box-sizing: border-box;
    }

    tr.abuse-table-row,
    tr.abuse-cluster-child-row {
      display: flex !important;
      flex-direction: column !important;
      width: 100% !important;
      box-sizing: border-box;
      background: var(--el-bg-color-overlay, var(--el-bg-color));
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 8px;
      padding: 12px 14px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      gap: 6px;
    }

    tr.abuse-cluster-child-row {
      margin-left: 12px;
      width: calc(100% - 12px) !important;
      background: var(--el-fill-color-extra-light);
      border-left: 3px solid var(--el-color-primary);
    }

    td {
      display: flex !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      align-items: center;
      justify-content: space-between;
      border: none !important;
      padding: 5px 0 !important;
      height: auto !important;
      box-sizing: border-box;
      overflow: visible !important;

      &::before {
        content: attr(data-label);
        font-size: 12px;
        font-weight: 600;
        color: var(--el-text-color-secondary);
        flex-shrink: 0;
        margin-right: 12px;
        min-width: 52px;
      }
    }

    td.col-select {
      justify-content: flex-start;
      border-bottom: 1px dashed var(--el-border-color-lighter) !important;
      padding-bottom: 6px !important;
      margin-bottom: 2px;
    }

    td.col-target {
      align-items: flex-start;

      .target-container {
        align-items: flex-end;
        text-align: right;
        flex: 1 1 auto;
        min-width: 0;
      }

      .target-email-row {
        justify-content: flex-end;
      }

      .target-userid-row {
        justify-content: flex-end;
      }
    }

    td.col-cat .cat-cell,
    td.col-action .action-cell {
      align-items: flex-end;
      text-align: right;
      flex: 1 1 auto;
      min-width: 0;
    }

    td.col-opt {
      border-top: 1px dashed var(--el-border-color-lighter) !important;
      padding-top: 8px !important;
      margin-top: 4px;
      justify-content: flex-end;

      &::before {
        display: none !important;
      }
    }
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
  justify-content: center;
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

/* 【操作列居中优化】统一居中对齐与紧凑间距，各按钮尺寸人体工学对齐，彻底消除 margin-left 冗余与截断 */
.table-actions-group {
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
