const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  console.log('Navigating to login page...');
  await page.goto('https://epomail.epocanvas.workers.dev', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // Take screenshot of login page
  await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/screenshot_login.png', fullPage: false });
  console.log('Login page screenshot saved to /home/shijian/projects/epocanvas-mail/screenshot_login.png');
  console.log('Current URL:', page.url());
  console.log('Page title:', await page.title());

  // Check if we need to login - look for email input
  const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="邮"], input[placeholder*="mail"], input[placeholder*="Email"]');
  console.log('Email input found:', !!emailInput);
  
  if (emailInput) {
    console.log('Filling in credentials...');
    await emailInput.fill('admin@epomail.bond');
    
    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) {
      await passwordInput.fill('Epomail@2024');
      
      const submitBtn = await page.$('button[type="submit"], button:has-text("登"), button:has-text("Login"), button:has-text("Sign")');
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await passwordInput.press('Enter');
      }
    }
    
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/screenshot_after_login.png', fullPage: false });
    console.log('After login screenshot saved');
    console.log('Current URL after login:', page.url());
  }

  // Navigate to label settings
  console.log('Navigating to label settings...');
  await page.goto('https://epomail.epocanvas.workers.dev/#/label-setting', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  
  console.log('URL on label setting page:', page.url());
  
  // Full page screenshot
  await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/screenshot_label_full.png', fullPage: true });
  console.log('Full page screenshot saved');
  
  // Scroll to bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/screenshot_label_bottom.png', fullPage: false });
  console.log('Bottom screenshot saved');

  // Get visible text
  const text = await page.evaluate(() => document.body.innerText);
  console.log('Page text (first 2000 chars):', text.substring(0, 2000));

  await browser.close();
  console.log('Done!');
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
