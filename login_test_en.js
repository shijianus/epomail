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
    await page.getByText(/Sign up/i).first().click();
    await page.waitForTimeout(1000);
    
    console.log('Filling in registration details...');
    const inputs = await page.locator('input').all();
    if (inputs.length >= 2) {
      await inputs[0].fill('admin'); // The UI has @epomail.bond suffix usually
      await inputs[1].fill('Password123!');
      if (inputs.length >= 3) {
        await inputs[2].fill('Password123!');
      }
    }
    
    console.log('Submitting registration form...');
    await page.getByRole('button', { name: /Sign up/i }).click();
    await page.waitForTimeout(3000);
    
    console.log('Now logging in with the new account...');
    try {
      await page.getByText(/Sign in/i).first().click();
      await page.waitForTimeout(1000);
    } catch(e) {}
    
    const loginInputs = await page.locator('input').all();
    if (loginInputs.length >= 2) {
      await loginInputs[0].fill('admin');
      await loginInputs[1].fill('Password123!');
    }
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForTimeout(3000);
    
    const bodyText = await page.innerText('body');
    if (bodyText.includes('Sign out') || bodyText.includes('Inbox') || bodyText.includes('admin@epomail.bond') || bodyText.includes('New Email') || bodyText.includes('Settings')) {
      console.log('Success! We are logged into the mailbox.');
    } else {
      console.log('Could not find logged-in indicators. Logging page text for debug:');
      console.log(bodyText.substring(0, 500));
      await page.screenshot({ path: 'debug_login.png' });
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
