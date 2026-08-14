<template>
  <div class="page-container">
    <div class="header-area">
      <div class="header-text">
        <h1 class="page-title">{{ $t('labelSetting') || 'Label Management' }}</h1>
        <p class="page-desc">{{ $t('labelSettingDesc') || 'Manage your labels and classification rules' }}</p>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <span class="label-count-badge">{{ uiStore.allLabels.length }} / 7</span>
        <el-button type="primary" size="large" @click="startAdd" class="primary-btn" :disabled="uiStore.allLabels.length >= 7">
          <Icon icon="lucide:plus" width="18" /> {{ $t('newLabel') || 'New Label' }}
        </el-button>
      </div>
    </div>

    <div class="labels-container" v-if="uiStore.allLabels.length > 0">
      <div class="modern-list">
        <div class="list-row tech-row" v-for="(label, index) in uiStore.allLabels" :key="'lbl-'+index">
          <div class="drag-handle" :title="$t('dragToReorder') || 'Drag to reorder'" @click="moveUp(index)">
            <Icon icon="lucide:grip-vertical" width="18" />
          </div>
          <div class="label-pill-cell" style="padding-left: 8px;">
            <div class="label-pill" :style="{ '--pill-color': label.color || 'var(--accent-primary)' }">
              <div v-if="(label.icon || '').startsWith('<svg')" v-html="label.icon" style="width: 18px; height: 18px; display: inline-flex; justify-content: center; align-items: center; fill: currentColor;"></div>
              <Icon v-else :icon="label.icon || 'ic:baseline-label'" width="18" />
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
    <div v-else class="empty-state">
      <Icon icon="lucide:tags" width="48" class="empty-icon" />
      <h3>{{ $t('noLabels') || 'No Labels' }}</h3>
      <p>{{ $t('noLabelsDesc') || 'Create your first label to keep your inbox organized.' }}</p>
    </div>

    <!-- Drawer for Add/Edit -->
    <el-drawer v-model="isEditorOpen" :title="editIndex === -1 ? ($t('createLabel') || '新建标签') : ($t('editLabel') || '编辑标签')" size="400px" destroy-on-close class="label-drawer">
      <div class="editor-form">
        <div class="form-group">
          <label>{{ $t('name') || 'Name' }}</label>
          <el-input v-model="form.name" size="large" :placeholder="$t('labelNamePlaceholder') || 'Enter label name'" />
        </div>
        <div class="form-group">
          <label>Parent Label</label>
          <el-select v-model="form.parent" size="large" placeholder="None" clearable style="width: 100%">
             <el-option v-for="(l, i) in uiStore.allLabels" :key="i" :label="l.name" :value="l.name" :disabled="editIndex === i" />
          </el-select>
        </div>
        <div class="form-group">
          <label>{{ $t('icon') || '标签图标' }}</label>
          <div class="swatches" style="margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
             <div class="swatch" 
                  v-for="ico in presetIcons" :key="ico"
                  :class="{ active: form.icon === ico }"
                  @click="form.icon = ico"
                  style="background-color: var(--bg-hover)">
                  <Icon :icon="ico" width="18" :color="form.icon === ico ? form.color : 'var(--text-secondary)'" />
             </div>
             <div class="swatch"
                  v-for="(svgStr, idx) in uiStore.customSvgs" :key="'csvg-'+idx"
                  :class="{ active: form.icon === svgStr }"
                  @click="form.icon = svgStr"
                  style="background-color: var(--bg-hover)">
                  <div v-html="svgStr" style="width: 18px; height: 18px; display: flex; justify-content: center; align-items: center;" :style="{ color: form.icon === svgStr ? form.color : 'var(--text-secondary)', fill: 'currentColor' }"></div>
             </div>
             <div class="swatch" v-if="(uiStore.customSvgs || []).length < 5" @click="isSvgModalOpen = true" style="background-color: var(--bg-hover); border: 1px dashed var(--border-mid); cursor: pointer;" :title="$t('addCustomIcon') || '添加自定义 SVG'">
                <Icon icon="lucide:plus" width="18" color="var(--text-secondary)" />
             </div>
          </div>
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
          <label style="display:flex; align-items:center; gap:8px;">
            {{ $t('classificationRules') || 'Rules' }}
            <span v-if="form.rules && form.rules.length > 0" class="rules-count-badge">{{ form.rules.length }} 条</span>
          </label>
          <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 8px 0; line-height: 1.4;">
            {{ $t('rulesDesc') || 'Emails matching these rules will automatically receive this label.' }}
          </p>
          
          <div v-if="form.rules && form.rules.length > 0" class="rules-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 280px; overflow-y: auto; margin-bottom: 8px;">
            <div v-for="(rule, rIdx) in form.rules" :key="rIdx"
                 :class="['rule-card', isSystemRule(rule) ? 'rule-card--system' : '']">
              <div class="rule-card-content">

                <!-- ① system_setting 规则：显示系统自查及提示 -->
                <template v-if="isSystemRule(rule)">
                  <div class="rule-cond" style="align-items: center; display: flex; gap: 6px;">
                    <span class="cond-lbl" style="display: flex; align-items: center; gap: 4px; font-weight: 500;">
                      <Icon icon="lucide:settings" width="14" /> {{ $t('systemCheck') || '系统自查' }}
                    </span>
                    <el-tooltip :content="$t('systemCheckTooltip') || '此规则由系统内置逻辑驱动，无法修改'" placement="top">
                      <Icon icon="lucide:help-circle" width="14" style="color: var(--text-secondary); cursor: help; outline: none;" />
                    </el-tooltip>
                  </div>
                </template>

                <!-- ② sender_address_includes：将域名渲染为 chips -->
                <template v-else-if="rule.condition?.type === 'sender_address_includes'">
                  <div class="rule-cond" style="align-items: flex-start; flex-wrap: wrap; gap: 6px;">
                    <span class="cond-lbl" style="white-space:nowrap; margin-top:2px;">If 发件人域名包含:</span>
                    <div class="domain-chips">
                      <span v-for="d in parseDomainList(rule.condition.value)" :key="d" class="domain-chip">{{ d }}</span>
                    </div>
                  </div>
                  <div class="rule-exc" v-if="rule.exception">
                    <span class="exc-lbl">Except if:</span>
                    <span class="exc-val">{{ getConditionText(rule.exception) }}</span>
                  </div>
                </template>

                <!-- ③ 普通规则 -->
                <template v-else>
                  <div class="rule-cond">
                    <span class="cond-lbl">If:</span>
                    <span class="cond-val">{{ getConditionText(rule.condition) }}</span>
                  </div>
                  <div class="rule-exc" v-if="rule.exception">
                    <span class="exc-lbl">Except if:</span>
                    <span class="exc-val">{{ getConditionText(rule.exception) }}</span>
                  </div>
                </template>
              </div>

              <!-- 删除按钮：系统规则禁止删除 -->
              <el-tooltip v-if="isSystemRule(rule)" content="系统内置规则，不可删除" placement="top">
                <span class="rule-del rule-del--locked">
                  <Icon icon="lucide:lock" width="14" />
                </span>
              </el-tooltip>
              <el-button v-else link size="small" @click="removeRule(rIdx)" class="rule-del">
                <Icon icon="lucide:trash-2" width="14" />
              </el-button>
            </div>
          </div>

          <button class="add-rule-btn" @click.prevent="openRuleBuilder">
            <Icon icon="lucide:plus" width="16" />
            <span>添加自定义规则</span>
          </button>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <el-button @click="isEditorOpen = false">{{ $t('cancel') || 'Cancel' }}</el-button>
          <el-button type="primary" @click="saveLabel">{{ $t('saveLabel') || 'Save Label' }}</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- Delete Confirmation Modal -->
    <el-dialog v-model="isDeleteOpen" :title="$t('deleteLabel') || 'Delete Label'" width="450px" custom-class="delete-modal">
      <div class="delete-warning">
        <Icon icon="lucide:alert-triangle" width="32" class="warning-icon" />
        <div class="warning-text">
          <h3 style="margin:0; font-size: 16px;">{{ $t('deleteConfirmMsg', { name: deleteCandidate?.name }) || `Delete "${deleteCandidate?.name}"?` }}</h3>
          <p style="margin:8px 0 0; color: var(--text-secondary); font-size: 13px;">
             <strong>{{ $t('note') || 'Note' }}:</strong> {{ $t('deleteLabelWarning') || 'This will only remove the label tag. Associated emails will not be deleted.' }}
          </p>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <el-button @click="isDeleteOpen = false">{{ $t('cancel') || 'Cancel' }}</el-button>
          <el-button type="danger" @click="executeDelete">{{ $t('delete') || 'Delete' }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Rule Builder Modal -->
    <el-dialog v-model="isRuleBuilderOpen" :title="$t('classificationRules')" width="600px" destroy-on-close>
      <div class="rule-builder-modal">
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; margin-top: -12px;">
          {{ $t('ruleFutureNotice') }}
        </div>
        
        <!-- Step 1: Condition (Include) -->
        <div class="rb-step">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h4 class="rb-step-title" style="margin: 0;"><span class="step-num">1</span> {{ $t('ruleInclude') }} (Condition)</h4>
            <el-switch v-model="rbHasCondition" size="small" />
          </div>
          
          <div v-if="rbHasCondition" class="rb-form-row">
            <div v-if="['in_whitelist', 'is_corporate', 'in_blacklist', 'system_setting'].includes(rbCondition.type)" class="system-rule-tag" style="width: 250px; display: flex; align-items: center;">
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
              <el-option-group :label="$t('systemSetting')">
                <el-option :label="$t('systemSetting')" value="system_setting" />
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
              v-else-if="!['system_setting', 'in_whitelist', 'is_corporate', 'in_blacklist'].includes(rbCondition.type)" 
              v-model="rbCondition.value" 
              :fetch-suggestions="queryConditionSuggestions"
              size="large" 
              placeholder="Value" 
              style="flex: 1;" 
            />
          </div>
        </div>

        <el-divider border-style="dashed" />

        <!-- Step 2: Exception (Exclude) -->
        <div class="rb-step">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h4 class="rb-step-title" style="margin: 0;"><span class="step-num">2</span> {{ $t('ruleExclude') }} (Exception)</h4>
            <el-switch v-model="rbHasException" size="small" />
          </div>
          
          <div v-if="rbHasException" class="rb-form-row">
            <div v-if="['in_whitelist', 'is_corporate', 'in_blacklist', 'system_setting'].includes(rbException.type)" class="system-rule-tag" style="width: 250px; display: flex; align-items: center;">
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
              <el-option-group :label="$t('systemSetting')">
                <el-option :label="$t('systemSetting')" value="system_setting" />
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
              v-else-if="!['system_setting', 'in_whitelist', 'is_corporate', 'in_blacklist'].includes(rbException.type)" 
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

    <!-- Custom SVG Modal -->
    <el-dialog v-model="isSvgModalOpen" :title="$t('addCustomIcon') || '添加自定义 SVG'" width="450px" destroy-on-close>
      <div style="margin-bottom: 12px; font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
        请在下方粘贴您的自定义 SVG 代码。<br/>
        建议使用 <code style="background: var(--bg-hover); padding: 2px 4px; border-radius: 4px;">viewBox="0 0 24 24"</code> 并将主要路径的颜色设置为 <code style="background: var(--bg-hover); padding: 2px 4px; border-radius: 4px;">fill="currentColor"</code> 以支持颜色切换。
      </div>
      <el-input v-model="customSvgInput" type="textarea" :rows="6" placeholder="<svg ...> ... </svg>" style="font-family: monospace;" />
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <el-button @click="isSvgModalOpen = false">{{ $t('cancel') || '取消' }}</el-button>
          <el-button type="primary" @click="saveCustomSvg">{{ $t('save') || '保存' }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useUiStore } from '@/store/ui.js'
import { useAccountStore } from '@/store/account.js'
import { emailSearchSuggestions } from '@/request/email.js'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const uiStore = useUiStore()
const accountStore = useAccountStore()

// 页面加载时，强制确保所有默认标签的系统规则都正确注入
onMounted(() => {
  uiStore.ensureDefaultRules()
  // Normalize any old-format labels
  uiStore.allLabels = uiStore.allLabels.map(l => {
    if (typeof l === 'string') return { name: l, icon: 'ic:baseline-label', color: '#3b82f6', listVis: true, rules: [], stats: { total: 0, current: 0, unread: 0 } }
    if (l.sidebarVis === undefined) l.sidebarVis = 'show'
    if (l.listVis === undefined) l.listVis = true
    if (!l.rules) l.rules = []
    if (!l.stats) l.stats = { total: 0, current: 0, unread: 0 }
    return l
  })
})

// 判断一条规则是否为系统内置规则（不允许删除）
const isSystemRule = (rule) => {
  return rule?.condition?.type === 'system_setting'
}

// 解析逗号分隔的域名值为数组（用于 chips 显示）
const parseDomainList = (value) => {
  if (!value || typeof value !== 'string') return []
  return value.split(',').map(v => v.trim()).filter(Boolean)
}

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

const isEditorOpen = ref(false)
const editIndex = ref(-1)
const form = ref({ name: '', icon: 'ic:baseline-label', color: '#3b82f6', parent: '', listVis: true, rules: [], stats: { total: 0, current: 0, unread: 0 } })

const startAdd = () => {
  if (uiStore.allLabels.length >= 7) {
    ElMessage.warning(t('maxLabelsReached') || '最多只能创建 7 个标签')
    return
  }
  editIndex.value = -1
  form.value = { 
    name: '', icon: 'ic:baseline-label', color: presetColors[5], parent: '', 
    listVis: true, rules: [], stats: { total: 0, current: 0, unread: 0 } 
  }
  isEditorOpen.value = true
}

const startEdit = (index) => {
  editIndex.value = index
  form.value = { ...uiStore.allLabels[index] }
  if (!form.value.rules) form.value.rules = []
  isEditorOpen.value = true
}

const isSvgModalOpen = ref(false)
const customSvgInput = ref('')

const saveCustomSvg = () => {
  const val = customSvgInput.value.trim()
  if (val.toLowerCase().startsWith('<svg')) {
    if (!uiStore.customSvgs) {
      uiStore.customSvgs = []
    }
    if (uiStore.customSvgs.length < 5) {
      uiStore.customSvgs.push(val)
      form.value.icon = val
      isSvgModalOpen.value = false
      customSvgInput.value = ''
      ElMessage.success('自定义图标已添加')
    } else {
      ElMessage.warning('最多只能添加 5 个自定义图标')
    }
  } else {
    ElMessage.error('请输入有效的 SVG 代码 (需以 <svg> 开头)')
  }
}

const isRuleBuilderOpen = ref(false)
const rbHasCondition = ref(true)
const rbCondition = ref({ type: 'from', value: '' })
const rbHasException = ref(false)
const rbException = ref({ type: 'from', value: '' })

const openRuleBuilder = async () => {
  rbHasCondition.value = true
  rbCondition.value = { type: 'from', value: '' }
  rbHasException.value = false
  rbException.value = { type: 'from', value: '' }
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
  const requiresValue = (type) => !['all_messages', 'none', 'system_setting', 'in_whitelist', 'is_corporate', 'in_blacklist'].includes(type)
  const isValidValue = (val) => {
    if (val === 0) return true
    if (!val) return false
    if (typeof val === 'string') return !!val.trim()
    return true
  }

  if (!rbHasCondition.value && !rbHasException.value) {
    ElMessage.error(t('ruleErrorMustHaveConditionOrException') || 'Please configure at least one condition or exception')
    return
  }

  if (rbHasCondition.value && requiresValue(rbCondition.value.type) && !isValidValue(rbCondition.value.value)) {
    ElMessage.error(t('ruleErrorInvalidValue') || 'Invalid condition value')
    return
  }
  
  if (rbHasException.value && requiresValue(rbException.value.type) && !isValidValue(rbException.value.value)) {
    ElMessage.warning(t('emptyContentMsg') || 'Please enter exception value')
    return
  }
  
  const newRule = {}
  
  if (rbHasCondition.value) {
    newRule.condition = { 
      type: rbCondition.value.type, 
      value: requiresValue(rbCondition.value.type) 
        ? (typeof rbCondition.value.value === 'string' ? rbCondition.value.value.trim().toLowerCase() : rbCondition.value.value) 
        : true
    }
  } else {
    newRule.condition = { type: 'none', value: true }
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
    'is_corporate': 'condIsCorporate',
    'system_setting': 'systemSetting'
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
    ElMessage.warning(t('labelNameRequired') || 'Label name is required')
    return
  }
  
  if (editIndex.value > -1) {
    uiStore.allLabels[editIndex.value] = { ...form.value }
  } else {
    uiStore.allLabels.push({ ...form.value })
  }
  isEditorOpen.value = false
}

const isDeleteOpen = ref(false)
const deleteCandidate = ref(null)
const deleteIndex = ref(-1)

const confirmDelete = (index) => {
  deleteIndex.value = index
  deleteCandidate.value = uiStore.allLabels[index]
  isDeleteOpen.value = true
}

const executeDelete = () => {
  if (deleteIndex.value > -1) {
    uiStore.allLabels.splice(deleteIndex.value, 1)
  }
  isDeleteOpen.value = false
  ElMessage.success(t('labelDeleted') || 'Label removed successfully')
}

const moveUp = (index) => {
  if (index > 0) {
    const temp = uiStore.allLabels[index]
    uiStore.allLabels[index] = uiStore.allLabels[index - 1]
    uiStore.allLabels[index - 1] = temp
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

.label-count-badge {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-hover);
  border: 1px solid var(--border-mid);
  border-radius: 20px;
  padding: 4px 12px;
  letter-spacing: 0.5px;
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

/* ─── Rules count badge ─── */
.rules-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 7px;
  border-radius: 100px;
  background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
  color: var(--accent-primary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

/* ─── System rule card variant ─── */
.rule-card--system {
  background: color-mix(in srgb, #f59e0b 6%, var(--bg-surface));
  border-color: color-mix(in srgb, #f59e0b 30%, var(--border-mid));
}
.rule-card--system:hover {
  border-color: color-mix(in srgb, #f59e0b 60%, transparent);
  box-shadow: 0 2px 8px color-mix(in srgb, #f59e0b 10%, transparent);
}
.rule-sys-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.rule-sys-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 100px;
  background: color-mix(in srgb, #f59e0b 20%, transparent);
  color: #d97706;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.rule-sys-desc {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}
.rule-sys-note {
  margin: 4px 0 0;
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.5;
}

/* ─── Domain chips ─── */
.domain-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1;
}
.domain-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 100px;
  background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  color: var(--accent-primary);
  font-size: 11.5px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace, sans-serif;
  border: 1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent);
}

/* ─── Locked delete icon ─── */
.rule-del--locked {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: color-mix(in srgb, #f59e0b 50%, var(--text-muted));
  margin-left: 8px;
  margin-top: -4px;
  cursor: not-allowed;
  opacity: 0.6;
}

/* ─── Add Rule Button ─── */
.add-rule-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 12px;
  background-color: color-mix(in srgb, var(--accent-primary) 5%, transparent);
  border: 1.5px dashed color-mix(in srgb, var(--accent-primary) 30%, transparent);
  border-radius: 8px;
  color: var(--accent-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
}
.add-rule-btn:hover {
  background-color: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  border-color: color-mix(in srgb, var(--accent-primary) 50%, transparent);
  transform: translateY(-1px);
}
.add-rule-btn:active {
  transform: translateY(0);
}
</style>
