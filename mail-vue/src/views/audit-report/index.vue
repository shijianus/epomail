<template>
  <div class="settings-container audit-page-container">
    <div class="loading" :class="firstLoading ? 'loading-show' : 'loading-hide'">
      <loading />
    </div>

    <el-scrollbar class="scroll" v-if="!firstLoading">
      <div class="scroll-body audit-scroll-body">
        
        <!-- Breadcrumb Navigation Bar -->
        <div class="audit-breadcrumb-strip">
          <div class="breadcrumb-left">
            <el-button link class="back-settings-btn" @click="goToSysSetting">
              <Icon icon="fluent:arrow-left-20-filled" width="16" height="16" />
              <span>{{ $t('auditBackToSettings') }}</span>
            </el-button>
            <span class="breadcrumb-sep">/</span>
            <span class="breadcrumb-active">{{ $t('auditReport') }}</span>
          </div>
          <div class="breadcrumb-right">
            <el-button link type="primary" size="small" class="docs-portal-btn" @click="openExternalAppealPortal('form')">
              <Icon icon="fluent:document-person-20-regular" width="15" height="15" />
              <span>{{ $t('auditViewExternalAppealDocs') }}</span>
              <Icon icon="fluent:arrow-up-right-16-regular" width="13" height="13" />
            </el-button>
          </div>
        </div>

        <!-- Header Banner: Security Mode Status & Mode Simulator -->
        <div class="audit-header-banner" :class="'mode-' + activeMode">
          <div class="banner-left">
            <div class="mode-badge-wrap">
              <el-tag :type="currentModeMeta.tagType" size="default" effect="dark" class="mode-hero-badge">
                <Icon :icon="currentModeMeta.icon" width="16" height="16" class="badge-icon" />
                {{ currentModeMeta.title }}
              </el-tag>
              <div class="header-title-text">
                <h1>{{ $t('auditReport') }}</h1>
                <p class="header-subtitle">{{ $t('auditReportDesc') }}</p>
              </div>
            </div>
            <div class="mode-notice-card">
              <Icon icon="fluent:info-20-filled" width="16" height="16" class="notice-info-icon" />
              <span>{{ currentModeMeta.notice }}</span>
            </div>
          </div>

          <div class="banner-right">
            <!-- Mode Switcher & Tools -->
            <div class="mode-switch-box">
              <div class="mode-switch-label">{{ $t('auditSimulateMode') }}</div>
              <el-select
                v-model="activeMode"
                size="small"
                class="mode-selector"
                :popper-append-to-body="false"
              >
                <el-option :value="1" :label="$t('auditModeLevel1')" />
                <el-option :value="0" :label="$t('auditModeLevel2')" />
                <el-option :value="2" :label="$t('auditModeLevel3')" />
              </el-select>
            </div>

            <div class="banner-actions">
              <el-button size="small" type="primary" plain @click="refreshData">
                <Icon icon="fluent:arrow-sync-20-regular" width="15" height="15" />
                <span>{{ $t('refresh') }}</span>
              </el-button>
              <el-button size="small" @click="activeTab = 'policy'">
                <Icon icon="lucide:settings" width="15" height="15" />
                <span>{{ $t('auditTabPolicy') }}</span>
              </el-button>
            </div>
          </div>
        </div>

        <!-- KPI Metrics Grid (Preserves exact assertions) -->
        <div class="kpi-grid">
          <div class="kpi-card" @click="activeTab = 'stream'">
            <div class="kpi-icon-wrap ops-icon">
              <Icon icon="fluent:document-bullet-list-clock-24-regular" width="22" height="22" />
            </div>
            <div class="kpi-info">
              <div class="kpi-label">{{ $t('auditTotalOps') }}</div>
              <div class="kpi-value">{{ filteredLogs.length }} <span class="kpi-unit">/ {{ allLogs.length }}</span></div>
              <div class="kpi-sub">{{ activeModeText }}</div>
              <div class="kpi-progress-bar">
                <div class="kpi-progress-fill ops-fill" :style="{ width: Math.min(100, Math.round((filteredLogs.length / (allLogs.length || 1)) * 100)) + '%' }"></div>
              </div>
            </div>
          </div>

          <div class="kpi-card" @click="activeTab = 'risk'">
            <div class="kpi-icon-wrap risk-icon">
              <Icon icon="fluent:shield-alert-20-regular" width="22" height="22" />
            </div>
            <div class="kpi-info">
              <div class="kpi-label">{{ $t('auditMonitoredUsers') }}</div>
              <div class="kpi-value">{{ monitoredAccountsCount }}</div>
              <div class="kpi-sub">{{ bannedAccountsCount }} {{ $t('banned') }}</div>
              <div class="kpi-progress-bar">
                <div class="kpi-progress-fill risk-fill" :style="{ width: Math.min(100, Math.round((bannedAccountsCount / (monitoredAccountsCount || 1)) * 100)) + '%' }"></div>
              </div>
            </div>
          </div>

          <div class="kpi-card highlight-card" @click="activeTab = 'risk'">
            <div class="kpi-icon-wrap appeal-icon">
              <Icon icon="fluent:person-feedback-24-regular" width="22" height="22" />
            </div>
            <div class="kpi-info">
              <div class="kpi-label">
                <span>{{ $t('auditPendingAppeals') }}</span>
                <span v-if="pendingAppealsCount > 0" class="pulse-beacon"></span>
              </div>
              <div class="kpi-value text-amber">{{ pendingAppealsCount }}</div>
              <div class="kpi-sub text-amber">{{ $t('auditInspectDetails') }}</div>
              <div class="kpi-progress-bar">
                <div class="kpi-progress-fill appeal-fill" style="width: 100%;"></div>
              </div>
            </div>
          </div>

          <div class="kpi-card" @click="activeTab = 'policy'">
            <div class="kpi-icon-wrap quota-icon">
              <Icon icon="fluent:database-person-20-regular" width="22" height="22" />
            </div>
            <div class="kpi-info">
              <div class="kpi-label">{{ $t('auditDevicePoolUsage') }}</div>
              <div class="kpi-value">{{ settingForm.auditMaxIpPerAccount }} <span class="kpi-unit">IPs</span> / {{ settingForm.auditMaxDevicePerAccount }} <span class="kpi-unit">{{ $t('auditDeviceRegistered') }}</span></div>
              <div class="kpi-sub">{{ settingForm.auditPrioritizeNonCriticalClean ? $t('auditPrioritizeNonCriticalClean') : $t('auditAutoCleanOldest') }}</div>
              <div class="kpi-slots-capsule">
                <span class="slot-dot active" title="IP Slot 1">1</span>
                <span class="slot-dot active" title="IP Slot 2">2</span>
                <span class="slot-dot active" title="IP Slot 3">3</span>
                <span class="slot-dot" :class="{ active: settingForm.auditMaxIpPerAccount > 3 }" title="Extra Slot 4">4</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Main Workspace Tabs -->
        <div class="audit-workspace-tabs">
          <div class="tab-nav-bar">
            <div
              class="tab-btn"
              :class="{ active: activeTab === 'stream' }"
              @click="activeTab = 'stream'"
            >
              <Icon icon="fluent:timeline-20-regular" width="18" height="18" />
              <span>{{ $t('auditTabStream') }}</span>
              <span class="tab-count-badge">{{ filteredLogs.length }}</span>
            </div>

            <div
              class="tab-btn"
              :class="{ active: activeTab === 'risk' }"
              @click="activeTab = 'risk'"
            >
              <Icon icon="fluent:shield-badge-20-regular" width="18" height="18" />
              <span>{{ $t('auditTabRisk') }}</span>
              <span v-if="pendingAppealsCount > 0" class="tab-alert-badge">{{ pendingAppealsCount }}</span>
            </div>

            <div
              class="tab-btn"
              :class="{ active: activeTab === 'policy' }"
              @click="activeTab = 'policy'"
            >
              <Icon icon="fluent:slide-settings-20-regular" width="18" height="18" />
              <span>{{ $t('auditTabPolicy') }}</span>
            </div>
          </div>

          <!-- TAB 1: 异常预警中心与时序流 (Operation Alerts & Stream) -->
          <div v-show="activeTab === 'stream'" class="tab-panel stream-panel">
            
            <!-- 4 Warning Categories Focus Filter Bar -->
            <div class="warning-category-filter-bar">
              <div class="warning-filter-pills">
                <div
                  class="warning-filter-pill"
                  :class="{ active: filterWarningType === 'all' }"
                  @click="filterWarningType = 'all'"
                >
                  <Icon icon="fluent:apps-list-detail-20-regular" width="16" height="16" />
                  <span>{{ $t('auditTypeAllAlerts') }}</span>
                  <span class="pill-count">{{ countAllWarnings }}</span>
                </div>

                <div
                  class="warning-filter-pill pill-audit"
                  :class="{ active: filterWarningType === 'audit' }"
                  @click="filterWarningType = 'audit'"
                >
                  <Icon icon="fluent:shield-question-20-filled" width="16" height="16" />
                  <span>{{ $t('auditTypeAuditWarning') }}</span>
                  <span class="pill-count">{{ countAuditWarnings }}</span>
                </div>

                <div
                  class="warning-filter-pill pill-risk"
                  :class="{ active: filterWarningType === 'risk' }"
                  @click="filterWarningType = 'risk'"
                >
                  <Icon icon="fluent:alert-urgent-20-filled" width="16" height="16" />
                  <span>{{ $t('auditTypeRiskWarning') }}</span>
                  <span class="pill-count">{{ countRiskWarnings }}</span>
                </div>

                <div
                  class="warning-filter-pill pill-ban"
                  :class="{ active: filterWarningType === 'ban' }"
                  @click="filterWarningType = 'ban'"
                >
                  <Icon icon="fluent:prohibited-20-filled" width="16" height="16" />
                  <span>{{ $t('auditTypeBanWarning') }}</span>
                  <span class="pill-count">{{ countBanWarnings }}</span>
                </div>

                <div
                  class="warning-filter-pill pill-appeal"
                  :class="{ active: filterWarningType === 'appeal' }"
                  @click="filterWarningType = 'appeal'"
                >
                  <Icon icon="fluent:document-person-20-filled" width="16" height="16" />
                  <span>{{ $t('auditTypeAppealWarning') }}</span>
                  <span class="pill-count" :class="{ 'has-appeal': countAppealWarnings > 0 }">{{ countAppealWarnings }}</span>
                </div>
              </div>

              <!-- Clear Distinction Note: Abnormal Users Only -->
              <div class="abnormal-scope-note">
                <Icon icon="fluent:info-16-regular" width="15" height="15" />
                <span>{{ $t('auditOnlyAbnormalUsersNote') }}</span>
              </div>
            </div>

            <!-- Filter Toolbar -->
            <div class="stream-toolbar">
              <div class="toolbar-left">
                <el-input
                  v-model="searchKeyword"
                  size="default"
                  clearable
                  class="search-bar"
                  :placeholder="$t('auditSearchPlaceholder')"
                >
                  <template #prefix>
                    <Icon icon="lucide:search" width="16" height="16" class="search-icon" />
                  </template>
                </el-input>

                <el-select v-model="filterCategory" size="default" class="category-select">
                  <el-option value="all" :label="$t('auditCategoryAll')" />
                  <el-option value="account" :label="$t('auditCategoryAccount')" />
                  <el-option value="security" :label="$t('auditCategorySecurity')" />
                  <el-option value="appeal" :label="$t('auditCategoryAppeal')" />
                </el-select>

                <el-select v-model="filterRiskLevel" size="default" class="risk-select">
                  <el-option value="all" :label="$t('all')" />
                  <el-option value="normal" :label="$t('auditRiskLevelNormal')" />
                  <el-option value="low" :label="$t('auditRiskLevelLow')" />
                  <el-option value="medium" :label="$t('auditRiskLevelMedium')" />
                  <el-option value="high" :label="$t('auditRiskLevelHigh')" />
                </el-select>

                <!-- Date picker is only shown when timestamps exist (Mode 1 & Mode 0) -->
                <el-date-picker
                  v-if="activeMode !== 2"
                  v-model="filterDateRange"
                  type="daterange"
                  size="default"
                  :range-separator="$t('to')"
                  :start-placeholder="$t('auditTimestampFull')"
                  :end-placeholder="$t('auditTimestampFull')"
                  class="date-picker-box"
                />
              </div>

              <div class="toolbar-right">
                <!-- Mode-Driven Automatic Presentation Tag (NO User Choice/Toggle) -->
                <el-tag size="small" :type="activeMode === 2 ? 'warning' : 'primary'" effect="plain" class="presentation-mode-tag">
                  <Icon :icon="activeMode === 2 ? 'fluent:table-20-filled' : 'fluent:timeline-20-filled'" width="14" height="14" style="margin-right: 4px; vertical-align: -2px;" />
                  <span>{{ activeMode === 2 ? $t('auditEncryptedTablePresentation') : $t('auditTimelineStreamPresentation') }}</span>
                </el-tag>
              </div>
            </div>

            <!-- Notice for Mode Restrictions -->
            <div v-if="activeMode === 2" class="mode-alert-bar encrypted-alert">
              <Icon icon="fluent:shield-lock-24-filled" width="18" height="18" />
              <span>{{ $t('auditEncryptedModeNotice') }}</span>
            </div>
            <div v-else-if="activeMode === 0" class="mode-alert-bar privacy-alert">
              <Icon icon="fluent:shield-checkmark-20-filled" width="18" height="18" />
              <span>{{ $t('auditPrivacyModeNotice') }}</span>
            </div>
            <div v-else class="mode-alert-bar allmail-alert">
              <Icon icon="fluent:mail-list-28-regular" width="18" height="18" />
              <span>{{ $t('auditAllMailModeNotice') }}</span>
            </div>

            <!-- Empty State -->
            <div v-if="filteredLogs.length === 0" class="empty-audit-state">
              <Icon icon="fluent:document-search-24-regular" width="56" height="56" class="empty-icon" />
              <div class="empty-title">{{ $t('auditEmptyLogs') }}</div>
              <p class="empty-desc">{{ $t('noMoreData') }}</p>
            </div>

            <!-- MODE 1 & 0: TIMELINE STREAM WITH FULL TIMESTAMPS -->
            <div v-else-if="activeMode !== 2" class="timeline-container">
              <div
                v-for="item in filteredLogs"
                :key="item.id"
                class="timeline-item-card"
                :class="['risk-' + item.riskLevel, 'mode-' + item.securityMode]"
              >
                <!-- Left node indicator -->
                <div class="timeline-indicator">
                  <div class="indicator-icon-wrap" :class="'cat-' + item.category">
                    <Icon :icon="getEventIcon(item.eventType)" width="16" height="16" />
                  </div>
                  <div class="timeline-line"></div>
                </div>

                <!-- Right Card Content -->
                <div class="timeline-content-card">
                  <div class="content-card-header">
                    <div class="event-headline">
                      <!-- 4 Warning Categories Tag -->
                      <el-tag size="small" :type="getWarningMeta(item.warningType).tagType" effect="dark" class="warning-type-tag">
                        <Icon :icon="getWarningMeta(item.warningType).icon" width="12" height="12" style="margin-right: 3px;" />
                        {{ getWarningMeta(item.warningType).label }}
                      </el-tag>

                      <span class="user-email-pill" @click="filterByEmail(item.email)">
                        <Icon icon="fluent:mail-16-regular" width="13" height="13" />
                        {{ item.email }}
                      </span>

                      <span class="event-action-text">{{ item.actionText }}</span>
                    </div>

                    <div class="event-time-badge">
                      <span class="time-text">{{ item.timestamp }}</span>
                    </div>
                  </div>

                  <!-- Details & Metadata -->
                  <div class="content-card-body">
                    <div v-if="item.detailText" class="event-detail-desc">
                      {{ item.detailText }}
                    </div>

                    <!-- Environment & Device Pills -->
                    <div class="env-pills-row">
                      <div class="env-pill ip-pill" :title="'IP: ' + item.ip">
                        <Icon icon="lucide:network" width="13" height="13" />
                        <span>{{ item.ip }}</span>
                        <span class="geo-badge">{{ item.geo }}</span>
                        <span v-if="item.isRegIp" class="reg-tag">{{ $t('auditRegisteredBaseline') }}</span>
                      </div>

                      <div class="env-pill device-pill" :title="item.device">
                        <Icon :icon="getDeviceIcon(item.deviceType)" width="13" height="13" />
                        <span>{{ item.device }}</span>
                        <span class="fp-tag">FP: {{ item.fingerprint }}</span>
                      </div>

                      <div v-if="item.isMultiIpConcurrent" class="env-pill alert-pill">
                        <Icon icon="fluent:warning-16-filled" width="13" height="13" />
                        <span>{{ $t('auditMultiIpConcurrent') }} ({{ item.activeIpCount }} IPs)</span>
                      </div>
                    </div>
                  </div>

                  <!-- Footer Actions: Differentiated between Operate on Target vs Handle Adjudication -->
                  <div class="content-card-footer">
                    <div class="footer-left">
                      <span class="risk-label-tag" :class="'risk-tag-' + item.riskLevel">
                        {{ getRiskLabel(item.riskLevel) }}
                      </span>
                      <span class="mode-tag">{{ getModeLabel(item.securityMode) }}</span>
                    </div>

                    <div class="footer-right">
                      <!-- 前 3 类 (审计、风控、封禁): 对其进行操作 -->
                      <template v-if="item.warningType !== 'appeal'">
                        <span class="action-kind-label">{{ $t('auditOperateTarget') }}:</span>
                        <el-button
                          v-if="item.warningType === 'ban'"
                          size="small"
                          type="success"
                          plain
                          @click="quickUnban(item)"
                        >
                          {{ $t('auditActionDismissAlert') }}
                        </el-button>
                        <el-button
                          v-if="item.warningType === 'ban'"
                          size="small"
                          type="info"
                          plain
                          @click="handleWarningAction('maintain_ban', item)"
                        >
                          {{ $t('auditActionMaintainBan') }}
                        </el-button>
                        <el-button
                          v-if="item.warningType !== 'ban'"
                          size="small"
                          type="warning"
                          plain
                          @click="handleWarningAction('issue_warning', item)"
                        >
                          {{ $t('auditActionIssueWarning') }}
                        </el-button>
                        <el-button
                          v-if="item.warningType !== 'ban'"
                          size="small"
                          type="danger"
                          plain
                          @click="handleWarningAction('ban_account', item)"
                        >
                          {{ $t('auditActionBanAccount') }}
                        </el-button>
                        <el-button
                          size="small"
                          type="info"
                          plain
                          @click="handleWarningAction('purge_session', item)"
                        >
                          {{ $t('auditActionPurgeSession') }}
                        </el-button>
                      </template>

                      <!-- 第 4 类 (申诉警告): 对于处理 -->
                      <template v-else>
                        <span class="action-kind-label text-primary">{{ $t('auditHandleAdjudication') }}:</span>
                        <el-button
                          size="small"
                          type="primary"
                          @click="openAdjudicationDrawer(item)"
                        >
                          <Icon icon="fluent:shield-badge-20-regular" width="14" height="14" style="margin-right: 3px;" />
                          <span>{{ $t('auditActionAdjudicateRelease') }}</span>
                        </el-button>
                        <el-button
                          size="small"
                          type="danger"
                          plain
                          @click="quickReject(item)"
                        >
                          {{ $t('auditActionRejectAppeal') }}
                        </el-button>
                      </template>

                      <!-- 全类别统一详情查看按钮 -->
                      <el-button
                        size="small"
                        type="primary"
                        link
                        class="view-detail-btn"
                        @click="openAdjudicationDrawer(item)"
                      >
                        <span>{{ $t('auditViewDetails') }}</span>
                        <Icon icon="fluent:arrow-up-right-16-regular" width="12" height="12" />
                      </el-button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- MODE 2: ENCRYPTED MODE - ZERO TIMESTAMPS PURE DB NARROW TABLE -->
            <div v-else class="table-container">
              <el-table
                :data="filteredLogs"
                style="width: 100%"
                row-class-name="audit-table-row"
                class="audit-data-table"
              >
                <!-- Column 1: Target Account -->
                <el-table-column :label="$t('userAccount')" width="190">
                  <template #default="{ row }">
                    <div class="table-user-cell">
                      <div class="user-avatar-initial">{{ row.email.slice(0, 1).toUpperCase() }}</div>
                      <div class="user-details">
                        <div class="email-address">{{ row.email }}</div>
                        <div class="account-sub-tags">
                          <span class="role-tag">{{ row.userRole || 'User' }}</span>
                          <el-tag size="small" :type="getWarningMeta(row.warningType).tagType" effect="dark" class="mini-warning-tag">
                            {{ getWarningMeta(row.warningType).label }}
                          </el-tag>
                        </div>
                      </div>
                    </div>
                  </template>
                </el-table-column>

                <!-- Column 2: 预警说明与触发特征 (Narrow & Informative) -->
                <el-table-column :label="$t('auditAlertExplanation')" min-width="220">
                  <template #default="{ row }">
                    <div class="table-alert-cell">
                      <div class="alert-feature-header">
                        <span v-if="row.ticketId" class="alert-ticket-tag font-mono">{{ row.ticketId }}</span>
                        <span class="action-headline-text">{{ row.actionText }}</span>
                      </div>
                      <div class="alert-desc-sub">{{ row.detailText }}</div>
                    </div>
                  </template>
                </el-table-column>

                <!-- Column 3: Active Pool & Environment (ZERO Timestamps) -->
                <el-table-column :label="$t('auditActiveEnvPool')" width="190">
                  <template #default="{ row }">
                    <div class="table-env-cell">
                      <div class="env-line">
                        <Icon icon="lucide:network" width="13" height="13" />
                        <span class="font-mono">{{ row.ip }}</span>
                        <span class="geo-sub">({{ row.geo }})</span>
                      </div>
                      <div class="env-line muted">
                        <Icon :icon="getDeviceIcon(row.deviceType)" width="13" height="13" />
                        <span>{{ row.device }}</span>
                      </div>
                      <div v-if="row.isMultiIpConcurrent" class="concurrent-tag">
                        {{ $t('auditMultiIpConcurrent') }} ({{ row.activeIpCount }} IPs)
                      </div>
                    </div>
                  </template>
                </el-table-column>

                <!-- Column 4: Compliance & Storage Space -->
                <el-table-column :label="$t('tabTotalStorageSpace')" width="170">
                  <template #default="{ row }">
                    <div class="compliance-storage-cell">
                      <div class="storage-row">
                        <span class="c-label">{{ $t('tabStorageSpace') }}:</span>
                        <span class="c-val font-mono">{{ formatUserStorage(row) }}</span>
                      </div>
                      <div class="reports-row">
                        <span class="c-label">{{ $t('tabReportedByOthersCount') }}:</span>
                        <el-tag size="small" :type="row.reportedByOthersCount > 0 ? 'danger' : 'info'" effect="plain">
                          {{ row.reportedByOthersCount || 0 }}
                        </el-tag>
                        <span class="c-label" style="margin-left: 6px;">{{ $t('tabReportedOthersCount') }}:</span>
                        <span class="c-val-sub">{{ row.reportedOthersCount || 0 }}</span>
                      </div>
                    </div>
                  </template>
                </el-table-column>

                <!-- Column 5: Operations & Actions (Distinguishing Operate vs Handle) -->
                <el-table-column :label="$t('tabSetting')" width="230">
                  <template #default="{ row }">
                    <div class="table-actions-cell">
                      <!-- 前 3 类 (审计/风控/封禁): 对其进行操作 -->
                      <template v-if="row.warningType !== 'appeal'">
                        <div class="cell-action-category-label">
                          <span class="action-kind-pill">{{ $t('auditOperateTarget') }}</span>
                          <el-button
                            size="small"
                            type="primary"
                            link
                            class="cell-detail-link"
                            @click="openAdjudicationDrawer(row)"
                          >
                            <span>{{ $t('auditViewDetails') }}</span>
                            <Icon icon="fluent:arrow-up-right-16-regular" width="12" height="12" />
                          </el-button>
                        </div>
                        <div class="cell-action-btns">
                          <el-button
                            v-if="row.warningType === 'ban'"
                            size="small"
                            type="success"
                            plain
                            @click="quickUnban(row)"
                          >
                            {{ $t('auditActionDismissAlert') }}
                          </el-button>
                          <el-button
                            v-if="row.warningType === 'ban'"
                            size="small"
                            type="info"
                            plain
                            @click="handleWarningAction('maintain_ban', row)"
                          >
                            {{ $t('auditActionMaintainBan') }}
                          </el-button>
                          <el-button
                            v-if="row.warningType !== 'ban'"
                            size="small"
                            type="warning"
                            plain
                            @click="handleWarningAction('issue_warning', row)"
                          >
                            {{ $t('auditActionIssueWarning') }}
                          </el-button>
                          <el-button
                            v-if="row.warningType !== 'ban'"
                            size="small"
                            type="danger"
                            plain
                            @click="handleWarningAction('ban_account', row)"
                          >
                            {{ $t('auditActionBanAccount') }}
                          </el-button>
                          <el-button
                            size="small"
                            type="info"
                            plain
                            @click="handleWarningAction('purge_session', row)"
                          >
                            {{ $t('auditActionPurgeSession') }}
                          </el-button>
                        </div>
                      </template>

                      <!-- 第 4 类 (申诉警告): 对于处理 -->
                      <template v-else>
                        <div class="cell-action-category-label text-primary">
                          <span class="action-kind-pill appeal-kind">{{ $t('auditHandleAdjudication') }}</span>
                          <el-button
                            size="small"
                            type="primary"
                            link
                            class="cell-detail-link"
                            @click="openAdjudicationDrawer(row)"
                          >
                            <span>{{ $t('auditViewDetails') }}</span>
                            <Icon icon="fluent:arrow-up-right-16-regular" width="12" height="12" />
                          </el-button>
                        </div>
                        <div class="cell-action-btns">
                          <el-button
                            size="small"
                            type="primary"
                            @click="openAdjudicationDrawer(row)"
                          >
                            {{ $t('auditActionAdjudicateRelease') }}
                          </el-button>
                          <el-button
                            size="small"
                            type="danger"
                            plain
                            @click="quickReject(row)"
                          >
                            {{ $t('auditActionRejectAppeal') }}
                          </el-button>
                        </div>
                      </template>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>

          <!-- TAB 2: 风控研判与申诉工单 (DB Table) -->
          <div v-show="activeTab === 'risk'" class="tab-panel risk-panel">
            <!-- Filter Bar for Appeals -->
            <div class="risk-toolbar">
              <div class="risk-filter-group">
                <el-radio-group v-model="riskStatusFilter" size="default">
                  <el-radio-button value="all">{{ $t('all') }}</el-radio-button>
                  <el-radio-button value="pending">{{ $t('auditAppealStatusPending') }} ({{ pendingAppealsCount }})</el-radio-button>
                  <el-radio-button value="banned">{{ $t('banned') }}</el-radio-button>
                  <el-radio-button value="approved">{{ $t('auditAppealStatusApproved') }}</el-radio-button>
                </el-radio-group>
              </div>

              <div class="risk-search-box">
                <el-input
                  v-model="riskSearchKeyword"
                  size="default"
                  clearable
                  :placeholder="$t('searchByEmail')"
                  class="risk-search-input"
                >
                  <template #prefix>
                    <Icon icon="lucide:search" width="16" height="16" />
                  </template>
                </el-input>
              </div>
            </div>

            <!-- Risk Control DB Table -->
            <div class="risk-table-wrap">
              <el-table
                :data="filteredRiskCases"
                style="width: 100%"
                row-class-name="risk-case-row"
                class="risk-data-table"
              >
                <!-- Ticket ID Column -->
                <el-table-column :label="$t('auditTicketId')" width="170">
                  <template #default="{ row }">
                    <div class="ticket-id-cell font-mono">
                      <span class="ticket-code">{{ row.ticketId || ('TKT-2026-' + row.id) }}</span>
                    </div>
                  </template>
                </el-table-column>

                <!-- Target Account -->
                <el-table-column :label="$t('tabEmailAddress')" min-width="210">
                  <template #default="{ row }">
                    <div class="account-cell">
                      <div class="account-avatar">{{ row.email.slice(0, 1).toUpperCase() }}</div>
                      <div class="account-meta">
                        <div class="account-email">{{ row.email }}</div>
                        <div class="account-tags">
                          <el-tag size="small" :type="getStatusTagType(row.status)">
                            {{ getStatusLabel(row.status) }}
                          </el-tag>
                          <span v-if="row.hasAppeal" class="appeal-badge">{{ $t('auditCategoryAppeal') }}</span>
                        </div>
                      </div>
                    </div>
                  </template>
                </el-table-column>

                <!-- Registration Baseline (Environment) -->
                <el-table-column :label="$t('auditRegisteredBaseline')" min-width="210">
                  <template #default="{ row }">
                    <div class="baseline-cell">
                      <div class="baseline-item">
                        <Icon icon="lucide:network" width="13" height="13" />
                        <span>{{ row.regIp }} ({{ row.regGeo }})</span>
                      </div>
                      <div class="baseline-item muted">
                        <Icon :icon="getDeviceIcon(row.regDeviceType)" width="13" height="13" />
                        <span>{{ row.regDevice }}</span>
                      </div>
                      <div class="baseline-item fp">
                        <span>FP: {{ row.regFingerprint }}</span>
                      </div>
                    </div>
                  </template>
                </el-table-column>

                <!-- Active Pool (Max 3 IPs & 3 Devices) -->
                <el-table-column :label="$t('auditActiveEnvPool')" min-width="230">
                  <template #default="{ row }">
                    <div class="active-pool-cell">
                      <div class="pool-header">
                        <span>{{ $t('auditMaxIpLimit') }}: {{ row.activeIps.length }}/{{ settingForm.auditMaxIpPerAccount }}</span>
                        <span>{{ $t('auditMaxDeviceLimit') }}: {{ row.activeDevices.length }}/{{ settingForm.auditMaxDevicePerAccount }}</span>
                      </div>
                      <!-- IP tags -->
                      <div class="ip-tags-flow">
                        <el-tag
                          v-for="(ipObj, idx) in row.activeIps"
                          :key="idx"
                          size="small"
                          effect="plain"
                          class="ip-pool-tag"
                          :type="ipObj.isCurrent ? 'primary' : 'info'"
                        >
                          {{ ipObj.ip }}
                        </el-tag>
                      </div>
                      <!-- Concurrent Alert -->
                      <div v-if="row.isConcurrent" class="concurrent-notice">
                        <Icon icon="fluent:alert-16-filled" width="13" height="13" />
                        <span>{{ $t('auditMultiIpConcurrent') }}</span>
                      </div>
                    </div>
                  </template>
                </el-table-column>

                <!-- Appeal Statement & Docs Portal Link -->
                <el-table-column :label="$t('auditAppealReason')" min-width="240">
                  <template #default="{ row }">
                    <div v-if="row.hasAppeal" class="appeal-statement-cell">
                      <div class="appeal-quote">“{{ row.appealReason }}”</div>
                      <div class="appeal-time muted">
                        <span v-if="activeMode === 2">{{ $t('auditTimestampStripped') }}</span>
                        <span v-else>{{ row.appealTime }}</span>
                      </div>
                      <div class="appeal-portal-link">
                        <el-button link type="primary" size="small" @click="openExternalAppealPortal('form')">
                          <Icon icon="fluent:document-person-16-regular" width="13" height="13" style="margin-right: 3px;" />
                          <span>{{ $t('auditExternalPortalBadge') }}</span>
                          <Icon icon="fluent:arrow-up-right-16-regular" width="12" height="12" style="margin-left: 2px;" />
                        </el-button>
                      </div>
                    </div>
                    <div v-else class="text-muted">
                      -
                    </div>
                  </template>
                </el-table-column>

                <!-- Adjudication Assessment & Match Score -->
                <el-table-column :label="$t('auditDeviceFingerprintMatch')" width="170">
                  <template #default="{ row }">
                    <div class="assessment-cell">
                      <div class="score-line">
                        <span class="score-text" :class="getScoreColorClass(row.matchScore)">{{ row.matchScore }}%</span>
                        <span class="score-desc">{{ getMatchDesc(row.matchScore) }}</span>
                      </div>
                      <div class="subnet-line">
                        <span class="subnet-badge" :class="row.subnetMatch ? 'match' : 'mismatch'">
                          {{ row.subnetMatch ? $t('auditIpSubnetMatch') + ' ✓' : $t('auditIpSubnetMatch') + ' ✗' }}
                        </span>
                      </div>
                    </div>
                  </template>
                </el-table-column>

                <!-- Actions (Preserves exact assertions) -->
                <el-table-column :label="$t('action')" width="220" fixed="right">
                  <template #default="{ row }">
                    <div class="risk-actions-cell">
                      <el-button
                        size="small"
                        type="primary"
                        @click="openAdjudicationDrawer(row)"
                      >
                        {{ $t('auditActionAdjudicateRelease') }}
                      </el-button>

                      <el-button
                        v-if="row.status === 'banned' || row.status === 'pending'"
                        size="small"
                        type="success"
                        plain
                        @click="quickUnban(row)"
                      >
                        {{ $t('auditApproveUnban') }}
                      </el-button>

                      <el-button
                        v-if="row.status === 'pending'"
                        size="small"
                        type="danger"
                        plain
                        @click="quickReject(row)"
                      >
                        {{ $t('auditRejectAppeal') }}
                      </el-button>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>

          <!-- TAB 3: 记录策略与容量配置 -->
          <div v-show="activeTab === 'policy'" class="tab-panel policy-panel">
            <div class="card-grid">
              
              <!-- Card 1: 全部邮件模式细分事件录制开关 -->
              <div class="settings-card">
                <div class="card-title">
                  <Icon icon="fluent:mail-settings-20-regular" width="18" height="18" />
                  <span>{{ $t('auditModeLevel1') }} - {{ $t('auditTabPolicy') }}</span>
                </div>
                <div class="card-content">
                  <div class="card-intro-notice">
                    <Icon icon="fluent:info-16-regular" width="16" height="16" />
                    <span>{{ $t('auditOptNoticeDefaultOff') }}</span>
                  </div>

                  <div class="setting-item" :class="{ disabled: activeMode !== 1 }">
                    <div class="item-meta">
                      <span class="item-title">{{ $t('auditOptMailSend') }}</span>
                      <span class="item-desc">{邮箱}发送{邮件} - 包含收件人与主题时序帧</span>
                    </div>
                    <el-switch
                      v-model="settingForm.auditOptMailSend"
                      :disabled="activeMode !== 1"
                      :active-value="1"
                      :inactive-value="0"
                      @change="handleSettingChange"
                    />
                  </div>

                  <div class="setting-item" :class="{ disabled: activeMode !== 1 }">
                    <div class="item-meta">
                      <span class="item-title">{{ $t('auditOptMailReceive') }}</span>
                      <span class="item-desc">{邮箱}接收{邮件} - 包含发件人与投递结果</span>
                    </div>
                    <el-switch
                      v-model="settingForm.auditOptMailReceive"
                      :disabled="activeMode !== 1"
                      :active-value="1"
                      :inactive-value="0"
                      @change="handleSettingChange"
                    />
                  </div>

                  <div class="setting-item" :class="{ disabled: activeMode !== 1 }">
                    <div class="item-meta">
                      <span class="item-title">{{ $t('auditOptMailDelete') }}</span>
                      <span class="item-desc">{邮箱}删除{邮件} - 移至废纸篓或物理抹除</span>
                    </div>
                    <el-switch
                      v-model="settingForm.auditOptMailDelete"
                      :disabled="activeMode !== 1"
                      :active-value="1"
                      :inactive-value="0"
                      @change="handleSettingChange"
                    />
                  </div>

                  <div class="setting-item" :class="{ disabled: activeMode !== 1 }">
                    <div class="item-meta">
                      <span class="item-title">{{ $t('auditOptMailStar') }}</span>
                      <span class="item-desc">{邮箱}星标{邮件} - 标记/取消星标</span>
                    </div>
                    <el-switch
                      v-model="settingForm.auditOptMailStar"
                      :disabled="activeMode !== 1"
                      :active-value="1"
                      :inactive-value="0"
                      @change="handleSettingChange"
                    />
                  </div>

                  <div class="setting-item" :class="{ disabled: activeMode !== 1 }">
                    <div class="item-meta">
                      <span class="item-title">{{ $t('auditOptMailSchedule') }}</span>
                      <span class="item-desc">{邮箱}定时{邮件} - 计划发送事件</span>
                    </div>
                    <el-switch
                      v-model="settingForm.auditOptMailSchedule"
                      :disabled="activeMode !== 1"
                      :active-value="1"
                      :inactive-value="0"
                      @change="handleSettingChange"
                    />
                  </div>
                </div>
              </div>

              <!-- Card 2: 多设备与多IP防爆库配额 -->
              <div class="settings-card">
                <div class="card-title">
                  <Icon icon="fluent:database-person-20-regular" width="18" height="18" />
                  <span>{{ $t('auditActiveEnvPool') }} - {{ $t('SystemSettings') }}</span>
                </div>
                <div class="card-content">
                  <div class="setting-item">
                    <div class="item-meta">
                      <span class="item-title">{{ $t('auditMaxIpLimit') }}</span>
                      <span class="item-desc">{{ $t('auditMaxIpLimitDesc') }}</span>
                    </div>
                    <el-input-number
                      v-model="settingForm.auditMaxIpPerAccount"
                      :min="1"
                      :max="10"
                      size="small"
                      controls-position="right"
                      @change="handleSettingChange"
                    />
                  </div>

                  <div class="setting-item">
                    <div class="item-meta">
                      <span class="item-title">{{ $t('auditMaxDeviceLimit') }}</span>
                      <span class="item-desc">{{ $t('auditMaxDeviceLimitDesc') }}</span>
                    </div>
                    <el-input-number
                      v-model="settingForm.auditMaxDevicePerAccount"
                      :min="1"
                      :max="10"
                      size="small"
                      controls-position="right"
                      @change="handleSettingChange"
                    />
                  </div>

                  <div class="setting-item">
                    <div class="item-meta">
                      <span class="item-title">{{ $t('auditCriticalQuota') }}</span>
                      <span class="item-desc">{{ $t('auditCriticalQuotaDesc') }}</span>
                    </div>
                    <el-input-number
                      v-model="settingForm.auditCriticalQuota"
                      :min="1"
                      :max="20"
                      size="small"
                      controls-position="right"
                      @change="handleSettingChange"
                    />
                  </div>
                </div>
              </div>

              <!-- Card 3: 自动化存储与非重要记录清理策略 -->
              <div class="settings-card">
                <div class="card-title">
                  <Icon icon="fluent:broom-sparkle-16-regular" width="18" height="18" />
                  <span>{{ $t('auditAutoCleanOldest') }}</span>
                </div>
                <div class="card-content">
                  <div class="setting-item">
                    <div class="item-meta">
                      <span class="item-title">{{ $t('auditAutoCleanOldest') }}</span>
                      <span class="item-desc">{{ $t('auditAutoCleanOldestDesc') }}</span>
                    </div>
                    <el-switch
                      v-model="settingForm.auditAutoCleanOldest"
                      :active-value="1"
                      :inactive-value="0"
                      @change="handleSettingChange"
                    />
                  </div>

                  <div class="setting-item">
                    <div class="item-meta">
                      <span class="item-title">{{ $t('auditPrioritizeNonCriticalClean') }}</span>
                      <span class="item-desc">{{ $t('auditPrioritizeNonCriticalCleanDesc') }}</span>
                    </div>
                    <el-switch
                      v-model="settingForm.auditPrioritizeNonCriticalClean"
                      :active-value="1"
                      :inactive-value="0"
                      @change="handleSettingChange"
                    />
                  </div>

                  <!-- Quick Purge Operations -->
                  <div class="maintenance-action-box">
                    <div class="action-info">
                      <div class="action-title">{{ $t('auditClearHistorical') }}</div>
                      <div class="action-desc">{{ $t('auditClearHistoricalConfirm') }}</div>
                    </div>
                    <el-button
                      type="danger"
                      plain
                      size="small"
                      :loading="isPurging"
                      @click="triggerPurgeNonCritical"
                    >
                      <Icon icon="fluent:delete-16-regular" width="15" height="15" />
                      <span>{{ $t('auditClearHistorical') }}</span>
                    </el-button>
                  </div>
                </div>
              </div>

              <!-- Card 4: 对外表单与风控流转架构说明 (Preserves exact assertions) -->
              <div class="settings-card architecture-card">
                <div class="card-title">
                  <Icon icon="fluent:diagram-tree-20-regular" width="18" height="18" />
                  <span>{{ $t('auditArchitectureTitle') }}</span>
                </div>
                <div class="card-content">
                  <p class="arch-desc">{{ $t('auditArchitectureDesc') }}</p>
                  <div class="arch-flow-diagram">
                    <div class="flow-step">
                      <div class="flow-step-icon">
                        <Icon icon="fluent:person-support-20-regular" width="20" height="20" />
                      </div>
                      <div class="flow-step-text">
                        <strong>epomail-docs</strong>
                        <span>{{ $t('auditArchStepDocs') }}</span>
                      </div>
                    </div>
                    <div class="flow-arrow">➜</div>
                    <div class="flow-step">
                      <div class="flow-step-icon">
                        <Icon icon="fluent:fingerprint-20-regular" width="20" height="20" />
                      </div>
                      <div class="flow-step-text">
                        <strong>Cloudflare KV / D1</strong>
                        <span>{{ $t('auditArchStepCloud') }}</span>
                      </div>
                    </div>
                    <div class="flow-arrow">➜</div>
                    <div class="flow-step highlight">
                      <div class="flow-step-icon">
                        <Icon icon="fluent:shield-task-20-regular" width="20" height="20" />
                      </div>
                      <div class="flow-step-text">
                        <strong>epocanvas-mail</strong>
                        <span>{{ $t('auditArchStepAdmin') }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="arch-action-row">
                    <el-button type="primary" size="small" plain @click="openExternalAppealPortal('form')">
                      <Icon icon="fluent:open-20-regular" width="14" height="14" style="margin-right: 4px;" />
                      {{ $t('auditViewExternalAppealDocs') }} (docs.epocanvas.com)
                    </el-button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>
    </el-scrollbar>

    <!-- Side-by-side Appeal Adjudication & Environment Audit Drawer (Extended Page) -->
    <el-drawer
      v-model="adjudicationDrawerVisible"
      :title="$t('auditAdjudicationModalTitle')"
      size="640px"
      direction="rtl"
      class="audit-adjudication-drawer"
      :before-close="handleDrawerClose"
    >
      <div v-if="selectedCase" class="drawer-content">
        <!-- Target User Hero Card -->
        <div class="drawer-user-hero">
          <div class="hero-avatar">{{ selectedCase.email.slice(0, 1).toUpperCase() }}</div>
          <div class="hero-meta">
            <div class="hero-email">{{ selectedCase.email }}</div>
            <div class="hero-badges">
              <el-tag size="small" :type="getStatusTagType(selectedCase.status)">
                {{ getStatusLabel(selectedCase.status) }}
              </el-tag>
              <el-tag size="small" :type="getWarningMeta(selectedCase.warningType).tagType" effect="dark">
                {{ getWarningMeta(selectedCase.warningType).label }}
              </el-tag>
              <el-tag v-if="selectedCase.ticketId" size="small" type="info" class="font-mono">
                {{ selectedCase.ticketId }}
              </el-tag>
            </div>
          </div>
        </div>

        <!-- Side-by-Side Environment Comparison Matrix -->
        <div class="comparison-section">
          <div class="comparison-grid">
            <!-- Left: Registered Baseline (Preserves .baseline-card) -->
            <div class="comparison-card baseline-card">
              <div class="card-header">
                <Icon icon="fluent:shield-keyhole-20-regular" width="16" height="16" />
                <span>{{ $t('auditRegisteredBaseline') }}</span>
              </div>
              <div class="card-rows">
                <div class="c-row">
                  <span class="label">IP:</span>
                  <span class="val font-mono">{{ selectedCase.regIp || selectedCase.ip }}</span>
                </div>
                <div class="c-row">
                  <span class="label">Geo:</span>
                  <span class="val">{{ selectedCase.regGeo || selectedCase.geo }}</span>
                </div>
                <div class="c-row">
                  <span class="label">Device:</span>
                  <span class="val">{{ selectedCase.regDevice || selectedCase.device }}</span>
                </div>
                <div class="c-row">
                  <span class="label">Fingerprint:</span>
                  <span class="val font-mono">{{ selectedCase.regFingerprint || selectedCase.fingerprint }}</span>
                </div>
              </div>
            </div>

            <!-- Right: Appeal Submission Environment (Preserves .appeal-card) -->
            <div class="comparison-card appeal-card">
              <div class="card-header">
                <Icon icon="fluent:document-person-20-regular" width="16" height="16" />
                <span>{{ $t('auditAppealEnv') }}</span>
              </div>
              <div class="card-rows">
                <div class="c-row">
                  <span class="label">IP:</span>
                  <span class="val font-mono" :class="{ 'text-success': selectedCase.subnetMatch }">
                    {{ selectedCase.appealIp || selectedCase.ip }}
                  </span>
                </div>
                <div class="c-row">
                  <span class="label">Geo:</span>
                  <span class="val">{{ selectedCase.appealGeo || selectedCase.geo }}</span>
                </div>
                <div class="c-row">
                  <span class="label">Device:</span>
                  <span class="val">{{ selectedCase.appealDevice || selectedCase.device }}</span>
                </div>
                <div class="c-row">
                  <span class="label">Fingerprint:</span>
                  <span class="val font-mono" :class="{ 'text-success': selectedCase.matchScore >= 90 }">
                    {{ selectedCase.appealFingerprint || selectedCase.fingerprint }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Match Score Analysis Banner -->
          <div class="match-summary-box" :class="getScoreColorClass(selectedCase.matchScore)">
            <div class="match-score-big">{{ selectedCase.matchScore }}%</div>
            <div class="match-details">
              <div class="match-title">
                {{ $t('auditDeviceFingerprintMatch') }}: {{ getMatchDesc(selectedCase.matchScore) }}
              </div>
              <div class="match-sub">
                {{ selectedCase.subnetMatch ? $t('auditIpSubnetMatch') + ' (同ISP子网) ✓' : $t('auditIpSubnetMatch') + ' (跨ISP/异地) ✗' }}
              </div>
            </div>
          </div>
        </div>

        <!-- Appeal Statement Form Data -->
        <div class="appeal-form-section">
          <div class="section-title">
            <Icon icon="fluent:text-bullet-list-square-20-regular" width="16" height="16" />
            <span>{{ $t('auditAppealReason') }}</span>
          </div>
          <div class="appeal-statement-bubble">
            <p>{{ selectedCase.appealReason || selectedCase.detailText || '用户自述：因近期在多设备间同步邮件，且使用公共漫游热点产生并发多IP记录，导致账户被安全风控自动阻断。特提交申诉申请核验注册基准指纹并予以解除封禁放行。' }}</p>
            <div class="bubble-meta">
              <span v-if="activeMode === 2" class="time-muted">{{ $t('auditTimestampStripped') }}</span>
              <span v-else class="time-muted">{{ selectedCase.appealTime || selectedCase.timestamp }}</span>
            </div>
          </div>
        </div>

        <!-- External Form Source Banner (Preserves .drawer-external-portal-box) -->
        <div class="drawer-external-portal-box">
          <div class="depb-header">
            <span class="depb-badge">
              <Icon icon="fluent:globe-shield-20-regular" width="14" height="14" />
              <span>{{ $t('auditExternalPortalBadge') }}</span>
            </span>
            <el-button link type="primary" size="small" @click="openExternalAppealPortal('form')">
              <span>{{ $t('auditViewExternalAppealDocs') }}</span>
              <Icon icon="fluent:arrow-up-right-16-regular" width="13" height="13" />
            </el-button>
          </div>
          <p class="depb-desc">{{ $t('auditExternalAppealDesc') }}</p>
        </div>

        <!-- Multi-IP Pool Inspection -->
        <div class="active-ip-section">
          <div class="section-title">
            <Icon icon="lucide:network" width="16" height="16" />
            <span>{{ $t('auditActiveEnvPool') }} (Max {{ settingForm.auditMaxIpPerAccount }} IPs / {{ settingForm.auditMaxDevicePerAccount }} Devices)</span>
          </div>
          <div class="ip-list-chips">
            <div
              v-for="(ipItem, i) in (selectedCase.activeIps || [{ ip: selectedCase.ip, geo: selectedCase.geo, isCurrent: true }])"
              :key="i"
              class="ip-chip-item"
              :class="{ current: ipItem.isCurrent }"
            >
              <Icon icon="lucide:network" width="13" height="13" />
              <span class="chip-ip font-mono">{{ ipItem.ip }}</span>
              <span class="chip-geo">({{ ipItem.geo || 'Unknown' }})</span>
              <span v-if="ipItem.isCurrent" class="chip-status">{{ $t('active') }}</span>
            </div>
          </div>
        </div>

        <!-- Adjudication Decision Panel -->
        <div class="decision-panel">
          <div class="section-title">
            <Icon icon="fluent:gavel-20-regular" width="16" height="16" />
            <span>{{ $t('auditAdjudicationNotes') }}</span>
          </div>

          <div class="decision-radio-group">
            <el-radio-group v-model="decisionForm.action" size="default">
              <el-radio-button value="approve">{{ $t('auditApproveUnban') }}</el-radio-button>
              <el-radio-button value="probation">{{ $t('auditProbationRelease') }}</el-radio-button>
              <el-radio-button value="reject">{{ $t('auditRejectAppeal') }}</el-radio-button>
            </el-radio-group>
          </div>

          <el-input
            v-model="decisionForm.notes"
            type="textarea"
            :rows="3"
            class="decision-textarea"
            :placeholder="$t('auditAdjudicationPlaceholder')"
          />

          <div class="purge-checkbox-row">
            <el-checkbox v-model="decisionForm.purgeOnRelease">
              {{ $t('auditPurgeOnRelease') }}
            </el-checkbox>
          </div>

          <div class="drawer-actions">
            <el-button @click="adjudicationDrawerVisible = false">{{ $t('cancel') }}</el-button>
            <el-button
              type="primary"
              :loading="isSubmittingDecision"
              @click="submitAdjudication"
            >
              {{ $t('confirm') }}
            </el-button>
          </div>
        </div>

      </div>
    </el-drawer>

  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Icon } from '@iconify/vue';
import loading from '@/components/loading/index.vue';
import { useSettingStore } from '@/store/setting.js';
import { useUserStore } from '@/store/user.js';
import { formatBytes } from '@/utils/file-utils.js';
import { getOfficialLink } from '@/const/links-const.js';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const settingStore = useSettingStore();
const userStore = useUserStore();

const goToSysSetting = () => {
  const roleGroup = route.params.roleGroup || 'admin';
  router.push(`/manage/${roleGroup}/system`);
};

const openExternalAppealPortal = (type = 'form') => {
  const docsBase = getOfficialLink('docs', settingStore) || 'https://docs.epocanvas.com/epomail';
  const lang = settingStore.settings?.lang || 'zh';
  if (type === 'form') {
    window.open(`${docsBase}/appeal/?lang=${lang}`, '_blank');
  } else {
    let prefix = '';
    if (lang === 'zh-Hant') prefix = '/zh-tw';
    else if (lang === 'en') prefix = '/en';
    else if (lang === 'es') prefix = '/es';
    else if (lang === 'fr') prefix = '/fr';
    else if (lang === 'nl') prefix = '/nl';
    window.open(`${docsBase}${prefix}/mail/appeal/`, '_blank');
  }
};

const firstLoading = ref(true);
const activeTab = ref('stream'); // 'stream' | 'risk' | 'policy'

// Security Mode: 1: All Mail Mode (全部模式), 0: Privacy Mode (隐私模式), 2: Encrypted Mode (加密模式)
const activeMode = ref(Number(settingStore.settings?.allMailMode ?? 1));

// Filter States
const filterWarningType = ref('all'); // 'all' | 'audit' | 'risk' | 'ban' | 'appeal'
const searchKeyword = ref('');
const filterCategory = ref('all');
const filterRiskLevel = ref('all');
const filterDateRange = ref(null);

const riskStatusFilter = ref('all');
const riskSearchKeyword = ref('');

// Drawer States
const adjudicationDrawerVisible = ref(false);
const selectedCase = ref(null);
const isSubmittingDecision = ref(false);
const isPurging = ref(false);

const decisionForm = reactive({
  action: 'approve',
  notes: '',
  purgeOnRelease: true
});

// Setting / Policy Form
const settingForm = reactive({
  auditOptMailSend: Number(settingStore.settings?.auditOptMailSend ?? 0),
  auditOptMailReceive: Number(settingStore.settings?.auditOptMailReceive ?? 0),
  auditOptMailDelete: Number(settingStore.settings?.auditOptMailDelete ?? 0),
  auditOptMailStar: Number(settingStore.settings?.auditOptMailStar ?? 0),
  auditOptMailSchedule: Number(settingStore.settings?.auditOptMailSchedule ?? 0),
  auditMaxIpPerAccount: Number(settingStore.settings?.auditMaxIpPerAccount ?? 3),
  auditMaxDevicePerAccount: Number(settingStore.settings?.auditMaxDevicePerAccount ?? 3),
  auditCriticalQuota: Number(settingStore.settings?.auditCriticalQuota ?? 3),
  auditAutoCleanOldest: Number(settingStore.settings?.auditAutoCleanOldest ?? 1),
  auditPrioritizeNonCriticalClean: Number(settingStore.settings?.auditPrioritizeNonCriticalClean ?? 1)
});

// Mode metadata computed
const currentModeMeta = computed(() => {
  if (activeMode.value === 1) {
    return {
      title: t('auditModeLevel1'),
      tagType: 'primary',
      icon: 'fluent:mail-list-28-regular',
      notice: t('auditAllMailModeNotice')
    };
  } else if (activeMode.value === 0) {
    return {
      title: t('auditModeLevel2'),
      tagType: 'success',
      icon: 'fluent:shield-checkmark-20-filled',
      notice: t('auditPrivacyModeNotice')
    };
  } else {
    return {
      title: t('auditModeLevel3'),
      tagType: 'warning',
      icon: 'fluent:shield-lock-24-filled',
      notice: t('auditEncryptedModeNotice')
    };
  }
});

const activeModeText = computed(() => {
  return currentModeMeta.value.title;
});

// Helper for formatting storage bytes
function formatUserStorage(row) {
  if (!row) return '0 B';
  if (row.storageSize) {
    return typeof row.storageSize === 'number' ? formatBytes(row.storageSize) : row.storageSize;
  }
  return '15.8 MB';
}

// 4 Warning Category Metadata Helper
function getWarningMeta(type) {
  switch (type) {
    case 'audit':
      return {
        label: t('auditTypeAuditWarning'),
        desc: t('auditTypeAuditWarningDesc'),
        tagType: 'warning',
        icon: 'fluent:shield-question-20-filled',
        actionKind: 'operate'
      };
    case 'risk':
      return {
        label: t('auditTypeRiskWarning'),
        desc: t('auditTypeRiskWarningDesc'),
        tagType: 'danger',
        icon: 'fluent:alert-urgent-20-filled',
        actionKind: 'operate'
      };
    case 'ban':
      return {
        label: t('auditTypeBanWarning'),
        desc: t('auditTypeBanWarningDesc'),
        tagType: 'info',
        icon: 'fluent:prohibited-20-filled',
        actionKind: 'operate'
      };
    case 'appeal':
      return {
        label: t('auditTypeAppealWarning'),
        desc: t('auditTypeAppealWarningDesc'),
        tagType: 'primary',
        icon: 'fluent:document-person-20-filled',
        actionKind: 'handle'
      };
    default:
      return {
        label: t('auditTypeAllAlerts'),
        desc: '',
        tagType: 'info',
        icon: 'fluent:info-20-filled',
        actionKind: 'operate'
      };
  }
}

// Comprehensive Alert Logs: 100% Flagged/Abnormal Users (Zero normal routine traffic)
const allLogs = ref([
  {
    id: 101,
    ticketId: 'TKT-2026-ZS88K1',
    email: 'zhangsan@epocanvas.com',
    userRole: '普通用户 LV.1',
    warningType: 'risk', // 风控警告
    eventType: 'risk_spike',
    category: 'security',
    actionText: '{zhangsan@epocanvas.com} 触发异地多IP跨国漫游跳跃',
    detailText: '检测到 4-IP 并发跨国跳跃 (Seoul + Tokyo + Frankfurt)，触碰高频风控红线，需重点关注。',
    ip: '192.0.2.145',
    geo: 'Seoul, KR',
    device: 'Chrome 128 / macOS 14.6',
    deviceType: 'desktop',
    fingerprint: 'fp_a98e21',
    isRegIp: false,
    isMultiIpConcurrent: true,
    activeIpCount: 4,
    reportedByOthersCount: 1,
    reportedOthersCount: 0,
    storageSize: 25690112, // 24.5 MB
    timestamp: '2026-10-03 01:10:45',
    securityMode: 1,
    riskLevel: 'high',
    status: 'monitored'
  },
  {
    id: 102,
    ticketId: 'TKT-2026-SP44B1',
    email: 'spammer_bulk@partner.org',
    userRole: '临时账号',
    warningType: 'audit', // 审计警告
    eventType: 'reported_spam',
    category: 'account',
    actionText: '{spammer_bulk@partner.org} 被 4 名用户检举商业广告',
    detailText: '短时间内向多位站内用户大量投递未经许可的营销外链，违规检举成立，需进行管控操作。',
    ip: '45.33.32.156',
    geo: 'Fremont, US',
    device: 'HeadlessChrome / Linux',
    deviceType: 'desktop',
    fingerprint: 'fp_bot_001',
    isRegIp: false,
    isMultiIpConcurrent: false,
    activeIpCount: 1,
    reportedByOthersCount: 4,
    reportedOthersCount: 0,
    storageSize: 123928576, // 118.2 MB
    timestamp: '2026-10-02 23:45:10',
    securityMode: 1,
    riskLevel: 'high',
    status: 'monitored'
  },
  {
    id: 103,
    ticketId: 'TKT-2026-EV99X0',
    email: 'evil_scanner@dark.net',
    userRole: '受限制账号',
    warningType: 'ban', // 封禁警告
    eventType: 'banned',
    category: 'security',
    actionText: '{evil_scanner@dark.net} 触碰撞库红线被系统封禁',
    detailText: '单日异地高频尝试撞库暴力破解，触碰系统最高安全红线，当前已被系统全自动封禁。',
    ip: '185.220.101.5',
    geo: 'Frankfurt, DE',
    device: 'Python-Requests / Linux',
    deviceType: 'desktop',
    fingerprint: 'fp_scanner_66',
    isRegIp: false,
    isMultiIpConcurrent: true,
    activeIpCount: 3,
    reportedByOthersCount: 8,
    reportedOthersCount: 0,
    storageSize: 0,
    timestamp: '2026-10-02 18:30:00',
    securityMode: 2,
    riskLevel: 'high',
    status: 'banned'
  },
  {
    id: 104,
    ticketId: 'TKT-2026-CH78A9',
    email: 'charlie@epocanvas.com',
    userRole: '普通用户 LV.0',
    warningType: 'appeal', // 申诉警告
    eventType: 'appeal',
    category: 'appeal',
    actionText: '{charlie@epocanvas.com} 提交工单 #TKT-2026-CH78A9',
    detailText: '出差旅行期间连接酒店 WiFi 发生多IP并发跳跃导致误判封禁，设备指纹基线吻合度 98%，请求研判放行。',
    ip: '198.51.100.88',
    geo: 'Tokyo, JP',
    device: 'Chrome 128 / macOS 14.6',
    deviceType: 'desktop',
    fingerprint: 'fp_a98e21',
    isRegIp: false,
    isMultiIpConcurrent: false,
    activeIpCount: 2,
    reportedByOthersCount: 0,
    reportedOthersCount: 1,
    storageSize: 16568320, // 15.8 MB
    timestamp: '2026-10-03 06:30:19',
    securityMode: 2,
    riskLevel: 'medium',
    status: 'pending',
    appealId: 201
  },
  {
    id: 105,
    ticketId: 'TKT-2026-PI99R2',
    email: 'pilot-recovery@epocanvas.com',
    userRole: '普通用户 LV.1',
    warningType: 'appeal', // 申诉警告
    eventType: 'appeal',
    category: 'appeal',
    actionText: '{pilot-recovery@epocanvas.com} 提交工单 #TKT-2026-PI99R2',
    detailText: '出差忘失第二重会话凭证，通过 epomail-docs 官方表单提交凭证重置与环境核验申诉。',
    ip: '198.51.100.24',
    geo: 'Tokyo, JP',
    device: 'Safari 18 / iOS 18.0',
    deviceType: 'mobile',
    fingerprint: 'fp_77bc40',
    isRegIp: true,
    isMultiIpConcurrent: false,
    activeIpCount: 1,
    reportedByOthersCount: 0,
    reportedOthersCount: 0,
    storageSize: 8598320, // 8.2 MB
    timestamp: '2026-10-03 07:15:00',
    securityMode: 1,
    riskLevel: 'medium',
    status: 'pending',
    appealId: 202
  },
  {
    id: 106,
    ticketId: 'TKT-2026-BO99X2',
    email: 'bob_suspicious@epocanvas.com',
    userRole: '普通用户 LV.0',
    warningType: 'audit', // 审计警告
    eventType: 'reported_phish',
    category: 'account',
    actionText: '{bob_suspicious@epocanvas.com} 被 2 名用户检举敏感外链',
    detailText: '检测到发送带有未备案短链的敏感邮件，被 2 名收件人标记检举，列入重点审计观察池。',
    ip: '203.0.113.89',
    geo: 'Osaka, JP',
    device: 'Safari 18 / iOS 18.0',
    deviceType: 'mobile',
    fingerprint: 'fp_77bc40',
    isRegIp: false,
    isMultiIpConcurrent: false,
    activeIpCount: 2,
    reportedByOthersCount: 2,
    reportedOthersCount: 0,
    storageSize: 44145000, // 42.1 MB
    timestamp: '2026-10-02 14:02:11',
    securityMode: 0,
    riskLevel: 'medium',
    status: 'monitored'
  },
  {
    id: 107,
    ticketId: 'TKT-2026-CM55Q9',
    email: 'compromised_acc@epocanvas.com',
    userRole: '普通用户 LV.0',
    warningType: 'ban', // 封禁警告
    eventType: 'banned',
    category: 'security',
    actionText: '{compromised_acc@epocanvas.com} 异构设备接管已实施预防性封禁',
    detailText: '异构未授权设备在凌晨非活跃时段大量投递未知附件，系统判定账号失陷，执行紧急封禁。',
    ip: '103.251.167.20',
    geo: 'Singapore, SG',
    device: 'Edge 128 / Windows 11',
    deviceType: 'desktop',
    fingerprint: 'fp_random_99',
    isRegIp: false,
    isMultiIpConcurrent: false,
    activeIpCount: 1,
    reportedByOthersCount: 5,
    reportedOthersCount: 0,
    storageSize: 67108864, // 64 MB
    timestamp: '2026-10-02 11:15:40',
    securityMode: 2,
    riskLevel: 'high',
    status: 'banned'
  }
]);

// Risk Cases (Dedicated Adjudication Workbench)
const riskCases = ref([
  {
    id: 1,
    ticketId: 'TKT-2026-CH78A9',
    sessionHash: 'f_9c71a4f028d7b3e1',
    email: 'charlie@epocanvas.com',
    warningType: 'appeal',
    status: 'pending',
    hasAppeal: true,
    regIp: '198.51.100.24',
    regGeo: 'Tokyo, JP',
    regDevice: 'Chrome 128 / macOS 14.6',
    regDeviceType: 'desktop',
    regFingerprint: 'fp_a98e21',
    activeIps: [
      { ip: '198.51.100.24', geo: 'Tokyo, JP', isCurrent: false },
      { ip: '198.51.100.88', geo: 'Tokyo, JP', isCurrent: true },
      { ip: '192.0.2.145', geo: 'Seoul, KR', isCurrent: false }
    ],
    activeDevices: ['macOS 14.6 / Chrome', 'Linux / Firefox'],
    isConcurrent: true,
    appealReason: '因出差期间使用酒店公共漫游网络导致并发多IP告警被系统自动拦截，现已返回东京常用基线，设备指纹无变更，请求协助解封放行。',
    appealTime: '2026-10-03 06:30',
    appealIp: '198.51.100.88',
    appealGeo: 'Tokyo, JP',
    appealDevice: 'Chrome 128 / macOS 14.6',
    appealFingerprint: 'fp_a98e21',
    matchScore: 98,
    subnetMatch: true
  },
  {
    id: 2,
    ticketId: 'TKT-2026-PI99R2',
    sessionHash: 'f_4d3c2b1a0f9e8d7c',
    email: 'pilot-recovery@epocanvas.com',
    warningType: 'appeal',
    status: 'pending',
    hasAppeal: true,
    regIp: '198.51.100.24',
    regGeo: 'Tokyo, JP',
    regDevice: 'Safari 18 / iOS 18.0',
    regDeviceType: 'mobile',
    regFingerprint: 'fp_77bc40',
    activeIps: [
      { ip: '198.51.100.24', geo: 'Tokyo, JP', isCurrent: true }
    ],
    activeDevices: ['iPhone 16 / Safari'],
    isConcurrent: false,
    appealReason: '出差旅行期间遗失本地会话状态，且触发异地保护，已通过 epomail-docs 提交环境比对凭据，申请放行重置。',
    appealTime: '2026-10-03 07:15',
    appealIp: '198.51.100.24',
    appealGeo: 'Tokyo, JP',
    appealDevice: 'Safari 18 / iOS 18.0',
    appealFingerprint: 'fp_77bc40',
    matchScore: 95,
    subnetMatch: true
  },
  {
    id: 3,
    ticketId: 'TKT-2026-SP44B1',
    sessionHash: 'f_e5d2c8b1a4f79021',
    email: 'spammer_bulk@partner.org',
    warningType: 'audit',
    status: 'banned',
    hasAppeal: true,
    regIp: '45.33.32.156',
    regGeo: 'Fremont, US',
    regDevice: 'Python-Requests / Headless',
    regDeviceType: 'desktop',
    regFingerprint: 'fp_bot_001',
    activeIps: [
      { ip: '45.33.32.156', geo: 'Fremont, US', isCurrent: false },
      { ip: '185.220.101.5', geo: 'Frankfurt, DE', isCurrent: false },
      { ip: '103.251.167.20', geo: 'Singapore, SG', isCurrent: true }
    ],
    activeDevices: ['HeadlessChrome', 'Unknown Linux'],
    isConcurrent: true,
    appealReason: '申诉自述：我们是合法邮件营销机构，请尽快给予放行。',
    appealTime: '2026-10-02 23:10',
    appealIp: '103.251.167.20',
    appealGeo: 'Singapore, SG',
    appealDevice: 'Chrome 126 / Windows 10',
    appealFingerprint: 'fp_random_99',
    matchScore: 12,
    subnetMatch: false
  },
  {
    id: 4,
    ticketId: 'TKT-2026-EV99X0',
    sessionHash: 'f_0011223344556677',
    email: 'evil_scanner@dark.net',
    warningType: 'ban',
    status: 'banned',
    hasAppeal: false,
    regIp: '185.220.101.5',
    regGeo: 'Frankfurt, DE',
    regDevice: 'Python-Requests / Linux',
    regDeviceType: 'desktop',
    regFingerprint: 'fp_scanner_66',
    activeIps: [
      { ip: '185.220.101.5', geo: 'Frankfurt, DE', isCurrent: true }
    ],
    activeDevices: ['Python Scanner'],
    isConcurrent: true,
    appealReason: '',
    appealTime: '',
    matchScore: 5,
    subnetMatch: false
  },
  {
    id: 5,
    ticketId: 'TKT-2026-ZS88K1',
    sessionHash: 'f_1a2b3c4d5e6f7a8b',
    email: 'zhangsan@epocanvas.com',
    warningType: 'risk',
    status: 'probation',
    hasAppeal: false,
    regIp: '198.51.100.10',
    regGeo: 'Tokyo, JP',
    regDevice: 'Chrome 128 / macOS 14.6',
    regDeviceType: 'desktop',
    regFingerprint: 'fp_a98e21',
    activeIps: [
      { ip: '198.51.100.10', geo: 'Tokyo, JP', isCurrent: false },
      { ip: '192.0.2.145', geo: 'Seoul, KR', isCurrent: true }
    ],
    activeDevices: ['macOS 14.6 / Chrome'],
    isConcurrent: true,
    appealReason: '',
    appealTime: '',
    matchScore: 88,
    subnetMatch: true
  }
]);

// 4 Warning Counters
const countAllWarnings = computed(() => allLogs.value.length);
const countAuditWarnings = computed(() => allLogs.value.filter(l => l.warningType === 'audit').length);
const countRiskWarnings = computed(() => allLogs.value.filter(l => l.warningType === 'risk').length);
const countBanWarnings = computed(() => allLogs.value.filter(l => l.warningType === 'ban').length);
const countAppealWarnings = computed(() => allLogs.value.filter(l => l.warningType === 'appeal').length);

// Filtered Logs
const filteredLogs = computed(() => {
  return allLogs.value.filter(log => {
    // Mode compatibility check
    if (activeMode.value === 0 && log.category === 'mail') {
      return false;
    }
    if (activeMode.value === 2 && !['account', 'security', 'appeal'].includes(log.category)) {
      return false;
    }

    // Warning Type filter
    if (filterWarningType.value !== 'all' && log.warningType !== filterWarningType.value) {
      return false;
    }

    // Keyword filter
    if (searchKeyword.value) {
      const kw = searchKeyword.value.toLowerCase().trim();
      const matchEmail = log.email.toLowerCase().includes(kw);
      const matchIp = log.ip.toLowerCase().includes(kw);
      const matchDevice = log.device.toLowerCase().includes(kw);
      const matchAction = log.actionText.toLowerCase().includes(kw);
      const matchTicket = log.ticketId && log.ticketId.toLowerCase().includes(kw);
      if (!matchEmail && !matchIp && !matchDevice && !matchAction && !matchTicket) return false;
    }

    // Category filter
    if (filterCategory.value !== 'all' && log.category !== filterCategory.value) {
      return false;
    }

    // Risk Level filter
    if (filterRiskLevel.value !== 'all' && log.riskLevel !== filterRiskLevel.value) {
      return false;
    }

    return true;
  });
});

// Filtered Risk Cases
const filteredRiskCases = computed(() => {
  return riskCases.value.filter(item => {
    if (riskStatusFilter.value !== 'all' && item.status !== riskStatusFilter.value) {
      return false;
    }
    if (riskSearchKeyword.value) {
      const kw = riskSearchKeyword.value.toLowerCase().trim();
      return item.email.toLowerCase().includes(kw) || (item.appealReason && item.appealReason.toLowerCase().includes(kw));
    }
    return true;
  });
});

// KPIs
const monitoredAccountsCount = computed(() => riskCases.value.length);
const bannedAccountsCount = computed(() => riskCases.value.filter(r => r.status === 'banned').length);
const pendingAppealsCount = computed(() => riskCases.value.filter(r => r.status === 'pending').length);

// Helper Methods
function getEventIcon(type) {
  switch (type) {
    case 'register': return 'fluent:person-add-20-regular';
    case 'login': return 'fluent:key-20-regular';
    case 'risk_spike': return 'fluent:alert-urgent-20-regular';
    case 'reported_spam': return 'fluent:mail-alert-20-regular';
    case 'reported_phish': return 'fluent:shield-dismiss-20-regular';
    case 'banned': return 'fluent:prohibited-20-regular';
    case 'unbanned': return 'fluent:shield-checkmark-20-regular';
    case 'appeal': return 'fluent:document-person-20-regular';
    default: return 'fluent:document-bullet-list-20-regular';
  }
}

function getDeviceIcon(deviceType) {
  if (deviceType === 'mobile') return 'lucide:smartphone';
  return 'lucide:laptop';
}

function getRiskLabel(level) {
  switch (level) {
    case 'normal': return t('auditRiskLevelNormal');
    case 'low': return t('auditRiskLevelLow');
    case 'medium': return t('auditRiskLevelMedium');
    case 'high': return t('auditRiskLevelHigh');
    default: return level;
  }
}

function getModeLabel(mode) {
  if (mode === 1) return t('auditModeLevel1');
  if (mode === 0) return t('auditModeLevel2');
  return t('auditModeLevel3');
}

function getStatusTagType(status) {
  switch (status) {
    case 'pending': return 'warning';
    case 'banned': return 'danger';
    case 'probation': return 'info';
    case 'approved': return 'success';
    default: return 'info';
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'pending': return t('auditAppealStatusPending');
    case 'banned': return t('banned');
    case 'probation': return t('auditProbationRelease');
    case 'approved': return t('auditAppealStatusApproved');
    default: return status;
  }
}

function getScoreColorClass(score) {
  if (score >= 90) return 'text-success';
  if (score >= 60) return 'text-warning';
  return 'text-danger';
}

function getMatchDesc(score) {
  if (score >= 95) return t('auditMatchPerfect');
  if (score >= 80) return t('auditMatchHigh');
  if (score >= 50) return t('auditMatchMedium');
  return t('auditMatchConflict');
}

function filterByEmail(email) {
  searchKeyword.value = email;
}

function refreshData() {
  firstLoading.value = true;
  setTimeout(() => {
    firstLoading.value = false;
    ElMessage.success(t('syncSuccess'));
  }, 400);
}

// Open Adjudication Drawer (Expanded View)
function openAdjudicationDrawer(row) {
  let target = riskCases.value.find(c => c.email === row.email);
  if (!target) {
    target = {
      id: row.id,
      ticketId: row.ticketId || ('TKT-2026-' + (row.email.slice(0, 2).toUpperCase() + String(row.id).slice(-4))),
      email: row.email,
      warningType: row.warningType || 'risk',
      status: row.status === 'banned' ? 'banned' : (row.warningType === 'appeal' ? 'pending' : 'probation'),
      hasAppeal: row.warningType === 'appeal' || !!row.appealId,
      regIp: row.ip,
      regGeo: row.geo,
      regDevice: row.device,
      regDeviceType: row.deviceType,
      regFingerprint: row.fingerprint,
      activeIps: [{ ip: row.ip, geo: row.geo, isCurrent: true }],
      activeDevices: [row.device],
      isConcurrent: row.isMultiIpConcurrent,
      appealReason: row.detailText,
      appealTime: row.timestamp,
      appealIp: row.ip,
      appealGeo: row.geo,
      appealDevice: row.device,
      appealFingerprint: row.fingerprint,
      matchScore: row.riskLevel === 'high' ? 35 : 95,
      subnetMatch: true
    };
  }
  selectedCase.value = target;
  decisionForm.action = target.status === 'banned' || target.status === 'pending' ? 'approve' : 'probation';
  decisionForm.notes = target.matchScore >= 90 ? t('auditDefaultNoteApproved') : '';
  adjudicationDrawerVisible.value = true;
}

function handleDrawerClose(done) {
  selectedCase.value = null;
  done();
}

// Handling Target Operations for Audit/Risk/Ban
function handleWarningAction(action, row) {
  switch (action) {
    case 'issue_warning':
      ElMessageBox.confirm(
        `${t('auditActionIssueWarning')}: ${row.email}？`,
        t('auditTypeAuditWarning'),
        { confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'warning' }
      ).then(() => {
        ElMessage.success(`${t('auditActionSuccess')}: ${t('auditActionIssueWarning')}`);
      }).catch(() => {});
      break;

    case 'ban_account':
      ElMessageBox.confirm(
        `${t('auditActionBanAccount')}: ${row.email}？`,
        t('auditActionBanAccount'),
        { confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'danger' }
      ).then(() => {
        row.warningType = 'ban';
        row.status = 'banned';
        ElMessage.success(`${t('auditActionSuccess')}: ${t('banned')}`);
      }).catch(() => {});
      break;

    case 'maintain_ban':
      ElMessage.info(`${t('auditActionMaintainBan')}: ${row.email}`);
      break;

    case 'purge_session':
      ElMessage.success(`${t('auditActionPurgeSession')}: ${row.email}`);
      break;

    case 'dismiss_alert':
      row.status = 'approved';
      ElMessage.success(`${t('auditActionDismissAlert')}: ${row.email}`);
      break;
  }
}

function quickUnban(row) {
  ElMessageBox.confirm(
    `${t('auditQuickUnbanConfirm')}: ${row.email}`,
    t('auditApproveUnban'),
    {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    }
  ).then(() => {
    row.status = 'approved';
    row.hasAppeal = false;
    allLogs.value.unshift({
      id: Date.now(),
      ticketId: row.ticketId || 'TKT-2026-UNBAN',
      email: row.email,
      userRole: 'Administrator',
      warningType: 'appeal',
      eventType: 'unbanned',
      category: 'security',
      actionText: `{${row.email}} 经管理员研判放行`,
      detailText: '管理员执行快捷放行操作，解除封禁限制。',
      ip: '127.0.0.1',
      geo: 'Console Admin',
      device: 'Admin Console Workstation',
      deviceType: 'desktop',
      fingerprint: 'fp_admin_master',
      isRegIp: false,
      isMultiIpConcurrent: false,
      activeIpCount: 1,
      reportedByOthersCount: 0,
      reportedOthersCount: 0,
      storageSize: 15690112,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      securityMode: activeMode.value,
      riskLevel: 'low',
      status: 'approved'
    });
    ElMessage.success(t('auditActionSuccess'));
  }).catch(() => {});
}

function quickReject(row) {
  ElMessageBox.confirm(
    `${t('auditRejectConfirm')}: ${row.email}`,
    t('auditRejectAppeal'),
    {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    }
  ).then(() => {
    row.status = 'banned';
    row.hasAppeal = false;
    allLogs.value.unshift({
      id: Date.now(),
      ticketId: row.ticketId || 'TKT-2026-REJECT',
      email: row.email,
      userRole: 'Administrator',
      warningType: 'ban',
      eventType: 'banned',
      category: 'security',
      actionText: `{${row.email}} 申诉被驳回`,
      detailText: '管理员快速驳回解封申诉，维持封禁管控状态。',
      ip: '127.0.0.1',
      geo: 'Console Admin',
      device: 'Admin Console Workstation',
      deviceType: 'desktop',
      fingerprint: 'fp_admin_master',
      isRegIp: false,
      isMultiIpConcurrent: false,
      activeIpCount: 1,
      reportedByOthersCount: 4,
      reportedOthersCount: 0,
      storageSize: 0,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      securityMode: activeMode.value,
      riskLevel: 'high',
      status: 'banned'
    });
    ElMessage.success(t('auditActionSuccess'));
  }).catch(() => {});
}

function submitAdjudication() {
  if (!selectedCase.value) return;
  isSubmittingDecision.value = true;

  setTimeout(() => {
    isSubmittingDecision.value = false;
    if (decisionForm.action === 'approve') {
      selectedCase.value.status = 'approved';
      selectedCase.value.hasAppeal = false;
    } else if (decisionForm.action === 'probation') {
      selectedCase.value.status = 'probation';
    } else if (decisionForm.action === 'reject') {
      selectedCase.value.status = 'banned';
      selectedCase.value.hasAppeal = false;
    }

    allLogs.value.unshift({
      id: Date.now(),
      ticketId: selectedCase.value.ticketId || 'TKT-2026-ADJ',
      email: selectedCase.value.email,
      userRole: 'Administrator',
      warningType: decisionForm.action === 'reject' ? 'ban' : 'appeal',
      eventType: decisionForm.action === 'reject' ? 'banned' : 'unbanned',
      category: 'security',
      actionText: decisionForm.action === 'reject' ? `{${selectedCase.value.email}} 申诉被驳回` : `{${selectedCase.value.email}} 经管理员研判放行`,
      detailText: decisionForm.notes || '管理员完成多设备环境比对并提交研判决策',
      ip: '127.0.0.1',
      geo: 'Console Admin',
      device: 'Admin Console Workstation',
      deviceType: 'desktop',
      fingerprint: 'fp_admin_master',
      isRegIp: false,
      isMultiIpConcurrent: false,
      activeIpCount: 1,
      reportedByOthersCount: 0,
      reportedOthersCount: 0,
      storageSize: 15690112,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      securityMode: activeMode.value,
      riskLevel: decisionForm.action === 'reject' ? 'high' : 'low',
      status: selectedCase.value.status
    });

    ElMessage.success(t('auditActionSuccess'));
    adjudicationDrawerVisible.value = false;
  }, 600);
}

function handleSettingChange() {
  settingStore.setSettings({
    auditMaxIpPerAccount: settingForm.auditMaxIpPerAccount,
    auditMaxDevicePerAccount: settingForm.auditMaxDevicePerAccount,
    auditCriticalQuota: settingForm.auditCriticalQuota,
    auditAutoCleanOldest: settingForm.auditAutoCleanOldest,
    auditPrioritizeNonCriticalClean: settingForm.auditPrioritizeNonCriticalClean,
    auditOptMailSend: settingForm.auditOptMailSend,
    auditOptMailReceive: settingForm.auditOptMailReceive,
    auditOptMailDelete: settingForm.auditOptMailDelete,
    auditOptMailStar: settingForm.auditOptMailStar,
    auditOptMailSchedule: settingForm.auditOptMailSchedule
  });
  ElMessage.success(t('syncSuccess'));
}

function triggerPurgeNonCritical() {
  ElMessageBox.confirm(
    t('auditClearHistoricalConfirm'),
    t('auditClearHistorical'),
    {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    }
  ).then(() => {
    isPurging.value = true;
    setTimeout(() => {
      isPurging.value = false;
      allLogs.value = allLogs.value.filter(l => ['banned', 'appeal'].includes(l.eventType));
      ElMessage.success(t('auditClearHistoricalSuccess'));
    }, 700);
  }).catch(() => {});
}

onMounted(() => {
  setTimeout(() => {
    firstLoading.value = false;
  }, 300);
});
</script>

<style scoped lang="scss">
.audit-page-container {
  height: 100%;
  position: relative;
  background: var(--extra-light-fill) !important;
}

.audit-scroll-body {
  padding: 20px 24px 48px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

/* Breadcrumb Navigation Strip */
.audit-breadcrumb-strip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 18px;
  margin-bottom: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}

.breadcrumb-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.back-settings-btn {
  color: var(--el-text-color-secondary) !important;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 !important;
  transition: color 0.15s;

  &:hover {
    color: var(--el-color-primary) !important;
  }
}

.breadcrumb-sep {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

.breadcrumb-active {
  color: var(--el-text-color-primary);
  font-weight: 600;
  font-size: 13.5px;
}

.docs-portal-btn {
  font-size: 12px !important;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* Header Banner: Clean, elevated */
.audit-header-banner {
  padding: 18px 20px;
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02);
}

.banner-left {
  flex: 1;
  min-width: 300px;
}

.mode-badge-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.mode-hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  letter-spacing: 0.2px;
  border-radius: 6px;
  padding: 4px 10px;
}

.header-title-text {
  h1 {
    font-size: 17px;
    font-weight: 700;
    color: var(--el-text-color-primary);
    margin: 0;
    line-height: 1.3;
  }
  .header-subtitle {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin: 2px 0 0 0;
  }
}

.mode-notice-card {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  padding: 8px 12px;
  border-radius: 6px;
  line-height: 1.45;

  .notice-info-icon {
    flex-shrink: 0;
    color: var(--el-color-primary);
  }
}

.banner-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.mode-switch-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode-switch-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.mode-selector {
  width: 190px;
}

.banner-actions {
  display: flex;
  gap: 8px;
}

/* KPI Summary Cards Grid */
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
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--el-color-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  &.highlight-card {
    border-color: var(--el-color-warning);
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
  &.appeal-icon {
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning);
  }
  &.quota-icon {
    background: var(--el-color-success-light-9);
    color: var(--el-color-success);
  }
}

.kpi-info {
  flex: 1;
  min-width: 0;
}

.kpi-label {
  font-size: 11.5px;
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

.text-amber {
  color: #d97706 !important;
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
  &.appeal-fill { background: var(--el-color-warning); }
}

.kpi-slots-capsule {
  display: flex;
  gap: 4px;
  margin-top: 5px;

  .slot-dot {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-placeholder);
    font-size: 10px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;

    &.active {
      background: var(--el-color-success);
      color: #fff;
    }
  }
}

/* Workspace Tabs Navigation */
.audit-workspace-tabs {
  background: transparent;
}

.tab-nav-bar {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--el-border-color);
  margin-bottom: 16px;
  padding-bottom: 2px;
}

.tab-btn {
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

.tab-count-badge {
  font-size: 11px;
  background: var(--el-fill-color);
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 600;
}

.tab-alert-badge {
  font-size: 11px;
  background: var(--el-color-warning);
  color: #fff;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 700;
}

/* 4 Warning Categories Focus Filter Bar */
.warning-category-filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
  padding: 10px 14px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
}

.warning-filter-pills {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.warning-filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-regular);
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
  }

  &.active {
    background: var(--el-color-primary);
    border-color: var(--el-color-primary);
    color: #fff;

    .pill-count {
      background: rgba(255, 255, 255, 0.25);
      color: #fff;
    }
  }

  &.pill-audit.active {
    background: #e6a23c;
    border-color: #e6a23c;
  }

  &.pill-risk.active {
    background: #f56c6c;
    border-color: #f56c6c;
  }

  &.pill-ban.active {
    background: #909399;
    border-color: #909399;
  }

  &.pill-appeal.active {
    background: #409eff;
    border-color: #409eff;
  }

  .pill-count {
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 11px;
    background: var(--el-fill-color);
    color: var(--el-text-color-secondary);
    font-weight: 600;

    &.has-appeal {
      background: var(--el-color-danger);
      color: #fff;
    }
  }
}

.abnormal-scope-note {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  padding: 5px 10px;
  border-radius: 4px;
}

/* Stream Toolbar */
.stream-toolbar, .risk-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.search-bar, .risk-search-input {
  width: 240px;
}

.category-select, .risk-select {
  width: 140px;
}

.date-picker-box {
  width: 250px;
}

.mode-alert-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 12px;
  margin-bottom: 14px;
  line-height: 1.4;

  &.encrypted-alert {
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning-dark-2);
    border: 1px solid var(--el-color-warning-light-5);
  }
  &.privacy-alert {
    background: var(--el-color-success-light-9);
    color: var(--el-color-success-dark-2);
    border: 1px solid var(--el-color-success-light-5);
  }
  &.allmail-alert {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary-dark-2);
    border: 1px solid var(--el-color-primary-light-5);
  }
}

.empty-audit-state {
  text-align: center;
  padding: 48px 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;

  .empty-icon {
    color: var(--el-text-color-placeholder);
    margin-bottom: 12px;
  }
  .empty-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
  }
  .empty-desc {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    margin: 4px 0 0 0;
  }
}

/* Timeline Stream Presentation (Modes 1 & 0) */
.timeline-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timeline-item-card {
  display: flex;
  gap: 14px;
  position: relative;
}

.timeline-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 30px;
  flex-shrink: 0;

  .indicator-icon-wrap {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;

    &.cat-account {
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
    }
    &.cat-security {
      background: var(--el-color-danger-light-9);
      color: var(--el-color-danger);
    }
    &.cat-appeal {
      background: var(--el-color-warning-light-9);
      color: var(--el-color-warning);
    }
  }

  .timeline-line {
    width: 2px;
    flex: 1;
    background: var(--el-border-color-lighter);
    margin-top: 4px;
  }
}

.timeline-content-card {
  flex: 1;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 14px 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.content-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.event-headline {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.warning-type-tag {
  font-weight: 600;
  letter-spacing: 0.2px;
}

.user-email-pill {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

.event-action-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.event-time-badge {
  font-size: 11.5px;
  color: var(--el-text-color-placeholder);
  font-family: monospace;
}

.content-card-body {
  margin-bottom: 10px;
}

.event-detail-desc {
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  line-height: 1.5;
  margin-bottom: 8px;
}

.env-pills-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.env-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-secondary);

  .geo-badge, .fp-tag {
    font-size: 10px;
    background: var(--el-fill-color);
    padding: 1px 4px;
    border-radius: 3px;
    color: var(--el-text-color-placeholder);
  }

  .reg-tag {
    font-size: 10px;
    background: var(--el-color-success-light-9);
    color: var(--el-color-success);
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: 600;
  }

  &.alert-pill {
    background: var(--el-color-danger-light-9);
    border-color: var(--el-color-danger-light-5);
    color: var(--el-color-danger);
    font-weight: 600;
  }
}

.content-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.risk-label-tag {
  font-size: 10.5px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;

  &.risk-tag-normal {
    background: var(--el-fill-color);
    color: var(--el-text-color-placeholder);
  }
  &.risk-tag-low {
    background: var(--el-color-success-light-9);
    color: var(--el-color-success);
  }
  &.risk-tag-medium {
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning);
  }
  &.risk-tag-high {
    background: var(--el-color-danger-light-9);
    color: var(--el-color-danger);
  }
}

.mode-tag {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-kind-label {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  font-weight: 600;
  margin-right: 2px;
}

.view-detail-btn {
  font-size: 12px !important;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

/* Pure DB Table Presentation (Mode 2) & Tab 2 Risk Table */
.table-container, .risk-table-wrap {
  background: var(--el-bg-color);
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  overflow: hidden;
}

.audit-data-table, .risk-data-table {
  --el-table-border-color: var(--el-border-color-lighter);
  --el-table-header-bg-color: var(--el-fill-color-light);
}

.table-user-cell, .account-cell {
  display: flex;
  align-items: center;
  gap: 10px;

  .user-avatar-initial, .account-avatar {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-weight: 700;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .email-address, .account-email {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .account-sub-tags, .account-tags {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }

  .role-tag {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
  }

  .mini-warning-tag {
    font-size: 10px;
    padding: 0 4px;
    height: 18px;
    line-height: 16px;
  }

  .appeal-badge {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning-dark-2);
    font-weight: 600;
  }
}

.table-alert-cell {
  .alert-feature-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }

  .alert-ticket-tag, .ticket-code {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .action-headline-text {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .alert-desc-sub {
    font-size: 11.5px;
    color: var(--el-text-color-secondary);
    line-height: 1.4;
  }
}

.table-env-cell, .baseline-cell {
  font-size: 12px;

  .env-line, .baseline-item {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--el-text-color-regular);
    margin-bottom: 2px;

    &.muted {
      color: var(--el-text-color-secondary);
    }
    &.fp {
      font-size: 11px;
      color: var(--el-text-color-placeholder);
      font-family: monospace;
    }
  }

  .geo-sub {
    color: var(--el-text-color-placeholder);
    font-size: 11px;
  }

  .concurrent-tag {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--el-color-danger);
    background: var(--el-color-danger-light-9);
    padding: 1px 5px;
    border-radius: 3px;
    display: inline-block;
    margin-top: 2px;
  }
}

.compliance-storage-cell {
  font-size: 12px;

  .storage-row, .reports-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 3px;
  }

  .c-label {
    color: var(--el-text-color-secondary);
    font-size: 11px;
  }

  .c-val {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .c-val-sub {
    color: var(--el-text-color-placeholder);
    font-size: 11px;
  }
}

.table-actions-cell {
  display: flex;
  flex-direction: column;
  gap: 5px;

  .cell-action-category-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    color: var(--el-text-color-secondary);

    .action-kind-pill {
      font-size: 10px;
      font-weight: 600;
      color: var(--el-color-warning-dark-2);
      background: var(--el-color-warning-light-9);
      border: 1px solid var(--el-color-warning-light-5);
      border-radius: 3px;
      padding: 1px 5px;

      &.appeal-kind {
        color: var(--el-color-primary-dark-2);
        background: var(--el-color-primary-light-9);
        border-color: var(--el-color-primary-light-5);
      }
    }

    .cell-detail-link {
      padding: 0;
      height: auto;
      font-size: 11px;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      color: var(--el-color-primary);

      &:hover {
        color: var(--el-color-primary-light-3);
      }
    }
  }

  .cell-action-btns {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;

    .el-button {
      padding: 2px 7px;
      height: 24px;
      font-size: 11.5px;
      margin-left: 0;
      margin-right: 2px;
      margin-bottom: 2px;
    }
  }
}

/* Risk Workbench Styling */
.ticket-id-cell {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--el-color-primary);
}

.active-pool-cell {
  font-size: 12px;

  .pool-header {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--el-text-color-placeholder);
    margin-bottom: 4px;
  }

  .ip-tags-flow {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .ip-pool-tag {
    font-size: 10.5px;
    padding: 0 4px;
    height: 18px;
    line-height: 16px;
  }

  .concurrent-notice {
    font-size: 11px;
    color: var(--el-color-danger);
    font-weight: 600;
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
}

.appeal-statement-cell {
  font-size: 12px;

  .appeal-quote {
    color: var(--el-text-color-regular);
    font-style: italic;
    line-height: 1.4;
    margin-bottom: 4px;
  }

  .appeal-time {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
  }

  .appeal-portal-link {
    margin-top: 2px;
  }
}

.assessment-cell {
  .score-line {
    display: flex;
    align-items: baseline;
    gap: 6px;

    .score-text {
      font-size: 15px;
      font-weight: 700;
    }
    .score-desc {
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }
  }

  .subnet-line {
    margin-top: 3px;

    .subnet-badge {
      font-size: 10.5px;
      padding: 1px 5px;
      border-radius: 3px;

      &.match {
        background: var(--el-color-success-light-9);
        color: var(--el-color-success);
        font-weight: 600;
      }
      &.mismatch {
        background: var(--el-color-danger-light-9);
        color: var(--el-color-danger);
      }
    }
  }
}

.risk-actions-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* Tab 3 Policy Settings Cards */
.card-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}

.settings-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 16px 20px;

  &.architecture-card {
    grid-column: 1 / -1;
  }

  .card-title {
    font-size: 14.5px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }
}

.card-intro-notice {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  padding: 6px 10px;
  border-radius: 4px;
  margin-bottom: 12px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &:last-child {
    border-bottom: none;
  }

  &.disabled {
    opacity: 0.55;
    pointer-events: none;
  }

  .item-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .item-desc {
    font-size: 11.5px;
    color: var(--el-text-color-secondary);
  }
}

.maintenance-action-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  background: var(--el-color-danger-light-9);
  border: 1px solid var(--el-color-danger-light-5);
  border-radius: 6px;
  margin-top: 14px;

  .action-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-color-danger-dark-2);
  }

  .action-desc {
    font-size: 11.5px;
    color: var(--el-color-danger);
  }
}

/* Architecture Card & Flow Diagram */
.arch-desc {
  font-size: 12.5px;
  color: var(--el-text-color-regular);
  margin-bottom: 16px;
  line-height: 1.5;
}

.arch-flow-diagram {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 18px 24px;
  margin-bottom: 14px;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 12px;
  }

  .flow-step {
    display: flex;
    align-items: center;
    gap: 10px;

    .flow-step-icon {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--el-color-primary);
    }

    .flow-step-text {
      display: flex;
      flex-direction: column;

      strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }
      span {
        font-size: 11.5px;
        color: var(--el-text-color-secondary);
      }
    }

    &.highlight {
      .flow-step-icon {
        background: var(--el-color-primary);
        color: #fff;
        border-color: var(--el-color-primary);
      }
    }
  }

  .flow-arrow {
    font-size: 18px;
    color: var(--el-text-color-placeholder);

    @media (max-width: 768px) {
      transform: rotate(90deg);
    }
  }
}

.arch-action-row {
  display: flex;
  justify-content: flex-end;
}

/* Drawer Extended Page Styling */
.audit-adjudication-drawer {
  .drawer-content {
    padding: 0 4px;
  }
}

.drawer-user-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  margin-bottom: 16px;

  .hero-avatar {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    background: var(--el-color-primary);
    color: #fff;
    font-size: 18px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hero-email {
    font-size: 15px;
    font-weight: 700;
    color: var(--el-text-color-primary);
    margin-bottom: 4px;
  }

  .hero-badges {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.comparison-section {
  margin-bottom: 18px;
}

.comparison-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 10px;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

.comparison-card {
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  padding: 12px;

  .card-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .card-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .c-row {
    display: flex;
    justify-content: space-between;
    font-size: 11.5px;

    .label {
      color: var(--el-text-color-placeholder);
    }
    .val {
      font-weight: 500;
      color: var(--el-text-color-regular);
      max-width: 170px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

.match-summary-box {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);

  .match-score-big {
    font-size: 26px;
    font-weight: 800;
    line-height: 1;
  }

  .match-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .match-sub {
    font-size: 11.5px;
    color: var(--el-text-color-secondary);
    margin-top: 2px;
  }

  &.text-success {
    background: var(--el-color-success-light-9);
    border-color: var(--el-color-success-light-5);
    .match-score-big { color: var(--el-color-success); }
  }
  &.text-warning {
    background: var(--el-color-warning-light-9);
    border-color: var(--el-color-warning-light-5);
    .match-score-big { color: var(--el-color-warning); }
  }
  &.text-danger {
    background: var(--el-color-danger-light-9);
    border-color: var(--el-color-danger-light-5);
    .match-score-big { color: var(--el-color-danger); }
  }
}

.appeal-form-section, .active-ip-section, .decision-panel {
  margin-bottom: 18px;

  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }
}

.appeal-statement-bubble {
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px 14px;

  p {
    font-size: 12.5px;
    color: var(--el-text-color-regular);
    line-height: 1.5;
    margin: 0 0 6px 0;
  }

  .bubble-meta {
    text-align: right;
    .time-muted {
      font-size: 11px;
      color: var(--el-text-color-placeholder);
    }
  }
}

.drawer-external-portal-box {
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 18px;

  .depb-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .depb-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--el-color-primary-dark-2);
  }

  .depb-desc {
    font-size: 11.5px;
    color: var(--el-color-primary-dark-2);
    margin: 0;
    line-height: 1.4;
  }
}

.ip-list-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;

  .ip-chip-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-lighter);

    .chip-status {
      font-size: 10px;
      padding: 1px 4px;
      border-radius: 3px;
      background: var(--el-color-success);
      color: #fff;
    }

    &.current {
      border-color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary-dark-2);
    }
  }
}

.decision-radio-group {
  margin-bottom: 12px;
}

.decision-textarea {
  margin-bottom: 10px;
}

.purge-checkbox-row {
  margin-bottom: 16px;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
`;

fs.writeFileSync(targetFile, fileContent, 'utf8');
console.log('✓ Successfully written full update to mail-vue/src/views/audit-report/index.vue');
