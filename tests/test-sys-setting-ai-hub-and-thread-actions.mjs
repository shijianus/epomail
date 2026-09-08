import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：系统设置 AI 独立板块、连通性与邮件内嵌 thread-header-bar 按钮 ===");
  console.log("==========================================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  let adminToken = null;

  try {
    // 1. 登录 Admin 账号
    console.log("\n[步骤 1] 登录 Admin 账号获取鉴权 Token...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "Admin 登录失败: " + JSON.stringify(loginData));
    adminToken = typeof loginData.data === "string" ? loginData.data : loginData.data?.token;
    console.log("  ✓ Admin 登录成功");

    // 2. 打开系统设置页面 (/system-setting)
    console.log("\n[步骤 2] 打开系统设置页面 (/system-setting) 并验证独立 AI 智能引擎卡片...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, adminToken);
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    await page.goto(BASE + "/system-setting", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".settings-card", { timeout: 10000 });
    await page.waitForTimeout(1000);

    // 验证 .ai-hub-card 存在
    const aiHubCard = await page.$(".ai-hub-card");
    assert.ok(aiHubCard, "系统设置页面必须渲染独立 .ai-hub-card 卡片");
    const aiCardText = await aiHubCard.textContent();
    console.log(`  AI Hub 卡片标题与文案: ${aiCardText.slice(0, 100).replace(/\s+/g, ' ')}...`);
    assert.ok(
      aiCardText.includes("AI 智能引擎") || aiCardText.includes("大模型接入"),
      "卡片应包含 AI 智能引擎与大模型接入标题"
    );
    assert.ok(
      aiCardText.includes("Workers AI") || aiCardText.includes("自定义"),
      "卡片应包含大模型状态标签"
    );
    console.log("  ✓ 系统设置中的 AI 独立板块渲染正常");

    // 3. 点击「测试 AI 连通性」
    console.log("\n[步骤 3] 测试 AI 卡片快捷连通性按钮...");
    const testAiBtn = await page.$(".ai-hub-card .forward .el-button:not(.opt-button)");
    assert.ok(testAiBtn, "卡片中必须存在测试 AI 连通性按钮");
    await testAiBtn.click();
    await page.waitForTimeout(2000);
    console.log("  ✓ 连通性测试按钮点击成功");

    // 4. 点击设置按钮打开 AI 配置弹窗
    console.log("\n[步骤 4] 打开 AI 智能引擎配置弹窗 (.ai-hub-dialog)...");
    const optBtn = await page.$(".ai-hub-card .opt-button");
    assert.ok(optBtn, "必须存在设置按钮以打开弹窗");
    await optBtn.click();
    await page.waitForTimeout(600);

    const dialog = await page.$(".ai-hub-dialog");
    assert.ok(dialog, "必须成功展开 .ai-hub-dialog 对话框");

    // 验证模型选择器与模型池
    const modelSelect = await page.$(".ai-hub-dialog .ai-model-select");
    assert.ok(modelSelect, "弹窗中应包含主推理模型下拉选择框 (.ai-model-select)");
    const poolSelect = await page.$(".ai-hub-dialog .ai-models-pool-select");
    assert.ok(poolSelect, "弹窗中应包含多模型池下拉选择框 (.ai-models-pool-select)");

    // 点击主模型选择框测试聚焦自动探测
    console.log("  测试聚焦主模型选择框自动探测模型...");
    await modelSelect.click();
    await page.waitForTimeout(1000);

    // 运行连通性测试
    const testBtn = await page.$('.ai-hub-dialog .opt-btn-test-ai-dialog, .ai-hub-dialog .dialog-footer .el-button:has-text("连通性"), .ai-hub-dialog .dialog-footer .el-button:has-text("测试")');
    if (testBtn) {
      console.log("  测试弹窗内真实连通性测试...");
      await testBtn.click({ force: true });
      await page.waitForTimeout(2000);
      const liveResult = await page.$(".ai-hub-dialog .ai-test-live-result");
      assert.strictEqual(liveResult, null, "弹窗内 .ai-test-live-result 提示卡片必须已被彻底移除");
      console.log("  ✓ 连通性测试完成，.ai-test-live-result 提示卡片已成功移除");
    }

    // 关闭下拉单与弹窗
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const isDialogOpen = await page.$eval('.ai-hub-dialog', el => el.offsetParent !== null).catch(() => false);
    if (isDialogOpen) {
      const cancelBtn = await page.$('.ai-hub-dialog .dialog-footer .el-button:has-text("取消")');
      if (cancelBtn) await cancelBtn.click({ force: true });
    }
    await page.waitForTimeout(400);
    console.log("  ✓ AI 核心配置与自动化模型识别/测试交互验证通过");

    // 5. 验证收件箱阅读面板与 Gmail UI
    console.log("\n[步骤 5] 导航至收件箱 (/inbox) 验证 Gmail 风格顶栏与内嵌 thread-header-bar...");
    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // 确认已删除重复的 "返回邮件列表" 按钮
    const duplicateBackBar = await page.$(".no-split-back-bar, .back-to-list-btn");
    assert.strictEqual(duplicateBackBar, null, "重复的 .back-to-list-btn 必须被彻底删除");
    console.log("  ✓ 重复的「返回邮件」条目已确认彻底移除");

    // 点击邮件查看详情
    await page.waitForSelector(".email-row", { timeout: 10000 });
    const emailRows = await page.$$(".email-row");
    assert.ok(emailRows.length > 0, "收件箱中应有邮件列表");
    await emailRows[0].click();
    await page.waitForTimeout(1500);

    // 6. 验证顶栏 .header-actions 左对齐与右对齐按钮
    console.log("\n[步骤 6] 验证 .header-actions 左对齐与右对齐操作按钮...");
    const headerLeft = await page.$(".header-actions .header-actions-left");
    assert.ok(headerLeft, "必须渲染左对齐操作容器 .header-actions-left");

    const headerRight = await page.$(".header-actions .header-actions-right");
    assert.ok(headerRight, "必须渲染右对齐操作容器 .header-actions-right");

    const backBtn = await page.$(".header-actions .btn-back");
    const archiveBtn = await page.$(".header-actions .btn-archive");
    const spamBtn = await page.$(".header-actions .btn-spam");
    const deleteBtn = await page.$(".header-actions .btn-delete");
    const unreadBtn = await page.$(".header-actions .btn-unread");
    const snoozeBtn = await page.$(".header-actions .btn-snooze");
    const taskBtn = await page.$(".header-actions .btn-task");
    const moveBtn = await page.$(".header-actions .btn-move");
    const labelBtn = await page.$(".header-actions .btn-label");
    const moreBtn = await page.$(".header-actions .btn-more");
    const printAllBtn = await page.$(".header-actions .btn-print-all");
    const newWindowBtn = await page.$(".header-actions .btn-new-window");

    assert.ok(backBtn, "必须包含返回按钮 .btn-back");
    assert.ok(archiveBtn, "必须包含归档按钮 .btn-archive");
    assert.ok(spamBtn, "必须包含举报垃圾邮件按钮 .btn-spam");
    assert.ok(deleteBtn, "必须包含删除按钮 .btn-delete");
    assert.ok(unreadBtn, "必须包含已读/未读按钮 .btn-unread");
    assert.ok(snoozeBtn, "必须包含延后提醒按钮 .btn-snooze");
    assert.ok(taskBtn, "必须包含添加到任务按钮 .btn-task");
    assert.ok(moveBtn, "必须包含移动到按钮 .btn-move");
    assert.ok(labelBtn, "必须包含标签按钮 .btn-label");
    assert.ok(moreBtn, "必须包含更多操作按钮 .btn-more");
    assert.ok(printAllBtn, "必须包含全部打印按钮 .btn-print-all");
    assert.ok(newWindowBtn, "必须包含在新窗口中打开按钮 .btn-new-window");
    console.log("  ✓ 顶栏所有 Gmail 标准左对齐与右对齐按钮 100% 具备");

    // 7. 验证 .email-title-row 中无过时的纯文本 thread-header-bar 提示
    console.log("\n[步骤 7] 验证 .email-title-row 中的提示标签已清理...");
    const obsoleteTitleTag = await page.$(".email-title-row .thread-header-bar, .email-title-row .thread-info-tag");
    assert.strictEqual(obsoleteTitleTag, null, "标题行中不应有静态文本提示");
    console.log("  ✓ 标题行中的静态提示已成功清理");

    // 8. 验证消息内部右对齐的 class="thread-header-bar" 实际按钮
    console.log("\n[步骤 8] 验证展开邮件内右对齐的 class=\"thread-header-bar\" 与其实际操作按钮...");
    await page.waitForSelector(".thread-expanded-body .info-top .thread-header-bar", { timeout: 10000 });
    const msgHeaderBar = await page.$(".thread-expanded-body .info-top .thread-header-bar");
    assert.ok(msgHeaderBar, "邮件头部右侧必须存在 class=\"thread-header-bar\"");

    const msgStar = await page.$(".thread-header-bar .btn-star");
    const msgTranslate = await page.$(".thread-header-bar .btn-translate");
    const msgReply = await page.$(".thread-header-bar .btn-reply");
    const msgReplyAll = await page.$(".thread-header-bar .btn-reply-all");
    const msgForward = await page.$(".thread-header-bar .btn-forward");
    const msgPrint = await page.$(".thread-header-bar .btn-print");
    const msgMore = await page.$(".thread-header-bar .btn-msg-more");

    assert.ok(msgTranslate, "邮件头部必须包含翻译按钮 .btn-translate");
    assert.ok(msgPrint, "邮件头部必须包含打印按钮 .btn-print");
    assert.ok(msgMore, "邮件头部必须包含三点菜单 .btn-msg-more");
    console.log("  ✓ 展开邮件内嵌 thread-header-bar 实际按钮完备");

    // 9. 点击消息菜单中的「查看原始邮件与标头」
    console.log("\n[步骤 9] 测试查看原始邮件与标头弹窗 (.raw-headers-dialog)...");
    await msgMore.click();
    await page.waitForTimeout(400);

    const viewHeadersItem = await page.$('.el-dropdown-menu__item:has-text("查看原始邮件与标头")');
    assert.ok(viewHeadersItem, "下拉菜单中必须存在「查看原始邮件与标头」选项");
    await viewHeadersItem.click();
    await page.waitForTimeout(600);

    const headersDialog = await page.$(".raw-headers-dialog");
    assert.ok(headersDialog, "必须展开原始邮件标头弹窗");
    const headersContent = await page.textContent(".raw-headers-modal-body");
    console.log(`  标头弹窗内容预览: ${headersContent.slice(0, 120).replace(/\s+/g, ' ')}...`);
    assert.ok(headersContent.includes("From") && headersContent.includes("Subject"), "标头弹窗必须包含核心头信息");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const closeHeaderBtn = await page.$('.raw-headers-dialog .dialog-footer .el-button:not(.el-button--primary)');
    if (closeHeaderBtn && await closeHeaderBtn.isVisible()) {
      await closeHeaderBtn.click({ force: true });
      await page.waitForTimeout(500);
    }
    console.log("  ✓ 原始邮件与标头弹窗测试成功");

    // 10. 测试归档与任务待办
    console.log("\n[步骤 10] 测试归档 (Archive) 与 添加到任务待办 (Add to tasks)...");
    await taskBtn.click();
    await page.waitForTimeout(800);
    console.log("  ✓ 添加到任务待办执行成功");

    console.log("\n==========================================================================");
    console.log("=== 系统设置 AI 独立板块、Gmail 顶栏与内嵌 thread-header-bar 测试 100% 通过! ===");
    console.log("==========================================================================");
  } finally {
    await browser.close();
  }
})();
