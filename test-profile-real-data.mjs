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

    // Set mock token just in case
    await context.addInitScript(() => {
        window.localStorage.setItem('token', 'mock-token');
    });

    console.log('Navigating to profile page...');
    await page.goto('http://localhost:3002/shijianus', { waitUntil: 'networkidle' });

    console.log('Waiting for elements to load...');
    await page.waitForTimeout(2000); // Wait for animations and data fetching

    const screenshotPath = path.resolve('profile_real_data_validation.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    console.log(`Screenshot saved to ${screenshotPath}`);
    await browser.close();
})();
