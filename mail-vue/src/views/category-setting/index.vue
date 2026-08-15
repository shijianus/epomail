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
             <div class="templates-section">
                <div class="templates-title">内置推荐模板 <el-tooltip content="点击添加。加粗项为系统预设。"><Icon icon="lucide:help-circle" width="12" /></el-tooltip></div>
                <div class="templates-list">
                   <el-tag
                      v-for="tpl in builtinTemplates"
                      :key="tpl"
                      :type="tempEntries.includes(tpl) ? 'info' : ''"
                      size="small"
                      class="tpl-tag"
                      @click="addTemplate(tpl)"
                   >
                      {{ tpl }}
                   </el-tag>
                </div>
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
import { settingQuery, setBlackList, settingSet } from '@/request/setting.js'
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

// Drawer State
const drawerVisible = ref(false)
const drawerTarget = ref('list') // 'list' | 'block' | 'content'
const tempEntries = ref([])
const tempSubject = ref([])
const tempContent = ref([])

const builtinTemplates = [
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
  'hello@producthunt.com'
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
    let raw = data.blackFrom || ''
    
    // Auto-inject if completely empty (first initialization)
    let isInit = false
    if (!raw) {
      raw = '__mode:blacklist,' + builtinTemplates.join(',')
      isInit = true
    }

    if (raw.startsWith('__mode:whitelist,')) {
      listMode.value = 'whitelist'
      const rest = raw.slice('__mode:whitelist,'.length)
      listEntries.value = rest ? rest.split(',').filter(Boolean) : []
    } else if (raw.startsWith('__mode:blacklist,')) {
      listMode.value = 'blacklist'
      const rest = raw.slice('__mode:blacklist,'.length)
      listEntries.value = rest ? rest.split(',').filter(Boolean) : []
    } else {
      listMode.value = 'blacklist'
      listEntries.value = raw ? raw.split(',').filter(Boolean) : []
    }

    const rawContent = data.blackContent || ''
    if (rawContent.startsWith('__hardblock,')) {
      const rest = rawContent.slice('__hardblock,'.length)
      hardBlockEntries.value = rest ? rest.split(',').filter(Boolean) : []
      blackContent.value = []
    } else {
      hardBlockEntries.value = []
      blackContent.value = rawContent ? rawContent.split(',').filter(Boolean) : []
    }

    blackSubject.value = data.blackSubject ? data.blackSubject.split(',').filter(Boolean) : []

    // Save default templates silently on first init
    if (isInit) {
      listEntries.value = deduplicateRules(listEntries.value)
      await setBlackList({ blackFrom: '__mode:blacklist,' + listEntries.value.join(',') })
    }

  } catch (e) {
    console.error('Settings load failed:', e)
  } finally {
    firstLoading.value = false
  }
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

function addTemplate(tpl) {
  if (!tempEntries.value.includes(tpl)) {
    tempEntries.value.push(tpl)
  }
}

async function confirmDrawer() {
  saving.value = true
  try {
    if (drawerTarget.value === 'list') {
      const deduped = deduplicateRules(tempEntries.value)
      listEntries.value = deduped
      await setBlackList({ blackFrom: `__mode:${listMode.value},` + deduped.join(',') })
    } else if (drawerTarget.value === 'block') {
      const deduped = deduplicateRules(tempEntries.value)
      hardBlockEntries.value = deduped
      await setBlackList({ blackContent: '__hardblock,' + deduped.join(',') })
    } else if (drawerTarget.value === 'content') {
      const dSub = Array.from(new Set(tempSubject.value)).filter(Boolean)
      const dCon = Array.from(new Set(tempContent.value)).filter(Boolean)
      blackSubject.value = dSub
      blackContent.value = dCon
      await setBlackList({ blackSubject: dSub.join(','), blackContent: dCon.join(',') })
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
    await setBlackList({ blackFrom: `__mode:${listMode.value},` + listEntries.value.join(',') })
    ElMessage.success('模式已切换')
  } catch (e) {
    ElMessage.error('切换失败')
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
  background: var(--bg-main, #f8f9fa); /* fallback */
}
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  background: var(--bg-main);
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
  background: var(--bg-surface, #fff);
  border: 1px solid var(--border-subtle, #eaeaea);
  border-radius: 12px;
  overflow: hidden;
}
.cat-card-header {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 18px;
  background: var(--bg-elevated, #fafafa);
  border-bottom: 1px solid var(--border-subtle, #eaeaea);
  font-size: 14px; font-weight: 600; color: var(--text-primary);
  .card-icon { color: var(--accent-primary, #3b82f6); }
  .card-icon.danger { color: var(--danger, #ef4444); }
  .card-icon.warning { color: #f59e0b; }
  .help-icon { color: var(--text-muted); cursor: pointer; margin-left: 4px; }
}
.cat-card-body { padding: 20px 18px; }

.mode-toggle-group {
  display: flex; gap: 12px; margin-bottom: 20px;
}
.mode-btn {
  flex: 1;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px;
  background: var(--bg-surface, #fff);
  border: 1.5px solid var(--border-subtle, #eaeaea);
  border-radius: 8px; cursor: pointer;
  font-size: 13.5px; font-weight: 600; color: var(--text-secondary);
  transition: all 200ms;
  &:hover { background: var(--bg-hover, #f3f4f6); }
  &.active {
    border-color: var(--accent-primary, #3b82f6);
    background: rgba(59, 130, 246, 0.05);
    color: var(--accent-primary, #3b82f6);
    .mode-icon { color: var(--accent-primary, #3b82f6); }
  }
  .mode-icon { color: var(--text-muted); }
}

.stats-row {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--bg-elevated, #fafafa);
  padding: 12px 16px; border-radius: 8px;
  .stats-text { font-size: 13.5px; color: var(--text-secondary); strong { color: var(--text-primary); font-size: 15px;} }
}

/* Drawer */
.drawer-content { padding: 0 4px; }
.drawer-desc { font-size: 13px; color: var(--text-secondary); margin-top: 0; margin-bottom: 20px; line-height: 1.5; }
.templates-section { margin-bottom: 20px; }
.templates-title { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--text-secondary); margin-bottom: 10px; }
.templates-list { display: flex; flex-wrap: wrap; gap: 8px; }
.tpl-tag { cursor: pointer; transition: opacity 200ms; &:hover { opacity: 0.8; } }
.filter-label { display: block; font-size: 12.5px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; }
.tag-input-area { min-height: 100px; align-items: flex-start; }
</style>
