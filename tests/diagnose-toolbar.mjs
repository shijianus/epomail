import { chromium } from 'playwright';

const BASE = 'https://epomail.epocanvas.workers.dev';

async function diagnose() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });
  const page = await context.newPage();

  console.log('Logging in via API...');
  const loginRes = await page.request.post(BASE + '/api/login', {
    data: { email: 'admin@epomail.bond', password: '123456' },
    headers: { 'Content-Type': 'application/json' }
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.token;

  await page.goto(BASE + '/inbox', { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
    localStorage.setItem('locale', 'zh');
  }, token);

  await page.goto(BASE + '/settings/profile', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const sysSettingLink = page.locator('.settings-nav-item').filter({ hasText: /系统设置|System Settings/i });
  if (await sysSettingLink.count() > 0) {
    await sysSettingLink.first().click();
    await page.waitForTimeout(2000);
  }

  const welcomeCard = page.locator('.settings-card').filter({ hasText: /网站公告|公告|Notice|全员系统欢迎邮件|欢迎邮件/i });
  const quillBtn = welcomeCard.locator('.opt-button').last();
  await quillBtn.click();
  await page.waitForTimeout(2500);

  const dialog = page.locator('.welcome-dialog-canvas');
  await dialog.waitFor({ state: 'visible' });

  // Screenshot rich editor dialog
  await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/diag_full_dialog.png' });

  const header = dialog.locator('.tox-editor-header').first();
  if (await header.count() > 0) {
    await header.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/diag_tox_header.png' });
    
    const btns = header.locator('.tox-tbtn, .tox-split-button');
    const count = await btns.count();
    console.log(`Found ${count} buttons/split-buttons in .tox-editor-header:`);
    
    for (let i = 0; i < count; i++) {
      const btn = btns.nth(i);
      const aria = await btn.getAttribute('aria-label') || await btn.getAttribute('title') || await btn.innerText();
      const cls = await btn.getAttribute('class');
      const box = await btn.boundingBox();
      const svg = btn.locator('svg').first();
      let svgBox = null;
      if (await svg.count() > 0) {
        svgBox = await svg.boundingBox();
      }
      console.log(`[${i}] class="${cls}" label="${aria?.replace(/\n/g, ' ')}"`);
      console.log(`     btnBox: w=${box?.width}, h=${box?.height}, x=${box?.x}, y=${box?.y}`);
      if (svgBox && box) {
        const diffX = (box.x + box.width/2) - (svgBox.x + svgBox.width/2);
        const diffY = (box.y + box.height/2) - (svgBox.y + svgBox.height/2);
        console.log(`     centering diff: diffX=${diffX.toFixed(2)}, diffY=${diffY.toFixed(2)}`);
      }
    }
  }

  // Switch to Markdown mode and take screenshot
  const modeSwitch = dialog.locator('.editor-mode-switch .mode-switch-btn').nth(1);
  await modeSwitch.click();
  await page.waitForTimeout(1000);
  
  await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/diag_md_dialog.png' });

  await browser.close();
  console.log('Diagnosis completed successfully.');
}

diagnose().catch(console.error);
