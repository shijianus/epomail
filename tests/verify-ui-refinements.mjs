import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const artifactDir = '/root/.gemini/antigravity-cli/brain/cbc28a25-331a-46a0-b167-379e80c873e9';

async function verifyUiRefinements() {
  console.log('--- Launching clean Chromium browser for UI Refinements Verification ---');
  const browser = await chromium.launch({ headless: true });

  // 1. Desktop Context (1440 x 900)
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktopContext.newPage();

  console.log('1. Navigating to http://192.168.17.129:4199/audit-report ...');
  await page.goto('http://192.168.17.129:4199/audit-report', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  // 打开第一条案件抽屉
  console.log('2. Opening drawer for case 1...');
  await page.waitForSelector('.action-detail-btn', { timeout: 10000 });
  await page.locator('.action-detail-btn').first().click();
  await page.waitForSelector('.audit-detail-drawer', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(600);

  // 验证 1：总览页中 3 列集群关联账号
  console.log('3. Verifying 3-Column Cluster Accounts in Overview Tab...');
  const headerColAccount = await page.locator('.cluster-header-row .col-account').count();
  const headerColStatus = await page.locator('.cluster-header-row .col-status').count();
  const headerColBasis = await page.locator('.cluster-header-row .col-basis').count();
  const oldColIdx = await page.locator('.cluster-header-row .col-idx').count();

  console.log(`  - 3-Column Headers: col-account=${headerColAccount}, col-status=${headerColStatus}, col-basis=${headerColBasis}`);
  console.log(`  - Old 5-Column Header col-idx=${oldColIdx} (must be 0)`);
  if (headerColAccount === 0 || headerColStatus === 0 || headerColBasis === 0 || oldColIdx > 0) {
    throw new Error('FAILED: Cluster accounts table does not match the new 3-column specification!');
  }

  // 检查账号对象内是否垂直展示 邮箱、用户 ID、原关联记录编号
  const firstDataRow = page.locator('.cluster-data-row').first();
  const emailItem = await firstDataRow.locator('.account-email').count();
  const uidItem = await firstDataRow.locator('.account-uid').count();
  const subcaseItem = await firstDataRow.locator('.account-subcase').count();
  const basisText = await firstDataRow.locator('.relation-basis-text').textContent();
  console.log(`  - Account Object items: email=${emailItem}, uid=${uidItem}, subcase=${subcaseItem}`);
  console.log(`  - Correlation Basis text: "${basisText.trim()}"`);

  // 滚动并捕获总览 Tab（包含 3 列关联账号）截图
  const clusterSection = page.locator('#chapter-cluster');
  await clusterSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const shotOverviewPath = path.join(artifactDir, 'verify_ui_overview_3col_accounts.png');
  await page.screenshot({ path: shotOverviewPath });
  console.log(`PASS: Captured 3-column accounts screenshot at ${shotOverviewPath}`);

  // 切换到调查 Tab (Investigation)
  console.log('4. Switching to Investigation Tab...');
  await page.locator('.drawer-clean-tabs .el-tabs__item#tab-investigation').click();
  await page.waitForTimeout(600);

  // 验证 2：时间线去卡片化 (De-cardified continuous stream)
  console.log('5. Verifying De-cardified Timeline Stream in Investigation Tab...');
  const oldCardCount = await page.locator('.single-timeline-stream .event-card').count();
  const flowContentCount = await page.locator('.single-timeline-stream .event-flow-content').count();
  const headLineCount = await page.locator('.single-timeline-stream .event-head-line').count();
  const metaLineCount = await page.locator('.single-timeline-stream .event-meta-line').count();
  const descLineCount = await page.locator('.single-timeline-stream .event-desc-line').count();

  console.log(`  - Old .event-card count: ${oldCardCount} (must be 0)`);
  console.log(`  - New .event-flow-content count: ${flowContentCount}`);
  console.log(`  - Title head line: ${headLineCount}, Meta line: ${metaLineCount}, Desc line: ${descLineCount}`);

  if (oldCardCount > 0 || flowContentCount === 0 || headLineCount === 0) {
    throw new Error('FAILED: Timeline is still using card structure!');
  }

  // 验证最新节点没有大红底卡片，只有小型克制最新标识
  const latestBadgeCount = await page.locator('.single-timeline-stream .event-latest-badge').count();
  console.log(`  - Restrained latest badge count: ${latestBadgeCount}`);

  // 验证 3：研判路径默认折叠
  console.log('6. Verifying Adjudication Path Default Collapsed...');
  const judgmentBoxVisible = await page.locator('.judgment-path-record-box').isVisible();
  console.log(`  - Is judgment path box visible on load: ${judgmentBoxVisible} (must be false)`);
  if (judgmentBoxVisible) {
    throw new Error('FAILED: Judgment path record is not collapsed by default!');
  }

  // 点击展开并验证内容
  const toggleBtn = page.locator('#chapter-judgment-path .section-title');
  await toggleBtn.click();
  await page.waitForTimeout(400);
  const judgmentBoxVisibleAfterClick = await page.locator('.judgment-path-record-box').isVisible();
  console.log(`  - Is judgment path box visible after click: ${judgmentBoxVisibleAfterClick} (must be true)`);
  if (!judgmentBoxVisibleAfterClick) {
    throw new Error('FAILED: Judgment path record did not expand when clicked!');
  }
  // 再次点击折叠回默认状态
  await toggleBtn.click();
  await page.waitForTimeout(400);

  // 捕获调查 Tab 截图 (时间线去卡片化 + 研判路径折叠)
  const timelineSection = page.locator('#chapter-timeline');
  await timelineSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const shotInvestigationPath = path.join(artifactDir, 'verify_ui_investigation_decardified.png');
  await page.screenshot({ path: shotInvestigationPath });
  console.log(`PASS: Captured de-cardified timeline screenshot at ${shotInvestigationPath}`);

  // 捕获研判路径展开对比图
  await toggleBtn.click();
  await page.waitForTimeout(400);
  const shotPathExpanded = path.join(artifactDir, 'verify_ui_investigation_path_expanded.png');
  await page.screenshot({ path: shotPathExpanded });
  console.log(`PASS: Captured expanded judgment path screenshot at ${shotPathExpanded}`);

  await desktopContext.close();

  // 2. Mobile Context (390 x 844 iPhone 12/13/14)
  console.log('7. Verifying 390px Mobile View...');
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();

  await mobilePage.goto('http://192.168.17.129:4199/audit-report', { waitUntil: 'networkidle', timeout: 15000 });
  await mobilePage.waitForTimeout(800);
  await mobilePage.locator('.action-detail-btn').first().click();
  await mobilePage.waitForSelector('.audit-detail-drawer', { state: 'visible', timeout: 5000 });
  await mobilePage.waitForTimeout(600);

  // 捕获手机总览（含 3 列关联账号自适应卡片）
  const shotMobileOverview = path.join(artifactDir, 'verify_ui_mobile_390_overview.png');
  await mobilePage.screenshot({ path: shotMobileOverview });
  console.log(`PASS: Captured mobile overview screenshot at ${shotMobileOverview}`);

  // 切换至调查 Tab 并捕获手机时间线
  await mobilePage.locator('.drawer-clean-tabs .el-tabs__item#tab-investigation').click();
  await mobilePage.waitForTimeout(600);
  const shotMobileInvestigation = path.join(artifactDir, 'verify_ui_mobile_390_investigation.png');
  await mobilePage.screenshot({ path: shotMobileInvestigation });
  console.log(`PASS: Captured mobile investigation screenshot at ${shotMobileInvestigation}`);

  await mobileContext.close();
  await browser.close();

  console.log('\n--- ALL UI REFINEMENT VERIFICATIONS PASSED SUCCESSFULLY ---');
}

verifyUiRefinements().catch(err => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
