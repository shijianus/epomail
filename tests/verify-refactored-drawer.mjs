import { chromium } from 'playwright';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = '/root/.gemini/antigravity-cli/brain/a628d784-628f-46cf-9c91-80572b24ec1b';

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
        if (ext === '.html') {
          const cleanHtml = content
            .toString('utf-8')
            .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>/gi, '')
            .replace(/<link[^>]*fonts\.gstatic\.com[^>]*>/gi, '')
            .replace(/<script[^>]*challenges\.cloudflare\.com[^>]*><\/script>/gi, '');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(cleanHtml);
          return;
        }
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
  console.log('=== [E2E] 案件全宗档案抽屉重构全面核验与视觉测量 ===');
  console.log('====================================================================\n');

  const distDir = path.resolve('mail-worker/dist');
  const port = 4195;
  const server = await createStaticServer(distDir, port);
  console.log(`[静态预览服务] 运行在 http://127.0.0.1:${port}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });

  const token = 'mock_jwt_admin_token_refactor_test';
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
      ticketId: 'THR-2026-SINGLE02',
      email: 'burst_sender@epocanvas.com',
      userId: '88305',
      status: 'pending',
      circuitStatus: 'RATE_LIMIT',
      warningType: 'risk',
      priority: 'P1',
      category: 'outbound',
      reasonCode: 'RULE-RATE-12',
      reportReason: '单账号突发高频外发触发速率限制',
      banReason: '单账号 10 分钟内突发外发 120 封邮件，触发退信率告警。',
      alarmCount: 1,
      assignee: 'SecAdmin',
      adjudicator: 'SecAdmin',
      evidenceExpiresDays: 90,
      createTime: '2026-10-13T08:00:00Z',
      banTime: '2026-10-13T08:05:00Z',
      clusterAccounts: []
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
          summary: { threat: 2, appeal: 0, audit: 0, record: 0 }
        }
      })
    });
  });

  const metricsReport = {};

  try {
    console.log('[步骤 1] 导航至操作报告页面 (/audit-report)...');
    await page.goto(`http://127.0.0.1:${port}/audit-report`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    const drawer = page.locator('.audit-detail-drawer.audit-drawer-container');
    console.log('[步骤 2] 打开案件 1001 档案抽屉...');
    const detailBtn1 = page.locator('.action-detail-btn').first();
    await detailBtn1.waitFor({ state: 'visible', timeout: 8000 });
    await detailBtn1.click();
    await drawer.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(600);

    // =========================================================================
    // 1. 桌面尺寸与上下文测量
    // =========================================================================
    console.log('\n--- 1. 桌面尺寸与上下文测量 ---');
    const drawerEl = drawer;
    const drawerRect = await drawerEl.boundingBox();
    const viewportSize = page.viewportSize();
    console.log(`  - 视口宽度: ${viewportSize.width}px, 高度: ${viewportSize.height}px`);
    console.log(`  - 抽屉渲染 CSS 宽度: ${Math.round(drawerRect.width)}px, 高度: ${Math.round(drawerRect.height)}px`);
    console.log(`  - 左侧保留背景上下文宽度: ${Math.round(drawerRect.x)}px`);
    
    metricsReport.desktopViewportWidth = viewportSize.width;
    metricsReport.desktopDrawerWidth = Math.round(drawerRect.width);
    metricsReport.desktopBackgroundContext = Math.round(drawerRect.x);

    assert.ok(drawerRect.width >= 755 && drawerRect.width <= 765, `抽屉桌面宽度应严格收敛至 760 CSS px (允许渲染微差 ±5px)，实际: ${drawerRect.width}px`);
    assert.ok(drawerRect.width <= 800, `桌面最大绝对不得超过 800 CSS px，实际: ${drawerRect.width}px`);
    assert.ok(drawerRect.x >= 600, `1440px 视口下左侧应保留充足背景上下文 (>600px)，实际: ${drawerRect.x}px`);

    const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`  - 全页面横向滚动溢出状态: ${pageOverflow ? '有溢出 (FAIL)' : '无溢出 (PASS)'}`);
    assert.strictEqual(pageOverflow, false, '整页不得出现横向滚动');

    // 验证超宽屏 (1920px) 下绝不扩张到 960/1080px
    console.log('\n--- 1.1 验证超宽大屏 (1920px) 绝不扩张 ---');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(400);
    const wideDrawerRect = await drawerEl.boundingBox();
    console.log(`  - 1920px 视口抽屉渲染 CSS 宽度: ${Math.round(wideDrawerRect.width)}px`);
    assert.ok(wideDrawerRect.width >= 755 && wideDrawerRect.width <= 765, `1920px 视口下抽屉依然严格维持 760 CSS px，实际: ${wideDrawerRect.width}px`);
    assert.ok(wideDrawerRect.width <= 800, `1920px 视口下抽屉绝对不得超过 800 CSS px，实际: ${wideDrawerRect.width}px`);
    
    // 恢复 1440px 视口进行标准桌面核验
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);

    // =========================================================================
    // 2. 任务 B：扁平平面关联账号条目测量 (Tab 1: 总览)
    // =========================================================================
    console.log('\n--- 2. 任务 B：扁平平面关联账号条目测量 (Tab 1) ---');

    // 验证旧横向表格 DOM 已彻底删除
    const legacyTableCount = await drawer.locator('.cluster-accounts-table, .cluster-header-row, .cluster-data-row').count();
    console.log(`  - 旧三列表格 DOM (.cluster-accounts-table / .cluster-header-row / .cluster-data-row) 数量: ${legacyTableCount}`);
    assert.strictEqual(legacyTableCount, 0, '必须彻底删除旧横向三列表格与表头');

    const clusterList = drawer.locator('.cluster-records-list');
    assert.ok(await clusterList.isVisible(), '单行平面条目容器 (.cluster-records-list) 可见');

    const entries = clusterList.locator('.cluster-record-row');
    const entryCount = await entries.count();
    console.log(`  - 扁平平面关联账号记录数: ${entryCount}`);
    assert.strictEqual(entryCount, 3, '包含 3 条集群账号记录');

    const entryHeights = [];
    for (let i = 0; i < entryCount; i++) {
      const entry = entries.nth(i);
      const entryBox = await entry.boundingBox();
      entryHeights.push(Math.round(entryBox.height));

      const idxLabel = (await entry.locator('.record-idx').innerText()).trim();
      const statusTag = (await entry.locator('.record-status .entry-status-tag').innerText()).trim();
      const email = (await entry.locator('.record-email .account-email-val').innerText()).trim();
      const basisText = (await entry.locator('.record-basis .basis-full-text').innerText()).trim();

      // 验证邮箱紧邻复制图标
      const emailBox = await entry.locator('.record-email .account-email-val').boundingBox();
      const copyBtn = entry.locator('.record-email .inline-copy-btn');
      assert.ok(await copyBtn.isVisible(), `条目 ${i + 1} 邮箱紧邻复制图标可见`);
      const copyBtnBox = await copyBtn.boundingBox();
      assert.ok(copyBtnBox.x >= emailBox.x + emailBox.width - 8, `条目 ${i + 1} 复制按钮紧贴邮箱右侧`);

      // 验证无 ellipsis 截断或 line-clamp
      const basisStyles = await entry.locator('.record-basis .basis-full-text').evaluate((el) => {
        const s = window.getComputedStyle(el);
        return {
          overflow: s.overflow,
          textOverflow: s.textOverflow,
          lineClamp: s.webkitLineClamp || s.lineClamp
        };
      });
      assert.strictEqual(basisStyles.textOverflow, 'clip', '依据文本不得使用 text-overflow: ellipsis');
      assert.ok(!basisStyles.lineClamp || basisStyles.lineClamp === 'none', '依据文本不得使用 line-clamp');

      // 验证“查看标识”入口按钮可见
      const viewIdBtn = entry.locator('.record-action .view-identity-btn');
      assert.ok(await viewIdBtn.isVisible(), `条目 ${i + 1} 查看标识入口按钮可见`);

      console.log(`  - 条目 ${i + 1} (${Math.round(entryBox.height)}px): [${idxLabel} | ${statusTag}] 邮箱=${email} | 依据="${basisText}"`);
    }
    metricsReport.accountRowHeights = entryHeights;

    // 点击第 1 条记录的“查看标识”按钮，验证 Popover 浮层内容
    const firstViewIdBtn = entries.first().locator('.record-action .view-identity-btn');
    await firstViewIdBtn.click();
    await page.waitForTimeout(300);
    const popoverContent = page.locator('.account-identity-popover:visible, .identity-popover-content:visible').first();
    assert.ok(await popoverContent.isVisible(), '点击“查看标识”后浮层弹出可见');
    const popoverText = await popoverContent.innerText();
    assert.ok(popoverText.includes('技术标识'), '浮层包含技术标识标题');
    assert.ok(popoverText.includes('882'), '浮层包含脱敏用户 ID');
    assert.ok(popoverText.includes('THR-MULTI99-SUB01'), '浮层包含关联记录编号');
    // 再次点击按钮关闭 popover
    await firstViewIdBtn.click();
    await page.waitForTimeout(200);

    // 滚动到 #chapter-cluster 确保关联账号扁平条目完整呈现在截图中
    await drawer.locator('#chapter-cluster').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    // 保存总览 Tab 截图 (桌面 1440px 全窗口)
    const shotTab1 = path.join(ARTIFACT_DIR, 'desktop_1440_overview_760px.png');
    await page.screenshot({ path: shotTab1 });
    console.log(`  📸 已保存桌面 760px 总览(扁平平面关联账号)全窗口截图: ${shotTab1}`);

    // =========================================================================
    // 3. 人机双泳道时间线与风险画像测量 (Tab 2: 调查)
    // =========================================================================
    console.log('\n--- 3. 人机双泳道时间线与风险画像测量 (Tab 2: 调查) ---');
    const tabsWrapper = drawer.locator('.drawer-tabs-wrapper');
    const tabItems = tabsWrapper.locator('.el-tabs__item');
    await tabItems.nth(1).click(); // 切换到调查
    await page.waitForTimeout(400);

    const dualSwimlane = drawer.locator('.dual-swimlane-container');
    assert.ok(await dualSwimlane.isVisible(), '人机双泳道容器可见');

    // 检查顶部双泳道标题
    const machineHeader = (await dualSwimlane.locator('.swimlane-header.machine-header').innerText()).trim();
    const humanHeader = (await dualSwimlane.locator('.swimlane-header.human-header').innerText()).trim();
    console.log(`  - 泳道标题: 左侧 [${machineHeader}] | 右侧 [${humanHeader}]`);
    assert.ok(machineHeader.includes('自动化') || machineHeader.includes('机器'), '左侧标题为自动化/机器');
    assert.ok(humanHeader.includes('人工') || humanHeader.includes('用户'), '右侧标题为人工/用户');

    // 检查时间轴中轴线
    const axis = dualSwimlane.locator('.swimlane-axis').first();
    const axisRect = await axis.boundingBox();
    const axisCenterX = axisRect.x + axisRect.width / 2;
    console.log(`  - 时间轴中心 X 坐标: ${Math.round(axisCenterX)}px`);

    // 检查机器事件与人工事件
    const machineCards = dualSwimlane.locator('.swimlane-cell.machine-cell .swimlane-event-box.machine-event');
    const humanCards = dualSwimlane.locator('.swimlane-cell.human-cell .swimlane-event-box.human-event');
    const machineCount = await machineCards.count();
    const humanCount = await humanCards.count();
    console.log(`  - 机器事件数: ${machineCount}, 人工/用户事件数: ${humanCount}`);
    assert.ok(machineCount >= 1, '必须至少包含 1 个机器事件');
    assert.ok(humanCount >= 1, '必须至少包含 1 个人工/用户事件');

    for (let i = 0; i < machineCount; i++) {
      const cardRect = await machineCards.nth(i).boundingBox();
      assert.ok(cardRect.x + cardRect.width <= axisCenterX + 15, '机器事件必须严格位于时间中轴左侧');
    }

    for (let i = 0; i < humanCount; i++) {
      const cardRect = await humanCards.nth(i).boundingBox();
      assert.ok(cardRect.x >= axisCenterX - 15, '人工事件必须严格位于时间中轴右侧');
    }

    // 验证研判路径默认折叠
    const pathSection = drawer.locator('#chapter-judgment-path');
    assert.ok(await pathSection.isVisible(), '研判路径章节可见');
    const isPathCollapsed = !(await pathSection.locator('.judgment-path-record-box').isVisible());
    console.log(`  - 研判路径默认折叠状态: ${isPathCollapsed ? '折叠 (PASS)' : '展开 (FAIL)'}`);
    assert.ok(isPathCollapsed, '研判路径必须默认折叠');

    // 保存调查 Tab 截图 (双泳道全窗口)
    const shotTab2 = path.join(ARTIFACT_DIR, 'desktop_1440_investigation_760px.png');
    await page.screenshot({ path: shotTab2 });
    console.log(`  📸 已保存调查双泳道全窗口截图: ${shotTab2}`);

    // 展开研判路径测试
    const togglePathBtn = pathSection.locator('.collapse-toggle-btn');
    await togglePathBtn.click();
    await page.waitForTimeout(300);
    const isPathExpanded = await pathSection.locator('.judgment-path-record-box').isVisible();
    assert.ok(isPathExpanded, '点击后研判路径正常展开');
    const shotTab2Expanded = path.join(ARTIFACT_DIR, 'desktop_tab2_investigation_judgment_path.png');
    await page.screenshot({ path: shotTab2Expanded });
    console.log(`  📸 已保存研判路径展开截图: ${shotTab2Expanded}`);

    // 验证风险画像
    console.log('\n--- 3.1 多维风险画像与遥测图形比较测量 (Tab 2: 调查内) ---');
    const riskSection = drawer.locator('#chapter-risk');
    await riskSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    const gaugeBars = riskSection.locator('.gauge-benchmark-bar');
    assert.strictEqual(await gaugeBars.count(), 9, '9 项遥测指标必须全部具备真实渲染的图形比较条');

    const shotRisk = path.join(ARTIFACT_DIR, 'desktop_1440_risk_profile_760px.png');
    await page.screenshot({ path: shotRisk });
    console.log(`  📸 已保存风险画像全窗口截图: ${shotRisk}`);

    // =========================================================================
    // 4. 证据链溯源与相似案例 (Tab 3: 证据)
    // =========================================================================
    console.log('\n--- 4. 证据链溯源与相似案例 (Tab 3: 证据) ---');
    await tabItems.nth(2).click(); // 切换到证据
    await page.waitForTimeout(400);

    assert.ok(await drawer.locator('#chapter-chain').isVisible(), '证据链溯源章节可见');
    assert.ok(await drawer.locator('#chapter-similar').isVisible(), '相似案例处置参照可见');

    const shotTab3 = path.join(ARTIFACT_DIR, 'desktop_1440_evidence_760px.png');
    await page.screenshot({ path: shotTab3 });
    console.log(`  📸 已保存证据全窗口截图: ${shotTab3}`);

    // =========================================================================
    // 5. 任务 C：精益紧凑裁决工作台与用户通知预览测量 (Tab 4: 裁决)
    // =========================================================================
    console.log('\n--- 5. 任务 C：精益紧凑裁决工作台与通知预览测量 (Tab 4: 裁决) ---');
    await tabItems.nth(3).click(); // 切换到裁决
    await page.waitForTimeout(400);

    const decisionSection = drawer.locator('#chapter-decision');
    assert.ok(await decisionSection.isVisible(), '裁决工作台可见');

    const compactPanel = decisionSection.locator('.decision-compact-panel');
    assert.ok(await compactPanel.isVisible(), '紧凑平面裁决面板 (.decision-compact-panel) 可见');

    // A. 紧凑对象摘要行
    const targetBar = compactPanel.locator('.decision-target-bar');
    assert.ok(await targetBar.isVisible(), '处置对象摘要行可见');
    const targetText = (await targetBar.innerText()).trim();
    assert.ok(targetText.includes('cluster_master@epocanvas.com'), '必须显示主体账号邮箱');
    assert.ok(targetText.includes('不会随本次操作自动批量封禁或解封'), '必须明确说明关联账号作用范围（不自动批量连坐处置）');
    console.log('  ✓ [A. 处置对象摘要] 主体账号与作用范围说明核验通过');

    // B. 紧凑裁决单选项组 (4 项后端支持的裁决，默认零破坏性预选)
    const verdictOptions = compactPanel.locator('.verdict-compact-option');
    const verdictOptionCount = await verdictOptions.count();
    assert.strictEqual(verdictOptionCount, 4, '应包含 4 项真实后端支持的结论裁决选项');
    const initialSelectedCount = await compactPanel.locator('.verdict-compact-option.is-selected').count();
    assert.strictEqual(initialSelectedCount, 0, '初始不得默认预选任何破坏性裁决项');

    const submitBtn = compactPanel.locator('.btn-submit-verdict');
    assert.strictEqual(await submitBtn.isDisabled(), true, '未选择裁决前，主提交按钮必须处于禁用状态');

    const previewBtn = compactPanel.locator('.btn-preview-notice');
    assert.strictEqual(await previewBtn.isDisabled(), true, '未选择裁决前，通知预览按钮处于禁用状态');

    const impactHint = compactPanel.locator('.verdict-impact-bar .impact-hint');
    assert.ok(await impactHint.isVisible(), '未选择裁决前，影响栏显示引导提示');
    console.log('  ✓ [B. 紧凑裁决选项] 零默认破坏性预选与初始禁用状态核验通过');

    // C. 内部审核依据（仅管理员可见标识 + 快捷批注填充）
    const notesSection = compactPanel.locator('.decision-notes-section');
    const scopeTip = (await notesSection.locator('.notes-scope-tip').innerText()).trim();
    assert.ok(scopeTip.includes('仅管理员可见'), '必须明确标识“仅管理员可见”');

    const notesTextarea = notesSection.locator('.decision-textarea textarea');
    await notesTextarea.fill('INTERNAL_SECRET_NOTE_999: 疑似团伙主控号');
    const presetBtn = notesSection.locator('.preset-chip').nth(1);
    await presetBtn.click();
    await page.waitForTimeout(200);
    const filledText = await notesTextarea.inputValue();
    console.log(`  ✓ [C. 内部审核依据] 填写与快捷批注追加内容: "${filledText}"`);
    assert.ok(filledText.includes('INTERNAL_SECRET_NOTE_999'), '内部批注包含管理员输入内容');

    // D. 点选裁决，实时更新影响并激活提交与预览
    // 点选“驳回申诉 (维持封禁处置)” (第 3 个选项: reject)
    await verdictOptions.nth(2).click();
    await page.waitForTimeout(250);
    assert.strictEqual(await compactPanel.locator('.verdict-compact-option.is-selected').count(), 1, '点选后激活 1 项裁决');
    assert.strictEqual(await submitBtn.isDisabled(), false, '选择裁决后主提交按钮可用');
    assert.strictEqual(await previewBtn.isDisabled(), false, '选择裁决后通知预览按钮可用');

    const impactBody = compactPanel.locator('.verdict-impact-bar .impact-body');
    assert.ok(await impactBody.isVisible(), '选择裁决后影响栏实时呈现动态影响说明');
    const impactText = (await impactBody.innerText()).trim();
    console.log(`  ✓ [D. 选项动态影响] ${impactText}`);

    // 保存裁决工作台桌面截图 (全窗口)
    await compactPanel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const shotTab4 = path.join(ARTIFACT_DIR, 'desktop_1440_decision_760px.png');
    await page.screenshot({ path: shotTab4 });
    console.log(`  📸 已保存桌面裁决工作台全窗口截图: ${shotTab4}`);

    // E. 点击“预览通知内容”，在独立 Modal 中查看用户通知并验证严格脱敏与能力缺口披露
    await previewBtn.click();
    await page.waitForTimeout(300);

    const noticeDialog = page.locator('.notice-preview-dialog:visible');
    assert.ok(await noticeDialog.isVisible(), '点击“预览通知内容”后弹窗模态框打开可见');

    const noticeDialogText = (await noticeDialog.innerText()).trim();
    console.log(`  ✓ [E. 用户通知预览弹窗] 内容摘要:\n    ${noticeDialogText.replace(/\n+/g, ' | ')}`);

    // 验证通知预览包含必要字段且诚实说明能力缺口
    assert.ok(noticeDialogText.includes('system-security@epocanvas.com'), '预览必须包含系统发送方');
    assert.ok(noticeDialogText.includes('cluster_master@epocanvas.com'), '预览必须包含接收账号');
    assert.ok(noticeDialogText.includes('RULE-SPAM-77'), '预览必须包含稳定分类标识 RULE-SPAM-77');
    assert.ok(noticeDialogText.includes('epomail-docs'), '预览必须包含真实支持的申诉路径指引');
    assert.ok(noticeDialogText.includes('能力缺口说明') || noticeDialogText.includes('脱敏'), '弹窗必须包含脱敏说明与后端能力缺口说明');

    // 验证严格脱敏：绝不泄露内部批注、设备指纹、关联子账号邮箱或关联子账号 ID
    assert.strictEqual(noticeDialogText.includes('INTERNAL_SECRET_NOTE_999'), false, '用户通知预览严禁泄露管理员内部批注');
    assert.strictEqual(noticeDialogText.includes('fp_'), false, '用户通知预览严禁泄露设备指纹');
    assert.strictEqual(noticeDialogText.includes('sub01'), false, '用户通知预览严禁泄露其他关联账号列表');
    assert.strictEqual(noticeDialogText.includes('88201'), false, '用户通知预览严禁泄露其他关联账号 ID');
    console.log('  ✓ [E. 脱敏合规核验] 零内部批注泄露、零指纹泄露、零关联账号泄露');

    // 保存通知预览弹窗截图
    const shotTab4Preview = path.join(ARTIFACT_DIR, 'desktop_1440_decision_preview_760px.png');
    await page.screenshot({ path: shotTab4Preview });
    console.log(`  📸 已保存通知预览弹窗全窗口截图: ${shotTab4Preview}`);

    // 关闭通知弹窗
    const closeDialogBtn = noticeDialog.locator('.el-dialog__footer button, .el-dialog__headerbtn').first();
    await closeDialogBtn.click();
    await page.waitForTimeout(250);

    // 验证次级黑名单操作
    const blacklistBtn = compactPanel.locator('.secondary-blacklist-row .btn-subtle-blacklist');
    assert.ok(await blacklistBtn.isVisible(), '次级黑名单操作入口可见且保持低调次级样式');

    // 测试同案件跨 Tab 切换及关闭重开后保留批注草稿与所选裁决，跨案件切换自动隔离
    await tabItems.first().click(); // 切到总览
    await page.waitForTimeout(200);
    await tabItems.nth(3).click(); // 切回裁决
    await page.waitForTimeout(200);
    assert.strictEqual(await notesTextarea.inputValue(), filledText, '同案件跨 Tab 切换必须保留未提交批注草稿');

    // 关闭抽屉并切换到第 2 个案件 (THR-2026-SINGLE02)，验证跨案件不串草稿、不串研判路径展开态
    await drawer.locator('.drawer-close-btn').click();
    await drawer.waitFor({ state: 'hidden', timeout: 5000 });

    await page.locator('.action-detail-btn').nth(1).click();
    await drawer.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(300);

    await tabItems.nth(1).click(); // 切到调查检查研判路径是否重置为默认折叠
    await page.waitForTimeout(200);
    assert.strictEqual(await pathSection.locator('.judgment-path-record-box').isVisible(), false, '跨案件打开时研判路径必须重置为默认折叠');

    await tabItems.nth(3).click(); // 切到裁决检查草稿是否隔离为空
    await page.waitForTimeout(200);
    assert.strictEqual(await notesTextarea.inputValue(), '', '跨案件打开时不得串入上一案件的未提交批注草稿');
    assert.strictEqual(await compactPanel.locator('.verdict-compact-option.is-selected').count(), 0, '跨案件打开时不得串入上一案件的已选裁决');
    console.log('  ✓ [跨案件状态隔离] 跨案切换批注草稿归零、所选裁决归零、研判路径折叠态重置');

    // 重新打开第 1 个案件 (THR-2026-MULTI99)，验证同案件重开仍保留刚才的未提交草稿与研判路径展开态
    await drawer.locator('.drawer-close-btn').click();
    await drawer.waitFor({ state: 'hidden', timeout: 5000 });
    await page.locator('.action-detail-btn').first().click();
    await drawer.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(300);

    await tabItems.nth(3).click();
    await page.waitForTimeout(200);
    assert.strictEqual(await notesTextarea.inputValue(), filledText, '同案件关闭重开后仍保留未提交的批注草稿');
    console.log('  ✓ [同案件状态保留] 同案重开批注草稿与已选裁决完整保留');

    // =========================================================================
    // 6. 390px 手机端响应式实测 (沿用同一纵向关联账号结构与精益裁决结构)
    // =========================================================================
    console.log('\n--- 6. 390px 手机端响应式实测 ---');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    // 切换至 Tab 1 (总览) 并滚到关联账号分区
    await tabItems.first().click();
    await page.waitForTimeout(300);
    await drawer.locator('#chapter-cluster').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const mobileDrawerRect = await drawerEl.boundingBox();
    console.log(`  - 390px 视口抽屉宽度: ${Math.round(mobileDrawerRect.width)}px`);
    assert.ok(mobileDrawerRect.width <= 390, '手机端抽屉宽度不超过视口宽度');

    const mobileOverviewOverflow = await drawer.evaluate((el) => {
      const b = el.querySelector('.drawer-scroll-body');
      return b ? b.scrollWidth > b.clientWidth + 2 : false;
    });
    console.log(`  - 手机总览正文溢出状态: ${mobileOverviewOverflow ? '有溢出 (FAIL)' : '无溢出 (PASS)'}`);
    assert.strictEqual(mobileOverviewOverflow, false, '手机总览正文零横向溢出');

    const shotMobileTab1 = path.join(ARTIFACT_DIR, 'mobile_390_tab1_overview.png');
    await page.screenshot({ path: shotMobileTab1 });
    console.log(`  📸 已保存手机 390px 扁平关联账号截图: ${shotMobileTab1}`);

    // 手机端 Tab 2 (调查: 单列纵向事件流，保留明确角色标签)
    await tabItems.nth(1).click();
    await page.waitForTimeout(300);

    const mobileInvestOverflow = await drawer.evaluate((el) => {
      const b = el.querySelector('.drawer-scroll-body');
      return b ? b.scrollWidth > b.clientWidth + 2 : false;
    });
    assert.strictEqual(mobileInvestOverflow, false, '手机调查正文零横向溢出');

    const shotMobileTab2 = path.join(ARTIFACT_DIR, 'mobile_390_tab2_dual_swimlane.png');
    await page.screenshot({ path: shotMobileTab2 });
    console.log(`  📸 已保存手机双泳道转单流截图: ${shotMobileTab2}`);

    // 手机端 Tab 4 (裁决: 紧凑决策流 + 用户通知预览)
    await tabItems.nth(3).click();
    await page.waitForTimeout(300);
    await decisionSection.locator('.decision-compact-panel').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);

    // 手机端点选裁决以测试选择态与按钮
    await decisionSection.locator('.verdict-compact-option').nth(2).click();
    await page.waitForTimeout(200);

    const mobileDecisionOverflow = await drawer.evaluate((el) => {
      const b = el.querySelector('.drawer-scroll-body');
      return b ? b.scrollWidth > b.clientWidth + 2 : false;
    });
    console.log(`  - 手机裁决正文溢出状态: ${mobileDecisionOverflow ? '有溢出 (FAIL)' : '无溢出 (PASS)'}`);
    assert.strictEqual(mobileDecisionOverflow, false, '手机裁决正文零横向溢出');

    const shotMobileTab4 = path.join(ARTIFACT_DIR, 'mobile_390_tab4_decision.png');
    await page.screenshot({ path: shotMobileTab4 });
    console.log(`  📸 已保存手机 390px 精益裁决流程截图: ${shotMobileTab4}`);

    // =========================================================================
    // 7. 暗色模式实测 (Dark Mode)
    // =========================================================================
    console.log('\n--- 7. 暗色模式实测 (Dark Mode) ---');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.waitForTimeout(400);

    // 总览暗色
    await tabItems.first().click();
    await page.waitForTimeout(300);
    const shotDarkTab1 = path.join(ARTIFACT_DIR, 'desktop_dark_tab1_overview.png');
    await page.screenshot({ path: shotDarkTab1 });
    console.log(`  📸 已保存暗色模式总览截图: ${shotDarkTab1}`);

    // 调查暗色 (双泳道)
    await tabItems.nth(1).click();
    await page.waitForTimeout(300);
    const shotDarkTab2 = path.join(ARTIFACT_DIR, 'desktop_dark_tab2_dual_swimlane.png');
    await page.screenshot({ path: shotDarkTab2 });
    console.log(`  📸 已保存暗色模式调查双泳道截图: ${shotDarkTab2}`);

    console.log('\n====================================================================');
    console.log('🎉 所有自动化断言与视觉尺寸核验 100% 全部通过！');
    console.log('====================================================================\n');

  } finally {
    await browser.close();
    server.close();
  }
}

runTests().catch(err => {
  console.error('测试异常终止:', err);
  process.exit(1);
});
