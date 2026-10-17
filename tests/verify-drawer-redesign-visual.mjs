import { chromium } from 'playwright';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// 简单静态服务器服务 mail-worker/dist
function createStaticServer(distDir, port) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
  };

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0].split('#')[0];
    if (reqPath === '/') reqPath = '/index.html';
    let filePath = path.join(distDir, reqPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading file');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

async function test() {
  console.log('====================================================================');
  console.log('=== [E2E] 操作报告侧边抽屉全面重构端到端验证与 4 变体视觉回归 ===');
  console.log('====================================================================\n');

  const distDir = path.resolve('mail-worker/dist');
  const port = 4188;
  const server = await createStaticServer(distDir, port);
  console.log(`[静态服务] 运行在 http://127.0.0.1:${port}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });

  const token = 'mock_jwt_admin_token_visual_test';
  await context.addInitScript(({ t }) => {
    localStorage.setItem('token', t);
    localStorage.setItem('loginEmail', 'admin@epomail.cyou');
    localStorage.setItem('role', 'admin');
    localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'admin@epomail.cyou' }]));
  }, { t: token });

  const page = await context.newPage();

  // Mock API 路由，提供完整的权限和用户信息
  await page.route('**/api/my/loginUserInfo**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        message: 'success',
        data: {
          userId: 9,
          email: 'admin@epomail.cyou',
          primaryEmail: 'admin@epomail.cyou',
          username: 'SecAdmin',
          name: 'SecAdmin',
          permKeys: ['*'],
          role: { roleId: 1, name: '站长', roleCode: 'admin', key: 'admin' },
          account: { accountId: 99, email: 'admin@epomail.cyou', name: 'admin@epomail.cyou' },
          accounts: [{ accountId: 99, email: 'admin@epomail.cyou', name: 'admin@epomail.cyou' }]
        }
      })
    });
  });

  await page.route('**/api/sys/setting**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: {} })
    });
  });

  await page.route('**/api/settings**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: {} })
    });
  });

  await page.route('**/api/mail/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data: { list: [], total: 0 } })
    });
  });

  const mockList = [
    {
      id: 1001,
      ticketId: 'THR-2026-MULTI99',
      email: 'cluster_master@epocanvas.com',
      userId: '88200',
      status: 'pending',
      circuitStatus: 'QUEUE_PAUSE',
      warningType: 'risk',
      priority: 'P0',
      category: 'quota',
      reasonCode: 'RULE-SPAM-77',
      reportReason: '同一设备指纹 30 分钟内注册并激活 4 个账号，批量外发',
      banReason: '同一设备指纹 30 分钟内注册并激活 4 个账号，主账号协同 3 个子账号批量外发，判定一人多号集群滥用。',
      alarmCount: 3,
      assignee: 'SecAdmin',
      adjudicator: 'SecAdmin',
      evidenceExpiresDays: 180,
      createTime: '2026-10-12T03:14:00Z',
      banTime: '2026-10-12T03:20:00Z',
      clusterAccounts: [
        { id: 101, email: 'sub01_cluster@epocanvas.com', userId: '88201', status: 'banned', evidenceSummary: '同一设备指纹 · 30分钟内注册' },
        { id: 102, email: 'sub02_cluster@epocanvas.com', userId: '88202', status: 'banned', evidenceSummary: '同一设备指纹 · 批量协同外发' },
        { id: 103, email: 'sub03_cluster@epocanvas.com', userId: '88203', status: 'banned', evidenceSummary: '同一出口 IP · 触发退信熔断' }
      ]
    },
    {
      id: 1002,
      ticketId: 'APP-2026-NAT88',
      email: 'student_nat@epocanvas.com',
      userId: '77301',
      status: 'pending',
      warningType: 'appeal',
      priority: 'P1',
      category: 'outbound',
      reasonCode: 'APP-NAT-SHARE',
      appealReason: '校园网NAT出口共享IP，无主观多账号滥用恶意',
      alarmCount: 1,
      assignee: 'SecAdmin',
      adjudicator: '合规复核组',
      evidenceExpiresDays: 180,
      createTime: '2026-10-13T08:30:00Z'
    },
    {
      id: 1003,
      ticketId: 'AUD-2026-SPIKE12',
      email: 'marketing_surge@epocanvas.com',
      userId: '66102',
      status: 'watching',
      warningType: 'audit',
      priority: 'P2',
      category: 'account',
      reasonCode: 'RULE-BURST-REG',
      reportReason: '短时突发发信速率超动态基线 300%',
      alarmCount: 2,
      assignee: 'SecAdmin',
      adjudicator: '系统策略引擎',
      evidenceExpiresDays: 90,
      createTime: '2026-10-14T16:00:00Z'
    },
    {
      id: 1004,
      ticketId: 'REC-2026-BAN05',
      email: 'terminated_sybil@epocanvas.com',
      userId: '55403',
      status: 'banned',
      warningType: 'ban',
      priority: 'P0',
      category: 'quota',
      reasonCode: 'RULE-REG-55',
      banReason: '终审封禁固化，永久阻断发信通道',
      alarmCount: 4,
      assignee: 'SecAdmin',
      adjudicator: '安全委员会',
      evidenceExpiresDays: 180,
      createTime: '2026-10-15T02:00:00Z',
      banTime: '2026-10-15T02:05:00Z'
    }
  ];

  await page.route('**/api/audit/list**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 200,
        data: {
          list: mockList,
          total: mockList.length,
          summary: { threat: 1, appeal: 1, audit: 1, record: 1 }
        }
      })
    });
  });

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('error') || msg.text().includes('fail')) {
      console.log('  [Browser Log]', msg.text());
    }
  });
  page.on('pageerror', err => console.log('  [Browser Error]', err.message));

  try {
    console.log('[步骤 1] 打开管理控制台 /audit-report ...');
    await page.goto(`http://127.0.0.1:${port}/audit-report`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // =========================================================================
    // 验证 1: 变体 1「滥用威胁」
    // =========================================================================
    console.log('\n[步骤 2] 验证变体 1「滥用威胁」抽屉...');
    // 点击第一行工单的详情按钮打开抽屉
    const detailBtn1 = page.locator('.action-detail-btn').first();
    await detailBtn1.click();
    await page.waitForTimeout(800);

    const drawer = page.locator('.audit-detail-drawer');
    await drawer.waitFor({ state: 'visible' });
    console.log('  ✓ 抽屉成功展开！');

    // 1.1 检查标题与描述
    const titleText = (await drawer.locator('.drawer-title').textContent()).trim();
    console.log('  - 抽屉标题:', titleText);
    assert.strictEqual(titleText, '案件全宗档案', '变体 1 标题必须严格为「案件全宗档案」');
    
    // 1.2 确认可实际处理标识、副标题、徽标行、变体下拉框已彻底删除
    const badgeMetaBarCount = await drawer.locator('.drawer-badge-meta-bar').count();
    const dropdownCount = await drawer.locator('.header-tools-right .el-dropdown').count();
    const variantTagCount = await drawer.locator('.variant-mode-tag').count();
    const subDescCount = await drawer.locator('.drawer-sub').count();
    assert.strictEqual(badgeMetaBarCount, 0, 'drawer-badge-meta-bar 必须被彻底删除');
    assert.strictEqual(dropdownCount, 0, 'el-dropdown 变体视角切换器必须被彻底删除');
    assert.strictEqual(variantTagCount, 0, 'variant-mode-tag「可实际处理」必须被彻底删除');
    assert.strictEqual(subDescCount, 0, 'drawer-sub 一体化档案等描述必须被彻底删除');
    console.log('  ✓ 已彻底删除 drawer-badge-meta-bar、el-dropdown 及所有冗余自述！');

    // 1.3 检查案件概要：当前状态为“待审”（非 active）、拍案管理直接显示名称、证据留存无 WORM
    const statusTagText = (await drawer.locator('#chapter-summary .grid-field:has-text("当前状态") .el-tag').textContent()).trim();
    console.log('  - 当前状态显示:', statusTagText);
    assert.strictEqual(statusTagText, '待审', '当前状态必须显示为待审而非 active');

    const authorityText = (await drawer.locator('#chapter-summary .grid-field:has-text("拍案管理") .field-v').textContent()).trim();
    console.log('  - 拍案管理显示:', authorityText);
    assert.strictEqual(authorityText, 'SecAdmin', '拍案管理必须直接显示名称');

    const retentionText = (await drawer.locator('#chapter-summary .grid-field:has-text("证据留存") .field-v').textContent()).trim();
    console.log('  - 证据留存显示:', retentionText);
    assert.ok(!retentionText.includes('WORM'), '证据留存严禁包含 WORM 无关描述');
    assert.ok(retentionText.includes('180 天'), '证据留存显示为 180 天');

    const caseNoLabel = (await drawer.locator('#chapter-summary .grid-field:first-child .field-k').textContent()).trim();
    console.log('  - 案件编号标签:', caseNoLabel);
    assert.ok(caseNoLabel.startsWith('案件编号'), '必须只保留「案件编号」');
    assert.ok(!caseNoLabel.includes('审计对象'), '严禁包含「审计对象」');

    // 1.4 检查集群关联账号
    console.log('  - 验证集群关联账号分项与序列号...');
    const clusterCard = drawer.locator('#chapter-cluster');
    const clusterRows = clusterCard.locator('.cluster-data-row');
    const firstSubCase = (await clusterRows.first().locator('.col-idx').textContent()).trim();
    console.log('    - 子案分项编号:', firstSubCase);
    assert.strictEqual(firstSubCase, 'THR-MULTI99-SUB01', '子案必须以 THR-MULTI99-SUB01 格式分区');
    
    // 验证 UID 允许复制
    const uidCopyBtn = clusterRows.first().locator('.col-uid .inline-copy-btn');
    assert.strictEqual(await uidCopyBtn.count(), 1, '集群账号 UID 必须具备复制按钮');
    
    // 验证无脱敏聚合数据文本
    const maskedTextCount = await clusterCard.locator('.data-tag-muted').count();
    assert.strictEqual(maskedTextCount, 0, '集群账号严禁展示脱敏聚合数据说明');

    // 1.5 验证风险研判与处置依据
    console.log('  - 验证风险研判与处置依据...');
    const basisCard = drawer.locator('#chapter-basis');
    const alarmIconCount = await basisCard.locator('.alarm-row .alarm-icon').count();
    assert.strictEqual(alarmIconCount, 1, '报警原因必须使用禁止的 icon 替代文本');
    const judgmentLogsCount = await basisCard.locator('.judgment-path-record-box .record-row').count();
    console.log('    - 研判路径记录条数:', judgmentLogsCount);
    assert.ok(judgmentLogsCount >= 4, '研判路径记录必须包含完整更新/备忘/溯源链路');

    // 1.6 验证处置与存证全周期时间线 (双泳道)
    console.log('  - 验证处置与存证全周期时间线左右双泳道...');
    const timelineCard = drawer.locator('#chapter-timeline');
    const machineNodes = await timelineCard.locator('.swimlane-cell.machine-cell .machine-card').count();
    const humanNodes = await timelineCard.locator('.swimlane-cell.human-cell .human-card').count();
    console.log(`    - 机器自动泳道节点数: ${machineNodes}, 人工与用户泳道节点数: ${humanNodes}`);
    assert.ok(machineNodes >= 3, '机器自动泳道包含 N1, N2, N4');
    assert.ok(humanNodes >= 1, '人工与用户泳道包含 N3');

    // 1.7 验证多维风险画像 (正方形方格、主驱动居中、图例与表格统一单框)
    console.log('  - 验证多维风险画像...');
    const riskCard = drawer.locator('#chapter-risk');
    const scoreBox = riskCard.locator('.composite-score-square');
    const scoreText = (await scoreBox.locator('.score-number').textContent()).trim();
    console.log('    - 综合风险分数值:', scoreText);
    assert.strictEqual(scoreText, '88', '风险分显示数字 88');
    const denomCount = await scoreBox.locator('.score-denom').count();
    assert.strictEqual(denomCount, 0, '删除 /100 标识');

    const driverText = (await riskCard.locator('.risk-driver-bar-centered').textContent()).trim();
    console.log('    - 主驱动维度居中:', driverText);
    assert.ok(driverText.includes('一人多号群控集群关联度高'), '主驱动维度正确定位在方格下方居中');

    const unifiedBox = riskCard.locator('.risk-indicators-unified-box');
    assert.strictEqual(await unifiedBox.count(), 1, '图例和指标表格必须统一在一个框内');
    const indicatorRows = await unifiedBox.locator('.metric-card-row').count();
    console.log('    - 丰富指标项数量:', indicatorRows);
    assert.ok(indicatorRows >= 9, '滥用威胁指标项包含设备指纹、会话切换、时序聚集、投诉、外发峰值、退信率等 >= 9 项');

    // 1.8 验证相似案例处置参照
    console.log('  - 验证相似案例处置参照...');
    const similarCard = drawer.locator('#chapter-similar');
    const statCols = await similarCard.locator('.stat-col-box').count();
    console.log('    - 统计列数:', statCols);
    assert.strictEqual(statCols, 4, '必须展示维持封禁/暂禁观察/放行结案/标记误报 4 列分布');

    // 1.9 验证证据链溯源
    console.log('  - 验证证据链溯源...');
    const chainCard = drawer.locator('#chapter-chain');
    const chainRows = await chainCard.locator('.chain-card-row').count();
    console.log('    - 证据链溯源条数:', chainRows);
    assert.strictEqual(chainRows, 4, '证据链必须完整展示 EV-01 至 EV-04 链路');

    // 截图保存变体 1
    await page.screenshot({ path: 'tests/visual_redesign_v1_threat.png', fullPage: false });
    console.log('  📸 变体 1 截图已保存: tests/visual_redesign_v1_threat.png');

    // 滚动截取处置与存证全周期时间线
    await timelineCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'tests/visual_redesign_v1_timeline.png', fullPage: false });
    console.log('  📸 变体 1 时间线截图已保存: tests/visual_redesign_v1_timeline.png');

    // 滚动截取多维风险画像
    await riskCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'tests/visual_redesign_v1_risk.png', fullPage: false });
    console.log('  📸 变体 1 风险画像截图已保存: tests/visual_redesign_v1_risk.png');

    // 滚动截取下半部分
    await similarCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'tests/visual_redesign_v1_bottom.png', fullPage: false });
    console.log('  📸 变体 1 下半区截图已保存: tests/visual_redesign_v1_bottom.png');

    // 关闭抽屉
    await drawer.locator('.drawer-close-btn').click();
    await page.waitForTimeout(500);

    // =========================================================================
    // 验证 2: 变体 2「审计申诉」
    // =========================================================================
    console.log('\n[步骤 3] 验证变体 2「审计申诉」差异化抽屉...');
    // 点击第二行工单
    const detailBtn2 = page.locator('.action-detail-btn').nth(1);
    await detailBtn2.click();
    await page.waitForTimeout(800);

    const title2 = (await drawer.locator('.drawer-title').textContent()).trim();
    console.log('  - 变体 2 标题:', title2);
    assert.strictEqual(title2, '申诉复核档案', '变体 2 标题必须为「申诉复核档案」');

    // 确认变体 2 无集群关联账号模块
    const clusterInV2 = await drawer.locator('#chapter-cluster').count();
    assert.strictEqual(clusterInV2, 0, '申诉复核档案绝对不展示集群关联账号');

    // 确认变体 2 的风险研判为争议申诉
    const basisTriggerV2 = (await drawer.locator('#chapter-basis .trigger-row').textContent()).trim();
    assert.ok(basisTriggerV2.includes('争议申诉'), '变体 2 触发原因必须为争议申诉');

    // 确认变体 2 裁决工作台动作差异化 (批准申诉 / 条件放行 / 驳回申诉)
    const approveBtnText = (await drawer.locator('#chapter-decision .el-button').first().textContent()).trim();
    console.log('  - 变体 2 裁决首动作:', approveBtnText);
    assert.ok(approveBtnText.includes('放行') || approveBtnText.includes('批准'), '变体 2 裁决动作差异化');

    await page.screenshot({ path: 'tests/visual_redesign_v2_appeal.png', fullPage: false });
    console.log('  📸 变体 2 截图已保存: tests/visual_redesign_v2_appeal.png');

    await drawer.locator('.drawer-close-btn').click();
    await page.waitForTimeout(500);

    // =========================================================================
    // 验证 3: 变体 3「风控预警」
    // =========================================================================
    console.log('\n[步骤 4] 验证变体 3「风控预警」差异化抽屉...');
    const detailBtn3 = page.locator('.action-detail-btn').nth(2);
    await detailBtn3.click();
    await page.waitForTimeout(800);

    const title3 = (await drawer.locator('.drawer-title').textContent()).trim();
    console.log('  - 变体 3 标题:', title3);
    assert.strictEqual(title3, '风控预警档案', '变体 3 标题必须为「风控预警档案」');

    const trigger3 = (await drawer.locator('#chapter-basis .trigger-row').textContent()).trim();
    assert.ok(trigger3.includes('速率突刺'), '变体 3 触发原因为速率突刺');

    await page.screenshot({ path: 'tests/visual_redesign_v3_audit.png', fullPage: false });
    console.log('  📸 变体 3 截图已保存: tests/visual_redesign_v3_audit.png');

    await drawer.locator('.drawer-close-btn').click();
    await page.waitForTimeout(500);

    // =========================================================================
    // 验证 4: 变体 4「处置台账」
    // =========================================================================
    console.log('\n[步骤 5] 验证变体 4「处置台账」差异化抽屉...');
    const detailBtn4 = page.locator('.action-detail-btn').nth(3);
    await detailBtn4.click();
    await page.waitForTimeout(800);

    const title4 = (await drawer.locator('.drawer-title').textContent()).trim();
    console.log('  - 变体 4 标题:', title4);
    assert.strictEqual(title4, '处置台账档案', '变体 4 标题必须为「处置台账档案」');

    // 确认变体 4 绝对无裁决工作台编辑动作
    const decisionWorkbenchInV4 = await drawer.locator('#chapter-decision').count();
    assert.strictEqual(decisionWorkbenchInV4, 0, '变体 4 处置台账绝对不展示裁决工作台');

    // 确认包含只读台账合规存证横幅
    const ledgerBannerInV4 = await drawer.locator('#chapter-ledger').count();
    assert.strictEqual(ledgerBannerInV4, 1, '变体 4 必须展示只读合规存证横幅');

    await page.screenshot({ path: 'tests/visual_redesign_v4_record.png', fullPage: false });
    console.log('  📸 变体 4 截图已保存: tests/visual_redesign_v4_record.png');

    console.log('\n====================================================================');
    console.log('🎉 4 种变体抽屉全部端到端验证通过！完全符合所有 UI 需求与差异化规范！');
    console.log('====================================================================\n');

  } finally {
    await browser.close();
    server.close();
  }
}

test().catch(err => {
  console.error('\n❌ 验证失败:', err);
  process.exit(1);
});
