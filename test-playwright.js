const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const urls = [
    'https://epomail-docs.pages.dev/epomail/en/mail/overview/',
    'https://epomail-docs.pages.dev/epomail/en/mail/privacy-policy/',
    'https://epomail-docs.pages.dev/epomail/en/mail/terms-of-service/',
    'https://epomail-docs.pages.dev/epomail/en/mail/tamper-proof/',
    'https://epomail-docs.pages.dev/epomail/en/mail/acceptable-use/',
    'https://epomail-docs.pages.dev/epomail/en/mail/data-security/'
  ];

  for (const url of urls) {
    console.log(`\nNavigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle' });
    
    // Check paragraphs, H3, callouts
    const pCount = await page.$$eval('p', ps => ps.filter(p => p.innerText.length > 50).length);
    const h3Count = await page.$$eval('h3', h3s => h3s.length);
    const calloutCount = await page.$$eval('.starlight-aside', blocks => blocks.length);
    
    console.log(`- Paragraphs (>50 chars): ${pCount}, H3s: ${h3Count}, Callouts: ${calloutCount}`);
    
    // Check tamper-proof widget
    const tamperProofCount = await page.$$eval('#tamper-proof-widget, .tamper-proof-panel', els => els.length);
    console.log(`- Tamper-proof widgets: ${tamperProofCount}`);
    
    // Check SVG limits
    const svgCount = await page.$$eval('main img[src$=".svg"], main svg', els => els.length);
    console.log(`- SVGs in main content: ${svgCount}`);
    
    // Check "reference only" text
    const hasDegradationText = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('reference only') || text.includes('僅供參考') || text.includes('繁體中文為準');
    });
    console.log(`- Degradation text: ${hasDegradationText ? 'FOUND' : 'None'}`);
  }

  await browser.close();
})();
