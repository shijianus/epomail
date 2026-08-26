import { chromium } from 'playwright';

(async () => {
  console.log('=== Starting E2E UI Test on Cloudflare Deployment ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const BASE = 'https://epomail.epocanvas.workers.dev';

  try {
    // Step 1: Login
    console.log('Logging into https://epomail.epocanvas.workers.dev ...');
    const loginRes = await page.request.post(BASE + '/api/login', {
      data: { email: 'admin@epomail.bond', password: '123456' },
      headers: { 'Content-Type': 'application/json' }
    });
    const loginData = await loginRes.json();
    if (loginData.code !== 200) {
      throw new Error('Login failed: ' + JSON.stringify(loginData));
    }
    const token = loginData.data?.token;
    console.log('Login success, token acquired.');

    // Step 2: Navigate to app and inject token
    await page.goto(BASE + '/inbox', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('token', t), token);
    await page.goto(BASE + '/inbox', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Open settings via router
    console.log('Navigating to settings -> sys-setting...');
    await page.evaluate(() => {
      // In Vue 3, router or history push
      window.location.hash = '';
      window.history.pushState({}, '', '/settings/profile');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.goto(BASE + '/settings/profile', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Click on System Settings tab
    console.log('Clicking on System Settings tab...');
    const sysSettingLink = page.locator('.settings-nav-item').filter({ hasText: /系统设置|System Settings/i });
    if (await sysSettingLink.count() > 0) {
      await sysSettingLink.first().click();
      await page.waitForTimeout(2000);
    }

    console.log('Taking screenshot of sys-setting page...');
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/cf_sys_setting.png' });

    // Step 3: Find and click the welcome email button
    console.log('Opening Welcome Email Dialog...');
    // Look for button inside notice / welcome card
    const welcomeCard = page.locator('.settings-card').filter({ hasText: /网站公告|公告|Notice|全员系统欢迎邮件|欢迎邮件/i });
    console.log('Found welcome card count:', await welcomeCard.count());
    const quillBtn = welcomeCard.locator('.opt-button').last();
    await quillBtn.click();
    await page.waitForTimeout(2500);

    // Step 4: Take screenshot of Compose Mode
    console.log('Taking screenshot of Compose Mode dialog...');
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/cf_welcome_compose_mode.png' });

    // Step 5: Switch to Inbox Preview Mode
    console.log('Switching to Inbox Preview Mode...');
    await page.locator('.capsule-btn').filter({ hasText: /预览|Preview/i }).click();
    await page.waitForTimeout(1500);

    console.log('Taking screenshot of Inbox Preview Mode (Light)...');
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/cf_welcome_preview_light.png' });

    // Step 6: Toggle to Dark Theme Preview
    console.log('Toggling to Dark Preview...');
    const themeBtn = page.locator('.tool-icon-btn.theme-toggle');
    if (await themeBtn.count() > 0) {
      await themeBtn.click();
      await page.waitForTimeout(1000);
      console.log('Taking screenshot of Inbox Preview Mode (Dark)...');
      await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/cf_welcome_preview_dark.png' });
    }

    // Step 7: Switch back to Compose Mode and test clicking Broadcast to see Confirmation modal
    console.log('Switching back to Compose mode and clicking Broadcast...');
    await page.locator('.capsule-btn').filter({ hasText: /写信|Compose/i }).click();
    await page.waitForTimeout(1000);
    await page.locator('.btn-broadcast-primary').click();
    await page.waitForTimeout(1000);

    console.log('Taking screenshot of High Risk Confirmation Modal...');
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/cf_welcome_confirm_modal.png' });

    // Step 8: Cancel confirmation
    await page.locator('.el-message-box__btns button').first().click();
    await page.waitForTimeout(500);

    console.log('✅ All E2E checks and screenshots completed successfully!');
  } catch (err) {
    console.error('Error during CF e2e test:', err);
  } finally {
    await browser.close();
  }
})();
