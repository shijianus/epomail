<template>
  <div class="settings-container">
    <div class="loading" :class="firstLoading ? 'loading-show' : 'loading-hide'">
      <loading />
    </div>
    <el-scrollbar class="scroll" v-if="!firstLoading">
      <div class="scroll-body">
        <div class="card-grid">
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { settingQuery, setBlackList } from '@/request/setting.js'
import Loading from '@/components/loading/index.vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'

const firstLoading = ref(true)

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
const drawerTarget = ref('list') // 'list' | 'block' | 'subject' | 'content'
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
  '免费',
  '促销',
  'casino',
  'viagra',
  'lottery',
  'winner',
  'urgent'
]

const contentTemplates = [
  '发票',
  '中奖',
  '贷款',
  '赌场',
  '博彩',
  '免费领取',
  '代开',
  '退款通知',
  '急聘',
  'pharmacy',
  'crypto',
  'bitcoin',
  'giveaway',
  'loan'
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
})

// ── Deduplication Logic ─────────────────────────────────────────────
function deduplicateRules(rules) {
  let unique = Array.from(new Set(rules)).filter(Boolean).map(r => r.trim());
  let domains = unique.filter(r => !r.includes('@') || r.startsWith('@')).map(d => d.replace(/^@/, ''));
  let finalRules = [];
  for (let rule of unique) {
    if (rule.includes('@') && !rule.startsWith('@')) {
       let domainPart = rule.split('@')[1];
       if (domains.includes(domainPart)) continue; // redundant, domain already included
    }
    finalRules.push(rule);
  }
  return finalRules;
}

async function loadSettings() {
  firstLoading.value = true
  try {
    const data = await settingQuery()
    let rawList = data.blackFrom || ''
    
    // Parse list mode and internal flag
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
      // legacy support
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

    // Parse block content and internal flag
    let rawContent = data.blackContent || ''
    if (rawContent.includes('__blockInternal,')) {
      blockInternalBlock.value = true
      blockInternalContent.value = true // Sync for legacy compat
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

    // Save default templates silently on first init
    if (isInitList) {
      blacklistEntries.value = deduplicateRules(blacklistEntries.value)
      await setBlackList({ blackFrom: getListSaveString() })
    }
    if (isInitBlock || isInitContent) {
      await setBlackList({ blackContent: (isInitBlock && !isInitContent) ? getBlockSaveString() : getContentSaveString() }) 
    }

  } catch (e) {
    console.error('Settings load failed:', e)
  } finally {
    firstLoading.value = false
  }
}

function getListSaveString() {
  const internalPrefix = blockInternalList.value ? '__blockInternal,' : '';
  const payload = {
    mode: listMode.value,
    whitelist: whitelistEntries.value,
    blacklist: blacklistEntries.value,
    flags: {
      blockEmptyName: blockEmptyName.value,
      blockNotToMe: blockNotToMe.value,
      blockExecutable: blockExecutable.value
    }
  }
  return internalPrefix + JSON.stringify(payload)
}

function getBlockSaveString() {
  const internalPrefix = blockInternalBlock.value ? '__blockInternal,' : '';
  return `__hardblock,${internalPrefix}` + hardBlockEntries.value.join(',')
}

function getSubjectSaveString() {
  const internalPrefix = blockInternalSubject.value ? '__blockInternal,' : '';
  return `${internalPrefix}` + blackSubject.value.join(',')
}

function getContentSaveString() {
  const internalPrefix = blockInternalContent.value ? '__blockInternal,' : '';
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

async function saveBlockDirectly() {
  try {
    await setBlackList({ blackContent: getBlockSaveString() })
    ElMessage.success('已保存拦截设置')
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
  if (target === 'list') {
    sourceArray = listMode.value === 'whitelist' ? whitelistEntries.value : blacklistEntries.value
  } else if (target === 'block') {
    sourceArray = hardBlockEntries.value
  } else if (target === 'subject') {
    sourceArray = blackSubject.value
  } else if (target === 'content') {
    sourceArray = blackContent.value
  }
  
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
     if (listMode.value === 'whitelist') {
        currentDrawerArray.value = [...whitelistTemplates]
     } else {
        currentDrawerArray.value = [...blacklistTemplates]
     }
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
  
  // Deduplicate
  const finalArray = deduplicateRules(currentDrawerArray.value)
  
  let payload = {}
  
  if (drawerTarget.value === 'list') {
    if (listMode.value === 'whitelist') {
      whitelistEntries.value = finalArray
    } else {
      blacklistEntries.value = finalArray
    }
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
  }
}

.opt-button {
  width: fit-content !important;
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
</style>
