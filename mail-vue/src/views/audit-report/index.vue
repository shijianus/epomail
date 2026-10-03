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

            <!-- MODE 1 & 0: TIMELINE VIEW WITH FULL TIMESTAMPS -->
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

            <!-- MODE 2: ENCRYPTED MODE - PURE DB DATA TABLE (ZERO TIMESTAMPS) -->
            <div v-else class="table-container">
              <el-table
                :data="filteredLogs"
                style="width: 100%"
                row-class-name="audit-table-row"
                class="audit-data-table"
              >
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

                <!-- Environment Baseline Column -->
                <el-table-column :label="$t('auditRegisteredBaseline')" min-width="220">
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
                      <div class="env-line fp">
                        <span class="font-mono">FP: {{ row.fingerprint }}</span>
                      </div>
                    </div>
                  </template>
                </el-table-column>

                <!-- Active Pool Column -->
                <el-table-column :label="$t('auditActiveEnvPool')" min-width="220">
                  <template #default="{ row }">
                    <div class="table-env-cell">
                      <div class="env-line">
                        <Icon icon="lucide:network" width="13" height="13" />
                        <span>{{ row.ip }}</span>
                        <span class="geo-sub">({{ row.geo }})</span>
                      </div>
                      <div v-if="row.isMultiIpConcurrent" class="concurrent-tag">
                        {{ $t('auditMultiIpConcurrent') }} ({{ row.activeIpCount }} IPs)
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

          <!-- TAB 2: 风控研判与申诉管理 (完整 DB 表格) -->
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
                <el-table-column :label="$t('auditTicketId')" width="160">
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

                <!-- Actions -->
                <el-table-column :label="$t('action')" width="200" fixed="right">
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
              <el-tag v-if="selectedCase.ticketId" size="small" type="info" class="font-mono">
                {{ selectedCase.ticketId }}
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
    ticketId: 'TKT-2026-CH78A9',
    sessionHash: 'f_9c71a4f028d7b3e1',
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
    ticketId: 'TKT-2026-SP44B1',
    sessionHash: 'f_e5d2c8b1a4f79021',
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
    ticketId: 'TKT-2026-BO99X2',
    sessionHash: 'f_1a2b3c4d5e6f7a8b',
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
    ticketId: 'TKT-2026-AL11K5',
    sessionHash: 'f_9988776655443322',
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
      return false;
    }
    if (activeMode.value === 2 && !['account', 'security', 'appeal'].includes(log.category)) {
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

function openAdjudicationDrawer(row) {
  let target = riskCases.value.find(c => c.email === row.email);
  if (!target) {
    target = {
      id: row.id,
      ticketId: 'TKT-2026-' + (row.email.slice(0, 2).toUpperCase() + String(row.id).slice(-4)),
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
  decisionForm.notes = target.matchScore >= 90 ? t('auditDefaultNoteApproved') : '';
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
    allLogs.value.unshift({
      id: Date.now(),
      email: row.email,
      userRole: 'Administrator',
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
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      securityMode: activeMode.value,
      riskLevel: 'low'
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
      email: row.email,
      userRole: 'Administrator',
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
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      securityMode: activeMode.value,
      riskLevel: 'high'
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

/* Header Banner: Clean, elevated, matching sys-setting */
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
  font-weight: 600;
  text-transform: uppercase;
  color: var(--el-text-color-secondary);
  letter-spacing: 0.3px;
  display: flex;
  align-items: center;
}

.kpi-value {
  font-size: 19px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1.2;
  margin: 3px 0 2px;
  font-family: "Outfit", -apple-system, sans-serif;

  .kpi-unit {
    font-size: 12px;
    font-weight: 400;
    color: var(--el-text-color-placeholder);
  }

  &.text-amber {
    color: var(--el-color-warning);
  }
}

.kpi-sub {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.text-amber {
    color: var(--el-color-warning);
    font-weight: 600;
  }
}

.kpi-progress-bar {
  margin-top: 6px;
  width: 100%;
  height: 3px;
  border-radius: 3px;
  background: var(--el-border-color-lighter);
  overflow: hidden;
}

.kpi-progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.ops-fill {
  background: var(--el-color-primary);
}

.risk-fill {
  background: var(--el-color-danger);
}

.appeal-fill {
  background: var(--el-color-warning);
}

.pulse-beacon {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--el-color-warning);
  margin-left: 6px;
  box-shadow: 0 0 0 0 rgba(230, 162, 60, 0.7);
  animation: beacon-pulse 1.8s infinite;
}

@keyframes beacon-pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(230, 162, 60, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(230, 162, 60, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(230, 162, 60, 0);
  }
}

.kpi-slots-capsule {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
}

.slot-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-placeholder);
  border: 1px solid var(--el-border-color-lighter);
  transition: all 0.2s;

  &.active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    border-color: var(--el-color-primary-light-5);
  }
}

/* Workspace Container & Tabs */
.audit-workspace-tabs {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 18px 20px;
}

.tab-nav-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 12px;
  margin-bottom: 16px;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 15px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;

  &:hover {
    background: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
  }

  &.active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-weight: 600;
  }
}

.tab-count-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}

.tab-alert-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--el-color-warning);
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

.presentation-mode-tag {
  display: inline-flex;
  align-items: center;
  font-weight: 500;
  border-radius: 4px;
}

/* Mode Alert Bar */
.mode-alert-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 16px;

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

/* Empty State */
.empty-audit-state {
  padding: 50px 20px;
  text-align: center;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  border: 1px dashed var(--el-border-color);

  .empty-icon {
    color: var(--el-text-color-placeholder);
    margin-bottom: 10px;
  }
  .empty-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
  .empty-desc {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    margin-top: 4px;
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
    &.cat-mail {
      background: var(--el-color-primary-light-8);
      color: var(--el-color-primary-dark-2);
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
    flex: 1;
    width: 2px;
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
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--el-color-primary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }
}

.content-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
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
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-light);
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    color: var(--el-color-primary);
  }
}

.event-action-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.event-time-badge {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.content-card-body {
  margin-bottom: 10px;

  .event-detail-desc {
    font-size: 12.5px;
    color: var(--el-text-color-regular);
    line-height: 1.45;
    margin-bottom: 8px;
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
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  border: 1px solid var(--el-border-color-lighter);

  .geo-badge {
    color: var(--el-text-color-placeholder);
  }

  .reg-tag {
    background: var(--el-color-success-light-9);
    color: var(--el-color-success);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 10px;
  }

  .fp-tag {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: var(--el-text-color-placeholder);
  }

  &.alert-pill {
    background: var(--el-color-danger-light-9);
    color: var(--el-color-danger);
    border-color: var(--el-color-danger-light-5);
    font-weight: 600;
  }
}

.content-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 8px;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 8px;

  .risk-label-tag {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;

    &.risk-tag-normal {
      background: var(--el-fill-color-light);
      color: var(--el-text-color-secondary);
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

  .role-tag {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
  }

  .account-tags {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }

  .appeal-badge {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning);
    font-weight: 600;
  }
}

.ticket-id-cell {
  .ticket-code {
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-lighter);
    padding: 2px 6px;
    border-radius: 4px;
  }
}

.table-action-cell {
  display: flex;
  align-items: flex-start;
  gap: 8px;

  .action-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .action-sub {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
    margin-top: 2px;
  }
}

.table-env-cell {
  font-size: 12px;

  .env-line {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--el-text-color-primary);

    &.muted {
      color: var(--el-text-color-secondary);
      margin-top: 2px;
    }
    &.fp {
      font-size: 11px;
      color: var(--el-text-color-placeholder);
      margin-top: 2px;
    }
  }

  .concurrent-tag {
    display: inline-block;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--el-color-danger-light-9);
    color: var(--el-color-danger);
    font-weight: 600;
    margin-top: 3px;
  }
}

/* TAB 2 Specifics */
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
    color: var(--el-text-color-primary);

    &.muted {
      color: var(--el-text-color-secondary);
      margin-top: 2px;
    }
    &.fp {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      color: var(--el-text-color-placeholder);
      margin-top: 2px;
    }
  }
}

.active-pool-cell {
  .pool-header {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--el-text-color-placeholder);
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
    color: var(--el-color-danger);
    font-size: 11px;
    font-weight: 600;
    margin-top: 4px;
  }
}

.appeal-statement-cell {
  .appeal-quote {
    font-size: 12px;
    color: var(--el-text-color-regular);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .appeal-time {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
    margin-top: 2px;
  }

  .appeal-portal-link {
    margin-top: 4px;
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
      color: var(--el-text-color-placeholder);
    }
  }

  .subnet-badge {
    display: inline-block;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    margin-top: 3px;

    &.match {
      background: var(--el-color-success-light-9);
      color: var(--el-color-success);
    }
    &.mismatch {
      background: var(--el-color-danger-light-9);
      color: var(--el-color-danger);
    }
  }
}

.risk-actions-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* Policy Settings Tab (Tab 3) - Strictly matches sys-setting cards */
.policy-panel {
  .card-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;

    @media (max-width: 900px) {
      grid-template-columns: 1fr;
    }
  }
}

.settings-card {
  background: var(--el-bg-color);
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  overflow: hidden;

  .card-title {
    font-size: 14.5px;
    font-weight: bold;
    padding: 12px 18px;
    border-bottom: 1px solid var(--el-border-color);
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--el-text-color-primary);
  }

  .card-content {
    display: flex;
    flex-direction: column;
    padding: 0;
  }
}

.card-intro-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  padding: 10px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  line-height: 1.4;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  gap: 12px;

  &:last-child {
    border-bottom: none;
  }

  &.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .item-meta {
    flex: 1;

    .item-title {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: var(--el-text-color-primary);
    }
    .item-desc {
      display: block;
      font-size: 11px;
      color: var(--el-text-color-placeholder);
      margin-top: 2px;
      line-height: 1.3;
    }
  }
}

.maintenance-action-box {
  margin: 14px 18px;
  padding: 12px 14px;
  border-radius: 6px;
  background: var(--el-color-danger-light-9);
  border: 1px dashed var(--el-color-danger-light-5);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  .action-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-color-danger);
  }
  .action-desc {
    font-size: 11px;
    color: var(--el-text-color-secondary);
    margin-top: 2px;
  }
}

.architecture-card {
  grid-column: 1 / -1;

  .card-content {
    padding: 18px;
  }
}

.arch-desc {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  margin-bottom: 14px;
}

.arch-flow-diagram {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.flow-step {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  flex: 1;
  min-width: 170px;
}

.flow-step.highlight {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}

.flow-step-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.flow-step-text {
  display: flex;
  flex-direction: column;

  strong {
    font-size: 12px;
    color: var(--el-text-color-primary);
  }
  span {
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }
}

.flow-arrow {
  color: var(--el-text-color-placeholder);
  font-size: 14px;
  font-weight: bold;
}

.arch-action-row {
  display: flex;
  justify-content: flex-end;
}

/* Adjudication Drawer */
.drawer-content {
  padding: 0 4px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.drawer-user-hero {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);

  .hero-avatar {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: var(--el-color-primary);
    color: #ffffff;
    font-size: 16px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hero-email {
    font-size: 14px;
    font-weight: 700;
    color: var(--el-text-color-primary);
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
  border-radius: 8px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);

  .card-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 8px;
  }

  .card-rows {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .c-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;

    .label {
      color: var(--el-text-color-secondary);
    }
    .val {
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
  }
}

.match-summary-box {
  padding: 10px 14px;
  border-radius: 6px;
  background: var(--el-color-success-light-9);
  border: 1px solid var(--el-color-success-light-5);
  display: flex;
  align-items: center;
  gap: 12px;

  .match-score-big {
    font-size: 22px;
    font-weight: 800;
  }

  .match-title {
    font-size: 12.5px;
    font-weight: 700;
  }
  .match-sub {
    font-size: 11px;
    color: var(--el-text-color-secondary);
    margin-top: 2px;
  }

  &.text-warning {
    background: var(--el-color-warning-light-9);
    border-color: var(--el-color-warning-light-5);
  }
  &.text-danger {
    background: var(--el-color-danger-light-9);
    border-color: var(--el-color-danger-light-5);
  }
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}

.appeal-statement-bubble {
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  border-left: 3px solid var(--el-color-primary);
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-regular);

  .bubble-meta {
    margin-top: 4px;
    font-size: 11px;
    color: var(--el-text-color-placeholder);
  }
}

.drawer-external-portal-box {
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
}

.depb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.depb-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.depb-desc {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  margin: 0;
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
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);

  &.current {
    border-color: var(--el-color-primary-light-5);
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    font-weight: 600;
  }
}

.decision-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 14px;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}

.text-success {
  color: var(--el-color-success) !important;
}
.text-warning {
  color: var(--el-color-warning) !important;
}
.text-danger {
  color: var(--el-color-danger) !important;
}
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>
