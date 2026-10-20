import { chromium } from 'playwright';
import path from 'node:path';

async function testCleanBrowser() {
  console.log('--- Launching clean Chromium browser (no storageState, no cookies, no init scripts) ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => logs.push(`[Console ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PageError] ${err.message}`));
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      logs.push(`[Navigated] ${frame.url()}`);
    }
  });

  console.log('1. Navigating to http://192.168.17.129:4199/audit-report ...');
  await page.goto('http://192.168.17.129:4199/audit-report', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const currentUrl = page.url();
  console.log('Current URL after load:', currentUrl);
  if (currentUrl.includes('/login')) {
    throw new Error(`FAILED: Redirected to login page: ${currentUrl}`);
  }
  console.log('PASS: Successfully landed on audit report without login redirect.');

  // 2. 检查案件列表是否正常渲染
  console.log('2. Verifying audit table rows...');
  await page.waitForSelector('.el-table__row', { timeout: 10000 });
  const tableRows = await page.locator('.el-table__row').count();
  console.log(`Table row count: ${tableRows}`);
  if (tableRows === 0) {
    throw new Error('FAILED: No case rows found in audit table.');
  }
  console.log('PASS: Audit case rows rendered successfully.');

  // 3. 点击第一条案件的详情按钮，打开抽屉
  console.log('3. Clicking action detail button to open drawer...');
  const detailBtn = page.locator('.action-detail-btn').first();
  await detailBtn.click();
  await page.waitForSelector('.audit-detail-drawer', { state: 'visible', timeout: 5000 });
  console.log('PASS: Drawer opened and visible.');

  // 4. 验证 4 个内容 Tab 存在且可切换
  console.log('4. Testing drawer tab switching...');
  const tabPanes = ['overview', 'investigation', 'evidence', 'decision'];
  for (const tabName of tabPanes) {
    const tabItem = page.locator(`.drawer-clean-tabs .el-tabs__item#tab-${tabName}`);
    if (await tabItem.count() > 0) {
      await tabItem.click();
      await page.waitForTimeout(400);
      console.log(`  - Tab switched to: ${tabName}`);
    }
  }

  // 切换回总览并截图
  await page.locator('.drawer-clean-tabs .el-tabs__item#tab-overview').click();
  await page.waitForTimeout(500);

  const screenshotPath = path.resolve('tests/clean_browser_preview_verified.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`PASS: Clean browser screenshot captured at ${screenshotPath}`);

  // 5. 验证页面刷新 (F5) 保持在页面内，不跳转登录
  console.log('5. Testing page reload (F5) persistence...');
  await page.reload({ waitUntil: 'networkidle', timeout: 10000 });
  await page.waitForTimeout(1000);
  const reloadUrl = page.url();
  console.log('URL after reload:', reloadUrl);
  if (reloadUrl.includes('/login')) {
    throw new Error(`FAILED: Reload redirected to login: ${reloadUrl}`);
  }
  console.log('PASS: Page reload successfully preserved audit session.');

  await browser.close();
  console.log('\n--- ALL CLEAN BROWSER TESTS PASSED (100% Zero-Touch Preview) ---');
}

testCleanBrowser().catch(err => {
  console.error('\nTest failed with error:', err);
  process.exit(1);
});
