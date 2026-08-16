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
            <router-link :to="{name: 'setting'}" class="settings-nav-item" :class="{active: route.name === 'setting'}">
              <Icon icon="fluent:settings-48-regular" width="20" height="20" /> {{$t('general') || 'General'}}
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

              <router-link v-if="hasPerm('all-email:query')" :to="{name: 'all-email'}" class="settings-nav-item" :class="{active: route.name === 'all-email'}">
                <Icon icon="fluent:mail-list-28-regular" width="20" height="20" /> {{$t('allMail')}}
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
                <Icon icon="lucide:network" width="18" height="18" /> 分类管理
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
    <div v-else class="split-view-container" :class="{'has-reading-pane': showReadingPane, 'is-mobile': isMobileView}">
      <div class="list-column" :class="{'hide-on-mobile': showReadingPane && isMobileView}">
        <router-view class="main-view" v-slot="{ Component,route }">
          <keep-alive :include="['email','send','star','draft','user-all-email','snoozed','spam','trash']">
            <component :is="Component" :key="route.name"/>
          </keep-alive>
        </router-view>
      </div>
      <div class="reading-pane-column" v-if="showReadingPane">
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

const settingStore = useSettingStore()
const uiStore = useUiStore();
const emailStore = useEmailStore();
const route = useRoute()
let  innerWidth =  window.innerWidth

let elNotification = null

const isMobileView = computed(() => window.innerWidth < 768)

const isSettingsMode = computed(() => {
  return ['setting', 'label-setting', 'category-setting', 'analysis', 'user', 'all-email', 'role', 'reg-key', 'sys-setting'].includes(route.name)
})

const showReadingPane = computed(() => {
  const mailRoutes = ['email','all-email','send','star','draft','user-all-email','snoozed','spam','trash']
  return mailRoutes.includes(route.meta.name) && !!emailStore.contentData.email
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

  elNotification = ElNotification({
    title: data.noticeTitle,
    message: `<div style="width: 100%;height: 100%;">${data.noticeContent}</div>`,
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
}

.list-column {
  flex: 1;
  height: 100%;
  overflow: hidden;
  transition: all 0.3s;
}

.split-view-container.has-reading-pane:not(.is-mobile) .list-column {
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
