<template>
  <div :class="accountShow && hasPerm('account:query') ? 'main-box-show' : 'main-box-hide'">
    <div :class="accountShow && hasPerm('account:query') ? 'block-show' : 'block-hide'" @click="uiStore.accountShow = false"></div>
    <account  :class="accountShow && hasPerm('account:query') ? 'show' : 'hide'" />
    <div class="split-view-container" :class="{'has-reading-pane': showReadingPane, 'is-mobile': isMobileView}">
      <div class="list-column" :class="{'hide-on-mobile': showReadingPane && isMobileView}">
        <router-view class="main-view" v-slot="{ Component,route }">
          <keep-alive :include="['email','all-email','send','sys-setting','star','user','role','analysis','reg-key','draft']">
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
import account from '@/layout/account/index.vue'
import ContentComponent from '@/views/content/index.vue'
import {useUiStore} from "@/store/ui.js";
import {useEmailStore} from "@/store/email.js";
import {useSettingStore} from "@/store/setting.js";
import {computed, onBeforeUnmount, onMounted, watch} from "vue";
import { useRoute } from 'vue-router'
import { hasPerm } from "@/perm/perm.js"

const settingStore = useSettingStore()
const uiStore = useUiStore();
const emailStore = useEmailStore();
const route = useRoute()
let  innerWidth =  window.innerWidth

let elNotification = null

const accountShow = computed(() => {
  return uiStore.accountShow && settingStore.settings.manyEmail === 0
})

const isMobileView = computed(() => window.innerWidth < 768)
const showReadingPane = computed(() => {
  const mailRoutes = ['email','all-email','send','star','draft']
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

.block-show {
  position: fixed;
  @media (max-width: 767px) {
    position: absolute;
    right: 0;
    border: 0;
    height: 100%;
    width: 100%;
    background: #000000;
    opacity: 0.6;
    z-index: 10;
    transition: all 300ms;
  }
}

.block-hide {
  position: fixed;
  pointer-events: none;
  transition: all 300ms;
}

.show {
  transition: all 100ms;
  @media (max-width: 767px) {
    position: fixed;
    z-index: 100;
    width: 260px;
  }
}

.hide {
  transition: all 100ms;
  position: fixed;
  transform: translateX(-100%);
  opacity: 0;
  @media (max-width: 1024px) {
    width: 260px;
    z-index: 100;
  }
}


.main-box-show {
  display: grid;
  grid-template-columns: 260px  1fr;
  height: calc(100% - 60px);
  @media (max-width: 767px) {
    grid-template-columns: 1fr;
  }
}

.main-box-hide {
  display: grid;
  grid-template-columns: 1fr;
  height: calc(100% - 60px);
}


.main-view {
  background: var(--el-bg-color);
  height: 100%;
}

.split-view-container {
  display: flex;
  height: 100%;
  width: 100%;
  background: var(--el-bg-color);
}

.list-column {
  flex: 1;
  height: 100%;
  overflow: hidden;
  transition: all 0.3s;
}

.split-view-container.has-reading-pane:not(.is-mobile) .list-column {
  flex: 0 0 350px;
  border-right: 1px solid var(--el-border-color);
}

.reading-pane-column {
  flex: 1;
  height: 100%;
  overflow: hidden;
  background: var(--el-bg-color);
}

.hide-on-mobile {
  display: none !important;
}


.navigation {
  height: 30px;
  border-bottom: solid 1px var(--el-menu-border-color);
  display: inline-flex;
  justify-items: center;
  align-items: center;
  width: 100%;
  .tag {
    background: var(--el-bg-color);
    margin-left: 5px;
  }
}
</style>
