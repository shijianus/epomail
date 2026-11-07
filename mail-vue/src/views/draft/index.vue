<template>
  <emailScroll ref="scroll"
               :allow-star="false"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               :star-cancel="starCancel"
               @jump="jumpContent"
               actionLeft="6px"
               :show-account-icon="false"
               :show-first-loading="false"
               :showStar="false"
               @delete-draft="deleteDraft"
               :type="'draft'"
  >
    <template #name="props">
      <span class="send-email">{{ props.item.receiveEmail?.join(',') || '(' + $t('noRecipient') + ')' }}</span>
    </template>
    <template #subject="props">
      {{ props.email.subject || '(' + $t('noSubject') + ')' }}
    </template>
  </emailScroll>
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import {emailDelete} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, ref, watch, toRaw} from "vue";
import {useUiStore} from "@/store/ui.js";
import {userDraftStore} from "@/store/draft.js";
import {useEmailStore} from "@/store/email.js";
import db from "@/db/db.js"
import { deleteDraftsAndAttachments } from '@/utils/device-privacy.js';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();

defineOptions({
  name: 'draft'
})

const draftStore = userDraftStore();
const uiStore = useUiStore();
const emailStore = useEmailStore();
const scroll = ref({})

watch(() => draftStore.setDraft, async () => {

  const draft = { ...toRaw(draftStore.setDraft) }
  const draftId = draft.draftId
  const attachments = toRaw(draftStore.setDraft.attachments)

  delete draft.draftId
  delete draft.attachments

  if (!draft.content && !draft.subject && !draft.receiveEmail?.length && !attachments?.length) {
    await deleteDraftsAndAttachments(db.value, draftId);
    draftStore.refreshList++
    return;
  }

  await db.value.transaction('rw', db.value.draft, db.value.att, async () => {
    await db.value.draft.update(draftId, draft);
    await db.value.att.put({ draftId, attachments: attachments || [] });
  });
  draftStore.refreshList++
}, {
  deep: true
})

watch(() => draftStore.refreshList, async () => {
  const {list} = await getEmailList();
    scroll.value.emailList.length = 0
    scroll.value.handleList(list);
    scroll.value.emailList.push(...list)
})

function getEmailList() {
  return db.value.draft.orderBy('createTime').reverse().toArray().then(list => {
    const keyword = emailStore.searchParsed.cleanKeyword;
    if (keyword) {
      const lkeyword = keyword.toLowerCase();
      list = list.filter(item => (item.subject && item.subject.toLowerCase().includes(lkeyword)) ||
        (item.content && item.content.toLowerCase().includes(lkeyword)) ||
        (item.receiveEmail && item.receiveEmail.join(',').toLowerCase().includes(lkeyword)));
    }
    return { list };
  });
}

async function deleteDraft(draftIds) {
  try {
    await deleteDraftsAndAttachments(db.value, draftIds);
    draftStore.refreshList++;
  } catch {
    ElMessage.error(t('privacySettings.draftDeleteFailed'));
  }
}

async function jumpContent(email) {
  const att = await db.value.att.get(email.draftId)
  email.attachments = att?.attachments || []
  uiStore.writerRef.openDraft(email);
}

</script>
<style>
.send-email {
  font-weight: normal;
}
</style>
