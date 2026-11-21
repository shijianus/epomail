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
import {defineOptions, ref, watch} from "vue";
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

watch(() => draftStore.refreshList, () => scroll.value?.refreshList?.())

function getEmailList() {
  return db.value.draft.orderBy('createTime').reverse().toArray().then(list => {
    const keyword = emailStore.searchParsed.cleanKeyword;
    if (keyword) {
      const lkeyword = keyword.toLowerCase();
      list = list.filter(item => (item.subject && item.subject.toLowerCase().includes(lkeyword)) ||
        (item.content && item.content.toLowerCase().includes(lkeyword)) ||
        (item.receiveEmail && item.receiveEmail.join(',').toLowerCase().includes(lkeyword)));
    }
    return { list, total: list.length, complete: true };
  });
}

async function deleteDraft(draftIds) {
  try {
    const database = db.value;
    await database.transaction('rw', database.draft, database.att, async () => {
      const drafts = await database.draft.bulkGet(draftIds);
      if (drafts.some(draft => draft?.attemptKey)) throw new Error('draft_pending');
      await deleteDraftsAndAttachments(database, draftIds);
    });
    draftStore.refreshList++;
  } catch (error) {
    ElMessage.error(error.message === 'draft_pending' ? t('composeAttemptPending') : t('privacySettings.draftDeleteFailed'));
  }
}

async function jumpContent(email) {
  const database = db.value
  try {
    const draft = await database.transaction('r', database.draft, database.att, async () => {
      const row = await database.draft.get(email.draftId)
      if (!row) return null
      const att = await database.att.get(email.draftId)
      return { ...row, attachments: att?.attachments || [] }
    })
    if (database !== db.value) return
    if (draft) uiStore.writerRef.openDraft(draft)
    else scroll.value?.refreshList?.()
  } catch {
    ElMessage.error(t('mailListLoadFailed'))
  }
}

</script>
<style>
.send-email {
  font-weight: normal;
}
</style>
