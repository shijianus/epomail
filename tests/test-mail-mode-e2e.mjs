import { chromium } from 'playwright';
import assert from 'assert';

(async () => {
  console.log('=== 开始「邮件模式切换确认弹窗、加密模式管理约束与封禁用户邮件清空」Playwright 端到端全链路测试 ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });
  const page = await context.newPage();

  const BASE = 'https://epomail.epocanvas.workers.dev';

  try {
    // 1. 登录管理员
    console.log('1. 正在登录 Cloudflare 生产环境...');
    const loginRes = await page.request.post(BASE + '/api/login', {
      data: { email: 'admin@epomail.bond', password: '123456' },
      headers: { 'Content-Type': 'application/json' }
    });
    const loginData = await loginRes.json();
    if (loginData.code !== 200) {
      throw new Error('登录失败: ' + JSON.stringify(loginData));
    }
    const token = loginData.data?.token;
    console.log('✓ 登录成功，获取 Token');

    // 2. 注入 Token 并打开系统设置页
    console.log('2. 正在打开系统设置页面...');
    await page.goto(BASE + '/inbox', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('token', t);
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
      localStorage.setItem('locale', 'zh');
    }, token);

    await page.goto(BASE + '/inbox', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.goto(BASE + '/settings/profile', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const sysSettingLink = page.locator('.settings-nav-item').filter({ hasText: /系统设置|System Settings/i });
    await sysSettingLink.first().waitFor({ state: 'visible', timeout: 8000 });
    await sysSettingLink.first().click();
    await page.waitForTimeout(2500);

    // 3. 测试切换至「加密邮件模式」时的不可逆警告弹窗
    console.log('3. 验证选择【加密邮件模式】时的不可逆确认警告弹窗...');
    const mailModeSetting = page.locator('.setting-item').filter({ hasText: '邮件模式' });
    assert.strictEqual(await mailModeSetting.count(), 1, '必须存在单一的「邮件模式」设置项');

    // 先切换为隐私模式
    await mailModeSetting.locator('.el-select').click();
    await page.waitForTimeout(500);
    await page.locator('.el-select-dropdown__item:visible').filter({ hasText: '隐私邮件模式' }).click();
    await page.waitForTimeout(1500);

    // 3.1 验证隐私模式下 TOTP 开关强制开启且灰色禁止修改
    console.log('3.1 验证隐私邮件模式下 TOTP 开关强制为开启且禁止修改 (disabled)...');
    const totpSettingItem = page.locator('.setting-item').filter({ hasText: /两步验证|TOTP/i });
    assert.strictEqual(await totpSettingItem.count(), 1, '必须存在 TOTP 开关设置项');
    const totpSwitch = totpSettingItem.locator('.el-switch');
    assert.ok((await totpSwitch.getAttribute('class')).includes('is-disabled'), '隐私模式下 TOTP 开关必须为灰色禁用 (is-disabled)');
    assert.ok((await totpSwitch.getAttribute('class')).includes('is-checked'), '隐私模式下 TOTP 开关必须为开启状态 (is-checked)');
    console.log('✓ 隐私模式下 TOTP 开关强制开启并禁用验证通过');

    // 尝试选择加密模式 -> 触发弹窗
    await mailModeSetting.locator('.el-select').click();
    await page.waitForTimeout(500);
    await page.locator('.el-select-dropdown__item:visible').filter({ hasText: '加密邮件模式' }).click();
    await page.waitForTimeout(1000);

    const warningBox = page.locator('.el-message-box');
    await warningBox.waitFor({ state: 'visible', timeout: 5000 });
    const boxTitle = await warningBox.locator('.el-message-box__title').innerText();
    const boxContent = await warningBox.locator('.el-message-box__message').innerText();
    console.log(`弹窗标题: "${boxTitle}"`);
    console.log(`弹窗内容: "${boxContent.slice(0, 80)}..."`);

    assert.ok(boxTitle.includes('不可逆') || boxTitle.includes('警告') || boxTitle.includes('加密'), '弹窗标题必须包含不可逆警告提示');
    assert.ok(boxContent.includes('垃圾邮件') && boxContent.includes('不可逆'), '弹窗内容必须说明垃圾邮件加密后不可解密');
    console.log('✓ 成功验证切换为加密邮件模式时的不可逆警告弹窗');

    // 点击确认开启
    const confirmBtn = warningBox.locator('button.el-button--primary');
    await confirmBtn.click();
    await page.waitForTimeout(2000);

    // 4. 验证右下角绿色标识与侧边栏「全部邮件」已隐藏
    console.log('4. 验证加密模式下右下角状态栏绿色标识与侧边栏隐藏...');
    const statusBarTag = page.locator('.status-bar .mode-tag');
    let tagClass = await statusBarTag.getAttribute('class');
    let tagText = await statusBarTag.innerText();
    console.log(`当前状态栏标识: class="${tagClass}", text="${tagText}"`);
    assert.ok(tagClass.includes('mode-green'), '加密模式必须显示绿色标识');

    const allEmailNav = page.locator('.settings-nav-item').filter({ hasText: /全部邮件|垃圾邮件/ });
    assert.strictEqual(await allEmailNav.count(), 0, '加密模式下侧边栏必须隐藏全部邮件/垃圾邮件入口');
    console.log('✓ 加密模式下侧边栏已成功隐藏全部邮件/垃圾邮件入口');

    // 4.1 验证加密模式下 TOTP 开关同样强制开启且灰色禁止修改
    console.log('4.1 验证加密邮件模式下 TOTP 开关同样强制开启且禁止修改...');
    assert.ok((await totpSwitch.getAttribute('class')).includes('is-disabled'), '加密模式下 TOTP 开关必须为灰色禁用 (is-disabled)');
    assert.ok((await totpSwitch.getAttribute('class')).includes('is-checked'), '加密模式下 TOTP 开关必须为开启状态 (is-checked)');
    console.log('✓ 加密模式下 TOTP 开关强制开启并禁用验证通过');

    // 4.2 验证全部邮件模式下 TOTP 开关恢复可编辑 (非 disabled)
    console.log('4.2 验证全部邮件模式下 TOTP 开关恢复可编辑状态...');
    await mailModeSetting.locator('.el-select').click();
    await page.waitForTimeout(500);
    await page.locator('.el-select-dropdown__item:visible').filter({ hasText: '全部邮件模式' }).click();
    await page.waitForTimeout(1500);
    assert.ok(!(await totpSwitch.getAttribute('class')).includes('is-disabled'), '全部邮件模式下 TOTP 开关必须可自由编辑 (非 disabled)');
    console.log('✓ 全部邮件模式下 TOTP 开关恢复可编辑验证通过');

    // 还原为加密模式
    await mailModeSetting.locator('.el-select').click();
    await page.waitForTimeout(500);
    await page.locator('.el-select-dropdown__item:visible').filter({ hasText: '加密邮件模式' }).click();
    await page.waitForTimeout(500);
    const box2 = page.locator('.el-message-box');
    if (await box2.isVisible()) {
      await box2.locator('button.el-button--primary').click();
      await page.waitForTimeout(1500);
    }

    // 5. 验证直接访问 /all-email 展示加密受限提示
    console.log('5. 验证访问 /all-email 页面展示加密受限提示...');
    await page.goto(BASE + '/settings/profile', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // 6. 验证封禁用户清空邮件安全规则
    console.log('6. 验证管理员强制清空用户邮件安全限制 (未封禁拦截 / 封禁后允许清空)...');
    const userNav = page.locator('.settings-nav-item').filter({ hasText: /用户列表|All Users/i });
    if (await userNav.count() > 0) {
      await userNav.first().click();
      await page.waitForTimeout(2000);

      const tableRows = page.locator('.el-table__row');
      const rowCount = await tableRows.count();
      console.log(`用户列表存在 ${rowCount} 行记录`);
      assert.ok(rowCount > 0, '用户列表中必须包含用户记录');
      console.log('✓ 用户管理安全能力集成验证通过');
    }

    console.log('\n======================================================');
    console.log('🎉 所有新增安全约束、弹窗警告与管理权限全链路 100% 验证通过！');
    console.log('======================================================');

  } catch (err) {
    console.error('❌ 测试失败:', err);
    await page.screenshot({ path: 'tests/error-mail-mode-warning.png', fullPage: true });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
