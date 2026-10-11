import { chromium } from 'playwright';
import assert from 'assert';

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
  }
}

async function run() {
  console.log('================================================================');
  console.log('=== Cloudflare 生产环境「邮箱封禁管控」全量验收审计套件 ===');
  console.log(`=== 公网真实环境: ${BASE}/mail/u/0/#manage/admin/audit ===`);
  console.log('================================================================\n');

  let browser;
  try {
    // 1. 管理员身份登录获取真实 Token
    console.log('[步骤 1] 登录生产环境管理员账号 (admin@epomail.cyou)...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@epomail.cyou', password: '123456' })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, '登录接口返回成功 200');
    const token = loginJson.data?.token;
    ok(!!token, '生产登录 Token 成功签发');

    // 2. 启动 Chromium
    console.log('\n[步骤 2] 启动 Chromium 打开公网真实控制台...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    await context.addInitScript(({ t }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('locale', 'zh');
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'admin@epomail.cyou' }]));
    }, { t: token });

    const page = await context.newPage();

    // 3. 打开封禁管控页面
    console.log('\n[步骤 3] 导航进入封禁管控后台并等待完全挂载...');
    await page.goto(`${BASE}/mail/u/0/#manage/admin/audit`, { waitUntil: 'networkidle', timeout: 35000 });
    await page.waitForSelector('.kpi-card', { timeout: 25000 });
    await page.waitForTimeout(2000);

    // 核验 1: 顶部 4 个 KPI 卡片说明文字精简
    console.log('\n[核验 1] 顶部 4 个 KPI 卡片说明文字精简核验:');
    const kpiCards = await page.$$('.kpi-card');
    ok(kpiCards.length === 4, `顶部卡片数量精确为 4 个 (实际: ${kpiCards.length})`);

    const kpiDescs = await page.$$eval('.kpi-card .kpi-desc', els => els.map(e => e.textContent.trim()));
    console.log('  KPI 卡片说明文本集:', kpiDescs);
    ok(kpiDescs.includes('策略生效中 · 阻断全部外发'), `包含说明「策略生效中 · 阻断全部外发」`);
    ok(kpiDescs.includes('近24小时新增处置'), `包含说明「近24小时新增处置」`);
    ok(kpiDescs.includes('申诉待复核'), `包含说明「申诉待复核」`);
    ok(kpiDescs.includes('撞库/黑名单探测'), `包含说明「撞库/黑名单探测」`);

    // 检查选中态（蓝色高亮）
    const activeCards = await page.$$('.kpi-card.kpi-card-active');
    ok(activeCards.length >= 1, `存在显著高亮选中态的卡片 (当前选中数: ${activeCards.length})`);

    // 核验 2: 表格信息层级与标签用词
    console.log('\n[核验 2] 表格信息层级与标签用词核验:');
    // 如果由于默认筛选导致暂无行，点击重置以展示全量数据
    let rowCount = await page.$$eval('.el-table__body-wrapper tbody tr.el-table__row', trs => trs.length);
    if (rowCount === 0) {
      console.log('  当前筛选无行，点击重置按钮展示全量数据...');
      const resetBtn = await page.$('.action-btn-group .icon-action-btn:nth-child(3)');
      if (resetBtn) {
        await resetBtn.click();
        await page.waitForTimeout(1500);
      }
      rowCount = await page.$$eval('.el-table__body-wrapper tbody tr.el-table__row', trs => trs.length);
    }
    console.log(`  线上真实记录数: ${rowCount}`);
    ok(rowCount >= 1, `存在有效封禁管控记录 (实际: ${rowCount} 条)`);

    // 邮箱主列与次要案件编号
    const firstEmail = await page.$eval('.el-table__row:nth-child(1) .clickable-email', el => el.textContent.trim());
    const firstTicket = await page.$eval('.el-table__row:nth-child(1) .ticket-sub', el => el.textContent.trim());
    ok(!!firstEmail, `邮箱为主列: ${firstEmail}`);
    ok(!!firstTicket, `案件编号作为弱化次要信息展示在下方: ${firstTicket}`);

    // 状态标签用词（带中点）
    const statusTags = await page.$$eval('.el-table__row .status-tag', els => els.map(e => e.textContent.trim()));
    console.log('  线上状态标签集:', statusTags);
    const hasActiveDot = statusTags.some(t => t.includes('生效中 · 已封禁'));
    const hasUnbannedDot = statusTags.some(t => t.includes('已解禁 · 移出黑名单'));
    const hasPending = statusTags.some(t => t.includes('待复核'));
    ok(hasActiveDot || hasUnbannedDot || hasPending, '状态标签采用带中点的统一规范用词 (生效中 · 已封禁 / 已解禁 · 移出黑名单 / 待复核)');

    // 风险标签用词
    const riskBadges = await page.$$eval('.risk-badge', els => els.map(e => e.textContent.trim()));
    console.log('  高风险标签集:', riskBadges);
    if (riskBadges.length > 0) {
      ok(riskBadges.every(t => t === '高风险 · 已管控'), '高风险标签统一为「高风险 · 已管控」');
    } else {
      ok(true, '无高风险标签或已免检通过');
    }

    // 核验 3: 行内快捷操作按钮排布与用词
    console.log('\n[核验 3] 行内快捷操作按钮排布与用词核验:');
    const firstRowButtons = await page.$$eval('.el-table__row:nth-child(1) .row-actions .el-button', els => els.map(e => e.textContent.trim()));
    console.log('  第 1 行操作按钮集:', firstRowButtons);
    ok(firstRowButtons.some(t => t.includes('解封') || t.includes('重新封禁')), '操作列包含文字按钮「解封」或「重新封禁」');
    ok(firstRowButtons.some(t => t.includes('查看详情')), '操作列包含文字按钮「查看详情」');

    // 检查延期与备注是否为圆形纯图标按钮
    const circleButtons = await page.$$eval('.el-table__row:nth-child(1) .row-actions .row-icon-btn', els => els.length);
    ok(circleButtons === 2, `延期与备注精简为 2 个圆形纯图标按钮 (实际: ${circleButtons})`);

    // 核验 4: 侧边详情抽屉与多维风险画像 Accordion 折叠
    console.log('\n[核验 4] 侧边详情抽屉与多维风险画像 Accordion 折叠核验:');
    const viewDetailBtn = await page.$('.el-table__row:nth-child(1) .row-actions .el-button:last-child');
    await viewDetailBtn.click();
    await page.waitForTimeout(1500);

    const drawerVisible = await page.$eval('.audit-drawer', el => el.offsetHeight > 0).catch(() => false);
    ok(drawerVisible, '侧边详情抽屉成功平滑唤出');

    // 抽屉标题
    const drawerTitle = await page.$eval('.drawer-title-wrap .drawer-title-text', el => el.textContent.trim());
    console.log('  抽屉标题:', drawerTitle);
    ok(drawerTitle.includes('封禁台账 · 存证（只读）'), `抽屉标题统一为「封禁台账 · 存证（只读）」 (实际: ${drawerTitle})`);

    // 抽屉内部区块标题
    const sectionTitles = await page.$$eval('.drawer-section-title span', els => els.map(e => e.textContent.trim()));
    console.log('  抽屉内分区标题集:', sectionTitles);
    ok(sectionTitles.includes('风险研判与处置依据'), '包含标题「风险研判与处置依据」');
    ok(sectionTitles.includes('多维风险画像'), '包含标题「多维风险画像」');

    // 处置依据红色警示
    const redWarningText = await page.$eval('.basis-content .text-danger', el => el.textContent.trim()).catch(() => '');
    console.log('  红色警示处置文案:', redWarningText);
    ok(!!redWarningText, '保留显式红色警示处置文案');

    // 多维风险画像 Accordion 状态
    console.log('  核验多维风险画像 Accordion 状态:');
    const collapseItems = await page.$$('.evidence-collapse .el-collapse-item');
    ok(collapseItems.length === 4, `多维风险画像分为 4 个 Accordion 面板 (实际: ${collapseItems.length})`);

    const isFirstActive = await page.$eval('.evidence-collapse .el-collapse-item:nth-child(1) .el-collapse-item__header', el => el.classList.contains('is-active'));
    const isSecondActive = await page.$eval('.evidence-collapse .el-collapse-item:nth-child(2) .el-collapse-item__header', el => el.classList.contains('is-active'));
    const isThirdCollapsed = await page.$eval('.evidence-collapse .el-collapse-item:nth-child(3) .el-collapse-item__header', el => !el.classList.contains('is-active'));
    const isFourthCollapsed = await page.$eval('.evidence-collapse .el-collapse-item:nth-child(4) .el-collapse-item__header', el => !el.classList.contains('is-active'));

    ok(isFirstActive, 'Accordion 第 1 项 (凭证与身份挑战因子) 默认展开');
    ok(isSecondActive, 'Accordion 第 2 项 (设备指纹与会话连续性) 默认展开');
    ok(isThirdCollapsed, 'Accordion 第 3 项 (行为速率与检举遥测) 默认折叠');
    ok(isFourthCollapsed, 'Accordion 第 4 项 (网络与拓扑置信度) 默认折叠');

    // 抽屉底部主操作按钮文案与行内一致性
    const drawerActionBtnText = await page.$eval('.drawer-footer-actions .el-button:last-child span', el => el.textContent.trim());
    console.log('  抽屉底部主操作按钮文案:', drawerActionBtnText);
    ok(drawerActionBtnText === '解封' || drawerActionBtnText === '重新封禁', `抽屉底部主操作按钮为「${drawerActionBtnText}」，与行内完全一致`);

    // 截图保存抽屉
    await page.screenshot({ path: 'tests/cf_live_drawer_verified.png' });
    console.log('  ✓ 抽屉展开核验截图已保存至 tests/cf_live_drawer_verified.png');

    // 关闭抽屉
    const closeBtn = await page.$('.drawer-footer-actions .el-button:first-child');
    await closeBtn.click();
    await page.waitForTimeout(600);

    // 核验 5: 筛选结果为 0 时空状态文案
    console.log('\n[核验 5] 筛选结果为 0 时空状态文案核验:');
    const searchInput = await page.$('.audit-search-input input');
    await searchInput.fill('__non_existent_search_query_token_999__');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);

    const emptyText = await page.$eval('.empty-state-wrap .empty-text', el => el.textContent.trim()).catch(() => '');
    console.log('  空状态提示文案:', emptyText);
    ok(emptyText === '当前筛选条件下暂无封禁记录', `空状态文案精确为「当前筛选条件下暂无封禁记录」 (实际: ${emptyText})`);

    // 截图保存空状态主视图
    await page.screenshot({ path: 'tests/cf_live_main_empty_verified.png' });
    console.log('  ✓ 空状态主视图核验截图已保存至 tests/cf_live_main_empty_verified.png');

    console.log('\n================================================================');
    console.log(`=== 公网真实核验统计: 通过 ${pass} 项 | 失败 ${fail} 项 ===`);
    if (failures.length > 0) {
      console.error('=== 未通过清单:', failures);
    }
    console.log('================================================================\n');

    return { pass, fail, failures };
  } catch (err) {
    console.error('审计执行异常:', err);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

run().then(res => {
  if (res.fail > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
});
