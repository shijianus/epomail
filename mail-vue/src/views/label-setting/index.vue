<template>
  <div class="box">
    <div class="container">
      <div class="title">{{ $t('labels') || 'Labels' }}</div>
      
      <div class="label-list">
        <div class="label-item" v-for="(label, index) in uiStore.customLabels" :key="index">
          <div class="label-info">
            <Icon :icon="label.icon || 'ic:baseline-label'" width="20" height="20" />
            <span v-if="editIndex !== index">{{ label.name || label }}</span>
            <template v-else>
              <el-input v-model="editForm.name" size="small" :placeholder="$t('labels') || 'Label Name'" style="width: 150px" />
              <el-input v-model="editForm.icon" size="small" placeholder="Icon (e.g. ic:baseline-label)" style="width: 200px" />
            </template>
          </div>
          
          <div class="label-actions">
            <template v-if="editIndex !== index">
              <el-button link type="primary" @click="startEdit(index)">{{ $t('edit') || 'Edit' }}</el-button>
              <el-button link type="danger" @click="deleteLabel(index)">{{ $t('delete') || 'Delete' }}</el-button>
              
              <el-button link :disabled="index === 0" @click="moveUp(index)">
                <Icon icon="lucide:arrow-up" width="16" />
              </el-button>
              <el-button link :disabled="index === uiStore.customLabels.length - 1" @click="moveDown(index)">
                <Icon icon="lucide:arrow-down" width="16" />
              </el-button>
            </template>
            <template v-else>
              <el-button link type="primary" @click="saveEdit(index)">{{ $t('save') || 'Save' }}</el-button>
              <el-button link @click="editIndex = -1">{{ $t('cancel') || 'Cancel' }}</el-button>
            </template>
          </div>
        </div>
        
        <el-empty v-if="!uiStore.customLabels || uiStore.customLabels.length === 0" :description="$t('noData') || 'No labels yet'" />
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { useUiStore } from '@/store/ui.js'
import { Icon } from '@iconify/vue'

const uiStore = useUiStore()

const editIndex = ref(-1)
const editForm = ref({ name: '', icon: '' })

// Ensure they are object shapes
const normalizeLabels = () => {
  if (!uiStore.customLabels) uiStore.customLabels = []
  uiStore.customLabels = uiStore.customLabels.map(l => {
    if (typeof l === 'string') return { name: l, icon: 'ic:baseline-label' }
    return l
  })
}
normalizeLabels()

const startEdit = (index) => {
  editIndex.value = index
  editForm.value = { ...uiStore.customLabels[index] }
}

const saveEdit = (index) => {
  if (editForm.value.name.trim()) {
    uiStore.customLabels[index] = { ...editForm.value }
    editIndex.value = -1
  }
}

const deleteLabel = (index) => {
  uiStore.customLabels.splice(index, 1)
}

const moveUp = (index) => {
  if (index > 0) {
    const temp = uiStore.customLabels[index]
    uiStore.customLabels[index] = uiStore.customLabels[index - 1]
    uiStore.customLabels[index - 1] = temp
  }
}

const moveDown = (index) => {
  if (index < uiStore.customLabels.length - 1) {
    const temp = uiStore.customLabels[index]
    uiStore.customLabels[index] = uiStore.customLabels[index + 1]
    uiStore.customLabels[index + 1] = temp
  }
}
</script>
<style scoped>
.box {
  padding: 24px 0;
  width: 100%;
}
.title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 24px;
  color: var(--text-primary);
}
.container {
  max-width: 800px;
}
.label-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.label-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  transition: border-color 0.2s;
}
.label-item:hover {
  border-color: var(--border-primary);
}
.label-info {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-primary);
  font-weight: 500;
}
.label-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
