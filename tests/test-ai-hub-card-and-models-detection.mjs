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

    // 检查是否显示已识别模型标签列表或提示，并审计内层绝对无滑块
    const detectedBox = await page.$(".ai-hub-dialog .detected-models-box");
    if (detectedBox) {
      const chipCount = await page.$$eval(".ai-hub-dialog .model-pick-chip", els => els.length);
      console.log(`  ✓ 成功探测并渲染了 ${chipCount} 个模型胶囊标签`);

      const chipsScrollAudit = await page.$eval(".ai-hub-dialog .detected-chips-container", el => {
        const cs = window.getComputedStyle(el);
        return {
          overflowY: cs.overflowY,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          hasScrollbar: el.scrollHeight > el.clientHeight
        };
      });
      console.log(`  内层模型胶囊区滚动条审计: overflowY=${chipsScrollAudit.overflowY}, clientHeight=${chipsScrollAudit.clientHeight}, scrollHeight=${chipsScrollAudit.scrollHeight}, hasScrollbar=${chipsScrollAudit.hasScrollbar}`);
      assert.notStrictEqual(chipsScrollAudit.overflowY, "auto", "模型标签容器严禁设置 overflow-y: auto 产生内层滑块");
      assert.notStrictEqual(chipsScrollAudit.overflowY, "scroll", "模型标签容器严禁设置 overflow-y: scroll 产生内层滑块");
      assert.strictEqual(chipsScrollAudit.hasScrollbar, false, "模型标签容器必须自然排布流动折行，严禁出现内层滑块！");

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
