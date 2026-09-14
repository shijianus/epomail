<template>
  <div class="box data-settings-page">
    
    <!-- Section 1: 用户资料与数据汇出 (Data Export) -->
    <div class="container export-container" id="dataExport">
      <div class="title">{{ $t('dataExportTitle') }}</div>
      <div class="section-intro">
        {{ $t('dataExportDesc') }}
      </div>

      <div class="export-cards-grid">
        <!-- 1. 全量数据备份 -->
        <div class="export-card primary-export">
          <div class="export-icon-box full-backup-icon">
            <Icon icon="fluent:database-link-24-filled" width="24" height="24" />
          </div>
          <div class="export-meta">
            <div class="export-title-row">
              <span class="export-title">{{ $t('exportAllData') }}</span>
              <el-tag size="small" type="primary" effect="plain" round class="format-pill">JSON</el-tag>
            </div>
            <div class="export-desc">{{ $t('exportAllDataDesc') }}</div>
          </div>
          <div class="export-action">
            <el-button 
              type="primary" 
              :loading="exportingFull" 
              @click="handleExportFullBackup"
              class="action-btn"
            >
              <Icon icon="lucide:download" width="15" height="15" />
              <span>{{ $t('exportDownloadBtn') }} (JSON)</span>
            </el-button>
          </div>
        </div>

        <!-- 2. 仅邮件归档 -->
        <div class="export-card">
          <div class="export-icon-box mail-icon-box">
            <Icon icon="fluent:mail-24-filled" width="24" height="24" />
          </div>
          <div class="export-meta">
            <div class="export-title-row">
              <span class="export-title">{{ $t('exportEmailsOnly') }}</span>
            </div>
            <div class="export-desc">{{ $t('exportEmailsOnlyDesc') }}</div>
            
            <div class="export-options-bar">
              <div class="opt-field">
                <span class="opt-label">{{ $t('exportFormat') }}:</span>
                <el-radio-group v-model="emailExportFormat" size="small">
                  <el-radio-button label="mbox">MBOX ({{ $t('common') }})</el-radio-button>
                  <el-radio-button label="json">JSON</el-radio-button>
                  <el-radio-button label="csv">CSV</el-radio-button>
                </el-radio-group>
              </div>

              <div class="opt-field">
                <span class="opt-label">{{ $t('exportRange') }}:</span>
                <el-select v-model="emailExportRange" size="small" class="range-select" style="min-width: 160px; width: auto;">
                  <el-option :label="$t('exportAllTime')" value="all" />
                  <el-option :label="$t('exportLast30Days')" value="30d" />
                  <el-option :label="$t('exportLast1Year')" value="1y" />
                </el-select>
              </div>
            </div>
          </div>
          <div class="export-action">
            <el-button 
              type="default" 
              :loading="exportingEmails" 
              @click="handleExportEmails"
              class="action-btn"
            >
              <Icon icon="lucide:download" width="15" height="15" />
              <span>{{ $t('exportDownloadBtn') }}</span>
            </el-button>
          </div>
        </div>

        <!-- 3. 通讯录与配置 -->
        <div class="export-card">
          <div class="export-icon-box config-icon-box">
            <Icon icon="fluent:book-contacts-24-filled" width="24" height="24" />
          </div>
          <div class="export-meta">
            <div class="export-title-row">
              <span class="export-title">{{ $t('exportContactsOnly') }}</span>
              <el-tag size="small" type="info" effect="plain" round class="format-pill">JSON</el-tag>
            </div>
            <div class="export-desc">{{ $t('exportContactsOnlyDesc') }}</div>
          </div>
          <div class="export-action">
            <el-button 
              type="default" 
              :loading="exportingContacts" 
              @click="handleExportContacts"
              class="action-btn"
            >
              <Icon icon="lucide:download" width="15" height="15" />
              <span>{{ $t('exportDownloadBtn') }}</span>
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 2: 邮件与消息转发 (Personal TG Push & Email Forwarding) -->
    <div class="container forwarding-container" id="forwarding" v-if="allowUserTg || allowUserEmailForward">
      <div class="title">{{ $t('forwardingAndPushTitle') }}</div>
      <div class="section-intro">
        {{ $t('forwardingSectionDesc') }}
      </div>
      
      <!-- 1. Telegram 消息推送 (以 Button 设置弹窗形式集成) -->
      <div class="item tg-push-item" v-if="allowUserTg">
        <div class="tg-item-info">
          <div class="tg-item-title-row">
            <Icon icon="fluent:bot-20-filled" width="18" height="18" class="tg-bot-icon" />
            <span class="tg-title-text">{{ $t('tgPushNotification') }}</span>
          </div>
          <div class="sub-hint">
            {{ tgForm.enabled ? (tgForm.chatId ? $t('tgEnabledWithChatId', { chatId: tgForm.chatId }) : $t('tgEnabledRealtime')) : $t('tgPushNotificationDesc') }}
          </div>
        </div>
        <div class="tg-item-actions">
          <el-tag :type="tgForm.enabled ? 'success' : 'info'" size="small" effect="plain" round class="status-tag">
            {{ tgForm.enabled ? ($t('enabled')) : ($t('disabled')) }}
          </el-tag>
          <el-button class="opt-button" size="small" type="primary" @click="openTgSettingDialog" :title="$t('settings')">
            <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
          </el-button>
        </div>
      </div>

      <!-- 2. 邮件规则转发与自动抄送 (在管理员允许用户邮件转发时提供) -->
      <template v-if="allowUserEmailForward">
        <div class="forwarding-rule-section">
          <!-- 启用自动转发开关 -->
          <div class="item forward-toggle-row">
            <div class="toggle-info">
              <div class="fw-title">{{ $t('forwardingEnable') }}</div>
              <div class="sub-hint">{{ $t('forwardingRulesDesc') }}</div>
            </div>
            <div class="toggle-action">
              <el-switch v-model="forwardForm.enabled" @change="saveForwardSettings(false)" />
            </div>
          </div>

          <div class="forwarding-fields" :class="{ 'fields-disabled': !forwardForm.enabled }">
            <!-- 目的地邮箱 -->
            <div class="item forward-field-item">
              <div class="field-label-col">
                <div class="fw-label">{{ $t('forwardingDestination') }}</div>
                <div class="sub-hint">{{ $t('forwardingDestinationDesc') }}</div>
              </div>
              <div class="forward-input-wrap">
                <el-input 
                  v-model="forwardForm.targets" 
                  :placeholder="$t('forwardingDestinationPlaceholder')" 
                  clearable 
                >
                  <template #prefix>
                    <Icon icon="fluent:mail-forward-20-regular" width="16" height="16" class="input-prefix-icon" />
                  </template>
                </el-input>
              </div>
            </div>

            <!-- 触发规则类型 -->
            <div class="item forward-rule-item align-start">
              <div class="field-label-col">
                <div class="fw-label">{{ $t('forwardingType') }}</div>
                <div class="sub-hint">{{ $t('forwardingTypeSubhint') }}</div>
              </div>
              <div class="forward-type-wrapper">
                <div class="forward-type-group">
                  <!-- 1. 全部邮件 -->
                  <div 
                    class="rule-type-card" 
                    :class="{ active: forwardForm.mode === 'all' }"
                    @click="forwardForm.mode = 'all'"
                  >
                    <div class="rule-card-main">
                      <div class="custom-radio-indicator" :class="{ checked: forwardForm.mode === 'all' }">
                        <div class="radio-inner-dot" v-if="forwardForm.mode === 'all'"></div>
                      </div>
                      <div class="rule-card-text">
                        <div class="r-title">{{ $t('forwardingTypeAll') }}</div>
                        <div class="r-desc">{{ $t('forwardingTypeAllDesc') }}</div>
                      </div>
                    </div>
                  </div>

                  <!-- 2. 别名前缀 -->
                  <div 
                    class="rule-type-card" 
                    :class="{ active: forwardForm.mode === 'alias' }"
                    @click="forwardForm.mode = 'alias'"
                  >
                    <div class="rule-card-main">
                      <div class="custom-radio-indicator" :class="{ checked: forwardForm.mode === 'alias' }">
                        <div class="radio-inner-dot" v-if="forwardForm.mode === 'alias'"></div>
                      </div>
                      <div class="rule-card-text">
                        <div class="r-title">{{ $t('forwardingTypeAlias') }}</div>
                        <div class="r-desc">{{ $t('forwardingTypeAliasDesc') }}</div>
                      </div>
                    </div>

                    <!-- 别名前缀输入子区域 (内嵌在别名卡片内) -->
                    <div v-if="forwardForm.mode === 'alias'" class="alias-inline-subbox" @click.stop>
                      <div class="alias-sub-label">
                        <Icon icon="fluent:tag-multiple-16-regular" width="14" height="14" />
                        <span>{{ $t('forwardingAliasPrefix') }}:</span>
                      </div>
                      <el-input 
                        v-model="forwardForm.aliasPrefixes" 
                        size="small" 
                        :placeholder="$t('forwardingAliasPrefixPlaceholder')" 
                        clearable
                        style="width: 100%;"
                      />
                    </div>
                  </div>

                  <!-- 3. 智能规则 -->
                  <div 
                    class="rule-type-card" 
                    :class="{ active: forwardForm.mode === 'rules' }"
                    @click="forwardForm.mode = 'rules'"
                  >
                    <div class="rule-card-main">
                      <div class="custom-radio-indicator" :class="{ checked: forwardForm.mode === 'rules' }">
                        <div class="radio-inner-dot" v-if="forwardForm.mode === 'rules'"></div>
                      </div>
                      <div class="rule-card-text">
                        <div class="r-title">{{ $t('forwardingTypeRules') }}</div>
                        <div class="r-desc">{{ $t('forwardingTypeRulesDesc') }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 高级选项 -->
            <div class="item forward-options-item align-start no-border">
              <div class="field-label-col">
                <div class="fw-label">{{ $t('advancedOptions') }}</div>
                <div class="sub-hint">{{ $t('advancedOptionsDesc') }}</div>
              </div>
              <div class="feature-checkboxes">
                <el-checkbox v-model="forwardForm.keepCopy">
                  <span class="chk-label">{{ $t('forwardingKeepCopy') }}</span>
                </el-checkbox>
                <el-checkbox v-model="forwardForm.addPrefix">
                  <span class="chk-label">{{ $t('forwardingSubjectPrefix') }}</span>
                </el-checkbox>
              </div>
            </div>

            <div class="form-actions-row">
              <div class="actions-wrapper">
                <el-button 
                  type="primary" 
                  :loading="savingForward" 
                  @click="saveForwardSettings(true)"
                  class="save-forward-btn"
                >
                  <Icon icon="fluent:save-20-regular" width="16" height="16" style="margin-right: 6px;" />
                  {{ $t('save') }}
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Section 3: 存储空间与个人云存储 (Storage Quota & BYO Cloud Storage) -->
    <div class="container storage-container" id="userStorage">
      <div class="title">{{ $t('userStorageTitle') }}</div>
      <div class="section-intro">
        {{ $t('userStorageDesc') }}
      </div>

      <div class="storage-cards-grid">
        <!-- 1. 存储容量用量仪表卡片 -->
        <div class="storage-card quota-meter-card">
          <div class="storage-card-header">
            <div class="header-icon-title">
              <div class="st-icon-box quota-icon">
                <Icon icon="fluent:server-24-filled" width="22" height="22" />
              </div>
              <div>
                <div class="st-title">{{ $t('storageUsageTitle') }}</div>
                <div class="st-subtitle">{{ storageUsage.fileCount || 0 }} {{ $t('storageFilesCount') }}</div>
              </div>
            </div>
            <div class="header-tag">
              <el-tag :type="storageUsage.byoStorageEnabled ? 'success' : 'info'" effect="plain" round class="status-pill">
                {{ storageUsage.byoStorageEnabled ? $t('personalDedicatedStorage') + ' (' + (storageUsage.byoStorageConfig?.provider || 'S3') + ')' : $t('systemDefaultStorage') }}
              </el-tag>
            </div>
          </div>

          <div class="meter-body">
            <div class="meter-numbers">
              <span class="used-val">{{ storageUsage.usedMb || '0.00' }} MB</span>
              <span class="total-val">/ {{ storageUsage.isVisitor ? '0 MB' : (storageUsage.quotaMb === 0 ? $t('unlimitedQuota') : storageUsage.quotaMb + ' MB') }}</span>
              <span class="pct-badge" :class="{ 'warning': storageUsage.usedPercentage > 80, 'danger': storageUsage.usedPercentage >= 100 }">
                {{ storageUsage.isVisitor ? (storageUsage.byoStorageEnabled ? storageUsage.usedPercentage + '%' : '0 MB') : (storageUsage.quotaMb === 0 ? $t('unlimitedBadge') : storageUsage.usedPercentage + '%') }}
              </span>
            </div>
            <div class="progress-track" v-if="storageUsage.quotaMb > 0">
              <div 
                class="progress-bar-fill" 
                :style="{ width: Math.min(100, storageUsage.usedPercentage) + '%' }"
                :class="{ 'warning': storageUsage.usedPercentage > 80, 'danger': storageUsage.usedPercentage >= 100 }"
              ></div>
            </div>
            <div class="meter-footnote">
              <Icon icon="fluent:info-16-regular" width="14" height="14" />
              <span>{{ storageUsage.byoStorageEnabled ? $t('quotaByoNotice') : (storageUsage.isVisitor ? $t('visitorStorageNotice') : $t('quotaUsedNotice')) }}</span>
            </div>
          </div>
        </div>

        <!-- 2. 个人第三方对象存储 (BYO Storage) 接入卡片 (当管理员允许时) -->
        <div class="storage-card byo-storage-card" v-if="storageUsage.allowUserByo">
          <div class="storage-card-header">
            <div class="header-icon-title">
              <div class="st-icon-box b2-icon">
                <Icon icon="simple-icons:backblaze" width="20" height="20" />
              </div>
              <div>
                <div class="st-title">{{ $t('byoStorageTitle') }}</div>
                <div class="st-subtitle">{{ storageUsage.byoStorageEnabled ? $t('byoStorageBound') : $t('byoStorageUnbound') }}</div>
              </div>
            </div>
            <div class="header-action">
              <el-button 
                type="primary" 
                size="small" 
                @click="openByoStorageModal"
                class="config-byo-btn"
              >
                <Icon :icon="storageUsage.byoStorageEnabled ? 'fluent:edit-16-filled' : 'fluent:add-circle-16-filled'" width="15" height="15" />
                <span>{{ storageUsage.byoStorageEnabled ? $t('byoStorageEditBtn') : $t('byoStorageConfigBtn') }}</span>
              </el-button>
            </div>
          </div>

          <div class="byo-status-body" v-if="storageUsage.byoStorageEnabled">
            <div class="byo-info-grid">
              <div class="info-row">
                <span class="i-label">{{ $t('byoStorageProvider') }}:</span>
                <span class="i-val bold">{{ storageUsage.byoStorageConfig?.provider || 'Backblaze B2' }}</span>
              </div>
              <div class="info-row">
                <span class="i-label">{{ $t('storageBucket') }}:</span>
                <span class="i-val code">{{ storageUsage.byoStorageConfig?.bucket }}</span>
              </div>
              <div class="info-row">
                <span class="i-label">{{ $t('storageEndpoint') }}:</span>
                <span class="i-val code">{{ storageUsage.byoStorageConfig?.endpoint }}</span>
              </div>
              <div class="info-row">
                <span class="i-label">Key ID:</span>
                <span class="i-val code">{{ storageUsage.byoStorageConfig?.s3AccessKey }}</span>
              </div>
            </div>
            <div class="byo-footer-actions">
              <el-button 
                size="small" 
                type="default" 
                :loading="testingUserByo" 
                @click="testCurrentByoConnection"
              >
                <Icon icon="fluent:play-circle-16-regular" width="14" height="14" />
                <span>{{ $t('byoStorageTestBtn') }}</span>
              </el-button>
              <el-button 
                size="small" 
                type="danger" 
                plain
                :loading="disconnectingByo" 
                @click="handleDisconnectByoStorage"
              >
                <Icon icon="fluent:link-dismiss-16-regular" width="14" height="14" />
                <span>{{ $t('byoStorageDisconnectBtn') }}</span>
              </el-button>
            </div>
          </div>

          <div class="byo-empty-body" v-else>
            <div class="empty-desc">
              {{ $t('byoStoragePromo') }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 4: 第三方应用和服务 (Third-Party Apps & Services) -->
    <div class="container third-party-apps-container" id="thirdPartyApps">
      <div class="section-head-flex">
        <div class="head-left-col">
          <div class="title">{{ $t('thirdPartyAppsTitle') }}</div>
          <div class="section-intro">
            {{ $t('thirdPartyAppsDesc') }}
          </div>
        </div>
        <div class="head-right-actions" v-if="userGrants.length > 0">
          <el-button 
            size="small" 
            :loading="grantsLoading" 
            @click="fetchOauthGrants" 
            class="refresh-grants-btn" 
            circle
            :title="$t('refresh')"
          >
            <Icon icon="solar:restart-linear" width="15" height="15" />
          </el-button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="grantsLoading && userGrants.length === 0" class="apps-loading-state">
        <Icon icon="solar:restart-circle-bold-duotone" width="28" height="28" class="spin-icon" />
        <span>正在加载已关联的应用...</span>
      </div>

      <!-- 1. 有已授权应用时的卡片网格 -->
      <div v-else-if="filteredGrants.length > 0" class="apps-cards-grid">
        <div 
          v-for="grant in filteredGrants" 
          :key="grant.id" 
          class="connected-app-card"
        >
          <!-- App Header -->
          <div class="app-card-header">
            <div class="app-avatar-box" :style="(!grant.appLogo || grant.logoFailed) ? { background: getAvatarBg(grant.appName) } : {}">
              <img 
                v-if="grant.appLogo && !grant.logoFailed" 
                :src="grant.appLogo" 
                :alt="grant.appName" 
                class="app-logo-img"
                @error="grant.logoFailed = true" 
              />
              <span v-else class="app-letter-initial">{{ getInitialChar(grant.appName) }}</span>
            </div>

            <div class="app-header-meta">
              <div class="app-name-row">
                <span class="app-main-name" :title="grant.appName">{{ grant.appName }}</span>
                <el-tag v-if="Number(grant.appStatus) === 0" size="small" type="danger" effect="plain" round class="status-pill">
                  {{ $t('thirdPartyStatusDisabled') }}
                </el-tag>
              </div>

              <div class="app-origin-row" v-if="grant.homepageUrl">
                <a :href="grant.homepageUrl" target="_blank" class="app-host-link" title="访问该应用官方网站">
                  <span>{{ getHostname(grant.homepageUrl) }}</span>
                  <Icon icon="lucide:external-link" width="11" height="11" class="ext-ic" />
                </a>
                <span class="dot-sep">·</span>
                <span class="grant-date">{{ formatDateTime(grant.createdAt) }}</span>
              </div>
              <div class="app-origin-row" v-else>
                <span class="grant-date">{{ formatDateTime(grant.createdAt) }}</span>
              </div>
            </div>
          </div>

          <!-- App Description -->
          <div class="app-card-desc" v-if="grant.appDescription">
            {{ grant.appDescription }}
          </div>

          <!-- Shared Scopes Chips -->
          <div class="app-shared-scopes-section">
            <div class="scope-pills-wrap">
              <div 
                v-for="scope in parseScopeList(grant.scopes)" 
                :key="scope.key" 
                class="shared-scope-chip"
                :title="scope.desc"
              >
                <Icon :icon="scope.icon" width="13" height="13" class="chip-ic" :style="{ color: scope.color }" />
                <span class="chip-name">{{ scope.name }}</span>
              </div>
            </div>
          </div>

          <!-- App Card Footer Actions -->
          <div class="app-card-footer">
            <div class="footer-left-info">
              <span class="grant-date-badge">{{ formatDateTime(grant.createdAt) }}</span>
            </div>
            <div class="footer-btn-actions">
              <el-button 
                size="small" 
                type="default" 
                @click="openAppDetailModal(grant)"
                class="view-detail-btn"
              >
                <span>{{ $t('thirdPartyViewDetailsBtn') }}</span>
              </el-button>
              <el-button 
                size="small" 
                type="danger" 
                plain
                :loading="revokingGrantId === grant.id"
                @click="handleRevokeGrant(grant)"
                class="revoke-access-btn"
              >
                <span>{{ $t('thirdPartyRevokeBtn') }}</span>
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- No match search result -->
      <div v-else-if="userGrants.length > 0 && filteredGrants.length === 0" class="no-search-results">
        <Icon icon="solar:magnifer-linear" width="28" height="28" class="empty-icon" />
        <div class="empty-text">未找到匹配「{{ activeSearchKeyword }}」的应用</div>
      </div>

      <!-- 2. 当没有已授权应用时的简洁空状态 -->
      <div v-else class="empty-apps-container">
        <div class="empty-hero-card">
          <div class="empty-icon-box">
            <Icon icon="fluent:shield-task-28-regular" width="32" height="32" class="shield-empty-ic" />
          </div>
          <div class="empty-hero-content">
            <div class="empty-hero-title">{{ $t('thirdPartyEmptyTitle') }}</div>
            <div class="empty-hero-desc">{{ $t('thirdPartyEmptyDesc') }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- DIALOG: 个人 Telegram 机器人配置 (Personal TG Bot Modal) -->
    <el-dialog
      v-model="tgSettingDialogShow"
      class="forward-dialog"
      width="500px"
      destroy-on-close
    >
      <template #header>
        <div class="forward-head">
          <span class="forward-set-title">{{ $t('tgBotConfigTitle') }}</span>
        </div>
      </template>

      <div class="forward-set-body">
        <div class="tg-dialog-hint">
          <Icon icon="fluent:info-16-regular" width="16" height="16" style="flex-shrink:0; margin-top:2px; color:var(--accent-primary);" />
          <span>{{ $t('tgPersonalBotDesc') }}</span>
        </div>

        <div class="dialog-field">
          <span class="d-label">{{ $t('tgBotToken') || 'Bot Token' }} <span style="color: var(--el-color-danger)">*</span></span>
          <el-input 
            v-model="tgForm.botToken" 
            placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz" 
            type="password"
            show-password
            clearable
          />
        </div>

        <div class="dialog-field">
          <span class="d-label">{{ $t('tgChatId') || 'Chat ID' }} <span style="color: var(--el-color-danger)">*</span></span>
          <el-input 
            v-model="tgForm.chatId" 
            placeholder="例如：987654321 或 -100123456789" 
            clearable
          />
        </div>

        <div class="dialog-field">
          <span class="d-label">{{ $t('tgTopicId') }}</span>
          <el-input 
            v-model="tgForm.topicId" 
            placeholder="群组话题 ID，如不需要请留空" 
            clearable
          />
        </div>

        <div class="dialog-field">
          <span class="d-label">{{ $t('tgPushMode') }}</span>
          <el-radio-group v-model="tgForm.mode" style="margin-top: 4px;">
            <el-radio label="all">{{ $t('tgModeAll') }}</el-radio>
            <el-radio label="important">{{ $t('tgModeImportant') }}</el-radio>
          </el-radio-group>
        </div>
      </div>

      <template #footer>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <el-button 
            type="info" 
            plain 
            :loading="testingTg" 
            @click="handleTestTelegram"
            style="border-radius: 8px;"
          >
            <Icon icon="fluent:send-20-regular" width="16" height="16" style="margin-right: 4px;" />
            {{ $t('sendTestMsg') }}
          </el-button>
          
          <div style="display: flex; gap: 10px;">
            <el-button @click="tgSettingDialogShow = false">{{ $t('cancel') }}</el-button>
            <el-button 
              type="primary" 
              :loading="savingTg" 
              @click="saveTgSettingsFromModal"
              style="border-radius: 8px;"
            >
              {{ $t('save') }}
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- DIALOG: 个人对象存储 (Backblaze B2 / S3) 接入配置弹窗 -->
    <el-dialog 
      v-model="byoModalShow" 
      :title="$t('byoModalTitle')" 
      width="540px" 
      @closed="resetByoModalForm"
      class="storage-config-dialog"
    >
      <div class="s3-modal-body">
        <div class="dialog-field">
          <div class="d-label-row">
            <span class="d-field-title">{{ $t('providerPreset') }}</span>
            <span class="d-sub-hint">{{ $t('providerPresetHint') }}</span>
          </div>
          <div class="provider-preset-pills">
            <div 
              class="provider-pill" 
              :class="{ active: byoForm.provider === 'backblaze' }" 
              @click="selectUserByoProvider('backblaze')"
            >
              <Icon icon="simple-icons:backblaze" width="16" height="16" class="p-icon b2" />
              <span>{{ $t('b2Preset') }}</span>
            </div>
            <div 
              class="provider-pill" 
              :class="{ active: byoForm.provider === 'aws' }" 
              @click="selectUserByoProvider('aws')"
            >
              <Icon icon="simple-icons:amazons3" width="16" height="16" class="p-icon aws" />
              <span>{{ $t('awsPreset') }}</span>
            </div>
            <div 
              class="provider-pill" 
              :class="{ active: byoForm.provider === 'r2' }" 
              @click="selectUserByoProvider('r2')"
            >
              <Icon icon="simple-icons:cloudflare" width="16" height="16" class="p-icon r2" />
              <span>{{ $t('r2Preset') }}</span>
            </div>
            <div 
              class="provider-pill" 
              :class="{ active: byoForm.provider === 'custom' }" 
              @click="selectUserByoProvider('custom')"
            >
              <Icon icon="fluent:server-multiple-20-filled" width="16" height="16" class="p-icon custom" />
              <span>{{ $t('customPreset') }}</span>
            </div>
          </div>
        </div>

        <div class="b2-guidance-box" v-if="byoForm.provider === 'backblaze'">
          <div class="g-header">
            <Icon icon="fluent:sparkle-20-filled" width="16" height="16" class="g-icon" />
            <span class="g-title">{{ $t('b2GuidanceTitle') }}</span>
          </div>
          <div class="g-content">
            • 节点示例：<code>s3.us-west-004.backblazeb2.com</code><br/>
            • 请在 Backblaze 控制台创建一个存储桶并生成具有 Read & Write 权限的 Application Key。
          </div>
        </div>

        <div class="dialog-field">
          <div class="d-label-row">
            <span class="d-field-title">{{ $t('bucketName') }} *</span>
            <span class="d-sub-hint">{{ $t('bucketNameHint') }}</span>
          </div>
          <el-input v-model="byoForm.bucket" :placeholder="$t('bucketPlaceholder')" clearable />
        </div>

        <div class="dialog-field">
          <div class="d-label-row">
            <span class="d-field-title">{{ $t('endpoint') }} *</span>
            <span class="d-sub-hint">{{ $t('endpointHint') }}</span>
          </div>
          <el-input 
            v-model="byoForm.endpoint" 
            :placeholder="byoForm.provider === 'backblaze' ? $t('endpointPlaceholderB2') : $t('endpointPlaceholderAws')" 
            clearable 
          />
        </div>

        <div class="dialog-row-2col">
          <div class="dialog-field">
            <div class="d-label-row">
              <span class="d-field-title">{{ $t('region') }}</span>
              <span class="d-sub-hint">{{ $t('regionHint') }}</span>
            </div>
            <el-input v-model="byoForm.region" placeholder="us-west-004 / auto" clearable />
          </div>

          <div class="dialog-field">
            <div class="d-label-row">
              <span class="d-field-title">{{ $t('forcePathStyle') }}</span>
              <span class="d-sub-hint">{{ $t('forcePathStyleDesc') }}</span>
            </div>
            <div class="fps-switch-wrapper">
              <el-switch :active-value="1" :inactive-value="0" v-model="byoForm.forcePathStyle" />
              <span class="fps-label">{{ byoForm.forcePathStyle === 1 ? $t('fpsPathStyle') : $t('fpsVirtualHost') }}</span>
            </div>
          </div>
        </div>

        <div class="dialog-field">
          <div class="d-label-row">
            <span class="d-field-title">{{ byoForm.provider === 'backblaze' ? 'Key ID (Access Key) *' : $t('s3AccessKeyId') + ' *' }}</span>
            <span class="d-sub-hint">{{ storageUsage.byoStorageConfig?.s3AccessKey ? $t('configured') + ': ' + storageUsage.byoStorageConfig.s3AccessKey : $t('s3AccessKeyHint') }}</span>
          </div>
          <el-input 
            v-model="byoForm.s3AccessKey" 
            :placeholder="storageUsage.byoStorageConfig?.s3AccessKey || $t('s3AccessKeyHint')" 
            clearable 
          />
        </div>

        <div class="dialog-field">
          <div class="d-label-row">
            <span class="d-field-title">{{ byoForm.provider === 'backblaze' ? 'Application Key (Secret Key) *' : $t('s3SecretKey') + ' *' }}</span>
            <span class="d-sub-hint">{{ storageUsage.byoStorageConfig?.s3SecretKey ? $t('encrypted') : $t('s3SecretKeyHint') }}</span>
          </div>
          <el-input 
            v-model="byoForm.s3SecretKey" 
            type="password" 
            show-password 
            :placeholder="storageUsage.byoStorageConfig?.s3SecretKey ? '••••••••••••••••' : $t('s3SecretKeyHint')" 
            clearable 
          />
        </div>

        <div class="dialog-field">
          <div class="d-label-row">
            <span class="d-field-title">{{ $t('customCdnDomain') }}</span>
            <span class="d-sub-hint">{{ $t('customCdnDomainHint') }}</span>
          </div>
          <el-input v-model="byoForm.customDomain" :placeholder="$t('customCdnPlaceholder')" clearable />
        </div>

        <div class="test-action-bar">
          <el-button 
            type="default" 
            :loading="testingUserByo" 
            @click="handleTestUserByoConnection"
            class="test-conn-btn"
          >
            <Icon icon="fluent:play-circle-20-filled" width="16" height="16" />
            <span>{{ testingUserByo ? $t('testingConnection') : $t('testConnectionBtn') }}</span>
          </el-button>
        </div>

        <div v-if="userByoTestResult" class="test-feedback-box" :class="{ success: userByoTestResult.ok, error: !userByoTestResult.ok }">
          <div class="fb-icon">
            <Icon :icon="userByoTestResult.ok ? 'fluent:checkmark-circle-20-filled' : 'fluent:dismiss-circle-20-filled'" width="20" height="20" />
          </div>
          <div class="fb-content">
            <div class="fb-title">
              <span>{{ userByoTestResult.ok ? $t('storageTestSuccess') : $t('storageTestFail') }}</span>
              <el-tag v-if="userByoTestResult.ok" size="small" type="success" effect="plain" class="latency-pill">
                ⚡ {{ userByoTestResult.latencyMs }}ms
              </el-tag>
              <el-tag v-if="userByoTestResult.provider" size="small" type="info" effect="plain" class="provider-pill-tag">
                {{ userByoTestResult.provider }}
              </el-tag>
            </div>
            <div class="fb-msg">{{ userByoTestResult.message || userByoTestResult.error }}</div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer-actions">
          <el-button @click="byoModalShow = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" :loading="savingUserByo" @click="handleSaveUserByoStorage">{{ $t('byoSaveBtn') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- DIALOG: 第三方应用详情与权限弹窗 -->
    <el-dialog
      v-model="appDetailModalShow"
      class="app-detail-dialog"
      width="520px"
      destroy-on-close
    >
      <template #header>
        <div class="app-detail-dialog-head" v-if="selectedAppDetail">
          <div class="head-avatar" :style="(!selectedAppDetail.appLogo) ? { background: getAvatarBg(selectedAppDetail.appName) } : {}">
            <img v-if="selectedAppDetail.appLogo" :src="selectedAppDetail.appLogo" :alt="selectedAppDetail.appName" class="head-logo" />
            <span v-else class="head-initial">{{ getInitialChar(selectedAppDetail.appName) }}</span>
          </div>
          <div class="head-info">
            <div class="head-name-row">
              <span class="head-app-name">{{ selectedAppDetail.appName }}</span>
            </div>
            <div class="head-origin-row" v-if="selectedAppDetail.homepageUrl">
              <a :href="selectedAppDetail.homepageUrl" target="_blank" class="head-link">
                <span>{{ getHostname(selectedAppDetail.homepageUrl) }}</span>
                <Icon icon="lucide:external-link" width="11" height="11" />
              </a>
            </div>
          </div>
        </div>
      </template>

      <div class="app-detail-dialog-body" v-if="selectedAppDetail">
        <!-- 1. 该应用已获得的权限 -->
        <div class="dialog-sub-section">
          <div class="sec-title-row">
            <span class="sec-title">{{ $t('thirdPartyCanAccessTitle') }}</span>
          </div>
          <div class="can-access-list">
            <div 
              v-for="scope in parseScopeList(selectedAppDetail.scopes)" 
              :key="scope.key" 
              class="access-item-card"
            >
              <div class="item-icon-box" :style="{ color: scope.color, backgroundColor: scope.bg }">
                <Icon :icon="scope.icon" width="18" height="18" />
              </div>
              <div class="item-info-col">
                <div class="item-title-line">
                  <span class="item-name">{{ scope.name }}</span>
                </div>
                <div class="item-desc">{{ scope.desc }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. 基本授权信息 -->
        <div class="dialog-sub-section">
          <div class="tech-info-grid">
            <div class="tech-row">
              <span class="t-label">{{ $t('thirdPartyGrantDate') }}:</span>
              <span class="t-val">{{ formatDateTime(selectedAppDetail.createdAt) }}</span>
            </div>
            <div class="tech-row" v-if="selectedAppDetail.clientId">
              <span class="t-label">客户端 ID:</span>
              <span class="t-val code-font">{{ selectedAppDetail.clientId }}</span>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer-between" v-if="selectedAppDetail">
          <el-button 
            type="danger" 
            plain
            :loading="revokingGrantId === selectedAppDetail.id"
            @click="handleRevokeFromModal(selectedAppDetail)"
            class="danger-revoke-btn"
          >
            <Icon icon="solar:link-broken-minimalistic-linear" width="16" height="16" style="margin-right: 4px;" />
            {{ $t('thirdPartyRevokeAllAccess') }}
          </el-button>
          <el-button @click="appDetailModalShow = false">{{ $t('close') }}</el-button>
        </div>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, defineOptions } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useUserStore } from '@/store/user.js'
import { useSettingStore } from '@/store/setting.js'
import { useEmailStore } from '@/store/email.js'
import {
  exportUserData,
  testTelegramBot,
  updateProfile,
  getUserStorage,
  updateUserStorage,
  testUserStorage,
  clearUserStorage,
  getMyOauthGrants,
  revokeMyOauthGrant
} from '@/request/my.js'
import { websiteConfig } from '@/request/setting.js'

defineOptions({
  name: 'data-setting'
})

const { t } = useI18n()
const userStore = useUserStore()
const settingStore = useSettingStore()
const emailStore = useEmailStore()

// 1. Export Data States
const exportingFull = ref(false)
const exportingEmails = ref(false)
const exportingContacts = ref(false)
const emailExportFormat = ref('mbox')
const emailExportRange = ref('all')

// 2. Telegram Settings States & Dialog
const tgSettingDialogShow = ref(false)
const testingTg = ref(false)
const savingTg = ref(false)
const tgForm = reactive({
  enabled: false,
  botToken: '',
  chatId: '',
  topicId: '',
  mode: 'all',
  notifyCodeOnly: true,
  includePreview: true
})

// 3. Forwarding Settings States & Mode Bindings
const savingForward = ref(false)
const forwardForm = reactive({
  enabled: false,
  targets: '',
  mode: 'all', // 'all' | 'alias' | 'rules'
  aliasPrefixes: '',
  keepCopy: true,
  addPrefix: true
})

// 4. User Storage & BYO Storage States
const storageUsage = reactive({
  userId: null,
  usedBytes: 0,
  usedMb: '0.00',
  quotaMb: 0,
  quotaBytes: 0,
  usedPercentage: 0,
  fileCount: 0,
  allowUserByo: true,
  byoStorageEnabled: 0,
  byoStorageConfig: null,
  isVisitor: false,
  roleCode: '',
  storageType: 'KV'
})

const byoModalShow = ref(false)
const testingUserByo = ref(false)
const savingUserByo = ref(false)
const disconnectingByo = ref(false)
const userByoTestResult = ref(null)

const byoForm = reactive({
  provider: 'backblaze',
  bucket: '',
  endpoint: '',
  region: '',
  s3AccessKey: '',
  s3SecretKey: '',
  forcePathStyle: 1,
  customDomain: ''
})

// 5. Third-Party Apps & Data Sharing States (第三方应用与数据共享)
const grantsLoading = ref(false)
const userGrants = ref([])
const ecosystemApps = ref([])
const revokingGrantId = ref(null)
const appDetailModalShow = ref(false)
const selectedAppDetail = ref(null)
// 内置高精准第三方应用检索函数 (针对 app 名称、clientId、域名、权限范围与说明进行深度多维匹配)
function matchAppByKeyword(app, keyword) {
  if (!app || !keyword) return true
  const raw = keyword.trim().toLowerCase()
  // 提取可能的语法前缀 app: / oauth: / client:
  const q = raw.replace(/^(app:|oauth:|client:)/i, '').trim()
  if (!q) return true

  const nameMatch = (app.appName || '').toLowerCase().includes(q)
  const clientMatch = (app.clientId || '').toLowerCase().includes(q)
  const hostMatch = (app.homepageUrl || '').toLowerCase().includes(q)
  const descMatch = (app.appDescription || '').toLowerCase().includes(q)
  const scopesMatch = (app.scopes || '').toLowerCase().includes(q)

  return nameMatch || clientMatch || hostMatch || descMatch || scopesMatch
}

// 提取当前顶栏 topbar-search 活跃检索关键词 (兼容全局设置搜索前缀)
const activeSearchKeyword = computed(() => {
  const kw = (emailStore.searchKeyword || '').trim()
  if (!kw) return ''
  return kw.replace(/^(all:|global:)/i, '').trim()
})

// 兼容顶栏 topbar-search 检索体系，实现应用实时精准过滤
const filteredGrants = computed(() => {
  const kw = activeSearchKeyword.value
  if (!kw) {
    return userGrants.value
  }
  return userGrants.value.filter(g => matchAppByKeyword(g, kw))
})

async function fetchUserStorage() {
  try {
    const res = await getUserStorage()
    const payload = res?.data || res
    if (payload && typeof payload === 'object') {
      Object.assign(storageUsage, payload)
    }
  } catch (err) {
    console.warn('Failed to load user storage:', err)
  }
}

function selectUserByoProvider(type) {
  byoForm.provider = type
  if (type === 'backblaze') {
    if (!byoForm.endpoint || byoForm.endpoint.includes('amazonaws') || byoForm.endpoint.includes('r2')) {
      byoForm.endpoint = 's3.us-west-004.backblazeb2.com'
    }
    if (!byoForm.region || byoForm.region === 'us-east-1') byoForm.region = 'us-west-004'
    byoForm.forcePathStyle = 1
  } else if (type === 'aws') {
    if (!byoForm.endpoint || byoForm.endpoint.includes('backblaze') || byoForm.endpoint.includes('r2')) {
      byoForm.endpoint = 's3.amazonaws.com'
    }
    if (!byoForm.region || byoForm.region === 'us-west-004') byoForm.region = 'us-east-1'
    byoForm.forcePathStyle = 0
  } else if (type === 'r2') {
    if (!byoForm.region) byoForm.region = 'auto'
    byoForm.forcePathStyle = 1
  } else if (type === 'custom') {
    byoForm.forcePathStyle = 1
  }
}

function openByoStorageModal() {
  resetByoModalForm()
  if (storageUsage.byoStorageConfig) {
    byoForm.bucket = storageUsage.byoStorageConfig.bucket || ''
    byoForm.endpoint = storageUsage.byoStorageConfig.endpoint || ''
    byoForm.region = storageUsage.byoStorageConfig.region || ''
    byoForm.forcePathStyle = storageUsage.byoStorageConfig.forcePathStyle ?? 1
    byoForm.customDomain = storageUsage.byoStorageConfig.customDomain || ''
    byoForm.provider = storageUsage.byoStorageConfig.provider === 'AWS S3' ? 'aws' : (storageUsage.byoStorageConfig.provider === 'Cloudflare R2' ? 'r2' : 'backblaze')
  }
  byoModalShow.value = true
}

function resetByoModalForm() {
  byoForm.provider = 'backblaze'
  byoForm.bucket = ''
  byoForm.endpoint = 's3.us-west-004.backblazeb2.com'
  byoForm.region = 'us-west-004'
  byoForm.s3AccessKey = ''
  byoForm.s3SecretKey = ''
  byoForm.forcePathStyle = 1
  byoForm.customDomain = ''
  userByoTestResult.value = null
  testingUserByo.value = false
}

async function handleTestUserByoConnection() {
  if (!byoForm.bucket || !byoForm.endpoint || !byoForm.s3AccessKey || !byoForm.s3SecretKey) {
    ElMessage.warning(t('fillCompleteBucketInfo'))
    return
  }

  testingUserByo.value = true
  userByoTestResult.value = null
  try {
    const res = await testUserStorage(byoForm)
    const resultData = res?.data || res
    if (resultData) {
      userByoTestResult.value = resultData
      if (resultData.ok) {
        ElMessage.success(resultData.message || t('connectionTestSuccess'))
      } else {
        ElMessage.error(resultData.message || t('connectionTestFailed'))
      }
    }
  } catch (err) {
    ElMessage.error(err.message || t('connectionTestAbnormal'))
  } finally {
    testingUserByo.value = false
  }
}

async function handleSaveUserByoStorage() {
  if (!byoForm.bucket || !byoForm.endpoint || !byoForm.s3AccessKey || !byoForm.s3SecretKey) {
    ElMessage.warning(t('fillCompleteBucketInfo'))
    return
  }

  savingUserByo.value = true
  try {
    const res = await updateUserStorage(byoForm)
    ElMessage.success(res.message || t('bucketBindSuccess'))
    byoModalShow.value = false
    await fetchUserStorage()
  } catch (err) {
    ElMessage.error(err.message || t('bucketBindFailed'))
  } finally {
    savingUserByo.value = false
  }
}

async function testCurrentByoConnection() {
  testingUserByo.value = true
  try {
    const res = await testUserStorage({})
    const resultData = res?.data || res
    if (resultData?.ok) {
      ElMessage.success(resultData.message || t('bucketHealthy'))
    } else {
      ElMessage.error(resultData?.message || t('bucketDiagnoseFailed'))
    }
  } catch (err) {
    ElMessage.error(err.message || t('diagnoseFailed'))
  } finally {
    testingUserByo.value = false
  }
}

async function handleDisconnectByoStorage() {
  try {
    await ElMessageBox.confirm(t('confirmUnbindBucketMsg'), t('confirmUnbindBucketTitle'), {
      type: 'warning',
      confirmButtonText: t('confirmUnbind'),
      cancelButtonText: t('cancel')
    })
    disconnectingByo.value = true
    await clearUserStorage()
    ElMessage.success(t('unbindBucketSuccess'))
    await fetchUserStorage()
  } catch (e) {
    // cancelled
  } finally {
    disconnectingByo.value = false
  }
}

const currentMailMode = ref(0)

const sendQuotaText = computed(() => {
  const user = userStore.user
  if (!user || !user.role) return t('calculating')
  const sendCount = user.sendCount || 0
  const maxCount = user.role.sendCount
  if (!maxCount) return `${sendCount} / ${t('unlimited')}`
  return `${sendCount} / ${maxCount}`
})

const allowUserTg = computed(() => {
  if (settingStore.settings?.userTgForward !== undefined) {
    return Number(settingStore.settings.userTgForward) === 1
  }
  return true
})

const allowUserEmailForward = computed(() => {
  if (settingStore.settings?.userEmailForward !== undefined) {
    return Number(settingStore.settings.userEmailForward) === 1
  }
  return true
})

onMounted(async () => {
  try {
    const config = await websiteConfig()
    if (config) {
      const cfg = config.data || config
      settingStore.settings = { ...settingStore.settings, ...cfg }
      if (cfg.allMailMode !== undefined && cfg.allMailMode !== null) {
        currentMailMode.value = Number(cfg.allMailMode)
      }
    }
  } catch (e) {
    console.error('Failed to load website config:', e)
  }
  initDataFromUserStore()
  await fetchUserStorage()
  await fetchOauthGrants()
})

// 第三方应用与数据共享相关方法
async function fetchOauthGrants() {
  grantsLoading.value = true
  try {
    const res = await getMyOauthGrants()
    const data = res?.data || res || {}
    userGrants.value = Array.isArray(data.grants) ? data.grants : []
    ecosystemApps.value = Array.isArray(data.ecosystemApps) ? data.ecosystemApps : []
  } catch (e) {
    console.error('Failed to load oauth grants:', e)
  } finally {
    grantsLoading.value = false
  }
}

function openAppDetailModal(grant) {
  selectedAppDetail.value = grant
  appDetailModalShow.value = true
}

async function handleRevokeGrant(grant) {
  if (!grant) return
  const appName = grant.appName || grant.clientId || t('thirdPartyApp')
  try {
    const confirmMsg = (t('thirdPartyRevokeConfirmMsg')).replace('{name}', appName)
    await ElMessageBox.confirm(
      confirmMsg,
      t('thirdPartyRevokeConfirmTitle'),
      {
        type: 'warning',
        confirmButtonText: t('thirdPartyRevokeBtn'),
        cancelButtonText: t('cancel'),
        confirmButtonClass: 'el-button--danger'
      }
    )

    revokingGrantId.value = grant.id
    await revokeMyOauthGrant(grant.id)
    ElMessage.success((t('thirdPartyRevokeSuccess')).replace('{name}', appName))

    userGrants.value = userGrants.value.filter(g => g.id !== grant.id && g.clientId !== grant.clientId)
    if (selectedAppDetail.value?.id === grant.id || selectedAppDetail.value?.clientId === grant.clientId) {
      appDetailModalShow.value = false
      selectedAppDetail.value = null
    }
  } catch (err) {
    if (err !== 'cancel' && err?.message !== 'cancel') {
      ElMessage.error(err?.message || t('removePermissionFailed'))
    }
  } finally {
    revokingGrantId.value = null
  }
}

async function handleRevokeFromModal(grant) {
  await handleRevokeGrant(grant)
}

function getInitialChar(str) {
  if (!str) return 'A'
  const trimmed = str.trim()
  return trimmed.charAt(0).toUpperCase()
}

function getAvatarBg(str) {
  const colors = [
    'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    'linear-gradient(135deg, #10b981, #047857)',
    'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    'linear-gradient(135deg, #f59e0b, #b45309)',
    'linear-gradient(135deg, #ec4899, #be185d)',
    'linear-gradient(135deg, #06b6d4, #0e7490)',
    'linear-gradient(135deg, #6366f1, #4338ca)'
  ]
  if (!str) return colors[0]
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % colors.length
  return colors[index]
}

function getHostname(url) {
  if (!url) return ''
  try {
    const u = new URL(url)
    return u.hostname
  } catch (e) {
    return url.replace(/^https?:\/\//, '').split('/')[0]
  }
}

function formatClientIdShort(clientId) {
  if (!clientId) return ''
  if (clientId.length <= 18) return clientId
  return clientId.substring(0, 10) + '...' + clientId.substring(clientId.length - 4)
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (e) {
    return dateStr
  }
}

function parseScopeList(scopesStr) {
  const scopes = typeof scopesStr === 'string'
    ? scopesStr.split(/\s+/).filter(Boolean)
    : (Array.isArray(scopesStr) ? scopesStr : ['openid', 'profile', 'email'])

  const dict = {
    openid: {
      key: 'openid',
      name: t('scopeOpenIdTitle'),
      desc: t('scopeOpenIdDesc'),
      icon: 'solar:key-minimalistic-square-3-bold-duotone',
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.12)'
    },
    email: {
      key: 'email',
      name: t('scopeEmailTitle'),
      desc: t('scopeEmailDesc'),
      icon: 'solar:letter-bold-duotone',
      color: '#06b6d4',
      bg: 'rgba(6, 182, 212, 0.12)'
    },
    profile: {
      key: 'profile',
      name: t('scopeProfileTitle'),
      desc: t('scopeProfileDesc'),
      icon: 'solar:user-circle-bold-duotone',
      color: '#8b5cf6',
      bg: 'rgba(139, 92, 246, 0.12)'
    },
    comments: {
      key: 'comments',
      name: t('scopeCommentsTitle'),
      desc: t('scopeCommentsDesc'),
      icon: 'solar:chat-round-dots-bold-duotone',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.12)'
    },
    'mail:read': {
      key: 'mail:read',
      name: t('scopeMailReadTitle'),
      desc: t('scopeMailReadDesc'),
      icon: 'solar:inbox-line-bold-duotone',
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.12)'
    }
  }

  return scopes.map(s => {
    return dict[s] || {
      key: s,
      name: s,
      desc: t('scopeCustomDesc'),
      icon: 'solar:shield-keyhole-bold-duotone',
      color: '#6366f1',
      bg: 'rgba(99, 102, 241, 0.12)'
    }
  })
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(t('copiedToClipboard'))
  } catch (err) {
    ElMessage.info(text)
  }
}

function initDataFromUserStore() {
  const user = userStore.user
  if (user && user.personalTelegram) {
    Object.assign(tgForm, user.personalTelegram)
  }
  if (user && user.personalForwarding) {
    Object.assign(forwardForm, user.personalForwarding)
  }
}

function openTgSettingDialog() {
  initDataFromUserStore()
  tgSettingDialogShow.value = true
}

async function saveTgSettingsFromModal() {
  await saveTgSettings(true)
  tgSettingDialogShow.value = false
}

async function saveTgSettings(showToast = true) {
  savingTg.value = true
  try {
    await updateProfile({
      personalTelegram: { ...tgForm }
    })
    userStore.user.personalTelegram = { ...tgForm }
    if (showToast) {
      ElMessage({
        message: t('tgSavedSuccess'),
        type: 'success',
        plain: true
      })
    }
  } catch (err) {
    ElMessage({
      message: err.message || t('saveFailed'),
      type: 'error',
      plain: true
    })
  } finally {
    savingTg.value = false
  }
}

async function handleTestTelegram() {
  if (!tgForm.botToken || !tgForm.chatId) {
    ElMessage({
      message: t('fillTgBotTokenChatId'),
      type: 'warning',
      plain: true
    })
    return
  }

  testingTg.value = true
  try {
    await testTelegramBot({
      botToken: tgForm.botToken,
      chatId: tgForm.chatId,
      topicId: tgForm.topicId
    })
    ElMessage({
      message: t('tgTestSuccess'),
      type: 'success',
      plain: true
    })
  } catch (err) {
    ElMessage({
      message: err.message || t('sendTestMsgFailed'),
      type: 'error',
      plain: true
    })
  } finally {
    testingTg.value = false
  }
}

async function saveForwardSettings(showToast = true) {
  savingForward.value = true
  try {
    await updateProfile({
      personalForwarding: { ...forwardForm }
    })
    userStore.user.personalForwarding = { ...forwardForm }
    if (showToast) {
      ElMessage({
        message: t('forwardingSavedSuccess'),
        type: 'success',
        plain: true
      })
    }
  } catch (err) {
    ElMessage({
      message: err.message || t('saveFailed'),
      type: 'error',
      plain: true
    })
  } finally {
    savingForward.value = false
  }
}

// ----------------------------------------------------
// Export Handlers
// ----------------------------------------------------
async function handleExportFullBackup() {
  exportingFull.value = true
  try {
    const res = await exportUserData({ type: 'full' })
    const dataObj = res || {}
    const jsonStr = JSON.stringify(dataObj, null, 2)
    triggerFileDownload(
      jsonStr,
      `epomail-full-backup-${userStore.user.email?.split('@')[0] || 'me'}-${Date.now()}.json`,
      'application/json'
    )
    ElMessage({
      message: t('exportSuccess'),
      type: 'success',
      plain: true
    })
  } catch (err) {
    ElMessage({
      message: err.message || t('exportFailed'),
      type: 'error',
      plain: true
    })
  } finally {
    exportingFull.value = false
  }
}

async function handleExportEmails() {
  exportingEmails.value = true
  try {
    const res = await exportUserData({ type: 'emails', format: emailExportFormat.value, range: emailExportRange.value })
    const emailsList = res?.emails || []
    
    if (emailExportFormat.value === 'mbox') {
      let mboxContent = ''
      for (const em of emailsList) {
        const dateStr = em.createTime ? new Date(em.createTime).toUTCString() : new Date().toUTCString()
        mboxContent += `From ${em.sendEmail || 'unknown@domain'} ${dateStr}\n`
        mboxContent += `Message-ID: <${em.messageId || em.emailId + '@epocanvas.mail'}>\n`
        mboxContent += `Date: ${dateStr}\n`
        mboxContent += `From: ${em.name ? `"${em.name}" ` : ''}<${em.sendEmail || 'unknown@domain'}>\n`
        mboxContent += `To: <${em.toEmail || userStore.user.email}>\n`
        mboxContent += `Subject: ${em.subject || '(No Subject)'}\n`
        mboxContent += `MIME-Version: 1.0\n`
        mboxContent += `Content-Type: text/html; charset=utf-8\n\n`
        mboxContent += (em.content || em.text || '') + '\n\n'
      }
      triggerFileDownload(
        mboxContent,
        `epomail-emails-${userStore.user.email?.split('@')[0] || 'archive'}-${Date.now()}.mbox`,
        'application/mbox'
      )
    } else if (emailExportFormat.value === 'csv') {
      let csvContent = 'ID,From,To,Subject,Date,Unread,IsSpam\n'
      for (const em of emailsList) {
        const row = [
          em.emailId,
          `"${(em.sendEmail || '').replace(/"/g, '""')}"`,
          `"${(em.toEmail || '').replace(/"/g, '""')}"`,
          `"${(em.subject || '').replace(/"/g, '""')}"`,
          `"${em.createTime || ''}"`,
          em.unread ? 'Yes' : 'No',
          em.isSpam ? 'Yes' : 'No'
        ]
        csvContent += row.join(',') + '\n'
      }
      triggerFileDownload(
        csvContent,
        `epomail-emails-${Date.now()}.csv`,
        'text/csv;charset=utf-8;'
      )
    } else {
      triggerFileDownload(
        JSON.stringify(emailsList, null, 2),
        `epomail-emails-${Date.now()}.json`,
        'application/json'
      )
    }

    ElMessage({
      message: t('exportSuccess'),
      type: 'success',
      plain: true
    })
  } catch (err) {
    ElMessage({
      message: err.message || t('exportArchiveFailed'),
      type: 'error',
      plain: true
    })
  } finally {
    exportingEmails.value = false
  }
}

async function handleExportContacts() {
  exportingContacts.value = true
  try {
    const res = await exportUserData({ type: 'contacts' })
    const payload = {
      profile: res?.user?.profile || {},
      customLabels: res?.customLabels || {},
      exportedAt: new Date().toISOString()
    }
    triggerFileDownload(
      JSON.stringify(payload, null, 2),
      `epomail-contacts-settings-${Date.now()}.json`,
      'application/json'
    )
    ElMessage({
      message: t('exportSuccess'),
      type: 'success',
      plain: true
    })
  } catch (err) {
    ElMessage({
      message: err.message || t('exportFailed'),
      type: 'error',
      plain: true
    })
  } finally {
    exportingContacts.value = false
  }
}

function triggerFileDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<style lang="scss" scoped>
.box {
  padding: 40px 40px;

  @media (max-width: 767px) {
    padding: 30px 20px;
  }

  .title {
    font-size: 18px;
    font-weight: bold;
    color: var(--text-primary);
  }

  .container {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 30px;
    padding: 24px;
    border-radius: 14px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);

    .item {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 40px;
      position: relative;
      align-items: center;
      padding: 16px 0;
      border-bottom: 1px solid var(--border-subtle);

      @media (max-width: 767px) {
        grid-template-columns: 1fr;
        gap: 10px;
      }

      > div:first-child {
        font-weight: bold;
        color: var(--text-primary);
      }

      .sub-hint {
        font-size: 12px;
        color: var(--text-secondary);
        font-weight: normal;
        margin-top: 3px;
        line-height: 1.45;
      }
    }
  }
}

.section-intro {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-top: -6px;
  margin-bottom: 4px;
}

/* 1. Export Section */
.export-cards-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.export-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 22px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  transition: all 0.2s ease;

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  &:hover {
    border-color: var(--border-mid);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  }

  &.primary-export {
    border-color: color-mix(in srgb, var(--accent-primary) 30%, transparent);
    background: color-mix(in srgb, var(--accent-muted) 8%, var(--bg-surface));
  }
}

.export-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;

  &.full-backup-icon {
    background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
    color: var(--accent-primary);
  }

  &.mail-icon-box {
    background: rgba(16, 185, 129, 0.12);
    color: #10b981;
  }

  &.config-icon-box {
    background: rgba(245, 158, 11, 0.12);
    color: #f59e0b;
  }
}

.export-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  .export-title-row {
    display: flex;
    align-items: center;
    gap: 10px;

    .export-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .format-pill {
      font-size: 11px;
      height: 20px;
      line-height: 18px;
      padding: 0 8px;
    }
  }

  .export-desc {
    font-size: 12.5px;
    color: var(--text-secondary);
    line-height: 1.5;
  }
}

.export-options-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-subtle);
  flex-wrap: wrap;

  .opt-field {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    color: var(--text-secondary);

    .opt-label {
      font-weight: 500;
      color: var(--text-secondary);
      white-space: nowrap;
    }
  }
}

.export-action {
  flex-shrink: 0;

  @media (max-width: 767px) {
    width: 100%;
    display: flex;
    justify-content: flex-end;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 8px;
    font-weight: 500;
  }
}

/* 2. Merged Forwarding Section */
.tg-push-item {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 16px 0 !important;
  border-bottom: 1px solid var(--border-subtle);

  .tg-item-info {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .tg-item-title-row {
      display: flex;
      align-items: center;
      gap: 8px;

      .tg-bot-icon {
        color: #3b82f6;
      }

      .tg-title-text {
        font-weight: bold;
        font-size: 14px;
        color: var(--text-primary);
      }
    }

    .sub-hint {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.45;
    }
  }

  .tg-item-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
}

.opt-button {
  width: fit-content !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 6px 12px !important;
  line-height: 1 !important;
  box-sizing: border-box !important;
  border-radius: 8px !important;

  :deep(span) {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    line-height: 1 !important;
  }
}

.forwarding-rule-section {
  display: flex;
  flex-direction: column;
}

.forward-toggle-row {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  padding: 16px 0 !important;
  border-bottom: 1px solid var(--border-subtle);

  .fw-title {
    font-weight: bold;
    font-size: 14px;
    color: var(--text-primary);
  }

  .sub-hint {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.45;
  }
}

.forwarding-fields {
  display: flex;
  flex-direction: column;
  transition: all 0.25s ease;

  &.fields-disabled {
    opacity: 0.45;
    pointer-events: none;
    filter: grayscale(0.2);
  }

  .forward-field-item,
  .forward-rule-item,
  .forward-options-item {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 32px;
    position: relative;
    padding: 18px 0;
    border-bottom: 1px solid var(--border-subtle);

    @media (max-width: 767px) {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    &.align-start {
      align-items: flex-start;
    }

    &.no-border {
      border-bottom: none;
    }

    .field-label-col {
      padding-top: 2px;
    }

    .fw-label {
      font-weight: bold;
      color: var(--text-primary);
      font-size: 14px;
    }

    .sub-hint {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 3px;
      line-height: 1.45;
    }
  }
}

.forward-input-wrap {
  width: 100%;
  max-width: 580px;

  .input-prefix-icon {
    color: var(--text-secondary);
    margin-left: 2px;
  }
}

.forward-type-wrapper {
  width: 100%;
  max-width: 580px;
}

.forward-type-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.rule-type-card {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;

  &:hover {
    border-color: var(--border-mid);
    background: var(--bg-hover);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  &.active {
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 6%, var(--bg-surface));
    box-shadow: 0 0 0 1px var(--accent-primary);

    .custom-radio-indicator {
      border-color: var(--accent-primary);
      background: var(--accent-primary);
    }
  }

  .rule-card-main {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
  }

  .custom-radio-indicator {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1.5px solid var(--border-mid);
    background: var(--bg-surface);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
    transition: all 0.2s ease;

    .radio-inner-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #ffffff;
    }
  }

  .rule-card-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;

    .r-title {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.4;
    }

    .r-desc {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.5;
    }
  }

  .alias-inline-subbox {
    margin-top: 12px;
    padding: 10px 14px;
    background: color-mix(in srgb, var(--bg-base) 60%, var(--bg-surface));
    border: 1px dashed color-mix(in srgb, var(--accent-primary) 30%, var(--border-subtle));
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;

    .alias-sub-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
    }
  }
}

.feature-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 12px;

  :deep(.el-checkbox) {
    margin-right: 0;
    height: auto;
    display: inline-flex;
    align-items: center;

    .el-checkbox__label {
      font-size: 13px;
      color: var(--text-primary);
      line-height: 1.4;
    }
  }
}

.form-actions-row {
  display: flex;
  padding-top: 18px;
  margin-top: 6px;

  .actions-wrapper {
    width: 100%;
    max-width: 580px;
    margin-left: calc(180px + 32px);
    display: flex;
    justify-content: flex-start;

    @media (max-width: 767px) {
      margin-left: 0;
      justify-content: flex-end;
    }
  }

  .save-forward-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 8px;
    padding: 8px 20px;
    font-weight: 500;
    font-size: 13.5px;
  }
}

.dialog-field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .d-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

/* Dialog Styling */
.forward-dialog {
  .forward-head {
    display: flex;
    align-items: center;
    gap: 8px;

    .forward-set-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .warning {
      color: var(--el-color-warning);
      cursor: help;
    }
  }

  .forward-set-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 6px 0;
  }
}

.tg-dialog-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--accent-primary) 8%, var(--bg-surface));
  border: 1px solid color-mix(in srgb, var(--accent-primary) 22%, transparent);
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.45;
}

/* Storage Container & Cards Grid */
.storage-container {
  margin-top: 24px;

  .storage-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 16px;
    margin-top: 16px;
  }

  .storage-card {
    border-radius: 12px;
    border: 1px solid var(--border-subtle, #e2e8f0);
    background: var(--bg-surface, #ffffff);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
      border-color: var(--border-mid, #cbd5e1);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
    }
  }

  .storage-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    .header-icon-title {
      display: flex;
      align-items: center;
      gap: 12px;

      .st-icon-box {
        width: 42px;
        height: 42px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        &.quota-icon {
          background: color-mix(in srgb, #3b82f6 12%, var(--bg-surface, #ffffff));
          color: #3b82f6;
        }

        &.b2-icon {
          background: color-mix(in srgb, #e11d48 12%, var(--bg-surface, #ffffff));
          color: #e11d48;
        }
      }

      .st-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--text-primary, #1e293b);
        line-height: 1.3;
      }

      .st-subtitle {
        font-size: 12px;
        color: var(--text-secondary, #64748b);
        margin-top: 2px;
      }
    }
  }

  .meter-body {
    display: flex;
    flex-direction: column;
    gap: 10px;

    .meter-numbers {
      display: flex;
      align-items: baseline;
      gap: 6px;

      .used-val {
        font-size: 22px;
        font-weight: 700;
        color: var(--text-primary, #1e293b);
        letter-spacing: -0.5px;
      }

      .total-val {
        font-size: 13.5px;
        color: var(--text-secondary, #64748b);
      }

      .pct-badge {
        margin-left: auto;
        font-size: 12px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 6px;
        background: color-mix(in srgb, #3b82f6 10%, var(--bg-surface, #ffffff));
        color: #3b82f6;

        &.warning {
          background: color-mix(in srgb, #f59e0b 12%, var(--bg-surface, #ffffff));
          color: #d97706;
        }

        &.danger {
          background: color-mix(in srgb, #ef4444 12%, var(--bg-surface, #ffffff));
          color: #dc2626;
        }
      }
    }

    .progress-track {
      width: 100%;
      height: 8px;
      border-radius: 4px;
      background: var(--border-subtle, #e2e8f0);
      overflow: hidden;

      .progress-bar-fill {
        height: 100%;
        border-radius: 4px;
        background: linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%);
        transition: width 0.4s ease;

        &.warning {
          background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%);
        }

        &.danger {
          background: linear-gradient(90deg, #ef4444 0%, #f87171 100%);
        }
      }
    }

    .meter-footnote {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      font-size: 12px;
      color: var(--text-secondary, #64748b);
      line-height: 1.45;
      margin-top: 2px;
    }
  }

  .byo-status-body {
    display: flex;
    flex-direction: column;
    gap: 12px;

    .byo-info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 12px;
      padding: 10px 12px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--accent-primary, #3b82f6) 4%, var(--bg-surface, #ffffff));
      border: 1px solid var(--border-subtle, #e2e8f0);

      .info-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        overflow: hidden;

        .i-label {
          color: var(--text-secondary, #64748b);
          flex-shrink: 0;
        }

        .i-val {
          color: var(--text-primary, #1e293b);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;

          &.bold { font-weight: 600; }
          &.code { font-family: monospace; font-size: 11.5px; }
        }
      }
    }

    .byo-footer-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
  }

  .byo-empty-body {
    .empty-desc {
      font-size: 12.5px;
      color: var(--text-secondary, #64748b);
      line-height: 1.55;
    }
  }
}

/* ==========================================================================
   Section 4: Third-Party Apps & Data Sharing (第三方应用与数据共享)
   ========================================================================== */
.third-party-apps-container {



  /* Header flex with subtle refresh action */
  .section-head-flex {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;

    .head-left-col {
      flex: 1;

      .title {
        margin-bottom: 4px;
      }
      .section-intro {
        margin-bottom: 0;
      }
    }

    .head-right-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 2px;

      .refresh-grants-btn {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        border: 1px solid var(--border-subtle);
        background: var(--bg-surface);
        color: var(--text-secondary);
        transition: all 0.2s ease;

        &:hover {
          color: var(--accent-primary, #3b82f6);
          border-color: var(--accent-primary, #3b82f6);
        }
      }
    }
  }

  .apps-loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 48px 24px;
    color: var(--text-secondary);
    font-size: 14px;

    .spin-icon {
      animation: spin 1.2s linear infinite;
      color: var(--accent-primary, #3b82f6);
    }
  }

  /* 3. Connected Apps Grid */
  .apps-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 16px;
    margin-bottom: 24px;

    @media (max-width: 767px) {
      grid-template-columns: 1fr;
    }

    .connected-app-card {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 14px;
      padding: 18px 20px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--border-mid);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
      }

      .app-card-header {
        display: flex;
        align-items: flex-start;
        gap: 14px;

        .app-avatar-box {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          overflow: hidden;
          background: color-mix(in srgb, var(--accent-primary, #3b82f6) 12%, transparent);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);

          .app-logo-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .app-letter-initial {
            font-size: 18px;
            font-weight: 700;
            color: #ffffff;
          }
        }

        .app-header-meta {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;

          .app-name-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;

            .app-main-name {
              font-size: 15px;
              font-weight: 600;
              color: var(--text-primary);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .verified-pill {
              display: inline-flex;
              align-items: center;
              font-size: 11px;
              padding: 0 8px;
              height: 20px;
              line-height: 20px;
            }

            .status-pill {
              font-size: 11px;
              padding: 0 6px;
              height: 20px;
              line-height: 20px;
            }
          }

          .app-origin-row {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--text-secondary);

            .app-host-link {
              display: inline-flex;
              align-items: center;
              gap: 3px;
              color: var(--accent-primary, #3b82f6);
              text-decoration: none;
              font-weight: 500;

              &:hover {
                text-decoration: underline;
              }

              .ext-ic {
                opacity: 0.8;
              }
            }

            .dot-sep {
              color: var(--border-mid);
            }

            .grant-date {
              color: var(--text-secondary);
              font-size: 11.5px;
            }
          }
        }
      }

      .app-card-desc {
        font-size: 12.5px;
        color: var(--text-secondary);
        line-height: 1.5;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .app-shared-scopes-section {
        background: color-mix(in srgb, var(--accent-primary, #3b82f6) 3%, var(--bg-surface));
        border: 1px dashed var(--border-subtle);
        border-radius: 8px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;

        .scopes-section-label {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11.5px;
          font-weight: 600;
          color: var(--text-secondary);

          .whisper-ic {
            color: var(--accent-primary, #3b82f6);
          }
        }

        .scope-pills-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;

          .shared-scope-chip {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: var(--bg-surface);
            border: 1px solid var(--border-subtle);
            border-radius: 6px;
            padding: 3px 8px;
            font-size: 11.5px;
            color: var(--text-primary);
            transition: all 0.15s ease;

            &:hover {
              border-color: var(--border-mid);
            }

            .chip-ic {
              flex-shrink: 0;
            }

            .chip-name {
              font-weight: 500;
            }
          }
        }
      }

      .app-card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding-top: 10px;
        border-top: 1px solid var(--border-subtle);
        margin-top: 2px;

        @media (max-width: 480px) {
          flex-direction: column;
          align-items: stretch;
          gap: 10px;
        }

        .footer-left-info {
          .client-id-badge {
            font-family: var(--font-mono, monospace);
            font-size: 11px;
            color: var(--text-secondary);
            background: color-mix(in srgb, var(--text-secondary) 8%, transparent);
            padding: 2px 6px;
            border-radius: 4px;
          }
        }

        .footer-btn-actions {
          display: flex;
          align-items: center;
          gap: 8px;

          .view-detail-btn, .revoke-access-btn {
            border-radius: 7px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
          }
        }
      }
    }
  }

  .no-search-results {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  /* 4. Empty State with Ecosystem Apps */
  /* 4. Empty State */
  .empty-apps-container {
    display: flex;
    flex-direction: column;
    margin-bottom: 24px;

    .empty-hero-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 24px;
      border-radius: 12px;
      background: var(--bg-surface);
      border: 1px dashed var(--border-subtle);

      @media (max-width: 640px) {
        flex-direction: column;
        text-align: center;
        gap: 12px;
        padding: 20px;
      }

      .empty-icon-box {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--accent-primary, #3b82f6) 10%, transparent);
        flex-shrink: 0;

        .shield-empty-ic {
          color: var(--accent-primary, #3b82f6);
        }
      }

      .empty-hero-content {
        flex: 1;

        .empty-hero-title {
          font-size: 14.5px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 3px;
        }

        .empty-hero-desc {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.5;
        }
      }
    }
  }
}

/* ==========================================================================
   App Detail Dialog (Google Account Style Modal)
   ========================================================================== */
:deep(.app-detail-dialog), .app-detail-dialog {
  border-radius: 16px !important;
  background: var(--bg-surface, #ffffff) !important;
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08)) !important;
  box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.2) !important;

  .app-detail-dialog-head {
    display: flex;
    align-items: center;
    gap: 14px;

    .head-avatar {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;

      .head-logo {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .head-initial {
        color: #ffffff;
        font-weight: 700;
        font-size: 18px;
      }
    }

    .head-info {
      display: flex;
      flex-direction: column;
      gap: 3px;

      .head-name-row {
        display: flex;
        align-items: center;
        gap: 8px;

        .head-app-name {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .verified-tag {
          display: inline-flex;
          align-items: center;
          font-size: 11px;
          padding: 0 6px;
          height: 20px;
          line-height: 20px;
        }
      }

      .head-origin-row {
        .head-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--accent-primary, #3b82f6);
          text-decoration: none;

          &:hover {
            text-decoration: underline;
          }
        }
      }
    }
  }

  .app-detail-dialog-body {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding-top: 6px;
    max-height: 56vh;
    overflow-y: auto;
    padding-right: 4px;

    .dialog-sub-section {
      display: flex;
      flex-direction: column;
      gap: 10px;

      .sec-title-row {
        display: flex;
        align-items: center;
        gap: 6px;

        .sec-title {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--text-primary);
        }
      }

      .can-access-list {
        display: flex;
        flex-direction: column;
        gap: 8px;

        .access-item-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 8px;
          background: color-mix(in srgb, var(--accent-primary, #3b82f6) 3%, var(--bg-surface));
          border: 1px solid var(--border-subtle);

          .item-icon-box {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            margin-top: 2px;
          }

          .item-info-col {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 2px;

            .item-title-line {
              display: flex;
              align-items: center;
              gap: 8px;

              .item-name {
                font-size: 13px;
                font-weight: 600;
                color: var(--text-primary);
              }

              .item-key {
                font-family: var(--font-mono, monospace);
                font-size: 11px;
                color: var(--text-secondary);
                background: color-mix(in srgb, var(--text-secondary) 8%, transparent);
                padding: 1px 5px;
                border-radius: 4px;
              }
            }

            .item-desc {
              font-size: 12px;
              color: var(--text-secondary);
              line-height: 1.45;
            }
          }
        }
      }

      .tech-info-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 6px;
        padding: 10px 14px;
        border-radius: 8px;
        background: var(--bg-surface);
        border: 1px solid var(--border-subtle);

        .tech-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;

          .t-label {
            color: var(--text-secondary);
            width: 130px;
            flex-shrink: 0;
          }

          .t-val {
            color: var(--text-primary);
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;

            &.code-font {
              font-family: var(--font-mono, monospace);
              font-size: 11.5px;
            }
          }
        }
      }
    }
  }

  .dialog-footer-between {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;

    .danger-revoke-btn {
      border-radius: 8px;
    }
  }
}
</style>

<style lang="scss">
.app-detail-dialog.el-dialog {
  background: var(--bg-surface, #ffffff) !important;
  border-radius: 16px !important;
  border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08)) !important;
  box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.25) !important;
  overflow: hidden;

  .el-dialog__header {
    padding: 20px 24px 14px;
    border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
    margin-right: 0;
  }

  .el-dialog__body {
    padding: 18px 24px;
  }

  .el-dialog__footer {
    padding: 14px 24px 18px;
    border-top: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
  }
}
</style>
