/**
 * 第三方认证与单点登录 (OAuth & SSO) 按钮及交互专项验证
 * 验证：
 * 1. 当开启第三方认证时，登录卡片呈现完备的第三方快捷登录按钮（Google、GitHub、Microsoft、Apple、Custom SSO 等）；
 * 2. 每个按钮均包含标准 class 且配有专属品牌矢量 SVG 图标与文本；
 * 3. 卡片容器锁定在 h-[620px] sm:h-[670px] 下实现完美自适应，零滚动条、零滑块溢出；
 * 4. 移动端 (375px) 与桌面端 (1440px) 视觉对齐；
 * 5. 点击交互与即将上线状态反馈完备。
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const { chromium } = await import(join(repoRoot, 'node_modules/playwright/index.mjs'));

let preview = null;
let pass = 0;
let fail = 0;

const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

try {
  preview = spawn(process.execPath, [join(repoRoot, 'temp_login_ui/node_modules/vite/bin/vite.js'), 'preview', '--port', '4195', '--strictPort'], {
    cwd: join(repoRoot, 'temp_login_ui'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite preview 启动超时')), 30000);
    preview.stdout.on('data', (d) => {
      if (String(d).includes('4195')) { clearTimeout(t); resolve(); }
    });
    preview.stderr.on('data', (d) => process.stderr.write(d));
  });

  const baseUrl = 'http://127.0.0.1:4195/login/';
  console.log(`\n========================================`);
  console.log(`OAuth & SSO 按钮与卡片几何验证: ${baseUrl}`);
  console.log(`========================================\n`);

  const browser = await chromium.launch();

  // Test 1: Desktop Viewport with OAuth Enabled
  {
    console.log('[Test 1] 桌面端 (1440x900) 第三方认证与单点登录按钮渲染');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    // Mock websiteConfig with oauthLoginEnabled: 1
    await page.route('**/api/setting/websiteConfig', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: {
            title: 'EpoMail',
            oauthLoginEnabled: 1,
            oauthProviders: {}
          }
        })
      });
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Check divider text
    const orText = await page.textContent('span:has-text("或通过以下方式继续"), span:has-text("OR CONTINUE WITH")');
    ok(!!orText, '呈现分割线引导文本', `text=${orText}`);

    // Check OAuth buttons
    const buttons = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button.epomail-display')).filter(b => b.getAttribute('type') === 'button' && (b.textContent.includes('Google') || b.textContent.includes('GitHub') || b.textContent.includes('Microsoft') || b.textContent.includes('Apple') || b.textContent.includes('SSO')));
      return btns.map(b => ({
        text: b.textContent.trim(),
        className: b.className,
        hasSvg: !!b.querySelector('svg'),
        svgClasses: b.querySelector('svg')?.getAttribute('class'),
        height: getComputedStyle(b).height
      }));
    });

    ok(buttons.length >= 4, `支持至少 4 个第三方登录按钮 (当前=${buttons.length})`);
    
    const providersFound = buttons.map(b => b.text);
    ok(providersFound.some(t => t.includes('Google')), '包含 Google 登录按钮');
    ok(providersFound.some(t => t.includes('GitHub')), '包含 GitHub 登录按钮');
    ok(providersFound.some(t => t.includes('Microsoft')), '包含 Microsoft 登录按钮');
    ok(providersFound.some(t => t.includes('Apple')), '包含 Apple 登录按钮');

    const allHaveSvg = buttons.every(b => b.hasSvg);
    ok(allHaveSvg, '每个第三方登录按钮均配有专属矢量 SVG 品牌图标');

    const allHaveStandardClass = buttons.every(b => 
      b.className.includes('epomail-display') &&
      b.className.includes('h-11') &&
      b.className.includes('focus-visible:ring-[#67e8f9]')
    );
    ok(allHaveStandardClass, '每个按钮均具备完整的 epomail-display、h-11 与 focus-visible:ring-[#67e8f9] 类名');

    // Check card container overflow
    const cardMetrics = await page.evaluate(() => {
      const card = document.querySelector('.relative.overflow-hidden.rounded-3xl');
      if (!card) return null;
      return {
        clientHeight: card.clientHeight,
        scrollHeight: card.scrollHeight,
        hasOverflow: card.scrollHeight > card.clientHeight + 2
      };
    });

    ok(cardMetrics && !cardMetrics.hasOverflow, '卡片在 670px 高度内实现完美几何适配 (零溢出、零滚动条)', `clientHeight=${cardMetrics?.clientHeight}, scrollHeight=${cardMetrics?.scrollHeight}`);

    // Screenshot
    await page.screenshot({ path: 'tests/audit_oauth_sso_desktop_1440.png' });
    console.log('  → 截图已保存至 tests/audit_oauth_sso_desktop_1440.png');

    // Click Google button to test feedback
    await page.route('**/api/oauth/authorize/google*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 400,
          message: 'Provider google is not configured'
        })
      });
    });

    const googleBtn = page.locator('button.epomail-display:has-text("Google")');
    await googleBtn.click();
    await page.waitForTimeout(500);

    const errorMsg = await page.textContent('[role="alert"]');
    ok(!!errorMsg, '点击未配置 Provider 触发友好提示', `msg=${errorMsg}`);

    await ctx.close();
  }

  // Test 2: Mobile Viewport (375x667)
  {
    console.log('\n[Test 2] 移动端 (375x667) 紧凑视口下第三方登录自适应排版');
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();

    await page.route('**/api/setting/websiteConfig', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: {
            title: 'EpoMail',
            oauthLoginEnabled: 1,
            oauthProviders: {}
          }
        })
      });
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const cardMetricsMobile = await page.evaluate(() => {
      const card = document.querySelector('.relative.overflow-hidden.rounded-3xl');
      if (!card) return null;
      return {
        clientHeight: card.clientHeight,
        scrollHeight: card.scrollHeight,
        hasOverflow: card.scrollHeight > card.clientHeight + 2
      };
    });

    ok(cardMetricsMobile && !cardMetricsMobile.hasOverflow, '移动端 375px 下卡片几何高度完全自适应 (零滑块、零溢出)', `clientHeight=${cardMetricsMobile?.clientHeight}, scrollHeight=${cardMetricsMobile?.scrollHeight}`);

    await page.screenshot({ path: 'tests/audit_oauth_sso_mobile_375.png' });
    console.log('  → 截图已保存至 tests/audit_oauth_sso_mobile_375.png');

    await ctx.close();
  }

  // Test 3: Custom SSO Configured
  {
    console.log('\n[Test 3] 自定义 SSO 提供商 (Custom SSO / Enterprise OIDC) 动态展示');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    await page.route('**/api/setting/websiteConfig', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          data: {
            title: 'EpoMail',
            oauthLoginEnabled: 1,
            oauthProviders: {
              google: { enabled: 1, clientId: 'google-client-id-123' },
              github: { enabled: 1, clientId: 'github-client-id-456' },
              microsoft: { enabled: 1, clientId: 'ms-client-id-789' },
              apple: { enabled: 1, clientId: 'apple-client-id-000' },
              custom: { enabled: 1, clientId: 'sso-client-id', name: 'Okta SSO' }
            }
          }
        })
      });
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const customBtnText = await page.textContent('button.epomail-display:has-text("Okta SSO")');
    ok(!!customBtnText, '动态呈现配置的自定义 SSO 提供商名称 (Okta SSO)', `text=${customBtnText}`);

    await page.screenshot({ path: 'tests/audit_oauth_custom_sso_desktop.png' });
    console.log('  → 截图已保存至 tests/audit_oauth_custom_sso_desktop.png');

    await ctx.close();
  }

  await browser.close();

  console.log(`\n========================================`);
  console.log(`测试结果: ${pass} 通过, ${fail} 失败`);
  console.log(`========================================\n`);

  if (fail > 0) process.exit(1);

} finally {
  if (preview) {
    preview.kill('SIGTERM');
  }
}
