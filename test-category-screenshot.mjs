import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.setViewportSize({ width: 1440, height: 900 });
  
  // Go to empty page first to set localStorage
  await page.goto('http://localhost:3002/', { waitUntil: 'commit' });
  await page.evaluate(() => {
    localStorage.setItem('token', 'fake-token');
    localStorage.setItem('user', JSON.stringify({
      email: 'admin@epomail.bond',
      name: 'Admin',
      role: { name: 'admin' },
      account: { accountId: 'test-id', email: 'admin@epomail.bond' }
    }));
  });
  
  // Reload page to apply token
  await page.goto('http://localhost:3002/', { waitUntil: 'networkidle' });
  
  // Wait for the app to load
  await page.waitForTimeout(2000);
  
  // Find '分类管理' menu item. 
  // It should be one of the .menu-item elements
  const items = await page.locator('.menu-item');
  const count = await items.count();
  let found = false;
  for(let i = 0; i < count; i++) {
    const text = await items.nth(i).textContent();
    if(text.includes('分类管理')) {
        await items.nth(i).click();
        found = true;
        break;
    }
  }

  if (found) {
    await page.waitForTimeout(2000); // wait for drawer to animate
    await page.screenshot({ path: 'screenshot-category-settings.png' });
    console.log('Saved screenshot-category-settings.png');
  } else {
    console.log('Category Settings menu item not found!');
  }
  
  await browser.close();
})();
