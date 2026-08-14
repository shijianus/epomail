import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.setViewportSize({ width: 1440, height: 900 });
  
  // Go to empty page first to set localStorage
  await page.goto('http://localhost:3002/', { waitUntil: 'commit' });
  await page.evaluate(() => {
    localStorage.setItem('token', 'fake-token');
    localStorage.setItem('user', JSON.stringify({
      email: 'admin@epomail.bond',
      name: 'Admin',
      role: { name: 'admin' }
    }));
  });
  
  // Reload page to apply token
  await page.goto('http://localhost:3002/', { waitUntil: 'networkidle' });
  
  // Wait for the app to load
  await page.waitForTimeout(2000);
  
  // Take a screenshot of the main page
  await page.screenshot({ path: 'screenshot-main.png' });
  
  // Click avatar
  const avatar = await page.locator('.avatar').first();
  if (await avatar.count() > 0) {
      await avatar.click();
      await page.waitForTimeout(500); // wait for dropdown to animate
      await page.screenshot({ path: 'screenshot-avatar-dropdown.png' });
  } else {
      console.log('Avatar not found!');
  }
  
  await browser.close();
})();
