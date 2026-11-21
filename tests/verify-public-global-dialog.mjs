import assert from 'node:assert/strict';
import { withLocalMailBrowser } from './helpers/local-mail-browser.mjs';

await withLocalMailBrowser({ admin: true }, async (page, base) => {
  await page.goto(base + '/mail/u/0/#system-setting');
  for (const global of [true, false]) {
    const button = global ? /Compose & Send Global Broadcast Email|撰写并发送全域公告邮件/ : /System Welcome Email|全员系统欢迎邮件/;
    await page.getByTitle(button, { exact: true }).click();
    const dialog = page.locator(global ? '.global-email-dialog-canvas' : '.welcome-dialog-canvas:not(.global-email-dialog-canvas)');
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await dialog.locator('.welcome-lang-row').count(), 0);
    assert.ok(await dialog.locator('.welcome-recipients-row').isVisible());
    await dialog.locator('.write-subject-input input').fill('Disposable notice draft');
    await dialog.locator('.mode-switch-btn').last().click();
    await dialog.locator('.source-textarea-fullscreen textarea').fill('Local markdown body');
    assert.ok(await dialog.locator('.welcome-fullscreen-footer button').count() >= 1);
    await dialog.locator('.close-icon-btn').click();
    await dialog.waitFor({ state: 'hidden' });
  }
});
console.log('PASS: local broadcast and welcome dialogs, audience, subject, Markdown and close.');
