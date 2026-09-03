import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("================================================================================");
  console.log("🚀 开始全系统「从零开始重写验证整体逻辑」端到端自动化深度审计测试 (Zero-to-One E2E)");
  console.log("================================================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  page.on('console', msg => console.log('[BROWSER CONSOLE]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[BROWSER UNCAUGHT]', err));

  const BASE = "https://epomail.epocanvas.workers.dev";
  let authToken = null;
  let testAppId = null;
  let testClientId = null;
  let testClientSecret = null;

  try {
    // -------------------------------------------------------------------------
    // Phase 1: 登录与会话初始化
    // -------------------------------------------------------------------------
    console.log("\n[Phase 1] 正在登录 Epomail 生产环境...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "管理员登录必须返回 HTTP 200: " + JSON.stringify(loginData));
    authToken = loginData.data?.token;
    assert.ok(authToken, "登录成功后必须获取到有效的 JWT Token");
    console.log("✓ Phase 1: 登录成功，获取管理员 Token");

    // 注入 Token 并打开应用
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, authToken);
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // -------------------------------------------------------------------------
    // Phase 2: 验证个人「资料」分区彻底解耦清退 (无 api-container)
    // -------------------------------------------------------------------------
    console.log("\n[Phase 2] 验证客户端个人「资料」分区 (/settings/data) 清退开发者 API...");
    await page.goto(BASE + "/settings/data", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // 验证 5 大选项卡
    const navItems = page.locator(".settings-nav-group .settings-nav-item");
    const tabCount = await navItems.count();
    assert.strictEqual(tabCount, 5, "个人设定组必须严格包含 5 项：个资、常规、安全、资料、标签");

    // 验证资料页结构
    const dataContent = await page.locator(".settings-content").innerText();
    assert.ok(dataContent.includes("用户资料与数据汇出"), "必须包含数据汇出模块");
    assert.ok(dataContent.includes("邮件与消息转发"), "必须包含邮件与消息转发模块");
    
    // 严格断言：绝不包含 api-container 开发者 API 与第三方接入
    assert.strictEqual(await page.locator(".container.api-container").count(), 0, "个人资料页必须彻底清退 .container.api-container");
    assert.ok(!dataContent.includes("开发者 API 与第三方应用接入"), "个人资料页文本中严禁残留开发者 API 描述");
    console.log("✓ Phase 2: 个人「资料」分区彻底解耦清退验证通过，零残留开发者 API 卡片");

    // -------------------------------------------------------------------------
    // Phase 3: 管理员「应用管理」独立分区全生命周期测试 (GitHub 风格)
    // -------------------------------------------------------------------------
    console.log("\n[Phase 3] 验证管理员专属「应用管理」独立分区 (/settings/oauth-apps)...");
    await page.goto(BASE + "/settings/oauth-apps", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".apps-container", { timeout: 10000 });
    await page.waitForTimeout(1000);

    // 验证标题与 OIDC 端点芯片
    const titleText = await page.locator(".header-container .main-title").innerText();
    assert.ok(titleText.includes("OAuth") || titleText.includes("应用管理"), "页面标题必须为 OAuth 应用管理");

    const endpointChips = page.locator(".endpoints-strip .endpoint-chip");
    assert.strictEqual(await endpointChips.count(), 4, "顶部必须展示 4 个标准 OIDC Discovery 端点");

    // 注册新应用
    console.log("3.1 注册新的第三方 OAuth 接入应用...");
    await page.locator(".create-app-btn").click();
    await page.waitForSelector(".oauth-dialog", { timeout: 5000 });

    const appNameInput = page.locator(".oauth-dialog input").first();
    await appNameInput.fill("Epomail Zero-To-One Verified Client");

    const homepageInput = page.locator(".oauth-dialog input").nth(1);
    await homepageInput.fill("https://zero-verify.epomail.bond");

    const descInput = page.locator(".oauth-dialog textarea").first();
    await descInput.fill("Production Zero-to-One E2E Test Client for SSO");

    const callbackInput = page.locator(".oauth-dialog textarea").nth(1);
    await callbackInput.fill("https://zero-verify.epomail.bond/auth/callback\nhttp://localhost:8080/callback");

    // 提交创建
    await page.locator(".oauth-dialog .dialog-footer-actions .el-button--primary").click();
    await page.waitForTimeout(1500);

    // 验证 GitHub 风格 Secret Reveal 弹窗
    console.log("3.2 验证 GitHub 风格 Client Secret 一次性安全弹窗...");
    await page.waitForSelector(".secret-reveal-dialog", { timeout: 8000 });

    const cidEl = page.locator(".secret-reveal-dialog .rev-row").first().locator(".rev-value");
    testClientId = (await cidEl.innerText()).trim();
    assert.ok(testClientId.startsWith("epo_live_"), "Client ID 必须以 epo_live_ 开头");

    const secEl = page.locator(".secret-reveal-dialog .rev-row").nth(1).locator(".rev-value");
    testClientSecret = (await secEl.innerText()).trim();
    assert.ok(testClientSecret.startsWith("epo_sec_"), "Client Secret 必须以 epo_sec_ 开头");
    console.log(`✓ 成功生成 Client ID: ${testClientId}`);
    console.log(`✓ 成功捕获 Client Secret: ${testClientSecret.substring(0, 12)}...`);

    // 点击我已妥善保存
    await page.locator(".secret-reveal-dialog .saved-confirm-btn").click();
    await page.waitForTimeout(1000);

    // 验证卡片已渲染在网格中
    const appCard = page.locator(".apps-grid .app-card").filter({ hasText: "Epomail Zero-To-One Verified Client" }).first();
    assert.ok(await appCard.count() > 0, "应用列表中必须包含刚刚创建的应用卡片");
    assert.ok((await appCard.innerText()).includes(testClientId), "应用卡片中必须展示对应 Client ID");

    // 验证快速集成 Playground 代码生成器
    console.log("3.3 验证快速集成 Playground 代码生成器...");
    await appCard.locator(".app-card-footer .action-btn").first().click();
    await page.waitForSelector(".guide-dialog", { timeout: 5000 });
    const snippetCode = await page.locator(".guide-dialog .code-body").first().innerText();
    assert.ok(snippetCode.includes(testClientId), "代码生成器必须自动注入当前应用的 Client ID");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    console.log("✓ Phase 3: 管理员「应用管理」全生命周期与 Playground 代码生成器验证通过");

    // -------------------------------------------------------------------------
    // Phase 4: 独立 OIDC 授权确认页 (/oauth/authorize) 交互测试
    // -------------------------------------------------------------------------
    console.log("\n[Phase 4] 验证独立 OIDC 授权确认页 (/oauth/authorize) 权限流程...");
    
    // 拦截回调地址，保障 Playwright 302 成功
    await page.route("https://zero-verify.epomail.bond/**", route => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Mock Third-party SSO App Callback Received OK</body></html>"
      });
    });

    const authorizeUrl = `${BASE}/oauth/authorize?client_id=${testClientId}&redirect_uri=${encodeURIComponent('https://zero-verify.epomail.bond/auth/callback')}&scope=openid%20profile%20email&state=zero_to_one_state_8888`;
    await page.goto(authorizeUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".consent-state", { timeout: 10000 });

    const consentBody = await page.locator(".oauth-card-container").innerText();
    assert.ok(consentBody.includes("Epomail Zero-To-One Verified Client"), "授权页必须展示第三方应用名称");
    assert.ok(consentBody.includes("admin@epomail.bond"), "授权页必须展示当前 Epomail 账号");
    assert.ok(consentBody.includes("OpenID") && consentBody.includes("email") && consentBody.includes("profile"), "授权页必须展示 3 大请求权限");

    // 点击授权并继续，捕获 302 回调中的 Code
    console.log("4.1 确认授权并捕获授权码 Authorization Code...");
    await Promise.all([
      page.waitForURL(url => url.toString().includes("zero-verify.epomail.bond/auth/callback"), { timeout: 10000 }),
      page.locator(".authorize-btn").click()
    ]);

    const finalCallbackUrl = new URL(page.url());
    const authCode = finalCallbackUrl.searchParams.get("code");
    const callbackState = finalCallbackUrl.searchParams.get("state");

    assert.ok(authCode && authCode.startsWith("epo_code_"), "授权码必须以 epo_code_ 开头: " + authCode);
    assert.strictEqual(callbackState, "zero_to_one_state_8888", "State 参数必须完全一致匹配");
    console.log(`✓ 成功捕获授权码: ${authCode}`);
    console.log(`✓ 状态参数 State 完全匹配: ${callbackState}`);
    console.log("✓ Phase 4: 独立 OIDC 授权确认与 Code 签发全流程验证通过");

    // -------------------------------------------------------------------------
    // Phase 5: 后端令牌兑换 (Token Exchange) 与 UserInfo 协议验证
    // -------------------------------------------------------------------------
    console.log("\n[Phase 5] 验证后端 OAuth 2.0 / OIDC 协议端点 (Token, UserInfo, Discovery)...");

    // 5.1 POST /api/oauth/token 兑换令牌
    console.log("5.1 请求 POST /api/oauth/token 兑换 Access Token 与 ID Token...");
    const tokenRes = await page.request.post(BASE + "/api/oauth/token", {
      data: {
        grant_type: "authorization_code",
        code: authCode,
        client_id: testClientId,
        client_secret: testClientSecret,
        redirect_uri: "https://zero-verify.epomail.bond/auth/callback"
      },
      headers: { "Content-Type": "application/json" }
    });

    const tokenPayload = await tokenRes.json();
    assert.ok(tokenPayload.access_token, "Token 返回中必须包含 access_token");
    assert.ok(tokenPayload.id_token, "Token 返回中必须包含标准 OIDC id_token");
    assert.strictEqual(tokenPayload.token_type, "Bearer", "token_type 必须为 Bearer");
    assert.strictEqual(tokenPayload.expires_in, 7200, "expires_in 必须为 7200 秒 (2小时)");
    console.log("✓ Access Token 与 ID Token 签发成功");

    // 5.2 GET /api/oauth/userinfo 获取用户档案
    console.log("5.2 请求 GET /api/oauth/userinfo 读取用户资料...");
    const userinfoRes = await page.request.get(BASE + "/api/oauth/userinfo", {
      headers: { "Authorization": `Bearer ${tokenPayload.access_token}` }
    });
    const userinfoPayload = await userinfoRes.json();
    assert.strictEqual(userinfoPayload.email, "admin@epomail.bond", "UserInfo 邮箱必须完全匹配");
    assert.strictEqual(userinfoPayload.email_verified, true, "email_verified 必须为 true");
    assert.ok(userinfoPayload.sub, "必须包含唯一用户主键 sub");
    console.log("✓ UserInfo 档案解析验证通过:", JSON.stringify(userinfoPayload));

    // 5.3 GET /.well-known/openid-configuration 元数据发现
    console.log("5.3 请求 GET /.well-known/openid-configuration 发现元数据...");
    const discRes = await page.request.get(BASE + "/.well-known/openid-configuration");
    const discPayload = await discRes.json();
    assert.ok(discPayload.issuer.includes("epomail"), "Issuer 必须包含 epomail 域名");
    assert.ok(discPayload.authorization_endpoint.includes("/oauth/authorize"), "必须包含 authorization_endpoint");
    assert.ok(discPayload.token_endpoint.includes("/oauth/token"), "必须包含 token_endpoint");
    assert.ok(discPayload.userinfo_endpoint.includes("/oauth/userinfo"), "必须包含 userinfo_endpoint");
    console.log("✓ OIDC Discovery 元数据符合 OpenID Connect Core 1.0 标准");
    console.log("✓ Phase 5: 后端协议端点 100% 验证通过");

    console.log("\n================================================================================");
    console.log("🎉 全系统「从零开始重写验证整体逻辑」自动化深度审计测试全部 100% 顺利通过！");
    console.log("================================================================================");

  } catch (err) {
    console.error("\n❌ 测试失败:", err);
    process.exitCode = 1;
  } finally {
    // -------------------------------------------------------------------------
    // Phase 6: 清理测试资源，严格杜绝假数据残留 (Zero Fake Data Guarantee)
    // -------------------------------------------------------------------------
    if (authToken && testClientId) {
      console.log("\n[Phase 6] 正在执行自动还原与测试数据清理...");
      try {
        const listRes = await page.request.get(BASE + "/api/admin/oauthApp/list", {
          headers: { "Authorization": authToken }
        });
        const listData = await listRes.json();
        const createdApp = (listData.data || []).find(a => a.clientId === testClientId);
        if (createdApp && createdApp.id) {
          await page.request.delete(BASE + "/api/admin/oauthApp/delete", {
            data: { id: createdApp.id },
            headers: { "Content-Type": "application/json", "Authorization": authToken }
          });
          console.log(`✓ 测试生成的 OAuth 应用 (ID: ${createdApp.id}, Client ID: ${testClientId}) 已安全清理删除`);
        }
      } catch (cleanErr) {
        console.warn("清理测试应用异常:", cleanErr);
      }
    }
    await browser.close();
  }
})();
