import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()));
  page.on('pageerror', error => {
      console.log('BROWSER_ERROR_MSG:', error.message);
      console.log('BROWSER_ERROR_STACK:', error.stack);
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  
  // Go to live site
  console.log('Navigating to live site...');
  await page.goto('https://mail.epocanvas.com/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  await page.screenshot({ path: 'screenshot-live-error.png' });
  console.log('Screenshot saved to screenshot-live-error.png');
  await browser.close();
})();
