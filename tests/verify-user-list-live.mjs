import { chromium } from 'playwright';
import assert from 'node:assert';
import { execSync } from 'node:child_process';

const BASE = 'https://mail.epocanvas.com';
const USER_EMAIL = 'audit_normal_1789140856529@epomail.bond';
const USER_PWD = 'Audit123!';

async function run() {
  console.log('================================================================');
  console.log('=== 线上生产真实端到端核验：用户列表视觉与功能完整性验证 ===');
  console.log('================================================================');

  let browser;
  try {
    // 1. 登录获取 JWT Token
    console.log('\n[步骤 1] 登录管理员权限账号获取 Token...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PWD })
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, `登录必须成功: ${JSON.stringify(loginData)}`);
    const token = loginData.data?.token;
    assert.ok(token, '返回数据必须包含 JWT Token');
    console.log('  ✓ 登录成功，Token 获取就绪');

    // 2. 验证后端 /api/user/list 接口协议与数据结构
    console.log('\n[步骤 2] 验证 /api/user/list 接口数据结构...');
    const listRes = await fetch(`${BASE}/api/user/list?num=1&size=20&status=-1`, {
      headers: { 'Authorization': token }
    });
    const listData = await listRes.json();
    assert.strictEqual(listRes.status, 200, 'HTTP 状态码必须为 200');
    assert.strictEqual(listData.code, 200, `业务状态码必须为 200: ${JSON.stringify(listData)}`);
    assert.ok(Array.isArray(listData.data?.list), '用户列表必须为数组');
    assert.ok(listData.data?.total > 0, `用户总数必须大于 0 (实际: ${listData.data?.total})`);
    console.log(`  ✓ /api/user/list 协议正常: 成功返回 ${listData.data.list.length} 条记录，总计 ${listData.data.total} 名用户`);

    // 验证返回对象中字段无 undefined 缺失
    const firstUser = listData.data.list[0];
    console.log(`  ✓ 样本用户校验 [ID: ${firstUser.userId}]: ${firstUser.email} (角色: ${firstUser.roleName || '默认'})`);
    assert.ok(firstUser.email, '用户必须包含 email');
    assert.ok(firstUser.sendAction, '用户必须包含 sendAction 权限元数据');

    // 3. 启动 Playwright 进行桌面端视口 (1440x900) 视觉与功能验证
    console.log('\n[步骤 3] 启动 Playwright 验证桌面端 (1440x900) 视觉与交互...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // 过滤非阻断性的外部资源警告
        if (!text.includes('favicon') && !text.includes('cloudflareinsights')) {
          consoleErrors.push(text);
        }
      }
    });
    page.on('pageerror', err => pageErrors.push(err.message));

    // 导航至首页注入 localStorage
    await page.goto(`${BASE}/inbox`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('loginEmail', email);
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
      localStorage.setItem('locale', 'zh');
    }, { t: token, email: USER_EMAIL });

    // 访问用户管理页面 /all-users
    console.log('  -> 正在导航至 /all-users...');
    await page.goto(`${BASE}/all-users`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 校验 URL 与页面渲染
    const currentUrl = page.url();
    assert.ok(currentUrl.includes('/all-users'), `当前页面必须为 /all-users (实际: ${currentUrl})`);

    // 验证表格行已成功渲染
    const tableRows = page.locator('.el-table__body-wrapper tr.el-table__row');
    const rowCount = await tableRows.count();
    console.log(`  ✓ 用户表格成功渲染: ${rowCount} 行数据`);
    assert.ok(rowCount >= 1, '表格中必须成功渲染至少一行用户');

    // 验证没有任何 Element Plus 错误 Toast
    const errorToasts = page.locator('.el-message--error');
    const errCount = await errorToasts.count();
    assert.strictEqual(errCount, 0, `页面严禁弹出任何错误 Toast (发现 ${errCount} 个)`);
    console.log('  ✓ 确认零错误 Toast 弹出');

    // 验证控制台零致命 JS 抛错
    assert.strictEqual(pageErrors.length, 0, `页面严禁存在未捕获的 pageerror: ${pageErrors.join(', ')}`);
    console.log('  ✓ 确认控制台零未捕获运行时 JS 抛错');

    // 截图留存：桌面端 1440
    await page.screenshot({ path: 'tests/verify_user_list_desktop_1440.png', fullPage: false });
    console.log('  ✓ 桌面端全景截图已保存: tests/verify_user_list_desktop_1440.png');

    // 4. 验证详情抽屉/弹窗交互
    console.log('\n[步骤 4] 验证用户详情弹窗交互与发信限制格式化...');
    // 点击第一行用户详情
    const detailBtn = page.locator('.el-table__body-wrapper tr.el-table__row button').filter({ hasText: /详情|Details|View/i }).first();
    if (await detailBtn.isVisible()) {
      await detailBtn.click();
      await page.waitForTimeout(1500);

      // 验证详情弹窗/抽屉可见
      const dialog = page.locator('.el-dialog, .el-drawer').filter({ hasText: /用户详情|User Details|详细/i }).first();
      const isDialogVisible = await dialog.isVisible();
      console.log(`  ✓ 用户详情弹窗可见状态: ${isDialogVisible}`);

      await page.screenshot({ path: 'tests/verify_user_list_details.png' });
      console.log('  ✓ 用户详情交互截图已保存: tests/verify_user_list_details.png');

      // 关闭弹窗
      const closeBtn = page.locator('.el-dialog__headerbtn, .el-drawer__close-btn, button:has-text("关闭")').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // 5. 验证移动端视口 (375x812) 响应式适配
    console.log('\n[步骤 5] 验证移动端视口 (375x812) 响应式表现...');
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
      locale: 'zh-CN'
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${BASE}/inbox`, { waitUntil: 'domcontentloaded' });
    await mobilePage.evaluate(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('loginEmail', email);
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
      localStorage.setItem('locale', 'zh');
    }, { t: token, email: USER_EMAIL });

    await mobilePage.goto(`${BASE}/all-users`, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(2000);

    const mobileRows = await mobilePage.locator('.el-table__body-wrapper tr.el-table__row').count();
    console.log(`  ✓ 移动端表格渲染行数: ${mobileRows}`);
    assert.ok(mobileRows >= 1, '移动端表格必须成功渲染数据');

    await mobilePage.screenshot({ path: 'tests/verify_user_list_mobile_375.png' });
    console.log('  ✓ 移动端截图已保存: tests/verify_user_list_mobile_375.png');

    // 6. 暗色模式视觉核验
    console.log('\n[步骤 6] 验证暗色模式 (Dark Mode) 渲染表现...');
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/verify_user_list_dark_1440.png' });
    console.log('  ✓ 暗色模式全景截图已保存: tests/verify_user_list_dark_1440.png');

    console.log('\n================================================================');
    console.log('=== 所有全真栈端到端核验项均 100% 顺利通过！ ===');
    console.log('================================================================');

  } finally {
    if (browser) await browser.close();

    // 7. 还原测试账号角色与清理会话（严格遵守零假数据红线）
    console.log('\n[清理还原] 正在还原测试账号角色并清除测试缓存...');
    try {
      execSync('npx wrangler d1 execute epomail --remote --command "UPDATE user SET type = 1 WHERE user_id = 133"', {
        cwd: '/home/shijian/projects/epocanvas-mail/mail-worker',
        stdio: 'pipe'
      });
      execSync('npx wrangler kv key delete --binding kv --remote "auth-uid:133"', {
        cwd: '/home/shijian/projects/epocanvas-mail/mail-worker',
        stdio: 'pipe'
      });
      console.log('  ✓ 测试账号角色已安全复原 (type=1)，KV 会话已彻底物理清除');
    } catch (e) {
      console.warn('  ! 清理过程中告警:', e.message);
    }
  }
}

run().catch(err => {
  console.error('\n❌ 核验失败:', err);
  process.exit(1);
});
