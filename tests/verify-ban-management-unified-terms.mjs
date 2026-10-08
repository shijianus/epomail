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
    console.error('  ✗ ' + label);
  }
}

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
  console.log('=== 「邮箱封禁管控」用词统一 + 层级精炼 + 抽屉优化 全真栈 E2E 核验 ===');
  console.log('================================================================\n');

  const server = await startServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    const mockToken = 'mock_jwt_token_admin_test';
    await context.addInitScript(({ t }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('locale', 'zh');
      localStorage.setItem('roleCode', 'admin');
      localStorage.setItem('user', JSON.stringify({ email: 'admin@epomail.cyou', roleCode: 'admin' }));
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'admin@epomail.cyou' }]));
    }, { t: mockToken });

    const page = await context.newPage();

    // 统一后端 API 拦截模拟
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/api/audit/list')) {
        const json = {
          code: 200,
          data: {
            total: 2,
            counts: { banned: 2, today: 2, pending: 1, highRisk: 2 },
            list: [
              {
                id: 101,
                ticketId: 'BAN-000101',
                email: 'syndicate_cluster@farm.net',
                status: 'banned',
                riskLevel: 'high',
                priority: 'CRITICAL',
                banReason: '一人多号 (同一IP与设备指纹操纵多个账号，违反服务条款)',
                actionText: '{syndicate_cluster@farm.net} 关联账户违规一人多号被系统执行全量封禁',
                banTime: '2026-10-01 11:20:00',
                resolvedTime: '2026-10-01 11:20:00',
                operator: 'System Bot',
                operatorRole: '系统风控策略',
                ip: '198.51.100.99',
                baseIp: '198.51.100.1',
                geo: 'Hong Kong, HK',
                baseGeo: 'Hong Kong, HK',
                device: 'Chrome 128 / Windows 10',
                baseDevice: 'Chrome 128 / Windows 10',
                fingerprint: 'fp_syndicate_99',
                matchScore: 15,
                subnetMatch: 0,
                reportedByOthers: 2,
                warningType: 'ban'
              },
              {
                id: 102,
                ticketId: 'BAN-000102',
                email: 'compromised_bot@malicious.xyz',
                status: 'unbanned',
                riskLevel: 'high',
                priority: 'P0',
                banReason: '{compromised_bot@malicious.xyz} 触碰发信频率熔断阈值被系统自动封禁',
                actionText: '{compromised_bot@malicious.xyz} 触碰发信频率熔断阈值被系统自动封禁',
                banTime: '2026-10-04 17:35:00',
                resolvedTime: '2026-10-05 09:30:00',
                operator: 'SecAdmin',
                operatorRole: '安全审计员',
                ip: '203.0.113.88',
                baseIp: '203.0.113.88',
                geo: 'Tokyo, JP',
                baseGeo: 'Tokyo, JP',
                device: 'Firefox 130 / macOS 15',
                baseDevice: 'Firefox 130 / macOS 15',
                fingerprint: 'fp_compromised_bot',
                matchScore: 88,
                subnetMatch: 1,
                reportedByOthers: 0,
                warningType: 'ban'
              }
            ]
          }
        };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
      }

      if (url.includes('/api/my/loginUserInfo')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            data: {
              userId: 1,
              email: 'admin@epomail.cyou',
              name: '系统站长',
              permKeys: ['*'],
              role: { roleId: 1, roleCode: 'master', name: '站长' }
            }
          })
        });
      }

      if (url.includes('/api/email/sidebarStats')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 200, data: {} })
        });
      }

      if (url.includes('/api/account/list')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 200, data: [{ accountId: 1, email: 'admin@epomail.cyou' }] })
        });
      }

      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: {} }) });
    });

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    console.log('[步骤 1] 导航进入「邮箱封禁管控」后台页面...');
    await page.goto(`http://127.0.0.1:${PORT}/mail/u/0/#manage/admin/audit`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log('Current URL:', page.url());
    console.log('Page Title:', await page.title());
    const bodyHtml = await page.content();
    console.log('Body HTML length:', bodyHtml.length);

    // 1. KPI 卡片与下方精简文案核验
    console.log('\n[核验 1] 顶部 4 个 KPI 卡片说明文字精简核验:');
    const kpiCards = await page.$$('.kpi-card');
    ok(kpiCards.length === 4, `存在 4 个核心 KPI 卡片 (实际: ${kpiCards.length})`);

    const kpiDescs = await page.$$eval('.kpi-card .kpi-desc', els => els.map(e => e.textContent.trim()));
    console.log('  KPI 卡片说明文本集:', kpiDescs);
    ok(kpiDescs[0] === '策略生效中 · 阻断全部外发', `卡片 1 说明为「策略生效中 · 阻断全部外发」 (实际: ${kpiDescs[0]})`);
    ok(kpiDescs[1] === '近24小时新增处置', `卡片 2 说明为「近24小时新增处置」 (实际: ${kpiDescs[1]})`);
    ok(kpiDescs[2] === '申诉待复核', `卡片 3 说明为「申诉待复核」 (实际: ${kpiDescs[2]})`);
    ok(kpiDescs[3] === '撞库/黑名单探测', `卡片 4 说明为「撞库/黑名单探测」 (实际: ${kpiDescs[3]})`);

    // 2. 表格信息层级微调与用词核验
    console.log('\n[核验 2] 表格信息层级与标签用词核验:');
    const emailCell = await page.$eval('.el-table__row:nth-child(1) .clickable-email', el => el.textContent.trim());
    ok(emailCell === 'syndicate_cluster@farm.net', `邮箱为主列: ${emailCell}`);

    const ticketSub = await page.$eval('.el-table__row:nth-child(1) .ticket-sub', el => el.textContent.trim());
    ok(ticketSub.includes('BAN-000101'), `案件编号作为弱化次要信息展示在下方: ${ticketSub}`);

    // 状态标签带中点核验
    const statusTags = await page.$$eval('.el-table__row .status-tag-with-icon span', els => els.map(e => e.textContent.trim()));
    console.log('  状态标签文本集:', statusTags);
    ok(statusTags.includes('生效中 · 已封禁'), '第一行包含标准用词「生效中 · 已封禁」');
    ok(statusTags.includes('已解禁 · 移出黑名单'), '第二行包含标准用词「已解禁 · 移出黑名单」');

    // 高风险标签核验
    const riskTags = await page.$$eval('.el-table__row .audit-sub-tag', els => els.map(e => e.textContent.trim()));
    console.log('  风险等级标签集:', riskTags);
    ok(riskTags.includes('高风险 · 已管控'), '高风险标签统一为「高风险 · 已管控」');

    // 操作列按钮排布核验
    console.log('\n[核验 3] 行内快捷操作按钮排布与用词核验:');
    const firstRowButtons = await page.$$eval('.el-table__row:nth-child(1) .table-actions-group .el-button', els => els.map(e => e.textContent.trim()));
    console.log('  第 1 行操作按钮集 (生效中):', firstRowButtons);
    ok(firstRowButtons.some(t => t.includes('解封')), '生效中状态展示文字按钮「解封」');
    ok(firstRowButtons.some(t => t.includes('查看详情')), '包含文字按钮「查看详情」');

    const secondRowButtons = await page.$$eval('.el-table__row:nth-child(2) .table-actions-group .el-button', els => els.map(e => e.textContent.trim()));
    console.log('  第 2 行操作按钮集 (已解禁):', secondRowButtons);
    ok(secondRowButtons.some(t => t.includes('重新封禁')), '已解禁状态展示文字按钮「重新封禁」');

    // 3. 侧边抽屉与多维风险画像 Accordion 折叠核验
    console.log('\n[核验 4] 侧边详情抽屉与多维风险画像 Accordion 折叠核验:');
    const viewDetailBtn = await page.$('.el-table__row:nth-child(1) .table-actions-group .el-button:last-child');
    await viewDetailBtn.click();
    await page.waitForTimeout(1000);

    // 抽屉标题核验
    const drawerTitle = await page.$eval('.drawer-header-clean .drawer-title', el => el.textContent.trim());
    console.log('  抽屉标题:', drawerTitle);
    ok(drawerTitle.includes('封禁台账 · 存证（只读）'), `抽屉标题统一为「封禁台账 · 存证（只读）」 (实际: ${drawerTitle})`);

    // 风险研判与处置依据核验
    const sectionTitles = await page.$$eval('.dossier-card .section-title span', els => els.map(e => e.textContent.trim()));
    console.log('  抽屉内分区标题集:', sectionTitles);
    ok(sectionTitles.includes('风险研判与处置依据'), '包含标题「风险研判与处置依据」');
    ok(sectionTitles.includes('多维风险画像'), '包含标题「多维风险画像」');

    // 红色警示文案核验
    const redWarningText = await page.$eval('.robot-rule-box .rule-rule-text.text-danger', el => el.textContent.trim());
    console.log('  红色警示处置文案:', redWarningText);
    ok(redWarningText.includes('一人多号'), '保留显式红色警示处置文案');

    // Accordion 默认展开核验 (前两个展开，后两个折叠)
    console.log('  核验多维风险画像 Accordion 状态:');
    const collapseItems = await page.$$('.evidence-collapse .el-collapse-item');
    ok(collapseItems.length === 4, `多维风险画像分为 4 个 Accordion 面板 (实际: ${collapseItems.length})`);

    const item1Active = await page.$eval('.evidence-collapse .el-collapse-item:nth-child(1) .el-collapse-item__header', el => el.classList.contains('is-active'));
    const item2Active = await page.$eval('.evidence-collapse .el-collapse-item:nth-child(2) .el-collapse-item__header', el => el.classList.contains('is-active'));
    const item3Active = await page.$eval('.evidence-collapse .el-collapse-item:nth-child(3) .el-collapse-item__header', el => el.classList.contains('is-active'));
    const item4Active = await page.$eval('.evidence-collapse .el-collapse-item:nth-child(4) .el-collapse-item__header', el => el.classList.contains('is-active'));

    ok(item1Active === true, 'Accordion 第 1 项 (凭证与身份挑战因子) 默认展开');
    ok(item2Active === true, 'Accordion 第 2 项 (设备指纹与会话连续性) 默认展开');
    ok(item3Active === false, 'Accordion 第 3 项 (行为速率与检举遥测) 默认折叠');
    ok(item4Active === false, 'Accordion 第 4 项 (网络与拓扑置信度) 默认折叠');

    // 抽屉底部主操作按钮核验
    const drawerActionBtnText = await page.$eval('.drawer-footer-actions .el-button:last-child span', el => el.textContent.trim());
    console.log('  抽屉底部主操作按钮文案:', drawerActionBtnText);
    ok(drawerActionBtnText === '解封', `第一行当前为生效中，抽屉底部按钮为「解封」，与行内完全一致 (实际: ${drawerActionBtnText})`);

    // 截图抽屉展开状态
    await page.screenshot({ path: 'tests/audit_unified_drawer_verified.png' });
    console.log('  ✓ 抽屉展开核验截图已保存至 tests/audit_unified_drawer_verified.png');

    // 关闭抽屉
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    // 4. 空状态文案核验 (筛选为无结果时)
    console.log('\n[核验 5] 筛选结果为 0 时空状态文案核验:');
    await page.route('**/api/audit/list*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, data: { total: 0, list: [], counts: {} } })
      });
    });

    // 触发刷新请求空列表
    const refreshBtn = await page.$('.actions-left-buttons .el-tooltip__trigger:nth-child(2)');
    await refreshBtn.click();
    await page.waitForTimeout(1000);

    const emptyText = await page.$eval('.el-table__empty-text', el => el.textContent.trim());
    console.log('  空状态提示文案:', emptyText);
    ok(emptyText === '当前筛选条件下暂无封禁记录', `空状态文案精确为「当前筛选条件下暂无封禁记录」 (实际: ${emptyText})`);

    // 截图空状态主视图
    await page.screenshot({ path: 'tests/audit_unified_main_empty_verified.png' });
    console.log('  ✓ 空状态主视图核验截图已保存至 tests/audit_unified_main_empty_verified.png');

    console.log('\n================================================================');
    console.log(`=== 自动化核验统计: 通过 ${pass} 项 | 失败 ${fail} 项 ===`);
    if (failures.length > 0) {
      console.error('=== 未通过清单:', failures);
    }
    console.log('================================================================\n');

    return { pass, fail, failures };
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

run().then(res => {
  if (res.fail > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}).catch(err => {
  console.error('测试异常崩溃:', err);
  process.exit(1);
});
