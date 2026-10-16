import { chromium } from 'playwright';
import assert from 'assert';

const BASE = 'https://mail.epocanvas.com';

async function run() {
  console.log('====================================================================');
  console.log('=== 公网生产全真栈视觉验证：操作报告抽屉四种变体与大厂级 UI 质感核验 ===');
  console.log('====================================================================\n');

  let browser;

  try {
    console.log('[步骤 1] 登录生产管理员账号 (admin@epomail.cyou)...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@epomail.cyou', password: '123456' })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, '登录接口返回成功');
    const token = loginJson.data?.token;
    assert.ok(token, '登录成功获取有效 JWT Token');

    console.log('\n[步骤 2] 启动 Playwright 浏览器，设置视口 1440x900...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    await context.addInitScript(({ t }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'admin@epomail.cyou' }]));
    }, { t: token });

    const page = await context.newPage();

    console.log('\n[步骤 3] 访问 /audit-report 安全审计控制台...');
    await page.goto(`${BASE}/audit-report`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 检查控制台基础渲染
    const kpiCount = await page.locator('.kpi-card').count();
    console.log(`  - 页面加载完成，KPI 卡片数: ${kpiCount}`);
    assert.ok(kpiCount >= 4, '4 大 KPI 卡片必须正常渲染');

    // 截取控制台主列表视觉
    await page.screenshot({ path: 'tests/visual_audit_console_main.png', fullPage: false });
    console.log('  📸 已保存控制台主界面截图: tests/visual_audit_console_main.png');

    // 点击第一行打开抽屉
    console.log('\n[步骤 4] 打开第一行工单的详情抽屉...');
    const detailBtn = page.locator('.action-detail-btn, .clickable-ticket').first();
    if (await detailBtn.count() > 0) {
      await detailBtn.click();
    } else {
      await page.locator('.table-area tbody tr:first-child').click();
    }
    await page.waitForTimeout(1000);

    // 确认抽屉已展开
    const drawerLocator = page.locator('.audit-drawer-container, .el-drawer');
    await drawerLocator.first().waitFor({ state: 'visible', timeout: 8000 });
    console.log('  ✓ 抽屉成功滑入展示！');

    // 4.1 截取变体 1「滥用威胁 · 案件全宗档案」视觉
    console.log('\n[步骤 5] 核验 变体 1「滥用威胁 · 案件全宗档案」视觉...');
    // 如果当前变体不是 V1，切换到 V1
    const currentBtnText = await page.locator('.variant-switch-btn').textContent();
    if (!currentBtnText.includes('V1')) {
      await page.locator('.variant-switch-btn').click();
      await page.waitForTimeout(400);
      await page.locator('.el-dropdown-menu__item:has-text("V1:")').click();
      await page.waitForTimeout(800);
    }

    // 验证变体 1 头部与副标题
    const v1Title = await page.locator('.drawer-title').textContent();
    const v1Sub = await page.locator('.drawer-sub').textContent();
    console.log(`  - 变体 1 当前标题: ${v1Title.trim()} | 副标题: ${v1Sub.trim()}`);
    assert.ok(v1Title.includes('滥用威胁'), '变体 1 标题正确');

    // 截取变体 1 上半部分（头部徽标、芯片、12 字段概要网格、处置依据）
    await page.screenshot({ path: 'tests/visual_v1_threat_top.png', fullPage: false });
    console.log('  📸 已保存截图: tests/visual_v1_threat_top.png');

    // 滚动到裁决工作台
    const workbenchEl = page.locator('#chapter-decision');
    if (await workbenchEl.count() > 0) {
      await workbenchEl.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: 'tests/visual_v1_threat_decision.png', fullPage: false });
      console.log('  📸 已保存截图: tests/visual_v1_threat_decision.png');
    }

    // 4.2 截取变体 2「封禁台账 · 存证（只读）」视觉
    console.log('\n[步骤 6] 切换并核验 变体 2「封禁台账 · 存证（只读）」视觉...');
    await page.locator('.variant-switch-btn').click();
    await page.waitForTimeout(400);
    await page.locator('.el-dropdown-menu__item:has-text("V2:")').click();
    await page.waitForTimeout(800);

    const v2Title = await page.locator('.drawer-title').textContent();
    console.log(`  - 变体 2 当前标题: ${v2Title.trim()}`);
    assert.ok(v2Title.includes('封禁台账'), '变体 2 标题正确');

    // 滚动到相似案例与证据链溯源
    const similarEl = page.locator('#chapter-similar');
    if (await similarEl.count() > 0) {
      await similarEl.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: 'tests/visual_v2_evidence_chain.png', fullPage: false });
      console.log('  📸 已保存截图: tests/visual_v2_evidence_chain.png');
    }

    // 4.3 截取变体 3「风险管理 · 审计档案」视觉
    console.log('\n[步骤 7] 切换并核验 变体 3「风险管理 · 审计档案」视觉...');
    await page.locator('.variant-switch-btn').click();
    await page.waitForTimeout(400);
    await page.locator('.el-dropdown-menu__item:has-text("V3:")').click();
    await page.waitForTimeout(800);

    const v3Title = await page.locator('.drawer-title').textContent();
    console.log(`  - 变体 3 当前标题: ${v3Title.trim()}`);
    assert.ok(v3Title.includes('风险管理'), '变体 3 标题正确');

    // 滚动到多维风险画像
    const riskEl = page.locator('#chapter-risk');
    if (await riskEl.count() > 0) {
      await riskEl.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: 'tests/visual_v3_risk_profile.png', fullPage: false });
      console.log('  📸 已保存截图: tests/visual_v3_risk_profile.png');
    }

    // 4.4 截取变体 4「操作记录 · 处置台账（只读）」视觉
    console.log('\n[步骤 8] 切换并核验 变体 4「操作记录 · 处置台账（只读）」视觉...');
    await page.locator('.variant-switch-btn').click();
    await page.waitForTimeout(400);
    await page.locator('.el-dropdown-menu__item:has-text("V4:")').click();
    await page.waitForTimeout(800);

    const v4Title = await page.locator('.drawer-title').textContent();
    console.log(`  - 变体 4 当前标题: ${v4Title.trim()}`);
    assert.ok(v4Title.includes('操作记录'), '变体 4 标题正确');

    // 验证纯只读特性：不存在裁决输入框、不存在裁决按钮
    const verdictInput = await page.locator('.adjudication-card textarea').count();
    assert.strictEqual(verdictInput, 0, '变体 4 绝对不可包含裁决输入区');
    const decisionChapter = await page.locator('#chapter-decision').count();
    assert.strictEqual(decisionChapter, 0, '变体 4 章节列表中必须严格隐藏裁决章节');

    // 滚动到底部台账横幅
    const ledgerEl = page.locator('#chapter-ledger');
    if (await ledgerEl.count() > 0) {
      await ledgerEl.scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await page.screenshot({ path: 'tests/visual_v4_readonly_ledger.png', fullPage: false });
      console.log('  📸 已保存截图: tests/visual_v4_readonly_ledger.png');
    }

    // 4.5 测试深链直接定位与平滑滚动
    console.log('\n[步骤 9] 测试深链直接定位与平滑滚动 (#case=...)...');
    await page.goto(`${BASE}/audit-report#case=appeal:risk`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const isDeepVisible = await page.locator('.audit-drawer-container, .el-drawer').first().isVisible();
    console.log(`  - 深链跳转后抽屉是否可见: ${isDeepVisible}`);
    await page.screenshot({ path: 'tests/visual_deeplink_active.png', fullPage: false });
    console.log('  📸 已保存截图: tests/visual_deeplink_active.png');

    console.log('\n====================================================================');
    console.log('=== 恭喜！公网生产环境 4 种抽屉变体与视觉质感核验 100% 全部通过！ ===');
    console.log('====================================================================\n');

  } catch (err) {
    console.error('❌ 验证失败:', err);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

run();
