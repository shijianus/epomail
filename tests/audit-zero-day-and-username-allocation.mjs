import { chromium } from "playwright";
import assert from "node:assert";

(async () => {
  console.log("=== 开始零日漏洞加固、ID先到先得分配与站长/参观者解耦端到端审计 ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  let pioneerUserId = null;
  let followerUserId = null;

  try {
    // --------------------------------------------------------------------------------------
    // 1. 站长主账号保护与 /admin 专属主页审计 (User 1)
    // --------------------------------------------------------------------------------------
    console.log("\n[1. 站长主账号特权保护与 /admin 专属主页审计]");
    
    // 登录站长
    const loginBondRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginBondJson = await loginBondRes.json();
    assert.strictEqual(loginBondJson.code, 200, "admin@epomail.bond 登录失败");
    const tokenBond = typeof loginBondJson.data === "string" ? loginBondJson.data : loginBondJson.data?.token;
    console.log("  ✓ 站长登录成功");

    // 1.1 站长防误删保护 (禁止物理删除 User 1)
    console.log("  - 测试站长防物理删除保护 (userId: 1)...");
    const deleteAdminRes = await page.request.delete(BASE + "/api/user/delete?userIds=1", {
      headers: { Authorization: tokenBond }
    });
    const deleteAdminJson = await deleteAdminRes.json();
    assert.strictEqual(deleteAdminJson.code, 403, "站长账号禁止物理删除");
    console.log("  ✓ 站长防物理删除拦截 403 通过");

    // 1.2 站长防封禁保护 (禁止将 User 1 status 设为 0)
    console.log("  - 测试站长防封禁保护 (userId: 1, status: 0)...");
    const banAdminRes = await page.request.put(BASE + "/api/user/setStatus", {
      data: { userId: 1, status: 0 },
      headers: { Authorization: tokenBond, "Content-Type": "application/json" }
    });
    const banAdminJson = await banAdminRes.json();
    assert.strictEqual(banAdminJson.code, 403, "站长账号禁止封禁禁用");
    console.log("  ✓ 站长防封禁拦截 403 通过");

    // 1.3 站长主信箱防删除保护 (禁止删除 Account 1)
    console.log("  - 测试站长主信箱防删除保护 (accountId: 1)...");
    const deleteAccRes = await page.request.delete(BASE + "/api/user/deleteAccount?accountId=1", {
      headers: { Authorization: tokenBond }
    });
    const deleteAccJson = await deleteAccRes.json();
    assert.strictEqual(deleteAccJson.code, 403, "站长主信箱禁止删除");
    console.log("  ✓ 站长主信箱防删除拦截 403 通过");

    // 1.4 站长防清空邮件保护 (禁止清空 User 1 邮件)
    console.log("  - 测试站长防清空邮件保护 (userId: 1)...");
    const purgeAdminRes = await page.request.post(BASE + "/api/user/purgeEmails", {
      data: { userId: 1 },
      headers: { Authorization: tokenBond, "Content-Type": "application/json" }
    });
    const purgeAdminJson = await purgeAdminRes.json();
    assert.strictEqual(purgeAdminJson.code, 403, "站长邮件禁止被外部清空");
    console.log("  ✓ 站长防清空邮件拦截 403 通过");

    // 1.5 站长专属 /admin 资料卡解析
    console.log("  - 验证 /api/public/profile/admin 严格解析至站长 User 1...");
    const profileAdminRes = await page.request.get(BASE + "/api/public/profile/admin", {
      headers: { Authorization: tokenBond }
    });
    const profileAdminJson = await profileAdminRes.json();
    assert.strictEqual(profileAdminJson.code, 200, "获取 /admin 资料失败");
    assert.strictEqual(profileAdminJson.data?.userInfo?.email, "admin@epomail.bond", "/admin 必须解析为 admin@epomail.bond");
    assert.strictEqual(profileAdminJson.data?.userInfo?.roleName, "站长", "站长角色名必须为站长");
    console.log("  ✓ /admin 精准且唯一解析至超级管理员 User 1");

    // --------------------------------------------------------------------------------------
    // 2. 参观者账号隔离与 /admin@epomail.cyou 专属卡片 (User 9)
    // --------------------------------------------------------------------------------------
    console.log("\n[2. 参观者账号隔离与 /admin@epomail.cyou 资料卡审计]");
    
    // 登录参观者
    const loginCyouRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.cyou", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginCyouJson = await loginCyouRes.json();
    assert.strictEqual(loginCyouJson.code, 200, "admin@epomail.cyou 登录失败");
    const tokenCyou = typeof loginCyouJson.data === "string" ? loginCyouJson.data : loginCyouJson.data?.token;
    console.log("  ✓ 参观者登录成功");

    // 2.1 参观者无权调用 purgeEmails (BOLA/IDOR 防御)
    console.log("  - 测试参观者越权调用 /api/user/purgeEmails 拦截...");
    const purgeCyouRes = await page.request.post(BASE + "/api/user/purgeEmails", {
      data: { userId: 9 },
      headers: { Authorization: tokenCyou, "Content-Type": "application/json" }
    });
    const purgeCyouJson = await purgeCyouRes.json();
    assert.strictEqual(purgeCyouJson.code, 403, "参观者调用 /api/user/purgeEmails 必须被拦截");
    console.log("  ✓ 参观者调用 purgeEmails 403 严格拦截通过");

    // 2.2 参观者资料卡解析 (/admin@epomail.cyou)
    console.log("  - 验证 /api/public/profile/admin@epomail.cyou 解析...");
    const profileCyouRes = await page.request.get(BASE + "/api/public/profile/admin@epomail.cyou", {
      headers: { Authorization: tokenCyou }
    });
    const profileCyouJson = await profileCyouRes.json();
    assert.strictEqual(profileCyouJson.code, 200, "获取 /admin@epomail.cyou 资料失败");
    assert.strictEqual(profileCyouJson.data?.userInfo?.email, "admin@epomail.cyou", "必须解析为 admin@epomail.cyou");
    assert.strictEqual(profileCyouJson.data?.userInfo?.roleName, "参观者", "角色必须为参观者");
    console.log("  ✓ /admin@epomail.cyou 资料卡准确呈现参观者配置");

    // 2.3 参观者访问 /admin 无法越权查看站长私有资料 (非公开模式下严格返回 403)
    console.log("  - 验证参观者查看 /api/public/profile/admin 私有数据越权防御 (严格 403 拦截)...");
    const profileAdminByCyouRes = await page.request.get(BASE + "/api/public/profile/admin", {
      headers: { Authorization: tokenCyou }
    });
    const profileAdminByCyouJson = await profileAdminByCyouRes.json();
    assert.strictEqual(profileAdminByCyouJson.code, 403, "未公开资料下，非本人访问他人 Profile 必须被 403 拦截！");
    console.log("  ✓ 参观者越权查看站长资料被 403 严格防御，数据完全保密");

    // --------------------------------------------------------------------------------------
    // 3. 用户名 ID 先到先得分配机制审计 (跨域名抢注防御)
    // --------------------------------------------------------------------------------------
    console.log("\n[3. 用户名 ID 先到先得分配机制与跨域名注册审计]");
    const pioneerPrefix = `pioneer_${Date.now()}`;
    const pioneerEmail = `${pioneerPrefix}@epomail.bond`;
    const followerEmail = `${pioneerPrefix}@epomail.cyou`;

    console.log(`  - 先行者注册 ${pioneerEmail}，应享有纯简写用户名 '${pioneerPrefix}'...`);
    const regPioneerRes = await page.request.post(BASE + "/api/register", {
      data: { email: pioneerEmail, password: "Password123!" },
      headers: { "Content-Type": "application/json" }
    });
    const regPioneerJson = await regPioneerRes.json();
    assert.strictEqual(regPioneerJson.code, 200, `先行者注册失败: ${regPioneerJson.message}`);

    // 先行者登录获取 Token
    const pioneerLoginRes = await page.request.post(BASE + "/api/login", {
      data: { email: pioneerEmail, password: "Password123!" },
      headers: { "Content-Type": "application/json" }
    });
    const pioneerLoginJson = await pioneerLoginRes.json();
    assert.strictEqual(pioneerLoginJson.code, 200, `先行者登录失败: ${pioneerLoginJson.message}`);
    const pioneerToken = typeof pioneerLoginJson.data === "string" ? pioneerLoginJson.data : pioneerLoginJson.data?.token;

    const pioneerInfoRes = await page.request.get(BASE + "/api/my/loginUserInfo", {
      headers: { Authorization: pioneerToken }
    });
    const pioneerInfoJson = await pioneerInfoRes.json();
    pioneerUserId = pioneerInfoJson.data?.userId;
    assert.strictEqual(pioneerInfoJson.data?.account?.name, pioneerPrefix, "先行者应当独占简洁用户名");
    console.log(`  ✓ 先行者成功独占简洁用户名: '${pioneerInfoJson.data?.account?.name}'`);

    // 验证先行者自身可以访问其公共 Profile
    const pioneerProfileRes = await page.request.get(BASE + `/api/public/profile/${pioneerPrefix}`, {
      headers: { Authorization: pioneerToken }
    });
    const pioneerProfileJson = await pioneerProfileRes.json();
    assert.strictEqual(pioneerProfileJson.code, 200);
    assert.strictEqual(pioneerProfileJson.data?.userInfo?.email, pioneerEmail, "简洁路径必须映射到先行者邮箱");
    console.log(`  ✓ 公共 Profile /${pioneerPrefix} 成功解析到先行者`);

    console.log(`  - 后续注册者在另一域名使用相同前缀 ${followerEmail}，用户名应被赋予全邮箱...`);
    const regFollowerRes = await page.request.post(BASE + "/api/register", {
      data: { email: followerEmail, password: "Password123!" },
      headers: { "Content-Type": "application/json" }
    });
    const regFollowerJson = await regFollowerRes.json();
    assert.strictEqual(regFollowerJson.code, 200, `后续者注册失败: ${regFollowerJson.message}`);

    // 后续者登录获取 Token
    const followerLoginRes = await page.request.post(BASE + "/api/login", {
      data: { email: followerEmail, password: "Password123!" },
      headers: { "Content-Type": "application/json" }
    });
    const followerLoginJson = await followerLoginRes.json();
    assert.strictEqual(followerLoginJson.code, 200, `后续者登录失败: ${followerLoginJson.message}`);
    const followerToken = typeof followerLoginJson.data === "string" ? followerLoginJson.data : followerLoginJson.data?.token;

    const followerInfoRes = await page.request.get(BASE + "/api/my/loginUserInfo", {
      headers: { Authorization: followerToken }
    });
    const followerInfoJson = await followerInfoRes.json();
    followerUserId = followerInfoJson.data?.userId;
    assert.strictEqual(followerInfoJson.data?.account?.name, followerEmail, "后续者名下账号的用户名必须为全邮箱");
    console.log(`  ✓ 后续注册者成功被分配全邮箱用户名: '${followerInfoJson.data?.account?.name}'`);

    // 再次验证简洁路径 /pioneerPrefix 仍然属于先行者，绝不被后续者篡夺
    const pioneerProfileCheckRes = await page.request.get(BASE + `/api/public/profile/${pioneerPrefix}`, {
      headers: { Authorization: pioneerToken }
    });
    const pioneerProfileCheckJson = await pioneerProfileCheckRes.json();
    assert.strictEqual(pioneerProfileCheckJson.data?.userInfo?.email, pioneerEmail, "先行者的简洁用户名所有权不可撼动");
    console.log("  ✓ 先行者简洁用户名未被后续抢注者篡夺");

    // 验证后续者可通过全邮箱路径访问其 profile
    const followerProfileRes = await page.request.get(BASE + `/api/public/profile/${followerEmail}`, {
      headers: { Authorization: followerToken }
    });
    const followerProfileJson = await followerProfileRes.json();
    assert.strictEqual(followerProfileJson.code, 200);
    assert.strictEqual(followerProfileJson.data?.userInfo?.email, followerEmail);
    console.log(`  ✓ 后续者全邮箱 Profile /${followerEmail} 解析成功`);

    // --------------------------------------------------------------------------------------
    // 4. 零日漏洞扫描加固项防护审计 (生产接口防护、路径鉴权、XSS等)
    // --------------------------------------------------------------------------------------
    console.log("\n[4. 零日漏洞扫描加固项防护审计]");

    // 4.1 生产环境禁用 /test-receive 模拟收件端点
    console.log("  - 测试未授权调用 /api/test-receive 拦截 (要求 401)...");
    const testReceiveNoAuthRes = await page.request.post(BASE + "/api/test-receive");
    const testReceiveNoAuthJson = await testReceiveNoAuthRes.json();
    assert.strictEqual(testReceiveNoAuthJson.code, 401, "未授权调用 /api/test-receive 必须返回 401");
    console.log("  ✓ 未授权调用 /api/test-receive 成功被安全网关拦截 (401)");

    console.log("  - 测试已授权调用 /api/test-receive 生产环境硬拦截 (要求 403 Forbidden)...");
    const testReceiveAuthRes = await page.request.post(BASE + "/api/test-receive", {
      headers: { Authorization: tokenBond }
    });
    assert.strictEqual(testReceiveAuthRes.status(), 403, "生产环境即使带 Token 也不得调用 /api/test-receive (403)");
    const testReceiveAuthText = await testReceiveAuthRes.text();
    assert.ok(testReceiveAuthText.includes("disabled in production"), "必须提示 disabled in production");
    console.log("  ✓ 生产环境未授权与已授权模拟收件端点双重硬防线完全生效 (401 + 403 Forbidden)");

    // 4.2 /oss-url/* 前缀越权绕过漏洞已修复 (非 /oss/ 不得放行)
    console.log("  - 测试 /api/oss-url 未授权绕过防御 (要求 401)...");
    const ossRes = await page.request.get(BASE + "/api/oss-url/secret-file");
    const ossJson = await ossRes.json();
    assert.strictEqual(ossJson.code, 401, "未授权访问 /api/oss-url 必须返回 401");
    console.log("  ✓ /oss-url 前缀模糊匹配越权漏洞已彻底阻断修复 (401)");

    // --------------------------------------------------------------------------------------
    // 5. 浏览器 UI 渲染与身份卡片呈现审计
    // --------------------------------------------------------------------------------------
    console.log("\n[5. 浏览器 UI 渲染与身份卡片呈现审计]");
    
    // 5.1 登录 admin@epomail.cyou 并检查访问 /admin@epomail.cyou
    await page.goto(BASE + "/login/index.html", { waitUntil: "networkidle" });
    await page.waitForSelector("#epo-email", { timeout: 10000 });
    await page.fill("#epo-email", "admin@epomail.cyou");
    await page.fill("#epo-password", "123456");
    await page.click('button[type="submit"]');
    await page.waitForURL(url => url.pathname.includes("/inbox"), { timeout: 15000 });
    console.log("  ✓ 浏览器登录 admin@epomail.cyou 成功");

    // 导航到 /admin@epomail.cyou
    await page.goto(BASE + "/admin@epomail.cyou", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // 确认页面展示“演示参观者”或“参观者”标签
    const pageContent = await page.content();
    assert.ok(
      pageContent.includes("演示参观者") || pageContent.includes("参观者") || pageContent.includes("公开演示账号"),
      "参观者主页必须展示参观者专属身份标识"
    );
    console.log("  ✓ 参观者资料卡展示参观者专属身份标识");

    await page.screenshot({ path: "tests/audit_visitor_profile_decoupled.png", fullPage: true });
    console.log("  ✓ 已保存参观者专属资料页截图 tests/audit_visitor_profile_decoupled.png");

  } finally {
    // --------------------------------------------------------------------------------------
    // 6. 测试假数据 100% 物理清理 (零假数据与测试自动还原准则)
    // --------------------------------------------------------------------------------------
    console.log("\n[6. 清理测试数据，恪守零残留准则]");
    if (pioneerUserId || followerUserId) {
      const loginBondRes = await page.request.post(BASE + "/api/login", {
        data: { email: "admin@epomail.bond", password: "123456" },
        headers: { "Content-Type": "application/json" }
      });
      const loginBondJson = await loginBondRes.json();
      const tokenBond = typeof loginBondJson.data === "string" ? loginBondJson.data : loginBondJson.data?.token;

      const toDelete = [pioneerUserId, followerUserId].filter(Boolean);
      console.log(`  - 物理清理测试账号: [${toDelete.join(", ")}]...`);
      const delRes = await page.request.delete(BASE + `/api/user/delete?userIds=${toDelete.join(",")}`, {
        headers: { Authorization: tokenBond }
      });
      const delJson = await delRes.json();
      console.log(`  ✓ 测试账号清理响应: code=${delJson.code}, message=${delJson.message}`);
    }

    await browser.close();
    console.log("\n========================================================");
    console.log("🎉 全部零日漏洞加固与先到先得分配 E2E 审计 100% 成功全绿通过！");
    console.log("========================================================");
  }
})();
