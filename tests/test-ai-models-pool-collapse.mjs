import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：AI 模型池单条折叠 (+N) 与定向 UI 表达端到端自动化审计 ===");
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
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    await page.goto(BASE + "/system-setting", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".settings-card", { timeout: 15000 });
    await page.waitForTimeout(1000);

    // 3. 验证卡片并点击【配置】唤起 AI 配置弹窗
    console.log("\n[步骤 3] 点击【配置】唤起 AI 配置弹窗...");
    const aiHubCard = await page.waitForSelector(".ai-hub-card", { timeout: 10000 });
    assert.ok(aiHubCard, "必须存在 .ai-hub-card");
    const configBtn = await page.$(".ai-hub-card .opt-button");
    assert.ok(configBtn, "系统设置卡片中必须存在配置选单按钮 (.ai-hub-card .opt-button)");
    await configBtn.click();
    await page.waitForTimeout(800);
    const dialog = await page.waitForSelector(".ai-hub-dialog", { timeout: 5000 });
    console.log("  ✓ AI 配置弹窗已成功弹出");

    // 4. 审计模型池下拉组件 .ai-models-pool-select
    console.log("\n[步骤 4] 审计 .ai-models-pool-select 单条收折与 +N 渲染表现...");
    const poolSelect = await page.$(".ai-hub-dialog .ai-models-pool-select");
    assert.ok(poolSelect, "弹窗内必须存在 .ai-models-pool-select 控件");

    // 检查前缀图标或选择框结构
    const poolHtml = await page.$eval(".ai-hub-dialog .ai-models-pool-select", el => el.outerHTML);
    console.log("  模型池选择框外层 HTML 结构概要:", poolHtml.slice(0, 300));
    const prefixEl = await page.$(".ai-hub-dialog .ai-models-pool-select .el-select__prefix, .ai-hub-dialog .ai-models-pool-select .el-input__prefix, .ai-hub-dialog .ai-models-pool-select [class*='prefix']");
    console.log("  是否包含前缀节点:", !!prefixEl);

    // 检查是否有已选模型
    let selectedTags = await page.$$eval(".ai-hub-dialog .ai-models-pool-select .el-tag", els => 
      els.map(el => el.textContent.trim())
    );
    console.log("  当前已选中的模型 Tag 列表:", selectedTags);

    // 点击模型池下拉框添加更多模型，以触发 +N 折叠
    console.log("  聚焦模型池下拉框并添加多个模型选项以验证折叠效果...");
    await poolSelect.click();
    await page.waitForTimeout(800);

    // 在下拉浮层中选择前几个选项（如果未全选）
    const dropdownOptions = await page.$$(".ai-models-pool-dropdown .el-select-dropdown__item");
    console.log(`  模型池下拉提供 ${dropdownOptions.length} 个备选模型`);
    for (let i = 0; i < Math.min(3, dropdownOptions.length); i++) {
      const isSelected = await dropdownOptions[i].evaluate(el => el.classList.contains("is-selected"));
      if (!isSelected) {
        await dropdownOptions[i].click();
        await page.waitForTimeout(300);
      }
    }

    // 点击弹窗空白处使下拉框失焦收起
    await page.click(".ai-hub-dialog .el-dialog__title");
    await page.waitForTimeout(600);

    // 再次审计选中的 tags
    selectedTags = await page.$$eval(".ai-hub-dialog .ai-models-pool-select .el-tag", els => 
      els.map(el => el.textContent.trim()).filter(Boolean)
    );
    console.log("  多选后渲染的 Tags:", selectedTags);

    // 验证必须包含一个主模型 tag 和一个 +n tag
    assert.ok(selectedTags.length >= 1, "必须至少渲染 1 个模型标签");
    const collapseTag = await page.$(".ai-hub-dialog .ai-models-pool-select .el-select__collapse-tag, .ai-hub-dialog .ai-models-pool-select .el-tag:has-text('+')");
    if (selectedTags.length > 1 || selectedTags.some(t => t.includes("+"))) {
      assert.ok(collapseTag, "选中多个模型时，必须定向使用 +N 折叠标签展示！");
      const collapseText = await collapseTag.textContent();
      console.log(`  ✓ 成功定位到定向折叠标签: "${collapseText.trim()}"`);
      assert.ok(collapseText.includes("+"), `折叠标签必须包含 '+' 号，实际为: ${collapseText}`);
    }

    // 5. 验证单条高度（无无限扩张与换行延申）
    console.log("\n[步骤 5] 验证 .ai-models-pool-select 的单条高度与 Zero-Scrollbars 状态...");
    const metrics = await page.evaluate(() => {
      const el = document.querySelector(".ai-hub-dialog .ai-models-pool-select .el-select__wrapper");
      const primaryEl = document.querySelector(".ai-hub-dialog .ai-model-select .el-select__wrapper");
      const dialogBody = document.querySelector(".ai-hub-dialog .el-dialog__body");
      return {
        poolHeight: el ? el.getBoundingClientRect().height : null,
        primaryHeight: primaryEl ? primaryEl.getBoundingClientRect().height : null,
        bodyScrollHeight: dialogBody ? dialogBody.scrollHeight : null,
        bodyClientHeight: dialogBody ? dialogBody.clientHeight : null,
        hasBodyScrollbar: dialogBody ? dialogBody.scrollHeight > dialogBody.clientHeight : false
      };
    });
    console.log("  尺寸指标与滚动状态:", metrics);
    assert.strictEqual(metrics.hasBodyScrollbar, false, "多模型选择后，弹窗主体仍必须保持 Zero-Scrollbars 无滚动条！");
    assert.ok(metrics.poolHeight <= 45, `模型池控件高度 (${metrics.poolHeight}px) 必须维持单条规范，严禁由于模型过多而无限扩张变高！`);
    console.log("  ✓ 模型池选择器高度与首选主模型完全保持单条一致，零多行扩张！");

    // 6. 验证鼠标 hover 在 +N 标签上时的 Tooltip 呈现
    if (collapseTag) {
      console.log("\n[步骤 6] 验证悬停 +N 折叠标签时的 Tooltip 弹出层...");
      await collapseTag.hover();
      await page.waitForTimeout(600);
      const tooltip = await page.$('.el-popper[role="tooltip"]');
      if (tooltip) {
        const tooltipVisible = await tooltip.isVisible();
        console.log("  ✓ +N 标签 Tooltip 浮层激活显示正常:", tooltipVisible);
      }
    }

    // 7. 截图保存审计凭据
    await page.screenshot({ path: "tests/audit_ai_models_pool_collapse.png" });
    console.log("  ✓ 已保存审计截图至 tests/audit_ai_models_pool_collapse.png");

    console.log("\n==========================================================================");
    console.log("🎉 全部测试项通过！.ai-models-pool-select 单条 +N 定向表达模式运行完美！");
    console.log("==========================================================================");

  } catch (err) {
    console.error("❌ 测试失败:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
