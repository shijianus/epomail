const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  // Set fake local storage if needed to bypass login, or just screenshot the login page.
  // Wait, let's just go to the page and see what happens.
  await page.goto('http://localhost:3002/');
  
  // Wait a bit for initial render
  await page.waitForTimeout(3000);
  
  // Actually, wait for the layout to show
  await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/screenshot_1440.png' });
  
  // Mobile screenshot
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/screenshot_375.png' });
  
  await browser.close();
})();
