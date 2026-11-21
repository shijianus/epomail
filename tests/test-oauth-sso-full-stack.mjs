// These suites run actual Worker endpoints against disposable local D1/KV and
// replace upstream identity-provider requests inside the Workers test pool.
import assert from 'node:assert/strict';
import { ENABLE_OAUTH_INTEGRATION } from '../mail-vue/src/const/feature-flags.js';
import { withLocalMailBrowser } from './helpers/local-mail-browser.mjs';
import { runWorkerSpecs, withLoginBrowser } from './helpers/local-login-browser.mjs';
await withLocalMailBrowser({ admin: true }, async (page, origin) => {
  await page.goto(origin + '/mail/u/0/#system-setting', { waitUntil: 'domcontentloaded' });
  await page.locator('.settings-card').first().waitFor();
  const card = page.locator('.oauth-sso-card');
  if (!ENABLE_OAUTH_INTEGRATION) {
    assert.equal(await card.count(), 0);
    assert.equal(await page.locator('.oauth-config-dialog:visible').count(), 0);
    console.log('PASS administrator settings hide OAuth controls while the compiled feature is disabled');
    return;
  }
  await card.waitFor();
  const rows = card.locator('.oauth-provider-row');
  assert.equal(await rows.count(), 5);
  for (const row of await rows.all()) assert.equal(await row.locator('.opt-button').count(), 1);
  await rows.first().locator('.opt-button').click();
  const dialog = page.locator('.oauth-config-dialog:visible').first();
  await dialog.waitFor();
  assert.ok((await dialog.innerText()).includes('/oauth/callback'));
  console.log('PASS local administrator OAuth settings, providers and configuration dialog');
});

runWorkerSpecs([
  'test/oauth-security.spec.js',
  'test/oauth-switch-enforcement.spec.js',
  'test/oauth-redirect-validation.spec.js',
  'test/oauth-bind-recovery.spec.js',
  'test/oauth-provider-error-sanitization.spec.js'
]);

await withLoginBrowser(async ({ origin, pageFor }) => {
  const state = 'local-client-state';
  let exchanges = 0;
  const page = await pageFor({ oauthLoginEnabled: 1 }, undefined, {
    '/api/oauth/exchange': route => {
      assert.equal(route.request().method(), 'POST');
      exchanges++;
      return route.fulfill({ json: { code: 200, data: { token: 'local-session', userInfo: { email: 'member@example.test' } } } });
    },
    '/api/user/info': route => route.fulfill({ json: { code: 200, data: { email: 'member@example.test' } } })
  });
  try {
    await page.addInitScript(value => sessionStorage.setItem('epo_oauth_state', value), state);
    await page.goto(origin + '/login/?oauth_code=local-code&oauth_client_state=' + state);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('epo_sessions') || '[]').some(row => row.token === 'local-session'));
    assert.equal(exchanges, 1);
    assert.equal(new URL(page.url()).searchParams.has('oauth_code'), false);
    console.log('PASS local OAuth callback, exchange and browser session');
  } finally { await page.context().close(); }
});
