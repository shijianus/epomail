const fs = require('fs');
let content = fs.readFileSync('mail-vue/src/components/email-scroll/index.vue', 'utf8');

content = content.replace(
  /function refreshList\(\) {/g,
  `function refreshList() {
  emailStore.refreshSidebarStats();`
);

fs.writeFileSync('mail-vue/src/components/email-scroll/index.vue', content);
