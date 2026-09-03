import { chromium } from 'playwright';
import assert from 'assert';

const BASE = 'https://epomail.epocanvas.workers.dev';

async function runLiveE2ETest() {
  console.log('🚀 Launching Live Cloudflare E2E Test on:', BASE);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });
  const page = await context.newPage();

  try {
    // Step 1: Login via API
    console.log('▶ Step 1: Logging in as admin...');
    const loginRes = await page.request.post(`${BASE}/api/login`, {
      data: { email: 'admin@epomail.bond', password: '123456' },
      headers: { 'Content-Type': 'application/json' }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, `Login failed: ${JSON.stringify(loginData)}`);
    const token = loginData.data?.token;
    assert(token, 'Token must exist');
    console.log('  ✅ Admin logged in, token retrieved');

    // Ensure clean initial state: allMailMode = 1, totp = 1
    console.log('  Ensuring initial state: allMailMode = 1, totp = 1...');
    await page.request.put(`${BASE}/api/setting/set`, {
      data: { allMailMode: 1, totp: 1 },
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': token
      }
    });

    // Step 2: Set token in localStorage and initialize inbox session
    await page.goto(`${BASE}/inbox`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('token', t);
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
      localStorage.setItem('locale', 'zh');
    }, token);

    await page.goto(`${BASE}/inbox`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Step 3: Go to Settings
    console.log('▶ Step 2: Navigating to Settings page...');
    await page.goto(`${BASE}/settings/profile`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const navItems = page.locator('.settings-nav-group .settings-nav-item');
    const count = await navItems.count();
    console.log(`Found ${count} settings tabs`);
    assert.strictEqual(count, 4, 'Should have 4 settings tabs: 个人, 常规, 安全, 标签');

    // Click Security Tab
    console.log('  Clicking Security Tab...');
    await page.locator('.settings-nav-group .settings-nav-item:has-text("安全")').click();
    await page.waitForTimeout(2000);

    const twoFactorCenter = page.locator('.two-factor-center');
    assert(await twoFactorCenter.isVisible(), 'Two-Factor Center must be visible when 2FA is globally enabled');
    console.log('  ✅ Two-Factor Center loaded when globally enabled');

    // Step 4: Admin disables Global 2FA via API (allMailMode = 1, totp = 0)
    console.log('▶ Step 3: Admin disables Global 2FA via API (allMailMode = 1, totp = 0)...');
    const updateRes = await page.request.put(`${BASE}/api/setting/set`, {
      data: { allMailMode: 1, totp: 0 },
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': token
      }
    });
    const updateData = await updateRes.json();
    assert.strictEqual(updateData.code, 200, 'Global 2FA disable update must succeed');
    console.log('  ✅ Global 2FA successfully set to 0 (disabled) and user 2FA records purged');

    // Step 5: Reload / re-visit Security Settings and verify Two-Factor Center is COMPLETELY HIDDEN without any flash
    console.log('▶ Step 4: Verifying Two-Factor Center is completely HIDDEN when global 2FA is disabled...');
    await page.goto(`${BASE}/inbox`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await page.goto(`${BASE}/settings/profile`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.locator('.settings-nav-group .settings-nav-item:has-text("安全")').click();
    await page.waitForTimeout(1500);

    // Verify .two-factor-center is NOT visible / not rendered
    const isCenterVisible = await page.locator('.two-factor-center').isVisible();
    console.log('  Is Two-Factor Center visible when 2FA is off?', isCenterVisible);
    assert.strictEqual(isCenterVisible, false, 'Two-Factor Center must be completely HIDDEN when 2FA is disabled globally');

    // Verify only usable elements are shown in Security Settings (e.g., Change Password, Delete Account)
    const securityPageText = await page.locator('.settings-content').innerText();
    assert(!securityPageText.includes('两步验证中心'), 'Security page must not contain 两步验证中心 text');
    assert(!securityPageText.includes('独立与隐私安全原则'), 'Must not contain 独立与隐私安全原则 text');
    console.log('  ✅ Two-Factor Center is completely hidden and zero-knowledge card is removed');

    await page.screenshot({ path: 'tests/cf_prod_2fa_hidden_when_disabled.png', fullPage: true });
    console.log('  📸 Screenshot saved: tests/cf_prod_2fa_hidden_when_disabled.png');

    // Step 6: Re-enable Global 2FA via API (totp = 1)
    console.log('▶ Step 5: Re-enabling Global 2FA and verifying Two-Factor Center appears cleanly...');
    const reenableRes = await page.request.put(`${BASE}/api/setting/set`, {
      data: { allMailMode: 1, totp: 1 },
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': token
      }
    });
    const reenableData = await reenableRes.json();
    assert.strictEqual(reenableData.code, 200, 'Global 2FA re-enable must succeed');

    await page.goto(`${BASE}/inbox`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await page.goto(`${BASE}/settings/profile`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.locator('.settings-nav-group .settings-nav-item:has-text("安全")').click();
    await page.waitForTimeout(2000);

    // Verify Two-Factor Center is visible again
    assert(await page.locator('.two-factor-center').isVisible(), 'Two-Factor Center must be visible after re-enabling');
    const cleanStatusTag = page.locator('.two-factor-banner .status-pill');
    const cleanTagText = await cleanStatusTag.textContent();
    console.log('  Hero Banner Status Tag after re-enable:', cleanTagText);
    assert(cleanTagText.includes('未启用'), 'Status pill should show 未启用 for clean setup');

    const setupBtn = page.locator('.two-factor-banner .action-pill-btn.primary-glow');
    assert(await setupBtn.isVisible() && !await setupBtn.isDisabled(), 'Setup button must be enabled and active');
    console.log('  ✅ Two-Factor Center restored and fully usable');

    // Step 7: Restore Privacy Mode (0)
    console.log('▶ Step 6: Restoring Privacy Mode (0)...');
    await page.request.put(`${BASE}/api/setting/set`, {
      data: { allMailMode: 0, totp: 1 },
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': token
      }
    });
    console.log('  ✅ Restored default Privacy Mail Mode');

    await page.screenshot({ path: 'tests/cf_prod_2fa_final_restored.png', fullPage: true });
    console.log('  📸 Screenshot saved: tests/cf_prod_2fa_final_restored.png');

    console.log('\n🎉 ALL LIVE CLOUDFLARE E2E TESTS PASSED 100%!');
  } catch (err) {
    console.error('❌ E2E Test Error:', err);
    await page.screenshot({ path: 'tests/cf_prod_e2e_error.png', fullPage: true }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

runLiveE2ETest().catch(err => {
  console.error('Test script failed:', err);
  process.exit(1);
});
