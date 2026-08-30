<template>
  <div class="box">
    
    <!-- Section 1: Basic Information -->
    <div class="container">
      <div class="title">{{$t('basicInfo')}}</div>

      <div class="item media-item">
        <div>{{$t('avatar')}}</div>
        <div class="image-preview-group">
          <el-image
              class="avatar-preview"
              :src="userStore.user.avatarUrl"
              :preview-src-list="userStore.user.avatarUrl ? [userStore.user.avatarUrl] : []"
              show-progress
              fit="cover"
          >
            <template #error>
              <div class="error-image avatar-placeholder">
                <Icon icon="lucide:user" width="32" height="32"/>
              </div>
            </template>
          </el-image>
          <div class="background-btn">
            <el-upload
              :show-file-list="false"
              :http-request="uploadAvatar"
              accept="image/*"
            >
              <el-button class="opt-button" size="small" type="primary">
                <Icon icon="lucide:upload" width="16" height="16" />
              </el-button>
            </el-upload>
            <el-button v-if="userStore.user.avatarUrl" class="opt-button" size="small" type="primary" @click="delAvatar">
              <Icon icon="material-symbols:delete-outline-rounded" width="16" height="16"/>
            </el-button>
          </div>
        </div>
      </div>

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
        <div class="bio-preview-group">
          <div class="bio-preview-box">
            <div class="bio-display" v-html="parseInlineMarkdown(userStore.user.bio) || $t('unknown')"></div>
          </div>
          <el-button class="opt-button" size="small" type="primary" @click="showSetBio">
            <Icon icon="lsicon:edit-outline" width="16" height="16" />
          </el-button>
        </div>
      </div>
    </div>

    <!-- Section 2: Visual & Media -->
    <div class="container">
      <div class="title">{{$t('visualMedia')}}</div>
      <div class="item media-item">
        <div>{{$t('background')}}</div>
        <div class="image-preview-group">
          <el-image
              class="background-preview"
              :src="userStore.user.backgroundUrl"
              :preview-src-list="userStore.user.backgroundUrl ? [userStore.user.backgroundUrl] : []"
              show-progress
              fit="cover"
          >
            <template #error>
              <div class="error-image">
                <Icon icon="lucide:image" width="32" height="32"/>
              </div>
            </template>
          </el-image>
          <div class="background-btn">
            <el-upload
              :show-file-list="false"
              :http-request="uploadBackground"
              accept="image/*"
            >
              <el-button class="opt-button" size="small" type="primary">
                <Icon icon="lucide:upload" width="16" height="16" />
              </el-button>
            </el-upload>
            <el-button v-if="userStore.user.backgroundUrl" class="opt-button" size="small" type="primary" @click="delBackground">
              <Icon icon="material-symbols:delete-outline-rounded" width="16" height="16"/>
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 3: Data Privacy -->
    <div class="container">
      <div class="title">{{$t('dataPrivacy')}}</div>
      <div class="privacy-group">
        <div class="privacy-item">
          <span>{{$t('showStats')}}</span>
          <el-switch :model-value="userStore.user.showStats ?? true" @change="val => savePrivacy('showStats', val)" />
        </div>
        <div class="privacy-item">
          <span>{{$t('showTrend')}}</span>
          <el-switch :model-value="userStore.user.showTrend ?? true" @change="val => savePrivacy('showTrend', val)" />
        </div>
        <div class="privacy-item">
          <span>{{$t('showSources')}}</span>
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
          :placeholder="$t('bioPlaceholder') || 'Type your bio here... (Markdown supported for **bold**, *italic*)'"
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
import { Icon } from "@iconify/vue";

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
    ElMessage.error(t('imageSizeLimitMsg') || '图片不能超过25MB')
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
    ElMessage.error(t('imageSizeLimitMsg') || '图片不能超过25MB')
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

function delAvatar() {
  updateProfile({ avatarUrl: '' }).then(() => {
    userStore.user.avatarUrl = ''
    ElMessage({ message: t('saveSuccessMsg') || 'Save success', type: 'success', plain: true })
  })
}

function delBackground() {
  updateProfile({ backgroundUrl: '' }).then(() => {
    userStore.user.backgroundUrl = ''
    ElMessage({ message: t('saveSuccessMsg') || 'Save success', type: 'success', plain: true })
  })
}

function savePrivacy(field, value) {
  const originalValue = userStore.user[field] ?? true
  userStore.user[field] = value
  updateProfile({ [field]: value }).then(() => {
    ElMessage({ message: t('saveSuccessMsg') || 'Save success', type: 'success', plain: true })
  }).catch(() => {
    userStore.user[field] = originalValue
    ElMessage({ message: t('saveFailMsg') || 'Save failed', type: 'error', plain: true })
  })
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

  .privacy-group {
    display: flex;
    flex-wrap: wrap;
    gap: 32px;
    align-items: center;

    .privacy-item {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: bold;
    }
  }

  .bio-preview-group {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: min(400px, calc(100vw - 222px));
    
    .bio-preview-box {
      flex: 1;
      padding: 12px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle, var(--light-border, #e4e4e7));
      border-radius: 8px;
      min-height: 80px;
      max-height: 157px;
      overflow-y: auto;
      
      .bio-display {
        overflow-wrap: break-word;
        word-wrap: break-word;
        word-break: break-word;
        white-space: pre-wrap;
        line-height: 1.6;
      }
    }
  }

  .item.media-item {
    align-items: flex-start;
  }
  
  .image-preview-group {
    display: flex;
    align-items: flex-end;
    gap: 15px;

    .avatar-preview {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      border: 1px solid var(--border-subtle, var(--light-border, #e4e4e7));
      overflow: hidden;
    }

    .background-preview {
      width: 240px;
      height: 135px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle, var(--light-border, #e4e4e7));
      overflow: hidden;
    }

    .error-image {
      background: var(--bg-hover, var(--light-ill, #f4f4f5));
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted, #a1a1aa);
    }

    .background-btn {
      display: flex;
      flex-direction: column;
      gap: 8px;
      
      .opt-button {
        margin: 0;
        padding: 8px;
      }
    }
  }

  .update-bio {
    display: flex;
    flex-direction: column;
  }
}
</style>
