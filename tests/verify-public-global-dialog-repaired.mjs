import { chromium } from 'playwright';
import assert from 'node:assert';

const BASE = 'https://mail.epocanvas.com';
const ADMIN_EMAIL = 'admin@epomail.bond';
const ADMIN_PWD = '123456';

(async () => {
  console.log('========================================================================');
  console.log('=== 公网生产环境全真栈核验：全域公告邮件弹窗修复与功能验证 ===');
  console.log('========================================================================');

  let browser;
  const consoleErrors = [];
  const pageErrors = [];

  try {
    // 1. 登录管理员获取 Token
    console.log(`\n[步骤 1] 登录管理员获取 Token (${BASE}/api/login)...`);
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PWD })
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, `登录必须成功: ${JSON.stringify(loginData)}`);
    const token = loginData.data?.token;
    assert.ok(token, '登录响应必须包含 JWT token');
    console.log('  ✓ 登录成功，获取管理员 Token');

    // 2. 启动 Playwright 浏览器
    console.log('\n[步骤 2] 启动 Chromium 浏览器，进入公网系统设置页面...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });
    const page = await context.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('cloudflareinsights')) {
          console.error('  [Browser Error]:', text);
          consoleErrors.push(text);
        }
      }
    });

    page.on('pageerror', err => {
      console.error('  [Page Error]:', err.message);
      pageErrors.push(err.message);
    });

    // 先在 /login/ 下注入 localStorage 状态
    await page.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('loginEmail', email);
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
      localStorage.setItem('locale', 'zh');
    }, { t: token, email: ADMIN_EMAIL });

    // 访问 /inbox 完成应用首屏启动与动态路由注入
    console.log('  -> 正在加载应用全真运行环境 (/inbox)...');
    await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 路由切换至系统设置
    console.log('  -> 正在切换路由至 /mail/u/0/#system-setting ...');
    await page.evaluate(() => {
      window.location.hash = '#system-setting';
    });
    await page.waitForTimeout(2500);

    // 校验 URL
    const currentUrl = page.url();
    console.log('  ✓ 当前 URL:', currentUrl);
    assert.ok(currentUrl.includes('system-setting'), `URL 必须处于 system-setting 状态: ${currentUrl}`);

    // 保存系统设置页面截图
    await page.screenshot({ path: 'tests/public_sys_setting_loaded.png' });
    console.log('  ✓ 系统设置页面截图已保存: tests/public_sys_setting_loaded.png');

    // 3. 定位全域公告邮件卡片及操作按钮
    console.log('\n[步骤 3] 定位全域公告邮件卡片及操作按钮...');
    const globalNoticeCard = page.locator('.settings-card').filter({ hasText: /网站公告|全域公告邮件|全员系统欢迎邮件/i });
    const cardCount = await globalNoticeCard.count();
    console.log(`  ✓ 找到公告卡片数量: ${cardCount}`);
    assert.ok(cardCount > 0, '必须能找到公告设置卡片');

    // 定位包含「全域公告邮件」的设置行及其 opt-button (class="setting-item")
    const globalEmailItem = globalNoticeCard.locator('.setting-item').filter({ hasText: /全域公告/ });
    assert.ok(await globalEmailItem.count() > 0, '必须能找到全域公告邮件设置行');
    const globalEmailBtn = globalEmailItem.locator('button.opt-button');
    const btnTitle = await globalEmailBtn.getAttribute('title');
    console.log(`  ✓ 找到全域公告邮件按钮，title: "${btnTitle}"`);
    assert.ok(await globalEmailBtn.isVisible(), '全域公告邮件按钮必须可见');

    // 滚动至该按钮可见
    await globalEmailBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // 4. 点击「全域公告邮件」按钮并核验弹窗即时弹出
    console.log('\n[步骤 4] 点击「全域公告邮件」按钮...');
    await globalEmailBtn.click();
    await page.waitForTimeout(1500);

    // 验证弹窗是否渲染并可见
    const dialog = page.locator('.el-dialog.global-email-dialog-canvas');
    const isDialogVisible = await dialog.isVisible();
    console.log(`  ✓ 全域公告弹窗可见性: ${isDialogVisible}`);
    assert.ok(isDialogVisible, '全域公告邮件弹窗必须立即弹出并可见！');

    // 验证弹窗标题
    const dialogTitle = (await dialog.locator('.dialog-main-title').innerText()).trim();
    console.log(`  ✓ 弹窗标题: "${dialogTitle}"`);
    assert.ok(dialogTitle.includes('全域公告') || dialogTitle.includes('公告'), `弹窗标题必须匹配: ${dialogTitle}`);

    // 验证官方发件人标签（已转义 @，显示正常）
    const senderTag = (await dialog.locator('.official-channel-tag').innerText()).trim();
    console.log(`  ✓ 官方发件人标签文案: "${senderTag}"`);
    assert.ok(senderTag.includes('announcement@epocanvas.com'), `发件人必须包含 announcement@epocanvas.com (实际: ${senderTag})`);

    // 验证不存在任何语言选择行
    const langRow = dialog.locator('.welcome-lang-row');
    const langRowCount = await langRow.count();
    assert.strictEqual(langRowCount, 0, '弹窗内绝对禁止存在 .welcome-lang-row');
    console.log('  ✓ 验证通过: 弹窗内无 .welcome-lang-row 语言选择行');

    // 验证受众选择行存在
    const audienceRow = dialog.locator('.audience-selection-row');
    assert.ok(await audienceRow.isVisible(), '受众选择行必须正常呈现');
    console.log('  ✓ 验证通过: 目标受众选择行正常展示');

    // 验证主题输入框存在
    const subjectInput = dialog.locator('.write-subject-input input');
    assert.ok(await subjectInput.isVisible(), '主题输入框必须可见');
    const subjectValue = await subjectInput.inputValue();
    console.log(`  ✓ 预填主题: "${subjectValue}"`);

    // 验证编辑器区域存在
    const editorArea = dialog.locator('.editor-mount-area');
    assert.ok(await editorArea.isVisible(), '编辑器区域必须挂载并可见');
    console.log('  ✓ 验证通过: 编辑器区域挂载并正常渲染');

    // 5. 验证富文本与 Markdown 源码模式切换
    console.log('\n[步骤 5] 验证富文本与 Markdown 源码模式切换...');
    const modeSwitchBtns = dialog.locator('.editor-mode-switch .mode-switch-btn');
    assert.strictEqual(await modeSwitchBtns.count(), 2, '必须提供富文本与 Markdown 两种切换模式');

    // 切换至 Markdown 源码模式
    console.log('  -> 切换至 Markdown 源码模式...');
    await modeSwitchBtns.nth(1).click();
    await page.waitForTimeout(800);
    const sourceTextarea = dialog.locator('.source-textarea-fullscreen');
    assert.ok(await sourceTextarea.isVisible(), 'Markdown 源码输入区域必须可见');
    console.log('  ✓ 验证通过: Markdown 源码模式切换流畅无阻');

    // 切回富文本模式
    console.log('  -> 切回富文本可视化编辑模式...');
    await modeSwitchBtns.nth(0).click();
    await page.waitForTimeout(800);
    const richEditor = dialog.locator('.dialog-tiny-editor');
    assert.ok(await richEditor.isVisible(), '富文本可视化编辑器必须可见');
    console.log('  ✓ 验证通过: 富文本可视化模式切回成功');

    // 6. 验证底部规则与操作按钮
    console.log('\n[步骤 6] 验证底部规则与操作按钮...');
    const saveDraftBtn = dialog.locator('.btn-save-secondary');
    assert.ok(await saveDraftBtn.isVisible(), '保存草稿按钮必须可见');
    const broadcastBtn = dialog.locator('.btn-broadcast-primary');
    assert.ok(await broadcastBtn.isVisible(), '全域广播发送按钮必须可见');
    console.log('  ✓ 验证通过: 保存草稿与全域广播发送按钮均正常呈现');

    // 保存弹窗打开全景截图
    await page.screenshot({ path: 'tests/public_global_dialog_opened.png' });
    console.log('  ✓ 弹窗打开全景截图已保存: tests/public_global_dialog_opened.png');

    // 7. 控制台与运行时零报错断言
    console.log('\n[步骤 7] 校验控制台与页面运行时抛错...');
    // 过滤掉已知的非阻断警告
    const fatalErrors = consoleErrors.filter(e => !e.includes('ResizeObserver') && !e.includes('favicon'));
    console.log(`  ✓ 控制台致命错误数量: ${fatalErrors.length}`);
    assert.strictEqual(fatalErrors.length, 0, `页面严禁存在控制台致命错误: ${fatalErrors.join('; ')}`);

    console.log(`  ✓ 页面未捕获运行时错误数量: ${pageErrors.length}`);
    assert.strictEqual(pageErrors.length, 0, `页面严禁存在未捕获运行时错误: ${pageErrors.join('; ')}`);

    console.log('\n========================================================================');
    console.log('🎉 公网生产环境验证全部通过！全域公告邮件按钮功能与弹窗已完全修复就绪！');
    console.log('========================================================================');

  } catch (err) {
    console.error('\n❌ 公网生产环境验证失败:', err);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
