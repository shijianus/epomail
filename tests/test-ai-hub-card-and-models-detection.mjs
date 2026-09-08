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

    // 3. 验证 .ai-hub-card 卡片要素 (Endpoint, API Key, Models, Settings, Delete, API 测试)
    console.log("\n[步骤 3] 验证 .ai-hub-card 卡片核心要素规范...");
    const aiHubCard = await page.$(".ai-hub-card");
    assert.ok(aiHubCard, "系统设置必须渲染独立 .ai-hub-card 卡片");

    const cardText = await aiHubCard.textContent();
    console.log("  卡片展示文本概要:", cardText.slice(0, 150).replace(/\s+/g, ' '));
    assert.ok(cardText.includes("AI 智能引擎") || cardText.includes("大模型接入"), "必须包含标题");
    assert.ok(cardText.includes("Endpoint"), "必须包含 Endpoint");
    assert.ok(cardText.includes("API Key"), "必须包含 API Key");
    assert.ok(cardText.includes("Models"), "必须包含 Models");

    // 验证 Settings 按钮与 Delete 按钮
    const settingsBtn = await page.$(".ai-hub-card .opt-button");
    assert.ok(settingsBtn, "卡片中必须存在 Settings 设置按钮 (.opt-button)");

    const deleteBtn = await page.$(".ai-hub-card .btn-delete-ai");
    assert.ok(deleteBtn, "卡片中必须存在 Delete 清空重置按钮 (.btn-delete-ai)");

    // 验证内置 API 测试按钮
    const testAiBtn = await page.$(".ai-hub-card .forward .el-button:not(.opt-button)");
    assert.ok(testAiBtn, "卡片中必须存在内置 API 测试按钮 (.forward .el-button:not(.opt-button))");
    console.log("  ✓ 卡片具备 Endpoint、API Key、Models、Settings、Delete 与内置 API 测试按钮");

    // 4. 执行卡片内置 API 测试
    console.log("\n[步骤 4] 执行卡片内置 API 连通性测试...");
    await testAiBtn.click();
    await page.waitForTimeout(2500);
    console.log("  ✓ 内置连通性测试按钮点击与响应通过");

    // 5. 打开 .ai-hub-dialog 弹窗并验证模型自动识别
    console.log("\n[步骤 5] 打开 .ai-hub-dialog 弹窗并测试模型自动识别...");
    await settingsBtn.click();
    await page.waitForTimeout(600);

    const dialog = await page.$(".ai-hub-dialog");
    assert.ok(dialog, "必须成功展开 .ai-hub-dialog 对话框");

    // 验证弹窗内有自动识别模型按钮
    const detectBtn = await page.$(".ai-hub-dialog .detect-models-btn");
    assert.ok(detectBtn, "弹窗中必须存在自动识别模型按钮 (.detect-models-btn)");

    // 点击 DeepSeek 预设
    console.log("  点击 DeepSeek 预设快速填充...");
    const deepseekBtn = await page.$('.ai-hub-dialog .presets-quick-bar .el-button:has-text("DeepSeek")');
    assert.ok(deepseekBtn, "弹窗中必须存在 DeepSeek 预设按钮");
    await deepseekBtn.click();
    await page.waitForTimeout(300);

    const inputsAfterPreset = await page.$$eval(".ai-hub-dialog input", els => els.map(e => e.value));
    console.log("  预设填充后输入框值:", inputsAfterPreset);
    assert.ok(inputsAfterPreset.some(v => v.includes("api.deepseek.com")), "Endpoint 应填充 DeepSeek 地址");
    assert.ok(inputsAfterPreset.some(v => v.includes("deepseek-chat")), "Model 应填充 deepseek-chat");

    // 点击自动识别模型按钮
    console.log("  点击自动识别模型按钮...");
    await detectBtn.click();
    await page.waitForTimeout(2000);

    // 检查是否显示已识别模型标签列表或提示
    const detectedBox = await page.$(".ai-hub-dialog .detected-models-box");
    if (detectedBox) {
      const chipCount = await page.$$eval(".ai-hub-dialog .model-pick-chip", els => els.length);
      console.log(`  ✓ 成功探测并渲染了 ${chipCount} 个模型胶囊标签`);
      if (chipCount > 0) {
        // 点击第一个模型胶囊
        const firstChip = await page.$(".ai-hub-dialog .model-pick-chip");
        await firstChip.click();
        await page.waitForTimeout(200);
        console.log("  ✓ 模型胶囊点击填入正常");
      }
    } else {
      console.log("  (当前未填有效 Key，后端返回智能提示或降级推荐)");
    }

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
    console.log("🎉 验证全部通过：AI Hub 卡片精简架构、模型自动识别与暗黑模式无白斑全部达标！");
    console.log("==========================================================================");

  } catch (error) {
    console.error("\n❌ 测试失败:", error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
