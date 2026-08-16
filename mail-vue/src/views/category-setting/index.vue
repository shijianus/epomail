<template>
  <div class="settings-container">
    <div class="loading" :class="firstLoading ? 'loading-show' : 'loading-hide'">
      <loading />
    </div>
    <div class="tabs-wrapper" v-if="!firstLoading">
      <el-tabs v-model="activeTab" class="custom-tabs">
        <el-tab-pane label="基本设置" name="basic">
          <el-scrollbar class="scroll">
            <div class="scroll-body">
              <div class="card-grid">

          <!-- 邮件设置 Card (迁移自系统设置) -->
          <div class="settings-card">
            <div class="card-title">
              {{ $t('emailSetting') }}
              <el-tooltip content="邮件收发及转发相关的基础设置" placement="top">
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
                      :style="`width: ${ locale === 'en' ? 100 : 80 }px;`"
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
              Workers AI
              <el-tooltip content="使用 Cloudflare Workers AI 对邮件进行智能识别与过滤" placement="top">
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
            </div>
          </div>

          <!-- 基础名单 Card -->
          <div class="settings-card">
            <div class="card-title">
              基础名单规则
              <el-tooltip content="当工作在黑名单模式时，名单内的地址或后缀将被拦截入垃圾桶。在白名单模式时，只有名单内的地址会被放行，其余都会进入垃圾桶。" placement="top">
                <Icon icon="lucide:help-circle" width="14" class="help-icon" />
              </el-tooltip>
            </div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>名单模式</span></div>
                <div>
                  <el-radio-group v-model="listMode" @change="setMode" size="small">
                    <el-radio value="blacklist" size="small">黑名单</el-radio>
                    <el-radio value="whitelist" size="small">白名单</el-radio>
                  </el-radio-group>
                </div>
              </div>
              <div class="setting-item">
                <div><span>规则明细</span></div>
                <div>
                  <el-button class="opt-button" size="small" type="primary" @click="openDrawer('list')">
                    <Icon icon="lucide:settings-2" width="16" /> 设置 ({{ (listMode === 'whitelist' ? whitelistEntries : blacklistEntries).length }})
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 硬拦截 Card -->
          <div class="settings-card">
            <div class="card-title">
              硬拦截规则 (丢弃)
              <el-tooltip content="硬拦截规则会直接在服务器底层丢弃邮件，完全不进入垃圾桶。请谨慎配置。" placement="top">
                <Icon icon="lucide:help-circle" width="14" class="help-icon" />
              </el-tooltip>
            </div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>拦截发件人</span></div>
                <div>
                  <el-button class="opt-button" size="small" type="primary" @click="openDrawer('block')">
                    <Icon icon="lucide:settings-2" width="16" /> 设置 ({{ hardBlockEntries.length }})
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 内容过滤 Card -->
          <div class="settings-card">
            <div class="card-title">
              内容及标题过滤
              <el-tooltip content="如果标题或正文包含了这些关键词，邮件会自动归类到垃圾桶。" placement="top">
                <Icon icon="lucide:help-circle" width="14" class="help-icon" />
              </el-tooltip>
            </div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>阻挡站内邮件 (标题)</span></div>
                <div>
                  <el-switch v-model="blockInternalSubject" @change="saveSubjectDirectly" size="small" />
                </div>
              </div>
              <div class="setting-item">
                <div><span>过滤标题</span></div>
                <div>
                  <el-button class="opt-button" size="small" type="primary" @click="openDrawer('subject')">
                    <Icon icon="lucide:settings-2" width="16" /> 设置 ({{ blackSubject.length }})
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>阻挡站内邮件 (内容)</span></div>
                <div>
                  <el-switch v-model="blockInternalContent" @change="saveContentDirectly" size="small" />
                </div>
              </div>
              <div class="setting-item">
                <div><span>过滤内容</span></div>
                <div>
                  <el-button class="opt-button" size="small" type="primary" @click="openDrawer('content')">
                    <Icon icon="lucide:settings-2" width="16" /> 设置 ({{ blackContent.length }})
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 高级过滤选项 Card -->
          <div class="settings-card">
            <div class="card-title">
              高级过滤选项
              <el-tooltip content="开启以下严格选项以拦截结构异常或可疑的邮件 (拦截入垃圾桶)。" placement="top">
                <Icon icon="lucide:help-circle" width="14" class="help-icon" />
              </el-tooltip>
            </div>
            <div class="card-content">
              <div class="setting-item">
                <div>
                   <span>空发件人拦截</span>
                   <el-tooltip content="拦截没有发件人姓名 (Sender Name) 仅有地址的异常邮件。" placement="top"><Icon icon="lucide:info" width="12" style="margin-left: 4px; color: var(--text-muted); cursor: help;"/></el-tooltip>
                </div>
                <div>
                  <el-switch v-model="blockEmptyName" @change="saveFlagsDirectly" size="small" />
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>严格收件人匹配</span>
                  <el-tooltip content="拦截收件人(To/Cc)中不包含您当前邮箱地址的邮件 (防止密送群发)。" placement="top"><Icon icon="lucide:info" width="12" style="margin-left: 4px; color: var(--text-muted); cursor: help;"/></el-tooltip>
                </div>
                <div>
                  <el-switch v-model="blockNotToMe" @change="saveFlagsDirectly" size="small" />
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>可执行附件限制</span>
                  <el-tooltip content="拦截包含可执行文件 (.exe, .bat, .cmd, .scr, .vbs, .js) 附件的邮件。" placement="top"><Icon icon="lucide:info" width="12" style="margin-left: 4px; color: var(--text-muted); cursor: help;"/></el-tooltip>
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
        </el-tab-pane>

        <!-- 分析面板 Tab -->
        <el-tab-pane label="分析面板" name="analytics">
          <el-scrollbar class="scroll">
            <div class="scroll-body analytics-body">
              <!-- 顶部操作栏 -->
              <div class="analytics-header">
                <span class="analytics-title">邮件处理态势感知</span>
                <el-button size="small" :loading="analyticsLoading" @click="fetchAnalytics" plain>
                  <Icon icon="mdi:refresh" width="14" style="margin-right:4px;" />刷新数据
                </el-button>
              </div>

              <div class="analytics-card-grid">
                
                <!-- 概览卡片 -->
                <div class="analytics-card stats-overview">
                  <div class="stat-item">
                    <div class="stat-icon"><Icon icon="mdi:email-outline" width="24" /></div>
                    <div class="stat-value">{{ analyticsData.totalProcessed }}</div>
                    <div class="stat-label">累计处理邮件</div>
                  </div>
                  <div class="stat-item stat-item--warn">
                    <div class="stat-icon"><Icon icon="mdi:shield-alert-outline" width="24" /></div>
                    <div class="stat-value">{{ analyticsData.totalIntercepted }}</div>
                    <div class="stat-label">推销/垃圾拦截量</div>
                  </div>
                  <div class="stat-item stat-item--danger">
                    <div class="stat-icon"><Icon icon="mdi:percent-outline" width="24" /></div>
                    <div class="stat-value">{{ analyticsData.interceptRate }}</div>
                    <div class="stat-label">系统拦截率</div>
                  </div>
                </div>

                <!-- 7天趋势柱状图 -->
                <div class="analytics-card chart-card">
                  <div class="chart-card-title">
                    <Icon icon="mdi:chart-bar" width="16" />
                    <span>最近 7 天拦截趋势</span>
                  </div>
                  <div class="css-chart-wrapper">
                    <div class="css-chart-container">
                      <template v-if="analyticsData.trend.length">
                        <div class="css-bar" v-for="item in analyticsData.trend" :key="item.date">
                          <div class="bar-tooltip">{{ item.count }} 封</div>
                          <div class="bar-fill" :style="{ height: (item.count === 0 ? 0 : Math.max(4, item.percent)) + '%' }"></div>
                          <div class="bar-label">{{ item.label }}</div>
                        </div>
                      </template>
                      <div class="chart-empty" v-else>
                        <Icon icon="mdi:chart-bar-stacked" width="32" />
                        <span>暂无拦截数据</span>
                      </div>
                    </div>
                    <div class="chart-x-axis"></div>
                  </div>
                </div>

                <!-- 规则活跃度排行 -->
                <div class="analytics-card rules-card">
                  <div class="chart-card-title">
                    <Icon icon="mdi:trophy-outline" width="16" />
                    <span>规则拦截活跃度排行</span>
                  </div>
                  <div class="rule-ranking-list" v-if="analyticsData.topRules.length">
                    <div class="rule-rank-item" v-for="(rule, index) in analyticsData.topRules" :key="rule.name">
                      <div class="rank-index" :class="'top-' + (index + 1)">{{ index + 1 }}</div>
                      <div class="rank-name">{{ rule.name }}</div>
                      <div class="rank-bar-bg">
                        <div class="rank-bar-fill" :style="{ width: rule.percent + '%' }"></div>
                      </div>
                      <div class="rank-count">{{ rule.count }} 次</div>
                    </div>
                  </div>
                  <div class="chart-empty" v-else>
                    <Icon icon="mdi:trophy-broken" width="32" />
                    <span>暂无规则命中记录</span>
                  </div>
                </div>

              </div>
            </div>
          </el-scrollbar>
        </el-tab-pane>
      </el-tabs>
    </div>

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
          <div class="desc-title">{{ listMode === 'whitelist' ? '放行名单 (Whitelist)' : '拦截名单 (Blacklist)' }}</div>
          <div class="desc-body">
             {{ listMode === 'whitelist' ? '仅允许以下地址发送的邮件，未在名单内的邮件将被归类至垃圾桶。' : '当发件人匹配以下地址时，邮件将被归类至垃圾桶。' }}
          </div>
          <div class="desc-rule">
            <strong>规则简述：</strong>支持精确邮箱 (例 <code>spam@a.com</code>)、域名后缀 (例 <code>a.com</code>) 以及通配符模式 (例 <code>*@*.a.com</code>)。
          </div>
        </div>
        <div class="drawer-desc" v-else-if="drawerTarget === 'block'">
          <div class="desc-title">彻底丢弃规则</div>
          <div class="desc-body">当发件人匹配以下地址时，邮件将在到达时被直接销毁。</div>
          <div class="desc-rule">
            <strong>规则简述：</strong>支持精确邮箱、域名及通配符模式 (如 <code>*@spam.com</code>)。
          </div>
          <span class="warning-text"><Icon icon="lucide:alert-triangle" width="14"/> 警告：匹配的邮件将完全消失，不进垃圾桶。</span>
        </div>
        <div class="drawer-desc" v-else-if="drawerTarget === 'subject'">
          <div class="desc-title">标题关键词过滤</div>
          <div class="desc-body">如果邮件的标题中包含以下任一关键词，该邮件将被自动归类至垃圾桶。</div>
        </div>
        <div class="drawer-desc" v-else-if="drawerTarget === 'content'">
          <div class="desc-title">正文关键词过滤</div>
          <div class="desc-body">如果邮件的正文或HTML内容中包含以下任一关键词，该邮件将被自动归类至垃圾桶。</div>
        </div>

        <div class="drawer-actions">
          <el-button @click="clearCurrent" size="small">清空</el-button>
          <el-button @click="restoreDefaultTemplates" size="small">恢复默认模板</el-button>
          <el-button type="primary" @click="saveDrawer" size="small" :loading="drawerLoading">保存</el-button>
        </div>

        <el-input-tag
            v-model="currentDrawerArray"
            placeholder="输入规则后按回车添加..."
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
import { ref, computed, onMounted, reactive, nextTick } from 'vue'
import { settingQuery, setBlackList, settingSet } from '@/request/setting.js'
import { emailAnalytics } from '@/request/email.js'
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
const activeTab = ref('basic')

const analyticsData = reactive({
  totalProcessed: 0,
  totalIntercepted: 0,
  interceptRate: '0%',
  trend: [],
  topRules: []
})
const analyticsLoading = ref(false)
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

const subjectTemplates = [
  '免费', '促销', 'casino', 'viagra', 'lottery', 'winner', 'urgent'
]

const contentTemplates = [
  '发票', '中奖', '贷款', '赌场', '博彩', '免费领取', '代开',
  '退款通知', '急聘', 'pharmacy', 'crypto', 'bitcoin', 'giveaway', 'loan'
]

const drawerTitle = computed(() => {
  if (drawerTarget.value === 'list') return '设置基础名单规则'
  if (drawerTarget.value === 'block') return '设置硬拦截规则'
  if (drawerTarget.value === 'subject') return '设置标题过滤关键词'
  if (drawerTarget.value === 'content') return '设置内容过滤关键词'
  return '设置'
})

// ── Lifecycle ───────────────────────────────────────────────────────
onMounted(async () => {
  await loadSettings()
  await fetchAnalytics()
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

async function fetchAnalytics() {
  if (analyticsLoading.value) return
  analyticsLoading.value = true
  try {
    const res = await emailAnalytics()
    // Bug Fix #1: Object.assign cannot trigger reactivity for nested arrays on a reactive() object.
    // Must assign fields individually so Vue 3 proxy intercepts each write.
    if (res && typeof res === 'object') {
      analyticsData.totalProcessed = res.totalProcessed ?? 0
      analyticsData.totalIntercepted = res.totalIntercepted ?? 0
      analyticsData.interceptRate = res.interceptRate ?? '0%'
      // Splice-replace arrays to maintain reactive proxy reference
      analyticsData.trend.splice(0, analyticsData.trend.length, ...(res.trend ?? []))
      analyticsData.topRules.splice(0, analyticsData.topRules.length, ...(res.topRules ?? []))
    }
  } catch (e) {
    console.error('Fetch analytics failed:', e)
  } finally {
    analyticsLoading.value = false
  }
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
    ElMessage.success('已保存基础名单模式')
  } catch (e) {}
}

async function saveFlagsDirectly() {
  try {
    await setBlackList({ blackFrom: getListSaveString() })
    ElMessage.success('已保存高级过滤选项')
  } catch (e) {}
}

async function saveSubjectDirectly() {
  try {
    await setBlackList({ blackSubject: getSubjectSaveString() })
    ElMessage.success('已保存标题过滤设置')
  } catch (e) {}
}
async function saveContentDirectly() {
  try {
    await setBlackList({ blackContent: getContentSaveString() })
    ElMessage.success('已保存内容过滤设置')
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
     currentDrawerArray.value = [...subjectTemplates]
  } else if (drawerTarget.value === 'content') {
     currentDrawerArray.value = [...contentTemplates]
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
    ElMessage.success('已保存过滤规则')
    drawerVisible.value = false
  } catch (e) {
    ElMessage.error('保存失败')
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
  background-color: var(--el-bg-color);
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
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

/* Analytics Dashboard CSS */
.analytics-body {
  padding: 16px 0 24px;
}

.analytics-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.analytics-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.analytics-card-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.analytics-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 18px 20px;
}

/* Stats overview grid */
.stats-overview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  padding: 4px 0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border-right: 1px solid var(--border-subtle);
  text-align: center;

  &:last-child {
    border-right: none;
  }
}

.stat-icon {
  color: var(--el-color-primary);
  opacity: 0.7;
  line-height: 1;
}

.stat-item--warn .stat-icon,
.stat-item--warn .stat-value {
  color: var(--el-color-warning);
}

.stat-item--danger .stat-icon,
.stat-item--danger .stat-value {
  color: var(--el-color-danger);
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.3;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--el-color-primary);
  line-height: 1;
}

/* Chart card */
.chart-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.css-chart-wrapper {
  position: relative;
  padding-bottom: 28px;
}

.css-chart-container {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 160px;
  padding-top: 36px; /* space for tooltip */
  position: relative;
}

.chart-x-axis {
  position: absolute;
  bottom: 28px;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border-subtle);
}

.css-bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  height: 100%;
  position: relative;
  cursor: default;

  &:hover .bar-tooltip {
    opacity: 1;
    transform: translateY(-4px);
  }
}

.bar-fill {
  width: 60%;
  max-width: 32px;
  min-width: 8px;
  background: var(--el-color-primary);
  border-radius: 4px 4px 0 0;
  transition: height 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.bar-label {
  position: absolute;
  bottom: -22px;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.bar-tooltip {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%) translateY(0);
  background: var(--el-text-color-primary);
  color: var(--el-bg-color);
  padding: 3px 7px;
  border-radius: 4px;
  font-size: 11px;
  opacity: 0;
  transition: opacity 0.2s, transform 0.2s;
  pointer-events: none;
  white-space: nowrap;
  z-index: 1;
}

.chart-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 13px;
  height: 100%;
  opacity: 0.6;
}

/* Rule ranking */
.rule-ranking-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
}

.rule-rank-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rank-index {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 700;
}

.rank-index.top-1 { background: #ff4d4f; color: white; }
.rank-index.top-2 { background: #faad14; color: white; }
.rank-index.top-3 { background: #52c41a; color: white; }

.rank-name {
  width: 90px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rank-bar-bg {
  flex: 1;
  height: 7px;
  background: var(--bg-elevated);
  border-radius: 4px;
  overflow: hidden;
}

.rank-bar-fill {
  height: 100%;
  background: var(--el-color-primary);
  border-radius: 4px;
  transition: width 0.6s ease;
  min-width: 2px;
}

.rank-count {
  flex-shrink: 0;
  width: 46px;
  text-align: right;
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

</style>
