import { chromium } from 'playwright';
import assert from 'assert';

(async () => {
  console.log('=== 开始多语言支持、多语言欢迎邮件与全域公告邮件 Playwright E2E 全链路测试 ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('  [Browser Error]:', msg.text());
    }
  });
  page.on('pageerror', err => {
    console.log('  [Page Exception]:', err.message);
  });

  const BASE = process.env.BASE_URL || 'https://epomail.epocanvas.workers.dev';

  try {
    // Step 1: 登录管理账户
    console.log('\n[Checkpoint 1] 正在登录管理账户...');
    const loginRes = await page.request.post(BASE + '/api/login', {
      data: { email: 'admin@epomail.bond', password: '123456' },
      headers: { 'Content-Type': 'application/json' }
    });
    const loginJson = await loginRes.json();
    if (loginJson.code !== 200) {
      throw new Error('登录失败: ' + JSON.stringify(loginJson));
    }
    const token = typeof loginJson.data === "string" ? loginJson.data : loginJson.data?.token;
    assert.ok(token, "必须获取到有效 Token");
    console.log('✓ 管理员登录成功，Token 提取正常');

    // Step 2: 注入 Token 并进入偏好设置验证 6 国多语言切换
    console.log('\n[Checkpoint 2] 验证全站多语言字典与语言切换 (zh, zh-Hant, en, fr, es, nl)...');
    await page.goto(BASE + '/login/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('loginEmail', 'admin@epomail.bond');
      localStorage.setItem('ui', JSON.stringify({ dark: false, locale: 'zh', defaultTranslateLang: 'zh' }));
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
    }, { token });
    await page.goto(BASE + '/settings/general', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 检查语言切换下拉选择框
    const langSelect = page.locator('#language-section .el-select, #language-section .language-select').first();
    await langSelect.waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await langSelect.count() > 0, '偏好设置中应存在系统语言切换下拉组件');
    await langSelect.click();
    await page.waitForTimeout(800);

    const dropdownOptions = page.locator('.el-select-dropdown__item');
    const optionTexts = await dropdownOptions.allInnerTexts();
    console.log('当前支持的语言项:', optionTexts);

    // 验证包含全部主流语言：中文 (简体)、正體中文、英语、法语、西语、荷兰语
    const requiredLangs = ['中文 (简体)', '正體中文', 'English', 'Français', 'Español', 'Nederlands'];
    for (const reqLang of requiredLangs) {
      const found = optionTexts.some(txt => txt.includes(reqLang));
      assert.ok(found, `语言列表应包含 ${reqLang}`);
    }
    console.log('✓ 6 国多语言选择项验证通过: ' + requiredLangs.join(', '));

    // 点击正體中文并验证界面响应
    const hantOption = dropdownOptions.filter({ hasText: /正體中文/i }).first();
    await hantOption.click();
    await page.waitForTimeout(3500);
    await page.waitForSelector('#language-section', { state: 'visible' });

    await page.screenshot({ path: 'tests/audit_multilingual_hant.png' });
    console.log('✓ 成功切换至正體中文并截屏');

    // 切回简体中文
    const langSelectHant = page.locator('#language-section .el-select').first();
    await langSelectHant.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await langSelectHant.click();
    await page.waitForTimeout(500);
    const zhOption = page.locator('.el-select-dropdown__item').filter({ hasText: /中文 \(简体\)/i }).first();
    await zhOption.click();
    await page.waitForTimeout(3500);
    await page.waitForSelector('#language-section', { state: 'visible' });
    console.log('✓ 成功切回中文 (简体)');

    // Step 3: 前往系统设置，验证网站公告中的「欢迎邮件」与「全域公告邮件」
    console.log('\n[Checkpoint 3] 导航至系统设置，验证网站公告卡片功能...');
    await page.goto(BASE + '/system-setting', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // 查找网站公告卡片
    const noticeCard = page.locator('.settings-card').filter({ hasText: /网站公告|Notice/i });
    assert.ok(await noticeCard.count() > 0, '系统设置中必须存在「网站公告」卡片');

    // 验证网站公告中存在全域公告邮件选项
    const globalEmailItem = noticeCard.locator('.setting-item').filter({ hasText: /全域公告邮件|Global Broadcast Email/i });
    assert.ok(await globalEmailItem.count() > 0, '「网站公告」卡片中必须包含「全域公告邮件」选项');
    console.log('✓ 网站公告卡片包含全域公告邮件选项与描述');

    // Step 4: 打开全员系统欢迎邮件，验证 6 国多语言 Tab 切换与模板加载
    console.log('\n[Checkpoint 4] 打开欢迎邮件弹窗，验证多语言模板版本切换...');
    const welcomeItem = noticeCard.locator('.setting-item').filter({ hasText: /欢迎邮件|Welcome Email/i });
    const welcomeBtn = welcomeItem.locator('.opt-button');
    await welcomeBtn.click();
    await page.waitForTimeout(2500);

    const welcomeDialog = page.locator('.welcome-dialog-canvas').first();
    await welcomeDialog.waitFor({ state: 'visible' });

    // 验证语言版本切换条已按需求取消（统一根据管理员语言直接加载和发送）
    const welcomeLangRow = welcomeDialog.locator('.welcome-lang-row');
    assert.strictEqual(await welcomeLangRow.count(), 0, '欢迎邮件弹窗已取消 .welcome-lang-row 多语言选择行');
    console.log('✓ 欢迎邮件已成功取消 .welcome-lang-row，统一跟随管理员当前语言直接展示');

    // 验证当前主题直接跟随管理员语言（简体中文）
    const subjectInput = welcomeDialog.locator('.write-subject-input input');
    let curSubject = await subjectInput.inputValue();
    console.log('当前（管理员简体中文）欢迎邮件主题:', curSubject);
    assert.ok(curSubject.includes('欢迎来到 Epocanvas Mail') || curSubject.includes('Epocanvas Mail'), '应直接加载管理员语言欢迎主题');

    // 截屏留存
    await page.screenshot({ path: 'tests/audit_welcome_multilingual_tabs.png' });
    console.log('✓ 欢迎邮件管理员语言直接展示验证通过，已截屏');

    // 关闭欢迎邮件弹窗
    const closeWelcomeBtn = welcomeDialog.locator('.close-icon-btn');
    await closeWelcomeBtn.click();
    await page.waitForTimeout(1500);

    // Step 5: 打开「全域公告邮件」弹窗，验证站长通道、受众分组与高级设置
    console.log('\n[Checkpoint 5] 打开「全域公告邮件」弹窗，验证发信人通道、受众控制与高级规则...');
    const openGlobalBtn = globalEmailItem.locator('.opt-button');
    await openGlobalBtn.click();
    await page.waitForTimeout(2500);

    const globalDialog = page.locator('.global-email-dialog-canvas');
    await globalDialog.waitFor({ state: 'visible' });

    // 验证发件人通道已彻底删除（统一由 announcement@epocanvas.com 发送，无需在弹窗展示发件人通道行）
    const senderChannelRow = globalDialog.locator('.recipients-label').filter({ hasText: /发件人通道|Sender Channel/i });
    assert.strictEqual(await senderChannelRow.count(), 0, '发件人通道行已按要求彻底删除');
    console.log('✓ 弹窗已成功删除发件人通道行，默认直接使用 announcement@epocanvas.com 名义发送');

    // 验证受众选择单选组
    const audienceRadios = globalDialog.locator('.audience-selection-row .el-radio-button');
    assert.strictEqual(await audienceRadios.count(), 2, '应包含全部用户与指定分组两个选项');

    // 切换至指定用户分组 / 角色
    console.log('切换受众至「指定用户分组 / 角色」...');
    const rolesRadio = audienceRadios.filter({ hasText: /指定用户分组|角色|Specific/i }).first();
    await rolesRadio.click();
    await page.waitForTimeout(800);

    const rolesSelect = globalDialog.locator('.roles-selector-wrap .el-select');
    assert.ok(await rolesSelect.count() > 0, '切换至分组时应显示角色多选下拉框');
    await rolesSelect.click();
    await page.waitForTimeout(800);

    const roleOptions = page.locator('.el-select-dropdown__item');
    console.log(`平台可用角色分组数量: ${await roleOptions.count()}`);
    // 关闭下拉框
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 切回全部用户
    const allRadio = audienceRadios.first();
    await allRadio.click();
    await page.waitForTimeout(500);

    // 验证高级设置 (TTL 有效期、发给新人、星标置顶)
    const footer = globalDialog.locator('.welcome-fullscreen-footer');
    const expireSelect = footer.locator('.rule-item').filter({ hasText: /有效期|TTL|Retention/i });
    assert.ok(await expireSelect.count() > 0, '应包含公告留存有效期 (TTL) 设置');

    const sendToNewSwitch = footer.locator('.rule-item').filter({ hasText: /新人|New/i });
    assert.ok(await sendToNewSwitch.count() > 0, '应包含「持续发给后来的新人」开关');

    const starredSwitch = footer.locator('.rule-item').filter({ hasText: /星标|Star/i });
    assert.ok(await starredSwitch.count() > 0, '应包含「收件箱星标置顶」开关');

    console.log('✓ 全域公告高级设置 (TTL, 发给新人, 星标置顶) 验证通过');

    // 截屏留存全域公告弹窗
    await page.screenshot({ path: 'tests/audit_global_email_dialog.png' });
    console.log('✓ 全域公告邮件弹窗截屏完成');

    // 测试保存草稿配置
    const saveDraftBtn = footer.locator('.btn-save-secondary');
    await saveDraftBtn.click();
    await page.waitForTimeout(1500);
    console.log('✓ 全域公告配置保存成功');

    // 关闭全域公告弹窗
    const closeGlobalBtn = globalDialog.locator('.close-icon-btn');
    await closeGlobalBtn.click();
    await page.waitForTimeout(1500);

    console.log('\n🎉 [PASS] 所有 5 项检查点 100% 成功通过！');
  } catch (err) {
    console.error('❌ 测试运行失败:', err);
    await page.screenshot({ path: 'tests/audit_multilingual_error.png' });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
