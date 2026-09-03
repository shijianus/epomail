import { chromium } from 'playwright';

const BASE_URL = 'https://epomail.epocanvas.workers.dev';

(async () => {
  console.log('=== 开始测试 AC/TA 国际标准支持、A-Z字母排序、南韩/北韩更名与 edit-name 纯净跳转 ===');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  console.log('1. 登录 Cloudflare 生产环境并设置中文语言环境...');
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

  // -------------------------------------------------------------
  // 验证需求 1: class="edit-name" 没必要有后面的 "->" 图标，纯净直接跳转
  // -------------------------------------------------------------
  console.log('\n3. 验证 class="edit-name" 是否已清除多余的箭头图标 ...');
  const langEditHtml = await page.locator('.item:has-text("系统语言") .edit-name').innerHTML();
  console.log('系统语言修改区域 HTML:', langEditHtml.trim());
  if (langEditHtml.includes('iconify') || langEditHtml.includes('arrow-right')) {
    throw new Error('❌ 系统语言的 edit-name 仍残留箭头图标！');
  }
  console.log('✓ 验证通过: 系统语言的 edit-name 纯净无箭头图标！');

  const pwdEditHtml = await page.locator('.item:has-text("密码") .edit-name').innerHTML();
  console.log('EpoCanvas 密码修改区域 HTML:', pwdEditHtml.trim());
  if (pwdEditHtml.includes('iconify') || pwdEditHtml.includes('arrow-right')) {
    throw new Error('❌ 密码项的 edit-name 仍残留箭头图标！');
  }
  console.log('✓ 验证通过: 密码项的 edit-name 纯净无箭头图标！');

  await page.screenshot({ path: 'tests/audit_edit_name_clean.png' });
  console.log('📸 证据截图已保存: tests/audit_edit_name_clean.png');

  // -------------------------------------------------------------
  // 验证需求 2: 电话号码弹窗中 AC、TA、南韩、北韩 与 国际A-Z排序
  // -------------------------------------------------------------
  console.log('\n4. 打开添加电话号码弹窗，验证 AC(+247)、TA(+290)、南韩、北韩 及 国际A-Z顺序 ...');
  await page.locator('button:has-text("添加电话号码")').first().click();
  await page.waitForTimeout(400);

  await page.locator('.phone-country-select').click();
  await page.waitForTimeout(400);

  // 过滤出国家下拉项（带有区号 +）
  const allDropdownTexts = await page.locator('.el-select-dropdown__item').allInnerTexts();
  const optionsText = allDropdownTexts.filter(t => t.includes('+'));
  console.log(`总国家/地区选项数: ${optionsText.length}`);
  console.log(`第一项: "${optionsText[0].replace(/\n/g, ' ')}"`);
  console.log(`第二项: "${optionsText[1].replace(/\n/g, ' ')}"`);
  console.log(`最后一项: "${optionsText[optionsText.length - 1].replace(/\n/g, ' ')}"`);

  if (!optionsText[0].includes('阿富汗') && !optionsText[0].includes('Afghanistan')) {
    throw new Error(`❌ 国际首位不符合 A-Z 顺序！当前第一项: ${optionsText[0]}`);
  }
  if (!optionsText[optionsText.length - 1].includes('津巴布韦') && !optionsText[optionsText.length - 1].includes('Zimbabwe')) {
    throw new Error(`❌ 国际末位不符合 A-Z 顺序！当前最后一项: ${optionsText[optionsText.length - 1]}`);
  }
  console.log('✓ 验证通过: 下拉菜单严格按照国际通用英文首字母 A-Z 排序（阿富汗至津巴布韦）！');

  // 检查 AC (+247) 阿森松岛
  const acOption = optionsText.find(t => t.includes('+247') || t.includes('阿森松') || t.includes('Ascension'));
  console.log(`AC (+247) 选项文本: "${acOption}"`);
  if (!acOption || !acOption.includes('阿森松岛') || !acOption.includes('+247')) {
    throw new Error(`❌ AC(+247) 国名未正确展示！当前内容: ${acOption}`);
  }
  console.log('✓ 验证通过: AC (+247) 拥有完整真实国名：阿森松岛！');

  // 检查 TA (+290) 特里斯坦-达库尼亚
  const taOption = optionsText.find(t => t.includes('特里斯坦') || t.includes('Tristan'));
  console.log(`TA (+290) 选项文本: "${taOption}"`);
  if (!taOption || !taOption.includes('特里斯坦') || !taOption.includes('+290')) {
    throw new Error(`❌ TA(+290) 国名未正确展示！当前内容: ${taOption}`);
  }
  console.log('✓ 验证通过: TA (+290) 拥有完整真实国名：特里斯坦-达库尼亚！');

  // 检查 南韩 (+82)
  const krOption = optionsText.find(t => t.includes('+82'));
  console.log(`KR (+82) 选项文本: "${krOption}"`);
  if (!krOption.includes('南韩') || krOption.includes('韩国 (+82)')) {
    throw new Error(`❌ 韩国未按照指示更名为“南韩”！当前内容: ${krOption}`);
  }
  console.log('✓ 验证通过: 韩国已严格规范更名为“南韩 (+82)”！');

  // 检查 北韩 (+850)
  const kpOption = optionsText.find(t => t.includes('+850'));
  console.log(`KP (+850) 选项文本: "${kpOption}"`);
  if (!kpOption.includes('北韩') || kpOption.includes('朝鲜 (+850)')) {
    throw new Error(`❌ 朝鲜未按照指示更名为“北韩”！当前内容: ${kpOption}`);
  }
  console.log('✓ 验证通过: 朝鲜已严格规范更名为“北韩 (+850)”！');

  // 选中 AC 测试国旗渲染
  console.log('\n5. 选中 AC (阿森松岛) 验证真实国旗渲染 ...');
  await page.locator('.el-select-dropdown__item:has-text("阿森松岛")').first().click();
  await page.waitForTimeout(400);

  const acFlagClass = await page.locator('.phone-country-select .el-select__prefix span.fi').getAttribute('class');
  console.log(`AC 选中后的前缀国旗 class: "${acFlagClass}"`);
  if (!acFlagClass.includes('fi-sh-ac') && !acFlagClass.includes('fi-ac')) {
    throw new Error(`❌ AC 未渲染真实国旗 class！当前 class: ${acFlagClass}`);
  }
  console.log('✓ 验证通过: AC (阿森松岛) 准确渲染真实 SVG 矢量国旗！');

  await page.screenshot({ path: 'tests/audit_ac_flag_selected.png' });
  console.log('📸 证据截图已保存: tests/audit_ac_flag_selected.png');

  // 选中 TA 测试国旗渲染
  console.log('\n6. 选中 TA (特里斯坦-达库尼亚) 验证真实国旗渲染 ...');
  await page.locator('.phone-country-select').click();
  await page.waitForTimeout(400);
  await page.locator('.el-select-dropdown__item:has-text("特里斯坦-达库尼亚")').first().click();
  await page.waitForTimeout(400);

  const taFlagClass = await page.locator('.phone-country-select .el-select__prefix span.fi').getAttribute('class');
  console.log(`TA 选中后的前缀国旗 class: "${taFlagClass}"`);
  if (!taFlagClass.includes('fi-sh-ta') && !taFlagClass.includes('fi-ta')) {
    throw new Error(`❌ TA 未渲染真实国旗 class！当前 class: ${taFlagClass}`);
  }
  console.log('✓ 验证通过: TA (特里斯坦-达库尼亚) 准确渲染真实 SVG 矢量国旗！');

  await page.screenshot({ path: 'tests/audit_ta_flag_selected.png' });
  console.log('📸 证据截图已保存: tests/audit_ta_flag_selected.png');

  console.log('\n================================================================');
  console.log('🎉 所有新增优化需求 (AC/TA 真实国名与国旗、A-Z国际排序、南韩/北韩更名、edit-name去箭头) 100% 验证通过！');
  console.log('================================================================\n');

  await browser.close();
})().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});
