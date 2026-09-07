import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 验证 class=\"header-actions\" 与 class=\"msg-header-quick-actions\" Icon 正常渲染 ===");
  console.log("==========================================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  try {
    // 1. 登录
    console.log("\n[步骤 1] 登录 Admin 账号...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "登录失败: " + JSON.stringify(loginData));
    const token = typeof loginData.data === "string" ? loginData.data : loginData.data?.token;

    // 2. 打开收件箱
    console.log("\n[步骤 2] 打开收件箱 (/inbox)...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);
    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // 点击邮件查看详情
    await page.waitForSelector(".email-row", { timeout: 15000 });
    const emailRows = await page.$$(".email-row");
    assert.ok(emailRows.length > 0, "收件箱必须有邮件行");
    await emailRows[0].click();
    await page.waitForTimeout(2000);

    // 3. 验证 class="header-actions" 内部的所有 Icon
    console.log("\n[步骤 3] 验证 class=\"header-actions\" 中所有 Icon 的 SVG 渲染...");
    await page.waitForSelector(".header-actions .header-actions-left", { timeout: 15000 });

    const headerSvgs = await page.$$eval(".header-actions:has(.header-actions-left) svg", svgs => svgs.map(s => ({
      class: s.getAttribute("class") || "",
      viewBox: s.getAttribute("viewBox") || "",
      hasPath: s.querySelectorAll("path, g, rect, circle").length > 0,
      width: s.getBoundingClientRect().width,
      height: s.getBoundingClientRect().height
    })));

    console.log(`  class="header-actions" 中检测到 SVG 数量: ${headerSvgs.length}`);
    assert.ok(headerSvgs.length >= 10, "header-actions 中应至少渲染 10 个有效图标 SVG");

    for (const [idx, icon] of headerSvgs.entries()) {
      assert.ok(icon.hasPath, `第 ${idx + 1} 个顶栏图标 SVG (${icon.class}) 必须包含矢量路径 (path/g)`);
      assert.ok(icon.width > 0 && icon.height > 0, `第 ${idx + 1} 个顶栏图标 (${icon.class}) 尺寸必须 > 0，当前为 ${icon.width}x${icon.height}`);
      console.log(`  ✓ 顶栏图标 [${idx + 1}] class="${icon.class}" 尺寸 ${icon.width.toFixed(1)}x${icon.height.toFixed(1)}，路径正常`);
    }

    // 4. 验证 class="msg-header-quick-actions" 内部的所有 Icon
    console.log("\n[步骤 4] 验证 class=\"msg-header-quick-actions\" 中所有 Icon 的 SVG 渲染...");
    await page.waitForSelector(".thread-header-bar .msg-header-quick-actions", { timeout: 15000 });

    const quickSvgs = await page.$$eval(".thread-header-bar .msg-header-quick-actions svg", svgs => svgs.map(s => ({
      class: s.getAttribute("class") || "",
      viewBox: s.getAttribute("viewBox") || "",
      hasPath: s.querySelectorAll("path, g, rect, circle").length > 0,
      width: s.getBoundingClientRect().width,
      height: s.getBoundingClientRect().height
    })));

    console.log(`  class="msg-header-quick-actions" 中检测到 SVG 数量: ${quickSvgs.length}`);
    assert.ok(quickSvgs.length >= 5, "msg-header-quick-actions 中应至少渲染 5 个快捷操作图标 SVG");

    for (const [idx, icon] of quickSvgs.entries()) {
      assert.ok(icon.hasPath, `第 ${idx + 1} 个邮件头部快捷图标 SVG (${icon.class}) 必须包含矢量路径`);
      assert.ok(icon.width > 0 && icon.height > 0, `第 ${idx + 1} 个邮件头部快捷图标尺寸必须 > 0，当前为 ${icon.width}x${icon.height}`);
      console.log(`  ✓ 邮件头部快捷图标 [${idx + 1}] class="${icon.class}" 尺寸 ${icon.width.toFixed(1)}x${icon.height.toFixed(1)}，路径正常`);
    }

    console.log("\n==========================================================================");
    console.log("=== 全部 class=\"header-actions\" 与 class=\"msg-header-quick-actions\" 图标验证 100% 成功! ===");
    console.log("==========================================================================");
  } catch (err) {
    console.error("\n❌ 测试执行失败:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
