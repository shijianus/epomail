import { chromium } from 'playwright';

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  const url = 'file:///home/shijian/projects/epocanvas-mail/account_details_mockup.html';
  console.log(`Navigating to ${url}...`);

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  await page.waitForTimeout(1000);

  console.log('Capturing screenshot...');
  const screenshotPath = '/home/shijian/projects/epocanvas-mail/account_details_validation_mockup_v5.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(`Screenshot saved to ${screenshotPath}`);

  await browser.close();
  console.log('Done!');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
