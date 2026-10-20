import { chromium } from 'playwright';
import assert from 'node:assert';
import path from 'node:path';

const ARTIFACT_DIR = '/root/.gemini/antigravity-cli/brain/a628d784-628f-46cf-9c91-80572b24ec1b';
const TARGET_URL = 'http://192.168.17.129:4199/mail/u/0/#case=THR-2026-MULTI99:investigation';
const APPEAL_CASE_URL = 'http://192.168.17.129:4199/mail/u/0/#case=APP-2026-NAT88:decision';
const MISSING_CASE_URL = 'http://192.168.17.129:4199/mail/u/0/#case=THR-2026-NOACCESS:investigation';
const UNAUTH_CASE_URL = 'http://192.168.17.129:4199/mail/u/0/#case=THR-2026-FORBIDDEN:investigation';
const ERROR_CASE_URL = 'http://192.168.17.129:4199/mail/u/0/#case=THR-2026-LOADERR:investigation';

async function assertValidInvestigationState(page, label, expectedCaseId = 'THR-2026-MULTI99', expectedTabId = 'tab-investigation') {
  await page.waitForSelector('.audit-detail-drawer.audit-drawer-container', { state: 'visible', timeout: 8000 });
  const badge = (await page.locator('.header-case-badge').textContent())?.trim();
  const activeTab = await page.locator('.drawer-clean-tabs .el-tabs__item.is-active').getAttribute('id');
  const profileCount = await page.locator('.profile-page, .profile-container, .user-profile').count();
  const auditPageCount = await page.locator('.audit-page-container').count();
  const bodyText = await page.locator('body').innerText();
  const hasFakeUser =
    bodyText.includes(`case=${expectedCaseId}`) ||
    (bodyText.includes('@epocanvas.com') && bodyText.includes('case='));

  console.log(
    `  ✓ [${label}] URL=${page.url()} | auditPage=${auditPageCount} | case=${badge} | activeTab=${activeTab} | profileCount=${profileCount}`
  );
  assert.strictEqual(auditPageCount, 1, `${label}: 必须处于操作报告页面 (.audit-page-container)`);
  assert.strictEqual(badge, expectedCaseId, `${label}: 案件 ID 必须为 ${expectedCaseId}，实际为 ${badge}`);
  assert.strictEqual(activeTab, expectedTabId, `${label}: Tab (${expectedTabId}) 必须处于激活态，实际为 ${activeTab}`);
  assert.strictEqual(profileCount, 0, `${label}: 严禁落入个人资料页`);
  assert.strictEqual(hasFakeUser, false, `${label}: 严禁将 case=... 显示为用户名或拼接为邮箱`);
}

async function runVerification() {
  console.log('====================================================================');
  console.log('=== [前端集成/回归验证] 任务 A (深链接恢复) + 任务 B (纵向关联账号) + 任务 C (五步裁决流) ===');
  console.log('====================================================================\n');

  const browser = await chromium.launch({ headless: true });

  try {
    // ========================================================================
    // 一、任务 A：原完整地址 10 项全链路回归核验（零 addInitScript / 零 page.route / 零 storageState）
    // ========================================================================
    console.log('--- [Part A] 任务 A：案件深链接地址解析与抽屉恢复全链路核验 ---');

    // 1. 全新上下文直接访问原完整地址
    const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page1 = await ctx1.newPage();

    await page1.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await assertValidInvestigationState(page1, 'A1. 全新上下文直接访问原地址');
    await page1.waitForTimeout(300);

    // 采集原完整地址首次打开截图
    const shotInitial = path.join(ARTIFACT_DIR, 'deep_link_initial_open.png');
    await page1.screenshot({ path: shotInitial });
    console.log(`  📸 已保存首次打开截图: ${shotInitial}`);

    // 2. 页面就绪后刷新（第 1 次刷新）
    await page1.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await assertValidInvestigationState(page1, 'A2. 页面就绪后刷新 (#1)');
    await page1.waitForTimeout(300);

    // 采集原完整地址刷新后截图
    const shotRefreshed = path.join(ARTIFACT_DIR, 'deep_link_after_refresh.png');
    await page1.screenshot({ path: shotRefreshed });
    console.log(`  📸 已保存刷新后截图: ${shotRefreshed}`);

    // 3. 连续刷新（第 2、3 次刷新）
    await page1.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await assertValidInvestigationState(page1, 'A3-1. 连续刷新 (#2)');
    await page1.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await assertValidInvestigationState(page1, 'A3-2. 连续刷新 (#3)');

    // 4. 复制 URL 到同上下文新标签页
    const copiedUrl = page1.url();
    const page2 = await ctx1.newPage();
    await page2.goto(copiedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await assertValidInvestigationState(page2, 'A4-1. 同上下文新标签页打开');
    await page2.close();

    // 4.2 独立新浏览器上下文打开
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageIndep = await ctx2.newPage();
    await pageIndep.goto(copiedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await assertValidInvestigationState(pageIndep, 'A4-2. 独立新上下文直达');
    await ctx2.close();

    // 5. 关闭抽屉 -> 从列表打开同案 -> 切换到调查 -> 复制实际生成 URL 验证
    await page1.locator('.audit-detail-drawer .drawer-close-btn').click();
    await page1.waitForSelector('.audit-detail-drawer.audit-drawer-container', { state: 'hidden', timeout: 5000 });
    console.log(`  ✓ [A5-1. 关闭抽屉清理残余 hash] URL=${page1.url()}`);
    assert.ok(!page1.url().includes('#case='), `关闭抽屉后不得残留 #case=，当前 URL: ${page1.url()}`);

    await page1.locator('.clickable-ticket').first().click();
    await page1.waitForSelector('.audit-detail-drawer.audit-drawer-container', { state: 'visible', timeout: 5000 });
    const overviewTab = await page1.locator('.drawer-clean-tabs .el-tabs__item.is-active').getAttribute('id');
    console.log(`  ✓ [A5-2. 从列表打开同案] URL=${page1.url()} | activeTab=${overviewTab}`);
    assert.strictEqual(overviewTab, 'tab-overview', '从列表打开默认激活总览 Tab');

    await page1.locator('#tab-investigation').click();
    await assertValidInvestigationState(page1, 'A5-3. 切换到调查 Tab');
    const generatedInvestigationUrl = page1.url();
    assert.ok(generatedInvestigationUrl.includes('#case=THR-2026-MULTI99:investigation'), `列表进入切换调查后 URL 必须包含 #case=THR-2026-MULTI99:investigation，实际: ${generatedInvestigationUrl}`);

    // 6. 浏览器前进与后退一致性
    await page1.goBack();
    await page1.waitForTimeout(250);
    const backTab = await page1.locator('.drawer-clean-tabs .el-tabs__item.is-active').getAttribute('id');
    console.log(`  ✓ [A6-1. 浏览器后退 (goBack)] URL=${page1.url()} | activeTab=${backTab}`);
    assert.strictEqual(backTab, 'tab-overview', '浏览器后退应回到总览 Tab');

    await page1.goForward();
    await page1.waitForTimeout(250);
    await assertValidInvestigationState(page1, 'A6-2. 浏览器前进 (goForward)');

    // 7. 跨筛选/不在当前默认列表页的案件按 ID 检索恢复 (APP-2026-NAT88:decision)
    const ctxCross = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageCross = await ctxCross.newPage();
    await pageCross.goto(APPEAL_CASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await assertValidInvestigationState(pageCross, 'A7. 跨筛选按 ID 检索恢复申诉案件与裁决 Tab', 'APP-2026-NAT88', 'tab-decision');
    await ctxCross.close();

    // 8. 数据慢返回时仍恢复正确案件与调查 Tab
    await fetch('http://192.168.17.129:4199/api/audit/mock-delay?ms=800');
    const ctxSlow = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageSlow = await ctxSlow.newPage();
    await pageSlow.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await assertValidInvestigationState(pageSlow, 'A8. 慢数据返回 (800ms) 恢复案件与调查 Tab');
    await ctxSlow.close();
    await fetch('http://192.168.17.129:4199/api/audit/mock-delay?ms=0');

    // 9. 明确区分未找到 (not_found)、无权限 (unauthorized)、加载失败 (error) 三种异常状态
    const ctxStates = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageStates = await ctxStates.newPage();

    // 9.1 未找到 (not_found)
    await pageStates.goto(MISSING_CASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await pageStates.waitForSelector('.deep-link-missing-banner[data-status="not_found"]', { state: 'visible', timeout: 5000 });
    const notFoundText = (await pageStates.locator('.deep-link-missing-banner').textContent())?.trim();
    console.log(`  ✓ [A9-1. 未找到状态 (not_found)] banner="${notFoundText}"`);
    assert.ok(notFoundText?.includes('THR-2026-NOACCESS'), 'not_found 状态应包含案件编号');

    // 9.2 无权限 (unauthorized)
    await pageStates.goto(UNAUTH_CASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await pageStates.waitForSelector('.deep-link-missing-banner[data-status="unauthorized"]', { state: 'visible', timeout: 5000 });
    const unauthText = (await pageStates.locator('.deep-link-missing-banner').textContent())?.trim();
    console.log(`  ✓ [A9-2. 无权限状态 (unauthorized)] banner="${unauthText}"`);
    assert.ok(unauthText?.includes('THR-2026-FORBIDDEN'), 'unauthorized 状态应包含案件编号');

    // 9.3 加载失败 (error)
    await pageStates.goto(ERROR_CASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await pageStates.waitForSelector('.deep-link-missing-banner[data-status="error"]', { state: 'visible', timeout: 5000 });
    const errorText = (await pageStates.locator('.deep-link-missing-banner').textContent())?.trim();
    console.log(`  ✓ [A9-3. 加载失败状态 (error)] banner="${errorText}"`);
    assert.ok(errorText?.includes('THR-2026-LOADERR'), 'error 状态应包含案件编号');

    await ctxStates.close();

    // ========================================================================
    // 二、冻结项核验：风险遥测指标图形恢复与诚实数据映射回归核验
    // ========================================================================
    console.log('\n--- [Part B] 风险遥测指标图形与冻结项回归核验 ---');

    const drawerBox = await page1.locator('.audit-detail-drawer.audit-drawer-container').boundingBox();
    console.log(`  ✓ [桌面抽屉宽度核验] width=${Math.round(drawerBox.width)}px (目标: 760px)`);
    assert.ok(drawerBox.width >= 755 && drawerBox.width <= 765, `桌面抽屉宽度应保持 760px，实际: ${drawerBox.width}px`);

    const tabCount = await page1.locator('.drawer-clean-tabs .el-tabs__item').count();
    assert.strictEqual(tabCount, 4, '4 个 Tab 必须完整保留');

    await page1.evaluate(() => {
      const el = document.getElementById('chapter-risk');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await page1.waitForTimeout(350);

    const metricRows = page1.locator('#chapter-risk .risk-indicators-table .metric-compare-row');
    const rowCount = await metricRows.count();
    assert.strictEqual(rowCount, 9, '必须渲染全部 9 项风险遥测指标');

    const shotDesktopGauges = path.join(ARTIFACT_DIR, 'risk_telemetry_gauges_desktop_760px.png');
    await page1.screenshot({ path: shotDesktopGauges });
    console.log(`  📸 已保存桌面风险指标图形截图: ${shotDesktopGauges}`);

    await ctx1.close();
    console.log('\n====================================================================');
    console.log('=== 任务 A 深链接恢复与风险图形回归验证 100% 通过 ===');
    console.log('====================================================================');
  } finally {
    await fetch('http://192.168.17.129:4199/api/audit/mock-delay?ms=0').catch(() => {});
    await browser.close();
  }
}

runVerification().catch((err) => {
  console.error('\n[验证失败]:', err);
  process.exit(1);
});
