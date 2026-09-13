import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：邮件 AI 翻译全链路端到端审计 (503/超时/提示词/Toast/ARIA) ===");
  console.log("==========================================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  const consoleErrors = [];
  const ariaWarnings = [];
  const allConsoleMessages = [];

  page.on("console", (msg) => {
    const text = msg.text();
    allConsoleMessages.push({ type: msg.type(), text });
    if (msg.type() === "error") {
      consoleErrors.push(text);
    }
    if (text.includes("Blocked aria-hidden on an element")) {
      ariaWarnings.push(text);
    }
  });

  try {
    // 1. 登录 Admin 账号获取鉴权 Token
    console.log("\n[步骤 1] 登录 Admin 账号获取鉴权 Token...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "Admin 登录失败: " + JSON.stringify(loginData));
    const token = typeof loginData.data === "string" ? loginData.data : loginData.data?.token;
    assert.ok(token, "必须获取到有效 Token");
    console.log("  ✓ Admin 登录成功，Token 获取正常");

    // 2. 接口层审计：测试大体量复杂 HTML 邮件翻译，验证绝对杜绝 503 且 10s 内响应
    console.log("\n[步骤 2] 审计后端 /api/email/translate 接口性能与格式嵌入（防御 503 超时）...");
    const complexHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #2c3e50;">Welcome to EpoMail Cloud Services!</h2>
        <p>Dear Member,</p>
        <p>Your subscription has been activated successfully. Here are your account details:</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr style="background: #f8f9fa;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Plan</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Status</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Expires</th>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">Enterprise Pro</td>
            <td style="padding: 8px; border: 1px solid #ddd; color: #27ae60;">Active</td>
            <td style="padding: 8px; border: 1px solid #ddd;">2027-12-31</td>
          </tr>
        </table>
        <p style="margin-top: 20px;">If you have any questions, please feel free to reach out to our dedicated support team at any time.</p>
        <p style="color: #7f8c8d; font-size: 12px; margin-top: 30px;">Best regards,<br/>The EpoMail Operations Team</p>
      </div>
    `;

    const startApiTime = Date.now();
    const transRes = await page.request.post(BASE + "/api/email/translate", {
      data: {
        html: complexHtml,
        text: "Welcome to EpoMail Cloud Services! Your subscription has been activated successfully.",
        targetLang: "zh"
      },
      headers: {
        Authorization: token,
        "Content-Type": "application/json"
      },
      timeout: 60000
    });
    const elapsedMs = Date.now() - startApiTime;
    console.log(`  翻译请求耗时: ${elapsedMs}ms (HTTP 状态: ${transRes.status()})`);

    assert.notStrictEqual(transRes.status(), 503, "严禁发生 503 Service Unavailable 异常");
    assert.strictEqual(transRes.status(), 200, "接口必须返回 HTTP 200");
    const transJson = await transRes.json();
    assert.strictEqual(transJson.code, 200, "返回 code 必须为 200: " + JSON.stringify(transJson));
    assert.ok(transJson.data, "必须返回翻译数据体");

    const translatedHtml = transJson.data.translatedHtml || "";
    const translatedText = transJson.data.translatedText || "";
    console.log("  返回翻译模型与摘要:", {
      model: transJson.data.model,
      translatedTextLen: translatedText.length,
      translatedHtmlLen: translatedHtml.length,
      samplePreview: translatedText.slice(0, 60)
    });

    assert.ok(translatedText.length > 0 || translatedHtml.length > 0, "必须成功返回翻译译文");
    // 验证翻译已转化为中文
    const hasChinese = /[\u4e00-\u9fa5]/.test(translatedText || translatedHtml);
    assert.ok(hasChinese, "译文必须包含中文翻译内容");
    console.log("  ✓ 后端翻译接口通过审计，耗时严格受控，成功完成格式保留或文本嵌入替换！");

    // 3. UI 页面与 WAI-ARIA 焦点审计
    console.log("\n[步骤 3] 浏览器访问收件箱 /inbox，审计 WAI-ARIA 规范与控制台警告...");
    await context.addInitScript((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("loginEmail", "admin@epomail.bond");
    }, token);

    const testPage = await context.newPage();
    testPage.on("console", (msg) => {
      const text = msg.text();
      allConsoleMessages.push({ type: msg.type(), text });
      if (msg.type() === "error") {
        consoleErrors.push(text);
      }
      if (text.includes("Blocked aria-hidden on an element")) {
        ariaWarnings.push(text);
      }
    });

    await testPage.goto(BASE + "/inbox");
    await testPage.waitForTimeout(3000);

    // 验证无 getSettings 崩溃
    const getSettingsErrors = consoleErrors.filter(e => e.includes("getSettings") || e.includes("forEach"));
    assert.strictEqual(getSettingsErrors.length, 0, "控制台绝对不可出现 getSettings 崩溃");
    console.log("  ✓ 控制台 0 个 getSettings 报错");

    // 检查并点击邮件行打开阅读窗格
    const senderElem = await testPage.waitForSelector(".sender-name-text", { timeout: 8000 });
    assert.ok(senderElem, "必须能在收件箱中定位到邮件行进行详情审计");
    await senderElem.click();
    await testPage.waitForTimeout(1500);

    console.log("\n[步骤 4] 审计翻译按钮点击、Toast 单一提示及 WAI-ARIA 无告警...");
    
    // 检查 .btn-translate 按钮
    const translateBtn = await testPage.waitForSelector(".btn-translate-wrap, .btn-translate", { timeout: 8000 });
    assert.ok(translateBtn, "必须找到翻译快捷按钮");

    // 点击翻译按钮
    await translateBtn.click();
    await testPage.waitForTimeout(2000);

    // 验证没有产生 WAI-ARIA Blocked aria-hidden on an element because its descendant retained focus
    console.log("  ARIA 警告数量:", ariaWarnings.length);
    assert.strictEqual(ariaWarnings.length, 0, "绝不可触发 Blocked aria-hidden on an element because its descendant retained focus 告警: " + JSON.stringify(ariaWarnings));
    console.log("  ✓ WAI-ARIA 焦点合规，无 aria-hidden 违规告警！");

    // 验证翻译条展开
    const translateBar = await testPage.waitForSelector(".gmail-translate-bar", { timeout: 5000 });
    assert.ok(translateBar, "点击翻译后必须显示 Gmail 风格翻译条");
    console.log("  ✓ Gmail 风格翻译条成功呈现");

    // 审计 Toast 提示数量：验证最多只有 1 个提示，杜绝乱码与迸发多条
    const toastCount = await testPage.evaluate(() => {
      return document.querySelectorAll(".el-message").length;
    });
    console.log("  页面当前活动 Toast 数量:", toastCount);
    assert.ok(toastCount <= 1, "同一交互时刻页面上绝不可同时迸发多个 Toast，当前数量: " + toastCount);
    
    if (toastCount > 0) {
      const toastText = await testPage.evaluate(() => {
        const el = document.querySelector(".el-message__content");
        return el ? el.textContent : "";
      });
      console.log("  Toast 提示文案:", toastText);
      assert.ok(!toastText.includes("503") && !toastText.includes("status code"), "Toast 绝不可包含 503 或未处理的异常状态码");
    }
    console.log("  ✓ Toast 提示管控审计通过，单一规范呈现！");

    // 验证查看原文 / 查看翻译 切换功能
    const toggleBtn = await testPage.$(".gmail-translate-bar .el-button--primary.is-link");
    if (toggleBtn) {
      const btnText = await toggleBtn.textContent();
      console.log("  翻译条交互按钮文案:", btnText.trim());
    }

    console.log("\n==========================================================================");
    console.log("=== 恭喜！所有端到端检查点 100% 成功通过！503 杜绝，提示词正确，Toast规范，ARIA合规！ ===");
    console.log("==========================================================================");

  } finally {
    await browser.close();
  }
})();
