const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    console.log('Navigating to http://localhost:3002 ...');
    // Try to connect to the dev server with some retries
    let connected = false;
    for (let i = 0; i < 15; i++) {
      try {
        await page.goto('http://localhost:3002', { waitUntil: 'networkidle', timeout: 5000 });
        connected = true;
        break;
      } catch(e) {
        console.log('Waiting for dev server...');
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    if (!connected) {
      console.error('Could not connect to dev server');
      process.exit(1);
    }

    // Wait for app to mount and load
    await page.waitForTimeout(4000);
    
    // Hide the loading overlay manually so we can see the UI even if API fails
    await page.evaluate(() => {
      const loader = document.getElementById('loading-first');
      if (loader) loader.style.display = 'none';
    });
    
    await page.waitForTimeout(1000);
    
    // Take screenshot of light mode
    await page.screenshot({ path: 'screenshot_light.png' });
    console.log('Screenshot of light mode saved to screenshot_light.png');
    
    // Switch to dark mode
    // Assuming UI uses uiStore in localStorage or we can just toggle the 'dark' class on HTML
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    });
    
    await page.waitForTimeout(500);
    
    // Take screenshot of dark mode
    await page.screenshot({ path: 'screenshot_dark.png' });
    console.log('Screenshot of dark mode saved to screenshot_dark.png');
    
  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    await browser.close();
  }
})();
