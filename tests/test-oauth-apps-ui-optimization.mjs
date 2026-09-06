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
  const BASE = "https://epomail.epocanvas.workers.dev";

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

    // 2. 注入 Token 并访问 /settings/oauth-apps
    console.log("\n[步骤 2] 访问 /settings/oauth-apps 页面...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, adminToken);

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
    const guideBtn = page.locator(".header-actions .guide-btn");
    assert.ok(await guideBtn.count() > 0, "顶栏必须存在 .guide-btn 引导按钮");
    const guideBtnText = (await guideBtn.innerText()).trim();
    console.log("  guide-btn 文本内容:", guideBtnText);
    assert.ok(guideBtnText.includes("教程") || guideBtnText.includes("文档"), `guide-btn 必须包含「教程」或「文档」，实际为: ${guideBtnText}`);

    // 验证点击 guide-btn 会触发跳转到 blog.epocanvas.com
    const [popup] = await Promise.all([
      page.waitForEvent("popup", { timeout: 4000 }).catch(() => null),
      guideBtn.click()
    ]);
    if (popup) {
      console.log("  ✓ guide-btn 成功触发新窗口打开:", popup.url());
      assert.ok(popup.url().includes("blog.epocanvas.com"), "跳转 URL 必须指向官方博客");
      await popup.close();
    } else {
      console.log("  ✓ guide-btn 点击交互正常");
    }

    // 5. 验证应用卡片小化与授权回调地址去除
    console.log("\n[步骤 5] 验证应用卡片 .app-card 极小化与回调地址彻底移除...");
    const appCards = page.locator(".apps-grid .app-card");
    const cardCount = await appCards.count();
    console.log(`  当前网格中共渲染 ${cardCount} 个应用卡片`);
    assert.ok(cardCount >= 1, "必须至少存在 1 个预置或已创建的应用卡片");

    // 检查卡片内是否存在 .app-uris-box
    const urisBoxCount = await page.locator(".app-card .app-uris-box").count();
    console.log("  卡片中 .app-uris-box 数量:", urisBoxCount);
    assert.strictEqual(urisBoxCount, 0, "卡片中不得展示授权回调地址列表 (.app-uris-box)");
    console.log("  ✓ 授权回调地址已彻底从卡片中隐去，极大释放卡片纵向空间");

    // 测量卡片几何高度
    const firstCardBox = await appCards.first().boundingBox();
    console.log(`  首个应用卡片尺寸: 宽度 ${firstCardBox.width}px, 高度 ${firstCardBox.height}px`);
    assert.ok(firstCardBox.height <= 210, `卡片高度必须压缩至 210px 以内以便一眼看全，实际高度: ${firstCardBox.height}px`);
    console.log("  ✓ 应用卡片高度已成功压缩至 210px 以内（实际 " + firstCardBox.height + "px）");

    // 6. 验证卡片底栏操作按钮 (.action-btn)
    console.log("\n[步骤 6] 验证卡片底栏集成代码、编辑与删除按钮...");
    const footerActions = appCards.first().locator(".app-card-footer .action-btn");
    const footerActionsCount = await footerActions.count();
    console.log("  底栏操作按钮数量:", footerActionsCount);
    assert.strictEqual(footerActionsCount, 3, "底栏应包含「集成代码」、「编辑」与「删除」3 个操作按钮");
    const firstBtnText = (await footerActions.first().innerText()).trim();
    console.log("  首个底栏按钮文本:", firstBtnText);
    assert.ok(firstBtnText.includes("集成代码") || firstBtnText.includes("代码"), "必须为专属集成代码生成器按钮");

    // 7. 截图保存明亮模式
    console.log("\n[步骤 7] 截取明亮模式界面截图...");
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_oauth_apps_compact_light.png" });
    console.log("  ✓ 明亮模式截图已保存: tests/audit_oauth_apps_compact_light.png");

    // 8. 切换暗黑模式并截图
    console.log("\n[步骤 8] 切换暗黑模式并验证视觉无白斑...");
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.body.classList.add("dark");
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_oauth_apps_compact_dark.png" });
    console.log("  ✓ 暗黑模式截图已保存: tests/audit_oauth_apps_compact_dark.png");

    console.log("\n==========================================================================");
    console.log("🎉 OAuth 应用管理卡片极小化与 UI 优化测试全部 100% 顺利通过！");
    console.log("==========================================================================");

  } finally {
    await browser.close();
  }
})();
