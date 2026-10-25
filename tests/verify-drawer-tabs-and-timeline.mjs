import { chromium } from 'playwright';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

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

async function runTests() {
  console.log('====================================================================');
  console.log('=== [E2E] 案件全宗档案抽屉全面验收测试 (Tab/时间线/隔离/响应式/深色) ===');
  console.log('====================================================================\n');

  const distDir = path.resolve('mail-worker/dist');
  const port = 4192;
  const server = await createStaticServer(distDir, port);
  console.log(`[静态预览服务] 运行在 http://127.0.0.1:${port}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });

  const token = 'mock_jwt_admin_token_tab_test';
  await context.addInitScript(({ t }) => {
    localStorage.setItem('token', t);
    localStorage.setItem('loginEmail', 'admin@epomail.cyou');
    localStorage.setItem('role', 'admin');
    localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'admin@epomail.cyou' }]));
  }, { t: token });

  const page = await context.newPage();

  // Mock API 路由
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
      body: JSON.stringify({
        code: 200,
        data: {
          title: 'Epocanvas Mail',
          enable_registration: true,
          require_email_verify: false,
          enable_turnstile: false
        }
      })
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
    if (msg.type() === 'error' || msg.text().includes('fail')) {
      console.log('  [Browser Log]', msg.text());
    }
  });

  try {
    console.log('[步骤 1] 导航至操作报告页面 (/audit-report)...');
    await page.goto(`http://127.0.0.1:${port}/audit-report`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    const drawer = page.locator('.audit-detail-drawer.audit-drawer-container');
    console.log('[步骤 2] 打开变体 1 (滥用威胁) 档案抽屉...');
    const detailBtn1 = page.locator('.action-detail-btn').first();
    await detailBtn1.waitFor({ state: 'visible', timeout: 8000 });
    await detailBtn1.click();
    await drawer.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500);

    // =========================================================================
    // 1. 桌面总览首屏 (Tab 1)
    // =========================================================================
    console.log('\n[覆盖 1] 验证并捕获：桌面总览首屏...');
    const tabsWrapper = drawer.locator('.drawer-tabs-wrapper');
    const tabItems = tabsWrapper.locator('.el-tabs__item');
    assert.strictEqual(await tabItems.count(), 4, '必须为 4 个 Tab 项 (总览/调查/证据/裁决)');

    // 验证 Tab 1 默认激活
    assert.ok((await tabItems.first().getAttribute('class')).includes('is-active'), '默认激活 Tab 1');
    assert.ok(await drawer.locator('#chapter-basis').isVisible(), '总览 Tab 下 风险研判处置依据 可见');
    assert.ok(await drawer.locator('#chapter-summary').isVisible(), '总览 Tab 下 案件概要 可见');
    assert.ok(await drawer.locator('#chapter-cluster').isVisible(), '总览 Tab 下 集群关联账号 可见');

    // 底栏「裁决处理」入口
    const adjudicateBtn = drawer.locator('.btn-adjudicate-entry');
    assert.ok(await adjudicateBtn.isVisible(), '总览 Tab 下底栏必须显示「裁决处理」按钮');

    await page.screenshot({ path: 'tests/verify_desktop_tab1_overview.png', fullPage: false });
    console.log('  📸 已保存: tests/verify_desktop_tab1_overview.png');

    // =========================================================================
    // 2. 桌面调查首屏 (Tab 2 顶部)
    // =========================================================================
    console.log('\n[覆盖 2] 验证并捕获：桌面调查首屏...');
    await tabItems.nth(1).click(); // 切换到调查
    await page.waitForTimeout(300);

    assert.ok(await drawer.locator('#chapter-timeline').isVisible(), '调查 Tab 下 时间线 可见');
    assert.ok(await drawer.locator('#chapter-judgment-path').isVisible(), '调查 Tab 下 研判路径 可见');

    // 验证单列时间线结构无空泳道
    const singleStream = drawer.locator('#chapter-timeline .single-timeline-stream');
    assert.strictEqual(await singleStream.count(), 1, '必须是 .single-timeline-stream 单列流');
    assert.strictEqual(await drawer.locator('#chapter-timeline .swimlane-placeholder').count(), 0, '零空白占位');
    const eventCount = await singleStream.locator('.timeline-event-item').count();
    assert.ok(eventCount >= 4, '时间线连续流 >= 4 个事件');

    await page.screenshot({ path: 'tests/verify_desktop_tab2_investigation_top.png', fullPage: false });
    console.log('  📸 已保存: tests/verify_desktop_tab2_investigation_top.png');

    // =========================================================================
    // 3. 桌面调查滚动到底部 (Tab 2 底部：多维风险画像与指标)
    // =========================================================================
    console.log('\n[覆盖 3] 验证并捕获：桌面调查滚动到底部...');
    const riskCard = drawer.locator('#chapter-risk');
    await riskCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    assert.ok(await riskCard.isVisible(), '多维风险画像完整可见');
    const scoreVal = (await riskCard.locator('.composite-score-square .score-number').textContent()).trim();
    console.log('  - 综合风险分数值:', scoreVal);
    assert.strictEqual(scoreVal, '88', '风险分准确显示 88');

    await page.screenshot({ path: 'tests/verify_desktop_tab2_investigation_bottom.png', fullPage: false });
    console.log('  📸 已保存: tests/verify_desktop_tab2_investigation_bottom.png');

    // =========================================================================
    // 4. 桌面证据 (Tab 3: 证据链与相似案例)
    // =========================================================================
    console.log('\n[覆盖 4] 验证并捕获：桌面证据...');
    await tabItems.nth(2).click(); // 切换到证据
    await page.waitForTimeout(300);

    assert.ok(await drawer.locator('#chapter-chain').isVisible(), '证据链溯源可见');
    assert.ok(await drawer.locator('#chapter-similar').isVisible(), '相似案例处置参照可见');

    const chainCount = await drawer.locator('#chapter-chain .chain-card-row').count();
    console.log(`  - 证据链条数: ${chainCount}`);
    assert.strictEqual(chainCount, 4, 'EV-01 ~ EV-04 链条完整');

    await page.screenshot({ path: 'tests/verify_desktop_tab3_evidence.png', fullPage: false });
    console.log('  📸 已保存: tests/verify_desktop_tab3_evidence.png');

    // =========================================================================
    // 5. 桌面裁决 (Tab 4: 裁决工作台)
    // =========================================================================
    console.log('\n[覆盖 5] 验证并捕获：桌面裁决...');
    // 点击底栏「裁决处理」直达 Tab 4
    await adjudicateBtn.click();
    await page.waitForTimeout(300);

    assert.ok((await tabItems.nth(3).getAttribute('class')).includes('is-active'), '直达裁决 Tab 激活');
    assert.ok(await drawer.locator('#chapter-decision').isVisible(), '裁决工作台可见');
    assert.ok(!(await adjudicateBtn.isVisible()), '裁决 Tab 下底栏隐藏重复的「裁决处理」');

    // 录入裁决草稿用于测试跨 Tab 保持与案件隔离
    const notesTextarea = drawer.locator('#chapter-decision .decision-textarea textarea');
    await notesTextarea.fill('【CASE-1-DRAFT】风控协同复核通过，建议维持封禁。');

    await page.screenshot({ path: 'tests/verify_desktop_tab4_decision.png', fullPage: false });
    console.log('  📸 已保存: tests/verify_desktop_tab4_decision.png');

    // 跨 Tab 切回总览再切回裁决，断言草稿未丢
    await tabItems.first().click();
    await page.waitForTimeout(200);
    await tabItems.nth(3).click();
    await page.waitForTimeout(200);
    assert.strictEqual(
      await notesTextarea.inputValue(),
      '【CASE-1-DRAFT】风控协同复核通过，建议维持封禁。',
      '同案件跨 Tab 切换绝不丢失批注草稿'
    );
    console.log('  ✓ 同案件跨 Tab 批注草稿状态完美保留');

    // =========================================================================
    // 6. 390px 手机总览首屏
    // =========================================================================
    console.log('\n[覆盖 6] 验证并捕获：390px 手机总览首屏...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);

    // 切换至 Tab 1 (总览)
    await tabItems.first().click();
    await page.waitForTimeout(300);

    const drawerBox = await drawer.boundingBox();
    console.log(`  - 390px 视口下抽屉宽度: ${drawerBox.width}px`);
    assert.ok(drawerBox.width <= 390, '手机端抽屉宽度不超过视口宽度');

    const overflowMobileTab1 = await drawer.evaluate((el) => {
      const b = el.querySelector('.drawer-scroll-body');
      return b ? b.scrollWidth > b.clientWidth + 2 : false;
    });
    assert.strictEqual(overflowMobileTab1, false, '手机端总览正文零横向溢出');

    await page.screenshot({ path: 'tests/verify_mobile_390_tab1_overview.png', fullPage: false });
    console.log('  📸 已保存: tests/verify_mobile_390_tab1_overview.png');

    // =========================================================================
    // 7. 390px 手机裁决首屏
    // =========================================================================
    console.log('\n[覆盖 7] 验证并捕获：390px 手机裁决首屏...');
    // 点击底栏裁决处理直达
    await drawer.locator('.btn-adjudicate-entry').click();
    await page.waitForTimeout(300);

    const overflowMobileTab4 = await drawer.evaluate((el) => {
      const b = el.querySelector('.drawer-scroll-body');
      return b ? b.scrollWidth > b.clientWidth + 2 : false;
    });
    assert.strictEqual(overflowMobileTab4, false, '手机端裁决工作台零横向溢出');

    await page.screenshot({ path: 'tests/verify_mobile_390_tab4_decision.png', fullPage: false });
    console.log('  📸 已保存: tests/verify_mobile_390_tab4_decision.png');

    // 恢复桌面视口
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);

    // =========================================================================
    // 8. 已有主题与案件变体代表状态
    // =========================================================================
    console.log('\n[覆盖 8.1] 验证并捕获：暗色模式 (Dark Mode)...');
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(400);

    // 调查页暗色模式
    await tabItems.nth(1).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'tests/verify_desktop_dark_mode_investigation.png', fullPage: false });
    console.log('  📸 已保存: tests/verify_desktop_dark_mode_investigation.png');

    // 切回浅色模式
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.waitForTimeout(200);

    // 验证案件隔离：关闭当前案件 1，打开案件 3 (风控预警)
    console.log('\n[覆盖 8.2] 验证案件隔离：关闭案件 1，打开案件 3...');
    await drawer.locator('.drawer-close-btn').click();
    await page.waitForTimeout(500);

    const detailBtn3 = page.locator('.action-detail-btn').nth(2);
    await detailBtn3.click();
    await drawer.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(400);

    // 案件 3 默认进入总览
    assert.ok((await tabItems.first().getAttribute('class')).includes('is-active'), '新案件默认进入「总览」');
    // 切到裁决 Tab，断言案件 1 的草稿绝对不存在
    await tabItems.nth(3).click();
    await page.waitForTimeout(300);
    const case3Note = await notesTextarea.inputValue();
    console.log('  - 案件 3 读取到的批注草稿:', JSON.stringify(case3Note));
    assert.strictEqual(case3Note, '', '切换新案件绝对不继承上一案件批注');
    console.log('  ✓ 案件批注隔离测试通过 (零串案残留)');

    // 验证变体 2 (申诉复核)
    console.log('\n[覆盖 8.3] 验证并捕获：变体 2 (申诉复核档案)...');
    await drawer.locator('.drawer-close-btn').click();
    await page.waitForTimeout(500);

    const detailBtn2 = page.locator('.action-detail-btn').nth(1);
    await detailBtn2.click();
    await drawer.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(400);

    const title2 = (await drawer.locator('.drawer-title').textContent()).trim();
    assert.strictEqual(title2, '申诉复核档案', '变体 2 标题为「申诉复核档案」');
    assert.strictEqual(await drawer.locator('#chapter-cluster').count(), 0, '变体 2 绝对不展示集群关联账号');

    // 申诉复核自带默认复核通过批注
    await tabItems.nth(3).click();
    await page.waitForTimeout(300);
    const appealNote = await notesTextarea.inputValue();
    console.log('  - 申诉复核默认批注:', appealNote);
    assert.ok(appealNote.includes('解封') || appealNote.includes('放行') || appealNote.includes('复核'), '申诉复核具有专属默认预设批注');

    await page.screenshot({ path: 'tests/verify_desktop_variant2_appeal.png', fullPage: false });
    console.log('  📸 已保存: tests/verify_desktop_variant2_appeal.png');

    // 验证变体 4 (处置台账)
    console.log('\n[覆盖 8.4] 验证并捕获：变体 4 (处置台账档案)...');
    await drawer.locator('.drawer-close-btn').click();
    await page.waitForTimeout(500);

    const detailBtn4 = page.locator('.action-detail-btn').nth(3);
    await detailBtn4.click();
    await drawer.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(400);

    const title4 = (await drawer.locator('.drawer-title').textContent()).trim();
    assert.strictEqual(title4, '处置台账档案', '变体 4 标题为「处置台账档案」');

    // 变体 4 Tab 4 为「台账」
    const ledgerTab = tabItems.nth(3);
    assert.ok((await ledgerTab.textContent()).includes('台账'), 'Tab 4 为「台账」');
    assert.strictEqual(await drawer.locator('.btn-adjudicate-entry').count(), 0, '只读台账底栏无「裁决处理」');

    await ledgerTab.click();
    await page.waitForTimeout(300);
    assert.ok(await drawer.locator('#chapter-ledger').isVisible(), '只读合规存证横幅可见');
    assert.strictEqual(await drawer.locator('#chapter-decision').count(), 0, '只读台账无裁决工作台');

    await page.screenshot({ path: 'tests/verify_desktop_variant4_record_ledger.png', fullPage: false });
    console.log('  📸 已保存: tests/verify_desktop_variant4_record_ledger.png');

    // =========================================================================
    // 9. 可访问性、键盘焦点与 Esc 关闭行为未退化验证
    // =========================================================================
    console.log('\n[覆盖 9] 验证可访问性与 Esc 键关闭抽屉行为...');
    // 抽屉当前处于打开状态
    assert.ok(await drawer.isVisible(), '抽屉当前处于打开就绪状态');

    // 验证 aria-modal 和 role
    const roleAttr = await drawer.getAttribute('role');
    const ariaModalAttr = await drawer.getAttribute('aria-modal');
    assert.strictEqual(roleAttr, 'dialog', '抽屉必须具备 role="dialog" 可访问语义');
    assert.strictEqual(ariaModalAttr, 'true', '抽屉必须具备 aria-modal="true"');

    // 测试按下 ESC 键抽屉正常关闭
    console.log('  - 测试按下 ESC 键抽屉关闭...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    assert.ok(!(await drawer.isVisible()), '按下 ESC 键后抽屉必须平滑关闭，无焦点陷阱与行为退化');
    console.log('  ✓ ESC 快捷关闭与可访问性完全正常');

    console.log('\n====================================================================');
    console.log('🎉 全部 9 大模块、10 处视觉状态与全量断言 100% 成功通过！');
    console.log('====================================================================\n');

  } finally {
    await browser.close();
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ 验证执行失败:', err);
  process.exit(1);
});
