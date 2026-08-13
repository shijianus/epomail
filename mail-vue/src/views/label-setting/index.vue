<template>
  <div class="page-container">
    <div class="header-area">
      <div class="header-text">
        <h1 class="page-title">{{ $t('labelSetting') || 'Label Management' }}</h1>
        <p class="page-desc">{{ $t('labelSettingDesc') || 'Manage your labels and classification rules' }}</p>
      </div>
      <el-button type="primary" size="large" @click="startAdd" class="primary-btn">
        <Icon icon="lucide:plus" width="18" /> {{ $t('newLabel') || 'New Label' }}
      </el-button>
    </div>

    <div class="labels-container" v-if="uiStore.defaultLabels.length > 0 || uiStore.customLabels.length > 0">
      <!-- Default Template Labels -->
      <div class="section" v-if="uiStore.defaultLabels.length > 0">
        <h2 class="section-title">{{ $t('defaultTemplates') || 'Default Templates' }}</h2>
        <div class="modern-list">
          <div class="list-row tech-row" v-for="(label, index) in uiStore.defaultLabels" :key="'def-'+index">
            <div class="label-pill-cell">
              <div class="label-pill" :style="{ '--pill-color': label.color }">
                <Icon :icon="label.icon" width="18" />
                <span>{{ label.name }}</span>
              </div>
            </div>
            
            <div class="stats-group">
              <div class="stat-item">
                <span class="stat-val">{{ label.stats?.total || 0 }}</span>
                <span class="stat-lbl">{{ $t('statTotal') || 'Total' }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-val">{{ label.stats?.current || 0 }}</span>
                <span class="stat-lbl">{{ $t('statCurrent') || 'Current' }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-val">{{ label.stats?.unread || 0 }}</span>
                <span class="stat-lbl">{{ $t('statUnread') || 'Unread' }}</span>
              </div>
            </div>

            <div class="visibility-cell">
               <el-switch v-model="label.listVis" size="small" :active-text="$t('show') || 'Show'" :inactive-text="$t('hide') || 'Hide'" inline-prompt />
            </div>
            <div class="actions-cell">
              <el-button link class="action-btn edit-btn" @click="startEditDefault(index)" :title="$t('edit') || 'Edit'">
                <Icon icon="lucide:pencil" width="16" />
              </el-button>
              <el-button link class="action-btn delete-btn" @click="confirmDeleteDefault(index)" :title="$t('delete') || 'Delete'">
                <Icon icon="lucide:trash-2" width="16" />
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- Custom Labels -->
      <div class="section" style="margin-top: 32px" v-if="uiStore.customLabels.length > 0">
        <h2 class="section-title">{{ $t('customLabels') || 'Custom Labels' }}</h2>
        <div class="modern-list">
          <div class="list-row tech-row" v-for="(label, index) in uiStore.customLabels" :key="index">
            <div class="drag-handle" :title="$t('dragToReorder') || 'Drag to reorder'" @click="moveUp(index)">
              <Icon icon="lucide:grip-vertical" width="18" />
            </div>
            <div class="label-pill-cell" style="padding-left: 8px;">
              <div class="label-pill" :style="{ '--pill-color': label.color || 'var(--accent-primary)' }">
                <Icon :icon="label.icon || 'ic:baseline-label'" width="18" />
                <span>{{ label.name || label }}</span>
              </div>
            </div>
            
            <div class="stats-group">
              <div class="stat-item">
                <span class="stat-val">{{ label.stats?.total || 0 }}</span>
                <span class="stat-lbl">{{ $t('statTotal') || 'Total' }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-val">{{ label.stats?.current || 0 }}</span>
                <span class="stat-lbl">{{ $t('statCurrent') || 'Current' }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-val">{{ label.stats?.unread || 0 }}</span>
                <span class="stat-lbl">{{ $t('statUnread') || 'Unread' }}</span>
              </div>
            </div>

            <div class="visibility-cell">
               <el-switch v-model="label.listVis" size="small" :active-text="$t('show') || 'Show'" :inactive-text="$t('hide') || 'Hide'" inline-prompt />
            </div>
            <div class="actions-cell">
              <el-button link class="action-btn edit-btn" @click="startEdit(index)" :title="$t('edit') || 'Edit'">
                <Icon icon="lucide:pencil" width="16" />
              </el-button>
              <el-button link class="action-btn delete-btn" @click="confirmDelete(index)" :title="$t('delete') || 'Delete'">
                <Icon icon="lucide:trash-2" width="16" />
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <Icon icon="lucide:tags" width="48" class="empty-icon" />
      <h3>{{ $t('noLabels') || 'No Labels' }}</h3>
      <p>{{ $t('noLabelsDesc') || 'Create your first label to keep your inbox organized.' }}</p>
    </div>

    <!-- Drawer for Add/Edit -->
    <el-drawer v-model="isEditorOpen" :title="editIndex === -1 ? 'Create New Label' : 'Edit Label'" size="400px" destroy-on-close class="label-drawer">
      <div class="editor-form">
        <div class="form-group">
          <label>{{ $t('name') || 'Name' }}</label>
          <el-input v-model="form.name" size="large" :placeholder="$t('labelNamePlaceholder') || 'Enter label name'" />
        </div>
        <div class="form-group" v-if="!isEditingDefault">
          <label>Parent Label</label>
          <el-select v-model="form.parent" size="large" placeholder="None" clearable style="width: 100%">
             <el-option v-for="(l, i) in uiStore.customLabels" :key="i" :label="l.name" :value="l.name" :disabled="editIndex === i" />
          </el-select>
        </div>
        <div class="form-group">
          <label>Icon</label>
          <div class="swatches" style="margin-bottom: 8px;">
             <div class="swatch" 
                  v-for="ico in presetIcons" :key="ico"
                  :class="{ active: form.icon === ico }"
                  @click="form.icon = ico"
                  style="background-color: var(--bg-hover)">
                  <Icon :icon="ico" width="18" :color="form.icon === ico ? form.color : 'var(--text-secondary)'" />
             </div>
          </div>
          <el-input v-model="form.icon" size="small" placeholder="Or type custom Iconify icon name (e.g. lucide:star)" />
        </div>
        <div class="form-group">
          <label>{{ $t('color') || 'Color' }}</label>
          <div class="swatches">
            <div class="swatch" 
                 v-for="color in presetColors" :key="color"
                 :style="{ backgroundColor: color }"
                 :class="{ active: form.color === color }"
                 @click="form.color = color">
                 <Icon v-if="form.color === color" icon="lucide:check" width="16" color="#fff" />
            </div>
            <div class="swatch custom-color-picker">
              <el-color-picker v-model="form.color" size="small" />
            </div>
          </div>
        </div>
        
        <!-- Rules Section -->
        <div class="form-group" style="margin-top: 8px;">
          <label>{{ $t('classificationRules') || 'Rules' }}</label>
          <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 8px 0; line-height: 1.4;">
            {{ $t('rulesDesc') || 'Emails matching these rules will automatically receive this label.' }}
          </p>
          
          <div class="rule-builder">
            <el-radio-group v-model="newRuleLogic" size="small" style="margin-bottom: 8px; width: 100%;">
              <el-radio-button value="include" style="flex: 1; text-align: center;">{{ $t('ruleInclude') || 'Include' }}</el-radio-button>
              <el-radio-button value="exclude" style="flex: 1; text-align: center;">{{ $t('ruleExclude') || 'Except' }}</el-radio-button>
              <el-radio-button value="all" style="flex: 1; text-align: center;">{{ $t('ruleAll') || 'All' }}</el-radio-button>
            </el-radio-group>
            
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <el-select v-if="newRuleLogic !== 'all'" v-model="newRuleType" size="small" style="width: 140px;" :placeholder="$t('ruleType') || 'Type'">
                <el-option :label="$t('ruleDomain') || 'Domain / Suffix'" value="domain" />
                <el-option :label="$t('ruleSender') || 'Sender Address'" value="sender" />
              </el-select>
              <el-select v-else v-model="newRuleTypeAll" size="small" style="width: 140px;" :placeholder="$t('ruleType') || 'Type'">
                <el-option :label="$t('ruleBlacklist') || 'Blacklist'" value="blacklist" />
                <el-option :label="$t('ruleWhitelist') || 'Whitelist'" value="whitelist" />
                <el-option :label="$t('ruleCorporate') || 'Corporate'" value="corporate" />
              </el-select>
              
              <el-input v-model="newRuleValue" size="small" :disabled="newRuleLogic === 'all'" :placeholder="newRuleLogic === 'all' ? ($t('systemControlled') || 'System Managed') : (newRuleType === 'domain' ? '@gmail.com' : 'admin@outlook.com')" @keyup.enter="addRule" style="flex: 1;" />
              <el-button type="primary" size="small" @click="addRule"><Icon icon="lucide:plus" width="14" /></el-button>
            </div>
          </div>
          
          <div v-if="form.rules && form.rules.length > 0" class="rules-list" style="display: flex; flex-direction: column; gap: 4px; max-height: 150px; overflow-y: auto; padding-right: 4px;">
            <div v-for="(rule, rIdx) in form.rules" :key="rIdx" class="rule-tag">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="rule-badge" :class="'badge-' + rule.logic">
                  {{ getRuleLogicText(rule.logic) }} {{ getRuleTypeText(rule.type) }}
                </span>
                <span v-if="rule.logic !== 'all'">{{ rule.value }}</span>
              </div>
              <el-button link size="small" @click="removeRule(rIdx)" class="rule-del"><Icon icon="lucide:x" width="14" /></el-button>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <el-button @click="isEditorOpen = false">Cancel</el-button>
          <el-button type="primary" @click="saveLabel">Save Label</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- Delete Confirmation Modal -->
    <el-dialog v-model="isDeleteOpen" :title="$t('deleteLabel') || 'Delete Label'" width="450px" custom-class="delete-modal">
      <div class="delete-warning">
        <Icon icon="lucide:alert-triangle" width="32" class="warning-icon" />
        <div class="warning-text">
          <h3 style="margin:0; font-size: 16px;">{{ $t('deleteConfirmMsg', { name: deleteCandidate?.name }) || `Delete "${deleteCandidate?.name}"?` }}</h3>
          <p style="margin:8px 0 0; color: var(--text-secondary); font-size: 13px;">{{ $t('deleteLabelDesc') || 'Please select how to handle the associated emails.' }}</p>
        </div>
      </div>
      <el-radio-group v-model="deleteMode" class="delete-radio-group">
        <el-radio :value="'tagOnly'" class="radio-item">
          <div><strong>{{ $t('onlyRemoveTag') || 'Only remove the label tag' }}</strong></div>
          <div class="radio-desc">{{ $t('onlyRemoveTagDesc') || 'Emails will remain in their original folders. The label association will simply be cleared.' }}</div>
        </el-radio>
      </el-radio-group>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <el-button @click="isDeleteOpen = false">Cancel</el-button>
          <el-button type="danger" @click="executeDelete">Delete</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useUiStore } from '@/store/ui.js'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const uiStore = useUiStore()

const presetColors = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', 
  '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef',
  '#64748b', '#1e293b'
]

const presetIcons = [
  'ic:baseline-label', 'ic:outline-work-outline', 'ic:outline-people-alt', 
  'ic:outline-shopping-cart', 'ic:outline-favorite-border', 'ic:outline-bookmark-border',
  'ic:outline-info', 'ic:outline-lightbulb', 'ic:outline-flag', 'ic:outline-rss-feed'
]

// Normalization
const normalizeLabels = () => {
  if (!uiStore.customLabels) uiStore.customLabels = []
  uiStore.customLabels = uiStore.customLabels.map(l => {
    if (typeof l === 'string') return { name: l, icon: 'ic:baseline-label', color: '#3b82f6', sidebarVis: 'show', listVis: true }
    if (!l.sidebarVis) l.sidebarVis = 'show'
    if (l.listVis === undefined) l.listVis = true
    return l
  })
}
normalizeLabels()

const isEditorOpen = ref(false)
const editIndex = ref(-1)
const isEditingDefault = ref(false)
const form = ref({ name: '', icon: 'ic:baseline-label', color: '#3b82f6', parent: '', sidebarVis: 'show', listVis: true, rules: [] })

const newRuleLogic = ref('include')
const newRuleType = ref('domain')
const newRuleTypeAll = ref('blacklist')
const newRuleValue = ref('')

const getRuleLogicText = (logic) => {
  if (logic === 'include') return t('ruleInclude') || 'Include'
  if (logic === 'exclude') return t('ruleExclude') || 'Except'
  if (logic === 'all') return t('ruleAll') || 'All'
  return logic
}

const getRuleTypeText = (type) => {
  if (type === 'domain') return t('ruleDomainShort') || 'Domain'
  if (type === 'sender') return t('ruleSenderShort') || 'Sender'
  if (type === 'blacklist') return t('ruleBlacklist') || 'Blacklist'
  if (type === 'whitelist') return t('ruleWhitelist') || 'Whitelist'
  if (type === 'corporate') return t('ruleCorporate') || 'Corporate'
  return type
}

const startAdd = () => {
  editIndex.value = -1
  isEditingDefault.value = false
  form.value = { 
    name: '', icon: 'ic:baseline-label', color: presetColors[5], parent: '', 
    sidebarVis: 'show', listVis: true, rules: [], 
    stats: { total: 0, current: 0, unread: 0 } 
  }
  newRuleValue.value = ''
  isEditorOpen.value = true
}

const startEdit = (index) => {
  editIndex.value = index
  isEditingDefault.value = false
  form.value = { ...uiStore.customLabels[index] }
  if (!form.value.rules) form.value.rules = []
  newRuleValue.value = ''
  isEditorOpen.value = true
}

const startEditDefault = (index) => {
  editIndex.value = index
  isEditingDefault.value = true
  form.value = { ...uiStore.defaultLabels[index] }
  if (!form.value.rules) form.value.rules = []
  newRuleValue.value = ''
  isEditorOpen.value = true
}

const addRule = () => {
  let ruleType = newRuleLogic.value === 'all' ? newRuleTypeAll.value : newRuleType.value
  let ruleVal = newRuleLogic.value === 'all' ? '' : newRuleValue.value.trim().toLowerCase()
  
  if (newRuleLogic.value === 'all' || ruleVal) {
    if (!form.value.rules) form.value.rules = []
    const exists = form.value.rules.some(r => r.logic === newRuleLogic.value && r.type === ruleType && r.value === ruleVal)
    if (!exists) {
      form.value.rules.push({ logic: newRuleLogic.value, type: ruleType, value: ruleVal })
    }
    newRuleValue.value = ''
  }
}

const removeRule = (index) => {
  if (form.value.rules) {
    form.value.rules.splice(index, 1)
  }
}

const saveLabel = () => {
  if (!form.value.name.trim()) {
    ElMessage.warning('Label name is required')
    return
  }
  
  if (isEditingDefault.value) {
    uiStore.defaultLabels[editIndex.value] = { ...form.value }
  } else {
    if (editIndex.value > -1) {
      uiStore.customLabels[editIndex.value] = { ...form.value }
    } else {
      uiStore.customLabels.push({ ...form.value })
    }
  }
  isEditorOpen.value = false
}

const isDeleteOpen = ref(false)
const deleteCandidate = ref(null)
const deleteIndex = ref(-1)
const deleteMode = ref('tagOnly')
const isDeletingDefault = ref(false)

const confirmDelete = (index) => {
  deleteIndex.value = index
  deleteCandidate.value = uiStore.customLabels[index]
  deleteMode.value = 'tagOnly'
  isDeletingDefault.value = false
  isDeleteOpen.value = true
}

const confirmDeleteDefault = (index) => {
  deleteIndex.value = index
  deleteCandidate.value = uiStore.defaultLabels[index]
  deleteMode.value = 'tagOnly'
  isDeletingDefault.value = true
  isDeleteOpen.value = true
}

const executeDelete = () => {
  if (deleteIndex.value > -1) {
    if (isDeletingDefault.value) {
      uiStore.defaultLabels.splice(deleteIndex.value, 1)
    } else {
      uiStore.customLabels.splice(deleteIndex.value, 1)
    }
  }
  isDeleteOpen.value = false
  ElMessage.success('Label tag removed successfully')
}

const moveUp = (index) => {
  if (index > 0) {
    const temp = uiStore.customLabels[index]
    uiStore.customLabels[index] = uiStore.customLabels[index - 1]
    uiStore.customLabels[index - 1] = temp
  }
}
</script>

<style scoped>
.page-container {
  padding: 0;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
}

.header-area {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
}

.header-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.5px;
}

.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.primary-btn {
  border-radius: 8px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.modern-list {
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
}

.tech-row {
  display: flex;
  align-items: center;
  padding: 16px 12px;
  border: 1px solid transparent;
  border-bottom: 1px solid var(--border-subtle);
  transition: all 0.2s ease;
  border-radius: 8px;
  margin-bottom: 4px;
}

.modern-list:hover .tech-row:not(:hover) {
  opacity: 0.6;
}

.tech-row:hover {
  background-color: var(--bg-hover);
  border-color: var(--border-mid);
  transform: translateX(4px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.drag-handle {
  width: 32px;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--text-muted);
  cursor: grab;
  opacity: 0;
  transition: opacity 0.2s;
}
.drag-handle.disabled {
  cursor: default;
}
.tech-row:hover .drag-handle:not(.disabled) {
  opacity: 1;
}

.label-pill-cell {
  flex: 1;
  min-width: 200px;
}

.label-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-radius: 100px;
  background-color: color-mix(in srgb, var(--pill-color) 12%, transparent);
  color: var(--pill-color);
  font-size: 13.5px;
  font-weight: 600;
}

.visibility-cell {
  width: 140px;
  display: flex;
  justify-content: center;
}

.stats-cell {
  width: 100px;
  text-align: right;
  font-size: 13px;
  color: var(--text-secondary);
}

.actions-cell {
  width: 80px;
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding-right: 8px;
}

.action-btn {
  opacity: 1;
  color: var(--text-muted);
  transition: opacity 0.2s, color 0.2s;
}

.tech-row:hover .action-btn {
  color: var(--text-secondary);
}

.action-btn:hover {
  color: var(--accent-primary) !important;
}

.action-btn.delete-btn:hover {
  color: var(--danger);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 20px;
  text-align: center;
  border: 1px dashed var(--border-subtle);
  border-radius: 12px;
  background: var(--bg-base);
}

.empty-icon {
  color: var(--text-muted);
  margin-bottom: 16px;
}

.empty-state h3 {
  margin: 0 0 8px;
  font-size: 16px;
  color: var(--text-primary);
}

.empty-state p {
  margin: 0 0 24px;
  font-size: 14px;
  color: var(--text-secondary);
}

/* Form Styles */
.editor-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 0 8px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.swatch {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, box-shadow 0.2s;
}

.swatch:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.swatch.active {
  box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--accent-primary);
}

.custom-color-picker :deep(.el-color-picker__trigger) {
  border: none;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 50%;
  overflow: hidden;
}

/* Modal Styles */
.delete-warning {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  padding: 16px;
  background-color: color-mix(in srgb, var(--danger) 10%, transparent);
  border-radius: 8px;
}

.warning-icon {
  color: var(--danger);
  flex-shrink: 0;
}

.delete-radio-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.radio-item {
  display: flex;
  align-items: flex-start;
  height: auto;
  white-space: normal;
  padding: 12px;
  border: 1px solid var(--border-mid);
  border-radius: 8px;
  margin-right: 0;
}

.radio-item.is-checked {
  border-color: var(--accent-primary);
  background-color: color-mix(in srgb, var(--accent-primary) 5%, transparent);
}

.radio-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

/* Stats Group */
.stats-group {
  flex: 1;
  display: flex;
  justify-content: center;
  gap: 32px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.stat-val {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
}

.stat-lbl {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 4px;
}

/* Advanced Rules UI */
.rule-builder :deep(.el-radio-group) {
  display: flex;
}
.rule-builder :deep(.el-radio-button__inner) {
  width: 100%;
}

.rule-tag {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--bg-hover);
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
  font-size: 12.5px;
  color: var(--text-primary);
  transition: all 0.2s;
}

.rule-tag:hover {
  border-color: var(--border-mid);
}

.rule-badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.badge-include {
  background: color-mix(in srgb, var(--success) 15%, transparent);
  color: var(--success);
}
.badge-exclude {
  background: color-mix(in srgb, var(--danger) 15%, transparent);
  color: var(--danger);
}
.badge-all {
  background: color-mix(in srgb, var(--warning) 15%, transparent);
  color: var(--warning);
}

.rule-del {
  color: var(--text-muted);
  transition: color 0.2s;
}
.rule-tag:hover .rule-del {
  color: var(--danger);
}
</style>
