<template>
  <div class="topbar" :class="[!hasPerm('email:send') ? 'not-send' : '', mobileSearchOpen ? 'search-open' : '']">
    <!-- Left Section: Logo acting as toggle -->
    <div class="topbar-left">
      <button class="icon-btn mobile-menu-btn" @click="changeAside" :aria-label="$t('toggleSidebar')">
        <Icon icon="lucide:menu" width="22" height="22"/>
      </button>
      <div class="brand-wrapper" @click="props.isProfile ? router.push('/') : changeAside()" style="cursor:pointer" :title="props.isProfile ? ($t('home') || 'Home') : ($t('toggleSidebar') || 'Toggle Sidebar')">
        <img src="/logo.svg" alt="Logo" class="brand-logo" />
        <span class="brand-name">EpoCanvas</span>
      </div>
    </div>

    <!-- Middle Section: Search -->
    <div class="topbar-search" v-if="!props.isProfile">
      <div class="search-box">
        <span class="search-icon" @click="handleSearch" :title="$t('search') || 'Search'">
          <Icon icon="lucide:search" width="18" height="18"/>
        </span>
        <input ref="searchInputRef" type="text" :placeholder="isSettingsMode && route.name !== 'all-email' ? (route.name === 'data-setting' ? $t('searchSettingsOrApps') : $t('searchSettings')) : route.name === 'all-email' ? $t('searchAllMail') : $t('searchMail')" v-model="emailStore.searchKeyword" @input="handleSearchInput" @keyup.enter="handleSearch" @keydown.tab.prevent="handleTabComplete" @focus="searchFocus = true" @blur="onSearchBlur" />
        <span class="clear-icon" v-show="emailStore.searchKeyword" @mousedown.prevent @click.stop="clearSearch" :title="$t('clear')">
          <Icon icon="lucide:x" width="15" height="15"/>
        </span>
        <button class="mobile-search-close" type="button" :aria-label="$t('close')" @click="closeMobileSearch">
          <Icon icon="lucide:x" width="18" height="18"/>
        </button>
        
        <!-- Dropdown for all-email syntax suggestions -->
        <div v-if="route.name === 'all-email' && searchFocus && allEmailSuggestions.length > 0" class="settings-search-dropdown" style="padding: 4px 0;">
           <div class="settings-search-item" v-for="(item) in allEmailSuggestions" :key="item.token" @mousedown.prevent="applySuggestion(item)" style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
             <span><strong style="color:var(--el-color-primary)">$</strong>{{ item.display }}</span>
             <span style="color:var(--el-text-color-secondary); font-size:11px; white-space:nowrap;">{{ item.desc }}</span>
           </div>
        </div>

        <!-- Dropdown for Settings Search -->
        <div v-else-if="isSettingsMode && route.name !== 'all-email' && emailStore.searchKeyword.trim() && searchFocus" class="settings-search-dropdown">
           <div v-for="group in settingsSearchResults" :key="group.route" class="settings-search-group">
             <div class="settings-search-title">{{ group.title }}</div>
             <div class="settings-search-item" v-for="item in group.items" :key="item.text" @mousedown.prevent="goToSetting(group.route, item.id)">
               <span v-html="highlightSetting(item.text)"></span>
             </div>
           </div>
           <div v-if="settingsSearchResults.length === 0" class="settings-search-empty">
             {{ $t('noData') }}
           </div>
        </div>
      </div>
    </div>

    <!-- Right Section: Actions & Avatar -->
    <div class="topbar-actions">
      <el-tooltip :content="$t('search')" placement="bottom">
        <button v-if="!props.isProfile" class="icon-btn mobile-search-btn" :aria-label="$t('search')"
                :aria-expanded="mobileSearchOpen" @click="toggleMobileSearch">
          <Icon icon="lucide:search" width="22" height="22"/>
        </button>
      </el-tooltip>
      <el-tooltip :content="uiStore.dark ? $t('lightMode') : $t('darkMode')" placement="bottom">
        <button v-if="uiStore.dark" class="icon-btn theme-toggle-btn" :aria-label="$t('lightMode')" @click="openDark($event)">
          <Icon icon="lucide:sun" width="22" height="22"/>
        </button>
        <button v-else class="icon-btn theme-toggle-btn" :aria-label="$t('darkMode')" @click="openDark($event)">
          <Icon icon="lucide:moon" width="22" height="22"/>
        </button>
      </el-tooltip>
      <el-tooltip :content="$t('help')" placement="bottom">
        <button class="icon-btn help-btn" :aria-label="$t('help')">
          <Icon icon="lucide:help-circle" width="22" height="22"/>
        </button>
      </el-tooltip>
      <el-tooltip v-if="settingStore.settings?.notice === 0" :content="$t('noticeTitle')" placement="bottom">
        <button class="icon-btn" :aria-label="$t('noticeTitle')" @click="openNotice">
          <Icon icon="lucide:bell" width="22" height="22"/>
          <span class="badge"></span>
        </button>
      </el-tooltip>
      <el-dropdown v-if="displayEmail" ref="userinfoRef" trigger="click" @visible-change="onDropdownVisibleChange" :teleported="true" popper-class="detail-dropdown">
        <div class="avatar-wrap" @mouseenter="clearCloseTimer" @mouseleave="startCloseTimer">
          <div class="avatar">{{ formatName(displayEmail) }}</div>
        </div>
        <template #dropdown>
          <div class="user-details account-menu open gmail-account-card" @mouseenter="clearCloseTimer" @mouseleave="startCloseTimer">
            <!-- Top Header Action (Close Button) -->
            <div class="gac-top-bar">
              <button class="gac-close-btn" :aria-label="$t('close')" @click="closeDropdown">
                <Icon icon="lucide:x" width="16" height="16" />
              </button>
            </div>

            <!-- Profile Info Hero Block -->
            <div class="gac-hero-section">
              <div class="gac-avatar-wrap">
                <div class="gac-avatar">{{ formatName(displayEmail) }}</div>
              </div>
              <div class="gac-name">{{ accountStore.currentAccount?.name || userStore.user?.name || '' }}</div>
              <div class="gac-email-row" @click="copyEmail(displayEmail)" :title="$t('copy')">
                <span class="gac-email">{{ displayEmail }}</span>
                <Icon v-if="copiedEmail" icon="lucide:check" width="13" height="13" class="copy-ic text-success" />
                <Icon v-else icon="lucide:copy" width="13" height="13" class="copy-ic" />
              </div>
              <div class="gac-role-badge">
                <span class="status-dot"></span>
                <span>{{ localizedRoleName }}</span>
              </div>

              <!-- Manage Account Pill Button (Gmail classic) -->
              <div class="gac-manage-btn" @click="openAccountDetails">
                <Icon icon="lucide:user" width="14" height="14" />
                <span>{{ $t('manageAccount') }}</span>
              </div>
            </div>

            <!-- Storage Usage Card (创新存储用量进度条与阶梯色彩) -->
            <div class="gac-storage-card">
              <div class="gac-sc-header">
                <div class="sc-title-group">
                  <Icon icon="lucide:hard-drive" width="15" height="15" class="sc-icon" />
                  <span class="sc-title">{{ $t('storageSpace') }}</span>
                </div>
                <div class="sc-val-group">
                  <span class="sc-used">{{ storageData.usedMb }} MB</span>
                  <span class="sc-sep">/</span>
                  <span class="sc-total">{{ storageData.quotaDisplay }}</span>
                  <span class="sc-pct-pill" :style="{ backgroundColor: storageProgressColor + '20', color: storageProgressColor }">
                    {{ storageData.usedPercentage }}%
                  </span>
                </div>
              </div>

              <!-- Innovative Progress Bar Track with 2% Reserved Zone -->
              <div class="gac-progress-track" :title="$t('reservedSpaceNotice')">
                <div 
                  class="gac-progress-fill" 
                  :style="{ 
                    width: storageFillWidth + '%', 
                    backgroundColor: storageProgressColor 
                  }"
                ></div>
                <!-- 2% Reserved Buffer Zone Marker -->
                <div class="gac-progress-reserved-zone">
                  <div class="gac-reserved-marker" :title="$t('reservedSpaceBadge') + ': ' + $t('reservedSpaceNotice')"></div>
                </div>
              </div>

              <!-- Notice and Quick Jump -->
              <div class="gac-sc-footer">
                <div class="sc-notice" v-if="storageData.usedPercentage >= 98" style="color: #ef4444;">
                  <Icon icon="lucide:alert-triangle" width="13" height="13" />
                  <span>{{ $t('storageFullWarning') }}</span>
                </div>
                <div class="sc-notice" v-else-if="storageData.usedPercentage >= 95" style="color: #f97316;">
                  <Icon icon="lucide:alert-circle" width="13" height="13" />
                  <span>{{ $t('trashCleanupWarning') }}</span>
                </div>
                <div class="sc-notice" v-else>
                  <Icon icon="lucide:info" width="13" height="13" />
                  <span>{{ $t('reservedSpaceNotice') }}</span>
                </div>
                <div class="sc-manage-link" @click="openStorageSettings">
                  <span>{{ $t('manageStorage') }}</span>
                  <Icon icon="lucide:chevron-right" width="12" height="12" />
                </div>
              </div>
            </div>

            <!-- Multi-Account Box (默认关闭，管理员开启后完全学习 Gmail 方框模式) -->
            <div v-if="isMultiAccountEnabled" class="gac-multi-account-section">
              <div class="gac-ma-card">
                <div class="gac-ma-item active">
                  <div class="gac-ma-avatar">{{ formatName(displayEmail) }}</div>
                  <div class="gac-ma-info">
                    <div class="gac-ma-name">{{ accountStore.currentAccount?.name || userStore.user?.name || '' }}</div>
                    <div class="gac-ma-email">{{ displayEmail }}</div>
                  </div>
                  <Icon icon="lucide:check" width="16" height="16" class="gac-ma-check" />
                </div>
                <!-- Add Another Account Row (Gmail Box Pattern) -->
                <div class="gac-ma-item add-account-item" @click="openAddAccountDialog">
                  <div class="gac-ma-add-icon">
                    <Icon icon="lucide:user-plus" width="17" height="17" />
                  </div>
                  <div class="gac-ma-add-text">{{ $t('addAnotherAccount') }}</div>
                </div>
              </div>
            </div>

            <!-- Quick Action Options -->
            <div class="gac-actions-section">
              <div class="gac-action-item" @click="openSettings">
                <Icon icon="lucide:settings" width="15" height="15" />
                <span>{{ $t('settings') }}</span>
              </div>
              <div class="gac-action-item logout" @click="clickLogout">
                <Icon icon="lucide:log-out" width="15" height="15" />
                <span>{{ $t('logOut') }}</span>
              </div>
            </div>

            <!-- Footer: Legal Links (隐私政策 · 服务条款) -->
            <div class="gac-footer">
              <a class="gac-legal-link" @click.prevent="openPrivacyPolicy">
                <span>{{ $t('privacyPolicy') }}</span>
                <Icon icon="lucide:external-link" width="11" height="11" />
              </a>
              <span class="gac-legal-dot">·</span>
              <a class="gac-legal-link" @click.prevent="openTermsOfService">
                <span>{{ $t('termsOfService') }}</span>
                <Icon icon="lucide:external-link" width="11" height="11" />
              </a>
            </div>
          </div>
        </template>
      </el-dropdown>
      <div v-else-if="props.isProfile" class="guest-login-btn" style="display:flex;align-items:center;">
        <el-button type="primary" size="small" @click="goToLogin" style="border-radius:8px;">{{ $t('login') }}</el-button>
      </div>
    </div>

    <!-- Built-in Terms of Service Dialog -->
    <el-dialog v-model="termsDialogVisible" :title="$t('termsDialogTitle')" width="min(640px, 92vw)" class="legal-doc-dialog" append-to-body>
      <div class="legal-doc-content">
        <h4>1. 服务协议与使用准则</h4>
        <p>欢迎使用 Epocanvas Mail。本平台提供纯净、私密且高效的邮件收发与云端协作体验。用户承诺遵守当地法律法规，不利用本服务从事垃圾邮件群发、网络钓鱼或传播有害代码等违规活动。</p>
        <h4>2. 存储与系统保护机制</h4>
        <p>系统为每个账户设立合理的存储限额，并永久保留 2% 应急缓冲区。当存储用量达到 95% 时，系统将自动对垃圾桶执行物理清理以释放空间；当用量达到 98% 时，将暂停接收新邮件直到空间释放。</p>
        <h4>3. 免责声明与知识产权</h4>
        <p>在适用法律允许的最大范围内，平台对因不可抗力导致的偶发性服务中断不承担连带责任。用户保留其通信内容的全部知识产权与数据所有权。</p>
      </div>
      <template #footer>
        <el-button type="primary" @click="termsDialogVisible = false">{{ $t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Built-in Privacy Policy Dialog -->
    <el-dialog v-model="privacyDialogVisible" :title="$t('privacyDialogTitle')" width="min(640px, 92vw)" class="legal-doc-dialog" append-to-body>
      <div class="legal-doc-content">
        <h4>1. 零冗余与隐私保护原则</h4>
        <p>Epocanvas Mail 严格践行数据主权与最小化收集原则。我们绝不出售、共享或商业化分析您的个人邮件、通信录或附件数据。</p>
        <h4>2. 密码学端到端与数据隔离</h4>
        <p>系统采用先进的密码学 Hash 索引与用户租户隔离架构，彻底杜绝 IDOR 与横向越权。在隐私/加密模式下，邮件正文及附件受密码学密钥严格保护，管理员接口默认阻断访问。</p>
        <h4>3. 自主管理与遗忘权</h4>
        <p>用户随时可通过账户中心导出其数据或彻底注销账号。注销后，名下全部邮件、附件及认证元数据将执行不可逆的物理级彻底销毁。</p>
      </div>
      <template #footer>
        <el-button type="primary" @click="privacyDialogVisible = false">{{ $t('confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {defineProps} from 'vue';
const props = defineProps({
  isProfile: {
    type: Boolean,
    default: false
  }
});
import router from "@/router";
import hanburger from '@/components/hamburger/index.vue'
import {logout} from "@/request/login.js";
import {updateProfile, getUserStorage} from "@/request/my.js";
import {Icon} from "@iconify/vue";
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {userDraftStore} from "@/store/draft.js";

function openAccountDetails() {
  if (userinfoRef.value && userinfoRef.value.handleClose) {
    userinfoRef.value.handleClose()
  }
  const currentEmail = (displayEmail.value || userStore.user?.email || '').toLowerCase()
  let targetPath = ''
  if (currentEmail === 'admin@epomail.bond' || userStore.user?.role?.roleCode === 'master' || userStore.user?.role?.name === '站长') {
    targetPath = 'admin'
  } else if (accountStore.currentAccount?.name && !accountStore.currentAccount.name.includes('@')) {
    targetPath = accountStore.currentAccount.name
  } else if (userStore.user?.name && !userStore.user.name.includes('@')) {
    targetPath = userStore.user.name
  } else {
    targetPath = currentEmail
  }
  router.push(`/${targetPath}`)
}

function openSettings() {
  if (userinfoRef.value && userinfoRef.value.handleClose) {
    userinfoRef.value.handleClose()
  }
  router.push('/settings/profile')
}

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
import {computed, ref, reactive} from "vue";
import {useSettingStore} from "@/store/setting.js";
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import {setExtend} from "@/utils/day.js"

const {t} = useI18n();
const route = useRoute();
const settingStore = useSettingStore();
const userStore = useUserStore();
const accountStore = useAccountStore();
const displayEmail = computed(() => accountStore.currentAccount?.email || userStore.user?.email || '');
const uiStore = useUiStore();
const emailStore = useEmailStore();
const logoutLoading = ref(false)
const userInfoShow = ref(false)
const userinfoRef = ref({})

const searchFocus = ref(false)

// 窄屏顶栏放不下常驻搜索框，改为图标按需展开浮层：入口不丢失，且不挤爆 375px 顶栏
const mobileSearchOpen = ref(false)
const searchInputRef = ref(null)

function toggleMobileSearch() {
  mobileSearchOpen.value = !mobileSearchOpen.value
  if (mobileSearchOpen.value) {
    nextTick(() => searchInputRef.value?.focus())
  }
}

function closeMobileSearch() {
  mobileSearchOpen.value = false
}

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

// Storage Quota Reactive Data
const storageData = reactive({
  loaded: false,
  loading: false,
  usedBytes: 0,
  usedMb: '0.00',
  quotaMb: 1024,
  quotaDisplay: '1024 MB',
  usedPercentage: 0,
  fileCount: 0,
  isVisitor: false,
  isUnlimited: false,
});

async function fetchStorageData() {
  if (storageData.loading) return;
  storageData.loading = true;
  try {
    const res = await getUserStorage();
    const data = res?.data || res;
    if (data && typeof data === 'object') {
      storageData.loaded = true;
      storageData.usedBytes = Number(data.usedBytes || 0);
      storageData.usedMb = data.usedMb || (storageData.usedBytes / (1024 * 1024)).toFixed(2);
      storageData.fileCount = Number(data.fileCount || 0);
      storageData.isVisitor = !!data.isVisitor;

      const quota = Number(data.quotaMb ?? 1024);
      storageData.quotaMb = quota;
      if (quota === 0 && !data.isVisitor) {
        storageData.isUnlimited = true;
        storageData.quotaDisplay = t('unlimitedQuota') || '无限空间';
        storageData.usedPercentage = 0;
      } else if (quota > 0) {
        storageData.isUnlimited = false;
        storageData.quotaDisplay = quota >= 1024 ? (quota / 1024).toFixed(1) + ' GB' : quota + ' MB';
        const pct = typeof data.usedPercentage === 'number'
          ? data.usedPercentage
          : Math.round((storageData.usedBytes / (quota * 1024 * 1024)) * 1000) / 10;
        storageData.usedPercentage = Math.max(0, Math.min(100, pct));
      } else {
        storageData.quotaDisplay = '0 MB';
        storageData.usedPercentage = storageData.usedBytes > 0 ? 100 : 0;
      }
    }
  } catch (err) {
    console.warn('Failed to load user storage in header dropdown:', err);
  } finally {
    storageData.loading = false;
  }
}

// Color scale mapping strictly following user request:
// - <= 10%: 蓝色 (#2563eb)
// - 11% ~ 25%: 绿色 (#10b981)
// - 26% ~ 50%: 黄色 (#eab308)
// - 51% ~ 80%: 橙色 (#f97316)
// - 81% ~ 98%: 红色 (#ef4444)
// - >= 98%: 灰色 (#64748b - 2% reserved space triggered)
const storageProgressColor = computed(() => {
  const pct = storageData.usedPercentage;
  if (pct >= 98) return '#64748b'; // 灰色 (系统预留空间保护态)
  if (pct > 80) return '#ef4444';  // 红色 (81% ~ 98%)
  if (pct > 50) return '#f97316';  // 橙色 (51% ~ 80%)
  if (pct > 25) return '#eab308';  // 黄色 (26% ~ 50%)
  if (pct > 10) return '#10b981';  // 绿色 (11% ~ 25%)
  return '#2563eb';                // 蓝色 (10% 及以下)
});

// "保留存储空间2%不给予填满，永远会流出2%的空间"
// The fill bar width is strictly capped at 98%
const storageFillWidth = computed(() => {
  if (storageData.isUnlimited) return 0;
  return Math.min(98, Math.max(0, storageData.usedPercentage));
});

// Multi-account mode flag:
// "当且仅当管理员设定支援多账户模式时，开源完全学习Gmail的这套添加账户的方框模式，直接完全学习Gmail的方式，默认关闭时保持当前的情况"
const isMultiAccountEnabled = computed(() => {
  return Number(settingStore.settings?.multiAccountEnabled) === 1;
});

const termsDialogVisible = ref(false);
const privacyDialogVisible = ref(false);
const copiedEmail = ref(false);

function closeDropdown() {
  if (userinfoRef.value && userinfoRef.value.handleClose) {
    userinfoRef.value.handleClose();
  }
}

function openStorageSettings() {
  closeDropdown();
  router.push('/settings/data');
}

function openAddAccountDialog() {
  closeDropdown();
  router.push('/settings/account');
}

function openPrivacyPolicy() {
  closeDropdown();
  const extUrl = settingStore.settings?.privacyUrl;
  if (extUrl && typeof extUrl === 'string' && extUrl.startsWith('http')) {
    window.open(extUrl, '_blank', 'noopener,noreferrer');
  } else {
    privacyDialogVisible.value = true;
  }
}

function openTermsOfService() {
  closeDropdown();
  const extUrl = settingStore.settings?.termsUrl;
  if (extUrl && typeof extUrl === 'string' && extUrl.startsWith('http')) {
    window.open(extUrl, '_blank', 'noopener,noreferrer');
  } else {
    termsDialogVisible.value = true;
  }
}

function onDropdownVisibleChange(visible) {
  userInfoShow.value = visible;
  if (visible) {
    clearCloseTimer();
    fetchStorageData();
  } else {
    clearCloseTimer();
  }
}

// Map suggestion tokens using proper i18n - these must match parseQuery's fieldsMap/typeMap
const ALL_EMAIL_OPTS = computed(() => [
  // Status filters — these token values must match parseQuery typeMap keys
  { token: 'received',        display: t('received'),        desc: t('statusFilter') || 'Status Filter',  group: 'status' },
  { token: 'all',             display: t('all'),             desc: t('statusFilter') || 'Status Filter',  group: 'status' },
  { token: 'sent',            display: t('sent'),            desc: t('statusFilter') || 'Status Filter',  group: 'status' },
  { token: 'deleted',         display: t('selectDeleted'),   desc: t('statusFilter') || 'Status Filter',  group: 'status' },
  { token: 'norecipient',     display: t('noRecipient'),     desc: t('statusFilter') || 'Status Filter',  group: 'status' },
  // Field filters — token values match parseQuery fieldsMap keys
  { token: 'sender',          display: t('sender'),          desc: t('searchField') || 'Search Field',    group: 'field' },
  { token: 'user',            display: t('user'),            desc: t('searchField') || 'Search Field',    group: 'field' },
  { token: 'to',              display: t('selectEmail'),     desc: t('searchField') || 'Search Field',    group: 'field' },
  { token: 'subject',         display: t('subject'),         desc: t('searchField') || 'Search Field',    group: 'field' },
]);

const allEmailSuggestions = computed(() => {
   if (route.name !== 'all-email' || !searchFocus.value) return [];
   const input = emailStore.searchKeyword || '';
   const match = input.match(/(?:^|\s)\$(\S*)$/);
   if (!match) return [];
   const term = match[1].toLowerCase();
   return ALL_EMAIL_OPTS.value.filter(o =>
     o.display.toLowerCase().startsWith(term) ||
     o.token.toLowerCase().startsWith(term) ||
     term === ''
   );
});

function applySuggestion(opt) {
   const val = typeof opt === 'string' ? opt : opt.display;
   const input = emailStore.searchKeyword || '';
   const match = input.match(/(?:^|\s)\$(\S*)$/);
   if (match) {
      emailStore.searchKeyword = input.slice(0, match.index) + (match[0].startsWith(' ') ? ' $' : '$') + val + ' ';
   }
   // Trigger real-time search after applying suggestion
   triggerAllEmailSearch();
}

function handleTabComplete() {
  if (route.name === 'all-email') {
    const suggestions = allEmailSuggestions.value;
    if (suggestions.length > 0) {
      applySuggestion(suggestions[0]);
    }
  }
}

// Debounced real-time search for all-email
let searchDebounceTimer = null;
function handleSearchInput() {
  if (route.name !== 'all-email') return;
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    triggerAllEmailSearch();
  }, 400);
}

function triggerAllEmailSearch() {
  if (emailStore.emailScroll && emailStore.emailScroll.refreshList) {
    emailStore.emailScroll.refreshList();
  }
}

const isSettingsMode = computed(() => {
  return ['user-profile', 'profile', 'general-setting', 'profile-setting', 'setting', 'data-setting', 'label-setting', 'category-setting', 'sys-setting', 'analysis', 'user', 'all-email', 'role', 'reg-key'].includes(route.name)
})

const settingsMap = computed(() => [
  {
    route: 'user-profile',
    title: t('profile') || 'Personal Info',
    items: [
      { text: t('avatar') || 'Avatar', id: 'avatar' },
      { text: t('nickname') || 'Nickname', id: 'nickname' },
      { text: t('gender') || 'Gender', id: 'gender' },
      { text: t('birthday') || 'Birthday', id: 'birthday' },
      { text: t('emailAccount') || 'Email', id: 'email' },
      { text: t('phones') || 'Phones', id: 'phones' },
      { text: t('addresses') || 'Addresses', id: 'addresses' }
    ]
  },
  {
    route: 'general-setting',
    title: t('generalSetting') || 'General Settings',
    items: [
      { text: t('bio') || 'Bio', id: 'bio' },
      { text: t('visualMedia') || 'Theme & Wallpaper', id: 'wallpaper' },
      { text: t('themeMode') || 'Theme Mode', id: 'theme' },
      { text: t('density') || 'Density', id: 'density' },
      { text: t('inboxType') || 'Inbox Type', id: 'inboxType' },
      { text: t('readingPane') || 'Reading Pane', id: 'readingPane' },
      { text: t('emailThreading') || 'Email Threading', id: 'threading' },
      { text: t('systemLanguage') || 'System Language', id: 'language' },
      { text: t('dataPrivacy') || 'Data Privacy', id: 'dataPrivacy' }
    ]
  },
  {
    route: 'setting',
    title: t('securitySetting') || 'Security Settings',
    items: [
      { text: t('username') || 'Username', id: 'username' },
      { text: t('emailAccount') || 'Email Account', id: 'emailAccount' },
      { text: t('password') || 'Password', id: 'password' },
      { text: t('twoFactorCenter') || '2-Step Verification (2FA)', id: 'totp' },
      { text: t('passkeysAndSecurityKeys') || 'Passkeys & Security Keys', id: 'passkeys' },
      { text: t('backupCodesTitle') || 'Backup Codes', id: 'backupCodes' },
      { text: t('deleteUser') || 'Delete User', id: 'deleteUser' },
    ]
  },
  {
    route: 'data-setting',
    title: t('data') || 'Data Management',
    items: [
      { text: t('dataExportTitle') || 'Export Data', id: 'dataExport' },
      { text: t('forwardingAndPushTitle') || t('forwardingRulesTitle') || 'Forwarding & Push', id: 'forwarding' },
      { text: t('apiDeveloperTitle') || 'API & Developer Access', id: 'apiAccess' },
      { text: t('thirdPartyAppsTitle'), id: 'thirdPartyApps', keywords: ['app', 'oauth', '应用', '第三方', '授权', '单点登录', 'sso', 'shijianus-blog', 'epocanvasimage', 'client'] }
    ]
  },
  {
    route: 'sys-setting',
    title: t('SystemSettings') || 'System Settings',
    items: [
      { text: t('websiteSetting') || 'Website Settings', id: 'websiteSetting' },
      { text: t('loginDomain') || 'Login Domain', id: 'loginDomain' },
      { text: t('regKey') || 'Registration Key', id: 'regKey' },
      { text: t('addAccount') || 'Add Account', id: 'addAccount' },

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
  },
  {
    route: 'analysis',
    title: t('analytics') || 'Analytics',
    items: [
      { text: t('analytics') || 'Data Analytics', id: 'analysis' }
    ]
  },
  {
    route: 'user',
    title: t('allUsers') || 'All Users',
    items: [
      { text: t('allUsers') || 'User Management', id: 'user' }
    ]
  },
  {
    route: 'all-email',
    title: t('allMail') || 'All Mail',
    items: [
      { text: t('allMail') || 'All Mail Management', id: 'all-email' }
    ]
  },
  {
    route: 'role',
    title: t('permissions') || 'Permissions',
    items: [
      { text: t('permissions') || 'Role Permissions', id: 'role' }
    ]
  },
  {
    route: 'reg-key',
    title: t('inviteCode') || 'Invite Code',
    items: [
      { text: t('inviteCode') || 'Registration Key', id: 'reg-key' }
    ]
  }
])

const isGlobalSearch = computed(() => {
  const keyword = emailStore.searchKeyword.trim();
  return /^(all:|global:)/i.test(keyword) && keyword.length > 4;
})

import { watch, nextTick } from 'vue';

watch(() => route.fullPath, () => {
  mobileSearchOpen.value = false
});

let highlightDebounceTimer = null;
watch(() => emailStore.searchKeyword, (newVal) => {
  clearTimeout(highlightDebounceTimer);
  if (isSettingsMode.value) {
    const keyword = newVal.trim();
    const isGlobal = /^(all:|global:)/i.test(keyword);
    if (!isGlobal && keyword) {
      highlightDebounceTimer = setTimeout(() => {
        highlightTextOnPage(keyword);
      }, 200);
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
  
  let cleanKeyword = keyword.replace(/^(all:|global:)/i, '').trim().toLowerCase();
  if (!cleanKeyword) return [];
  
  const appPrefixMatch = cleanKeyword.match(/^(app:|oauth:|client:)\s*(.*)/i);
  const targetAppQuery = appPrefixMatch ? appPrefixMatch[2].trim() : '';

  return settingsMap.value.map(group => {
    const matchedItems = group.items.filter(item => {
      if (appPrefixMatch) {
        if (item.id === 'thirdPartyApps') {
          if (!targetAppQuery) return true;
          return (item.keywords && item.keywords.some(k => k.toLowerCase().includes(targetAppQuery))) ||
                 item.text.toLowerCase().includes(targetAppQuery);
        }
        return false;
      }
      const matchText = item.text.toLowerCase().includes(cleanKeyword);
      const matchKw = item.keywords && item.keywords.some(k => k.toLowerCase().includes(cleanKeyword));
      return matchText || matchKw;
    });
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
    router.push({ name: routeName, hash: itemId ? `#${itemId}` : undefined });
    if (itemId) {
      setTimeout(() => {
        const el = document.getElementById(itemId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  } else if (itemId) {
    const el = document.getElementById(itemId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function onSearchBlur() {
  setTimeout(() => {
    searchFocus.value = false
  }, 200)
}

function clearSearch() {
  emailStore.searchKeyword = '';
  clearHighlightOnPage();
  if (['email', 'user-all-email', 'star', 'snoozed', 'spam', 'trash', 'draft', 'send', 'all-email'].includes(route.name)) {
    if (emailStore.emailScroll && emailStore.emailScroll.refreshList) {
      emailStore.emailScroll.refreshList();
    } else if (route.name === 'draft') {
      userDraftStore().refreshList++;
    }
  }
}

const accountCount = computed(() => {
  return userStore.user.role?.accountCount
})

const localizedRoleName = computed(() => {
  const role = userStore.user?.role
  if (!role) return ''
  if (role.roleCode === 'master' || role.name === '站长' || role.name === '站長') return t('roleMaster')
  if (role.roleCode === 'moderator' || role.name?.includes('协管') || role.name?.includes('協管')) return t('roleModerator')
  if (role.roleCode === 'visitor' || role.name === '参观者' || role.name === '參觀者') return t('roleVisitor')
  if (role.roleCode === 'user_base' || role.roleCode === 'user_lv0' || role.roleCode === 'user_lv1' || role.name?.includes('普通用户') || role.name?.includes('普通用戶')) return t('roleBase')
  return role.name || ''
})

function handleSearch() {
  if (isSettingsMode.value && route.name !== 'all-email') {
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

  if (route.name === 'all-email') {
    if (emailStore.emailScroll) {
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
    copiedEmail.value = true;
    setTimeout(() => { copiedEmail.value = false; }, 2000);
    ElMessage({
      message: t('copyAddressSuccess') || t('copySuccessMsg'),
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

  const x = (e && typeof e.clientX === 'number') ? e.clientX : window.innerWidth / 2;
  const y = (e && typeof e.clientY === 'number') ? e.clientY : 30;

  const maxX = Math.max(x, window.innerWidth - x)
  const maxY = Math.max(y, window.innerHeight - y)
  const endRadius = Math.hypot(maxX, maxY)

  if (!document.startViewTransition) {
    switchDark(nextIsDark, root);
    return
  }

  try {
    // 标记切换目标，供 CSS 选择器使用
    root.setAttribute('data-theme-to', nextIsDark ? 'dark' : 'light')
    root.style.setProperty('--vt-x', `${x}px`)
    root.style.setProperty('--vt-y', `${y}px`)
    root.style.setProperty('--vt-end-radius', `${endRadius + 10}px`)

    const transition = document.startViewTransition(() => {
      switchDark(nextIsDark, root);
    })

    transition.finished.finally(() => {
      root.removeAttribute('data-theme-to')
    })
  } catch (err) {
    switchDark(nextIsDark, root);
  }
}

function switchDark(nextIsDark, root) {
  const mode = nextIsDark ? 'dark' : 'light'
  uiStore.setThemeMode(mode)
  updateProfile({ themeMode: mode }).catch(() => {})
}



function changeAside() {
  uiStore.asideShow = !uiStore.asideShow
}

function goToLogin() {
  localStorage.removeItem("token")
  window.location.replace('/login/')
}

function clickLogout() {
  logoutLoading.value = true
  const finalizeLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("ui")
    try {
      sessionStorage.clear()
    } catch (_) {}
    uiStore.resetToDefaults()
    window.location.replace('/login/')
  }
  logout().then(() => {
    finalizeLogout()
  }).catch(() => {
    // 即使后端凭证已失效返回 401，客户端也必须彻底清除状态并硬退出至登录页
    finalizeLogout()
  }).finally(() => {
    logoutLoading.value = false
  })
}

function formatName(email) {
  return email?.[0]?.toUpperCase() || ''
}

</script>
<style>
/* Gmail Standard Avatar Dropdown Popper */
.detail-dropdown {
  width: 424px !important;
  max-width: calc(-8px + 100vw) !important;
  max-height: calc(100dvh - 81px) !important;
  min-height: 210px !important;
  background: var(--bg-surface) !important;
  border: 1px solid var(--border-mid) !important;
  border-radius: 24px !important;
  padding: 0 !important;
  overflow: hidden !important;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.24), 0 4px 16px rgba(0, 0, 0, 0.08) !important;
  z-index: 3000 !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
}
.detail-dropdown .el-dropdown__list {
  padding: 0 !important;
  width: 100% !important;
}
.detail-dropdown .el-scrollbar {
  overflow: hidden !important;
}
.detail-dropdown .el-scrollbar__wrap {
  overflow-x: hidden !important;
  max-height: calc(100dvh - 81px) !important;
}
.detail-dropdown .el-scrollbar__bar {
  display: none !important;
}
.detail-dropdown .el-popper__arrow {
  display: none !important;
}

/* Gmail Account Card Inner Styles */
.gmail-account-card {
  width: 100%;
  max-width: 424px;
  background: var(--bg-surface);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.gac-top-bar {
  display: flex;
  justify-content: flex-end;
  padding: 12px 14px 0;
}
.gac-close-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all .15s ease;
}
.gac-close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.gac-hero-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2px 20px 14px;
  text-align: center;
}
.gac-avatar-wrap {
  margin-bottom: 10px;
}
.gac-avatar {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 700;
  color: #fff;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
  border: 3px solid rgba(255, 255, 255, 0.25);
}
.gac-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
}
.gac-email-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 3px;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 6px;
  transition: background .15s ease, color .15s ease;
}
.gac-email-row:hover {
  background: var(--bg-hover);
  color: var(--accent-primary);
}
.gac-email-row .copy-ic {
  opacity: 0.65;
}
.gac-email-row:hover .copy-ic {
  opacity: 1;
}
.gac-role-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 3px 10px;
  border-radius: 9999px;
  background: var(--bg-hover);
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-secondary);
}
.gac-manage-btn {
  margin-top: 12px;
  padding: 7px 20px;
  border-radius: 9999px;
  border: 1px solid var(--border-mid);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all .2s ease;
}
.gac-manage-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
  transform: translateY(-1px);
}

/* Storage Card */
.gac-storage-card {
  margin: 6px 16px 12px;
  padding: 12px 14px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gac-sc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sc-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
}
.sc-val-group {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.sc-used {
  font-weight: 600;
  color: var(--text-primary);
}
.sc-sep {
  color: var(--text-muted);
}
.sc-total {
  color: var(--text-secondary);
}
.sc-pct-pill {
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
}

/* Innovative Progress Bar Track with 2% Reserved Zone */
.gac-progress-track {
  height: 10px;
  border-radius: 6px;
  background: rgba(120, 130, 150, 0.16);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
}
.gac-progress-fill {
  height: 100%;
  border-radius: 6px 0 0 6px;
  transition: width .4s cubic-bezier(0.4, 0, 0.2, 1), background-color .3s ease;
}
.gac-progress-reserved-zone {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 2%;
  min-width: 5px;
  background: repeating-linear-gradient(45deg, rgba(148, 163, 184, 0.4), rgba(148, 163, 184, 0.4) 2px, transparent 2px, transparent 4px);
  border-left: 1px dashed rgba(148, 163, 184, 0.8);
}
.gac-reserved-marker {
  width: 100%;
  height: 100%;
}

.gac-sc-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11.5px;
  gap: 8px;
}
.sc-notice {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.sc-manage-link {
  display: flex;
  align-items: center;
  gap: 2px;
  color: var(--accent-primary);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity .15s ease;
}
.sc-manage-link:hover {
  opacity: 0.8;
  text-decoration: underline;
}

/* Multi-Account Box (Gmail Pattern) */
.gac-multi-account-section {
  padding: 0 16px 12px;
}
.gac-ma-card {
  border: 1px solid var(--border-mid);
  border-radius: 16px;
  overflow: hidden;
  background: var(--bg-surface);
}
.gac-ma-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background .15s ease;
  border-bottom: 1px solid var(--border-subtle);
}
.gac-ma-item:last-child {
  border-bottom: none;
}
.gac-ma-item:hover {
  background: var(--bg-hover);
}
.gac-ma-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.gac-ma-info {
  flex: 1;
  overflow: hidden;
  text-align: left;
}
.gac-ma-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.gac-ma-email {
  font-size: 11.5px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gac-ma-check {
  color: var(--success);
}
.gac-ma-item.add-account-item {
  color: var(--text-primary);
}
.gac-ma-add-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-primary);
  flex-shrink: 0;
}
.gac-ma-add-text {
  font-size: 13px;
  font-weight: 500;
}

/* Quick Action Options */
.gac-actions-section {
  display: flex;
  flex-direction: column;
  padding: 0 16px 10px;
  gap: 3px;
}
.gac-action-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 14px;
  border-radius: 12px;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all .15s ease;
}
.gac-action-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.gac-action-item.logout:hover {
  color: var(--danger);
  background: rgba(239, 68, 68, 0.08);
}

/* Footer Legal Links */
.gac-footer {
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-subtle);
  padding: 11px 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
.gac-legal-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--text-muted);
  text-decoration: none;
  cursor: pointer;
  transition: color .15s ease;
}
.gac-legal-link:hover {
  color: var(--accent-primary);
  text-decoration: underline;
}
.gac-legal-dot {
  color: var(--text-muted);
}

.legal-doc-content {
  line-height: 1.65;
  color: var(--text-primary);
}
.legal-doc-content h4 {
  font-size: 15px;
  font-weight: 700;
  margin: 16px 0 6px;
  color: var(--text-primary);
}
.legal-doc-content h4:first-child {
  margin-top: 0;
}
.legal-doc-content p {
  font-size: 13.5px;
  color: var(--text-secondary);
  margin: 0;
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

/* 移动端汉堡入口：仅在 <1025px 显示，桌面隐藏（桌面由 Logo 点击收合侧栏）。
   用 button 前缀提升特异性：下方 .icon-btn(1020 行) 的 display:flex 同特异性且声明更靠后，会被其覆盖 */
button.mobile-menu-btn {
  display: none;
}

@media (max-width: 1024px) {
  button.mobile-menu-btn {
    display: flex;
  }
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
  align-items: center;
  padding: 0 24px;
  min-width: 0;
}

.search-box {
  width: 100%;
  position: relative;
  display: flex;
  align-items: center;
}

.search-box input { 
  width: 100%; 
  height: 48px; 
  background: var(--bg-elevated); 
  border: 1px solid transparent; 
  border-radius: 24px; 
  color: var(--text-primary); 
  padding: 0 44px 0 48px; 
  font-size: 15px; 
  outline: none; 
  transition: background .15s, border-color .15s, box-shadow .15s; 
  box-sizing: border-box;
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
  left: 16px; 
  top: 50%; 
  transform: translateY(-50%); 
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--text-muted); 
  cursor: pointer;
  z-index: 2;
  transition: color .15s ease, transform .15s ease;
  user-select: none;

  &:hover {
    color: var(--text-primary);
  }

  &:active {
    transform: translateY(-50%) scale(0.92);
  }

  .iconify, svg {
    display: block;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }
}

.search-box .clear-icon {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: var(--text-muted);
  cursor: pointer;
  z-index: 2;
  transition: background .15s ease, color .15s ease, transform .15s ease;
  user-select: none;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &:active {
    transform: translateY(-50%) scale(0.9);
  }

  .iconify, svg {
    display: block;
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 8px;
}

/* 窄屏专用控件在桌面默认隐藏 */
.mobile-search-btn,
.mobile-search-close {
  display: none;
}

/* 窄屏顶栏防溢出：收起品牌文字/帮助入口，搜索改为图标按需展开的浮层，
   既保住搜索功能入口，又确保头像（账户菜单：退出登录/设置）始终可达 */
@media (max-width: 767px) {
  .topbar {
    padding: 0 10px;
    position: relative;
  }

  .topbar-left {
    min-width: 0;
    gap: 6px;
  }

  .brand-wrapper {
    gap: 8px;
  }

  .brand-name {
    display: none;
  }

  .mobile-search-btn {
    display: flex;
  }

  .topbar-search {
    display: none;
  }

  .topbar.search-open .topbar-search {
    display: flex;
    position: absolute;
    left: 10px;
    right: 10px;
    top: calc(100% + 6px);
    padding: 0;
    max-width: none;
    z-index: 60;
  }

  .topbar.search-open .search-box input {
    background: var(--bg-surface);
    border-color: var(--border-mid);
    box-shadow: 0 10px 28px rgba(0, 0, 0, .18);
    padding-right: 76px;
  }

  .mobile-search-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    right: 40px;
    top: 50%;
    transform: translateY(-50%);
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .topbar-actions {
    gap: 2px;
    padding-right: 0;
  }

  .topbar-actions .help-btn {
    display: none;
  }
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
