const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const resolutions = [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 }
  ];

  const page = await browser.newPage();

  for (const res of resolutions) {
    await page.setViewportSize(res);
    await page.goto('http://127.0.0.1:8787/login/', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for a few seconds to let animations run
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: `/home/shijian/projects/epocanvas-mail/tests/visual_${res.width}x${res.height}.png`, fullPage: true });
    console.log(`Saved screenshot for ${res.width}x${res.height}`);
  }

  await browser.close();
})();
