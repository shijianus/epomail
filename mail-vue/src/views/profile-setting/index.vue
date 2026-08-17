<template>
  <div class="box">
    
    <!-- Section 1: Basic Information -->
    <div class="container">
      <div class="title">{{$t('basicInfo')}}</div>
      <div class="item">
        <div>{{$t('nickname')}}</div>
        <div>
          <span v-if="setNicknameShow" class="edit-name-input">
            <el-input v-model="accountNickname"  ></el-input>
            <span class="edit-name" @click="setNickname">
             {{$t('save')}}
            </span>
          </span>
          <span v-else class="user-name">
            <span >{{ userStore.user.nickname || $t('unknown') }}</span>
            <span class="edit-name" @click="showSetNickname">
             {{$t('change')}}
            </span>
          </span>
        </div>
      </div>

      <div class="item bio-item">
        <div>{{$t('bio')}}</div>
        <div>
          <span class="user-name">
            <span class="bio-display" v-html="parseInlineMarkdown(userStore.user.bio) || $t('unknown')"></span>
            <span class="edit-name" style="align-self: flex-start;" @click="showSetBio">
             {{$t('change')}}
            </span>
          </span>
        </div>
      </div>
    </div>

    <!-- Section 2: Visual & Media -->
    <div class="container">
      <div class="title">{{$t('visualMedia')}}</div>
      <div class="item">
        <div>{{$t('avatar')}}</div>
        <div style="display: flex; align-items: center; gap: 15px;">
          <el-upload
            :show-file-list="false"
            :http-request="uploadAvatar"
            accept="image/*"
            style="display: inline-block;"
          >
            <el-button type="primary">{{$t('change')}}</el-button>
          </el-upload>
          <span v-if="userStore.user.avatarUrl" style="color: var(--text-muted); font-size: 13px;">已上传</span>
        </div>
      </div>

      <div class="item">
        <div>{{$t('background')}}</div>
        <div style="display: flex; align-items: center; gap: 15px;">
          <el-upload
            :show-file-list="false"
            :http-request="uploadBackground"
            accept="image/*"
            style="display: inline-block;"
          >
            <el-button type="primary">{{$t('change')}}</el-button>
          </el-upload>
          <span v-if="userStore.user.backgroundUrl" style="color: var(--text-muted); font-size: 13px;">已上传</span>
        </div>
      </div>
    </div>

    <!-- Section 3: Data Privacy -->
    <div class="container">
      <div class="title">{{$t('dataPrivacy')}}</div>
      <div class="item">
        <div>{{$t('showStats')}}</div>
        <div>
          <el-switch :model-value="userStore.user.showStats ?? true" @change="val => savePrivacy('showStats', val)" />
        </div>
      </div>

      <div class="item">
        <div>{{$t('showTrend')}}</div>
        <div>
          <el-switch :model-value="userStore.user.showTrend ?? true" @change="val => savePrivacy('showTrend', val)" />
        </div>
      </div>

      <div class="item">
        <div>{{$t('showSources')}}</div>
        <div>
          <el-switch :model-value="userStore.user.showSources ?? true" @change="val => savePrivacy('showSources', val)" />
        </div>
      </div>
    </div>

    <el-dialog v-model="bioDialogShow" :title="$t('bio')" width="400">
      <div class="update-bio">
        <el-input 
          type="textarea" 
          :rows="5"
          :maxlength="150" 
          show-word-limit
          v-model="accountBio" 
          placeholder="Type your bio here... (Markdown supported for **bold**, *italic*)"
        />
        <el-button type="primary" :loading="bioLoading" @click="saveBio" style="align-self: flex-end; margin-top: 15px;">{{$t('save')}}</el-button>
      </div>
    </el-dialog>

  </div>
</template>
<script setup>
import {ref, defineOptions} from 'vue'
import {updateProfile, uploadImage} from "@/request/my.js";
import {useUserStore} from "@/store/user.js";
import {useI18n} from "vue-i18n";
import { ElMessage } from 'element-plus'
import { parseInlineMarkdown } from "@/utils/md-parser.js";

const { t } = useI18n()
const userStore = useUserStore();

const setNicknameShow = ref(false)
const accountNickname = ref('')

const bioDialogShow = ref(false)
const accountBio = ref('')
const bioLoading = ref(false)

defineOptions({
  name: 'profile-setting'
})

function showSetNickname() {
  accountNickname.value = userStore.user.nickname || ''
  setNicknameShow.value = true
}

function setNickname() {
  setNicknameShow.value = false
  if (accountNickname.value === userStore.user.nickname) return
  updateProfile({ nickname: accountNickname.value }).then(() => {
    userStore.user.nickname = accountNickname.value
    ElMessage({ message: t('saveSuccessMsg') || 'Save success', type: 'success', plain: true })
  })
}

function showSetBio() {
  accountBio.value = userStore.user.bio || ''
  bioDialogShow.value = true
}

function saveBio() {
  if (accountBio.value === userStore.user.bio) {
    bioDialogShow.value = false
    return
  }
  bioLoading.value = true
  updateProfile({ bio: accountBio.value }).then(() => {
    userStore.user.bio = accountBio.value
    ElMessage({ message: t('saveSuccessMsg') || 'Save success', type: 'success', plain: true })
    bioDialogShow.value = false
    bioLoading.value = false
  }).catch(() => {
    bioLoading.value = false
  })
}

function uploadAvatar(options) {
  const file = options.file
  if (file.size > 25 * 1024 * 1024) {
    ElMessage.error('图片不能超过25MB')
    options.onError(new Error('size limit'))
    return
  }
  const formData = new FormData()
  formData.append('file', file)
  uploadImage(formData).then(res => {
    const url = res.url || res.data?.url || res
    updateProfile({ avatarUrl: url }).then(() => {
      userStore.user.avatarUrl = url
      ElMessage({ message: t('saveSuccessMsg') || 'Save success', type: 'success', plain: true })
      options.onSuccess(res, file)
    })
  }).catch(err => {
    options.onError(err)
  })
}

function uploadBackground(options) {
  const file = options.file
  if (file.size > 25 * 1024 * 1024) {
    ElMessage.error('图片不能超过25MB')
    options.onError(new Error('size limit'))
    return
  }
  const formData = new FormData()
  formData.append('file', file)
  uploadImage(formData).then(res => {
    const url = res.url || res.data?.url || res
    updateProfile({ backgroundUrl: url }).then(() => {
      userStore.user.backgroundUrl = url
      ElMessage({ message: t('saveSuccessMsg') || 'Save success', type: 'success', plain: true })
      options.onSuccess(res, file)
    })
  }).catch(err => {
    options.onError(err)
  })
}

function savePrivacy(field, value) {
  updateProfile({ [field]: value }).then(() => {
    userStore.user[field] = value
    ElMessage({ message: t('saveSuccessMsg') || 'Save success', type: 'success', plain: true })
  }).catch(() => {})
}
</script>
<style scoped lang="scss">
.box {
  padding: 40px 40px;

  @media (max-width: 767px) {
    padding: 30px 30px;
  }

  .title {
    font-size: 18px;
    font-weight: bold;
  }

  .container {
    font-size: 14px;
    display: grid;
    gap: 20px;
    margin-bottom: 40px;

    .item {
      display: grid;
      grid-template-columns: 85px 1fr;
      gap: 105px;
      position: relative;
      align-items: center;
      
      .user-name {
        display: grid;
        grid-template-columns: auto 1fr;
        span:first-child:not(.bio-display) {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      &.bio-item {
        align-items: flex-start;
      }

      .bio-display {
        overflow-wrap: break-word;
        word-wrap: break-word;
        word-break: break-all;
        max-width: 100%;
        line-height: 1.5;
      }

      .edit-name-input {
        position: absolute;
        bottom: -6px;
        .el-input {
          width: min(200px,calc(100vw - 222px));
        }
      }

      .edit-name {
        color: #4dabff;
        padding-left: 10px;
        cursor: pointer;
      }

      @media (max-width: 767px) {
        gap: 70px;
      }

      div:first-child {
        font-weight: bold;
      }

      div:last-child {
        overflow: hidden;
        /* Removed white-space: nowrap from here so bio-display can wrap */
      }
    }
  }

  .update-bio {
    display: flex;
    flex-direction: column;
  }
}
</style>
