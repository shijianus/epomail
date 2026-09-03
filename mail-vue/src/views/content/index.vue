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
        <div class="email-title-row">
          <div class="email-title">{{ email.subject }}</div>
          <div class="thread-header-bar" v-if="threadMessages.length > 1">
            <el-tag size="small" type="primary" effect="plain" class="thread-info-tag">
              <Icon icon="fluent:chat-multiple-16-regular" width="14" style="margin-right: 4px;" />
              会话聚合 (共 {{ threadMessages.length }} 封邮件)
            </el-tag>
            <el-button link size="small" type="primary" @click="toggleExpandAll">
              {{ isAllExpanded ? '全部折叠' : '全部展开' }}
            </el-button>
          </div>
        </div>

        <!-- Thread Messages List -->
        <div class="thread-messages-flow">
          <div 
            v-for="(msg, index) in threadMessages" 
            :key="msg.emailId"
            class="thread-msg-item"
            :class="{ 'is-collapsed': !isMsgExpanded(msg.emailId, index), 'is-last': index === threadMessages.length - 1 }"
          >
            <!-- Collapsed Card Header -->
            <div 
              class="thread-collapsed-header" 
              v-if="!isMsgExpanded(msg.emailId, index)"
              @click="toggleMsg(msg.emailId, index)"
            >
              <div class="ch-left">
                <el-avatar :size="28" class="sender-avatar mini" :class="{ 'official-avatar': msg.sendEmail === 'admin@epocanvas.com' || msg.isOfficial }">
                  <Icon icon="ri:verified-badge-fill" width="16" height="16" v-if="msg.sendEmail === 'admin@epocanvas.com' || msg.isOfficial" />
                  <template v-else>{{ msg.name ? msg.name.charAt(0).toUpperCase() : 'U' }}</template>
                </el-avatar>
                <span class="ch-name">{{ msg.name }}</span>
                <span class="ch-snippet">{{ msg.formatText || msg.text || '（无纯文本预览）' }}</span>
              </div>
              <div class="ch-right">
                <span class="ch-date">{{ formatDetailDate(msg.createTime) }}</span>
                <Icon icon="lucide:chevron-down" width="16" height="16" class="ch-arrow" />
              </div>
            </div>

            <!-- Expanded Full Message Content -->
            <div class="content thread-expanded-body" v-else>
              <div class="email-info" @click="threadMessages.length > 1 ? toggleMsg(msg.emailId, index) : null" :style="threadMessages.length > 1 ? 'cursor: pointer;' : ''">
                <div style="display: flex; gap: 16px;">
                  <el-avatar :size="44" class="sender-avatar" :class="{ 'official-avatar': msg.sendEmail === 'admin@epocanvas.com' || msg.isOfficial }">
                    <Icon icon="ri:verified-badge-fill" width="24" height="24" v-if="msg.sendEmail === 'admin@epocanvas.com' || msg.isOfficial" />
                    <template v-else>{{ msg.name ? msg.name.charAt(0).toUpperCase() : 'U' }}</template>
                  </el-avatar>
                  <div class="info-body">
                    <div class="info-top">
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span class="send-name-title">{{ msg.name }}</span>
                        <span v-if="msg.sendEmail === 'admin@epocanvas.com' || msg.isOfficial" class="official-verified-badge" :title="$t('officialVerified') || '官方认证'">
                          <Icon icon="ri:verified-badge-fill" width="18" height="18" style="color: #0284c7; vertical-align: middle;" />
                        </span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="date">{{ formatDetailDate(msg.createTime) }}</span>
                        <Icon icon="lucide:chevron-up" width="16" height="16" class="ch-arrow" v-if="threadMessages.length > 1" />
                      </div>
                    </div>
                    <div class="info-middle">
                      <span>&lt;{{ msg.sendEmail }}&gt;</span>
                    </div>
                    <div class="info-bottom">
                      <span class="source">{{$t('recipient')}}:</span><span class="receive-email">{{ formateReceive(msg.recipient) }}</span>
                    </div>
                  </div>
                </div>

                <!-- Official System Mail Banner -->
                <div class="official-system-banner" v-if="msg.sendEmail === 'admin@epocanvas.com' || msg.isOfficial" @click.stop>
                  <div class="banner-left">
                    <Icon icon="ri:verified-badge-fill" width="20" height="20" style="color: #0284c7; flex-shrink: 0;" />
                    <div class="banner-text">
                      <div class="banner-heading">
                        <span>{{ $t('officialBannerTitle') || 'Epocanvas Mail 官方系统邮件' }}</span>
                        <el-tag size="small" type="primary" effect="dark" class="official-mini-tag">{{ $t('officialTag') || '官方' }}</el-tag>
                      </div>
                      <div class="banner-subtitle">{{ $t('officialBannerDesc') || '此邮件为官方系统引导，已自动标记为重要与代办。' }}</div>
                    </div>
                  </div>
                  <div class="banner-right" v-if="msg.expireDays">
                    <el-tag size="small" type="info" effect="plain" class="expire-pill">
                      <Icon icon="ic:outline-access-time" width="13" height="13" style="margin-right: 3px;" />
                      {{ $t('officialExpireNotice', { days: msg.expireDays }) }}
                    </el-tag>
                  </div>
                </div>

                <el-alert v-if="msg.status === 3" :closable="false" :title="toMessage(msg.message)" class="email-msg" type="error" show-icon @click.stop />
                <el-alert v-if="msg.status === 4" :closable="false" :title="$t('complained')" class="email-msg" type="warning" show-icon @click.stop />
                <el-alert v-if="msg.status === 5" :closable="false" :title="$t('delayed')" class="email-msg" type="warning" show-icon @click.stop />
                
                <div class="spam-alert-banner" v-if="msg.isSpam === 1 || (msg.labels && msg.labels.includes('推销'))" @click.stop>
                  <div class="spam-alert-content">
                    <Icon icon="mdi:alert-outline" width="18" height="18" style="flex-shrink: 0;" />
                    <span>为什么此邮件在垃圾/推销邮件中？它与过去被识别为垃圾/推销邮件的信息特征相似。</span>
                  </div>
                  <el-button size="small" type="warning" plain :loading="isReporting" @click="handleReportNotSpam(msg.emailId)">这不是垃圾邮件</el-button>
                </div>
                
              </div>
              <el-scrollbar class="htm-scrollbar" :class="(!msg.attList || msg.attList.length === 0) ? 'bottom-distance' : ''">
                <ShadowHtml class="shadow-html" :html="formatImage(msg.content)" v-if="msg.content" />
                <pre v-else class="email-text" >{{msg.text}}</pre>
              </el-scrollbar>
              <div class="att" v-if="msg.attList && msg.attList.length > 0">
                <div class="att-title">
                  <span>{{$t('attachments')}}</span>
                  <span>{{$t('attCount',{total: msg.attList.length})}}</span>
                </div>
                <div class="att-box">
                  <div class="att-item" v-for="att in msg.attList" :key="att.attId">
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
                 <el-button round class="reply-btn" @click="openReplyMsg(msg)">
                    <Icon icon="la:reply" width="18" height="18" /> {{ $t('reply') || 'Reply' }}
                 </el-button>
                 <el-button round class="reply-btn" @click="openForwardMsg(msg)">
                    <Icon icon="iconoir:arrow-up-right" width="18" height="18" /> {{ $t('forward') || 'Forward' }}
                 </el-button>
              </div>
            </div>
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
import {reactive, ref, computed, watch, onMounted, onUnmounted} from "vue";
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

// Conversation Thread Messages
const threadMessages = computed(() => {
  if (email && email.threadEmails && email.threadEmails.length > 1) {
    return [...email.threadEmails].sort((a, b) => new Date(a.createTime || 0) - new Date(b.createTime || 0) || a.emailId - b.emailId)
  }
  return email ? [email] : []
})

const expandedMap = reactive({})

function isMsgExpanded(emailId, index) {
  if (expandedMap[emailId] !== undefined) {
    return expandedMap[emailId]
  }
  // Default: latest message expanded, older messages collapsed
  return index === threadMessages.value.length - 1
}

function toggleMsg(emailId, index) {
  expandedMap[emailId] = !isMsgExpanded(emailId, index)
}

const isAllExpanded = computed(() => {
  return threadMessages.value.every((m, idx) => isMsgExpanded(m.emailId, idx))
})

function toggleExpandAll() {
  const target = !isAllExpanded.value
  threadMessages.value.forEach(m => {
    expandedMap[m.emailId] = target
  })
}

function openReplyMsg(msg) {
  uiStore.writerRef.openReply(msg || email)
}

function openForwardMsg(msg) {
  uiStore.writerRef.openForward(msg || email)
}

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
  try {
    recipient = JSON.parse(recipient)
    return recipient.map(item => item.address).join(', ')
  } catch (e) {
    return recipient || ''
  }
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

const handleReportNotSpam = (emailId) => {
  const targetId = emailId || email.emailId
  if (isReporting.value) return;
  isReporting.value = true;
  emailReportNotSpam(targetId).then(() => {
    ElMessage({
      message: '已移至收件箱并加入信任名单',
      type: 'success',
      plain: true,
    })
    if (email.emailId === targetId) {
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
    }
    emailStore.deleteIds = [targetId]
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

  .email-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 12px;

    .email-title {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 0;
      color: var(--text-primary);
    }

    .thread-header-bar {
      display: flex;
      align-items: center;
      gap: 12px;

      .thread-info-tag {
        font-weight: 600;
        border-radius: 6px;
      }
    }
  }

  .thread-messages-flow {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 10px;

    .thread-msg-item {
      border: 1px solid var(--border-subtle, #e2e8f0);
      border-radius: 8px;
      background: var(--bg-surface, #ffffff);
      overflow: hidden;
      transition: all 0.2s ease;

      &.is-collapsed {
        &:hover {
          background: var(--bg-hover, #f8fafc);
        }
      }

      &.is-last {
        border-color: var(--border-subtle, #e2e8f0);
      }
    }

    .thread-collapsed-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      cursor: pointer;
      gap: 16px;

      .ch-left {
        display: flex;
        align-items: center;
        gap: 12px;
        overflow: hidden;
        flex: 1;

        .mini {
          font-size: 13px;
          flex-shrink: 0;
        }

        .ch-name {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          flex-shrink: 0;
        }

        .ch-snippet {
          font-size: 13px;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }

      .ch-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;

        .ch-date {
          font-size: 12px;
          color: var(--text-muted);
        }

        .ch-arrow {
          color: var(--text-muted);
        }
      }
    }

    .thread-expanded-body {
      padding: 16px;
      
      .email-info {
        border-bottom: 1px solid var(--border-subtle, #e2e8f0);
      }
    }
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

        .official-avatar {
          background: linear-gradient(135deg, #0284c7, #2563eb) !important;
          color: #ffffff !important;
        }

        .official-system-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: linear-gradient(135deg, rgba(2, 132, 199, 0.08), rgba(37, 99, 235, 0.08));
          border: 1px solid rgba(2, 132, 199, 0.25);
          border-radius: 10px;
          padding: 12px 16px;
          margin-top: 14px;
          gap: 16px;

          .banner-left {
            display: flex;
            align-items: center;
            gap: 12px;

            .banner-text {
              .banner-heading {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                font-weight: 700;
                color: var(--el-text-color-primary);

                .official-mini-tag {
                  background: linear-gradient(135deg, #0284c7, #2563eb);
                  border: none;
                  font-weight: 600;
                  border-radius: 4px;
                }
              }

              .banner-subtitle {
                font-size: 12px;
                color: var(--el-text-color-secondary);
                margin-top: 2px;
              }
            }
          }

          .banner-right {
            .expire-pill {
              font-size: 12px;
              border-radius: 6px;
            }
          }

          @media (max-width: 600px) {
            flex-direction: column;
            align-items: flex-start;
          }
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
