import { chromium } from 'playwright';
import assert from 'assert';

const BASE = process.env.TARGET_URL || 'https://mail.epocanvas.com';
const USER1_EMAIL = 'audit_normal_1789140856529@epomail.bond';
const USER1_PWD = 'Audit123!';

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
  console.log('=== 公网生产全真端到端核验：多账户切换状态常驻化与零回退单账号 ===');
  console.log('================================================================');
  console.log(`[目标公网环境] 基地址: ${BASE}`);

  let browser;

  try {
    // 1. 验证公网后端配置真实持久化
    console.log('\n[步骤 1] 验证公网 /api/setting/websiteConfig 中 multiAccountEnabled 真实持久化...');
    const configRes = await fetch(`${BASE}/api/setting/websiteConfig`);
    const configJson = await configRes.json();
    assert.strictEqual(configJson.code, 200, 'websiteConfig 接口必须返回 200');
    ok(configJson.data?.multiAccountEnabled === 1, '公网线上 setting.multiAccountEnabled 确认为 1 (已由管理员开启)');

    // 2. 登录测试账号获取 Token
    console.log('\n[步骤 2] 登录主测试账号获取 Token...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER1_EMAIL, password: USER1_PWD })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, `登录必须成功: ${JSON.stringify(loginJson)}`);
    const token1 = loginJson.data?.token;
    ok(!!token1, '主测试账号 Token 准备就绪');

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });
    const page = await context.newPage();

    // 3. 打开主账号 /mail/u/0/#inbox，注入双会话 epo_sessions 模拟多账户环境
    console.log('\n[步骤 3] 注入双会话进入 /mail/u/0/#inbox，验证主账号多账户模式生效...');
    await page.goto(`${BASE}/mail/u/0/#inbox`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(({ t1, email1 }) => {
      localStorage.setItem('token', t1);
      localStorage.setItem('loginEmail', email1);
      // 预置两个 session
      const sessions = [
        { u: 0, token: t1, email: email1, name: '主账号' },
        { u: 1, token: t1, email: 'sub_account@epomail.bond', name: '次账号' }
      ];
      localStorage.setItem('epo_sessions', JSON.stringify(sessions));
      localStorage.setItem('multiAccountEnabled', '1');
    }, { t1: token1, email1: USER1_EMAIL });

    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    // 4. 打开头像下拉卡片，验证在 u=0 下呈现多账户卡片
    console.log('\n[步骤 4] 展开主账号头像下拉卡片，检验多账户卡片...');
    const avatarBtn = page.locator('.topbar-actions .avatar-wrap, .avatar').first();
    await avatarBtn.waitFor({ state: 'visible', timeout: 20000 });
    await avatarBtn.click();
    await page.waitForTimeout(800);

    const multiCard0 = page.locator('.gac-multi-account-container, .epo-account-card');
    ok(await multiCard0.isVisible(), 'u=0 页面上多账户卡片成功呈现');
    const singleMenu0 = page.locator('.user-details:not(.epo-account-card)');
    ok((await singleMenu0.count()) === 0 || !(await singleMenu0.first().isVisible()), 'u=0 页面上单账户老式菜单绝不呈现');

    // 5. 展开多账户列表，验证包含第二个会话
    console.log('\n[步骤 5] 展开多账户列表，核验第二会话...');
    const toggleBtn = page.locator('.gac-ma-toggle-btn');
    await toggleBtn.click();
    await page.waitForTimeout(600);

    const otherCard = page.locator('.gac-ma-card.other-account-card');
    ok(await otherCard.first().isVisible(), '第二会话账号卡片在展开列表中可见');

    // 6. 模拟切换至第二账户：直接跳转 /mail/u/1/#inbox
    console.log('\n[步骤 6] 模拟切换至第二账户 (/mail/u/1/#inbox)...');
    await page.goto(`${BASE}/mail/u/1/#inbox`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    // 7. 检验切换后的页面是否常驻多账户模式（零回退单账户）
    console.log('\n[步骤 7] 检验切换后 u=1 页面是否坚决常驻多账户模式...');
    const avatarBtn1 = page.locator('.topbar-actions .avatar-wrap, .avatar').first();
    await avatarBtn1.waitFor({ state: 'visible', timeout: 20000 });
    await avatarBtn1.click();
    await page.waitForTimeout(800);

    const multiCard1 = page.locator('.gac-multi-account-container, .epo-account-card');
    ok(await multiCard1.isVisible(), '切换至 u=1 后多账户卡片依然 100% 坚决常驻呈现');

    const singleMenu1 = page.locator('.user-details:not(.epo-account-card)');
    ok((await singleMenu1.count()) === 0 || !(await singleMenu1.first().isVisible()), '切换至 u=1 后绝不退回单账户模式 (零回退)');

    const localMultiVal = await page.evaluate(() => localStorage.getItem('multiAccountEnabled'));
    ok(localMultiVal === '1', `localStorage.getItem('multiAccountEnabled') 保持常驻化为 '1' (实测: '${localMultiVal}')`);

    await page.screenshot({ path: 'tests/verify_multi_account_switch_persistence.png' });
    console.log('  ✓ 切换常驻核验截图保存: tests/verify_multi_account_switch_persistence.png');

    console.log('\n================================================================');
    console.log(`核验结果汇总: ${pass} 项测试通过, ${fail} 项失败`);
    if (fail > 0) {
      console.error('失败项目:', failures);
      process.exit(1);
    } else {
      console.log('🎉 多账户切换常驻化公网端到端验证 100% 完美通过！');
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

run().catch(err => {
  console.error('测试异常中断:', err);
  process.exit(1);
});
