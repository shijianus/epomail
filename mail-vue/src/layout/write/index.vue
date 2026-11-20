<template>
  <div class="send" v-show="show">
    <div class="write-box">
      <div class="title">
        <div class="title-left">
          <span class="title-text">
            <Icon icon="hugeicons:quill-write-01" width="28" height="28"/>
          </span>
          <span class="sender">{{ $t('sender') }}:</span>
          <span class="sender-name">{{ form.name }}</span>
          <span class="send-email"><{{ form.sendEmail }}></span>
        </div>
        <div @click="close" style="cursor: pointer;">
          <Icon icon="material-symbols-light:close-rounded" width="22" height="22"/>
        </div>
      </div>
      <div v-if="attemptKey" class="compose-status" role="status">
        {{ t(attemptState === 'PARTIAL' ? 'composeAttemptPartial' : 'composeAttemptPending') }}
        <el-button size="small" :disabled="busy" @click="checkAttempt">{{ t('composeAttemptCheck') }}</el-button>
        <el-button v-if="['PENDING', 'NOT_FOUND'].includes(attemptState)" size="small" :disabled="busy" @click="sendEmail">{{ t('composeAttemptRetry') }}</el-button>
      </div>
      <div v-else-if="saveState" class="compose-status" role="status">
        {{ t(saveState === 'error' ? 'composeDraftSaveFailed' : saveState === 'saving' ? 'composeDraftSaving' : 'composeDraftSaved') }}
      </div>
      <div class="container" :inert="!!attemptKey || busy">
        <el-input-tag  @add-tag="addTagChange" tag-type="primary" @input="inputChange" size="default" v-model="form.receiveEmail" >
          <template #prefix>
            <div class="item-title" >{{ $t('recipient') }}</div>
            <el-select
                ref="mySelect"
                class="write-select"
                popper-class="write-select"
                :show-arrow="false"
                :no-match-text="' '"
                :no-data-text="' '"
                @visible-change="selectStatusChange"
                @change="selectChange"
            >
              <el-option
                  v-for="item in selectRecipientList"
                  :key="item"
                  :label="item"
                  :value="item"
                  style="color: #999896;"
              />
            </el-select>
          </template>
          <template #suffix>
            <div style="display: flex;margin-right: 3px;">
              <Icon icon="fa7-solid:user-plus" width="20" height="20" class="add-contact" @click.stop="openContacts" />
            </div>
          </template>
        </el-input-tag>
        <el-input v-model="form.subject" :placeholder="t('subject')" />
        <tinyEditor :def-value="defValue" ref="editor" @change="change" @focus="focusChange" />
        <div class="button-item">
          <div class="att-add" @click="chooseFile">
            <Icon icon="iconamoon:attachment-fill" width="24" height="24"/>
          </div>
          <div class="att-clear" @click="clearContent">
            <Icon icon="icon-park-outline:clear-format" width="24" height="24 "/>
          </div>
          <div class="att-list">
            <div class="att-item" v-for="(item,index) in form.attachments" :key="index">
              <Icon v-bind="getIconByName(item.filename)"/>
              <span class="att-filename">{{ item.filename }}</span>
              <span class="att-size">{{ formatBytes(item.size) }}</span>
              <Icon style="cursor: pointer;" icon="material-symbols-light:close-rounded" @click="delAtt(index)"
                    width="22" height="22"/>
            </div>
          </div>
          <div>
            <el-button type="primary" @click="sendEmail" v-if="form.sendType === 'reply'">{{ $t('reply') }}</el-button>
            <el-button type="primary" @click="sendEmail" v-else-if="form.sendType === 'forward'">{{ $t('forward') }}</el-button>
            <el-button type="primary" @click="sendEmail" v-else>{{ $t('send') }}</el-button>
          </div>
        </div>
      </div>
    </div>
    <el-dialog top="10vh" v-model="showContacts" @closed="clearSelectContact" :title="t('recentContacts')">
      <el-table ref="contactsTabRef" row-key="email" :data="contacts" style="height: 445px">
        <el-table-column type="selection" width="32" />
        <el-table-column property="email" :label="t('emailAccount')" >
          <template #default="props">
            <div class="email-row">{{ props.row.email }}</div>
          </template>
        </el-table-column>
        <el-table-column width="55" label="" >
          <template #default>
            <div style="display: flex;">
              <Icon icon="mage:user" style="color: var(--el-text-color-primary)" width="22" height="22" color="#606266" />
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="contacts-bottom">
        <el-button type="default" @click="deleteContact">{{t('clear')}}</el-button>
        <el-button type="primary" @click="chooseContact">{{t('selectContacts')}}</el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import tinyEditor from '@/components/tiny-editor/index.vue'
import {h, nextTick, onMounted, onUnmounted, reactive, ref, computed, watch} from "vue";
import {Icon} from "@iconify/vue";
import {useUserStore} from "@/store/user.js";
import {emailSend, emailSendStatus} from "@/request/email.js";
import {isEmail} from "@/utils/verify-utils.js";
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {fileToBase64, formatBytes} from "@/utils/file-utils.js";
import {getIconByName} from "@/utils/icon-utils.js";
import sendPercent from "@/components/send-percent/index.vue"
import {toOssDomain} from "@/utils/convert.js";
import {signObjectUrls} from "@/request/object.js";
import {formatDetailDate} from "@/utils/day.js";
import {useSettingStore} from "@/store/setting.js";
import {userDraftStore} from "@/store/draft.js";
import {useWriterStore} from "@/store/writer.js";
import db from "@/db/db.js";
import { composePayload, createDraftSession, hasDraftContent } from '@/utils/compose-draft.js';
import { resolveTabSession, isSameTabIdentity, tabSession } from '@/utils/tab-session.js';
import {useI18n} from "vue-i18n";
import {ElMessageBox} from "element-plus";

defineExpose({
  open,
  openReply,
  openReplyAll,
  openForward,
  openDraft,
  openWithRecipient
})

const {t} = useI18n()
const writerStore = useWriterStore();
writerStore.bindIdentity();
const draftStore = userDraftStore()
const settingStore = useSettingStore()
const emailStore = useEmailStore();
const accountStore = useAccountStore()
const editor = ref({})
const userStore = useUserStore();
const show = ref(false);
const percent = ref(0)
const busy = ref(false)
const attemptKey = ref(null)
const attemptState = ref('')
const saveState = ref('')
let session
let owner
let generation = 0
let saveTick = 0
let openingDraft = false
let attachmentReads = 0
const defValue = ref('')
const contactsTabRef = ref({})
const showContacts = ref(false)
const mySelect = ref()
let selectStatus = false
const form = reactive({
  sendEmail: '',
  receiveEmail: [],
  accountId: -1,
  name: '',
  subject: '',
  content: '',
  sendType: '',
  text: '',
  emailId: 0,
  attachments: [],
  draftId: null,
})

const selectRecipientList = ref([])

const contacts = computed(() => writerStore.sendRecipientRecord.map(item => ({email: item})))

function openContacts() {
  showContacts.value = true
  nextTick(() => {
    form.receiveEmail.forEach(item => {
      if (writerStore.sendRecipientRecord.includes(item)) {
        contactsTabRef.value.toggleRowSelection({email: item});
      }
    })
  })
}

function deleteContact() {
  ElMessageBox.confirm(t('confirmDeletionOfContacts'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    const contactList = contactsTabRef.value.getSelectionRows().map(item => item.email);
    form.receiveEmail = form.receiveEmail.filter(item => !contactList.includes(item));
    writerStore.removeRecipientRecords(contactList);
  })
}

function chooseContact() {

  const contactList = contactsTabRef.value.getSelectionRows().map(item => item.email);
  contactList.forEach(item => {
    if (!form.receiveEmail.includes(item)) {
      form.receiveEmail.push(item);
    }
  })

  form.receiveEmail = form.receiveEmail.filter(item => {
    return contactList.includes(item) || !writerStore.sendRecipientRecord.includes(item);
  });

  showContacts.value = false
}

function clearSelectContact() {
  contactsTabRef.value.clearSelection();
}

function selectChange(value) {
  form.receiveEmail.push(value)
}

function selectStatusChange(status) {
  selectStatus = status
}

const openSelect = () => {
  mySelect.value.toggleMenu()
}

function inputChange(value) {

  selectRecipientList.value = writerStore.sendRecipientRecord.filter(item => value && !form.receiveEmail.includes(item) && item.startsWith(value)).slice(0, 10);

  if (!selectStatus && selectRecipientList.value.length > 0) {
    openSelect()
  }

  if (selectStatus && selectRecipientList.value.length === 0) {
    openSelect()
  }

}

function addTagChange(val) {

  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  form.receiveEmail.splice(form.receiveEmail.length - 1, 1)

  let has = false
  emails.forEach(email => {
    if (isEmail(email) && !form.receiveEmail.includes(email)) {
      form.receiveEmail.push(email)
      has = true
    }
  })
  if (selectStatus && has) openSelect()
}

function clearContent() {
  ElMessageBox.confirm(t('clearContentConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    form.receiveEmail = []
    form.subject = form.content = form.text = form.sendType = ''
    form.emailId = 0
    form.attachments = []
    defValue.value = ''
    editor.value.clearEditor()
  }).catch(() => {})

}

function delAtt(index) {
  form.attachments.splice(index, 1);
}

function chooseFile() {
  const doc = document.createElement("input")
  doc.setAttribute("type", "file")
  doc.multiple = true;
  const target = session
  doc.onchange = async (e) => {

    const fileList = e.target.files;

    attachmentReads++
    try {
      for (const file of fileList) {
        const content = await fileToBase64(file)
        if (!isCurrent(target) || !show.value || busy.value || attemptKey.value) return
        form.attachments.push({ content, filename: file.name, size: file.size, contentType: file.type })
      }
    } catch {
      ElMessage.error(t('composeDraftSaveFailed'))
    } finally {
      if (isCurrent(target)) attachmentReads--
    }
  }
  doc.click()
}

function isCurrent(target) {
  return target && target === session && target.database === db.value && isSameTabIdentity(owner, resolveTabSession())
}

async function saveDraft() {
  const target = session
  if (!isCurrent(target)) throw new Error('draft_identity_changed')
  if (attemptKey.value) return
  const body = composePayload(form)
  const tick = ++saveTick
  saveState.value = 'saving'
  try {
    await target.persist(body)
    if (isCurrent(target) && tick === saveTick) saveState.value = hasDraftContent(body) ? 'saved' : ''
  } catch (error) {
    if (isCurrent(target)) saveState.value = 'error'
    throw error
  }
}

watch(form, () => {
  if (show.value && !openingDraft && !busy.value && !attemptKey.value) saveDraft().catch(() => {})
}, { deep: true })

function completeSend(target, outcome) {
  if (!isCurrent(target)) return
  const title = outcome === 'PARTIALLY_BOUNCED' ? t('composeAttemptMixed') :
    outcome === 'BOUNCED' ? t('bounced') : t('sendSuccessMsg')
  ElNotification({ title, message: form.subject, type: outcome ? 'warning' : 'success', position: 'bottom-right' })
  writerStore.addRecipientRecords(form.receiveEmail)
  emailStore.sendScroll?.refreshList?.()
  userStore.refreshUserInfo()
  show.value = false
  draftStore.refreshList++
  resetForm()
}

async function readAttempt(target, key) {
  const result = await emailSendStatus(form.accountId, key)
  if (!isCurrent(target)) return
  if (result?.state === 'ACCEPTED') {
    await target.finish(key, true)
    completeSend(target, result.deliveryOutcome)
  } else if (result?.state === 'FAILED') {
    await target.finish(key, false)
    if (!isCurrent(target)) return
    attemptKey.value = null
    attemptState.value = ''
    saveState.value = 'saved'
    ElMessage.warning(t('sendFailMsg'))
  } else {
    attemptState.value = result?.state || 'UNKNOWN'
  }
}

async function checkAttempt() {
  if (busy.value || !attemptKey.value || !isCurrent(session)) return
  busy.value = true
  const target = session
  try { await readAttempt(target, attemptKey.value) }
  catch { if (isCurrent(target)) ElMessage.warning(t('composeAttemptCheckFailed')) }
  finally { if (target === session) busy.value = false }
}

async function sendEmail() {

  if (form.receiveEmail.length === 0) {
    ElMessage({
      message: t('emptyRecipientMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.subject) {
    ElMessage({
      message: t('emptySubjectMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.content) {
    form.content = editor.value.getContent();
  }

  if (!form.content) {
    ElMessage({
      message: t('emptyContentMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.manyType === 'divide' && form.attachments.length > 0) {
    ElMessage({
      message: t('noSeparateSendMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (busy.value || !isCurrent(session)) return
  if (attachmentReads) { ElMessage.warning(t('composeDraftSaving')); return }
  const retrying = Boolean(attemptKey.value)
  if (retrying && !['NOT_FOUND', 'PENDING'].includes(attemptState.value)) return
  const target = session
  busy.value = true
  const progressMessage = ElMessage({ message: () => h(sendPercent, {value: percent.value, desc: t('sending')}),
    plain: true, duration: 0, customClass: 'message-bottom' })
  let prepared
  try {
    prepared = await target.persist(composePayload(form), true)
    if (!isCurrent(target)) return
    attemptKey.value = prepared.key
    attemptState.value = ''
    const emails = await emailSend(prepared.body, e => {
      if (isCurrent(target) && e.total) percent.value = Math.round(e.loaded * 98 / e.total)
    }, { idempotencyKey: prepared.key })
    await target.finish(prepared.key, true)
    completeSend(target, emails?.[0]?.deliveryOutcome)
  } catch (error) {
    if (!isCurrent(target)) return
    if (!prepared) { saveState.value = 'error'; ElMessage.error(t('composeDraftSaveFailed')); return }
    const failure = error.response?.data || error
    const messages = { outbound_disabled: 'composeOutboundDisabled', outbound_recipient_blocked: 'composeRecipientNotAllowed' }
    if (messages[failure.errorCode]) ElMessage.warning(t(messages[failure.errorCode]))
    // A lost success response must never create another attempt. Only a confirmed
    // terminal failure or an explicit rejection before a task existed unlocks editing.
    try {
      await readAttempt(target, prepared.key)
      const status = error.response?.status ?? failure.code
      if (!retrying && isCurrent(target) && attemptState.value === 'NOT_FOUND' && status >= 400 && status < 500 &&
          status !== 408 && status !== 425 && status !== 409) {
        await target.finish(prepared.key, false)
        if (isCurrent(target)) {
          attemptKey.value = null
          attemptState.value = ''
          saveState.value = 'saved'
          if (!messages[failure.errorCode]) ElMessage.error(failure.message || t('sendFailMsg'))
        }
      }
    } catch { if (isCurrent(target)) ElMessage.warning(t('composeAttemptCheckFailed')) }
  } finally {
    progressMessage.close()
    if (target === session) { busy.value = false; percent.value = 0 }
  }
}

function resetForm() {
  generation++
  session = null
  owner = null
  busy.value = false
  attemptKey.value = null
  attemptState.value = saveState.value = ''
  attachmentReads = 0
  defValue.value = ''
  form.text = ''
  form.receiveEmail = []
  form.subject = ''
  form.content = ''
  form.manyType = null
  form.attachments = []
  form.sendType = ''
  form.emailId = 0
  form.draftId = null
  editor.value?.clearEditor?.()
}

function change(content, text) {
  if (busy.value || attemptKey.value || !show.value) return
  form.content = content;
  form.text = text
}

function focusChange() {
  if (selectStatus) openSelect()
}

function openForward(email) {
  if (show.value) return
  resetForm();
  const frame = generation

  email.subject = email.subject || ''

  form.subject = email.subject
  form.sendType = 'forward'

  defValue.value = ''

  setTimeout(async () => {
    const forwarded = await formatImageAsync(email.content) ||
      `<pre style="font-family: inherit;word-break: break-word;white-space: pre-wrap;margin: 0">${email.text}</pre>`
    if (generation !== frame || show.value) return
    defValue.value = `
      ${forwarded}
    `
    form.content = defValue.value
    open()


  });
}

function openReply(email) {

  if (show.value) return
  resetForm();
  const frame = generation

  email.subject = email.subject || ''

  form.receiveEmail.push(email.sendEmail)
  form.subject = (
      email.subject.startsWith('Re:') ||
      email.subject.startsWith('Re：') ||
      email.subject.startsWith('回复：') ||
      email.subject.startsWith('回复:')) ? email.subject : 'Re: ' + email.subject
  form.sendType = 'reply'
  form.emailId = email.emailId

  defValue.value = ''

  setTimeout(async () => {
    const quoted = await formatImageAsync(email.content) ||
      `<pre style="font-family: inherit;word-break: break-word;white-space: pre-wrap;margin: 0">${email.text}</pre>`
    if (generation !== frame || show.value) return
    defValue.value = `
    <div></div>
    <div>
    <br>
        ${formatDetailDate(email.createTime)} ${email.name} &lt${email.sendEmail}&gt ${t('wrote')}:
    </div>
    <blockquote class="mceNonEditable" style="margin: 0 0 0 0.8ex;border-left: 1px solid rgb(204,204,204);padding-left: 1ex;">
      <article>
          ${quoted}
      </article>
    </blockquote>`
    form.content = defValue.value
    open()

  })

}

function openReplyAll(email) {
  if (show.value) return
  resetForm();
  const frame = generation

  email.subject = email.subject || '';

  const myEmail = (accountStore.currentAccount?.email || userStore.user?.email || '').toLowerCase().trim();
  const recipientsSet = new Set();
  if (email.sendEmail && email.sendEmail.toLowerCase().trim() !== myEmail) {
    recipientsSet.add(email.sendEmail.trim());
  }
  try {
    const parsed = typeof email.recipient === 'string' ? JSON.parse(email.recipient) : email.recipient;
    if (Array.isArray(parsed)) {
      parsed.forEach(item => {
        const addr = (item.address || item).toLowerCase().trim();
        if (addr && addr !== myEmail) {
          recipientsSet.add(item.address || item);
        }
      });
    }
  } catch (e) {
    if (typeof email.recipient === 'string') {
      email.recipient.split(/[,;]/).forEach(r => {
        const addr = r.toLowerCase().trim();
        if (addr && addr !== myEmail) {
          recipientsSet.add(r.trim());
        }
      });
    }
  }
  if (recipientsSet.size === 0 && email.sendEmail) {
    recipientsSet.add(email.sendEmail.trim());
  }

  form.receiveEmail = Array.from(recipientsSet);
  form.subject = (
      email.subject.startsWith('Re:') ||
      email.subject.startsWith('Re：') ||
      email.subject.startsWith('回复：') ||
      email.subject.startsWith('回复:')) ? email.subject : 'Re: ' + email.subject;
  form.sendType = 'reply';
  form.emailId = email.emailId;

  defValue.value = '';

  setTimeout(async () => {
    const quoted = await formatImageAsync(email.content) ||
      `<pre style="font-family: inherit;word-break: break-word;white-space: pre-wrap;margin: 0">${email.text}</pre>`
    if (generation !== frame || show.value) return
    defValue.value = `
    <div></div>
    <div>
    <br>
        ${formatDetailDate(email.createTime)} ${email.name} &lt${email.sendEmail}&gt ${t('wrote')}:
    </div>
    <blockquote class="mceNonEditable" style="margin: 0 0 0 0.8ex;border-left: 1px solid rgb(204,204,204);padding-left: 1ex;">
      <article>
          ${quoted}
      </article>
    </blockquote>`;
    form.content = defValue.value
    open();

  });
}

/**
 * Resolve forwarded/replied inline images. With no public object domain the
 * worker requires short-lived capability URLs, so signing must finish before
 * the quoted HTML is injected into the editor.
 */
async function formatImageAsync(content) {
  content = content || '';
  const domain = toOssDomain(settingStore.settings.r2Domain);
  if (domain) return content.replace(/{{domain}}/g, domain + '/');

  const keys = [...new Set(
    [...content.matchAll(/{{domain}}(attachments\/[A-Za-z0-9._-]+)/g)].map(match => match[1])
  )];
  let urls = {};
  if (keys.length > 0) {
    try {
      const response = await signObjectUrls(keys);
      urls = response?.urls || {};
    } catch (_) {}
  }
  return content
    .replace(/{{domain}}(attachments\/[A-Za-z0-9._-]+)/g, (match, key) => urls[key] || '')
    .replace(/{{domain}}/g, '/');
}

function open() {
  if (show.value) { editor.value.focus(); return }
  generation++
  owner = resolveTabSession()
  session = createDraftSession(db.value)
  const activeAcc = accountStore.currentAccount?.email ? accountStore.currentAccount : userStore.user?.account;
  if (activeAcc && activeAcc.email) {
    form.sendEmail = activeAcc.email;
    form.accountId = activeAcc.accountId;
    form.name = activeAcc.name || userStore.user?.name || '';
  } else {
    form.sendEmail = userStore.user?.email || '';
    form.accountId = userStore.user?.account?.accountId || 0;
    form.name = userStore.user?.name || '';
  }
  show.value = true;
  editor.value.focus()
}

function openWithRecipient(email) {
  if (show.value) return
  resetForm();
  form.receiveEmail.push(email);
  open();
}

function openDraft(draft) {
  if (show.value) return
  resetForm()
  owner = resolveTabSession()
  session = createDraftSession(db.value, draft)
  openingDraft = true
  Object.assign(form, composePayload(draft))
  nextTick(() => { openingDraft = false })
  form.draftId = draft.draftId
  attemptKey.value = draft.attemptKey || null
  defValue.value = form.content
  show.value = true
  if (attemptKey.value) checkAttempt()
  else editor.value.focus()
}

watch(db, () => {
  show.value = false
  resetForm()
})

const handleKeyDown = (event) => {
  if (event.key === 'Escape') {
    close()
  }
};

// Rendering a different tab identity must also discard the previous UI snapshot.
const unsubscribe = tabSession.subscribe(() => {
  if (owner && !isSameTabIdentity(owner, resolveTabSession())) {
    show.value = false
    resetForm()
  }
})
const warnUnsaved = event => {
  if (show.value && !attemptKey.value && (saveState.value === 'saving' || saveState.value === 'error' || attachmentReads)) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => {
  window.addEventListener('beforeunload', warnUnsaved)
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  unsubscribe()
  window.removeEventListener('beforeunload', warnUnsaved)
  window.removeEventListener('keydown', handleKeyDown);
});

async function close() {
  if (!show.value || busy.value) return
  if (attachmentReads) { ElMessage.warning(t('composeDraftSaving')); return }
  const target = session
  if (!isCurrent(target)) {
    show.value = false
    resetForm()
    return
  }
  busy.value = true
  try {
    if (!attemptKey.value) await saveDraft()
    if (!isCurrent(target)) return
    show.value = false
    draftStore.refreshList++
    resetForm()
  } catch {
    ElMessage.error(t('composeDraftSaveFailed'))
  } finally {
    if (target === session) busy.value = false
  }
}

</script>
<style>
.write-select .el-select-dropdown__list {
  padding: 4px 4px !important;
}
.write-select .el-select-dropdown__item {
  padding: 0 10px 0 10px;
}

.write-select .el-select-dropdown {
  min-width: 0 !important;
}
</style>
<style scoped lang="scss">
.compose-status { padding: 0.5rem 1rem; font-size: 0.9rem; }
.send {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  .write-box {
    background: var(--el-bg-color);
    width: min(1367px, calc(100% - 80px));
    box-shadow: var(--el-box-shadow-light);
    border: 1px solid var(--el-border-color-light);
    transition: var(--el-transition-duration);
    padding: 15px;
    border-radius: 8px;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
    @media (max-width: 1024px) {
      width: 100%;
      height: 100%;
      border-radius: 0;
      border: 0;
      padding-top: 10px;
    }

    @media (min-width: 1025px) {
      height: min(800px, calc(100vh - 60px));
    }

    .title {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;

      .title-left {
        align-items: center;
        display: grid;
        grid-template-columns: auto auto auto 1fr;
      }

      .title-text {
      }

      .sender {
        margin-left: 8px;
      }

      .sender-name {
        margin-left: 8px;
        font-weight: bold;
      }

      .send-email {
        color: #999896;
        margin-left: 5px;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
      }


      div {
        display: flex;
        align-items: center;
      }
    }

    .container {
      grid-row: 3;
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      gap: 15px;

      .item-title {
      }

      .button-item {
        display: grid;
        grid-template-columns: auto auto 1fr auto;

        .att-add {
          cursor: pointer;
        }

        .att-clear {
          cursor: pointer;
          margin-left: 10px;
        }

        .att-list {
          display: grid;
          gap: 5px;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          padding-left: 10px;
          padding-right: 10px;
          max-height: 110px;
          overflow-y: auto;
          @media (max-width: 450px) {
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          }

          .att-item {
            display: grid;
            grid-template-columns: auto 1fr auto auto;
            gap: 5px;
            height: 32px;
            font-size: 14px;
            padding: 4px 5px;
            background: var(--light-ill);
            border-radius: 4px;
            .att-filename {
              white-space: nowrap;
              text-overflow: ellipsis;
              overflow: hidden;
            }
          }
        }
      }
    }
  }

}

.email-row {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.el-dialog) {
  width: 420px !important;
  @media (max-width: 460px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.contacts-bottom {
  display: flex;
  justify-content: end;
  margin-top: 10px;
}

.add-contact {
  color: var(--regular-text-color)
}

.write-select {
  position: absolute;
  width: 300px;
  left: 60px;
  z-index: 0;
  opacity: 0;
  pointer-events: none;
}

:deep(.el-input-tag__suffix) {
  padding-right: 4px;
}

.icon {
  cursor: pointer;
}
</style>
