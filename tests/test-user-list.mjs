import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { legacyOrigin, legacyAdminEmail } from './helpers/legacy-target.mjs';
import { launchIsolatedChromium } from './helpers/legacy-browser.mjs';

const browser = await launchIsolatedChromium(chromium, { headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(legacyOrigin + '/login/', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(legacyAdminEmail);
  try { await page.locator('input[type="password"]').fill(process.env.EPOMAIL_E2E_ADMIN_PASSWORD || ''); }
  catch { throw new Error('Cannot fill the isolated login form'); }
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/mail\/u\/\d+\/#inbox/);

  await page.goto(legacyOrigin + '/mail/u/0/#settings/profile', { waitUntil: 'domcontentloaded' });
  const link = page.locator('.settings-nav-item[href$="/users"]');
  const [response] = await Promise.all([
    page.waitForResponse(r => new URL(r.url()).pathname === '/api/user/list'),
    link.click()
  ]);
  assert.equal(response.status(), 200, 'user-list HTTP status');
  const envelope = await response.json();
  assert.equal(envelope.code, 200, 'user-list response code');
  const { list, total } = envelope.data;
  assert.ok(Array.isArray(list) && list.length > 0 && total >= list.length, 'user-list page shape');
  assert.ok(list.some(row => row.email === legacyAdminEmail), 'expected isolated administrator in API results');
  for (const row of list) {
    assert.ok(Number.isInteger(row.userId) && typeof row.email === 'string', 'user-list row identity fields');
  }
  const table = page.locator('.user-box .el-table__body-wrapper');
  await table.getByText(legacyAdminEmail, { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await table.locator('tr.el-table__row').count(), list.length, 'rendered rows match the API page');
  assert.equal(await page.locator('.el-message--error').count(), 0, 'UI error banners');
  console.log('用户列表接口、导航和表格验证通过');
} finally {
  await browser.close();
}
