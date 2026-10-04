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
  console.log('=== 公网生产全真端到端核验：添加其他账户零 404 与原生弹窗支援 ===');
  console.log('================================================================');
  console.log(`[目标公网环境] 基地址: ${BASE}`);

  let browser;

  try {
    // 1. 登录公网测试账号
    console.log('\n[步骤 1] 登录测试账号获取公网 Token...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PWD })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, `登录必须成功: ${JSON.stringify(loginJson)}`);
    const token = loginJson.data?.token;
    ok(!!token, '公网线上 JWT Token 获取就绪');

    // 启动浏览器
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });
    const page = await context.newPage();

    // 2. 注入 Token 并打开生产主页 (启用多账户模式)
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
    }, { t: token, email: USER_EMAIL });

    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    // 3. 找到头像并点击展开 (多账户视图)
    console.log('\n[步骤 3] 点击右上角头像，展开多账户下拉卡片...');
    const avatarBtn = page.locator('.topbar-actions .avatar-wrap, .avatar').first();
    await avatarBtn.waitFor({ state: 'visible', timeout: 20000 });
    ok(await avatarBtn.isVisible(), '顶栏右上角用户头像可见');

    await avatarBtn.click();
    await page.waitForTimeout(800);

    const multiDropdown = page.locator('.gac-multi-account-container');
    ok(await multiDropdown.isVisible(), '多账户模式卡片 (.gac-multi-account-container) 成功呈现');

    // 4. 展开多账户折叠区
    console.log('\n[步骤 4] 展开多账户折叠区，点击「添加其他账户」...');
    const toggleBtn = page.locator('.gac-ma-toggle-btn');
    ok(await toggleBtn.isVisible(), '多账户切换展开/折叠箭头按钮可见');
    await toggleBtn.click();
    await page.waitForTimeout(600);

    const addAccountCard = page.locator('.add-account-card, .gac-ma-action-card:has-text("添加其他账户")');
    ok(await addAccountCard.isVisible(), '「添加其他账户」操作卡片显式可见');

    // 点击「添加其他账户」
    await addAccountCard.click();
    await page.waitForTimeout(800);

    // 5. 关键断言：当前 URL 绝对不能变成 404 界面！
    const currentUrl = page.url();
    console.log(`  [当前页面 URL]: ${currentUrl}`);
    ok(!currentUrl.includes('#404') && !currentUrl.endsWith('404'), '点击「添加其他账户」绝不导航到 404 路由');

    const modalDialog = page.locator('.add-account-dialog, .el-dialog:has(.add-account-form-body)');
    ok(await modalDialog.isVisible(), '原生添加账户模态框 (.add-account-dialog) 成功呼出并置顶居中呈现');

    // 6. 核验弹窗内元素与实时交互
    console.log('\n[步骤 5] 核验添加账户模态框内容与表单交互...');
    const inputField = modalDialog.locator('.el-input__inner').first();
    ok(await inputField.isVisible(), '邮箱前缀输入框正常渲染');

    const suffixSelect = page.locator('.add-account-input-group .suffix-select');
    ok(await suffixSelect.isVisible(), '邮箱域名后缀下拉选择器正常渲染');

    // 输入前缀测试实时预览
    await inputField.fill('testmultinew');
    await page.waitForTimeout(400);

    const previewRow = page.locator('.email-preview-row');
    ok(await previewRow.isVisible(), '实时邮箱完整预览行显式呈现');
    const previewVal = await page.locator('.email-preview-row .preview-val').innerText();
    ok(previewVal.includes('testmultinew') && previewVal.includes('@'), `实时邮箱预览计算正确: ${previewVal}`);

    // 关闭弹窗
    const cancelBtn = modalDialog.locator('.el-button:has-text("取消")');
    await cancelBtn.click();
    await page.waitForTimeout(600);
    ok(!(await modalDialog.isVisible()), '点击取消按钮后添加账户模态框正常关闭');

    // 7. 验证直接访问 /mail/u/0/#settings/account 绝不出现 404
    console.log('\n[步骤 6] 验证直达 /mail/u/0/#settings/account 优雅降级兼容，零 404...');
    await page.goto(`${BASE}/mail/u/0/#settings/account`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    // 确认不存在 404 界面
    const notFoundEl = page.locator('.not-found, .error-404, .page-404, h1:has-text("404"), div:has-text("页面未找到")');
    const is404Visible = await notFoundEl.isVisible().catch(() => false);
    ok(!is404Visible, '访问 /mail/u/0/#settings/account 绝不呈现 404 界面');

    // 确认已平滑展示个资/设置页面
    const profileContainer = page.locator('.settings-container, .box, #avatar, #nickname');
    await profileContainer.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    ok(await profileContainer.first().isVisible(), '访问 /settings/account 别名路由平滑落地至个人资料设置视图');

    // 8. 顶栏全局搜索权限安全过滤核验 (杜绝普通用户搜索到管理页点进 404)
    console.log('\n[步骤 7] 顶栏搜索权限过滤核验 (杜绝普通用户搜索管理员页面 404)...');
    const searchInput = page.locator('.topbar-search-wrapper input, .search-container input').first();
    if (await searchInput.isVisible()) {
      await searchInput.click();
      await searchInput.fill('系统设置');
      await page.waitForTimeout(600);

      const sysSettingResult = page.locator('.settings-results-container .search-result-group:has-text("系统设置")');
      const isSysSettingVisible = await sysSettingResult.isVisible().catch(() => false);
      ok(!isSysSettingVisible, '未授权普通用户在搜索框绝不匹配展示管理员专用「系统设置」项');

      await searchInput.fill('个人背景');
      await page.waitForTimeout(600);
      const profileSettingResult = page.locator('.settings-results-container');
      ok(await profileSettingResult.isVisible(), '普通用户合法设置项（个人背景）正常展示');
    }

    // 截图留存核验结果
    await page.screenshot({ path: 'tests/verify_add_account_modal_prod_success.png', fullPage: true });
    console.log('  ✓ 成功保存测试验证截图: tests/verify_add_account_modal_prod_success.png');

  } catch (err) {
    console.error('测试执行异常:', err);
    fail++;
    failures.push(err.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log('\n================================================================');
  console.log(`核验统计: ${pass} 项通过, ${fail} 项失败`);
  if (fail > 0) {
    console.log('失败清单:\n  - ' + failures.join('\n  - '));
    process.exit(1);
  } else {
    console.log('🎉 全部公网全真端到端核验 100% 满分通过！零 404，多开账户原生支援！');
    console.log('================================================================');
  }
}

run();
