import { chromium } from 'playwright';
import assert from 'node:assert';

(async () => {
  console.log('=== 开始 Playwright 真实生产环境视觉与尺寸严格审计 ===');
  const browser = await chromium.launch({ headless: true, args: ['--lang=zh-CN'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || 'https://epomail.epocanvas.workers.dev';

  console.log('1. 登录 Admin 账号...');
  const loginRes = await page.request.post(BASE + '/api/login', {
    data: { email: 'admin@epomail.bond', password: '123456' },
    headers: { 'Content-Type': 'application/json' }
  });
  const loginData = await loginRes.json();
  assert.strictEqual(loginData.code, 200, '登录失败: ' + JSON.stringify(loginData));
  const token = typeof loginData.data === 'string' ? loginData.data : loginData.data?.token;

  await page.goto(BASE + '/inbox', { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
    localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
    localStorage.setItem('locale', 'zh');
    document.documentElement.classList.remove('dark');
  }, token);

  console.log('2. 访问系统设置...');
  await page.goto(BASE + '/settings/profile', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const sysSettingLink = page.locator('.settings-nav-item').filter({ hasText: /系统设置|System Settings/i });
  await sysSettingLink.first().waitFor({ state: 'visible', timeout: 8000 });
  await sysSettingLink.first().click();
  await page.waitForTimeout(3000);

  const mailModeItem = page.locator('.setting-item').filter({ hasText: '邮件模式' });
  await mailModeItem.waitFor({ state: 'visible', timeout: 10000 });

  const selectEl = mailModeItem.locator('.el-select');

  // 先确保切换并选中「加密邮件模式」进行严格验证
  console.log('3. 切换并选中【加密邮件模式】...');
  await selectEl.click();
  await page.waitForTimeout(500);
  const encryptedOption = page.locator('.el-select-dropdown__item:visible').filter({ hasText: '加密邮件模式' });
  await encryptedOption.click();
  await page.waitForTimeout(600);

  const msgBox = page.locator('.el-message-box');
  if (await msgBox.isVisible()) {
    const confirmBtn = msgBox.locator('button.el-button--primary');
    await confirmBtn.click();
    await page.waitForTimeout(2000);
  }

  const metrics = await selectEl.evaluate((el) => {
    const wrapper = el.querySelector('.el-select__wrapper');
    const placeholder = el.querySelector('.el-select__placeholder');
    const visibleItem = el.querySelector('.el-select__selected-item:not(.is-hidden)') || placeholder;
    const span = el.querySelector('.el-select__placeholder span') || el.querySelector('.el-select__selected-item span');
    const settingItem = el.closest('.setting-item');
    const titleEl = settingItem ? settingItem.children[0] : null;

    return {
      outerHTML: el.outerHTML,
      selectWidth: el.getBoundingClientRect().width,
      wrapperWidth: wrapper ? wrapper.getBoundingClientRect().width : null,
      visibleItemWidth: visibleItem ? visibleItem.getBoundingClientRect().width : null,
      visibleItemScrollWidth: visibleItem ? visibleItem.scrollWidth : null,
      visibleItemClientWidth: visibleItem ? visibleItem.clientWidth : null,
      spanWidth: span ? span.getBoundingClientRect().width : null,
      spanScrollWidth: span ? span.scrollWidth : null,
      textContent: span ? span.textContent.trim() : (visibleItem ? visibleItem.textContent.trim() : ''),
      isTruncated: visibleItem ? (visibleItem.scrollWidth > visibleItem.clientWidth) : null,
      titleWidth: titleEl ? titleEl.getBoundingClientRect().width : null,
      titleHeight: titleEl ? titleEl.getBoundingClientRect().height : null
    };
  });

  console.log('加密邮件模式真实审计指标:', JSON.stringify(metrics, null, 2));

  // 严格断言
  assert.strictEqual(metrics.isTruncated, false, '邮件模式 el-select 文字绝不允许被截断！');
  assert.ok(metrics.textContent.includes('加密邮件模式 (Level 3 [E2EE])'), `文本必须完整包含 '加密邮件模式 (Level 3 [E2EE])'，当前: '${metrics.textContent}'`);
  assert.ok(metrics.selectWidth >= 240, `el-select 容器宽度必须 >= 240px，当前: ${metrics.selectWidth}px`);
  assert.ok(metrics.titleWidth >= 75, `标题 '邮件模式' 应保持单行宽度（>=75px），当前宽度: ${metrics.titleWidth}px`);

  // 截图整个卡片 (亮色模式)
  const card = page.locator('.settings-card').first();
  await card.screenshot({ path: 'tests/audit_mail_mode_full_light.png' });
  console.log('✓ 已生成亮色模式真实卡片截图: tests/audit_mail_mode_full_light.png');

  // 截图暗色模式
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(400);
  await card.screenshot({ path: 'tests/audit_mail_mode_full_dark.png' });
  console.log('✓ 已生成暗色模式真实卡片截图: tests/audit_mail_mode_full_dark.png');
  await page.evaluate(() => document.documentElement.classList.remove('dark'));

  // 展开下拉选项并截图
  await selectEl.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/audit_mail_mode_dropdown_open.png' });
  console.log('✓ 已生成下拉选项展开截图: tests/audit_mail_mode_dropdown_open.png');

  console.log('\n=== 所有断言 100% 通过！视觉与尺寸完全达标！===');
  await browser.close();
})();
