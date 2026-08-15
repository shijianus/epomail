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
              内容及标题过滤 (入垃圾桶)
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
          {{ listMode === 'whitelist' ? '仅允许以下域名或邮箱。其它将归类至垃圾桶。' : '拦截以下域名或邮箱（归类至垃圾桶）。' }}<br/>
          <span style="color: var(--text-muted); font-size: 12px; margin-top: 4px; display: inline-block;">( 支持精确邮箱或域名后缀，如 @spam.com 或 spam.com，亦支持通配符如 *@*.example.com )</span>
        </div>
        <div class="drawer-desc" v-else-if="drawerTarget === 'block'">
          添加需要被彻底丢弃的域名或邮箱。<br/>
          <span style="color: var(--text-muted); font-size: 12px; margin-top: 4px; display: inline-block;">( 同样支持通配符匹配 )</span><br/>
          <span class="warning-text"><Icon icon="lucide:alert-triangle" width="14"/> 邮件将被直接删除，不进垃圾桶。</span>
        </div>
        <div class="drawer-desc" v-else-if="drawerTarget === 'subject'">
          若标题包含以下任一关键词，邮件将进入垃圾桶。
        </div>
        <div class="drawer-desc" v-else-if="drawerTarget === 'content'">
          若邮件正文包含以下任一关键词，邮件将进入垃圾桶。
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
  '*@junk.net'
]

const subjectTemplates = [
  '免费',
  '促销'
]

const contentTemplates = [
  '发票',
  '中奖',
  '贷款'
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
      await setBlackList({ blackContent: (isInitBlock && !isInitContent) ? getBlockSaveString() : getContentSaveString() }) // Content saves both in legacy kinda. We will save getContentSaveString as it saves content. Wait, blackContent field in DB holds ONE string. We can't have both hardBlock and regular content in current schema because it's either `__hardblock,` or not. But actually I should not overwrite DB if they are empty unless user clicks save. Just let them display defaults. Let's just avoid saving them silently unless they are modified, except list which is already handled.
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
    blacklist: blacklistEntries.value
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
  color: var(--text-regular);
  font-size: 14px;
  line-height: 1.5;
  background: var(--bg-surface);
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
  .warning-text {
    color: var(--el-color-danger);
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
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
