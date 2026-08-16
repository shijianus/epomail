import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('Navigating to local login dev server...');
    await page.goto('http://127.0.0.1:8787/login', { waitUntil: 'domcontentloaded' });
    
    console.log('Waiting for login form to load...');
    await page.waitForTimeout(2000);
    
    console.log('Filling in incorrect login details...');
    await page.locator('#epo-email').fill('notexist@epomail.bond');
    await page.locator('#epo-password').fill('WrongPassword123!');
    
    console.log('Submitting login form...');
    await page.getByRole('button', { name: /Initiate Login/i }).click();
    
    // Wait for the alert text to appear
    console.log('Waiting for alert toast...');
    await page.waitForSelector('text=密码或账户错误', { timeout: 5000 }).catch(() => console.log('Did not find 密码或账户错误'));
    await page.waitForSelector('text=Invalid credentials', { timeout: 1000 }).catch(() => console.log('Did not find Invalid credentials'));
    
    await page.screenshot({ path: 'login_error_toast.png' });
    
    const pageText = await page.innerText('body');
    if (pageText.includes('Invalid credentials') || pageText.includes('密码或账户错误')) {
      console.log('Success! Error toast is visible with unified message.');
    } else {
      console.log('Toast not found? Logging body text:');
      console.log(pageText.substring(0, 500));
    }
    
    // Now trigger lockout (5 attempts total)
    console.log('Triggering lockout...');
    for (let i = 0; i < 4; i++) {
        await page.getByRole('button', { name: /Initiate Login/i }).click();
        await page.waitForTimeout(1000);
    }
    
    await page.waitForSelector('text=请稍后尝试', { timeout: 5000 }).catch(() => {});
    await page.waitForSelector('text=Please try again later', { timeout: 1000 }).catch(() => {});
    
    await page.screenshot({ path: 'login_lockout_toast.png' });
    
    const pageText2 = await page.innerText('body');
    if (pageText2.includes('Please try again later') || pageText2.includes('请稍后尝试')) {
      console.log('Success! Lockout toast is visible.');
    } else {
      console.log('Lockout toast not found? Logging body text:');
      console.log(pageText2.substring(0, 500));
    }

  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    await browser.close();
  }
})();
