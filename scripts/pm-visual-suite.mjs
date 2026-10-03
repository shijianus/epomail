import { chromium } from 'playwright';

async function main() {
  console.log('📸 Starting Full PM Visual Capture Suite against Live Cloudflare Production...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2, // High resolution retina capture
    locale: 'zh-CN'
  });
  const page = await context.newPage();

  try {
    // -----------------------------------------------------------------
    // 1. Webmail Login - Forgot Password Cyber Modal
    // -----------------------------------------------------------------
    console.log('[1/11] Capturing Login Forgot Password Modal...');
    await page.goto('https://mail.epocanvas.com/login/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    const emailInput = page.locator('input[type="email"], input#email, input[name="email"], input[placeholder*="@"], input[placeholder*="坐标"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill('pilot-recovery@epocanvas.com');
    }

    const forgotLink = page.locator('a:has-text("忘记密码"), a:has-text("Forgot password")').first();
    await forgotLink.click();
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/pm_01_login_forgot_password_modal.png' });
    console.log('✓ Captured tests/pm_01_login_forgot_password_modal.png');

    // -----------------------------------------------------------------
    // 2. epomail-docs External Appeal Form (Google/MS Forms style)
    // -----------------------------------------------------------------
    console.log('[2/11] Capturing epomail-docs Appeal Form...');
    const shortLink = 'https://epomail-docs.pages.dev/epomail/appeal/?type=password&email=pilot-recovery%40epocanvas.com';
    await page.goto(shortLink, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'tests/pm_02_docs_appeal_form_google_style.png', fullPage: true });
    console.log('✓ Captured tests/pm_02_docs_appeal_form_google_style.png');

    // -----------------------------------------------------------------
    // 3. epomail-docs Appeal Receipt Card
    // -----------------------------------------------------------------
    console.log('[3/11] Submitting Appeal Form & Capturing Receipt...');
    const emailInputForm = page.locator('#epo-email');
    if (await emailInputForm.count() > 0) {
      const cur = await emailInputForm.inputValue();
      if (!cur) await emailInputForm.fill('pilot-recovery@epocanvas.com');
    }
    await page.fill('#epo-city', '上海市 (中国电信) / Tokyo SoftBank');
    await page.fill('#epo-contact', 'telegram @pilot_emergency');
    await page.fill('#epo-reason', '由于近期出差在公共网络产生多IP并发跳跃，导致被风控阻断。特提交指纹基准申请解除封禁。');
    await page.check('#epo-agree');
    await page.click('#epo-submit-btn');

    const receiptCard = page.locator('#receipt-card');
    await receiptCard.waitFor({ state: 'visible', timeout: 8000 });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/pm_03_docs_appeal_receipt_card.png', fullPage: true });
    console.log('✓ Captured tests/pm_03_docs_appeal_receipt_card.png');

    // -----------------------------------------------------------------
    // Authenticate Master Session on mail.epocanvas.com
    // -----------------------------------------------------------------
    console.log('[Auth] Authenticating administrator session...');
    const loginRes = await fetch('https://mail.epocanvas.com/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'audit_normal_1789140856529@epomail.bond', password: 'Audit123!' })
    });
    const loginJson = await loginRes.json();
    const token = loginJson.data?.token;

    await page.goto('https://mail.epocanvas.com/login/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ t }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'audit_normal_1789140856529@epomail.bond' }]));
    }, { t: token });

    // Mock role master
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

    let currentServerMode = 1;
    await page.route('**/setting/websiteConfig', async (route) => {
      try {
        const response = await route.fetch();
        const json = await response.json();
        if (json && json.data) {
          json.data.allMailMode = currentServerMode;
        }
        await route.fulfill({ json });
      } catch {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          json: { code: 200, data: { allMailMode: currentServerMode, domainList: ['epomail.bond'] } }
        });
      }
    });

    await page.route('**/user/list*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            total: 4,
            list: [
              {
                userId: 1,
                email: 'admin@epomail.bond',
                receiveEmailCount: 142,
                delReceiveEmailCount: 3,
                sendEmailCount: 38,
                delSendEmailCount: 1,
                storageSize: 48200000,
                spamEmailCount: 2,
                reportedByOthersCount: 0,
                reportedOthersCount: 1,
                createTime: 1770000000000,
                status: 0,
                isDel: 0,
                type: 0
              },
              {
                userId: 2,
                email: 'pilot-recovery@epocanvas.com',
                receiveEmailCount: 65,
                delReceiveEmailCount: 0,
                sendEmailCount: 12,
                delSendEmailCount: 0,
                storageSize: 18400000,
                spamEmailCount: 0,
                reportedByOthersCount: 1,
                reportedOthersCount: 0,
                createTime: 1770500000000,
                status: 1,
                isDel: 0,
                type: 1
              },
              {
                userId: 3,
                email: 'zhangsan@epocanvas.com',
                receiveEmailCount: 218,
                delReceiveEmailCount: 5,
                sendEmailCount: 94,
                delSendEmailCount: 2,
                storageSize: 124500000,
                spamEmailCount: 8,
                reportedByOthersCount: 3,
                reportedOthersCount: 2,
                createTime: 1771000000000,
                status: 0,
                isDel: 0,
                type: 1
              },
              {
                userId: 4,
                email: 'charlie@epocanvas.com',
                receiveEmailCount: 89,
                delReceiveEmailCount: 1,
                sendEmailCount: 41,
                delSendEmailCount: 0,
                storageSize: 31200000,
                spamEmailCount: 1,
                reportedByOthersCount: 2,
                reportedOthersCount: 1,
                createTime: 1771500000000,
                status: 0,
                isDel: 0,
                type: 1
              }
            ]
          }
        }
      });
    });

    // -----------------------------------------------------------------
    // 4. User List - Mode 1 (All Mail Mode: 收件 + 发件 + 存储空间)
    // -----------------------------------------------------------------
    console.log('[4/11] Capturing User List (Mode 1: 全部模式)...');
    currentServerMode = 1;
    await page.goto('https://mail.epocanvas.com/mail/u/0/#manage/admin/user', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/pm_04_user_list_mode1_all.png' });
    console.log('✓ Captured tests/pm_04_user_list_mode1_all.png');

    // -----------------------------------------------------------------
    // 5. User List - Mode 0 (Privacy Mode: 存储空间 + 垃圾邮件)
    // -----------------------------------------------------------------
    console.log('[5/11] Capturing User List (Mode 0: 隐私模式)...');
    currentServerMode = 0;
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/pm_05_user_list_mode0_privacy.png' });
    console.log('✓ Captured tests/pm_05_user_list_mode0_privacy.png');

    // -----------------------------------------------------------------
    // 6. User List - Mode 2 (Encrypted Mode: 总空间 + 被检举 + 举报他人)
    // -----------------------------------------------------------------
    console.log('[6/11] Capturing User List (Mode 2: 加密模式)...');
    currentServerMode = 2;
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'tests/pm_06_user_list_mode2_encrypted.png' });
    console.log('✓ Captured tests/pm_06_user_list_mode2_encrypted.png');

    // -----------------------------------------------------------------
    // 7. Audit Console - Tab 1 Mode 1 (Timeline Stream & 4 Warning Pills)
    // -----------------------------------------------------------------
    console.log('[7/11] Capturing Audit Console (Mode 1: 时序流 + 4类预警)...');
    await page.goto('https://mail.epocanvas.com/mail/u/0/#manage/admin/audit', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Switch mode selector to Mode 1
    const modeSelect = page.locator('.mode-selector').first();
    await modeSelect.click();
    await page.waitForTimeout(400);
    const mode1Opt = page.locator('.el-select-dropdown__item:has-text("全部模式"), .el-select-dropdown__item:has-text("Level 1")').first();
    await mode1Opt.click();
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/pm_07_audit_mode1_timeline_stream.png' });
    console.log('✓ Captured tests/pm_07_audit_mode1_timeline_stream.png');

    // -----------------------------------------------------------------
    // 8. Audit Console - Tab 1 Mode 2 (Encrypted Mode: Pure DB Narrow Table, ZERO Timestamps)
    // -----------------------------------------------------------------
    console.log('[8/11] Capturing Audit Console (Mode 2: 纯DB窄表格，零时间戳)...');
    await modeSelect.click();
    await page.waitForTimeout(400);
    const mode2Opt = page.locator('.el-select-dropdown__item:has-text("加密模式"), .el-select-dropdown__item:has-text("Level 3")').first();
    await mode2Opt.click();
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/pm_08_audit_mode2_encrypted_narrow_table.png' });
    console.log('✓ Captured tests/pm_08_audit_mode2_encrypted_narrow_table.png');

    // -----------------------------------------------------------------
    // 9. Audit Console - Tab 2 Risk Adjudication Workbench (DB Table with Ticket IDs)
    // -----------------------------------------------------------------
    console.log('[9/11] Capturing Tab 2 Risk Control Workbench...');
    const tabRisk = page.locator('.tab-btn:has-text("风控研判"), .tab-btn:has-text("Risk")').first();
    await tabRisk.click();
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/pm_09_audit_tab2_risk_workbench.png' });
    console.log('✓ Captured tests/pm_09_audit_tab2_risk_workbench.png');

    // -----------------------------------------------------------------
    // 10. Audit Console - Adjudication Drawer (Side-by-side Baseline vs Appeal)
    // -----------------------------------------------------------------
    console.log('[10/11] Capturing Adjudication Extended Drawer...');
    const adjudicateBtn = page.locator('.risk-panel .el-button:has-text("研判放行"), .risk-panel .el-button:has-text("研判")').first();
    await adjudicateBtn.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests/pm_10_audit_drawer_extended_view.png' });
    console.log('✓ Captured tests/pm_10_audit_drawer_extended_view.png');

    // Close drawer
    const drawerClose = page.locator('.el-drawer__close-btn').first();
    if (await drawerClose.count() > 0) await drawerClose.click();
    await page.waitForTimeout(500);

    // -----------------------------------------------------------------
    // 11. Audit Console - Tab 3 Policy & Architecture Flow Diagram
    // -----------------------------------------------------------------
    console.log('[11/11] Capturing Tab 3 Policy & Architecture Flow...');
    const tabPolicy = page.locator('.tab-btn:has-text("策略"), .tab-btn:has-text("Policy")').first();
    await tabPolicy.click();
    await page.waitForTimeout(800);

    await page.screenshot({ path: 'tests/pm_11_audit_tab3_policy_architecture.png' });
    console.log('✓ Captured tests/pm_11_audit_tab3_policy_architecture.png');

    console.log('\n🎉 ALL 11 PM VISUAL SCREENSHOTS CAPTURED CLEANLY!');
  } catch (err) {
    console.error('❌ Capture failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
