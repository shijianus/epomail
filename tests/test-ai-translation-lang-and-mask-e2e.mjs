import { chromium } from "playwright";
import assert from "assert";

const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";
const ADMIN_EMAIL = "admin@epomail.bond";
const ADMIN_PASS = "123456";

async function run() {
  console.log("==========================================================================");
  console.log("=== 开始测试：目标语言配置、同语言互译拦截、图片无前缀遮罩与繁体中文支持 ===");
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
    // 步骤 1: 登录 Admin 获取 Token
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
    // 步骤 2: 偏好设置页面 - 默认翻译目标语言配置审计
    // ----------------------------------------------------
    console.log("[步骤 2] 打开偏好设置页面，审计默认翻译目标语言下拉配置...");
    await page.goto(BASE + "/login/", { waitUntil: "networkidle" });
    await page.evaluate(({ token }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("loginEmail", "admin@epomail.bond");
      localStorage.setItem("ui", JSON.stringify({ dark: false, locale: "zh", defaultTranslateLang: "zh" }));
    }, { token });

    await page.goto(BASE + "/settings/general", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    const translateSection = await page.locator("#translate-lang-section");
    assert.ok(await translateSection.isVisible(), "偏好设置页面必须包含 #translate-lang-section 翻译目标语言选项");
    console.log("  ✓ 偏好设置页面 #translate-lang-section 存在且可见！");

    // 点击下拉框并验证 15 种主流语言与正體中文
    const selectTrigger = translateSection.locator(".el-select");
    await selectTrigger.click();
    await page.waitForTimeout(500);

    const zhHantOption = page.locator(".el-select-dropdown__item").filter({ hasText: "正體中文" });
    assert.ok(await zhHantOption.isVisible(), "下拉菜单中必须包含正體中文 (繁體) 选项");
    console.log("  ✓ 正體中文 (繁體) 下拉选项验证通过！");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // ----------------------------------------------------
    // 步骤 3: 后端接口纵深防御 - 严格拦截针对源语言翻译为原语言
    // ----------------------------------------------------
    console.log("\n[步骤 3] 测试后端 API 纵深防御：严禁源语言与目标语言相同（杜绝中文翻中文）...");
    
    // Case A: 中文原文请求翻译为中文 -> 后端自动切换为英文 (en)
    const sameZhRes = await page.request.post(BASE + "/api/email/translate", {
      data: {
        text: "这是一封来自企业云架构团队的官方服务升级通知，请查收您的最新配额。",
        targetLang: "zh"
      },
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      timeout: 90000
    });
    const sameZhJson = await sameZhRes.json();
    assert.strictEqual(sameZhJson.code, 200, "翻译接口必须返回 HTTP 200");
    const transZhText = sameZhJson.data?.translatedText || "";
    console.log("  Case A (中文 -> 请求zh -> 后端自动转en) 结果:", transZhText.slice(0, 80));
    assert.ok(
      /[a-zA-Z]/.test(transZhText) && (transZhText.includes("official") || transZhText.includes("cloud") || transZhText.includes("upgrade") || transZhText.includes("notification") || transZhText.includes("quota") || transZhText.includes("team") || transZhText.includes("architecture")),
      "中文原文请求翻译为中文时，后端必须自动切换为英文并输出英文译文，杜绝原地中文输出！"
    );
    console.log("  ✓ 中文 -> 请求中文自动转英文防御成功！");

    // Case B: 英文原文请求翻译为英文 -> 后端自动切换为法语 (fr)
    const sameEnRes = await page.request.post(BASE + "/api/email/translate", {
      data: {
        text: "Your distributed mail storage system has been successfully upgraded to high-performance NVMe nodes.",
        targetLang: "en"
      },
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      timeout: 90000
    });
    const sameEnJson = await sameEnRes.json();
    assert.strictEqual(sameEnJson.code, 200, "翻译接口必须返回 HTTP 200");
    const transEnText = sameEnJson.data?.translatedText || "";
    console.log("  Case B (英文 -> 请求en -> 后端自动转fr) 结果:", transEnText.slice(0, 80));
    assert.ok(
      transEnText.includes("Votre") || transEnText.includes("système") || transEnText.includes("mis à") || transEnText.includes("stockage") || transEnText.includes("succès") || /[éèàùâêîôû]/.test(transEnText),
      "英文原文请求翻译为英文时，后端必须自动切换为法语并输出法语译文！"
    );
    console.log("  ✓ 英文 -> 请求英文自动转法语防御成功！");

    // Case C: 简体中文翻译为正體中文 (zh-Hant)
    const toTradRes = await page.request.post(BASE + "/api/email/translate", {
      data: {
        text: "欢迎使用企业云端邮件系统，这里为用户提供安全稳定的网络服务。",
        targetLang: "zh-Hant"
      },
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      timeout: 90000
    });
    const toTradJson = await toTradRes.json();
    assert.strictEqual(toTradJson.code, 200, "翻译接口必须返回 HTTP 200");
    const transTradText = toTradJson.data?.translatedText || "";
    console.log("  Case C (简体中文 -> 正體中文 zh-Hant) 结果:", transTradText);
    assert.ok(
      transTradText.includes("歡迎") || transTradText.includes("雲端") || transTradText.includes("網絡") || transTradText.includes("網路") || transTradText.includes("這裏") || transTradText.includes("這裡") || transTradText.includes("為") || transTradText.includes("戶"),
      "必须成功将简体中文转换为流畅的正體中文（繁體中文）！"
    );
    console.log("  ✓ 正體中文 (繁體中文) 翻译验证通过！");

    // ----------------------------------------------------
    // 步骤 4: 0ee51d3 最小修改覆盖卡片与无文字图片保持原样验证
    // ----------------------------------------------------
    console.log("\n[步骤 4] 验证 0ee51d3 最小修改覆盖卡片（仅覆盖底部文本区域）与无文字图片严格保持原样...");
    const sampleImageHtml = `
      <div style="padding: 20px; font-family: sans-serif;">
        <h2>System Notification with Visual Assets</h2>
        <p>Please check the upgrade badge below:</p>
        <div style="margin: 15px 0;">
          <img src="https://mail.epocanvas.com/promo-banner.png" alt="Annual Cloud Infrastructure Upgrade 50% Off Special Offer" style="width: 480px; height: 160px; object-fit: cover; border-radius: 8px;" />
        </div>
        <!-- 无文字图片（保持原样测试） -->
        <div style="margin: 10px 0;">
          <img src="https://mail.epocanvas.com/spacer.gif" alt="spacer" style="height: 10px; width: 100px;" />
        </div>
        <video style="width: 320px;" controls><source src="https://mail.epocanvas.com/demo.mp4" type="video/mp4"></video>
        <p>Thank you for choosing our platform.</p>
      </div>
    `;

    const imgTransRes = await page.request.post(BASE + "/api/email/translate", {
      data: {
        html: sampleImageHtml,
        targetLang: "zh"
      },
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      timeout: 90000
    });
    const imgTransJson = await imgTransRes.json();
    assert.strictEqual(imgTransJson.code, 200, "图片邮件翻译接口必须返回 HTTP 200");
    const transHtml = imgTransJson.data?.translatedHtml || "";

    // 验证禁止技术前缀
    assert.ok(!transHtml.includes("[图片文字识别与翻译"), "严禁出现 '[图片文字识别与翻译' 技术前缀");
    assert.ok(!transHtml.includes("[图片译文]"), "严禁出现 '[图片译文]' 技术前缀");
    assert.ok(!transHtml.includes("Image OCR"), "严禁出现 'Image OCR' 英文前缀");

    // 验证 0ee51d3 最小修改覆盖卡片：仅覆盖底部文本区域，非全图遮蔽
    assert.ok(transHtml.includes("epo-trans-img-container"), "有文字图片必须包裹在 .epo-trans-img-container 容器中");
    assert.ok(transHtml.includes("epo-trans-img-overlay"), "必须包含 .epo-trans-img-overlay 覆盖层");
    assert.ok(transHtml.includes("position: absolute") && transHtml.includes("bottom: 0"), "大图卡片必须使用 0ee51d3 最小修改原则 absolute bottom: 0 仅覆盖原图文本");
    assert.ok(transHtml.includes("epo-ocr-translated-text"), "必须包含 .epo-ocr-translated-text 译文节点");

    // 验证无文字图片保持 100% 原样（无 figure/container 包裹）
    assert.ok(
      transHtml.includes('src="https://mail.epocanvas.com/spacer.gif"') && !transHtml.includes('alt="__EPO_SEG_') || (transHtml.match(/class="epo-trans-img-container"/g) || []).length === 1,
      "无文字图片必须保持 100% 原样，严禁错误包装覆盖卡片"
    );

    // 验证 video 媒体标签 100% 完好无损保留
    assert.ok(transHtml.includes("<video") && transHtml.includes("demo.mp4"), "必须完整保留 <video> 标签及其 source 资源");
    console.log("  ✓ 0ee51d3 最小修改覆盖与无文字图片保持原样验证通过：无技术前缀、bottom: 0 覆盖文本、无文字图片保持原样、video 媒体标签完好保留！");

    // ----------------------------------------------------
    // 步骤 5: 控制台错误与 ARIA 规范审计
    // ----------------------------------------------------
    console.log("\n[步骤 5] 浏览器控制台错误与 ARIA 规范审计...");
    assert.strictEqual(consoleErrors.length, 0, "严禁出现浏览器控制台错误");
    assert.strictEqual(ariaWarnings.length, 0, "严禁出现 aria-hidden 冲突警告");
    console.log("  ✓ 控制台 0 报错，0 ARIA 冲突验证通过！");

    console.log("\n==========================================================================");
    console.log("=== 恭喜！全部检查点 100% 成功通过！ ===");
    console.log("==========================================================================\n");

  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("测试执行异常失败:", err);
  process.exit(1);
});
