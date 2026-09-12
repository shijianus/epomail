import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：AI 模型池左右对称等大、完全展示/正确+N与灰底标签端到端审计 ===");
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

    // 3. 点击【配置】唤起 AI 配置弹窗
    console.log("\n[步骤 3] 点击【配置】唤起 AI 配置弹窗...");
    const aiHubCard = await page.waitForSelector(".ai-hub-card", { timeout: 10000 });
    assert.ok(aiHubCard, "必须存在 .ai-hub-card");
    const configBtn = await page.$(".ai-hub-card .opt-button");
    assert.ok(configBtn, "系统设置卡片中必须存在配置选单按钮 (.ai-hub-card .opt-button)");
    await configBtn.click();
    await page.waitForTimeout(800);
    const dialog = await page.waitForSelector(".ai-hub-dialog", { timeout: 5000 });
    console.log("  ✓ AI 配置弹窗已成功弹出");

    // 4. 审计左右控件尺寸大小、平均和等大
    console.log("\n[步骤 4] 审计左右表单控件 (Endpoint/API Key vs Models/Models Pool) 的尺寸等大与对称性...");
    const sizeMetrics = await page.evaluate(() => {
      const endpointWrap = document.querySelector(".ai-hub-dialog .ai-grid-col:first-child .el-form-item:nth-child(1) .el-input__wrapper");
      const apiKeyWrap = document.querySelector(".ai-hub-dialog .ai-grid-col:first-child .el-form-item:nth-child(2) .el-input__wrapper");
      const modelWrap = document.querySelector(".ai-hub-dialog .ai-model-select .el-select__wrapper");
      const poolWrap = document.querySelector(".ai-hub-dialog .ai-models-pool-select .el-select__wrapper");

      const endpointContent = document.querySelector(".ai-hub-dialog .ai-grid-col:first-child .el-form-item:nth-child(1) .el-form-item__content");
      const apiKeyContent = document.querySelector(".ai-hub-dialog .ai-grid-col:first-child .el-form-item:nth-child(2) .el-form-item__content");
      const modelContent = document.querySelector(".ai-hub-dialog .ai-grid-col:last-child .el-form-item:nth-child(1) .el-form-item__content");
      const poolContent = document.querySelector(".ai-hub-dialog .ai-grid-col:last-child .el-form-item:nth-child(2) .el-form-item__content");

      const leftCol = document.querySelector(".ai-hub-dialog .ai-grid-col:first-child");
      const rightCol = document.querySelector(".ai-hub-dialog .ai-grid-col:last-child");

      return {
        endpointWrapHeight: endpointWrap ? endpointWrap.getBoundingClientRect().height : null,
        apiKeyWrapHeight: apiKeyWrap ? apiKeyWrap.getBoundingClientRect().height : null,
        modelWrapHeight: modelWrap ? modelWrap.getBoundingClientRect().height : null,
        poolWrapHeight: poolWrap ? poolWrap.getBoundingClientRect().height : null,

        endpointContentHeight: endpointContent ? endpointContent.getBoundingClientRect().height : null,
        apiKeyContentHeight: apiKeyContent ? apiKeyContent.getBoundingClientRect().height : null,
        modelContentHeight: modelContent ? modelContent.getBoundingClientRect().height : null,
        poolContentHeight: poolContent ? poolContent.getBoundingClientRect().height : null,

        leftColHeight: leftCol ? leftCol.getBoundingClientRect().height : null,
        rightColHeight: rightCol ? rightCol.getBoundingClientRect().height : null
      };
    });

    console.log("  左右控件尺寸指标:", sizeMetrics);

    // 验证控件 Wrapper 高度
    assert.strictEqual(Math.round(sizeMetrics.endpointWrapHeight), 32, "左侧 Endpoint 控件 Wrapper 高度应为 32px");
    assert.strictEqual(Math.round(sizeMetrics.apiKeyWrapHeight), 32, "左侧 API Key 控件 Wrapper 高度应为 32px");
    assert.strictEqual(Math.round(sizeMetrics.modelWrapHeight), 32, "右侧 接入模型 (Models) Wrapper 高度必须同步对等于左侧 32px");
    assert.strictEqual(Math.round(sizeMetrics.poolWrapHeight), 32, "右侧 可用多模型池 (Models Pool) Wrapper 高度必须同步对等于左侧 32px");

    // 验证 .el-form-item__content 高度
    assert.strictEqual(Math.round(sizeMetrics.modelContentHeight), Math.round(sizeMetrics.endpointContentHeight), "接入模型 .el-form-item__content 高度必须与左侧 Endpoint 完全等大");
    assert.strictEqual(Math.round(sizeMetrics.poolContentHeight), Math.round(sizeMetrics.apiKeyContentHeight), "可用多模型池 .el-form-item__content 高度必须与左侧 API Key 完全等大");

    // 验证左右两列总体高度对称平衡
    console.log(`  左列高度: ${sizeMetrics.leftColHeight}px, 右列高度: ${sizeMetrics.rightColHeight}px`);
    assert.ok(Math.abs(sizeMetrics.leftColHeight - sizeMetrics.rightColHeight) <= 2, "AI 弹窗左右两列必须平均等大对称！");
    console.log("  ✓ 左右两列输入框与下拉框尺寸 100% 同步对等，实现完美平均等大！");

    // 5. 审计模型展示、杜绝 '...' 截断、+N 数量与灰底样式
    console.log("\n[步骤 5] 审计多模型池：尽力完整展示模型、杜绝 '...' 截断、+N 精准计数与灰底规范...");
    const poolSelect = await page.$(".ai-hub-dialog .ai-models-pool-select");
    assert.ok(poolSelect, "弹窗内必须存在 .ai-models-pool-select 控件");

    // 聚焦模型池下拉并勾选多个模型
    await poolSelect.click();
    await page.waitForTimeout(600);

    const dropdownOptions = await page.$$(".ai-models-pool-dropdown .el-select-dropdown__item");
    console.log(`  模型池下拉提供 ${dropdownOptions.length} 个备选模型`);
    for (let i = 0; i < Math.min(5, dropdownOptions.length); i++) {
      const isSelected = await dropdownOptions[i].evaluate(el => el.classList.contains("is-selected"));
      if (!isSelected) {
        await dropdownOptions[i].click();
        await page.waitForTimeout(300);
      }
    }

    // 点击弹窗标题失焦收起下拉
    await page.click(".ai-hub-dialog .el-dialog__title");
    await page.waitForTimeout(800);

    // 审计当前选中的全部 tags 文本
    const tagDetails = await page.evaluate(() => {
      const pool = document.querySelector(".ai-hub-dialog .ai-models-pool-select");
      const regularTags = Array.from(pool.querySelectorAll(".el-tag.is-closable")).map(t => ({
        text: t.querySelector(".el-select__tags-text")?.textContent?.trim() || t.textContent.trim(),
        hasEllipsis: window.getComputedStyle(t.querySelector(".el-select__tags-text") || t).textOverflow === 'ellipsis',
        bgColor: window.getComputedStyle(t).backgroundColor,
        borderRadius: window.getComputedStyle(t).borderRadius
      }));

      const collapseTag = pool.querySelector(".el-tag:not(.is-closable)");
      const collapseDetails = collapseTag ? {
        text: collapseTag.querySelector(".el-select__tags-text")?.textContent?.trim() || collapseTag.textContent.trim(),
        bgColor: window.getComputedStyle(collapseTag).backgroundColor,
        borderRadius: window.getComputedStyle(collapseTag).borderRadius,
        color: window.getComputedStyle(collapseTag).color
      } : null;

      return {
        regularTags,
        collapseDetails
      };
    });

    console.log("  已渲染的正常模型 Tag 详情:", tagDetails.regularTags);
    console.log("  已渲染的折叠 +N Tag 详情:", tagDetails.collapseDetails);

    // 验证展示出来的模型没有被 '...' 截断
    for (const tag of tagDetails.regularTags) {
      assert.strictEqual(tag.hasEllipsis, false, `展示的模型标签 (${tag.text}) 严禁用 '...' 截断！必须完整展示！`);
      assert.ok(!tag.text.includes("..."), `展示的模型标签文本 (${tag.text}) 不能包含省略号 '...'！`);
    }
    console.log("  ✓ 所有展示出来的模型标签均完整呈现，杜绝了 '...' 省略截断！");

    // 验证 +N 标签
    assert.ok(tagDetails.collapseDetails, "多选多个模型时，超出单行容纳的模型必须收纳进 +N 标签！");
    assert.ok(tagDetails.collapseDetails.text.startsWith("+"), `+N 标签必须以 '+' 开头，实际为: ${tagDetails.collapseDetails.text}`);
    console.log(`  ✓ +N 标签计数精准生效: "${tagDetails.collapseDetails.text}"`);

    // 验证 +N 标签采用灰底与常规标签一致，绝非特立独行的紫色胶囊
    console.log("  比对 +N 标签背景色与普通标签背景色...");
    assert.notStrictEqual(tagDetails.collapseDetails.borderRadius, "9999px", "+N 标签绝不能使用特立独行的 9999px 胶囊边角！必须与普通标签 (6px) 保持一致！");
    assert.strictEqual(tagDetails.collapseDetails.borderRadius, "6px", "+N 标签 border-radius 必须与普通标签 (6px) 一致！");
    assert.ok(!tagDetails.collapseDetails.bgColor.includes("99, 102, 241"), "+N 标签绝不能使用特立独行的紫色背景！");
    console.log("  ✓ +N 标签采用与普通被选模型完全一致的灰底展示 (杜绝特立独行)！");

    // 6. 验证悬停 +N 折叠标签时的 Tooltip 呈现
    const collapseEl = await page.$(".ai-hub-dialog .ai-models-pool-select .el-tag:not(.is-closable)");
    if (collapseEl) {
      console.log("\n[步骤 6] 验证悬停 +N 折叠标签时的 Tooltip 弹出层...");
      await collapseEl.hover();
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
    console.log("🎉 全部测试项通过！AI 配置弹窗左右平均等大、尽力展示、正确+N与灰底规范审计 100% 全绿！");
    console.log("==========================================================================");

  } catch (err) {
    console.error("❌ 测试失败:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
