import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const DIST_DIR = path.resolve('mail-worker/dist');
const SCREENSHOT_DIR = path.resolve('doc/validation/abuse-table');
const PORT = 8899;

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

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

const mockList = [
  // 1. 普通邮箱
  {
    id: 101,
    ticketId: '#10001',
    email: 'normal_user@example.com',
    status: 'pending',
    riskLevel: 'high',
    priority: 'CRITICAL',
    reportCategory: 'spam',
    evidenceSummary: '发信超频',
    reasonCode: 'OUTBOUND_RATE_LIMIT',
    assignee: null,
    userId: '1001',
    createTime: '2026-10-10 10:00:00',
    warningType: 'risk'
  },
  // 2. 本地部分 64 字符的邮箱
  {
    id: 102,
    ticketId: '#10002',
    email: 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01@epomail.cyou',
    status: 'banned',
    riskLevel: 'high',
    priority: 'CRITICAL',
    reportCategory: 'protocol',
    evidenceSummary: '蜜罐命中',
    reasonCode: 'HONEYPOT_TRIGGERED',
    assignee: 'SecAdmin',
    userId: '1002',
    banTime: '2026-10-10 11:20:00',
    createTime: '2026-10-10 11:15:00',
    warningType: 'risk'
  },
  // 3. 总长约 150 字符的邮箱
  {
    id: 103,
    ticketId: '#10003',
    email: 'long_local_part_segment_alpha_bravo_charlie_delta_echo_foxtrot_golf_hotel_india_juliet_kilo_lima_mike_november@subdomain.domain-name-with-extended-length.org',
    status: 'unbanned',
    riskLevel: 'high',
    priority: 'CRITICAL',
    reportCategory: 'account_takeover',
    evidenceSummary: '改密后环境突变',
    reasonCode: 'AUTH_ACCOUNT_TAKEOVER',
    assignee: 'Master',
    userId: '1003',
    resolvedTime: '2026-10-10 12:00:00',
    createTime: '2026-10-10 09:30:00',
    warningType: 'risk'
  },
  // 4. 总长约 250 字符的邮箱
  {
    id: 104,
    ticketId: '#10004',
    email: 'ultra_long_local_prefix_very_extended_stream_character_payload_dataset_alpha_bravo_charlie_delta_echo_foxtrot_golf_hotel_india_juliet_kilo_lima_mike_november_oscar_papa_quebec_romeo_sierra_tango_uniform_victor_whiskey_xray_yankee_zulu_1234567890@ultra-long-domain-name.corp.internal.net',
    status: 'pending',
    circuitStatus: 'QUEUE_PAUSE',
    riskLevel: 'high',
    priority: 'CRITICAL',
    reportCategory: 'quota',
    evidenceSummary: '共享凭证 3 号',
    reasonCode: 'QUOTA_EVASION',
    assignee: null,
    userId: '1004',
    createTime: '2026-10-10 14:00:00',
    warningType: 'risk'
  },
  // 5. 含中文本地部分或 IDN 域名的邮箱
  {
    id: 105,
    ticketId: '#10005',
    email: '张伟.安全员@测试.中国',
    status: 'banned',
    riskLevel: 'high',
    priority: 'CRITICAL',
    reportCategory: 'outbound',
    evidenceSummary: '投诉率 0.4% 1h',
    reasonCode: 'OUTBOUND_COMPLAINT_ELEVATED',
    assignee: 'System Bot',
    userId: '1005',
    banTime: '2026-10-10 15:30:00',
    createTime: '2026-10-10 15:00:00',
    warningType: 'risk'
  },
  // 6. 3 个账号的集群工单
  {
    id: 106,
    ticketId: '#10006',
    clusterId: 'cls_syndicate_01',
    clusterCount: 3,
    email: 'cluster_head@botfarm.net',
    status: 'pending',
    riskLevel: 'high',
    priority: 'CRITICAL',
    reportCategory: 'multi_account',
    evidenceSummary: 'Jaccard 0.84 节律 0.92',
    reasonCode: 'SYBIL_MULTI_ACCOUNT',
    assignee: 'SecAdmin',
    userId: '1006',
    createTime: '2026-10-10 16:00:00',
    warningType: 'risk',
    clusterAccounts: [
      { id: 1061, email: 'cluster_head@botfarm.net', status: 'pending', userId: '1006' },
      { id: 1062, email: 'cluster_member_2@botfarm.net', status: 'pending', userId: '1062' },
      { id: 1063, email: 'cluster_member_3@botfarm.net', status: 'pending', userId: '1063' }
    ]
  },
  // 7. 已清除账号
  {
    id: 107,
    ticketId: '#10007',
    isCleared: true,
    email: '',
    status: 'cleared',
    riskLevel: 'high',
    priority: 'CRITICAL',
    reportCategory: 'protocol',
    evidenceSummary: '签名撕裂',
    reasonCode: 'PROTOCOL_VIOLATION',
    assignee: 'SecAdmin',
    userId: '1007',
    createTime: '2026-10-10 17:00:00',
    warningType: 'risk'
  }
];

async function run() {
  console.log('================================================================');
  console.log('=== 「滥用威胁」工单列表列集、宽度、换行、断言与全真截图自动化核验 ===');
  console.log('================================================================\n');

  const server = await startServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    const viewports = [
      { width: 1440, height: 900, name: '1440' },
      { width: 1024, height: 768, name: '1024' },
      { width: 860, height: 800, name: '860' },
      { width: 768, height: 1024, name: '768' },
      { width: 375, height: 812, name: '375' }
    ];

    for (const vp of viewports) {
      console.log(`\n--- [宽度验证: ${vp.name}px] ---`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
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
                total: mockList.length,
                counts: {
                  threat: 7,
                  threatPending: 4,
                  threatBanned: 2,
                  highRisk: 7,
                  pending: 4,
                  banned: 2,
                  today: 7,
                  audit: 0,
                  appeal: 0,
                  record: 0
                },
                circuitBreaker: {
                  status: 'TRIPPED',
                  tripped: true,
                  message: '熔断中:新违规仅暂扣,不封禁账号'
                },
                autoPurgedCount: 3,
                autoPurgedBatches: [
                  { id: 'BAT-20261010-01', time: '2026-10-10 02:00:00', count: 48, reason: 'AUTO_PURGE_AND_TOMBSTONE' },
                  { id: 'BAT-20261009-02', time: '2026-10-09 18:30:00', count: 120, reason: 'AUTO_PURGE_AND_TOMBSTONE' },
                  { id: 'BAT-20261009-01', time: '2026-10-09 04:15:00', count: 35, reason: 'AUTO_PURGE_AND_TOMBSTONE' }
                ],
                list: mockList
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
      await page.waitForTimeout(2000);

      // 确保处于滥用威胁板块
      const threatKpi = await page.$('.kpi-threat');
      if (threatKpi) {
        await threatKpi.click();
        await page.waitForTimeout(1000);
      }

      // 截图保存
      const screenshotPath = path.join(SCREENSHOT_DIR, `abuse_table_${vp.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      ok(fs.existsSync(screenshotPath), `已保存 ${vp.name}px 截图 -> ${screenshotPath}`);

      // 断言 1: 页面在所有宽度下不存在横向滚动 (scrollWidth <= clientWidth)
      const bodyScroll = await page.evaluate(() => {
        return {
          docScrollWidth: document.documentElement.scrollWidth,
          docClientWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
          bodyClientWidth: document.body.clientWidth
        };
      });
      ok(bodyScroll.docScrollWidth <= bodyScroll.docClientWidth + 1, `整页无横向滚动 (docScrollWidth: ${bodyScroll.docScrollWidth} <= docClientWidth: ${bodyScroll.docClientWidth})`);

      const tableWrapperScroll = await page.evaluate(() => {
        const wrap = document.querySelector('.abuse-table-wrapper');
        if (!wrap) return null;
        return {
          scrollWidth: wrap.scrollWidth,
          clientWidth: wrap.clientWidth
        };
      });
      if (tableWrapperScroll) {
        ok(tableWrapperScroll.scrollWidth <= tableWrapperScroll.clientWidth + 1, `表格容器无横向滚动 (wrapScroll: ${tableWrapperScroll.scrollWidth} <= client: ${tableWrapperScroll.clientWidth})`);
      }

      // 断言 2: DOM 中不存在 text-overflow: ellipsis、-webkit-line-clamp
      const ellipsisCheck = await page.evaluate(() => {
        const tableEls = document.querySelectorAll('.abuse-table, .abuse-table *');
        const violations = [];
        tableEls.forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.textOverflow === 'ellipsis') {
            violations.push({ tag: el.tagName, class: el.className, prop: 'text-overflow: ellipsis' });
          }
          if (style.webkitLineClamp && style.webkitLineClamp !== 'none') {
            violations.push({ tag: el.tagName, class: el.className, prop: `-webkit-line-clamp: ${style.webkitLineClamp}` });
          }
        });
        return violations;
      });
      ok(ellipsisCheck.length === 0, `DOM 中零 text-overflow: ellipsis 与 line-clamp (发现: ${ellipsisCheck.length} 处)`);

      // 检查页面可见文本中不包含 ... 或 …
      const textDotsCheck = await page.evaluate(() => {
        const wrap = document.querySelector('.abuse-table');
        if (!wrap) return [];
        const text = wrap.innerText || '';
        const dots = [];
        if (text.includes('...')) dots.push('...');
        if (text.includes('…')) dots.push('…');
        return dots;
      });
      ok(textDotsCheck.length === 0, `表格内可见文本不含省略号符号 (发现: ${textDotsCheck.join(',') || '无'})`);

      // 断言 3: 每个单元格 scrollHeight 不大于 clientHeight (没有内容被裁切)
      const cellOverflowCheck = await page.evaluate(() => {
        const cells = document.querySelectorAll('.abuse-table td');
        const clipped = [];
        cells.forEach(c => {
          // 允许 2px subpixel 渲染误差
          if (c.scrollHeight > c.clientHeight + 2) {
            clipped.push({
              class: c.className,
              scrollHeight: c.scrollHeight,
              clientHeight: c.clientHeight,
              text: c.textContent.trim().slice(0, 30)
            });
          }
        });
        return clipped;
      });
      ok(cellOverflowCheck.length === 0, `每个单元格零内容裁切 (溢出单元格数: ${cellOverflowCheck.length})`);

      // 断言 4: 「期限」「等级」「E1~E4」「LV1~LV3」「TTL」等字样不出现在滥用板块
      const forbiddenTermsCheck = await page.evaluate(() => {
        const wrap = document.querySelector('.abuse-table');
        if (!wrap) return [];
        const text = wrap.innerText || '';
        const forbidden = ['期限', '等级', 'E1', 'E2', 'E3', 'E4', 'LV0', 'LV1', 'LV2', 'LV3', 'TTL', '到期'];
        const found = [];
        for (const term of forbidden) {
          if (text.includes(term)) {
            found.push(term);
          }
        }
        return found;
      });
      ok(forbiddenTermsCheck.length === 0, `滥用威胁板块无风险管理禁语 (发现: ${forbiddenTermsCheck.join(',') || '无'})`);

      // 验证顶部 KPI 卡片数值拆分
      const kpiText = await page.evaluate(() => {
        const card = document.querySelector('.kpi-threat');
        return card ? card.innerText : '';
      });
      ok(kpiText.includes('待审') && kpiText.includes('已封禁'), `KPI 卡片已成功拆分显示「待审 / 已封禁」`);

      // 验证熔断状态条
      const circuitBanner = await page.$('.abuse-circuit-banner');
      ok(!!circuitBanner, `Global Circuit Breaker TRIPPED 顶部熔断条显示成功`);

      // 验证自动折叠批次条
      const purgedBanner = await page.$('.abuse-auto-purged-banner');
      ok(!!purgedBanner, `今日自动折叠批次条显示成功`);

      await context.close();
    }

    console.log('\n================================================================');
    if (fail === 0) {
      console.log(`=== 恭喜！全部 ${pass} 项自动化断言与 5 尺寸截图 100% 验证通过！ ===`);
    } else {
      console.error(`=== 警告：存在 ${fail} 项断言失败 (通过: ${pass}) ===`);
    }
    console.log('================================================================\n');

  } finally {
    if (browser) await browser.close();
    server.close();
  }

  process.exit(fail === 0 ? 0 : 1);
}

run();
