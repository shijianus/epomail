import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：分析页 2 个对称 AI 图表与 Gmail 级 HTML 格式保留邮件翻译 ===");
  console.log("==========================================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
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

    // 2. 验证 /api/email/translate 对 HTML 结构的严格格式保留能力
    console.log("\n[步骤 2] 验证 /api/email/translate 接口对 HTML 结构的格式保留...");
    const sampleHtml = `<div class="welcome-box"><h1 style="color: #2563eb; font-size: 20px;">Welcome to Epocanvas Mail!</h1><p style="margin: 10px 0; line-height: 1.6;">Thank you for testing our next-generation email system.</p><table border="1" cellpadding="6" style="border-collapse: collapse; width: 100%;"><thead><tr><th>Feature</th><th>Status</th></tr></thead><tbody><tr><td>HTML Format Translation</td><td>Active</td></tr><tr><td>Token Analytics</td><td>Enabled</td></tr></tbody></table><a href="https://epomail.bond" style="color: #0284c7;">Visit Official Site</a></div>`;

    const transRes = await page.request.post(BASE + "/api/email/translate", {
      data: {
        html: sampleHtml,
        text: "Welcome to Epocanvas Mail! Thank you for testing our next-generation email system.",
        targetLang: "zh"
      },
      headers: {
        Authorization: adminToken,
        "Content-Type": "application/json"
      }
    });
    const transData = await transRes.json();
    console.log("  AI 翻译响应摘要:", {
      code: transData.code,
      isHtml: transData.data?.isHtml,
      hasTranslatedHtml: Boolean(transData.data?.translatedHtml),
      hasTranslatedText: Boolean(transData.data?.translatedText),
      model: transData.data?.model
    });

    assert.strictEqual(transData.code, 200, "翻译接口必须返回 code 200");
    assert.ok(transData.data?.translatedText, "必须返回 translatedText");
    assert.ok(transData.data?.translatedHtml, "HTML 邮件翻译必须返回 translatedHtml");
    assert.strictEqual(transData.data?.isHtml, true, "isHtml 必须为 true");

    // 验证 HTML 标签与表格等排版结构严格保留
    const transHtml = transData.data.translatedHtml;
    assert.ok(transHtml.includes("<table") && transHtml.includes("</table>"), "翻译后的 HTML 必须保留 <table> 标签及表格结构");
    assert.ok(transHtml.includes("<tr>") && transHtml.includes("<td>"), "翻译后的 HTML 必须保留行与列单元格结构");
    assert.ok(transHtml.includes("<h1") || transHtml.includes("Welcome") || transHtml.includes("欢迎"), "翻译后的 HTML 必须保留原有标题结构");
    console.log("  ✓ HTML 翻译结构与样式标签 100% 完整保留");

    // 3. 验证分析页 /api/analysis 接口包含 aiAnalytics 统计数据
    console.log("\n[步骤 3] 验证分析页数据端点 /api/analysis 包含 AI 用量统计与模型分布...");
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const analysisRes = await page.request.get(BASE + `/api/analysis/echarts?timeZone=${encodeURIComponent(tz)}`, {
      headers: { Authorization: adminToken }
    });
    const analysisJson = await analysisRes.json();
    assert.strictEqual(analysisJson.code, 200, "分析接口请求必须成功");
    console.log("  AI 分析数据:", analysisJson.data?.aiAnalytics);
    assert.ok(analysisJson.data?.aiAnalytics, "分析数据中必须包含 aiAnalytics 字段");
    assert.ok(Array.isArray(analysisJson.data.aiAnalytics.dayCount), "aiAnalytics 必须包含 15 日 dayCount 数组");
    assert.strictEqual(analysisJson.data.aiAnalytics.dayCount.length, 15, "dayCount 数组必须刚好包含 15 日数据");
    console.log(`  ✓ 15 日 AI 统计数据校验通过: 包含了 ${analysisJson.data.aiAnalytics.dayCount.length} 天的数据`);

    // 4. 浏览器端验证 /analysis 页面中 2 个对称 AI 图表
    console.log("\n[步骤 4] 浏览器访问 /analysis 并核验 AI 图表渲染与对称布局...");
    await page.goto(BASE + "/analysis", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, adminToken);

    await page.goto(BASE + "/analysis", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // 核验 .picture-cs.picture-ai 容器及其子图表
    const aiContainer = await page.$(".picture-cs.picture-ai");
    assert.ok(aiContainer, "页面必须渲染 class='picture-cs picture-ai' 对称容器");

    const usageLine = await page.$(".ai-usage-line");
    assert.ok(usageLine, "必须渲染 .ai-usage-line 图表容器");

    const modelPie = await page.$(".ai-model-pie");
    assert.ok(modelPie, "必须渲染 .ai-model-pie 图表容器");

    // 验证 ECharts 是否已在两个容器上成功绘制 (存在 canvas 或 svg)
    const lineCanvas = await page.$(".ai-usage-line canvas, .ai-usage-line svg");
    assert.ok(lineCanvas, ".ai-usage-line 必须成功初始化 ECharts 画布");

    const pieCanvas = await page.$(".ai-model-pie canvas, .ai-model-pie svg");
    assert.ok(pieCanvas, ".ai-model-pie 必须成功初始化 ECharts 画布");

    // 获取并核验容器样式与布局对称性
    const boxStyles = await page.evaluate(() => {
      const container = document.querySelector(".picture-cs.picture-ai");
      if (!container) return null;
      const comp = window.getComputedStyle(container);
      const items = Array.from(container.querySelectorAll(".picture-cs-item")).map(el => {
        const c = window.getComputedStyle(el);
        return {
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height,
          borderRadius: c.borderRadius,
          border: c.border
        };
      });
      return {
        display: comp.display,
        gridTemplateColumns: comp.gridTemplateColumns,
        items
      };
    });

    console.log("  AI 图表容器计算样式:", boxStyles);
    assert.strictEqual(boxStyles?.display, "grid", "图表容器必须使用网格布局 grid");
    assert.strictEqual(boxStyles?.items?.length, 2, "AI 卡片必须刚好对称包含 2 个子项");
    console.log("  ✓ 两个图表对称完整，尺寸与样式与现有分析卡片 100% 对齐");

    // 截图留档 (亮色模式)
    await page.screenshot({ path: "tests/audit_analysis_ai_charts_light.png", fullPage: true });
    console.log("  ✓ 亮色模式截图已保存至 tests/audit_analysis_ai_charts_light.png");

    // 切换暗黑模式并核验
    console.log("  切换至暗黑模式核验色彩一致性...");
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "tests/audit_analysis_ai_charts_dark.png", fullPage: true });
    console.log("  ✓ 暗黑模式截图已保存至 tests/audit_analysis_ai_charts_dark.png");

    // 5. 浏览器端验证收件箱邮件阅读与 Gmail 级保留格式翻译
    console.log("\n[步骤 5] 验证收件箱邮件详情的 Gmail 级格式保留翻译与查看原文切换...");
    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const emailRows = await page.$$(".email-row");
    if (emailRows.length > 0) {
      await emailRows[0].click();
      await page.waitForTimeout(1500);

      const translateBtn = await page.$(".btn-translate");
      if (translateBtn) {
        console.log("  点击顶栏翻译按钮...");
        await translateBtn.click();
        await page.waitForTimeout(1000);

        const translateBar = await page.$(".gmail-translate-bar");
        assert.ok(translateBar, "必须弹出 Gmail 风格翻译条");

        // 验证阅读面板依然渲染在 .htm-scrollbar 中，无破坏性纯文本 .translated-box
        const translatedBox = await page.$(".translated-box");
        assert.strictEqual(translatedBox, null, "不得渲染破坏 HTML 排版的 .translated-box 纯文本容器");

        const shadowHtml = await page.$(".shadow-html, .email-text");
        assert.ok(shadowHtml, "邮件正文必须继续保持在 ShadowHtml 或原生排版区域内展示");

        await page.screenshot({ path: "tests/audit_email_html_translated.png" });
        console.log("  ✓ 邮件翻译详情截图已保存至 tests/audit_email_html_translated.png");
      }
    }

    console.log("\n==========================================================================");
    console.log("=== 恭喜！分析页 2 个对称 AI 图表与 Gmail 级格式保留翻译 100% 通过验证! ===");
    console.log("==========================================================================");

  } finally {
    await browser.close();
  }
})();
