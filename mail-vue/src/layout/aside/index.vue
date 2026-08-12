<template>
  <div class="aside-container">
    <el-scrollbar class="scroll" style="flex: 1">
      <div>
        <div class="title" >
          <Icon icon="mdi:email-outline" width="24" height="24" />
          <div>{{settingStore.settings.title}}</div>
        </div>

        <!-- Compose / Back Button -->
        <div v-if="!isSettingsMode" v-perm="'email:send'" class="compose-btn-wrapper" @click="openSend">
          <button class="compose-btn" :class="(!uiStore.asideShow && !isMobile) ? 'collapsed' : ''">
            <Icon icon="material-symbols:edit-outline-sharp" width="24" height="24"/>
            <span class="compose-text">{{$t('writeEmail') || 'Compose'}}</span>
          </button>
        </div>
        <div v-else class="compose-btn-wrapper" @click="router.push({name: 'email'})">
          <button class="compose-btn settings-back" :class="(!uiStore.asideShow && !isMobile) ? 'collapsed' : ''">
            <Icon icon="lucide:arrow-left" width="20" height="20"/>
            <span class="compose-text">{{$t('backToMail') || 'Back to Mail'}}</span>
          </button>
        </div>

        <!-- Mail Mode Menu -->
        <el-menu v-if="!isSettingsMode" :collapse="!uiStore.asideShow && !isMobile" style="margin-top: 10px">
          <el-menu-item @click="router.push({name: 'email'})" index="email"
                        :class="route.name === 'email' ? 'choose-item' : ''">
            <Icon icon="hugeicons:mailbox-01" width="20" height="20" />
            <template #title>
              <span class="menu-name" style="margin-left: 21px">{{$t('inbox')}}</span>
            </template>
          </el-menu-item>
          <el-menu-item @click="router.push({name: 'send'})" index="send" v-perm="'email:send'"
                        :class="route.name === 'send' ? 'choose-item' : ''">
            <Icon icon="cil:send" width="20" height="20" />
            <template #title>
              <span class="menu-name" style="margin-left: 21px">{{$t('sent')}}</span>
            </template>
          </el-menu-item>
          <el-menu-item @click="router.push({name: 'draft'})" index="draft" v-perm="'email:send'"
                        :class="route.name === 'draft' ? 'choose-item' : ''">
            <Icon icon="ep:document" width="20" height="20" />
            <template #title>
              <span class="menu-name" style="margin-left: 22px">{{$t('drafts')}}</span>
            </template>
          </el-menu-item>
          <el-menu-item @click="router.push({name: 'star'})" index="star"
                        :class="route.name === 'star' ? 'choose-item' : ''">
            <Icon icon="solar:star-line-duotone" width="20" height="20" />
            <template #title>
              <span class="menu-name" style="margin-left: 21px">{{$t('starred')}}</span>
            </template>
          </el-menu-item>
          
          <div style="height: 16px;"></div> <!-- Spacer -->
          
          <el-menu-item @click="router.push({name: 'setting'})" index="setting"
                        :class="route.name === 'setting' ? 'choose-item' : ''">
            <Icon icon="fluent:settings-48-regular" width="20" height="20" />
            <template #title>
              <span class="menu-name" style="margin-left: 21px">{{$t('settings')}}</span>
            </template>
          </el-menu-item>
        </el-menu>

        <!-- Settings Mode Menu -->
        <el-menu v-else :collapse="!uiStore.asideShow && !isMobile" style="margin-top: 10px">
          
          <div class="manage-title" :class="(!uiStore.asideShow && !isMobile) ? 'is-collapsed' : ''">
            <span v-if="uiStore.asideShow || isMobile">{{$t('profile')}} / {{$t('general')}}</span>
          </div>

          <el-menu-item @click="router.push({name: 'setting'})" index="setting"
                        :class="route.name === 'setting' ? 'choose-item' : ''">
            <Icon icon="fluent:settings-48-regular" width="20" height="20" />
            <template #title>
              <span class="menu-name" style="margin-left: 21px">{{$t('settings')}}</span>
            </template>
          </el-menu-item>

          <div class="manage-title" :class="(!uiStore.asideShow && !isMobile) ? 'is-collapsed' : ''" v-perm="['all-email:query','user:query','role:query','setting:query','analysis:query','reg-key:query']">
            <span v-if="uiStore.asideShow || isMobile">{{$t('manage')}}</span>
          </div>
          
          <el-menu-item @click="router.push({name: 'analysis'})" index="analysis" v-perm="'analysis:query'"
                        :class="route.name === 'analysis' ? 'choose-item' : ''">
            <Icon icon="fluent:data-pie-20-regular" width="22" height="22" />
            <template #title>
              <span class="menu-name" style="margin-left: 18px">{{$t('analytics')}}</span>
            </template>
          </el-menu-item>
          <el-menu-item @click="router.push({name: 'user'})" index="user" v-perm="'user:query'"
                        :class="route.name === 'user' ? 'choose-item' : ''">
            <Icon icon="si:user-alt-2-line" width="20" height="20" />
            <template #title>
              <span class="menu-name" style="margin-left: 21px">{{$t('allUsers')}}</span>
            </template>
          </el-menu-item>
          <el-menu-item @click="router.push({name: 'all-email'})" index="all-email" v-perm="'all-email:query'"
                        :class="route.name === 'all-email' ? 'choose-item' : ''">
            <Icon icon="fluent:mail-list-28-regular" width="22" height="22" />
            <template #title>
              <span class="menu-name" style="margin-left: 20px">{{$t('allMail')}}</span>
            </template>
          </el-menu-item>
          <el-menu-item @click="router.push({name: 'role'})" index="role" v-perm="'role:query'"
                        :class="route.name === 'role' ? 'choose-item' : ''">
            <Icon icon="fluent:lock-closed-16-regular" width="22" height="22" />
            <template #title>
              <span class="menu-name" style="margin-left: 20px">{{$t('permissions')}}</span>
            </template>
          </el-menu-item>
          <el-menu-item @click="router.push({name: 'reg-key'})" index="reg-key" v-perm="'reg-key:query'"
                        :class="route.name === 'reg-key' ? 'choose-item' : ''">
            <Icon icon="fluent:fingerprint-20-filled" width="22" height="22" />
            <template #title>
              <span class="menu-name" style="margin-left: 20px">{{$t('inviteCode')}}</span>
            </template>
          </el-menu-item>
          <el-menu-item @click="router.push({name: 'sys-setting'})" index="sys-setting" v-perm="'setting:query'"
                        :class="route.name === 'sys-setting' ? 'choose-item' : ''">
            <Icon icon="eos-icons:system-ok-outlined" width="18" height="18" style="margin-left: 2px" />
            <template #title>
              <span class="menu-name" style="margin-left: 22px">{{$t('SystemSettings')}}</span>
            </template>
          </el-menu-item>
        </el-menu>
        
      </div>
    </el-scrollbar>
    <div class="status-bar" :class="(!uiStore.asideShow && !isMobile) ? 'collapsed' : ''">
      <div class="status-dot"></div>
      <div class="status-text" v-if="uiStore.asideShow || isMobile">Connected <span class="status-time">Synced just now</span></div>
    </div>
  </div>
</template>

<script setup>
import router from "@/router/index.js";
import { useRoute } from "vue-router";
import {Icon} from "@iconify/vue";
import {useSettingStore} from "@/store/setting.js";
import {useUserStore} from "@/store/user.js";
import {useUiStore} from "@/store/ui.js";
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';

const settingStore = useSettingStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const route = useRoute();

const isSettingsMode = computed(() => {
  return ['setting', 'analysis', 'user', 'all-email', 'role', 'reg-key', 'sys-setting'].includes(route.name)
})

const isMobile = ref(window.innerWidth < 1025)
const handleResize = () => {
  isMobile.value = window.innerWidth < 1025
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  handleResize()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})

function openSend() {
  uiStore.writerRef.open()
}

</script>

<style lang="scss" scoped>
.aside-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.status-bar {
  margin-top: auto;
  padding: 16px 20px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-surface);
  
  &.collapsed {
    justify-content: center;
    padding: 16px 0;
  }
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 6px var(--success);
  flex-shrink: 0;
}

.status-text {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.status-time {
  color: var(--text-muted);
  margin-left: 4px;
}

.title {
  display: none;
}

.manage-title {
  padding: 10px 20px 4px;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: .8px;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: space-between;

  &.is-collapsed {
    padding: 0;
    margin-top: 24px;
    margin-bottom: 12px;
    height: 1px;
    width: 100%;
  }
}

.el-menu-item {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 36px;
  margin: 1px 10px !important;
  padding: 0 12px !important;
  cursor: pointer;
  color: var(--text-secondary);
  border-radius: 18px;
  transition: background .14s, color .14s, margin .22s var(--ease), padding .22s var(--ease);
  font-size: 13px;
  position: relative;
  white-space: nowrap;
  overflow: hidden;
}

.choose-item {
  background: var(--accent-muted) !important;
  color: var(--text-accent) !important;
  font-weight: 600;
  box-shadow: none;
  
  :deep(svg) {
    color: var(--accent-primary);
  }
}

@media (hover: hover) {
  .el-menu-item:hover:not(.choose-item) {
    background: var(--bg-hover) !important;
    color: var(--text-primary);
  }
}

.menu-name {
  user-select: none;
}


:deep(.el-scrollbar__wrap--hidden-default ) {
  background: var(--bg-surface) !important;
}

:deep(.el-menu-item) {
  background: transparent;
}

:deep(.el-menu) {
  background: transparent;
  border-right: none;
}

.el-menu {
  border-right: 0;
  width: var(--sidebar-w);
}

:deep(.el-divider__text) {
  background: var(--bg-surface);
  color: var(--regular-text-color);
}

.compose-btn-wrapper {
  padding: 14px 12px 12px;
  display: flex;
}

.compose-btn {
  height: 44px;
  width: 100%;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  border: none;
  border-radius: 22px;
  color: #fff;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  transition: transform .15s var(--ease), box-shadow .2s, width .28s var(--ease), margin .28s var(--ease);
  box-shadow: 0 3px 14px rgba(91,110,245,.4);
  position: relative;
  overflow: hidden;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 24px rgba(91,110,245,.55);
  }

  &:active {
    transform: translateY(0) scale(.98);
  }

  .compose-text {
    white-space: nowrap;
  }
}

.compose-btn.settings-back {
  background: var(--bg-hover);
  color: var(--text-primary);
  box-shadow: none;
  
  &:hover {
    background: var(--bg-active);
    transform: translateY(-1px);
    box-shadow: none;
  }
  
  &:active {
    transform: translateY(0) scale(0.98);
  }
}

.compose-btn.collapsed {
  width: 48px;
  height: 48px;
  margin: 0 auto;
  border-radius: 50%;
  padding: 0;
  gap: 0;

  .compose-text {
    display: none;
  }
}

:deep(.el-menu--collapse) {
  width: var(--sidebar-collapsed);
  .el-menu-item {
    margin: 3px 0 !important;
    padding: 0 !important;
    height: 44px !important;
    justify-content: center;
    gap: 0;
    border-radius: 0 !important;
    background: transparent !important;
    
    &:hover {
      background: transparent !important;
      
      .el-tooltip__trigger {
        background: var(--bg-hover);
        border-radius: 50%;
      }
    }
    
    &.choose-item .el-tooltip__trigger {
      background: var(--accent-muted);
      border-radius: 50%;
    }

    .menu-name {
      display: none;
    }

    .el-tooltip__trigger {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px !important;
      height: 44px !important;
      padding: 0 !important;
      transition: background 0.15s;
    }
  }
}
</style>
