<template>
  <el-config-provider :locale="settingStore.lang === 'zh' ? zhCn : null">
    <router-view />
  </el-config-provider>
</template>
<script setup>
import { useI18n } from "vue-i18n";
import { watch } from "vue";
import {useSettingStore} from "@/store/setting.js";
const settingStore = useSettingStore()
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import('@/icons/index.js')
import { useUiStore } from "@/store/ui.js";
import { userSetCustomLabels } from "@/request/my.js";
const { locale } = useI18n()
locale.value = settingStore.lang
watch(() => settingStore.lang, () => locale.value = settingStore.lang)

const uiStore = useUiStore()
let isFirstLoad = true
watch(
  () => [uiStore.customLabels, uiStore.defaultLabels],
  ([newCustom, newDefault]) => {
    if (isFirstLoad) {
      isFirstLoad = false;
      return;
    }
    const payload = {
      customLabels: newCustom,
      defaultLabels: newDefault
    };
    userSetCustomLabels(JSON.stringify(payload)).catch(e => console.error('Failed to sync labels', e))
  },
  { deep: true }
)
</script>
