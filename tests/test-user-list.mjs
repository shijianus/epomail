import { chromium } from 'playwright';
import assert from 'assert';

const BASE = 'https://epomail.epocanvas.workers.dev';

async function run() {
  console.log('=== 测试用户列表加载与 API 正常运作 ===');

  // 1. 登录管理员
  console.log('1. 登录管理员获取 Token...');
  const loginRes = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@epomail.bond', password: '123456' })
  });
  const loginData = await loginRes.json();
  console.log('登录结果:', loginData);
  assert.strictEqual(loginData.code, 200, '登录应返回 200');
  const token = loginData.data?.token;
  assert.ok(token, '应包含 Token');

  // 2. 调用 /user/list API
  console.log('2. 调用 /api/user/list 获取用户列表...');
  const listRes = await fetch(`${BASE}/api/user/list?num=1&size=20&status=-1`, {
    headers: {
      'Authorization': token
    }
  });
  const listData = await listRes.json();
  console.log('用户列表响应状态:', listRes.status);
  console.log('用户列表返回数据:', JSON.stringify(listData, null, 2));
  assert.strictEqual(listData.code, 200, '用户列表接口应返回 code 200');
  assert.ok(Array.isArray(listData.data?.list), '用户列表必须为数组');
  assert.ok(listData.data.total >= 1, '用户总数应至少为 1');
  console.log(`✓ 成功获取到 ${listData.data.list.length} 个用户，总计 ${listData.data.total} 个用户`);

  // 检查每个用户对象是否包含所需字段
  for (const u of listData.data.list) {
    console.log(`- 用户 [ID: ${u.userId}] ${u.email}: totpEnabled=${u.totpEnabled}, type=${u.type}, sendEmailCount=${u.sendEmailCount}, receiveEmailCount=${u.receiveEmailCount}, accountCount=${u.accountCount}`);
  }

  // 3. 端到端 Playwright 验证用户管理页面
  console.log('3. 端到端 Playwright 验证用户管理页面渲染...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/inbox`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
    localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
    localStorage.setItem('locale', 'zh');
  }, token);

  await page.goto(`${BASE}/settings/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 点击左侧导航的用户列表
  const userNavLink = page.locator('.settings-nav-item').filter({ hasText: /用户列表|User List/i });
  await userNavLink.first().waitFor({ state: 'visible', timeout: 8000 });
  await userNavLink.first().click();
  await page.waitForTimeout(2500);

  // 验证用户表格是否成功渲染，包含用户数据
  const tableRows = page.locator('.el-table__body-wrapper tr.el-table__row');
  const count = await tableRows.count();
  console.log(`✓ 页面表格渲染行数: ${count}`);
  assert.ok(count >= 1, '用户管理页面必须成功渲染至少一行用户数据');

  // 验证管理员行
  const adminRow = page.locator('.el-table__body-wrapper tr.el-table__row').filter({ hasText: 'admin@epomail.bond' });
  assert.strictEqual(await adminRow.count(), 1, '必须显示管理员账号');
  console.log('✓ 管理员行正确显示');

  // 检查表格中是否无任何错误弹窗
  const errorMsg = page.locator('.el-message--error');
  assert.strictEqual(await errorMsg.count(), 0, '页面不应弹出任何错误提示');

  await browser.close();
  console.log('=== 所有测试项均 100% 通过！===');
}

run().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
