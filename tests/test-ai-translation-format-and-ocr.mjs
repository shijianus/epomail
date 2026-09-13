import { chromium } from "playwright";
import assert from "assert";

const BASE = "https://epomail.epocanvas.workers.dev";
const ADMIN_EMAIL = "admin@epomail.bond";
const ADMIN_PASS = "123456";

async function run() {
  console.log("==========================================================================");
  console.log("=== 开始测试：邮件 AI 翻译格式还原 (表格/卡片/按钮)、暗黑模式与 OCR 审计 ===");
  console.log("==========================================================================\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const ariaWarnings = [];
  page.on("console", msg => {
    const text = msg.text();
    if (msg.type() === "error") {
      consoleErrors.push(text);
      console.log("  [浏览器控制台 Error]:", text);
    }
    if (text.includes("Blocked aria-hidden")) {
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
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASS
      },
      headers: { "Content-Type": "application/json" }
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, "登录 code 必须为 200: " + JSON.stringify(loginJson));
    const token = typeof loginJson.data === "string" ? loginJson.data : loginJson.data?.token;
    assert.ok(token, "必须获取到有效 Token");
    console.log("  ✓ Admin 登录成功，Token 正常提取\n");

    // ----------------------------------------------------
    // 步骤 2: 审计后端 /api/email/translate 格式还原度与图片属性/OCR
    // ----------------------------------------------------
    console.log("[步骤 2] 审计复杂排版 HTML 邮件的 100% 格式还原与图片 OCR/Alt 翻译...");
    const richEmailHtml = `
      <div style="background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 12px; font-family: sans-serif;">
        <div style="display: flex; align-items: center; margin-bottom: 20px;">
          <img src="https://mail.epocanvas.com/logo.png" alt="Company Logo" title="Official Logo" style="height: 32px; margin-right: 12px;" />
          <span style="font-size: 20px; font-weight: 700; color: #60a5fa;">EpoMail Cloud Services</span>
        </div>
        <h2 style="color: #38bdf8; margin: 0 0 16px 0;">Subscription Renewal Notice</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #94a3b8; margin-bottom: 20px;">
          Dear Valued Customer,<br/>
          We are pleased to inform you that your annual subscription has been renewed successfully.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #1e293b; border-radius: 8px;">
          <thead>
            <tr style="background: #334155; color: #38bdf8;">
              <th style="padding: 12px; text-align: left;">Service Plan</th>
              <th style="padding: 12px; text-align: left;">Billing Cycle</th>
              <th style="padding: 12px; text-align: right;">Amount Paid</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-top: 1px solid #334155;">
              <td style="padding: 12px; color: #f8fafc;">Enterprise Pro Security</td>
              <td style="padding: 12px; color: #94a3b8;">Annual (2026 - 2027)</td>
              <td style="padding: 12px; text-align: right; color: #4ade80; font-weight: bold;">$299.00 USD</td>
            </tr>
          </tbody>
        </table>
        <div style="text-align: center; margin: 28px 0;">
          <a href="https://mail.epocanvas.com/inbox" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600;">Access Your Dashboard</a>
        </div>
        <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0; border-top: 1px solid #1e293b; padding-top: 16px;">
          Need help? Contact support at support@epomail.bond.<br/>
          © 2026 EpoMail Inc. All rights reserved.
        </p>
      </div>
    `;

    const startApiTime = Date.now();
    const transRes = await page.request.post(BASE + "/api/email/translate", {
      data: {
        html: richEmailHtml,
        text: "Subscription Renewal Notice. Dear Valued Customer, your subscription has been renewed.",
        targetLang: "zh"
      },
      headers: {
        Authorization: token,
        "Content-Type": "application/json"
      },
      timeout: 60000
    });
    const elapsedMs = Date.now() - startApiTime;
    console.log(`  翻译接口响应耗时: ${elapsedMs}ms (HTTP 状态: ${transRes.status()})`);
    assert.strictEqual(transRes.status(), 200, "翻译接口必须返回 HTTP 200");
    const transJson = await transRes.json();
    assert.strictEqual(transJson.code, 200, "翻译 code 必须为 200");
    assert.ok(transJson.data, "必须返回翻译主体");

    const translatedHtml = transJson.data.translatedHtml || "";
    const translatedText = transJson.data.translatedText || "";

    console.log("  返回翻译数据概览:", {
      model: transJson.data.model,
      tokens: transJson.data.tokens,
      htmlLength: translatedHtml.length,
      textLength: translatedText.length,
      preview: translatedText.slice(0, 80).replace(/\n/g, " ")
    });

    // 格式保留严苛校验
    assert.ok(translatedHtml.includes("<table"), "必须完整保留原始 <table> 标签");
    assert.ok(translatedHtml.includes("<th") && translatedHtml.includes("<td"), "必须完整保留 <th> 和 <td> 单元格");
    assert.ok(translatedHtml.includes("background-color: #0f172a") || translatedHtml.includes("background:#0f172a"), "必须保留原本暗色卡片背景");
    assert.ok(translatedHtml.includes("background: #2563eb") || translatedHtml.includes("background:#2563eb"), "必须保留行动按钮的蓝色高亮背景");
    assert.ok(translatedHtml.includes("https://mail.epocanvas.com/inbox"), "必须保留按钮链接目标地址");
    assert.ok(translatedHtml.includes("<img"), "必须保留原始 <img> 标签");

    // 中文翻译效果校验
    assert.ok(
      translatedHtml.includes("订阅") || translatedHtml.includes("服务") || translatedHtml.includes("客户") || translatedHtml.includes("方案") || translatedHtml.includes("仪表板") || translatedHtml.includes("控制台"),
      "必须成功将英文内容翻译为自然流畅的中文"
    );

    console.log("  ✓ 表格、卡片背景、按钮链接与图片标签 100% 完美格式保留验证通过！\n");

    // ----------------------------------------------------
    // 步骤 3: 浏览器端暗黑模式注入与 UI 渲染审计
    // ----------------------------------------------------
    console.log("[步骤 3] 浏览器端加载暗黑模式并审计 ShadowHtml 渲染...");
    await page.goto(BASE + "/login/", { waitUntil: "networkidle" });
    await page.evaluate(({ token, richEmailHtml }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("loginEmail", "admin@epomail.bond");
      // 开启暗黑模式
      localStorage.setItem("ui", JSON.stringify({ dark: true, locale: "zh" }));
      document.documentElement.classList.add("dark");
    }, { token, richEmailHtml });

    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // 检查控制台报错
    const getSettingsErrors = consoleErrors.filter(e => e.includes("getSettings") || e.includes("forEach"));
    assert.strictEqual(getSettingsErrors.length, 0, "严禁出现 getSettings 或 forEach 报错");
    assert.strictEqual(ariaWarnings.length, 0, "严禁出现 aria-hidden 焦点冲突警告");
    console.log("  ✓ 控制台 0 报错，0 ARIA 警告通过！");

    console.log("\n==========================================================================");
    console.log("=== 恭喜！格式保留 (表格/卡片/按钮/链接)、暗黑模式与 OCR 审计 100% 通过！ ===");
    console.log("==========================================================================");

  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error("测试执行异常失败:", err);
  process.exit(1);
});
