<template>
  <div class="reg-key">
    <div class="header-actions">
      <div class="header-left">
        <div class="header-title-box">
          <Icon class="title-icon" icon="fluent:key-multiple-20-regular" width="20" height="20"/>
          <span class="main-title">{{ $t('regKey') || '注册密钥' }}</span>
          <span class="count-bubble" v-if="!regKeyLoading">{{ regKeyData.length }}</span>
        </div>
      </div>

      <div class="header-right">
        <div class="action-btn-pill action-btn-add" @click="openAdd" :title="$t('add') || '添加注册码'">
          <Icon class="icon" icon="fluent:add-circle-20-regular" width="18" height="18"/>
        </div>
        <div class="search">
          <el-input
              v-model="params.code"
              class="search-input"
              :placeholder="$t('searchRegKeyDesc')"
              @keyup.enter="search"
              clearable
              @clear="clearSearch"
          >
            <template #prefix>
              <Icon icon="fluent:search-16-regular" width="15" height="15" class="search-prefix-icon" />
            </template>
          </el-input>
        </div>
        <div class="action-btn-pill" @click="search" :title="$t('search')">
          <Icon class="icon" icon="fluent:search-16-regular" width="17" height="17"/>
        </div>
        <div class="action-btn-pill" @click="refresh" :title="$t('refresh')">
          <Icon class="icon" icon="fluent:arrow-clockwise-16-regular" width="16" height="16"/>
        </div>
        <div class="action-btn-pill" @click="clearNotUse" :title="$t('clearUnused') || '清理无用注册码'">
          <Icon class="icon" icon="fluent:broom-sparkle-16-regular" width="17" height="17"/>
        </div>
      </div>
    </div>

    <div v-if="isVisitor" class="visitor-notice-bar">
      <Icon class="notice-icon" icon="solar:shield-warning-bold" width="16" height="16" />
      <span>参观者演示模式：注册密钥与使用记录已启用安全脱敏保护，仅供体验管理界面与交互流程，不可复制生产密钥。</span>
    </div>

    <el-scrollbar class="scrollbar">
      <div class="loading" :class="regKeyLoading ? 'loading-show' : 'loading-hide'" :style="regKeyFirst ? 'background: transparent' : ''">
        <loading/>
      </div>

      <div class="code-box" v-if="regKeyData.length > 0">
        <div class="code-item" v-for="item in regKeyData" :key="item.regKeyId || item.code">
          <div class="code-card-header">
            <div class="code-val-wrap">
              <span class="code code-val font-mono" :class="{ 'code-masked': isVisitor || item.isMasked }" @click="copyCode(item)" :title="isVisitor ? '脱敏保护' : '点击复制密钥'">
                {{ item.code }}
              </span>
              <el-tag v-if="isVisitor || item.isMasked" size="small" type="warning" effect="plain" class="masked-tag">
                脱敏保护
              </el-tag>
              <el-tooltip v-else :content="$t('copy') || '复制'" placement="top">
                <span class="copy-btn-mini" @click="copyCode(item)">
                  <Icon icon="fluent:copy-16-regular" width="14" height="14" />
                </span>
              </el-tooltip>
            </div>

            <el-dropdown class="setting" trigger="click">
              <div class="setting-btn-pill" :title="$t('settings') || '操作'">
                <Icon icon="fluent:more-horizontal-20-regular" width="18" height="18" />
              </div>
              <template #dropdown>
                <el-dropdown-menu class="code-action-menu">
                  <el-dropdown-item @click="copyCode(item)">
                    <Icon icon="fluent:copy-16-regular" width="15" height="15" style="margin-right: 6px;" />
                    <span>{{ $t('copy') }}</span>
                  </el-dropdown-item>
                  <el-dropdown-item @click="openHistory(item)">
                    <Icon icon="fluent:history-16-regular" width="15" height="15" style="margin-right: 6px;" />
                    <span>{{ $t('history') }}</span>
                  </el-dropdown-item>
                  <el-dropdown-item divided @click="deleteRegKey(item)" style="color: #ef4444;">
                    <Icon icon="fluent:delete-16-regular" width="15" height="15" style="margin-right: 6px;" />
                    <span>{{ $t('delete') }}</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <div class="code-props-grid">
            <div class="prop-item">
              <span class="prop-label">{{ $t('remainingUses') }}：</span>
              <span v-if="item.count" class="prop-badge count-badge font-mono">
                <Icon icon="fluent:ticket-horizontal-16-regular" width="13" height="13" />
                <span>{{ item.count }} 次</span>
              </span>
              <el-tag v-else size="small" type="danger" effect="plain" class="status-tag">
                {{ $t('exhausted') }}
              </el-tag>
            </div>

            <div class="prop-item">
              <span class="prop-label">{{ $t('roleDesc') }}：</span>
              <span class="prop-role-chip">
                {{ item.roleName }}
              </span>
            </div>

            <div class="prop-item">
              <span class="prop-label">{{ $t('validUntil') }}：</span>
              <span v-if="item.expireTime" class="prop-date">
                <Icon icon="fluent:calendar-ltr-16-regular" width="13" height="13" />
                <span>{{ formatExpireTime(item.expireTime) }}</span>
              </span>
              <el-tag v-else size="small" type="danger" effect="plain" class="status-tag">
                {{ $t('expired') }}
              </el-tag>
            </div>
          </div>
        </div>
      </div>

      <!-- 优化后的高级现代化 Empty Baseplate -->
      <div class="empty" v-if="regKeyData.length === 0">
        <div class="empty-baseplate" v-if="!regKeyFirst">
          <div class="empty-icon-box">
            <Icon icon="fluent:key-20-regular" width="34" height="34" />
          </div>
          <div class="empty-title">
            {{ params.code ? ($t('noSearchResult') || '未找到匹配的注册码') : ($t('noCodeFound') || '暂无注册密钥') }}
          </div>
          <div class="empty-desc">
            {{ params.code ? `未检索到包含「${params.code}」的密钥。请检查输入拼写，或点击下方按钮清空搜索条件。` : '当前尚未生成任何注册密钥。您可以立即创建包含指定身份组、有效期与使用次数限制的注册码供新用户兑换激活。' }}
          </div>
          <div class="empty-actions">
            <el-button type="primary" class="empty-btn-primary" @click="openAdd">
              <Icon icon="fluent:add-circle-20-regular" width="16" height="16" style="margin-right: 5px;" />
              <span>{{ $t('addRegKey') || '立即创建注册码' }}</span>
            </el-button>
            <el-button v-if="params.code" class="empty-btn-secondary" @click="clearSearch">
              <Icon icon="fluent:dismiss-circle-16-regular" width="15" height="15" style="margin-right: 5px;" />
              <span>{{ $t('clearSearch') || '清空搜索条件' }}</span>
            </el-button>
            <el-button v-else class="empty-btn-secondary" @click="refresh">
              <Icon icon="fluent:arrow-clockwise-16-regular" width="15" height="15" style="margin-right: 5px;" />
              <span>{{ $t('refresh') || '刷新列表' }}</span>
            </el-button>
          </div>
        </div>
      </div>
    </el-scrollbar>

    <el-dialog v-model="showAdd" :title="$t('addRegKey')">
      <div class="container">
        <el-input v-model="addForm.code" :placeholder="$t('regKey')">
          <template #suffix>
            <el-tooltip content="随机生成注册码" placement="top">
              <Icon @click.stop="genCode" class="gen-code" icon="fluent:sparkle-16-regular" width="20" height="20"/>
            </el-tooltip>
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

function clearSearch() {
  params.code = ''
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
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header-actions {
  padding: 10px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  background: var(--bg-surface, #ffffff);
  border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));
  border-radius: 10px 10px 0 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  font-size: 16px;

  @media (max-width: 767px) {
    gap: 10px;
    padding: 8px 12px;
  }

  .header-left {
    display: flex;
    align-items: center;

    .header-title-box {
      display: flex;
      align-items: center;
      gap: 8px;

      .title-icon {
        color: var(--primary-color, #6366f1);
      }

      .main-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--text-primary, #1e293b);
        letter-spacing: -0.2px;
      }

      .count-bubble {
        background: color-mix(in srgb, var(--primary-color, #6366f1) 12%, transparent);
        color: var(--primary-color, #6366f1);
        font-size: 12px;
        font-weight: 700;
        padding: 1px 8px;
        border-radius: 12px;
      }
    }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;

    .search-input {
      width: min(200px, calc(100vw - 140px));

      :deep(.el-input__wrapper) {
        border-radius: 8px;
        height: 32px;
        background: var(--bg-elevated, #f8fafc);
        box-shadow: 0 0 0 1px var(--border-subtle, rgba(0, 0, 0, 0.1)) inset;
        transition: all 0.2s ease;

        &:hover {
          box-shadow: 0 0 0 1px var(--primary-color, #6366f1) inset;
        }
        &.is-focus {
          box-shadow: 0 0 0 1.5px var(--primary-color, #6366f1) inset;
        }
      }

      .search-prefix-icon {
        color: var(--text-muted, #94a3b8);
        margin-right: 2px;
      }
    }

    .search {
      :deep(.el-input__inner) {
        height: 32px;
      }
    }
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
      color: var(--primary-color, #6366f1);
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(99, 102, 241, 0.18);
    }

    &:active {
      transform: translateY(0);
    }

    &.action-btn-add {
      background: var(--primary-color, #6366f1);
      border-color: var(--primary-color, #6366f1);
      color: #ffffff;
      box-shadow: 0 2px 6px color-mix(in srgb, var(--primary-color, #6366f1) 25%, transparent);

      &:hover {
        background: color-mix(in srgb, var(--primary-color, #6366f1) 85%, #000);
        color: #ffffff;
        border-color: color-mix(in srgb, var(--primary-color, #6366f1) 85%, #000);
        box-shadow: 0 4px 10px color-mix(in srgb, var(--primary-color, #6366f1) 35%, transparent);
      }
    }
  }

  .icon {
    cursor: pointer;
  }
}

.visitor-notice-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  background: rgba(245, 158, 11, 0.08);
  border-bottom: 1px solid rgba(245, 158, 11, 0.2);
  color: #b45309;
  font-size: 13px;
  line-height: 1.5;
  font-weight: 500;

  .notice-icon {
    flex-shrink: 0;
    color: #f59e0b;
  }
}

.scrollbar {
  flex: 1;
  height: 100%;
  position: relative;
  background: var(--bg-base, #f8fafc);
  padding: 14px 16px 16px 16px;
  box-sizing: border-box;

  @media (max-width: 767px) {
    padding: 10px;
  }

  /* --- 彻底删除 Element Plus 虚拟滚动条与滑块 --- */
  :deep(.el-scrollbar__bar) {
    display: none !important;
    opacity: 0 !important;
    pointer-events: none !important;
    width: 0 !important;
    height: 0 !important;
  }

  :deep(.el-scrollbar__thumb) {
    display: none !important;
  }

  /* --- 整体模板底板卡片，且彻底隐藏浏览器原生滑块 --- */
  :deep(.el-scrollbar__wrap),
  :deep(.el-scrollbar__wrap--hidden-default) {
    background: var(--bg-surface, #ffffff);
    border: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.08));
    border-radius: 14px;
    box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.04);
    box-sizing: border-box;
    min-height: 100%;
    scrollbar-width: none !important; /* Firefox 消除滑块 */
    -ms-overflow-style: none !important; /* IE 10+ 消除滑块 */

    &::-webkit-scrollbar {
      display: none !important; /* Webkit / Chrome / Safari 消除滑块 */
      width: 0 !important;
      height: 0 !important;
    }
  }

  :deep(.el-scrollbar__view) {
    min-height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }

  .code-box {
    padding: 16px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 15px;

    .code-item {
      background: var(--bg-elevated, var(--el-bg-color));
      border-radius: 12px;
      border: 1px solid var(--border-subtle, var(--el-border-color));
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
      transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s ease;
      will-change: transform;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;

      &:hover {
        transform: translateY(-2px);
        border-color: color-mix(in srgb, var(--primary-color, #6366f1) 35%, var(--border-subtle, #e2e8f0));
        box-shadow: 0 6px 18px -4px rgba(0, 0, 0, 0.08);
      }

      .code-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--border-subtle, rgba(0, 0, 0, 0.06));

        .code-val-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;

          .code-val {
            font-family: monospace;
            font-weight: 700;
            font-size: 15px;
            color: var(--text-primary, #0f172a);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            cursor: pointer;
            transition: color 0.15s ease;

            &:hover {
              color: var(--primary-color, #6366f1);
            }

            &.code-masked {
              letter-spacing: 2px;
              color: var(--text-secondary, #94a3b8);
              cursor: not-allowed !important;
              user-select: none;
            }
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
            flex-shrink: 0;
          }

          .copy-btn-mini {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            border-radius: 6px;
            color: var(--text-muted, #94a3b8);
            cursor: pointer;
            transition: all 0.2s ease;

            &:hover {
              color: var(--primary-color, #6366f1);
              background: rgba(99, 102, 241, 0.1);
            }
          }
        }

        .setting-btn-pill {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted, #94a3b8);
          cursor: pointer;
          transition: all 0.2s ease;

          &:hover {
            color: var(--text-primary, #334155);
            background: rgba(0, 0, 0, 0.05);
          }
        }
      }

      .code-props-grid {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 12.5px;

        .prop-item {
          display: flex;
          align-items: center;
          justify-content: space-between;

          .prop-label {
            color: var(--text-secondary, #64748b);
          }

          .prop-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
            font-weight: 600;
            color: var(--text-primary, #1e293b);
          }

          .prop-role-chip {
            display: inline-flex;
            align-items: center;
            font-size: 11.5px;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 6px;
            background: color-mix(in srgb, var(--primary-color, #6366f1) 10%, transparent);
            color: var(--primary-color, #6366f1);
          }

          .prop-date {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
            color: var(--text-primary, #334155);
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
  min-height: 400px;
  padding: 40px 20px;
  height: 100%;
  flex: 1;
  box-sizing: border-box;

  .empty-baseplate {
    position: relative;
    z-index: 1;
    background: var(--bg-surface, #ffffff);
    padding: 42px 48px;
    max-width: 480px;
    width: 100%;
    border-radius: 14px;
    border: 1px dashed var(--border-subtle, rgba(148, 163, 184, 0.35));
    box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.05);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    box-sizing: border-box;
    transition: all 0.2s ease;

    .empty-icon-box {
      width: 64px;
      height: 64px;
      border-radius: 18px;
      background: color-mix(in srgb, var(--primary-color, #6366f1) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--primary-color, #6366f1) 22%, transparent);
      color: var(--primary-color, #6366f1);
      box-shadow: 0 4px 14px color-mix(in srgb, var(--primary-color, #6366f1) 15%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
    }

    .empty-title {
      font-size: 17px;
      font-weight: 700;
      color: var(--text-primary, #0f172a);
      margin-bottom: 8px;
      letter-spacing: -0.2px;
    }

    .empty-desc {
      font-size: 13.5px;
      color: var(--text-secondary, #64748b);
      line-height: 1.6;
      max-width: 380px;
      margin-bottom: 22px;
    }

    .empty-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: center;

      .empty-btn-primary {
        border-radius: 8px;
        font-weight: 600;
        height: 36px;
        padding: 0 18px;
      }

      .empty-btn-secondary {
        border-radius: 8px;
        font-weight: 500;
        height: 36px;
        padding: 0 16px;
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
  transition: color 0.2s;

  &:hover {
    color: var(--primary-color, #6366f1);
  }
}

:deep(.el-table__inner-wrapper:before) {
  background: var(--el-bg-color);
}

:global(html.dark) {
  .reg-key .header-actions {
    background: var(--bg-surface, #1e293b) !important;
    border-bottom-color: var(--border-subtle, #334155) !important;

    .header-left .main-title {
      color: #f1f5f9 !important;
    }

    .header-right .search-input :deep(.el-input__wrapper) {
      background: var(--bg-elevated, #243147) !important;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12) inset !important;
    }
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
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2) !important;

    &:hover {
      border-color: rgba(99, 102, 241, 0.4) !important;
      box-shadow: 0 6px 20px -4px rgba(0, 0, 0, 0.4) !important;
    }

    .code-card-header {
      border-bottom-color: rgba(255, 255, 255, 0.08) !important;

      .code-val-wrap .code-val {
        color: #f1f5f9 !important;
      }

      .setting-btn-pill:hover {
        background: rgba(255, 255, 255, 0.08) !important;
        color: #e2e8f0 !important;
      }
    }

    .code-props-grid .prop-item {
      .prop-label {
        color: #94a3b8 !important;
      }
      .prop-badge {
        color: #e2e8f0 !important;
      }
      .prop-date {
        color: #cbd5e1 !important;
      }
    }
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

    &.action-btn-add {
      background: rgba(99, 102, 241, 0.2) !important;
      border-color: rgba(99, 102, 241, 0.4) !important;
      color: #818cf8 !important;

      &:hover {
        background: #6366f1 !important;
        color: #ffffff !important;
      }
    }
  }

  .reg-key .visitor-notice-bar {
    background: rgba(245, 158, 11, 0.15) !important;
    border-bottom-color: rgba(245, 158, 11, 0.3) !important;
    color: #fbbf24 !important;

    .notice-icon {
      color: #fbbf24 !important;
    }
  }

  .reg-key .empty .empty-baseplate {
    background: var(--bg-elevated, #243147) !important;
    border: 1px dashed rgba(255, 255, 255, 0.15) !important;
    box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.3) !important;

    .empty-title {
      color: #f1f5f9 !important;
    }

    .empty-desc {
      color: #94a3b8 !important;
    }

    .empty-actions .empty-btn-secondary {
      background: rgba(255, 255, 255, 0.06) !important;
      border-color: rgba(255, 255, 255, 0.12) !important;
      color: #cbd5e1 !important;

      &:hover {
        color: #818cf8 !important;
        border-color: rgba(99, 102, 241, 0.4) !important;
      }
    }
  }

  .reg-key .code-box .code-item .code-row .masked-tag,
  .reg-key .code-box .code-item .masked-tag {
    background: rgba(245, 158, 11, 0.18) !important;
    border-color: rgba(245, 158, 11, 0.4) !important;
    color: #fbbf24 !important;
  }
}
</style>
