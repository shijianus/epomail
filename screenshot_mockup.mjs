import { chromium } from 'playwright';

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const url = 'file:///home/shijian/projects/epocanvas-mail/analysis_mockup.html';
  console.log(`Navigating to ${url}...`);

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait a little extra to let ECharts render animations
  await page.waitForTimeout(4000);

  console.log('Capturing screenshot...');
  const screenshotPath = '/home/shijian/projects/epocanvas-mail/analysis_validation_mockup.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(`Screenshot saved to ${screenshotPath}`);

  await browser.close();
  console.log('Done!');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
