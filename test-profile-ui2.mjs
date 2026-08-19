import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err));
  try {
    await page.goto('http://localhost:3002', { waitUntil: 'networkidle' });
    
    // Mock token so we don't get redirected
    await page.evaluate(() => {
        localStorage.setItem('token', 'fake-token-for-test');
        localStorage.setItem('EPOMAIL_USER', JSON.stringify({
            jwtToken: 'fake-token-for-test',
            account: 'admin'
        }));
    });
    
    // Go to profile route
    await page.goto('http://localhost:3002/shijianus', { waitUntil: 'networkidle' });
    
    // Wait for render
    await page.waitForTimeout(5000);
    
    await page.screenshot({ path: 'ui-validation-profile2.png', fullPage: true });
    console.log("Screenshot saved to ui-validation-profile2.png");
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
  }
})();
