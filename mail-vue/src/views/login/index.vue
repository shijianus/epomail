<template>
  <div class="fixed inset-0 flex items-center justify-center bg-[#05060F] text-white">
    <div class="flex flex-col items-center">
      <div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
      <p class="text-sm text-gray-400">Loading Secure Login...</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';

onMounted(() => {
  // Always force a hard redirect so Cloudflare serves the React app at /login/
  window.location.href = '/login/';
});
</script>

<style scoped>
</style>
