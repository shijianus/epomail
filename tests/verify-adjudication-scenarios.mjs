import { chromium } from 'playwright';
import assert from 'node:assert';
import path from 'node:path';

const BASE_URL = 'http://127.0.0.1:4199';

async function run() {
  console.log('🚀 Launching Playwright to verify Adjudication Scenarios...\n');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  // Helper to ensure auth
  await page.addInitScript(() => {
    localStorage.setItem('token', 'mock_secadmin_jwt_token_for_preview');
    localStorage.setItem('user', JSON.stringify({
      userId: 9,
      email: 'admin@epomail.cyou',
      name: 'SecAdmin',
      permKeys: ['*'],
      role: { roleId: 1, name: '站长', roleCode: 'admin', key: 'admin' }
    }));
  });

  console.log('--- SCENARIO 1: 首次违规裁决 (THR-2026-MULTI99) ---');
  await page.goto(`${BASE_URL}/audit-report#case=THR-2026-MULTI99:decision`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.audit-detail-drawer', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(600);

  // Verify Scenario 1 Elements
  const s1Badge = await page.locator('.scenario-badge').textContent();
  console.log('Scenario 1 Badge:', s1Badge.trim());
  assert.ok(s1Badge.includes('首次违规裁决'), 'Must show 首次违规裁决');

  const s1Measure = await page.locator('.measure-tag').textContent();
  console.log('Scenario 1 Measure Tag:', s1Measure.trim());
  assert.ok(s1Measure.includes('队列暂缓') || s1Measure.includes('熔断'), 'Must show 队列暂缓/熔断观察');

  const s1Rec = await page.locator('.rec-action-name').textContent();
  console.log('Scenario 1 Recommended Action:', s1Rec.trim());
  assert.ok(s1Rec.includes('封禁账号') || s1Rec.includes('确认违规'), 'Must recommend ban');

  // Verify Options do NOT contain appeal actions
  const s1Options = await page.locator('.verdict-opt-label').allTextContents();
  console.log('Scenario 1 Verdict Options:', s1Options);
  assert.ok(s1Options.some(o => o.includes('确认违规·封禁账号')), 'Should have ban option');
  assert.ok(s1Options.some(o => o.includes('排除嫌疑·不予处罚')), 'Should have dismiss option');
  assert.ok(!s1Options.some(o => o.includes('申诉')), 'MUST NOT have any appeal options');
  assert.ok(!s1Options.some(o => o.includes('驳回')), 'MUST NOT have reject appeal');

  // Verify Footer: First-time threat MUST NOT show "重新封禁"
  const footerButtons = await page.locator('.drawer-footer-actions .el-button').allTextContents();
  console.log('Scenario 1 Footer Buttons:', footerButtons.map(b => b.trim()));
  assert.ok(!footerButtons.some(b => b.includes('重新封禁')), 'Footer must NOT show 重新封禁 for first-time threat');

  // Click Adopt Recommendation
  await page.locator('.btn-adopt-rec').click();
  await page.waitForTimeout(300);
  const s1SubmitLabel = await page.locator('.btn-submit-verdict').textContent();
  console.log('Submit button label after adopt:', s1SubmitLabel.trim());
  assert.ok(s1SubmitLabel.includes('确认违规封禁'), 'Submit button must reflect chosen action');

  // Check notification preview modal
  await page.locator('.btn-preview-notice').click();
  await page.waitForSelector('.notice-preview-dialog', { state: 'visible' });
  const noticeSubject = await page.locator('.dialog-kv-row:has(.dk-label:has-text("通知主题")) .dk-val').textContent();
  console.log('Scenario 1 Notification Preview Subject:', noticeSubject.trim());
  assert.ok(!noticeSubject.includes('申诉'), 'Notification subject MUST NOT mention 申诉');
  assert.ok(noticeSubject.includes('违规处置'), 'Notification subject must mention 违规处置');

  // Close preview dialog
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.screenshot({ path: 'tests/scenario_1_first_adjudication.png' });
  console.log('📸 Captured tests/scenario_1_first_adjudication.png\n');


  console.log('--- SCENARIO 2: 既有处置复核 (REC-2026-BAN05) ---');
  await page.goto(`${BASE_URL}/audit-report#case=REC-2026-BAN05:decision`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.audit-detail-drawer', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(600);

  const s2Badge = await page.locator('.scenario-badge').textContent();
  console.log('Scenario 2 Badge:', s2Badge.trim());
  assert.ok(s2Badge.includes('既有处置复核'), 'Must show 既有处置复核');

  const s2Measure = await page.locator('.measure-tag').textContent();
  console.log('Scenario 2 Measure Tag:', s2Measure.trim());
  assert.ok(s2Measure.includes('账号已封禁'), 'Must show 账号已封禁');

  const s2Options = await page.locator('.verdict-opt-label').allTextContents();
  console.log('Scenario 2 Verdict Options:', s2Options);
  assert.ok(s2Options.some(o => o.includes('维持现有封禁处置')), 'Must offer 维持现有封禁处置');
  assert.ok(s2Options.some(o => o.includes('解除封禁·恢复正常权限')), 'Must offer 解除封禁');
  assert.ok(!s2Options.some(o => o.includes('申诉')), 'MUST NOT use appeal terms');

  const s2FooterButtons = await page.locator('.drawer-footer-actions .el-button').allTextContents();
  console.log('Scenario 2 Footer Buttons:', s2FooterButtons.map(b => b.trim()));
  assert.ok(s2FooterButtons.some(b => b.includes('解封')), 'Footer must show 解封 for banned account');

  await page.screenshot({ path: 'tests/scenario_2_sanction_review.png' });
  console.log('📸 Captured tests/scenario_2_sanction_review.png\n');


  console.log('--- SCENARIO 3: 用户申诉审核 (APP-2026-NAT88) ---');
  await page.goto(`${BASE_URL}/audit-report#case=APP-2026-NAT88:decision`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.audit-detail-drawer', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(600);

  const s3Badge = await page.locator('.scenario-badge').textContent();
  console.log('Scenario 3 Badge:', s3Badge.trim());
  assert.ok(s3Badge.includes('用户申诉审核'), 'Must show 用户申诉审核');

  const s3Options = await page.locator('.verdict-opt-label').allTextContents();
  console.log('Scenario 3 Verdict Options:', s3Options);
  assert.ok(s3Options.some(o => o.includes('申诉成立·恢复账号权限')), 'Must offer 申诉成立');
  assert.ok(s3Options.some(o => o.includes('驳回申诉·维持原封禁')), 'Must offer 驳回申诉');
  assert.ok(s3Options.every(o => !o.includes('条件放行')), 'Must NOT offer probation/challenge without underlying capability');

  await page.screenshot({ path: 'tests/scenario_3_appeal_audit.png' });
  console.log('📸 Captured tests/scenario_3_appeal_audit.png\n');


  console.log('--- SCENARIO 4: 已结案台账存证 (BAN-2026-UN0021) ---');
  await page.goto(`${BASE_URL}/audit-report#case=BAN-2026-UN0021:decision`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.audit-detail-drawer', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(600);

  // Tab 4 must show 处置台账
  const tab4Label = await page.locator('#tab-decision').textContent();
  console.log('Scenario 4 Tab 4 Label:', tab4Label.trim());
  assert.ok(tab4Label.includes('台账'), 'Tab 4 must be titled 台账');

  // Must show readonly banner
  const bannerText = await page.locator('.sanction-ledger-banner').textContent();
  assert.ok(bannerText.includes('AUDIT_LOG_ARCHIVE') || bannerText.includes('只读审计记录') || bannerText.includes('已结案'), 'Must show read-only audit log banner');

  // Must NOT show adjudication submit options
  const workbenchCount = await page.locator('.adjudication-workbench-card').count();
  assert.strictEqual(workbenchCount, 0, 'Adjudication workbench card MUST NOT exist on closed case');

  await page.screenshot({ path: 'tests/scenario_4_closed_ledger.png' });
  console.log('📸 Captured tests/scenario_4_closed_ledger.png\n');

  await browser.close();
  console.log('🎉 ALL 4 BROWSER SCENARIO VERIFICATIONS PASSED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('❌ Browser Verification Error:', err);
  process.exit(1);
});
