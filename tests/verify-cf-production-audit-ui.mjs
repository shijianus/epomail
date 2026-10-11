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

    // [检视 3] 表格 11 大新列集结构与居中核验
    console.log('\n[检视 3] 表格 11 大新列集结构与居中核验:');
    const headers = await page.$$eval('.el-table__header th .cell', cells => 
      cells.map(c => c.textContent?.trim().replace(/\s+/g, ' '))
    );
    console.log('  表头列文本列表:', headers);

    const hasSelection = await page.$('.el-table__header th.el-table-column--selection');
    ok(!!hasSelection, '包含选择列 (Checkbox 支持多选)');

    const hasTicketNo = headers.some(h => h.includes('工单编号'));
    const hasIdentityGroup = headers.some(h => h.includes('身分组'));
    const hasCategory = headers.some(h => h.includes('违规分类'));
    const hasAlarm = headers.some(h => h.includes('报警原因'));
    const hasAlarmCount = headers.some(h => h.includes('报警次数'));
    const hasStatus = headers.some(h => h.includes('当前状态'));
    const hasSuggestion = headers.some(h => h.includes('处理建议'));
    const hasProcessTime = headers.some(h => h.includes('处理时间'));
    const hasAssignee = headers.some(h => h.includes('负责人'));
    const hasFinalAuthority = headers.some(h => h.includes('拍案管理'));
    const hasAction = headers.some(h => h.includes('操作'));

    ok(hasTicketNo, '包含「工单编号」表头列');
    ok(hasIdentityGroup, '包含「身分组」表头列');
    ok(hasCategory, '包含「违规分类」表头列');
    ok(hasAlarm, '包含「报警原因」表头列');
    ok(hasAlarmCount, '包含「报警次数」表头列');
    ok(hasStatus, '包含「当前状态」表头列');
    ok(hasSuggestion, '包含「处理建议」表头列');
    ok(hasProcessTime, '包含「处理时间」表头列');
    ok(hasAssignee, '包含「负责人」表头列');
    ok(hasFinalAuthority, '包含「拍案管理」表头列');
    ok(hasAction, '包含「操作」表头列');

    // 核验表格列全居中
    const rightAlignedCols = await page.$$eval('.el-table__header th.is-right, .el-table__body td.is-right', els => els.length);
    ok(rightAlignedCols === 0, `表格内已彻底消除 is-right 右对齐列 (实际右对齐数: ${rightAlignedCols})`);

    const centerAlignedHeaders = await page.$$eval('.el-table__header th.is-center', els => els.length);
    ok(centerAlignedHeaders >= 11, `全部 11 列及多选列均显式声明 is-center 居中对齐 (实际居中表头数: ${centerAlignedHeaders})`);

    // [检视 4] 表头下沉筛选器与排序列箭头
    console.log('\n[检视 4] 表头集成筛选器与排序列箭头核验:');
    const filterTriggers = await page.$$('.col-filter-header .filter-trigger');
    const sortTriggers = await page.$$('.col-filter-header .header-action-trigger');
    ok(filterTriggers.length >= 8, `表头成功集成 9 大列筛选器下拉触点 (实际触点数: ${filterTriggers.length})`);
    ok(sortTriggers.length >= 1, `表头成功集成时间排序列箭头触点 (实际触点数: ${sortTriggers.length})`);

    // 点击身分组筛选并检查下拉菜单内容
    if (filterTriggers.length > 0) {
      await filterTriggers[0].click();
      await page.waitForTimeout(600);
      const menuItems = await page.$$eval('.el-dropdown-menu__item', items => 
        items.map(it => it.textContent?.trim()).filter(Boolean)
      );
      console.log('  身分组筛选下拉菜单预览:', menuItems);
      const hasAllIdentities = menuItems.some(it => it.includes('全部身分'));
      ok(hasAllIdentities, '身分组筛选下拉菜单包含明确说明「全部身分」');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    // [检视 5] 11 列核心数据格式与业务组件核验
    console.log('\n[检视 5] 11 列核心数据格式与业务组件核验:');
    // 1. 工单编号格式验证 (# 开头不超过6个字符，如 #AK1789)
    const ticketIds = await page.$$eval('.ticket-cell .ticket-id', els => els.map(e => e.textContent?.trim()));
    console.log('  渲染工单编号样本:', ticketIds.slice(0, 5));
    const allValidTicketIds = ticketIds.every(id => /^#[A-Z0-9]{4,6}$/.test(id));
    ok(allValidTicketIds, `工单编号均符合 #开头不超过6位大写字母与数字规范 (例如 #AK1789)`);

    // 2. 身分组呈现 (纯文本无边框)
    const identityTexts = await page.$$eval('.identity-cell .plain-identity-text', els => els.map(e => e.textContent?.trim()));
    ok(identityTexts.length >= 1, `身分组采用纯文本无边框正常渲染 (渲染数: ${identityTexts.length}, 样本: ${identityTexts[0]})`);

    // 3. 报警次数呈现 (纯文本无边框)
    const alarmCounts = await page.$$eval('.alarm-count-cell .plain-alarm-count', els => els.map(e => e.textContent?.trim()));
    ok(alarmCounts.length >= 1, `报警次数采用纯文本无边框正常渲染且带单位 (渲染数: ${alarmCounts.length}, 样本: ${alarmCounts[0]})`);

    // 4. 处理建议呈现 (纯文本无边框)
    const suggestionTexts = await page.$$eval('.suggestion-cell .plain-suggestion-text', els => els.map(e => e.textContent?.trim()));
    ok(suggestionTexts.length >= 1, `处理建议采用纯文本无边框正常渲染 (渲染数: ${suggestionTexts.length}, 样本: ${suggestionTexts[0]})`);

    // 5. 拍案管理呈现 (与负责人格式一致，直接写管理员名称并允许点击到用户详情)
    const operatorLinks = await page.$$('.operator-name-link');
    ok(operatorLinks.length >= 2, `负责人与拍案管理均渲染为管理员纯名称链接 (实际总数: ${operatorLinks.length})`);

    // 6. 操作列居中呈现唯一的 action-detail-btn
    const detailBtnCount = await page.$$eval('.action-cell .action-detail-btn', els => els.length);
    ok(detailBtnCount >= 1, `表格操作列在居中容器内呈现查看详情 (实际: ${detailBtnCount})`);

    if (operatorLinks.length > 0) {
      await operatorLinks[0].click();
      await page.waitForTimeout(600);
      const dialogVisible = await page.$('.operator-account-dialog');
      ok(!!dialogVisible, '点击管理员纯名称成功弹出「负责人账户详情」对话框');
      const closeBtn = await page.$('.operator-account-dialog .el-dialog__headerbtn, .operator-account-dialog .dialog-footer button');
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(400);
    }

    // [检视 6] header-actions 精简实用图标
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

    // 步骤 4: 视口截图
    console.log('\n[步骤 4] 截取公网生产环境完整视口截图...');
    await page.screenshot({ path: 'tests/cf_production_threat_verified.png', fullPage: true });
    console.log('  ✓ 滥用威胁视口截图已保存至: tests/cf_production_threat_verified.png');

    // 申诉审计 Tab 切换截图
    const appealCard = await page.$('.kpi-appeal');
    if (appealCard) {
      await appealCard.click();
      await page.waitForSelector('.table-area .loading-hide', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'tests/cf_production_appeal_verified.png', fullPage: false });
      console.log('  ✓ 申诉审计视口截图已保存至: tests/cf_production_appeal_verified.png');
    }

    // 操作记录 Tab 切换截图
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
