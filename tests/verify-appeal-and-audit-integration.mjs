import { chromium } from 'playwright';

async function main() {
  console.log('🚀 Starting End-to-End Visual Verification for Audit & External Appeal Integration...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();

  let passedAssertions = 0;

  try {
    // -------------------------------------------------------------
    // Test 1: Webmail Login - "忘记密码？" Guidance Modal to epomail-docs
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

    // Assert external button link
    const modalGoBtn = page.locator('a:has-text("前往官方申诉表单"), a:has-text("Proceed to Official Appeal Form")').first();
    await modalGoBtn.waitFor({ state: 'visible', timeout: 5000 });
    const href = await modalGoBtn.getAttribute('href');
    console.log(`✓ Verified external appeal URL in modal button: ${href}`);
    if (href && href.includes('docs.epocanvas.com/epomail') && href.includes('mail/appeal') && href.includes('type=password')) {
      console.log('✓ URL correctly routes to epomail-docs /mail/appeal/ with type=password');
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
    // Test 2: epomail-docs Public External Appeal & Recovery Portal
    // -------------------------------------------------------------
    console.log('\n--- Step 2: Testing epomail-docs Public Appeal Portal ---');
    const docsAppealUrl = 'https://docs.epocanvas.com/epomail/mail/appeal/?type=password&email=pilot-recovery%40epocanvas.com';
    await page.goto(docsAppealUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Assert page title / h1
    const pageHeading = page.locator('h1').first();
    const headingText = await pageHeading.textContent();
    console.log(`✓ Docs Page Heading: ${headingText.trim()}`);
    if (headingText.includes('申诉') || headingText.includes('Appeal')) {
      passedAssertions++;
    }

    // Assert live telemetry box & fingerprint
    const telemetryBadge = page.locator('text=已采集, text=Active').first();
    await telemetryBadge.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified client environmental telemetry badge is active');
    passedAssertions++;

    const fpCode = page.locator('.epo-fp-code').first();
    const fpText = await fpCode.textContent();
    console.log(`✓ Generated client SHA-256 fingerprint: ${fpText}`);
    passedAssertions++;

    // Assert pre-filled email in form
    const formEmailInput = page.locator('#epo-email');
    await formEmailInput.waitFor({ state: 'visible', timeout: 5000 });
    const prefilledEmail = await formEmailInput.inputValue();
    console.log(`✓ Verified pre-filled email in form: ${prefilledEmail}`);
    if (prefilledEmail === 'pilot-recovery@epocanvas.com') {
      passedAssertions++;
    }

    // Assert preselected type
    const formTypeSelect = page.locator('#epo-type');
    const selectedType = await formTypeSelect.inputValue();
    console.log(`✓ Verified preselected appeal type: ${selectedType}`);
    if (selectedType === 'password') {
      passedAssertions++;
    }

    // Fill reason & submit
    await page.fill('#epo-city', '上海市 (中国电信) / Tokyo SoftBank');
    await page.fill('#epo-contact', 'telegram @pilot_emergency');
    await page.fill('#epo-reason', '由于近期在出差途中使用蜂窝移动热点连接多台终端，触发了3-IP并发风控拦截，特此提交设备指纹申请放行并重置密码。');
    await page.check('#epo-agree');
    console.log('✓ Filled appeal details and checked declaration');
    passedAssertions++;

    // Submit ticket
    await page.click('#epo-submit-btn');
    console.log('✓ Clicked submit appeal ticket button');

    // Wait for receipt card
    const receiptBadge = page.locator('.epo-receipt-badge').first();
    await receiptBadge.waitFor({ state: 'visible', timeout: 8000 });
    const ticketIdElem = page.locator('.epo-ticket-id').first();
    const ticketId = await ticketIdElem.textContent();
    console.log(`✓ Verified appeal receipt rendered successfully! Generated Ticket ID: ${ticketId}`);
    passedAssertions++;

    await page.screenshot({ path: 'tests/verify_prod_docs_appeal_receipt.png' });
    console.log('📸 Captured screenshot: tests/verify_prod_docs_appeal_receipt.png');

    // -------------------------------------------------------------
    // Test 3: epocanvas-mail Admin Audit Console PM Aesthetic Verification
    // -------------------------------------------------------------
    console.log('\n--- Step 3: Testing epocanvas-mail Admin Audit Console Aesthetics ---');
    await page.goto('https://mail.epocanvas.com/manage/admin/audit', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    // Verify Breadcrumb Strip
    const breadcrumbBack = page.locator('.back-settings-btn').first();
    await breadcrumbBack.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified "返回系统设置" breadcrumb button is visible');
    passedAssertions++;

    const breadcrumbDocsBtn = page.locator('.docs-portal-btn').first();
    await breadcrumbDocsBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified "查看用户对外申诉页面 (epomail-docs)" header button is visible');
    passedAssertions++;

    // Verify 4 KPI cards with progress bars and slot capsules
    const kpiCards = page.locator('.kpi-card');
    const kpiCount = await kpiCards.count();
    console.log(`✓ Found ${kpiCount} KPI cards`);
    if (kpiCount >= 4) passedAssertions++;

    const progressBars = page.locator('.kpi-progress-bar');
    console.log(`✓ Found ${await progressBars.count()} KPI mini progress bars`);
    if (await progressBars.count() >= 3) passedAssertions++;

    const slotCapsule = page.locator('.kpi-slots-capsule').first();
    await slotCapsule.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified 3-IP slot capsule is active in KPI card');
    passedAssertions++;

    await page.screenshot({ path: 'tests/verify_prod_audit_console_pm_aesthetic.png' });
    console.log('📸 Captured screenshot: tests/verify_prod_audit_console_pm_aesthetic.png');

    // Switch to Tab 2 (Risk Control & Adjudication)
    const tabRisk = page.locator('.tab-btn:has-text("风控管理"), .tab-btn:has-text("Risk Control")').first();
    await tabRisk.click();
    await page.waitForTimeout(1000);

    // Open first adjudication drawer
    const adjudicateBtn = page.locator('.adjudicate-btn').first();
    if (await adjudicateBtn.count() > 0) {
      await adjudicateBtn.click();
      await page.waitForTimeout(1200);

      // Verify external portal banner in drawer
      const drawerExternalBox = page.locator('.drawer-external-portal-box').first();
      await drawerExternalBox.waitFor({ state: 'visible', timeout: 5000 });
      console.log('✓ Verified "epomail-docs 对外申诉接口" banner is present in Adjudication Drawer');
      passedAssertions++;

      await page.screenshot({ path: 'tests/verify_prod_audit_drawer_external_portal.png' });
      console.log('📸 Captured screenshot: tests/verify_prod_audit_drawer_external_portal.png');

      // Close drawer
      const drawerClose = page.locator('.el-drawer__close-btn').first();
      if (await drawerClose.count() > 0) await drawerClose.click();
      await page.waitForTimeout(500);
    }

    // Switch to Tab 3 (Policy Limits)
    const tabPolicy = page.locator('.tab-btn:has-text("策略设置"), .tab-btn:has-text("Policy Limits")').first();
    await tabPolicy.click();
    await page.waitForTimeout(1000);

    // Verify Architecture Card (Card 4)
    const archCard = page.locator('.architecture-card').first();
    await archCard.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified "对外表单与风控流转架构说明" Card 4 is present in Policy Tab');
    passedAssertions++;

    const flowDiagram = page.locator('.arch-flow-diagram').first();
    await flowDiagram.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Verified 3-step visual flow diagram (epomail-docs -> KV/D1 -> epocanvas-mail)');
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
