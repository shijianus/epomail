<template>
  <div class="email-container">
    <div class="header-actions">
      <el-checkbox
          v-model="checkAll"
          :indeterminate="isIndeterminate"
          :disabled="!emailList.length || loading"
          @change="handleCheckAllChange"
      >
      </el-checkbox>
      <div class="header-left" :style="'padding-left:' + actionLeft">

        <slot name="first"></slot>
        <Icon class="icon reload" icon="ion:reload" width="18" height="18" @click="refresh"/>
        <Icon v-perm="'email:delete'" class="icon delete" icon="uiw:delete" width="16" height="16"
              v-if="getSelectedMailsIds().length > 0"
              @click="handleDelete"/>
        <Icon v-perm="'email:delete'" class="icon delete" icon="fluent:mail-read-20-regular" width="21" height="21"
              v-if="getSelectedMailsIds().length > 0 && showUnread"
              @click="handleRead"/>
      </div>

      <div class="header-right">
        <span class="email-count" v-if="total">{{ $t('emailCount', {total: total}) }}</span>
        <Icon v-if="showAccountIcon" class="more-icon icon" width="16" height="16" icon="akar-icons:dot-grid-fill"
              @click="changeAccountShow"/>
      </div>
    </div>

    <div ref="scroll" class="scroll">
      <UseVirtualList ref="scrollbarRef"
                        @scroll="onScroll"
                        :list="list"
                        :options="{ itemHeight: itemHeight, overscan: 15 }"
                        class="virtual"
                        style="height: 100%"
                        v-if="!loading && emailList.length > 0"
                        :key="keyCount"
        >
          <template #default="{ data: item, index }" >
            <div :class="['email-row', props.type, 'density-' + (uiStore.density || 'default')]"
                 :data-checked="item.checked"
                 @click="jumpDetails(item)"
                 v-if="!item.expand"
                 :key="item.emailId"
                 @contextmenu="handleContextmenu($event, item)"
                 :style="item.rightChecked ? 'background: var(--email-hover-background)' : ''"
            >
              <div class="unread-bar" v-if="item.unread === EmailUnreadEnum.UNREAD && showUnread"></div>
              <el-checkbox :class=" props.type === 'all-email' ? 'all-email-checkbox' : 'checkbox'"
                           v-model="item.checked" @click.stop></el-checkbox>
              <div @click.stop="starChange(item)" class="pc-star" v-if="showStar" :title="item.isStar ? ($t('starred') || '已加星标') : ($t('star') || '加星标')">
                <Icon v-if="item.isStar" icon="fluent-color:star-16" width="18" height="18"/>
                <Icon v-else icon="solar:star-line-duotone" width="18" height="18"/>
              </div>
              <div v-if="!showStar" class="no-star-spacer"></div>

              <!-- Single Line Content Row -->
              <div class="email-row-content">
                <!-- 1. Sender Area (Preset width, strictly 1 line) -->
                <div class="email-sender-area" :class="{ 'is-unread': item.unread === EmailUnreadEnum.UNREAD && showUnread }">
                  <div class="email-status" v-if="showStatus">
                    <el-tooltip effect="dark" :content="item.statusIcon.content">
                      <Icon :icon="item.statusIcon.icon" :style="`color: ${item.statusIcon.color}`" width="18" height="18"/>
                    </el-tooltip>
                    <div class="del-status" v-if="item.isDel">
                      <el-tooltip effect="dark" :content="item.isDelContent">
                        <Icon class="icon" icon="mdi:email-remove" width="18" height="18"/>
                      </el-tooltip>
                    </div>
                  </div>
                  <div class="sender-name-wrap">
                    <span class="sender-name-text">
                      <slot name="name" :email="item">
                        <span v-html="highlightMatch(item.name || '')"></span>
                      </slot>
                    </span>
                    <!-- 会话聚合数量标记（紧随发件人后面：来源人名称  数字，如 "EpoCanvas 官方团队  4"） -->
                    <span 
                      v-if="item.threadCount && item.threadCount > 1" 
                      class="thread-count-badge"
                      :title="`共 ${item.threadCount} 封会话邮件`"
                    >
                      {{ item.threadCount }}
                    </span>
                    <span v-if="item.sendEmail === 'admin@epocanvas.com' || item.isOfficial" class="official-verified-badge" :title="$t('officialVerified') || '官方认证'">
                      <Icon icon="ri:verified-badge-fill" width="15" height="15" style="color: #0284c7; vertical-align: middle; margin-left: 3px;" />
                    </span>
                  </div>
                  <span class="phone-time">{{ item.formatCreateTime }}</span>
                </div>

                <!-- 2. Subject & Snippet Area (Flex 1, strictly 1 line, "Subject - Content") -->
                <div class="email-main-area">
                  <span v-if="item.code" class="code-tag" @click.stop="copyCode(item.code)">[{{ t('codeLabel') }}{{ item.code }}]</span>
                  
                  <!-- 拦截腔调：专属警示徽标 -->
                  <el-tag 
                    size="small" 
                    type="danger" 
                    effect="dark" 
                    class="spam-intercept-tag" 
                    v-if="item.isSpam === 1 || (item.labels && (item.labels.includes('推销') || item.labels.includes('垃圾')))" 
                    style="margin-right: 6px; font-weight: 700; border-radius: 4px; box-shadow: 0 2px 4px rgba(245, 108, 108, 0.2);"
                  >
                    <Icon icon="mdi:shield-alert" width="12" style="margin-right: 2px;" /> 拦截
                  </el-tag>

                  <el-tag
                    size="small"
                    :type="getSnoozeStatus(item)?.type"
                    effect="dark"
                    v-if="props.type === 'snoozed' && getSnoozeStatus(item)"
                    style="margin-right: 6px; font-weight: 700; border-radius: 4px;"
                  >
                    <Icon icon="ic:outline-access-time" width="12" style="margin-right: 2px;" />
                    {{ getSnoozeStatus(item)?.text }}
                  </el-tag>

                  <el-tag size="small" type="info" class="folder-tag" v-if="emailStore.searchParsed.isGlobal" style="margin-right: 5px; height: 18px; padding: 0 4px; line-height: 16px; display: inline-flex; align-items: center; vertical-align: middle;">{{ getFolderTag(item) }}</el-tag>

                  <div class="subject-and-snippet">
                    <span class="email-subject-text" :class="{ 'is-unread': item.unread === EmailUnreadEnum.UNREAD && showUnread }">
                      <slot name="subject" :email="item">
                        <span v-html="highlightMatch(item.subject || '\u200B')"></span>
                      </slot>
                    </span>
                    <span class="email-snippet-text" v-if="item.formatText && item.formatText.trim()">&nbsp;-&nbsp;<span v-html="highlightMatch(item.formatText)"></span></span>
                  </div>

                  <div class="user-info" v-if="showUserInfo">
                    <div class="user">
                      <span>
                        <Icon icon="mynaui:user" width="16" height="16"/>
                      </span>
                      <span>{{ item.userEmail }}</span>
                    </div>
                    <div class="account">
                      <span>
                        <Icon icon="mdi-light:email" width="16" height="16"/>
                      </span>
                      <span>{{ item.type === 0 ? item.toEmail : item.sendEmail }}</span>
                    </div>
                  </div>
                </div>

                <!-- 3. Right Area (Date/Time & Quick Actions) -->
                <div class="email-right" :style="showUserInfo ? 'align-self: start;':''">
                  <span class="email-time" :class="{ 'is-unread': item.unread === EmailUnreadEnum.UNREAD && showUnread }">{{ item.formatCreateTime }}</span>
                  <div class="quick-actions">
                    <el-tooltip :content="$t('snooze') || 'Snooze'" placement="top" v-if="['email'].includes(props.type)">
                      <Icon icon="ic:outline-access-time" width="18" height="18" class="quick-icon" @click.stop="handleSnooze(item.emailId)" />
                    </el-tooltip>
                    <el-tooltip :content="$t('delete')" placement="top" v-if="!['trash'].includes(props.type)">
                      <Icon icon="uiw:delete" width="16" height="16" class="quick-icon" @click.stop="rightDelete(item.emailId)" />
                    </el-tooltip>
                    <el-tooltip :content="$t('permanentDelete') || 'Delete forever'" placement="top" v-if="['trash', 'spam'].includes(props.type)">
                      <Icon icon="uiw:delete" width="16" height="16" class="quick-icon" @click.stop="rightDelete(item.emailId, true)" />
                    </el-tooltip>
                    <el-tooltip :content="$t('restore') || 'Restore'" placement="top" v-if="['trash', 'spam', 'snoozed'].includes(props.type)">
                      <Icon icon="ic:outline-restore" width="18" height="18" class="quick-icon" @click.stop="handleRestore(item.emailId)" />
                    </el-tooltip>
                    <el-tooltip :content="$t('markRead')" placement="top" v-if="item.unread === EmailUnreadEnum.UNREAD && showUnread">
                      <Icon icon="fluent:mail-read-20-regular" width="18" height="18" class="quick-icon" @click.stop="emailRead(item.emailId)" />
                    </el-tooltip>
                  </div>
                </div>
              </div>
            </div>
            <skeletonBlock v-else-if="item.expand === 'loading'"
                           :rows="1"
                           :showStar="showStar"
                           :accountShow="accountShow"
                           :showStatus="showStatus"
                           :showUserInfo="showUserInfo"
                           :type="type"/>
            <div class="search-separator" v-else-if="item.expand === 'separator'">
              <span>{{ item.title }}</span>
            </div>
            <div class="noLoading" v-else-if="item.expand === 'noMoreData'" style="height: 10px;">
            </div>
          </template>
        </UseVirtualList>
      <skeletonBlock v-if="firstLoad && showFirstLoading"
                       :rows="20"
                       :showStar="showStar"
                       :accountShow="accountShow"
                       :showStatus="showStatus"
                       :showUserInfo="showUserInfo"
                       :type="type"/>
      <skeletonBlock v-if="loading"
                       :rows="skeletonRows"
                       :showStar="showStar"
                       :accountShow="accountShow"
                       :showStatus="showStatus"
                       :showUserInfo="showUserInfo"
                       :type="type"/>
      <div class="empty" v-if="noLoading && emailList.length === 0 && !loading">
        <el-empty :image-size="isMobile ? 120 : null" :description="$t('noMoreData')"/>
      </div>
    </div>
    <el-dropdown
        ref="dropdownRef"
        @visible-change="visibleChange"
        :virtual-ref="triggerRef"
        :show-arrow="false"
        :popper-options="{
      modifiers: [{ name: 'offset', options: { offset: [0, 0] } }],
    }"
        virtual-triggering
        trigger="contextmenu"
        placement="bottom-start"
    >
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-if="rightClickEmail.code" @click="copyCode(rightClickEmail.code)" >
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="fluent-color:clipboard-24" width="20" height="20" />
                <span>{{t('copyCode')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email'].includes(props.type)" @click="emailRead(rightClickEmail.emailId)" >
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="fluent:mail-read-20-regular" width="20" height="20" />
                <span>{{t('markAsRead')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email'].includes(props.type)" @click="handleSnooze(rightClickEmail.emailId)" >
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="ic:outline-access-time" width="20" height="20" />
                <span>{{t('snooze') || 'Snooze'}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email'].includes(props.type)" @click="handleSpam(rightClickEmail.emailId)" >
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="ic:outline-report-gmailerrorred" width="20" height="20" />
                <span>{{t('markSpam') || 'Spam'}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','star'].includes(props.type)" @click="openReply(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="la:reply" width="20" height="20"  />
                <span>{{t('reply')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','send', 'star'].includes(props.type)" @click="openForward(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:arrow-up-right" width="19" height="19"  />
                <span>{{t('forward')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','send', 'star'].includes(props.type)" @click="starChange(rightClickEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="solar:star-line-duotone" width="19" height="19"/>
                <span>{{t('star')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email'" @click="handleSearch('user', rightClickEmail.userEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchUser')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email' " @click="handleSearch('account', rightClickEmail.toEmail)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchEmail')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email' " @click="handleSearch('name', rightClickEmail.name)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="iconoir:search" width="20" height="20" />
                <span>{{t('searchSender')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="!['trash'].includes(props.type)" @click="rightDelete(rightClickEmail.emailId)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="uiw:delete" width="16" height="20" style="margin-left: 1px;margin-right: 3px" />
                <span>{{t('delete')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['trash', 'spam'].includes(props.type)" @click="rightDelete(rightClickEmail.emailId, true)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="uiw:delete" width="16" height="20" style="margin-left: 1px;margin-right: 3px" />
                <span>{{t('permanentDelete') || 'Delete forever'}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="['trash', 'spam', 'snoozed'].includes(props.type)" @click="handleRestore(rightClickEmail.emailId)">
            <template #default>
              <div class="right-dropdown-item">
                <Icon icon="ic:outline-restore" width="16" height="20" style="margin-left: 1px;margin-right: 3px" />
                <span>{{t('restore') || 'Restore'}}</span>
              </div>
            </template>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- Snooze Dialog -->
    <el-dialog
      v-model="snoozeDialogVisible"
      :title="t('snooze') || 'Snooze'"
      width="400px"
      class="snooze-dialog"
      :append-to-body="true"
    >
      <el-form label-position="top">
        <el-form-item :label="t('snoozeStartTime') || 'Start Time'">
          <el-date-picker
            v-model="snoozeForm.time"
            type="datetime"
            :placeholder="t('selectTime') || 'Select Time'"
            style="width: 100%"
            value-format="YYYY-MM-DD HH:mm:ss"
            :disabled-date="disabledSnoozeDate"
          />
        </el-form-item>
        <el-form-item :label="t('snoozeEndTime') || 'End Time'">
          <el-date-picker
            v-model="snoozeForm.endTime"
            type="datetime"
            :placeholder="t('selectTime') || 'Select Time'"
            style="width: 100%"
            value-format="YYYY-MM-DD HH:mm:ss"
            :disabled-date="disabledSnoozeDate"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="snoozeDialogVisible = false">{{ t('cancel') || 'Cancel' }}</el-button>
          <el-button type="primary" @click="confirmSnooze" :loading="snoozeLoading">
            {{ t('confirm') || 'Confirm' }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import skeletonBlock from "@/components/email-scroll/skeleton/index.vue"
import {computed, onActivated, reactive, ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import {useEmailStore} from "@/store/email.js";
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {sleep} from "@/utils/time-utils.js"
import {fromNow} from "@/utils/day.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import { UseVirtualList } from '@vueuse/components'
import { useScroll } from '@vueuse/core'
import { emailSpam, emailSnooze, emailRestore, emailDelete as realEmailDelete } from "@/request/email.js";

const props = defineProps({
  getEmailList: Function,
  emailDelete: Function,
  emailRead: Function,
  starAdd: Function,
  starCancel: Function,
  cancelSuccess: Function,
  starSuccess: Function,
  actionLeft: {
    type: String,
    default: '0'
  },
  timeSort: {
    type: Number,
    default: 0,
  },
  showStatus: {
    type: Boolean,
    default: false
  },
  showAccountIcon: {
    type: Boolean,
    default: true,
  },
  showUserInfo: {
    type: Boolean,
    default: false
  },
  showStar: {
    type: Boolean,
    default: true
  },
  allowStar: {
    type: Boolean,
    default: true
  },
  type: {
    type: String,
    default: 'email'
  },
  showFirstLoading: {
    type: Boolean,
    default: true
  },
  showUnread: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['jump', 'refresh-before', 'delete-draft', 'right-search'])
const {t} = useI18n()
const settingStore = useSettingStore()
const uiStore = useUiStore();
const emailStore = useEmailStore();
const loading = ref(false);
const followLoading = ref(false);
const noLoading = ref(false);
const emailList = reactive([])
const expandList = reactive([])
const total = ref(0);
const checkAll = ref(false);
const isIndeterminate = ref(false);
const scroll = ref(null)
const firstLoad = ref(true)
let scrollTop = 0
const latestEmail = ref(null)
const scrollbarRef = ref(null)
let reqLock = false
let isMobile = ref(innerWidth < 1367)
let skeletonRows = 0
const timePaddingRight = ref('');
const keyCount = ref(0);
const dropdownRef = ref(null);
const dropdownCloseLock = ref(false);
const dropdownShow = ref(false);
const rightClickEmail = ref({});
const checkedEmailCount = ref(0);
let timer = null
const position = ref(
    DOMRect.fromRect({
      x: 0,
      y: 0,
    })
)

const triggerRef = ref({
  getBoundingClientRect() {
    return position.value;
  }
})

const queryParam = reactive({
  size: 50
});

function escapeHtml(text) {
  if (!text) return '';
  return text.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegExp(string) {
  return string.toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatch(text) {
  const parsed = emailStore.searchParsed;
  if (!parsed.highlight || !parsed.cleanKeyword) return escapeHtml(text || '');
  
  const keyword = parsed.cleanKeyword;
  const regex = new RegExp(`(${escapeRegExp(keyword)})`, 'gi');
  
  const parts = (text || '').split(regex);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return `<mark class="search-highlight" style="background-color: yellow; color: black; padding: 0 2px; border-radius: 2px;">${escapeHtml(part)}</mark>`;
    } else {
      return escapeHtml(part);
    }
  }).join('');
}

defineExpose({
  refreshList,
  deleteEmail,
  addItem,
  handleList,
  emailList,
  firstLoad,
  latestEmail,
  noLoading,
  total
})

onActivated(() => {
  requestAnimationFrame(() => {
    const index = scrollTop / itemHeight.value
    scrollbarRef.value?.scrollTo(index);
  })
})

const handleResize = () => {
  isMobile.value = innerWidth < 1367
}

const handleWheel = () => {
  if (dropdownShow.value) {
    dropdownRef.value.handleClose();
  }
}

onMounted(() => {
  timer = setInterval(() => {
    emailList.forEach(email => {
      email.formatCreateTime = fromNow(email.createTime);
    })
  }, 1000 * 60);

  window.addEventListener('resize', handleResize)
  window.addEventListener('wheel', handleWheel)
})

onUnmounted(() => {
  clearInterval(timer)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('wheel', handleWheel)
})

getEmailList()

function onScroll(e) {
  scrollTop = e.target.scrollTop;
}

const { arrivedState } = useScroll(scrollbarRef, {
  offset: { bottom: 1200 }
})


function getThreadKey(item) {
  if (!item || item.expand) return null;
  if (item.threadId) return `thread_${item.threadId}`;

  let s = (item.subject || '').trim();
  s = s.replace(/^(re|fwd|fw|回复|转发)[:：\s]+/gi, '')
       .replace(/^(\[[^\]]+\]|\([^\)]+\))[:：\s]*/g, '')
       .trim().toLowerCase();

  const sender = (item.sendEmail || '').trim().toLowerCase();
  if (!s) {
    return sender ? `sender_${sender}` : `id_${item.emailId}`;
  }
  return `subj_${s}_${sender}`;
}

function aggregateThreads(items) {
  if (!uiStore.conversationView) {
    return items.map(item => ({ ...item, threadCount: 1, threadEmails: [item] }));
  }

  const groups = new Map();
  const order = [];

  items.forEach(item => {
    if (item.expand) {
      order.push({ isExpand: true, item });
      return;
    }

    const key = getThreadKey(item);
    if (!key) {
      order.push({ isExpand: false, item });
      return;
    }

    if (!groups.has(key)) {
      groups.set(key, []);
      order.push({ isExpand: false, key });
    }
    groups.get(key).push(item);
  });

  const result = [];
  order.forEach(entry => {
    if (entry.isExpand) {
      result.push(entry.item);
    } else if (entry.key) {
      const g = groups.get(entry.key);
      if (!g || g.length === 0) return;
      // Sort chronologically: oldest to newest for viewing, newest as representative
      g.sort((a, b) => new Date(a.createTime || 0) - new Date(b.createTime || 0) || a.emailId - b.emailId);
      const latestMsg = { ...g[g.length - 1] };
      latestMsg.threadCount = g.length;
      latestMsg.threadEmails = g;
      if (g.some(e => e.unread === EmailUnreadEnum.UNREAD)) {
        latestMsg.unread = EmailUnreadEnum.UNREAD;
      }
      if (g.some(e => e.isStar)) {
        latestMsg.isStar = 1;
      }
      result.push(latestMsg);
      groups.delete(entry.key);
    } else if (entry.item) {
      result.push({ ...entry.item, threadCount: 1, threadEmails: [entry.item] });
    }
  });

  return result;
}

const list = computed(() => {
  const keyword = emailStore.searchKeyword.trim();
  const parsed = emailStore.searchParsed;
  
  if (!keyword) {
    return [...aggregateThreads(emailList), ...expandList]
  }

  const isExact = /exact:true/i.test(keyword);
  const isCaseSensitive = /case:true/i.test(keyword);
  
  let searchStr = parsed.cleanKeyword;
  if (!isCaseSensitive) {
    searchStr = searchStr.toLowerCase();
  }

  const filtered = emailList.filter(item => {
    let pass = true;
    if (searchStr) {
      let subject = item.subject || '';
      let text = item.formatText || '';
      let name = item.name || '';
      
      if (!isCaseSensitive) {
        subject = subject.toLowerCase();
        text = text.toLowerCase();
        name = name.toLowerCase();
      }
      
      const fields = [subject, text, name];
      if (isExact) {
        pass = fields.some(c => c === searchStr || c.includes(' ' + searchStr + ' '));
      } else {
        pass = fields.some(c => c.includes(searchStr));
      }
    }
    
    if (pass) {
      if (/is:sent/i.test(keyword) || /from:me/i.test(keyword)) {
        pass = pass && (item.type === 1 || item.type === 'send');
      }
      if (/is:spam/i.test(keyword)) {
        pass = pass && item.isSpam;
      }
      if (/is:trash/i.test(keyword)) {
        pass = pass && item.isDel;
      }
    }
    
    return pass;
  });

  const currentPartition = [];
  const otherPartition = [];
  
  filtered.forEach(item => {
    let isCurrent = false;
    if (props.type === 'trash') {
      isCurrent = !!item.isDel;
    } else if (props.type === 'spam') {
      isCurrent = !!item.isSpam;
    } else if (props.type === 'send') {
      isCurrent = item.type === 1;
    } else if (props.type === 'snoozed') {
      isCurrent = !!item.snoozedTime;
    } else if (props.type === 'star') {
      isCurrent = !!item.isStar;
    } else if (props.type === 'all-email') {
      isCurrent = true;
    } else {
      isCurrent = !item.isDel && !item.isSpam && (!item.snoozedTime || item.sendEmail === 'admin@epocanvas.com' || item.isOfficial) && item.type === 0;
    }
    
    if (isCurrent) {
      currentPartition.push(item);
    } else {
      otherPartition.push(item);
    }
  });

  let finalResult = [];
  if (otherPartition.length > 0) {
    finalResult = [
      ...currentPartition,
      { emailId: 'separator-1', expand: 'separator', title: t('otherFolders') || 'Other Folders' },
      ...otherPartition
    ];
  } else {
    finalResult = [...currentPartition];
  }

  return [...aggregateThreads(finalResult), ...expandList];
})

const itemHeight = computed(() => {
    if (props.type === 'all-email') {
      return isMobile.value ? 132 : 65;
    } else {
      if (isMobile.value) return 83;
      if (uiStore.density === 'compact') return 36;
      if (uiStore.density === 'comfortable') return 48;
      return 54;
    }
})

watch(emailList, () => {
  updateHasScrollbar();
})

watch(scrollbarRef, () => {
  updateHasScrollbar();
})

// 强制刷新 (itemHeight 更改后虚拟滚动列表不会自己更新)
watch(itemHeight, () => {
  keyCount.value ++
})

watch(followLoading, (isFollowLoading) => {
  if (isFollowLoading) {
    expandList.push({
      emailId: 0,
      expand: 'loading'
    })
  } else {
    const index = expandList.findIndex(item => item.expand === 'loading')
    expandList.splice(index, 1);
  }
});

watch(noLoading, (isNoLoading) => {
  if (isNoLoading) {
    expandList.push({
      emailId: 0,
      expand: 'noMoreData'
    })
  } else {
    const index = expandList.findIndex(item => item.expand === 'noMoreData')
    expandList.splice(index, 1);
  }
})


// 监听是否到达底部
watch(() => arrivedState.bottom, (isBottom) => {
  if (isBottom && !loading.value) {
    loadData();
  }
});

watch(
    () => emailList.map(item => item.checked),
    () => {
      checkedEmailCount.value = emailList.length
      if (emailList.length > 0) {
        updateCheckStatus();
      }
    }
);


watch(() => emailStore.deleteIds, () => {
  if (emailStore.deleteIds) {
    deleteEmail(emailStore.deleteIds)
  }
})

watch(() => emailStore.cancelStarEmailId, () => {
  emailList.forEach(email => {
    if (email.emailId === emailStore.cancelStarEmailId) {
      email.isStar = 0
    }
  })
})

watch(() => emailStore.addStarEmailId, () => {
  emailList.forEach(email => {
    if (email.emailId === emailStore.addStarEmailId) {
      email.isStar = 1
    }
  })
})



function openReply(email) {
  uiStore.writerRef.openReply(email)
}

function openForward(email) {
  uiStore.writerRef.openForward(email)
}

const snoozeDialogVisible = ref(false);
const snoozeLoading = ref(false);
const snoozeForm = reactive({
  emailId: null,
  time: '',
  endTime: ''
});

function disabledSnoozeDate(time) {
  const sixMonthsLater = new Date();
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
  return time.getTime() < Date.now() - 8.64e7 || time.getTime() > sixMonthsLater.getTime();
}

function getSnoozeStatus(item) {
  if (!item.snoozedTime) return null;
  const d = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const now = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  
  if (item.snoozedEndTime && item.snoozedEndTime <= now) {
    return { text: t('snoozeExpired'), type: 'danger' };
  } else if (item.snoozedTime <= now) {
    return { text: t('snoozeTodo'), type: 'warning' };
  } else {
    return { text: t('snoozeWaiting'), type: 'info' };
  }
}

function handleSnooze(emailId) {
  snoozeForm.emailId = emailId;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const end = new Date(tomorrow);
  end.setHours(10, 0, 0, 0);
  
  const pad = (n) => n.toString().padStart(2, '0');
  const formatTime = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  
  snoozeForm.time = formatTime(tomorrow);
  snoozeForm.endTime = formatTime(end);
  snoozeDialogVisible.value = true;
}

function confirmSnooze() {
  if (!snoozeForm.time || !snoozeForm.endTime) {
    ElMessage.error(t('selectTime') || 'Please select time');
    return;
  }
  if (new Date(snoozeForm.endTime).getTime() < new Date(snoozeForm.time).getTime()) {
    ElMessage.error(t('endTimeBeforeStartTime') || 'End time cannot be earlier than start time');
    return;
  }

  snoozeLoading.value = true;
  emailSnooze(snoozeForm.emailId, snoozeForm.time, snoozeForm.endTime).then(() => {
    ElMessage.success(t('snoozedSuccess') || 'Email snoozed');
    deleteEmailFromList([snoozeForm.emailId]);
    emailStore.refreshSidebarStats();
    snoozeDialogVisible.value = false;
  }).finally(() => {
    snoozeLoading.value = false;
  });
}

function handleSpam(emailId) {
  emailSpam(emailId, true).then(() => {
    ElMessage.success(t('spamSuccess') || 'Marked as spam');
    deleteEmailFromList([emailId]);
    emailStore.refreshSidebarStats();
  });
}

function handleRestore(emailId) {
  emailRestore(emailId).then(() => {
    ElMessage.success(t('restoreSuccess') || 'Email restored');
    deleteEmailFromList([emailId]);
    emailStore.refreshSidebarStats();
  });
}

function deleteEmailFromList(ids) {
  for (let i = emailList.length - 1; i >= 0; i--) {
    if (ids.includes(emailList[i].emailId)) {
      emailList.splice(i, 1);
    }
  }
}

function visibleChange(e) {
  dropdownShow.value = e;
  dropdownCloseLock.value = true;
  setTimeout(() => {
    dropdownCloseLock.value = false;
  },1500)

  if (!e && rightClickEmail.value.rightChecked) {
    rightClickEmail.value.rightChecked = false
  }
}

const handleContextmenu = (event, email) => {

  if (props.type === 'draft') {
    return
  }

  if (rightClickEmail.value.rightChecked) {
    rightClickEmail.value.rightChecked = false
  }

  const { clientX, clientY } = event
  position.value = DOMRect.fromRect({
    x: clientX,
    y: clientY,
  })
  event.preventDefault();
  dropdownRef.value?.handleOpen();

  rightClickEmail.value = email;
  rightClickEmail.value.rightChecked = true
}

function updateHasScrollbar() {
  nextTick(() => {
    const doc = document.querySelector('.virtual');
    if (doc) {
      if (doc.scrollHeight > doc.clientHeight) {
        timePaddingRight.value = '5px';
      } else {
        timePaddingRight.value = '15px'
      }
    }
  })
}

function getSkeletonRows() {
  if (emailList.length > 20) return skeletonRows = 20
  if (emailList.length === 0) return skeletonRows = 1
  skeletonRows = emailList.length
}

const accountShow = computed(() => {
  return uiStore.accountShow && settingStore.settings.manyEmail === 0
})

function htmlToText(email) {
  if (email.content) {

    const tempDiv = document.createElement('div');

    tempDiv.innerHTML = email.content.replace(
        /<(img|iframe|object|embed|video|audio|source|link)[^>]*>/gi, ''
    );

    const scriptsAndStyles = tempDiv.querySelectorAll('script, style, title');
    scriptsAndStyles.forEach(el => el.remove());
    let text = tempDiv.textContent || tempDiv.innerText || '';
    text = text.replace(/\s+/g, ' ').trim();
    return cleanSpace(text)
  }

  if (email.text) {
    return cleanSpace(email.text)
  } else {
    return ''
  }

}

function cleanSpace(text) {
  return text
      .replace(/[\u200B-\u200F\uFEFF\u034F\u200B-\u200F\u00A0\u3000\u00AD]/g, '')// 移除零宽空格
      .replace(/\s+/g, ' ')                   // 多空白合并成一个空格
      .trim();
}

function starChange(email) {

  if (!email.isStar) {

    if (!props.allowStar) return;

    email.isStar = 1;
    props.starAdd(email.emailId).then(() => {
      email.isStar = 1;
      props.starSuccess(email)
    }).catch(e => {
      console.error(e)
      email.isStar = 0
    })
  } else {

    email.isStar = 0;
    props.starCancel(email.emailId).then(() => {
      email.isStar = 0;
      props.cancelSuccess?.(email)
    }).catch(e => {
      console.error(e)
      email.isStar = 1;
    })
  }
}

function changeAccountShow() {
  uiStore.accountShow = !uiStore.accountShow;
}

const handleRead = () => {
  const emailIds = getSelectedMailsIds();
  props.emailRead(emailIds).then(() => {
    emailStore.refreshSidebarStats();
  });
  localRead(emailIds);
}

function emailRead(emailId) {
  props.emailRead([emailId]).then(() => {
    emailStore.refreshSidebarStats();
  });
  localRead([emailId]);
}

function localRead(emailIds) {
  emailIds.forEach(emailId => {
    const index = emailList.findIndex(email => email.emailId === emailId);
    if (index > -1) {
      emailList[index].unread = EmailUnreadEnum.READ;
      emailList[index].checked = false;
    }
  })
}

function rightDelete(emailId, physical = false) {

  if (props.type === 'all-email') {
    ElMessageBox.confirm(t('delOneEmailConfirm'), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    }).then(() => {
      props.emailDelete([emailId], physical).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true
        })
        emailStore.deleteIds = [emailId];
        emailStore.refreshSidebarStats();
      })
    })
    return;
  }
  props.emailDelete([emailId], physical).then(() => {
    ElMessage({
      message: t('delSuccessMsg'),
      type: 'success',
      plain: true
    })
    emailStore.deleteIds = [emailId];
    emailStore.refreshSidebarStats();
  })
}

function handleSearch(type, value) {
  emit('right-search', type, value);
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true
    })
  }
}

function getFolderTag(item) {
  if (item.isSpam) return t('spam');
  if (item.isDel) return t('trash');
  if (item.snoozedTime) return t('snoozed');
  if (item.type === 1) return t('sent');
  return t('inbox');
}

function handleDelete() {
  ElMessageBox.confirm(t('delEmailsConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {

    if (props.type === 'draft') {
      const draftIds = getSelectedDraftsIds();
      emit('delete-draft', draftIds);
      return;
    }

    const emailIds = getSelectedMailsIds();
    props.emailDelete(emailIds).then(() => {
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true
      })
      emailStore.deleteIds = emailIds;
      emailStore.refreshSidebarStats();
    })
  })
}

function deleteEmail(emailIds) {
  emailIds.forEach(emailId => {
    emailList.forEach((item, index) => {
      if (emailId === item.emailId) {
        emailList.splice(index, 1);
      }
    })
  })
  if (emailList.length < queryParam.size && !noLoading.value) {
    getEmailList()
  }
}

function addItem(email) {

  const existIndex = emailList.findIndex(item => item.emailId === email.emailId)

  if (existIndex > -1) {
    return false;
  }

  email.formatText = htmlToText(email);
  email.formatCreateTime = fromNow(email.formatCreateTime);

  if (props.timeSort) {
    if (noLoading.value) {
      handleList([email]);
      emailList.push(email);
    }

    if (email.emailId > latestEmail.value?.emailId) {
      latestEmail.value = email
    }

    total.value++
    return true;
  }


  const index = emailList.findIndex(item => item.emailId < email.emailId)

  if (index !== -1) {
    handleList([email]);
    emailList.splice(index, 0, email);
  } else {
    if (noLoading.value) {
      handleList([email]);
      emailList.push(email);
    }
  }

  if (email.emailId > latestEmail.value?.emailId) {
    latestEmail.value = email
  }

  total.value++
  return true;
}

function handleCheckAllChange(val) {
  emailList.forEach(item => item.checked = val);
  isIndeterminate.value = false;
}

// 获取选中的邮件列表id
function getSelectedMailsIds() {
  return emailList.filter(item => item.checked).map(item => item.emailId);
}

function getSelectedDraftsIds() {
  return emailList.filter(item => item.checked).map(item => item.draftId);
}

function updateCheckStatus() {
  const checkedCount = emailList.filter(item => item.checked).length;
  checkedEmailCount.value = checkedCount;
  checkAll.value = checkedCount === emailList.length;
  isIndeterminate.value = checkedCount > 0 && checkedCount < emailList.length;
}

function jumpDetails(email) {

  if (dropdownShow.value) {
    dropdownRef.value.handleClose();
    return;
  }

  if (!dropdownCloseLock.value) {
    const sel = window.getSelection();
    if (sel.toString().trim()) {
      return
    }
  }
  emit('jump', email)
}


function getEmailList(refresh = false) {

  if (reqLock) return;

  let emailId = emailList.length > 0 ? emailList.at(-1).emailId : 0;

  reqLock = true

  if (!refresh) {

    if (loading.value || noLoading.value) {
      reqLock = false
      return
    }

  } else {
    getSkeletonRows()
    emailId = 0
    loading.value = true
    scrollTop = 0
  }

  if (emailList.length === 0) {
    loading.value = true
  } else {
    followLoading.value = !refresh;
  }
  let start = Date.now();

  props.getEmailList(emailId, queryParam.size).then(async data => {
    let end = Date.now();
    let duration = end - start;
    if (duration < 300 && !emailId) {
        await sleep(300 - duration)
    }
    firstLoad.value = false

    let list = data.list.map(item => ({
      ...item,
      checked: false
    }));


    if (refresh) {
      emailList.length = 0
    }

    latestEmail.value = data.latestEmail

    handleList(list);
    emailList.push(...list);
    if (refresh) scrollbarRef.value?.setScrollTop(0);

    noLoading.value = data.list.length < queryParam.size;
    followLoading.value = data.list.length >= queryParam.size;

    total.value = data.total;
  }).finally(() => {
    loading.value = false
    reqLock = false
  })
}

function handleList(list) {
  list.forEach(email => {
    email.formatText = htmlToText(email)
    email.formatCreateTime = fromNow(email.createTime);
    email.test = t('received')
    const statusIconMap = {
      0: { icon: 'ic:round-mark-email-read', color: '#51C76B', content: t('received') },
      1: { icon: 'bi:send-arrow-up-fill',  color: '#51C76B', content: t('sent') },
      2: { icon: 'bi:send-check-fill',     color: '#51C76B', content: t('delivered') },
      3: { icon: 'bi:send-x-fill',         color: '#F56C6C', content: t('bounced') },
      8: { icon: 'bi:send-x-fill',         color: '#F56C6C', content: t('bounced') },
      4: { icon: 'bi:send-exclamation-fill', color: '#FBBD08', content: t('complained') },
      5: { icon: 'bi:send-arrow-up-fill',  color: '#FBBD08', content: t('delayed') },
      7: { icon: 'ic:round-mark-email-read', color: '#FBBD08', content: t('noRecipient') },
    };

    if (email.isDel) {
      email.isDelContent = t('selectDeleted');
    }
    email.statusIcon = statusIconMap[email.status];
  })
}

function refresh() {
  emit('refresh-before')
  if (props.skeleton) {
    scrollbarRef.value.setScrollTop(0)
  }
  refreshList()
}

function refreshList() {
  emailStore.refreshSidebarStats();
  checkAll.value = false;
  isIndeterminate.value = false;
  getEmailList(true);
}

function loadData() {
  getEmailList()
}

</script>
<style lang="scss" scoped>

.email-container {
  container-type: inline-size;
  display: grid;
  grid-template-rows: auto 1fr;
  padding: 0;
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  height: 100%;
}

.scroll {
  margin: 0;
  height: 100%;
  overflow: hidden;

  .virtual {
    will-change: scroll-position;
  }

  .empty {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
  }

  .noLoading {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 15px 0 0 0;
    color: var(--secondary-text-color);
  }

  .follow-loading {
    height: 60px;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    background: var(--loadding-background);
    height: 100%;
    width: 100%;
    position: absolute;
    z-index: 1;
    top: 0;
    left: 0;
  }

  .loading-show {
    transition: all 200ms ease 200ms;
    opacity: 1;
  }

  .loading-hide {
    pointer-events: none;
    transition: var(--loading-hide-transition);
    opacity: 0;
  }
  
  .search-separator {
    padding: 10px 15px;
    font-weight: 500;
    color: var(--el-text-color-secondary);
    background-color: var(--el-fill-color-light);
    font-size: 13px;
    margin: 8px 0;
    border-radius: 4px;
    text-align: center;
    position: sticky;
    top: 0;
    z-index: 10;
  }
}

.email-row {
  display: flex;
  align-items: center;
  width: 100%;
    height: 52px;
    border-bottom: 1px solid var(--border-subtle);
    background: transparent;
    cursor: pointer;
    position: relative;
    transition: background 0.15s ease;
    padding: 0 16px;
    box-sizing: border-box;
    white-space: nowrap;
    overflow: hidden;

    @media (pointer: coarse) {
      user-select: none;
    }
    &.density-compact {
      height: 38px !important;
      padding: 0 12px !important;
      .sender-name-text, .email-subject-text {
        font-size: 13px !important;
      }
    }
    &.density-comfortable {
      height: 46px !important;
      padding: 0 14px !important;
    }
    &.density-default {
      height: 52px !important;
      padding: 0 16px !important;
    }

    &.all-email {
      height: 54px;
    }

    &:hover {
      background-color: var(--email-hover-background);
      z-index: 0;
    }

    .unread-bar {
      height: 24px;
      width: 4px;
      background: var(--el-color-primary);
      border-radius: 4px;
      position: absolute;
      left: 2px;
      top: 50%;
      transform: translateY(-50%);
    }

    .checkbox, .all-email-checkbox {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 8px;
      flex-shrink: 0;
    }

    .pc-star {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      margin-right: 8px;
      flex-shrink: 0;
      cursor: pointer;
      color: var(--text-muted);
      transition: transform 0.15s ease;

      &:hover {
        transform: scale(1.15);
        color: var(--star-color, #f5c542);
      }
    }

    .no-star-spacer {
      width: 4px;
      flex-shrink: 0;
    }

    .email-row-content {
      flex: 1;
      display: flex;
      align-items: center;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
    }

    .email-sender-area {
      flex: 0 0 200px;
      max-width: 220px;
      min-width: 140px;
      display: flex;
      align-items: center;
      overflow: hidden;
      white-space: nowrap;
      padding-right: 12px;
      box-sizing: border-box;

      @container (max-width: 600px) {
        flex: 0 0 130px;
        max-width: 130px;
      }

      &.is-unread {
        .sender-name-text {
          font-weight: 700;
          color: var(--text-primary);
        }
      }

      .email-status {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-right: 6px;
        flex-shrink: 0;
      }

      .sender-name-wrap {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;

        .sender-name-text {
          font-size: 13.5px;
          font-weight: 500;
          color: var(--text-primary);
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          flex-shrink: 1;
          min-width: 0;
        }

        .thread-count-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          margin-left: 6px;
          flex-shrink: 0;
          background: rgba(91, 110, 245, 0.12);
          color: var(--accent-primary);
          padding: 0 5px;
          border-radius: 4px;
          height: 16px;
          line-height: 16px;
        }

        .official-verified-badge {
          display: inline-flex;
          align-items: center;
          flex-shrink: 0;
        }
      }

      .phone-time {
        display: none;
      }
    }

    .email-main-area {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      padding-right: 16px;
      font-size: 13px;

      .code-tag {
        flex: 0 0 auto;
        max-width: 160px;
        height: 20px;
        line-height: 20px;
        font-size: 12px;
        color: var(--accent-primary);
        background: var(--accent-muted);
        padding: 0 6px;
        border-radius: 4px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        cursor: pointer;
        margin-right: 6px;
      }

      .subject-and-snippet {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;

        .email-subject-text {
          font-size: 13.5px;
          font-weight: 500;
          color: var(--text-primary);
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          flex-shrink: 0;
          max-width: 100%;

          &.is-unread {
            font-weight: 700;
            color: var(--text-primary);
          }
        }

        .email-snippet-text {
          font-size: 13px;
          color: var(--text-muted);
          font-weight: 400;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          min-width: 0;
          flex: 1;
        }
      }

      .user-info {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        margin-left: 12px;
        color: var(--text-muted);
        font-size: 11px;
        flex-shrink: 0;

        .user, .account {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          max-width: 180px;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }
    }

    .email-right {
      flex: 0 0 95px;
      text-align: right;
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-shrink: 0;

      .email-time.is-unread {
        font-weight: 700;
        color: var(--text-primary);
      }
    }
  }


.phone-star {
  display: none;
}

.pc-star {
  display: flex;
  width: 40px;
}

@container (max-width: 800px) {
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

.email-time {
  padding-right: v-bind(timePaddingRight);
}

:deep(.el-scrollbar__view) {
  height: 100%;
}

.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 48px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  padding: 0 16px;

  .header-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    position: relative;
    column-gap: 12px;
    row-gap: 8px;
    padding-left: 12px;
    color: var(--text-secondary);
  }

  .header-right {
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    font-size: 12px;
    gap: 12px;

    .email-count {
      white-space: nowrap;
    }
  }

  .icon {
    font-size: 18px;
    cursor: pointer;
    transition: color 0.15s;
    &:hover {
      color: var(--text-primary);
    }
  }

  .more-icon {
    font-size: 18px;
  }
}

.del-status {
  color: var(--el-color-info);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  bottom: 1px;
}



.right-dropdown-item {
  display: flex;
  gap: 10px;
}

:deep(.el-dropdown-menu__item:last-child) {
  padding-bottom: 10px;
}

:deep(.el-dropdown-menu__item:first-child) {
  padding-top: 10px;
}

:deep(.el-dropdown-menu__item) {
  padding-right: 14px;
  padding-left: 14px;
}

.unread-bar {
  height: 24px;
  width: 4px;
  background: var(--el-color-primary);
  border-radius: 4px;
  position: absolute;
  left: 2px;
  top: 50%;
  transform: translateY(-50%);
}

.quick-actions {
  display: none;
  gap: 12px;
  align-items: center;
  padding-right: 15px;
}

.email-row:hover .email-time {
  display: none;
}

.email-row:hover .quick-actions {
  display: flex;
}

.quick-icon {
  color: var(--secondary-text-color);
  cursor: pointer;
}

.quick-icon:hover {
  color: var(--el-color-primary);
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.snooze-dialog {
  margin-top: 10vh !important;
  border-radius: 12px;
}
</style>
