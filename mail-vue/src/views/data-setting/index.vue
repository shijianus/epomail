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
    <div class="container forwarding-container" id="forwarding" v-if="allowUserTg || allowUserEmailForward">
      <div class="title">{{ $t('forwardingAndPushTitle') || '邮件与消息转发' }}</div>
      <div class="section-intro">
        {{ $t('forwardingSectionDesc') || '配置个人 Telegram 消息推送通道与进站邮件的自动规则转发，实现跨终端即时触达。' }}
      </div>
      
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
          <el-tag :type="tgForm.enabled ? 'success' : 'info'" size="small" effect="plain" round class="status-tag">
            {{ tgForm.enabled ? ($t('enabled') || '已启用') : ($t('disabled') || '未启用') }}
          </el-tag>
          <el-button class="opt-button" size="small" type="primary" @click="openTgSettingDialog" :title="$t('settings') || '配置'">
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
              <div class="fw-title">{{ $t('forwardingEnable') || '启用自动邮件转发' }}</div>
              <div class="sub-hint">{{ $t('forwardingRulesDesc') || '规则转发只会转发设置邮箱所接收的邮件' }}</div>
            </div>
            <div class="toggle-action">
              <el-switch v-model="forwardForm.enabled" @change="saveForwardSettings(false)" />
            </div>
          </div>

          <div class="forwarding-fields" :class="{ 'fields-disabled': !forwardForm.enabled }">
            <!-- 目的地邮箱 -->
            <div class="item forward-field-item">
              <div class="field-label-col">
                <div class="fw-label">{{ $t('forwardingDestination') || '转发目的地邮箱' }}</div>
                <div class="sub-hint">{{ $t('forwardingDestinationDesc') || '接收转发邮件的目标地址' }}</div>
              </div>
              <div class="forward-input-wrap">
                <el-input 
                  v-model="forwardForm.targets" 
                  :placeholder="$t('forwardingDestinationPlaceholder') || '输入目标邮箱地址，多个邮箱用英文逗号分隔，如 yourname@gmail.com'" 
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
                <div class="fw-label">{{ $t('forwardingType') || '转发触发规则' }}</div>
                <div class="sub-hint">{{ $t('forwardingTypeSubhint') || '选择在何种条件下触发转发' }}</div>
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
                        <div class="r-title">{{ $t('forwardingTypeAll') || '全部邮件直接抄送转发' }}</div>
                        <div class="r-desc">{{ $t('forwardingTypeAllDesc') || '所有进入当前邮箱的邮件无条件抄送转发至目的地' }}</div>
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
                        <div class="r-title">{{ $t('forwardingTypeAlias') || '特定前缀/字母别名转发' }}</div>
                        <div class="r-desc">{{ $t('forwardingTypeAliasDesc') || '仅当收件邮箱匹配指定别名前缀时触发转发（如 billing、dev-*）' }}</div>
                      </div>
                    </div>

                    <!-- 别名前缀输入子区域 (内嵌在别名卡片内) -->
                    <div v-if="forwardForm.mode === 'alias'" class="alias-inline-subbox" @click.stop>
                      <div class="alias-sub-label">
                        <Icon icon="fluent:tag-multiple-16-regular" width="14" height="14" />
                        <span>{{ $t('forwardingAliasPrefix') || '匹配的前缀/别名' }}:</span>
                      </div>
                      <el-input 
                        v-model="forwardForm.aliasPrefixes" 
                        size="small" 
                        :placeholder="$t('forwardingAliasPrefixPlaceholder') || '多个前缀用逗号隔开，如 billing, dev, notice'" 
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
                        <div class="r-title">{{ $t('forwardingTypeRules') || '智能规则过滤转发' }}</div>
                        <div class="r-desc">{{ $t('forwardingTypeRulesDesc') || '仅当满足特定条件（如重要邮件或含特定关键词）时触发转发' }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 高级选项 -->
            <div class="item forward-options-item align-start no-border">
              <div class="field-label-col">
                <div class="fw-label">{{ $t('advancedOptions') || '高级选项' }}</div>
                <div class="sub-hint">{{ $t('advancedOptionsDesc') || '保留原件与转发主题标头' }}</div>
              </div>
              <div class="feature-checkboxes">
                <el-checkbox v-model="forwardForm.keepCopy">
                  <span class="chk-label">{{ $t('forwardingKeepCopy') || '在收件箱中保留邮件原件' }}</span>
                </el-checkbox>
                <el-checkbox v-model="forwardForm.addPrefix">
                  <span class="chk-label">{{ $t('forwardingSubjectPrefix') || '在转发邮件主题添加 [Fwd] 标头' }}</span>
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
                  {{ $t('save') || '保存转发规则' }}
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </template>
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
          <span class="d-label">{{ $t('tgTopicId') || 'Topic / Thread ID (可选)' }}</span>
          <el-input 
            v-model="tgForm.topicId" 
            placeholder="群组话题 ID，如不需要请留空" 
            clearable
          />
        </div>

        <div class="dialog-field">
          <span class="d-label">{{ $t('tgPushMode') || '推送类型偏好' }}</span>
          <el-radio-group v-model="tgForm.mode" style="margin-top: 4px;">
            <el-radio label="all">{{ $t('tgModeAll') || '所有进站邮件' }}</el-radio>
            <el-radio label="important">{{ $t('tgModeImportant') || '仅重要/验证码邮件' }}</el-radio>
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
            {{ $t('sendTestMsg') || '发送测试消息' }}
          </el-button>
          
          <div style="display: flex; gap: 10px;">
            <el-button @click="tgSettingDialogShow = false">{{ $t('cancel') || '取消' }}</el-button>
            <el-button 
              type="primary" 
              :loading="savingTg" 
              @click="saveTgSettingsFromModal"
              style="border-radius: 8px;"
            >
              {{ $t('save') || '保存配置' }}
            </el-button>
          </div>
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
  updateProfile
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
</style>
