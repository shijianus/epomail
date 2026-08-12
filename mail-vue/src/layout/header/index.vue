<template>
  <div class="topbar" :class="!hasPerm('email:send') ? 'not-send' : ''">
    <button class="brand-toggle" id="sidebarToggle" @click="changeAside">
      <img src="/logo.svg" alt="Logo" class="brand-logo" />
      <span class="brand-name">EpoCanvas</span>
    </button>

    <div class="topbar-search">
      <span class="search-icon"><Icon icon="lucide:search" width="16" height="16"/></span>
      <input type="text" :placeholder="$t('search') || '搜索邮件、联系人、文件…'" />
    </div>

    <div class="topbar-actions">
      <el-tooltip :content="uiStore.dark ? ($t('lightMode') || 'Light Mode') : ($t('darkMode') || 'Dark Mode')" placement="bottom">
        <button v-if="uiStore.dark" class="icon-btn" @click="openDark($event)">
          <Icon icon="lucide:sun" width="20" height="20"/>
        </button>
        <button v-else class="icon-btn" @click="openDark($event)">
          <Icon icon="lucide:moon" width="20" height="20"/>
        </button>
      </el-tooltip>
      <el-tooltip :content="$t('notice') || 'Notice'" placement="bottom">
        <button class="icon-btn" @click="openNotice">
          <Icon icon="lucide:bell" width="20" height="20"/>
          <span class="badge"></span>
        </button>
      </el-tooltip>
      <el-dropdown ref="userinfoRef" @visible-change="e => userInfoShow = e" :teleported="false" popper-class="detail-dropdown">
        <div class="avatar-wrap">
          <div class="avatar" @click="userInfoHide">{{ formatName(userStore.user.email) }}</div>
        </div>
        <template #dropdown>
          <div class="user-details account-menu open" style="position:relative;top:0;transform:none;opacity:1;box-shadow:none;border:none;">
            <div class="am-header">
              <div class="am-avatar">{{ formatName(userStore.user.email) }}</div>
              <div style="overflow:hidden">
                <div class="am-name">{{ userStore.user.name }}</div>
                <div class="am-email" @click="copyEmail(userStore.user.email)" style="cursor:pointer">{{ userStore.user.email }}</div>
                <div class="am-status"><span class="status-dot"></span><span>{{ userStore.user.role.name }}</span></div>
              </div>
            </div>
            <div v-if="userStore.user.quota" class="am-storage">
              <div class="am-storage-label">
                <span>Storage</span>
                <span v-if="isDbFull && !isAdmin">Full</span>
                <span v-else>{{ formatSize(userStore.user.quota.usedStorageBytes) }} / {{ userStore.user.quota.maxStorageMB }} MB</span>
              </div>
              <div class="storage-bar">
                <div class="storage-fill" :style="{width: storagePercent + '%', background: storageStatus === 'exception' ? 'var(--danger)' : ''}"></div>
              </div>
            </div>
            <div class="am-item"><Icon class="ic ic-sm" icon="lucide:user" /><span>Account Details</span></div>
            <div class="am-item"><Icon class="ic ic-sm" icon="lucide:settings" /><span>Settings</span></div>
            <div class="am-item logout" @click="clickLogout"><Icon class="ic ic-sm" icon="lucide:log-out" /><span>{{ $t('logOut') }}</span></div>
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
  background: var(--bg-elevated) !important;
  border: 1px solid var(--border-mid) !important;
  border-radius: 12px !important;
  padding: 0 !important;
  overflow: hidden;
}
.detail-dropdown .el-popper__arrow::before {
  background: var(--bg-elevated) !important;
  border-color: var(--border-mid) !important;
}
</style>
<style lang="scss" scoped>
.topbar { 
  height: 56px; 
  background: var(--bg-surface); 
  display: flex; 
  align-items: center; 
  gap: 16px; 
  padding: 0 16px; 
  flex-shrink: 0; 
  z-index: 100; 
}
.brand-toggle { 
  display: flex; 
  align-items: center; 
  gap: 10px; 
  background: none; 
  border: none; 
  cursor: pointer; 
  padding: 0; 
}
.brand-logo { 
  width: 28px; 
  height: 28px; 
  object-fit: contain;
  transition: transform .25s var(--ease);
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));
}
.brand-toggle:hover .brand-logo { transform: rotate(-8deg) scale(1.05); }
.brand-toggle:active .brand-logo { transform: scale(.92); }
.brand-name { 
  font-size: 16px; 
  font-weight: 700; 
  background: linear-gradient(90deg, #8b9cff, #b07ff5); 
  -webkit-background-clip: text; 
  -webkit-text-fill-color: transparent; 
  letter-spacing: .5px; 
}
.topbar-search { 
  flex: 1; 
  max-width: 580px; 
  position: relative; 
  margin: 0 24px;
}
.topbar-search input { 
  width: 100%; 
  height: 36px; 
  background: var(--bg-elevated); 
  border: 1px solid var(--border-mid); 
  border-radius: 18px; 
  color: var(--text-primary); 
  padding: 0 16px 0 40px; 
  font-size: 13.5px; 
  outline: none; 
  transition: border-color .2s, box-shadow .2s; 
}
.topbar-search input::placeholder { color: var(--text-muted); }
.topbar-search input:focus { border-color: var(--accent-primary); box-shadow: 0 0 0 3px var(--accent-glow); }
.topbar-search .search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.topbar-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.icon-btn { 
  width: 36px; 
  height: 36px; 
  border: none; 
  background: transparent; 
  cursor: pointer; 
  color: var(--text-secondary); 
  border-radius: 10px; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  transition: background .15s, color .15s, transform .1s; 
  position: relative; 
  overflow: hidden; 
}
.icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.icon-btn:active { transform: scale(.9); }
.icon-btn .badge { 
  position: absolute; 
  top: 7px; 
  right: 7px; 
  width: 8px; 
  height: 8px; 
  background: var(--accent-primary); 
  border-radius: 50%; 
  border: 2px solid var(--bg-surface); 
  animation: pulse 2s var(--ease) infinite; 
}
@keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(91,110,245,.5);} 50%{box-shadow:0 0 0 4px rgba(91,110,245,0);} }
.avatar-wrap { position: relative; display: flex; align-items: center; margin-left: 4px;}
.avatar { 
  width: 32px; 
  height: 32px; 
  border-radius: 50%; 
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  font-size: 13px; 
  font-weight: 700; 
  color: #fff; 
  cursor: pointer; 
  border: 2px solid var(--border-mid); 
  transition: border-color .2s, transform .15s; 
}
.avatar:hover { border-color: var(--accent-primary); transform: scale(1.05); }

/* Account Menu Dropdown */
.account-menu { width: 264px; background: transparent; }
.am-header { padding: 16px; display: flex; gap: 12px; align-items: center; background: linear-gradient(135deg, rgba(91,110,245,.2), rgba(124,92,191,.2)); border-bottom: 1px solid var(--border-subtle); }
.am-avatar { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: #fff; flex-shrink: 0; }
.am-name { font-size: 14px; font-weight: 700; color: var(--text-primary); text-align: left; }
.am-email { font-size: 11px; color: var(--text-muted); text-align: left;}
.am-status { display: flex; align-items: center; gap: 5px; margin-top: 3px; }
.am-status span { font-size: 10.5px; color: var(--success); }
.am-storage { padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); }
.am-storage-label { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); margin-bottom: 6px; }
.storage-bar { height: 6px; background: var(--bg-hover); border-radius: 3px; overflow: hidden; }
.storage-fill { height: 100%; background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary)); border-radius: 3px; transition: width .3s ease; }
.am-item { padding: 10px 16px; display: flex; align-items: center; gap: 11px; cursor: pointer; color: var(--text-secondary); font-size: 13px; transition: background .15s, color .15s; }
.am-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.am-item.logout:hover { color: var(--danger); }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); box-shadow: 0 0 6px var(--success); }
.ic { display: flex; }
</style>
