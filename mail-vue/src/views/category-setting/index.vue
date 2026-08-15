<template>
  <div class="cat-page">

    <!-- Loading overlay -->
    <div class="loading-overlay" :class="firstLoading ? 'lo-show' : 'lo-hide'">
      <loading />
    </div>

    <el-scrollbar class="cat-scroll" v-if="!firstLoading">
      <div class="cat-body">

        <!-- ── Header ── -->
        <div class="cat-header">
          <div class="cat-header-left">
            <h1 class="cat-title">{{ $t('categorySetting') }}</h1>
            <p class="cat-desc">{{ $t('categorySettingDesc') }}</p>
          </div>
          <div class="cat-header-badges">
            <span class="mode-badge" :class="listMode === 'blacklist' ? 'badge-black' : 'badge-white'">
              <Icon :icon="listMode === 'blacklist' ? 'lucide:shield-off' : 'lucide:shield-check'" width="13" />
              {{ listMode === 'blacklist' ? $t('blacklistMode') : $t('whitelistMode') }}
            </span>
          </div>
        </div>

        <!-- ── Info Banner ── -->
        <div class="info-banner">
          <Icon icon="lucide:info" width="16" class="info-icon" />
          <div class="info-text">
            <strong>{{ $t('catHowItWorks') }}</strong>
            {{ listMode === 'blacklist' ? $t('blacklistExplain') : $t('whitelistExplain') }}
          </div>
        </div>

        <div class="cat-grid">

          <!-- ── Panel 1: Mode Control ── -->
          <div class="cat-card mode-card">
            <div class="cat-card-header">
              <Icon icon="lucide:settings-2" width="16" class="card-icon" />
              <span>{{ $t('catFilterMode') }}</span>
            </div>
            <div class="cat-card-body">

              <!-- Mode Toggle -->
              <div class="mode-toggle-group">
                <button
                  class="mode-btn"
                  :class="{ active: listMode === 'blacklist' }"
                  @click="setMode('blacklist')"
                  :disabled="saving"
                >
                  <div class="mode-btn-icon black-icon">
                    <Icon icon="lucide:shield-off" width="20" />
                  </div>
                  <div class="mode-btn-text">
                    <span class="mode-btn-title">{{ $t('blacklistMode') }}</span>
                    <span class="mode-btn-desc">{{ $t('blacklistModeDesc') }}</span>
                  </div>
                  <Icon v-if="listMode === 'blacklist'" icon="lucide:check-circle-2" width="18" class="mode-check" />
                </button>

                <button
                  class="mode-btn"
                  :class="{ active: listMode === 'whitelist' }"
                  @click="setMode('whitelist')"
                  :disabled="saving"
                >
                  <div class="mode-btn-icon white-icon">
                    <Icon icon="lucide:shield-check" width="20" />
                  </div>
                  <div class="mode-btn-text">
                    <span class="mode-btn-title">{{ $t('whitelistMode') }}</span>
                    <span class="mode-btn-desc">{{ $t('whitelistModeDesc') }}</span>
                  </div>
                  <Icon v-if="listMode === 'whitelist'" icon="lucide:check-circle-2" width="18" class="mode-check" />
                </button>
              </div>

              <el-divider border-style="dashed" style="margin: 16px 0 12px;" />

              <!-- Functional Impact -->
              <div class="impact-section">
                <div class="impact-title">{{ $t('catFunctionalImpact') }}</div>
                <div class="impact-list">
                  <div class="impact-item">
                    <Icon icon="lucide:trash-2" width="14" class="impact-icon danger" />
                    <span>{{ $t('catImpactSpam') }}</span>
                  </div>
                  <div class="impact-item">
                    <Icon icon="lucide:tag" width="14" class="impact-icon accent" />
                    <span>{{ listMode === 'blacklist' ? $t('catImpactSubBlack') : $t('catImpactSubWhite') }}</span>
                  </div>
                  <div class="impact-item">
                    <Icon icon="lucide:mail-x" width="14" class="impact-icon warning" />
                    <span>{{ listMode === 'blacklist' ? $t('catImpactPromoBlack') : $t('catImpactPromoWhite') }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Panel 2: Domain / Address List ── -->
          <div class="cat-card list-card">
            <div class="cat-card-header">
              <Icon :icon="listMode === 'blacklist' ? 'lucide:shield-off' : 'lucide:shield-check'" width="16" class="card-icon" />
              <span>{{ listMode === 'blacklist' ? $t('blackFromDesc') : $t('whitelistAddresses') }}</span>
              <span class="entry-count">{{ listEntries.length }}</span>
            </div>
            <div class="cat-card-body list-body">
              <!-- Search + Add row -->
              <div class="list-toolbar">
                <div class="search-wrap">
                  <Icon icon="lucide:search" width="15" class="search-icon" />
                  <input
                    v-model="entrySearch"
                    class="search-input"
                    :placeholder="$t('searchEntry')"
                  />
                </div>
                <el-button
                  type="primary"
                  size="small"
                  @click="openAddEntry"
                  :loading="saving"
                  class="add-entry-btn"
                >
                  <Icon icon="lucide:plus" width="14" style="margin-right:4px" />
                  {{ $t('addEntry') }}
                </el-button>
              </div>

              <!-- Entry list -->
              <div class="entry-list">
                <transition-group name="entry" tag="div">
                  <div
                    v-for="entry in filteredEntries"
                    :key="entry"
                    class="entry-item"
                  >
                    <div class="entry-left">
                      <Icon
                        :icon="entry.includes('@') ? 'lucide:at-sign' : 'lucide:globe'"
                        width="14"
                        class="entry-type-icon"
                      />
                      <span class="entry-value">{{ entry }}</span>
                      <span class="entry-badge" :class="entry.includes('@') ? 'badge-email' : 'badge-domain'">
                        {{ entry.includes('@') ? $t('exactEmail') : $t('domainWildcard') }}
                      </span>
                    </div>
                    <button class="entry-remove" @click="removeEntry(entry)" :title="$t('delete')">
                      <Icon icon="lucide:x" width="13" />
                    </button>
                  </div>
                </transition-group>

                <div v-if="filteredEntries.length === 0" class="entry-empty">
                  <Icon icon="lucide:inbox" width="36" class="entry-empty-icon" />
                  <p>{{ entrySearch ? $t('noMatchEntries') : $t('noEntries') }}</p>
                  <span>{{ entrySearch ? $t('noMatchEntriesDesc') : (listMode === 'blacklist' ? $t('noBlacklistEntriesDesc') : $t('noWhitelistEntriesDesc')) }}</span>
                </div>
              </div>

              <!-- Save button -->
              <div class="list-footer">
                <el-button
                  type="primary"
                  :loading="saving"
                  @click="saveList"
                  class="save-list-btn"
                  :disabled="!listDirty"
                >
                  <Icon icon="lucide:save" width="14" style="margin-right:4px" />
                  {{ $t('save') }}
                </el-button>
                <span v-if="listDirty" class="unsaved-hint">
                  <Icon icon="lucide:alert-circle" width="13" />
                  {{ $t('unsavedChanges') }}
                </span>
              </div>
            </div>
          </div>

          <!-- ── Panel 3: Hard-Block (Pure Blacklist) ── -->
          <div class="cat-card block-card">
            <div class="cat-card-header">
              <Icon icon="lucide:ban" width="16" class="card-icon danger" />
              <span>{{ $t('hardBlockList') }}</span>
              <span class="entry-count danger-count">{{ hardBlockEntries.length }}</span>
            </div>
            <div class="cat-card-body list-body">
              <div class="block-info">
                <Icon icon="lucide:alert-triangle" width="14" class="block-info-icon" />
                <span>{{ $t('hardBlockDesc') }}</span>
              </div>

              <!-- Search + Add -->
              <div class="list-toolbar">
                <div class="search-wrap">
                  <Icon icon="lucide:search" width="15" class="search-icon" />
                  <input
                    v-model="blockSearch"
                    class="search-input"
                    :placeholder="$t('searchEntry')"
                  />
                </div>
                <el-button
                  type="danger"
                  size="small"
                  @click="openAddBlock"
                  :loading="saving"
                  class="add-entry-btn"
                >
                  <Icon icon="lucide:plus" width="14" style="margin-right:4px" />
                  {{ $t('addEntry') }}
                </el-button>
              </div>

              <!-- Block list -->
              <div class="entry-list">
                <transition-group name="entry" tag="div">
                  <div
                    v-for="entry in filteredBlockEntries"
                    :key="entry"
                    class="entry-item entry-item--danger"
                  >
                    <div class="entry-left">
                      <Icon
                        :icon="entry.includes('@') ? 'lucide:at-sign' : 'lucide:globe'"
                        width="14"
                        class="entry-type-icon"
                      />
                      <span class="entry-value">{{ entry }}</span>
                      <span class="entry-badge badge-block">
                        {{ $t('hardBlock') }}
                      </span>
                    </div>
                    <button class="entry-remove" @click="removeBlock(entry)" :title="$t('delete')">
                      <Icon icon="lucide:x" width="13" />
                    </button>
                  </div>
                </transition-group>

                <div v-if="filteredBlockEntries.length === 0" class="entry-empty">
                  <Icon icon="lucide:shield" width="36" class="entry-empty-icon" style="color: var(--success)" />
                  <p>{{ blockSearch ? $t('noMatchEntries') : $t('noBlockEntries') }}</p>
                  <span>{{ blockSearch ? $t('noMatchEntriesDesc') : $t('noBlockEntriesDesc') }}</span>
                </div>
              </div>

              <div class="list-footer">
                <el-button
                  type="danger"
                  :loading="saving"
                  @click="saveBlock"
                  :disabled="!blockDirty"
                >
                  <Icon icon="lucide:save" width="14" style="margin-right:4px" />
                  {{ $t('save') }}
                </el-button>
                <span v-if="blockDirty" class="unsaved-hint unsaved-danger">
                  <Icon icon="lucide:alert-circle" width="13" />
                  {{ $t('unsavedChanges') }}
                </span>
              </div>
            </div>
          </div>

          <!-- ── Panel 4: Subject/Content Blacklist ── -->
          <div class="cat-card content-card">
            <div class="cat-card-header">
              <Icon icon="lucide:file-warning" width="16" class="card-icon warning" />
              <span>{{ $t('contentFilter') }}</span>
            </div>
            <div class="cat-card-body">
              <p class="content-filter-desc">{{ $t('contentFilterDesc') }}</p>
              <div class="content-filter-group">
                <label class="filter-label">
                  <Icon icon="lucide:mail" width="13" />
                  {{ $t('blackSubjectDesc') }}
                </label>
                <el-input-tag
                  v-model="blackSubject"
                  :placeholder="$t('tagInputHint')"
                  tag-type="warning"
                  @change="contentDirty = true"
                />
              </div>
              <div class="content-filter-group" style="margin-top: 14px;">
                <label class="filter-label">
                  <Icon icon="lucide:file-text" width="13" />
                  {{ $t('blackContentDesc') }}
                </label>
                <el-input-tag
                  v-model="blackContent"
                  :placeholder="$t('tagInputHint')"
                  tag-type="warning"
                  @change="contentDirty = true"
                />
              </div>
              <div class="list-footer" style="margin-top: 16px;">
                <el-button
                  type="primary"
                  :loading="saving"
                  @click="saveContent"
                  :disabled="!contentDirty"
                >
                  <Icon icon="lucide:save" width="14" style="margin-right:4px" />
                  {{ $t('save') }}
                </el-button>
                <span v-if="contentDirty" class="unsaved-hint">
                  <Icon icon="lucide:alert-circle" width="13" />
                  {{ $t('unsavedChanges') }}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </el-scrollbar>

    <!-- ── Add Entry Dialog ── -->
    <el-dialog
      v-model="addEntryShow"
      :title="addEntryTarget === 'list' ? (listMode === 'blacklist' ? $t('addBlacklistEntry') : $t('addWhitelistEntry')) : $t('addHardBlockEntry')"
      width="440px"
      destroy-on-close
      @closed="resetAddForm"
    >
      <div class="add-entry-dialog">
        <p class="add-entry-hint">{{ $t('addEntryHint') }}</p>

        <div class="add-examples">
          <span class="example-chip"><Icon icon="lucide:globe" width="11" />google.com</span>
          <span class="example-chip"><Icon icon="lucide:globe" width="11" />mail.google.com</span>
          <span class="example-chip"><Icon icon="lucide:at-sign" width="11" />admin@google.com</span>
        </div>

        <el-input
          v-model="newEntry"
          :placeholder="$t('addEntryPlaceholder')"
          size="large"
          @keyup.enter="confirmAddEntry"
          autofocus
        />

        <div class="add-entry-validation" v-if="newEntry && !isValidEntry(newEntry)">
          <Icon icon="lucide:alert-circle" width="13" />
          {{ $t('invalidEntry') }}
        </div>

        <!-- Built-in suggestions -->
        <div class="builtin-section">
          <div class="builtin-title">{{ $t('builtinSuggestions') }}</div>
          <div class="builtin-grid">
            <button
              v-for="suggestion in builtinSuggestions"
              :key="suggestion.value"
              class="builtin-chip"
              :class="{ selected: pendingBulk.includes(suggestion.value) }"
              @click="toggleBulk(suggestion.value)"
            >
              <Icon :icon="suggestion.icon" width="12" />
              {{ suggestion.label }}
            </button>
          </div>
        </div>

        <div class="add-entry-selected" v-if="pendingBulk.length > 0">
          <span class="selected-label">{{ $t('selectedCount', { n: pendingBulk.length }) }}</span>
          <div class="selected-chips">
            <span v-for="e in pendingBulk" :key="e" class="selected-chip">{{ e }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="addEntryShow = false">{{ $t('cancel') }}</el-button>
        <el-button
          :type="addEntryTarget === 'block' ? 'danger' : 'primary'"
          @click="confirmAddEntry"
          :disabled="!newEntry && pendingBulk.length === 0"
        >
          {{ $t('addEntry') }}
        </el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { settingQuery, setBlackList, settingSet } from '@/request/setting.js'
import { isEmail, isDomain } from '@/utils/verify-utils.js'
import loading from '@/components/loading/index.vue'

const { t } = useI18n()

// ── State ──────────────────────────────────────────────────────────
const firstLoading = ref(true)
const saving = ref(false)

// Mode: 'blacklist' | 'whitelist'
const listMode = ref('blacklist')

// Main list entries (blackFrom field, repurposed based on mode)
const listEntries = ref([])
const listDirty = ref(false)
const entrySearch = ref('')

// Hard-block: always blocked — stored in a dedicated field
const hardBlockEntries = ref([])
const blockDirty = ref(false)
const blockSearch = ref('')

// Content filter
const blackSubject = ref([])
const blackContent = ref([])
const contentDirty = ref(false)

// Dialog
const addEntryShow = ref(false)
const addEntryTarget = ref('list') // 'list' | 'block'
const newEntry = ref('')
const pendingBulk = ref([])

// ── Built-in suggestions ───────────────────────────────────────────
const builtinSuggestions = [
  { value: 'mailer-daemon.com', label: 'Mailer Daemon', icon: 'lucide:bot' },
  { value: 'newsletters.google.com', label: 'Google News', icon: 'lucide:mail' },
  { value: 'facebookmail.com', label: 'Facebook Mail', icon: 'lucide:mail' },
  { value: 'bounce.amazonses.com', label: 'Amazon SES', icon: 'lucide:mail' },
  { value: 'e.aliexpress.com', label: 'AliExpress', icon: 'lucide:shopping-bag' },
  { value: 'mail.taobao.com', label: 'Taobao', icon: 'lucide:shopping-bag' },
  { value: 'jd.com', label: 'JD.com', icon: 'lucide:shopping-bag' },
  { value: 'pinduoduo.com', label: 'Pinduoduo', icon: 'lucide:shopping-bag' },
  { value: 'no-reply.accounts.google.com', label: 'Google No-Reply', icon: 'lucide:mail-x' },
  { value: 'donotreply.microsoft.com', label: 'Microsoft No-Reply', icon: 'lucide:mail-x' },
  { value: 'noreply@medium.com', label: 'Medium', icon: 'lucide:book-open' },
  { value: 'hello@producthunt.com', label: 'Product Hunt', icon: 'lucide:rocket' },
]

// ── Computed ───────────────────────────────────────────────────────
const filteredEntries = computed(() => {
  const q = entrySearch.value.trim().toLowerCase()
  if (!q) return listEntries.value
  return listEntries.value.filter(e => e.toLowerCase().includes(q))
})

const filteredBlockEntries = computed(() => {
  const q = blockSearch.value.trim().toLowerCase()
  if (!q) return hardBlockEntries.value
  return hardBlockEntries.value.filter(e => e.toLowerCase().includes(q))
})

// ── Load ───────────────────────────────────────────────────────────
onMounted(() => {
  loadSettings()
})

async function loadSettings() {
  firstLoading.value = true
  try {
    const data = await settingQuery()
    // listMode stored as a pseudo-field in blackFrom prefix
    // Convention: blackFrom starts with "__mode:whitelist," to indicate whitelist mode
    const raw = data.blackFrom || ''
    if (raw.startsWith('__mode:whitelist,')) {
      listMode.value = 'whitelist'
      const rest = raw.slice('__mode:whitelist,'.length)
      listEntries.value = rest ? rest.split(',').filter(Boolean) : []
    } else if (raw.startsWith('__mode:blacklist,')) {
      listMode.value = 'blacklist'
      const rest = raw.slice('__mode:blacklist,'.length)
      listEntries.value = rest ? rest.split(',').filter(Boolean) : []
    } else {
      // Legacy or no mode prefix — treat as blacklist
      listMode.value = 'blacklist'
      listEntries.value = raw ? raw.split(',').filter(Boolean) : []
    }

    // Hard block stored in blackContent with prefix "__hardblock,"
    const rawContent = data.blackContent || ''
    if (rawContent.startsWith('__hardblock,')) {
      const rest = rawContent.slice('__hardblock,'.length)
      hardBlockEntries.value = rest ? rest.split(',').filter(Boolean) : []
      blackContent.value = []
    } else {
      // Old legacy: treat all as regular content
      hardBlockEntries.value = []
      blackContent.value = rawContent ? rawContent.split(',').filter(Boolean) : []
    }

    blackSubject.value = data.blackSubject ? data.blackSubject.split(',').filter(Boolean) : []
  } catch (e) {
    console.error('Category settings load failed:', e)
  } finally {
    firstLoading.value = false
  }
}

// ── Mode switch ────────────────────────────────────────────────────
function setMode(mode) {
  if (listMode.value === mode) return
  listMode.value = mode
  listDirty.value = true
}

// ── Entry management ───────────────────────────────────────────────
function isValidEntry(val) {
  const v = val.trim()
  return isEmail(v) || isDomain(v)
}

function removeEntry(entry) {
  listEntries.value = listEntries.value.filter(e => e !== entry)
  listDirty.value = true
}

function removeBlock(entry) {
  hardBlockEntries.value = hardBlockEntries.value.filter(e => e !== entry)
  blockDirty.value = true
}

function openAddEntry() {
  addEntryTarget.value = 'list'
  addEntryShow.value = true
}

function openAddBlock() {
  addEntryTarget.value = 'block'
  addEntryShow.value = true
}

function resetAddForm() {
  newEntry.value = ''
  pendingBulk.value = []
}

function toggleBulk(val) {
  const idx = pendingBulk.value.indexOf(val)
  if (idx >= 0) {
    pendingBulk.value.splice(idx, 1)
  } else {
    pendingBulk.value.push(val)
  }
}

function confirmAddEntry() {
  const toAdd = [...pendingBulk.value]
  const manual = newEntry.value.trim()
  if (manual) {
    const parts = manual.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean)
    parts.forEach(p => {
      if (isValidEntry(p)) toAdd.push(p)
    })
  }
  if (toAdd.length === 0) return

  if (addEntryTarget.value === 'list') {
    toAdd.forEach(e => {
      if (!listEntries.value.includes(e)) listEntries.value.push(e)
    })
    listDirty.value = true
  } else {
    toAdd.forEach(e => {
      if (!hardBlockEntries.value.includes(e)) hardBlockEntries.value.push(e)
    })
    blockDirty.value = true
  }
  addEntryShow.value = false
}

// ── Save ───────────────────────────────────────────────────────────
async function saveList() {
  saving.value = true
  try {
    const prefix = `__mode:${listMode.value},`
    const val = prefix + listEntries.value.join(',')
    await setBlackList({ blackFrom: val })
    listDirty.value = false
    ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
  } catch (e) {
    ElMessage({ message: t('saveFailMsg') || 'Save failed', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

async function saveBlock() {
  saving.value = true
  try {
    const prefix = '__hardblock,'
    const val = prefix + hardBlockEntries.value.join(',')
    await setBlackList({ blackContent: val })
    blockDirty.value = false
    ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
  } catch (e) {
    ElMessage({ message: t('saveFailMsg') || 'Save failed', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

async function saveContent() {
  saving.value = true
  try {
    await setBlackList({
      blackSubject: blackSubject.value.join(','),
    })
    contentDirty.value = false
    ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
  } catch (e) {
    ElMessage({ message: t('saveFailMsg') || 'Save failed', type: 'error', plain: true })
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
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.lo-show { opacity: 1; transition: opacity 200ms ease 200ms; }
.lo-hide { opacity: 0; pointer-events: none; transition: opacity 200ms; }

.cat-scroll {
  width: 100%;
  height: 100%;
}

.cat-body {
  padding: 24px 20px 40px;
  max-width: 1100px;
  margin: 0 auto;
}

// ── Header ──────────────────────────────────────────────────────────
.cat-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 16px;
  flex-wrap: wrap;
}
.cat-header-left { flex: 1; min-width: 200px; }
.cat-title {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.4px;
}
.cat-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.cat-header-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
}
.mode-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 20px;
  letter-spacing: 0.2px;
  &.badge-black {
    background: rgba(224, 95, 95, 0.12);
    color: var(--danger);
    border: 1px solid rgba(224, 95, 95, 0.22);
  }
  &.badge-white {
    background: rgba(76, 175, 125, 0.12);
    color: var(--success);
    border: 1px solid rgba(76, 175, 125, 0.22);
  }
}

// ── Info Banner ──────────────────────────────────────────────────────
.info-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  background: var(--accent-muted);
  border: 1px solid var(--border-mid);
  border-radius: 10px;
  margin-bottom: 20px;
  .info-icon { color: var(--accent-primary); margin-top: 1px; flex-shrink: 0; }
  .info-text {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.5;
    strong { color: var(--text-primary); margin-right: 6px; }
  }
}

// ── Grid Layout ──────────────────────────────────────────────────────
.cat-grid {
  display: grid;
  grid-template-columns: 360px 1fr;
  grid-template-rows: auto auto;
  gap: 16px;
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}
.mode-card { grid-column: 1; grid-row: 1 / 3; @media (max-width: 900px) { grid-column: 1; grid-row: auto; } }
.list-card { grid-column: 2; grid-row: 1; @media (max-width: 900px) { grid-column: 1; grid-row: auto; } }
.block-card { grid-column: 2; grid-row: 2; @media (max-width: 900px) { grid-column: 1; grid-row: auto; } }
.content-card { grid-column: 1 / 3; @media (max-width: 900px) { grid-column: 1; } }

// ── Card ──────────────────────────────────────────────────────────────
.cat-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
  transition: box-shadow 250ms;
  &:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
}
.cat-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  .card-icon { color: var(--accent-primary); flex-shrink: 0; }
  .card-icon.danger { color: var(--danger); }
  .card-icon.warning { color: #d98a16; }
}
.entry-count {
  margin-left: auto;
  background: var(--accent-muted);
  color: var(--accent-primary);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
  &.danger-count { background: rgba(224,95,95,0.1); color: var(--danger); }
}
.cat-card-body { padding: 16px; }

// ── Mode Toggle ───────────────────────────────────────────────────────
.mode-toggle-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mode-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-elevated);
  border: 1.5px solid var(--border-subtle);
  border-radius: 10px;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition: all 200ms;
  position: relative;
  &:hover { border-color: var(--border-mid); background: var(--bg-hover); }
  &.active {
    border-color: var(--accent-primary);
    background: var(--accent-muted);
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
}
.mode-btn-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  &.black-icon { background: rgba(224,95,95,0.12); color: var(--danger); }
  &.white-icon { background: rgba(76,175,125,0.12); color: var(--success); }
}
.mode-btn-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mode-btn-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}
.mode-btn-desc {
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.4;
}
.mode-check {
  color: var(--accent-primary);
  flex-shrink: 0;
}

// ── Impact Section ────────────────────────────────────────────────────
.impact-section { margin-top: 4px; }
.impact-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}
.impact-list { display: flex; flex-direction: column; gap: 8px; }
.impact-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.4;
}
.impact-icon {
  margin-top: 1px;
  flex-shrink: 0;
  &.danger { color: var(--danger); }
  &.accent { color: var(--accent-primary); }
  &.warning { color: #d98a16; }
}

// ── List Body ─────────────────────────────────────────────────────────
.list-body { display: flex; flex-direction: column; gap: 12px; }

.list-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}
.search-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 0 10px;
  transition: border-color 200ms;
  &:focus-within { border-color: var(--accent-primary); }
  .search-icon { color: var(--text-muted); flex-shrink: 0; }
}
.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: var(--text-primary);
  height: 32px;
  font-family: inherit;
  &::placeholder { color: var(--text-muted); }
}
.add-entry-btn { flex-shrink: 0; }

.entry-list {
  min-height: 120px;
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-elevated);
  padding: 4px;
}

.entry-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  transition: background 150ms;
  &:hover { background: var(--bg-hover); }
  &.entry-item--danger:hover { background: rgba(224,95,95,0.06); }
}
.entry-left {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  flex: 1;
  .entry-type-icon { color: var(--text-muted); flex-shrink: 0; }
}
.entry-value {
  font-size: 13px;
  color: var(--text-primary);
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12.5px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
}
.entry-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1.5px 6px;
  border-radius: 4px;
  letter-spacing: 0.2px;
  &.badge-domain { background: rgba(91,110,245,0.1); color: var(--accent-primary); }
  &.badge-email  { background: rgba(76,175,125,0.1); color: var(--success); }
  &.badge-block  { background: rgba(224,95,95,0.1); color: var(--danger); }
}
.entry-remove {
  width: 24px;
  height: 24px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 150ms;
  &:hover { background: rgba(224,95,95,0.12); color: var(--danger); }
}

.entry-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 16px;
  text-align: center;
  .entry-empty-icon { color: var(--text-muted); margin-bottom: 8px; }
  p { margin: 0 0 4px; font-size: 13px; font-weight: 500; color: var(--text-secondary); }
  span { font-size: 12px; color: var(--text-muted); }
}

.list-footer {
  display: flex;
  align-items: center;
  gap: 10px;
}
.save-list-btn { flex-shrink: 0; }
.unsaved-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--accent-primary);
  &.unsaved-danger { color: var(--danger); }
}

// ── Block Info ─────────────────────────────────────────────────────────
.block-info {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 10px 12px;
  background: rgba(224,95,95,0.07);
  border: 1px solid rgba(224,95,95,0.18);
  border-radius: 8px;
  font-size: 12.5px;
  color: #c44;
  line-height: 1.4;
  .block-info-icon { flex-shrink: 0; margin-top: 1px; color: var(--danger); }
}

// ── Content filter ─────────────────────────────────────────────────────
.content-filter-desc {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.content-filter-group { display: flex; flex-direction: column; gap: 6px; }
.filter-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
}

// ── Add Entry Dialog ────────────────────────────────────────────────────
.add-entry-dialog { display: flex; flex-direction: column; gap: 12px; }
.add-entry-hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}
.add-examples {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.example-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-family: 'SF Mono', monospace;
}
.add-entry-validation {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--danger);
}
.builtin-section { margin-top: 4px; }
.builtin-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}
.builtin-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.builtin-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 7px;
  border: 1.5px solid var(--border-subtle);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 150ms;
  font-family: inherit;
  &:hover { border-color: var(--accent-primary); color: var(--accent-primary); background: var(--accent-muted); }
  &.selected { border-color: var(--accent-primary); color: var(--accent-primary); background: var(--accent-muted); }
}
.add-entry-selected {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--accent-muted);
  border-radius: 8px;
  border: 1px solid var(--border-mid);
}
.selected-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent-primary);
}
.selected-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.selected-chip {
  font-size: 11.5px;
  padding: 2px 8px;
  border-radius: 5px;
  background: var(--bg-surface);
  border: 1px solid var(--border-mid);
  color: var(--text-primary);
  font-family: 'SF Mono', monospace;
}

// ── Transition ──────────────────────────────────────────────────────────
.entry-enter-active, .entry-leave-active { transition: all 200ms; }
.entry-enter-from { opacity: 0; transform: translateY(-6px); }
.entry-leave-to { opacity: 0; transform: translateX(10px); }
</style>
