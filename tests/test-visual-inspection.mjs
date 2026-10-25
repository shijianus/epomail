import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import assert from 'assert';

const DIST_DIR = path.resolve('mail-worker/dist');
const PORT = 8898;

let passCount = 0;
let failCount = 0;
const results = [];

function check(cond, description) {
  if (cond) {
    passCount++;
    console.log(`  ✓ [PASS] ${description}`);
    results.push({ ok: true, desc: description });
  } else {
    failCount++;
    console.error(`  ✗ [FAIL] ${description}`);
    results.push({ ok: false, desc: description });
  }
}

function startStaticServer() {
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
      console.log(`[Static Server] Listening on http://127.0.0.1:${PORT}`);
      resolve(server);
    });
  });
}

const mockSettingsEnabled = {
  allMailMode: 2, // 2 = 加密邮箱模式
  auditLogEnabled: 1,
  auditMaxIpPerAccount: 3,
  auditMaxDevicePerAccount: 3,
  auditAutoCleanOldest: 1,
  auditPrioritizeNonCriticalClean: 1,
  auditCriticalQuota: 3,
  version: '1.2.0',
  title: 'Epocanvas Mail'
};

const mockSettingsDisabled = {
  ...mockSettingsEnabled,
  auditLogEnabled: 0
};

const mockAuditRecords = [
  {
    id: 201,
    ticketId: 'REC-20261024-001',
    email: 'us***@e***.com',
    warningType: 'record',
    eventType: 'security_audit',
    category: 'ban',
    actionText: '系统安全访问阻断',
    detailText: '检测到异常访问频率，触发安全防护策略',
    ip: '198.51.***.***',
    geo: 'US-Virginia',
    device: 'Chrome 130.0',
    deviceType: 'desktop',
    fingerprint: 'fp_public_01',
    baseIp: '198.51.***.***',
    baseGeo: 'US-Virginia',
    baseDevice: 'Chrome 130.0',
    baseFingerprint: 'fp_public_01',
    isRegIp: 0,
    isMultiIp: 0,
    activeIpCount: 1,
    reportedByOthers: 0,
    riskLevel: 'high',
    priority: 'P1',
    status: 'resolved',
    matchScore: 80,
    subnetMatch: 0,
    appealReason: '',
    resolvedTime: '2026-10-24 18:00:00',
    createTime: '2026-10-24 16:30:00'
  },
  {
    id: 202,
    ticketId: 'REC-20261024-002',
    email: 'te***@e***.com',
    warningType: 'record',
    eventType: 'system_log',
    category: 'audit',
    actionText: '常规合规审计归档',
    detailText: '每日例行风控日志自动化记录与哈希存证',
    ip: '203.0.***.***',
    geo: 'SG-Singapore',
    device: 'Safari 18.0',
    deviceType: 'mobile',
    fingerprint: 'fp_public_02',
    baseIp: '203.0.***.***',
    baseGeo: 'SG-Singapore',
    baseDevice: 'Safari 18.0',
    baseFingerprint: 'fp_public_02',
    isRegIp: 1,
    isMultiIp: 0,
    activeIpCount: 1,
    reportedByOthers: 0,
    riskLevel: 'low',
    priority: 'P3',
    status: 'resolved',
    matchScore: 95,
    subnetMatch: 1,
    appealReason: '',
    resolvedTime: '2026-10-24 17:00:00',
    createTime: '2026-10-24 15:00:00'
  }
];

async function main() {
  console.log('====================================================================');
  console.log('=== 全真栈端到端视觉检视与 UI 规范深度核验套件 ===');
  console.log('====================================================================\n');

  const server = await startStaticServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    // -------------------------------------------------------------
    // SCENE 1: 系统设置卡片核验 (无多余跳转、无多余按钮、默认值与总开关)
    // -------------------------------------------------------------
    console.log('\n--- [场景 1] 系统设置 ->「操作报告」风控卡片检视 ---');
    const adminContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    await adminContext.addInitScript(() => {
      localStorage.setItem('token', 'mock-admin-token');
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: 'mock-admin-token', email: 'admin@epomail.cyou' }]));
    });

    const adminPage = await adminContext.newPage();

    adminPage.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error' || text.includes('Error')) {
        console.log('  [BROWSER LOG]', msg.type(), text);
      }
    });
    adminPage.on('pageerror', err => console.log('  [BROWSER ERROR]', err.message));

    // Setup routes for admin
    await adminPage.route('**/api/my/loginUserInfo', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            userId: 1,
            email: 'admin@epomail.cyou',
            name: '系统站长',
            permKeys: ['*'],
            role: { roleId: 1, roleCode: 'master', name: '站长' }
          }
        }
      });
    });

    await adminPage.route('**/api/setting/query*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { code: 200, data: mockSettingsEnabled }
      });
    });

    await adminPage.route('**/api/role/roleList*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { code: 200, data: [{ roleId: 1, roleCode: 'master', name: '站长' }] }
      });
    });

    await adminPage.route('**/api/email/sidebarStats', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { code: 200, data: {} } });
    });
    await adminPage.route('**/api/account/list', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { code: 200, data: [{ accountId: 1, email: 'admin@epomail.cyou' }] } });
    });
    await adminPage.route('**/api/user/list*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { code: 200, data: [] } });
    });

    await adminPage.goto(`http://127.0.0.1:${PORT}/mail/u/0/#manage/admin/system`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await adminPage.waitForSelector('.settings-layout', { timeout: 20000 });
    await adminPage.waitForTimeout(1500);

    // Locate audit card
    const auditCard = adminPage.locator('.audit-policy-card').first();
    await auditCard.scrollIntoViewIfNeeded();
    await auditCard.waitFor({ state: 'visible', timeout: 10000 });
    check(await auditCard.isVisible(), '「操作报告」策略卡片成功渲染于系统设置');

    // Check master switch
    const masterSwitch = auditCard.locator('.el-switch').first();
    check(await masterSwitch.isVisible(), '操作报告与日志总开关 (auditLogEnabled) 渲染就绪');
    const isChecked = await masterSwitch.evaluate(el => el.classList.contains('is-checked'));
    check(isChecked, '总开关默认激活状态为 1 (开启)');

    // Check 5 IP risk fields and their values
    const inputNumbers = auditCard.locator('.el-input-number');
    const inputNumberCount = await inputNumbers.count();
    check(inputNumberCount === 3, `包含 3 组数字调节输入框 (实际数量: ${inputNumberCount})`);

    const maxIpVal = await inputNumbers.nth(0).locator('input').inputValue();
    check(Number(maxIpVal) === 3, `最大活跃 IP 限制默认值正确为 3 (实际值: ${maxIpVal})`);

    const maxDeviceVal = await inputNumbers.nth(1).locator('input').inputValue();
    check(Number(maxDeviceVal) === 3, `最大绑定设备限制默认值正确为 3 (实际值: ${maxDeviceVal})`);

    const criticalQuotaVal = await inputNumbers.nth(2).locator('input').inputValue();
    check(Number(criticalQuotaVal) === 3, `单 IP 严重违规配额默认值正确为 3 (实际值: ${criticalQuotaVal})`);

    // Check redundant buttons removal
    const buttonsInCard = auditCard.locator('button:not(.el-input-number__decrease):not(.el-input-number__increase)');
    const buttonCount = await buttonsInCard.count();
    check(buttonCount === 0, `已彻底删除多余的跳转按钮与外部链接操作 (卡片独立按钮数: ${buttonCount})`);

    // Screenshot sys-setting card
    await auditCard.screenshot({ path: 'tests/inspect_sys_setting_audit_card.png' });
    console.log('  📸 截屏留存: tests/inspect_sys_setting_audit_card.png');

    // -------------------------------------------------------------
    // SCENE 2: 状态栏纯色提示检视 (开启公示操作记录 - 绿色)
    // -------------------------------------------------------------
    console.log('\n--- [场景 2] 状态栏公示提示检视 (开启状态 - 推荐绿色) ---');
    const statusBar = adminPage.locator('.status-bar');
    await statusBar.waitFor({ state: 'visible' });

    const modeTag = statusBar.locator('.mode-tag');
    check(await modeTag.isVisible(), '邮箱模式标签正常渲染');
    const modeTagMargin = await modeTag.evaluate(el => window.getComputedStyle(el).marginRight);
    check(modeTagMargin === '4px', `模式标签向左偏移规范 (margin-right: ${modeTagMargin})`);

    const auditBadgePublic = statusBar.locator('.audit-status-tag.audit-tag-public');
    check(await auditBadgePublic.isVisible(), '状态栏右侧成功渲染公示徽标 (.audit-tag-public)');
    const publicText = (await auditBadgePublic.textContent()).trim();
    check(publicText.includes('公示操作记录') || publicText.includes('Audit Public'), `公示徽标文本正确: "${publicText}"`);

    const publicColor = await auditBadgePublic.evaluate(el => window.getComputedStyle(el).color);
    const publicBg = await auditBadgePublic.evaluate(el => window.getComputedStyle(el).backgroundColor);
    check(publicColor.includes('82, 196, 26') || publicColor.includes('#52c41a'), `公示推荐字体颜色为绿色 (实际 rgb: ${publicColor})`);
    check(publicBg === 'rgba(0, 0, 0, 0)' || publicBg === 'transparent', `公示徽标为纯色无填充无边框底色 (实际 bg: ${publicBg})`);

    await statusBar.screenshot({ path: 'tests/inspect_status_bar_public_green.png' });
    console.log('  📸 截屏留存: tests/inspect_status_bar_public_green.png');

    // -------------------------------------------------------------
    // SCENE 3: 状态栏纯色提示检视 (关闭状态 - 红色「无操作报告」)
    // -------------------------------------------------------------
    console.log('\n--- [场景 3] 状态栏无操作报告提示检视 (关闭状态 - 红色) ---');
    const disabledContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    await disabledContext.addInitScript(() => {
      localStorage.setItem('token', 'mock-admin-token');
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: 'mock-admin-token', email: 'admin@epomail.cyou' }]));
    });

    const disabledPage = await disabledContext.newPage();
    await disabledPage.route('**/api/my/loginUserInfo', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            userId: 1,
            email: 'admin@epomail.cyou',
            name: '系统站长',
            permKeys: ['*'],
            role: { roleId: 1, roleCode: 'master', name: '站长' }
          }
        }
      });
    });

    await disabledPage.route('**/api/setting/query*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { code: 200, data: mockSettingsDisabled }
      });
    });

    await disabledPage.route('**/api/email/sidebarStats', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { code: 200, data: {} } });
    });
    await disabledPage.route('**/api/account/list', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { code: 200, data: [{ accountId: 1, email: 'admin@epomail.cyou' }] } });
    });
    await disabledPage.route('**/api/role/roleList*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { code: 200, data: [{ roleId: 1, roleCode: 'master', name: '站长' }] }
      });
    });

    await disabledPage.goto(`http://127.0.0.1:${PORT}/mail/u/0/#manage/admin/system`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await disabledPage.waitForSelector('.status-bar', { timeout: 20000 });
    await disabledPage.waitForTimeout(1000);

    const statusBarDisabled = disabledPage.locator('.status-bar');
    const auditBadgeNone = statusBarDisabled.locator('.audit-status-tag.audit-tag-none');
    check(await auditBadgeNone.isVisible(), '状态栏成功切换为无报告徽标 (.audit-tag-none)');
    const noneText = (await auditBadgeNone.textContent()).trim();
    check(noneText.includes('无操作报告') || noneText.includes('No Audit'), `关闭状态徽标文本正确: "${noneText}"`);

    const noneColor = await auditBadgeNone.evaluate(el => window.getComputedStyle(el).color);
    check(noneColor.includes('255, 77, 79') || noneColor.includes('#ff4d4f'), `无报告提示字体颜色为红色 (实际 rgb: ${noneColor})`);

    await statusBarDisabled.screenshot({ path: 'tests/inspect_status_bar_none_red.png' });
    console.log('  📸 截屏留存: tests/inspect_status_bar_none_red.png');

    // -------------------------------------------------------------
    // SCENE 4: 参观者视角检视 (隐藏选框、只展示结果表格、最小化隐私泄露)
    // -------------------------------------------------------------
    console.log('\n--- [场景 4] 参观者控制台检视 (纯表格结果、隐藏管理选框) ---');
    const visitorContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    await visitorContext.addInitScript(() => {
      localStorage.setItem('token', 'mock-visitor-token');
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: 'mock-visitor-token', email: 'visitor@epocanvas.com' }]));
    });

    const visitorPage = await visitorContext.newPage();

    await visitorPage.route('**/api/my/loginUserInfo', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            userId: 99,
            email: 'visitor@epocanvas.com',
            name: '访客参观者',
            permKeys: ['setting:query'],
            role: { roleId: 6, roleCode: 'visitor', name: '参观者' }
          }
        }
      });
    });

    await visitorPage.route('**/api/setting/query*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { code: 200, data: mockSettingsEnabled }
      });
    });

    await visitorPage.route('**/api/email/sidebarStats', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { code: 200, data: {} } });
    });
    await visitorPage.route('**/api/account/list', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { code: 200, data: [{ accountId: 99, email: 'visitor@epocanvas.com' }] } });
    });

    await visitorPage.route('**/api/audit/list*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            list: mockAuditRecords,
            total: mockAuditRecords.length,
            counts: {
              audit: 0,
              auditTotal: 0,
              risk: 0,
              riskTotal: 0,
              ban: 0,
              banTotal: 0,
              appeal: 0,
              appealTotal: 0,
              total: 2,
              allTotal: 2,
              categories: {
                total: { pending: 0, total: 2 }
              }
            }
          }
        }
      });
    });

    await visitorPage.goto(`http://127.0.0.1:${PORT}/mail/u/0/#manage/visitor/audit`, { waitUntil: 'networkidle', timeout: 30000 });
    await visitorPage.waitForTimeout(1500);

    // 1. Check KPI cards hidden
    const visitorKpiCards = visitorPage.locator('.kpi-grid');
    const kpiVisible = await visitorKpiCards.isVisible();
    check(!kpiVisible, '参观者视角：上方 KPI 汇报选框已彻底隐藏 (严格纯表格视图)');

    // 2. Check admin header actions hidden
    const headerActions = visitorPage.locator('.header-actions');
    const headerActionsVisible = await headerActions.isVisible();
    check(!headerActionsVisible, '参观者视角：管理员操作按钮组 (批量处置/导出) 已隐藏');

    // 3. Check public notice header visible
    const publicNotice = visitorPage.locator('.visitor-public-header');
    check(await publicNotice.isVisible(), '参观者视角：公开操作记录提示栏已成功呈现');

    // 4. Check selection checkboxes hidden
    const checkboxes = visitorPage.locator('.table-area .el-checkbox');
    const checkboxCount = await checkboxes.count();
    check(checkboxCount === 0, `参观者视角：数据表格彻底隐藏复选框 (复选框数量: ${checkboxCount})`);

    // 5. Check data rows rendered
    const rows = visitorPage.locator('.table-area tbody tr');
    const rowCount = await rows.count();
    check(rowCount === 2, `操作记录数据表渲染了 2 条公开审计记录 (实际: ${rowCount})`);

    // Screenshot visitor audit report page
    await visitorPage.screenshot({ path: 'tests/inspect_visitor_audit_report_table_only.png', fullPage: true });
    console.log('  📸 截屏留存: tests/inspect_visitor_audit_report_table_only.png');

    // -------------------------------------------------------------
    // SCENE 5: 参观者详情抽屉检视 (最小化隐私泄露、无排查证据/集群/裁决)
    // -------------------------------------------------------------
    console.log('\n--- [场景 5] 参观者详情抽屉检视 (隐私保护、无敏感管理栏目) ---');
    await rows.first().click();
    await visitorPage.waitForTimeout(800);

    const drawer = visitorPage.locator('.audit-detail-drawer');
    await drawer.waitFor({ state: 'visible', timeout: 10000 });
    check(await drawer.isVisible(), '审计详情抽屉成功展开');

    // Check tabs: investigation and evidence must NOT exist
    const investigationTab = drawer.locator('#tab-investigation');
    const evidenceTab = drawer.locator('#tab-evidence');
    check(await investigationTab.count() === 0, '参观者视角：抽屉已剔除「排查研判」深层追踪标签');
    check(await evidenceTab.count() === 0, '参观者视角：抽屉已剔除「证据链」追踪标签');

    // Check copy buttons on email / id
    const copyEmailBtn = drawer.locator('.email-val .copy-icon-btn');
    check(await copyEmailBtn.count() === 0, '参观者视角：已隐藏原始邮箱复制按钮');

    // Check cluster accounts hidden
    const clusterChapter = drawer.locator('.chapter-cluster');
    check(await clusterChapter.count() === 0, '参观者视角：已隐藏拓扑同源集群账号名单');

    // Check decision interactive form hidden
    const decisionChapter = drawer.locator('.chapter-decision');
    check(await decisionChapter.count() === 0, '参观者视角：已隐藏处置裁决工作台与处罚选项');

    // Check drawer footer admin action buttons hidden
    const drawerFooterBtns = drawer.locator('.drawer-footer .el-button');
    const footerBtnCount = await drawerFooterBtns.count();
    check(footerBtnCount === 0, `参观者视角：已完全隐藏管理员裁决操作按钮 (底部按钮数: ${footerBtnCount})`);

    await drawer.screenshot({ path: 'tests/inspect_visitor_audit_detail_drawer.png' });
    console.log('  📸 截屏留存: tests/inspect_visitor_audit_detail_drawer.png');

    // -------------------------------------------------------------
    // SCENE 6: 管理员全功能控制台回归检视 (保留完整管理能力)
    // -------------------------------------------------------------
    console.log('\n--- [场景 6] 管理员全功能控制台回归检视 (管理能力完备) ---');
    await adminPage.route('**/api/audit/list*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            list: mockAuditRecords,
            total: mockAuditRecords.length,
            counts: {
              audit: 1,
              auditTotal: 2,
              risk: 1,
              riskTotal: 2,
              ban: 1,
              banTotal: 2,
              appeal: 0,
              appealTotal: 0,
              total: 2,
              allTotal: 2,
              categories: {
                audit: { pending: 1, total: 2 },
                risk: { pending: 1, total: 2 },
                ban: { pending: 1, total: 2 },
                appeal: { pending: 0, total: 0 },
                total: { pending: 3, total: 6 }
              }
            }
          }
        }
      });
    });

    await adminPage.goto(`http://127.0.0.1:${PORT}/mail/u/0/#manage/admin/audit`, { waitUntil: 'networkidle', timeout: 30000 });
    await adminPage.waitForTimeout(1500);

    const adminKpiCards = adminPage.locator('.kpi-card');
    const adminKpiCount = await adminKpiCards.count();
    check(adminKpiCount === 4, `管理员视角：4 组管理选框 (初筛/研判/封禁/申诉) 正常呈现 (数量: ${adminKpiCount})`);

    const adminHeaderActions = adminPage.locator('.header-actions');
    check(await adminHeaderActions.isVisible(), '管理员视角：处置操作按钮组正常可用');

    await adminPage.screenshot({ path: 'tests/inspect_admin_audit_report_full.png', fullPage: true });
    console.log('  📸 截屏留存: tests/inspect_admin_audit_report_full.png');

  } finally {
    if (browser) await browser.close();
    server.close();
  }

  console.log('\n====================================================================');
  console.log(`=== 视觉核验结果汇总: ${passCount} 项通过, ${failCount} 项失败 ===`);
  console.log('====================================================================');

  if (failCount > 0) {
    console.error('存在不满足要求的视觉或逻辑项！');
    process.exit(1);
  } else {
    console.log('🎉 视觉核验全部高标准 100% 通过！\n');
  }
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
