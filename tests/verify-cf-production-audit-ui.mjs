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
  console.log('=== Cloudflare 生产环境 (mail.epocanvas.com) 真实上线检视实测 ===');
  console.log(`=== 目标路由: ${BASE}/mail/u/0/#manage/admin/audit ===`);
  console.log('================================================================\n');

  let browser;
  try {
    // 1. 获取管理员 Token
    console.log('[步骤 1] 登录生产环境管理员账号...');
    let token = '';
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@epomail.cyou', password: '123456' })
    });
    const loginJson = await loginRes.json();
    if (loginJson.code === 200 && loginJson.data?.token) {
      token = loginJson.data.token;
      ok(true, '管理员登录成功 (admin@epomail.cyou)');
    } else {
      console.warn('  ! admin@epomail.cyou 登录返回:', loginJson);
      const loginRes2 = await fetch(`${BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@epomail.bond', password: '123456' })
      });
      const loginJson2 = await loginRes2.json();
      if (loginJson2.code === 200 && loginJson2.data?.token) {
        token = loginJson2.data.token;
        ok(true, '管理员登录成功 (admin@epomail.bond)');
      }
    }

    if (!token) {
      throw new Error('无法登录生产环境获取有效管理员 Token');
    }

    // 2. 启动 Chromium
    console.log('\n[步骤 2] 启动 Chromium 渲染引擎进入公网控制台...');
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

    // 3. 访问控制台页面
    console.log('\n[步骤 3] 导航至公网生产路由...');
    await page.goto(`${BASE}/mail/u/0/#manage/admin/audit`, { waitUntil: 'networkidle', timeout: 35000 });
    await page.waitForSelector('.kpi-card', { timeout: 25000 });
    await page.waitForTimeout(3000);

    // [检视 1] KPI 汇报卡片排序与重命名
    console.log('\n[检视 1] KPI 卡片顺序与名称验证:');
    const kpiData = await page.$$eval('.kpi-card', cards => cards.map(c => {
      const title = c.querySelector('.kpi-title')?.textContent?.trim() || '';
      const sub = c.querySelector('.kpi-sub')?.textContent?.trim() || '';
      return { title, sub };
    }));
    console.log('  线上 KPI 卡片当前渲染状态:', kpiData);

    ok(kpiData.length === 4, `存在且仅存在 4 张 KPI 卡片 (当前: ${kpiData.length})`);
    if (kpiData.length >= 4) {
      ok(kpiData[0].title === '滥用威胁', `第 1 张 KPI 卡片为「滥用威胁」 (实际: ${kpiData[0].title})`);
      ok(kpiData[1].title === '申诉审计', `第 2 张 KPI 卡片为「申诉审计」 (实际: ${kpiData[1].title})`);
      ok(kpiData[2].title === '风险管理', `第 3 张 KPI 卡片为「风险管理」 (实际: ${kpiData[2].title})`);
      ok(kpiData[3].title === '操作记录', `第 4 张 KPI 卡片为「操作记录」 (实际: ${kpiData[3].title})`);
    }

    // [检视 2] 搜索冲突消除 (header-actions 内不得包含 el-input__wrapper)
    console.log('\n[检视 2] 搜索输入框冲突消除核验:');
    const headerInputCount = await page.$$eval('.header-actions .el-input__wrapper', els => els.length);
    ok(headerInputCount === 0, `header-actions 内已彻底删除本地 el-input__wrapper (实际残留: ${headerInputCount})`);

    // [检视 3] 表格列字段与定制
    console.log('\n[检视 3] 表格字段结构核验:');
    const headers = await page.$$eval('.el-table__header th .cell', cells => 
      cells.map(c => c.textContent?.trim().replace(/\s+/g, ' '))
    );
    console.log('  表头列文本列表:', headers);

    const hasSelection = await page.$('.el-table__header th.el-table-column--selection');
    ok(!!hasSelection, '包含选择列 (Checkbox 支持多选)');

    const hasTicketNo = headers.some(h => h.includes('工单编号'));
    const hasStatus = headers.some(h => h.includes('当前状态'));
    const hasCategory = headers.some(h => h.includes('违规分类'));
    const hasAlarmOrRisk = headers.some(h => h.includes('报警原因') || h.includes('风险等级'));
    const hasSuggestion = headers.some(h => h.includes('处理建议'));
    const hasProcessTime = headers.some(h => h.includes('处理时间'));
    const hasExpireTimeInThreat = headers.some(h => h.includes('到期时间'));
    const hasAssignee = headers.some(h => h.includes('负责人'));
    const hasAction = headers.some(h => h.includes('操作'));

    ok(hasTicketNo, '包含「工单编号」表头列');
    ok(hasStatus, '包含「当前状态」表头列');
    ok(hasCategory, '包含「违规分类」表头列 (对齐 punishments.md §5 规范)');
    ok(hasAlarmOrRisk, '包含「报警原因」/「风险等级」表头列');
    ok(hasSuggestion, '包含「处理建议」表头列 (全 Tab 均展示建议)');
    ok(hasProcessTime, '包含「处理时间」表头列');
    ok(!hasExpireTimeInThreat, '滥用威胁 Tab 下已成功移除「到期时间」列');
    ok(hasAssignee, '包含「负责人」表头列');
    ok(hasAction, '包含「操作」表头列');

    // [检视 4] 表头下沉筛选器与排序列箭头
    console.log('\n[检视 4] 表头集成筛选器与排序列箭头核验:');
    const filterTriggers = await page.$$('.col-filter-header .filter-trigger');
    const sortTriggers = await page.$$('.col-filter-header .header-action-trigger');
    ok(filterTriggers.length >= 2, `表头成功集成筛选器下拉触点 (实际触点数: ${filterTriggers.length})`);
    ok(sortTriggers.length >= 1, `表头成功集成时间排序列箭头触点 (实际触点数: ${sortTriggers.length})`);

    // 点击状态筛选并检查下拉菜单内容
    if (filterTriggers.length > 0) {
      await filterTriggers[0].click();
      await page.waitForTimeout(600);
      const menuItems = await page.$$eval('.el-dropdown-menu__item', items => 
        items.map(it => it.textContent?.trim()).filter(Boolean)
      );
      console.log('  状态筛选下拉菜单预览:', menuItems);
      const hasAllStatus = menuItems.some(it => it.includes('全部状态'));
      ok(hasAllStatus, '状态筛选下拉菜单包含明确说明「全部状态」');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    // [检视 5] 第四轮精益 UI 规范验证 (冗余徽标消除、违规分类呈现、无邮箱干扰、无行内按钮、无边框状态)
    console.log('\n[检视 5] 第四轮精益 UI 细节核验:');
    const tagCompactCount = await page.$$eval('.ticket-cell .tag-compact', els => els.length);
    ok(tagCompactCount === 0, `工单编号后已彻底移除重复 tag-compact 检举徽标 (实际: ${tagCompactCount})`);

    const categoryCellCount = await page.$$eval('.category-cell', els => els.length);
    ok(categoryCellCount >= 1, `中间显式呈现违规分类 (实际渲染: ${categoryCellCount} 行)`);

    const emailWrapCount = await page.$$eval('.el-table__body-wrapper .ticket-email-wrap', els => els.length);
    ok(emailWrapCount === 0, `表格行内无 ticket-email-wrap 干扰 (实际: ${emailWrapCount})`);

    const compactActionCount = await page.$$eval('.el-table__body-wrapper .action-btn-compact', els => els.length);
    ok(compactActionCount === 0, `表格行内彻底移除 action-btn-compact (实际: ${compactActionCount})`);

    const detailBtnCount = await page.$$eval('.el-table__body-wrapper .action-detail-btn', els => els.length);
    ok(detailBtnCount >= 1, `表格操作列保留唯一的 action-detail-btn 查看详情 (实际: ${detailBtnCount})`);

    const statusCleanCount = await page.$$eval('.status-clean-item', els => els.length);
    ok(statusCleanCount >= 1, `当前状态采用无边框水平对齐 status-clean-item (实际: ${statusCleanCount})`);

    const operatorLinks = await page.$$('.operator-name-link');
    ok(operatorLinks.length >= 1, `负责人列为纯名称点击链接 (实际: ${operatorLinks.length})`);
    if (operatorLinks.length > 0) {
      await operatorLinks[0].click();
      await page.waitForTimeout(600);
      const dialogVisible = await page.$('.operator-account-dialog');
      ok(!!dialogVisible, '点击负责人纯名称成功弹出「负责人账户详情」对话框');
      const closeBtn = await page.$('.operator-account-dialog .el-dialog__headerbtn, .operator-account-dialog .dialog-footer button');
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(400);
    }

    // [检视 6] header-actions 精简实用图标与批量延期
    console.log('\n[检视 6] header-actions 操作栏核验:');
    const actionIcons = await page.$$eval('.header-actions .icon', icons => icons.length);
    console.log('  header-actions 内纯图标操作集数量:', actionIcons);
    ok(actionIcons >= 5, `header-actions 包含精益纯图标操作集 (实际: ${actionIcons} 个图标)`);

    // [检视 7] 分页组件规范对齐
    console.log('\n[检视 7] 分页规范核验:');
    const tableWrap = await page.$('.table-area');
    ok(!!tableWrap, '表格与分页统一在 table-area 内紧凑布局');
    const jumperExists = await page.$('.pagination .el-pagination__jump');
    ok(!jumperExists, '分页组件已对齐用户列表规范，零冗长 jumper 元素');

    // 截图 1: 滥用威胁默认主视图
    console.log('\n[步骤 4] 截取公网生产环境完整视口截图...');
    await page.screenshot({ path: 'tests/cf_production_threat_verified.png', fullPage: true });
    console.log('  ✓ 滥用威胁视口截图已保存至: tests/cf_production_threat_verified.png');

    // 截图 2: 切换至「申诉审计」Tab 并验证到期时间与建议
    const appealCard = await page.$('.kpi-appeal');
    if (appealCard) {
      await appealCard.click();
      await page.waitForSelector('.table-area .loading-hide', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const appealHeaders = await page.$$eval('.el-table__header th .cell', cells => 
        cells.map(c => c.textContent?.trim().replace(/\s+/g, ' '))
      );
      console.log('  申诉审计 Tab 表头列文本:', appealHeaders);
      const hasRiskCol = appealHeaders.some(h => h.includes('风险等级'));
      const hasAppealExpire = appealHeaders.some(h => h.includes('到期时间'));
      const hasAppealSuggest = appealHeaders.some(h => h.includes('处理建议'));
      ok(hasRiskCol, '申诉审计 Tab 表头自适应呈现「风险等级」列');
      ok(hasAppealExpire, '申诉审计 Tab 表头保留「到期时间」列');
      ok(hasAppealSuggest, '申诉审计 Tab 表头保留「处理建议」列');
      await page.screenshot({ path: 'tests/cf_production_appeal_verified.png', fullPage: false });
      console.log('  ✓ 申诉审计视口截图已保存至: tests/cf_production_appeal_verified.png');
    }

    // 截图 3: 切换至「操作记录」Tab
    const recordCard = await page.$('.kpi-record');
    if (recordCard) {
      await recordCard.click();
      await page.waitForSelector('.table-area .loading-hide', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'tests/cf_production_record_verified.png', fullPage: false });
      console.log('  ✓ 操作记录视口截图已保存至: tests/cf_production_record_verified.png');
    }

  } catch (err) {
    fail++;
    console.error('  ✗ 验收测试发生异常:', err);
  } finally {
    if (browser) await browser.close();
  }

  console.log('\n================================================================');
  console.log(`=== 线上全真检视总结: 通过 ${pass} 项, 失败 ${fail} 项 ===`);
  if (failures.length > 0) {
    console.log('失败项目:', failures);
  }
  console.log('================================================================\n');

  if (fail > 0) {
    process.exit(1);
  }
}

run();
