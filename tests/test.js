const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    console.log('Navigating to https://epomail.epocanvas.workers.dev ...');
    const response = await page.goto('https://epomail.epocanvas.workers.dev', { waitUntil: 'networkidle' });
    
    console.log(`Status Code: ${response.status()}`);
    
    const title = await page.title();
    console.log(`Page Title: ${title}`);
    
    // Wait for the UI to load
    await page.waitForTimeout(2000);
    
    // Check if the "Database not initialized" error is gone by getting some text from the page
    const bodyText = await page.innerText('body');
    if (bodyText.includes('Database not initialized')) {
      console.error('Error: Database not initialized message is still present.');
      process.exit(1);
    } else {
      console.log('Success: "Database not initialized" message is NOT present.');
    }
    
    // Take screenshot
    await page.screenshot({ path: 'test_screenshot.png' });
    console.log('Screenshot saved to test_screenshot.png');
    
  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    await browser.close();
  }
})();
