<template>
  <el-config-provider :locale="currentElLocale">
    <router-view />
  </el-config-provider>
</template>
<script setup>
import { useI18n } from "vue-i18n";
import { watch, onMounted, computed } from "vue";
import {useSettingStore} from "@/store/setting.js";
const settingStore = useSettingStore()
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import zhTw from 'element-plus/es/locale/lang/zh-tw';
import en from 'element-plus/es/locale/lang/en';
import fr from 'element-plus/es/locale/lang/fr';
import es from 'element-plus/es/locale/lang/es';
import nl from 'element-plus/es/locale/lang/nl';
import { useUiStore } from "@/store/ui.js";
import { userSetCustomLabels } from "@/request/my.js";

const { locale } = useI18n()
locale.value = settingStore.lang || 'zh'
watch(() => settingStore.lang, (val) => locale.value = val || 'zh')

const currentElLocale = computed(() => {
  const lang = settingStore.lang || 'zh';
  if (lang === 'zh' || lang === 'zh-CN') return zhCn;
  if (lang === 'zh-Hant' || lang === 'zh-TW') return zhTw;
  if (lang === 'fr') return fr;
  if (lang === 'es') return es;
  if (lang === 'nl') return nl;
  return en;
})

onMounted(() => {
  const doc = document.getElementById('loading-first');
  if (doc) {
    doc.classList.add('loading-hide');
    setTimeout(() => {
      if (doc && doc.parentNode) doc.parentNode.removeChild(doc);
    }, 400);
  }
});

const uiStore = useUiStore()
let isFirstLoad = true
watch(
  () => uiStore.allLabels,
  (newLabels) => {
    if (isFirstLoad) {
      isFirstLoad = false;
      return;
    }
    const payload = { allLabels: newLabels }
    userSetCustomLabels(JSON.stringify(payload)).catch(e => console.error('Failed to sync labels', e))
  },
  { deep: true }
)
</script>
