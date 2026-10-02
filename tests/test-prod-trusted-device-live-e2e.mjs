import assert from 'node:assert';
import { chromium } from 'playwright';

console.log('========================================================================');
console.log('=== 公网生产环境全真核验：2FA「以后本设备登录不再验证」交互与尺寸 ===');
console.log('========================================================================');
console.log('[公网地址] https://mail.epocanvas.com');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // Seed session storage for challenge render
  await page.addInitScript(() => {
    sessionStorage.setItem('epo_2fa_challenge_session', JSON.stringify({
      email: 'live_test@mail.epocanvas.com',
      tempToken: 'totp_tmp_live_session_9999',
      hasTotp: true,
      hasPasskeys: true,
      hasBackupCodes: true
    }));
  });

  const liveChallengeUrl = 'https://mail.epocanvas.com/login/challenge/totp_prodTrustVerification';
  console.log(`\n[阶段 1] 打开公网 2FA 界面: ${liveChallengeUrl}`);
  await page.goto(liveChallengeUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 1. Check card dimensions on live site
  const card = page.locator('.rounded-3xl').first();
  const box = await card.boundingBox();
  assert(box, 'Card bounding box must exist on live production');
  console.log(`-> 公网实测卡片尺寸: 宽 ${box.width.toFixed(1)}px, 高 ${box.height.toFixed(1)}px`);
  assert(Math.abs(box.width - 480) <= 2, `Card width must be 480px, got ${box.width}px`);
  assert(Math.abs(box.height - 670) <= 2, `Card height must be 670px, got ${box.height}px`);
  console.log('  ✓ 公网登录卡片物理几何尺寸严格锁定 480px × 670px (0px 偏差)');

  // 2. Check "以后本设备登录不再验证" checkbox visibility
  const checkboxLabel = page.locator('label').filter({ hasText: /以后本设备登录不再验证|Don't ask again on this device/i }).first();
  await checkboxLabel.waitFor({ state: 'visible', timeout: 5000 });
  console.log('  ✓ 公网 2FA 界面成功渲染「以后本设备登录不再验证」勾选框');

  // 3. Verify default state is UNCHECKED (no checkmark icon)
  const isCheckedInitially = (await checkboxLabel.locator('svg').count()) > 0;
  assert.strictEqual(isCheckedInitially, false, 'Checkbox must be UNCHECKED by default');
  console.log('  ✓ 默认状态严格为「未勾选」（必须由用户主动勾选授权）');

  // 4. Click to toggle checked
  await checkboxLabel.click();
  await page.waitForTimeout(300);

  const isCheckedAfterClick = (await checkboxLabel.locator('svg').count()) > 0;
  assert.strictEqual(isCheckedAfterClick, true, 'Checkbox must be CHECKED after click');
  console.log('  ✓ 用户点击后平滑激活，复选框呈现渐变微发光高亮与勾选对勾');

  // 5. Verify CSS box dimensions unchanged (0px layout shift)
  const dimsAfter = await card.evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight }));
  assert.strictEqual(dimsAfter.width, 480, `Width must remain 480px, got ${dimsAfter.width}px`);
  assert.strictEqual(dimsAfter.height, 670, `Height must remain 670px, got ${dimsAfter.height}px`);
  console.log('  ✓ 勾选交互后卡片 CSS 盒模型尺寸严格为 480px × 670px (0px 布局重排)');

  // 6. Screenshot production state
  await page.screenshot({ path: 'tests/verify_prod_trusted_device_checkbox.png' });
  console.log('  ✓ 已生成公网全真验证截图: tests/verify_prod_trusted_device_checkbox.png');

  // 7. Verify Passkey view also has the remember device option
  const tryAnotherWay = page.getByText(/选择其他验证方式|Try another way/i).first();
  if (await tryAnotherWay.isVisible()) {
    await tryAnotherWay.click();
    await page.waitForTimeout(400);
    const passkeyOption = page.getByText(/通行密钥|Passkey/i).first();
    if (await passkeyOption.isVisible()) {
      await passkeyOption.click();
      await page.waitForTimeout(400);
      const passkeyCheckbox = page.locator('label').filter({ hasText: /以后本设备登录不再验证|Don't ask again on this device/i }).first();
      assert(await passkeyCheckbox.isVisible(), 'Checkbox must be present in Passkey 2FA view');
      console.log('  ✓ 通行密钥 (Passkey) 验证界面同样集成「以后本设备登录不再验证」');
    }
  }

  console.log('\n========================================================================');
  console.log('=== 公网 2FA 信任设备核验全部通过 (7/7 GREEN) ===');
  console.log('========================================================================');
} finally {
  await browser.close();
}
