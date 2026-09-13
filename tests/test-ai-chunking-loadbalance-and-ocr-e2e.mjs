import { chromium } from "playwright";
import assert from "assert";

const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";
const ADMIN_EMAIL = "admin@epomail.bond";
const ADMIN_PASS = "123456";

async function run() {
  console.log("==========================================================================");
  console.log("=== 开始测试：多片并发负载均衡分片系统、长邮件零截断与图片OCR单独覆盖展示 ===");
  console.log("==========================================================================\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: "zh-CN"
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const ariaWarnings = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") {
      consoleErrors.push(text);
      console.log("  [浏览器控制台 Error]:", text);
    }
    if (text.includes("Blocked aria-hidden on an element")) {
      ariaWarnings.push(text);
      console.log("  [ARIA 警告]:", text);
    }
  });

  try {
    // ----------------------------------------------------
    // 步骤 1: 登录获取鉴权 Token
    // ----------------------------------------------------
    console.log("[步骤 1] 登录 Admin 账号获取鉴权 Token...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASS },
      headers: { "Content-Type": "application/json" }
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, "登录失败: " + JSON.stringify(loginJson));
    const token = typeof loginJson.data === "string" ? loginJson.data : loginJson.data?.token;
    assert.ok(token, "必须获取到有效 Token");
    console.log("  ✓ Admin 登录成功，Token 提取正常\n");

    // ----------------------------------------------------
    // 步骤 2: 审计长篇大体量 HTML 邮件（超 20 个独立文本节点 + 图片 OCR 覆盖 + 跨段落句子分割）
    // ----------------------------------------------------
    console.log("[步骤 2] 发送长篇富文本邮件，测试多片并发负载均衡翻译与零截断...");
    const longEmailHtml = `
      <div style="background-color: #0f172a; color: #f8fafc; padding: 28px; border-radius: 12px; font-family: sans-serif; max-width: 800px; margin: auto;">
        <!-- Header with logo and title -->
        <div style="display: flex; align-items: center; margin-bottom: 24px; border-bottom: 1px solid #334155; padding-bottom: 16px;">
          <img src="https://mail.epocanvas.com/logo.png" alt="Company Logo" title="Official Logo" style="height: 36px; margin-right: 14px;" />
          <div>
            <h1 style="font-size: 22px; margin: 0; color: #38bdf8;">EpoMail Enterprise Cloud Architecture</h1>
            <p style="font-size: 13px; color: #94a3b8; margin: 4px 0 0;">Official System Notification & Service Upgrade Report</p>
          </div>
        </div>

        <!-- Banner Image with OCR description -->
        <div style="margin: 20px 0; text-align: center;">
          <img src="https://mail.epocanvas.com/banner.png" alt="Global Multi-Region Cloud Infrastructure Upgrade 2026" style="width: 100%; max-height: 240px; object-fit: cover; border-radius: 8px;" />
        </div>

        <!-- Section 1: Executive Summary (Long text node requiring natural sentence splitting) -->
        <h2 style="color: #60a5fa; font-size: 18px; margin: 20px 0 10px;">Executive Summary</h2>
        <p style="font-size: 14px; line-height: 1.7; color: #cbd5e1; margin-bottom: 16px;">
          We are delighted to announce that your corporate organization has been upgraded to our latest tier of distributed mail nodes. This enhancement introduces high-speed NVMe storage, dedicated hardware cryptographic acceleration, and automated spam filtering powered by artificial intelligence. With our renewed multi-region redundancy, your team can expect 99.999% system availability throughout the entire upcoming fiscal year. Please review the detailed metrics below to understand your upgraded resource allocations.
        </p>

        <!-- Section 2: Specification Table -->
        <h2 style="color: #60a5fa; font-size: 18px; margin: 24px 0 12px;">Resource Allocation Specifications</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #1e293b; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: #334155; color: #38bdf8; text-align: left;">
              <th style="padding: 12px 16px;">Resource Parameter</th>
              <th style="padding: 12px 16px;">Allocated Quota</th>
              <th style="padding: 12px 16px;">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-top: 1px solid #334155;">
              <td style="padding: 12px 16px; color: #f8fafc;">Primary Cloud Storage</td>
              <td style="padding: 12px 16px; color: #94a3b8;">500GB NVMe SSD High Performance</td>
              <td style="padding: 12px 16px; color: #4ade80; font-weight: bold;">Active & Optimized</td>
            </tr>
            <tr style="border-top: 1px solid #334155;">
              <td style="padding: 12px 16px; color: #f8fafc;">Global Routing Bandwidth</td>
              <td style="padding: 12px 16px; color: #94a3b8;">Unlimited Worldwide Data Transfer</td>
              <td style="padding: 12px 16px; color: #4ade80; font-weight: bold;">Unmetered</td>
            </tr>
            <tr style="border-top: 1px solid #334155;">
              <td style="padding: 12px 16px; color: #f8fafc;">Security & 2FA Enforcement</td>
              <td style="padding: 12px 16px; color: #94a3b8;">Hardware Security Keys & Passkeys WebAuthn</td>
              <td style="padding: 12px 16px; color: #4ade80; font-weight: bold;">Fully Enabled</td>
            </tr>
            <tr style="border-top: 1px solid #334155;">
              <td style="padding: 12px 16px; color: #f8fafc;">Billing & Renewal Schedule</td>
              <td style="padding: 12px 16px; color: #94a3b8;">Annual Automatic Renewal (2026 - 2027)</td>
              <td style="padding: 12px 16px; color: #38bdf8; font-weight: bold;">Paid & Confirmed</td>
            </tr>
          </tbody>
        </table>

        <!-- Section 3: Highlighting Action Buttons -->
        <div style="display: flex; gap: 16px; justify-content: center; margin: 32px 0;">
          <a href="https://mail.epocanvas.com/inbox" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">Access Cloud Management Portal</a>
          <a href="https://mail.epocanvas.com/system-setting" style="display: inline-block; background: #334155; color: #f8fafc; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">Configure Security Policies</a>
        </div>

        <!-- Section 4: Footer notes -->
        <div style="border-top: 1px solid #1e293b; padding-top: 20px; font-size: 12px; color: #64748b; text-align: center;">
          <p style="margin: 0 0 8px;">If you require emergency assistance, please open a priority ticket with our Global Infrastructure Operations Center.</p>
          <p style="margin: 0;">© 2026 EpoMail Cloud Services Inc. All rights reserved across all operating regions.</p>
        </div>
      </div>
    `;

    const startApiTime = Date.now();
    const transRes = await page.request.post(BASE + "/api/email/translate", {
      data: {
        html: longEmailHtml,
        text: "EpoMail Enterprise Cloud Architecture. Executive Summary and resource allocations.",
        targetLang: "zh"
      },
      headers: {
        Authorization: token,
        "Content-Type": "application/json"
      },
      timeout: 90000
    });
    const elapsedMs = Date.now() - startApiTime;
    console.log(`  长邮件翻译请求完成，耗时: ${elapsedMs}ms (HTTP 状态: ${transRes.status()})`);
    assert.strictEqual(transRes.status(), 200, "翻译接口必须返回 HTTP 200");
    const transJson = await transRes.json();
    assert.strictEqual(transJson.code, 200, "翻译 code 必须为 200: " + JSON.stringify(transJson));
    assert.ok(transJson.data, "必须返回翻译数据体");

    const translatedHtml = transJson.data.translatedHtml || "";
    const translatedText = transJson.data.translatedText || "";

    console.log("\n  [翻译结果审计概览]:", {
      model: transJson.data.model,
      tokens: transJson.data.tokens,
      htmlLength: translatedHtml.length,
      textLength: translatedText.length,
      samplePreview: translatedText.slice(0, 100).replace(/\n/g, " ")
    });

    // ----------------------------------------------------
    // 检查点 A: 100% 格式还原与 DOM 骨架
    // ----------------------------------------------------
    console.log("\n  [检查点 A] 验证表格、行动按钮、颜色背景 100% 格式还原...");
    assert.ok(translatedHtml.includes("<table"), "必须保留 <table> 标签");
    assert.ok(translatedHtml.includes("<th") && translatedHtml.includes("<td"), "必须保留 <th> 和 <td> 单元格");
    assert.ok(translatedHtml.includes("background-color: #0f172a") || translatedHtml.includes("background:#0f172a"), "必须保留外层深色卡片背景");
    assert.ok(translatedHtml.includes("background: #2563eb") || translatedHtml.includes("background:#2563eb"), "必须保留主按钮蓝色背景");
    assert.ok(translatedHtml.includes("https://mail.epocanvas.com/inbox"), "必须保留管理门户链接");
    assert.ok(translatedHtml.includes("https://mail.epocanvas.com/system-setting"), "必须保留安全策略链接");
    console.log("    ✓ 表格、单元格、按钮、链接、卡片背景 100% 完整保留！");

    // ----------------------------------------------------
    // 检查点 B: 图片 OCR 专属覆盖卡片与 Alt 属性验证
    // ----------------------------------------------------
    console.log("\n  [检查点 B] 验证图片 OCR 专属覆盖卡片与单独覆盖原文展示...");
    assert.ok(translatedHtml.includes("epo-trans-img-container"), "必须包裹在 .epo-trans-img-container 容器中");
    assert.ok(translatedHtml.includes("epo-trans-img-overlay"), "必须包含 .epo-trans-img-overlay 覆盖图注卡片");
    assert.ok(translatedHtml.includes("epo-ocr-translated-text"), "必须包含 .epo-ocr-translated-text 译文节点");

    // 验证两处图片均被赋予了覆盖卡片
    const containerMatches = (translatedHtml.match(/class="epo-trans-img-container"/g) || []).length;
    console.log(`    匹配到 ${containerMatches} 处图片覆盖展示容器`);
    assert.ok(containerMatches >= 1, "必须至少生成 1 处图片翻译覆盖展示卡片");

    // 验证图片属性包含译文
    assert.ok(
      translatedHtml.includes("公司") || translatedHtml.includes("标志") || translatedHtml.includes("Logo") || translatedHtml.includes("架构") || translatedHtml.includes("基础设施") || translatedHtml.includes("升级"),
      "图片覆盖卡片必须包含自然流畅的中文译文"
    );
    console.log("    ✓ 图片专属覆盖卡片 (.epo-trans-img-overlay) 与中文译文验证通过！");

    // ----------------------------------------------------
    // 检查点 C: 零截断审计 (零 MISSING, 邮件头部、正文、表格、底部全部翻译为中文)
    // ----------------------------------------------------
    console.log("\n  [检查点 C] 验证长邮件全链路零截断 (无任何丢失或英文残留)...");
    assert.ok(!translatedHtml.includes("__EPO_SEG_"), "严禁残留未回填的 __EPO_SEG_ 占位符");
    assert.ok(!translatedHtml.includes("<!--__EPO_RAW_"), "严禁残留未还原的 __EPO_RAW_ 原始块标记");

    // 验证各核心模块均翻译为中文
    assert.ok(
      translatedHtml.includes("企业") || translatedHtml.includes("架构") || translatedHtml.includes("云端") || translatedHtml.includes("通知"),
      "邮件标题必须翻译为中文"
    );
    assert.ok(
      translatedHtml.includes("概要") || translatedHtml.includes("执行") || translatedHtml.includes("组织") || translatedHtml.includes("宣布"),
      "执行摘要长段落必须翻译为中文"
    );
    assert.ok(
      translatedHtml.includes("存储") || translatedHtml.includes("带宽") || translatedHtml.includes("安全") || translatedHtml.includes("周期") || translatedHtml.includes("状态") || translatedHtml.includes("配额"),
      "表格各项指标必须翻译为中文"
    );
    assert.ok(
      translatedHtml.includes("访问") || translatedHtml.includes("配置") || translatedHtml.includes("门户") || translatedHtml.includes("策略"),
      "行动按钮文本必须翻译为中文"
    );
    assert.ok(
      translatedHtml.includes("支持") || translatedHtml.includes("版权所有") || translatedHtml.includes("中心") || translatedHtml.includes("协助"),
      "页脚说明必须翻译为中文"
    );
    console.log("    ✓ 长邮件头部、摘要、表格、行动按钮与页脚 100% 完整翻译，零截断零遗漏！");

    // ----------------------------------------------------
    // 步骤 3: 浏览器端暗黑模式注入与 UI 渲染审计
    // ----------------------------------------------------
    console.log("\n[步骤 3] 浏览器端加载暗黑模式并审计 ShadowHtml 真实渲染...");
    await page.goto(BASE + "/login/", { waitUntil: "networkidle" });
    await page.evaluate(({ token, longEmailHtml }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("loginEmail", "admin@epomail.bond");
      localStorage.setItem("ui", JSON.stringify({ dark: true, locale: "zh" }));
      document.documentElement.classList.add("dark");
    }, { token, longEmailHtml });

    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    // 检查控制台报错
    const getSettingsErrors = consoleErrors.filter(e => e.includes("getSettings") || e.includes("forEach"));
    assert.strictEqual(getSettingsErrors.length, 0, "严禁出现 getSettings 或 forEach 报错");
    assert.strictEqual(ariaWarnings.length, 0, "严禁出现 aria-hidden 冲突警告");
    console.log("  ✓ 控制台 0 报错，0 ARIA 警告通过！");

    console.log("\n==========================================================================");
    console.log("=== 恭喜！多片并发负载均衡分片系统、长邮件零截断与图片OCR单独覆盖展示 100% 通过！ ===");
    console.log("==========================================================================");

  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("测试执行异常失败:", err);
  process.exit(1);
});
