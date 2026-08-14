<template>
  <div class="topbar" :class="!hasPerm('email:send') ? 'not-send' : ''">
    <!-- Left Section: Logo acting as toggle -->
    <div class="topbar-left">
      <div class="brand-wrapper" @click="changeAside" style="cursor:pointer" :title="$t('toggleSidebar') || 'Toggle Sidebar'">
        <img src="/logo.svg" alt="Logo" class="brand-logo" />
        <span class="brand-name">EpoCanvas</span>
      </div>
    </div>

    <!-- Middle Section: Search -->
    <div class="topbar-search">
      <div class="search-box">
        <span class="search-icon" @click="handleSearch" style="cursor: pointer; z-index: 1"><Icon icon="lucide:search" width="20" height="20"/></span>
        <input type="text" :placeholder="isSettingsMode ? ($t('searchSettings') || 'Search settings') : ($t('search') || 'Search mail')" v-model="emailStore.searchKeyword" @keyup.enter="handleSearch" @focus="searchFocus = true" @blur="onSearchBlur" />
        
        <div v-if="isSettingsMode && isGlobalSearch && searchFocus" class="settings-search-dropdown">
           <div v-for="group in settingsSearchResults" :key="group.route" class="settings-search-group">
             <div class="settings-search-title">{{ group.title }}</div>
             <div class="settings-search-item" v-for="item in group.items" :key="item.text" @mousedown.prevent="goToSetting(group.route, item.id)">
               <span v-html="highlightSetting(item.text)"></span>
             </div>
           </div>
           <div v-if="settingsSearchResults.length === 0" class="settings-search-empty">
             {{ $t('noData') || 'No results found' }}
           </div>
        </div>
      </div>
    </div>

    <!-- Right Section: Actions & Avatar -->
    <div class="topbar-actions">
      <el-tooltip :content="uiStore.dark ? ($t('lightMode') || 'Light Mode') : ($t('darkMode') || 'Dark Mode')" placement="bottom">
        <button v-if="uiStore.dark" class="icon-btn" @click="openDark($event)">
          <Icon icon="lucide:sun" width="22" height="22"/>
        </button>
        <button v-else class="icon-btn" @click="openDark($event)">
          <Icon icon="lucide:moon" width="22" height="22"/>
        </button>
      </el-tooltip>
      <el-tooltip :content="$t('help') || 'Support'" placement="bottom">
        <button class="icon-btn">
          <Icon icon="lucide:help-circle" width="22" height="22"/>
        </button>
      </el-tooltip>
      <el-tooltip :content="$t('notice') || 'Notice'" placement="bottom">
        <button class="icon-btn" @click="openNotice">
          <Icon icon="lucide:bell" width="22" height="22"/>
          <span class="badge"></span>
        </button>
      </el-tooltip>
      <el-dropdown ref="userinfoRef" trigger="click" @visible-change="onDropdownVisibleChange" :teleported="false" popper-class="detail-dropdown">
        <div class="avatar-wrap" @mouseenter="clearCloseTimer" @mouseleave="startCloseTimer">
          <div class="avatar">{{ formatName(userStore.user.email) }}</div>
        </div>
        <template #dropdown>
          <div class="user-details account-menu open" @mouseenter="clearCloseTimer" @mouseleave="startCloseTimer" style="position:relative;top:0;transform:none;opacity:1;box-shadow:none;border:none;">
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
                <span>{{ $t('storage') || 'Storage' }}</span>
                <span v-if="isDbFull && !isAdmin">{{ $t('full') || 'Full' }}</span>
                <span v-else>{{ formatSize(userStore.user.quota.usedStorageBytes) }} / {{ userStore.user.quota.maxStorageMB }} MB</span>
              </div>
              <div class="storage-bar">
                <div class="storage-fill" :style="{width: storagePercent + '%', background: storageStatus === 'exception' ? 'var(--danger)' : ''}"></div>
              </div>
            </div>
            <div class="am-item"><Icon class="ic ic-sm" icon="lucide:user" /><span>{{ $t('accountDetails') || 'Account Details' }}</span></div>
            <div class="am-item" @click="router.push({name: 'setting'})"><Icon class="ic ic-sm" icon="lucide:settings" /><span>{{ $t('settings') || 'Settings' }}</span></div>
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
import {useEmailStore} from "@/store/email.js";
import {userDraftStore} from "@/store/draft.js";

function highlightTextOnPage(keyword) {
  if (typeof CSS === 'undefined' || !CSS.highlights) return;
  CSS.highlights.clear();
  if (!keyword) return;

  const mainEl = document.querySelector('.main-container');
  if (!mainEl) return;

  const treeWalker = document.createTreeWalker(mainEl, NodeFilter.SHOW_TEXT);
  const ranges = [];
  let node;
  
  // Escape regex properly and ignore case
  const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapeRegExp(keyword), 'gi');

  while ((node = treeWalker.nextNode())) {
    const text = node.nodeValue;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const range = new Range();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      ranges.push(range);
    }
  }

  const highlight = new Highlight(...ranges);
  CSS.highlights.set('search-highlight', highlight);

  if (ranges.length > 0) {
    const rect = ranges[0].getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      try {
        ranges[0].startContainer.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {
        // ignore scroll error
      }
    }
  }
}

function clearHighlightOnPage() {
  if (typeof CSS !== 'undefined' && CSS.highlights) {
    CSS.highlights.clear();
  }
}
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
const emailStore = useEmailStore();
const logoutLoading = ref(false)
const userInfoShow = ref(false)
const userinfoRef = ref({})

const searchFocus = ref(false)

let closeTimer = null;

function clearCloseTimer() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function startCloseTimer() {
  clearCloseTimer();
  if (userInfoShow.value) {
    closeTimer = setTimeout(() => {
      if (userinfoRef.value) {
        userinfoRef.value.handleClose();
      }
    }, 3000);
  }
}

function onDropdownVisibleChange(visible) {
  userInfoShow.value = visible;
  if (visible) {
    clearCloseTimer();
  } else {
    clearCloseTimer();
  }
}

const isSettingsMode = computed(() => {
  return ['setting', 'label-setting', 'category-setting', 'sys-setting'].includes(route.name)
})

const settingsMap = computed(() => [
  {
    route: 'setting',
    title: t('generalSetting') || 'General Settings',
    items: [
      { text: t('username') || 'Username', id: 'username' },
      { text: t('emailAccount') || 'Email Account', id: 'emailAccount' },
      { text: t('password') || 'Password', id: 'password' },
      { text: t('language') || 'Language', id: 'language' },
      { text: t('deleteUser') || 'Delete User', id: 'deleteUser' },
    ]
  },
  {
    route: 'sys-setting',
    title: t('sysSetting') || 'System Settings',
    items: [
      { text: t('websiteSetting') || 'Website Settings', id: 'websiteSetting' },
      { text: t('loginDomain') || 'Login Domain', id: 'loginDomain' },
      { text: t('regKey') || 'Registration Key', id: 'regKey' },
      { text: t('addAccount') || 'Add Account', id: 'addAccount' },
      { text: t('multipleEmail') || 'Multiple Emails', id: 'multipleEmail' },
      { text: t('emailPrefix') || 'Email Prefix', id: 'emailPrefix' },
      { text: t('customization') || 'Customization', id: 'customization' },
      { text: t('emailSetting') || 'Email Settings', id: 'emailSetting' },
      { text: t('autoRefresh') || 'Auto Refresh', id: 'autoRefresh' },
      { text: t('storageSetting') || 'Storage Settings', id: 'storageSetting' }
    ]
  },
  {
    route: 'category-setting',
    title: t('categorySetting') || 'Category Settings',
    items: [
      { text: t('categorySetting') || 'Categories', id: 'category' }
    ]
  },
  {
    route: 'label-setting',
    title: t('labelSetting') || 'Label Settings',
    items: [
      { text: t('labelSetting') || 'Label Management', id: 'labels' },
      { text: t('newLabel') || 'New Label', id: 'newLabel' },
      { text: t('customLabels') || 'Custom Labels', id: 'customLabels' },
      { text: t('classificationRules') || 'Rules', id: 'rules' }
    ]
  }
])

const isGlobalSearch = computed(() => {
  const keyword = emailStore.searchKeyword.trim();
  return /^(all:|global:)/i.test(keyword) && keyword.length > 4;
})

import { watch } from 'vue';

watch(() => emailStore.searchKeyword, (newVal) => {
  if (isSettingsMode.value) {
    const keyword = newVal.trim();
    const isGlobal = /^(all:|global:)/i.test(keyword);
    if (!isGlobal && keyword) {
      highlightTextOnPage(keyword);
    } else {
      clearHighlightOnPage();
    }
  } else {
    clearHighlightOnPage();
  }
});

const settingsSearchResults = computed(() => {
  const keyword = emailStore.searchKeyword.trim();
  if (!keyword) return [];
  
  const isGlobal = /^(all:|global:)/i.test(keyword);
  let cleanKeyword = keyword.replace(/^(all:|global:)/i, '').trim().toLowerCase();
  if (!cleanKeyword) return [];
  
  return settingsMap.value.map(group => {
    if (!isGlobal && group.route !== route.name) {
      return null;
    }
    const matchedItems = group.items.filter(item => item.text.toLowerCase().includes(cleanKeyword));
    if (matchedItems.length > 0) {
      return { ...group, items: matchedItems }
    }
    return null;
  }).filter(Boolean);
})

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function(match) {
    switch (match) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return match;
    }
  });
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightSetting(text) {
  const keyword = emailStore.searchKeyword.replace(/^(all:|global:)/i, '').trim();
  if (!keyword) return escapeHtml(text);
  
  const regex = new RegExp(`(${escapeRegExp(keyword)})`, 'gi');
  const parts = text.split(regex);
  
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return `<mark class="search-highlight" style="background-color: yellow; color: black; padding: 0 2px; border-radius: 2px;">${escapeHtml(part)}</mark>`;
    } else {
      return escapeHtml(part);
    }
  }).join('');
}

function goToSetting(routeName, itemId) {
  searchFocus.value = false;
  if (route.name !== routeName) {
    router.push({ name: routeName });
  }
}

function onSearchBlur() {
  setTimeout(() => {
    searchFocus.value = false
  }, 200)
}

const accountCount = computed(() => {
  return userStore.user.role.accountCount
})

function handleSearch() {
  if (isSettingsMode.value) {
    return;
  }
  
  const parsed = emailStore.searchParsed;
  
  if (parsed.isDraft) {
    if (route.name !== 'draft') {
      router.push({ name: 'draft' });
    } else {
      userDraftStore().refreshList++;
    }
    return;
  }

  if (parsed.isGlobal) {
    if (route.name !== 'user-all-email') {
      router.push({ name: 'user-all-email' });
    } else if (emailStore.emailScroll) {
      emailStore.emailScroll.refreshList();
    }
    return;
  }

  const mailRoutes = ['email', 'user-all-email', 'star', 'snoozed', 'spam', 'trash', 'draft', 'send'];
  if (!mailRoutes.includes(route.name)) {
    router.push({ name: 'user-all-email' });
  } else {
    // If already on a mail page, refresh the list
    if (emailStore.emailScroll) {
      emailStore.emailScroll.refreshList();
    } else if (route.name === 'draft') {
      userDraftStore().refreshList++;
    }
  }
}

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
  height: 100%; 
  background: transparent; 
  display: flex; 
  align-items: center; 
  justify-content: space-between;
  padding: 0 16px; 
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 238px;
}

.hamburger-wrapper {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
  transition: background .15s;
}

.hamburger-wrapper:hover {
  background: var(--bg-hover);
}

.brand-wrapper { 
  display: flex; 
  align-items: center; 
  gap: 22px; 
  cursor: pointer; 
  transition: opacity .15s;
}
.brand-wrapper:active {
  opacity: 0.7;
}

.brand-logo { 
  width: 32px; 
  height: 32px; 
  object-fit: contain;
  transition: transform .25s var(--ease, cubic-bezier(0.4,0,0.2,1));
}
.brand-wrapper:hover .brand-logo { transform: rotate(-8deg) scale(1.05); }

.brand-name { 
  font-size: 18px; 
  font-weight: 700; 
  background: linear-gradient(90deg, #8b9cff, #b07ff5); 
  -webkit-background-clip: text; 
  -webkit-text-fill-color: transparent; 
  letter-spacing: .5px; 
}

.topbar-search { 
  flex: 1; 
  max-width: 720px; 
  display: flex;
  justify-content: flex-start;
  padding: 0 24px;
}

.search-box {
  width: 100%;
  position: relative;
}

.search-box input { 
  width: 100%; 
  height: 48px; 
  background: var(--bg-elevated); 
  border: 1px solid transparent; 
  border-radius: 24px; 
  color: var(--text-primary); 
  padding: 0 16px 0 52px; 
  font-size: 15px; 
  outline: none; 
  transition: background .15s, border-color .15s, box-shadow .15s; 
}
.search-box input::placeholder { color: var(--text-muted); font-size: 14.5px; }
.search-box input:focus { 
  background: var(--bg-surface);
  border-color: var(--border-mid); 
  box-shadow: 0 1px 3px rgba(0,0,0,0.08); 
}
.search-box input:hover:not(:focus) {
  background: var(--bg-hover);
}

.search-box .search-icon { 
  position: absolute; 
  left: 18px; 
  top: 50%; 
  transform: translateY(-50%); 
  color: var(--text-muted); 
}

.topbar-actions { 
  display: flex; 
  align-items: center; 
  gap: 6px; 
  padding-right: 8px;
}

.icon-btn { 
  width: 40px; 
  height: 40px; 
  border: none; 
  background: transparent; 
  cursor: pointer; 
  color: var(--text-secondary); 
  border-radius: 50%; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  transition: background .15s, color .15s; 
  position: relative; 
}
.icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.icon-btn .badge { 
  position: absolute; 
  top: 9px; 
  right: 9px; 
  width: 8px; 
  height: 8px; 
  background: var(--accent-primary); 
  border-radius: 50%; 
  border: 2px solid var(--bg-surface); 
}

.avatar-wrap { 
  margin-left: 8px;
}
.avatar { 
  width: 36px; 
  height: 36px; 
  border-radius: 50%; 
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  font-size: 14px; 
  font-weight: 700; 
  color: #fff; 
  cursor: pointer; 
  border: 2px solid transparent; 
  transition: border-color .15s, transform .15s; 
}
.avatar:hover { border-color: var(--border-mid); transform: scale(1.02); }

/* Account Menu Dropdown */
.account-menu { width: 280px; background: transparent; }
.am-header { padding: 16px; display: flex; gap: 12px; align-items: center; background: linear-gradient(135deg, rgba(91,110,245,.1), rgba(124,92,191,.1)); border-bottom: 1px solid var(--border-subtle); }
.am-avatar { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: #fff; flex-shrink: 0; }
.am-name { font-size: 14px; font-weight: 700; color: var(--text-primary); text-align: left; }
.am-email { font-size: 12px; color: var(--text-muted); text-align: left;}
.am-status { display: flex; align-items: center; gap: 5px; margin-top: 3px; }
.am-status span { font-size: 11px; color: var(--success); }
.am-storage { padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); }
.am-storage-label { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); margin-bottom: 6px; }
.storage-bar { height: 6px; background: var(--bg-hover); border-radius: 3px; overflow: hidden; }
.storage-fill { height: 100%; background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary)); border-radius: 3px; transition: width .3s ease; }
.am-item { padding: 10px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; color: var(--text-secondary); font-size: 13.5px; transition: background .15s, color .15s; }
.am-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.am-item.logout:hover { color: var(--danger); }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); box-shadow: 0 0 6px var(--success); }
.ic { display: flex; }

.settings-search-dropdown {
  position: absolute;
  top: 60px;
  left: 0;
  width: 100%;
  background: var(--bg-surface);
  border: 1px solid var(--border-mid);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  z-index: 1000;
  max-height: 400px;
  overflow-y: auto;
  padding: 8px 0;
}
.settings-search-group {
  margin-bottom: 8px;
}
.settings-search-title {
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
}
.settings-search-item {
  padding: 8px 24px;
  font-size: 14px;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s;
}
.settings-search-item:hover {
  background: var(--bg-hover);
}
.settings-search-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}
</style>
<style>
::highlight(search-highlight) {
  background-color: yellow;
  color: black;
}
</style>
