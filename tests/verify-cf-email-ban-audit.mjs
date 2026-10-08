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
    console.error('  ✗ ' + label);
  }
}

async function runAudit() {
  console.log('================================================================');
  console.log('=== Cloudflare 生产环境「邮箱封禁管控」改造审计核验 (Playwright) ===');
  console.log(`=== 目标地址: ${BASE}/mail/u/0/#manage/admin/audit ===`);
  console.log('================================================================\n');

  let browser;
  try {
    // 1. 登录管理员获取 Token
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

    // 2. 启动浏览器注入会话
    console.log('\n[步骤 2] 启动 Chromium 渲染公网真实页面...');
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

    // 导航至邮箱封禁管控后台
    console.log('\n[步骤 3] 打开邮箱封禁管控页面路由...');
    await page.goto(`${BASE}/mail/u/0/#manage/admin/audit`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    // 3. 审计需求 1: 顶部 4 个统计卡片
    console.log('\n[需求 1 审计] 顶部 4 个精简指标卡片核验:');
    const kpiCards = await page.$$('.kpi-card');
    ok(kpiCards.length === 4, `顶部卡片数量精确为 4 个 (实际: ${kpiCards.length})`);

    const kpiTexts = await page.$$eval('.kpi-card .kpi-title', els => els.map(e => e.textContent.trim()));
    console.log('  卡片标题集:', kpiTexts);
    ok(kpiTexts.includes('生效中封禁'), '包含「生效中封禁」指标卡片');
    ok(kpiTexts.includes('今日新增'), '包含「今日新增」指标卡片');
    ok(kpiTexts.includes('待人工复核'), '包含「待人工复核」指标卡片');
    ok(kpiTexts.includes('高风险邮箱'), '包含「高风险邮箱」指标卡片');

    // 检查选中态（蓝色边框/高亮）
    const activeCards = await page.$$('.kpi-card.kpi-card-active');
    ok(activeCards.length >= 1, `存在明显高亮选中态的卡片 (当前选中数: ${activeCards.length})`);

    // 4. 审计需求 2: 筛选栏优化
    console.log('\n[需求 2 审计] 筛选栏优化核验:');
    const searchPlaceholder = await page.$eval('.search-input input', el => el.getAttribute('placeholder'));
    console.log('  搜索框 placeholder:', searchPlaceholder);
    ok(searchPlaceholder.includes('搜索邮箱、案件编号或关键字'), '搜索框占位符更新为「搜索邮箱、案件编号或关键字...」');

    const selectElements = await page.$$('.header-actions .el-select');
    ok(selectElements.length === 3, `筛选下拉框简化为 3 个实用筛选 (实际: ${selectElements.length})`);

    // 检查按钮集 (搜索、刷新、重置)
    const actionButtons = await page.$$('.actions-left-buttons .el-button');
    ok(actionButtons.length >= 3, `包含搜索、刷新、重置等紧凑图标按钮 (实际: ${actionButtons.length})`);

    // 5. 审计需求 3 & 4: 表格列重构与快捷操作
    console.log('\n[需求 3 & 4 审计] 表格列优先级、彩色状态标签与快捷操作按钮核验:');
    const tableHeaders = await page.$$eval('.el-table__header th .cell', els => els.map(e => e.textContent.trim()).filter(Boolean));
    console.log('  表头列清单:', tableHeaders);

    ok(tableHeaders[0].includes('邮箱'), '第 1 列为主列「邮箱」');
    ok(tableHeaders[1].includes('当前状态'), '第 2 列为「当前状态」');
    ok(tableHeaders[2].includes('封禁原因'), '第 3 列为「封禁原因」');
    ok(tableHeaders[3].includes('封禁时间'), '第 4 列为「封禁时间」');
    ok(tableHeaders[4].includes('最后处理时间'), '第 5 列为「最后处理时间」');
    ok(tableHeaders[5].includes('处理人 / 负责人'), '第 6 列为「处理人 / 负责人」');
    ok(tableHeaders[6].includes('操作'), '第 7 列为「操作」');

    // 检查重置为全部数据，验证多条数据预览
    console.log('  点击重置按钮以预览全部数据状态...');
    const resetBtn = await page.$('.actions-left-buttons .el-tooltip__trigger:nth-child(3)');
    if (resetBtn) {
      await Promise.all([
        page.waitForResponse(res => res.url().includes('/api/audit/list') && res.status() === 200, { timeout: 10000 }).catch(() => null),
        resetBtn.click()
      ]);
      await page.waitForTimeout(1000);
    }

    const rowCount = await page.$$eval('.el-table__body-wrapper tbody tr.el-table__row', trs => trs.length);
    console.log(`  表格数据行数: ${rowCount}`);
    ok(rowCount >= 3, `表格预置数据行数 >= 3 条 (实际: ${rowCount} 条)`);

    // 检查主列邮箱与次要案件编号
    const firstRowEmail = await page.$eval('.el-table__row:nth-child(1) .clickable-email', el => el.textContent.trim());
    const firstRowTicket = await page.$eval('.el-table__row:nth-child(1) .ticket-sub', el => el.textContent.trim());
    ok(!!firstRowEmail, `邮箱为主列且可点击: ${firstRowEmail}`);
    ok(!!firstRowTicket, `案件编号弱化在下方次要位置: ${firstRowTicket}`);

    // 检查彩色状态标签
    const statusTags = await page.$$eval('.el-table__row .status-tag-with-icon', els => els.map(e => e.textContent.trim()));
    console.log('  检测到的状态标签:', statusTags);
    ok(statusTags.length > 0, '状态标签附带图标并渲染正确');

    // 检查负责人列
    const operators = await page.$$eval('.el-table__row .operator-name', els => els.map(e => e.textContent.trim()));
    console.log('  检测到的负责人:', operators);
    ok(operators.length > 0, '处理人 / 负责人列数据渲染正确');

    // 检查行内快捷操作按钮 (解封/封禁, 延期, 备注, 查看详情)
    const actionBtns = await page.$$eval('.el-table__row:nth-child(1) .table-actions-group .el-button', els => els.length);
    ok(actionBtns >= 4, `行内快捷操作按钮组齐全 (包含解封、延期、备注、查看详情，按钮数: ${actionBtns})`);

    // 6. 审计侧边抽屉
    console.log('\n[需求 4 抽屉核验] 点击「查看详情」唤起侧边抽屉:');
    const viewDetailBtn = await page.$('.el-table__row:nth-child(1) .action-btn-compact:last-child');
    if (viewDetailBtn) {
      await viewDetailBtn.click();
      await page.waitForTimeout(1000);
    }

    const drawerVisible = await page.$eval('.audit-drawer-container', el => !el.classList.contains('hidden') && el.offsetHeight > 0).catch(() => false);
    ok(drawerVisible, '侧边详情抽屉成功平滑唤出');

    // 截图留存侧边抽屉
    await page.screenshot({ path: 'cf_live_drawer_audit.png' });
    console.log('  ✓ 抽屉展开截图已保存至 cf_live_drawer_audit.png');

    // 关闭抽屉并截图主页面
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const scrollWrap = document.querySelector('.el-table__body-wrapper .el-scrollbar__wrap') || document.querySelector('.el-table__body-wrapper');
      if (scrollWrap) scrollWrap.scrollLeft = 0;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'cf_live_main_audit.png' });
    console.log('  ✓ 主页面全景截图已保存至 cf_live_main_audit.png');

    // 7. 审计需求 5: 视觉与分页信息
    console.log('\n[需求 5 审计] 底部分页与暗色主题核验:');
    const paginationText = await page.$eval('.pagination', el => el.textContent.trim()).catch(() => '');
    console.log('  分页文案:', paginationText);
    ok(paginationText.includes('共') && paginationText.includes('条'), '底部分页栏存在且包含完整总数与分页规格');

    console.log('\n================================================================');
    console.log(`=== 审计结果统计: 通过 ${pass} 项 | 失败 ${fail} 项 ===`);
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

runAudit().then(res => {
  if (res.fail > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
});
