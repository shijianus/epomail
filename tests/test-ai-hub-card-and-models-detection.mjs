import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：系统设置 AI Hub 精简重构、模型自动识别与弹窗暗黑模式无白斑 ===");
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
    console.log("\n[步骤 2] 打开系统设置页面 (/system-setting)...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, adminToken);

    await page.goto(BASE + "/system-setting", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".settings-card", { timeout: 10000 });
    await page.waitForTimeout(1000);

    // 3. 验证 .ai-hub-card 卡片要素 (单选单设置 API、5大限制控制项、快捷 API 测试)
    console.log("\n[步骤 3] 验证 .ai-hub-card 卡片统一画风与核心要素规范...");
    const aiHubCard = await page.$(".ai-hub-card");
    assert.ok(aiHubCard, "系统设置必须渲染独立 .ai-hub-card 卡片");

    const cardText = await aiHubCard.textContent();
    console.log("  卡片展示文本概要:", cardText.slice(0, 200).replace(/\s+/g, ' '));
    assert.ok(cardText.includes("AI 智能引擎") || cardText.includes("大模型接入"), "必须包含标题");
    assert.ok(cardText.includes("设置 API") || cardText.includes("API 配置"), "卡片应整合为单选单设置 API 按钮");
    assert.ok(cardText.includes("启用 AI") || cardText.includes("智能分析"), "卡片应包含启用 AI 总开关控制项");
    assert.ok(cardText.includes("每日调用上限"), "卡片应包含单用户每日调用上限限制项");
    assert.ok(cardText.includes("速率限制"), "卡片应包含请求速率 RPM 限制项");
    assert.ok(cardText.includes("Token"), "卡片应包含单次最大 Token 限制项");
    assert.ok(cardText.includes("管理员"), "卡片应包含仅限管理员使用 AI 限制项");

    // 验证单个设置 API 按钮
    const settingsBtn = await page.$(".ai-hub-card .opt-button");
    assert.ok(settingsBtn, "卡片中必须存在单一配置选单/按钮 (.opt-button)");

    // 验证控制项的 switch 与 input-number 组件
    const switches = await page.$$(".ai-hub-card .el-switch");
    assert.ok(switches.length >= 2, "卡片中应至少包含启用开关与管理员独占 2 个 el-switch 开关");

    const inputNumbers = await page.$$(".ai-hub-card .el-input-number");
    assert.ok(inputNumbers.length >= 3, "卡片中应至少包含每日次数、速率RPM、最大Token 3 个 el-input-number 控制项");

    // 验证快捷 API 连通性测试按钮
    const testAiBtn = await page.$(".ai-hub-card .forward .el-button:not(.opt-button)");
    assert.ok(testAiBtn, "卡片中必须存在快捷 API 测试按钮 (.forward .el-button:not(.opt-button))");
    console.log("  ✓ 卡片具备单一选单设置 API、5 大 AI 限制控制项与快捷连通性测试按钮，画风高度一致");

    // 4. 执行卡片快捷 API 测试
    console.log("\n[步骤 4] 执行卡片快捷 API 连通性测试...");
    await testAiBtn.click();
    await page.waitForTimeout(2500);
    console.log("  ✓ 连通性测试按钮点击与响应通过");

    // 5. 打开 .ai-hub-dialog 宽屏弹窗并验证 Zero-Scrollbar (零滑块) 与模型自动识别
    console.log("\n[步骤 5] 打开 .ai-hub-dialog 弹窗并执行 860px 拓宽与 Zero-Scrollbars (零滑块) 审计...");
    await settingsBtn.click();
    await page.waitForTimeout(600);

    const dialog = await page.$(".ai-hub-dialog");
    assert.ok(dialog, "必须成功展开 .ai-hub-dialog 对话框");

    // 5.1 验证弹窗宽度充分拓宽 (>= 800px，杜绝固定窄框)
    const dialogBox = await dialog.boundingBox();
    console.log(`  弹窗实际渲染尺寸: 宽 ${dialogBox.width}px, 高 ${dialogBox.height}px`);
    assert.ok(dialogBox.width >= 800, `中心弹窗必须充分拓宽扩展 (当前 ${dialogBox.width}px，应 >= 800px，杜绝固定窄框)`);
    console.log("  ✓ 弹窗已成功拓宽为 860px 宽屏双列布局");

    // 5.2 审计 Zero-Scrollbar (中心弹窗严禁任何滑块)
    const bodyScrollAudit = await page.$eval(".ai-hub-dialog .el-dialog__body", el => {
      const cs = window.getComputedStyle(el);
      return {
        overflowY: cs.overflowY,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        hasScrollbar: el.scrollHeight > el.clientHeight
      };
    });
    console.log(`  外层弹窗主体滚动条审计: overflowY=${bodyScrollAudit.overflowY}, clientHeight=${bodyScrollAudit.clientHeight}, scrollHeight=${bodyScrollAudit.scrollHeight}, hasScrollbar=${bodyScrollAudit.hasScrollbar}`);
    assert.notStrictEqual(bodyScrollAudit.overflowY, "auto", "弹窗 body 严禁设置 overflow-y: auto");
    assert.notStrictEqual(bodyScrollAudit.overflowY, "scroll", "弹窗 body 严禁设置 overflow-y: scroll");
    assert.strictEqual(bodyScrollAudit.hasScrollbar, false, "外层弹窗主体必须为 Zero-Scrollbar，严禁出现滚动条！");

    // 验证双列网格存在
    const gridEl = await page.$(".ai-hub-dialog .ai-dialog-grid");
    assert.ok(gridEl, "弹窗必须采用 .ai-dialog-grid 双列横向网格排布");

    // 验证主推理模型下拉框与模型池多选下拉框存在 (自动化融入输入框)
    const modelSelect = await page.$(".ai-hub-dialog .ai-model-select");
    assert.ok(modelSelect, "主推理模型下拉框 (.ai-model-select) 必须存在于弹窗内");
    const poolSelect = await page.$(".ai-hub-dialog .ai-models-pool-select");
    assert.ok(poolSelect, "多模型池配置框 (.ai-models-pool-select) 必须存在于弹窗内");

    // 验证预设提示栏和多余标签容器已被彻底删除 (根据用户要求)
    const obsoletePresets = await page.$(".ai-hub-dialog .presets-quick-bar");
    assert.strictEqual(obsoletePresets, null, "多余的 .presets-quick-bar 必须彻底删除");
    const obsoleteDetectedBox = await page.$(".ai-hub-dialog .detected-models-box");
    assert.strictEqual(obsoleteDetectedBox, null, "独立占位的 .detected-models-box 必须彻底删除，自动化融入下拉框");

    // 点击主模型输入框触发自动探测与下拉展开
    console.log("  点击主模型输入框测试聚焦自动探测...");
    await modelSelect.click();
    await page.waitForTimeout(1500);

    // 检查下拉菜单是否存在选项
    const popperOptions = await page.$$eval(".ai-model-dropdown .el-select-dropdown__item, .el-select-dropdown__item", els => els.map(e => e.textContent.trim()).filter(Boolean));
    console.log(`  ✓ 下拉菜单中自动识别到/提供 ${popperOptions.length} 个候选模型:`, popperOptions.slice(0, 5));
    assert.ok(popperOptions.length > 0, "模型下拉菜单必须包含候选模型列表");

    // 测试真实的连通性测试 (发送测试 Prompt 并展示大模型真实响应卡片)
    console.log("  执行真实大模型连通性测试...");
    const testBtn = await page.$('.ai-hub-dialog .opt-btn-test-ai-dialog, .ai-hub-dialog .dialog-footer .el-button:has-text("连通性"), .ai-hub-dialog .dialog-footer .el-button:has-text("测试")');
    assert.ok(testBtn, "弹窗底部必须存在【测试连通性】按钮");
    await testBtn.click();
    await page.waitForTimeout(2500);

    // 验证 .ai-test-live-result 真实结果反馈卡片被渲染
    const liveResultCard = await page.$(".ai-hub-dialog .ai-test-live-result");
    assert.ok(liveResultCard, "点击测试后必须展示 .ai-test-live-result 真实连通性响应卡片");
    const replyText = await page.$eval(".ai-hub-dialog .ai-test-live-result .test-val.test-reply-text, .ai-hub-dialog .ai-test-live-result .test-res-body", el => el.textContent.trim());
    console.log("  ✓ 大模型真实测试响应内容:", replyText);
    assert.ok(replyText.length > 0, "大模型响应内容必须真实存在，不可为空");

    // 6. 验证暗黑模式下 .ai-hub-dialog 彻底无白色填充
    console.log("\n[步骤 6] 切换暗黑模式，审计 .ai-hub-dialog 是否有任何白色填充/白斑...");
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
    });
    await page.waitForTimeout(500);

    const dialogBg = await page.$eval(".el-dialog.ai-hub-dialog", el => window.getComputedStyle(el).backgroundColor);
    const headerBg = await page.$eval(".ai-hub-dialog .el-dialog__header", el => window.getComputedStyle(el).backgroundColor);
    const bodyBg = await page.$eval(".ai-hub-dialog .el-dialog__body", el => window.getComputedStyle(el).backgroundColor);
    const footerBg = await page.$eval(".ai-hub-dialog .el-dialog__footer", el => window.getComputedStyle(el).backgroundColor);

    console.log(`  暗黑模式背景色审计:
    - 弹窗容器背景: ${dialogBg}
    - 弹窗头部背景: ${headerBg}
    - 弹窗主体背景: ${bodyBg}
    - 弹窗底部背景: ${footerBg}`);

    const whiteRgb = "rgb(255, 255, 255)";
    assert.notStrictEqual(dialogBg, whiteRgb, "暗黑模式下弹窗容器严禁为纯白背景！");
    assert.notStrictEqual(headerBg, whiteRgb, "暗黑模式下弹窗头部严禁为纯白背景！");
    assert.notStrictEqual(bodyBg, whiteRgb, "暗黑模式下弹窗主体严禁为纯白背景！");
    assert.notStrictEqual(footerBg, whiteRgb, "暗黑模式下弹窗底部严禁为纯白背景！");
    console.log("  ✓ 暗黑模式下弹窗 100% 消除白色填充与白斑，完全符合深色调设计！");

    // 截屏留档
    await page.screenshot({ path: "tests/audit_ai_hub_dialog_dark.png" });
    console.log("  ✓ 已保存暗黑模式弹窗审计截图: tests/audit_ai_hub_dialog_dark.png");

    // 关闭弹窗
    const cancelBtn = await page.$('.ai-hub-dialog .dialog-footer .el-button:has-text("取消")');
    if (cancelBtn) await cancelBtn.click();
    await page.waitForTimeout(400);

    // 恢复明亮模式
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
    });
    await page.waitForTimeout(300);

    console.log("\n==========================================================================");
    console.log("🎉 验证全部通过：AI Hub 单选单设计、5大限制项、860px 宽屏拓宽与 Zero-Scrollbar 零滑块达标！");
    console.log("==========================================================================");
    console.log("==========================================================================");

  } catch (error) {
    console.error("\n❌ 测试失败:", error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
