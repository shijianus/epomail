const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('Navigating to https://epomail.epocanvas.workers.dev ...');
    await page.goto('https://epomail.epocanvas.workers.dev', { waitUntil: 'networkidle' });
    
    // Switch to register mode
    console.log('Waiting for login form to load...');
    await page.waitForTimeout(2000);
    
    console.log('Switching to Registration form...');
    // The registration button/link usually contains "注册" or something similar
    // Let's just click on any element that has text "注册" or similar.
    // E.g., a tab or link. Let's find it.
    await page.getByText(/注册/i).click();
    await page.waitForTimeout(1000);
    
    console.log('Filling in registration details...');
    // We expect inputs for Email, Password, maybe Password confirmation.
    // Let's use getByPlaceholder or generic selectors if we don't know the placeholders.
    // We can just query standard input types.
    const inputs = await page.locator('input').all();
    if (inputs.length >= 2) {
      await inputs[0].fill('admin@epomail.bond');
      await inputs[1].fill('Password123!');
      if (inputs.length >= 3) {
        await inputs[2].fill('Password123!');
      }
    }
    
    console.log('Submitting registration form...');
    await page.getByRole('button', { name: /注册/i }).click();
    await page.waitForTimeout(3000);
    
    console.log('Now logging in with the new account...');
    // Switch back to login form or maybe it automatically logged in or switched
    try {
      await page.getByText(/登录/i).first().click();
      await page.waitForTimeout(1000);
    } catch(e) {}
    
    const loginInputs = await page.locator('input').all();
    if (loginInputs.length >= 2) {
      await loginInputs[0].fill('admin@epomail.bond');
      await loginInputs[1].fill('Password123!');
    }
    await page.getByRole('button', { name: /登录/i }).click();
    await page.waitForTimeout(3000);
    
    const bodyText = await page.innerText('body');
    if (bodyText.includes('退出') || bodyText.includes('收件箱') || bodyText.includes('admin@epomail.bond')) {
      console.log('Success! We are logged into the mailbox.');
    } else {
      console.log('Could not find logged-in indicators. Logging page text for debug:');
      console.log(bodyText.substring(0, 500));
      process.exit(1);
    }

  } catch (error) {
    console.error('Error occurred:', error);
    await page.screenshot({ path: 'error_screenshot.png' });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
