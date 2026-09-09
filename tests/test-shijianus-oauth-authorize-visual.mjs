import { chromium } from 'playwright';
import assert from 'assert';

(async () => {
  console.log('========================================================================');
  console.log('=== 开始针对真实生产环境 shijianus-blog 标签页图片与授权页的 Playwright 审计 ===');
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
    const authUrl = `${DOMAIN_BASE}/oauth/authorize?client_id=epo_live_shijianus_blog&redirect_uri=${encodeURIComponent('https://blog.epocanvas.com/auth/callback')}&scope=openid%20profile%20email%20comments&state=audit_test_state_tab_img`;
    console.log('\n[步骤 3] 访问线上生产环境 shijianus-blog 授权地址:\n  ', authUrl);
    await page.goto(authUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.consent-state', { timeout: 20000 });
    await page.waitForTimeout(2000);

    // 4. 验证 brand-chip app-chip 是否直接使用了标签页图片 (<img> 形式)
    console.log('\n[步骤 4] 验证 brand-chip app-chip 是否直接采用现成标签页图片 (<img> 形式)...');
    const appChip = page.locator('.brand-chip.app-chip');
    await appChip.waitFor({ state: 'visible', timeout: 5000 });

    const appImg = page.locator('.brand-chip.app-chip img.app-chip-img');
    const imgCount = await appImg.count();
    console.log('  app-chip 内 <img> 元素数量:', imgCount);
    assert.strictEqual(imgCount, 1, '必须通过 <img> 标签直接展示现成的标签页图片');

    const imgSrc = await appImg.getAttribute('src');
    console.log('  app-chip 渲染的图片来源 (src):', imgSrc);
    assert.ok(
      imgSrc.includes('favicon.png') || imgSrc.includes('shijianus-favicon.png'),
      '图片来源必须为博客现成标签页展示图片: ' + imgSrc
    );

    // 验证图片自然尺寸大于 0 (即已成功加载且未发生 broken image)
    const naturalWidth = await appImg.evaluate(img => img.naturalWidth);
    const naturalHeight = await appImg.evaluate(img => img.naturalHeight);
    console.log(`  图片自然尺寸: ${naturalWidth} x ${naturalHeight}`);
    assert.ok(naturalWidth > 0 && naturalHeight > 0, '图片必须成功加载且自然尺寸大于 0');
    console.log('  ✓ 成功直接采用标签页现成展示图片（粉发少女动漫头像），无破损无虚假新建！');

    // 5. 验证官方已验证域名来源胶囊与微胶囊
    console.log('\n[步骤 5] 验证官方已验证域名来源胶囊...');
    const originChip = page.locator('.app-origin-chip');
    assert.strictEqual(await originChip.count(), 1, '必须存在 .app-origin-chip 域名验证胶囊');
    const originText = (await originChip.innerText()).trim();
    console.log('  来源胶囊文本:', originText);
    assert.ok(originText.includes('官方已验证'), '来源胶囊必须带有官方已验证标记');
    assert.ok(originText.includes('blog.epocanvas.com'), '来源胶囊必须展示 blog.epocanvas.com 域名');

    // 6. 验证 scopes-list 授权项目详细说明与 Duotone 图标
    console.log('\n[步骤 6] 验证 scopes-list 授权项目详细说明与图标体系...');
    const scopeItems = page.locator('.scope-card-item');
    const scopeCount = await scopeItems.count();
    console.log('  授权项目条目数:', scopeCount);
    assert.strictEqual(scopeCount, 4, '必须包含 openid, email, profile, comments 全部 4 项权限');
    const scopesContent = await page.locator('.scopes-list').innerText();
    assert.ok(scopesContent.includes('OpenID'), '包含 OpenID 身份标识');
    assert.ok(scopesContent.includes('主电子邮箱地址'), '包含主电子邮箱地址详细释义');
    assert.ok(scopesContent.includes('公开个人资料'), '包含公开个人资料详细释义');
    assert.ok(scopesContent.includes('博客评论与互动管理'), '包含博客评论与互动管理权限');
    console.log('  ✓ 授权项目展示与详尽释义全部校验通过！');

    // 7. 严格检验两个操作按钮的对齐性 (0 像素级绝对对齐)
    console.log('\n[步骤 7] 严格检验「授权并继续」和「取消授权」两个按钮的绝对对齐...');
    const authBtn = page.locator('.consent-actions-group .authorize-btn');
    const cancelBtn = page.locator('.consent-actions-group .cancel-btn');
    const boxAuth = await authBtn.boundingBox();
    const boxCancel = await cancelBtn.boundingBox();
    const deltaX = Math.abs(boxAuth.x - boxCancel.x);
    const deltaW = Math.abs(boxAuth.width - boxCancel.width);
    console.log(`  -> X 轴偏差: ${deltaX}px, 宽度偏差: ${deltaW}px, 高度: ${boxAuth.height}px`);
    assert.ok(deltaX < 0.5, '按钮 X 轴必须严格对齐');
    assert.ok(deltaW < 0.5, '按钮宽度必须严格一致');
    assert.strictEqual(boxAuth.height, 44, '授权按钮高度统一为 44px');
    assert.strictEqual(boxCancel.height, 44, '取消按钮高度统一为 44px');
    console.log('  ✓ 按钮 0 像素级对齐校验通过！');

    // 8. 保存高清截图
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/audit_oauth_authorize_with_real_tab_logo.png' });
    console.log('  ✓ 真实标签页 Logo 视觉审计截图已保存: tests/audit_oauth_authorize_with_real_tab_logo.png');

    // 9. 切换至深色模式 (Dark Mode) 进行视觉审计
    console.log('\n[步骤 8] 切换至深色模式 (Dark Mode) 进行视觉审计...');
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/audit_oauth_authorize_dark_perfect.png' });
    console.log('  ✓ 深色模式视觉审计截图已保存: tests/audit_oauth_authorize_dark_perfect.png');

    // 10. 验证未登录状态下的快速登录表单
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
    console.log(`  -> 未登录表单按钮 X 轴偏差: ${deltaLoginX}px, 宽度偏差: ${deltaLoginW}px`);
    assert.ok(deltaLoginX < 0.5, '未登录态按钮必须绝对对齐');
    assert.ok(deltaLoginW < 0.5, '未登录态按钮宽度必须一致');

    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/audit_oauth_authorize_login_prompt.png' });
    console.log('  ✓ 未登录态视觉审计截图已保存: tests/audit_oauth_authorize_login_prompt.png');

    console.log('\n========================================================================');
    console.log('=== 🎉 Playwright 真实标签页 Logo 与授权全链路审计 100% 通过！ ===');
    console.log('========================================================================');

  } catch (err) {
    console.error('❌ 测试未通过:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
