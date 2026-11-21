import assert from 'node:assert/strict';
import { runWorkerSpecs, withLoginBrowser } from './helpers/local-login-browser.mjs';

runWorkerSpecs(['test/auth-convergence.spec.js', 'test/totp-backend-fixes.spec.js']);
await withLoginBrowser(async ({ origin, pageFor }) => {
  for (const viewport of [{ width: 1280, height: 850 }, { width: 390, height: 844 }]) {
    const boxes = [];
    for (const mode of ['login', 'totp', 'select']) {
      const page = await pageFor({ oauthLoginEnabled: 0 }, viewport);
      try {
        const hash = 'localChallenge';
        const route = mode === 'login' ? '/login/' : '/login/challenge/' + mode + '_' + hash;
        if (mode !== 'login') await page.addInitScript(value => {
          sessionStorage.setItem('epo_2fa_challenge_session', JSON.stringify({
            sessionHash: value, tempToken: 'local-challenge', email: 'member@example.test',
            hasTotp: true, hasBackupCodes: true, createdAt: Date.now()
          }));
        }, hash);
        await page.goto(origin + route);
        const card = page.locator('div.relative.overflow-hidden.rounded-3xl').first();
        await card.waitFor();
        if (mode === 'login') await page.locator('input[type=password]').first().waitFor();
        if (mode === 'totp') await page.locator('input[autocomplete=one-time-code]').first().waitFor();
        if (mode === 'select') await card.getByText(/Choose how to verify|选择两步验证方式|選擇兩步驗證方式/).waitFor();
        assert.equal(new URL(page.url()).pathname, route);
        const box = await card.boundingBox();
        assert.ok(box && box.x >= -1 && box.x + box.width <= viewport.width + 1 && box.height > 0);
        boxes.push(box);
        console.log(`PASS local ${mode} card and route at ${viewport.width}px`);
      } finally { await page.context().close(); }
    }
    for (const box of boxes) assert.ok(Math.abs(box.width - boxes[0].width) <= 2);
  }
});
