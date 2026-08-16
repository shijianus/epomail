import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
    
    // We need to bypass login or at least just wait to see if the layout crashes.
    // If we mock localStorage:
    await page.evaluate(() => {
        localStorage.setItem('EPOMAIL_USER', JSON.stringify({
            jwtToken: 'fake-token',
            account: 'admin'
        }));
    });
    
    // reload with token
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
    
    // Wait for the app to load
    await page.waitForTimeout(2000);
    
    // Click category settings if available
    const settingButton = await page.locator('.setting-icon').first();
    if (await settingButton.isVisible()) {
        await settingButton.click();
        await page.waitForTimeout(1000); // wait for drawer
    }
    
    await page.screenshot({ path: 'ui-validation-settings.png', fullPage: true });
    console.log("Screenshot saved to ui-validation-settings.png");
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
  }
})();
