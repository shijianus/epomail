<template>
  <div class="aside-container">
    <el-scrollbar class="scroll" style="flex: 1">
      <div>
        <div class="title" >
          <Icon icon="mdi:email-outline" width="24" height="24" />
          <div>{{settingStore.settings.title}}</div>
        </div>

        <!-- Compose Button -->
        <div v-perm="'email:send'" class="compose-btn-wrapper" @click="openSend">
          <button class="compose-btn" :class="(!uiStore.asideShow && !isMobile) ? 'collapsed' : ''">
            <Icon icon="material-symbols:edit-outline-sharp" width="24" height="24"/>
            <span class="compose-text">{{$t('writeEmail') || 'Compose'}}</span>
          </button>
        </div>

        <!-- Mail Menu -->
        <el-menu :collapse="!uiStore.asideShow && !isMobile" style="margin-top: 10px">
          <el-menu-item @click="router.push({name: 'email'})" index="email"
                        :class="route.name === 'email' ? 'choose-item' : ''">
            <Icon icon="hugeicons:mailbox-01" width="20" height="20" />
            <template #title>
              <span class="menu-name" style="margin-left: 14px">{{$t('inbox')}}</span>
            </template>
          </el-menu-item>
          <el-menu-item @click="router.push({name: 'star'})" index="star"
                        :class="route.name === 'star' ? 'choose-item' : ''">
            <Icon icon="solar:star-line-duotone" width="20" height="20" />
            <template #title>
              <span class="menu-name" style="margin-left: 14px">{{$t('starred')}}</span>
            </template>
          </el-menu-item>
          <el-menu-item @click="router.push({name: 'send'})" index="send" v-perm="'email:send'"
                        :class="route.name === 'send' ? 'choose-item' : ''">
            <Icon icon="cil:send" width="20" height="20" />
            <template #title>
              <span class="menu-name" style="margin-left: 14px">{{$t('sent')}}</span>
            </template>
          </el-menu-item>
          <el-menu-item @click="router.push({name: 'draft'})" index="draft" v-perm="'email:send'"
                        :class="route.name === 'draft' ? 'choose-item' : ''">
            <Icon icon="ep:document" width="20" height="20" />
            <template #title>
              <span class="menu-name" style="margin-left: 14px">{{$t('drafts')}}</span>
            </template>
          </el-menu-item>
          <el-menu-item @click="router.push({name: 'all-email'})" index="all-email" v-perm="'all-email:query'"
                        :class="route.name === 'all-email' ? 'choose-item' : ''">
            <Icon icon="fluent:mail-list-28-regular" width="22" height="22" style="margin-left: -1px" />
            <template #title>
              <span class="menu-name" style="margin-left: 13px">{{$t('allMail')}}</span>
            </template>
          </el-menu-item>
        </el-menu>
        
      </div>
    </el-scrollbar>
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

.title {
  display: none;
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
  transition: background .14s, color .14s, margin .22s var(--ease, cubic-bezier(0.4,0,0.2,1)), padding .22s var(--ease, cubic-bezier(0.4,0,0.2,1));
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
  width: var(--sidebar-w, 230px);
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
  transition: transform .15s ease, box-shadow .2s, width .28s ease, margin .28s ease;
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
  width: var(--sidebar-collapsed, 72px);
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
