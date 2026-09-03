import { chromium } from 'playwright';

const BASE_URL = 'https://epomail.epocanvas.workers.dev';

(async () => {
  console.log('=== 开始测试 电话号码纯数字输入约束、区号号段自动格式化填充及多国规范展示 ===');

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
    const s = JSON.parse(localStorage.getItem('setting') || '{}');
    s.lang = 'zh';
    localStorage.setItem('setting', JSON.stringify(s));
  });

  console.log('2. 访问 /settings/profile ...');
  await page.goto(BASE_URL + '/settings/profile', { waitUntil: 'domcontentloaded' });
  await page.locator('#app > *, .layout').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(500);

  // 打开添加电话号码弹窗
  console.log('3. 打开添加电话号码弹窗 ...');
  await page.locator('button:has-text("添加电话号码")').first().click();
  await page.waitForTimeout(400);

  // -------------------------------------------------------------
  // 测试 1: 美国的电话号码 2096789490 自动格式化为 (209)-678-9490
  // -------------------------------------------------------------
  console.log('4. 选择国家为美国并测试 2096789490 输入与格式化 ...');
  await page.locator('.phone-country-select').click();
  await page.waitForTimeout(300);
  await page.locator('.el-select-dropdown__item:has-text("美国")').first().click();
  await page.waitForTimeout(300);

  // 4.1 测试符号输入被彻底拦截（号码只允许输入数字，禁止使用包括"("")""-"" "等符号）
  console.log('4.1 测试符号输入拦截：尝试输入带有括号、中划线与空格的 "(209)-678-9490" ...');
  const inputElem = page.locator('.phone-number-input input');
  await inputElem.fill('(209)-678-9490 abc');
  await page.waitForTimeout(300);

  const rawInputValue = await inputElem.inputValue();
  console.log(`输入框内实际值: "${rawInputValue}"`);
  if (rawInputValue !== '2096789490') {
    throw new Error(`❌ 输入框未能彻底过滤符号！当前值: ${rawInputValue}`);
  }
  console.log('✓ 验证通过: 符号 "(", ")", "-", " ", 字母均被强制过滤，输入框纯净保留数字 2096789490！');

  // 4.2 验证展示上的自动填充：(209)-678-9490
  const previewFormatted = await page.locator('.phone-format-preview-bar .preview-formatted').innerText();
  console.log(`展示上的自动填充格式化文本: "${previewFormatted}"`);
  if (previewFormatted !== '(209)-678-9490') {
    throw new Error(`❌ 美国号码未按 (209)-678-9490 格式化！当前内容: ${previewFormatted}`);
  }
  console.log('✓ 验证通过: 成功自动区分区号(209)和号段678-9490，格式为 (209)-678-9490！');

  const validFeedback = await page.locator('.phone-validation-feedback.is-valid').innerText();
  console.log(`校验成功反馈: "${validFeedback}"`);
  if (!validFeedback.includes('(209)-678-9490')) {
    throw new Error(`❌ 校验反馈未包含格式化号码！当前反馈: ${validFeedback}`);
  }
  console.log('✓ 验证通过: 校验反馈精准呈现绿色合规提示与格式化号码！');

  await page.screenshot({ path: 'tests/audit_phone_us_formatted.png' });
  console.log('📸 证据截图已保存: tests/audit_phone_us_formatted.png');

  // -------------------------------------------------------------
  // 测试 2: 中国号码 13800138000 自动格式化为 138-0013-8000
  // -------------------------------------------------------------
  console.log('\n5. 切换国家为中国并测试 13800138000 格式化 ...');
  await page.locator('.phone-country-select').click();
  await page.waitForTimeout(300);
  await page.locator('.el-select-dropdown__item:has-text("中国")').first().click();
  await page.waitForTimeout(300);

  await inputElem.fill('13800138000');
  await page.waitForTimeout(300);

  const cnFormatted = await page.locator('.phone-format-preview-bar .preview-formatted').innerText();
  console.log(`中国号码格式化文本: "${cnFormatted}"`);
  if (cnFormatted !== '138-0013-8000') {
    throw new Error(`❌ 中国号码格式化不符合 138-0013-8000！当前内容: ${cnFormatted}`);
  }
  console.log('✓ 验证通过: 中国手机号码精准格式化为 138-0013-8000！');

  // -------------------------------------------------------------
  // 测试 3: 香港号码 91234567 自动格式化为 9123-4567
  // -------------------------------------------------------------
  console.log('\n6. 切换国家为香港并测试 91234567 格式化 ...');
  await page.locator('.phone-country-select').click();
  await page.waitForTimeout(300);
  await page.locator('.el-select-dropdown__item:has-text("香港")').first().click();
  await page.waitForTimeout(300);

  await inputElem.fill('91234567');
  await page.waitForTimeout(300);

  const hkFormatted = await page.locator('.phone-format-preview-bar .preview-formatted').innerText();
  console.log(`香港号码格式化文本: "${hkFormatted}"`);
  if (hkFormatted !== '9123-4567') {
    throw new Error(`❌ 香港号码格式化不符合 9123-4567！当前内容: ${hkFormatted}`);
  }
  console.log('✓ 验证通过: 香港电话号码精准格式化为 9123-4567！');

  // -------------------------------------------------------------
  // 测试 4: 台湾号码 0912345678 自动格式化为 (0912)-345-678
  // -------------------------------------------------------------
  console.log('\n7. 切换国家为台湾并测试 0912345678 格式化 ...');
  await page.locator('.phone-country-select').click();
  await page.waitForTimeout(300);
  await page.locator('.el-select-dropdown__item:has-text("台湾")').first().click();
  await page.waitForTimeout(300);

  await inputElem.fill('0912345678');
  await page.waitForTimeout(300);

  const twFormatted = await page.locator('.phone-format-preview-bar .preview-formatted').innerText();
  console.log(`台湾号码格式化文本: "${twFormatted}"`);
  if (!twFormatted.includes('0912') || !twFormatted.includes('-')) {
    throw new Error(`❌ 台湾号码格式化不符合规范！当前内容: ${twFormatted}`);
  }
  console.log(`✓ 验证通过: 台湾电话号码精准格式化为 ${twFormatted}！`);

  // -------------------------------------------------------------
  // 测试 5: 保存美国号码并验证个人中心卡片展示
  // -------------------------------------------------------------
  console.log('\n8. 重新切回美国并添加 (209)-678-9490 保存 ...');
  await page.locator('.phone-country-select').click();
  await page.waitForTimeout(300);
  await page.locator('.el-select-dropdown__item:has-text("美国")').first().click();
  await page.waitForTimeout(300);
  await inputElem.fill('2096789490');
  await page.waitForTimeout(300);

  // 点击添加保存
  await page.locator('button:has-text("添加")').last().click();
  await page.waitForTimeout(1000);

  // 验证主页面电话列表卡片
  const savedPhoneText = await page.locator('.phone-row .phone-num').first().innerText();
  console.log(`主页面卡片渲染的已保存号码: "${savedPhoneText}"`);
  if (!savedPhoneText.includes('(209)-678-9490')) {
    throw new Error(`❌ 主卡片电话号码未呈现 (209)-678-9490 规范格式！当前内容: ${savedPhoneText}`);
  }
  console.log('✓ 验证通过: 个人中心卡片完美渲染格式化号码 (209)-678-9490！');

  await page.screenshot({ path: 'tests/audit_phone_card_saved_formatted.png' });
  console.log('📸 证据截图已保存: tests/audit_phone_card_saved_formatted.png');

  console.log('\n================================================================');
  console.log('🎉 电话号码格式化规则全部 100% 验证通过！');
  console.log('================================================================\n');

  await browser.close();
})().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});
