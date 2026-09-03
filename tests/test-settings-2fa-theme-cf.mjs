import { chromium } from 'playwright';
import assert from 'assert';

const BASE = 'https://epomail.epocanvas.workers.dev';

async function runE2ETests() {
  console.log('🚀 Launching Playwright E2E verification on Cloudflare Workers deployment:', BASE);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });
  const page = await context.newPage();

  try {
    // 1. Login via API
    console.log('▶ Step 1: Logging in via Cloudflare API...');
    const loginRes = await page.request.post(`${BASE}/api/login`, {
      data: { email: 'admin@epomail.bond', password: '123456' },
      headers: { 'Content-Type': 'application/json' }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, `Login failed: ${JSON.stringify(loginData)}`);
    const token = loginData.data?.token;
    assert(token, 'Token must exist');
    console.log('  ✅ Logged in successfully, token retrieved');

    // 2. Set token in localStorage
    await page.goto(`${BASE}/inbox`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('token', t);
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
      localStorage.setItem('locale', 'zh');
    }, token);

    // 3. Test General Settings (profile-setting): Theme mode & System Language
    console.log('▶ Step 2: Testing General Settings (/settings/profile)...');
    await page.goto(`${BASE}/settings/profile`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Verify Theme cards
    const themeCards = page.locator('.theme-card');
    const themeCount = await themeCards.count();
    console.log(`  Found ${themeCount} theme mode cards in General Settings`);
    assert.strictEqual(themeCount, 3, 'Should have 3 theme mode cards (Dark, Light, Auto)');

    // Test switching to Dark mode
    console.log('  Testing theme mode switching: Click Dark Mode...');
    const darkCard = page.locator('.theme-card:has-text("暗色调")').first();
    await darkCard.click();
    await page.waitForTimeout(600);
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    assert.strictEqual(isDark, true, 'document.documentElement should have dark class');
    console.log('  ✅ Dark Mode activated and verified');

    // Test switching to Light mode
    console.log('  Testing theme mode switching: Click Light Mode...');
    const lightCard = page.locator('.theme-card:has-text("亮色调")').first();
    await lightCard.click();
    await page.waitForTimeout(600);
    const isLight = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
    assert.strictEqual(isLight, true, 'document.documentElement should NOT have dark class in Light mode');
    console.log('  ✅ Light Mode activated and verified');

    // Verify System Language selector in General Settings
    const langSelect = page.locator('.language-item').first();
    assert(await langSelect.isVisible(), 'System Language selector should be visible in General Settings');
    console.log('  ✅ System Language located in General Settings');

    // Take screenshot of General Settings
    await page.screenshot({ path: 'tests/cf_prod_general_theme.png', fullPage: true });
    console.log('  📸 Screenshot saved: tests/cf_prod_general_theme.png');

    // 4. Test Security Settings (/settings/security): Google-Style 2FA Center
    console.log('▶ Step 3: Testing Security Settings (/settings/security)...');
    await page.goto(`${BASE}/settings/security`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Verify Language is NOT in Security Settings
    const langInSecurity = page.locator('.box > .language, .box > .container .language-select');
    const hasLangInSecurity = await langInSecurity.count() > 0;
    assert.strictEqual(hasLangInSecurity, false, 'Language selector must NOT exist in Security Settings');
    console.log('  ✅ Language selector correctly removed from Security Settings');

    // Verify Hero Status Banner
    const twoFactorBanner = page.locator('.two-factor-banner');
    assert(await twoFactorBanner.isVisible(), 'Two-Factor Hero Banner must be visible');
    const bannerTitle = await page.locator('.banner-title').textContent();
    console.log('  Banner Title:', bannerTitle);
    assert(bannerTitle.includes('两步验证'), 'Banner title must mention 两步验证');

    // Verify Available Second Steps Container
    const secondStepsCard = page.locator('.second-steps-card');
    assert(await secondStepsCard.isVisible(), 'Second Steps card must be visible');

    // Verify Method 1: Authenticator App (TOTP)
    const appMethod = page.locator('.method-item:has-text("身份验证器应用")').first();
    assert(await appMethod.isVisible(), 'Authenticator App method card must be visible');
    console.log('  ✅ Method 1: Authenticator App verified');

    // Verify Method 2: Backup Recovery Codes
    const backupMethod = page.locator('.method-item:has-text("备用恢复码")').first();
    assert(await backupMethod.isVisible(), 'Backup Recovery Codes method card must be visible');
    console.log('  ✅ Method 2: Backup Recovery Codes verified');

    // Verify Method 3: Passkeys & Security Keys (WebAuthn)
    const passkeyMethod = page.locator('.method-item:has-text("通行密钥与安全密钥")').first();
    assert(await passkeyMethod.isVisible(), 'Passkeys & Security Keys method card must be visible');
    console.log('  ✅ Method 3: Passkeys & Security Keys verified');

    // Verify Add Security Key button
    const addKeyBtn = page.locator('button:has-text("添加安全密钥")').first();
    assert(await addKeyBtn.isVisible(), 'Add Security Key button must be visible');
    console.log('  ✅ Add Security Key button verified');

    // Verify Zero-Knowledge Security Principles card
    const zeroCard = page.locator('.zero-knowledge-card');
    assert(await zeroCard.isVisible(), 'Zero Knowledge card must be visible');
    const zeroText = await zeroCard.textContent();
    assert(zeroText.includes('独立与隐私安全原则') && zeroText.includes('短信'), 'Should state self-contained security principle without SMS');
    console.log('  ✅ Zero Knowledge Security Principles card verified');

    // Take screenshot of Security Settings & 2FA Center
    await page.screenshot({ path: 'tests/cf_prod_security_2fa.png', fullPage: true });
    console.log('  📸 Screenshot saved: tests/cf_prod_security_2fa.png');

    console.log('\n🎉 ALL END-TO-END VERIFICATION CHECKS PASSED ON CLOUDFLARE PRODUCTION!');
  } catch (err) {
    console.error('❌ E2E Test error:', err);
    await page.screenshot({ path: 'tests/cf_prod_error.png', fullPage: true }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

runE2ETests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
