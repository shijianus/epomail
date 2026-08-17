import { chromium } from 'playwright';
import path from 'path';

(async () => {
    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2
    });
    
    const page = await context.newPage();

    // Set mock token and mock user data for settings
    await context.addInitScript(() => {
        window.localStorage.setItem('token', 'mock-token');
        window.localStorage.setItem('EPOMAIL_USER', JSON.stringify({
            account: 'shijianus',
            email: 'shijianus@epocanvas.com',
            nickname: '测试昵称',
            bio: '这是一段测试简介，支持**加粗文本**以及*斜体文本*，看看能否正确渲染？\n还有换行！',
            avatarUrl: '',
            backgroundUrl: '',
            showStats: true,
            showTrend: true,
            showSources: true
        }));
    });

    console.log('Navigating to profile-setting page...');
    await page.goto('http://localhost:3002/settings/profile', { waitUntil: 'networkidle' });

    console.log('Waiting for elements to load...');
    await page.waitForTimeout(2000); 

    const screenshotPath = path.resolve('profile_settings_validation.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    console.log(`Screenshot saved to ${screenshotPath}`);
    await browser.close();
})();
