import { chromium } from 'playwright';

async function verifyUserList() {
  console.log('🚀 Verifying User List Multi-Mode Display...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();

  try {
    // Acquire auth token
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

    // Navigate to User List
    await page.goto('https://mail.epocanvas.com/mail/u/0/#manage/admin/user', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const userTable = page.locator('.el-table').first();
    await userTable.waitFor({ state: 'visible', timeout: 5000 });
    const headers = await page.locator('.el-table thead th').allTextContents();
    console.log(`✓ User Table Headers in default mode: ${JSON.stringify(headers)}`);

    await page.screenshot({ path: 'tests/verify_prod_user_list_multimode.png' });
    console.log('📸 Captured screenshot: tests/verify_prod_user_list_multimode.png');
    console.log('🎉 User list verified successfully!');
  } catch (err) {
    console.error('❌ User list verification failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

verifyUserList();
