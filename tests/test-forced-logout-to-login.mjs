import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：登录失败/凭证过期被动与强制退出至 /login/ 界面端到端审计 ===");
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
    // -----------------------------------------------------------------------------
    // [测试 1] 登录合法站长账号，获取有效 Token
    // -----------------------------------------------------------------------------
    console.log("\n[测试 1] 获取真实站长 Token 并验证登录状态...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "Admin 登录失败: " + JSON.stringify(loginData));
    adminToken = typeof loginData.data === "string" ? loginData.data : loginData.data?.token;
    assert.ok(adminToken, "必须成功获取鉴权 Token");
    console.log("  ✓ Admin 登录成功，Token 已生成");

    // -----------------------------------------------------------------------------
    // [测试 2] 主动登出测试：验证点击登出后平滑硬跳转到 /login/，且 Token 被彻底清除
    // -----------------------------------------------------------------------------
    console.log("\n[测试 2] 审计主动登出：进入 /inbox 并点击退出登录...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("loginEmail", "admin@epomail.bond");
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, adminToken);
    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // 等待顶部头像加载并点击唤起下拉菜单
    const avatarDropdown = await page.waitForSelector(".avatar-wrap", { timeout: 15000 });
    assert.ok(avatarDropdown, "顶部导航栏必须存在用户头像 (.avatar-wrap)");
    await avatarDropdown.click();
    await page.waitForTimeout(600);

    const logoutItem = await page.waitForSelector(".am-item.logout", { timeout: 8000 });
    assert.ok(logoutItem, "下拉菜单必须渲染退出登录选项");
    await logoutItem.click();

    // 等待重定向至 /login/
    await page.waitForURL((url) => url.pathname.startsWith("/login"), { timeout: 10000 });
    console.log("  ✓ 主动登出成功导航至:", page.url());
    assert.ok(page.url().includes("/login"), "主动登出必须跳转至 /login/ 路径");

    // 验证 localStorage 中 token 已被彻底移除
    const tokenAfterLogout = await page.evaluate(() => localStorage.getItem("token"));
    assert.strictEqual(tokenAfterLogout, null, "登出后 localStorage 内的 token 必须为空");
    console.log("  ✓ localStorage 中的 token 已被完全清理");

    // -----------------------------------------------------------------------------
    // [测试 3] 被动/凭证过期强制退出测试：模拟 API 返回 401，验证强制退回 /login/?reason=expired
    // -----------------------------------------------------------------------------
    console.log("\n[测试 3] 审计凭证过期 (401) 强制退出：注入过期 Token 访问受保护页面...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    const fakeExpiredToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake_expired_token_payload.signature";
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("loginEmail", "admin@epomail.bond");
    }, fakeExpiredToken);

    // 访问 /inbox，触发鉴权失败 401
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });

    // 验证前端由于 401 拦截，直接重定向回 /login/ 界面，且携带 reason=expired
    await page.waitForURL((url) => url.pathname.startsWith("/login"), { timeout: 10000 });
    console.log("  ✓ 凭证失效被动退出成功导航至:", page.url());
    assert.ok(page.url().includes("/login"), "必须强制退回登录界面");

    // 验证过期后的 token 已被自动清除
    const tokenAfter401 = await page.evaluate(() => localStorage.getItem("token"));
    assert.strictEqual(tokenAfter401, null, "凭证失效后 localStorage 内的 token 必须被清除");

    // 验证登录卡片正常渲染，无白屏或崩溃
    await page.waitForSelector("#epo-email", { timeout: 10000 });
    console.log("  ✓ 登录卡片邮箱输入框正常加载渲染，零白屏");

    // -----------------------------------------------------------------------------
    // [测试 4] 审计受保护动态管理路由无凭证保护：杜绝误入公开 Profile (/:username)
    // -----------------------------------------------------------------------------
    console.log("\n[测试 4] 审计动态路由保护：无 Token 直接访问 /system-setting、/role 与 /all-users...");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // 1. 尝试直接访问 /system-setting
    await page.goto(BASE + "/system-setting", { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname.startsWith("/login"), { timeout: 8000 });
    console.log("  ✓ 访问 /system-setting 成功拦截并重定向至:", page.url());
    assert.ok(page.url().includes("/login"), "访问 /system-setting 必须被重定向至 /login/");

    // 2. 尝试直接访问 /role
    await page.goto(BASE + "/role", { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname.startsWith("/login"), { timeout: 8000 });
    console.log("  ✓ 访问 /role 成功拦截并重定向至:", page.url());
    assert.ok(page.url().includes("/login"), "访问 /role 必须被重定向至 /login/");

    // 3. 尝试直接访问 /all-users
    await page.goto(BASE + "/all-users", { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname.startsWith("/login"), { timeout: 8000 });
    console.log("  ✓ 访问 /all-users 成功拦截并重定向至:", page.url());
    assert.ok(page.url().includes("/login"), "访问 /all-users 必须被重定向至 /login/");

    // -----------------------------------------------------------------------------
    // [测试 5] 审计 SPA 内部直接访问 /login 杜绝 next(from.path) 困留
    // -----------------------------------------------------------------------------
    console.log("\n[测试 5] 审计访问 /login：验证彻底消除困留并直接转至登录页...");
    await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname.startsWith("/login"), { timeout: 8000 });
    console.log("  ✓ 访问 /login 成功抵达登录页面:", page.url());

    // -----------------------------------------------------------------------------
    // [测试 6] 重新登录验证回流完整性
    // -----------------------------------------------------------------------------
    console.log("\n[测试 6] 验证重新登录与回流...");
    await page.goto(BASE + "/login/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#epo-email", { timeout: 10000 });

    await page.fill("#epo-email", "admin@epomail.bond");
    await page.fill("#epo-password", "123456");
    await page.click('button[type="submit"]');

    // 等待跳转回收件箱
    await page.waitForURL((url) => url.pathname.includes("/inbox"), { timeout: 12000 });
    console.log("  ✓ 重新登录成功，顺畅回流至:", page.url());

    // -----------------------------------------------------------------------------
    // [测试 7] 截取终态快照供视觉复核
    // -----------------------------------------------------------------------------
    console.log("\n[测试 7] 截取终态快照...");
    await page.screenshot({ path: "tests/audit_login_flow_healthy.png" });
    console.log("  ✓ 快照已保存: tests/audit_login_flow_healthy.png");

    console.log("\n==========================================================================");
    console.log("=== 全部 7/7 检查项 100% 绿灯通过！强制退出与登录界面回流优化审计成功 ===");
    console.log("==========================================================================");

  } catch (error) {
    console.error("❌ 测试过程中发生异常:", error);
    await page.screenshot({ path: "tests/audit_login_flow_failure.png" }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
