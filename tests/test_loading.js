const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Test workers.dev URL (no token)
  console.log('--- Testing workers.dev (no token) ---');
  
  // Clear localStorage before visiting
  await page.goto('https://epomail.epocanvas.workers.dev/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Check if loading-first element exists
  const loadingEl = await page.$('#loading-first');
  console.log('Loading element present:', !!loadingEl);
  
  // Wait and see what happens
  console.log('Waiting 5 seconds to see if loading clears or redirects...');
  await page.waitForTimeout(5000);
  
  const currentUrl = page.url();
  console.log('Current URL after 5s:', currentUrl);
  
  const loadingStillExists = await page.$('#loading-first');
  console.log('Loading element still present after 5s:', !!loadingStillExists);
  
  if (loadingStillExists) {
    const isVisible = await loadingStillExists.isVisible();
    console.log('Loading element visible:', isVisible);
  }
  
  // Check console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Console error:', msg.text());
    }
  });
  
  // Take screenshot
  await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/loading_test.png', fullPage: true });
  console.log('Screenshot saved');
  
  // Now test with a fake token to simulate post-login scenario
  console.log('\n--- Testing with fake token (simulating post-login) ---');
  const page2 = await browser.newPage();
  
  // Set up console error capture BEFORE navigation
  const errors = [];
  page2.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page2.on('pageerror', err => {
    errors.push('Page error: ' + err.message);
  });
  
  await page2.goto('https://epomail.epocanvas.workers.dev/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Set fake token
  await page2.evaluate(() => {
    localStorage.setItem('token', 'fake_expired_token');
  });
  
  // Navigate again with the fake token
  await page2.goto('https://epomail.epocanvas.workers.dev/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  console.log('Waiting 10 seconds with fake token...');
  await page2.waitForTimeout(10000);
  
  const currentUrl2 = page2.url();
  console.log('Current URL after 10s:', currentUrl2);
  
  const loadingEl2 = await page2.$('#loading-first');
  console.log('Loading element present after 10s:', !!loadingEl2);
  if (loadingEl2) {
    const isVisible2 = await loadingEl2.isVisible();
    console.log('Loading element visible:', isVisible2);
  }
  
  console.log('Console errors captured:', errors.length);
  errors.forEach(e => console.log('  -', e));
  
  await page2.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/loading_test_with_token.png', fullPage: true });
  console.log('Screenshot saved');
  
  await browser.close();
})();
