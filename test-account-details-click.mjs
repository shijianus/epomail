import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('Page error:', err));
  page.on('console', msg => console.log('Browser console:', msg.text()));
  try {
    console.log("Navigating...");
    
    // Intercept all API requests to /api/ or similar
    await page.route('**/my/loginUserInfo', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                code: 200,
                data: {
                    account: 'shijianus',
                    name: 'Shi Jian',
                    email: 'shijianus@epomail.bond',
                    type: 1,
                    role: { name: 'Admin' },
                    quota: { usedStorageBytes: 1000, maxStorageMB: 1000 }
                },
                success: true
            })
        });
    });

    await page.route('**/public/profile/shijianus', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                code: 200,
                data: {
                    userInfo: {
                        account: 'shijianus',
                        email: 'shijianus@epomail.bond',
                        roleName: 'admin',
                        joinTime: '2024-01-01T00:00:00Z',
                        avatarInitials: 'SH'
                    },
                    stats: {
                        todaySent: 15,
                        todayReceived: 20,
                        interceptRate: '80.0%'
                    },
                    trend: [
                        { date: '2024-08-10', label: '08-10', sendPercent: 10, receivePercent: 40, interceptPercent: 50 },
                        { date: '2024-08-16', label: '今日', sendPercent: 20, receivePercent: 30, interceptPercent: 50 }
                    ],
                    sources: {
                        total: 100,
                        top: [{ domain: 'github.com', percent: 60 }],
                        otherPercent: 40
                    }
                },
                success: true
            })
        });
    });

    await page.goto('http://localhost:3002');
    console.log("Setting mock data...");
    await page.evaluate(() => {
        localStorage.setItem('token', 'fake-token-for-test');
        localStorage.setItem('EPOMAIL_USER', JSON.stringify({
            jwtToken: 'fake-token-for-test',
            account: 'shijianus',
            name: 'Shi Jian',
            email: 'shijianus@epomail.bond',
            role: { name: 'Admin' },
            quota: { usedStorageBytes: 1000, maxStorageMB: 1000 }
        }));
    });
    
    console.log("Reloading...");
    await page.goto('http://localhost:3002');
    await page.waitForTimeout(3000); // wait for load
    
    console.log("Clicking avatar...");
    await page.screenshot({ path: 'before-click.png', fullPage: true });
    const avatar = await page.locator('.avatar-wrap').first();
    await avatar.click();
    await page.waitForTimeout(1000);
    
    console.log("Clicking account details...");
    // The text is {{ $t('accountDetails') || 'Account Details' }}, which might be '账户详情'
    const accountDetailsBtn = await page.locator('.am-item').filter({ hasText: /Account Details|账户详情/ }).first();
    await accountDetailsBtn.click();
    
    console.log("Waiting for route change...");
    await page.waitForTimeout(3000);
    
    console.log("URL is:", page.url());
    await page.screenshot({ path: 'ui-validation-profile-from-click.png', fullPage: true });
    console.log("Screenshot saved!");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
  }
})();
