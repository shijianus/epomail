<template>
  <div class="settings-container">
    <div class="loading" :class="firstLoading ? 'loading-show' : 'loading-hide'">
      <loading />
    </div>
    <el-scrollbar class="scroll" v-if="!firstLoading">
      <div class="scroll-body">
        <div class="card-grid">

          <!-- 邮件设置 Card (迁移自系统设置) -->
          <div class="settings-card">
            <div class="card-title">
              {{ $t('emailSetting') }}
              <el-tooltip :content="$t('emailSettingsTooltip')" placement="top">
                <Icon icon="lucide:help-circle" width="14" class="help-icon" />
              </el-tooltip>
            </div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('receiveEmail') }}</span></div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.receive"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('autoRefresh') }}</span>
                  <el-tooltip effect="dark" :content="$t('autoRefreshDesc')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div>
                  <el-select
                      @change="change"
                      style="min-width: 125px; width: auto;"
                      v-model="setting.autoRefresh"
                      placeholder="Select"
                  >
                    <el-option
                        v-for="item in authRefreshOptions"
                        :key="item.value"
                        :label="item.label"
                        :value="item.value"
                    />
                  </el-select>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('sendEmail') }}</span></div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.send"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('noRecipientTitle') }}</span>
                  <el-tooltip effect="dark" :content="$t('noRecipientDesc')">
                    <Icon class="warning" icon="fe:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.noRecipient"/>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ setting.hasCfEmail ? $t('cloudflareEmailSending') : $t('resendToken') }}</span></div>
                <div v-if="setting.hasCfEmail">
                  <span>{{ $t('enabled') }}</span>
                </div>
                <div v-else>
                  <el-button class="opt-button" style="margin-top: 0" @click="openResendList" size="small"
                             type="primary">
                    <Icon icon="ic:round-list" width="18" height="18"/>
                  </el-button>
                  <el-button class="opt-button" style="margin-top: 0" @click="openResendForm" size="small"
                             type="primary">
                    <Icon icon="material-symbols:add-rounded" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- Workers AI Card (迁移自系统设置) -->
          <div class="settings-card">
            <div class="card-title">
              {{ $t('aiConfigTitle') }}
              <el-tooltip :content="$t('aiConfigDesc')" placement="top">
                <Icon icon="lucide:help-circle" width="14" class="help-icon" />
              </el-tooltip>
            </div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('codeRecognition') }}</span></div>
                <div>
                  <el-switch @change="changeField('aiCode', $event)" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.aiCode"/>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('codeRecognitionRules') }}</span></div>
                <div class="forward">
                  <el-button class="opt-button" size="small" type="primary" @click="openAiCodeFilter">
                    <Icon icon="fluent:settings-48-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('aiApiKey') }} &amp; {{ $t('aiModel') }}</span></div>
                <div class="forward">
                  <el-button class="opt-button" size="small" type="primary" @click="openAiConfig">
                    <Icon icon="fluent:bot-sparkle-24-regular" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 基础名单 Card -->
          <div class="settings-card">
            <div class="card-title">
              {{ $t('basicListRules') }}
              <el-tooltip :content="$t('basicListRulesTooltip')" placement="top">
                <Icon icon="lucide:help-circle" width="14" class="help-icon" />
              </el-tooltip>
            </div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('listMode') }}</span></div>
                <div>
                  <el-radio-group v-model="listMode" @change="setMode" size="small">
                    <el-radio value="blacklist" size="small">{{ $t('blacklist') }}</el-radio>
                    <el-radio value="whitelist" size="small">{{ $t('whitelist') }}</el-radio>
                  </el-radio-group>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('ruleDetails') }}</span></div>
                <div>
                  <el-button class="opt-button" size="small" type="primary" @click="openDrawer('list')">
                    <Icon icon="lucide:settings-2" width="16" /> {{ $t('settings') }} ({{ (listMode === 'whitelist' ? whitelistEntries : blacklistEntries).length }})
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 硬拦截 Card -->
          <div class="settings-card">
            <div class="card-title">
              {{ $t('hardBlockRules') }}
              <el-tooltip :content="$t('hardBlockRulesTooltip')" placement="top">
                <Icon icon="lucide:help-circle" width="14" class="help-icon" />
              </el-tooltip>
            </div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('blockSender') }}</span></div>
                <div>
                  <el-button class="opt-button" size="small" type="primary" @click="openDrawer('block')">
                    <Icon icon="lucide:settings-2" width="16" /> {{ $t('settings') }} ({{ hardBlockEntries.length }})
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 内容过滤 Card -->
          <div class="settings-card">
            <div class="card-title">
              {{ $t('contentTitleFilter') }}
              <el-tooltip :content="$t('contentTitleFilterTooltip')" placement="top">
                <Icon icon="lucide:help-circle" width="14" class="help-icon" />
              </el-tooltip>
            </div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('blockInternalMailSubject') }}</span></div>
                <div>
                  <el-switch v-model="blockInternalSubject" @change="saveSubjectDirectly" size="small" />
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('filterSubject') }}</span></div>
                <div>
                  <el-button class="opt-button" size="small" type="primary" @click="openDrawer('subject')">
                    <Icon icon="lucide:settings-2" width="16" /> {{ $t('settings') }} ({{ blackSubject.length }})
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('blockInternalMailContent') }}</span></div>
                <div>
                  <el-switch v-model="blockInternalContent" @change="saveContentDirectly" size="small" />
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('filterContent') }}</span></div>
                <div>
                  <el-button class="opt-button" size="small" type="primary" @click="openDrawer('content')">
                    <Icon icon="lucide:settings-2" width="16" /> {{ $t('settings') }} ({{ blackContent.length }})
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- {{ $t('advancedFilterOptions') }} Card -->
          <div class="settings-card">
            <div class="card-title">
              {{ $t('advancedFilterOptions') }}
              <el-tooltip :content="$t('advancedFilterOptionsTooltip')" placement="top">
                <Icon icon="lucide:help-circle" width="14" class="help-icon" />
              </el-tooltip>
            </div>
            <div class="card-content">
              <div class="setting-item">
                <div>
                   <span>{{ $t('emptySenderIntercept') }}</span>
                   <el-tooltip :content="$t('emptySenderInterceptTooltip')" placement="top"><Icon icon="lucide:info" width="12" style="margin-left: 4px; color: var(--text-muted); cursor: help;"/></el-tooltip>
                </div>
                <div>
                  <el-switch v-model="blockEmptyName" @change="saveFlagsDirectly" size="small" />
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('strictRecipientMatching') }}</span>
                  <el-tooltip :content="$t('strictRecipientMatchingTooltip')" placement="top"><Icon icon="lucide:info" width="12" style="margin-left: 4px; color: var(--text-muted); cursor: help;"/></el-tooltip>
                </div>
                <div>
                  <el-switch v-model="blockNotToMe" @change="saveFlagsDirectly" size="small" />
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('executableAttachmentLimit') }}</span>
                  <el-tooltip :content="$t('executableAttachmentLimitTooltip')" placement="top"><Icon icon="lucide:info" width="12" style="margin-left: 4px; color: var(--text-muted); cursor: help;"/></el-tooltip>
                </div>
                <div>
                  <el-switch v-model="blockExecutable" @change="saveFlagsDirectly" size="small" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>

    <!-- Unified Drawer for Editing -->
    <el-drawer
        v-model="drawerVisible"
        :title="drawerTitle"
        direction="rtl"
        size="450px"
        :before-close="handleDrawerClose"
        class="unified-drawer"
    >
      <div class="drawer-content">
        <div class="drawer-desc" v-if="drawerTarget === 'list'">
          <div class="desc-title">{{ listMode === 'whitelist' ? $t('whitelist') : $t('blacklist') }}</div>
          <div class="desc-body">
             {{ listMode === 'whitelist' ? $t('whitelistDesc') : $t('blacklistDesc') }}
          </div>
          <div class="desc-rule">
            <strong>{{ $t('ruleBrief') }}：</strong>{{ $t('ruleBriefList') }}
          </div>
        </div>
        <div class="drawer-desc" v-else-if="drawerTarget === 'block'">
          <div class="desc-title">{{ $t('hardBlockRules') }}</div>
          <div class="desc-body">{{ $t('hardBlockDesc') }}</div>
          <div class="desc-rule">
            <strong>{{ $t('ruleBrief') }}：</strong>{{ $t('hardBlockRuleBrief') }}
          </div>
          <span class="warning-text"><Icon icon="lucide:alert-triangle" width="14"/> {{ $t('hardBlockWarning') }}</span>
        </div>
        <div class="drawer-desc" v-else-if="drawerTarget === 'subject'">
          <div class="desc-title">{{ $t('filterSubject') }}</div>
          <div class="desc-body">{{ $t('filterSubjectDesc') }}</div>
        </div>
        <div class="drawer-desc" v-else-if="drawerTarget === 'content'">
          <div class="desc-title">{{ $t('filterContent') }}</div>
          <div class="desc-body">{{ $t('filterContentDesc') }}</div>
        </div>

        <div class="drawer-actions">
          <el-button @click="clearCurrent" size="small">{{ $t('clear') }}</el-button>
          <el-button @click="restoreDefaultTemplates" size="small">{{ $t('restoreDefaultTemplates') }}</el-button>
          <el-button type="primary" @click="saveDrawer" size="small" :loading="drawerLoading">{{ $t('save') }}</el-button>
        </div>

        <el-input-tag
            v-model="currentDrawerArray"
            :placeholder="$t('inputRuleEnterPlaceholder')"
            class="drawer-tag-input"
        />
      </div>
    </el-drawer>

    <!-- Workers AI: aiCodeFilter Dialog -->
    <el-dialog v-model="aiCodeFilterShow" class="forward-dialog" @closed="resetAiCodeFilter">
      <template #header>
        <div class="forward-head">
          <span class="forward-set-title">{{ $t('codeRecognitionRules') }}</span>
          <el-tooltip effect="dark" :content="$t('codeRecognitionRulesDesc')">
            <Icon class="warning" icon="fe:warning" width="18" height="18"/>
          </el-tooltip>
        </div>
      </template>
      <el-form>
        <el-form-item :label="t('senderRules')" label-position="top">
          <el-input-tag v-model="aiCodeFilter" @add-tag="aiCodeFilterAddTag"/>
        </el-form-item>
      </el-form>
      <el-button type="primary" style="width: 100%;" :loading="settingLoading" @click="saveAiCodeFilter">{{ $t('save') }}</el-button>
    </el-dialog>

    <!-- Workers AI / AI Integration Dialog -->
    <el-dialog v-model="aiConfigShow" class="forward-dialog ai-config-dialog" @closed="resetAiConfig">
      <template #header>
        <div class="forward-head">
          <span class="forward-set-title">{{ $t('aiConfigTitle') }}</span>
          <el-tooltip effect="dark" :content="$t('aiConfigDesc')">
            <Icon class="warning" icon="fe:warning" width="18" height="18"/>
          </el-tooltip>
        </div>
      </template>
      <div class="ai-config-body">
        <div class="drawer-desc" style="margin-bottom: 14px;">
          <div class="desc-body">
            {{ $t('aiConfigDesc') }}
          </div>
          <div class="desc-rule">
            <strong>规则说明：</strong>留空时系统默认免密调用 Cloudflare Workers AI 或公共引擎；配置自定义 API Key 后将优先请求兼容 OpenAI 协议的接口进行邮件分析与全文翻译。
          </div>
        </div>
        <el-form label-position="top">
          <el-form-item :label="$t('aiApiKey')">
            <el-input
              v-model="aiForm.aiApiKey"
              type="password"
              show-password
              placeholder="sk-..."
              autocomplete="off"
            />
          </el-form-item>
          <el-form-item :label="$t('aiApiUrl')">
            <el-input
              v-model="aiForm.aiApiUrl"
              placeholder="https://api.openai.com/v1"
            />
          </el-form-item>
          <el-form-item :label="$t('aiModel')">
            <el-input
              v-model="aiForm.aiModel"
              placeholder="gpt-4o-mini"
            />
          </el-form-item>
        </el-form>
        <div style="display: flex; gap: 10px; margin-top: 15px;">
          <el-button style="flex: 1;" :loading="testingAi" @click="testAi">
            <Icon icon="fluent:plug-connected-20-regular" width="16" height="16" style="margin-right: 4px;" />
            {{ $t('aiTestBtn') }}
          </el-button>
          <el-button type="primary" style="flex: 1;" :loading="settingLoading" @click="saveAiConfig">
            {{ $t('aiSaveBtn') }}
          </el-button>
        </div>
      </div>
    </el-dialog>

    <!-- Email Settings: resend token form -->
    <el-dialog v-model="resendTokenFormShow" :title="$t('resendToken')" width="340" @closed="cleanResendTokenForm">
      <form>
        <el-select style="margin-bottom: 15px" v-model="resendTokenForm.domain" placeholder="Select">
          <el-option
              v-for="item in settingStore.domainList"
              :key="item"
              :label="item"
              :value="item"
          />
        </el-select>
        <el-input type="text" :placeholder="$t('addResendTokenDesc')" v-model="resendTokenForm.token"/>
        <el-button type="primary" :loading="settingLoading" @click="saveResendToken">{{ $t('save') }}</el-button>
      </form>
    </el-dialog>

    <!-- Email Settings: resend token list -->
    <el-dialog class="resend-table" v-model="showResendList" :title="$t('resendTokenList')">
      <el-table :data="resendList">
        <el-table-column :min-width="emailColumnWidth" property="key" :label="$t('domain')"
                         :show-overflow-tooltip="true"/>
        <el-table-column :width="tokenColumnWidth" property="value" label="Token" fixed="right"
                         :show-overflow-tooltip="true"/>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive, nextTick, watch } from 'vue'
import { settingQuery, setBlackList, settingSet, testAiSetting } from '@/request/setting.js'
import { useSettingStore } from '@/store/setting.js'
import { useUiStore } from '@/store/ui.js'
import Loading from '@/components/loading/index.vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { storeToRefs } from 'pinia'
import { isDomain, isEmail } from '@/utils/verify-utils.js'
import { getTextWidth } from '@/utils/text.js'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

const firstLoading = ref(true)
const settingLoading = ref(false)
const settingReady = ref(false)
let backup = '{}'

// ── Setting store (shared with sys-setting) ──────────────────────────
const settingStore = useSettingStore()
const uiStore = useUiStore()
const { settings: setting } = storeToRefs(settingStore)

// ── Email Setting refs ────────────────────────────────────────────────
const authRefreshOptions = computed(() => [
  { label: t('disable'), value: 0 },
  { label: '3s', value: 3 },
  { label: '5s', value: 5 },
  { label: '10s', value: 10 },
  { label: '15s', value: 15 },
  { label: '20s', value: 20 },
])

const resendTokenFormShow = ref(false)
const showResendList = ref(false)
const emailColumnWidth = ref(0)
const tokenColumnWidth = ref(0)
const resendTokenForm = reactive({ domain: '', token: '' })

const resendList = computed(() => {
  const list = Object.keys(setting.value.resendTokens || {}).map(key => ({ key, value: setting.value.resendTokens[key] }))
  if (list.length > 0) {
    const key = list.reduce((a, b) => compareByLengthAndUpperCase(a, b, 'key')).key
    emailColumnWidth.value = getTextWidth(key) + 30
    const value = list.reduce((a, b) => compareByLengthAndUpperCase(a, b, 'value')).value
    tokenColumnWidth.value = getTextWidth(value) + 30
  }
  return list
})

const compareByLengthAndUpperCase = (a, b, key) => {
  const getUpperCaseCount = (str) => (str.match(/[A-Z]/g) || []).length
  if (a[key].length === b[key].length) return getUpperCaseCount(a[key]) > getUpperCaseCount(b[key]) ? a : b
  return a[key].length > b[key].length ? a : b
}

// ── Workers AI refs ───────────────────────────────────────────────────
const aiCodeFilterShow = ref(false)
const aiCodeFilter = ref([])
const aiConfigShow = ref(false)
const testingAi = ref(false)
const aiForm = reactive({
  aiApiKey: '',
  aiApiUrl: '',
  aiModel: ''
})

// ── Category filter state ─────────────────────────────────────────────
const listMode = ref('blacklist')
const whitelistEntries = ref([])
const blacklistEntries = ref([])
const hardBlockEntries = ref([])
const blackSubject = ref([])
const blackContent = ref([])

// Advanced flags
const blockEmptyName = ref(false)
const blockNotToMe = ref(false)
const blockExecutable = ref(false)

const blockInternalList = ref(false)
const blockInternalBlock = ref(false)
const blockInternalSubject = ref(false)
const blockInternalContent = ref(false)

// Drawer State
const drawerVisible = ref(false)
const drawerTarget = ref('list')
const drawerLoading = ref(false)
const currentDrawerArray = ref([])

const blacklistTemplates = [
  'mailer-daemon.com',
  'newsletters.google.com',
  'facebookmail.com',
  'bounce.amazonses.com',
  'e.aliexpress.com',
  'mail.taobao.com',
  'jd.com',
  'pinduoduo.com',
  'no-reply.accounts.google.com',
  'donotreply.microsoft.com',
  'noreply@medium.com',
  '*@*.amazonaws.com'
]

const whitelistTemplates = [
  'github.com',
  'paypal.com',
  'google.com',
  'microsoft.com',
  'apple.com',
  'no-reply@*cloudflare.com'
]

const hardBlockTemplates = [
  '*@spam.com',
  '*@junk.net',
  '*@*.top',
  '*@*.xyz',
  '*@*.click',
  '*@*.link',
  '*@*.date',
  '*@*.review',
  '*@*.country',
  '*@*.kim',
  '*@*.science',
  '*@*.work',
  '*@rx-pharmacy.com',
  '*@viagra-deals.net'
]

function getSubjectTemplates(lang) {
  if (lang === 'zh-Hant') {
    return ['免費', '促銷', '中獎', '大獎', 'casino', 'viagra', 'lottery', 'winner', 'urgent']
  }
  if (lang === 'zh') {
    return ['免费', '促销', '中奖', '大奖', 'casino', 'viagra', 'lottery', 'winner', 'urgent']
  }
  return ['free', 'promo', 'promotion', 'winner', 'lottery', 'urgent', 'casino', 'viagra', 'claim', 'congratulations']
}

function getContentTemplates(lang) {
  if (lang === 'zh-Hant') {
    return ['發票', '中獎', '貸款', '賭場', '博彩', '免費領取', '代開', '退款通知', '急聘', 'pharmacy', 'crypto', 'bitcoin', 'giveaway', 'loan']
  }
  if (lang === 'zh') {
    return ['发票', '中奖', '贷款', '赌场', '博彩', '免费领取', '代开', '退款通知', '急聘', 'pharmacy', 'crypto', 'bitcoin', 'giveaway', 'loan']
  }
  return ['invoice', 'winner', 'loan', 'casino', 'gambling', 'free giveaway', 'refund notice', 'urgent hiring', 'pharmacy', 'crypto', 'bitcoin']
}

const drawerTitle = computed(() => {
  if (drawerTarget.value === 'list') return `${t('settings')} - ${t('basicListRules')}`
  if (drawerTarget.value === 'block') return `${t('settings')} - ${t('hardBlockRules')}`
  if (drawerTarget.value === 'subject') return `${t('settings')} - ${t('filterSubject')}`
  if (drawerTarget.value === 'content') return `${t('settings')} - ${t('filterContent')}`
  return t('settings')
})

// ── Lifecycle ───────────────────────────────────────────────────────
onMounted(async () => {
  await loadSettings()
})

// ── Setting helpers (mirrored from sys-setting, pure UI, same API) ──
function backupSetting() {
  const form = { ...setting.value }
  delete form.resendTokens
  delete form.siteKey
  delete form.secretKey
  backup = JSON.stringify(setting.value)
}

function beforeChange() {
  if (!settingReady.value || settingLoading.value) return false
  backupSetting()
  return true
}

function change() {
  if (!settingReady.value) return
  const settingForm = { ...setting.value }
  delete settingForm.siteKey
  delete settingForm.secretKey
  delete settingForm.s3AccessKey
  delete settingForm.s3SecretKey
  delete settingForm.tgBotToken
  delete settingForm.resendTokens
  editSetting(settingForm, false)
}

function changeField(key, value) {
  if (!settingReady.value) return
  setting.value[key] = value
  editSetting({ [key]: value }, false)
}

function editSetting(settingForm, refreshStatus = true) {
  if (settingLoading.value) return
  settingLoading.value = true

  settingSet(settingForm).then(() => {
    settingLoading.value = false
    ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
    if (refreshStatus) getSettings()
    resendTokenFormShow.value = false
    aiCodeFilterShow.value = false
    aiConfigShow.value = false
  }).catch(() => {
    setting.value = { ...setting.value, ...JSON.parse(backup) }
  }).finally(() => {
    settingLoading.value = false
  })
}

function getSettings() {
  settingReady.value = false
  settingQuery().then(settingData => {
    setting.value = settingData
    settingStore.domainList = settingData.domainList
    resendTokenForm.domain = setting.value.domainList?.[0] || ''
    resetAiCodeFilter()
    nextTick(() => { settingReady.value = true })
  })
}

// ── Workers AI functions ──────────────────────────────────────────────
function openAiCodeFilter() {
  aiCodeFilterShow.value = true
}

function resetAiCodeFilter() {
  aiCodeFilter.value = setting.value.aiCodeFilter ? setting.value.aiCodeFilter.split(',') : []
}

function aiCodeFilterAddTag(val) {
  const emails = Array.from(new Set(
    val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ))
  aiCodeFilter.value.splice(aiCodeFilter.value.length - 1, 1)
  emails.forEach(email => {
    if ((isEmail(email) || isDomain(email)) && !aiCodeFilter.value.includes(email)) {
      aiCodeFilter.value.push(email)
    }
  })
}

function saveAiCodeFilter() {
  editSetting({ aiCodeFilter: aiCodeFilter.value + '' })
}

function openAiConfig() {
  aiForm.aiApiKey = setting.value.aiApiKey || ''
  aiForm.aiApiUrl = setting.value.aiApiUrl || ''
  aiForm.aiModel = setting.value.aiModel || ''
  aiConfigShow.value = true
}

function resetAiConfig() {
  aiForm.aiApiKey = setting.value.aiApiKey || ''
  aiForm.aiApiUrl = setting.value.aiApiUrl || ''
  aiForm.aiModel = setting.value.aiModel || ''
}

async function testAi() {
  testingAi.value = true
  try {
    const res = await testAiSetting({
      aiApiKey: aiForm.aiApiKey,
      aiApiUrl: aiForm.aiApiUrl,
      aiModel: aiForm.aiModel
    })
    ElMessage({
      message: res.message || t('aiConnectionSuccess'),
      type: 'success',
      plain: true
    })
  } catch (err) {
    ElMessage({
      message: (err && err.message) || t('aiConnectionFailed'),
      type: 'error',
      plain: true
    })
  } finally {
    testingAi.value = false
  }
}

function saveAiConfig() {
  editSetting({
    aiApiKey: aiForm.aiApiKey,
    aiApiUrl: aiForm.aiApiUrl,
    aiModel: aiForm.aiModel
  })
  aiConfigShow.value = false
}

// ── Email Setting functions ───────────────────────────────────────────
function openResendList() {
  showResendList.value = true
}

function openResendForm() {
  resendTokenFormShow.value = true
}

function cleanResendTokenForm() {
  resendTokenForm.token = ''
}

function saveResendToken() {
  const settingForm = { resendTokens: {} }
  const domain = resendTokenForm.domain.slice(1)
  settingForm.resendTokens[domain] = resendTokenForm.token
  editSetting(settingForm)
}

// ── Deduplication Logic ─────────────────────────────────────────────
function deduplicateRules(rules) {
  let unique = Array.from(new Set(rules)).filter(Boolean).map(r => r.trim())
  let domains = unique.filter(r => !r.includes('@') || r.startsWith('@')).map(d => d.replace(/^@/, ''))
  let finalRules = []
  for (let rule of unique) {
    if (rule.includes('@') && !rule.startsWith('@')) {
       let domainPart = rule.split('@')[1]
       if (domains.includes(domainPart)) continue
    }
    finalRules.push(rule)
  }
  return finalRules
}



async function loadSettings() {
  firstLoading.value = true
  try {
    const data = await settingQuery()
    setting.value = data
    settingStore.domainList = data.domainList
    resendTokenForm.domain = data.domainList?.[0] || ''
    resetAiCodeFilter()

    let rawList = data.blackFrom || ''
    if (rawList.includes('__blockInternal,')) {
      blockInternalList.value = true
      rawList = rawList.replace('__blockInternal,', '')
    }

    let isInitList = false
    if (!rawList) {
      listMode.value = 'blacklist'
      whitelistEntries.value = [...whitelistTemplates]
      blacklistEntries.value = [...blacklistTemplates]
      isInitList = true
    } else if (rawList.startsWith('{')) {
      try {
        const obj = JSON.parse(rawList)
        listMode.value = obj.mode || 'blacklist'
        whitelistEntries.value = obj.whitelist || []
        blacklistEntries.value = obj.blacklist || []
        if (obj.flags) {
          blockEmptyName.value = !!obj.flags.blockEmptyName
          blockNotToMe.value = !!obj.flags.blockNotToMe
          blockExecutable.value = !!obj.flags.blockExecutable
        }
      } catch (e) {}
    } else {
      if (rawList.startsWith('__mode:whitelist,')) {
        listMode.value = 'whitelist'
        const rest = rawList.slice('__mode:whitelist,'.length)
        whitelistEntries.value = rest ? rest.split(',').filter(Boolean) : []
        blacklistEntries.value = [...blacklistTemplates]
      } else if (rawList.startsWith('__mode:blacklist,')) {
        listMode.value = 'blacklist'
        const rest = rawList.slice('__mode:blacklist,'.length)
        blacklistEntries.value = rest ? rest.split(',').filter(Boolean) : []
        whitelistEntries.value = [...whitelistTemplates]
      } else {
        listMode.value = 'blacklist'
        blacklistEntries.value = rawList ? rawList.split(',').filter(Boolean) : []
        whitelistEntries.value = [...whitelistTemplates]
      }
    }

    let rawContent = data.blackContent || ''
    if (rawContent.includes('__blockInternal,')) {
      blockInternalBlock.value = true
      blockInternalContent.value = true
      rawContent = rawContent.replace('__blockInternal,', '')
    }

    let isInitBlock = false
    let isInitContent = false

    if (!rawContent) {
      hardBlockEntries.value = [...hardBlockTemplates]
      blackContent.value = [...contentTemplates]
      isInitBlock = true
      isInitContent = true
    } else if (rawContent.startsWith('__hardblock,')) {
      const rest = rawContent.slice('__hardblock,'.length)
      hardBlockEntries.value = rest ? rest.split(',').filter(Boolean) : []
      blackContent.value = []
    } else {
      hardBlockEntries.value = []
      blackContent.value = rawContent ? rawContent.split(',').filter(Boolean) : []
    }

    let rawSubject = data.blackSubject || ''
    if (rawSubject.includes('__blockInternal,')) {
      blockInternalSubject.value = true
      rawSubject = rawSubject.replace('__blockInternal,', '')
    }
    let isInitSubject = false
    if (!rawSubject) {
      blackSubject.value = [...subjectTemplates]
      isInitSubject = true
    } else {
      blackSubject.value = rawSubject ? rawSubject.split(',').filter(Boolean) : []
    }

    if (isInitList) {
      blacklistEntries.value = deduplicateRules(blacklistEntries.value)
      await setBlackList({ blackFrom: getListSaveString() })
    }
    if (isInitBlock || isInitContent) {
      await setBlackList({ blackContent: (isInitBlock && !isInitContent) ? getBlockSaveString() : getContentSaveString() })
    }

    nextTick(() => { settingReady.value = true })
  } catch (e) {
    console.error('Settings load failed:', e)
  } finally {
    firstLoading.value = false
  }
}

function getListSaveString() {
  const internalPrefix = blockInternalList.value ? '__blockInternal,' : ''
  const payload = {
    mode: listMode.value,
    whitelist: whitelistEntries.value,
    blacklist: blacklistEntries.value,
    flags: { blockEmptyName: blockEmptyName.value, blockNotToMe: blockNotToMe.value, blockExecutable: blockExecutable.value }
  }
  return internalPrefix + JSON.stringify(payload)
}

function getBlockSaveString() {
  const internalPrefix = blockInternalBlock.value ? '__blockInternal,' : ''
  return `__hardblock,${internalPrefix}` + hardBlockEntries.value.join(',')
}

function getSubjectSaveString() {
  const internalPrefix = blockInternalSubject.value ? '__blockInternal,' : ''
  return `${internalPrefix}` + blackSubject.value.join(',')
}

function getContentSaveString() {
  const internalPrefix = blockInternalContent.value ? '__blockInternal,' : ''
  return `${internalPrefix}` + blackContent.value.join(',')
}

function setMode(mode) {
  listMode.value = mode
  saveListDirectly()
}

async function saveListDirectly() {
  try {
    await setBlackList({ blackFrom: getListSaveString() })
    ElMessage.success(t('basicListSaved'))
  } catch (e) {}
}

async function saveFlagsDirectly() {
  try {
    await setBlackList({ blackFrom: getListSaveString() })
    ElMessage.success(t('advancedFilterSaved'))
  } catch (e) {}
}

async function saveSubjectDirectly() {
  try {
    await setBlackList({ blackSubject: getSubjectSaveString() })
    ElMessage.success(t('subjectFilterSaved'))
  } catch (e) {}
}
async function saveContentDirectly() {
  try {
    await setBlackList({ blackContent: getContentSaveString() })
    ElMessage.success(t('contentFilterSaved'))
  } catch (e) {}
}

// ── Drawer Operations ───────────────────────────────────────────────
function openDrawer(target) {
  drawerTarget.value = target
  let sourceArray = []
  if (target === 'list') sourceArray = listMode.value === 'whitelist' ? whitelistEntries.value : blacklistEntries.value
  else if (target === 'block') sourceArray = hardBlockEntries.value
  else if (target === 'subject') sourceArray = blackSubject.value
  else if (target === 'content') sourceArray = blackContent.value
  currentDrawerArray.value = [...sourceArray]
  drawerVisible.value = true
}

function handleDrawerClose() {
  drawerVisible.value = false
}

function clearCurrent() {
  currentDrawerArray.value = []
}

function restoreDefaultTemplates() {
  if (drawerTarget.value === 'list') {
     currentDrawerArray.value = listMode.value === 'whitelist' ? [...whitelistTemplates] : [...blacklistTemplates]
  } else if (drawerTarget.value === 'block') {
     currentDrawerArray.value = [...hardBlockTemplates]
  } else if (drawerTarget.value === 'subject') {
     currentDrawerArray.value = [...getSubjectTemplates(locale.value)]
  } else if (drawerTarget.value === 'content') {
     currentDrawerArray.value = [...getContentTemplates(locale.value)]
  }
}

async function saveDrawer() {
  drawerLoading.value = true
  const finalArray = deduplicateRules(currentDrawerArray.value)
  let payload = {}

  if (drawerTarget.value === 'list') {
    if (listMode.value === 'whitelist') whitelistEntries.value = finalArray
    else blacklistEntries.value = finalArray
    payload.blackFrom = getListSaveString()
  } else if (drawerTarget.value === 'block') {
    hardBlockEntries.value = finalArray
    payload.blackContent = getBlockSaveString()
  } else if (drawerTarget.value === 'subject') {
    blackSubject.value = finalArray
    payload.blackSubject = getSubjectSaveString()
  } else if (drawerTarget.value === 'content') {
    blackContent.value = finalArray
    payload.blackContent = getContentSaveString()
  }

  try {
    await setBlackList(payload)
    ElMessage.success(t('rulesSavedSuccess'))
    drawerVisible.value = false
  } catch (e) {
    ElMessage.error(t('saveFailed'))
  } finally {
    drawerLoading.value = false
  }
}
</script>

<style scoped lang="scss">
.settings-container {
  height: 100%;
  overflow: hidden;
  background: var(--extra-light-fill) !important;
  position: relative;

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    z-index: 2;
    width: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }

  .loading-show {
    transition: all 200ms ease 200ms;
    opacity: 1;
  }

  .loading-hide {
    transition: var(--loading-hide-transition);
    pointer-events: none;
    opacity: 0;
  }
}

.scroll {
  width: 100%;
  min-height: 100%;

  :deep(.el-scrollbar__view) {
    height: 100%;
  }

  .scroll-body {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(440px, 1fr));
  padding: 20px;
  gap: 20px;
  @media (max-width: 500px) {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
  @media (max-width: 1023px) {
    gap: 15px;
    padding: 15px;
  }
}

.settings-card {
  background-color: var(--bg-surface);
  border-radius: 14px;
  border: 1px solid var(--border-subtle);
  transition: all 300ms;
  overflow: hidden;
}

.card-title {
  font-size: 15px;
  font-weight: bold;
  padding: 10px 20px;
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  align-items: center;
  gap: 8px;
}

.help-icon {
  color: var(--text-muted);
  cursor: help;
}

.card-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  & > * {
    border-bottom: none !important;
  }
}

.setting-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  font-weight: normal;

  > div:first-child {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  > div:last-child {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    font-weight: normal;
    gap: 8px;
  }
}

.opt-button {
  width: fit-content !important;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.forward {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.warning {
  margin-left: 2px;
  color: grey;
  cursor: pointer;
}

:deep(.forward-dialog.el-dialog) {
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.forward-dialog {
  .forward-head {
    display: flex;
    align-items: center;

    .forward-set-title {
      top: 1px;
      padding-right: 5px;
      position: relative;
      font-size: 16px;
      font-weight: bold;
    }
  }

  .ai-config-body {
    .el-form-item {
      margin-bottom: 14px;
      :deep(.el-form-item__label) {
        font-weight: 500;
        color: var(--text-primary);
        margin-bottom: 4px;
      }
    }
  }
}

:deep(.resend-table.el-dialog) {
  min-height: 300px;
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.el-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.el-table__inner-wrapper:before) {
  background: var(--el-bg-color);
}

form .el-button {
  margin-top: 10px;
  width: 100%;
}

/* Drawer styles */
.drawer-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0 20px 20px;
}

.drawer-desc {
  margin-bottom: 16px;
  background: var(--bg-surface);
  padding: 14px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);

  .desc-title {
    font-weight: bold;
    color: var(--text-primary);
    margin-bottom: 6px;
    font-size: 14px;
  }
  .desc-body {
    color: var(--text-regular);
    font-size: 13px;
    line-height: 1.5;
    margin-bottom: 8px;
  }
  .desc-rule {
    color: var(--text-muted);
    font-size: 12px;
    padding-top: 8px;
    border-top: 1px dashed var(--border-subtle);
    code {
      background: var(--bg-elevated);
      padding: 2px 4px;
      border-radius: 4px;
      font-family: monospace;
    }
  }

  .warning-text {
    color: var(--el-color-danger);
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    font-size: 13px;
    font-weight: bold;
  }
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 12px;
}

.drawer-tag-input {
  flex: 1;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 8px;
  align-items: flex-start;
  :deep(.el-input-tag__inner) {
    min-height: 200px;
    align-items: flex-start;
    align-content: flex-start;
  }
}

:deep(.el-switch) {
  height: 28px;
}

:deep(.el-button--small) {
  margin-top: 2px !important;
  margin-bottom: 2px !important;
  height: 24px;
}

:deep(.el-select__wrapper) {
  min-height: 28px;
}


</style>

