const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('http://localhost:3002');
  
  // Login
  await page.fill('input[type="text"]', 'admin@epomail.bond');
  await page.fill('input[type="password"]', '123456');
  await page.click('button:has-text("登录")');
  
  await page.waitForNavigation();
  await page.waitForTimeout(2000);
  
  // Go to all-email
  await page.click('text=全部邮件');
  await page.waitForTimeout(1000);
  
  // Input search
  await page.fill('input[placeholder="搜索所有邮件..."]', 'admin');
  await page.keyboard.press('Enter');
  
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/root/.gemini/antigravity-cli/brain/0a93ae34-4530-4f27-af33-522a1dbf5824/search-result-1.png' });
  
  // Search with token
  await page.fill('input[placeholder="搜索所有邮件..."]', '');
  await page.keyboard.press('Backspace');
  await page.fill('input[placeholder="搜索所有邮件..."]', '$发件人 admin');
  await page.keyboard.press('Enter');
  
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/root/.gemini/antigravity-cli/brain/0a93ae34-4530-4f27-af33-522a1dbf5824/search-result-2.png' });
  
  await browser.close();
})();
