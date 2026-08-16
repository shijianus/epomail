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
                <div class="analytics-header-left">
                  <div class="analytics-icon-badge">
                    <Icon icon="mdi:shield-check-outline" width="18" />
                  </div>
                  <div>
                    <div class="analytics-title">邮件防护态势</div>
                    <div class="analytics-subtitle">实时聚合 · 规则引擎分析报告</div>
                  </div>
                </div>
                <el-button size="small" :loading="analyticsLoading" @click="fetchAnalytics" plain class="refresh-btn">
                  <Icon icon="mdi:refresh" width="14" style="margin-right:4px;" />刷新数据
                </el-button>
              </div>

              <!-- 加载状态骨架屏 -->
              <div class="analytics-skeleton" v-if="analyticsLoading && !analyticsData.totalProcessed">
                <div class="skeleton-row">
                  <div class="skeleton-card sk-stat" v-for="n in 3" :key="n">
                    <div class="sk-icon"></div>
                    <div class="sk-val"></div>
                    <div class="sk-label"></div>
                  </div>
                </div>
                <div class="skeleton-card sk-chart"></div>
                <div class="skeleton-card sk-rules"></div>
              </div>

              <div class="analytics-content" v-else>

                <!-- 统计卡片行 -->
                <div class="stat-cards-row">
                  <!-- 总处理量 -->
                  <div class="stat-card stat-card--blue">
                    <div class="stat-card-bg-icon">
                      <Icon icon="mdi:email-multiple-outline" width="52" />
                    </div>
                    <div class="stat-card-body">
                      <div class="stat-card-icon blue-icon">
                        <Icon icon="mdi:email-outline" width="20" />
                      </div>
                      <div class="stat-card-value">{{ analyticsData.totalProcessed.toLocaleString() }}</div>
                      <div class="stat-card-label">累计处理邮件</div>
                    </div>
                  </div>

                  <!-- 拦截量 -->
                  <div class="stat-card stat-card--amber">
                    <div class="stat-card-bg-icon">
                      <Icon icon="mdi:shield-alert-outline" width="52" />
                    </div>
                    <div class="stat-card-body">
                      <div class="stat-card-icon amber-icon">
                        <Icon icon="mdi:shield-alert-outline" width="20" />
                      </div>
                      <div class="stat-card-value amber-val">{{ analyticsData.totalIntercepted.toLocaleString() }}</div>
                      <div class="stat-card-label">推销/垃圾拦截量</div>
                    </div>
                  </div>

                  <!-- 拦截率 -->
                  <div class="stat-card stat-card--green">
                    <div class="stat-card-bg-icon">
                      <Icon icon="mdi:security" width="52" />
                    </div>
                    <div class="stat-card-body">
                      <div class="stat-card-icon green-icon">
                        <Icon icon="mdi:percent-outline" width="20" />
                      </div>
                      <div class="stat-card-value green-val">{{ analyticsData.interceptRate }}</div>
                      <div class="stat-card-label">系统拦截率</div>
                    </div>
                  </div>
                </div>

                <!-- 7天趋势柱状图 -->
                <div class="analytics-panel chart-panel">
                  <div class="panel-header">
                    <div class="panel-title">
                      <Icon icon="mdi:chart-bar" width="15" class="panel-title-icon" />
                      <span>最近 7 天拦截趋势</span>
                    </div>
                    <div class="panel-badge" v-if="analyticsData.trend.length">
                      近7天共 <strong>{{ analyticsData.trend.reduce((s,t) => s + t.count, 0) }}</strong> 封
                    </div>
                  </div>
                  <div class="css-chart-wrapper" v-if="analyticsData.trend.length">
                    <div class="chart-y-labels">
                      <span v-for="n in [100,75,50,25,0]" :key="n">{{ n === 0 ? '0' : '' }}</span>
                    </div>
                    <div class="chart-body">
                      <div class="chart-grid-lines">
                        <div class="grid-line" v-for="n in 4" :key="n"></div>
                      </div>
                      <div class="css-chart-container">
                        <div class="css-bar" v-for="item in analyticsData.trend" :key="item.date">
                          <div class="bar-tooltip">
                            <span class="tooltip-count">{{ item.count }}</span>
                            <span class="tooltip-unit"> 封</span>
                          </div>
                          <div class="bar-track">
                            <div
                              class="bar-fill"
                              :class="{ 'bar-fill--zero': item.count === 0, 'bar-fill--active': item.count > 0 }"
                              :style="{ height: (item.count === 0 ? 2 : Math.max(4, item.percent)) + '%' }"
                            ></div>
                          </div>
                          <div class="bar-label">{{ item.label }}</div>
                        </div>
                      </div>
                      <div class="chart-x-axis"></div>
                    </div>
                  </div>
                  <div class="chart-empty" v-else>
                    <Icon icon="mdi:chart-bar-stacked" width="36" />
                    <span>暂无拦截数据</span>
                  </div>
                </div>

                <!-- 规则活跃度排行 -->
                <div class="analytics-panel rules-panel">
                  <div class="panel-header">
                    <div class="panel-title">
                      <Icon icon="mdi:trophy-outline" width="15" class="panel-title-icon" />
                      <span>规则拦截活跃度排行</span>
                    </div>
                    <div class="panel-badge" v-if="analyticsData.topRules.length">TOP {{ analyticsData.topRules.length }}</div>
                  </div>
                  <div class="rule-ranking-list" v-if="analyticsData.topRules.length">
                    <div class="rule-rank-item" v-for="(rule, index) in analyticsData.topRules" :key="rule.name">
                      <div class="rank-medal" :class="'medal-' + (index + 1)">
                        <Icon v-if="index === 0" icon="mdi:trophy" width="14" />
                        <Icon v-else-if="index === 1" icon="mdi:medal" width="13" />
                        <Icon v-else-if="index === 2" icon="mdi:medal-outline" width="13" />
                        <span v-else class="rank-num">{{ index + 1 }}</span>
                      </div>
                      <div class="rank-info">
                        <div class="rank-name-row">
                          <span class="rank-name" :title="rule.name">{{ rule.name }}</span>
                          <span class="rank-count-inline">{{ rule.count }} 次</span>
                        </div>
                        <div class="rank-bar-bg">
                          <div
                            class="rank-bar-fill"
                            :class="'rank-fill-' + (index + 1)"
                            :style="{ width: Math.max(2, rule.percent) + '%' }"
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="chart-empty" v-else>
                    <Icon icon="mdi:inbox-outline" width="36" />
                    <span>暂无规则命中记录</span>
                    <span class="chart-empty-sub">规则引擎运行后将在此展示活跃度数据</span>
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
import { ref, computed, onMounted, reactive, nextTick, watch } from 'vue'
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
  // 首次打开时预加载分析数据（后台静默加载）
  fetchAnalytics()
})

// 切换到分析面板时自动刷新数据（懒加载）
watch(activeTab, (tab) => {
  if (tab === 'analytics') {
    fetchAnalytics()
  }
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


/* ═══════════════ Analytics Dashboard CSS (Premium Redesign) ═══════════════ */

.analytics-body {
  padding: 0;
  min-height: 100%;
}

/* Header */
.analytics-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--el-bg-color);
  position: sticky;
  top: 0;
  z-index: 3;
}

.analytics-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.analytics-icon-badge {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--el-color-primary-light-3), var(--el-color-primary));
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.analytics-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.analytics-subtitle {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 1px;
}

.refresh-btn {
  flex-shrink: 0;
}

/* Content wrapper */
.analytics-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 16px 24px;
}

/* ─── Skeleton Loading ──────────────────────────────────────────────────────── */
.analytics-skeleton {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 16px 24px;
}

.skeleton-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.skeleton-card {
  border-radius: 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent 30%, var(--bg-elevated) 50%, transparent 70%);
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.6s infinite;
  }
}

.sk-stat {
  height: 110px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;

  .sk-icon { width: 32px; height: 32px; border-radius: 50%; background: var(--bg-elevated); }
  .sk-val  { width: 56px; height: 22px; border-radius: 4px; background: var(--bg-elevated); }
  .sk-label{ width: 70px; height: 12px; border-radius: 3px; background: var(--bg-elevated); }
}

.sk-chart { height: 200px; }
.sk-rules { height: 160px; }

@keyframes skeleton-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

/* ─── Stat Cards Row ────────────────────────────────────────────────────────── */
.stat-cards-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
}

.stat-card {
  border-radius: 12px;
  border: 1px solid transparent;
  padding: 16px 16px 14px;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.08);
  }
}

.stat-card--blue {
  background: linear-gradient(135deg, var(--el-color-primary-light-9), var(--el-color-primary-light-8));
  border-color: var(--el-color-primary-light-7);
}

.stat-card--amber {
  background: linear-gradient(135deg, var(--el-color-warning-light-9), var(--el-color-warning-light-8));
  border-color: var(--el-color-warning-light-7);
}

.stat-card--green {
  background: linear-gradient(135deg, var(--el-color-success-light-9), var(--el-color-success-light-8));
  border-color: var(--el-color-success-light-7);
}

.stat-card-bg-icon {
  position: absolute;
  right: -8px;
  bottom: -8px;
  opacity: 0.08;
  color: var(--el-color-primary);
  pointer-events: none;
}

.stat-card--amber .stat-card-bg-icon { color: var(--el-color-warning); }
.stat-card--green .stat-card-bg-icon { color: var(--el-color-success); }

.stat-card-body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.stat-card-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
}

.blue-icon  { background: var(--el-color-primary-light-7); color: var(--el-color-primary); }
.amber-icon { background: var(--el-color-warning-light-7); color: var(--el-color-warning); }
.green-icon { background: var(--el-color-success-light-7); color: var(--el-color-success); }

.stat-card-value {
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
  color: var(--el-color-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
}

.amber-val { color: var(--el-color-warning); }
.green-val  { color: var(--el-color-success); }

.stat-card-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
  line-height: 1.3;
}

/* ─── Analytics Panels (Chart + Rules) ─────────────────────────────────────── */
.analytics-panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--bg-surface);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-title-icon {
  color: var(--el-color-primary);
  opacity: 0.8;
}

.panel-badge {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-elevated);
  border-radius: 20px;
  padding: 2px 10px;
  border: 1px solid var(--border-subtle);

  strong {
    color: var(--el-color-primary);
    font-weight: 700;
  }
}

/* ─── Bar Chart ─────────────────────────────────────────────────────────────── */
.chart-panel {
  .css-chart-wrapper {
    display: flex;
    padding: 14px 16px 30px;
    gap: 8px;
  }
}

.chart-y-labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 20px;
  flex-shrink: 0;

  span {
    font-size: 10px;
    color: var(--text-muted);
    line-height: 1;
    text-align: right;
  }
}

.chart-body {
  flex: 1;
  position: relative;
}

.chart-grid-lines {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 26px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  pointer-events: none;
  z-index: 0;
}

.grid-line {
  width: 100%;
  height: 1px;
  background: var(--el-border-color-lighter);
}

.css-chart-container {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 150px;
  padding-bottom: 26px;
  position: relative;
  z-index: 1;
  gap: 4px;
}

.chart-x-axis {
  position: absolute;
  bottom: 26px;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--el-border-color);
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
    transform: translateX(-50%) translateY(-4px);
  }

  &:hover .bar-fill {
    filter: brightness(1.1);
  }
}

.bar-track {
  width: 70%;
  max-width: 34px;
  min-width: 8px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  border-radius: 4px 4px 0 0;
}

.bar-fill {
  width: 100%;
  border-radius: 4px 4px 0 0;
  transition: height 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);

  &.bar-fill--active {
    background: linear-gradient(to top, var(--el-color-primary), var(--el-color-primary-light-3));
  }

  &.bar-fill--zero {
    background: var(--el-border-color);
    border-radius: 2px;
  }
}

.bar-label {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}

.bar-tooltip {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%) translateY(0);
  background: var(--el-text-color-primary);
  color: var(--el-bg-color);
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  opacity: 0;
  transition: opacity 0.2s, transform 0.2s;
  pointer-events: none;
  white-space: nowrap;
  z-index: 2;
  font-weight: 600;
}

.tooltip-count {
  font-size: 12px;
  font-weight: 700;
}
.tooltip-unit {
  font-size: 10px;
  opacity: 0.8;
}

/* ─── Chart Empty State ─────────────────────────────────────────────────────── */
.chart-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 13px;
  padding: 36px 20px;
  opacity: 0.7;

  .chart-empty-sub {
    font-size: 11px;
    opacity: 0.7;
    text-align: center;
    max-width: 200px;
    line-height: 1.4;
  }
}

/* ─── Rule Ranking List ─────────────────────────────────────────────────────── */
.rules-panel {
  .rule-ranking-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 8px 0;
  }
}

.rule-rank-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  transition: background 0.15s;

  &:hover {
    background: var(--bg-surface);
  }
}

.rank-medal {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;

  &.medal-1 { background: linear-gradient(135deg, #fff3cd, #ffc107); color: #7a5300; }
  &.medal-2 { background: linear-gradient(135deg, #e2e8f0, #94a3b8); color: #334155; }
  &.medal-3 { background: linear-gradient(135deg, #fde2cc, #f97316); color: #7c2d12; }
  &.medal-4, &.medal-5 {
    background: var(--bg-elevated);
    color: var(--text-muted);
    font-size: 12px;
  }
}

.rank-num {
  font-size: 12px;
  font-weight: 700;
}

.rank-info {
  flex: 1;
  min-width: 0;
}

.rank-name-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 5px;
}

.rank-name {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 65%;
}

.rank-count-inline {
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.rank-bar-bg {
  height: 5px;
  background: var(--bg-elevated);
  border-radius: 3px;
  overflow: hidden;
}

.rank-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.7s ease;
  min-width: 2px;

  &.rank-fill-1 { background: linear-gradient(to right, #ffc107, #ff9800); }
  &.rank-fill-2 { background: linear-gradient(to right, #90a4ae, #607d8b); }
  &.rank-fill-3 { background: linear-gradient(to right, #f97316, #ef4444); }
  &.rank-fill-4 { background: var(--el-color-primary-light-5); }
  &.rank-fill-5 { background: var(--el-color-primary-light-7); }
}

</style>
