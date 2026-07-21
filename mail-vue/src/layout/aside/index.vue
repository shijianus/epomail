<template>
  <el-scrollbar class="scroll">
    <div>
      <div class="title" >
        <Icon icon="mdi:email-outline" width="24" height="24" />
        <div>{{settingStore.settings.title}}</div>
      </div>
      <el-menu :collapse="false" style="margin-top: 10px">
        <el-menu-item @click="router.push({name: 'email'})" index="email"
                      :class="route.meta.name === 'email' ? 'choose-item' : ''">
          <Icon icon="hugeicons:mailbox-01" width="20" height="20" />
          <span class="menu-name" style="margin-left: 21px">{{$t('inbox')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'send'})" index="send" v-perm="'email:send'"
                      :class="route.meta.name === 'send' ? 'choose-item' : ''">
          <Icon icon="cil:send" width="20" height="20" />
          <span class="menu-name" style="margin-left: 21px">{{$t('sent')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'draft'})" index="draft" v-perm="'email:send'"
                      :class="route.meta.name === 'draft' ? 'choose-item' : ''">
          <Icon icon="ep:document" width="19" height="19" />
          <span class="menu-name" style="margin-left: 22px">{{$t('drafts')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'star'})" index="star"
                      :class="route.meta.name === 'star' ? 'choose-item' : ''">
          <Icon icon="solar:star-line-duotone" width="20" height="20" />
          <span class="menu-name" style="margin-left: 21px">{{$t('starred')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'setting'})" index="setting"
                      :class="route.meta.name === 'setting' ? 'choose-item' : ''">
          <Icon icon="fluent:settings-48-regular" width="20" height="20" />
          <span class="menu-name" style="margin-left: 21px">{{$t('settings')}}</span>
        </el-menu-item>
        <div class="manage-title" v-perm="['all-email:query','user:query','role:query','setting:query','analysis:query','reg-key:query']">
          <div>{{$t('manage')}}</div>
        </div>
        <el-menu-item @click="router.push({name: 'analysis'})" index="analysis" v-perm="'analysis:query'"
                      :class="route.meta.name === 'analysis' ? 'choose-item' : ''">
          <Icon icon="fluent:data-pie-20-regular" width="24" height="24" />
          <span class="menu-name" style="margin-left: 18px">{{$t('analytics')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'user'})" index="setting" v-perm="'user:query'"
                      :class="route.meta.name === 'user' ? 'choose-item' : ''">
          <Icon icon="si:user-alt-2-line" width="20" height="20" />
          <span class="menu-name" style="margin-left: 21px">{{$t('allUsers')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'all-email'})" index="all-email" v-perm="'all-email:query'"
                      :class="route.meta.name === 'all-email' ? 'choose-item' : ''">
          <Icon icon="fluent:mail-list-28-regular" width="22" height="22" />
          <span class="menu-name" style="margin-left: 20px">{{$t('allMail')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'role'})" index="setting" v-perm="'role:query'"
                      :class="route.meta.name === 'role' ? 'choose-item' : ''">
          <Icon icon="fluent:lock-closed-16-regular" width="22" height="22" />
          <span class="menu-name" style="margin-left: 20px">{{$t('permissions')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'reg-key'})" index="reg-key" v-perm="'reg-key:query'"
                      :class="route.meta.name === 'reg-key' ? 'choose-item' : ''">
          <Icon icon="fluent:fingerprint-20-filled" width="22" height="22" />
          <span class="menu-name" style="margin-left: 20px">{{$t('inviteCode')}}</span>
        </el-menu-item>
        <el-menu-item @click="router.push({name: 'sys-setting'})" index="sys-setting" v-perm="'setting:query'"
                      :class="route.meta.name === 'sys-setting' ? 'choose-item' : ''">
          <Icon icon="eos-icons:system-ok-outlined" width="18" height="18" style="margin-left: 2px" />
          <span class="menu-name" style="margin-left: 22px">{{$t('SystemSettings')}}</span>
        </el-menu-item>
      </el-menu>
      
      <!-- Quota Progress Bar -->
      <div v-if="userStore.user.quota" class="quota-container">
         <div v-if="isDbFull" class="db-full-warning">
            <span v-if="isAdmin">Warning: Database Full</span>
            <span v-else>System Capacity Reached</span>
         </div>
         <div class="quota-title">Storage Quota</div>
         <el-progress 
           :percentage="storagePercent" 
           :status="storageStatus" 
           :stroke-width="6"
           :show-text="false"
         />
         <div class="quota-text">
            <template v-if="isDbFull && !isAdmin">
               Full
            </template>
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
            <template v-if="isDbFull && !isAdmin">
               Full
            </template>
            <template v-else>
               {{ userStore.user.quota.usedEmails }} / {{ userStore.user.quota.maxEmails }}
            </template>
         </div>
      </div>

    </div>
  </el-scrollbar>
</template>

<script setup>
import router from "@/router/index.js";
import { useRoute } from "vue-router";
import {Icon} from "@iconify/vue";
import {useSettingStore} from "@/store/setting.js";
import {useUserStore} from "@/store/user.js";
import { computed } from 'vue';

const settingStore = useSettingStore();
const userStore = useUserStore();
const route = useRoute();

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
</script>

<style lang="scss" scoped>

.title {
  margin: 15px 10px;
  height: 45px;
  border-radius: 8px;
  display: flex;
  position: relative;
  font-size: 18px;
  font-weight: 800;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--el-text-color-primary);
  background: transparent;
  transition: all 0.3s ease;
  max-width: 240px;
  padding: 0 10px;
  
  > div {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: calc(240px - 20px - 30px);
  }

  :deep(.el-icon) {
    flex-shrink: 0;
    font-size: 24px;
    color: var(--el-color-primary);
  }

  .user-right-icon {
    align-self: center;
    position: absolute;
    font-size: 12px;
    right: 8px;
    color: var(--regular-text-color);
  }
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

.quota-container {
  margin: 20px 10px;
  padding: 15px;
  background: var(--base-fill);
  border: 1px solid var(--base-border-color);
  border-radius: 8px;
  color: var(--el-text-color-primary);
}
.quota-title {
  font-size: 12px;
  color: var(--secondary-text-color);
  margin-bottom: 4px;
}
.quota-text {
  font-size: 12px;
  color: var(--regular-text-color);
  text-align: right;
  margin-top: 2px;
}
.db-full-warning {
  color: var(--el-color-danger, #f56c6c);
  font-size: 12px;
  font-weight: bold;
  text-align: center;
  margin-bottom: 8px;
  background: rgba(245, 108, 108, 0.1);
  padding: 4px;
  border-radius: 4px;
}
</style>
