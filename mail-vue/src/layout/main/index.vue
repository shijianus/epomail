<template>
  <div class="main-box-hide">
    
    <!-- Settings Layout -->
    <div v-if="isSettingsMode" class="settings-layout">
      <div class="settings-sidebar">
        <el-scrollbar>
          <div class="settings-sidebar-content">
            <div class="settings-title" @click="router.push({name: 'email'})">
              <Icon icon="lucide:arrow-left" width="18" height="18" />
              <span>{{$t('backToMail') || 'Back to Mail'}}</span>
            </div>
            
            <div class="nav-section-title">{{$t('tabSetting') || 'Settings'}}</div>
            <div class="settings-nav-group">
            <router-link :to="{name: 'user-profile'}" class="settings-nav-item" :class="{active: route.name === 'user-profile' || route.name === 'profile'}">
              <Icon icon="fluent:person-20-regular" width="20" height="20" /> {{$t('profile') || '个资'}}
            </router-link>
            <router-link :to="{name: 'general-setting'}" class="settings-nav-item" :class="{active: route.name === 'general-setting' || route.name === 'profile-setting'}">
              <Icon icon="fluent:settings-48-regular" width="20" height="20" /> {{$t('general') || '常规'}}
            </router-link>
            <router-link :to="{name: 'setting'}" class="settings-nav-item" :class="{active: route.name === 'setting'}">
              <Icon icon="fluent:shield-checkmark-20-regular" width="20" height="20" /> {{$t('security') || 'Security'}}
            </router-link>
            <router-link :to="{name: 'data-setting'}" class="settings-nav-item" :class="{active: route.name === 'data-setting'}">
              <Icon icon="fluent:database-person-20-regular" width="20" height="20" /> {{$t('data') || '资料'}}
            </router-link>
            <router-link :to="{name: 'label-setting'}" class="settings-nav-item" :class="{active: route.name === 'label-setting'}">
              <Icon icon="lucide:tags" width="20" height="20" /> {{$t('labels') || 'Labels'}}
            </router-link>
            </div>

            <template v-if="hasPerm(['all-email:query','user:query','role:query','setting:query','analysis:query','reg-key:query'])">
              <div class="nav-section-title" style="margin-top: 24px;">{{$t('manage')}}</div>
              
              <router-link v-if="hasPerm('analysis:query')" :to="{name: 'analysis'}" class="settings-nav-item" :class="{active: route.name === 'analysis'}">
                <Icon icon="fluent:data-pie-20-regular" width="20" height="20" /> {{$t('analytics')}}
              </router-link>
              
              <router-link v-if="hasPerm('user:query')" :to="{name: 'user'}" class="settings-nav-item" :class="{active: route.name === 'user'}">
                <Icon icon="si:user-alt-2-line" width="18" height="18" /> {{$t('allUsers')}}
              </router-link>

              <router-link v-if="hasPerm('all-email:query') && Number(settingStore.settings?.allMailMode) !== 2" :to="{name: 'all-email'}" class="settings-nav-item" :class="{active: route.name === 'all-email'}">
                <Icon :icon="Number(settingStore.settings?.allMailMode) === 1 ? 'fluent:mail-list-28-regular' : 'fluent:mail-alert-28-regular'" width="20" height="20" />
                {{ Number(settingStore.settings?.allMailMode) === 1 ? $t('allMail') : ($t('spamAdminPartition') || $t('spam')) }}
              </router-link>

              <router-link v-if="hasPerm('role:query')" :to="{name: 'role'}" class="settings-nav-item" :class="{active: route.name === 'role'}">
                <Icon icon="fluent:lock-closed-16-regular" width="20" height="20" /> {{$t('permissions')}}
              </router-link>

              <router-link v-if="hasPerm('reg-key:query')" :to="{name: 'reg-key'}" class="settings-nav-item" :class="{active: route.name === 'reg-key'}">
                <Icon icon="fluent:fingerprint-20-filled" width="20" height="20" /> {{$t('inviteCode')}}
              </router-link>

              <router-link v-if="hasPerm('setting:query')" :to="{name: 'sys-setting'}" class="settings-nav-item" :class="{active: route.name === 'sys-setting'}">
                <Icon icon="eos-icons:system-ok-outlined" width="18" height="18" /> {{$t('SystemSettings')}}
              </router-link>

              <router-link :to="{name: 'category-setting'}" class="settings-nav-item" :class="{active: route.name === 'category-setting'}">
                <Icon icon="lucide:network" width="18" height="18" /> {{$t('categorySetting') || 'Category Settings'}}
              </router-link>
            </template>
          </div>
        </el-scrollbar>
      </div>
      <div class="settings-content">
        <router-view class="main-view" v-slot="{ Component,route }">
          <keep-alive :include="['sys-setting','user','role','analysis','reg-key']">
            <component :is="Component" :key="route.name"/>
          </keep-alive>
        </router-view>
      </div>
    </div>

    <!-- Mail Split View Layout -->
    <div 
      v-else 
      class="split-view-container" 
      :class="[
        'reading-pane-' + (uiStore.readingPane || 'right'),
        {'has-reading-pane': showReadingPane, 'is-mobile': isMobileView, 'has-main-wallpaper': hasWallpaper}
      ]"
      :style="wallpaperStyle"
    >
      <div class="list-column" :class="{'hide-on-mobile': showReadingPane && isMobileView, 'hide-on-no-split': showReadingPane && uiStore.readingPane === 'no_split'}">
        <router-view class="main-view" v-slot="{ Component,route }">
          <keep-alive :include="['email','send','star','draft','user-all-email','snoozed','spam','trash']">
            <component :is="Component" :key="route.name"/>
          </keep-alive>
        </router-view>
      </div>
      <div class="reading-pane-column" v-if="showReadingPane">
        <div v-if="uiStore.readingPane === 'no_split'" class="no-split-back-bar">
          <el-button link size="small" @click="emailStore.contentData.email = null" class="back-to-list-btn">
            <Icon icon="lucide:arrow-left" width="16" height="16" style="margin-right: 6px;" />
            <span>{{ $t('backToMail') || '返回邮件列表' }}</span>
          </el-button>
        </div>
        <ContentComponent :key="emailStore.contentData.email?.emailId" />
      </div>
    </div>

  </div>
</template>
<script setup>
import ContentComponent from '@/views/content/index.vue'
import {useUiStore} from "@/store/ui.js";
import {useEmailStore} from "@/store/email.js";
import {useSettingStore} from "@/store/setting.js";
import {computed, onBeforeUnmount, onMounted, watch} from "vue";
import { useRoute } from 'vue-router'
import { hasPerm } from "@/perm/perm.js"
import { Icon } from "@iconify/vue"
import router from "@/router/index.js"
import { getWallpaperCssById } from '@/utils/theme-presets.js'

const settingStore = useSettingStore()
const uiStore = useUiStore();
const emailStore = useEmailStore();
const route = useRoute()
let  innerWidth =  window.innerWidth

let elNotification = null

const isMobileView = computed(() => window.innerWidth < 768)

const isSettingsMode = computed(() => {
  return ['user-profile', 'profile', 'general-setting', 'profile-setting', 'setting', 'data-setting', 'label-setting', 'category-setting', 'analysis', 'user', 'all-email', 'role', 'reg-key', 'sys-setting'].includes(route.name)
})

const showReadingPane = computed(() => {
  const mailRoutes = ['email','all-email','send','star','draft','user-all-email','snoozed','spam','trash']
  return mailRoutes.includes(route.meta.name) && !!emailStore.contentData.email
})

const hasWallpaper = computed(() => {
  return !!(uiStore.themeWallpaper && uiStore.themeWallpaper !== 'none')
})

const wallpaperStyle = computed(() => {
  if (!hasWallpaper.value) return {}
  const bg = getWallpaperCssById(uiStore.themeWallpaper)
  if (!bg) return {}
  return {
    backgroundImage: bg,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    '--panel-alpha': `${uiStore.themeWallpaperOpacity || 88}%`
  }
})

watch(() => route.path, () => {
  emailStore.contentData.email = null
})

watch(() => uiStore.changeNotice, () => {

  const settings = settingStore.settings

  let data = {
    notice: settings.notice,
    noticeWidth: settings.noticeWidth,
    noticeTitle: settings.noticeTitle,
    noticeContent: settings.noticeContent,
    noticeType: settings.noticeType,
    noticeDuration: settings.noticeDuration,
    noticePosition: settings.noticePosition,
    noticeOffset: settings.noticeOffset
  }

  showNotice(data)
})

watch(() => uiStore.changePreview, () => {
  showNotice(uiStore.previewData)
})

function showNotice(data) {

  if (data.notice === 1) {
    return;
  }

  if (elNotification) {
    elNotification.close()
  }

  const style = document.createElement('style');
  style.innerHTML = `
  .custom-notice.el-notification {
    --el-notification-width: min(${data.noticeWidth}px,calc(100% - 30px)) !important;
  }
  `;

  document.head.appendChild(style);

  let htmlContent = data.noticeContent || '';
  const cMap = {
    '1': '#ff4d4f', '2': '#52c41a', '3': '#1890ff', '4': '#faad14', '5': '#13c2c2',
    '6': '#722ed1', '7': 'var(--el-color-primary)', '8': 'var(--el-color-success)', '9': 'var(--el-color-warning)', '0': 'inherit'
  };
  htmlContent = htmlContent.replace(/<c([^>]+)>(.*?)<\/c>/gi, (match, p1, p2) => {
    let v = p1.replace(/^[=\s'"]+|['"\s]+$/g, '');
    let c = cMap[v] || v;
    if (!cMap[v] && /^[0-9a-fA-F]{3,8}$/.test(v)) c = '#' + v;
    return `<span style="color: ${c}">${p2}</span>`;
  });

  elNotification = ElNotification({
    title: data.noticeTitle,
    message: `<div style="width: 100%;height: 100%;">${htmlContent}</div>`,
    type: data.noticeType === 'none' ? '' : data.noticeType,
    duration: data.noticeDuration,
    position: data.noticePosition,
    offset: data.noticeOffset,
    dangerouslyUseHTMLString: true,
    customClass: 'custom-notice'
  })
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  handleResize()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})

const handleResize = () => {
  if (['content','email','send'].includes(route.meta.name)) {
    if (innerWidth !==  window.innerWidth) {
      innerWidth = window.innerWidth;
      uiStore.accountShow = window.innerWidth >= 767;
    }
  }
}

</script>
<style lang="scss" scoped>

.main-box-hide {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.main-view {
  background: var(--bg-surface);
  height: 100%;
}

/* --- Split View Layout (Mail) --- */
.split-view-container {
  display: flex;
  height: 100%;
  width: 100%;
  background: var(--bg-surface);
  position: relative;
  background-image: var(--main-wallpaper-url, none);
  background-size: cover;
  background-position: center;

  &.reading-pane-below {
    flex-direction: column;

    &.has-reading-pane:not(.is-mobile) .list-column {
      flex: 0 0 45%;
      border-right: none;
      border-bottom: 1px solid var(--border-subtle);
    }

    .reading-pane-column {
      flex: 1;
      height: 55%;
    }
  }

  &.reading-pane-no_split {
    .hide-on-no-split {
      display: none !important;
    }
    .reading-pane-column {
      flex: 1;
      width: 100%;
    }
  }
}

.split-view-container.has-main-wallpaper {
  .list-column {
    background: color-mix(in srgb, var(--el-bg-color, #ffffff) var(--panel-alpha, 88%), transparent) !important;
  }

  .reading-pane-column {
    background: color-mix(in srgb, var(--el-bg-color, #ffffff) var(--panel-alpha, 94%), transparent) !important;
  }
}

.no-split-back-bar {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  display: flex;
  align-items: center;

  .back-to-list-btn {
    font-size: 13px;
    font-weight: 500;
    color: var(--accent-primary);
  }
}

.list-column {
  flex: 1;
  height: 100%;
  overflow: hidden;
  transition: all 0.3s;
}

.split-view-container.has-reading-pane:not(.is-mobile):not(.reading-pane-below) .list-column {
  flex: 0 0 350px;
  border-right: 1px solid var(--border-subtle);
}

.reading-pane-column {
  flex: 1;
  height: 100%;
  overflow: hidden;
  background: var(--bg-surface);
}

.hide-on-mobile {
  display: none !important;
}

/* --- Settings Layout --- */
.settings-layout {
  display: flex;
  height: 100%;
  width: 100%;
  background: var(--bg-base, #f4f7fc);
}

.settings-sidebar {
  width: 260px;
  background: var(--bg-surface, #ffffff);
  border-right: 1px solid var(--border-subtle, #e5e7eb);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  
  @media (max-width: 767px) {
    display: none; /* In mobile, maybe we handle settings differently, but for now just hide */
  }
}

.settings-sidebar-content {
  padding: 16px 0;
}

.settings-title {
  padding: 12px 24px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  margin-bottom: 16px;
  transition: color 0.2s;
  
  &:hover {
    color: var(--accent-primary);
  }
}

.nav-section-title {
  padding: 16px 24px 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 24px;
  color: var(--text-secondary);
  font-size: 14px;
  text-decoration: none;
  transition: background-color 0.2s, color 0.2s;
  
  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }
  
  &.active {
    background-color: var(--accent-muted);
    color: var(--text-accent);
    font-weight: 600;
    border-right: 3px solid var(--accent-primary);
  }
}

.settings-content {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  background: var(--bg-surface);
  
  @media (min-width: 1024px) {
    padding: 24px 40px;
  }
  @media (max-width: 1023px) {
    padding: 16px 20px;
  }
}
</style>
