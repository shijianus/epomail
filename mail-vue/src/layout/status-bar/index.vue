<template>
  <div class="status-bar">
    <div class="status-dot" :class="{'offline': !isOnline}"></div>
    <div class="status-text">
      {{ isOnline ? ($t('connected') || 'Connected') : ($t('disconnected') || 'Disconnected') }} 
      <span class="status-time" v-if="isOnline">{{ syncTimeText }}</span>
      <span class="status-unread" v-if="isOnline && unreadCount > 0"> ({{ unreadCount }} {{ $t('statUnread') || 'Unread' }})</span>
    </div>
    <div style="flex: 1"></div>
    <el-tooltip effect="dark" :content="currentMailModeConfig.desc" placement="top">
      <div class="mode-tag" :class="currentMailModeConfig.tagClass">
        <Icon :icon="currentMailModeConfig.icon" width="13" height="13" />
        <span>{{ currentMailModeConfig.title }}</span>
      </div>
    </el-tooltip>
    <div class="status-text version-tag">{{ APP_VERSION_TAG }}</div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { APP_VERSION_TAG } from '@/const/version.js';
import { useUiStore } from '@/store/ui.js';
import { useEmailStore } from '@/store/email.js';
import { useSettingStore } from '@/store/setting.js';
import { fromNow } from '@/utils/day.js';
import { useI18n } from 'vue-i18n';
import { Icon } from '@iconify/vue';
import { EmailUnreadEnum } from '@/enums/email-enum.js';

const { t } = useI18n();
const uiStore = useUiStore();
const emailStore = useEmailStore();
const settingStore = useSettingStore();

const currentMailModeConfig = computed(() => {
  const mode = Number(settingStore.settings?.allMailMode);
  if (mode === 1) {
    return {
      tagClass: 'mode-red',
      icon: 'fluent:eye-20-filled',
      title: t('allMailModeStatus'),
      desc: t('allMailModeStatusDesc')
    };
  } else if (mode === 2) {
    return {
      tagClass: 'mode-green',
      icon: 'fluent:shield-lock-20-filled',
      title: t('encryptedMailModeStatus'),
      desc: t('encryptedMailModeStatusDesc')
    };
  } else {
    // Mode 0: 隐私邮件模式 (Orange indicator)
    return {
      tagClass: 'mode-orange',
      icon: 'fluent:shield-keyhole-20-filled',
      title: t('privacyMailModeStatus'),
      desc: t('privacyMailModeStatusDesc')
    };
  }
});

const isOnline = ref(navigator.onLine);
const handleOnlineStatus = () => {
  isOnline.value = navigator.onLine;
};

const syncTimeText = ref(t('syncedJustNow') || 'Synced just now');
let timer = null;

const updateSyncTimeText = () => {
  if (uiStore.lastSyncTime) {
    const diff = Date.now() - uiStore.lastSyncTime;
    if (diff < 60000) {
      syncTimeText.value = t('syncedJustNow') || 'Synced just now';
    } else {
      syncTimeText.value = fromNow(uiStore.lastSyncTime);
    }
  } else {
    syncTimeText.value = t('syncedJustNow') || 'Synced just now';
  }
};

onMounted(() => {
  window.addEventListener('online', handleOnlineStatus);
  window.addEventListener('offline', handleOnlineStatus);
  timer = setInterval(updateSyncTimeText, 1000 * 30);
  updateSyncTimeText();
});

onUnmounted(() => {
  window.removeEventListener('online', handleOnlineStatus);
  window.removeEventListener('offline', handleOnlineStatus);
  if (timer) clearInterval(timer);
});

watch(() => uiStore.lastSyncTime, () => {
  updateSyncTimeText();
});

const unreadCount = computed(() => {
  const list = emailStore.emailScroll?.emailList || [];
  return list.filter(e => e.unread === EmailUnreadEnum.UNREAD).length;
});
</script>

<style lang="scss" scoped>
.status-bar {
  width: 100%;
  height: 22px;
  background: var(--bg-surface, #ffffff);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 16px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success, #4caf7d);
  box-shadow: 0 0 6px var(--success, #4caf7d);
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.status-dot.offline {
  background: var(--danger, #f44336);
  box-shadow: 0 0 6px var(--danger, #f44336);
}

.status-text {
  font-size: 10.5px;
  color: var(--text-muted, #828aad);
  display: flex;
  align-items: center;
  gap: 5px;
}

.status-time {
  margin-left: 5px;
}

.status-unread {
  font-weight: 500;
  color: var(--text-primary);
}

.mode-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 4px;
  cursor: default;
  user-select: none;
  transition: all 0.2s ease;

  &.mode-red {
    color: #ff4d4f;
    background: rgba(255, 77, 79, 0.1);
    border: 1px solid rgba(255, 77, 79, 0.25);
  }

  &.mode-orange {
    color: #fa8c16;
    background: rgba(250, 140, 22, 0.1);
    border: 1px solid rgba(250, 140, 22, 0.25);
  }

  &.mode-green {
    color: #52c41a;
    background: rgba(82, 196, 26, 0.1);
    border: 1px solid rgba(82, 196, 26, 0.25);
  }
}

/* 窄屏：隐藏版本号避免与模式徽章重叠，压缩文本 */
@media (max-width: 767px) {
  .version-tag {
    display: none;
  }

  .status-text {
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
