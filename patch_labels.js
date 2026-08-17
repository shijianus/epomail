const fs = require('fs');
let content = fs.readFileSync('mail-vue/src/layout/aside/index.vue', 'utf8');

content = content.replace(
  /<div class="sidebar-red-dot" v-if="label.stats && label.stats.unread > 0"><\/div>/g,
  `<div class="sidebar-red-dot" v-if="getLabelStats(label.name).unread > 0"></div>
                <div class="sidebar-gray-dot" v-else-if="getLabelStats(label.name).read > 0 && label.name === '推销'"></div>`
);

content = content.replace(
  /<span class="nav-count" v-if="label.stats && label.stats.unread > 0">{{ label.stats.unread }}<\/span>/g,
  `<span class="nav-count" v-if="getLabelStats(label.name).unread > 0">{{ getLabelStats(label.name).unread }}</span>
              <span class="nav-count muted" v-else-if="getLabelStats(label.name).read > 0 && label.name === '推销'">{{ getLabelStats(label.name).read }}</span>`
);

content = content.replace(
  /onMounted\(\(\) => {/g,
  `const getLabelStats = (name) => {
  return emailStore.sidebarStats?.labelStats?.[name] || { unread: 0, read: 0 };
};

onMounted(() => {`
);

fs.writeFileSync('mail-vue/src/layout/aside/index.vue', content);
