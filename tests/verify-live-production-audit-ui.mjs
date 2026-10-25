import { chromium } from 'playwright';
import assert from 'assert';

const BASE = 'https://mail.epocanvas.com';
const ADMIN_EMAIL = 'admin@epomail.cyou';
const ADMIN_PWD = '123456';

let passCount = 0;
let failCount = 0;

function check(cond, description) {
  if (cond) {
    passCount++;
    console.log(`  ✓ [LIVE PASS] ${description}`);
  } else {
    failCount++;
    console.error(`  ✗ [LIVE FAIL] ${description}`);
  }
}

async function safeFetchJson(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        return json;
      } catch (parseErr) {
        console.warn(`[safeFetchJson] Retry ${i + 1}/${maxRetries} non-json response (status ${res.status}): ${text.slice(0, 100)}...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e) {
      console.warn(`[safeFetchJson] Retry ${i + 1}/${maxRetries} error:`, e.message);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error(`Failed to fetch JSON from ${url} after ${maxRetries} retries`);
}

async function run() {
  console.log('====================================================================');
  console.log('=== 公网线上 Cloudflare 生产环境 (mail.epocanvas.com) 真实核验 ===');
  console.log('====================================================================\n');

  let browser;
  try {
    // 1. 真实登录生产获取 Token
    console.log('[步骤 1] 登录生产管理员账号获取真实 JWT...');
    const loginJson = await safeFetchJson(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PWD })
    });
    assert.strictEqual(loginJson.code, 200, '生产登录接口响应成功');
    const token = loginJson.data?.token;
    check(!!token, '公网线上真实 JWT Token 获取就绪');

    // 2. 启动 Playwright 打开线上生产环境
    console.log('\n[步骤 2] 启动 Chromium 无头浏览器访问生产环境...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    await context.addInitScript(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email }]));
    }, { t: token, email: ADMIN_EMAIL });

    const page = await context.newPage();
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('  [LIVE BROWSER ERROR]', msg.text());
    });

    // 3. 打开公网系统设置页 #manage/admin/system
    console.log('\n[步骤 3] 访问公网系统设置页 https://mail.epocanvas.com/mail/u/0/#manage/admin/system ...');
    await page.goto(`${BASE}/mail/u/0/#manage/admin/system`, { waitUntil: 'networkidle', timeout: 35000 });
    await page.waitForTimeout(2000);

    // 4. 定位操作报告卡片
    console.log('\n[步骤 4] 检视线上生产「系统设置」主视窗中的「操作报告」配置卡片...');
    const auditCard = page.locator('.audit-policy-card').first();
    await auditCard.waitFor({ state: 'visible', timeout: 15000 });
    await auditCard.scrollIntoViewIfNeeded();
    check(await auditCard.isVisible(), '生产环境「操作报告」卡片正常渲染 (.audit-policy-card)');

    // 5. 严格验证已彻底删除多余按钮与外链跳转
    console.log('\n[步骤 5] 严格核查：彻底删除原先的多余跳转与外链按钮...');
    // 检查原先的跳转按钮与容器
    const oldFlexEndDiv = auditCard.locator('div[style*="justify-content: flex-end"]');
    const oldFlexEndCount = await oldFlexEndDiv.count();
    check(oldFlexEndCount === 0, `已彻底删除 style="justify-content: flex-end" 容器 (实际数量: ${oldFlexEndCount})`);

    // 检查卡片内是否有跳转按钮
    const extraButtons = auditCard.locator('button:not(.el-input-number__decrease):not(.el-input-number__increase)');
    const extraButtonCount = await extraButtons.count();
    check(extraButtonCount === 0, `已彻底删除多余的跳转按钮与外部链接操作 (卡片独立按钮数: ${extraButtonCount})`);

    // 6. 验证总开关 (auditLogEnabled)
    console.log('\n[步骤 6] 核查总控开关 (auditLogEnabled)...');
    const masterSwitch = auditCard.locator('.el-switch').first();
    check(await masterSwitch.isVisible(), '操作报告与日志总开关 (auditLogEnabled) 存在且可见');

    // 7. 验证 IP 风控参数调节输入框
    console.log('\n[步骤 7] 核查 IP 风控数据调节项...');
    const inputNumbers = auditCard.locator('.el-input-number');
    const inputCount = await inputNumbers.count();
    check(inputCount === 3, `包含 3 组数字输入框 (实际: ${inputCount})`);

    const maxIpVal = await inputNumbers.nth(0).locator('input').inputValue();
    check(Number(maxIpVal) > 0, `最大活跃 IP 限制参数已展示 (当前生产数值: ${maxIpVal})`);

    const maxDeviceVal = await inputNumbers.nth(1).locator('input').inputValue();
    check(Number(maxDeviceVal) > 0, `最大绑定设备限制参数已展示 (当前生产数值: ${maxDeviceVal})`);

    const criticalQuotaVal = await inputNumbers.nth(2).locator('input').inputValue();
    check(Number(criticalQuotaVal) > 0, `严重违规配额参数已展示 (当前生产数值: ${criticalQuotaVal})`);

    // 8. 截屏留存：线上生产系统设置卡片
    console.log('\n[步骤 8] 截取公网生产「系统设置 - 操作报告」现场截图...');
    await auditCard.screenshot({ path: 'tests/live_prod_sys_setting_audit_card.png' });
    console.log('  📸 生产现场截图已保存至 tests/live_prod_sys_setting_audit_card.png');

    // 9. 核验状态栏纯色提示与偏移
    console.log('\n[步骤 9] 核验公网生产底部状态栏...');
    const statusBar = page.locator('.status-bar');
    await statusBar.waitFor({ state: 'visible' });

    const modeTag = statusBar.locator('.mode-tag');
    check(await modeTag.isVisible(), '邮箱模式徽章正常渲染');
    const modeTagMargin = await modeTag.evaluate(el => window.getComputedStyle(el).marginRight);
    check(modeTagMargin === '4px', `模式标签向左偏移规范 (实际 margin-right: ${modeTagMargin})`);

    const auditStatusBadge = statusBar.locator('.audit-status-tag');
    check(await auditStatusBadge.isVisible(), '生产状态栏成功呈现纯色状态徽标 (.audit-status-tag)');

    const badgeBg = await auditStatusBadge.evaluate(el => window.getComputedStyle(el).backgroundColor);
    check(badgeBg === 'rgba(0, 0, 0, 0)' || badgeBg === 'transparent', `徽标为纯色无填充背景 (实际 bg: ${badgeBg})`);

    const badgeText = (await auditStatusBadge.textContent()).trim();
    console.log(`  状态徽标当前文字: "${badgeText}"`);
    check(badgeText.length > 0, `徽标文字渲染正常: "${badgeText}"`);

    await statusBar.screenshot({ path: 'tests/live_prod_status_bar.png' });
    console.log('  📸 生产状态栏截图已保存至 tests/live_prod_status_bar.png');

    // 10. 全页截图
    await page.screenshot({ path: 'tests/live_prod_full_sys_setting.png' });
    console.log('  📸 生产整页截图已保存至 tests/live_prod_full_sys_setting.png');

    // -------------------------------------------------------------
    // PART 2: 验证普通用户/参观者公网访问 /audit-report (隐私最小化纯表格)
    // -------------------------------------------------------------
    console.log('\n[步骤 11] 登录普通用户并在生产环境访问 /audit-report 检视参观者隐私保护...');
    const userJson = await safeFetchJson(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'audit_normal_1789140856529@epomail.bond', password: 'Audit123!' })
    });
    const userToken = userJson.data?.token;
    check(!!userToken, '获取普通用户生产 Token 成功');

    const userContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    await userContext.addInitScript(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email }]));
    }, { t: userToken, email: 'audit_normal_1789140856529@epomail.bond' });

    const userPage = await userContext.newPage();
    console.log('  打开公网生产页面 https://mail.epocanvas.com/audit-report ...');
    await userPage.goto(`${BASE}/audit-report`, { waitUntil: 'networkidle', timeout: 35000 });
    await userPage.waitForTimeout(2000);

    // 12. 验证非管理员在公网环境的上层选框与管理按钮已彻底隐藏
    console.log('\n[步骤 12] 核验公网生产参观者视角：屏蔽 4 组 KPI 选框与管理按钮...');
    const userKpiGrid = userPage.locator('.kpi-grid');
    const isKpiVisible = await userKpiGrid.isVisible();
    check(!isKpiVisible, '公网生产：非管理员彻底隐藏上方 KPI 汇报选框 (严格纯表格)');

    const userHeaderActions = userPage.locator('.header-actions');
    const isHeaderActionsVisible = await userHeaderActions.isVisible();
    check(!isHeaderActionsVisible, '公网生产：非管理员彻底隐藏处置与导出按钮组');

    const userPublicNotice = userPage.locator('.visitor-public-header');
    check(await userPublicNotice.isVisible(), '公网生产：成功呈现「公开操作记录」提示栏');

    const userCheckboxes = userPage.locator('.table-area .el-checkbox');
    const checkboxCount = await userCheckboxes.count();
    check(checkboxCount === 0, `公网生产：表格彻底隐藏复选框 (复选框数量: ${checkboxCount})`);

    await userPage.screenshot({ path: 'tests/live_prod_visitor_audit_table.png' });
    console.log('  📸 生产普通用户/参观者表格截图已保存至 tests/live_prod_visitor_audit_table.png');

  } finally {
    if (browser) await browser.close();
  }

  console.log('\n====================================================================');
  console.log(`=== 公网线上 Cloudflare 生产实测汇总: ${passCount} 项通过, ${failCount} 项失败 ===`);
  console.log('====================================================================');

  if (failCount > 0) {
    console.error('公网生产环境存在不符合预期的项！');
    process.exit(1);
  } else {
    console.log('🎉 公网生产环境 (mail.epocanvas.com) 真实核验 100% 全部通过！\n');
  }
}

run().catch(err => {
  console.error('Fatal live verification error:', err);
  process.exit(1);
});
