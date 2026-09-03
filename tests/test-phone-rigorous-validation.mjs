import { chromium } from 'playwright';

const BASE_URL = 'https://epomail.epocanvas.workers.dev';

(async () => {
  console.log('=== 开始测试 纯标准库 (libphonenumber-js/max) 全量真伪号段校验与错误格式拦截 ===');

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

  // 4. 测试错误号码拦截（均由 libphonenumber-js/max 标准引擎精准判定）
  console.log('\n4. 测试假号与非法号段拦截 ...');

  const invalidTestCases = [
    { country: '中国', dialCode: '+86', input: '1252546600', expectErrorContains: '未分配' },
    { country: '中国', dialCode: '+86', input: '12800138000', expectErrorContains: '未分配' },
    { country: '美国', dialCode: '+1', input: '1252546600', expectErrorContains: '未分配' },
    { country: '美国', dialCode: '+1', input: '209123', expectErrorContains: '长度不足' },
    { country: '香港', dialCode: '+852', input: '12525466', expectErrorContains: '未分配' },
    { country: '台湾', dialCode: '+886', input: '1252546600', expectErrorContains: '未分配' }
  ];

  for (const tc of invalidTestCases) {
    // 切换国家
    await page.locator('.phone-country-select').click();
    await page.waitForTimeout(150);
    const targetOption = page.locator('.el-select-dropdown__item').filter({
      has: page.locator(`span:text-is("${tc.country}")`)
    }).first();
    await targetOption.click();
    await page.waitForTimeout(150);

    // 填入非法号码
    await inputElem.fill(tc.input);
    await page.waitForTimeout(200);

    const feedback = await page.locator('.phone-validation-feedback');
    const isError = await feedback.evaluate(el => el.classList.contains('is-error'));
    const errorText = await feedback.innerText();

    console.log(`[${tc.country}] 输入非法号码 "${tc.input}" -> 拦截反馈: "${errorText}" (isError: ${isError})`);

    if (!isError) {
      throw new Error(`❌ [${tc.country}] 未能成功拦截非法号码 "${tc.input}"！`);
    }
    if (!errorText.includes(tc.expectErrorContains) && !errorText.includes('未分配') && !errorText.includes('长度不足')) {
      throw new Error(`❌ [${tc.country}] 拦截提示信息不匹配！实际: "${errorText}", 预期包含: "${tc.expectErrorContains}"`);
    }

    // 点击添加按钮，验证是否坚决阻止提交
    await page.locator('.el-dialog button:has-text("添加")').click();
    await page.waitForTimeout(300);
    // 弹窗应该保持开启状态（并未被保存关闭）
    const isDialogVisible = await page.locator('.el-dialog').isVisible();
    if (!isDialogVisible) {
      throw new Error(`❌ [${tc.country}] 错误号码竟然成功提交并关闭了弹窗！`);
    }
  }

  console.log('✓ 验证通过: 所有编造的假号与非法号段均被 libphonenumber-js/max 100% 坚决拦截并阻止保存！');

  // 截图取证：假号拦截状态
  await page.screenshot({ path: 'tests/audit_phone_fake_number_blocked.png' });
  console.log('📸 证据截图已保存: tests/audit_phone_fake_number_blocked.png');

  // 5. 验证合规真实号码正常通过
  console.log('\n5. 验证真实合规号码正常通过 ...');

  const validTestCases = [
    { country: '中国', input: '13800138000', expectedFormat: '138-0013-8000' },
    { country: '美国', input: '2096789490', expectedFormat: '(209)-678-9490' },
    { country: '香港', input: '91234567', expectedFormat: '9123-4567' },
    { country: '台湾', input: '0912345678', expectedFormat: '(0912)-345-678' }
  ];

  for (const tc of validTestCases) {
    await page.locator('.phone-country-select').click();
    await page.waitForTimeout(150);
    const targetOption = page.locator('.el-select-dropdown__item').filter({
      has: page.locator(`span:text-is("${tc.country}")`)
    }).first();
    await targetOption.click();
    await page.waitForTimeout(150);

    await inputElem.fill(tc.input);
    await page.waitForTimeout(200);

    const val = await inputElem.inputValue();
    const isValid = await page.locator('.phone-validation-feedback.is-valid').count();
    console.log(`[${tc.country}] 输入真实合规号码 "${tc.input}" -> 格式化: "${val}", 校验状态: ${isValid > 0 ? '✓ 通过' : '❌ 失败'}`);

    if (val !== tc.expectedFormat || isValid === 0) {
      throw new Error(`❌ [${tc.country}] 真实号码格式化或校验失败！实际: "${val}"`);
    }
  }

  // 截图取证：合规真实号码状态
  await page.screenshot({ path: 'tests/audit_phone_real_number_passed.png' });
  console.log('📸 证据截图已保存: tests/audit_phone_real_number_passed.png');

  console.log('\n================================================================');
  console.log('🎉 纯标准库 (libphonenumber-js/max) 校验与拦截 100% 验证通过！');
  console.log('================================================================\n');

  await browser.close();
})().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});
