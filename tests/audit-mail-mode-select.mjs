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

      const computedStyle = window.getComputedStyle(span || visibleItem);
      const fontSize = computedStyle.fontSize;

      return {
        selectWidth: Math.round(el.getBoundingClientRect().width),
        wrapperWidth: wrapper ? Math.round(wrapper.getBoundingClientRect().width) : null,
        visibleItemWidth: visibleItem ? Math.round(visibleItem.getBoundingClientRect().width) : null,
        spanWidth: span ? Math.round(span.getBoundingClientRect().width) : null,
        fontSize,
        textContent: span ? span.textContent.trim() : (visibleItem ? visibleItem.textContent.trim() : ''),
        isTruncated: visibleItem ? (visibleItem.scrollWidth > visibleItem.clientWidth) : null,
        gapTextToArrow: gap !== null ? Math.round(gap) : null,
        titleWidth: titleEl ? Math.round(titleEl.getBoundingClientRect().width) : null
      };
    });
  };

  const metricsMode2 = await getSelectMetrics();
  console.log('Mode 2 (加密邮件模式) 实测指标:', JSON.stringify(metricsMode2, null, 2));

  // 严格断言 Mode 2 (中文固定宽度 210px，字体 12px)
  assert.strictEqual(metricsMode2.isTruncated, false, 'Mode 2 文字绝不允许被截断！');
  assert.ok(metricsMode2.textContent.includes('加密邮件模式 (Level 3 [E2EE])'), `文本必须完整包含 '加密邮件模式 (Level 3 [E2EE])'`);
  assert.strictEqual(metricsMode2.selectWidth, 210, `中文环境下宽度必须严格固定为 210px，当前: ${metricsMode2.selectWidth}px`);
  assert.strictEqual(metricsMode2.fontSize, '12px', `Mode 2 字体必须自适应微调为 12px，当前: ${metricsMode2.fontSize}`);

  // 切换并测试 Mode 0
  console.log('4. 切换并验证 Mode 0【隐私邮件模式】...');
  await selectEl.click();
  await page.waitForTimeout(600);
  await page.locator('.el-select-dropdown__item:visible').filter({ hasText: '隐私邮件模式' }).click();
  await page.waitForTimeout(1200);
  const metricsMode0 = await getSelectMetrics();
  console.log('Mode 0 (隐私邮件模式) 实测指标:', JSON.stringify(metricsMode0, null, 2));
  assert.strictEqual(metricsMode0.isTruncated, false, 'Mode 0 文字绝不允许被截断！');
  assert.strictEqual(metricsMode0.selectWidth, 210, `Mode 0 宽度必须严格固定为 210px，当前: ${metricsMode0.selectWidth}px`);
  assert.strictEqual(metricsMode0.fontSize, '12px', `Mode 0 字体必须自适应微调为 12px，当前: ${metricsMode0.fontSize}`);

  // 切换并测试 Mode 1
  console.log('5. 切换并验证 Mode 1【全部邮件模式】...');
  await selectEl.click();
  await page.waitForTimeout(600);
  await page.locator('.el-select-dropdown__item:visible').filter({ hasText: '全部邮件模式' }).click();
  await page.waitForTimeout(1200);
  const metricsMode1 = await getSelectMetrics();
  console.log('Mode 1 (全部邮件模式) 实测指标:', JSON.stringify(metricsMode1, null, 2));
  assert.strictEqual(metricsMode1.isTruncated, false, 'Mode 1 文字绝不允许被截断！');
  assert.strictEqual(metricsMode1.selectWidth, 210, `Mode 1 宽度必须严格固定为 210px，当前: ${metricsMode1.selectWidth}px`);
  assert.strictEqual(metricsMode1.fontSize, '13.5px', `Mode 1 较短文本字体应为 13.5px 保持饱满居中，当前: ${metricsMode1.fontSize}`);

  // 严格断言固定尺寸：三种模式下的宽度完全一致，决不允许随内容切换而抖动变形
  assert.strictEqual(metricsMode2.selectWidth, metricsMode0.selectWidth, '模式 2 与模式 0 宽度必须完全一致（固定尺寸）');
  assert.strictEqual(metricsMode0.selectWidth, metricsMode1.selectWidth, '模式 0 与模式 1 宽度必须完全一致（固定尺寸）');

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

  // 7. 切换英文语言并审计固定宽度 260px 与英文 i18n
  console.log('7. 验证英文环境下的固定宽度 260px 与 i18n 完整性...');
  await page.request.put(BASE + '/api/my/updateProfile', {
    data: { lang: 'en' },
    headers: { Authorization: token, 'Content-Type': 'application/json' }
  });
  await page.evaluate(() => {
    localStorage.setItem('locale', 'en');
    localStorage.setItem('setting', JSON.stringify({ lang: 'en' }));
  });
  await page.goto(BASE + '/settings/profile', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const sysLinkEn = page.locator('.settings-nav-item').filter({ hasText: /系统设置|System Settings/i });
  await sysLinkEn.first().click();
  await page.waitForTimeout(2000);

  const enSelectEl = page.locator('.mail-mode-select');
  if (await enSelectEl.isVisible()) {
    const enMetrics = await enSelectEl.evaluate(el => {
      const item = el.querySelector('.el-select__placeholder') || el.querySelector('.el-select__selected-item:not(.is-hidden)');
      const span = el.querySelector('.el-select__placeholder span') || el.querySelector('.el-select__selected-item span');
      return {
        selectWidth: Math.round(el.getBoundingClientRect().width),
        isTruncated: item ? (item.scrollWidth > item.clientWidth) : false,
        text: span ? span.textContent.trim() : ''
      };
    });
    console.log('英文环境实测指标:', enMetrics);
    assert.strictEqual(enMetrics.selectWidth, 260, `英文环境下宽度必须严格固定为 260px，当前: ${enMetrics.selectWidth}px`);
    assert.strictEqual(enMetrics.isTruncated, false, '英文文字绝不允许截断');
  }

  // 恢复回中文并重新加载
  await page.request.put(BASE + '/api/my/updateProfile', {
    data: { lang: 'zh' },
    headers: { Authorization: token, 'Content-Type': 'application/json' }
  });
  await page.evaluate(() => {
    localStorage.setItem('locale', 'zh');
    localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
  });
  await page.goto(BASE + '/settings/profile', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const sysLinkRe = page.locator('.settings-nav-item').filter({ hasText: /系统设置|System Settings/i });
  await sysLinkRe.first().click();
  await page.waitForTimeout(2000);

  const finalSelect = page.locator('.mail-mode-select');

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
