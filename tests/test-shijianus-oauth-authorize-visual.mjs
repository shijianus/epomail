import { chromium } from 'playwright';
import assert from 'assert';

(async () => {
  console.log('========================================================================');
  console.log('=== 开始 shijianus-blog OAuth 授权界面全新 UI 与链路 Playwright 审计 ===');
  console.log('========================================================================');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err));

  const DOMAIN_BASE = 'https://mail.epocanvas.com';
  const BASE = 'https://epomail.epocanvas.workers.dev';

  try {
    // 1. 登录管理员账号
    console.log('\n[步骤 1] 登录账号 admin@epomail.bond 获取鉴权 Token...');
    const loginRes = await page.request.post(BASE + '/api/login', {
      data: { email: 'admin@epomail.bond', password: '123456' },
      headers: { 'Content-Type': 'application/json' }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, '登录应成功: ' + JSON.stringify(loginData));
    const token = loginData.data?.token;
    console.log('  ✓ 登录成功，获取 Token');

    // 2. 注入 Token 至 DOMAIN_BASE
    console.log('\n[步骤 2] 注入 Token 到', DOMAIN_BASE);
    await page.goto(DOMAIN_BASE + '/inbox', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('token', t);
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
      localStorage.setItem('locale', 'zh');
    }, token);
    await page.waitForTimeout(1000);

    // 3. 打开 shijianus-blog 授权确认页（已登录状态）
    const authUrl = `${DOMAIN_BASE}/oauth/authorize?client_id=epo_live_shijianus_blog&redirect_uri=${encodeURIComponent('https://blog.epocanvas.com/auth/callback')}&scope=openid%20profile%20email%20comments&state=audit_test_state_2026`;
    console.log('\n[步骤 3] 访问线上生产环境 shijianus-blog 授权地址:\n  ', authUrl);
    await page.goto(authUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.consent-state', { timeout: 20000 });
    await page.waitForTimeout(2000);

    // 4. 验证 brand-chip app-chip 是否成功呈现 shijianus-blog 的 Tab 图标
    console.log('\n[步骤 4] 验证 shijianus-blog 的 Logo 识别与 Tab 图标渲染...');
    const appChip = page.locator('.brand-chip.app-chip');
    await appChip.waitFor({ state: 'visible', timeout: 5000 });
    const hasShijianusClass = await appChip.evaluate(el => el.classList.contains('is-shijianus'));
    console.log('  app-chip 包含 is-shijianus 类名:', hasShijianusClass);
    assert.ok(hasShijianusClass, 'shijianus-blog 应用必须成功挂载 is-shijianus 品牌类名');

    const tabSvg = page.locator('.brand-chip.app-chip svg.shijianus-tab-icon');
    const tabSvgCount = await tabSvg.count();
    console.log('  Tab Icon SVG 元素数量:', tabSvgCount);
    assert.strictEqual(tabSvgCount, 1, '必须渲染 shijianus 专属官方 Tab Icon SVG');
    const tabSvgVisible = await tabSvg.isVisible();
    assert.ok(tabSvgVisible, 'Tab Icon SVG 必须在屏幕上清晰可见');
    console.log('  ✓ 成功识别并渲染 shijianus-blog 官方 Tab Icon！');

    // 5. 验证已验证域名胶囊 (取代突兀裸露的 fluent globe)
    console.log('\n[步骤 5] 验证官方已验证域名来源胶囊...');
    const originChip = page.locator('.app-origin-chip');
    assert.strictEqual(await originChip.count(), 1, '必须存在 .app-origin-chip 域名验证胶囊');
    const originText = (await originChip.innerText()).trim();
    console.log('  来源胶囊文本:', originText);
    assert.ok(originText.includes('官方已验证'), '来源胶囊必须带有官方已验证标记');
    assert.ok(originText.includes('blog.epocanvas.com'), '来源胶囊必须展示 blog.epocanvas.com 域名');
    console.log('  ✓ 来源展示已升级为现代微胶囊，突兀的裸 globe 图标已优化！');

    // 6. 验证 scopes-list 授权项目详细说明与 Duotone 图标
    console.log('\n[步骤 6] 验证 scopes-list 授权项目详细说明与图标体系...');
    const scopeItems = page.locator('.scope-card-item');
    const scopeCount = await scopeItems.count();
    console.log('  授权项目条目数:', scopeCount);
    assert.strictEqual(scopeCount, 4, '必须包含 openid, email, profile, comments 全部 4 项权限');

    const scopesContent = await page.locator('.scopes-list').innerText();
    console.log('  授权项目展示内容预览:\n', scopesContent);
    assert.ok(scopesContent.includes('OpenID'), '包含 OpenID 身份标识');
    assert.ok(scopesContent.includes('主电子邮箱地址'), '包含主电子邮箱地址详细释义');
    assert.ok(scopesContent.includes('公开个人资料'), '包含公开个人资料详细释义');
    assert.ok(scopesContent.includes('博客评论与互动管理'), '包含博客评论与互动管理权限');
    assert.ok(scopesContent.includes('只读凭据'), '包含只读凭据标识');
    assert.ok(scopesContent.includes('互动权限'), '包含互动权限标识');
    console.log('  ✓ 授权项目展示与详尽释义全部校验通过！');

    // 7. 严格检验两个操作按钮的对齐性 (1 像素级绝对对齐)
    console.log('\n[步骤 7] 严格检验「授权并继续」和「取消授权」两个按钮的绝对对齐...');
    const authBtn = page.locator('.consent-actions-group .authorize-btn');
    const cancelBtn = page.locator('.consent-actions-group .cancel-btn');
    assert.strictEqual(await authBtn.count(), 1, '必须存在授权按钮');
    assert.strictEqual(await cancelBtn.count(), 1, '必须存在取消按钮');

    const boxAuth = await authBtn.boundingBox();
    const boxCancel = await cancelBtn.boundingBox();
    console.log('  授权按钮盒模型:', boxAuth);
    console.log('  取消按钮盒模型:', boxCancel);

    const deltaX = Math.abs(boxAuth.x - boxCancel.x);
    const deltaW = Math.abs(boxAuth.width - boxCancel.width);
    const deltaH = Math.abs(boxAuth.height - boxCancel.height);

    console.log(`  -> X 轴偏差 (起始水平位置): ${deltaX}px (优化前为 12px)`);
    console.log(`  -> 宽度偏差: ${deltaW}px`);
    console.log(`  -> 高度偏差: ${deltaH}px`);

    assert.ok(deltaX < 0.5, `两按钮 X 起始坐标必须绝对对齐，当前偏差: ${deltaX}px`);
    assert.ok(deltaW < 0.5, `两按钮宽度必须绝对一致，当前偏差: ${deltaW}px`);
    assert.strictEqual(boxAuth.height, 44, '授权按钮高度统一为 44px');
    assert.strictEqual(boxCancel.height, 44, '取消按钮高度统一为 44px');
    console.log('  ✓ 两个按钮已达成 0 像素级严丝合缝绝对对齐！');

    // 8. 截图保存浅色模式视觉审计报告
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/audit_oauth_authorize_light_perfect.png' });
    console.log('  ✓ 浅色模式视觉审计截图已保存: tests/audit_oauth_authorize_light_perfect.png');

    // 9. 切换至暗黑模式审计
    console.log('\n[步骤 8] 切换至深色模式 (Dark Mode) 进行视觉完整性审计...');
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/audit_oauth_authorize_dark_perfect.png' });
    console.log('  ✓ 深色模式视觉审计截图已保存: tests/audit_oauth_authorize_dark_perfect.png');

    // 10. 验证未登录状态下的快速登录表单与对齐
    console.log('\n[步骤 9] 验证未登录状态下的快速登录表单视觉与对齐...');
    await page.evaluate(() => {
      localStorage.removeItem('token');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.login-prompt-state', { timeout: 15000 });
    await page.waitForTimeout(1000);

    const loginAuthBtn = page.locator('.login-prompt-state .authorize-btn');
    const loginCancelBtn = page.locator('.login-prompt-state .cancel-btn');
    const boxLoginAuth = await loginAuthBtn.boundingBox();
    const boxLoginCancel = await loginCancelBtn.boundingBox();
    const deltaLoginX = Math.abs(boxLoginAuth.x - boxLoginCancel.x);
    const deltaLoginW = Math.abs(boxLoginAuth.width - boxLoginCancel.width);
    console.log(`  -> 未登录表单按钮 X 轴偏差: ${deltaLoginX}px`);
    console.log(`  -> 未登录表单按钮宽度偏差: ${deltaLoginW}px`);
    assert.ok(deltaLoginX < 0.5, '未登录态按钮必须绝对对齐');
    assert.ok(deltaLoginW < 0.5, '未登录态按钮宽度必须一致');

    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/audit_oauth_authorize_login_prompt.png' });
    console.log('  ✓ 未登录态视觉审计截图已保存: tests/audit_oauth_authorize_login_prompt.png');

    console.log('\n========================================================================');
    console.log('=== 🎉 所有 Playwright 视觉与链路端到端断言 100% 全绿通过！ ===');
    console.log('========================================================================');

  } catch (err) {
    console.error('❌ 测试未通过:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
