import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('https://epomail.epocanvas.workers.dev/login/', { waitUntil: 'networkidle' });
  
  await page.click('#epo-email');
  await page.keyboard.type('admin@epomail.bond');
  
  await page.click('#epo-password');
  await page.keyboard.type('123456');
  
  await page.click('button:has-text("Initiate Login")');
  
  await page.waitForURL('**/#/**', { timeout: 15000 }).catch(e => console.log(e.message));
  await page.waitForTimeout(3000);
  
  await page.goto('https://epomail.epocanvas.workers.dev/settings/labels', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  // Click edit button for the first label (社群)
  const editButtons = await page.$$('.edit-btn');
  if (editButtons.length > 0) {
      await editButtons[0].click();
      await page.waitForTimeout(2000); // wait for drawer to open
      await page.screenshot({ path: 'screenshot-labels-edit1.png' });
      
      const cancelButtons = await page.$$('button:has-text("Cancel"), button:has-text("取消")');
      if (cancelButtons.length > 0) {
          await cancelButtons[0].click();
          await page.waitForTimeout(1000);
      }
  }

  // Click edit button for the second label (系统设置)
  if (editButtons.length > 1) {
      await editButtons[1].click();
      await page.waitForTimeout(2000); // wait for drawer to open
      await page.screenshot({ path: 'screenshot-labels-edit2.png' });
  }

  await browser.close();
})();
