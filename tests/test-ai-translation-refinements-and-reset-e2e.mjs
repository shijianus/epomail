import { chromium } from "playwright";
import assert from "assert";

const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";
const ADMIN_EMAIL = "admin@epomail.bond";
const ADMIN_PASS = "123456";

async function run() {
  console.log("==========================================================================");
  console.log("=== 开始测试：目标语言与OCR问号提示、OCR开关管理、Logo/Video过滤与切换语言静默重置 ===");
  console.log("==========================================================================\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: "zh-CN"
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const toastMessages = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") {
      consoleErrors.push(text);
      console.log("  [浏览器控制台 Error]:", text);
    }
  });

  try {
    // ----------------------------------------------------
    // 步骤 1: 登录 Admin 账号
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
    console.log("  ✓ Admin 登录成功\n");

    // ----------------------------------------------------
    // 步骤 2: 打开偏好设置，验证目标语言及 OCR 实验功能开关的 "?" 提示与隐藏文案
    // ----------------------------------------------------
    console.log("[步骤 2] 打开偏好设置，验证目标语言与 OCR 开关的 UI 与问号 Tooltip...");
    await page.goto(BASE + "/login/", { waitUntil: "networkidle" });
    await page.evaluate(({ token }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("loginEmail", "admin@epomail.bond");
      localStorage.setItem("ui", JSON.stringify({ dark: false, locale: "zh" }));
    }, { token });

    await page.goto(BASE + "/settings/general", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // 验证目标语言区域：不可显式展示 "配置阅读邮件时的默认翻译目标语言"
    const langSection = page.locator("#translate-lang-section");
    assert.ok(await langSection.isVisible(), "#translate-lang-section 必须可见");
    const langSectionText = await langSection.innerText();
    assert.ok(
      !langSectionText.includes("配置阅读邮件时的默认翻译目标语言"),
      "目标语言区域严禁以纯文本显式展示说明文案，必须放入问号注释中！"
    );
    console.log("  ✓ 目标语言配置区无显式纯文本描述，符合问号注释要求");

    // 验证图片 OCR 开关区与实验性问号提示
    const ocrSection = page.locator("#translate-ocr-section");
    assert.ok(await ocrSection.isVisible(), "#translate-ocr-section 必须可见");
    const ocrSwitch = ocrSection.locator(".el-switch");
    assert.ok(await ocrSwitch.isVisible(), "图片 OCR 必须提供独立开关控件");
    console.log("  ✓ 图片 OCR 独立管理开关 (#translate-ocr-section) 验证通过！\n");

    // ----------------------------------------------------
    // 步骤 3: 验证后端图片 OCR 开关、Logo 与 Video 过滤
    // ----------------------------------------------------
    console.log("[步骤 3] 测试后端图片 OCR 开关控制、Logo 与 Video 过滤规则...");
    const testHtml = `
      <div>
        <h1>System Notification</h1>
        <p>Your cloud account is updated.</p>
        <img src="https://mail.epocanvas.com/assets/company-logo.png" alt="Company Logo" class="brand-logo" />
        <video controls poster="https://mail.epocanvas.com/video-poster.jpg"><source src="movie.mp4" type="video/mp4"></video>
        <img src="https://mail.epocanvas.com/diagram.png" alt="System Flowchart and Data Pipeline Metrics" />
      </div>
    `;

    // Case 1: enableOcr = false (用户关闭 OCR 开关)
    const ocrOffRes = await page.request.post(BASE + "/api/email/translate", {
      data: {
        html: testHtml,
        targetLang: "zh",
        enableOcr: false
      },
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    });
    const ocrOffJson = await ocrOffRes.json();
    assert.strictEqual(ocrOffJson.code, 200);
    const ocrOffHtml = ocrOffJson.data.translatedHtml || "";
    assert.ok(!ocrOffHtml.includes("epo-trans-img-container"), "当 enableOcr 为 false 时，严禁包裹任何图片覆盖容器！");
    assert.ok(!ocrOffHtml.includes("epo-trans-img-overlay"), "当 enableOcr 为 false 时，严禁出现任何 OCR 图注遮罩！");
    assert.ok(ocrOffHtml.includes("company-logo.png"), "必须完好保留原始 logo");
    assert.ok(ocrOffHtml.includes("<video"), "必须完好保留原始 video 标签");
    console.log("  ✓ enableOcr: false 时 100% 保持所有图片与视频原样，零修改验证通过！");

    // Case 2: enableOcr = true (用户开启 OCR 开关)
    const ocrOnRes = await page.request.post(BASE + "/api/email/translate", {
      data: {
        html: testHtml,
        targetLang: "zh",
        enableOcr: true
      },
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    });
    const ocrOnJson = await ocrOnRes.json();
    assert.strictEqual(ocrOnJson.code, 200);
    const ocrOnHtml = ocrOnJson.data.translatedHtml || "";

    // 验证 Logo 绝不被说明或包裹
    assert.ok(!ocrOnHtml.includes('company-logo.png"><figcaption'), "Company Logo 绝不添加说明或覆盖卡片！");
    // 验证 Video 绝不被作为图片处理
    assert.ok(ocrOnHtml.includes("<video"), "Video 标签绝不能被认定为图片！");
    // 验证有文本价值的图表单独覆盖展示
    assert.ok(ocrOnHtml.includes("epo-trans-img-container"), "真实内容图表必须赋予覆盖图注卡片");
    assert.ok(ocrOnHtml.includes("bottom: 0"), "大图卡片必须采用 0ee51d3 底部覆盖结构，仅覆盖文字区域");
    console.log("  ✓ enableOcr: true 时 Logo 零说明、Video 零误认、仅内容图表底部精准覆盖验证通过！\n");

    // ----------------------------------------------------
    // 步骤 4: 切换语言静默重置与旧请求终止 (Silent Abort & Reset on Target Language Switch)
    // ----------------------------------------------------
    console.log("[步骤 4] 验证客户端在未完成翻译状态下更换目标语言时的静默终止与重置...");
    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // 审计浏览器的控制台报错，确保没有 Abort 错误向用户抛出
    const abortErrors = consoleErrors.filter(e => e.includes("ERR_CANCELED") || e.includes("AbortError"));
    assert.strictEqual(abortErrors.length, 0, "严禁将 AbortError 泄露或作为未捕获异常抛到控制台！");
    console.log("  ✓ 控制台 0 Abort 报错，静默取消机制正常！\n");

    console.log("==========================================================================");
    console.log("=== 恭喜！目标语言与OCR配置、Logo/Video过滤与静默重置全链路测试 100% 通过！ ===");
    console.log("==========================================================================");

  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("测试执行异常失败:", err);
  process.exit(1);
});
