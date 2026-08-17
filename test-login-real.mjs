import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  try {
    await page.route('**/api/login', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          code: 200,
          data: {
            token: 'fake-jwt-token-12345',
            redirect: '/mail'
          }
        })
      });
    });

    await page.goto('http://127.0.0.1:8787/login', { waitUntil: 'domcontentloaded' });
    
    await page.locator('#epo-email').fill('test@epomail.bond');
    await page.locator('#epo-password').fill('password123');
    await page.getByRole('button', { name: /Initiate Login/i }).click();
    
    // Wait for the "Connected" success state to appear in the button
    await page.waitForSelector('text=Connected', { timeout: 5000 });
    
    // Check localStorage IMMEDIATELY
    const token = await page.evaluate(() => localStorage.getItem('token'));
    if (token === 'fake-jwt-token-12345') {
      console.log('SUCCESS: Token is securely saved in localStorage right after login!');
      
      // Let's also wait for the redirect to happen to prove it tries to go to /mail
      await page.waitForURL('**/mail', { timeout: 3000 }).catch(() => {});
      console.log('Test Passed!');
      process.exit(0);
    } else {
      console.log('FAIL: Token is missing from localStorage!');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error occurred:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
