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

// 7 种测试数据构造 (符合需求 7.2)
const mockList = [
  // 1. 普通邮箱
  {
    id: 1,
    ticketId: '#10001',
    email: 'alice@example.com',
    userId: '10001',
    status: 'pending',
    reportCategory: 'protocol',
    detailText: '蜜罐命中',
    reportedByOthers: 0,
    operator: '-',
    createTime: '2026-10-10 10:00:00'
  },
  // 2. 本地部分 64 字符的邮箱 (RFC 标准本地部分上限)
  {
    id: 2,
    ticketId: '#10002',
    email: 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz012@domain.com',
    userId: '10002',
    status: 'banned',
    reportCategory: 'credential',
    eventType: 'credential_tamper_ban',
    operator: 'SecAdmin',
    banTime: '2026-10-09 14:30:00'
  },
  // 3. 总长约 150 字符的邮箱
  {
    id: 3,
    ticketId: '#10003',
    email: 'user_part_with_many_characters_1234567890abcdefghijklmnopqrstuvwxyz@longsubdomainpart.somereallylongdomainnamewithmultiplelabels.example.org',
    userId: '10003',
    status: 'unbanned',
    reportCategory: 'spam',
    reportedByOthers: 3,
    reportSource: 'user',
    operator: 'AutoBot',
    resolvedTime: '2026-10-08 09:15:00'
  },
  // 4. 总长约 250 字符的邮箱 (RFC 254 字符极限测试)
  {
    id: 4,
    ticketId: '#10004',
    email: 'superlonglocalpartwithallpossiblecharactersuptomaximumallowedrfcstandards0123456789@superlongsubdomain1.superlongsubdomain2.superlongsubdomain3.superlongsubdomain4.superlongsubdomain5.superlongsubdomain6.superlongsubdomain7.example.com',
    userId: '10004',
    status: 'pending',
    reportCategory: 'quota_evasion',
    eventType: 'quota_evasion',
    operator: '-'
  },
  // 5. 含中文本地部分或 IDN 域名的邮箱
  {
    id: 5,
    ticketId: '#10005',
    email: '用户张三@测试.cn',
    userId: '10005',
    status: 'banned',
    reportCategory: 'protocol',
    detailText: '蜜罐命中',
    operator: 'Admin',
    banTime: '2026-10-10 11:00:00'
  },
  // 6. 3 个账号的集群工单
  {
    id: 6,
    ticketId: '#10006',
    email: 'cluster_lead@farm.net',
    userId: '20001',
    status: 'pending',
    reportCategory: 'multi_account',
    clusterId: 'sybil_cluster_01',
    reportedByOthers: 0,
    eventType: 'multi_account_detected',
    clusterAccounts: [
      { id: '6_1', ticketId: '#10006-1', email: 'cluster_lead@farm.net', userId: '20001', status: 'pending', reportCategory: 'multi_account' },
      { id: '6_2', ticketId: '#10006-2', email: 'cluster_sub_02@farm.net', userId: '20002', status: 'pending', reportCategory: 'multi_account' },
      { id: '6_3', ticketId: '#10006-3', email: 'cluster_sub_03@farm.net', userId: '20003', status: 'pending', reportCategory: 'multi_account' }
    ]
  },
  // 7. 已清除账号
  {
    id: 7,
    ticketId: '#10007',
    email: '已清除',
    userId: '99999',
    isPurged: true,
    status: 'purged',
    reportCategory: 'protocol',
    detailText: '蜜罐命中',
    operator: 'System',
    banTime: '2026-10-01 12:00:00'
  },
  // 8. 熔断暂扣工单 (测试 QUEUE_PAUSE 状态词表)
  {
    id: 8,
    ticketId: '#10008',
    email: 'circuit_held_user@test.org',
    userId: '10008',
    status: 'pending',
    circuitStatus: 'QUEUE_PAUSE',
    reportCategory: 'spam',
    reportedByOthers: 5,
    reportSource: 'fbl',
    operator: '-'
  }
];

async function run() {
  console.log('================================================================');
  console.log('=== 「滥用威胁」表格全尺寸响应式、零截断、无横向滚动全真断言实测 ===');
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
              total: mockList.length,
              list: mockList,
              circuitBreaker: {
                tripped: true,
                status: 'TRIPPED',
                reason: 'Outbound flood spike detected'
              },
              autoPurgedCount: 3,
              autoPurgedBatches: [
                { id: 'BATCH-20261010-01', time: '10:00:00', reason: 'AUTO_PURGE_AND_TOMBSTONE', count: 15 },
                { id: 'BATCH-20261010-02', time: '11:30:00', reason: 'AUTO_PURGE_AND_TOMBSTONE', count: 8 },
                { id: 'BATCH-20261010-03', time: '14:20:00', reason: 'AUTO_PURGE_AND_TOMBSTONE', count: 24 }
              ],
              counts: {
                threat: 8,
                threatPending: 4,
                threatBanned: 2,
                audit: 5,
                appeal: 2,
                record: 8
              }
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

    console.log('[步骤 1] 导航并加载安全中心审计控制台...');
    await page.goto(`http://127.0.0.1:${PORT}/mail/u/0/#manage/admin/audit`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 确认当前在滥用威胁板块
    await page.waitForSelector('.abuse-table-wrapper', { timeout: 10000 });
    console.log('  ✓ 滥用威胁表格容器 .abuse-table-wrapper 已就绪\n');

    // 展开集群工单以进行最充分的断言
    const clusterBadge = await page.$('.cluster-badge');
    if (clusterBadge) {
      await clusterBadge.click();
      await page.waitForTimeout(500);
      console.log('  ✓ 集群子账号展开成功');
    }

    const testWidths = [1440, 1024, 860, 768, 375];

    for (const w of testWidths) {
      console.log(`\n================== [断言宽度: ${w}px] ==================`);
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(500);

      // 1. 无横向滚动断言: document.documentElement.scrollWidth <= clientWidth
      const scrollMetrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const wrapper = document.querySelector('.abuse-table-wrapper');
        return {
          docScrollWidth: doc.scrollWidth,
          docClientWidth: doc.clientWidth,
          wrapperScrollWidth: wrapper ? wrapper.scrollWidth : 0,
          wrapperClientWidth: wrapper ? wrapper.clientWidth : 0
        };
      });

      console.log(`  宽度度量: doc=${scrollMetrics.docScrollWidth}/${scrollMetrics.docClientWidth}, wrapper=${scrollMetrics.wrapperScrollWidth}/${scrollMetrics.wrapperClientWidth}`);
      ok(scrollMetrics.docScrollWidth <= scrollMetrics.docClientWidth, `[${w}px] 页面整体零横向滚动 (scrollWidth <= clientWidth)`);
      ok(scrollMetrics.wrapperScrollWidth <= scrollMetrics.wrapperClientWidth, `[${w}px] 滥用表格容器零横向滚动`);

      // 2. 零省略号断言: 无 text-overflow: ellipsis, 无 -webkit-line-clamp
      const overflowStyles = await page.evaluate(() => {
        const wrapper = document.querySelector('.abuse-table-wrapper');
        if (!wrapper) return [];
        const bad = [];
        const all = wrapper.querySelectorAll('*');
        for (const el of all) {
          const style = window.getComputedStyle(el);
          if (style.textOverflow === 'ellipsis') {
            bad.push({ tag: el.tagName, class: el.className, prop: 'text-overflow: ellipsis' });
          }
          const lineClamp = style.webkitLineClamp || style.lineClamp;
          if (lineClamp && lineClamp !== 'none') {
            bad.push({ tag: el.tagName, class: el.className, prop: `-webkit-line-clamp: ${lineClamp}` });
          }
        }
        return bad;
      });
      ok(overflowStyles.length === 0, `[${w}px] DOM 中零 text-overflow: ellipsis 与零 line-clamp (命中: ${overflowStyles.length})`);
      if (overflowStyles.length > 0) {
        console.error('  错误样式元素:', overflowStyles);
      }

      // 3. 文本中零 '...' 或 '…'
      const ellipsisTextNodes = await page.evaluate(() => {
        const wrapper = document.querySelector('.abuse-table-wrapper');
        if (!wrapper) return [];
        const matches = [];
        const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const txt = node.textContent;
          if (txt.includes('...') || txt.includes('…')) {
            if (node.parentElement && !['SCRIPT', 'STYLE'].includes(node.parentElement.tagName)) {
              matches.push({ parent: node.parentElement.tagName, text: txt.trim() });
            }
          }
        }
        return matches;
      });
      ok(ellipsisTextNodes.length === 0, `[${w}px] 页面可见文本零省略号 (命中: ${ellipsisTextNodes.length})`);
      if (ellipsisTextNodes.length > 0) {
        console.error('  省略号文本节点:', ellipsisTextNodes);
      }

      // 4. 单元格无内容裁切 (scrollHeight <= clientHeight + 2)
      if (w >= 861) {
        const cellOverflows = await page.evaluate(() => {
          const cells = document.querySelectorAll('.abuse-table th, .abuse-table td');
          const overflows = [];
          for (const c of cells) {
            if (c.scrollHeight > c.clientHeight + 2) {
              overflows.push({
                text: c.textContent.trim().slice(0, 30),
                scrollHeight: c.scrollHeight,
                clientHeight: c.clientHeight
              });
            }
          }
          return overflows;
        });
        ok(cellOverflows.length === 0, `[${w}px] 桌面表格全部单元格零裁切 (超出项: ${cellOverflows.length})`);
        if (cellOverflows.length > 0) {
          console.error('  超出单元格:', cellOverflows);
        }
      } else {
        console.log(`  [${w}px] 响应式卡片视图已激活 (860px/768px/375px)`);
      }

      // 5. 禁语过滤断言: 「期限」「等级」「E1~E4」「LV1~LV3」「TTL」不出现在滥用威胁板块
      const forbiddenWords = ['期限', '等级', 'E1', 'E2', 'E3', 'E4', 'LV1', 'LV2', 'LV3', 'TTL'];
      const forbiddenHits = await page.evaluate(({ words }) => {
        const wrapper = document.querySelector('.abuse-table-wrapper');
        const kpi = document.querySelector('.kpi-threat');
        const text = (wrapper ? wrapper.innerText : '') + ' ' + (kpi ? kpi.innerText : '');
        const hits = [];
        for (const word of words) {
          if (text.includes(word)) {
            hits.push(word);
          }
        }
        return hits;
      }, { words: forbiddenWords });
      ok(forbiddenHits.length === 0, `[${w}px] 滥用板块零禁止词 (命中: ${forbiddenHits.join(', ') || '无'})`);

      // 截图保存
      const screenshotPath = path.join(SCREENSHOT_DIR, `abuse_table_${w}px.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  ✓ 截图已保存: ${screenshotPath}`);
    }

    // 专项交互测试: 验证自动折叠批次弹窗
    console.log('\n[步骤 2] 验证自动折叠批次弹窗...');
    const autoPurgedBanner = await page.$('.auto-purged-banner');
    ok(!!autoPurgedBanner, '存在「今日已自动折叠 3 个批次」提示条');
    if (autoPurgedBanner) {
      await autoPurgedBanner.click();
      await page.waitForTimeout(500);
      const dialogVisible = await page.$eval('.el-dialog', el => window.getComputedStyle(el).display !== 'none');
      ok(dialogVisible, '自动折叠批次弹窗成功弹出');
      const dialogCardCount = await page.$$eval('.purged-batch-card', els => els.length);
      ok(dialogCardCount === 3, `批次列表正确展示 3 个批次 (实际: ${dialogCardCount})`);
      const closeBtn = await page.$('.dialog-footer button');
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(300);
    }

    // 专项状态条测试: 验证熔断状态条
    console.log('\n[步骤 3] 验证全局熔断状态条...');
    const circuitBannerText = await page.$eval('.circuit-breaker-banner', el => el.textContent.trim()).catch(() => null);
    ok(circuitBannerText && circuitBannerText.includes('熔断中:新违规仅暂扣,不封禁账号'), `熔断状态条文案正确呈现:「${circuitBannerText}」`);

    // 专项卡片拆分统计测试: 待审 N / 已封禁 M
    console.log('\n[步骤 4] 验证滥用威胁 KPI 卡片拆分显示...');
    const kpiSplitText = await page.$eval('.kpi-threat .kpi-split-stat', el => el.textContent.trim()).catch(() => null);
    ok(kpiSplitText && /待审\s*4/.test(kpiSplitText) && /已封禁\s*2/.test(kpiSplitText), `KPI 统计卡片拆分展示正确:「${kpiSplitText}」`);

  } finally {
    if (browser) await browser.close();
    server.close();
  }

  console.log('\n================================================================');
  console.log(`=== 验收结果汇总: ${pass} 项通过, ${fail} 项失败 ===`);
  console.log('================================================================');

  if (fail > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('实测脚本运行异常:', err);
  process.exit(1);
});
