<template>
  <div class="box data-settings-page">
    
    <!-- Section 1: 用户资料与数据汇出 (Data Export) -->
    <div class="container export-container" id="dataExport">
      <div class="title">{{ $t('dataExportTitle') || '用户资料与数据汇出' }}</div>
      <div class="section-intro">
        {{ $t('dataExportDesc') || '您可以将您的个人账户资料、邮件历史、通讯录以及自定义配置一键打包导出并下载到本地，格式兼容通用开放标准。' }}
      </div>

      <div class="export-cards-grid">
        <!-- 1. 全量数据备份 -->
        <div class="export-card primary-export">
          <div class="export-icon-box full-backup-icon">
            <Icon icon="fluent:database-link-24-filled" width="24" height="24" />
          </div>
          <div class="export-meta">
            <div class="export-title-row">
              <span class="export-title">{{ $t('exportAllData') || '汇出全量数据 (完整备份)' }}</span>
              <el-tag size="small" type="primary" effect="plain" round class="format-pill">JSON</el-tag>
            </div>
            <div class="export-desc">{{ $t('exportAllDataDesc') || '包含完整的账户个资、历史邮件归档、通讯录、分类与标签规则及安全设置' }}</div>
          </div>
          <div class="export-action">
            <el-button 
              type="primary" 
              :loading="exportingFull" 
              @click="handleExportFullBackup"
              class="action-btn"
            >
              <Icon icon="lucide:download" width="15" height="15" />
              <span>{{ $t('exportDownloadBtn') || '打包并下载' }} (JSON)</span>
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
              <span class="export-title">{{ $t('exportEmailsOnly') || '邮件历史归档' }}</span>
            </div>
            <div class="export-desc">{{ $t('exportEmailsOnlyDesc') || '仅导出收发邮件数据，支持标准 MBOX、JSON 或 CSV 格式' }}</div>
            
            <div class="export-options-bar">
              <div class="opt-field">
                <span class="opt-label">{{ $t('exportFormat') || '导出格式' }}:</span>
                <el-radio-group v-model="emailExportFormat" size="small">
                  <el-radio-button label="mbox">MBOX (通用)</el-radio-button>
                  <el-radio-button label="json">JSON</el-radio-button>
                  <el-radio-button label="csv">CSV</el-radio-button>
                </el-radio-group>
              </div>

              <div class="opt-field">
                <span class="opt-label">{{ $t('exportRange') || '时间范围' }}:</span>
                <el-select v-model="emailExportRange" size="small" class="range-select" style="width: 130px;">
                  <el-option :label="$t('exportAllTime') || '全部历史邮件'" value="all" />
                  <el-option :label="$t('exportLast30Days') || '最近 30 天'" value="30d" />
                  <el-option :label="$t('exportLast1Year') || '最近 1 年'" value="1y" />
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
              <span>{{ $t('exportDownloadBtn') || '打包并下载' }}</span>
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
              <span class="export-title">{{ $t('exportContactsOnly') || '通讯录与配置' }}</span>
              <el-tag size="small" type="info" effect="plain" round class="format-pill">JSON</el-tag>
            </div>
            <div class="export-desc">{{ $t('exportContactsOnlyDesc') || '导出联系人名录、自定义别名规则与系统个性化偏好' }}</div>
          </div>
          <div class="export-action">
            <el-button 
              type="default" 
              :loading="exportingContacts" 
              @click="handleExportContacts"
              class="action-btn"
            >
              <Icon icon="lucide:download" width="15" height="15" />
              <span>{{ $t('exportDownloadBtn') || '打包并下载' }}</span>
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 2: 邮件与消息转发 (Personal TG Push & Email Forwarding) -->
    <div class="container forwarding-container" id="forwarding" v-if="allowUserTg || (currentMailMode !== 2 && allowUserEmailForward)">
      <div class="title">{{ $t('forwardingAndPushTitle') || '邮件与消息转发' }}</div>
      
      <!-- 1. Telegram 消息推送 (以 Button 设置弹窗形式集成) -->
      <div class="item tg-push-item" v-if="allowUserTg">
        <div class="tg-item-info">
          <div class="tg-item-title-row">
            <Icon icon="fluent:bot-20-filled" width="18" height="18" class="tg-bot-icon" />
            <span class="tg-title-text">{{ $t('tgPushNotification') || 'Telegram 消息推送' }}</span>
          </div>
          <div class="sub-hint">
            {{ tgForm.enabled ? (tgForm.chatId ? `已启用 · 私人专属通知通道已开启 (${tgForm.chatId})` : '已启用 · 实时接收到达您邮箱的所有邮件推送') : ($t('tgPushNotificationDesc') || '绑定个人专属 Telegram 机器人，实时接收到达您的邮件通知') }}
          </div>
        </div>
        <div class="tg-item-actions">
          <el-tag :type="tgForm.enabled ? 'success' : 'info'" size="small" effect="plain" round>
            {{ tgForm.enabled ? ($t('enabled') || '已启用') : ($t('disabled') || '未启用') }}
          </el-tag>
          <el-button class="opt-button" size="small" type="primary" @click="openTgSettingDialog" :title="$t('settings') || '配置'">
            <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
          </el-button>
        </div>
      </div>

      <!-- 2. 邮件规则转发与自动抄送 (仅在非加密模式且管理员允许时提供，加密模式下全面禁用并隐藏) -->
      <template v-if="currentMailMode !== 2 && allowUserEmailForward">
        <div class="forwarding-rule-section">
          <!-- 启用自动转发开关 -->
          <div class="item forward-toggle-row">
            <div>
              <div class="fw-title">{{ $t('forwardingEnable') || '启用自动邮件转发' }}</div>
              <div class="sub-hint">{{ $t('forwardingRulesDesc') || '规则转发只会转发设置邮箱所接收的邮件' }}</div>
            </div>
            <div>
              <el-switch v-model="forwardForm.enabled" @change="saveForwardSettings(false)" />
            </div>
          </div>

          <div class="forwarding-fields" :class="{ 'fields-disabled': !forwardForm.enabled }">
            <!-- 目的地邮箱 -->
            <div class="item forward-field-item">
              <div>
                <div class="fw-label">{{ $t('forwardingDestination') || '转发目的地邮箱' }}</div>
                <div class="sub-hint">接收转发邮件的目标地址</div>
              </div>
              <div class="forward-input-wrap">
                <el-input 
                  v-model="forwardForm.targets" 
                  :placeholder="$t('forwardingDestinationPlaceholder') || '输入目标邮箱地址，多个邮箱用英文逗号分隔，如 yourname@gmail.com'" 
                  clearable 
                />
              </div>
            </div>

            <!-- 触发规则类型 -->
            <div class="item forward-rule-item align-start">
              <div style="padding-top: 4px;">
                <div class="fw-label">{{ $t('forwardingType') || '转发触发规则' }}</div>
                <div class="sub-hint">选择在何种条件下触发转发</div>
              </div>
              <div class="forward-type-wrapper">
                <el-radio-group v-model="forwardForm.mode" class="forward-type-group">
                  <el-radio label="all">
                    <span class="r-title">{{ $t('forwardingTypeAll') || '全部邮件直接抄送转发' }}</span>
                    <span class="r-desc">{{ $t('forwardingTypeAllDesc') || '所有进入当前邮箱的邮件无条件抄送转发至目的地' }}</span>
                  </el-radio>
                  <el-radio label="alias">
                    <span class="r-title">{{ $t('forwardingTypeAlias') || '特定前缀/字母别名转发' }}</span>
                    <span class="r-desc">{{ $t('forwardingTypeAliasDesc') || '仅当收件邮箱匹配指定别名前缀时触发转发（如 billing、dev-*）' }}</span>
                  </el-radio>
                  <el-radio label="rules">
                    <span class="r-title">{{ $t('forwardingTypeRules') || '智能规则过滤转发' }}</span>
                    <span class="r-desc">{{ $t('forwardingTypeRulesDesc') || '仅当满足特定条件（如重要邮件或含特定关键词）时触发转发' }}</span>
                  </el-radio>
                </el-radio-group>

                <!-- 别名前缀输入 -->
                <div v-if="forwardForm.mode === 'alias'" class="alias-prefixes-box">
                  <span class="field-lbl">{{ $t('forwardingAliasPrefix') || '匹配的前缀/别名' }}:</span>
                  <el-input 
                    v-model="forwardForm.aliasPrefixes" 
                    size="small" 
                    :placeholder="$t('forwardingAliasPrefixPlaceholder') || '多个前缀用逗号隔开，如 billing, dev, notice'" 
                    style="flex: 1;"
                  />
                </div>
              </div>
            </div>

            <!-- 高级选项 -->
            <div class="item forward-options-item align-start no-border">
              <div>
                <div class="fw-label">高级选项</div>
                <div class="sub-hint">保留原件与转发主题标头</div>
              </div>
              <div class="feature-checkboxes">
                <el-checkbox v-model="forwardForm.keepCopy">
                  {{ $t('forwardingKeepCopy') || '在收件箱中保留邮件原件' }}
                </el-checkbox>
                <el-checkbox v-model="forwardForm.addPrefix">
                  {{ $t('forwardingSubjectPrefix') || '在转发邮件主题添加 [Fwd] 标头' }}
                </el-checkbox>
              </div>
            </div>

            <div class="form-actions-row">
              <el-button 
                type="primary" 
                :loading="savingForward" 
                @click="saveForwardSettings(true)"
                class="save-forward-btn"
              >
                <Icon icon="fluent:save-20-regular" width="16" height="16" style="margin-right: 4px;" />
                {{ $t('save') || '保存转发规则' }}
              </el-button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Section 3: 开发者 API 与第三方应用接入 (API & App Authorization) -->
    <div class="container api-container" id="apiAccess" v-if="allowUserApiSupport">
      <div class="title">{{ $t('apiDeveloperTitle') || '开发者 API 与第三方应用接入' }}</div>
      <div class="section-intro">
        {{ $t('apiDeveloperDesc') || '管理个人访问令牌 (API Key)，并授权外部应用安全接入 Epomail 生态。' }}
      </div>

      <!-- 1. 个人访问令牌 (Personal Access Tokens) -->
      <div class="pat-header-row">
        <div class="sub-header-title">
          <Icon icon="fluent:key-20-filled" width="18" height="18" class="key-icon" />
          <span>{{ $t('apiTokenManagement') || '个人访问令牌 (Personal Access Tokens)' }}</span>
        </div>
        <el-button type="primary" size="small" @click="openCreateTokenModal">
          <Icon icon="fluent:add-12-filled" width="14" height="14" style="margin-right: 4px;" />
          {{ $t('createApiToken') || '生成新 API Token' }}
        </el-button>
      </div>

      <!-- Token 列表 -->
      <div class="tokens-list-wrapper">
        <div v-if="apiTokensList.length > 0" class="tokens-grid">
          <div v-for="tok in apiTokensList" :key="tok.id" class="token-card">
            <div class="token-info">
              <div class="tok-name-row">
                <span class="tok-name">{{ tok.name }}</span>
                <el-tag size="small" type="success" effect="plain" round>Active</el-tag>
              </div>
              <div class="tok-val-row">
                <span class="tok-masked font-mono">{{ maskToken(tok.token) }}</span>
                <el-button link type="primary" size="small" @click="copyToken(tok.token)" :title="$t('copy') || '复制'">
                  <Icon icon="lucide:copy" width="14" height="14" />
                </el-button>
              </div>
              <div class="tok-meta-row">
                <span>{{ formatDate(tok.createdAt) }}</span>
                <span v-if="tok.expiresAt"> · {{ formatExpireDate(tok.expiresAt) }}</span>
                <span> · Scopes: {{ (tok.scopes || []).join(', ') }}</span>
              </div>
            </div>
            <div class="token-actions">
              <el-button type="danger" text size="small" @click="handleDeleteToken(tok.id)">
                <Icon icon="lucide:trash-2" width="16" height="16" />
              </el-button>
            </div>
          </div>
        </div>
        <div v-else class="empty-tokens-box">
          <Icon icon="fluent:key-reset-24-regular" width="28" height="28" class="empty-key-icon" />
          <span>尚未生成任何个人访问令牌。您可以生成令牌以使用自动化脚本或第三方邮件客户端。</span>
        </div>
      </div>

      <!-- 2. 「使用 Epomail 登录」开放平台预览与规范 (OAuth 2.0 / OIDC Architecture Preview) -->
      <div class="sso-preview-card">
        <div class="sso-header">
          <div class="sso-title-group">
            <div class="epomail-logo-badge">
              <img src="/logo.svg" alt="Logo" width="24" height="24" />
            </div>
            <div>
              <div class="sso-title">{{ $t('epomailLoginPreview') || '「使用 Epomail 登录」 (Sign in with Epomail)' }}</div>
              <div class="sso-sub">{{ $t('epomailLoginPreviewDesc') || '基于 OAuth 2.0 / OpenID Connect (OIDC) 行业标准协议，支持任何网站与客户端原生调用 Epomail 进行单点身份验证 (SSO) 与邮件 API 互联。' }}</div>
            </div>
          </div>
          <el-tag type="info" size="small" effect="dark" round>RFC 6749 / 7636 Ready</el-tag>
        </div>

        <div class="sso-endpoints-grid">
          <div class="endpoint-item">
            <span class="ep-method get">GET</span>
            <span class="ep-url font-mono">/api/oauth/authorize</span>
            <span class="ep-desc">用户授权与身份确认端点 (PKCE 支持)</span>
          </div>
          <div class="endpoint-item">
            <span class="ep-method post">POST</span>
            <span class="ep-url font-mono">/api/oauth/token</span>
            <span class="ep-desc">Access Token & Refresh Token 签发与置换</span>
          </div>
          <div class="endpoint-item">
            <span class="ep-method get">GET</span>
            <span class="ep-url font-mono">/api/oauth/userinfo</span>
            <span class="ep-desc">标准 OpenID Connect 用户资料与主邮箱提取</span>
          </div>
        </div>

        <div class="sso-demo-bar">
          <span class="demo-label">集成演示按钮：</span>
          <button class="epomail-sso-btn" @click="demoSsoClick">
            <img src="/logo.svg" width="16" height="16" />
            <span>Sign in with Epomail</span>
          </button>
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
          <span class="forward-set-title">{{ $t('tgBotConfigTitle') || 'Telegram 消息推送配置' }}</span>
        </div>
      </template>

      <div class="forward-set-body">
        <div class="tg-dialog-hint">
          <Icon icon="fluent:info-16-regular" width="16" height="16" style="flex-shrink:0; margin-top:2px; color:var(--accent-primary);" />
          <span>{{ $t('tgPersonalBotDesc') || '绑定您的私有 Telegram 机器人，实时接收到达您的新邮件通知。' }}</span>
        </div>

        <div class="dialog-field">
          <span class="d-label">{{ $t('tgBotToken') || 'Bot Token' }} <span style="color: var(--el-color-danger)">*</span></span>
          <el-input 
            v-model="tgForm.botToken" 
            type="password" 
            show-password 
            :placeholder="$t('tgBotTokenPlaceholder') || '例如：123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ'" 
            clearable 
          />
        </div>

        <div class="dialog-field">
          <span class="d-label">{{ $t('tgChatId') || 'Chat ID' }} <span style="color: var(--el-color-danger)">*</span></span>
          <el-input 
            v-model="tgForm.chatId" 
            :placeholder="$t('tgChatIdPlaceholder') || '例如：123456789 或 目标频道 ID'" 
            clearable 
          />
        </div>

        <div class="dialog-field">
          <span class="d-label">{{ $t('tgTopicId') || '话题/Topic ID (可选)' }}</span>
          <el-input 
            v-model="tgForm.topicId" 
            :placeholder="$t('tgTopicIdPlaceholder') || '若在群组话题内接收，请输入数字 Topic ID'" 
            clearable 
          />
        </div>

        <div class="dialog-field" style="margin-top: 4px;">
          <span class="d-label">推送附加功能</span>
          <div class="feature-checkboxes">
            <el-checkbox v-model="tgForm.notifyCodeOnly">
              {{ $t('tgNotifyCodeOnly') || '提取并附加一次性验证码快捷复制' }}
            </el-checkbox>
            <el-checkbox v-model="tgForm.includePreview">
              {{ $t('tgIncludePreview') || '包含邮件摘要与 WebApp 查看按钮' }}
            </el-checkbox>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <el-button 
            type="default" 
            size="default" 
            :loading="testingTg" 
            :disabled="!tgForm.botToken || !tgForm.chatId"
            @click="handleTestTelegram"
          >
            <Icon icon="fluent:send-20-regular" width="16" height="16" style="margin-right: 4px;" />
            {{ $t('tgTestSend') || '发送测试' }}
          </el-button>
          
          <div style="display: flex; align-items: center; gap: 12px;">
            <el-switch 
              v-model="tgForm.enabled" 
              :active-text="$t('enable')" 
              :inactive-text="$t('disable')" 
            />
            <el-button 
              type="primary" 
              :loading="savingTg" 
              @click="saveTgSettingsFromModal"
            >
              {{ $t('save') || '保存配置' }}
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- DIALOG: 创建新 API Token -->
    <el-dialog
      v-model="createTokenModalShow"
      :title="$t('createApiToken') || '生成新 API Token'"
      width="440px"
      destroy-on-close
    >
      <div style="display: flex; flex-direction: column; gap: 14px; padding: 6px 0;">
        <div class="dialog-field">
          <span class="d-label">{{ $t('tokenName') || '令牌名称' }} *</span>
          <el-input 
            v-model="newTokenForm.name" 
            :placeholder="$t('tokenNamePlaceholder') || '例如：GitHub Actions, Mac Mail Client'" 
            maxlength="40"
          />
        </div>

        <div class="dialog-field">
          <span class="d-label">{{ $t('tokenExpires') || '有效期' }}</span>
          <el-select v-model="newTokenForm.expiresInDays" style="width: 100%;">
            <el-option :label="$t('tokenExpires30') || '30 天'" :value="30" />
            <el-option :label="$t('tokenExpires90') || '90 天'" :value="90" />
            <el-option :label="$t('tokenExpiresNever') || '永久有效'" :value="0" />
          </el-select>
        </div>

        <div class="dialog-field">
          <span class="d-label">{{ $t('tokenScopes') || '权限范围 (Scopes)' }}</span>
          <el-checkbox-group v-model="newTokenForm.scopes" style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
            <el-checkbox label="emails:read">{{ $t('scopeRead') || '读取邮件 (emails:read)' }}</el-checkbox>
            <el-checkbox label="emails:send">{{ $t('scopeSend') || '发送邮件 (emails:send)' }}</el-checkbox>
            <el-checkbox label="profile:read">{{ $t('scopeProfile') || '读取个资 (profile:read)' }}</el-checkbox>
          </el-checkbox-group>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <el-button @click="createTokenModalShow = false">{{ $t('cancel') || '取消' }}</el-button>
          <el-button type="primary" :loading="creatingToken" @click="submitCreateToken">
            {{ $t('save') || '生成令牌' }}
          </el-button>
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
import {
  exportUserData,
  testTelegramBot,
  updateProfile,
  getApiTokens,
  createApiToken,
  deleteApiToken
} from '@/request/my.js'
import { websiteConfig } from '@/request/setting.js'

defineOptions({
  name: 'data-setting'
})

const { t } = useI18n()
const userStore = useUserStore()
const settingStore = useSettingStore()

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

const currentMailMode = ref(0)

// 4. API Tokens States
const apiTokensList = ref([])
const createTokenModalShow = ref(false)
const creatingToken = ref(false)
const newTokenForm = reactive({
  name: '',
  expiresInDays: 30,
  scopes: ['emails:read', 'emails:send', 'profile:read']
})

const sendQuotaText = computed(() => {
  const user = userStore.user
  if (!user || !user.role) return '计算中...'
  const sendCount = user.sendCount || 0
  const maxCount = user.role.sendCount
  if (!maxCount) return `${sendCount} / 无限`
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

const allowUserApiSupport = computed(() => {
  if (settingStore.settings?.userApiSupport !== undefined) {
    return Number(settingStore.settings.userApiSupport) === 1
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
  if (allowUserApiSupport.value) {
    fetchTokens()
  }
})

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
        message: t('tgSavedSuccess') || '个人 Telegram 配置保存成功',
        type: 'success',
        plain: true
      })
    }
  } catch (err) {
    ElMessage({
      message: err.message || '保存失败',
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
      message: '请先填写 Bot Token 与 Chat ID',
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
      message: t('tgTestSuccess') || '测试消息发送成功，请在 Telegram 中查收！',
      type: 'success',
      plain: true
    })
  } catch (err) {
    ElMessage({
      message: err.message || '发送测试消息失败',
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
        message: t('forwardingSavedSuccess') || '邮件转发规则保存成功',
        type: 'success',
        plain: true
      })
    }
  } catch (err) {
    ElMessage({
      message: err.message || '保存失败',
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
      message: t('exportSuccess') || '资料汇出成功',
      type: 'success',
      plain: true
    })
  } catch (err) {
    ElMessage({
      message: err.message || '导出失败',
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
      message: t('exportSuccess') || '邮件归档汇出成功',
      type: 'success',
      plain: true
    })
  } catch (err) {
    ElMessage({
      message: err.message || '导出邮件归档失败',
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
      message: t('exportSuccess') || '通讯录与配置汇出成功',
      type: 'success',
      plain: true
    })
  } catch (err) {
    ElMessage({
      message: err.message || '导出失败',
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

// ----------------------------------------------------
// API Tokens Handlers
// ----------------------------------------------------
async function fetchTokens() {
  try {
    const res = await getApiTokens()
    apiTokensList.value = Array.isArray(res) ? res : []
  } catch (e) {
    console.error('Failed to fetch api tokens:', e)
  }
}

function openCreateTokenModal() {
  newTokenForm.name = ''
  newTokenForm.expiresInDays = 30
  newTokenForm.scopes = ['emails:read', 'emails:send', 'profile:read']
  createTokenModalShow.value = true
}

async function submitCreateToken() {
  if (!newTokenForm.name.trim()) {
    ElMessage({
      message: '请输入令牌名称',
      type: 'warning',
      plain: true
    })
    return
  }

  creatingToken.value = true
  try {
    const res = await createApiToken({
      name: newTokenForm.name.trim(),
      expiresInDays: newTokenForm.expiresInDays,
      scopes: newTokenForm.scopes
    })
    createTokenModalShow.value = false
    await fetchTokens()

    if (res && res.token) {
      ElMessageBox.alert(
        `<div style="word-break:break-all; font-family:monospace; background:var(--bg-elevated); padding:12px; border-radius:8px; user-select:all; border:1px solid var(--border-subtle); color:var(--accent-primary); font-weight:600;">${res.token}</div><p style="margin-top:10px; font-size:12px; color:var(--text-secondary);">请立即复制并妥善保管此 Token。出于安全原因，该完整密钥将不再二次完整显示。</p>`,
        'API Token 创建成功',
        {
          dangerouslyUseHTMLString: true,
          confirmButtonText: '已复制并保存'
        }
      )
    }
  } catch (err) {
    ElMessage({
      message: err.message || '创建 Token 失败',
      type: 'error',
      plain: true
    })
  } finally {
    creatingToken.value = false
  }
}

async function handleDeleteToken(tokenId) {
  try {
    await ElMessageBox.confirm('确定要撤销并删除该 API 访问令牌吗？', '撤销确认', {
      type: 'warning',
      confirmButtonText: '确认撤销',
      cancelButtonText: '取消'
    })
    await deleteApiToken(tokenId)
    await fetchTokens()
    ElMessage({
      message: '令牌已成功撤销',
      type: 'success',
      plain: true
    })
  } catch (e) {
    // cancelled
  }
}

function copyToken(tok) {
  if (!tok) return
  navigator.clipboard.writeText(tok).then(() => {
    ElMessage({
      message: t('copyTokenSuccess') || 'Token 已复制到剪贴板',
      type: 'success',
      plain: true
    })
  })
}

function maskToken(tok) {
  if (!tok) return ''
  if (tok.length <= 16) return tok
  return tok.slice(0, 12) + '••••••••' + tok.slice(-4)
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return `创建于 ${d.toLocaleDateString()}`
  } catch (e) {
    return isoStr
  }
}

function formatExpireDate(isoStr) {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return `过期时间: ${d.toLocaleDateString()}`
  } catch (e) {
    return ''
  }
}

function demoSsoClick() {
  ElMessage({
    message: '「使用 Epomail 登录」集成已就绪，已向开发者控制台开放 Client 配置。',
    type: 'info',
    plain: true
  })
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
.quota-warning-banner {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 20px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 12px;

  .warning-icon {
    color: #f59e0b;
    margin-top: 2px;
    flex-shrink: 0;
  }

  .warning-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .warning-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .warning-desc {
    font-size: 12.5px;
    color: var(--text-secondary);
    line-height: 1.55;
  }

  .quota-pill-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-surface);
    border: 1px solid rgba(245, 158, 11, 0.3);
    padding: 3px 12px;
    border-radius: 20px;
    font-size: 12px;
    width: fit-content;
    margin-top: 4px;

    .quota-lbl {
      color: var(--text-secondary);
      font-weight: 500;
    }
    .quota-val {
      font-weight: 700;
      color: #f59e0b;
      font-family: monospace;
    }
  }
}

/* Telegram Push Item */
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
  transition: opacity 0.2s ease;

  .mode-rule-notice-banner {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    border-radius: 10px;
    margin: 12px 0 6px 0;
    border: 1px solid var(--border-subtle);
    background: var(--bg-hover);
    transition: all 0.2s ease;

    &.mode-1 {
      background: color-mix(in srgb, var(--accent-primary) 6%, var(--bg-surface));
      border-color: color-mix(in srgb, var(--accent-primary) 22%, transparent);
    }

    &.mode-0 {
      background: rgba(16, 185, 129, 0.06);
      border-color: rgba(16, 185, 129, 0.22);
    }

    &.mode-2 {
      background: rgba(245, 158, 11, 0.06);
      border-color: rgba(245, 158, 11, 0.25);
    }

    .mode-badge-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mode-notice-text {
      font-size: 12.5px;
      color: var(--text-secondary);
      line-height: 1.55;

      .encrypted-notice-wrap {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
    }
  }

  .fw-label-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .help-q-icon {
    color: var(--text-secondary);
    cursor: help;
    flex-shrink: 0;
    transition: color 0.2s;

    &:hover {
      color: var(--accent-primary);
    }
  }

  .pool-empty-callout {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 14px;
    background: rgba(245, 158, 11, 0.08);
    border: 1px dashed rgba(245, 158, 11, 0.3);
    border-radius: 8px;
    font-size: 12.5px;
    color: var(--text-secondary);
    line-height: 1.45;

    .empty-icon {
      color: #f59e0b;
      flex-shrink: 0;
      margin-top: 2px;
    }
  }

  .forward-field-item,
  .forward-rule-item,
  .forward-options-item {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 40px;
    position: relative;
    padding: 16px 0;
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

    .fw-label {
      font-weight: bold;
      color: var(--text-primary);
      font-size: 14px;
    }

    .sub-hint {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 3px;
      line-height: 1.4;
    }
  }
}

.forward-input-wrap {
  width: 100%;
  max-width: 540px;
}

.forward-type-wrapper {
  flex: 1;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.forward-type-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;

  :deep(.el-radio) {
    height: auto;
    padding: 12px 16px;
    border-radius: 10px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    margin-right: 0;
    align-items: flex-start;
    transition: all 0.2s ease;

    &:hover {
      border-color: var(--accent-primary);
      background: var(--bg-hover);
    }

    &.is-checked {
      border-color: var(--accent-primary);
      background: color-mix(in srgb, var(--accent-muted) 12%, var(--bg-surface));
    }

    .el-radio__input {
      margin-top: 2px;
    }

    .el-radio__label {
      display: flex;
      flex-direction: column;
      gap: 3px;
      white-space: normal;
      padding-left: 10px;
    }

    .r-title {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .r-desc {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.45;
    }
  }
}

.alias-prefixes-box {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  padding: 8px 12px;
  background: var(--bg-hover);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--text-secondary);

  .field-lbl {
    font-weight: 500;
    white-space: nowrap;
  }
}

.fields-disabled {
  opacity: 0.55;
  pointer-events: none;
}

.feature-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 10px;

  :deep(.el-checkbox) {
    margin-right: 0;
    color: var(--text-primary);
    font-size: 13px;
  }
}

.form-actions-row {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 18px;
  margin-top: 4px;

  .save-forward-btn {
    display: inline-flex;
    align-items: center;
    border-radius: 8px;
    padding: 8px 18px;
    font-weight: 500;
  }
}

/* 3. API Section */
.pat-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);

  .sub-header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: bold;
    color: var(--text-primary);

    .key-icon {
      color: var(--accent-primary);
    }
  }
}

.tokens-list-wrapper {
  margin-bottom: 24px;
}

.tokens-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.token-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-radius: 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--border-mid);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  }

  .token-info {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .tok-name-row {
      display: flex;
      align-items: center;
      gap: 10px;

      .tok-name {
        font-weight: 600;
        font-size: 14px;
        color: var(--text-primary);
      }
    }

    .tok-val-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--accent-primary);
    }

    .tok-meta-row {
      font-size: 11.5px;
      color: var(--text-muted);
      margin-top: 2px;
    }
  }

  .token-actions {
    flex-shrink: 0;
  }
}

.empty-tokens-box {
  padding: 32px 20px;
  border-radius: 10px;
  background: var(--bg-surface);
  border: 1px dashed var(--border-subtle);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);

  .empty-key-icon {
    opacity: 0.6;
    color: var(--text-muted);
  }
}

/* SSO Preview Card */
.sso-preview-card {
  padding: 20px 22px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent-muted) 8%, var(--bg-surface));
  border: 1px solid color-mix(in srgb, var(--accent-primary) 22%, transparent);
  display: flex;
  flex-direction: column;
  gap: 16px;

  .sso-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;

    @media (max-width: 767px) {
      flex-direction: column;
      gap: 10px;
    }

    .sso-title-group {
      display: flex;
      align-items: center;
      gap: 12px;

      .epomail-logo-badge {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        flex-shrink: 0;
      }

      .sso-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--text-primary);
      }

      .sso-sub {
        font-size: 12.5px;
        color: var(--text-secondary);
        margin-top: 2px;
        line-height: 1.45;
      }
    }
  }
}

.sso-endpoints-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .endpoint-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 14px;
    background: var(--bg-surface);
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
    font-size: 12.5px;

    @media (max-width: 767px) {
      flex-wrap: wrap;
      gap: 8px;
    }

    .ep-method {
      font-weight: 700;
      font-family: monospace;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      flex-shrink: 0;

      &.get {
        background: rgba(16, 185, 129, 0.15);
        color: #10b981;
      }
      &.post {
        background: rgba(59, 130, 246, 0.15);
        color: #3b82f6;
      }
    }

    .ep-url {
      font-weight: 600;
      color: var(--text-primary);
      flex-shrink: 0;
    }

    .ep-desc {
      color: var(--text-secondary);
      margin-left: auto;
      font-size: 12px;

      @media (max-width: 767px) {
        margin-left: 0;
        width: 100%;
      }
    }
  }
}

.sso-demo-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 6px;

  .demo-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .epomail-sso-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    background: var(--text-primary);
    color: var(--bg-surface);
    font-size: 13px;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    border: 1px solid var(--border-subtle);
    transition: all 0.2s ease;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.12);

    &:hover {
      opacity: 0.92;
      transform: translateY(-1px);
      box-shadow: 0 5px 14px rgba(0, 0, 0, 0.18);
    }
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
</style>
