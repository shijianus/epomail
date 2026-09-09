<template>
  <div class="reg-key">
    <div class="header-actions">
      <div class="action-btn-pill" @click="openAdd" :title="$t('add')">
        <Icon class="icon" icon="ion:add-outline" width="20" height="20"/>
      </div>
      <div class="search">
        <el-input
            v-model="params.code"
            class="search-input"
            :placeholder="$t('searchRegKeyDesc')"
            @keyup.enter="search"
            clearable
            @clear="refresh"
        >
        </el-input>
      </div>
      <div class="action-btn-pill" @click="search" :title="$t('search')">
        <Icon class="icon" icon="iconoir:search" width="18" height="18"/>
      </div>
      <div class="action-btn-pill" @click="refresh" :title="$t('refresh')">
        <Icon class="icon" icon="ion:reload" width="16" height="16"/>
      </div>
      <div class="action-btn-pill" @click="clearNotUse" :title="$t('clearUnused') || '清理无用注册码'">
        <Icon class="icon" icon="fluent:broom-sparkle-16-regular" width="18" height="18"/>
      </div>
    </div>

    <el-scrollbar class="scrollbar">
      <div  class="loading" :class="regKeyLoading ? 'loading-show' : 'loading-hide'" :style="regKeyFirst ? 'background: transparent' : ''">
        <loading/>
      </div>
      <div class="code-box">
        <div class="code-item" v-for="item in regKeyData" :key="item.regKeyId || item.code">
          <div class="code-info">
            <div class="info-left">
              <div class="info-left-item code-row">
                <span class="code" :class="{ 'code-masked': isVisitor || item.isMasked }" @click="copyCode(item)">{{ item.code }}</span>
                <el-tag v-if="isVisitor || item.isMasked" size="small" type="warning" effect="plain" class="masked-tag">
                  脱敏保护
                </el-tag>
              </div>
              <div class="info-left-item">
                <div>{{ $t('remainingUses') }}：</div>
                <div v-if="item.count">{{ item.count }}</div>
                <el-tag v-else type="danger">{{ $t('exhausted') }}</el-tag>
              </div>
              <div class="info-left-item">
                <div>{{ $t('roleDesc') }}：</div>
                <el-tag>{{ item.roleName }}</el-tag>
              </div>
              <div class="info-left-item">
                <div>{{ $t('validUntil') }}：</div>
                <div v-if="item.expireTime">{{ formatExpireTime(item.expireTime) }}</div>
                <el-tag v-else type="danger">{{ $t('expired') }}</el-tag>
              </div>
            </div>
            <div class="info-right">
              <el-dropdown class="setting">
                <Icon icon="fluent:settings-24-filled" width="21" height="21" color="#909399"/>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="copyCode(item)">{{ $t('copy') }}</el-dropdown-item>
                    <el-dropdown-item @click="openHistory(item)">{{ $t('history') }}</el-dropdown-item>
                    <el-dropdown-item @click="deleteRegKey(item)">{{ $t('delete') }}</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>
      </div>
      <div class="empty" v-if="regKeyData.length === 0">
        <div class="empty-baseplate" v-if="!regKeyFirst">
          <el-empty
            :image-size="isMobile ? 100 : 120"
            :description="params.code ? ($t('noSearchResult') || '未找到匹配的注册码') : $t('noCodeFound')"
          >
            <template #default>
              <div class="empty-actions">
                <el-button type="primary" class="empty-btn empty-btn-primary" @click="openAdd">
                  <Icon icon="ion:add-outline" width="16" height="16" class="btn-icon" />
                  <span>{{ $t('addRegKey') || $t('add') }}</span>
                </el-button>
                <el-button v-if="params.code" class="empty-btn empty-btn-secondary" @click="refresh">
                  <Icon icon="ion:reload" width="14" height="14" class="btn-icon" />
                  <span>{{ $t('clearSearch') || '清空搜索条件' }}</span>
                </el-button>
              </div>
            </template>
          </el-empty>
        </div>
      </div>
    </el-scrollbar>
    <el-dialog v-model="showAdd" :title="$t('addRegKey')">
      <div class="container">
        <el-input v-model="addForm.code" :placeholder="$t('regKey')">
          <template #suffix>
            <Icon @click.stop="genCode" class="gen-code" icon="bitcoin-icons:refresh-filled" width="24" height="24"/>
          </template>
        </el-input>
        <el-select v-model="addForm.roleId" :placeholder="$t('roleDesc')">
          <el-option v-for="item in roleList" :label="item.name" :value="item.roleId" :key="item.roleId"/>
        </el-select>
        <el-date-picker
            v-model="addForm.expireTime"
            type="date"
            :placeholder="$t('validUntil')"
        />
        <el-input-number v-model="addForm.count" :min="1" :max="99999"/>
        <el-button class="btn" type="primary" @click="submit" :loading="addLoading"
        >{{ $t('add') }}
        </el-button>
      </div>
    </el-dialog>
    <el-dialog class="history-list" v-model="showRegKeyHistory" :title="$t('useHistory')">
      <div class="loading" :class="historyLoading ? 'loading-show' : 'loading-hide'">
        <loading/>
      </div>
      <el-table v-if="!historyLoading" :data="historyList" :fit="true" style="height: 100%">
        <el-table-column :min-width="emailColumnWidth" property="email" :label="$t('user')"
                         :show-overflow-tooltip="true"/>
        <el-table-column :width="createTimeColumnWidth" :formatter="formatUserCreateTime" property="createTime"
                         :label="$t('date')" fixed="right" :show-overflow-tooltip="true"/>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import {computed, defineOptions, nextTick, reactive, ref, watch} from "vue"
import {Icon} from "@iconify/vue";
import loading from "@/components/loading/index.vue";
import {useSettingStore} from "@/store/setting.js";
import {useUserStore} from "@/store/user.js";
import {roleSelectUse} from "@/request/role.js";
import {useRoleStore} from "@/store/role.js";
import {regKeyAdd, regKeyList, regKeyClearNotUse, regKeyDelete, regKeyHistory} from "@/request/reg-key.js";
import {getTextWidth} from "@/utils/text.js";
import dayjs from "dayjs";
import {tzDayjs} from "@/utils/day.js";
import {useI18n} from "vue-i18n";

defineOptions({
  name: 'reg-key'
})

const userStore = useUserStore();
const roleStore = useRoleStore();
const settingStore = useSettingStore();
const params = reactive({
  code: '',
})

const {t} = useI18n()
const regKeyData = reactive([])

const isVisitor = computed(() => {
  const r = userStore.user?.role;
  if (r?.roleCode === 'visitor' || r?.name === '参观者' || r?.key === 'visitor') return true;
  return regKeyData.length > 0 && !!regKeyData[0]?.isMasked;
});

const roleList = reactive([])
const addLoading = ref(false)
const showAdd = ref(false)
const regKeyLoading = ref(true)
const regKeyFirst = ref(true)
const showRegKeyHistory = ref(false)
const historyList = reactive([])
const emailColumnWidth = ref(0)
const createTimeColumnWidth = ref(0)
const historyLoading = ref(false)
const isMobile = window.innerWidth < 1025

const addForm = reactive({
  code: '',
  count: 1,
  roleId: null,
  expireTime: null
})

getList(true)

roleSelectUse().then(list => {
  roleList.length = 0
  roleList.push(...list)
})

watch(() => roleStore.refresh, () => {
  roleSelectUse().then(list => {
    roleList.length = 0
    roleList.push(...list)
  })
})

function openHistory(regKey) {

  historyList.length = 0
  historyLoading.value = true
  regKeyHistory(regKey.regKeyId).then(list => {

    historyList.push(...list)
    if (list.length > 0) {

      const email = list.reduce((a, b) =>
          compareByLengthAndUpperCase(a, b, 'email')
      ).email;

      emailColumnWidth.value = getTextWidth(email) + 30
      emailColumnWidth.value = emailColumnWidth.value < 300 ? emailColumnWidth.value : 300
      const createTime = list.reduce((a, b) =>
          compareByLengthAndUpperCase(a, b, 'createTime')
      ).createTime;
      createTimeColumnWidth.value = getTextWidth(createTime)
    }

  }).finally(() => {
    historyLoading.value = false
  })

  showRegKeyHistory.value = true
}

const compareByLengthAndUpperCase = (a, b, key) => {
  const getUpperCaseCount = (str) => (str.match(/[A-Z]/g) || []).length;
  if (a[key].length === b[key].length) {
    return getUpperCaseCount(a[key]) > getUpperCaseCount(b[key]) ? a : b;
  }
  return a[key].length > b[key].length ? a : b;
};

function formatUserCreateTime(regKey) {
  const createTime = tzDayjs(regKey.createTime);
  const currentYear = dayjs().year();
  const expireYear = createTime.year();

  if (settingStore.lang === 'en') {

    if (expireYear === currentYear) {
      return createTime.format('MMM D, HH:mm');
    } else {
      return createTime.format('MMM D, YYYY HH:mm');
    }

  } else {

    if (expireYear === currentYear) {
      return createTime.format('M月D日 HH:mm');
    } else {
      return createTime.format('YYYY年M月D日 HH:mm');
    }

  }

}

function formatExpireTime(expireTime) {
  const expireDate = tzDayjs(expireTime);
  const currentYear = dayjs().year();
  const expireYear = expireDate.year();

  if (settingStore.lang === 'en') {

    return expireYear === currentYear
        ? expireDate.format('MMM D')
        : expireDate.format('MMM D, YYYY');

  } else {

    return expireYear === currentYear
        ? expireDate.format('M月D日')
        : expireDate.format('YYYY年M月D日');

  }
}

function refresh() {
  params.code = null
  getList(true)
}

function search() {
  getList(true)
}

function getList(showLoading = false) {
  if (showLoading) {
    regKeyLoading.value = true
  }
  regKeyList(params).then(list => {
    regKeyData.length = 0
    regKeyData.push(...list)
    regKeyLoading.value = false
    setTimeout(() => {
      regKeyFirst.value = false
    },200)
  })
}

async function copyCode(itemOrCode) {
  const code = typeof itemOrCode === 'object' ? itemOrCode?.code : itemOrCode;
  const isItemMasked = typeof itemOrCode === 'object' ? itemOrCode?.isMasked : false;
  if (isVisitor.value || isItemMasked || (typeof code === 'string' && code.includes('•'))) {
    ElMessage({
      message: '参观者演示模式：注册密钥已启用脱敏保护，禁止复制！',
      type: 'warning',
      plain: true,
    });
    return;
  }
  try {
    await navigator.clipboard.writeText(code);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error('复制失败:', err);
    ElMessage({
      message: '复制失败',
      type: 'error',
      plain: true,
    })
  }
}

function genCode() {
  addForm.code = generateRandomCode()
}

function generateRandomCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function clearNotUse() {
  ElMessageBox.confirm(t('clearRegKey'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    regKeyClearNotUse().then(() => {
      ElMessage({
        message: t('clearSuccess'),
        type: 'success',
        plain: true,
      })
      getList()
    })
  });
}

function submit() {

  if (!addForm.code) {
    ElMessage({
      message: t('emptyRegKeyMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.roleId) {
    ElMessage({
      message: t('emptyRole'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.expireTime) {
    ElMessage({
      message: t('emptyTimeMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.count) {
    ElMessage({
      message: t('emptyCountMsg'),
      type: "error",
      plain: true
    })
    return
  }

  addLoading.value = true
  regKeyAdd(addForm).then(() => {
    showAdd.value = false
    resetForm()
    ElMessage({
      message: t('addSuccessMsg'),
      type: "success",
      plain: true
    })
    getList()
  }).finally(() => {
    addLoading.value = false
  })
}

function deleteRegKey(regKey) {
  ElMessageBox.confirm(t('delConfirm', {msg: regKey.code}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    regKeyDelete([regKey.regKeyId]).then(() => {
      getList()
      ElMessage({
        message: t('delSuccessMsg'),
        type: "success",
        plain: true
      })
    })
  });
}

function resetForm() {
  addForm.code = ''
}

function openAdd() {
  genCode()
  showAdd.value = true
}

</script>

<style scoped lang="scss">
.reg-key {
  height: 100%;
  overflow: hidden;
}

.scrollbar {
  height: calc(100% - 48px);
  position: relative;
  background: var(--bg-base, #f8fafc);
  padding: 14px 16px 16px 16px;
  box-sizing: border-box;

  @media (max-width: 767px) {
    padding: 10px;
  }
  @media (max-width: 372px) {
    height: calc(100% - 85px);
  }

  :deep(.el-scrollbar__bar) {
    display: none !important;
    opacity: 0 !important;
    pointer-events: none !important;
    width: 0 !important;
    height: 0 !important;
  }

  :deep(.el-scrollbar__thumb) {
    display: none !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  :deep(.el-scrollbar__wrap),
  :deep(.el-scrollbar__wrap--hidden-default) {
    background: var(--bg-surface, #ffffff);
    border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
    border-radius: 14px;
    box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.04);
    box-sizing: border-box;
    min-height: 100%;
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;

    &::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
  }

  :deep(.el-scrollbar__view) {
    min-height: 100%;
    box-sizing: border-box;
  }

  .code-box {
    padding: 15px 15px 25px 15px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 15px;

    .code-item {
      background: var(--bg-elevated, var(--el-bg-color));
      border-radius: 10px;
      border: 1px solid var(--border-subtle, var(--el-border-color));
      transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s ease;
      will-change: transform;
      padding: 15px;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 18px -4px rgba(0, 0, 0, 0.08);
      }

      .code-info {
        display: flex;

        .info-left {
          flex: 1;
          min-width: 0;

          .info-left-item {
            display: flex;
            padding-top: 5px;

            .code {
              font-weight: 600;
              font-size: 15.5px;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              cursor: pointer;
              transition: color 0.2s;

              &:hover {
                color: var(--primary-color, #6366f1);
              }
            }

            &.code-row {
              align-items: center;
              gap: 8px;

              .code-masked {
                letter-spacing: 2px;
                color: var(--text-secondary, #94a3b8);
                cursor: not-allowed !important;
                user-select: none;
              }

              .masked-tag {
                font-size: 11px;
                height: 20px;
                line-height: 18px;
                padding: 0 6px;
                border-radius: 4px;
                background: rgba(245, 158, 11, 0.1);
                border-color: rgba(245, 158, 11, 0.25);
                color: #d97706;
              }
            }
          }

          .info-left-item:first-child {
            padding-top: 0;
          }
        }

        .info-right {
          display: flex;
          flex-direction: column;
          padding-top: 2px;
          gap: 5px;

          .setting {
            cursor: pointer;
            border-radius: 6px;
            padding: 4px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;

            &:hover {
              background: var(--bg-surface-variant, rgba(0, 0, 0, 0.05));
            }
          }
        }
      }
    }
  }
}

.empty {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 360px;
  padding: 40px 20px;
  height: 100%;
  box-sizing: border-box;

  .empty-baseplate {
    background: var(--bg-surface, #ffffff);
    padding: 36px 48px;
    border-radius: 14px;
    border: 1px dashed var(--border-subtle, rgba(148, 163, 184, 0.35));
    box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.04);
    display: flex;
    justify-content: center;
    align-items: center;
    max-width: 480px;
    width: 100%;
    box-sizing: border-box;
    transition: all 0.2s ease;

    :deep(.el-empty) {
      padding: 0;

      .el-empty__description p {
        color: var(--text-secondary, #64748b);
        font-weight: 500;
        font-size: 14px;
        margin-bottom: 6px;
      }
    }

    .empty-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      justify-content: center;
      margin-top: 14px;
      flex-wrap: wrap;

      .empty-btn {
        height: 34px;
        padding: 0 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 6px;

        .btn-icon {
          flex-shrink: 0;
        }
      }

      .empty-btn-primary {
        background: var(--primary-color, #6366f1);
        border-color: var(--primary-color, #6366f1);
        color: #ffffff;
        box-shadow: 0 2px 6px color-mix(in srgb, var(--primary-color, #6366f1) 25%, transparent);

        &:hover {
          background: color-mix(in srgb, var(--primary-color, #6366f1) 85%, black);
          border-color: color-mix(in srgb, var(--primary-color, #6366f1) 85%, black);
        }
      }

      .empty-btn-secondary {
        background: var(--bg-elevated, #f8fafc);
        border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.1));
        color: var(--text-primary, #475569);

        &:hover {
          color: var(--primary-color, #6366f1);
          border-color: var(--primary-color, #6366f1);
          background: color-mix(in srgb, var(--primary-color, #6366f1) 6%, transparent);
        }
      }
    }
  }
}

:deep(.history-list.el-dialog) {
  min-height: 300px;
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.history-list .loading {
  position: absolute;
  top: 10px;
  z-index: 0;
  background: rgba(255, 255, 255, 0);
}

:deep(.history-list .el-dialog__header) {
  padding-bottom: 5px;
}


.loading {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--loadding-background);
  z-index: 2;
}

.loading-show {
  transition: all 200ms ease 200ms;
  opacity: 1;
}

.loading-hide {
  pointer-events: none;
  transition: var(--loading-hide-transition);
  opacity: 0;
}

.container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
}

:deep(.el-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.setting {
  cursor: pointer;
}

.gen-code {
  color: #606266;
  cursor: pointer;
}

.header-actions {
  padding: 10px 18px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  background: var(--bg-surface, #ffffff);
  border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
  border-radius: 10px 10px 0 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  font-size: 16px;
  @media (max-width: 767px) {
    gap: 10px;
    padding: 8px 12px;
  }

  .action-btn-pill {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--bg-surface-variant, rgba(0, 0, 0, 0.04));
    border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    color: var(--text-primary, #4b5563);

    &:hover {
      background: var(--primary-color-light, rgba(99, 102, 241, 0.12));
      border-color: rgba(99, 102, 241, 0.35);
      color: #6366f1;
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(99, 102, 241, 0.18);
    }

    &:active {
      transform: translateY(0);
    }
  }

  .search-input {
    width: min(200px, calc(100vw - 140px));
  }

  .search {
    :deep(.el-input__wrapper) {
      border-radius: 8px;
    }
    :deep(.el-input-group) {
      height: 32px;
    }
    :deep(.el-input__inner) {
      height: 32px;
    }
  }

  .icon {
    cursor: pointer;
  }
}

:deep(.el-table__inner-wrapper:before) {
  background: var(--el-bg-color);
}

:global(html.dark) {
  .reg-key .header-actions {
    background: var(--bg-surface, #1e293b) !important;
    border-bottom-color: var(--border-subtle, #334155) !important;
  }

  .reg-key .scrollbar {
    background: var(--bg-base, #0f172a) !important;
  }

  .reg-key :deep(.el-scrollbar__wrap),
  .reg-key :deep(.el-scrollbar__wrap--hidden-default) {
    background: var(--bg-surface, #1e293b) !important;
    border-color: var(--border-subtle, rgba(255, 255, 255, 0.08)) !important;
    box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.3) !important;
  }

  .reg-key .code-box .code-item {
    background: var(--bg-elevated, #243147) !important;
    border-color: var(--border-subtle, rgba(255, 255, 255, 0.08)) !important;
  }

  .reg-key .action-btn-pill {
    background: rgba(255, 255, 255, 0.06) !important;
    border-color: rgba(255, 255, 255, 0.12) !important;
    color: #e2e8f0 !important;

    &:hover {
      background: rgba(99, 102, 241, 0.25) !important;
      border-color: rgba(99, 102, 241, 0.5) !important;
      color: #818cf8 !important;
    }
  }

  .reg-key .empty .empty-baseplate {
    background: var(--bg-elevated, #243147) !important;
    border: 1px dashed rgba(255, 255, 255, 0.15) !important;
    box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.3) !important;

    :deep(.el-empty__description p) {
      color: #94a3b8 !important;
    }

    .empty-actions .empty-btn-secondary {
      background: rgba(255, 255, 255, 0.06) !important;
      border-color: rgba(255, 255, 255, 0.14) !important;
      color: #cbd5e1 !important;

      &:hover {
        color: #818cf8 !important;
        border-color: rgba(99, 102, 241, 0.5) !important;
      }
    }
  }

  .reg-key .code-box .code-item .code-row .masked-tag {
    background: rgba(245, 158, 11, 0.18) !important;
    border-color: rgba(245, 158, 11, 0.4) !important;
    color: #fbbf24 !important;
  }
}

</style>
