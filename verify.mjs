import { chromium } from 'playwright';

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const url = 'http://localhost:3002/analysis';
  console.log(`Navigating to ${url}...`);

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[BROWSER ERROR] ${msg.text()}`);
    } else {
      console.log(`[BROWSER CONSOLE] ${msg.text()}`);
    }
  });

  page.on('pageerror', exception => {
    console.log(`[BROWSER UNCAUGHT EXCEPTION] ${exception}`);
  });

  // Mock any backend API call to avoid 401
  await page.route('**/*', async route => {
    const reqUrl = route.request().url();
    if (reqUrl.includes('/api/my/loginUserInfo')) {
      console.log(`[MOCK] Intercepted user info`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: {
            account: { accountId: 'test-account', address: 'test@epomail.com' },
            permKeys: ['*'],
            email: 'test@epomail.com',
            name: 'Test User',
            role: { name: 'Admin', accountCount: 1, sendType: 'count', sendCount: 100 },
            type: 0,
            sendCount: 50,
            quota: { usedStorageBytes: 100, maxStorageBytes: 1000, maxStorageMB: 1, usedEmails: 10, maxEmails: 100, dbFull: false }
          }
        })
      });
    } else if (reqUrl.includes('/api/setting/websiteConfig')) {
      console.log(`[MOCK] Intercepted website config`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: {
            title: 'Mock Title',
            domainList: []
          }
        })
      });
    } else if (reqUrl.includes('/analysis/echarts')) {
      console.log(`[MOCK] Intercepted /analysis/echarts`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: {
            numberCount: {
              receiveTotal: 1500,
              sendTotal: 300,
              userTotal: 50,
              normalReceiveTotal: 1200,
              normalSendTotal: 280,
              normalUserTotal: 45,
              delReceiveTotal: 50,
              delSendTotal: 10,
              delUserTotal: 2,
              interceptReceiveTotal: 250
            },
            receiveRatio: {
              nameRatio: [
                { name: 'github.com', total: 500, isSpam: 0 },
                { name: 'spam.com', total: 250, isSpam: 1 }
              ]
            },
            emailDayCount: {
              receiveDayCount: [
                { date: '2026-08-10', total: 200 },
                { date: '2026-08-11', total: 250 }
              ],
              sendDayCount: [
                { date: '2026-08-10', total: 40 },
                { date: '2026-08-11', total: 50 }
              ],
              interceptDayCount: [
                { date: '2026-08-10', total: 30 },
                { date: '2026-08-11', total: 40 }
              ]
            },
            userDayCount: [
              { date: '2026-08-10', total: 5 },
              { date: '2026-08-11', total: 8 }
            ],
            daySendTotal: 100
          }
        })
      });
    } else if (reqUrl.includes('/api/') || reqUrl.includes('/email/')) {
       console.log(`[MOCK] Intercepted generic api: ${reqUrl}`);
       await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: {}
        })
      });
    } else {
      route.continue();
    }
  });

  // Inject token
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'fake-token-for-testing');
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  await page.waitForTimeout(4000);

  console.log('Capturing screenshot...');
  const screenshotPath = '/home/shijian/projects/epocanvas-mail/analysis_validation_local.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(`Screenshot saved to ${screenshotPath}`);

  await browser.close();
  console.log('Done!');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
