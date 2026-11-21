import assert from 'node:assert/strict';
import { withLoginBrowser } from './helpers/local-login-browser.mjs';

const providers = { google: 'Google', github: 'GitHub', microsoft: 'Microsoft', apple: 'Apple', custom: 'Local SSO' };
await withLoginBrowser(async ({ origin, pageFor }) => {
  for (const [enabled, count] of [[1, 1], [1, 2], [1, 3], [1, 5], [0, 5]]) {
    const rows = Object.entries(providers);
    const config = Object.fromEntries(rows.map(([id, name], i) => [id, { enabled: i < count, configured: i % 2 === 0 ? 1 : 0, name }]));
    const page = await pageFor({ oauthLoginEnabled: enabled, oauthProviders: config });
    try {
      const loaded = page.waitForResponse(res => new URL(res.url()).pathname === '/api/setting/websiteConfig');
      await page.goto(origin + '/login/');
      await loaded;
      await page.locator('input[type=password]').first().waitFor();
      if (enabled) await page.getByRole('button', { name: /Google/i }).waitFor();
      for (const [index, [, name]] of rows.entries()) {
        const button = page.getByRole('button', { name: new RegExp(name, 'i') });
        if (!enabled || index >= count) assert.equal(await button.count(), 0, name);
        else {
          await button.waitFor();
          assert.equal(await button.isDisabled(), index % 2 === 1, name);
        }
      }
      console.log(`PASS provider visibility (master=${enabled}, configured rows=${count})`);
    } finally { await page.context().close(); }
  }
});
