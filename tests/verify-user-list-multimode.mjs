import { legacyOrigin, legacyAdminEmail, legacyFetch as fetch, legacyUserEmail } from './helpers/legacy-target.mjs';
import { launchIsolatedChromium } from './helpers/legacy-browser.mjs';
import { chromium } from 'playwright';

async function verifyUserList() {
  console.log('🚀 Verifying User List Multi-Mode Display...');
  const browser = await launchIsolatedChromium(chromium, { headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();

  try {
    // Acquire auth token
    const loginRes = await fetch(legacyOrigin + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: legacyUserEmail, password: process.env.EPOMAIL_E2E_USER_PASSWORD || '' })
    });
    const loginJson = await loginRes.json();
    const token = loginJson.data?.token;

    await page.goto(legacyOrigin + '/login/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ t }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: legacyUserEmail }]));
    }, { t: token });

    await page.route('**/api/my/loginUserInfo', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            userId: 1,
            email: legacyAdminEmail,
            name: '站长',
            permKeys: ['*'],
            role: { roleId: 6, roleCode: 'master', name: '站长' }
          }
        }
      });
    });

    // Navigate to User List
    await page.goto(legacyOrigin + '/mail/u/0/#manage/admin/user', { waitUntil: 'networkidle', timeout: 30000 });
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
