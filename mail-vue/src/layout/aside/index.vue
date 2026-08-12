<template>
  <div class="aside-container" :class="(!uiStore.asideShow && !isMobile) ? 'collapsed' : ''">
    <div class="scroll" style="flex: 1; overflow-y: auto; overflow-x: hidden; scrollbar-width: none;">
      <div>
        <!-- Compose Button -->
        <div v-perm="'email:send'" class="compose-btn-wrapper" @click="openSend">
          <button class="compose-btn">
            <span class="nav-ic-wrap">
              <Icon icon="material-symbols:edit-outline-sharp" width="24" height="24"/>
            </span>
            <span class="compose-text">{{$t('writeEmail') || 'Compose'}}</span>
          </button>
        </div>

        <!-- Mail Menu -->
        <div class="nav-section">
          <div class="nav-item" @click="router.push({name: 'email'})" :class="route.name === 'email' ? 'active' : ''" :title="$t('inbox')">
            <span class="nav-ic-wrap"><Icon icon="hugeicons:mailbox-01" width="20" height="20" /></span>
            <span class="nav-label">{{$t('inbox')}}</span>
            <span class="nav-count" v-if="unreadCount > 0">{{ unreadCount }}</span>
          </div>
          <div class="nav-item" @click="router.push({name: 'star'})" :class="route.name === 'star' ? 'active' : ''" :title="$t('starred')">
            <span class="nav-ic-wrap"><Icon icon="solar:star-line-duotone" width="20" height="20" /></span>
            <span class="nav-label">{{$t('starred')}}</span>
          </div>
          <div class="nav-item" @click="() => {}" :title="$t('snoozed') || 'Snoozed'">
            <span class="nav-ic-wrap"><Icon icon="ic:outline-access-time" width="20" height="20" /></span>
            <span class="nav-label">{{$t('snoozed') || 'Snoozed'}}</span>
          </div>
          <div class="nav-item" @click="router.push({name: 'send'})" v-perm="'email:send'" :class="route.name === 'send' ? 'active' : ''" :title="$t('sent')">
            <span class="nav-ic-wrap"><Icon icon="cil:send" width="20" height="20" /></span>
            <span class="nav-label">{{$t('sent')}}</span>
          </div>
          <div class="nav-item" @click="router.push({name: 'draft'})" v-perm="'email:send'" :class="route.name === 'draft' ? 'active' : ''" :title="$t('drafts')">
            <span class="nav-ic-wrap"><Icon icon="ep:document" width="20" height="20" /></span>
            <span class="nav-label">{{$t('drafts')}}</span>
          </div>
          <div class="nav-item" @click="router.push({name: 'all-email'})" v-perm="'all-email:query'" :class="route.name === 'all-email' ? 'active' : ''" :title="$t('allMail')">
            <span class="nav-ic-wrap"><Icon icon="fluent:mail-list-28-regular" width="22" height="22" /></span>
            <span class="nav-label">{{$t('allMail')}}</span>
          </div>
          <div class="nav-item" @click="() => {}" :title="$t('spam') || 'Spam'">
            <span class="nav-ic-wrap"><Icon icon="ic:outline-report-gmailerrorred" width="20" height="20" /></span>
            <span class="nav-label">{{$t('spam') || 'Spam'}}</span>
          </div>
          <div class="nav-item" @click="() => {}" :title="$t('trash') || 'Trash'">
            <span class="nav-ic-wrap"><Icon icon="ic:outline-delete" width="20" height="20" /></span>
            <span class="nav-label">{{$t('trash') || 'Trash'}}</span>
          </div>
        </div>
        
        <div class="nav-section" id="labelSection" style="margin-top: 24px;">
          <div class="nav-section-label">
            <span>{{ $t('labels') || 'Labels' }}</span>
            <div class="label-add-btn">
              <Icon icon="ic:outline-add" width="18" height="18" />
            </div>
          </div>
          <div class="nav-item" :title="$t('labelWork') || 'Work'">
            <span class="nav-ic-wrap"><Icon icon="ic:outline-work-outline" width="20" height="20" /></span>
            <span class="nav-label">{{ $t('labelWork') || 'Work' }}</span>
          </div>
          <div class="nav-item" :title="$t('labelPersonal') || 'Personal'">
            <span class="nav-ic-wrap"><Icon icon="ic:outline-person-outline" width="20" height="20" /></span>
            <span class="nav-label">{{ $t('labelPersonal') || 'Personal' }}</span>
          </div>
          <div class="nav-item" :title="$t('labelBilling') || 'Billing'">
            <span class="nav-ic-wrap"><Icon icon="ic:outline-receipt" width="20" height="20" /></span>
            <span class="nav-label">{{ $t('labelBilling') || 'Billing' }}</span>
          </div>
          <div class="nav-item" :title="$t('labelNotice') || 'Notice'">
            <span class="nav-ic-wrap"><Icon icon="ic:outline-notifications-none" width="20" height="20" /></span>
            <span class="nav-label">{{ $t('labelNotice') || 'Notice' }}</span>
          </div>
        </div>
        
      </div>
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

// Mock unread count for demonstration
const unreadCount = ref(12);

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
  width: var(--sidebar-w, 230px);
  background: var(--bg-surface);
  border-right: 1px solid var(--border-subtle);
  transition: width .28s var(--ease, cubic-bezier(0.4,0,0.2,1));
  overflow-x: hidden;
}

.aside-container.collapsed {
  width: var(--sidebar-collapsed, 72px);
}

.scroll::-webkit-scrollbar {
  display: none;
}

.compose-btn-wrapper {
  padding: 14px 12px 32px;
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

.collapsed .compose-btn {
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

.nav-section { margin-bottom: 4px; }
.nav-section-label { 
  padding: 10px 16px 8px 25px; 
  font-size: 14px; 
  font-weight: 500; 
  color: var(--text-primary); 
  text-transform: none; 
  letter-spacing: 0; 
  white-space: nowrap; 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
}
.label-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  transition: background .2s;
  color: var(--text-secondary);
}
.label-add-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.label-edit-btn:hover { background: var(--bg-hover); }

.nav-item { 
  display: flex; 
  align-items: center; 
  gap: 14px; 
  height: 38px; 
  margin: 2px 12px; 
  padding: 0 13px; 
  border-radius: 19px; 
  color: var(--text-secondary); 
  cursor: pointer; 
  transition: all .2s; 
  font-size: 13px; 
  position: relative; 
  white-space: nowrap; 
  overflow: hidden; 
}
.nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.nav-item.active { background: var(--accent-muted); color: var(--text-accent); font-weight: 600; }
.nav-item.active .nav-ic-wrap { color: var(--accent-primary); }
.nav-ic-wrap { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 50%; }
.nav-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.nav-count { background: var(--accent-primary); color: #fff; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px; min-width: 18px; text-align: center; }
.nav-count.muted { background: var(--bg-elevated); color: var(--text-muted); }
.divider { height: 1px; background: var(--border-subtle); margin: 8px 16px; }

.collapsed .nav-label,
.collapsed .nav-count,
.collapsed .nav-section-label { display: none; }
.collapsed .nav-item { margin: 12px 0; padding: 0; height: auto; justify-content: center; gap: 0; border-radius: 0; background: transparent; }
.collapsed .nav-ic-wrap { width: 36px; height: 36px; }
.collapsed .nav-item:hover .nav-ic-wrap { background: var(--bg-hover); }
.collapsed .nav-item.active .nav-ic-wrap { background: var(--accent-muted); }
</style>
