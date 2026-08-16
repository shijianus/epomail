import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER_ERROR:', error.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  
  // Go to empty page first to set localStorage
  await page.goto('http://localhost:3002/', { waitUntil: 'commit' });
  await page.evaluate(() => {
    localStorage.setItem('token', 'fake-token');
    localStorage.setItem('user', JSON.stringify({
      email: 'admin@epomail.bond',
      name: 'Admin',
      role: { name: 'admin' },
      account: { accountId: 'test-id', email: 'admin@epomail.bond' }
    }));
  });
  
  // Reload page to apply token
  console.log('Navigating to localhost:3002...');
  await page.goto('http://localhost:3002/', { waitUntil: 'networkidle' });
  
  await page.waitForTimeout(3000);
  
  await browser.close();
})();
