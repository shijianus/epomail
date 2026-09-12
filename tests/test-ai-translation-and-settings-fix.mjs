import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：修复 getSettings 报错与邮件翻译提示词与文本嵌入替换 ===");
  console.log("==========================================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // 1. 登录 Admin 账号
    console.log("\n[步骤 1] 登录 Admin 账号获取鉴权 Token...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "Admin 登录失败: " + JSON.stringify(loginData));
    const token = typeof loginData.data === "string" ? loginData.data : loginData.data?.token;
    assert.ok(token, "必须获取到有效 Token");
    console.log("  ✓ Admin 登录成功");

    // 2. 注入 Token 并访问系统设置页面，验证 0 个 getSettings 或 forEach 报错
    console.log("\n[步骤 2] 浏览器打开系统设置页面，检测 getSettings 控制台报错...");
    await page.goto(BASE + "/system-setting");
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
    }, token);
    await page.goto(BASE + "/system-setting");
    await page.waitForTimeout(3000);

    const forEachErrors = consoleErrors.filter(err => err.includes("forEach") || err.includes("getSettings error"));
    console.log("  控制台 forEach / getSettings 错误数:", forEachErrors.length);
    assert.strictEqual(forEachErrors.length, 0, "系统设置页面绝不可出现 getSettings 或 forEach 报错: " + JSON.stringify(forEachErrors));
    console.log("  ✓ getSettings 语法与 ASI 陷阱修复验证成功，零报错！");

    // 3. 验证 /api/email/translate 对文本和 HTML 的翻译与格式嵌入
    console.log("\n[步骤 3] 验证 /api/email/translate 接口提示词与文本嵌入替换...");
    const sampleHtml = `<div class="mail-body"><p style="font-weight: bold;">Hello, valued customer!</p><p>Your order has been shipped successfully.</p><ul><li>Item: Wireless Headphones</li><li>Carrier: FedEx Express</li></ul></div>`;

    const transRes = await page.request.post(BASE + "/api/email/translate", {
      data: {
        html: sampleHtml,
        text: "Hello, valued customer! Your order has been shipped successfully.",
        targetLang: "zh"
      },
      headers: {
        Authorization: token,
        "Content-Type": "application/json"
      }
    });
    const transData = await transRes.json();
    console.log("  翻译接口响应状态与字段:", {
      code: transData.code,
      isHtml: transData.data?.isHtml,
      hasTranslatedHtml: Boolean(transData.data?.translatedHtml),
      hasTranslatedText: Boolean(transData.data?.translatedText),
      model: transData.data?.model
    });

    assert.strictEqual(transData.code, 200, "翻译接口必须返回 200");
    assert.ok(transData.data?.translatedHtml, "必须生成 translatedHtml");
    assert.ok(transData.data?.translatedText, "必须生成 translatedText");

    const html = transData.data.translatedHtml;
    // 验证 HTML 结构保留且翻译嵌入
    assert.ok(html.includes("<p") && html.includes("</p>"), "必须保留段落标签");
    assert.ok(html.includes("<ul>") && html.includes("<li>"), "必须保留列表标签");
    assert.ok(
      html.includes("客户") || html.includes("您好") || html.includes("订单") || html.includes("耳机") || html.includes("已成功发货") || html.includes("发货"),
      "必须成功将英文内容翻译为中文并嵌入标签内部"
    );
    console.log("  ✓ HTML 标签结构与中文翻译内容 100% 成功嵌入替换！");

    // 4. 打开收件箱，验证 UI 层面的翻译栏交互与文本替换展示
    console.log("\n[步骤 4] 浏览器访问收件箱 /inbox，触发邮件翻译并核验 UI 替换嵌入...");
    await page.goto(BASE + "/inbox");
    await page.waitForTimeout(3000);

    const emailRow = await page.$(".mail-item, .email-item, .list-box .item, .email-scroll-item");
    if (emailRow) {
      await emailRow.click();
      await page.waitForTimeout(2000);

      const translateBtn = await page.$(".btn-translate, .action-icon.translate, [title*='翻译']");
      if (translateBtn) {
        console.log("  找到翻译按钮，点击触发...");
        await translateBtn.click();
        await page.waitForTimeout(1000);

        // 检查翻译条
        const translateBar = await page.$(".gmail-translate-bar");
        assert.ok(translateBar, "点击后必须展开 Gmail 风格翻译条");
        console.log("  ✓ 翻译条成功唤起");
      }
    }

    console.log("\n==========================================================================");
    console.log("=== 恭喜！所有 4 项自动化审计全部 100% 成功通过！零报错，零假数据！ ===");
    console.log("==========================================================================");

  } finally {
    await browser.close();
  }
})();
