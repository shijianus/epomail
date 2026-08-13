<template>
  <div class="page-container">
    <div class="header-area">
      <div class="header-text">
        <h1 class="page-title">{{ $t('labelSetting') || 'Label Management' }}</h1>
        <p class="page-desc">Manage your system labels and custom email categories</p>
      </div>
      <el-button type="primary" size="large" @click="startAdd" class="primary-btn">
        <Icon icon="lucide:plus" width="18" /> {{ $t('newLabel') || 'New Label' }}
      </el-button>
    </div>

    <!-- Default Template Labels -->
    <div class="section">
      <h2 class="section-title">默认模板 (Default Templates)</h2>
      <div class="modern-list">
        <div class="list-row system-row" v-for="(label, index) in uiStore.defaultLabels" :key="'def-'+index">
          <div class="drag-handle disabled" title="Default labels cannot be reordered"></div>
          <div class="label-pill-cell">
            <div class="label-pill" :style="{ '--pill-color': label.color }">
              <Icon :icon="label.icon" width="16" />
              <span>{{ label.name }}</span>
            </div>
          </div>
          <div class="visibility-cell">
            <el-select v-model="label.sidebarVis" size="small" class="vis-select">
              <el-option label="Show" value="show" />
              <el-option label="Hide" value="hide" />
              <el-option label="Show if unread" value="unread" />
            </el-select>
          </div>
          <div class="visibility-cell">
             <el-switch v-model="label.listVis" size="small" />
          </div>
          <div class="stats-cell">--</div>
          <div class="actions-cell">
            <el-button link class="action-btn edit-btn" @click="startEditDefault(index)" title="Edit Color/Icon">
              <Icon icon="lucide:pencil" width="16" />
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Custom Labels -->
    <div class="section" style="margin-top: 32px">
      <div class="modern-list" v-if="uiStore.customLabels && uiStore.customLabels.length > 0">
        <div class="list-row custom-row" v-for="(label, index) in uiStore.customLabels" :key="index">
          <div class="drag-handle" title="Drag to reorder" @click="moveUp(index)">
            <Icon icon="lucide:grip-vertical" width="18" />
          </div>
          <div class="label-pill-cell">
            <div class="label-pill" :style="{ '--pill-color': label.color || 'var(--accent-primary)' }">
              <Icon :icon="label.icon || 'ic:baseline-label'" width="16" />
              <span>{{ label.name || label }}</span>
            </div>
          </div>
          <div class="visibility-cell">
            <el-select v-model="label.sidebarVis" size="small" class="vis-select" placeholder="Show">
              <el-option label="Show" value="show" />
              <el-option label="Hide" value="hide" />
              <el-option label="Show if unread" value="unread" />
            </el-select>
          </div>
          <div class="visibility-cell">
             <el-switch v-model="label.listVis" size="small" />
          </div>
          <div class="stats-cell">0 {{$t('emails') || 'emails'}}</div>
          <div class="actions-cell">
            <el-button link class="action-btn edit-btn" @click="startEdit(index)">
              <Icon icon="lucide:pencil" width="16" />
            </el-button>
            <el-button link class="action-btn delete-btn" @click="confirmDelete(index)">
              <Icon icon="lucide:trash-2" width="16" />
            </el-button>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <Icon icon="lucide:tags" width="48" class="empty-icon" />
        <h3>{{ $t('noCustomLabels') || 'No Custom Labels' }}</h3>
        <p>Create your first label to keep your inbox organized.</p>
        <el-button plain @click="startAdd">Create Label</el-button>
      </div>
    </div>

    <!-- Drawer for Add/Edit -->
    <el-drawer v-model="isEditorOpen" :title="editIndex === -1 ? 'Create New Label' : 'Edit Label'" size="400px" destroy-on-close class="label-drawer">
      <div class="editor-form">
        <div class="form-group">
          <label>Name</label>
          <el-input v-model="form.name" size="large" placeholder="Enter label name" :disabled="isEditingDefault" />
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
          <label>Color</label>
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
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <el-button @click="isEditorOpen = false">Cancel</el-button>
          <el-button type="primary" @click="saveLabel">Save Label</el-button>
        </div>
      </template>
    </el-drawer>

    <!-- Delete Confirmation Modal -->
    <el-dialog v-model="isDeleteOpen" title="Delete Label" width="450px" custom-class="delete-modal">
      <div class="delete-warning">
        <Icon icon="lucide:alert-triangle" width="32" class="warning-icon" />
        <div class="warning-text">
          <h3 style="margin:0; font-size: 16px;">Delete "{{ deleteCandidate?.name }}"?</h3>
          <p style="margin:8px 0 0; color: var(--text-secondary); font-size: 13px;">Please select how to handle the associated emails.</p>
        </div>
      </div>
      <el-radio-group v-model="deleteMode" class="delete-radio-group">
        <el-radio :value="'tagOnly'" class="radio-item">
          <div><strong>Only remove the label tag</strong></div>
          <div class="radio-desc">Emails will remain in their original folders. The label association will simply be cleared.</div>
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
const form = ref({ name: '', icon: 'ic:baseline-label', color: '#3b82f6', parent: '', sidebarVis: 'show', listVis: true })

const startAdd = () => {
  editIndex.value = -1
  isEditingDefault.value = false
  form.value = { name: '', icon: 'ic:baseline-label', color: presetColors[5], parent: '', sidebarVis: 'show', listVis: true }
  isEditorOpen.value = true
}

const startEdit = (index) => {
  editIndex.value = index
  isEditingDefault.value = false
  form.value = { ...uiStore.customLabels[index] }
  isEditorOpen.value = true
}

const startEditDefault = (index) => {
  editIndex.value = index
  isEditingDefault.value = true
  form.value = { ...uiStore.defaultLabels[index] }
  isEditorOpen.value = true
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

const confirmDelete = (index) => {
  deleteIndex.value = index
  deleteCandidate.value = uiStore.customLabels[index]
  deleteMode.value = 'tagOnly'
  isDeleteOpen.value = true
}

const executeDelete = () => {
  if (deleteIndex.value > -1) {
    uiStore.customLabels.splice(deleteIndex.value, 1)
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

.list-row {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
  transition: background-color 0.2s;
}

.list-row:last-child {
  border-bottom: none;
}

.list-row.custom-row:hover {
  background-color: var(--bg-hover);
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
.list-row:hover .drag-handle:not(.disabled) {
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
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
}

.list-row:hover .action-btn {
  opacity: 1;
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
</style>
