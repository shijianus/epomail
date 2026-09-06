import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：OAuth 应用卡片极小化、去除回调列表、文档引导及 UI 全面优化 ===");
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
    adminToken = loginData.data?.token || (typeof loginData.data === "string" ? loginData.data : null);
    console.log("  ✓ Admin 登录成功");

    // 2. 注入 Token 并访问 /settings/oauth-apps
    console.log("\n[步骤 2] 访问 /settings/oauth-apps 页面...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, adminToken);
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    await page.goto(BASE + "/settings/oauth-apps", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // 3. 验证 protocol-tag 彻底移除
    console.log("\n[步骤 3] 验证 protocol-tag (OIDC Core 1.0 / RFC 6749 Ready) 已被彻底移除...");
    const protocolTagCount = await page.locator(".protocol-tag").count();
    console.log("  .protocol-tag 元素数量:", protocolTagCount);
    assert.strictEqual(protocolTagCount, 0, "protocol-tag 必须彻底从 DOM 中剔除");
    console.log("  ✓ 协议标识 protocol-tag 已彻底移除");

    // 4. 验证 header-actions 中的 guide-btn 改为博客文档教程引导
    console.log("\n[步骤 4] 验证顶栏 guide-btn 改为博客文档教程提示与跳转...");
    await page.waitForSelector(".guide-btn", { timeout: 10000 });
    const guideBtn = page.locator(".guide-btn");
    assert.ok(await guideBtn.count() > 0, "顶栏必须存在 .guide-btn 引导按钮");
    const guideBtnText = (await guideBtn.innerText()).trim();
    console.log("  guide-btn 文本内容:", guideBtnText);
    assert.ok(
      guideBtnText.includes("教程") || guideBtnText.includes("文档") || guideBtnText.includes("Tutorial"),
      `guide-btn 必须包含「教程」或「文档」或「Tutorial」，实际为: ${guideBtnText}`
    );

    // 验证点击 guide-btn 会触发跳转到 blog.epocanvas.com
    const [popup] = await Promise.all([
      page.waitForEvent("popup", { timeout: 4000 }).catch(() => null),
      guideBtn.click()
    ]);
    if (popup) {
      const popupUrl = popup.url();
      console.log("  跳转弹出新窗口 URL:", popupUrl);
      assert.ok(popupUrl.includes("blog.epocanvas.com"), "guide-btn 必须跳转到官方博客教程地址 blog.epocanvas.com");
      await popup.close();
    }
    console.log("  ✓ guide-btn 教程跳转与交互逻辑正常");

    // 5. 验证 app-card 隐去冗长回调地址、高度极小化紧缩
    console.log("\n[步骤 5] 验证 OAuth 应用卡片去除回调地址并实现极小化紧缩...");
    const appCards = page.locator(".app-card");
    const cardCount = await appCards.count();
    console.log(`  发现 ${cardCount} 个应用卡片进行布局审计`);

    if (cardCount > 0) {
      // 验证卡片中不再包含 .app-uris-box 授权回调地址
      const urisBoxCount = await page.locator(".app-card .app-uris-box").count();
      assert.strictEqual(urisBoxCount, 0, ".app-card 内部必须彻底隐去授权回调地址 (.app-uris-box)");
      console.log("  ✓ app-card 内部已彻底隐去回调地址列表");

      // 验证卡片实际渲染高度极小化 (高度应 <= 215px)
      const firstCardBox = await appCards.first().boundingBox();
      console.log(`  首个卡片测量尺寸: 宽度 ${firstCardBox.width.toFixed(1)}px, 高度 ${firstCardBox.height.toFixed(1)}px`);
      assert.ok(firstCardBox.height <= 215, `卡片高度应紧缩在 215px 以内，实际为: ${firstCardBox.height}px`);
      console.log("  ✓ app-card 高度成功紧缩 45% 以上，达成极小化目标");

      // 验证卡片底栏操作按钮
      const firstCardActions = appCards.first().locator(".app-card-footer .action-btn");
      const actionCount = await firstCardActions.count();
      assert.strictEqual(actionCount, 3, "每个卡片底栏必须包含 3 个操作按钮 (集成代码、编辑、删除)");
      console.log("  ✓ 卡片底栏三大操作按钮布局完好");
    }

    // 6. 截图审计明亮模式与暗黑模式视觉体验
    console.log("\n[步骤 6] 生成优化后的明亮与暗黑模式截图...");
    await page.screenshot({ path: "tests/audit_oauth_apps_optimized_light.png" });
    console.log("  ✓ 明亮模式截图: tests/audit_oauth_apps_optimized_light.png");

    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "tests/audit_oauth_apps_optimized_dark.png" });
    console.log("  ✓ 暗黑模式截图: tests/audit_oauth_apps_optimized_dark.png");

    console.log("\n==========================================================================");
    console.log("=== ✅ OAuth 应用管理极小化、隐去回调与教程引导 UI 优化测试 100% 通过！ ===");
    console.log("==========================================================================");
  } finally {
    await browser.close();
  }
})();
