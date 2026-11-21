import assert from 'node:assert/strict';
import { withLocalMailBrowser } from './helpers/local-mail-browser.mjs';

await withLocalMailBrowser({ admin: true }, async (page, base) => {
  await page.goto(base + '/mail/u/0/#system-setting');
  const mode = page.locator('.mail-mode-select');
  const factor = page.locator('.setting-item').filter({ hasText: '2FA/TOTP' }).locator('.el-switch');
  const choose = async level => {
    await mode.click();
    await page.locator('.mail-mode-popper:visible .el-select-dropdown__item').filter({ hasText: 'Level ' + level }).click();
  };
  const saved = () => page.waitForResponse(r => new URL(r.url()).pathname === '/api/setting/set' && r.request().method() === 'PUT')
    .then(async r => { assert.equal(r.status(), 200); assert.equal((await r.json()).code, 200); });
  await mode.waitFor({ state: 'visible' });
  await Promise.all([saved(), choose(1)]);
  assert.equal(await factor.locator('input').isDisabled(), false);
  await Promise.all([saved(), choose(2)]);
  assert.ok(await factor.locator('input').isDisabled());
  assert.ok(await factor.locator('input').isChecked());
  await choose(3);
  const warning = page.locator('.encrypted-mode-confirm-dialog');
  await warning.waitFor({ state: 'visible' });
  await Promise.all([saved(), warning.locator('.el-button--primary').click()]);
  assert.ok(await factor.locator('input').isDisabled());
  assert.ok(await factor.locator('input').isChecked());
  await Promise.all([saved(), choose(1)]);
  await factor.click();
  const confirm = page.locator('.disable-totp-confirm-dialog');
  await confirm.waitFor({ state: 'visible' });
  await Promise.all([saved(), confirm.locator('.el-button--primary').click()]);
  // The global operation revokes sessions; website configuration is public.
  const config = await page.evaluate(async () => (await (await fetch('/api/setting/websiteConfig')).json()).data);
  assert.equal(Number(config.allMailMode), 1);
  assert.equal(Number(config.totp), 0);
});
console.log('PASS: isolated mail modes enforce MFA, and disabling it requires confirmation.');
