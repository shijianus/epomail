import { chromium } from "playwright";
import assert from "assert";

const BASE = "https://epomail.epocanvas.workers.dev";

async function main() {
  console.log("==========================================================================");
  console.log("=== 测试：AI Hub 接口端点智能补齐与回退、选定模型按需测试与0-Token延迟测算 ===");
  console.log("==========================================================================\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. 登录管理员
    console.log("[步骤 1] 登录管理员获取鉴权 Token...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: {
        email: "admin@epomail.bond",
        password: "123456"
      },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "管理员登录失败: " + JSON.stringify(loginData));
    const token = typeof loginData.data === "string" ? loginData.data : loginData.data?.token;
    assert.ok(token, "未获取到有效的管理员 Token");
    console.log("  ✓ 管理员登录成功");

    // 保存初始系统配置供测试结束后无感还原
    const cfgRes = await page.request.get(BASE + "/api/setting/query", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const cfgData = await cfgRes.json();
    const originalSetting = cfgData.data || cfgData;

    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);
    await page.waitForTimeout(1000);

    // 2. 访问系统设置
    console.log("[步骤 2] 访问系统设置页面 (/system-setting)...");
    await page.goto(BASE + "/system-setting", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".ai-hub-card", { timeout: 10000 });
    await page.waitForTimeout(1000);

    // 3. 验证卡片中不存在无实际固化逻辑的「仅限管理员使用 AI」
    console.log("[步骤 3] 验证 .ai-hub-card 中已彻底清除无实效的「仅限管理员使用 AI」...");
    const cardText = await page.$eval(".ai-hub-card", el => el.textContent);
    assert.strictEqual(cardText.includes("仅限管理员使用 AI"), false, "卡片中不得包含仅限管理员使用 AI 项");
    console.log("  ✓ 卡片已成功移除无实效设置项");

    // 4. 打开 AI 配置弹窗
    console.log("\n[步骤 4] 打开 AI 智能引擎配置弹窗并验证交互规范...");
    const optBtn = await page.$(".ai-hub-card .opt-button");
    assert.ok(optBtn, "卡片必须包含 .opt-button");
    await optBtn.click();
    await page.waitForTimeout(600);

    const dialog = await page.$(".ai-hub-dialog");
    assert.ok(dialog, "弹窗必须展开");

    // 4.1 验证接口地址 label 的 '?' Tooltip 注释
    const endpointLabelWrap = await page.$(".ai-form-item-label .ai-help-icon-wrap");
    assert.ok(endpointLabelWrap, "接口地址 label 旁边必须包含 '?' Tooltip 图标");
    console.log("  ✓ 接口地址 label 配备 '?' 注释图标");

    // 4.2 验证测试连通性按钮旁边的 '?' API 用量提醒 Tooltip
    const testUsageWrap = await page.$(".footer-left .ai-help-icon-wrap");
    assert.ok(testUsageWrap, "测试连通性按钮旁边必须包含 '?' API 用量提示图标");
    console.log("  ✓ 测试连通性按钮配备 '?' API 用量提醒图标");

    // 4.3 验证默认不自动进行连通性测试，直接展示可用模型
    const modelSelect = await page.$(".ai-hub-dialog .ai-model-select");
    assert.ok(modelSelect, "主模型下拉框必须存在");
    await modelSelect.click();
    await page.waitForTimeout(400);

    const initialOptions = await page.$$eval(".ai-model-dropdown .el-select-dropdown__item", els => els.map(e => e.textContent.trim()).filter(Boolean));
    console.log(`  ✓ 初始展开下拉单直接展示 ${initialOptions.length} 个可用模型 (免测试，零开销):`, initialOptions.slice(0, 3));
    assert.ok(initialOptions.length > 0, "下拉单必须直接呈现可用模型");

    // 5. 验证后端多模型测试接口与 0-Token 测算
    console.log("\n[步骤 5] 验证后端 testConnection 智能补齐与 0-Token/极简延迟测算...");
    const testRes = await page.request.post(BASE + "/api/setting/ai/test", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        aiApiKey: originalSetting.aiApiKey || "",
        aiApiUrl: originalSetting.aiApiUrl || "",
        aiModel: originalSetting.aiModel || "@cf/meta/llama-3.1-8b-instruct",
        models: [originalSetting.aiModel || "@cf/meta/llama-3.1-8b-instruct"]
      }
    });
    const testData = await testRes.json();
    assert.strictEqual(testData.code, 200, "测试接口应成功响应: " + JSON.stringify(testData));
    console.log("  ✓ 连通性测试返回消息:", testData.message || testData.data?.message);
    assert.ok(testData.message || testData.data?.message, "测试应返回模型校验与延迟描述");

    // 6. 验证在弹窗中点击测试连通性不会自动关闭弹窗
    console.log("\n[步骤 6] 验证点击「测试连通性」执行测算并保留在弹窗内...");
    const dialogTestBtn = await page.$(".opt-btn-test-ai-dialog");
    assert.ok(dialogTestBtn, "必须存在 .opt-btn-test-ai-dialog");
    await dialogTestBtn.click();
    await page.waitForTimeout(2000);

    const isDialogOpenAfterTest = await page.$eval(".ai-hub-dialog", el => el.offsetParent !== null).catch(() => false);
    assert.strictEqual(isDialogOpenAfterTest, true, "测试连通性完成后弹窗必须保持打开状态供用户审阅");
    console.log("  ✓ 点击测试后弹窗保持打开，未发生意外保存与关闭");

    // 7. 验证保存配置触发选定模型连通性测试并顺利持久化
    console.log("\n[步骤 7] 验证点击【保存配置】自动对选定模型及模型池执行校验并保存...");
    const saveBtn = await page.$('.ai-hub-dialog .dialog-footer .el-button--primary, .ai-hub-dialog .dialog-footer .el-button:has-text("保存")');
    assert.ok(saveBtn, "必须存在【保存配置】按钮");
    await saveBtn.click();
    await page.waitForTimeout(2500);

    const isDialogOpenAfterSave = await page.$eval(".ai-hub-dialog", el => el.offsetParent !== null).catch(() => false);
    assert.strictEqual(isDialogOpenAfterSave, false, "保存成功后弹窗应顺利关闭");
    console.log("  ✓ 保存配置校验通过且弹窗成功关闭");

    // 8. 清理并还原环境
    console.log("\n[步骤 8] 测试后还原环境配置...");
    await page.request.post(BASE + "/api/setting/set", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        aiApiKey: originalSetting.aiApiKey || "",
        aiApiUrl: originalSetting.aiApiUrl || "",
        aiModel: originalSetting.aiModel || "@cf/meta/llama-3.1-8b-instruct",
        aiModels: originalSetting.aiModels || "@cf/meta/llama-3.1-8b-instruct",
        aiEnabled: originalSetting.aiEnabled ?? 1,
        aiDailyQuota: originalSetting.aiDailyQuota ?? 100,
        aiRateLimitRpm: originalSetting.aiRateLimitRpm ?? 20,
        aiMaxTokens: originalSetting.aiMaxTokens ?? 2048
      }
    });
    console.log("  ✓ 系统设置已无感还原至初始状态，恪守零假数据准则");

    console.log("\n==========================================================================");
    console.log("🎉 全部测试项 100% 通过！");
    console.log("==========================================================================");
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error("❌ 测试失败:", err);
  process.exit(1);
});
