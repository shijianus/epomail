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
  console.log('=== 公网视觉核验：设定页单界面统一展示与URL分流防越权 ===');
  console.log('================================================================');
  console.log(`[目标公网环境] 基地址: ${BASE}`);

  let browser;

  try {
    // 1. 登录公网普通测试用户
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

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    // 预注入 Token 至 localStorage
    await context.addInitScript(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email }]));
    }, { t: token, email: USER_EMAIL });

    const page = await context.newPage();
    page.on('console', msg => console.log('  [NORMAL BROWSER]', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('  [NORMAL BROWSER ERROR]', err.message));

    // 2. 打开公网设置页（普通用户身份）
    console.log('\n[步骤 2] 验证普通用户访问个人设置页与防越权...');
    await page.goto(`${BASE}/mail/u/0/#settings/profile`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.settings-layout', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const currentUrl = page.url();
    console.log(`  当前 URL: ${currentUrl}`);
    ok(currentUrl.includes('#settings/profile'), 'URL 正确保持为 #settings/profile');

    // 验证侧边栏只展示「设置」个人项，不展示「管理」项
    const profileItem = page.locator('.settings-nav-item:has-text("个资")').first();
    const isProfileVisible = await profileItem.isVisible();
    ok(isProfileVisible, '个人设置项（个资）正常渲染且可见');

    const settingSectionTitle = page.locator('.nav-section-title:has-text("设置")').first();
    ok(await settingSectionTitle.isVisible(), '普通用户正常渲染「设置」板块标题');

    const manageSectionTitle = page.locator('.nav-section-title:has-text("管理")');
    const manageTitleCount = await manageSectionTitle.count();
    ok(manageTitleCount === 0, '普通用户绝不渲染「管理」板块标题与入口');

    // 截图普通用户设置页
    await page.screenshot({ path: 'tests/verify_settings_normal_user.png', fullPage: true });
    console.log('  📸 已保存普通用户公网设置页截图: tests/verify_settings_normal_user.png');

    // 3. 尝试越权访问 #manage/admin/system
    console.log('\n[步骤 3] 测试普通用户输入 URL 越权访问 #manage/admin/system 阻断...');
    await page.goto(`${BASE}/mail/u/0/#manage/admin/system`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const blockedUrl = page.url();
    console.log(`  越权拦截后 URL 重定向至: ${blockedUrl}`);
    ok(blockedUrl.includes('#settings/profile'), '普通用户越权访问管理路由被坚决拦截并回退至 #settings/profile');

    // 4. 验证具备管理权限（站长角色）在同一个界面中同时展示设置与管理
    console.log('\n[步骤 4] 验证管理员身份下单界面统一展示「设置」与「管理」...');
    const adminPage = await context.newPage();
    adminPage.on('console', msg => console.log('  [ADMIN BROWSER]', msg.type(), msg.text()));

    // 拦截 loginUserInfo 为具备全部管理权限的站长
    await adminPage.route('**/api/my/loginUserInfo', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            userId: 1,
            email: 'admin@epomail.bond',
            name: '站长',
            permKeys: ['*'],
            role: { roleId: 6, roleCode: 'master', name: '站长' }
          }
        }
      });
    });

    await adminPage.goto(`${BASE}/mail/u/0/#settings/profile`, { waitUntil: 'domcontentloaded' });
    await adminPage.waitForSelector('.settings-layout', { timeout: 15000 });
    await adminPage.waitForSelector('.nav-section-title:has-text("管理")', { timeout: 15000 });
    await adminPage.waitForTimeout(1500);

    // 验证同一个侧边栏中同时存在「设置」和「管理」
    const adminSettingSection = adminPage.locator('.nav-section-title:has-text("设置")').first();
    const adminManageSection = adminPage.locator('.nav-section-title:has-text("管理")').first();
    ok(await adminSettingSection.isVisible(), '同一界面侧边栏中「设置」板块可见');
    ok(await adminManageSection.isVisible(), '同一界面侧边栏中「管理」板块可见（一体化展示）');

    // 验证管理项下的具体按钮
    const sysSettingLink = adminPage.locator('.settings-nav-item:has-text("系统设置")').first();
    ok(await sysSettingLink.isVisible(), '管理板块下的「系统设置」项正常渲染可见');

    const usersLink = adminPage.locator('.settings-nav-item:has-text("用户列表")').first();
    ok(await usersLink.isVisible(), '管理板块下的「用户列表」项正常渲染可见');

    // 截图管理员同一界面双板块
    await adminPage.screenshot({ path: 'tests/verify_settings_unified_admin_sidebar.png', fullPage: true });
    console.log('  📸 已保存管理员单界面设置与管理截图: tests/verify_settings_unified_admin_sidebar.png');

    // 5. 点击「系统设置」，验证仍在同一个界面，同时 URL 变为 #manage/admin/system
    console.log('\n[步骤 5] 切换至管理控制台分页，验证界面不跳转/不割裂且URL精准对齐...');
    await sysSettingLink.click();
    await adminPage.waitForTimeout(2000);

    const manageUrl = adminPage.url();
    console.log(`  点击系统设置后 URL: ${manageUrl}`);
    ok(manageUrl.includes('#manage/admin/system'), '点击管理项后 URL 严格绑定身分组并切换为 #manage/admin/system');

    // 验证侧边栏仍然保持完整，两板块依然都在
    ok(await adminSettingSection.isVisible(), '点击管理项后侧边栏「设置」板块依然存在且未被折叠/切页');
    ok(await adminManageSection.isVisible(), '点击管理项后侧边栏「管理」板块依然存在');

    // 截图系统设置管理页面的展示（左侧一体化导航，右侧管理内容）
    await adminPage.screenshot({ path: 'tests/verify_settings_unified_admin_manage_system.png', fullPage: true });
    console.log('  📸 已保存系统设置渲染截图: tests/verify_settings_unified_admin_manage_system.png');

    // 点击「个资」切换回个人设置
    const adminProfileLink = adminPage.locator('.settings-nav-item:has-text("个资")').first();
    await adminProfileLink.click();
    await adminPage.waitForTimeout(1500);

    const backProfileUrl = adminPage.url();
    console.log(`  点击个资后 URL: ${backProfileUrl}`);
    ok(backProfileUrl.includes('#settings/profile'), '点击个人设置项后 URL 平滑切回 #settings/profile');
    ok(await adminSettingSection.isVisible(), '切换回个人设置后侧边栏依然完整统一');

  } catch (err) {
    console.error('❌ 执行异常:', err);
    fail++;
    failures.push(err.message);
  } finally {
    if (browser) await browser.close();
  }

  console.log('\n================================================================');
  console.log(`=== 验收结果: 通过: ${pass}, 失败: ${fail} ===`);
  if (failures.length > 0) {
    console.log('失败清单:', failures);
    process.exit(1);
  } else {
    console.log('🎉 所有公网视觉与URL分流端到端断言全部通过！');
    process.exit(0);
  }
}

run();
