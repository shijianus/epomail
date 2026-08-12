const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  
  const resolutions = [
    { width: 1440, height: 900, name: '1440px' },
    { width: 1024, height: 768, name: '1024px' },
    { width: 768, height: 1024, name: '768px' },
    { width: 375, height: 667, name: '375px' }
  ];

  for (const res of resolutions) {
    const page = await context.newPage();
    await page.setViewportSize({ width: res.width, height: res.height });
    console.log(`Navigating to http://localhost:8787/login for ${res.name} ...`);
    try {
      await page.goto('http://localhost:8787/login', { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000); // wait for animations
      await page.screenshot({ path: `screenshot_${res.name}.png` });
      console.log(`Saved screenshot_${res.name}.png`);
    } catch (e) {
      console.error(`Error taking screenshot for ${res.name}:`, e);
    }
    await page.close();
  }
  
  await browser.close();
})();
