const assert = require('node:assert/strict');
const { api, localCheck } = require('./helpers/account-browser.cjs');

localCheck('loading screen clears for revoked and missing credentials', async (page, base, phase) => {
  async function expectLogin() {
    await page.waitForURL(url => url.origin === base && url.pathname === '/login/');
    await page.locator('input[type="email"]').waitFor();
    await page.locator('#loading-first').waitFor({ state: 'hidden' });
  }
  phase('revoke a real session and reopen the protected route');
  await api(page, 'logout', 'DELETE');
  const denied = page.waitForResponse(r => new URL(r.url()).pathname.startsWith('/api/') && r.status() === 401);
  await Promise.all([denied, page.reload({ waitUntil: 'domcontentloaded' })]);
  await expectLogin();
  phase('open the protected route with empty browser storage');
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await page.goto(base + '/mail/u/0/#inbox', { waitUntil: 'domcontentloaded' });
  await expectLogin();
  assert.ok(await page.locator('input[type="password"]').isVisible());
});
