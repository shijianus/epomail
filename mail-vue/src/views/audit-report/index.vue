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
            <el-button link type="primary" size="small" class="docs-portal-btn" @click="openExternalAppealPortal">
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
              <el-tag :type="currentModeMeta.tagType" size="large" effect="dark" class="mode-hero-badge">
                <Icon :icon="currentModeMeta.icon" width="18" height="18" class="badge-icon" />
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

        <!-- KPI Metrics Grid -->
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

          <!-- TAB 1: 操作审计与时间流水 -->
          <div v-show="activeTab === 'stream'" class="tab-panel stream-panel">
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
                  <el-option value="mail" :label="$t('auditCategoryMail')" :disabled="activeMode !== 1" />
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

                <el-tooltip
                  :disabled="activeMode !== 2"
                  effect="dark"
                  :content="$t('auditEncryptedModeNotice')"
                >
                  <el-date-picker
                    v-model="filterDateRange"
                    type="daterange"
                    size="default"
                    :disabled="activeMode === 2"
                    :range-separator="$t('to')"
                    :start-placeholder="$t('auditTimestampFull')"
                    :end-placeholder="$t('auditTimestampFull')"
                    class="date-picker-box"
                  />
                </el-tooltip>
              </div>

              <div class="toolbar-right">
                <!-- View Mode Toggle -->
                <div class="view-mode-toggle">
                  <button
                    type="button"
                    class="toggle-btn"
                    :class="{ active: viewMode === 'timeline' }"
                    @click="viewMode = 'timeline'"
                    :title="$t('auditTimelineView')"
                  >
                    <Icon icon="fluent:timeline-20-filled" width="16" height="16" />
                    <span>{{ $t('auditTimelineView') }}</span>
                  </button>
                  <button
                    type="button"
                    class="toggle-btn"
                    :class="{ active: viewMode === 'table' }"
                    @click="viewMode = 'table'"
                    :title="$t('auditTableView')"
                  >
                    <Icon icon="fluent:table-20-filled" width="16" height="16" />
                    <span>{{ $t('auditTableView') }}</span>
                  </button>
                </div>
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

            <!-- TIMELINE VIEW -->
            <div v-else-if="viewMode === 'timeline'" class="timeline-container">
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
                      <el-tag size="small" :type="getCategoryTagType(item.category)" effect="light">
                        {{ $t(getCategoryI18nKey(item.category)) }}
                      </el-tag>

                      <span class="user-email-pill" @click="filterByEmail(item.email)">
                        <Icon icon="fluent:mail-16-regular" width="13" height="13" />
                        {{ item.email }}
                      </span>

                      <span class="event-action-text">{{ item.actionText }}</span>
                    </div>

                    <div class="event-time-badge">
                      <template v-if="item.securityMode === 2">
                        <el-tag size="small" type="info" effect="plain" class="stripped-badge">
                          <Icon icon="fluent:eye-off-16-regular" width="13" height="13" />
                          {{ $t('auditTimestampStripped') }}
                        </el-tag>
                      </template>
                      <template v-else>
                        <span class="time-text">{{ item.timestamp }}</span>
                      </template>
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

                  <!-- Footer Actions & Risk Badge -->
                  <div class="content-card-footer">
                    <div class="footer-left">
                      <span class="risk-label-tag" :class="'risk-tag-' + item.riskLevel">
                        {{ getRiskLabel(item.riskLevel) }}
                      </span>
                      <span class="mode-tag">{{ getModeLabel(item.securityMode) }}</span>
                    </div>

                    <div class="footer-right">
                      <el-button
                        v-if="item.appealId || item.riskLevel === 'high'"
                        size="small"
                        type="primary"
                        plain
                        class="adjudicate-btn"
                        @click="openAdjudicationDrawer(item)"
                      >
                        <Icon icon="fluent:shield-badge-20-regular" width="15" height="15" />
                        <span>{{ $t('auditInspectDetails') }}</span>
                      </el-button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- TABLE VIEW -->
            <div v-else class="table-container">
              <el-table
                :data="filteredLogs"
                style="width: 100%"
                row-class-name="audit-table-row"
                class="audit-data-table"
              >
                <!-- Time Column -->
                <el-table-column :label="$t('auditTimestampFull')" min-width="170">
                  <template #default="{ row }">
                    <div v-if="row.securityMode === 2">
                      <el-tag size="small" type="info" effect="plain">
                        {{ $t('auditTimestampStripped') }}
                      </el-tag>
                    </div>
                    <div v-else class="table-time-cell">
                      <Icon icon="fluent:clock-16-regular" width="14" height="14" class="time-icon" />
                      <span>{{ row.timestamp }}</span>
                    </div>
                  </template>
                </el-table-column>

                <!-- Email Column -->
                <el-table-column :label="$t('userAccount')" min-width="210">
                  <template #default="{ row }">
                    <div class="table-user-cell">
                      <div class="user-avatar-initial">{{ row.email.slice(0, 1).toUpperCase() }}</div>
                      <div class="user-details">
                        <div class="email-address">{{ row.email }}</div>
                        <div class="role-tag">{{ row.userRole || 'User' }}</div>
                      </div>
                    </div>
                  </template>
                </el-table-column>

                <!-- Action Column -->
                <el-table-column :label="$t('action')" min-width="240">
                  <template #default="{ row }">
                    <div class="table-action-cell">
                      <el-tag size="small" :type="getCategoryTagType(row.category)">
                        {{ $t(getCategoryI18nKey(row.category)) }}
                      </el-tag>
                      <div class="action-desc">
                        <span class="action-title">{{ row.actionText }}</span>
                        <div v-if="row.detailText" class="action-sub">{{ row.detailText }}</div>
                      </div>
                    </div>
                  </template>
                </el-table-column>

                <!-- Environment & IP Column -->
                <el-table-column :label="$t('auditActiveEnvPool')" min-width="240">
                  <template #default="{ row }">
                    <div class="table-env-cell">
                      <div class="env-line">
                        <Icon icon="lucide:network" width="13" height="13" />
                        <span>{{ row.ip }}</span>
                        <span class="geo-sub">({{ row.geo }})</span>
                      </div>
                      <div class="env-line muted">
                        <Icon :icon="getDeviceIcon(row.deviceType)" width="13" height="13" />
                        <span>{{ row.device }}</span>
                      </div>
                      <div v-if="row.isMultiIpConcurrent" class="concurrent-tag">
                        {{ $t('auditMultiIpConcurrent') }}
                      </div>
                    </div>
                  </template>
                </el-table-column>

                <!-- Risk Level -->
                <el-table-column :label="$t('auditTabRisk')" width="130">
                  <template #default="{ row }">
                    <el-tag size="small" :type="getRiskTagType(row.riskLevel)" effect="light">
                      {{ getRiskLabel(row.riskLevel) }}
                    </el-tag>
                  </template>
                </el-table-column>

                <!-- Operations -->
                <el-table-column :label="$t('tabSetting')" width="130" fixed="right">
                  <template #default="{ row }">
                    <el-button
                      size="small"
                      type="primary"
                      link
                      @click="openAdjudicationDrawer(row)"
                    >
                      {{ $t('auditInspectDetails') }}
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>

          <!-- TAB 2: 风控研判与申诉管理 -->
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
                <!-- Target Account -->
                <el-table-column :label="$t('tabEmailAddress')" min-width="220">
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
                <el-table-column :label="$t('auditActiveEnvPool')" min-width="240">
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

                <!-- Appeal Statement -->
                <el-table-column :label="$t('auditAppealReason')" min-width="230">
                  <template #default="{ row }">
                    <div v-if="row.hasAppeal" class="appeal-statement-cell">
                      <div class="appeal-quote">“{{ row.appealReason }}”</div>
                      <div class="appeal-time muted">
                        <span v-if="activeMode === 2">{{ $t('auditTimestampStripped') }}</span>
                        <span v-else>{{ row.appealTime }}</span>
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

                <!-- Actions -->
                <el-table-column :label="$t('action')" width="180" fixed="right">
                  <template #default="{ row }">
                    <div class="risk-actions-cell">
                      <el-button
                        size="small"
                        type="primary"
                        @click="openAdjudicationDrawer(row)"
                      >
                        {{ $t('auditInspectDetails') }}
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

              <!-- Card 4: 对外表单与风控流转架构说明 -->
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
                    <el-button type="primary" size="small" plain @click="openExternalAppealPortal">
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

    <!-- Side-by-side Appeal Adjudication & Environment Audit Drawer -->
    <el-drawer
      v-model="adjudicationDrawerVisible"
      :title="$t('auditAdjudicationModalTitle')"
      size="620px"
      direction="rtl"
      class="audit-adjudication-drawer"
      :before-close="handleDrawerClose"
    >
      <div v-if="selectedCase" class="drawer-content">
        <!-- Target User Card -->
        <div class="drawer-user-hero">
          <div class="hero-avatar">{{ selectedCase.email.slice(0, 1).toUpperCase() }}</div>
          <div class="hero-meta">
            <div class="hero-email">{{ selectedCase.email }}</div>
            <div class="hero-badges">
              <el-tag size="small" :type="getStatusTagType(selectedCase.status)">
                {{ getStatusLabel(selectedCase.status) }}
              </el-tag>
              <el-tag size="small" :type="currentModeMeta.tagType" effect="plain">
                {{ currentModeMeta.title }}
              </el-tag>
            </div>
          </div>
        </div>

        <!-- Side-by-Side Environment Comparison Matrix -->
        <div class="comparison-section">
          <div class="comparison-grid">
            <!-- Left: Registered Baseline -->
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

            <!-- Right: Appeal Submission Environment -->
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
            <p>{{ selectedCase.appealReason || '用户自述：因近期在多设备间同步邮件，且使用公共漫游热点产生并发多IP记录，导致账户被安全风控自动阻断。特提交申诉申请核验注册基准指纹并予以解除封禁放行。' }}</p>
            <div class="bubble-meta">
              <span v-if="activeMode === 2" class="time-muted">{{ $t('auditTimestampStripped') }}</span>
              <span v-else class="time-muted">{{ selectedCase.appealTime || selectedCase.timestamp }}</span>
            </div>
          </div>
        </div>

        <!-- External Form Source Banner -->
        <div class="drawer-external-portal-box">
          <div class="depb-header">
            <span class="depb-badge">
              <Icon icon="fluent:globe-shield-20-regular" width="14" height="14" />
              <span>{{ $t('auditExternalPortalBadge') }}</span>
            </span>
            <el-button link type="primary" size="small" @click="openExternalAppealPortal">
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
              <span class="chip-ip">{{ ipItem.ip }}</span>
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

const openExternalAppealPortal = () => {
  const docsBase = getOfficialLink('docs', settingStore) || 'https://docs.epocanvas.com/epomail';
  const lang = settingStore.settings?.lang || 'zh';
  let prefix = '';
  if (lang === 'zh-Hant') prefix = '/zh-tw';
  else if (lang === 'en') prefix = '/en';
  else if (lang === 'es') prefix = '/es';
  else if (lang === 'fr') prefix = '/fr';
  else if (lang === 'nl') prefix = '/nl';
  window.open(`${docsBase}${prefix}/mail/appeal/`, '_blank');
};

const firstLoading = ref(true);
const activeTab = ref('stream'); // 'stream' | 'risk' | 'policy'
const viewMode = ref('timeline'); // 'timeline' | 'table'

// Security Mode: 1: All Mail Mode (全部模式), 0: Privacy Mode (隐私模式), 2: Encrypted Mode (加密模式)
const activeMode = ref(Number(settingStore.settings?.allMailMode ?? 1));

// Filter States
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

// Comprehensive Mock Data covering all scenarios
const allLogs = ref([
  {
    id: 101,
    email: 'alice@epocanvas.com',
    userRole: '普通用户 LV.1',
    eventType: 'register',
    category: 'account',
    actionText: '{alice@epocanvas.com} 被注册',
    detailText: '用户通过邀请码完成账户初始化，注册设备基线已建立。',
    ip: '198.51.100.24',
    geo: 'Tokyo, JP',
    device: 'Chrome 128 / macOS 14.6',
    deviceType: 'desktop',
    fingerprint: 'fp_a98e21',
    isRegIp: true,
    isMultiIpConcurrent: false,
    activeIpCount: 1,
    timestamp: '2026-10-02 09:15:32',
    securityMode: 1,
    riskLevel: 'normal'
  },
  {
    id: 102,
    email: 'alice@epocanvas.com',
    userRole: '普通用户 LV.1',
    eventType: 'send_mail',
    category: 'mail',
    actionText: '{alice@epocanvas.com} 发送邮件',
    detailText: '发送主题 "Q4 Project Roadmap" 至 team@partner.org',
    ip: '198.51.100.24',
    geo: 'Tokyo, JP',
    device: 'Chrome 128 / macOS 14.6',
    deviceType: 'desktop',
    fingerprint: 'fp_a98e21',
    isRegIp: true,
    isMultiIpConcurrent: false,
    activeIpCount: 1,
    timestamp: '2026-10-02 11:20:18',
    securityMode: 1,
    riskLevel: 'normal'
  },
  {
    id: 103,
    email: 'bob@epocanvas.com',
    userRole: '普通用户 LV.0',
    eventType: 'login',
    category: 'account',
    actionText: '{bob@epocanvas.com} 登录成功',
    detailText: '检测到与注册地相距1200公里的新IP登录，多IP并发警报触发。',
    ip: '203.0.113.89',
    geo: 'Osaka, JP',
    device: 'Safari 18 / iOS 18.0',
    deviceType: 'mobile',
    fingerprint: 'fp_77bc40',
    isRegIp: false,
    isMultiIpConcurrent: true,
    activeIpCount: 3,
    timestamp: '2026-10-02 14:02:11',
    securityMode: 1,
    riskLevel: 'medium'
  },
  {
    id: 104,
    email: 'bob@epocanvas.com',
    userRole: '普通用户 LV.0',
    eventType: 'spam_scan',
    category: 'security',
    actionText: '{bob@epocanvas.com} 的邮件被扫描到垃圾箱',
    detailText: '外部发件人发送的高频营销邮件被规则引擎自动移至 Spam 分区。',
    ip: '203.0.113.89',
    geo: 'Osaka, JP',
    device: 'Safari 18 / iOS 18.0',
    deviceType: 'mobile',
    fingerprint: 'fp_77bc40',
    isRegIp: false,
    isMultiIpConcurrent: false,
    activeIpCount: 2,
    timestamp: '2026-10-02 16:45:00',
    securityMode: 0,
    riskLevel: 'low'
  },
  {
    id: 105,
    email: 'charlie@epocanvas.com',
    userRole: '普通用户 LV.0',
    eventType: 'banned',
    category: 'security',
    actionText: '{charlie@epocanvas.com} 被系统封禁',
    detailText: '因触发单日大量异地并发登录与发信频控，系统风控策略将其标记为封禁状态。',
    ip: '192.0.2.145',
    geo: 'Seoul, KR',
    device: 'Firefox 130 / Linux x86_64',
    deviceType: 'desktop',
    fingerprint: 'fp_99dd32',
    isRegIp: false,
    isMultiIpConcurrent: true,
    activeIpCount: 3,
    timestamp: '2026-10-03 01:10:45',
    securityMode: 2,
    riskLevel: 'high',
    appealId: 201
  },
  {
    id: 106,
    email: 'charlie@epocanvas.com',
    userRole: '普通用户 LV.0',
    eventType: 'appeal',
    category: 'appeal',
    actionText: '{charlie@epocanvas.com} 提交解封申诉表单',
    detailText: '“出差旅行期间连接酒店 WiFi 发生多IP并发跳跃，导致系统误判为异常撞库行为被封禁，现已回国，请求协助解除封禁。”',
    ip: '198.51.100.88',
    geo: 'Tokyo, JP',
    device: 'Chrome 128 / macOS 14.6',
    deviceType: 'desktop',
    fingerprint: 'fp_a98e21',
    isRegIp: false,
    isMultiIpConcurrent: false,
    activeIpCount: 2,
    timestamp: '2026-10-03 06:30:19',
    securityMode: 2,
    riskLevel: 'medium',
    appealId: 201
  },
  {
    id: 107,
    email: 'david@epocanvas.com',
    userRole: '普通用户 LV.1',
    eventType: 'star_mail',
    category: 'mail',
    actionText: '{david@epocanvas.com} 星标邮件',
    detailText: '邮件编号 #28901 被标星',
    ip: '198.51.100.55',
    geo: 'Tokyo, JP',
    device: 'Edge 128 / Windows 11',
    deviceType: 'desktop',
    fingerprint: 'fp_ee4102',
    isRegIp: true,
    isMultiIpConcurrent: false,
    activeIpCount: 1,
    timestamp: '2026-10-03 07:12:00',
    securityMode: 1,
    riskLevel: 'normal'
  },
  {
    id: 108,
    email: 'david@epocanvas.com',
    userRole: '普通用户 LV.1',
    eventType: 'schedule_mail',
    category: 'mail',
    actionText: '{david@epocanvas.com} 定时邮件',
    detailText: '预约于 2026-10-04 09:00 发送主题 "Contract Signing" 至 partner@firm.com',
    ip: '198.51.100.55',
    geo: 'Tokyo, JP',
    device: 'Edge 128 / Windows 11',
    deviceType: 'desktop',
    fingerprint: 'fp_ee4102',
    isRegIp: true,
    isMultiIpConcurrent: false,
    activeIpCount: 1,
    timestamp: '2026-10-03 07:45:22',
    securityMode: 1,
    riskLevel: 'normal'
  },
  {
    id: 109,
    email: 'elena@epocanvas.com',
    userRole: '参观者',
    eventType: 'delete_account',
    category: 'account',
    actionText: '{elena@epocanvas.com} 注销账户',
    detailText: '用户自主触发账户注销，安全凭证已物理销毁。',
    ip: '203.0.113.12',
    geo: 'London, GB',
    device: 'Chrome Mobile / Android 14',
    deviceType: 'mobile',
    fingerprint: 'fp_66aa99',
    isRegIp: true,
    isMultiIpConcurrent: false,
    activeIpCount: 1,
    timestamp: '2026-10-03 08:00:15',
    securityMode: 0,
    riskLevel: 'normal'
  }
]);

// Risk Cases (DB Table Representation)
const riskCases = ref([
  {
    id: 1,
    email: 'charlie@epocanvas.com',
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
    email: 'spammer_attacker@bot.net',
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
    id: 3,
    email: 'bob@epocanvas.com',
    status: 'probation',
    hasAppeal: false,
    regIp: '198.51.100.10',
    regGeo: 'Tokyo, JP',
    regDevice: 'Safari 18 / iOS 18.0',
    regDeviceType: 'mobile',
    regFingerprint: 'fp_77bc40',
    activeIps: [
      { ip: '198.51.100.10', geo: 'Tokyo, JP', isCurrent: false },
      { ip: '203.0.113.89', geo: 'Osaka, JP', isCurrent: true }
    ],
    activeDevices: ['iPhone 16 / Safari'],
    isConcurrent: false,
    appealReason: '',
    appealTime: '',
    matchScore: 88,
    subnetMatch: true
  },
  {
    id: 4,
    email: 'alice@epocanvas.com',
    status: 'approved',
    hasAppeal: false,
    regIp: '198.51.100.24',
    regGeo: 'Tokyo, JP',
    regDevice: 'Chrome 128 / macOS 14.6',
    regDeviceType: 'desktop',
    regFingerprint: 'fp_a98e21',
    activeIps: [
      { ip: '198.51.100.24', geo: 'Tokyo, JP', isCurrent: true }
    ],
    activeDevices: ['macOS 14.6 / Chrome'],
    isConcurrent: false,
    appealReason: '',
    appealTime: '',
    matchScore: 100,
    subnetMatch: true
  }
]);

// Filtered Logs
const filteredLogs = computed(() => {
  return allLogs.value.filter(log => {
    // Mode compatibility check
    if (activeMode.value === 0 && log.category === 'mail') {
      // In Privacy mode, mail operations are suppressed
      return false;
    }
    if (activeMode.value === 2 && !['account', 'security', 'appeal'].includes(log.category)) {
      // In Encrypted mode, only essential lifecycle, bans, and appeals
      return false;
    }

    // Keyword filter
    if (searchKeyword.value) {
      const kw = searchKeyword.value.toLowerCase().trim();
      const matchEmail = log.email.toLowerCase().includes(kw);
      const matchIp = log.ip.toLowerCase().includes(kw);
      const matchDevice = log.device.toLowerCase().includes(kw);
      const matchAction = log.actionText.toLowerCase().includes(kw);
      if (!matchEmail && !matchIp && !matchDevice && !matchAction) return false;
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
    case 'logout': return 'fluent:arrow-exit-20-regular';
    case 'send_mail': return 'fluent:mail-arrow-up-20-regular';
    case 'receive_mail': return 'fluent:mail-arrow-down-20-regular';
    case 'delete_mail': return 'fluent:delete-20-regular';
    case 'star_mail': return 'fluent:star-20-regular';
    case 'schedule_mail': return 'fluent:clock-20-regular';
    case 'spam_scan': return 'fluent:mail-alert-20-regular';
    case 'banned': return 'fluent:prohibited-20-regular';
    case 'unbanned': return 'fluent:shield-checkmark-20-regular';
    case 'appeal': return 'fluent:document-person-20-regular';
    case 'delete_account': return 'fluent:person-delete-20-regular';
    default: return 'fluent:document-bullet-list-20-regular';
  }
}

function getDeviceIcon(deviceType) {
  if (deviceType === 'mobile') return 'lucide:smartphone';
  return 'lucide:laptop';
}

function getCategoryTagType(cat) {
  switch (cat) {
    case 'account': return 'info';
    case 'mail': return 'primary';
    case 'security': return 'danger';
    case 'appeal': return 'warning';
    default: return 'info';
  }
}

function getCategoryI18nKey(cat) {
  switch (cat) {
    case 'account': return 'auditCategoryAccount';
    case 'mail': return 'auditCategoryMail';
    case 'security': return 'auditCategorySecurity';
    case 'appeal': return 'auditCategoryAppeal';
    default: return 'auditCategoryAll';
  }
}

function getRiskTagType(level) {
  switch (level) {
    case 'normal': return 'info';
    case 'low': return 'success';
    case 'medium': return 'warning';
    case 'high': return 'danger';
    default: return 'info';
  }
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
  if (score >= 95) return '指纹完全吻合 (推荐放行)';
  if (score >= 80) return '高相似度基准';
  if (score >= 50) return '中度环境漂移';
  return '指纹冲突严重 (疑似盗用)';
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

function openAdjudicationDrawer(row) {
  let target = riskCases.value.find(c => c.email === row.email);
  if (!target) {
    target = {
      id: row.id,
      email: row.email,
      status: row.riskLevel === 'high' ? 'banned' : 'approved',
      hasAppeal: !!row.appealId,
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
  decisionForm.notes = target.matchScore >= 90 ? '设备指纹基线吻合，判定为本人出差环境漂移，予以解封放行。' : '';
  adjudicationDrawerVisible.value = true;
}

function handleDrawerClose(done) {
  selectedCase.value = null;
  done();
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
    }

    // Add audit entry for this decision
    allLogs.value.unshift({
      id: Date.now(),
      email: selectedCase.value.email,
      userRole: 'Administrator',
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
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      securityMode: activeMode.value,
      riskLevel: decisionForm.action === 'reject' ? 'high' : 'low'
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
      // Retain only identity, registration baseline, appeals, and bans
      allLogs.value = allLogs.value.filter(l => ['register', 'banned', 'appeal'].includes(l.eventType));
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
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.audit-scroll-body {
  padding: 20px 24px 48px;
  max-width: 1380px;
  margin: 0 auto;
  width: 100%;
}

/* Header Banner */
.audit-header-banner {
  padding: 22px 24px;
  border-radius: 14px;
  margin-bottom: 20px;
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  background: var(--bg-elevated, #ffffff);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);

  &.mode-1 {
    border-left: 5px solid var(--accent-primary, #6366f1);
  }
  &.mode-0 {
    border-left: 5px solid var(--success, #10b981);
  }
  &.mode-2 {
    border-left: 5px solid var(--warning, #f59e0b);
  }
}

.banner-left {
  flex: 1;
  min-width: 320px;
}

.mode-badge-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.mode-hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  letter-spacing: 0.3px;
  border-radius: 8px;
  padding: 6px 12px;
}

.header-title-text {
  h1 {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-primary, #111827);
    margin: 0;
    line-height: 1.3;
  }
  .header-subtitle {
    font-size: 12px;
    color: var(--text-muted, #6b7280);
    margin: 2px 0 0 0;
  }
}

.mode-notice-card {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary, #374151);
  background: var(--bg-hover, rgba(0, 0, 0, 0.03));
  padding: 8px 12px;
  border-radius: 8px;
  margin-top: 8px;
  line-height: 1.4;

  .notice-info-icon {
    flex-shrink: 0;
    color: var(--accent-primary, #6366f1);
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
  color: var(--text-muted, #6b7280);
  font-weight: 500;
}

.mode-selector {
  width: 190px;
}

.banner-actions {
  display: flex;
  gap: 8px;
}

/* KPI Grid */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 22px;

  @media (max-width: 1024px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

.kpi-card {
  padding: 16px;
  border-radius: 12px;
  background: var(--bg-elevated, #ffffff);
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
    border-color: var(--accent-primary, #6366f1);
  }

  &.highlight-card {
    background: linear-gradient(135deg, var(--bg-elevated, #ffffff), rgba(245, 158, 11, 0.05));
    border-color: rgba(245, 158, 11, 0.3);
  }
}

.kpi-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.ops-icon {
    background: rgba(99, 102, 241, 0.1);
    color: #6366f1;
  }
  &.risk-icon {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
  &.appeal-icon {
    background: rgba(245, 158, 11, 0.12);
    color: #f59e0b;
  }
  &.quota-icon {
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
  }
}

.kpi-info {
  flex: 1;
  min-width: 0;
}

.kpi-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted, #6b7280);
  letter-spacing: 0.5px;
}

.kpi-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary, #111827);
  line-height: 1.2;
  margin: 2px 0;

  .kpi-unit {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-muted, #6b7280);
  }

  &.text-amber {
    color: #d97706;
  }
}

.kpi-sub {
  font-size: 11px;
  color: var(--text-secondary, #4b5563);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.text-amber {
    color: #b45309;
    font-weight: 600;
  }
}

/* Tabs & Navigation */
.tab-nav-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  padding-bottom: 12px;
  margin-bottom: 18px;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #4b5563);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;

  &:hover {
    background: var(--bg-hover, rgba(0, 0, 0, 0.04));
    color: var(--text-primary, #111827);
  }

  &.active {
    background: var(--accent-muted, rgba(99, 102, 241, 0.1));
    color: var(--accent-primary, #6366f1);
  }
}

.tab-count-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 10px;
  background: var(--bg-hover, rgba(0, 0, 0, 0.08));
  color: var(--text-muted, #6b7280);
}

.tab-alert-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 10px;
  background: #f59e0b;
  color: #ffffff;
  font-weight: 700;
}

/* Stream Toolbar */
.stream-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex: 1;
}

.search-bar {
  width: 280px;
}

.category-select {
  width: 140px;
}

.risk-select {
  width: 110px;
}

.date-picker-box {
  width: 240px;
}

/* View Mode Toggle */
.view-mode-toggle {
  display: flex;
  background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: var(--text-primary, #111827);
  }

  &.active {
    background: var(--bg-elevated, #ffffff);
    color: var(--accent-primary, #6366f1);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  }
}

/* Mode Alert Bar */
.mode-alert-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 16px;

  &.encrypted-alert {
    background: rgba(245, 158, 11, 0.1);
    color: #b45309;
    border: 1px solid rgba(245, 158, 11, 0.2);
  }
  &.privacy-alert {
    background: rgba(16, 185, 129, 0.1);
    color: #065f46;
    border: 1px solid rgba(16, 185, 129, 0.2);
  }
  &.allmail-alert {
    background: rgba(99, 102, 241, 0.08);
    color: #4338ca;
    border: 1px solid rgba(99, 102, 241, 0.2);
  }
}

/* Empty State */
.empty-audit-state {
  padding: 60px 20px;
  text-align: center;
  background: var(--bg-elevated, #ffffff);
  border-radius: 12px;
  border: 1px dashed var(--border-subtle, rgba(0, 0, 0, 0.1));

  .empty-icon {
    color: var(--text-muted, #9ca3af);
    margin-bottom: 12px;
  }
  .empty-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary, #111827);
  }
  .empty-desc {
    font-size: 12px;
    color: var(--text-muted, #6b7280);
    margin-top: 4px;
  }
}

/* TIMELINE STYLES */
.timeline-container {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.timeline-item-card {
  display: flex;
  gap: 16px;
  position: relative;
}

.timeline-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 32px;
  flex-shrink: 0;

  .indicator-icon-wrap {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;

    &.cat-account {
      background: rgba(99, 102, 241, 0.12);
      color: #6366f1;
    }
    &.cat-mail {
      background: rgba(6, 182, 212, 0.12);
      color: #0891b2;
    }
    &.cat-security {
      background: rgba(239, 68, 68, 0.12);
      color: #ef4444;
    }
    &.cat-appeal {
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
    }
  }

  .timeline-line {
    flex: 1;
    width: 2px;
    background: var(--border-subtle, rgba(0, 0, 0, 0.08));
    margin-top: 4px;
  }
}

.timeline-content-card {
  flex: 1;
  background: var(--bg-elevated, #ffffff);
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--accent-primary, #6366f1);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.05);
  }
}

.content-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.event-headline {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.user-email-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #111827);
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
  padding: 2px 8px;
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    color: var(--accent-primary, #6366f1);
  }
}

.event-action-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.event-time-badge {
  font-size: 12px;
  color: var(--text-muted, #6b7280);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.content-card-body {
  margin-bottom: 12px;

  .event-detail-desc {
    font-size: 13px;
    color: var(--text-secondary, #374151);
    line-height: 1.4;
    margin-bottom: 10px;
  }
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
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
  color: var(--text-secondary, #4b5563);
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.05));

  .geo-badge {
    color: var(--text-muted, #6b7280);
  }

  .reg-tag {
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
    padding: 1px 4px;
    border-radius: 4px;
    font-size: 10px;
  }

  .fp-tag {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: var(--text-muted, #6b7280);
  }

  &.alert-pill {
    background: rgba(239, 68, 68, 0.08);
    color: #ef4444;
    border-color: rgba(239, 68, 68, 0.2);
    font-weight: 600;
  }
}

.content-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.05));
  padding-top: 10px;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 8px;

  .risk-label-tag {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;

    &.risk-tag-normal {
      background: var(--bg-hover, rgba(0, 0, 0, 0.05));
      color: var(--text-muted, #6b7280);
    }
    &.risk-tag-low {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
    }
    &.risk-tag-medium {
      background: rgba(245, 158, 11, 0.12);
      color: #d97706;
    }
    &.risk-tag-high {
      background: rgba(239, 68, 68, 0.12);
      color: #ef4444;
    }
  }

  .mode-tag {
    font-size: 11px;
    color: var(--text-muted, #6b7280);
  }
}

/* TABLE STYLES */
.table-container, .risk-table-wrap {
  background: var(--bg-elevated, #ffffff);
  border-radius: 12px;
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  overflow: hidden;
}

.table-time-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  color: var(--text-secondary, #374151);

  .time-icon {
    color: var(--text-muted, #6b7280);
  }
}

.table-user-cell, .account-cell {
  display: flex;
  align-items: center;
  gap: 10px;

  .user-avatar-initial, .account-avatar {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--accent-muted, rgba(99, 102, 241, 0.1));
    color: var(--accent-primary, #6366f1);
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
    color: var(--text-primary, #111827);
  }

  .role-tag {
    font-size: 11px;
    color: var(--text-muted, #6b7280);
  }
}

.table-action-cell {
  display: flex;
  align-items: flex-start;
  gap: 8px;

  .action-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary, #111827);
  }

  .action-sub {
    font-size: 11px;
    color: var(--text-muted, #6b7280);
    margin-top: 2px;
  }
}

.table-env-cell {
  font-size: 12px;

  .env-line {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--text-primary, #111827);

    &.muted {
      color: var(--text-muted, #6b7280);
      margin-top: 2px;
    }
  }

  .concurrent-tag {
    display: inline-block;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    font-weight: 600;
    margin-top: 3px;
  }
}

/* RISK TAB SPECIFICS */
.risk-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.risk-search-input {
  width: 260px;
}

.baseline-cell {
  font-size: 12px;

  .baseline-item {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--text-primary, #111827);

    &.muted {
      color: var(--text-muted, #6b7280);
      margin-top: 2px;
    }
    &.fp {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      color: var(--text-muted, #6b7280);
      margin-top: 2px;
    }
  }
}

.active-pool-cell {
  .pool-header {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-muted, #6b7280);
    margin-bottom: 4px;
  }

  .ip-tags-flow {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .concurrent-notice {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #ef4444;
    font-size: 11px;
    font-weight: 600;
    margin-top: 4px;
  }
}

.appeal-statement-cell {
  .appeal-quote {
    font-size: 12px;
    color: var(--text-secondary, #374151);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .appeal-time {
    font-size: 11px;
    color: var(--text-muted, #6b7280);
    margin-top: 2px;
  }
}

.assessment-cell {
  .score-line {
    display: flex;
    align-items: baseline;
    gap: 6px;

    .score-text {
      font-size: 16px;
      font-weight: 700;
    }

    .score-desc {
      font-size: 11px;
      color: var(--text-muted, #6b7280);
    }
  }

  .subnet-badge {
    display: inline-block;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    margin-top: 3px;

    &.match {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
    }
    &.mismatch {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }
  }
}

.risk-actions-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* POLICY TAB STYLES */
.policy-panel {
  .card-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;

    @media (max-width: 1024px) {
      grid-template-columns: 1fr;
    }
  }
}

.settings-card {
  background: var(--bg-elevated, #ffffff);
  border-radius: 12px;
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  padding: 20px;

  .card-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary, #111827);
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-content {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
}

.card-intro-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary, #4b5563);
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
  padding: 8px 12px;
  border-radius: 8px;
  line-height: 1.4;
  margin-bottom: 6px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  &.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .item-meta {
    flex: 1;

    .item-title {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary, #111827);
    }
    .item-desc {
      display: block;
      font-size: 11px;
      color: var(--text-muted, #6b7280);
      margin-top: 2px;
      line-height: 1.3;
    }
  }
}

.maintenance-action-box {
  margin-top: 10px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.04);
  border: 1px dashed rgba(239, 68, 68, 0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  .action-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary, #111827);
  }
  .action-desc {
    font-size: 11px;
    color: var(--text-muted, #6b7280);
    margin-top: 2px;
  }
}

/* DRAWER STYLES */
.drawer-content {
  padding: 0 8px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.drawer-user-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: 10px;
  background: var(--bg-hover, rgba(0, 0, 0, 0.03));

  .hero-avatar {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: var(--accent-primary, #6366f1);
    color: #ffffff;
    font-size: 18px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hero-email {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary, #111827);
  }

  .hero-badges {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }
}

.comparison-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.comparison-card {
  padding: 12px;
  border-radius: 10px;
  background: var(--bg-elevated, #ffffff);
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));

  .card-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    color: var(--text-primary, #111827);
    margin-bottom: 10px;
  }

  .card-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .c-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;

    .label {
      color: var(--text-muted, #6b7280);
    }
    .val {
      font-weight: 600;
      color: var(--text-primary, #111827);
    }
  }
}

.match-summary-box {
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.2);
  display: flex;
  align-items: center;
  gap: 14px;

  .match-score-big {
    font-size: 24px;
    font-weight: 800;
  }

  .match-title {
    font-size: 13px;
    font-weight: 700;
  }
  .match-sub {
    font-size: 11px;
    color: var(--text-muted, #6b7280);
    margin-top: 2px;
  }

  &.text-warning {
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.2);
  }
  &.text-danger {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.2);
  }
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary, #111827);
  margin-bottom: 8px;
}

.appeal-statement-bubble {
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--bg-hover, rgba(0, 0, 0, 0.03));
  border-left: 3px solid var(--accent-primary, #6366f1);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary, #374151);

  .bubble-meta {
    margin-top: 6px;
    font-size: 11px;
    color: var(--text-muted, #6b7280);
  }
}

.ip-list-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ip-chip-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));

  &.current {
    border-color: var(--accent-primary, #6366f1);
    color: var(--accent-primary, #6366f1);
    background: var(--accent-muted, rgba(99, 102, 241, 0.08));
    font-weight: 600;
  }
}

.decision-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
  padding-top: 16px;
}

.decision-radio-group {
  margin-bottom: 4px;
}

.purge-checkbox-row {
  margin-top: 4px;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}

.text-success {
  color: #10b981 !important;
}
.text-warning {
  color: #f59e0b !important;
}
.text-danger {
  color: #ef4444 !important;
}
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

/* Breadcrumb Navigation Strip */
.audit-breadcrumb-strip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 6px 12px 6px;
  font-size: 13px;
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
}

.back-settings-btn:hover {
  color: var(--el-color-primary) !important;
}

.breadcrumb-sep {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

.breadcrumb-active {
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.docs-portal-btn {
  font-size: 12px !important;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* KPI Mini Progress Bars */
.kpi-progress-bar {
  margin-top: 8px;
  width: 100%;
  height: 4px;
  border-radius: 9999px;
  background: rgba(125, 125, 125, 0.12);
  overflow: hidden;
}

.kpi-progress-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.ops-fill {
  background: linear-gradient(90deg, #6366f1, #3b82f6);
}

.risk-fill {
  background: linear-gradient(90deg, #10b981, #06b6d4);
}

.appeal-fill {
  background: linear-gradient(90deg, #f59e0b, #ea580c);
}

/* Pulse Beacon */
.pulse-beacon {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f59e0b;
  margin-left: 6px;
  box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7);
  animation: beacon-pulse 1.8s infinite;
}

@keyframes beacon-pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 7px rgba(245, 158, 11, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
  }
}

/* Slot Capsules */
.kpi-slots-capsule {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
}

.slot-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  background: rgba(125, 125, 125, 0.12);
  color: var(--el-text-color-placeholder);
  border: 1px solid transparent;
  transition: all 0.2s;
}

.slot-dot.active {
  background: rgba(99, 102, 241, 0.15);
  color: #6366f1;
  border-color: rgba(99, 102, 241, 0.3);
}

/* Drawer External Portal Box */
.drawer-external-portal-box {
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 16px;
}

.depb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.depb-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.depb-desc {
  font-size: 12px;
  line-height: 1.55;
  color: var(--el-text-color-secondary);
  margin: 0;
}

/* Architecture Card & Flow */
.architecture-card {
  margin-top: 18px;
}

.arch-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  margin-bottom: 16px;
}

.arch-flow-diagram {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.flow-step {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  flex: 1;
  min-width: 170px;
}

.flow-step.highlight {
  border-color: rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.05);
}

.flow-step-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  shrink: 0;
}

.flow-step-text {
  display: flex;
  flex-direction: column;
}

.flow-step-text strong {
  font-size: 12px;
  color: var(--el-text-color-primary);
}

.flow-step-text span {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.flow-arrow {
  color: var(--el-text-color-placeholder);
  font-size: 16px;
  font-weight: bold;
}

.arch-action-row {
  display: flex;
  justify-content: flex-end;
}
</style>
