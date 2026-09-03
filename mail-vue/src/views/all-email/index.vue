<template>
  <div class="email-list-box">
    <div v-if="Number(settingStore.settings?.allMailMode) === 2" class="encrypted-restricted-notice">
      <Icon icon="fluent:shield-lock-24-filled" width="56" height="56" class="notice-icon" />
      <div class="notice-title">{{ $t('encryptedMailModeStatus') }}</div>
      <div class="notice-desc">{{ $t('encryptedMailModeAdminRestricted') }}</div>
    </div>
    <template v-else>
      <emailScroll ref="sysEmailScroll"
                   :get-emailList="getEmailList"
                   :email-delete="allEmailDelete"
                   :star-add="starAdd"
                   :star-cancel="starCancel"
                   :show-star="false"
                   show-user-info
                   show-status
                   actionLeft="4px"
                   :show-account-icon="false"
                   :time-sort="params.timeSort"
                   :item-height="65"
                   @jump="jumpContent"
                   @refresh-before="refreshBefore"
                   @right-search="rightSearch"
                   :type="'all-email'"

      >
        <template #first>
          <div style="flex-grow: 1;"></div> <!-- Spacer to push icons to the right if needed, or just let them sit -->
          <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-down-outline"
                v-if="params.timeSort === 0" width="28" height="28" style="margin-left: auto;"/>
          <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-up-outline" v-else
                width="28" height="28" style="margin-left: auto;"/>
          <Icon class="icon clear" icon="fluent:broom-sparkle-16-regular" width="22" height="22" @click="openBathDelete"/>
        </template>
      </emailScroll>
    </template>
    <el-dialog v-model="showBathDelete" :title="$t('clearEmail')" width="335"
               @closed="closedClear">
      <div class="clear-email">
        <el-input v-model="clearParams.sendName" :placeholder="$t('sender')"/>
        <el-input v-model="clearParams.subject" :placeholder="$t('subject')"/>
        <el-input v-model="clearParams.sendEmail" :placeholder="$t('sendEmailAddress')"/>
        <el-input v-model="clearParams.toEmail" :placeholder="$t('toEmail')"/>
        <el-date-picker popper-class="my-date-picker"
                        v-model="clearTime"
                        type="daterange"
                        :teleported="false"
                        unlink-panels
                        :range-separator="t('to')"
                        size="default"
        />
        <div class="clear-button">
          <el-select v-model="clearParams.type" style="width: 200px">
            <el-option key="eq" :label="t('equal')" value="eq"/>
            <el-option key="left" :label="t('leading')" value="left"/>
            <el-option key="include" :label="t('include')" value="include"/>
          </el-select>
          <el-button :loading="clearLoading" type="primary" @click="batchDelete">{{ t('clear') }}</el-button>
        </div>
      </div>
    </el-dialog>

    <!-- Email Detail Drawer/Dialog for Admin Reading -->
    <el-drawer v-model="showDetailDrawer" :size="'65%'" :title="currentEmail?.subject || $t('noSubject')" direction="rtl" destroy-on-close class="email-detail-drawer">
      <template #header>
        <div class="drawer-header-title">
          <Icon icon="fluent:mail-read-24-regular" width="20" height="20" class="header-mail-icon" />
          <span class="header-subject">{{ currentEmail?.subject || $t('noSubject') }}</span>
        </div>
      </template>
      <div v-if="currentEmail" class="detail-container">
        <div class="detail-info-card">
          <div class="sender-row">
            <el-avatar :size="40" class="sender-avatar">{{ currentEmail.name ? currentEmail.name.charAt(0).toUpperCase() : 'U' }}</el-avatar>
            <div class="sender-meta">
              <div class="name-date">
                <span class="sender-name">{{ currentEmail.name || $t('noSender') }}</span>
                <span v-if="currentEmail.sendEmail === 'admin@epocanvas.com' || currentEmail.isOfficial" class="official-verified-badge" :title="$t('officialVerified') || '官方认证'">
                  <Icon icon="ri:verified-badge-fill" width="16" height="16" style="color: #0284c7; vertical-align: middle;" />
                </span>
                <span class="sender-email">&lt;{{ currentEmail.sendEmail }}&gt;</span>
                <span class="email-date">{{ formatDetailDate(currentEmail.createTime) }}</span>
              </div>
              <div class="recipient-line">
                <span class="label">{{ $t('recipient') }}:</span>
                <span class="val">{{ formatRecipient(currentEmail.recipient) }}</span>
                <span class="user-bind" v-if="currentEmail.userEmail">({{ $t('userAccount') }}: {{ currentEmail.userEmail }})</span>
              </div>
            </div>
          </div>
          <div class="tags-row" v-if="currentEmail.isSpam === 1 || currentEmail.isDel === 1 || currentEmail.status === 2">
            <el-tag size="small" type="danger" v-if="currentEmail.isSpam === 1">{{ $t('spam') }}</el-tag>
            <el-tag size="small" type="warning" v-if="currentEmail.isDel === 1">{{ $t('trash') }}</el-tag>
            <el-tag size="small" type="info" v-if="currentEmail.status === 2">NOONE</el-tag>
          </div>
        </div>

        <el-scrollbar class="detail-body-scrollbar">
          <div class="email-body-content">
            <ShadowHtml class="shadow-html" :html="formatImage(currentEmail.content)" v-if="currentEmail.content" />
            <pre v-else class="email-text">{{ currentEmail.text || $t('noContent') }}</pre>
          </div>
        </el-scrollbar>

        <div class="detail-attachments" v-if="currentEmail.attList && currentEmail.attList.length > 0">
          <div class="att-header">
            <span>{{ $t('attachments') }} ({{ currentEmail.attList.length }})</span>
          </div>
          <div class="att-list">
            <div class="att-item" v-for="att in currentEmail.attList" :key="att.attId">
              <div class="att-icon">
                <Icon v-bind="getIconByName(att.filename)" />
              </div>
              <div class="att-name" :title="att.filename">{{ att.filename }}</div>
              <div class="att-size">{{ formatBytes(att.size) }}</div>
              <a :href="cvtR2Url(att.key)" download class="att-download" target="_blank">
                <Icon icon="system-uicons:push-down" width="20" height="20"/>
              </a>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import ShadowHtml from "@/components/shadow-html/index.vue";
import {starAdd, starCancel} from "@/request/star.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {computed, defineOptions, reactive, ref, watch, onMounted} from "vue";
import {useEmailStore} from "@/store/email.js";
import {
  allEmailList,
  allEmailDelete,
  allEmailBatchDelete,
  allEmailLatest
} from "@/request/all-email.js";
import {Icon} from "@iconify/vue";
import router from "@/router/index.js";
import {useI18n} from 'vue-i18n';
import {toUtc, formatDetailDate} from "@/utils/day.js";
import {sleep} from "@/utils/time-utils.js";
import {useSettingStore} from "@/store/setting.js";
import { useRoute } from 'vue-router';
import {getIconByName} from "@/utils/icon-utils.js";
import {formatBytes} from "@/utils/file-utils.js";
import {cvtR2Url, toOssDomain} from "@/utils/convert.js";

defineOptions({
  name: 'all-email'
})

const route = useRoute()
const {t} = useI18n();
const emailStore = useEmailStore();
const settingStore = useSettingStore();
const clearTime = ref('')
const sysEmailScroll = ref({})
const searchValue = ref('')
const mySelect = ref()
const showBathDelete = ref(false)
const clearLoading = ref(false)

const showDetailDrawer = ref(false)
const currentEmail = ref(null)

onMounted(() => {
  emailStore.emailScroll = sysEmailScroll.value;
  latest();
})

const formatImage = (content) => {
  content = content || '';
  const domain = settingStore.settings?.r2Domain;
  return content.replace(/{{domain}}/g, toOssDomain(domain) + '/');
};

const formatRecipient = (recipient) => {
  if (!recipient) return '';
  try {
    const list = JSON.parse(recipient);
    return list.map(item => item.address || item.name || '').join(', ');
  } catch (e) {
    return recipient;
  }
};

const openSelect = () => {
  mySelect.value.toggleMenu()
}

const params = reactive({
  timeSort: 0,
  type: 'receive',
  userEmail: null,
  accountEmail: null,
  name: null,
  subject: null,
  searchType: 'name'
})

const clearParams = reactive({
  subject: '',
  sendEmail: '',
  sendName: '',
  startTime: '',
  toEmail: '',
  endTime: '',
  type: 'eq',
})

function resetClearParams() {
  clearParams.subject = ''
  clearParams.sendEmail = ''
  clearParams.sendName = ''
  clearParams.startTime = ''
  clearParams.toEmail = ''
  clearParams.endTime = ''
}

function closedClear() {
  resetClearParams()
  clearParams.type = 'eq'
  clearParams.endTime = ''
  clearTime.value = null
}

const selectTitle = computed(() => {
  if (params.searchType === 'user') return t('user')
  if (params.searchType === 'account') return t('selectEmail')
  if (params.searchType === 'name') return t('sender')
  if (params.searchType === 'subject') return t('subject')
})

const paramsStar = localStorage.getItem('all-email-params')
if (paramsStar) {
  const locaParams = JSON.parse(paramsStar)
  params.type = locaParams.type
  params.timeSort = locaParams.timeSort
  params.status = locaParams.status
  params.searchType = locaParams.searchType
}

watch(() => params, () => {
  localStorage.setItem('all-email-params', JSON.stringify(params))
}, {
  deep: true
})

watch(() => settingStore.settings?.allMailMode, () => {
  if (sysEmailScroll.value && sysEmailScroll.value.refreshList) {
    sysEmailScroll.value.refreshList();
  }
})

function openBathDelete() {
  showBathDelete.value = true
}

function batchDelete() {

  if (clearTime.value) {
    clearParams.startTime = toUtc(clearTime.value[0]).format("YYYY-MM-DD HH:mm:ss")
    clearParams.endTime = toUtc(clearTime.value[1]).add(1, 'day').format("YYYY-MM-DD HH:mm:ss")
  }

  if (!clearParams.sendEmail && !clearParams.sendName && !clearParams.subject && !clearParams.toEmail && !clearTime.value) {
    showBathDelete.value = false
    return
  }

  ElMessageBox.confirm(
      t('delAllConfirm'),
      {
        confirmButtonText: t('confirm'),
        cancelButtonText: t('cancel'),
        type: 'warning',
      }
  ).then(() => {
    clearLoading.value = true

    allEmailBatchDelete(clearParams).then(() => {
      ElMessage({
        message: t('clearSuccess'),
        type: "success",
        plain: true
      })
      resetClearParams()
      sysEmailScroll.value.refreshList();
    }).finally(() => {
      clearLoading.value = false
    })
  })
}

function rightSearch(type, value) {
  // Translate right click into query string
  let query = emailStore.searchKeyword + '';
  const prefix = type === 'user' ? '$user ' : type === 'account' ? '$to ' : '$sender ';
  query = `${query} ${prefix}${value}`.trim();
  emailStore.searchKeyword = query;
}

function parseQuery(query) {
  let processed = query.replace(/\\\\/g, '\u0001'); 
  processed = processed.replace(/\\\$/g, '\u0002'); 
  
  const parts = processed.split(/(?=\$)/);
  
  const fieldsMap = {
    // English tokens (match i18n t('sender') etc.)
    'sender': 'name',   'Sender': 'name',
    'user': 'userEmail', 'User': 'userEmail',
    'to': 'accountEmail', 'To': 'accountEmail', 'Email': 'accountEmail',
    'subject': 'subject', 'Subject': 'subject',
    // Chinese tokens
    '发件人': 'name', '發件人': 'name',
    '账户': 'userEmail', '帳戶': 'userEmail', '用户': 'userEmail', '用戶': 'userEmail',
    '收件人': 'accountEmail', '邮箱': 'accountEmail', '郵箱': 'accountEmail',
    '主题': 'subject', '主題': 'subject',
  };
  const typeMap = {
    // English tokens
    'received': 'receive', 'Received': 'receive',
    'sent': 'send', 'Sent': 'send',
    'deleted': 'delete', 'Deleted': 'delete',
    'norecipient': 'noone', 'No Recipient': 'noone', 'No recipient': 'noone',
    'all': 'all', 'All': 'all',
    // Chinese tokens
    '已接收': 'receive',
    '已发送': 'send', '已發送': 'send',
    '已删除': 'delete', '已刪除': 'delete',
    '无收件人': 'noone', '無收件人': 'noone', '无人收件': 'noone',
    '全部': 'all',
  };

  const result = {
    userEmail: null,
    accountEmail: null,
    name: null,
    subject: null,
    type: params.type || 'receive',
    keyword: ''
  };

  let leftover = [];
  
  for (let p of parts) {
    if (!p) continue;
    if (p.startsWith('$')) {
      const spaceIdx = p.indexOf(' ');
      let key = '';
      let value = '';
      if (spaceIdx === -1) {
         key = p.slice(1);
      } else {
         key = p.slice(1, spaceIdx);
         value = p.slice(spaceIdx + 1).trim();
      }
      
      key = key.toLowerCase();
      
      if (fieldsMap[key]) {
         result[fieldsMap[key]] = value.replace(/\u0002/g, '$').replace(/\u0001/g, '\\');
      } else if (typeMap[key]) {
         result.type = typeMap[key];
         if (value) leftover.push(value);
      } else {
         leftover.push(p);
      }
    } else {
      leftover.push(p);
    }
  }
  
  result.keyword = leftover.join(' ').replace(/\u0002/g, '$').replace(/\u0001/g, '\\').trim();
  
  // NOTE: plain free-text stays in result.keyword for multi-field OR search in backend.
  // Only set subject/name/etc when user used an explicit $-prefix directive.
  
  return result;
}

function refreshBefore() {
  emailStore.searchKeyword = '';
  params.timeSort = 0;
  params.type = 'receive';
  params.userEmail = null;
  params.accountEmail = null;
  params.name = null;
  params.subject = null;
}

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1;
  if (sysEmailScroll.value && sysEmailScroll.value.refreshList) {
    sysEmailScroll.value.refreshList();
  }
}

function jumpContent(email) {
  currentEmail.value = email;
  showDetailDrawer.value = true;
  emailStore.contentData.email = email;
  emailStore.contentData.delType = 'physics';
  emailStore.contentData.showStar = false;
  emailStore.contentData.showReply = false;
}

function getEmailList(emailId, size) {
  const parsed = parseQuery(emailStore.searchKeyword || '');
  params.userEmail = parsed.userEmail;
  params.accountEmail = parsed.accountEmail;
  params.name = parsed.name;
  params.subject = parsed.subject;
  params.type = parsed.type;
  
  // keyword drives multi-field OR search; only sent when no explicit field directives
  const extra = parsed.keyword ? { keyword: parsed.keyword } : {};
  
  return allEmailList({emailId, size, ...params, ...extra})
}

async function latest() {

  while (true) {

    let autoRefresh = settingStore.settings.autoRefresh;

    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000);

    const latestId = sysEmailScroll.value.latestEmail?.emailId

    if (autoRefresh < 2) {
      continue
    }

    if (!latestId && latestId !== 0) {
      continue
    }

    if (route.name !== 'all-email') {
      continue
    }


    if (params.type !== 'receive') {
      continue
    }

    try {

      const curTimeSort = params.timeSort
      let list = await allEmailLatest(latestId)

      if (list.length === 0) {
        continue
      }

      if (params.type !== 'receive') {
        continue
      }

      // 确保回来之后条件没变
      if (params.timeSort !== curTimeSort) {
        continue
      }

      for (let email of list) {

        sysEmailScroll.value.addItem(email)
        await sleep(50)

      }

    } catch (e) {
      if (e.code === 401 || e.code === 403) {
        settingStore.settings.autoRefresh = 0;
      }
      console.error(e)
    }

  }
}

</script>
<style>

@media (max-width: 767px) {
  .el-date-range-picker .el-picker-panel__body {
    min-width: auto;

  }

  .my-date-picker::after {
    content: "";
    position: absolute; /* 脱离文档流，不会撑开 */
    left: 0;
    right: 0;
    height: 20px;
    background: transparent; /* 方便看效果 */
  }

  .el-date-range-picker__content {
    width: 100%;
  }

  .el-date-range-picker {
    width: 300px;
  }

  .el-tooltip .el-picker_popper {
    padding-bottom: 200px;
  }

  .el-date-range-picker__content.is-left {
    border-right: 0;
  }
}

</style>
<style scoped lang="scss">
.email-list-box {
  height: 100%;
  width: 100%;
  overflow: hidden;
}


.search {
  padding-top: 5px;
  padding-bottom: 5px;
}

.select {
  position: absolute;
  width: 40px;
  opacity: 0;
  pointer-events: none;
}

.search-type {
  display: flex;
  color: var(--el-text-color-regular);
}

:deep(.header-actions) {
  padding-top: 8px;
  padding-bottom: 8px;
}

.search-input {
  width: 100%;
  max-width: 280px;
  height: 28px;

  .setting-icon {
    position: relative;
    top: 3px;
  }
}

.clear-email {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.clear-button {
  display: flex;
  align-items: center;
  gap: 15px;

  .el-button {
    width: 100%;
  }
}

.status-select {
  margin-bottom: 2px;
  width: 102px;

  :deep(.el-select__wrapper) {
    min-height: 28px;
  }
}

.input-with-select {
  max-width: 200px;
  border-radius: 0 4px 4px 0;
}

:deep(.input-with-select .el-input-group__append) {
  background-color: var(--el-fill-color-blank);
}

:deep(.el-select__wrapper) {
  padding: 2px 10px;
  min-height: 28px;
}

:deep(.el-date-editor.el-input__wrapper) {
  width: 303px;
}

.icon {
  cursor: pointer;
}

.clear {
  @media (max-width: 419px) {
    position: absolute;
    top: 41px;
    left: 242px;
  }
}

:deep(.reload) {
  @media (max-width: 419px) {
    position: absolute;
    top: 42px;
    left: 208px;
  }
}

:deep(.delete) {
  @media (max-width: 456px) {
    position: absolute;
    top: 43px;
    left: 294px;
  }

  @media (max-width: 419px) {
    position: absolute;
    top: 43px;
    left: 282px;
  }
}

/* Detail Drawer Styles */
:deep(.email-detail-drawer) {
  .el-drawer__header {
    margin-bottom: 0;
    padding: 16px 24px;
    border-bottom: 1px solid var(--border-subtle, #ebeef5);
  }
  .el-drawer__body {
    padding: 0;
    display: flex;
    flex-direction: column;
    height: calc(100% - 60px);
    overflow: hidden;
  }
}

.drawer-header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;

  .header-mail-icon {
    color: var(--accent-primary, #409eff);
    flex-shrink: 0;
  }

  .header-subject {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.detail-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-surface, #ffffff);
}

.detail-info-card {
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-subtle, #f0f2f5);
  background: var(--bg-surface);

  .sender-row {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }

  .sender-avatar {
    background: var(--accent-primary, #409eff);
    color: #fff;
    font-weight: 600;
    flex-shrink: 0;
  }

  .sender-meta {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .name-date {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;

    .sender-name {
      font-weight: 600;
      font-size: 14px;
      color: var(--text-primary);
    }
    .sender-email {
      font-size: 12.5px;
      color: var(--text-secondary);
    }
    .email-date {
      margin-left: auto;
      font-size: 12px;
      color: var(--text-muted);
    }
  }

  .recipient-line {
    font-size: 12.5px;
    color: var(--text-secondary);
    .label {
      font-weight: 500;
      margin-right: 4px;
    }
    .val {
      color: var(--text-primary);
    }
    .user-bind {
      margin-left: 8px;
      color: var(--accent-primary);
      font-size: 12px;
    }
  }

  .tags-row {
    margin-top: 10px;
    display: flex;
    gap: 6px;
  }
}

.detail-body-scrollbar {
  flex: 1;
  padding: 20px 24px;
  overflow-y: auto;

  .email-body-content {
    min-height: 150px;
  }

  .email-text {
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    color: var(--text-primary);
    line-height: 1.6;
    margin: 0;
  }
}

.detail-attachments {
  border-top: 1px solid var(--border-subtle, #f0f2f5);
  padding: 14px 24px;
  background: var(--bg-surface);

  .att-header {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 8px;
  }

  .att-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .att-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 6px;
    background: var(--bg-subtle, #f8f9fa);
    border: 1px solid var(--border-subtle, #e9ecef);
    font-size: 12px;

    .att-icon {
      display: flex;
      align-items: center;
    }

    .att-name {
      max-width: 140px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text-primary);
    }

    .att-size {
      color: var(--text-muted);
      font-size: 11px;
    }

    .att-download {
      color: var(--accent-primary);
      display: flex;
      align-items: center;
      transition: opacity 0.2s;
      &:hover {
        opacity: 0.8;
      }
    }
  }
}

.encrypted-restricted-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 380px;
  padding: 40px 24px;
  text-align: center;

  .notice-icon {
    color: #52c41a;
    margin-bottom: 16px;
  }

  .notice-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .notice-desc {
    font-size: 13.5px;
    color: var(--text-muted);
    max-width: 480px;
    line-height: 1.6;
  }
}
</style>
