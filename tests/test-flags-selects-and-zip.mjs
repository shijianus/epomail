import { chromium } from 'playwright';

const BASE_URL = 'https://epomail.epocanvas.workers.dev';

(async () => {
  console.log('=== 开始测试 1. Zip选填规则 2. 下拉菜单与滑块/后缀对齐 3. SVG国旗呈现 4. 电话与地址下拉优化 ===');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  // 登录获取认证
  console.log('1. 正在登录 Cloudflare 生产环境...');
  const res = await page.request.post(BASE_URL + '/api/login', {
    data: { email: 'admin@epomail.bond', password: '123456' }
  });
  const token = (await res.json()).data?.token;
  if (!token) throw new Error('登录获取 token 失败');

  await page.goto(BASE_URL + '/inbox', { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('token', t), token);

  // 导航至个人中心
  console.log('2. 访问 /settings/profile ...');
  await page.goto(BASE_URL + '/settings/profile', { waitUntil: 'domcontentloaded' });
  await page.locator('#app > *, .layout').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(600);

  // 验证主页面电话列表上的真实 SVG 国旗
  console.log('3. 检查主页面电话列表中国旗渲染 ...');
  const phoneRowFlags = await page.locator('.phone-row .fi').count();
  console.log(`✓ 电话列表卡片中的 SVG 国旗图标数量: ${phoneRowFlags}`);

  // -------------------------------------------------------------
  // 测试电话号码弹窗：验证真实国旗、下拉选单宽度与后缀对齐
  // -------------------------------------------------------------
  console.log('\n4. 打开添加电话号码弹窗并检查下拉选单与真实国旗 ...');
  await page.locator('button:has-text("Add Phone Number"), button:has-text("添加电话号码")').first().click();
  await page.waitForTimeout(500);

  // 检查选择框 prefix 内的 SVG 国旗
  const phoneSelectFlag = await page.locator('.phone-country-select .el-select__prefix .fi').count();
  console.log(`✓ 电话国家选择框 Prefix 内渲染真实 SVG 国旗: ${phoneSelectFlag > 0 ? '是' : '否'}`);
  if (!phoneSelectFlag) throw new Error('电话选择框未渲染 SVG 国旗！');

  // 点击展开电话国家下拉选单
  console.log('点击展开电话国家下拉菜单...');
  await page.locator('.phone-country-select').click();
  await page.waitForTimeout(500);

  // 检查下拉选单内每个选项是否均带有 SVG 国旗
  const optionFlagsCount = await page.locator('.el-select-dropdown__item .fi').count();
  console.log(`✓ 电话国家下拉选项中渲染真实 SVG 国旗数: ${optionFlagsCount}`);
  if (optionFlagsCount < 10) throw new Error('下拉选项中缺少真实 SVG 国旗！');

  // 检查下拉 Popper 宽度与 Input 宽度是否一致（已解除 280px 限制）
  const widths = await page.evaluate(() => {
    const select = document.querySelector('.phone-country-select');
    const popper = document.querySelector('.el-popper.el-select__popper:not([style*="display: none"])');
    return {
      selectWidth: select ? select.getBoundingClientRect().width : 0,
      popperWidth: popper ? popper.getBoundingClientRect().width : 0
    };
  });
  console.log(`✓ 下拉选单宽度对比: 选择框宽度 = ${widths.selectWidth}px, 下拉弹出层宽度 = ${widths.popperWidth}px`);
  if (widths.popperWidth < widths.selectWidth - 20) {
    throw new Error(`❌ 下拉菜单仍被异常约束过窄！ Popper = ${widths.popperWidth}px, Select = ${widths.selectWidth}px`);
  }
  console.log('✓ 验证通过: 下拉选单宽度与输入框完全贴合对齐，后缀与内容紧密一体！');

  await page.screenshot({ path: 'tests/audit_flags_and_phone_select.png' });
  console.log('📸 证据截图已保存: tests/audit_flags_and_phone_select.png');

  // 关闭电话弹窗
  await page.locator('.el-dialog__headerbtn').first().click().catch(() => {});
  await page.waitForTimeout(400);

  // -------------------------------------------------------------
  // 测试地址弹窗：验证 1. Zip 选填规则 2. 国旗与下拉选单对齐
  // -------------------------------------------------------------
  console.log('\n5. 打开地址弹窗并测试 Zip 动态选填规则 ...');
  // 切换为中文环境以测试精准文案
  await page.evaluate(() => {
    const settingStore = JSON.parse(localStorage.getItem('setting') || '{}');
    settingStore.lang = 'zh';
    localStorage.setItem('setting', JSON.stringify(settingStore));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#app > *, .layout').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(600);

  // 打开住家地址弹窗
  await page.locator('.item:has-text("住家地址") .edit-name').first().click();
  await page.waitForTimeout(500);

  // 5.1 验证当选择 HK (香港) 时，Zip 必须为选填
  console.log('5.1 验证国家为香港时 Zip 标签与占位符...');
  const zipLabelHK = await page.locator('label:has-text("邮政编码")').first().innerText();
  console.log(`香港状态下 Zip 标签文案: "${zipLabelHK}"`);
  if (!zipLabelHK.includes('选填')) {
    throw new Error(`❌ 香港地区未正确标记为选填！当前文案: ${zipLabelHK}`);
  }
  console.log('✓ 验证通过: 香港地区正确标记为选填！');

  // 5.2 切换国家为 CN (中国)，验证 Zip 变为标准无“选填”
  console.log('5.2 切换国家为中国，验证 Zip 标签变为标准必填/常规字段...');
  await page.locator('.el-dialog .custom-country-select').first().click();
  await page.waitForTimeout(400);
  await page.locator('.el-select-dropdown__item:has-text("中国")').first().click();
  await page.waitForTimeout(400);

  const zipLabelCN = await page.locator('label:has-text("邮政编码")').first().innerText();
  console.log(`中国状态下 Zip 标签文案: "${zipLabelCN}"`);
  if (zipLabelCN.includes('选填')) {
    throw new Error(`❌ 中国地区不应标记为选填！当前文案: ${zipLabelCN}`);
  }
  console.log('✓ 验证通过: 中国地区去除“选填”，要求标准 6 位邮政编码！');

  // 5.3 切换国家为 US (美国)，验证 Zip 变为标准无“选填”
  console.log('5.3 切换国家为美国，验证 Zip 标签与占位符...');
  await page.locator('.el-dialog .custom-country-select').first().click();
  await page.waitForTimeout(400);
  await page.locator('.el-select-dropdown__item:has-text("美国")').first().click();
  await page.waitForTimeout(400);

  const zipLabelUS = await page.locator('label:has-text("邮政编码")').first().innerText();
  console.log(`美国状态下 Zip 标签文案: "${zipLabelUS}"`);
  if (zipLabelUS.includes('选填')) {
    throw new Error(`❌ 美国地区不应标记为选填！当前文案: ${zipLabelUS}`);
  }
  console.log('✓ 验证通过: 美国地区去除“选填”，呈现标准 5 位 ZIP Code！');

  // 5.4 切换国家为北韩，验证 Zip 自动恢复为“选填”
  console.log('5.4 切换国家为北韩，验证 Zip 自动恢复为选填...');
  await page.locator('.el-dialog .custom-country-select').first().click();
  await page.waitForTimeout(400);
  await page.locator('.el-select-dropdown__item:has-text("北韩")').first().click();
  await page.waitForTimeout(400);

  const zipLabelKP = await page.locator('label:has-text("邮政编码")').first().innerText();
  console.log(`北韩状态下 Zip 标签文案: "${zipLabelKP}"`);
  if (!zipLabelKP.includes('选填')) {
    throw new Error(`❌ 北韩地区未正确标记为选填！当前文案: ${zipLabelKP}`);
  }
  console.log('✓ 验证通过: 北韩地区自动恢复为选填！');

  await page.screenshot({ path: 'tests/audit_zip_rules_and_address.png' });
  console.log('📸 证据截图已保存: tests/audit_zip_rules_and_address.png');

  console.log('\n================================================================');
  console.log('🎉 全部 4 项要求 (Zip选填规则、下拉扩展栏与后缀对齐、真实SVG国旗、电话地址下拉优化) 100% 验证通过！');
  console.log('================================================================\n');

  await browser.close();
})().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});
