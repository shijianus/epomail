import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { legacyOrigin, legacyAdminEmail } from './helpers/legacy-target.mjs';
import { launchIsolatedChromium } from './helpers/legacy-browser.mjs';

async function mailApi(page, route, method = 'GET', body) {
  return page.evaluate(async ({ route, method, body }) => {
    const session = JSON.parse(sessionStorage.getItem('epomail_tab_identity'));
    const response = await fetch('/api/' + route, {
      method, redirect: 'error', headers: { token: session.token, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok || result.code !== 200) throw new Error('Local mail API failed: ' + route.split('?')[0] + ' (' + response.status + '/' + Number(result.code) + ')');
    return result.data;
  }, { route, method, body });
}

async function assertIcons(group, minimum) {
  await group.waitFor({ state: 'visible' });
  const shapes = await group.locator('svg:visible').evaluateAll(nodes => nodes.map(node => {
    const { width, height } = node.getBoundingClientRect();
    return { width, height, paths: node.querySelectorAll('path, rect, circle, polygon, polyline, line, ellipse').length };
  }));
  assert.ok(shapes.length >= minimum, 'expected at least ' + minimum + ' visible action icons, found ' + shapes.length);
  assert.ok(shapes.every(item => item.width > 0 && item.height > 0 && item.paths > 0), 'every visible action icon has vector geometry');
}

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
  const key = randomUUID(), subject = 'Icon validation ' + key;
  const accounts = await mailApi(page, 'account/list');
  const account = (accounts.list ?? accounts).find(row => row.email === legacyAdminEmail);
  assert.ok(account?.accountId, 'expected the signed-in mailbox');
  try {
    await mailApi(page, 'email/send', 'POST', { accountId: account.accountId, receiveEmail: [account.email],
      subject, content: '<p>Temporary local UI fixture</p>', text: 'Temporary local UI fixture', attachments: [], sendType: 0, idempotencyKey: key });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText(subject, { exact: true }).first().click();
    await assertIcons(page.locator('.header-actions:has(.header-actions-left)'), 10);
    const quick = page.locator('.thread-header-bar .thread-actions-bar').last();
    await assertIcons(quick, 5);
    for (const action of ['.btn-reply', '.btn-forward', '.btn-translate', '.btn-print', '.btn-msg-more']) {
      assert.ok(await quick.locator(action + ' svg').isVisible(), 'missing thread action: ' + action);
    }
    await quick.locator('.btn-msg-more').click();
    await page.getByRole('menu').filter({ visible: true }).last().waitFor();
  } finally {
    // Only clean up this run's two copies, even when a UI assertion fails.
    for (const type of [0, 1]) {
      const { list } = await mailApi(page, 'email/list?size=100&type=' + type);
      const ids = list.filter(row => row.subject === subject && Number.isInteger(row.emailId)).map(row => row.emailId);
      if (ids.length) await mailApi(page, 'email/delete?emailIds=' + ids.join(','), 'DELETE');
    }
  }
  console.log('阅读器工具栏和邮件快捷操作图标验证通过');
} finally {
  await browser.close();
}
