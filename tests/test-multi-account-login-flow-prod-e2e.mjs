import { chromium } from 'playwright';
import assert from 'assert';

const BASE = process.env.TARGET_URL || 'https://mail.epocanvas.com';
const USER_EMAIL = 'audit_normal_1789140856529@epomail.bond';
const USER_PWD = 'Audit123!';

let pass = 0, fail = 0;
const failures = [];

function ok(cond, label) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    failures.push(label);
    console.log('  ✗ ' + label);
  }
}

async function run() {
  console.log('================================================================');
  console.log('=== 公网生产全真端到端核验：原生多账户无感跳转、状态保持与去品牌化 ===');
  console.log('================================================================');
  console.log(`[目标公网环境] 基地址: ${BASE}`);

  let browser;

  try {
    // 1. 获取公网 Token
    console.log('\n[步骤 1] 登录公网测试账号获取 JWT Token...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PWD })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, `登录必须成功: ${JSON.stringify(loginJson)}`);
    const token = loginJson.data?.token;
    ok(!!token, '公网线上 JWT Token 获取就绪');

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });
    const page = await context.newPage();

    // 2. 注入 Token 并打开生产首页 (启用多账户模式)
    console.log('\n[步骤 2] 注入 Token 进入邮箱主界面，开启多账户模式...');
    await page.goto(`${BASE}/mail/u/0/#inbox`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('loginEmail', email);
      const s = {
        lang: 'zh',
        viewMode: 'right',
        multiAccountEnabled: 1,
        settings: { multiAccountEnabled: 1 }
      };
      localStorage.setItem('setting', JSON.stringify(s));
      localStorage.setItem('multiAccountEnabled', '1');
      localStorage.setItem('locale', 'zh');
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email }]));
    }, { t: token, email: USER_EMAIL });

    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    // 3. 打开头像下拉卡片
    console.log('\n[步骤 3] 点击右上角头像，检验多账户卡片与品牌去 Gmail 化...');
    const avatarBtn = page.locator('.topbar-actions .avatar-wrap, .avatar').first();
    await avatarBtn.waitFor({ state: 'visible', timeout: 20000 });
    await avatarBtn.click();
    await page.waitForTimeout(800);

    const multiDropdown = page.locator('.gac-multi-account-container, .epo-account-card');
    ok(await multiDropdown.isVisible(), '多账户卡片 (.epo-account-card / .gac-multi-account-container) 成功呈现');

    // 检查卡片及页面是否存在未去品牌化的 Gmail 文本
    const dropdownHtml = await multiDropdown.innerHTML();
    const hasGmail = /gmail/i.test(dropdownHtml);
    ok(!hasGmail, '多账户下拉卡片中彻底剔除 Gmail 品牌字眼，维护官方品牌纯粹性');

    await page.screenshot({ path: 'tests/verify_multi_account_dropdown_open.png' });
    console.log('  ✓ 截图保存: tests/verify_multi_account_dropdown_open.png');

    // 4. 展开多账户折叠区
    console.log('\n[步骤 4] 展开多账户折叠区，检验「添加其他账户」操作卡片...');
    const toggleBtn = page.locator('.gac-ma-toggle-btn');
    ok(await toggleBtn.isVisible(), '多账户折叠切换按钮可见');
    await toggleBtn.click();
    await page.waitForTimeout(600);

    const addAccountCard = page.locator('.add-account-card, .gac-ma-action-card:has-text("添加其他账户")');
    ok(await addAccountCard.isVisible(), '「添加其他账户」入口卡片显式呈现');

    // 5. 点击「添加其他账户」：验证原生跳转登录页，坚决不弹出生硬模态框
    console.log('\n[步骤 5] 点击「添加其他账户」，验证直跳登录页且杜绝生硬弹窗...');
    await addAccountCard.click();
    
    // 等待路由导航到登录页
    await page.waitForURL(url => url.pathname.includes('/login'), { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const loginUrl = page.url();
    console.log(`  [跳转目标 URL]: ${loginUrl}`);
    ok(loginUrl.includes('/login') && loginUrl.includes('action=addAccount'), '成功直跳 /login/?action=addAccount，采用原生登录路由而非弹窗');

    // 确认绝无弹窗残留
    const modalDialog = page.locator('.add-account-dialog, .el-dialog:has(.add-account-form-body)');
    ok(!(await modalDialog.isVisible().catch(() => false)), '绝无老旧生硬弹窗 (<el-dialog>) 残留');

    // 6. 验证登录页多账户模式 UI 特征
    console.log('\n[步骤 6] 检验登录界面多账户适配（空白输入、返回按钮、副标题）...');
    const backBtn = page.locator('button:has-text("返回当前账户")');
    ok(await backBtn.isVisible(), '登录卡片顶部显式呈现「← 返回当前账户」按钮');

    const emailInput = page.locator('input[type="email"], input[type="text"]').first();
    const emailInputValue = await emailInput.inputValue();
    ok(emailInputValue === '', `邮箱输入框为空白待填写状态，允许登入新账号 (实际值: "${emailInputValue}")`);

    await page.screenshot({ path: 'tests/verify_add_account_login_page.png' });
    console.log('  ✓ 截图保存: tests/verify_add_account_login_page.png');

    // 7. 测试点击「← 返回当前账户」：必须 100% 保持已有账号登录状态
    console.log('\n[步骤 7] 测试点击「← 返回当前账户」，验证登录态无损保持...');
    await backBtn.click();

    await page.waitForURL(url => url.pathname.includes('/mail/u/0'), { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const returnUrl = page.url();
    console.log(`  [返回后 URL]: ${returnUrl}`);
    ok(returnUrl.includes('/mail/u/0'), '成功平滑返回主账户界面 (/mail/u/0/#inbox)');

    // 验证仍处于登录状态
    const savedToken = await page.evaluate(() => localStorage.getItem('token'));
    ok(savedToken === token, '返回后原有用户 Token 完整保持，绝未被清除');

    const inboxAvatar = page.locator('.topbar-actions .avatar-wrap, .avatar').first();
    ok(await inboxAvatar.isVisible(), '返回后用户头像正常可见，会话保持无损活跃');

    // 8. 测试浏览器原生后退 (Browser Back Button)
    console.log('\n[步骤 8] 测试浏览器原生 Back 导航与状态保持...');
    await page.goto(`${BASE}/login/?action=addAccount&u=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    ok(page.url().includes('action=addAccount'), '二次进入添加账户登录页');

    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    ok(page.url().includes('/mail/u/0'), '浏览器原生 Back 按钮无缝返回 /mail/u/0/#inbox');

    const backToken = await page.evaluate(() => localStorage.getItem('token'));
    ok(backToken === token, '浏览器原生后退时登录态依然完好无损');

    await page.screenshot({ path: 'tests/verify_return_to_inbox_session_preserved.png' });
    console.log('  ✓ 截图保存: tests/verify_return_to_inbox_session_preserved.png');

    // 9. 验证历史别名路由零 404
    console.log('\n[步骤 9] 验证 /settings/account 别名路由平滑兼容，零 404...');
    await page.goto(`${BASE}/mail/u/0/#settings/account`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const is404 = await page.locator('.not-found, .error-404, .page-404, h1:has-text("404")').isVisible().catch(() => false);
    ok(!is404, '访问 /settings/account 别名路由零 404');

  } catch (err) {
    console.error('测试异常中断:', err);
    fail++;
    failures.push(err.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log('\n================================================================');
  console.log(`核验结果汇总: ${pass} 项测试通过, ${fail} 项失败`);
  if (fail > 0) {
    console.log('失败项目:\n  - ' + failures.join('\n  - '));
    process.exit(1);
  } else {
    console.log('🎉 全部公网生产全真端到端核验 100% 通过！');
    console.log('================================================================');
  }
}

run();
