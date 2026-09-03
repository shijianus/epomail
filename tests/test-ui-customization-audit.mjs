import { chromium } from 'playwright';
import assert from 'assert';

const BASE = 'https://epomail.epocanvas.workers.dev';

async function runAudit() {
  console.log('🚀 Launching Playwright Audit for UI Enhancements on:', BASE);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });
  const page = await context.newPage();

  try {
    // 1. Login
    console.log('▶ Step 1: Logging in as admin...');
    const loginRes = await page.request.post(`${BASE}/api/login`, {
      data: { email: 'admin@epomail.bond', password: '123456' },
      headers: { 'Content-Type': 'application/json' }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, `Login failed: ${JSON.stringify(loginData)}`);
    const token = loginData.data?.token;
    assert(token, 'Token must exist');

    // Ensure 2FA is globally enabled for full UI audit
    await page.request.put(`${BASE}/api/setting/set`, {
      data: { allMailMode: 1, totp: 1 },
      headers: { 'Content-Type': 'application/json', 'Authorization': token }
    });

    // Set token in localStorage
    await page.goto(`${BASE}/inbox`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('token', t);
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
      localStorage.setItem('locale', 'zh');
    }, token);

    // 2. Audit General Settings: Wallpaper Grid 4 per row and Container containment
    console.log('▶ Step 2: Auditing General Settings (Wallpaper 4 per row & Container containment)...');
    await page.goto(`${BASE}/settings/general`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Verify wallpaper-presets-grid computed columns
    const gridColumns = await page.locator('.wallpaper-presets-grid').first().evaluate((el) => {
      return window.getComputedStyle(el).gridTemplateColumns.split(' ').length;
    });
    console.log(`  Wallpaper presets grid column count: ${gridColumns}`);
    assert.strictEqual(gridColumns, 4, 'Wallpaper presets grid must strictly have 4 columns per row');

    // Verify container and wallpaper-control-wrap widths
    const isContained = await page.evaluate(() => {
      const container = document.querySelector('.container:has(.wallpaper-presets-grid)');
      const wrap = document.querySelector('.wallpaper-control-wrap');
      if (!container || !wrap) return false;
      const cRect = container.getBoundingClientRect();
      const wRect = wrap.getBoundingClientRect();
      return wRect.right <= cRect.right + 2 && wRect.left >= cRect.left - 2;
    });
    console.log(`  Is wallpaper control wrap contained inside container? ${isContained}`);
    assert(isContained, 'Wallpaper control wrap must fit completely inside container without overflowing');

    await page.screenshot({ path: 'tests/audit_wallpaper_4_cols_contained.png', fullPage: true });
    console.log('  📸 Screenshot saved: tests/audit_wallpaper_4_cols_contained.png');

    // 3. Audit Security Settings: Title positions & Two-Factor Center UI Cohesion
    console.log('▶ Step 3: Auditing Security Settings (Title positions & 2FA Center UI cohesion)...');
    await page.goto(`${BASE}/settings/security`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Check containers and titles on security page
    const containersCount = await page.locator('.box > .container').count();
    console.log(`  Security page .container cards count: ${containersCount}`);
    assert(containersCount >= 2, 'Security page must have at least 2 unified .container cards');

    // Verify 2FA Center title and card
    const twoFactorCenter = page.locator('.container.two-factor-center');
    assert(await twoFactorCenter.isVisible(), 'Two-Factor Center must be a unified .container card');

    const twoFactorTitle = twoFactorCenter.locator('.title');
    assert(await twoFactorTitle.isVisible(), 'Two-Factor Center title must be visible at top of card');
    const twoFactorTitleText = await twoFactorTitle.textContent();
    console.log(`  Two-Factor Center title text: ${twoFactorTitleText.trim()}`);
    assert(twoFactorTitleText.includes('两步验证中心'), 'Title must be 两步验证中心');

    // Verify del-email container and title if rendered
    const delEmailContainer = page.locator('.container.del-email');
    if (await delEmailContainer.isVisible()) {
      const delTitle = delEmailContainer.locator('.title');
      assert(await delTitle.isVisible(), 'Delete account title must be visible');
      console.log(`  Delete account title text: ${await delTitle.textContent()}`);
    }

    // Check banner and styling
    const banner = page.locator('.two-factor-banner');
    assert(await banner.isVisible(), 'Two-factor banner must be visible');

    await page.screenshot({ path: 'tests/audit_security_2fa_unified_ui.png', fullPage: true });
    console.log('  📸 Screenshot saved: tests/audit_security_2fa_unified_ui.png');

    // 4. Audit Profile Details Page (Cover banner + Unified lower cards)
    console.log('▶ Step 4: Auditing Profile View (Cover banner & Unified lower cards)...');
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const coverPhoto = page.locator('.cover-photo');
    assert(await coverPhoto.isVisible(), 'Cover photo banner must be rendered at top');

    const identityCard = page.locator('.profile-identity-card');
    assert(await identityCard.isVisible(), 'Profile identity card must be rendered as unified card');

    const statCards = page.locator('.stat-card');
    const statCardsCount = await statCards.count();
    console.log(`  Profile stat cards count: ${statCardsCount}`);
    assert.strictEqual(statCardsCount, 3, 'Must render 3 stat cards');

    const chartCards = page.locator('.chart-card');
    const chartCardsCount = await chartCards.count();
    console.log(`  Profile chart cards count: ${chartCardsCount}`);
    assert.strictEqual(chartCardsCount, 2, 'Must render 2 chart cards');

    await page.screenshot({ path: 'tests/audit_profile_unified_grounding.png', fullPage: true });
    console.log('  📸 Screenshot saved: tests/audit_profile_unified_grounding.png');

    console.log('🎉 ALL AUDIT VERIFICATIONS PASSED 100%!');
  } finally {
    await browser.close();
  }
}

runAudit().catch((err) => {
  console.error('❌ Audit Failed:', err);
  process.exit(1);
});
