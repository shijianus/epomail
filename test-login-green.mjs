import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'zh-CN'
  });
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
          message: 'success',
          data: {
            token: 'fake-jwt-token-12345',
            redirect: '/mail'
          }
        })
      });
    });

    await page.goto('http://127.0.0.1:5177/login/', { waitUntil: 'domcontentloaded' });
    
    await page.locator('#epo-email').fill('test@epomail.bond');
    await page.locator('#epo-password').fill('password123');
    await page.getByRole('button', { name: /Initiate Login/i }).click();
    
    // Wait for the "Connected" success state to appear in the button
    await page.waitForSelector('text=Connected', { timeout: 5000 });
    
    // Wait for the success toast to appear and animate
    await page.waitForSelector('text=成功连结节点', { timeout: 5000 });
    await page.waitForTimeout(1000); // Wait for spring animation to settle
    
    console.log('Taking screenshot of green success HUD with toast...');
    await page.screenshot({ path: 'login_success_toast.png' });
    
    console.log('SUCCESS: Captured login_success_toast.png');
    process.exit(0);
  } catch (error) {
    console.error('Error occurred:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
