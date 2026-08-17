import { chromium } from 'playwright';
import path from 'path';

(async () => {
    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2
    });
    
    await context.route('**/api/public/profile/*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                code: 200,
                data: {
                    userInfo: {
                        account: 'shijianus',
                        email: 'shijianus@epocanvas.com',
                        roleName: 'admin',
                        joinTime: new Date().toISOString(),
                        avatarInitials: 'SH',
                        nickname: 'Kevin',
                        bio: '这是一个测试简介，内容用于Playwright验证是否正确展示。',
                        avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=800&q=80',
                        backgroundUrl: 'https://images.unsplash.com/photo-1707343843437-caacff5cfa74?w=1600&q=80',
                        showStats: false, // Testing that stats row is hidden
                        showTrend: true,
                        showSources: true
                    },
                    stats: {
                        todaySent: 12,
                        todayReceived: 100,
                        interceptRate: '8.5%'
                    },
                    trend: [
                        { date: '2026-08-10', label: '08-10', receivePercent: 80, interceptPercent: 20 },
                        { date: '2026-08-16', label: '08-16', receivePercent: 90, interceptPercent: 10 }
                    ],
                    sources: {
                        total: 100,
                        top: [{ domain: 'gmail.com', percent: 60 }],
                        otherPercent: 40
                    }
                }
            })
        });
    });

    const page = await context.newPage();

    // Set mock token just in case
    await context.addInitScript(() => {
        window.localStorage.setItem('token', 'mock-token');
    });

    console.log('Navigating to profile page with mocked profile data...');
    await page.goto('http://localhost:3002/shijianus', { waitUntil: 'networkidle' });

    console.log('Waiting for elements to load...');
    await page.waitForTimeout(2000); // Wait for animations and data fetching

    const screenshotPath = path.resolve('profile_with_nickname_bg_validation.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    console.log(`Screenshot saved to ${screenshotPath}`);
    await browser.close();
})();
