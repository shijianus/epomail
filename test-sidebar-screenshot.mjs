import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    // Intercept API requests
    await page.route('**/api/email/sidebarStats', async route => {
      const json = {
        code: 200,
        data: {
          inboxUnread: 12,
          draftUnread: 2,
          sentUnread: 0,
          spamUnread: 17,
          spamRead: 5,
          trashUnread: 8,
          trashRead: 0,
          snoozedUrgent: 1,
          snoozedWaiting: 3,
          allUnread: 5,
          labelStats: {
             '推销': { unread: 0, read: 5 },
             'Tag1': { unread: 2, read: 0 }
          }
        }
      };
      await route.fulfill({ json });
    });

    await page.route('**/api/my/loginUserInfo', async route => {
      await route.fulfill({ json: { code: 200, data: { account: { accountId: 1 }, sendAction: { hasPerm: true }, permKeys: ['*'], labels: '["推销", "Tag1"]' } } });
    });

    await page.route('**/api/setting/websiteConfig', async route => {
      await route.fulfill({ json: { code: 200, data: {} } });
    });
    await page.route('**/api/setting/query', async route => {
      await route.fulfill({ json: { code: 200, data: {} } });
    });

    await page.route('**/api/email/list*', async route => {
      await route.fulfill({ json: { code: 200, data: { list: [], total: 0 } } });
    });

    await page.route('**/api/email/latest*', async route => {
      await route.fulfill({ json: { code: 200, data: [] } });
    });
    await page.route('**/api/my/setting', async route => {
      await route.fulfill({ json: { code: 200, data: {} } });
    });
    await page.route('**/api/account/list', async route => {
      await route.fulfill({ json: { code: 200, data: [] } });
    });

    // Mock other requests
    await page.route('**/*', async route => {
       route.continue();
    });

    await page.goto('http://localhost:3002/#/login', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
        localStorage.setItem('token', 'fake-token');
    });
    
    await page.goto('http://localhost:3002/#/', { waitUntil: 'networkidle' });
    
    try {
        await page.waitForSelector('.aside-container', { state: 'attached', timeout: 5000 });
        await page.waitForTimeout(1500); 
        await page.screenshot({ path: 'sidebar-expanded.png' });
        
        await page.evaluate(() => {
           document.querySelector('.aside-container').classList.add('collapsed');
        });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'sidebar-collapsed.png' });
        console.log("Screenshots saved");
    } catch(err) {
        console.log("Timed out waiting for .aside-container. Taking debug screenshot.");
        await page.screenshot({ path: 'sidebar-debug.png' });
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
  }
})();
