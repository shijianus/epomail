import { chromium } from 'playwright';

const BASE = 'https://mail.epocanvas.com';
let pass = 0, fail = 0;
const failures = [];

function ok(cond, label) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    failures.push(label);
    console.error('  ✗ ' + label);
  }
}

async function run() {
  console.log('================================================================');
  console.log('=== Cloudflare 生产环境 (mail.epocanvas.com) 真实上线验收实测 ===');
  console.log(`=== 访问地址: ${BASE}/mail/u/0/#manage/admin/audit ===`);
  console.log('================================================================\n');

  let browser;
  try {
    // 1. 获取管理员 Token
    console.log('[步骤 1] 登录生产环境管理员账号 (admin@epomail.cyou)...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@epomail.cyou', password: '123456' })
    });
    const loginJson = await loginRes.json();
    if (loginJson.code !== 200 || !loginJson.data?.token) {
      throw new Error(`登录失败: ${JSON.stringify(loginJson)}`);
    }
    const token = loginJson.data.token;
    ok(!!token, '生产登录 Token 成功获取');

    // 2. 启动浏览器
    console.log('\n[步骤 2] 启动 Chromium 打开公网真实控制台...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    await context.addInitScript(({ t }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('locale', 'zh');
      localStorage.setItem('roleCode', 'admin');
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'admin@epomail.cyou' }]));
    }, { t: token });

    const page = await context.newPage();

    // 3. 访问封禁管控页面
    console.log('\n[步骤 3] 导航进入生产环境封禁管控页面...');
    await page.goto(`${BASE}/mail/u/0/#manage/admin/audit`, { waitUntil: 'networkidle', timeout: 35000 });
    await page.waitForSelector('.kpi-card', { timeout: 25000 });
    await page.waitForTimeout(2500);

    // 检查是否有数据行，如果当前筛选下为 0，点击重置或切换为全部
    let rowCount = await page.$$eval('.el-table__row', trs => trs.length);
    if (rowCount === 0) {
      console.log('  当前筛选下暂无行，切换为全部状态...');
      const resetBtn = await page.$('.actions-left-buttons .el-button:nth-child(3)');
      if (resetBtn) {
        await resetBtn.click();
        await page.waitForTimeout(2000);
      }
      rowCount = await page.$$eval('.el-table__row', trs => trs.length);
    }
    console.log(`  生产线上当前数据行数: ${rowCount}`);
    ok(rowCount >= 1, `生产线上至少存在 1 条真实台账 (实际: ${rowCount})`);

    // 4. 核验高风险标签是否被截断
    console.log('\n[核验 1] 高风险标签文本完整性与零截断核验:');
    const riskTagInfo = await page.$eval('.el-table__row:nth-child(1) .audit-sub-tag', el => ({
      text: el.textContent.trim(),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth
    })).catch(() => null);

    if (riskTagInfo) {
      console.log('  高风险标签度量:', riskTagInfo);
      ok(riskTagInfo.text === '高风险 · 已管控', `高风险标签文本为「高风险 · 已管控」 (实际: ${riskTagInfo.text})`);
      ok(!riskTagInfo.text.includes('?'), '高风险标签不含问号 (?)');
      ok(!riskTagInfo.text.endsWith('·'), '高风险标签无末尾截断中点');
      ok(riskTagInfo.scrollWidth <= riskTagInfo.clientWidth + 1, '高风险标签内部零截断');
    }

    // 5. 核验「查看详情」按钮完整性与零截断
    console.log('\n[核验 2] 「查看详情」文字按钮完整性与零截断核验:');
    const detailBtnInfo = await page.$eval('.el-table__row:nth-child(1) .action-detail-btn', el => ({
      text: el.textContent.trim(),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth
    })).catch(() => null);

    console.log('  查看详情按钮度量:', detailBtnInfo);
    ok(detailBtnInfo && detailBtnInfo.text === '查看详情', `按钮文本完整为「查看详情」 (实际: ${detailBtnInfo?.text})`);
    ok(detailBtnInfo && detailBtnInfo.scrollWidth <= detailBtnInfo.clientWidth + 1, '按钮内部零截断，杜绝「查看详」');

    // 6. 核验操作列按钮排布与间距
    console.log('\n[核验 3] 操作列按钮排布与间距核验:');
    const actionCellWidth = await page.$eval('.el-table__row:nth-child(1) td.is-right', el => el.getBoundingClientRect().width);
    console.log(`  操作列单元格实际宽度: ${actionCellWidth}px`);
    ok(actionCellWidth >= 200, `操作列宽度不低于 200px (实际: ${actionCellWidth}px)`);

    const buttons = await page.$$eval('.el-table__row:nth-child(1) .table-actions-group .el-button', els => els.map(e => e.textContent.trim()));
    console.log('  操作按钮组文本:', buttons);
    ok(buttons.length === 4, `操作列完整包含 4 个按钮 (实际: ${buttons.length})`);
    ok(buttons.some(b => b.includes('解封') || b.includes('重新封禁')), '包含解封/重新封禁文字按钮');
    ok(buttons.some(b => b.includes('查看详情')), '包含查看详情文字按钮');

    // 截图保存主视图
    await page.screenshot({ path: 'tests/cf_live_prod_table_verified.png' });
    console.log('  ✓ 生产线上主表视图已截图保存至 tests/cf_live_prod_table_verified.png');

    // 7. 打开抽屉核验 Scheme A 两列对比证据卡片
    console.log('\n[核验 4] 侧边抽屉 Scheme A 两列对比证据卡片核验:');
    await page.click('.el-table__row:nth-child(1) .action-detail-btn');
    await page.waitForTimeout(1500);

    const drawerTitle = await page.$eval('.drawer-header-clean .drawer-title', el => el.textContent.trim());
    console.log('  抽屉标题:', drawerTitle);
    ok(drawerTitle.includes('封禁台账 · 存证（只读）'), `抽屉标题统一为「封禁台账 · 存证（只读）」 (实际: ${drawerTitle})`);

    const compareContainer = await page.$('.compare-container');
    ok(compareContainer !== null, '证据区存在两列对比容器 (.compare-container)');

    const actualCard = await page.$('.compare-card-actual');
    ok(actualCard !== null, '存在左侧实际证据值卡片 (.compare-card-actual)');

    const baselineCard = await page.$('.compare-card-baseline');
    ok(baselineCard !== null, '存在右侧系统基准阈值卡片 (.compare-card-baseline)');

    const actualTitle = await page.$eval('.compare-card-actual .card-header-title', el => el.textContent.trim());
    ok(actualTitle === '当前账号实际证据值', `左侧卡片标题为「当前账号实际证据值」 (实际: ${actualTitle})`);

    const baselineTitle = await page.$eval('.compare-card-baseline .card-header-title', el => el.textContent.trim());
    ok(baselineTitle === '系统基准 / 正常值 / 风险阈值', `右侧卡片标题为「系统基准 / 正常值 / 风险阈值」 (实际: ${baselineTitle})`);

    const compareRows = await page.$$('.compare-item-row');
    console.log(`  对比项总计渲染行数: ${compareRows.length}`);
    ok(compareRows.length >= 10, `全部关键对比项默认平铺展开 (实际项数: ${compareRows.length})`);

    const hasRedHighlight = await page.$('.compare-card-actual .text-danger');
    ok(hasRedHighlight !== null, '超标风险因子显式红色高亮警示生效');

    // 抽屉底部主按钮与行内一致性
    const drawerActionBtnText = await page.$eval('.drawer-footer-actions .el-button:last-child span', el => el.textContent.trim());
    console.log('  抽屉底部主操作按钮文案:', drawerActionBtnText);
    ok(drawerActionBtnText === '解封' || drawerActionBtnText === '重新封禁', `抽屉底部主操作按钮为「${drawerActionBtnText}」，与行内保持一致`);

    // 截图保存抽屉
    await page.screenshot({ path: 'tests/cf_live_prod_drawer_compare_verified.png' });
    console.log('  ✓ 生产线上证据两列对比卡片已截图保存至 tests/cf_live_prod_drawer_compare_verified.png');

    console.log('\n================================================================');
    console.log(`=== 公网真实生产环境核验统计: 通过 ${pass} 项 | 失败 ${fail} 项 ===`);
    console.log('================================================================\n');

    return { pass, fail };
  } finally {
    if (browser) await browser.close();
  }
}

run().then(res => {
  if (res.fail > 0) process.exit(1);
  process.exit(0);
}).catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
