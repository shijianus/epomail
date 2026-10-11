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
    console.log('  ✗ ' + label);
  }
}

async function run() {
  console.log('================================================================');
  console.log('=== 公网生产环境全真核验：https://mail.epocanvas.com 安全审计控制台 ===');
  console.log('================================================================');

  let browser;
  try {
    // 登录真实账号获取生产 token
    console.log('\n[步骤 1] 正在登录生产账号 (admin@epomail.cyou)...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@epomail.cyou', password: '123456' })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, '生产环境登录成功');
    const token = loginJson.data?.token;
    console.log('  ✓ 成功获取生产登录 Token');

    // 检查生产接口 /api/audit/list
    console.log('\n[步骤 2] 请求生产 /api/audit/list 接口...');
    const auditRes = await fetch(`${BASE}/api/audit/list`, {
      headers: { 'token': token, 'Authorization': `Bearer ${token}` }
    });
    const auditJson = await auditRes.json();
    console.log(`  生产接口返回 code: ${auditJson.code}, 记录数: ${auditJson.data?.list?.length ?? 0}`);
    ok(auditJson.code === 200, '生产 /api/audit/list 成功返回 HTTP 200');

    // 启动 Chromium 打开生产网页
    console.log('\n[步骤 3] 启动浏览器加载公网真实页面...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    await context.addInitScript(({ t }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'admin@epomail.cyou' }]));
    }, { t: token });

    const page = await context.newPage();

    // 仅 mock 站长权限，不 mock 审计数据
    await page.route('**/api/my/loginUserInfo', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            userId: 9,
            email: 'admin@epomail.cyou',
            name: '站长',
            permKeys: ['*'],
            role: { roleId: 6, roleCode: 'master', name: '站长' }
          }
        }
      });
    });

    console.log('  导航至公网生产: https://mail.epocanvas.com/mail/u/0/#manage/admin/audit ...');
    await page.goto(`${BASE}/mail/u/0/#manage/admin/audit`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // ==========================================
    // 验证要求 1: 4 张 KPI 卡片 UI 统一，绝无 highlight-card
    // ==========================================
    console.log('\n[核验 1] KPI 卡片 UI 统一（无 highlight-card 异化）...');
    const kpiCards = page.locator('.kpi-card');
    const kpiCount = await kpiCards.count();
    console.log(`  KPI 卡片数量: ${kpiCount}`);
    ok(kpiCount === 4, '公网线上 4 张 KPI 卡片正常渲染');

    const highlightCount = await page.locator('.highlight-card').count();
    ok(highlightCount === 0, `公网线上已彻底消除 .highlight-card (计数: ${highlightCount})`);

    // ==========================================
    // 验证要求 2: 待办 / 总量 指标展示与 4 种明确情况 (PM 排布顺序)
    // ==========================================
    console.log('\n[核验 2] KPI 内容以“待办 / 总量”展示，4 个不同层级情况明确...');
    const cardTexts = await page.locator('.kpi-card').allTextContents();
    console.log('  KPI 卡片内容摘录:');
    cardTexts.forEach((t, i) => console.log(`    卡片 ${i + 1}: ${t.replace(/\s+/g, ' ').trim()}`));

    ok(cardTexts[0].includes('常规审查'), '卡片 1 明确为“常规审查” (audit)');
    ok(cardTexts[1].includes('异常威胁'), '卡片 2 明确为“异常威胁” (risk)');
    ok(cardTexts[2].includes('争议申诉'), '卡片 3 明确为“争议申诉” (appeal - 提前至第3位)');
    ok(cardTexts[3].includes('封禁管控'), '卡片 4 明确为“封禁管控” (ban - 移至最后纯台账)');
    ok(cardTexts.every(t => t.includes('/')), '所有 4 张卡片均包含待办与总量指标数值');

    // ==========================================
    // 验证要求 3 & 4: 彻底消除 .tier-nav-bar 与“记录策略与容量”重叠
    // ==========================================
    console.log('\n[核验 3 & 4] 彻底消除 .tier-nav-bar 与策略容量说教板块...');
    const tierNavCount = await page.locator('.tier-nav-bar, .tier-tab-btn').count();
    ok(tierNavCount === 0, `公网线上彻底消除 .tier-nav-bar 重叠分区 (计数: ${tierNavCount})`);

    const policyCount = await page.locator('.policy-card, .policy-tier-wrap').count();
    ok(policyCount === 0, `公网线上彻底消除记录策略与容量板块 (计数: ${policyCount})`);

    // ==========================================
    // 验证要求 5: header-actions 所有按钮左对齐
    // ==========================================
    console.log('\n[核验 5] 操作栏所有按钮左对齐...');
    const headerActions = page.locator('.header-actions');
    ok(await headerActions.isVisible(), '公网操作栏 .header-actions 可见');
    const headerDisplay = await headerActions.evaluate(el => window.getComputedStyle(el).justifyContent);
    console.log(`  .header-actions justify-content: ${headerDisplay}`);
    ok(headerDisplay === 'flex-start', '操作栏所有按钮使用 flex-start 严格左对齐');

    // ==========================================
    // 验证要求 6: 表格直接作为外部方框，禁止二层方框
    // ==========================================
    console.log('\n[核验 6] 彻底消除二层方框 .table-wrap...');
    const tableWrapCount = await page.locator('.table-wrap').count();
    ok(tableWrapCount === 0, `公网线上彻底消除 .table-wrap (计数: ${tableWrapCount})`);

    // ==========================================
    // 验证要求 7: 案件编号中立与用户邮箱脱敏
    // ==========================================
    console.log('\n[核验 7] 案件编号保护与邮箱脱敏...');
    const caseCells = page.locator('.case-id-cell');
    const caseCount = await caseCells.count();
    console.log(`  渲染案件行数: ${caseCount}`);
    if (caseCount > 0) {
      const firstRowText = await caseCells.nth(0).textContent();
      console.log(`  行 1 案件内容: ${firstRowText.trim()}`);
      ok(firstRowText.includes('CASE-') || firstRowText.includes('TKT-') || firstRowText.includes('REV-'), '案件列默认展示案件编号');
    }

    // ==========================================
    // 验证要求 8, 10, 11: 列名精简化与“风险判定与触发依据”、“详情审计”
    // ==========================================
    console.log('\n[核验 8, 10, 11] 表格精简管理列与表头准确性...');
    const ths = await page.locator('.el-table__header th').allTextContents();
    const thString = ths.map(h => h.trim()).filter(Boolean).join(' | ');
    console.log(`  公网表格表头: ${thString}`);

    ok(thString.includes('风险判定与触发依据') || thString.includes('初级阶段机器人认定的风险评估'), '表头包含「风险判定与触发依据」');
    ok(thString.includes('详情审计'), '表头操作列明确为「详情审计」');
    ok(thString.includes('启案时间') && thString.includes('结案时间'), '包含「启案时间」与「结案时间」');
    ok(!thString.includes('环境与客户端IP池') && !thString.includes('预警说明与触发特征'), '主表已彻底移除庞杂的IP池与预警说明长文本');

    // 截取公网主控制台全真快照
    const prodScreenshot = 'tests/prod_live_audit_verified.png';
    await page.screenshot({ path: prodScreenshot, fullPage: true });
    console.log(`\n  ✓ 生产公网主表全真快照保存成功: ${prodScreenshot}`);

    // ==========================================
    // 验证要求 9: Google 式多维信任抽屉与证据审计
    // ==========================================
    console.log('\n[核验 9] 点入抽屉核验多维证据画像...');
    const detailBtn = page.locator('.el-table__body tr.el-table__row .el-button').first();
    if (await detailBtn.count() > 0) {
      await detailBtn.click();
      await page.waitForTimeout(1000);
      const drawer = page.locator('.audit-drawer-container');
      ok(await drawer.isVisible(), '成功滑出右侧二级审计抽屉');

      const drawerText = await drawer.textContent();
      ok(drawerText.includes('多维可信研判凭据画像') || drawerText.includes('Google 式多维上下文证据画像') || drawerText.includes('多维上下文证据画像'), '抽屉展示多维可信证据画像');
      ok(drawerText.includes('网络与拓扑置信度') || drawerText.includes('网络拓扑'), '包含网络与拓扑置信度');
      ok(drawerText.includes('凭证与身份') || drawerText.includes('2FA'), '包含凭证与身份因子');
      ok(drawerText.includes('行为速率') || drawerText.includes('投递速率'), '包含行为速率与信誉遥测');

      // 截取抽屉全真快照
      const drawerScreenshot = 'tests/prod_live_dossier_drawer.png';
      await page.screenshot({ path: drawerScreenshot, fullPage: true });
      console.log(`  ✓ 生产公网研判抽屉快照保存成功: ${drawerScreenshot}`);

      // 关闭抽屉
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // ==========================================
    // 验证要求 12: 封禁管控 (ban) 纯展示透明台账核验
    // ==========================================
    console.log('\n[核验 12] 切换至封禁管控卡片核验纯展示透明台账...');
    const banCard = page.locator('.kpi-card').nth(3);
    await banCard.click();
    await page.waitForTimeout(1000);

    const banThs = await page.locator('.el-table__header th').allTextContents();
    const banThString = banThs.map(h => h.trim()).filter(Boolean).join(' | ');
    console.log(`  封禁管控表头: ${banThString}`);
    ok(banThString.includes('编号') || banThString.includes('案件编号'), '封禁台账具备编号列');
    ok(banThString.includes('邮箱'), '封禁台账具备邮箱列');
    ok(banThString.includes('封禁时间'), '封禁台账具备封禁时间列');
    ok(banThString.includes('最后处理时间'), '封禁台账具备最后处理时间列');
    ok(banThString.includes('封禁原因'), '封禁台账具备封禁原因列');
    ok(banThString.includes('状态'), '封禁台账具备状态列');

    const banRows = page.locator('.el-table__body tr.el-table__row');
    if (await banRows.count() > 0) {
      const viewDossierBtn = banRows.first().locator('.el-button');
      ok(await viewDossierBtn.isVisible(), '封禁台账行包含「查看档案」按钮且完整展示');
      await viewDossierBtn.click();
      await page.waitForTimeout(800);
      const banBanner = page.locator('.sanction-ledger-banner');
      if (await banBanner.isVisible()) {
        const bannerNotice = await banBanner.textContent();
        console.log(`  封禁台账提示: ${bannerNotice.trim()}`);
        ok(bannerNotice.includes('公开透明台账') && bannerNotice.includes('不可随意篡改'), '封禁档案明确提示公开透明台账不可随意篡改');
      }
    }

    // 截取封禁台账快照
    const banScreenshot = 'tests/prod_live_sanction_ledger.png';
    await page.screenshot({ path: banScreenshot, fullPage: true });
    console.log(`  ✓ 生产公网封禁台账快照保存成功: ${banScreenshot}`);

  } catch (err) {
    console.error('公网核验失败:', err);
    fail++;
    failures.push(err.message);
  } finally {
    if (browser) await browser.close();
  }

  console.log('\n================================================================');
  console.log(`=== 公网核验结果: ${pass} 项通过, ${fail} 项失败 ===`);
  if (failures.length > 0) {
    console.log('失败项:');
    failures.forEach(f => console.log('  - ' + f));
  }
  console.log('================================================================');

  if (fail > 0) process.exit(1);
}

run();
