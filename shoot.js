const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  
  const viewportSizes = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 }
  ];

  for (const size of viewportSizes) {
    const page = await context.newPage();
    await page.setViewportSize(size);
    await page.goto('http://localhost:3002/login', { waitUntil: 'networkidle' });
    
    // Wait for animations
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: `/home/shijian/projects/epocanvas-mail/login_shot_${size.width}.png` });
    await page.close();
  }

  await browser.close();
  console.log('Screenshots taken.');
})();
