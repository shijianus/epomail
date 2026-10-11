import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const DIST_DIR = path.resolve('mail-worker/dist');
const PORT = 8898;

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
  console.log('=== PM 业务架构规范全真栈端到端核验：常规/异常威胁/申诉/封禁台账 ===');
  console.log('================================================================');

  const server = await startServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    const mockToken = 'mock-pm-admin-token-2026';
    await context.addInitScript(({ t }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'admin@epocanvas.com' }]));
    }, { t: mockToken });

    const page = await context.newPage();

    // Mock API
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

    const pmDataset = [
      // 1. 常规审查 (Routine Reviews - LV0~LV3)
      {
        id: 201,
        ticketId: 'REV-2026-LV102',
        email: 'tester_audited@epocanvas.com',
        warningType: 'audit',
        eventType: 'ip_roaming_routine',
        category: 'security',
        actionText: '常规多网/多地IP漫游跳跃 (LV1)',
        detailText: '常规多网多地IP跳跃审查，对账户及社群无重大危害。',
        ip: '104.28.19.44',
        geo: 'Tokyo, JP',
        device: 'Safari 17 / macOS',
        deviceType: 'desktop',
        fingerprint: 'fp_safe_991',
        priority: 'LV1',
        status: 'active',
        reportedByOthers: 0,
        createTime: '2026-10-04 12:00:00'
      },
      // 2. 异常威胁 (Anomalous Threats - NO LV0~LV3! External mail reported)
      {
        id: 202,
        ticketId: 'THR-2026-REP012',
        email: 'phishing_scam@external-fake.xyz',
        warningType: 'risk',
        eventType: 'user_reported',
        category: 'security',
        actionText: '外部邮件被 12 名用户检举诈骗与传销推广',
        detailText: '外部邮件发件人。大量向站内用户投递虚假传销与欺诈外链。',
        ip: '45.33.32.156',
        geo: 'Fremont, US',
        device: 'HeadlessChrome / Linux',
        deviceType: 'desktop',
        fingerprint: 'fp_bot_001',
        isInternal: 0,
        reportCategory: 'fraud',
        reportReason: '传销投资与虚假外链',
        priority: 'CRITICAL',
        status: 'active',
        reportedByOthers: 12,
        createTime: '2026-10-04 14:30:00'
      },
      // 2. 异常威胁 (Internal spammer)
      {
        id: 203,
        ticketId: 'THR-2026-REP005',
        email: 'internal_spammer@epocanvas.com',
        warningType: 'risk',
        eventType: 'user_reported',
        category: 'security',
        actionText: '站内账号被 5 名用户检举垃圾推广',
        detailText: '站内注册用户利用内部通讯群发垃圾广告与拉群信息。',
        ip: '114.119.160.88',
        geo: 'Beijing, CN',
        device: 'Firefox 129 / Linux',
        deviceType: 'desktop',
        fingerprint: 'fp_int_spm_9',
        isInternal: 1,
        reportCategory: 'spam',
        reportReason: '站内群发商业广告',
        priority: 'HIGH',
        status: 'active',
        reportedByOthers: 5,
        createTime: '2026-10-04 15:00:00'
      },
      // 3. 争议申诉 (Dispute Appeals - Position 3)
      {
        id: 204,
        ticketId: 'APL-2026-AP77X2',
        email: 'pilot-recovery@epocanvas.com',
        warningType: 'appeal',
        eventType: 'appeal_submitted',
        category: 'appeal',
        actionText: '用户提交工单申诉解除风控封禁',
        detailText: '出差使用移动漫游热点，触发多地IP跳跃风控误封。',
        ip: '116.228.89.24',
        geo: 'Shanghai, CN (Roaming)',
        device: 'Edge 128 / Windows 11',
        deviceType: 'desktop',
        fingerprint: 'fp_pilot_77a',
        priority: 'P1',
        status: 'pending',
        reportedByOthers: 0,
        appealReason: '出差在公共漫游网络产生多IP并发跳跃，导致被风控阻断，申请解封。',
        createTime: '2026-10-04 16:00:00'
      },
      // 4. 封禁管控 (Sanction Archive - Position 4, Pure display ledger)
      {
        id: 205,
        ticketId: 'BAN-2026-BD9901',
        email: 'compromised_bot@malicious.xyz',
        warningType: 'ban',
        eventType: 'auto_ban',
        category: 'security',
        actionText: '触碰发信频率熔断阈值被系统自动封禁',
        detailText: '5分钟内尝试发送超50封含黑名单外部URL的垃圾邮件。',
        banReason: '发信频率熔断且包含恶意链接',
        banTime: '2026-10-02 08:15:00',
        resolvedTime: '2026-10-02 08:15:00',
        ip: '198.51.100.88',
        geo: 'Amsterdam, NL',
        device: 'Python-Requests / Unknown',
        deviceType: 'desktop',
        fingerprint: 'fp_crawl_92',
        priority: 'CRITICAL',
        status: 'banned',
        reportedByOthers: 0,
        createTime: '2026-10-02 08:15:00'
      },
      {
        id: 206,
        ticketId: 'BAN-2026-UN0021',
        email: 'unbanned_user@epocanvas.com',
        warningType: 'ban',
        eventType: 'credential_tamper_ban',
        category: 'security',
        actionText: '账号密保异动封禁，申诉核实为本人出差换机，已解禁',
        detailText: '经申诉工单核验初始注册基准通过，管理员人工放行解禁并移出黑名单，台账永久保留供审计追溯。',
        banReason: '新设备/陌生环境立刻更改账户密保 (怀疑账号买卖黑产)',
        banTime: '2026-09-28 10:00:00',
        resolvedTime: '2026-10-04 14:30:00',
        ip: '116.228.89.24',
        geo: 'Shanghai, CN',
        device: 'Edge 128 / Windows 11',
        deviceType: 'desktop',
        fingerprint: 'fp_pilot_77a',
        priority: 'HIGH',
        status: 'unbanned',
        reportedByOthers: 0,
        appealReason: '出差换新笔记本电脑，登入后重置密保被误判。',
        createTime: '2026-09-28 10:00:00'
      }
    ];

    await page.route('**/api/audit/list*', async (route) => {
      const url = new URL(route.request().url());
      const warningType = url.searchParams.get('warningType') || 'all';

      let list = [...pmDataset];
      if (warningType && warningType !== 'all') {
        list = list.filter(item => item.warningType === warningType);
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            list,
            total: list.length,
            counts: {
              categories: {
                audit: { pending: 1, total: 1 },
                risk: { pending: 2, total: 2 },
                appeal: { pending: 1, total: 1 },
                ban: { pending: 1, total: 2 }
              },
              total: 4,
              allTotal: 6
            }
          }
        }
      });
    });

    console.log('\n[步骤 1] 正在加载审计控制台...');
    await page.goto(`http://127.0.0.1:${PORT}/mail/u/0/#manage/admin/audit`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1000);

    // 1. 验证 4 大板块层级顺序：常规审查 -> 异常威胁 -> 争议申诉 -> 封禁管控
    console.log('\n[核验 1] 验证 KPI 板块严格按 PM 业务顺序排布...');
    const kpiTitles = await page.locator('.kpi-card .kpi-title').allTextContents();
    console.log(`  KPI 板块标题序列: ${JSON.stringify(kpiTitles)}`);
    ok(kpiTitles[0].includes('常规审查'), '板块 1 为 常规审查 (audit)');
    ok(kpiTitles[1].includes('异常威胁'), '板块 2 为 异常威胁 (risk)');
    ok(kpiTitles[2].includes('争议申诉'), '板块 3 为 争议申诉 (appeal - 提前至第3位)');
    ok(kpiTitles[3].includes('封禁管控'), '板块 4 为 封禁管控 (ban - 移至最后纯展示台账)');

    // 2. 验证常规审查展示 LV0~LV3
    console.log('\n[核验 2] 验证常规审查包含 LV0~LV3 自动审核等级...');
    const routineCard = page.locator('.kpi-card').nth(0);
    await routineCard.click();
    await page.waitForTimeout(500);

    const routineRow = page.locator('.el-table__body tr.el-table__row').first();
    const routineRiskTag = await routineRow.locator('.robot-risk-cell').textContent();
    console.log(`  常规审查判定展示: ${routineRiskTag.trim()}`);
    ok(routineRiskTag.includes('LV1') || routineRiskTag.includes('LV'), '常规审查展示 LV 等级标签 (如 LV1·轻微跳跃)');

    // 3. 验证异常威胁不存在 LV0~LV3，展示异常威胁与检举高权重
    console.log('\n[核验 3] 验证异常威胁不存在任何 LV0~LV3，标定严重破坏威胁...');
    const threatCard = page.locator('.kpi-card').nth(1);
    await threatCard.click();
    await page.waitForTimeout(500);

    const threatRows = page.locator('.el-table__body tr.el-table__row');
    const threatCount = await threatRows.count();
    ok(threatCount === 2, `异常威胁包含 2 笔高危记录 (检举 12 次外部邮件 与 检举 5 次内部用户)`);

    const row1RiskText = await threatRows.nth(0).locator('.robot-risk-cell').textContent();
    console.log(`  异常威胁行 1 判定展示: ${row1RiskText.trim()}`);
    ok(!row1RiskText.includes('LV0') && !row1RiskText.includes('LV1') && !row1RiskText.includes('LV2') && !row1RiskText.includes('LV3'), '异常威胁绝无 LV0~LV3 等级');
    ok(row1RiskText.includes('异常威胁') || row1RiskText.includes('严重破坏'), '异常威胁标定为 异常威胁·严重破坏');

    // 验证检举徽标
    const badgesText = await threatRows.nth(0).locator('.case-id-cell').textContent();
    console.log(`  异常威胁行 1 来源与检举标签: ${badgesText.trim()}`);
    ok(badgesText.includes('外部邮件'), '明确标定 外部邮件 来源');
    ok(badgesText.includes('12'), '高权重检举频次清晰标定 (检举 12 次)');

    // 打开外部邮件抽屉验证专用拉黑操作
    await threatRows.nth(0).locator('.el-button').click();
    await page.waitForTimeout(800);
    const drawer1 = page.locator('.audit-drawer-container');
    ok(await drawer1.isVisible(), '成功滑出外部邮件检举研判抽屉');
    const blacklistBtn = drawer1.locator('.adjudication-actions .el-button--danger', { hasText: '黑名单' });
    ok(await blacklistBtn.isVisible(), '外部邮件检举具备专属「加入系统黑名单」人体工学按钮');

    // 关闭抽屉并测试内部邮件
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    await threatRows.nth(1).locator('.el-button').click();
    await page.waitForTimeout(800);
    const muteBtn = drawer1.locator('.adjudication-actions .el-button--warning', { hasText: '禁言' });
    ok(await muteBtn.isVisible(), '内部用户检举具备专属「限制发信 (禁言)」人体工学按钮');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 4. 验证争议申诉 (appeal)
    console.log('\n[核验 4] 验证争议申诉支持人工复核与解禁...');
    const appealCard = page.locator('.kpi-card').nth(2);
    await appealCard.click();
    await page.waitForTimeout(500);

    const appealRow = page.locator('.el-table__body tr.el-table__row').first();
    await appealRow.locator('.el-button').click();
    await page.waitForTimeout(800);

    const appealQuote = await page.locator('.appeal-statement-quote').textContent();
    console.log(`  申诉人表单陈述: ${appealQuote.trim()}`);
    ok(appealQuote.includes('出差在公共漫游网络产生多IP并发跳跃'), '申诉抽屉清晰呈现用户表单提交的申诉理由');

    const approveBtn = drawer1.locator('.adjudication-actions .el-button--success', { hasText: '放行' });
    ok(await approveBtn.isVisible(), '具备同意解禁放行按钮');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 5. 验证封禁管控 (ban) 纯展示台账规范
    console.log('\n[核验 5] 验证封禁管控纯展示透明台账（包含解禁记录保留、零篡改）...');
    const sanctionCard = page.locator('.kpi-card').nth(3);
    await sanctionCard.click();
    await page.waitForTimeout(500);

    // 检查表头是否对齐 编号/邮箱/封禁时间/最后处理时间/封禁原因/当前状态/详情
    const banHeaders = await page.locator('.el-table__header th').allTextContents();
    const cleanHeaders = banHeaders.map(h => h.trim()).filter(Boolean);
    console.log(`  封禁台账表头: ${cleanHeaders.join(' | ')}`);
    ok(cleanHeaders.some(h => h.includes('编号')), '具备 编号 列');
    ok(cleanHeaders.some(h => h.includes('邮箱') || h.includes('地址')), '具备 邮箱 列');
    ok(cleanHeaders.some(h => h.includes('封禁时间')), '具备 封禁时间 列');
    ok(cleanHeaders.some(h => h.includes('最后处理时间')), '具备 最后处理时间 列');
    ok(cleanHeaders.some(h => h.includes('封禁原因')), '具备 封禁原因 列');
    ok(cleanHeaders.some(h => h.includes('状态')), '具备 当前状态 列');
    ok(cleanHeaders.some(h => h.includes('详情')), '具备 详情 列');

    const banRows = page.locator('.el-table__body tr.el-table__row');
    const banRowCount = await banRows.count();
    ok(banRowCount === 2, `封禁台账呈现 2 笔历史封禁与解禁留痕记录 (数量: ${banRowCount})`);

    // 检查已解禁记录
    const unbannedRow = banRows.nth(1);
    const unbannedStatusTag = await unbannedRow.locator('.el-tag').textContent();
    console.log(`  申诉解禁账号当前状态: ${unbannedStatusTag.trim()}`);
    ok(unbannedStatusTag.includes('已解禁') || unbannedStatusTag.includes('移出黑名单'), '解禁账号状态明确显示为「已解禁·移出黑名单」，台账永久保留供审计追溯');

    // 打开只读档案抽屉
    await unbannedRow.locator('.el-button').click();
    await page.waitForTimeout(800);

    const bannerNotice = await page.locator('.sanction-ledger-banner').textContent();
    console.log(`  封禁台账公示说明: ${bannerNotice.trim()}`);
    ok(bannerNotice.includes('公开透明台账') && bannerNotice.includes('不可随意篡改'), '封禁档案严格遵循 PM 规范，提示纯公开透明台账且禁止随意篡改');

    // 确认抽屉内绝无篡改性操作表单
    const mutatingButtons = await page.locator('.adjudication-actions .el-button').count();
    ok(mutatingButtons === 0, `封禁管控抽屉为纯展示，零破坏性裁决操作按钮 (按钮数: ${mutatingButtons})`);

    // 截图留存
    const screenshotPath = 'tests/verify_audit_pm_standards_live.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  ✓ 截取 PM 标准端到端实测快照: ${screenshotPath}`);

  } catch (err) {
    console.error('测试异常:', err);
    fail++;
    failures.push(err.message);
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  console.log('\n================================================================');
  console.log(`=== 测试总结: ${pass} 项通过, ${fail} 项失败 ===`);
  if (failures.length > 0) {
    console.log('失败项清单:');
    failures.forEach(f => console.log('  - ' + f));
  }
  console.log('================================================================\n');

  if (fail > 0) process.exit(1);
}

run();
