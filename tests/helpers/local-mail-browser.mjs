import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { launchForLoopbackOrigin } from './isolated-chromium.mjs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { bootstrap } from '../backend-stress.mjs';
import { localEnvironment, withLocalStack } from './local-stack.mjs';

export async function withLocalMailBrowser({ admin = false, enablePatIssuance = false } = {}, check) {
  await withLocalStack(async stack => {
    let email, password;
    if (admin) {
      const response = await fetch(stack.base + '/api/init', {
        method: 'POST', headers: { 'x-init-secret': stack.jwtSecret }, redirect: 'error'
      });
      assert.equal(response.status, 200, 'isolated database initialization');
      email = 'admin@example.com';
      password = (await response.text()).match(/Initial admin password:\s*(\S+)/)?.[1];
      assert.ok(password, 'one-time local password');
    } else {
      const fixture = await bootstrap(stack);
      ({ syntheticEmail: email, password } = fixture);
    }
    const home = join(stack.tempDir, 'browser-home');
    await mkdir(home, { mode: 0o700 });
    const browser = await launchForLoopbackOrigin(chromium, stack.base, {
      env: localEnvironment(home),
      headless: true, executablePath: process.env.EPOMAIL_CHROMIUM_PATH || process.env.CHROMIUM_EXECUTABLE_PATH || undefined
    });
    stack.addCleanup(() => browser.close());
    const context = await browser.newContext({ locale: 'en-US', serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === stack.base ? route.continue() : route.abort());
    await context.routeWebSocket('**/*', route => route.close());
    const page = await context.newPage();
    let pageErrors = 0;
    page.on('pageerror', () => pageErrors++);
    await page.goto(stack.base + '/login/', { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"]').fill(email);
    try {
      await page.locator('input[type="password"]').fill(password);
    } catch {
      throw new Error('Unable to fill the local password field');
    }
    await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === '/api/email/list' && r.status() === 200),
      page.locator('button[type="submit"]').click()
    ]);
    await page.waitForURL(/\/mail\/u\/0\/#inbox/);
    await check(page, stack.base);
    assert.equal(pageErrors, 0, 'browser page errors');
  }, { enablePatIssuance });
}
