import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Wait a bit for the dev server to be fully ready
  await new Promise(r => setTimeout(r, 2000));
  
  await page.goto('http://localhost:3002', { waitUntil: 'networkidle' });
  
  // Try to navigate to label settings or take a general screenshot
  // In a real app we might need to login, but we'll try to just take a screenshot
  // of whatever is there
  await page.screenshot({ path: 'screenshot.png', fullPage: true });
  
  console.log('Screenshot taken: screenshot.png');
  await browser.close();
})();
