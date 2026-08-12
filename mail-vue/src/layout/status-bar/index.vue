<template>
  <div class="status-bar">
    <div class="status-dot"></div>
    <div class="status-text">Connected <span class="status-time">Synced just now</span></div>
  </div>
</template>

<script setup>
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
</style>
