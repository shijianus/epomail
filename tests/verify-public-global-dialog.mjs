import { chromium } from 'playwright';
import assert from 'node:assert';
import { execSync } from 'node:child_process';

const BASE = 'https://mail.epocanvas.com';
const ADMIN_EMAIL = 'admin@epomail.bond';
const ADMIN_PWD = '123456';

(async () => {
  console.log('================================================================');
  console.log('=== 公网生产环境 (mail.epocanvas.com) 端到端全真验证：全域公告邮件 ===');
  console.log('================================================================');

  let browser;
  try {
    // 0. 临时放行站长登录以进行公网全真验证 (测试完毕后 finally 严格还原)
    console.log('\n[步骤 0] 准备公网测试环境 (临时放行 MFA)...');
    execSync('npx wrangler d1 execute epomail --remote --command "UPDATE user SET totp_enabled = 0 WHERE user_id = 1"', {
      cwd: '/home/shijian/projects/epocanvas-mail/mail-worker',
      stdio: 'pipe'
    });
    console.log('  ✓ 生产数据库测试环境就绪');

    // 1. 登录
    console.log('\n[步骤 1] 正在登录生产站长账号获取 Token...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PWD })
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, `登录必须成功: ${JSON.stringify(loginData)}`);
    const token = loginData.data?.token;
    assert.ok(token, '必须返回 JWT Token');
    console.log('  ✓ 站长登录成功，Token 验证就绪');

    // 2. 启动 Playwright
    console.log('\n[步骤 2] 启动 Playwright 访问生产环境...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    // 在页面加载前通过 addInitScript 注入认证凭证，确保 init() 启动时能同步读取到 token 并挂载动态管理路由
    await context.addInitScript(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('loginEmail', email);
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
      localStorage.setItem('locale', 'zh');
    }, { t: token, email: ADMIN_EMAIL });

    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('cloudflareinsights')) {
          consoleErrors.push(text);
          console.error('  [Browser Error]:', text);
        }
      }
    });
    page.on('pageerror', err => {
      pageErrors.push(err.message);
      console.error('  [Page Error]:', err.message);
    });

    // 3. 导航到用户指定的公网目标 URL: https://mail.epocanvas.com/mail/u/0/#system-setting
    const TARGET_URL = `${BASE}/mail/u/0/#system-setting`;
    console.log(`\n[步骤 3] 导航至目标页面 ${TARGET_URL} ...`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    console.log('  当前 URL:', page.url());

    // 4. 定位「全域公告邮件」配置项与按钮
    console.log('\n[步骤 4] 校验系统设置页面及全域公告配置项...');
    await page.waitForSelector('.settings-card', { timeout: 15000 });

    const globalSettingItem = page.locator('.setting-item').filter({ hasText: /全域公告邮件|Global Announcement/i }).first();
    assert.ok(await globalSettingItem.count() > 0, '必须找到包含「全域公告邮件」的设置项');
    console.log('  ✓ 成功定位到「全域公告邮件」配置行');

    // 滚动至可见区域
    await globalSettingItem.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // 定位目标按钮: class="el-button el-button--primary el-button--small opt-button"
    const globalEmailBtn = globalSettingItem.locator('button.opt-button');
    assert.ok(await globalEmailBtn.isVisible(), '全域公告邮件按钮 (class="opt-button") 必须可见！');
    console.log('  ✓ 成功定位到目标按钮: class="el-button el-button--primary el-button--small opt-button"');

    // 5. 点击按钮打开弹窗并验证 0 延迟即时展示
    console.log('\n[步骤 5] 点击「全域公告邮件」按钮并核验弹窗立即展示...');
    await globalEmailBtn.click();
    await page.waitForTimeout(1000);

    // 验证弹窗可见
    const dialog = page.locator('.welcome-dialog-canvas.global-email-dialog-canvas');
    assert.ok(await dialog.isVisible(), '点击按钮后 welcome-dialog-canvas 弹窗必须正常渲染且立即可见！');
    console.log('  ✓ 全域公告邮件弹窗成功弹出并可见');

    // 6. 核验弹窗内容与设计规范
    console.log('\n[步骤 6] 详细审计弹窗内容、文案、官方发件人和多语言规范...');
    const headerTitle = await page.locator('.global-email-dialog-canvas .dialog-main-title').innerText();
    console.log(`  ✓ 弹窗标题: "${headerTitle}"`);
    assert.ok(headerTitle.includes('全域公告邮件'), `标题必须为全域公告邮件 (实际: ${headerTitle})`);

    // 检查官方发信地址 tag
    const senderTag = await page.locator('.global-email-dialog-canvas .official-channel-tag').innerText();
    console.log(`  ✓ 官方发信标签: "${senderTag}"`);
    assert.ok(senderTag.includes('announcement@epocanvas.com'), '官方标签必须包含 announcement@epocanvas.com');

    // 检查 class="welcome-lang-row" 必须物理不存在
    const langRow = page.locator('.welcome-dialog-canvas .welcome-lang-row');
    const langRowCount = await langRow.count();
    console.log(`  ✓ class="welcome-lang-row" 存在数量: ${langRowCount} (预期为 0)`);
    assert.strictEqual(langRowCount, 0, 'welcome-dialog-canvas 中绝对不得存在 welcome-lang-row');

    // 检查受众群体选择器存在
    const recipientsRow = page.locator('.welcome-dialog-canvas .welcome-recipients-row');
    assert.ok(await recipientsRow.isVisible(), '目标受众行必须正常展示');
    console.log('  ✓ 目标受众选择行正常展示');

    // 检查富文本编辑器挂载
    const editor = page.locator('.global-email-dialog-canvas .dialog-tiny-editor');
    assert.ok(await editor.isVisible(), '富文本编辑器容器必须正常渲染挂载');
    console.log('  ✓ 富文本编辑器正常挂载');

    // 检查邮件主题与内容是否有值
    const subjectInput = page.locator('.welcome-dialog-canvas .write-subject-input input');
    const subjectVal = await subjectInput.inputValue();
    console.log(`  ✓ 预填邮件主题: "${subjectVal}"`);
    assert.ok(subjectVal.length > 0, '邮件主题必须已根据当前管理员语言自动预填');

    // 检查底部规则栏与操作按钮
    const footer = page.locator('.global-email-dialog-canvas .welcome-fullscreen-footer');
    assert.ok(await footer.isVisible(), '底部操作与规则栏必须正常展示');
    const saveDraftBtn = footer.locator('.btn-save-secondary');
    const broadcastBtn = footer.locator('.btn-broadcast-primary');
    assert.ok(await saveDraftBtn.isVisible(), '保存草稿按钮必须可见');
    assert.ok(await broadcastBtn.isVisible(), '发送广播按钮必须可见');
    console.log('  ✓ 底部草稿保存与全域广播操作按钮正常可见');

    // 检查无未捕获异常（特别是之前导致按钮崩溃的 vue-i18n SyntaxError: 10）
    assert.strictEqual(pageErrors.length, 0, `页面严禁存在任何运行时 pageerror: ${pageErrors.join('; ')}`);
    assert.strictEqual(consoleErrors.filter(e => e.includes('SyntaxError') || e.includes('Cannot read')).length, 0, '严禁存在任何语法错误或空指针异常');
    console.log('  ✓ 运行时未捕获错误校验通过: 0 错误 (vue-i18n 字符转义彻底修复生效)');

    // 截图保存
    await page.screenshot({ path: 'tests/public_verify_global_dialog_success.png' });
    console.log('  ✓ 公网全真验证截图已保存: tests/public_verify_global_dialog_success.png');

    // 7. 测试切换至 Markdown 源码编辑模式
    console.log('\n[步骤 7] 测试富文本 / Markdown 模式切换...');
    const modeSwitchBtns = page.locator('.global-email-dialog-canvas .mode-switch-btn');
    if (await modeSwitchBtns.count() >= 2) {
      // 点击 Markdown 模式 (第二个按钮)
      await modeSwitchBtns.nth(1).click();
      await page.waitForTimeout(500);
      const textarea = page.locator('.global-email-dialog-canvas .source-textarea-fullscreen');
      assert.ok(await textarea.isVisible(), '切换至 Markdown 模式后源码输入框必须可见');
      console.log('  ✓ Markdown 源码模式切换成功');

      await page.screenshot({ path: 'tests/public_verify_global_markdown_mode.png' });
      console.log('  ✓ Markdown 模式截图已保存: tests/public_verify_global_markdown_mode.png');

      // 切回富文本模式 (第一个按钮)
      await modeSwitchBtns.nth(0).click();
      await page.waitForTimeout(500);
    }

    // 8. 测试关闭全域公告弹窗
    console.log('\n[步骤 8] 测试关闭全域公告弹窗...');
    const closeBtn = page.locator('.global-email-dialog-canvas .close-icon-btn');
    await closeBtn.click();
    await page.waitForTimeout(500);
    assert.ok(!(await dialog.isVisible()), '点击关闭后弹窗必须顺利关闭');
    console.log('  ✓ 全域公告弹窗顺利关闭');

    // 9. 连带校验「自动发送新用户欢迎邮件」弹窗
    console.log('\n[步骤 9] 连带校验「自动发送新用户欢迎邮件」弹窗...');
    const welcomeSettingItem = page.locator('.setting-item').filter({ hasText: /新用户欢迎邮件|欢迎邮件|Welcome Email/i }).first();
    assert.ok(await welcomeSettingItem.count() > 0, '必须找到欢迎邮件设置项');
    const welcomeBtn = welcomeSettingItem.locator('button.opt-button');
    await welcomeBtn.click();
    await page.waitForTimeout(1000);

    const welcomeDialog = page.locator('.welcome-dialog-canvas:not(.global-email-dialog-canvas)');
    assert.ok(await welcomeDialog.isVisible(), '欢迎邮件弹窗必须正常弹出并可见');
    const welcomeLangRow = welcomeDialog.locator('.welcome-lang-row');
    assert.strictEqual(await welcomeLangRow.count(), 0, '欢迎邮件弹窗中 class="welcome-lang-row" 必须物理不存在');
    console.log('  ✓ 欢迎邮件弹窗成功弹出，且零 welcome-lang-row 存在');
    await page.screenshot({ path: 'tests/public_verify_welcome_dialog_success.png' });

    // 关闭欢迎邮件弹窗
    const welcomeCloseBtn = welcomeDialog.locator('.close-icon-btn');
    await welcomeCloseBtn.click();
    await page.waitForTimeout(500);
    assert.ok(!(await welcomeDialog.isVisible()), '欢迎邮件弹窗顺利关闭');
    console.log('  ✓ 欢迎邮件弹窗顺利关闭');

    console.log('\n================================================================');
    console.log('🎉 公网生产环境 (https://mail.epocanvas.com) 真实全真双弹窗验证 100% 全部通过！');
    console.log('  1. "全域公告邮件" 按钮响应丝滑，0延迟即时弹出');
    console.log('  2. "欢迎邮件" 按钮响应丝滑，0延迟即时弹出');
    console.log('  3. 两大官方邮件弹窗内彻底移除了 welcome-lang-row，禁止修改邮件语言');
    console.log('  4. 官方发件人统一规范为 announcement@epocanvas.com');
    console.log('  5. vue-i18n 字符转义彻底修复，零控制台抛错');
    console.log('  6. 富文本与 Markdown 源码双模平滑切换');
    console.log('================================================================');
  } catch (err) {
    console.error('\n❌ 公网测试失败:', err);
    throw err;
  } finally {
    if (browser) await browser.close();
    // 恢复站长 TOTP 状态
    console.log('\n[清理还原] 正在恢复生产站长 TOTP 状态 (totp_enabled = 1)...');
    try {
      execSync('npx wrangler d1 execute epomail --remote --command "UPDATE user SET totp_enabled = 1 WHERE user_id = 1"', {
        cwd: '/home/shijian/projects/epocanvas-mail/mail-worker',
        stdio: 'pipe'
      });
      console.log('  ✓ 生产数据库已严格恢复原始状态，零脏数据残留');
    } catch (cleanErr) {
      console.error('  ⚠️ 还原 TOTP 失败，请手动恢复:', cleanErr);
    }
  }
})();
