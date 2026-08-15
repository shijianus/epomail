const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Assuming we can go to root, wait for login redirect
    await page.goto('http://localhost:3002/login/');
    
    // Check if we need to set local storage to skip login or if there is a way
    // Assuming there is a mock token we can set
    await page.evaluate(() => {
      localStorage.setItem('auth', '{"token":"test-token","role":"admin"}');
      localStorage.setItem('user', '{"userInfo":{"email":"test@test.com"}}');
    });
    
    // Now go to category setting
    await page.goto('http://localhost:3002/category-setting');
    await page.waitForTimeout(3000); // wait for load
    
    // 1440px
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: '/root/.gemini/antigravity-cli/brain/062d5372-e3d7-4926-8811-db347c8636c2/artifacts/1440px-category.png' });
    
    // Click on the drawer to open it to verify
    const buttons = page.locator('button');
    const setRuleBtn = buttons.filter({ hasText: '设置规则' }).first();
    if (await setRuleBtn.count() > 0) {
      await setRuleBtn.click();
      await page.waitForTimeout(1000); // wait for drawer animation
      await page.screenshot({ path: '/root/.gemini/antigravity-cli/brain/062d5372-e3d7-4926-8811-db347c8636c2/artifacts/1440px-drawer.png' });
      
      // Close drawer
      const cancelBtn = buttons.filter({ hasText: '取消' }).first();
      if (await cancelBtn.count() > 0) await cancelBtn.click();
      await page.waitForTimeout(1000);
    }
    
    // 375px
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: '/root/.gemini/antigravity-cli/brain/062d5372-e3d7-4926-8811-db347c8636c2/artifacts/375px-category.png' });
    
    console.log("Screenshots captured successfully.");
  } catch (e) {
    console.error("Failed to capture screenshot:", e);
  } finally {
    await browser.close();
  }
})();
