import { chromium } from 'playwright';
import path from 'path';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    
    // Mock Profile API
    await context.route('**/api/public/profile/*', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: {} }) });
    });

    // Mock UserInfo API
    await context.route('**/api/my/userInfo', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                code: 200,
                data: { accountId: 1, name: 'Admin', email: 'admin@epocanvas.com', role: { name: 'admin', accountCount: 1, sendCount: 100 }, quota: { usedStorageBytes: 1000, maxStorageMB: 1024, maxStorageBytes: 1073741824 } }
            })
        });
    });

    // Mock email list API
    await context.route('**/api/my/emailList*', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: { records: [], total: 0 } }) });
    });
    
    // Mock stats
    await context.route('**/api/my/labelStats', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: {} }) });
    });

    const page = await context.newPage();

    await context.addInitScript(() => {
        window.localStorage.setItem('token', 'mock-token');
        window.localStorage.setItem('EPOMAIL_USER', JSON.stringify({
            jwtToken: 'mock-token', account: { accountId: 1 }, name: 'Admin', email: 'admin@epocanvas.com', role: { name: 'admin' }
        }));
    });

    console.log("Going straight to /inbox?composeTo=shijianus@epocanvas.com");
    await page.goto('http://localhost:3002/inbox?composeTo=shijianus@epocanvas.com', { waitUntil: 'networkidle' });
    
    await page.waitForTimeout(3000); 

    const screenshotPath = path.resolve('ui-validation-contact-redirect.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    console.log(`Screenshot saved to ${screenshotPath}`);
    await browser.close();
})();
