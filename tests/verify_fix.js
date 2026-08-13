const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('[console error] ' + msg.text());
  });
  page.on('response', res => {
    if (res.url().includes('/api/') && res.status() >= 400 && res.status() !== 401 && res.status() !== 403) {
      errors.push(`[HTTP ${res.status()}] ${res.url()}`);
    }
  });

  const BASE = 'https://epomail.epocanvas.workers.dev';

  // Step 1: login
  console.log('=== Step 1: Login ===');
  const loginRes = await page.request.post(BASE + '/api/login', {
    data: { email: 'admin@epomail.bond', password: '123456' },
    headers: { 'Content-Type': 'application/json' }
  });
  const loginData = await loginRes.json();
  console.log('Login response code:', loginData.code);
  if (loginData.code !== 200) {
    console.log('Login failed:', loginData.message);
    await browser.close();
    return;
  }
  const token = loginData.data?.token;
  console.log('Token obtained:', !!token);

  // Step 2: test inbox API directly
  console.log('\n=== Step 2: Inbox API ===');
  const inboxRes = await page.request.get(BASE + '/api/email/list?folder=inbox&page=1&size=10', {
    headers: { Authorization: token }
  });
  const inboxData = await inboxRes.json();
  console.log('Inbox API code:', inboxData.code);
  if (inboxData.code === 200) {
    console.log('✅ Inbox API OK - total:', inboxData.data?.total ?? 'N/A');
  } else {
    console.log('❌ Inbox API error:', inboxData.message);
  }

  // Step 3: test spam API (uses is_spam)
  console.log('\n=== Step 3: Spam API ===');
  const spamRes = await page.request.get(BASE + '/api/email/list?folder=spam&page=1&size=10', {
    headers: { Authorization: token }
  });
  const spamData = await spamRes.json();
  console.log('Spam API code:', spamData.code);
  if (spamData.code === 200) {
    console.log('✅ Spam API OK - total:', spamData.data?.total ?? 'N/A');
  } else {
    console.log('❌ Spam API error:', spamData.message);
  }

  // Step 4: test snoozed API (uses snoozed_time)
  console.log('\n=== Step 4: Snoozed API ===');
  const snoozedRes = await page.request.get(BASE + '/api/email/list?folder=snoozed&page=1&size=10', {
    headers: { Authorization: token }
  });
  const snoozedData = await snoozedRes.json();
  console.log('Snoozed API code:', snoozedData.code);
  if (snoozedData.code === 200) {
    console.log('✅ Snoozed API OK - total:', snoozedData.data?.total ?? 'N/A');
  } else {
    console.log('❌ Snoozed API error:', snoozedData.message);
  }

  // Step 5: full browser test
  console.log('\n=== Step 5: Browser navigation ===');
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate((t) => localStorage.setItem('token', t), token);
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  const url = page.url();
  console.log('Final URL:', url);
  const loadingEl = await page.$('#loading-first');
  console.log('Loading screen stuck:', !!loadingEl && await loadingEl.isVisible());

  await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/verify_fix_1440.png', fullPage: true });
  console.log('Screenshot saved');

  if (errors.length) {
    console.log('\n❌ Errors found:');
    errors.forEach(e => console.log(' -', e));
  } else {
    console.log('\n✅ No unexpected errors detected');
  }

  await browser.close();
})();
