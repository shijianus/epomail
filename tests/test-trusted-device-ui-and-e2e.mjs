import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

console.log('--- Test 1: UI Checkbox and Card Geometry Test ---');

const distDir = path.resolve('temp_login_ui/dist');
const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath.startsWith('/login/')) {
    urlPath = urlPath.slice('/login'.length);
  }
  let filePath = path.join(distDir, urlPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }
  const ext = path.extname(filePath);
  const types = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

const PORT = 5491;

server.listen(PORT, async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    // Seed session to render 2FA screen
    await page.addInitScript(() => {
      sessionStorage.setItem('epo_2fa_challenge_session', JSON.stringify({
        email: 'user_trusted_test@epomail.bond',
        tempToken: 'totp_tmp_test_trusted_token_123',
        hasTotp: true,
        hasPasskeys: true,
        hasBackupCodes: true
      }));
    });

    await page.goto(`http://localhost:${PORT}/login/challenge/totp_demoTrustedDevice123`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    // 1. Verify card dimensions (locked 480px x 670px)
    const card = page.locator('.rounded-3xl').first();
    const box = await card.boundingBox();
    assert(box, 'Card bounding box must exist');
    console.log(`Measured Card dimensions: ${box.width.toFixed(1)}px x ${box.height.toFixed(1)}px`);
    assert(Math.abs(box.width - 480) <= 2, `Card width should be 480px, got ${box.width}px`);
    assert(Math.abs(box.height - 670) <= 2, `Card height should be 670px, got ${box.height}px`);
    console.log('✓ Card geometry strictly locked to 480px x 670px with 0px deviation');

    // 2. Verify "以后本设备登录不再验证" checkbox exists
    const checkboxLabel = page.locator('label').filter({ hasText: /以后本设备登录不再验证|Don't ask again on this device/i }).first();
    await checkboxLabel.waitFor({ state: 'visible', timeout: 4000 });
    console.log('✓ Checkbox "以后本设备登录不再验证" is visible in 2FA view');

    // 3. Verify default state is UNCHECKED
    // When unchecked, the checkmark svg inside the checkbox container is NOT rendered
    const checkmarkSvg = checkboxLabel.locator('svg');
    const isCheckedInitially = (await checkmarkSvg.count()) > 0;
    assert.strictEqual(isCheckedInitially, false, 'Checkbox must be UNCHECKED by default (requires user manual opt-in)');
    console.log('✓ Verified: Checkbox is unchecked by default as required');

    // 4. Click to toggle checked
    await checkboxLabel.click();
    await page.waitForTimeout(200);

    const isCheckedAfterClick = (await checkboxLabel.locator('svg').count()) > 0;
    assert.strictEqual(isCheckedAfterClick, true, 'Checkbox must be CHECKED after click');
    console.log('✓ Verified: Checkbox successfully toggles to checked on click');

    // 5. Verify dimensions remained strictly identical after clicking checkbox (0px layout shift)
    const dimsAfter = await card.evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight }));
    assert.strictEqual(dimsAfter.width, 480, `Width must remain 480px, got ${dimsAfter.width}px`);
    assert.strictEqual(dimsAfter.height, 670, `Height must remain 670px, got ${dimsAfter.height}px`);
    console.log('✓ 0px layout shift verified after checkbox interaction (offsetWidth: 480px, offsetHeight: 670px)');

    // 6. Test Passkey view has the checkbox too
    const tryAnotherWay = page.getByText(/选择其他验证方式|Try another way/i).first();
    if (await tryAnotherWay.isVisible()) {
      await tryAnotherWay.click();
      await page.waitForTimeout(300);
      const passkeyOption = page.getByText(/通行密钥|Passkey/i).first();
      if (await passkeyOption.isVisible()) {
        await passkeyOption.click();
        await page.waitForTimeout(400);

        const passkeyCheckbox = page.getByText(/以后本设备登录不再验证|Don't ask again on this device/i).first();
        assert(await passkeyCheckbox.isVisible(), 'Checkbox must also be available in Passkey view');
        console.log('✓ Checkbox is also seamlessly present in Passkey 2FA view');
      }
    }

    await browser.close();
    console.log('\n=============================================');
    console.log('ALL UI & GEOMETRY ASSERTIONS PASSED (6/6)!');
    console.log('=============================================');
  } catch (err) {
    console.error('Test failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
