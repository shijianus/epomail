import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const DIST_DIR = path.resolve('mail-worker/dist');
const PORT = 8898;

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
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
      resolve(server);
    });
  });
}

async function run() {
  console.log('================================================================');
  console.log('=== 「邮箱封禁管控」表格列宽、零截断、操作列与对比证据专项实测 ===');
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

    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/api/audit/list')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 200,
            data: {
              total: 2,
              counts: { banned: 2, today: 2, pending: 1, highRisk: 2 },
              list: [
                {
                  id: 101,
                  ticketId: 'BAN-000101',
                  email: 'syndicate_cluster_long_address@farm.net',
                  status: 'banned',
                  riskLevel: 'high',
                  priority: 'CRITICAL',
                  banReason: '一人多号 (同一IP与设备指纹操纵多个账号，违反服务条款)',
                  actionText: '全网策略封禁',
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
                  isMultiIp: 1,
                  activeIpCount: 8,
                  warningType: 'ban'
                },
                {
                  id: 102,
                  ticketId: 'BAN-000102',
                  email: 'regular_user_test@epomail.cyou',
                  status: 'unbanned',
                  riskLevel: 'high',
                  priority: 'P0',
                  banReason: '触碰发信频率熔断阈值被系统自动封禁',
                  actionText: '频率熔断已复核解封',
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
                  fingerprint: 'fp_bot_88',
                  matchScore: 88,
                  subnetMatch: 1,
                  reportedByOthers: 0,
                  isMultiIp: 0,
                  activeIpCount: 1,
                  warningType: 'ban'
                }
              ]
            }
          })
        });
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

      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, data: {} }) });
    });

    await page.goto(`http://127.0.0.1:${PORT}/mail/u/0/#manage/admin/audit`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 1. 高风险标签截断检测
    console.log('\n[检测 1] 高风险标签截断与文本完整性检测:');
    const riskTagInfo = await page.$eval('.el-table__row:nth-child(1) .audit-sub-tag', el => {
      return {
        text: el.textContent.trim(),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        offsetWidth: el.offsetWidth
      };
    });
    console.log('  高风险标签度量:', riskTagInfo);
    ok(riskTagInfo.text === '高风险 · 已管控', `高风险标签文本完整为「高风险 · 已管控」 (实际: ${riskTagInfo.text})`);
    ok(!riskTagInfo.text.includes('?'), '无问号字符');
    ok(!riskTagInfo.text.endsWith('·'), '无结尾截断中点');
    ok(riskTagInfo.scrollWidth <= riskTagInfo.clientWidth + 1, `标签内部零内容溢出 (scrollWidth: ${riskTagInfo.scrollWidth}, clientWidth: ${riskTagInfo.clientWidth})`);

    // 2. 「查看详情」按钮截断检测
    console.log('\n[检测 2] 「查看详情」按钮文本完整性与零截断检测:');
    const detailBtnInfo = await page.$eval('.el-table__row:nth-child(1) .action-detail-btn', el => {
      return {
        text: el.textContent.trim(),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        offsetWidth: el.offsetWidth
      };
    });
    console.log('  查看详情按钮度量:', detailBtnInfo);
    ok(detailBtnInfo.text === '查看详情', `按钮文本完整为「查看详情」 (实际: ${detailBtnInfo.text})`);
    ok(detailBtnInfo.scrollWidth <= detailBtnInfo.clientWidth + 1, `按钮零文字截断 (scrollWidth: ${detailBtnInfo.scrollWidth}, clientWidth: ${detailBtnInfo.clientWidth})`);

    // 3. 操作列排布与按钮间距检测
    console.log('\n[检测 3] 操作列按钮间距与右对齐检测:');
    const actionCellBox = await page.$eval('.el-table__row:nth-child(1) td.is-right', el => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    console.log('  操作列单元格尺寸:', actionCellBox);
    ok(actionCellBox.width >= 200, `操作列宽满足设定 (实际: ${actionCellBox.width}px >= 200px)`);

    const actionButtons = await page.$$eval('.el-table__row:nth-child(1) .table-actions-group .el-button', els => {
      return els.map(e => {
        const r = e.getBoundingClientRect();
        return { text: e.textContent.trim(), width: r.width, height: r.height };
      });
    });
    console.log('  操作按钮详细尺寸:', actionButtons);
    ok(actionButtons.length === 4, `操作列包含全部 4 个按钮 (实际: ${actionButtons.length})`);
    ok(actionButtons[0].text === '解封', '解封按钮完整显示');
    ok(actionButtons[3].text === '查看详情', '查看详情按钮完整显示');

    // 截图表格主视图
    await page.screenshot({ path: 'tests/verify_table_columns_fixed.png' });
    console.log('  ✓ 表格主视图已截图保存至 tests/verify_table_columns_fixed.png');

    // 4. 侧边抽屉两列对比卡片实测
    console.log('\n[检测 4] 侧边抽屉两列对比证据卡片结构与警示实测:');
    await page.click('.el-table__row:nth-child(1) .action-detail-btn');
    await page.waitForTimeout(1000);

    const actualCardTitle = await page.$eval('.compare-card-actual .card-header-title', el => el.textContent.trim());
    console.log('  左侧卡片标题:', actualCardTitle);
    ok(actualCardTitle === '当前账号实际证据值', `左侧卡片标题精确为「当前账号实际证据值」 (实际: ${actualCardTitle})`);

    const baselineCardTitle = await page.$eval('.compare-card-baseline .card-header-title', el => el.textContent.trim());
    console.log('  右侧卡片标题:', baselineCardTitle);
    ok(baselineCardTitle === '系统基准 / 正常值 / 风险阈值', `右侧卡片标题精确为「系统基准 / 正常值 / 风险阈值」 (实际: ${baselineCardTitle})`);

    // 检查同一IP关联账号数在左侧是否显示为 8 并被标红
    const ipAccountsValue = await page.$eval('.compare-card-actual', el => {
      const items = Array.from(el.querySelectorAll('.compare-item-row'));
      for (const item of items) {
        if (item.textContent.includes('同一IP关联账号数')) {
          const valEl = item.querySelector('.compare-v');
          return {
            text: valEl.textContent.trim(),
            isDanger: valEl.classList.contains('text-danger')
          };
        }
      }
      return null;
    });
    console.log('  同一IP关联账号数度量:', ipAccountsValue);
    ok(ipAccountsValue && ipAccountsValue.text.includes('8'), `同一IP关联账号数显示为 8 (实际: ${ipAccountsValue?.text})`);
    ok(ipAccountsValue && ipAccountsValue.isDanger, '同一IP关联账号数 8 具有红色警示高亮');

    // 检查右侧同一IP关联账号数基准值
    const ipAccountsBaseline = await page.$eval('.compare-card-baseline', el => {
      const items = Array.from(el.querySelectorAll('.compare-item-row'));
      for (const item of items) {
        if (item.textContent.includes('同一IP关联账号数')) {
          return item.querySelector('.compare-v').textContent.trim();
        }
      }
      return null;
    });
    console.log('  右侧同一IP基准阈值:', ipAccountsBaseline);
    ok(ipAccountsBaseline && ipAccountsBaseline.includes('≤ 1'), `基准阈值显示为 ≤ 1 (实际: ${ipAccountsBaseline})`);

    // 截图对比抽屉
    await page.screenshot({ path: 'tests/verify_evidence_comparison_card_fixed.png' });
    console.log('  ✓ 证据两列对比卡片已截图保存至 tests/verify_evidence_comparison_card_fixed.png');

    console.log('\n================================================================');
    console.log(`=== 专项核验统计: 通过 ${pass} 项 | 失败 ${fail} 项 ===`);
    console.log('================================================================\n');

    return { pass, fail };
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

run().then(res => {
  if (res.fail > 0) process.exit(1);
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
