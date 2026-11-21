const { assertInbox, localCheck } = require('./helpers/account-browser.cjs');

localCheck('local owner signs in and reads the inbox', async (page, base, phase) => {
  phase('verify the authenticated owner and inbox');
  await assertInbox(page, base, 'admin@example.com');
});
