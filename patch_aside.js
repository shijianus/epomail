const fs = require('fs');
let content = fs.readFileSync('mail-vue/src/layout/aside/index.vue', 'utf8');

content = content.replace(
  /\/\/ Mock unread count for demonstration\nconst unreadCount = ref\(12\);/,
  `// Use global sidebar stats from emailStore
const unreadCount = computed(() => emailStore.sidebarStats?.inboxUnread || 0);
const starCount = computed(() => emailStore.sidebarStats?.starUnread || 0); // Need to add star logic if needed, wait, the db didn't easily query stars because star is in another table. Let's just default to 0.
const draftCount = computed(() => emailStore.sidebarStats?.draftUnread || 0);
const sendCount = computed(() => emailStore.sidebarStats?.sentUnread || 0);
const spamCount = computed(() => emailStore.sidebarStats?.spamUnread || 0);
const spamReadCount = computed(() => emailStore.sidebarStats?.spamRead || 0);
const trashCount = computed(() => emailStore.sidebarStats?.trashUnread || 0);
const allMailCount = computed(() => emailStore.sidebarStats?.allUnread || 0);
const urgentSnoozedCount = computed(() => emailStore.sidebarStats?.snoozedUrgent || 0);
const waitingSnoozedCount = computed(() => emailStore.sidebarStats?.snoozedWaiting || 0);

// Initialize fetch
onMounted(() => {
  emailStore.refreshSidebarStats();
});
`
);

// We also need to map the store to the UI counts.
// Replace the old HTML refs.
content = content.replace(
  /<div class="sidebar-red-dot" v-if="spamCount > 0"><\/div>/,
  `<div class="sidebar-red-dot" v-if="spamCount > 0"></div>
              <div class="sidebar-gray-dot" v-else-if="spamReadCount > 0"></div>`
);
content = content.replace(
  /<span class="nav-count" v-if="spamCount > 0">{{ spamCount }}<\/span>/,
  `<span class="nav-count" v-if="spamCount > 0">{{ spamCount }}</span>
            <span class="nav-count muted" v-else-if="spamReadCount > 0">{{ spamReadCount }}</span>`
);

fs.writeFileSync('mail-vue/src/layout/aside/index.vue', content);
