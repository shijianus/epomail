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
          
          <el-button type="primary" plain size="small" @click="openRuleBuilder" style="width: 100%; justify-content: center; margin-bottom: 8px;">
            <Icon icon="lucide:plus" width="16" style="margin-right: 4px;" /> 添加分类规则 (Add Rule)
          </el-button>
          
          <div v-if="form.rules && form.rules.length > 0" class="rules-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto;">
            <div v-for="(rule, rIdx) in form.rules" :key="rIdx" class="rule-card">
              <div class="rule-card-content">
                <div class="rule-cond">
                  <span class="cond-lbl">If:</span>
                  <span class="cond-val">{{ getConditionText(rule.condition) }}</span>
                </div>
                <div class="rule-exc" v-if="rule.exception">
                  <span class="exc-lbl">Except if:</span>
                  <span class="exc-val">{{ getConditionText(rule.exception) }}</span>
                </div>
              </div>
              <el-button link size="small" @click="removeRule(rIdx)" class="rule-del"><Icon icon="lucide:trash-2" width="14" /></el-button>
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

    <!-- Rule Builder Modal -->
    <el-dialog v-model="isRuleBuilderOpen" :title="$t('classificationRules')" width="600px" destroy-on-close>
      <div class="rule-builder-modal">
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; margin-top: -12px;">
          {{ $t('ruleFutureNotice') }}
        </div>
        <!-- Step 1: Condition -->
        <div class="rb-step">
          <h4 class="rb-step-title"><span class="step-num">1</span> {{ $t('ruleInclude') }} (Condition)</h4>
          <div class="rb-form-row">
            <div v-if="['in_whitelist', 'is_corporate', 'in_blacklist'].includes(rbCondition.type)" class="system-rule-tag" style="width: 250px; display: flex; align-items: center;">
              <el-tag type="info" size="large" style="width: 100%;">
                <Icon icon="ic:outline-settings" style="margin-right: 4px;" />
                {{ $t('systemSetting') }}
              </el-tag>
            </div>
            <el-select v-else v-model="rbCondition.type" size="large" style="width: 250px;">
              <el-option-group :label="$t('ruleOptPeople')">
                <el-option :label="$t('condFrom')" value="from" />
                <el-option :label="$t('condTo')" value="to" />
                <el-option :label="$t('condEmailReceivedForOthers')" value="email_received_for_others" />
              </el-option-group>
              <el-option-group :label="$t('ruleOptSubject')">
                <el-option :label="$t('condSubjectInclude')" value="subject_include" />
                <el-option :label="$t('condSubjectOrBodyInclude')" value="subject_or_body_include" />
              </el-option-group>
              <el-option-group :label="$t('ruleOptKeywords')">
                <el-option :label="$t('condMessageBodyIncludes')" value="message_body_includes" />
                <el-option :label="$t('condSenderAddressIncludes')" value="sender_address_includes" />
                <el-option :label="$t('condRecipientAddressIncludes')" value="recipient_address_includes" />
                <el-option :label="$t('condMessageHeaderIncludes')" value="message_header_includes" />
              </el-option-group>
              <el-option-group :label="$t('ruleOptMessageSize')">
                <el-option :label="$t('condAtLeast')" value="at_least" />
                <el-option :label="$t('condAtMost')" value="at_most" />
              </el-option-group>
              <el-option-group :label="$t('ruleOptReceived')">
                <el-option :label="$t('condBefore')" value="before" />
                <el-option :label="$t('condAfter')" value="after" />
              </el-option-group>
              <el-option-group :label="$t('ruleOptAllMessages')">
                <el-option :label="$t('condApplyToAll')" value="all_messages" />
                <el-option :label="$t('condNoneOnlyException')" value="none" />
              </el-option-group>
            </el-select>
            
            <el-date-picker
              v-if="['before', 'after'].includes(rbCondition.type)"
              v-model="rbCondition.value"
              type="date"
              size="large"
              style="flex: 1;"
              value-format="YYYY-MM-DD"
            />
            <el-input-number
              v-else-if="['at_least', 'at_most'].includes(rbCondition.type)"
              v-model="rbCondition.value"
              size="large"
              style="flex: 1;"
              :min="0"
            />
            <el-autocomplete 
              v-else-if="!['all_messages', 'none', 'in_whitelist', 'is_corporate', 'in_blacklist'].includes(rbCondition.type)" 
              v-model="rbCondition.value" 
              :fetch-suggestions="queryConditionSuggestions"
              size="large" 
              placeholder="Value" 
              style="flex: 1;" 
            />
          </div>
        </div>

        <el-divider border-style="dashed" />

        <!-- Step 2: Exception (Optional) -->
        <div class="rb-step">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h4 class="rb-step-title" style="margin: 0;"><span class="step-num">2</span> {{ $t('ruleExclude') }} (Exception)</h4>
            <el-switch v-model="rbHasException" size="small" :disabled="rbCondition.type === 'none'" />
          </div>
          
          <div v-if="rbHasException" class="rb-form-row">
            <div v-if="['in_whitelist', 'is_corporate', 'in_blacklist'].includes(rbException.type)" class="system-rule-tag" style="width: 250px; display: flex; align-items: center;">
              <el-tag type="info" size="large" style="width: 100%;">
                <Icon icon="ic:outline-settings" style="margin-right: 4px;" />
                {{ $t('systemSetting') }}
              </el-tag>
            </div>
            <el-select v-else v-model="rbException.type" size="large" style="width: 250px;">
              <el-option-group :label="$t('ruleOptPeople')">
                <el-option :label="$t('condFrom')" value="from" />
                <el-option :label="$t('condTo')" value="to" />
                <el-option :label="$t('condEmailReceivedForOthers')" value="email_received_for_others" />
              </el-option-group>
              <el-option-group :label="$t('ruleOptSubject')">
                <el-option :label="$t('condSubjectInclude')" value="subject_include" />
                <el-option :label="$t('condSubjectOrBodyInclude')" value="subject_or_body_include" />
              </el-option-group>
              <el-option-group :label="$t('ruleOptKeywords')">
                <el-option :label="$t('condMessageBodyIncludes')" value="message_body_includes" />
                <el-option :label="$t('condSenderAddressIncludes')" value="sender_address_includes" />
                <el-option :label="$t('condRecipientAddressIncludes')" value="recipient_address_includes" />
                <el-option :label="$t('condMessageHeaderIncludes')" value="message_header_includes" />
              </el-option-group>
              <el-option-group :label="$t('ruleOptMessageSize')">
                <el-option :label="$t('condAtLeast')" value="at_least" />
                <el-option :label="$t('condAtMost')" value="at_most" />
              </el-option-group>
              <el-option-group :label="$t('ruleOptReceived')">
                <el-option :label="$t('condBefore')" value="before" />
                <el-option :label="$t('condAfter')" value="after" />
              </el-option-group>
            </el-select>

            <el-date-picker
              v-if="['before', 'after'].includes(rbException.type)"
              v-model="rbException.value"
              type="date"
              size="large"
              style="flex: 1;"
              value-format="YYYY-MM-DD"
            />
            <el-input-number
              v-else-if="['at_least', 'at_most'].includes(rbException.type)"
              v-model="rbException.value"
              size="large"
              style="flex: 1;"
              :min="0"
            />
            <el-autocomplete 
              v-else-if="!['all_messages', 'in_whitelist', 'is_corporate', 'in_blacklist'].includes(rbException.type)" 
              v-model="rbException.value" 
              :fetch-suggestions="queryExceptionSuggestions"
              size="large" 
              placeholder="Value" 
              style="flex: 1;" 
            />
          </div>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <el-button @click="isRuleBuilderOpen = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" @click="saveNewRule">{{ $t('add') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useUiStore } from '@/store/ui.js'
import { useAccountStore } from '@/store/account.js'
import { emailSearchSuggestions } from '@/request/email.js'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const uiStore = useUiStore()
const accountStore = useAccountStore()

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

const startAdd = () => {
  editIndex.value = -1
  isEditingDefault.value = false
  form.value = { 
    name: '', icon: 'ic:baseline-label', color: presetColors[5], parent: '', 
    sidebarVis: 'show', listVis: true, rules: [], 
    stats: { total: 0, current: 0, unread: 0 } 
  }
  isEditorOpen.value = true
}

const startEdit = (index) => {
  editIndex.value = index
  isEditingDefault.value = false
  form.value = { ...uiStore.customLabels[index] }
  if (!form.value.rules) form.value.rules = []
  isEditorOpen.value = true
}

const startEditDefault = (index) => {
  editIndex.value = index
  isEditingDefault.value = true
  form.value = { ...uiStore.defaultLabels[index] }
  if (!form.value.rules) form.value.rules = []
  isEditorOpen.value = true
}

const isEditorOpen = ref(false)
const editIndex = ref(-1)
const isEditingDefault = ref(false)
const form = ref({ name: '', icon: 'ic:baseline-label', color: '#3b82f6', parent: '', sidebarVis: 'show', listVis: true, rules: [] })

const isRuleBuilderOpen = ref(false)
const rbCondition = ref({ type: 'from', value: '' })
const rbHasException = ref(false)
const rbException = ref({ type: 'in_blacklist', value: '' })

watch(() => rbCondition.value.type, (newVal) => {
  if (newVal === 'none') {
    rbHasException.value = true;
  }
})

const openRuleBuilder = async () => {
  rbCondition.value = { type: 'from', value: '' }
  rbHasException.value = false
  rbException.value = { type: 'in_blacklist', value: '' }
  isRuleBuilderOpen.value = true
}

const getSuggestions = async (queryString, type) => {
  const parts = (queryString || '').split(',')
  const lastPart = parts.pop() || ''
  const query = lastPart.trim().toLowerCase()
  const prefix = parts.length > 0 ? parts.join(',') + (parts[0] ? ', ' : '') : ''

  if (!query) {
    return queryString ? [{ value: queryString }] : []
  }

  try {
    const res = await emailSearchSuggestions({
      query: query,
      type: type,
      accountId: accountStore.currentAccountId || 0
    })
    
    let resultArr = []
    if (res && Array.isArray(res)) {
      resultArr = res.map(val => ({ value: prefix + val }))
    } else if (res && res.data && Array.isArray(res.data)) {
      resultArr = res.data.map(val => ({ value: prefix + val }))
    }
    
    if (resultArr.length === 0) {
      resultArr = [{ value: queryString }]
    }
    return resultArr
  } catch (error) {
    console.error(error)
    return [{ value: queryString }]
  }
}

const queryConditionSuggestions = async (queryString, cb) => {
  const results = await getSuggestions(queryString, rbCondition.value.type)
  cb(results)
}

const queryExceptionSuggestions = async (queryString, cb) => {
  const results = await getSuggestions(queryString, rbException.value.type)
  cb(results)
}

const saveNewRule = () => {
  // Validation
  const requiresValue = (type) => !['all_messages', 'none', 'in_whitelist', 'is_corporate', 'in_blacklist'].includes(type)
  const isValidValue = (val) => {
    if (val === 0) return true
    if (!val) return false
    if (typeof val === 'string') return !!val.trim()
    return true
  }

  if (requiresValue(rbCondition.value.type) && !isValidValue(rbCondition.value.value)) {
    ElMessage.error(t('ruleErrorInvalidValue'))
    return
  }

  if (rbCondition.value.type === 'none' && !rbHasException.value) {
    ElMessage.error(t('ruleErrorMustHaveException'))
    return
  }
  
  if (rbHasException.value && requiresValue(rbException.value.type) && !isValidValue(rbException.value.value)) {
    ElMessage.warning(t('emptyContentMsg') || 'Please enter exception value')
    return
  }
  
  const newRule = {
    condition: { 
      type: rbCondition.value.type, 
      value: requiresValue(rbCondition.value.type) 
        ? (typeof rbCondition.value.value === 'string' ? rbCondition.value.value.trim().toLowerCase() : rbCondition.value.value) 
        : true
    }
  }
  
  if (rbHasException.value) {
    newRule.exception = {
      type: rbException.value.type,
      value: requiresValue(rbException.value.type) 
        ? (typeof rbException.value.value === 'string' ? rbException.value.value.trim().toLowerCase() : rbException.value.value) 
        : true
    }
  }
  
  if (!form.value.rules) form.value.rules = []
  form.value.rules.push(newRule)
  isRuleBuilderOpen.value = false
}

const getConditionText = (cond) => {
  if (!cond) return ''
  const typeMap = {
    'from': 'condFrom',
    'to': 'condTo',
    'email_received_for_others': 'condEmailReceivedForOthers',
    'subject_include': 'condSubjectInclude',
    'subject_or_body_include': 'condSubjectOrBodyInclude',
    'message_body_includes': 'condMessageBodyIncludes',
    'sender_address_includes': 'condSenderAddressIncludes',
    'recipient_address_includes': 'condRecipientAddressIncludes',
    'message_header_includes': 'condMessageHeaderIncludes',
    'at_least': 'condAtLeast',
    'at_most': 'condAtMost',
    'before': 'condBefore',
    'after': 'condAfter',
    'all_messages': 'condApplyToAll',
    'in_blacklist': 'condInBlacklist',
    'in_whitelist': 'condInWhitelist',
    'is_corporate': 'condIsCorporate'
  }
  const key = typeMap[cond.type]
  let typeStr = key ? t(key) : cond.type
  if (typeStr.endsWith('...')) {
    typeStr = typeStr.slice(0, -3)
  }
  if (cond.value === true) return typeStr
  return `${typeStr} "${cond.value}"`
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

/* Rule Cards (New UI) */
.rule-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background: var(--bg-surface);
  border: 1px solid var(--border-mid);
  border-radius: 8px;
  padding: 10px 12px;
  transition: all 0.2s ease;
}
.rule-card:hover {
  border-color: var(--accent-primary);
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.rule-card-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  flex: 1;
}
.rule-cond {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.rule-exc {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 2px;
}
.cond-lbl {
  font-weight: 600;
  color: var(--success);
  font-size: 12px;
}
.cond-val {
  color: var(--text-primary);
  font-weight: 500;
}
.exc-lbl {
  font-weight: 600;
  color: var(--danger);
  font-size: 12px;
}
.exc-val {
  color: var(--text-primary);
  font-style: italic;
}
.rule-del {
  color: var(--text-muted);
  margin-left: 8px;
  margin-top: -4px;
}
.rule-del:hover {
  color: var(--danger) !important;
}

/* Rule Builder Modal */
.rule-builder-modal {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.rb-step {
  display: flex;
  flex-direction: column;
}
.rb-step-title {
  margin: 0 0 6px 0;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
}
.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--accent-primary);
  color: white;
  font-size: 12px;
  font-weight: 700;
}
.rb-step-desc {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.rb-form-row {
  display: flex;
  gap: 12px;
  align-items: center;
}
</style>
