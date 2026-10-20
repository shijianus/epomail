import { chromium } from 'playwright';
import assert from 'node:assert';
import path from 'node:path';

const ARTIFACT_DIR = '/root/.gemini/antigravity-cli/brain/a628d784-628f-46cf-9c91-80572b24ec1b';
const TARGET_URL = 'http://127.0.0.1:4199/mail/u/0/#case=THR-2026-MULTI99:investigation';

async function testEscBehavior() {
  console.log('=== [核验] 浮层 Esc 退出行为与未选择裁决截图采集 ===');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  try {
    // 1. 直达案件调查 Tab
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const drawer = page.locator('.audit-detail-drawer.audit-drawer-container');
    await drawer.waitFor({ state: 'visible', timeout: 8000 });
    console.log('  ✓ 抽屉成功打开');

    // 2. 切换到总览 Tab，测试标识 Popover 打开后按 Esc
    await page.locator('#tab-overview').click();
    await page.waitForTimeout(300);

    const firstViewIdBtn = drawer.locator('.record-action .view-identity-btn').first();
    await firstViewIdBtn.click();
    await page.waitForTimeout(300);

    const popoverContent = page.locator('.account-identity-popover:visible, .identity-popover-content:visible').first();
    assert.ok(await popoverContent.isVisible(), '标识 Popover 成功弹出');
    const debugInfo = await page.evaluate(() => {
      const popoverEl = document.querySelector('.account-identity-popover');
      return {
        hasPopoverEl: !!popoverEl,
        popoverStyle: popoverEl ? popoverEl.getAttribute('style') : null,
        popoverAriaHidden: popoverEl ? popoverEl.getAttribute('aria-hidden') : null,
        popoverClasses: popoverEl ? popoverEl.className : null
      };
    });
    console.log('DEBUG INFO BEFORE ESC:', debugInfo);

    // 按 Esc
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const isPopoverVisible = await page.locator('.identity-popover-content:visible').isVisible();
    const isDrawerVisibleAfterPopoverEsc = await drawer.isVisible();

    console.log(`  - 按 Esc 后 Popover 可见状态: ${isPopoverVisible} (应为 false)`);
    console.log(`  - 按 Esc 后抽屉可见状态: ${isDrawerVisibleAfterPopoverEsc} (应为 true)`);

    assert.strictEqual(isPopoverVisible, false, '按 Esc 必须关闭标识 Popover');
    assert.strictEqual(isDrawerVisibleAfterPopoverEsc, true, '按 Esc 标识 Popover 时，下层案件抽屉必须保持打开');

    // 3. 切换到裁决 Tab，测试未选择状态截图采集
    const tabDecision = drawer.locator('.drawer-tabs-wrapper .el-tabs__item').nth(3);
    console.log('tabDecision visible:', await tabDecision.isVisible(), 'box:', await tabDecision.boundingBox());
    await tabDecision.click();
    await page.waitForTimeout(400);

    const decisionSection = drawer.locator('#chapter-decision');
    await decisionSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // 采集：桌面裁决未选择状态
    const shotUnselected = path.join(ARTIFACT_DIR, 'desktop_1440_decision_unselected_760px.png');
    await page.screenshot({ path: shotUnselected });
    console.log(`  📸 已采集桌面裁决未选择状态截图: ${shotUnselected}`);

    // 4. 输入批注并选择裁决，然后打开通知 Dialog
    const notesTextarea = decisionSection.locator('.decision-textarea textarea');
    await notesTextarea.fill('INTERNAL_ESC_TEST_NOTE: 测试 Esc 退出不丢失');
    
    const verdictOptions = decisionSection.locator('.verdict-compact-option');
    await verdictOptions.first().click(); // 选择首项 (确认违规·封禁账号)
    await page.waitForTimeout(200);

    const previewBtn = decisionSection.locator('.btn-preview-notice');
    assert.strictEqual(await previewBtn.isDisabled(), false, '选择裁决后通知预览按钮可用');
    await previewBtn.click();
    await page.waitForTimeout(300);

    const noticeDialog = page.locator('.notice-preview-dialog:visible');
    assert.ok(await noticeDialog.isVisible(), '通知 Dialog 成功打开');
    console.log('  ✓ 通知 Dialog 成功展开');

    // 5. 按 Esc 退出通知 Dialog
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const isDialogVisibleAfterEsc = await page.locator('.notice-preview-dialog:visible').isVisible();
    const isDrawerVisibleAfterDialogEsc = await drawer.isVisible();

    console.log(`  - 按 Esc 后通知 Dialog 可见状态: ${isDialogVisibleAfterEsc} (应为 false)`);
    console.log(`  - 按 Esc 后抽屉可见状态: ${isDrawerVisibleAfterDialogEsc} (应为 true)`);

    assert.strictEqual(isDialogVisibleAfterEsc, false, '按 Esc 必须关闭通知 Dialog');
    assert.strictEqual(isDrawerVisibleAfterDialogEsc, true, '按 Esc 通知 Dialog 时，下层案件抽屉必须保持打开');

    // 6. 验证内部批注和所选裁决不丢失
    const remainingNotes = await notesTextarea.inputValue();
    const selectedCount = await decisionSection.locator('.verdict-compact-option.is-selected').count();
    console.log(`  - 退出 Dialog 后批注保留: "${remainingNotes}"`);
    console.log(`  - 退出 Dialog 后选中裁决数: ${selectedCount}`);

    assert.strictEqual(remainingNotes, 'INTERNAL_ESC_TEST_NOTE: 测试 Esc 退出不丢失', '内部批注不得丢失');
    assert.strictEqual(selectedCount, 1, '所选裁决不得丢失');

    console.log('\n🎉 浮层 Esc 退出行为核验 100% 通过！\n');
  } finally {
    await browser.close();
  }
}

testEscBehavior().catch(err => {
  console.error('测试异常终止:', err);
  process.exit(1);
});
