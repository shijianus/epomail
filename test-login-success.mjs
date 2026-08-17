import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  try {
    console.log('Navigating to local login server...');

    // Intercept login
    await page.route('**/api/login', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: {
            token: 'fake-jwt-token-12345',
            redirect: '/mail'
          }
        })
      });
    });

    await page.goto('http://127.0.0.1:8787/login/', { waitUntil: 'networkidle' }).catch(() => {});
    
    await page.waitForTimeout(2000);
    
    if (await page.locator('#epo-email').count() === 0) {
      console.log('Form not found!');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error occurred:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
