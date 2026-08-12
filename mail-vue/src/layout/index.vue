<template>
  <el-container class="layout" direction="vertical">
    <el-header class="custom-header">
      <Header />
    </el-header>
    <el-container class="body-container">
      <el-aside
          v-show="!isSettingsMode"
          class="aside"
          :class="uiStore.asideShow ? 'aside-show' : 'el-aside-hide'">
        <Aside />
      </el-aside>
      <div
          :class="(uiStore.asideShow && isMobile)? 'overlay-show':'overlay-hide'"
          @click="uiStore.asideShow = false"
      ></div>
      <el-container class="main-container">
        <el-main>
          <Main />
        </el-main>
      </el-container>
    </el-container>
    <el-footer class="custom-footer" height="22px">
      <StatusBar />
    </el-footer>
  </el-container>
  <writer ref="writerRef" />
</template>

<script setup>
import Aside from '@/layout/aside/index.vue'
import Header from '@/layout/header/index.vue'
import Main from '@/layout/main/index.vue'
import StatusBar from '@/layout/status-bar/index.vue'
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import {useUiStore} from "@/store/ui.js";
import {useRoute} from "vue-router";
import writer from '@/layout/write/index.vue'

const uiStore = useUiStore();
const route = useRoute();
const writerRef = ref({})
const isMobile = ref(window.innerWidth < 1025)

const isSettingsMode = computed(() => {
  return ['setting', 'analysis', 'user', 'all-email', 'role', 'reg-key', 'sys-setting'].includes(route.name)
})

const handleResize = () => {
  isMobile.value = window.innerWidth < 1025
  uiStore.asideShow = window.innerWidth > 1024;
}

onMounted(() => {
  uiStore.writerRef = writerRef

  window.addEventListener('resize', handleResize)
  handleResize()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style lang="scss" scoped>
.custom-header {
  height: 64px;
  padding: 0;
  border-bottom: 1px solid var(--border-subtle, var(--el-border-color));
  background: var(--bg-surface, var(--el-bg-color));
}

.custom-footer {
  padding: 0;
  height: 22px;
  background: var(--bg-surface, var(--el-bg-color));
  border-top: 1px solid var(--border-subtle, var(--el-border-color));
  display: flex;
  align-items: center;
}

.el-aside-hide {
  transition: all 0.2s ease;
  z-index: 100;
  @media (max-width: 1025px) {
    position: fixed;
    left: 0;
    height: 100%;
    transform: translateX(-100%);
  }
}

.aside-show {
  transition: all 0.2s ease;
  z-index: 101;
  @media (max-width: 1025px) {
    position: fixed;
    top: 0;
    left: 0;
    height: calc(100% - 64px - 22px);
    background: var(--bg-surface, var(--el-bg-color));
    transform: translateX(0);
    box-shadow: 2px 0 8px rgba(0,0,0,0.1);
  }
}

.aside {
  width: auto;
  transition: width 0.2s ease;
  background: var(--bg-surface, var(--el-bg-color));
  border-right: 1px solid var(--border-subtle, var(--el-border-color));
}

.layout {
  height: 100%;
  position: fixed;
  width: 100%;
  top: 0;
  left: 0;
  overflow: hidden;
  background: var(--bg-base, #f4f7fc);
}

.body-container {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.main-container {
  height: 100%;
  background: var(--bg-base, #f4f7fc);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.el-main {
  padding: 0;
  background: transparent;
}

.overlay-show {
  position: fixed;
  top: 64px;
  left: 0;
  width: 100vw;
  height: calc(100vh - 64px);
  background: rgba(0, 0, 0, 0.4);
  z-index: 99;
  transition: all 0.3s;
}

.overlay-hide {
  display: flex;
  pointer-events: none;
  opacity: 0;
}
</style>
