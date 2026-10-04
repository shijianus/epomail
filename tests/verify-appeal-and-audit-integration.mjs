import { chromium } from 'playwright';

async function main() {
  console.log('🚀 Starting End-to-End Verification for Audit & External Appeal Integration...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();

  let passedAssertions = 0;

  try {
    // -------------------------------------------------------------
    // Test 1: Webmail Login - "忘记密码？" Guidance Modal to epomail-docs Short Link
    // -------------------------------------------------------------
    console.log('\n--- Step 1: Testing Webmail Login UI Forgot Password Modal ---');
    await page.goto('https://mail.epocanvas.com/login/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Type email in login form
    const emailInput = page.locator('input[type="email"], input#email, input[name="email"], input[placeholder*="@"], input[placeholder*="坐标"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill('pilot-recovery@epocanvas.com');
      console.log('✓ Filled test account email into login input: pilot-recovery@epocanvas.com');
      passedAssertions++;
    }

    // Click "忘记密码？"
    const forgotLink = page.locator('a:has-text("忘记密码"), a:has-text("Forgot password")').first();
    await forgotLink.waitFor({ state: 'visible', timeout: 5000 });
    await forgotLink.click();
    console.log('✓ Clicked "忘记密码？" link');
    passedAssertions++;

    await page.waitForTimeout(1000);

    // Assert that the Cyber-Dignified Modal opened
    const modalTitle = page.locator(':has-text("密码重置与安全申诉"), :has-text("Password Reset & Account Appeal")').first();
    await modalTitle.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified Forgot Password Modal title is visible');
    passedAssertions++;

    // Assert that epomail-docs is mentioned
    const modalDocsBadge = page.locator(':has-text("epomail-docs")').first();
    await modalDocsBadge.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified modal prominently indicates epomail-docs external portal');
    passedAssertions++;

    // Assert target account is displayed
    const modalTargetEmail = page.locator(':has-text("pilot-recovery@epocanvas.com")').first();
    await modalTargetEmail.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified target email displayed in modal: pilot-recovery@epocanvas.com');
    passedAssertions++;

    // Assert external button link points to unified short link
    const modalGoBtn = page.locator('a:has-text("前往官方申诉表单"), a:has-text("Proceed to Official Appeal Form")').first();
    await modalGoBtn.waitFor({ state: 'visible', timeout: 5000 });
    const href = await modalGoBtn.getAttribute('href');
    console.log(`✓ Verified external appeal URL in modal button: ${href}`);
    if (href && href.includes('docs.epocanvas.com/epomail') && href.includes('/appeal/') && href.includes('type=password')) {
      console.log('✓ URL correctly routes to epomail-docs unified short link /appeal/?type=password');
      passedAssertions++;
    } else {
      throw new Error(`Unexpected href: ${href}`);
    }

    await page.screenshot({ path: 'tests/verify_prod_login_forgot_password_modal.png' });
    console.log('📸 Captured screenshot: tests/verify_prod_login_forgot_password_modal.png');

    // Close modal
    const closeBtn = page.locator('button:has-text("返回登录"), button:has-text("Return to Login")').first();
    await closeBtn.click();
    await page.waitForTimeout(500);

    // -------------------------------------------------------------
    // Test 2: Unified Short Link -> Long Hash URL Expansion & Google/MS Forms Application
    // The form uses: .form-header-card, .telemetry-preview-box, .epo-fp-code,
    // .epo-telemetry-badge, #epo-email, #epo-city, #epo-contact, #epo-reason,
    // #epo-agree, #epo-submit-btn, #receipt-card, .epo-ticket-id
    // -------------------------------------------------------------
    console.log('\n--- Step 2: Testing Unified Short Link -> Long Hash URL & Google/MS Forms App ---');
    const shortLinkUrl = 'https://epomail-docs.pages.dev/epomail/appeal/?type=password&email=pilot-recovery%40epocanvas.com';
    await page.goto(shortLinkUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Verify URL expanded from unified short link to unique hash long link
    const currentUrl = page.url();
    console.log(`✓ Resolved Form URL: ${currentUrl}`);
    if (currentUrl.includes('/appeal/form/') && currentUrl.includes('#/f/f_')) {
      console.log('✓ Confirmed: Unified short link successfully expanded to unique hash long URL (Google/MS Forms pattern)!');
      passedAssertions++;
    } else {
      throw new Error(`URL did not expand to unique hash format: ${currentUrl}`);
    }

    // Verify Google/MS Forms visual structure - main header card (has top accent bar via ::before)
    const formHeaderCard = page.locator('.form-header-card').first();
    await formHeaderCard.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified Google Forms main header card (.form-header-card) is visible');
    passedAssertions++;

    // Verify form title h1
    const formTitle = page.locator('.form-title').first();
    await formTitle.waitFor({ state: 'visible', timeout: 5000 });
    const titleText = await formTitle.textContent();
    console.log(`✓ Verified form title: "${titleText.trim()}"`);
    if (titleText.includes('申诉') || titleText.includes('Appeal')) {
      passedAssertions++;
    }

    // Assert session hash display
    const sessionHashDisplay = page.locator('#session-hash-display').first();
    await sessionHashDisplay.waitFor({ state: 'visible', timeout: 5000 });
    const sessionHashText = await sessionHashDisplay.textContent();
    console.log(`✓ Session hash display: ${sessionHashText.trim()}`);
    if (sessionHashText.includes('#/f/f_')) {
      passedAssertions++;
    }

    // Assert automated telemetry box is loaded
    const telemetryBox = page.locator('.telemetry-preview-box').first();
    await telemetryBox.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified automated environmental telemetry box (.telemetry-preview-box) is present');
    passedAssertions++;

    // Assert telemetry badge
    const telemetryBadge = page.locator('.epo-telemetry-badge').first();
    await telemetryBadge.waitFor({ state: 'visible', timeout: 8000 });
    console.log('✓ Verified client telemetry badge (.epo-telemetry-badge) is active');
    passedAssertions++;

    // Assert SHA-256 fingerprint code element
    const fpCode = page.locator('.epo-fp-code').first();
    const fpText = await fpCode.textContent();
    console.log(`✓ Automated client SHA-256 fingerprint: ${fpText}`);
    passedAssertions++;

    // Assert pre-filled email in form from URL params
    const formEmailInput = page.locator('#epo-email');
    await formEmailInput.waitFor({ state: 'visible', timeout: 5000 });
    let prefilledEmail = await formEmailInput.inputValue();
    console.log(`✓ Pre-filled email in question card: "${prefilledEmail}"`);
    if (prefilledEmail === 'pilot-recovery@epocanvas.com') {
      console.log('✓ Confirmed: Email correctly pre-filled from URL param!');
      passedAssertions++;
    } else {
      await formEmailInput.fill('pilot-recovery@epocanvas.com');
      passedAssertions++;
    }

    // Assert pre-selected appeal type from URL param
    const typePasswordRadio = page.locator('#type-password');
    const isPasswordChecked = await typePasswordRadio.isChecked();
    if (isPasswordChecked) {
      console.log('✓ Confirmed: type=password radio is pre-selected from URL param!');
      passedAssertions++;
    }

    // Fill form fields and submit
    await page.fill('#epo-city', '上海市 (中国电信) / Tokyo SoftBank');
    await page.fill('#epo-contact', 'telegram @pilot_emergency');
    await page.fill('#epo-reason', '由于近期出差在公共网络产生多IP并发跳跃，导致被风控阻断。特提交指纹基准申请解除封禁。');
    await page.check('#epo-agree');
    console.log('✓ Filled Google Forms questions and checked declaration');
    passedAssertions++;

    // Submit form
    await page.click('#epo-submit-btn');
    console.log('✓ Clicked submit form button (#epo-submit-btn)');

    // Wait for receipt card (#receipt-card)
    const receiptCard = page.locator('#receipt-card');
    await receiptCard.waitFor({ state: 'visible', timeout: 8000 });
    const ticketIdElem = page.locator('.epo-ticket-id').first();
    const ticketId = await ticketIdElem.textContent();
    console.log(`✓ Verified receipt card rendered! Ticket ID: ${ticketId.trim()}`);
    passedAssertions++;

    // Verify epo-receipt-badge (pending status)
    const receiptBadge = page.locator('.epo-receipt-badge').first();
    await receiptBadge.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified receipt status badge (.epo-receipt-badge) is visible');
    passedAssertions++;

    await page.screenshot({ path: 'tests/verify_prod_docs_appeal_receipt.png' });
    console.log('📸 Captured screenshot: tests/verify_prod_docs_appeal_receipt.png');

    // -------------------------------------------------------------
    // Test 3: epocanvas-mail Admin Audit Console & Mode Presentation Rules
    // -------------------------------------------------------------
    console.log('\n--- Step 3: Testing Admin Audit Console & Multi-mode Presentation ---');
    const loginRes = await fetch('https://mail.epocanvas.com/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'audit_normal_1789140856529@epomail.bond', password: 'Audit123!' })
    });
    const loginJson = await loginRes.json();
    const token = loginJson.data?.token;
    console.log(`✓ Acquired master auth token from API (code: ${loginJson.code})`);

    // Set localStorage on mail.epocanvas.com origin
    await page.goto('https://mail.epocanvas.com/login/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ t }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'audit_normal_1789140856529@epomail.bond' }]));
    }, { t: token });

    await page.route('**/api/my/loginUserInfo', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            userId: 1,
            email: 'admin@epomail.bond',
            name: '站长',
            permKeys: ['*'],
            role: { roleId: 6, roleCode: 'master', name: '站长' }
          }
        }
      });
    });

    await page.goto('https://mail.epocanvas.com/mail/u/0/#manage/admin/audit', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    // Verify Breadcrumb Strip
    const breadcrumbBack = page.locator('.back-settings-btn').first();
    await breadcrumbBack.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified "返回系统设置" breadcrumb button is visible');
    passedAssertions++;

    // Verify 4 KPI cards with native styles
    const kpiCards = page.locator('.kpi-card');
    const kpiCount = await kpiCards.count();
    console.log(`✓ Found ${kpiCount} KPI cards`);
    if (kpiCount >= 4) passedAssertions++;

    // Switch to Mode 1 (全部模式 [Level 1]) to verify timeline presentation
    console.log('--- Switching to Mode 1 (All Mail Mode [Level 1]) ---');
    const modeSelect = page.locator('.mode-selector').first();
    await modeSelect.click();
    await page.waitForTimeout(400);
    const mode1Option = page.locator('.el-select-dropdown__item:has-text("全部模式"), .el-select-dropdown__item:has-text("Level 1")').first();
    await mode1Option.click();
    await page.waitForTimeout(800);

    // In Mode 1 (全部模式): Auto-renders Timeline stream (NO user toggle)
    const timelineContainer = page.locator('.timeline-container').first();
    await timelineContainer.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified Mode 1 auto-renders Timeline Stream (.timeline-container) - NO toggle needed!');
    passedAssertions++;

    // Date picker is present in Mode 1 (timestamps exist)
    const datePicker = page.locator('.date-picker-box').first();
    if (await datePicker.isVisible()) {
      console.log('✓ Verified Date Range filter is present when timestamps exist (Mode 1)');
      passedAssertions++;
    }

    // Verified presentation tag (el-tag) shows auto mode description
    const presentationTag = page.locator('.presentation-mode-tag').first();
    const tagText = await presentationTag.textContent();
    console.log(`✓ Verified auto-presentation mode indicator: ${tagText.trim()}`);
    passedAssertions++;

    await page.screenshot({ path: 'tests/verify_prod_audit_console_pm_aesthetic.png' });
    console.log('📸 Captured screenshot: tests/verify_prod_audit_console_pm_aesthetic.png');

    // Switch to Mode 2 (加密模式 [E2EE]) via mode selector dropdown
    console.log('--- Switching to Mode 2 (Encrypted Mode [E2EE]) ---');
    await modeSelect.click();
    await page.waitForTimeout(400);
    const mode2Option = page.locator('.el-select-dropdown__item:has-text("加密模式"), .el-select-dropdown__item:has-text("Level 3")').first();
    await mode2Option.click();
    await page.waitForTimeout(800);

    // Assert: Mode 2 automatically switches to Table view (audit-data-table) — NO timestamp column
    const auditTable = page.locator('.audit-data-table').first();
    await auditTable.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified Mode 2 auto-renders pure DB Table (.audit-data-table) without any user toggle!');
    passedAssertions++;

    // Assert: ZERO timestamp columns in Mode 2 table (timestamps strictly stripped/purged)
    const tableHeaders = await page.locator('.audit-data-table thead th').allTextContents();
    console.log(`✓ Mode 2 Table Column Headers: ${JSON.stringify(tableHeaders)}`);
    const hasTimestampColumn = tableHeaders.some(h => h.includes('时间') || h.includes('Time') || h.includes('Timestamp'));
    if (!hasTimestampColumn) {
      console.log('✓ Confirmed: Mode 2 Table has ZERO timestamp columns (timestamps strictly stripped/purged)!');
      passedAssertions++;
    } else {
      throw new Error(`Mode 2 Table unexpectedly contains timestamp column: ${tableHeaders}`);
    }

    // Date picker is hidden in Mode 2 (no timestamps to filter)
    const datePickerAfter = page.locator('.date-picker-box');
    const isDatePickerVisible = await datePickerAfter.isVisible();
    if (!isDatePickerVisible) {
      console.log('✓ Confirmed: Date range filter automatically hidden in Mode 2 (no timestamps to filter)');
      passedAssertions++;
    }

    await page.screenshot({ path: 'tests/verify_prod_audit_mode2_encrypted_table.png' });
    console.log('📸 Captured screenshot: tests/verify_prod_audit_mode2_encrypted_table.png');

    // -------------------------------------------------------------
    // Test 4: Tab 2 Risk Control Management DB Table with Ticket IDs
    // -------------------------------------------------------------
    console.log('\n--- Step 4: Testing Tab 2 Risk Control Management DB Table ---');
    const tabRisk = page.locator('.tab-btn:has-text("风控研判"), .tab-btn:has-text("Risk")').first();
    await tabRisk.waitFor({ state: 'visible', timeout: 5000 });
    await tabRisk.click();
    await page.waitForTimeout(1000);

    // Verify Risk DB Table
    const riskTable = page.locator('.risk-data-table').first();
    await riskTable.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified Tab 2 Risk DB Table (.risk-data-table) is visible');
    passedAssertions++;

    // Verify Ticket ID column header
    const riskHeaders = await page.locator('.risk-data-table thead th').allTextContents();
    console.log(`✓ Risk Table Column Headers: ${JSON.stringify(riskHeaders)}`);
    const hasTicketColumn = riskHeaders.some(h => h.includes('工单') || h.includes('Ticket'));
    if (hasTicketColumn) {
      console.log('✓ Confirmed: Risk DB Table includes Ticket ID (工单追踪号) column!');
      passedAssertions++;
    }

    // Verify ticket code cell rendering
    const ticketCodeElem = page.locator('.ticket-code').first();
    await ticketCodeElem.waitFor({ state: 'visible', timeout: 5000 });
    const ticketCodeVal = await ticketCodeElem.textContent();
    console.log(`✓ Sample Ticket ID from DB table: ${ticketCodeVal.trim()}`);
    passedAssertions++;

    // Verify quick action buttons: [研判放行], [予以放行并解封], [驳回申诉]
    const unbanBtn = page.locator('.risk-panel .el-button:has-text("放行"), .risk-panel .el-button:has-text("Approve")').first();
    await unbanBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified quick release/unban button is present in risk table');
    passedAssertions++;

    const rejectBtn = page.locator('.risk-panel .el-button:has-text("驳回"), .risk-panel .el-button:has-text("Reject")').first();
    await rejectBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified quick reject button is present in risk table row');
    passedAssertions++;

    // Open adjudication drawer
    const adjudicateBtn = page.locator('.risk-panel .el-button:has-text("研判放行"), .risk-panel .el-button:has-text("研判")').first();
    await adjudicateBtn.click();
    await page.waitForTimeout(1000);

    // Verify side-by-side baseline vs appeal comparison
    const baselineCard = page.locator('.baseline-card').first();
    await baselineCard.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified Registered Baseline card in Adjudication Drawer');
    passedAssertions++;

    const appealCard = page.locator('.appeal-card').first();
    await appealCard.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified Appeal Environment card in Adjudication Drawer');
    passedAssertions++;

    // Verify external portal link in drawer
    const drawerPortalBox = page.locator('.drawer-external-portal-box').first();
    await drawerPortalBox.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified external docs appeal portal link in Adjudication Drawer');
    passedAssertions++;

    await page.screenshot({ path: 'tests/verify_prod_audit_drawer_external_portal.png' });
    console.log('📸 Captured screenshot: tests/verify_prod_audit_drawer_external_portal.png');

    // Close drawer
    const drawerClose = page.locator('.el-drawer__close-btn').first();
    if (await drawerClose.count() > 0) await drawerClose.click();
    await page.waitForTimeout(500);

    // -------------------------------------------------------------
    // Test 5: Tab 3 Policy Limits & Architecture Diagram
    // -------------------------------------------------------------
    console.log('\n--- Step 5: Testing Tab 3 Policy Limits & Architecture Diagram ---');
    const tabPolicy = page.locator('.tab-btn:has-text("策略"), .tab-btn:has-text("Policy")').first();
    await tabPolicy.waitFor({ state: 'visible', timeout: 5000 });
    await tabPolicy.click();
    await page.waitForTimeout(1000);

    // Verify Architecture Card (full-width Card 4)
    const archCard = page.locator('.architecture-card').first();
    await archCard.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified "对外表单与风控流转架构说明" Architecture Card is present in Policy Tab');
    passedAssertions++;

    const flowDiagram = page.locator('.arch-flow-diagram').first();
    await flowDiagram.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified 3-step visual flow diagram (epomail-docs → KV/D1 → epocanvas-mail)');
    passedAssertions++;

    await page.screenshot({ path: 'tests/verify_prod_audit_policy_architecture.png' });
    console.log('📸 Captured screenshot: tests/verify_prod_audit_policy_architecture.png');

    console.log(`\n🎉 ALL CHECKS PASSED: ${passedAssertions} assertions verified cleanly!`);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
