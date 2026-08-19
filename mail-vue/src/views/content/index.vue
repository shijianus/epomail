<template>
  <div class="box">
    <div class="header-actions">
      <el-tooltip :content="$t('back') || 'Back'" placement="bottom">
        <Icon class="icon" icon="material-symbols-light:arrow-back-ios-new" width="20" height="20" @click="handleBack"/>
      </el-tooltip>
      <el-tooltip :content="$t('delete') || 'Delete'" placement="bottom" v-if="hasPerm('email:delete')">
        <Icon class="icon" icon="uiw:delete" width="16" height="16" @click="handleDelete"/>
      </el-tooltip>
      <el-tooltip :content="$t('star') || 'Star'" placement="bottom" v-if="emailStore.contentData.showStar">
        <span class="star">
          <Icon class="icon" @click="changeStar" v-if="email.isStar" icon="fluent-color:star-16" width="20" height="20"/>
          <Icon class="icon" @click="changeStar" v-else icon="solar:star-line-duotone" width="18" height="18"/>
        </span>
      </el-tooltip>
      <el-tooltip :content="$t('reply') || 'Reply'" placement="bottom" v-if="emailStore.contentData.showReply && hasPerm('email:send')">
        <Icon class="icon" @click="openReply" icon="la:reply" width="21" height="21" />
      </el-tooltip>
      <el-tooltip :content="$t('forward') || 'Forward'" placement="bottom" v-if="emailStore.contentData.showReply && hasPerm('email:send')">
        <Icon class="icon" @click="openForward" icon="iconoir:arrow-up-right" width="20" height="20" />
      </el-tooltip>
    </div>
    <div></div>
    <el-scrollbar class="scrollbar">
      <div class="container">
        <div class="email-title">
          {{ email.subject }}
        </div>
        <div class="content">
          <div class="email-info">
            <div style="display: flex; gap: 16px;">
              <el-avatar :size="44" class="sender-avatar">{{ email.name ? email.name.charAt(0).toUpperCase() : 'U' }}</el-avatar>
              <div class="info-body">
                <div class="info-top">
                  <span class="send-name-title">{{ email.name }}</span>
                  <span class="date">{{ formatDetailDate(email.createTime) }}</span>
                </div>
                <div class="info-middle">
                  <span>&lt;{{ email.sendEmail }}&gt;</span>
                </div>
                <div class="info-bottom">
                  <span class="source">{{$t('recipient')}}:</span><span class="receive-email">{{  formateReceive(email.recipient) }}</span>
                </div>
              </div>
            </div>
            <el-alert v-if="email.status === 3" :closable="false" :title="toMessage(email.message)" class="email-msg" type="error" show-icon />
            <el-alert v-if="email.status === 4" :closable="false" :title="$t('complained')" class="email-msg" type="warning" show-icon />
            <el-alert v-if="email.status === 5" :closable="false" :title="$t('delayed')" class="email-msg" type="warning" show-icon />
            
            <div class="spam-alert-banner" v-if="email.isSpam === 1 || (email.labels && email.labels.includes('推销'))">
              <div class="spam-alert-content">
                <Icon icon="mdi:alert-outline" width="18" height="18" style="flex-shrink: 0;" />
                <span>为什么此邮件在垃圾/推销邮件中？它与过去被识别为垃圾/推销邮件的信息特征相似。</span>
              </div>
              <el-button size="small" type="warning" plain :loading="isReporting" @click="handleReportNotSpam">这不是垃圾邮件</el-button>
            </div>
            
          </div>
          <el-scrollbar class="htm-scrollbar" :class="email.attList.length === 0 ? 'bottom-distance' : ''">
            <ShadowHtml class="shadow-html" :html="formatImage(email.content)" v-if="email.content" />
            <pre v-else class="email-text" >{{email.text}}</pre>
          </el-scrollbar>
          <div class="att" v-if="email.attList.length > 0">
            <div class="att-title">
              <span>{{$t('attachments')}}</span>
              <span>{{$t('attCount',{total: email.attList.length})}}</span>
            </div>
            <div class="att-box">

              <div class="att-item" v-for="att in email.attList" :key="att.attId">
                <div class="att-icon" @click="showImage(att.key)">
                  <Icon v-bind="getIconByName(att.filename)" />
                </div>
                <div class="att-name" @click="showImage(att.key)">
                  {{ att.filename }}
                </div>
                <div class="att-size">{{ formatBytes(att.size) }}</div>
                <div class="opt-icon att-icon">
                  <Icon v-if="isImage(att.filename)" icon="hugeicons:view" width="22" height="22" @click="showImage(att.key)"/>
                  <a :href="cvtR2Url(att.key)" download>
                    <Icon icon="system-uicons:push-down" width="22" height="22"/>
                  </a>
                </div>
              </div>
            </div>
          </div>
          
          <div class="inline-reply" v-if="emailStore.contentData.showReply && hasPerm('email:send')">
             <el-button round class="reply-btn" @click="openReply">
                <Icon icon="la:reply" width="18" height="18" /> {{ $t('reply') || 'Reply' }}
             </el-button>
             <el-button round class="reply-btn" @click="openForward">
                <Icon icon="iconoir:arrow-up-right" width="18" height="18" /> {{ $t('forward') || 'Forward' }}
             </el-button>
          </div>
        </div>
      </div>
    </el-scrollbar>
    <el-image-viewer
        v-if="showPreview"
        :url-list="srcList"
        show-progress
        @close="showPreview = false"
    />
  </div>
</template>
<script setup>
import ShadowHtml from '@/components/shadow-html/index.vue'
import {reactive, ref, watch, onMounted, onUnmounted} from "vue";
import {useRouter} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {emailDelete, emailRead, emailReportNotSpam} from "@/request/email.js";
import {Icon} from "@iconify/vue";
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {formatDetailDate} from "@/utils/day.js";
import {starAdd, starCancel} from "@/request/star.js";
import {getExtName, formatBytes} from "@/utils/file-utils.js";
import {cvtR2Url,toOssDomain} from "@/utils/convert.js";
import {getIconByName} from "@/utils/icon-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {allEmailDelete} from "@/request/all-email.js";
import {useUiStore} from "@/store/ui.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import {hasPerm} from "@/perm/perm.js";

const uiStore = useUiStore();
const settingStore = useSettingStore();
const accountStore = useAccountStore();
const emailStore = useEmailStore();
const router = useRouter()
const email = emailStore.contentData.email
const showPreview = ref(false)
const srcList = reactive([])

const { t } = useI18n()
watch(() => accountStore.currentAccountId, () => {
  handleBack()
})

onMounted(() => {
  if (emailStore.contentData.showUnread && email.unread === EmailUnreadEnum.UNREAD) {
    email.unread = EmailUnreadEnum.READ;
    emailRead([email.emailId]).then(() => {
      emailStore.refreshSidebarStats();
    });
  }
})

onUnmounted(() => {
  emailStore.contentData.showUnread = false;
})

function openReply() {
  uiStore.writerRef.openReply(email)
}

function openForward() {
  uiStore.writerRef.openForward(email)
}

function toMessage(message) {
  return  message ? JSON.parse(message).message : '';
}

function formatImage(content) {
  content = content || '';
  const domain = settingStore.settings.r2Domain;
  return  content.replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

function showImage(key) {
  if (!isImage(key)) return;
  const url = cvtR2Url(key)
  srcList.length = 0
  srcList.push(url)
  showPreview.value = true
}

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif','jfif'].includes(getExtName(filename))
}

function formateReceive(recipient) {
  recipient = JSON.parse(recipient)
  return recipient.map(item => item.address).join(', ')
}

function changeStar() {
  if (email.isStar) {
    email.isStar = 0;
    starCancel(email.emailId).then(() => {
      email.isStar = 0;
      emailStore.cancelStarEmailId = email.emailId
      setTimeout(() => emailStore.cancelStarEmailId = 0)
      emailStore.starScroll?.deleteEmail([email.emailId])
    }).catch((e) => {
      console.error(e)
      email.isStar = 1;
    })
  } else {
    email.isStar = 1;
    starAdd(email.emailId).then(() => {
      email.isStar = 1;
      emailStore.addStarEmailId = email.emailId
      setTimeout(() => emailStore.addStarEmailId = 0)
      emailStore.starScroll?.addItem(email)
    }).catch((e) => {
      console.error(e)
      email.isStar = 0;
    })
  }
}

const handleBack = () => {
  emailStore.contentData.email = null
}

const handleDelete = () => {
  ElMessageBox.confirm(t('delEmailConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    if (emailStore.contentData.delType === 'logic') {
      emailDelete(email.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.emailId]
        emailStore.refreshSidebarStats();
      })
    } else  {

      allEmailDelete(email.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.emailId]
        emailStore.refreshSidebarStats();
      })
    }

    emailStore.contentData.email = null
  })
}

const isReporting = ref(false)

const handleReportNotSpam = () => {
  if (isReporting.value) return;
  isReporting.value = true;
  emailReportNotSpam(email.emailId).then(() => {
    ElMessage({
      message: '已移至收件箱并加入信任名单',
      type: 'success',
      plain: true,
    })
    email.isSpam = 0;
    if (email.labels) {
      try {
        let labs = JSON.parse(email.labels);
        if (Array.isArray(labs)) {
          labs = labs.filter(l => l !== '推销');
          email.labels = JSON.stringify(labs);
        }
      } catch (e) {}
    }
    emailStore.deleteIds = [email.emailId]
    emailStore.contentData.email = null
    emailStore.refreshSidebarStats();
  }).catch((err) => {
    console.error(err);
    ElMessage({
      message: '操作失败，请重试',
      type: 'error',
      plain: true,
    })
  }).finally(() => {
    isReporting.value = false;
  })
}
</script>
<style scoped lang="scss">
.box {
  height: 100%;
  overflow: hidden;
}

.header-actions {
  padding: 9px 15px 8px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: var(--header-actions-border);
  font-size: 18px;
  .star {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 21px;
  }
  .icon {
    cursor: pointer;
  }
}


.scrollbar {
  height: calc(100% - 38px);
  width: 100%;
}

.container {
  font-size: 14px;
  padding-left: 20px;
  padding-right: 20px;
  padding-top: 10px;
  @media (max-width: 1023px) {
    padding-left: 15px;
    padding-right: 15px;
  }

  .email-title {
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 10px;
  }

  .htm-scrollbar {
  }

  .content {
    display: flex;
    flex-direction: column;

    .att {
      margin-top: 30px;
      margin-bottom: 30px;
      border: 1px solid var(--light-border-color);
      padding: 14px;
      border-radius: 6px;
      width: fit-content;
      .att-box {
        min-width: min(410px,calc(100vw - 60px));
        max-width: 600px;
        display: grid;
        gap: 12px;
        grid-template-rows: 1fr;
      }

      .att-title {
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
        span:first-child {
          font-weight: bold;
        }
      }

      .att-item {
        cursor: pointer;
        div {
          align-self: center;
        }
        background: var(--light-ill);
        padding: 5px 7px;
        border-radius: 4px;
        align-self: start;
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        .att-icon {
          display: grid;
        }

        .att-size {
          color: var(--secondary-text-color);
        }

        .att-name {
          margin-left: 8px;
          margin-right: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          word-break: break-all;
        }

        .att-image {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }

        .opt-icon {
          padding-left: 10px;
          color: var(--secondary-text-color);
          align-items: center;
          display: flex;
          gap: 8px;
          cursor: pointer;
          a {
            color: var(--secondary-text-color);
            align-items: center;
            display: flex;
          }
        }
      }
    }

      .email-info {
        display: flex;
        flex-direction: column;
        border-bottom: 1px solid var(--light-border-color);
        margin-bottom: 20px;
        padding-bottom: 16px;
        @media (max-width: 1024px) {
          margin-bottom: 15px;
        }

        .sender-avatar {
          background: var(--el-color-primary);
          color: white;
          font-weight: bold;
          font-size: 18px;
        }

        .info-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .info-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          
          .send-name-title {
            font-size: 16px;
            font-weight: bold;
            color: var(--el-text-color-primary);
          }
          .date {
            color: var(--regular-text-color);
            font-size: 13px;
          }
        }
        
        .info-middle {
          color: var(--regular-text-color);
          font-size: 13px;
        }

        .info-bottom {
          display: flex;
          gap: 8px;
          font-size: 13px;
          color: var(--secondary-text-color);
        }

        .email-msg {
          max-width: 400px;
          width: fit-content;
          margin-top: 15px;
        }

        .spam-alert-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--el-color-warning-light-9);
          border: 1px solid var(--el-color-warning-light-5);
          border-radius: 8px;
          padding: 12px 16px;
          margin-top: 16px;
          gap: 16px;

          .spam-alert-content {
            display: flex;
            align-items: center;
            gap: 10px;
            color: var(--el-color-warning-dark-2);
            font-size: 13px;
            line-height: 1.4;
          }

          @media (max-width: 600px) {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      }

      .inline-reply {
        display: flex;
        gap: 12px;
        margin-top: 30px;
        margin-bottom: 40px;
        
        .reply-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 20px;
          font-size: 14px;
        }
      }
      
      .source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }
    }
  }


.email-text {
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.bottom-distance {
  margin-bottom: 30px;
}


</style>
