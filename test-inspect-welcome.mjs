import { chromium } from 'playwright';

async function testWelcomeModal() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/setting/websiteConfig')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: { title: 'Epocanvas Mail', domainList: ['epomail.bond'], register: 1 } })
      });
    }
    if (url.includes('/api/setting')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: {
            siteTitle: 'Epocanvas Mail',
            siteNotice: '欢迎使用',
            welcomeSubject: '✨ 欢迎使用 Epocanvas Mail',
            welcomeContent: '<h2>欢迎使用</h2><p>测试欢迎邮件正文内容</p>',
            welcomeExpireDays: 7,
            welcomeAutoSend: 1,
            welcomeLastBroadcast: '2026-08-25T12:00:00.000Z',
            forwardStatus: 0,
            regKey: 0,
            register: 1,
            registerVerify: 0
          }
        })
      });
    }
    if (url.includes('/api/my/loginUserInfo')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: {
            userId: 1,
            email: 'admin@epomail.bond',
            name: 'Admin',
            role: 'ADMIN',
            permKeys: ['setting:query', 'setting:edit', '*:*:*'],
            account: { accountId: 1, email: 'admin@epomail.bond', name: 'Admin' }
          }
        })
      });
    }
    if (url.includes('/api/account/list')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: [{ accountId: 1, email: 'admin@epomail.bond', name: 'Admin' }] })
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: [] }) });
  });

  await page.addInitScript(() => {
    localStorage.setItem('token', 'mock-admin-token');
    localStorage.setItem('setting', JSON.stringify({ lang: 'zh', dark: 0 }));
  });

  console.log('Navigating to http://localhost:4173/inbox...');
  await page.goto('http://localhost:4173/inbox');
  await page.waitForTimeout(1500);

  console.log('Navigating to http://localhost:4173/system-setting...');
  await page.goto('http://localhost:4173/system-setting');
  await page.waitForTimeout(1500);

  await page.screenshot({ path: 'sys-setting-page.png' });

  const html = await page.content();
  console.log('Page URL:', page.url());
  console.log('Contains 系统设置:', html.includes('系统设置') || html.includes('网站公告'));

  const welcomeSettingItem = page.locator('.setting-item:has-text("欢迎邮件")');
  console.log('Welcome setting item count:', await welcomeSettingItem.count());
  if (await welcomeSettingItem.count() > 0) {
    const btn = welcomeSettingItem.locator('.opt-button');
    await btn.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'welcome-modal-open.png' });
    console.log('Saved welcome-modal-open.png');

    const diagnostics = await page.evaluate(() => {
      const dialog = document.querySelector('.welcome-write-dialog');
      const overlay = document.querySelector('.el-overlay-dialog');
      const body = document.querySelector('.welcome-write-dialog .el-dialog__body');
      const html = document.documentElement;
      return {
        windowInnerHeight: window.innerHeight,
        windowInnerWidth: window.innerWidth,
        dialogBoundingRect: dialog ? dialog.getBoundingClientRect() : null,
        dialogScrollHeight: dialog ? dialog.scrollHeight : 0,
        dialogClientHeight: dialog ? dialog.clientHeight : 0,
        dialogHasVerticalScroll: dialog ? dialog.scrollHeight > dialog.clientHeight : false,
        overlayScrollHeight: overlay ? overlay.scrollHeight : 0,
        overlayClientHeight: overlay ? overlay.clientHeight : 0,
        overlayHasVerticalScroll: overlay ? overlay.scrollHeight > overlay.clientHeight : false,
        bodyScrollHeight: body ? body.scrollHeight : 0,
        bodyClientHeight: body ? body.clientHeight : 0,
        bodyHasVerticalScroll: body ? body.scrollHeight > body.clientHeight : false
      };
    });
    console.log('Diagnostics:', JSON.stringify(diagnostics, null, 2));

    // Also test preview mode
    const previewBtn = page.locator('.capsule-btn:has-text("收件箱预览")');
    if (await previewBtn.count() > 0) {
      await previewBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: 'welcome-modal-preview.png' });
      console.log('Saved welcome-modal-preview.png');
    }
  }

  await browser.close();
}

testWelcomeModal().catch(console.error);
