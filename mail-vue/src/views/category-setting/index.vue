<template>
  <div class="cat-page">
    <div class="loading-overlay" :class="firstLoading ? 'lo-show' : 'lo-hide'">
      <loading />
    </div>

    <el-scrollbar class="cat-scroll" v-if="!firstLoading">
      <div class="cat-body">
        <div class="cat-header">
          <div class="cat-header-left">
            <h1 class="cat-title">{{ $t('categorySetting') || '分类管理' }}</h1>
          </div>
        </div>

        <div class="cat-grid">
          <!-- ── Panel 1: Mode & List ── -->
          <div class="cat-card mode-card">
            <div class="cat-card-header">
              <Icon icon="lucide:settings-2" width="16" class="card-icon" />
              <span>基础名单</span>
              <el-tooltip :content="($t('catHowItWorks') || '白名单放行，黑名单拦截。') + ' ' + (listMode === 'blacklist' ? ($t('blacklistExplain') || '黑名单内地址直接拉黑。') : ($t('whitelistExplain') || '仅放行白名单内地址。'))" placement="top">
                <Icon icon="lucide:help-circle" width="14" class="help-icon" />
              </el-tooltip>
            </div>
            <div class="cat-card-body">
              <div class="mode-toggle-group">
                 <button class="mode-btn" :class="{ active: listMode === 'blacklist' }" @click="setMode('blacklist')" :disabled="saving">
                    <Icon icon="lucide:shield-off" width="18" class="mode-icon" /> {{ $t('blacklistMode') || '黑名单模式' }}
                 </button>
                 <button class="mode-btn" :class="{ active: listMode === 'whitelist' }" @click="setMode('whitelist')" :disabled="saving">
                    <Icon icon="lucide:shield-check" width="18" class="mode-icon" /> {{ $t('whitelistMode') || '白名单模式' }}
                 </button>
              </div>

              <div class="stats-row">
                 <div class="stats-text">当前模式下生效规则：<strong>{{ listEntries.length }}</strong> 条</div>
                 <el-button type="primary" @click="openDrawer('list')" :loading="saving">设置规则</el-button>
              </div>
              <div class="internal-toggle">
                <el-switch v-model="blockInternalList" @change="saveListDirectly" />
                <span class="internal-label">对站内邮件生效 (默认放行)</span>
              </div>
            </div>
          </div>

          <!-- ── Panel 2: Hard Block ── -->
          <div class="cat-card">
             <div class="cat-card-header">
               <Icon icon="lucide:ban" width="16" class="card-icon danger" />
               <span>硬拦截 (Hard Block)</span>
               <el-tooltip :content="$t('hardBlockDesc') || '符合条件的邮件直接拒收，不进入垃圾箱。'" placement="top">
                 <Icon icon="lucide:help-circle" width="14" class="help-icon" />
               </el-tooltip>
             </div>
             <div class="cat-card-body">
               <div class="stats-row">
                 <div class="stats-text">生效拦截规则：<strong>{{ hardBlockEntries.length }}</strong> 条</div>
                 <el-button type="primary" @click="openDrawer('block')" :loading="saving">设置拦截</el-button>
               </div>
               <div class="internal-toggle">
                 <el-switch v-model="blockInternalBlock" @change="saveBlockDirectly" />
                 <span class="internal-label">对站内邮件生效 (默认放行)</span>
               </div>
             </div>
          </div>

          <!-- ── Panel 3: Content Filter ── -->
          <div class="cat-card">
             <div class="cat-card-header">
               <Icon icon="lucide:file-warning" width="16" class="card-icon warning" />
               <span>内容过滤 (Content Filter)</span>
               <el-tooltip :content="$t('contentFilterDesc') || '根据邮件主题或正文关键词进行拦截。'" placement="top">
                 <Icon icon="lucide:help-circle" width="14" class="help-icon" />
               </el-tooltip>
             </div>
             <div class="cat-card-body">
               <div class="stats-row">
                 <div class="stats-text">主题关键词 <strong>{{ blackSubject.length }}</strong> 个，正文 <strong>{{ blackContent.length }}</strong> 个</div>
                 <el-button type="primary" @click="openDrawer('content')" :loading="saving">设置关键词</el-button>
               </div>
               <div class="internal-toggle">
                 <el-switch v-model="blockInternalSubject" @change="saveContentDirectly" />
                 <span class="internal-label">主题过滤对站内邮件生效</span>
               </div>
               <div class="internal-toggle" style="margin-top: 8px;">
                 <el-switch v-model="blockInternalContent" @change="saveContentDirectly" />
                 <span class="internal-label">正文过滤对站内邮件生效</span>
               </div>
             </div>
          </div>
        </div>
      </div>
    </el-scrollbar>

    <!-- ── Drawer ── -->
    <el-drawer
       v-model="drawerVisible"
       :title="drawerTitle"
       size="450px"
       @closed="onDrawerClosed"
    >
       <div class="drawer-content">
          <p class="drawer-desc" v-if="drawerTarget === 'list'">输入域名或邮箱地址并回车。保存后系统会自动对包含关系的地址进行去重。</p>
          <p class="drawer-desc" v-if="drawerTarget === 'block'">输入需要彻底拒收的域名或邮箱。</p>
          <p class="drawer-desc" v-if="drawerTarget === 'content'">输入关键词并回车添加。</p>

          <template v-if="drawerTarget === 'list'">
             <div class="drawer-actions" style="margin-bottom: 12px; display: flex; justify-content: flex-end;">
               <el-button size="small" @click="restoreDefaultTemplates">恢复默认模板</el-button>
             </div>
             <el-input-tag v-model="tempEntries" placeholder="输入后回车" class="tag-input-area" />
          </template>
          <template v-else-if="drawerTarget === 'block'">
             <el-input-tag v-model="tempEntries" placeholder="输入后回车" tag-type="danger" class="tag-input-area" />
          </template>
          <template v-else-if="drawerTarget === 'content'">
             <label class="filter-label">主题关键词</label>
             <el-input-tag v-model="tempSubject" placeholder="输入后回车" tag-type="warning" class="tag-input-area" />
             <label class="filter-label" style="margin-top:16px;">正文关键词</label>
             <el-input-tag v-model="tempContent" placeholder="输入后回车" tag-type="warning" class="tag-input-area" />
          </template>
       </div>
       <template #footer>
          <div style="flex: auto">
            <el-button @click="drawerVisible = false">取消</el-button>
            <el-button type="primary" :loading="saving" @click="confirmDrawer">保存并去重</el-button>
          </div>
       </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { settingQuery, setBlackList } from '@/request/setting.js'
import loading from '@/components/loading/index.vue'
import { ElMessage } from 'element-plus'

const { t } = useI18n()

// ── State ──────────────────────────────────────────────────────────
const firstLoading = ref(true)
const saving = ref(false)

const listMode = ref('blacklist')
const listEntries = ref([])
const hardBlockEntries = ref([])
const blackSubject = ref([])
const blackContent = ref([])

const blockInternalList = ref(false)
const blockInternalBlock = ref(false)
const blockInternalSubject = ref(false)
const blockInternalContent = ref(false)

// Drawer State
const drawerVisible = ref(false)
const drawerTarget = ref('list') // 'list' | 'block' | 'content'
const tempEntries = ref([])
const tempSubject = ref([])
const tempContent = ref([])

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
  'noreply@medium.com'
]

const whitelistTemplates = [
  'github.com',
  'paypal.com',
  'google.com',
  'microsoft.com',
  'apple.com'
]

const drawerTitle = computed(() => {
  if (drawerTarget.value === 'list') return '设置基础名单规则'
  if (drawerTarget.value === 'block') return '设置硬拦截规则'
  return '设置内容过滤关键词'
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
      rawList = '__mode:blacklist,' + blacklistTemplates.join(',')
      isInitList = true
    }

    if (rawList.startsWith('__mode:whitelist,')) {
      listMode.value = 'whitelist'
      const rest = rawList.slice('__mode:whitelist,'.length)
      listEntries.value = rest ? rest.split(',').filter(Boolean) : []
    } else if (rawList.startsWith('__mode:blacklist,')) {
      listMode.value = 'blacklist'
      const rest = rawList.slice('__mode:blacklist,'.length)
      listEntries.value = rest ? rest.split(',').filter(Boolean) : []
    } else {
      listMode.value = 'blacklist'
      listEntries.value = rawList ? rawList.split(',').filter(Boolean) : []
    }

    // Parse block content and internal flag
    let rawContent = data.blackContent || ''
    if (rawContent.includes('__blockInternal,')) {
      blockInternalBlock.value = true
      blockInternalContent.value = true // Sync for legacy compat
      rawContent = rawContent.replace('__blockInternal,', '')
    }

    if (rawContent.startsWith('__hardblock,')) {
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
    blackSubject.value = rawSubject ? rawSubject.split(',').filter(Boolean) : []

    // Save default templates silently on first init
    if (isInitList) {
      listEntries.value = deduplicateRules(listEntries.value)
      await setBlackList({ blackFrom: getListSaveString() })
    }

  } catch (e) {
    console.error('Settings load failed:', e)
  } finally {
    firstLoading.value = false
  }
}

function getListSaveString() {
  const internalPrefix = blockInternalList.value ? '__blockInternal,' : '';
  return `__mode:${listMode.value},${internalPrefix}` + listEntries.value.join(',')
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
  if (listMode.value === mode) return
  listMode.value = mode
  saveListDirectly()
}

// ── Drawer Management ────────────────────────────────────────────────
function openDrawer(target) {
  drawerTarget.value = target
  if (target === 'list') tempEntries.value = [...listEntries.value]
  else if (target === 'block') tempEntries.value = [...hardBlockEntries.value]
  else if (target === 'content') {
    tempSubject.value = [...blackSubject.value]
    tempContent.value = [...blackContent.value]
  }
  drawerVisible.value = true
}

function onDrawerClosed() {
  tempEntries.value = []
  tempSubject.value = []
  tempContent.value = []
}

function restoreDefaultTemplates() {
  const templates = listMode.value === 'whitelist' ? whitelistTemplates : blacklistTemplates;
  for (const tpl of templates) {
    if (!tempEntries.value.includes(tpl)) {
      tempEntries.value.push(tpl)
    }
  }
}

async function confirmDrawer() {
  saving.value = true
  try {
    if (drawerTarget.value === 'list') {
      listEntries.value = deduplicateRules(tempEntries.value)
      await setBlackList({ blackFrom: getListSaveString() })
    } else if (drawerTarget.value === 'block') {
      hardBlockEntries.value = deduplicateRules(tempEntries.value)
      await setBlackList({ blackContent: getBlockSaveString() })
    } else if (drawerTarget.value === 'content') {
      blackSubject.value = Array.from(new Set(tempSubject.value)).filter(Boolean)
      blackContent.value = Array.from(new Set(tempContent.value)).filter(Boolean)
      await setBlackList({ 
        blackSubject: getSubjectSaveString(), 
        blackContent: getContentSaveString() 
      })
    }
    ElMessage.success('保存成功，已自动去除冗余')
    drawerVisible.value = false
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function saveListDirectly() {
  saving.value = true
  try {
    await setBlackList({ blackFrom: getListSaveString() })
    ElMessage.success('配置已保存')
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function saveBlockDirectly() {
  saving.value = true
  try {
    await setBlackList({ blackContent: getBlockSaveString() })
    ElMessage.success('配置已保存')
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function saveContentDirectly() {
  saving.value = true
  try {
    await setBlackList({ 
        blackSubject: getSubjectSaveString(), 
        blackContent: getContentSaveString() 
    })
    ElMessage.success('配置已保存')
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="scss">
.cat-page {
  height: 100%;
  overflow: hidden;
  position: relative;
  background: transparent;
}
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  background: var(--bg-main, transparent);
}
.lo-show { opacity: 1; transition: opacity 200ms; }
.lo-hide { opacity: 0; pointer-events: none; transition: opacity 200ms; }

.cat-scroll { width: 100%; height: 100%; }
.cat-body { padding: 30px; max-width: 900px; margin: 0 auto; }

.cat-header {
  margin-bottom: 24px;
  .cat-title {
    font-size: 22px; font-weight: 700; color: var(--text-primary); margin: 0;
  }
}

.cat-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cat-card {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}
.cat-card-header {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 18px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-color);
  font-size: 14px; font-weight: 600; color: var(--text-primary);
  .card-icon { color: var(--el-color-primary); }
  .card-icon.danger { color: var(--el-color-danger); }
  .card-icon.warning { color: var(--el-color-warning); }
  .help-icon { color: var(--text-secondary); cursor: pointer; margin-left: 4px; }
}
.cat-card-body { padding: 20px 18px; }

.mode-toggle-group {
  display: flex; gap: 12px; margin-bottom: 20px;
}
.mode-btn {
  flex: 1;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 8px; cursor: pointer;
  font-size: 13.5px; font-weight: 600; color: var(--text-secondary);
  transition: all 200ms;
  &:hover { background: var(--bg-surface); }
  &.active {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    .mode-icon { color: var(--el-color-primary); }
  }
  .mode-icon { color: var(--text-secondary); }
}

.stats-row {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--bg-surface);
  padding: 12px 16px; border-radius: 8px;
  margin-bottom: 16px;
  .stats-text { font-size: 13.5px; color: var(--text-secondary); strong { color: var(--text-primary); font-size: 15px;} }
}

.internal-toggle {
  display: flex; align-items: center; gap: 8px;
  .internal-label { font-size: 13px; color: var(--text-secondary); }
}

/* Drawer */
.drawer-content { padding: 0 4px; }
.drawer-desc { font-size: 13px; color: var(--text-secondary); margin-top: 0; margin-bottom: 20px; line-height: 1.5; }
.filter-label { display: block; font-size: 12.5px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; }
.tag-input-area { min-height: 100px; align-items: flex-start; }
</style>
