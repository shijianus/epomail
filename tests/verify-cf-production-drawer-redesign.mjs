import { chromium } from 'playwright';
import assert from 'node:assert';

const BASE = 'https://mail.epocanvas.com';

async function run() {
  console.log('====================================================================');
  console.log('=== [Cloudflare 生产全真栈] 安全审计抽屉 4 变体重构真实公网核验 ===');
  console.log(`=== 目标生产基地址: ${BASE} ===`);
  console.log('====================================================================\n');

  let browser;

  try {
    // 1. 登录真实 Cloudflare 生产环境获取巡检 Token
    console.log('[步骤 1] 登录生产管理员账号 (admin@epomail.cyou)...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@epomail.cyou', password: '123456' })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, '公网生产登录接口必须返回 200');
    const token = loginJson.data?.token;
    assert.ok(token, '成功获取生产 JWT Token');
    console.log('  ✓ 生产 Token 获取成功:', token.slice(0, 24) + '...');

    // 2. 启动 Playwright 浏览器
    console.log('\n[步骤 2] 启动 Playwright 浏览器 (1440x900)...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    await context.addInitScript(({ t }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('loginEmail', 'admin@epomail.cyou');
      localStorage.setItem('role', 'admin');
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'admin@epomail.cyou' }]));
    }, { t: token });

    const page = await context.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') console.log('  [Console Error]', msg.text());
    });

    // 3. 打开生产 /audit-report 控制台
    console.log('\n[步骤 3] 访问生产控制台 https://mail.epocanvas.com/audit-report ...');
    await page.goto(`${BASE}/audit-report`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const kpiCount = await page.locator('.kpi-card').count();
    console.log(`  - 生产页面加载完成，4 大 KPI 卡片数: ${kpiCount}`);
    assert.ok(kpiCount >= 4, '4 大 KPI 卡片必须正常渲染');

    // =========================================================================
    // 验证 1: 变体 1「滥用威胁 · 案件全宗档案」
    // =========================================================================
    console.log('\n[步骤 4] 打开变体 1「滥用威胁」抽屉并执行全项核验...');
    // 点击第一张 KPI 卡片 (滥用威胁)
    await page.locator('.kpi-card.kpi-threat').click();
    await page.waitForTimeout(600);

    // 点击列表行或详情按钮展开抽屉
    const detailBtn1 = page.locator('.action-detail-btn, .clickable-ticket').first();
    if (await detailBtn1.count() > 0) {
      await detailBtn1.click();
    } else {
      await page.locator('.table-area tbody tr:first-child').click();
    }
    await page.waitForTimeout(1000);

    const drawer = page.locator('.audit-detail-drawer');
    await drawer.waitFor({ state: 'visible', timeout: 10000 });
    console.log('  ✓ 抽屉成功在 Cloudflare 生产环境滑出！');

    // 4.1 标题纯净化核验
    const titleText = (await drawer.locator('.drawer-title').textContent()).trim();
    console.log('  - 抽屉标题:', titleText);
    assert.strictEqual(titleText, '案件全宗档案', '标题必须纯净为「案件全宗档案」');

    const badgeMetaBarCount = await drawer.locator('.drawer-badge-meta-bar').count();
    const dropdownCount = await drawer.locator('.header-tools-right .el-dropdown').count();
    const variantTagCount = await drawer.locator('.variant-mode-tag').count();
    const subDescCount = await drawer.locator('.drawer-sub').count();
    assert.strictEqual(badgeMetaBarCount, 0, 'drawer-badge-meta-bar 必须彻底移除');
    assert.strictEqual(dropdownCount, 0, 'el-dropdown 必须彻底移除');
    assert.strictEqual(variantTagCount, 0, '可实际处理标签必须彻底移除');
    assert.strictEqual(subDescCount, 0, '冗余自述必须彻底移除');
    console.log('  ✓ 头部纯净度核验通过 (零冗余自述、零 dropdown、零 badge-meta-bar)');

    // 4.2 案件概要核验
    console.log('  - 验证案件概要...');
    const statusText = (await drawer.locator('#chapter-summary .grid-field:has(.field-k:has-text("当前状态")) .el-tag').first().textContent()).trim();
    console.log('    - 当前状态:', statusText);
    assert.ok(statusText === '待审' || statusText.includes('待审'), '当前状态必须为「待审」');

    const authText = (await drawer.locator('#chapter-summary .grid-field:has(.field-k:has-text("拍案管理")) .field-v').first().textContent()).trim();
    console.log('    - 拍案管理:', authText);
    assert.ok(authText.length > 0 && !authText.includes('拍案管理:'), '拍案管理必须直接展示名称');

    const retentionText = (await drawer.locator('#chapter-summary .grid-field:has(.field-k:has-text("证据留存")) .field-v').first().textContent()).trim();
    console.log('    - 证据留存:', retentionText);
    assert.ok(!retentionText.includes('WORM'), '证据留存绝不可含 WORM');
    assert.ok(retentionText.includes('天'), '证据留存保留天数显示正常');

    const caseNoLabel = (await drawer.locator('#chapter-summary .grid-field:first-child .field-k').first().textContent()).trim();
    console.log('    - 案件编号标签:', caseNoLabel);
    assert.ok(caseNoLabel.startsWith('案件编号') && !caseNoLabel.includes('审计对象'), '只保留「案件编号」');

    // 4.3 集群关联账号核验
    console.log('  - 验证集群关联账号...');
    const clusterCard = drawer.locator('#chapter-cluster');
    if (await clusterCard.count() > 0) {
      const clusterHelpIcon = await clusterCard.locator('.help-question-icon').count();
      assert.strictEqual(clusterHelpIcon, 1, '集群广播说明必须以 ? Tooltip 形式展示');
      const maskedCount = await clusterCard.locator('.data-tag-muted').count();
      assert.strictEqual(maskedCount, 0, '严禁显示脱敏聚合数据说明');
      console.log('    ✓ 集群说明 ? 悬浮与脱敏说明清理通过');
    }

    // 4.4 风险研判与处置依据核验
    console.log('  - 验证风险研判与处置依据...');
    const basisCard = drawer.locator('#chapter-basis');
    const prohibitedIcon = await basisCard.locator('.alarm-row .alarm-icon').count();
    assert.strictEqual(prohibitedIcon, 1, '报警原因必须使用禁止图标替代文本');
    const logsBox = await basisCard.locator('.judgment-path-record-box').count();
    assert.strictEqual(logsBox, 1, '必须存在专属研判路径记录框');
    console.log('    ✓ 禁止图标与研判路径记录框正常');

    // 4.5 左右双泳道时间线核验 (时间线居中唯一，两侧绝无多余时间线，结构化边框徽章无中括号)
    console.log('  - 验证处置与存证全周期时间线左右双泳道与居中唯一时间轴...');
    const timelineCard = drawer.locator('#chapter-timeline');
    const machineHeader = await timelineCard.locator('.machine-header').count();
    const humanHeader = await timelineCard.locator('.human-header').count();
    assert.strictEqual(machineHeader, 1, '必须具备机器自动泳道表头');
    assert.strictEqual(humanHeader, 1, '必须具备人工与用户泳道表头');

    const sideTrackLines = await timelineCard.locator('.swimlane-placeholder .track-line').count();
    assert.strictEqual(sideTrackLines, 0, '两侧占位单元格绝不可有附加时间线 (时间线居中唯一)');
    const centerAxisDots = await timelineCard.locator('.swimlane-axis .axis-dot').count();
    assert.ok(centerAxisDots >= 4, '居中唯一时间轴中必须具备节点圆点');

    const actorBoxText = await timelineCard.locator('.node-actor-box').first().textContent();
    assert.ok(!actorBoxText.includes('[') && !actorBoxText.includes(']'), '时间线角色标签必须是徽章边框，严禁直接输出原始方括号');
    console.log('    ✓ 左右双泳道表头、居中唯一时间轴及无括号徽章核验通过');

    // 4.6 多维风险画像核验 (正方体分数、2行式主驱动维度置于上方、100%全量指标带进度条)
    console.log('  - 验证多维风险画像...');
    const riskCard = drawer.locator('#chapter-risk');
    const squareBox = await riskCard.locator('.composite-score-square').count();
    assert.strictEqual(squareBox, 1, '风险分必须为正方形方格');
    const denomCount = await riskCard.locator('.composite-score-square .score-denom').count();
    assert.strictEqual(denomCount, 0, '绝对不可包含 /100 后缀');

    const driverBox = riskCard.locator('.risk-driver-2line-box');
    assert.strictEqual(await driverBox.count(), 1, '主驱动维度必须置于上方并采用2行结构');
    const driverPrefix = (await driverBox.locator('.driver-prefix-line').textContent()).trim();
    const driverVal = (await driverBox.locator('.driver-highlight-line').textContent()).trim();
    assert.ok(driverPrefix.includes('主驱动维度'), '第一行为主驱动维度前缀');
    assert.ok(driverVal.length > 0, '第二行为主驱动维度详情');

    // 1. 验证 risk-driver-2line-box 无方框包裹 (无 border / 无独立背景方框)
    const driverBoxStyles = await driverBox.evaluate(node => {
      const cs = window.getComputedStyle(node);
      return {
        borderWidth: cs.borderWidth,
        borderStyle: cs.borderStyle,
        backgroundColor: cs.backgroundColor
      };
    });
    console.log('    - risk-driver-2line-box 计算样式:', driverBoxStyles);
    assert.ok(driverBoxStyles.borderStyle === 'none' || driverBoxStyles.borderWidth === '0px', '主驱动维度绝不可带边框方框');
    assert.ok(driverBoxStyles.backgroundColor === 'rgba(0, 0, 0, 0)' || driverBoxStyles.backgroundColor === 'transparent', '主驱动维度必须透明背景，不可有灰底方框');

    // 2. 验证 3 栏并列布局与驱动位置居中 (score-square -> driver-2line-box -> dimensions-list)
    const topGridChildren = await riskCard.locator('.risk-top-grid > *').evaluateAll(nodes => nodes.map(n => n.className));
    console.log('    - risk-top-grid direct children:', topGridChildren);
    assert.ok(topGridChildren[0].includes('composite-score-square'), '第1栏必须为正方形综合分');
    assert.ok(topGridChildren[1].includes('risk-driver-2line-box'), '第2栏(居中)必须为主驱动维度');
    assert.ok(topGridChildren[2].includes('risk-dimensions-list'), '第3栏必须为多维进度列表');

    // 3. 验证 risk-dimensions-list 一行放 2 个 (2 列 2 行网格)
    const dimRows = riskCard.locator('.risk-dimensions-list .dimension-row');
    const dimCount = await dimRows.count();
    assert.strictEqual(dimCount, 4, '必须包含 4 个维度');
    const dimRects = await dimRows.evaluateAll(nodes => nodes.map(n => {
      const r = n.getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
    }));
    console.log('    - 4 个维度单元格位置:', dimRects);
    // 第一行 2 个 item 的 top 必须对齐 (误差 <= 2px)
    assert.ok(Math.abs(dimRects[0].top - dimRects[1].top) <= 2, '前两个维度项必须在同一行 (一行放2个)');
    // 第二行 2 个 item 的 top 必须对齐 (误差 <= 2px)
    assert.ok(Math.abs(dimRects[2].top - dimRects[3].top) <= 2, '后两个维度项必须在第二行 (一行放2个)');
    // 第一行与第二行必须错开
    assert.ok(dimRects[2].top > dimRects[0].top, '第二行必须位于第一行下方');

    // 验证维度名称未被省略截断
    const dimNames = await riskCard.locator('.risk-dimensions-list .dim-name').allTextContents();
    console.log('    - 4 个维度显示名称:', dimNames);
    for (const name of dimNames) {
      assert.ok(!name.includes('...') && !name.includes('…'), `维度名「${name}」不可被截断`);
    }

    // 4. 验证 composite-score-square、risk-driver-2line-box、risk-dimensions-list 完全对齐 (top, bottom, height 完美对齐)
    const alignmentBoxes = await riskCard.locator('.risk-top-grid > *').evaluateAll(nodes => nodes.map(n => {
      const r = n.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
    }));
    console.log('    - 3 栏对齐测量:', alignmentBoxes);
    assert.ok(Math.abs(alignmentBoxes[0].top - alignmentBoxes[1].top) <= 2, '综合分方格与主驱动顶部必须完全对齐');
    assert.ok(Math.abs(alignmentBoxes[0].top - alignmentBoxes[2].top) <= 2, '综合分方格与维度列表顶部必须完全对齐');
    assert.ok(Math.abs(alignmentBoxes[0].bottom - alignmentBoxes[1].bottom) <= 2, '综合分方格与主驱动底部必须完全对齐');
    assert.ok(Math.abs(alignmentBoxes[0].bottom - alignmentBoxes[2].bottom) <= 2, '综合分方格与维度列表底部必须完全对齐');
    assert.ok(Math.abs(alignmentBoxes[0].height - alignmentBoxes[2].height) <= 2, '3 栏高度必须完全对齐等高');

    const metricsCount = await riskCard.locator('.metric-card-row').count();
    const gaugeCount = await riskCard.locator('.gauge-bar-wrapper').count();
    const nonNumericCount = await riskCard.locator('.non-numeric-status').count();
    console.log(`    - 风险画像丰富指标数: ${metricsCount}, 进度条数: ${gaugeCount}, 无条数: ${nonNumericCount}`);
    assert.ok(metricsCount >= 6, '风险画像必须包含丰富指标');
    assert.strictEqual(metricsCount, gaugeCount, '100% 的指标必须全部具备进度条，严禁突兀缺失进度条');
    assert.strictEqual(nonNumericCount, 0, '严禁存在非数值无进度条的突兀分支');
    console.log('    ✓ 多维风险画像正方体、无框驱动、一行2个维度网格及3栏完全对齐核验通过');

    // 4.7 相似案例处置参照核验 (无中括号纯结构化徽章)
    console.log('  - 验证相似案例处置参照...');
    const similarCard = drawer.locator('#chapter-similar');
    const stackedBar = await similarCard.locator('.stacked-distribution-bar').count();
    assert.strictEqual(stackedBar, 1, '必须包含多色堆叠进度条');
    const statsCols = await similarCard.locator('.stat-col-box').count();
    assert.strictEqual(statsCols, 4, '必须包含 4 列案例统计');

    const reasonBoxText = (await similarCard.locator('.header-reason-box').textContent()).trim();
    assert.ok(!reasonBoxText.includes('[') && !reasonBoxText.includes(']'), '相似案例原因码绝不可含原始方括号');
    console.log('    ✓ 相似案例 4 色堆叠条、4 列统计与纯净原因码徽章通过');

    // 4.8 证据链溯源核验 (公式副标题彻底移除，代码徽章化)
    console.log('  - 验证证据链溯源...');
    const chainCard = drawer.locator('#chapter-chain');
    const chainFormulaCount = await chainCard.locator('.chain-formula-desc').count();
    assert.strictEqual(chainFormulaCount, 0, '指导性公式副标题（证据 → 规则 → 节点 → 依据）必须彻底移除');

    const chainItems = await chainCard.locator('.chain-card-row').count();
    console.log(`    - 证据链溯源卡片数: ${chainItems}`);
    assert.ok(chainItems >= 3, '证据链溯源卡片必须不少于 3 条');

    const evCodeText = (await chainCard.locator('.ev-code-box').first().textContent()).trim();
    assert.ok(!evCodeText.includes('[') && !evCodeText.includes(']'), '证据编号绝不可含原始方括号');
    console.log('    ✓ 证据链溯源无公式副标题、卡片数与无括号徽章核验通过');

    // 截图保存 V1 各板块
    await page.screenshot({ path: 'tests/prod_cf_redesign_v1_threat.png', fullPage: false });
    console.log('  📸 已保存生产截图: tests/prod_cf_redesign_v1_threat.png');

    await timelineCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'tests/prod_cf_redesign_v1_timeline.png', fullPage: false });
    console.log('  📸 已保存生产截图: tests/prod_cf_redesign_v1_timeline.png');

    await riskCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'tests/prod_cf_redesign_v1_risk.png', fullPage: false });
    console.log('  📸 已保存生产截图: tests/prod_cf_redesign_v1_risk.png');

    await similarCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'tests/prod_cf_redesign_v1_bottom.png', fullPage: false });
    console.log('  📸 已保存生产截图: tests/prod_cf_redesign_v1_bottom.png');

    // 关闭抽屉
    await drawer.locator('.drawer-close-btn').click();
    await page.waitForTimeout(600);

    // =========================================================================
    // 验证 2: 变体 2「申诉审计」差异化抽屉
    // =========================================================================
    console.log('\n[步骤 5] 切换至变体 2「申诉审计」核验差异化 UI...');
    await page.locator('.kpi-card.kpi-appeal').click();
    await page.waitForTimeout(600);

    const detailBtn2 = page.locator('.action-detail-btn, .clickable-ticket').first();
    if (await detailBtn2.count() > 0) {
      await detailBtn2.click();
    } else {
      await page.locator('.table-area tbody tr:first-child').click();
    }
    await page.waitForTimeout(1000);

    const title2 = (await drawer.locator('.drawer-title').textContent()).trim();
    console.log('  - 变体 2 标题:', title2);
    assert.strictEqual(title2, '申诉复核档案', '变体 2 标题必须为「申诉复核档案」');
    const clusterInV2 = await drawer.locator('#chapter-cluster').count();
    assert.strictEqual(clusterInV2, 0, '申诉复核档案绝不可包含集群关联账号卡片 (差异化隔离)');
    console.log('  ✓ 变体 2 差异化验证通过 (无集群卡片，申诉专属架构)');

    await page.screenshot({ path: 'tests/prod_cf_redesign_v2_appeal.png', fullPage: false });
    console.log('  📸 已保存生产截图: tests/prod_cf_redesign_v2_appeal.png');

    await drawer.locator('.drawer-close-btn').click();
    await page.waitForTimeout(600);

    // =========================================================================
    // 验证 3: 变体 3「风险管理」差异化抽屉
    // =========================================================================
    console.log('\n[步骤 6] 切换至变体 3「风险管理」核验差异化 UI...');
    await page.locator('.kpi-card.kpi-audit').click();
    await page.waitForTimeout(600);

    const detailBtn3 = page.locator('.action-detail-btn, .clickable-ticket').first();
    if (await detailBtn3.count() > 0) {
      await detailBtn3.click();
    } else {
      await page.locator('.table-area tbody tr:first-child').click();
    }
    await page.waitForTimeout(1000);

    const title3 = (await drawer.locator('.drawer-title').textContent()).trim();
    console.log('  - 变体 3 标题:', title3);
    assert.strictEqual(title3, '风控预警档案', '变体 3 标题必须为「风控预警档案」');
    console.log('  ✓ 变体 3 差异化验证通过');

    await page.screenshot({ path: 'tests/prod_cf_redesign_v3_audit.png', fullPage: false });
    console.log('  📸 已保存生产截图: tests/prod_cf_redesign_v3_audit.png');

    await drawer.locator('.drawer-close-btn').click();
    await page.waitForTimeout(600);

    // =========================================================================
    // 验证 4: 变体 4「操作记录」差异化抽屉 (纯只读)
    // =========================================================================
    console.log('\n[步骤 7] 切换至变体 4「操作记录」核验纯只读台账...');
    await page.locator('.kpi-card.kpi-record').click();
    await page.waitForTimeout(600);

    const detailBtn4 = page.locator('.action-detail-btn, .clickable-ticket').first();
    if (await detailBtn4.count() > 0) {
      await detailBtn4.click();
    } else {
      await page.locator('.table-area tbody tr:first-child').click();
    }
    await page.waitForTimeout(1000);

    const title4 = (await drawer.locator('.drawer-title').textContent()).trim();
    console.log('  - 变体 4 标题:', title4);
    assert.strictEqual(title4, '处置台账档案', '变体 4 标题必须为「处置台账档案」');
    
    // 验证只读台账横幅
    const ledgerBanner = await drawer.locator('.sanction-ledger-banner').count();
    assert.strictEqual(ledgerBanner, 1, '变体 4 必须展示只读合规台账横幅');
    console.log('  ✓ 变体 4 差异化验证通过 (不可篡改只读台账)');

    await page.screenshot({ path: 'tests/prod_cf_redesign_v4_record.png', fullPage: false });
    console.log('  📸 已保存生产截图: tests/prod_cf_redesign_v4_record.png');

    console.log('\n====================================================================');
    console.log('🎉 Cloudflare 生产公网全真栈 4 大抽屉变体全面回归通过！全部为线上真实数据！');
    console.log('====================================================================\n');

  } catch (err) {
    console.error('❌ Cloudflare 生产核验失败:', err);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

run();
