<template>
  <div class="header" :class="!hasPerm('email:send') ? 'not-send' : ''">
    <div class="header-left">
      <hanburger @click="changeAside" class="hamburger-btn"></hanburger>
      <img src="/logo.svg" alt="Logo" class="app-logo" />
      <span class="logo-text">EpoCanvas</span>
      <span class="breadcrumb-item" v-if="route.meta.title">{{ $t(route.meta.title) }}</span>
    </div>

    <div class="header-center">
      <div class="search-box">
        <Icon icon="lucide:search" width="18" height="18" class="search-icon"/>
        <input type="text" :placeholder="$t('search') || 'Search'" class="search-input" />
      </div>
    </div>

    <div class="toolbar header-right">
      <div v-if="uiStore.dark" class="sun-icon icon-item" @click="openDark($event)">
        <Icon icon="mingcute:sun-fill"/>
      </div>
      <div v-else class="dark-icon icon-item" @click="openDark($event)">
        <Icon icon="solar:moon-linear"/>
      </div>
      <div class="notice icon-item" @click="openNotice">
        <Icon icon="streamline-plump:announcement-megaphone"/>
      </div>
      <el-dropdown ref="userinfoRef" @visible-change="e => userInfoShow = e" :teleported="false" popper-class="detail-dropdown">
        <div class="avatar" @click="userInfoHide" >
          <div class="avatar-text">
            <div>{{ formatName(userStore.user.email) }}</div>
          </div>
          <Icon class="setting-icon" icon="mingcute:down-small-fill" width="24" height="24"/>
        </div>
        <template #dropdown>
          <div class="user-details">
            <div class="details-avatar">
              {{ formatName(userStore.user.email) }}
            </div>
            <div class="user-name">
              {{ userStore.user.name }}
            </div>
            <div class="detail-email" @click="copyEmail(userStore.user.email)">
              {{ userStore.user.email }}
            </div>
            <div class="detail-user-type">
              <el-tag>{{ userStore.user.role.name }}</el-tag>
            </div>
            <div class="action-info">
              <div>
                <span style="margin-right: 10px">{{ $t('sendCount') }}</span>
                <span style="margin-right: 10px">{{ $t('accountCount') }}</span>
              </div>
              <div>
                <div>
                  <span v-if="sendCount" style="margin-right: 5px">{{ sendCount }}</span>
                  <el-tag v-if="!hasPerm('email:send')">{{ sendType }}</el-tag>
                  <el-tag v-else>{{ sendType }}</el-tag>
                </div>
                <div>
                  <el-tag v-if="settingStore.settings.manyEmail || settingStore.settings.addEmail">
                    {{ $t('disabled') }}
                  </el-tag>
                  <span v-else-if="accountCount && hasPerm('account:add')"
                        style="margin-right: 5px">{{ $t('totalUserAccount', {msg: accountCount}) }}</span>
                  <el-tag v-else-if="!accountCount && hasPerm('account:add')">{{ $t('unlimited') }}</el-tag>
                  <el-tag v-else-if="!hasPerm('account:add')">{{ $t('unauthorized') }}</el-tag>
                </div>
              </div>
            </div>

            <!-- Quota UI section -->
            <div v-if="userStore.user.quota" class="quota-dropdown-section">
               <div class="quota-title">Storage Quota</div>
               <el-progress 
                 :percentage="storagePercent" 
                 :status="storageStatus" 
                 :stroke-width="6"
                 :show-text="false"
               />
               <div class="quota-text">
                  <template v-if="isDbFull && !isAdmin">Full</template>
                  <template v-else>
                     {{ formatSize(userStore.user.quota.usedStorageBytes) }} / {{ userStore.user.quota.maxStorageMB }} MB
                  </template>
               </div>
               
               <div class="quota-title" style="margin-top: 8px;">Email Quota</div>
               <el-progress 
                 :percentage="emailPercent" 
                 :status="emailStatus"
                 :stroke-width="6"
                 :show-text="false"
               />
               <div class="quota-text">
                  <template v-if="isDbFull && !isAdmin">Full</template>
                  <template v-else>
                     {{ userStore.user.quota.usedEmails }} / {{ userStore.user.quota.maxEmails }}
                  </template>
               </div>
            </div>

            <div class="logout">
              <el-button type="primary" :loading="logoutLoading" @click="clickLogout">{{ $t('logOut') }}</el-button>
            </div>
          </div>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
import router from "@/router";
import hanburger from '@/components/hamburger/index.vue'
import {logout} from "@/request/login.js";
import {Icon} from "@iconify/vue";
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import {useRoute} from "vue-router";
import {computed, ref} from "vue";
import {useSettingStore} from "@/store/setting.js";
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import {setExtend} from "@/utils/day.js"

const {t} = useI18n();
const route = useRoute();
const settingStore = useSettingStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const logoutLoading = ref(false)
const userInfoShow = ref(false)
const userinfoRef = ref({})

const accountCount = computed(() => {
  return userStore.user.role.accountCount
})

const sendType = computed(() => {

  if (settingStore.settings.send === 1) {
    return t('disabled')
  }

  if (!hasPerm('email:send')) {
    return t('unauthorized')
  }

  if (userStore.user.role.sendType === 'ban') {
    return t('sendBanned')
  }

  if (userStore.user.role.sendType === 'internal') {
    return t('sendInternal')
  }

  if (!userStore.user.role.sendCount) {
    return t('unlimited')
  }

  if (userStore.user.role.sendType === 'day') {
    return t('daily')
  }

  if (userStore.user.role.sendType === 'count') {
    return t('total')
  }
})

const sendCount = computed(() => {


  if (!hasPerm('email:send')) {
    return null
  }

  if (userStore.user.role.sendType === 'ban') {
    return null
  }

  if (userStore.user.role.sendType === 'internal') {
    return null
  }

  if (!userStore.user.role.sendCount) {
    return null
  }

  if (settingStore.settings.send === 1) {
    return null
  }

  return userStore.user.sendCount + '/' + userStore.user.role.sendCount
})

const isDbFull = computed(() => userStore.user.quota?.dbFull);
const isAdmin = computed(() => userStore.user.type === 0);

const storagePercent = computed(() => {
  if (!userStore.user.quota) return 0;
  if (isDbFull.value && !isAdmin.value) return 100;
  return Math.min(100, Math.round((userStore.user.quota.usedStorageBytes / userStore.user.quota.maxStorageBytes) * 100));
});

const storageStatus = computed(() => {
  if (isDbFull.value) return 'exception';
  return storagePercent.value >= 100 ? 'exception' : '';
});

const emailPercent = computed(() => {
  if (!userStore.user.quota) return 0;
  if (isDbFull.value && !isAdmin.value) return 100;
  return Math.min(100, Math.round((userStore.user.quota.usedEmails / userStore.user.quota.maxEmails) * 100));
});

const emailStatus = computed(() => {
  if (isDbFull.value) return 'exception';
  return emailPercent.value >= 100 ? 'exception' : '';
});

const formatSize = (bytes) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

function userInfoHide(e) {
    if (userInfoShow.value) {
        userinfoRef.value.handleClose()
    } else {
        userinfoRef.value.handleOpen()
    }
}

async function copyEmail(email) {
  try {
    await navigator.clipboard.writeText(email);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true,
    })
  }
}

function changeLang(lang) {
  setExtend(lang === 'en' ? 'en' : 'zh-cn')
  settingStore.lang = lang
}

function openNotice() {
  uiStore.showNotice()
}

function openDark(e) {

  const nextIsDark = !uiStore.dark
  const root = document.documentElement

  if (!document.startViewTransition) {
    switchDark(nextIsDark, root);
    return
  }

  const x = e.clientX
  const y = e.clientY

  const maxX = Math.max(x, window.innerWidth - x)
  const maxY = Math.max(y, window.innerHeight - y)
  const endRadius = Math.hypot(maxX, maxY)

  // 标记切换目标，供 CSS 选择器使用
  root.setAttribute('data-theme-to', nextIsDark ? 'dark' : 'light')
  root.style.setProperty('--vt-x', `${x}px`)
  root.style.setProperty('--vt-y', `${y}px`)
  root.style.setProperty('--vt-end-radius', `${endRadius + 10}px`)

  const transition = document.startViewTransition(() => {
    switchDark(nextIsDark, root);
  })

  transition.finished.finally(() => {
    // 清理标记
    root.removeAttribute('data-theme-to')
  })
}

function switchDark(nextIsDark, root) {
  root.setAttribute('class', nextIsDark ? 'dark' : '')
  const metaTag = document.getElementById('theme-color-meta');
  const isMobile =  !window.matchMedia("(pointer: fine) and (hover: hover)").matches;
  metaTag.setAttribute('content', nextIsDark ? (isMobile ? '#141414' : '#000000') : (isMobile ? '#FFFFFF' : '#F1F1F1'));
  uiStore.dark = nextIsDark
}



function changeAside() {
  uiStore.asideShow = !uiStore.asideShow
}

function clickLogout() {
  logoutLoading.value = true
  logout().then(() => {
    localStorage.removeItem("token")
    router.replace('/login')
  }).finally(() => {
    logoutLoading.value = false
  })
}

function formatName(email) {
  return email?.[0]?.toUpperCase() || ''
}

</script>
<style>
.detail-dropdown {
  color: var(--el-text-color-primary) !important;
}
</style>
<style lang="scss" scoped>

:deep(.el-popper.is-pure) {
  border-radius: 6px;
}

.user-details {
  width: 250px;
  font-size: 14px;
  display: grid;
  grid-template-columns: 1fr;
  justify-items: center;

  .user-name {
    font-weight: bold;
    margin-top: 10px;
    padding-left: 20px;
    padding-right: 20px;
    width: 250px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
  }

  .detail-user-type {
    margin-top: 10px;
  }

  .action-info {
    width: 100%;
    display: grid;
    grid-template-columns: auto auto;
    margin-top: 10px;

    > div:first-child {
      display: grid;
      align-items: center;
      gap: 10px;
    }

    > div:last-child {
      display: grid;
      gap: 10px;
      text-align: center;

      > div {
        display: flex;
        align-items: center;
      }
    }
  }

  .detail-email {
    padding-left: 20px;
    padding-right: 20px;
    width: 250px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
    color: var(--regular-text-color);
    cursor: pointer;
  }

  .logout {
    margin-top: 20px;
    width: 100%;
    padding-left: 10px;
    padding-right: 10px;
    padding-bottom: 10px;

    .el-button {
      border-radius: 6px;
      height: 28px;
      width: 100%;
    }
  }

  .details-avatar {
    margin-top: 20px;
    height: 40px;
    width: 40px;
    background: var(--el-bg-color);
    color: var(--el-text-color-primary);
    border: 1px solid var(--dark-border);
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
  }

  .quota-dropdown-section {
    width: 100%;
    padding: 15px 20px 0;
    margin-top: 15px;
    border-top: 1px solid var(--el-border-color-lighter);
  }

  .quota-title {
    font-size: 12px;
    color: var(--secondary-text-color);
    margin-bottom: 4px;
    text-align: left;
  }

  .quota-text {
    font-size: 12px;
    color: var(--regular-text-color);
    text-align: right;
    margin-top: 2px;
  }
}

.app-logo {
  height: 24px;
  width: auto;
  margin-left: 8px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));
}


.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 16px;
  color: var(--header-text-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 250px;
}

.hamburger-btn {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.logo-text {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--header-text-color);
  margin-right: 16px;
  white-space: nowrap;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
  margin: 0 20px;
}

.search-box {
  width: 100%;
  max-width: 480px;
  height: 36px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  transition: all 0.2s ease;
  border: 1px solid transparent;

  &:hover, &:focus-within {
    background: rgba(255, 255, 255, 0.25);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .search-icon {
    color: var(--header-text-color);
    opacity: 0.8;
    margin-right: 8px;
  }

  .search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--header-text-color);
    font-size: 14px;
    
    &::placeholder {
      color: rgba(255, 255, 255, 0.6);
    }
  }
}

.header-right {
  min-width: 250px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 5px;
}

.breadcrumb-item {
  font-weight: 500;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  border-left: 1px solid rgba(255, 255, 255, 0.2);
  padding-left: 16px;
}

.toolbar {
  display: flex;
  justify-content: end;
  gap: 15px;
  @media (max-width: 767px) {
    gap: 10px;
  }

  .icon-item {
    align-self: center;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--header-text-color);
    transition: all 0.2s ease;
  }

  .icon-item:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #ffffff;
  }

  .notice {
    font-size: 22px;
    margin-right: 4px;
  }

  .dark-icon {
    font-size: 20px;
  }

  .sun-icon {
    font-size: 24px;
  }

  .avatar {
    display: flex;
    align-items: center;
    cursor: pointer;

    .avatar-text {
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
      height: 34px;
      width: 34px;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 50%;
      border: none;
      font-weight: bold;
      transition: transform 0.2s ease;
    }
    
    .avatar-text:hover {
      transform: scale(1.05);
    }

    .setting-icon {
      position: relative;
      top: 0;
      margin-right: 10px;
      bottom: 10px;
    }
  }

}

.el-tooltip__trigger:first-child:focus-visible {
  outline: unset;
}
</style>
