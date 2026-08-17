import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('http://localhost:3002', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
        localStorage.setItem('EPOMAIL_USER', JSON.stringify({
            jwtToken: 'fake-token',
            account: 'admin'
        }));
    });
    await page.goto('http://localhost:3002', { waitUntil: 'networkidle' });
    await page.waitForSelector('.aside-container', { state: 'attached', timeout: 5000 });
    
    // Screenshot expanded
    await page.screenshot({ path: 'sidebar-expanded.png' });
    
    // Collapse sidebar
    await page.evaluate(() => {
       document.querySelector('.aside-container').classList.add('collapsed');
    });
    await page.waitForTimeout(1000);
    
    // Screenshot collapsed
    await page.screenshot({ path: 'sidebar-collapsed.png' });
    console.log("Screenshots done");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await browser.close();
  }
})();
