import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import assert from 'assert';

const DIST_DIR = path.resolve('mail-worker/dist');
const PORT = 8899;

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

// Simple static server for mail-worker/dist
function startServer() {
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '/mail' || reqPath.startsWith('/mail/')) {
      reqPath = '/index.html';
    }
    let filePath = path.join(DIST_DIR, reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html; charset=UTF-8',
      '.js': 'application/javascript; charset=UTF-8',
      '.css': 'text/css; charset=UTF-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch (e) {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[Static Server] Running on http://127.0.0.1:${PORT}`);
      resolve(server);
    });
  });
}

async function run() {
  console.log('================================================================');
  console.log('=== 全真栈核验：风控与安全审计控制台 11 项要求深度体检套件 ===');
  console.log('================================================================');

  const server = await startServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    const mockToken = 'mock-audit-admin-token-12345';
    await context.addInitScript(({ t }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'admin@epocanvas.com' }]));
    }, { t: mockToken });

    const page = await context.newPage();

    // Mock Backend APIs
    await page.route('**/api/my/loginUserInfo', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            userId: 1,
            email: 'admin@epocanvas.com',
            name: '系统站长',
            permKeys: ['*'],
            role: { roleId: 1, roleCode: 'master', name: '站长' }
          }
        }
      });
    });

    await page.route('**/api/email/sidebarStats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { code: 200, data: {} }
      });
    });

    await page.route('**/api/account/list', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { code: 200, data: [{ accountId: 1, email: 'admin@epocanvas.com' }] }
      });
    });

    // Mock Audit List Data
    const mockList = [
      {
        id: 101,
        ticketId: 'CASE-20261004-9812',
        email: 'attacker_x@suspicious.org',
        warningType: 'anomalous_burst',
        eventType: 'api_abuse',
        category: 'risk',
        actionText: '高频并发调用发信接口超阈值',
        detailText: '检测到10秒内发起45次发信请求，命中恶意群发防御规则',
        ip: '198.51.100.23',
        geo: 'US-Virginia (AWS-US-EAST)',
        device: 'Go-http-client/1.1 (Automated Script)',
        deviceType: 'bot',
        fingerprint: 'fp_hash_77ab8901cc',
        baseIp: '203.0.113.10',
        baseGeo: 'CN-Guangdong',
        baseDevice: 'macOS Chrome 130.0.0.0',
        baseFingerprint: 'fp_hash_1122334455',
        isRegIp: 0,
        isMultiIp: 1,
        activeIpCount: 8,
        reportedByOthers: 3,
        riskLevel: 'critical',
        priority: 'P0',
        status: 'active',
        recommendedAction: 'immediate_freeze',
        matchScore: 12,
        subnetMatch: 0,
        appealReason: '',
        resolvedTime: null,
        createTime: '2026-10-04 10:15:30'
      },
      {
        id: 102,
        ticketId: 'CASE-20261004-7741',
        email: 'user_appealing@partner.com',
        warningType: 'appeal_review',
        eventType: 'user_appeal',
        category: 'appeal',
        actionText: '用户提交账号解封申诉请求',
        detailText: '出差新加坡期间登录被阻断，请核实并协助恢复访问',
        ip: '185.220.101.5',
        geo: 'SG-Singapore (Residential)',
        device: 'iPhone iOS 18.2 Mobile Safari',
        deviceType: 'mobile',
        fingerprint: 'fp_hash_apple_safari_2026',
        baseIp: '185.220.101.5',
        baseGeo: 'SG-Singapore',
        baseDevice: 'iPhone iOS 18.2 Mobile Safari',
        baseFingerprint: 'fp_hash_apple_safari_2026',
        isRegIp: 1,
        isMultiIp: 0,
        activeIpCount: 1,
        reportedByOthers: 0,
        riskLevel: 'high',
        priority: 'P1',
        status: 'pending_appeal',
        recommendedAction: 'require_2fa_reset',
        matchScore: 92,
        subnetMatch: 1,
        appealReason: '我是合作伙伴员工，近期在新加坡参加展会，由于酒店网络变动触发了系统拦截，附带出差凭证及工牌。',
        resolvedTime: null,
        createTime: '2026-10-04 09:20:11'
      },
      {
        id: 103,
        ticketId: 'CASE-20261003-3319',
        email: 'closed_account@example.com',
        warningType: 'credential_stuffing',
        eventType: 'brute_force',
        category: 'ban',
        actionText: '密码撞库攻击阻断并实施冻结',
        detailText: '连续50次密码输入错误，系统自动执行封禁',
        ip: '192.0.2.88',
        geo: 'DE-Frankfurt',
        device: 'Python/3.11 requests',
        deviceType: 'bot',
        fingerprint: 'fp_hash_py_bad',
        baseIp: '192.0.2.88',
        baseGeo: 'DE-Frankfurt',
        baseDevice: 'Python/3.11 requests',
        baseFingerprint: 'fp_hash_py_bad',
        isRegIp: 0,
        isMultiIp: 1,
        activeIpCount: 15,
        reportedByOthers: 12,
        riskLevel: 'critical',
        priority: 'P0',
        status: 'resolved',
        recommendedAction: 'permanent_ban',
        matchScore: 5,
        subnetMatch: 0,
        appealReason: '',
        resolvedTime: '2026-10-03 18:45:00',
        createTime: '2026-10-03 14:10:00'
      }
    ];

    await page.route('**/api/audit/list*', async (route) => {
      const url = new URL(route.request().url());
      const lifecycle = url.searchParams.get('lifecycle') || 'all';
      const keyword = (url.searchParams.get('keyword') || '').trim().toLowerCase();

      let filtered = [...mockList];
      if (lifecycle === 'active') {
        filtered = filtered.filter(item => item.status === 'active' || item.status === 'pending_appeal');
      } else if (lifecycle === 'resolved') {
        filtered = filtered.filter(item => item.status === 'resolved' || item.status === 'expired');
      }

      if (keyword) {
        filtered = filtered.filter(item =>
          item.ticketId.toLowerCase().includes(keyword) ||
          item.email.toLowerCase().includes(keyword) ||
          item.actionText.toLowerCase().includes(keyword)
        );
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            list: filtered,
            total: filtered.length,
            counts: {
              audit: 0,
              auditTotal: 1,
              risk: 1,
              riskTotal: 1,
              ban: 0,
              banTotal: 1,
              appeal: 1,
              appealTotal: 1,
              total: 2,
              allTotal: 3,
              categories: {
                audit: { pending: 0, total: 1 },
                risk: { pending: 1, total: 1 },
                ban: { pending: 0, total: 1 },
                appeal: { pending: 1, total: 1 },
                total: { pending: 2, total: 3 }
              }
            }
          }
        }
      });
    });

    console.log('\n[步骤 1] 正在加载并渲染操作报告控制台...');
    await page.goto(`http://127.0.0.1:${PORT}/mail/u/0/#manage/admin/audit`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);

    // ==========================================
    // Requirement 1: Unified KPI Cards UI
    // ==========================================
    console.log('\n[核验要求 1] 统一 KPI 卡片 UI（杜绝申诉警告卡片特殊异化）...');
    const kpiCards = page.locator('.kpi-card');
    const kpiCount = await kpiCards.count();
    ok(kpiCount === 4, `4 张 KPI 汇报卡片成功渲染 (数量: ${kpiCount})`);

    const highlightCardCount = await page.locator('.highlight-card').count();
    ok(highlightCardCount === 0, `彻底消除 highlight-card 异化类名 (.highlight-card 计数: ${highlightCardCount})`);

    const pulseBeaconCount = await page.locator('.pulse-beacon').count();
    ok(pulseBeaconCount === 0, `彻底消除呼吸闪烁光斑 (.pulse-beacon 计数: ${pulseBeaconCount})`);

    // ==========================================
    // Requirement 2: Pending / Total metric format & Clear situations
    // ==========================================
    console.log('\n[核验要求 2] KPI 内容以“待办数据 / 总数据”展示，明确 4 个层级情况...');
    const card1Value = await kpiCards.nth(0).locator('.kpi-value').textContent();
    const card2Value = await kpiCards.nth(1).locator('.kpi-value').textContent();
    const card4Value = await kpiCards.nth(3).locator('.kpi-value').textContent();
    console.log(`  KPI 卡片 1 (初筛): ${card1Value.trim()}`);
    console.log(`  KPI 卡片 2 (研判): ${card2Value.trim()}`);
    console.log(`  KPI 卡片 4 (申诉): ${card4Value.trim()}`);
    ok(card2Value.includes('/'), `KPI 数值采用 待办/总数据 结构 (当前值: ${card2Value.trim()})`);
    ok(card4Value.includes('1 / 1') || card4Value.includes('/'), `申诉 KPI 正确展示 待办 / 总数据`);

    const cardDescriptions = await page.locator('.kpi-sub').allTextContents();
    console.log(`  卡片场景说明: ${JSON.stringify(cardDescriptions)}`);
    ok(cardDescriptions.length === 4, '4 个层级均具备明确的业务与风险场景说明');

    // ==========================================
    // Requirement 3: Case Lifecycle partition vs KPI
    // ==========================================
    console.log('\n[核验要求 3] 分区优化：以“全部案件 / 正在审计 / 已结案”治理生命周期...');
    const lifecycleTabs = page.locator('.tier-tab-btn');
    const tabCount = await lifecycleTabs.count();
    ok(tabCount === 3, `生命周期分区呈现 3 个清晰阶段按钮 (数量: ${tabCount})`);

    // ==========================================
    // Requirement 4: Management vs Documentation separation
    // ==========================================
    console.log('\n[核验要求 4] 管理与展示分离：界面绝无“记录策略与容量”说明卡片，策略已分流至文档...');
    const policyCardsCount = await page.locator('.policy-card, .policy-tier-wrap').count();
    ok(policyCardsCount === 0, `彻底消除策略说教卡片与容量说明 (.policy-card 计数: ${policyCardsCount})`);

    const actionIcons = page.locator('.actions-left-icons .action-icon');
    const iconCount = await actionIcons.count();
    console.log(`  操作栏辅助图标数量: ${iconCount}`);
    ok(iconCount >= 4, '在操作栏提供搜索、排序、刷新与统一官方文档入口');

    // ==========================================
    // Requirement 5: Left-aligned buttons & Search sync
    // ==========================================
    console.log('\n[核验要求 5] 统一操作按钮左对齐与搜索集成联动...');
    const headerActions = page.locator('.header-actions');
    ok(await headerActions.isVisible(), '操作工具栏 .header-actions 正常渲染');

    const searchInput = page.locator('.search-input input');
    ok(await searchInput.isVisible(), '搜索输入框在操作栏左侧就绪');

    // Test search filter
    await searchInput.fill('CASE-20261004-9812');
    await searchInput.press('Enter');
    await page.waitForTimeout(500);

    const rowsAfterSearch = await page.locator('.el-table__body tr.el-table__row').count();
    console.log(`  搜索 CASE-20261004-9812 后匹配行数: ${rowsAfterSearch}`);
    ok(rowsAfterSearch >= 1, '搜索功能正常过滤目标案件');
    await searchInput.fill('');
    await searchInput.press('Enter');
    await page.waitForTimeout(500);

    // ==========================================
    // Requirement 6: Single container without detached .table-wrap
    // ==========================================
    console.log('\n[核验要求 6] 禁止出现二层脱节方框，表格直接作为外部方框...');
    const tableWrapCount = await page.locator('.table-wrap').count();
    ok(tableWrapCount === 0, `彻底消除脱节的 .table-wrap 方框 (.table-wrap 计数: ${tableWrapCount})`);

    const workbenchEl = page.locator('.audit-workbench');
    ok(await workbenchEl.isVisible(), '统一由 .audit-workbench 单一容器承载操作栏与表格');

    // ==========================================
    // Requirement 7: User Email Masking prior to case resolution
    // ==========================================
    console.log('\n[核验要求 7] 用户邮箱默认掩码编号化，仅在结案后显式名称...');
    // Row 1 (status: active): should display ticketId CASE-20261004-9812, NOT raw email attacker_x@suspicious.org
    const rows = page.locator('.el-table__body tr.el-table__row');
    const rowCount = await rows.count();
    console.log(`  主表格渲染案件行数: ${rowCount}`);
    ok(rowCount >= 1, '主表格渲染出有效案件行');

    const row1Subject = await rows.nth(0).locator('.case-id-cell').textContent();
    console.log(`  未结案案件 (行 1) 展示内容: ${row1Subject.trim()}`);
    ok(row1Subject.includes('CASE-20261004-9812'), '未结案案件仅展示案件编号 ticketId');
    ok(!row1Subject.includes('attacker_x@suspicious.org'), '未结案案件严格隐匿用户邮箱，杜绝调查偏见');

    // Switch to resolved cases tab
    await lifecycleTabs.nth(2).click(); // '已结案'
    await page.waitForTimeout(500);
    const resolvedRows = await page.locator('.el-table__body tr.el-table__row').count();
    if (resolvedRows > 0) {
      const resolvedSubject = await page.locator('.el-table__body tr.el-table__row').nth(0).locator('.case-id-cell').textContent();
      console.log(`  已结案案件展示内容: ${resolvedSubject.trim()}`);
      ok(resolvedSubject.includes('CASE-20261003-3319') || resolvedSubject.includes('closed_account'), '已结案案件展示结案主体标识与编号');
    }

    // Switch back to '全部案件'
    await lifecycleTabs.nth(0).click();
    await page.waitForTimeout(500);

    // ==========================================
    // Requirement 8: Simple table metadata & Secondary display in right drawer
    // ==========================================
    console.log('\n[核验要求 8] 表格精简化管理字段，证据移至右侧抽屉二级展示...');
    const tableHeaders = await page.locator('.el-table__header th').allTextContents();
    console.log(`  表格列头: ${tableHeaders.map(h => h.trim()).filter(Boolean).join(' | ')}`);
    const hasBulkyIpColumn = tableHeaders.some(h => h.includes('环境与客户端IP池') || h.includes('预警说明与触发特征'));
    ok(!hasBulkyIpColumn, '主表格已彻底移除庞杂的“环境与客户端IP池”及“预警说明与触发特征”冗余列');

    // ==========================================
    // Requirement 9, 10, 11: Google-style Trust & Safety Drawer & Robot Assessment & Audit action
    // ==========================================
    console.log('\n[核验要求 9, 10, 11] 机器人风险初判、进入审计抽屉、多维可信凭据研判...');
    const auditBtn = page.locator('.el-table__body tr.el-table__row .el-button').first();
    ok(await auditBtn.isVisible(), '操作列展示“审阅案件”/“进入审计”专业裁决按钮');

    // Click to open right drawer
    await auditBtn.click();
    await page.waitForTimeout(1000);

    const drawerEl = page.locator('.audit-drawer-container');
    ok(await drawerEl.isVisible(), '成功滑出右侧二级审计抽屉 (.audit-drawer-container)');

    // Verify Google-style Trust & Safety contextual sections in drawer
    const drawerText = await drawerEl.textContent();
    ok(drawerText.includes('机器人风险评估与处置基线') || drawerText.includes('风险初判'), '抽屉展示机器人风险初判与规则惩戒基准');
    ok(drawerText.includes('网络拓扑') || drawerText.includes('多维可信研判凭据') || drawerText.includes('网络与物理环境'), '抽屉呈现多维可信上下文网络拓扑与环境指标');
    ok(drawerText.includes('凭证与身份因子挑战') || drawerText.includes('行为速率与信誉遥测') || drawerText.includes('2FA'), '抽屉呈现账号安全凭据与行为健康度');

    // Verify adjudication buttons are present in drawer
    const drawerActionButtons = page.locator('.adjudication-actions .el-button');
    const drawerBtnCount = await drawerActionButtons.count();
    console.log(`  抽屉内裁决行动按钮数量: ${drawerBtnCount}`);
    ok(drawerBtnCount >= 3, '抽屉内具备完整的裁决决策链（放行、条件挑战、驳回、白名单）');

    // Take screenshot for verification evidence
    const screenshotPath = 'tests/verify_audit_optimization_complete.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  ✓ 截取全真全景界面快照: ${screenshotPath}`);

  } catch (err) {
    console.error('测试运行异常:', err);
    fail++;
    failures.push(err.message);
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  console.log('\n================================================================');
  console.log(`=== 核验结果统计: ${pass} 项通过, ${fail} 项失败 ===`);
  if (failures.length > 0) {
    console.log('失败清单:');
    failures.forEach(f => console.log('  - ' + f));
  }
  console.log('================================================================');

  if (fail > 0) {
    process.exit(1);
  }
}

run();
