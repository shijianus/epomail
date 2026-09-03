<template>
  <div v-for="item in rows" :key="item" style="background: var(--el-bg-color)">
    <div :class="'email-row ' + type ">
      <el-checkbox disabled :class=" props.type === 'all-email' ? 'all-email-checkbox' : 'checkbox'"></el-checkbox>
      <div class="pc-star" v-if="showStar">
        <Icon style="color: var(--el-border-color)" icon="solar:star-line-duotone" width="18" height="18"/>
      </div>
      <div v-if="!showStar" class="no-star-spacer"></div>

      <div class="email-row-content">
        <div class="email-sender-area">
          <div class="sender-name-wrap">
            <el-skeleton animated>
              <template #template>
                <el-skeleton-item variant="text" style="width: 120px; height: 16px;"/>
              </template>
            </el-skeleton>
          </div>
        </div>
        <div class="email-main-area">
          <el-skeleton animated>
            <template #template>
              <el-skeleton-item variant="text" style="width: 75%; height: 16px;"/>
            </template>
          </el-skeleton>
        </div>
        <div class="email-right">
          <el-skeleton animated>
            <template #template>
              <el-skeleton-item variant="text" style="width: 55px; height: 14px;"/>
            </template>
          </el-skeleton>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
const props = defineProps({
  rows: {
    type: Number,
    default: 1
  },
  showStar: {
    type: Boolean,
    default: true
  },
  accountShow: {
    type: Boolean,
    default: false
  },
  showStatus: {
    type: Boolean,
    default: false
  },
  showUserInfo: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    default: ''
  }
})
import {Icon} from "@iconify/vue";
</script>

<style scoped lang="scss">

.phone-star {
  display: none;
}

.pc-star {
  display: flex;
  width: 40px;
}

:deep(.el-skeleton__item) {
  position: relative;
  top: 2px;
}

@media (max-width: 1366px) {
  .pc-star {
    display: none;
  }
  .phone-star {
    display: block;
    align-self: end;
    padding-right: 16px;
    padding-top: 8px;
  }
  .star-pd {
    padding-top: 6px !important;
  }
}

</style>
