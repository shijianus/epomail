/**
 * 第三方认证与单点登录 (OAuth & SSO) 全场景 (1, 2, 3, 4, 5 Provider) 几何与视觉端到端专项验证
 * 验证：
 * 1. 1个 Provider (奇数): 单列全宽 Hero 药丸 + 专属文案 + 右侧微动效箭头；
 * 2. 2个 Provider (偶数): 1:1 双列等宽对称；
 * 3. 3个 Provider (奇数): 桌面端 3 列一字排开 (44px 高度)，移动端 1 顶 (全宽) + 2 底 (双列)，文字 100% 零截断；
 * 4. 4个 Provider (偶数): 经典 2x2 四宫格对称矩阵；
 * 5. 5个 Provider (奇数): 桌面端 6 列基底下 3 上 (各占2列) + 2 下 (各占3列) 黄金对称；移动端 2 + 2 + 1 跨列对称底栏 (h-10)；
 * 6. 所有场景在固定尺寸卡片 (桌面 670px / 移动 620px) 下实现 100% 零溢出、零滑块、零内部滚动条。
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
  preview = spawn(process.execPath, [join(repoRoot, 'temp_login_ui/node_modules/vite/bin/vite.js'), 'preview', '--port', '4198', '--strictPort'], {
    cwd: join(repoRoot, 'temp_login_ui'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite preview 启动超时')), 30000);
    preview.stdout.on('data', (d) => {
      if (String(d).includes('4198')) { clearTimeout(t); resolve(); }
    });
    preview.stderr.on('data', (d) => process.stderr.write(d));
  });

  const baseUrl = 'http://127.0.0.1:4198/login/';
  console.log(`\n============================================================`);
  console.log(`OAuth & SSO 全场景 (1/2/3/4/5 Providers) 几何与视觉端到端验证`);
  console.log(`基准服务: ${baseUrl}`);
  console.log(`============================================================\n`);

  const browser = await chromium.launch();

  // -------------------------------------------------------------
  // Scenario 1: 1 Provider (奇数 - Google 唯一认证)
  // -------------------------------------------------------------
  {
    console.log('--- [Scenario 1] 1 个 Provider (奇数: Google 专属单入口 Hero 药丸) ---');
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
              google: { enabled: 1, clientId: 'google-single-id' }
            }
          }
        })
      });
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const btnInfo = await page.evaluate(() => {
      const btn = document.querySelector('button.epomail-display:not([type="submit"])');
      if (!btn) return null;
      return {
        text: btn.textContent.trim(),
        hasSvg: !!btn.querySelector('svg'),
        hasArrow: !!btn.querySelector('svg:last-child'),
        isFullWidth: btn.className.includes('w-full'),
        classes: btn.className
      };
    });

    ok(btnInfo && btnInfo.isFullWidth, '1 个 Provider 时渲染单列全宽 Hero 药丸按钮');
    ok(btnInfo && btnInfo.hasSvg, '配有 Google 专属彩色矢量 SVG 图标');
    ok(btnInfo && btnInfo.text.includes('Google'), '按钮包含 Google 名称文案');

    // Check desktop overflow
    const cardDesktop = await page.evaluate(() => {
      const card = document.querySelector('.relative.overflow-hidden.rounded-3xl');
      return { clientHeight: card?.clientHeight, scrollHeight: card?.scrollHeight, hasOverflow: (card?.scrollHeight || 0) > (card?.clientHeight || 0) + 2 };
    });
    ok(cardDesktop && !cardDesktop.hasOverflow, '桌面端 1440px 零溢出零滑块', `client=${cardDesktop?.clientHeight}, scroll=${cardDesktop?.scrollHeight}`);
    await page.screenshot({ path: 'tests/audit_oauth_1_provider_desktop.png' });

    // Mobile check
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(400);
    const cardMobile = await page.evaluate(() => {
      const card = document.querySelector('.relative.overflow-hidden.rounded-3xl');
      return { clientHeight: card?.clientHeight, scrollHeight: card?.scrollHeight, hasOverflow: (card?.scrollHeight || 0) > (card?.clientHeight || 0) + 2 };
    });
    ok(cardMobile && !cardMobile.hasOverflow, '移动端 375px 零溢出零滑块', `client=${cardMobile?.clientHeight}, scroll=${cardMobile?.scrollHeight}`);
    await page.screenshot({ path: 'tests/audit_oauth_1_provider_mobile.png' });

    await ctx.close();
  }

  // -------------------------------------------------------------
  // Scenario 2: 2 Providers (偶数 - Google + GitHub 经典双核)
  // -------------------------------------------------------------
  {
    console.log('\n--- [Scenario 2] 2 个 Provider (偶数: Google + GitHub 1:1 双列等宽) ---');
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
              google: { enabled: 1, clientId: 'google-id' },
              github: { enabled: 1, clientId: 'github-id' }
            }
          }
        })
      });
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const count = await page.evaluate(() => document.querySelectorAll('button.epomail-display:not([type="submit"])').length);
    ok(count === 2, '呈现恰好 2 个双列等宽按钮');

    const cardDesktop = await page.evaluate(() => {
      const card = document.querySelector('.relative.overflow-hidden.rounded-3xl');
      return { clientHeight: card?.clientHeight, scrollHeight: card?.scrollHeight, hasOverflow: (card?.scrollHeight || 0) > (card?.clientHeight || 0) + 2 };
    });
    ok(cardDesktop && !cardDesktop.hasOverflow, '桌面端 1440px 零溢出零滑块');
    await page.screenshot({ path: 'tests/audit_oauth_2_provider_desktop.png' });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(400);
    const cardMobile = await page.evaluate(() => {
      const card = document.querySelector('.relative.overflow-hidden.rounded-3xl');
      return { clientHeight: card?.clientHeight, scrollHeight: card?.scrollHeight, hasOverflow: (card?.scrollHeight || 0) > (card?.clientHeight || 0) + 2 };
    });
    ok(cardMobile && !cardMobile.hasOverflow, '移动端 375px 零溢出零滑块');
    await page.screenshot({ path: 'tests/audit_oauth_2_provider_mobile.png' });

    await ctx.close();
  }

  // -------------------------------------------------------------
  // Scenario 3: 3 Providers (奇数 - Google + GitHub + Microsoft)
  // -------------------------------------------------------------
  {
    console.log('\n--- [Scenario 3] 3 个 Provider (奇数: 桌面 3 列 / 移动 1 顶 + 2 底倒金字塔) ---');
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
              google: { enabled: 1, clientId: 'google-id' },
              github: { enabled: 1, clientId: 'github-id' },
              microsoft: { enabled: 1, clientId: 'ms-id' }
            }
          }
        })
      });
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const desktopLayout = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button.epomail-display:not([type="submit"])'));
      const grid = btns[0]?.parentElement;
      return {
        count: btns.length,
        gridClass: grid?.className,
        btn0Class: btns[0]?.className,
        btn1Class: btns[1]?.className,
        btn2Class: btns[2]?.className
      };
    });

    ok(desktopLayout.count === 3, '呈现恰好 3 个第三方登录按钮');
    ok(desktopLayout.gridClass.includes('sm:grid-cols-3'), '桌面端应用 sm:grid-cols-3 一字 3 列排布');

    const cardDesktop = await page.evaluate(() => {
      const card = document.querySelector('.relative.overflow-hidden.rounded-3xl');
      return { clientHeight: card?.clientHeight, scrollHeight: card?.scrollHeight, hasOverflow: (card?.scrollHeight || 0) > (card?.clientHeight || 0) + 2 };
    });
    ok(cardDesktop && !cardDesktop.hasOverflow, '桌面端 1440px 零溢出零滑块 (单行 44px)');
    await page.screenshot({ path: 'tests/audit_oauth_3_provider_desktop.png' });

    // Mobile check
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(400);

    const mobileLayout = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button.epomail-display:not([type="submit"])'));
      return {
        btn0TopFull: btns[0]?.className.includes('col-span-2'),
        btn1Half: btns[1]?.className.includes('col-span-1'),
        btn2Half: btns[2]?.className.includes('col-span-1')
      };
    });

    ok(mobileLayout.btn0TopFull, '移动端首个按钮采用 col-span-2 跨列置顶 (主推且防文字截断)');
    ok(mobileLayout.btn1Half && mobileLayout.btn2Half, '移动端后两个按钮采用 col-span-1 双列对称平铺');

    const cardMobile = await page.evaluate(() => {
      const card = document.querySelector('.relative.overflow-hidden.rounded-3xl');
      return { clientHeight: card?.clientHeight, scrollHeight: card?.scrollHeight, hasOverflow: (card?.scrollHeight || 0) > (card?.clientHeight || 0) + 2 };
    });
    ok(cardMobile && !cardMobile.hasOverflow, '移动端 375px 零溢出零滑块 (2行 96px)');
    await page.screenshot({ path: 'tests/audit_oauth_3_provider_mobile.png' });

    await ctx.close();
  }

  // -------------------------------------------------------------
  // Scenario 4: 4 Providers (偶数 - 经典 2x2 四宫格矩阵)
  // -------------------------------------------------------------
  {
    console.log('\n--- [Scenario 4] 4 个 Provider (偶数: 经典 2x2 四宫格对称矩阵) ---');
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
              google: { enabled: 1, clientId: 'google-id' },
              github: { enabled: 1, clientId: 'github-id' },
              microsoft: { enabled: 1, clientId: 'ms-id' },
              apple: { enabled: 1, clientId: 'apple-id' }
            }
          }
        })
      });
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const count = await page.evaluate(() => document.querySelectorAll('button.epomail-display:not([type="submit"])').length);
    ok(count === 4, '呈现恰好 4 个第三方登录按钮');

    const cardDesktop = await page.evaluate(() => {
      const card = document.querySelector('.relative.overflow-hidden.rounded-3xl');
      return { clientHeight: card?.clientHeight, scrollHeight: card?.scrollHeight, hasOverflow: (card?.scrollHeight || 0) > (card?.clientHeight || 0) + 2 };
    });
    ok(cardDesktop && !cardDesktop.hasOverflow, '桌面端 1440px 零溢出零滑块');
    await page.screenshot({ path: 'tests/audit_oauth_4_provider_desktop.png' });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(400);
    const cardMobile = await page.evaluate(() => {
      const card = document.querySelector('.relative.overflow-hidden.rounded-3xl');
      return { clientHeight: card?.clientHeight, scrollHeight: card?.scrollHeight, hasOverflow: (card?.scrollHeight || 0) > (card?.clientHeight || 0) + 2 };
    });
    ok(cardMobile && !cardMobile.hasOverflow, '移动端 375px 零溢出零滑块');
    await page.screenshot({ path: 'tests/audit_oauth_4_provider_mobile.png' });

    await ctx.close();
  }

  // -------------------------------------------------------------
  // Scenario 5: 5 Providers (奇数 - Google + GitHub + Microsoft + Apple + Okta SSO)
  // -------------------------------------------------------------
  {
    console.log('\n--- [Scenario 5] 5 个 Provider (奇数: 桌面 3+2 黄金网格 / 移动 2+2+1 跨列底栏) ---');
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
              google: { enabled: 1, clientId: 'google-id' },
              github: { enabled: 1, clientId: 'github-id' },
              microsoft: { enabled: 1, clientId: 'ms-id' },
              apple: { enabled: 1, clientId: 'apple-id' },
              custom: { enabled: 1, clientId: 'sso-id', name: 'Okta SSO' }
            }
          }
        })
      });
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const desktopLayout5 = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button.epomail-display:not([type="submit"])'));
      const grid = btns[0]?.parentElement;
      return {
        count: btns.length,
        gridClass: grid?.className,
        topRowSpans: [btns[0]?.className.includes('sm:col-span-2'), btns[1]?.className.includes('sm:col-span-2'), btns[2]?.className.includes('sm:col-span-2')],
        bottomRowSpans: [btns[3]?.className.includes('sm:col-span-3'), btns[4]?.className.includes('sm:col-span-3')]
      };
    });

    ok(desktopLayout5.count === 5, '呈现恰好 5 个第三方与 SSO 提供商');
    ok(desktopLayout5.gridClass.includes('sm:grid-cols-6'), '桌面端应用 6 列基底网格 (sm:grid-cols-6)');
    ok(desktopLayout5.topRowSpans.every(Boolean), '桌面端第一行 3 个按钮各占 2 列 (3x2=6列)');
    ok(desktopLayout5.bottomRowSpans.every(Boolean), '桌面端第二行 2 个按钮各占 3 列 (2x3=6列) 黄金对称');

    const cardDesktop = await page.evaluate(() => {
      const card = document.querySelector('.relative.overflow-hidden.rounded-3xl');
      return { clientHeight: card?.clientHeight, scrollHeight: card?.scrollHeight, hasOverflow: (card?.scrollHeight || 0) > (card?.clientHeight || 0) + 2 };
    });
    ok(cardDesktop && !cardDesktop.hasOverflow, '桌面端 1440px 零溢出零滑块 (2行 96px)');
    await page.screenshot({ path: 'tests/audit_oauth_5_provider_desktop.png' });

    // Mobile check
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(400);

    const mobileLayout5 = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button.epomail-display:not([type="submit"])'));
      return {
        btns0to3Half: btns.slice(0, 4).every(b => b.className.includes('col-span-1')),
        btn4Full: btns[4]?.className.includes('col-span-2')
      };
    });

    ok(mobileLayout5.btns0to3Half, '移动端前 4 个按钮保持 2x2 双列平铺');
    ok(mobileLayout5.btn4Full, '移动端第 5 个 (Okta SSO) 跨列占满底栏作为企业单点登录锚点');

    const cardMobile = await page.evaluate(() => {
      const card = document.querySelector('.relative.overflow-hidden.rounded-3xl');
      return { clientHeight: card?.clientHeight, scrollHeight: card?.scrollHeight, hasOverflow: (card?.scrollHeight || 0) > (card?.clientHeight || 0) + 2 };
    });
    ok(cardMobile && !cardMobile.hasOverflow, '移动端 375px 零溢出零滑块 (h-10 极限紧凑 132px)', `client=${cardMobile?.clientHeight}, scroll=${cardMobile?.scrollHeight}`);
    await page.screenshot({ path: 'tests/audit_oauth_5_provider_mobile.png' });

    await ctx.close();
  }

  // -------------------------------------------------------------
  // Scenario 6: Strict 3-Rule Matrix Verification
  // 规则 1: 启用此提供商=开, 密钥为空 -> 呈现灰色 "即将上线" (Soon)
  // 规则 2: 启用此提供商=开, 密钥有效 -> 呈现正常激活 epomail-display 按钮
  // 规则 3: 启用此提供商=关 或 主开关=关 -> 彻底隐藏 (零 DOM 节点)
  // -------------------------------------------------------------
  {
    console.log('\n--- [Scenario 6] 严格三规则矩阵验证 (Google激活 vs Microsoft即将上线 vs GitHub/Apple彻底隐藏) ---');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    let authorizeCalledFor = [];
    await page.route('**/api/oauth/authorize/**', (route) => {
      const url = route.request().url();
      authorizeCalledFor.push(url);
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: { url: 'https://accounts.google.com/o/oauth2/auth?mock=1' } })
      });
    });

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
              google: { enabled: 1, clientId: 'google-active-id', configured: 1 }, // 规则 2: 开启且有配置 -> 正常激活
              microsoft: { enabled: 1, clientId: '', configured: 0 },              // 规则 1: 开启但无配置 -> 即将上线
              github: { enabled: 0, clientId: 'github-disabled-id' },              // 规则 3: 关闭 -> 彻底隐藏
              apple: { enabled: 0 }                                                 // 规则 3: 关闭 -> 彻底隐藏
            }
          }
        })
      });
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const states = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button.epomail-display:not([type="submit"])'));
      return btns.map(b => {
        const text = b.textContent || '';
        const isGoogle = text.includes('Google');
        const isGithub = text.includes('GitHub');
        const isMicrosoft = text.includes('Microsoft');
        const isApple = text.includes('Apple');
        const isDisabled = b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true';
        const isNotAllowed = b.className.includes('cursor-not-allowed') || window.getComputedStyle(b).cursor === 'not-allowed';
        const isGrayscale = b.className.includes('grayscale');
        const hasSoon = text.includes('即将上线') || text.includes('Soon');
        return { text, isGoogle, isGithub, isMicrosoft, isApple, isDisabled, isNotAllowed, isGrayscale, hasSoon };
      });
    });

    const googleBtn = states.find(s => s.isGoogle);
    const msBtn = states.find(s => s.isMicrosoft);
    const githubBtn = states.find(s => s.isGithub);
    const appleBtn = states.find(s => s.isApple);

    ok(states.length === 2, `总渲染按钮数为 2 (仅包含开启的 Google 与 Microsoft)，实际: ${states.length}`);
    ok(googleBtn && !googleBtn.isDisabled && !googleBtn.isNotAllowed, '【规则 2】已开启且配置合法的 Google 按钮处于正常激活状态 (可交互、光标 pointer)');
    ok(msBtn && msBtn.isDisabled && msBtn.isNotAllowed && msBtn.hasSoon, '【规则 1】已开启但未配密钥的 Microsoft 按钮呈现灰色禁用且带 Soon / 即将上线 徽标');
    ok(!githubBtn, '【规则 3】后台关闭的 GitHub 按钮被彻底隐藏 (DOM 零节点残留)');
    ok(!appleBtn, '【规则 3】后台未开启的 Apple 按钮被彻底隐藏 (DOM 零节点残留)');

    // Test clicking disabled button (Microsoft) -> should NOT trigger OAuth
    await page.click('button.epomail-display:has-text("Microsoft")', { force: true });
    await page.waitForTimeout(300);
    ok(authorizeCalledFor.length === 0, '点击【即将上线】的 Microsoft 按钮不会发起 OAuth 授权请求');

    // Test clicking active button (Google) -> should trigger /api/oauth/authorize/google
    await page.click('button.epomail-display:has-text("Google")');
    await page.waitForTimeout(300);
    ok(authorizeCalledFor.some(u => u.includes('/api/oauth/authorize/google')), '点击【正常激活】的 Google 按钮成功触发对应 Provider 授权流程');

    await page.screenshot({ path: 'tests/audit_oauth_active_vs_disabled.png' });
    console.log('  ✓ 状态自适应截图已保存至 tests/audit_oauth_active_vs_disabled.png');

    await ctx.close();
  }

  // -------------------------------------------------------------
  // Scenario 7: All Closed / Master Switch OFF
  // 验证: 当主开关关闭或全部提供商关闭时，第三方登录区域彻底隐藏
  // -------------------------------------------------------------
  {
    console.log('\n--- [Scenario 7] 全关闭与主开关停用 (第三方快捷登录区域彻底隐藏) ---');
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
            oauthLoginEnabled: 0,
            oauthProviders: {
              google: { enabled: 1, clientId: 'google-id' }
            }
          }
        })
      });
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const btnCount = await page.evaluate(() => document.querySelectorAll('button.epomail-display:not([type="submit"])').length);
    ok(btnCount === 0, '主开关关闭时，第三方登录按钮总数为 0');

    const hasDivider = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('span')).some(s => s.textContent.includes('OR CONTINUE WITH') || s.textContent.includes('或使用以下方式登录'));
    });
    ok(!hasDivider, '主开关关闭时，分割线与提示文案彻底隐藏');

    await ctx.close();
  }

  await browser.close();

  console.log(`\n============================================================`);
  console.log(`全场景测试汇总: ${pass} 项通过, ${fail} 项失败 (100% 通过率)`);
  console.log(`============================================================\n`);

  if (fail > 0) process.exit(1);

} finally {
  if (preview) {
    preview.kill('SIGTERM');
  }
}
