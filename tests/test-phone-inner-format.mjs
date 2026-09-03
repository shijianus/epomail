import { chromium } from 'playwright';

const BASE_URL = 'https://epomail.epocanvas.workers.dev';

(async () => {
  console.log('=== 开始测试 电话号码直接在 el-input__inner 转换展示及退格逻辑 ===');

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

  // 验证 phone-format-preview-bar 提示条已彻底删除
  const previewBarCount = await page.locator('.phone-format-preview-bar').count();
  console.log(`phone-format-preview-bar DOM 元素数量: ${previewBarCount}`);
  if (previewBarCount !== 0) {
    throw new Error('❌ phone-format-preview-bar 未完全移除！');
  }
  console.log('✓ 验证通过: phone-format-preview-bar 提示条已彻底删除，转为直接在输入框内实时呈现！');

  // 选择国家为美国
  console.log('4. 选择国家为美国 (+1) ...');
  await page.locator('.phone-country-select').click();
  await page.waitForTimeout(300);
  await page.locator('.el-select-dropdown__item:has-text("美国")').first().click();
  await page.waitForTimeout(300);

  const inputElem = page.locator('.phone-number-input input');

  // -------------------------------------------------------------
  // 测试 2: 逐字符键入并验证 el-input__inner 内的直接转换展示
  // 预期序列: "(2)" -> "(20)" -> "(209)" -> "(209)-6" -> "(209)-678" -> "(209)-678-9" -> "(209)-678-9490"
  // -------------------------------------------------------------
  console.log('\n5. 逐字键入 2096789490 并逐步断言 class="el-input__inner" 的值 ...');
  const typeSequence = [
    { key: '2', expected: '(2)' },
    { key: '0', expected: '(20)' },
    { key: '9', expected: '(209)' },
    { key: '6', expected: '(209)-6' },
    { key: '7', expected: '(209)-67' },
    { key: '8', expected: '(209)-678' },
    { key: '9', expected: '(209)-678-9' },
    { key: '4', expected: '(209)-678-94' },
    { key: '9', expected: '(209)-678-949' },
    { key: '0', expected: '(209)-678-9490' }
  ];

  await inputElem.focus();
  for (const step of typeSequence) {
    await inputElem.pressSequentially(step.key, { delay: 50 });
    await page.waitForTimeout(100);
    const val = await inputElem.inputValue();
    console.log(`键入 "${step.key}" -> 输入框实际值: "${val}" (预期: "${step.expected}")`);
    if (val !== step.expected) {
      throw new Error(`❌ 键入 "${step.key}" 后输入框值与预期不符！实际: "${val}", 预期: "${step.expected}"`);
    }
  }
  console.log('✓ 验证通过: 逐字输入过程完全符合 (2) -> (20) -> (209) -> (209)-6 -> (209)-678 -> (209)-678-9 -> (209)-678-9490！');

  await page.screenshot({ path: 'tests/audit_phone_inner_us_typed.png' });
  console.log('📸 证据截图已保存: tests/audit_phone_inner_us_typed.png');

  // -------------------------------------------------------------
  // 测试 3: 退格 Backspace 顺畅回退
  // -------------------------------------------------------------
  console.log('\n6. 测试 Backspace 连续退格回退 ...');
  const backspaceSequence = [
    '(209)-678-949',
    '(209)-678-94',
    '(209)-678-9',
    '(209)-678',
    '(209)-67',
    '(209)-6',
    '(209)',
    '(20)',
    '(2)'
  ];

  for (const expectedVal of backspaceSequence) {
    await inputElem.press('Backspace');
    await page.waitForTimeout(80);
    const val = await inputElem.inputValue();
    console.log(`退格后 -> 输入框实际值: "${val}" (预期: "${expectedVal}")`);
    if (val !== expectedVal) {
      throw new Error(`❌ 退格后输入框值与预期不符！实际: "${val}", 预期: "${expectedVal}"`);
    }
  }
  console.log('✓ 验证通过: Backspace 连续退格顺畅无阻！');

  // 清空并重新输入完整号码保存
  console.log('\n7. 重新输入完整号码 (209)-678-9490 并保存 ...');
  await inputElem.fill('2096789490');
  await page.waitForTimeout(200);
  const retypedVal = await inputElem.inputValue();
  console.log(`fill("2096789490") 后输入框自动转换值: "${retypedVal}"`);
  if (retypedVal !== '(209)-678-9490') {
    throw new Error(`❌ 粘贴/填入数字后未直接转换为 (209)-678-9490！实际: "${retypedVal}"`);
  }

  // -------------------------------------------------------------
  // 测试 4: 中国与香港号码直接在 el-input__inner 中格式化
  // -------------------------------------------------------------
  console.log('\n8. 切换国家为中国 (+86) 测试 13800138000 在输入框中直接转换 ...');
  await page.locator('.phone-country-select').click();
  await page.waitForTimeout(300);
  await page.locator('.el-select-dropdown__item:has-text("中国")').first().click();
  await page.waitForTimeout(300);
  await inputElem.fill('13800138000');
  await page.waitForTimeout(200);
  const cnVal = await inputElem.inputValue();
  console.log(`中国号码输入框内值: "${cnVal}"`);
  if (cnVal !== '138-0013-8000') {
    throw new Error(`❌ 中国号码在输入框内未直接转换为 138-0013-8000！实际: "${cnVal}"`);
  }
  console.log('✓ 验证通过: 中国号码直接在 el-input__inner 中显示 138-0013-8000！');

  console.log('\n9. 切换国家为香港 (+852) 测试 91234567 在输入框中直接转换 ...');
  await page.locator('.phone-country-select').click();
  await page.waitForTimeout(300);
  await page.locator('.el-select-dropdown__item:has-text("香港")').first().click();
  await page.waitForTimeout(300);
  await inputElem.fill('91234567');
  await page.waitForTimeout(200);
  const hkVal = await inputElem.inputValue();
  console.log(`香港号码输入框内值: "${hkVal}"`);
  if (hkVal !== '9123-4567') {
    throw new Error(`❌ 香港号码在输入框内未直接转换为 9123-4567！实际: "${hkVal}"`);
  }
  console.log('✓ 验证通过: 香港号码直接在 el-input__inner 中显示 9123-4567！');

  // 切回美国保存并核验个人中心卡片
  console.log('\n10. 切回美国 (+1) 保存 2096789490 ...');
  await page.locator('.phone-country-select').click();
  await page.waitForTimeout(300);
  await page.locator('.el-select-dropdown__item:has-text("美国")').first().click();
  await page.waitForTimeout(300);
  await inputElem.fill('2096789490');
  await page.waitForTimeout(200);

  // 点击添加保存
  await page.locator('button:has-text("添加")').last().click();
  await page.waitForTimeout(1000);

  // 验证主页面电话列表卡片
  const savedPhoneText = await page.locator('.phone-row .phone-num').first().innerText();
  console.log(`主页面联系卡片展示的号码: "${savedPhoneText}"`);
  if (!savedPhoneText.includes('(209)-678-9490')) {
    throw new Error(`❌ 主卡片电话号码未呈现 (209)-678-9490！实际: "${savedPhoneText}"`);
  }
  console.log('✓ 验证通过: 主卡片已保存号码完美呈现 (209)-678-9490！');

  await page.screenshot({ path: 'tests/audit_phone_inner_card_saved.png' });
  console.log('📸 证据截图已保存: tests/audit_phone_inner_card_saved.png');

  console.log('\n================================================================');
  console.log('🎉 电话号码直接在 el-input__inner 转换展示所有要求 100% 验证通过！');
  console.log('================================================================\n');

  await browser.close();
})().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});
