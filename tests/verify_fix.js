const assert = require('node:assert/strict');
const { api, assertInbox, localCheck } = require('./helpers/account-browser.cjs');

localCheck('inbox, spam, snoozed and mailbox loading', async (page, base, phase) => {
  const failures = [];
  page.on('response', res => {
    const url = new URL(res.url());
    if (url.origin === base && url.pathname.startsWith('/api/') && res.status() >= 400) {
      failures.push(res.status());
    }
  });
  phase('reload the authenticated mailbox');
  await page.reload();
  await assertInbox(page, base, 'admin@example.com');
  for (const folder of ['inbox', 'spam', 'snoozed']) {
    phase('list folder ' + folder);
    const result = await api(page, 'email/list?size=10&folder=' + folder);
    assert.ok(Array.isArray(result.list), 'folder contains a page of messages');
  }
  assert.deepEqual(failures, [], 'successful mailbox API responses');
});
