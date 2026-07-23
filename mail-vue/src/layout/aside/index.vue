<template>
  <el-scrollbar class="scroll">
    <div>
      <div class="title" >
        <Icon icon="mdi:email-outline" width="24" height="24" />
        <div>{{settingStore.settings.title}}</div>
      </div>
      <div v-perm="'email:send'" class="compose-btn-wrapper" @click="openSend">
        <button class="compose-btn" :class="(!uiStore.asideShow && !isMobile) ? 'collapsed' : ''">
          <Icon icon="material-symbols:edit-outline-sharp" width="22" height="22"/>
          <span class="compose-text">{{$t('writeEmail') || 'Compose'}}</span>
        </button>
      </div>

      <el-menu :collapse="!uiStore.asideShow && !isMobile" style="margin-top: 10px">
        <el-menu-item @click="router.push({name: 'email'})" index="email"
                      :class="route.meta.name === 'email' ? 'choose-item' : ''">
          <Icon icon="hugeicons:mailbox-01" width="20" height="20" />
          <template #title>
            <span class="menu-name" style="margin-left: 21px">{{$t('inbox')}}</span>
          </template>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'send'})" index="send" v-perm="'email:send'"
                      :class="route.meta.name === 'send' ? 'choose-item' : ''">
          <Icon icon="cil:send" width="20" height="20" />
          <template #title>
            <span class="menu-name" style="margin-left: 21px">{{$t('sent')}}</span>
          </template>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'draft'})" index="draft" v-perm="'email:send'"
                      :class="route.meta.name === 'draft' ? 'choose-item' : ''">
          <Icon icon="ep:document" width="19" height="19" />
          <template #title>
            <span class="menu-name" style="margin-left: 22px">{{$t('drafts')}}</span>
          </template>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'star'})" index="star"
                      :class="route.meta.name === 'star' ? 'choose-item' : ''">
          <Icon icon="solar:star-line-duotone" width="20" height="20" />
          <template #title>
            <span class="menu-name" style="margin-left: 21px">{{$t('starred')}}</span>
          </template>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'setting'})" index="setting"
                      :class="route.meta.name === 'setting' ? 'choose-item' : ''">
          <Icon icon="fluent:settings-48-regular" width="20" height="20" />
          <template #title>
            <span class="menu-name" style="margin-left: 21px">{{$t('settings')}}</span>
          </template>
        </el-menu-item>
        
        <div class="manage-title" v-perm="['all-email:query','user:query','role:query','setting:query','analysis:query','reg-key:query']">
          <span v-if="uiStore.asideShow || isMobile">{{$t('manage')}}</span>
          <span v-else>···</span>
        </div>
        
        <el-menu-item @click="router.push({name: 'analysis'})" index="analysis" v-perm="'analysis:query'"
                      :class="route.meta.name === 'analysis' ? 'choose-item' : ''">
          <Icon icon="fluent:data-pie-20-regular" width="24" height="24" />
          <template #title>
            <span class="menu-name" style="margin-left: 18px">{{$t('analytics')}}</span>
          </template>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'user'})" index="user" v-perm="'user:query'"
                      :class="route.meta.name === 'user' ? 'choose-item' : ''">
          <Icon icon="si:user-alt-2-line" width="20" height="20" />
          <template #title>
            <span class="menu-name" style="margin-left: 21px">{{$t('allUsers')}}</span>
          </template>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'all-email'})" index="all-email" v-perm="'all-email:query'"
                      :class="route.meta.name === 'all-email' ? 'choose-item' : ''">
          <Icon icon="fluent:mail-list-28-regular" width="22" height="22" />
          <template #title>
            <span class="menu-name" style="margin-left: 20px">{{$t('allMail')}}</span>
          </template>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'role'})" index="role" v-perm="'role:query'"
                      :class="route.meta.name === 'role' ? 'choose-item' : ''">
          <Icon icon="fluent:lock-closed-16-regular" width="22" height="22" />
          <template #title>
            <span class="menu-name" style="margin-left: 20px">{{$t('permissions')}}</span>
          </template>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'reg-key'})" index="reg-key" v-perm="'reg-key:query'"
                      :class="route.meta.name === 'reg-key' ? 'choose-item' : ''">
          <Icon icon="fluent:fingerprint-20-filled" width="22" height="22" />
          <template #title>
            <span class="menu-name" style="margin-left: 20px">{{$t('inviteCode')}}</span>
          </template>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'sys-setting'})" index="sys-setting" v-perm="'setting:query'"
                      :class="route.meta.name === 'sys-setting' ? 'choose-item' : ''">
          <Icon icon="eos-icons:system-ok-outlined" width="18" height="18" style="margin-left: 2px" />
          <template #title>
            <span class="menu-name" style="margin-left: 22px">{{$t('SystemSettings')}}</span>
          </template>
        </el-menu-item>
      </el-menu>
      
    </div>
  </el-scrollbar>
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

.title {
  display: none;
}

.manage-title {
  margin-top: 15px;
  margin-bottom: 5px;
  padding-left: 20px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--secondary-text-color);
  letter-spacing: 0.5px;
}

.el-menu-item {
  margin: 4px 10px !important;
  border-radius: 8px;
  height: 40px;
  padding: 10px !important;
  color: var(--regular-text-color);
  transition: all 0.2s ease;
}

.choose-item {
  font-weight: 600;
  color: var(--el-color-primary) !important;
  background: var(--el-bg-color) !important;
  box-shadow: 0 2px 6px rgba(0,0,0, 0.04);
}

@media (hover: hover) {
  .el-menu-item:hover:not(.choose-item) {
    background: rgba(0, 0, 0, 0.04) !important;
    color: var(--el-text-color-primary);
  }
}

.menu-name {
  user-select: none;
}


:deep(.el-scrollbar__wrap--hidden-default ) {
  background: var(--aside-backgound) !important;
}

:deep(.el-menu-item) {
  background: transparent;
}

:deep(.el-menu) {
  background: transparent;
}

.el-menu {
  border-right: 0;
  width: 260px;
}

:deep(.el-divider__text) {
  background: var(--aside-backgound);
  color: var(--regular-text-color);
}

.compose-btn-wrapper {
  padding: 10px 10px;
  display: flex;
}

.compose-btn {
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  border: none;
  height: 56px;
  width: 140px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);

  &:hover {
    background: var(--el-color-primary-light-7);
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
  }

  .compose-text {
    font-weight: 500;
    font-size: 14px;
    white-space: nowrap;
    opacity: 1;
    transition: opacity 0.2s;
  }
}

.compose-btn.collapsed {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  padding: 0;
  justify-content: center;
  gap: 0;

  .compose-text {
    display: none;
  }

  svg {
    width: 24px !important;
    height: 24px !important;
  }
}

:deep(.el-menu--collapse) {
  width: 64px;
  .el-menu-item {
    padding: 0 !important;
    justify-content: center;
    border-radius: 50% !important;
    width: 44px !important;
    height: 44px !important;
    margin: 8px auto !important;
    
    .menu-name {
      display: none;
    }

    svg {
      width: 24px !important;
      height: 24px !important;
    }
  }
}
</style>
