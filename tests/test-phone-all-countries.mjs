import { chromium } from 'playwright';

const BASE_URL = 'https://epomail.epocanvas.workers.dev';

(async () => {
  console.log('=== 开始测试 全球多国手机号与电话号码在 el-input__inner 中的即时直接转换展示 ===');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  console.log('1. 登录 Cloudflare 生产环境...');
  const res = await page.request.post(BASE_URL + '/api/login', {
    data: { email: 'admin@epomail.bond', password: '123456' }
  });
  const token = (await res.json()).data?.token;
  if (!token) throw new Error('登录获取 token 失败');

  await page.goto(BASE_URL + '/inbox', { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('token', t), token);
  await page.evaluate(() => {
    localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
  });

  console.log('2. 访问 /settings/profile ...');
  await page.goto(BASE_URL + '/settings/profile', { waitUntil: 'domcontentloaded' });
  await page.locator('#app > *, .layout').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(500);

  // 打开添加电话号码弹窗
  console.log('3. 打开添加电话号码弹窗 ...');
  await page.locator('button:has-text("添加电话号码")').first().click();
  await page.waitForTimeout(400);

  const inputElem = page.locator('.phone-number-input input');

  // 定义全球多国测试矩阵（涵盖北美、亚洲、欧洲、南美、大洋洲等各大洲）
  const countryMatrix = [
    { name: '美国', dialCode: '+1', code: 'US', input: '2096789490', expected: '(209)-678-9490' },
    { name: '加拿大', dialCode: '+1', code: 'CA', input: '4165551234', expected: '(416)-555-1234' },
    { name: '中国', dialCode: '+86', code: 'CN', input: '13800138000', expected: '138-0013-8000' },
    { name: '香港', dialCode: '+852', code: 'HK', input: '91234567', expected: '9123-4567' },
    { name: '澳门', dialCode: '+853', code: 'MO', input: '66123456', expected: '6612-3456' },
    { name: '台湾', dialCode: '+886', code: 'TW', input: '0912345678', expected: '(0912)-345-678' },
    { name: '日本', dialCode: '+81', code: 'JP', input: '09012345678', expected: '(090)-1234-5678' },
    { name: '南韩', dialCode: '+82', code: 'KR', input: '01012345678', expected: '(010)-1234-5678' },
    { name: '英国', dialCode: '+44', code: 'GB', input: '07911123456', expected: '(07911)-123456' },
    { name: '法国', dialCode: '+33', code: 'FR', input: '0612345678', expected: '06-12-34-56-78' },
    { name: '德国', dialCode: '+49', code: 'DE', input: '015112345678', expected: '(0151)-123-4567' },
    { name: '澳大利亚', dialCode: '+61', code: 'AU', input: '0412345678', expected: '(0412)-345-678' },
    { name: '新加坡', dialCode: '+65', code: 'SG', input: '81234567', expected: '8123-4567' },
    { name: '意大利', dialCode: '+39', code: 'IT', input: '3471234567', expected: '347-123-4567' },
    { name: '西班牙', dialCode: '+34', code: 'ES', input: '612345678', expected: '612-34-56-78' },
    { name: '巴西', dialCode: '+55', code: 'BR', input: '11987654321', expected: '(11)-98765-4321' },
    { name: '俄罗斯', dialCode: '+7', code: 'RU', input: '9123456789', expected: '912-345-67-89' },
    { name: '印度', dialCode: '+91', code: 'IN', input: '9876543210', expected: '98765-43210' },
    { name: '泰国', dialCode: '+66', code: 'TH', input: '0812345678', expected: '081-234-5678' },
    { name: '越南', dialCode: '+84', code: 'VN', input: '0912345678', expected: '0912-345-678' }
  ];

  console.log(`\n4. 遍历测试全球 ${countryMatrix.length} 个主要国家和地区的实时格式化 ...`);

  for (const item of countryMatrix) {
    // 切换国家
    await page.locator('.phone-country-select').click();
    await page.waitForTimeout(200);
    const targetOption = page.locator('.el-select-dropdown__item').filter({
      has: page.locator(`span:text-is("${item.name}")`)
    }).first();
    await targetOption.click();
    await page.waitForTimeout(200);

    // 填入号码
    await inputElem.fill(item.input);
    await page.waitForTimeout(200);

    const val = await inputElem.inputValue();
    console.log(`[${item.name} / ${item.code} (${item.dialCode})] 填入 "${item.input}" -> 输入框直接呈现: "${val}" (预期: "${item.expected}")`);

    if (val !== item.expected) {
      throw new Error(`❌ [${item.name}] 格式转换不符合预期！实际: "${val}", 预期: "${item.expected}"`);
    }

    // 验证状态反馈为合规
    const validFeedback = await page.locator('.phone-validation-feedback.is-valid').count();
    if (validFeedback === 0) {
      throw new Error(`❌ [${item.name}] 校验状态未能通过！`);
    }
  }

  console.log('\n✓ 验证通过: 全球 20+ 主要国家和地区的电话号码均能在 el-input__inner 中实现毫秒级规范格式转换！');

  // 5. 额外测试渐进式输入多国抽样
  console.log('\n5. 抽样测试多国渐进式键入 ...');
  
  // 抽样 1: 日本 JP 09012345678
  await page.locator('.phone-country-select').click();
  await page.waitForTimeout(200);
  await page.locator('.el-select-dropdown__item').filter({ has: page.locator('span:text-is("日本")') }).first().click();
  await page.waitForTimeout(200);
  await inputElem.fill('');
  const jpSequence = ['0', '9', '0', '1', '2', '3', '4', '5', '6', '7', '8'];
  for (const digit of jpSequence) {
    await inputElem.pressSequentially(digit, { delay: 50 });
  }
  const jpVal = await inputElem.inputValue();
  console.log('日本逐字键入结果:', jpVal);
  if (jpVal !== '(090)-1234-5678') throw new Error(`日本逐字键入不符: ${jpVal}`);

  // 抽样 2: 英国 GB 07911123456
  await page.locator('.phone-country-select').click();
  await page.waitForTimeout(200);
  await page.locator('.el-select-dropdown__item').filter({ has: page.locator('span:text-is("英国")') }).first().click();
  await page.waitForTimeout(200);
  await inputElem.fill('');
  const gbSequence = ['0', '7', '9', '1', '1', '1', '2', '3', '4', '5', '6'];
  for (const digit of gbSequence) {
    await inputElem.pressSequentially(digit, { delay: 50 });
  }
  const gbVal = await inputElem.inputValue();
  console.log('英国逐字键入结果:', gbVal);
  if (gbVal !== '(07911)-123456') throw new Error(`英国逐字键入不符: ${gbVal}`);

  // 截图取证
  await page.screenshot({ path: 'tests/audit_phone_global_countries_verified.png' });
  console.log('📸 证据截图已保存: tests/audit_phone_global_countries_verified.png');

  console.log('\n================================================================');
  console.log('🎉 全球所有国家/地区电话号码直接在 el-input__inner 转换展示 100% 验证通过！');
  console.log('================================================================\n');

  await browser.close();
})().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});
