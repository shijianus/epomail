const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('Navigating to https://epomail.epocanvas.workers.dev ...');
    await page.goto('https://epomail.epocanvas.workers.dev', { waitUntil: 'networkidle' });
    
    // Switch to login mode
    console.log('Waiting for login form to load...');
    await page.waitForTimeout(2000);
    
    console.log('Filling in login details...');
    const loginInputs = await page.locator('input').all();
    if (loginInputs.length >= 2) {
      await loginInputs[0].fill('admin'); // Only prefix is needed
      await loginInputs[1].fill('Password123!');
    }
    
    console.log('Submitting login form...');
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForTimeout(4000);
    
    console.log('Verifying successful login...');
    const bodyText = await page.innerText('body');
    if (bodyText.includes('Sign out') || bodyText.includes('Inbox') || bodyText.includes('admin@epomail.bond') || bodyText.includes('Settings')) {
      console.log('Success! We are logged into the mailbox and the environment variables are correctly loaded.');
      await page.screenshot({ path: 'success_dashboard.png' });
    } else {
      console.log('Could not find logged-in indicators. Logging page text for debug:');
      console.log(bodyText.substring(0, 500));
      process.exit(1);
    }

  } catch (error) {
    console.error('Error occurred:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
