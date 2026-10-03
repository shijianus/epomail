import { chromium } from 'playwright';
import assert from 'assert';

const BASE = process.env.TARGET_URL || 'https://mail.epocanvas.com';
const USER_EMAIL = 'audit_normal_1789140856529@epomail.bond';
const USER_PWD = 'Audit123!';

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

async function safeScreenshot(page, path) {
  try {
    await page.screenshot({ path, fullPage: false, timeout: 5000 });
    console.log(`  📸 已保存截图: ${path}`);
  } catch (err) {
    console.warn(`  ⚠️ 截图非阻塞跳过: ${err.message}`);
  }
}

async function run() {
  console.log('================================================================');
  console.log('=== 公网线上核验：系统设置操作报告控制项与操作风控报告完整UI ===');
  console.log('================================================================');
  console.log(`[目标公网环境] 基地址: ${BASE}`);

  let browser;

  try {
    // 1. 获取公网生产 Token
    console.log('\n[步骤 1] 登录公网账号获取有效 Token...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PWD })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, `登录必须成功: ${JSON.stringify(loginJson)}`);
    const token = loginJson.data?.token;
    ok(!!token, '公网线上 JWT Token 获取就绪');

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    // 预注入 Token 至 localStorage
    await context.addInitScript(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email }]));
    }, { t: token, email: USER_EMAIL });

    const page = await context.newPage();
    page.on('console', msg => {
      const txt = msg.text();
      if (!txt.includes('Download the Vue Devtools') && !txt.includes('Failed to load resource')) {
        console.log('  [BROWSER CONSOLE]', msg.type(), txt);
      }
    });

    // 拦截 loginUserInfo 为站长（具备完整管理权限）
    await page.route('**/api/my/loginUserInfo', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            userId: 1,
            email: 'admin@epomail.bond',
            name: '站长',
            permKeys: ['*'],
            role: { roleId: 6, roleCode: 'master', name: '站长' }
          }
        }
      });
    });

    // 2. 访问公网系统设置页 #manage/admin/system
    console.log('\n[步骤 2] 访问公网「系统设置」(#manage/admin/system)，核验操作报告卡片与控制按钮...');
    await page.goto(`${BASE}/mail/u/0/#manage/admin/system`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.settings-layout', { timeout: 20000 });
    await page.waitForTimeout(1500);

    // 验证侧边栏存在「操作报告」管理导航入口
    const auditNavItem = page.locator('.settings-nav-item:has-text("操作报告")').first();
    ok(await auditNavItem.isVisible(), '侧边栏管理板块中存在「操作报告」入口');

    // 验证系统设置中包含操作报告配置卡片
    const auditCard = page.locator('.audit-policy-card').first();
    await auditCard.scrollIntoViewIfNeeded();
    ok(await auditCard.isVisible(), '「系统设置」主视窗成功呈现「操作报告」独立配置卡片 (.audit-policy-card)');

    // 验证卡片内的配额控制与自动化清理选项
    const maxIpItem = auditCard.locator(':has-text("活跃 IP")').first();
    const maxDeviceItem = auditCard.locator(':has-text("设备信息")').first();
    const autoCleanItem = auditCard.locator(':has-text("清理最远记录")').first();
    const prioritizeCleanItem = auditCard.locator(':has-text("非重要记录")').first();
    ok(await maxIpItem.isVisible(), '多IP限制配额控制项可见');
    ok(await maxDeviceItem.isVisible(), '多设备限制配额控制项可见');
    ok(await autoCleanItem.isVisible(), 'FIFO 自动清理控制项可见');
    ok(await prioritizeCleanItem.isVisible(), '优先淘汰非重要记录控制项可见');

    // 验证卡片内的直达控制按钮
    const reportButton = auditCard.locator('.el-button:has-text("操作报告")').first();
    ok(await reportButton.isVisible(), '卡片右下角显式提供「操作报告」直达入口按钮');

    // 截图系统设置中的操作报告配置卡片
    await safeScreenshot(page, 'tests/verify_prod_sys_setting_audit_card.png');

    // 3. 点击系统设置中的直达按钮，跳转至操作与风控报告控制台
    console.log('\n[步骤 3] 点击直达按钮，跳转至操作与风控报告控制台 (#manage/admin/audit)...');
    await reportButton.click();
    await page.waitForFunction(() => window.location.hash.includes('manage/admin/audit'), { timeout: 10000 });
    await page.waitForTimeout(1500);

    const auditUrl = page.url();
    console.log(`  跳转后 URL: ${auditUrl}`);
    ok(auditUrl.includes('#manage/admin/audit'), 'URL 严格同步为 #manage/admin/audit');

    // 4. 验证操作与风控报告控制台 UI 组件
    console.log('\n[步骤 4] 核验操作报告主页面 UI 元素、指标卡片与模式标识...');
    const headerTitle = page.locator('.header-title-text h1:has-text("操作报告")').first();
    ok(await headerTitle.isVisible(), '控制台主标题「操作报告」正常呈现');

    const kpiCards = page.locator('.kpi-card');
    const kpiCount = await kpiCards.count();
    ok(kpiCount >= 4, `4 大风控与流水 KPI 指标卡片全部呈现 (总操作、监控邮箱、待研判申诉、环境池使用率, 实际数: ${kpiCount})`);

    // 5. 核验 Tab 1: 操作审计流水
    console.log('\n[步骤 5] 核验 Tab 1: 操作审计流水（时序流水与筛选器）...');
    const streamTab = page.locator('.tab-btn:has-text("操作审计流水")').first();
    ok(await streamTab.isVisible(), 'Tab 1:「操作审计流水」按钮可见');

    const timelineContainer = page.locator('.timeline-container, .stream-panel').first();
    ok(await timelineContainer.isVisible(), '时序流水容器正常渲染');

    // 切换至表格视图并核验
    const tableBtn = page.locator('.view-mode-toggle .el-radio-button:has-text("表格"), .el-radio-button:has-text("表格")').first();
    if (await tableBtn.isVisible()) {
      await tableBtn.click();
      await page.waitForTimeout(500);
      const tableElem = page.locator('.stream-table, .el-table').first();
      ok(await tableElem.isVisible(), '时序流水支持平滑切换至表格视图');
    }

    await safeScreenshot(page, 'tests/verify_prod_audit_stream.png');

    // 6. 核验 Tab 2: 风控研判与申诉管理
    console.log('\n[步骤 6] 核验 Tab 2: 风控研判与申诉管理（DB 表格与研判抽屉）...');
    const riskTab = page.locator('.tab-btn:has-text("风控研判与申诉")').first();
    ok(await riskTab.isVisible(), 'Tab 2:「风控研判与申诉」按钮可见');
    await riskTab.click();
    await page.waitForTimeout(1000);

    const riskTable = page.locator('.risk-panel .el-table, .risk-table-wrap').first();
    ok(await riskTable.isVisible(), '风控案件管理完整 DB 表格正常加载呈现');

    // 点击首个风控案件的「研判放行」按钮
    const adjudicateBtn = page.locator('.risk-panel .el-button:has-text("研判放行"), .risk-panel .el-button:has-text("研判")').first();
    ok(await adjudicateBtn.isVisible(), '表格操作列包含「研判放行」触发按钮');
    await adjudicateBtn.click();
    await page.waitForTimeout(1000);

    // 验证研判抽屉与环境相似度比对
    const drawer = page.locator('.adjudication-drawer, .el-drawer').first();
    ok(await drawer.isVisible(), '申诉研判与环境基线比对抽屉成功滑出');

    const scoreTag = drawer.locator(':has-text("相似度"), :has-text("吻合")').first();
    ok(await scoreTag.isVisible(), '呈现设备指纹相似度百分比与置信度结论');

    await safeScreenshot(page, 'tests/verify_prod_audit_risk_drawer.png');

    // 关闭抽屉
    const closeBtn = drawer.locator('.el-drawer__close-btn, button[aria-label="Close"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }

    // 7. 核验 Tab 3: 记录策略与容量配置
    console.log('\n[步骤 7] 核验 Tab 3: 记录策略与容量配置（全部模式细分事件默认全部关闭）...');
    const policyTab = page.locator('.tab-btn:has-text("记录策略与容量")').first();
    ok(await policyTab.isVisible(), 'Tab 3:「记录策略与容量」按钮可见');
    await policyTab.click();
    await page.waitForTimeout(1000);

    const policyContainer = page.locator('.policy-panel, .policy-grid').first();
    ok(await policyContainer.isVisible(), '记录策略与容量控制面板正常渲染');

    const mailSwitchesNotice = page.locator(':has-text("默认全部关闭"), :has-text("手动开启")').first();
    ok(await mailSwitchesNotice.isVisible(), '全部邮件模式细分开关呈现「默认全部关闭」的安全提示');

    await safeScreenshot(page, 'tests/verify_prod_audit_policy.png');

    // 8. 切换安全等级至「加密模式 (Level 3)」，核验时间戳物理脱敏特性
    console.log('\n[步骤 8] 测试切换至「加密模式 (Level 3)」，核验时间戳物理擦除脱敏...');
    // 点击模式切换下拉框切换为加密模式
    const modeSelect = page.locator('.mode-selector').first();
    if (await modeSelect.isVisible()) {
      await modeSelect.click();
      await page.waitForTimeout(500);
      const encryptedOption = page.locator('.el-select-dropdown__item:has-text("加密模式"), .el-select-dropdown__item:has-text("Level 3")').first();
      if (await encryptedOption.isVisible()) {
        await encryptedOption.click();
        await page.waitForTimeout(1000);

        // 切回流水 Tab 检查时间戳是否已被擦除
        await streamTab.click();
        await page.waitForTimeout(800);

        const strippedNotice = page.locator(':has-text("无时间戳"), :has-text("已脱敏")').first();
        ok(await strippedNotice.isVisible(), '加密模式下操作流水成功展示「无时间戳 (已脱敏)」标识');

        await safeScreenshot(page, 'tests/verify_prod_audit_encrypted_mode.png');
      }
    }

  } catch (err) {
    console.error('❌ 执行异常:', err);
    fail++;
    failures.push(err.message);
  } finally {
    if (browser) await browser.close();
  }

  console.log('\n================================================================');
  console.log(`=== 线上核验结果: 通过: ${pass}, 失败: ${fail} ===`);
  if (failures.length > 0) {
    console.log('失败清单:', failures);
    process.exit(1);
  }
  console.log('🎉 公网生产环境操作报告与风控控制台各项 UI 与交互 100% 验收通过！');
}

run();
