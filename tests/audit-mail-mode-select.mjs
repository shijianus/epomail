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

  const getSelectMetrics = async () => {
    return await selectEl.evaluate((el) => {
      const wrapper = el.querySelector('.el-select__wrapper');
      const placeholder = el.querySelector('.el-select__placeholder');
      const visibleItem = el.querySelector('.el-select__selected-item:not(.is-hidden)') || placeholder;
      const span = el.querySelector('.el-select__placeholder span') || el.querySelector('.el-select__selected-item span');
      const suffix = el.querySelector('.el-select__suffix');
      const settingItem = el.closest('.setting-item');
      const titleEl = settingItem ? settingItem.children[0] : null;

      const spanRect = span ? span.getBoundingClientRect() : null;
      const suffixRect = suffix ? suffix.getBoundingClientRect() : null;
      const gap = (spanRect && suffixRect) ? (suffixRect.left - spanRect.right) : null;

      return {
        selectWidth: Math.round(el.getBoundingClientRect().width),
        wrapperWidth: wrapper ? Math.round(wrapper.getBoundingClientRect().width) : null,
        visibleItemWidth: visibleItem ? Math.round(visibleItem.getBoundingClientRect().width) : null,
        spanWidth: span ? Math.round(span.getBoundingClientRect().width) : null,
        textContent: span ? span.textContent.trim() : (visibleItem ? visibleItem.textContent.trim() : ''),
        isTruncated: visibleItem ? (visibleItem.scrollWidth > visibleItem.clientWidth) : null,
        gapTextToArrow: gap !== null ? Math.round(gap) : null,
        titleWidth: titleEl ? Math.round(titleEl.getBoundingClientRect().width) : null
      };
    });
  };

  const metricsMode2 = await getSelectMetrics();
  console.log('Mode 2 (加密邮件模式) 实测指标:', JSON.stringify(metricsMode2, null, 2));

  // 严格断言 Mode 2
  assert.strictEqual(metricsMode2.isTruncated, false, 'Mode 2 文字绝不允许被截断！');
  assert.ok(metricsMode2.textContent.includes('加密邮件模式 (Level 3 [E2EE])'), `文本必须完整包含 '加密邮件模式 (Level 3 [E2EE])'`);
  assert.strictEqual(metricsMode2.selectWidth, 230, `Mode 2 宽度必须刚好为 230px 贴合文字，当前: ${metricsMode2.selectWidth}px`);
  assert.ok(metricsMode2.gapTextToArrow <= 12 && metricsMode2.gapTextToArrow >= 4, `文字与箭头间距必须刚刚好（4~12px，无空白），当前间距: ${metricsMode2.gapTextToArrow}px`);

  // 切换并测试 Mode 0
  console.log('4. 切换并验证 Mode 0【隐私邮件模式】...');
  await selectEl.click();
  await page.waitForTimeout(400);
  await page.locator('.el-select-dropdown__item:visible').filter({ hasText: '隐私邮件模式' }).click();
  await page.waitForTimeout(600);
  const metricsMode0 = await getSelectMetrics();
  console.log('Mode 0 (隐私邮件模式) 实测指标:', JSON.stringify(metricsMode0, null, 2));
  assert.strictEqual(metricsMode0.isTruncated, false, 'Mode 0 文字绝不允许被截断！');
  assert.strictEqual(metricsMode0.selectWidth, 226, `Mode 0 宽度必须刚好为 226px 贴合文字，当前: ${metricsMode0.selectWidth}px`);
  assert.ok(metricsMode0.gapTextToArrow <= 12 && metricsMode0.gapTextToArrow >= 4, `文字与箭头间距必须刚刚好（4~12px，无空白），当前间距: ${metricsMode0.gapTextToArrow}px`);

  // 切换并测试 Mode 1
  console.log('5. 切换并验证 Mode 1【全部邮件模式】...');
  await selectEl.click();
  await page.waitForTimeout(400);
  await page.locator('.el-select-dropdown__item:visible').filter({ hasText: '全部邮件模式' }).click();
  await page.waitForTimeout(600);
  const metricsMode1 = await getSelectMetrics();
  console.log('Mode 1 (全部邮件模式) 实测指标:', JSON.stringify(metricsMode1, null, 2));
  assert.strictEqual(metricsMode1.isTruncated, false, 'Mode 1 文字绝不允许被截断！');
  assert.strictEqual(metricsMode1.selectWidth, 184, `Mode 1 宽度必须刚好为 184px 贴合文字，当前: ${metricsMode1.selectWidth}px`);
  assert.ok(metricsMode1.gapTextToArrow <= 12 && metricsMode1.gapTextToArrow >= 4, `文字与箭头间距必须刚刚好（4~12px，无空白），当前间距: ${metricsMode1.gapTextToArrow}px`);

  // 恢复 Mode 2
  console.log('6. 恢复 Mode 2 并留存高质量视觉截图...');
  await selectEl.click();
  await page.waitForTimeout(400);
  await page.locator('.el-select-dropdown__item:visible').filter({ hasText: '加密邮件模式' }).click();
  await page.waitForTimeout(600);
  const msgBox2 = page.locator('.el-message-box');
  if (await msgBox2.isVisible()) {
    await msgBox2.locator('button.el-button--primary').click();
    await page.waitForTimeout(1000);
  }

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

  console.log('\n=== 所有断言 100% 通过！视觉与尺寸完全刚刚好（不多不少零空白）！===');
  await browser.close();
})();
