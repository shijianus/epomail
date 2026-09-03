import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始 OAuth 开放平台与应用管理及 OIDC 授权全链路 Playwright E2E 测试 ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER UNCAUGHT ERROR:', err));

  const BASE = "https://epomail.epocanvas.workers.dev";
  let createdAppId = null;
  let testClientId = null;
  let testClientSecret = null;
  let authToken = null;

  try {
    // 1. 登录
    console.log("1. 正在登录 Cloudflare 生产环境...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    if (loginData.code !== 200) {
      throw new Error("登录失败: " + JSON.stringify(loginData));
    }
    authToken = loginData.data?.token;
    console.log("✓ 登录成功，获取 Token");

    // 2. 注入 Token 并打开应用
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, authToken);
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // 3. 导航至管理员「应用管理」分区
    console.log("2. 导航至管理员「应用管理」(/settings/oauth-apps)...");
    await page.goto(BASE + "/settings/oauth-apps", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // 验证页面基础元素
    const headerTitle = await page.locator(".header-container .main-title").innerText();
    console.log("页面标题:", headerTitle);
    assert.ok(headerTitle.includes("OAuth") || headerTitle.includes("应用管理"), "标题应包含 OAuth 或 应用管理");

    // 验证 4 大 OIDC 端点芯片
    const chipsCount = await page.locator(".endpoints-strip .endpoint-chip").count();
    console.log(`发现 ${chipsCount} 个标准 OIDC 端点快捷条`);
    assert.strictEqual(chipsCount, 4, "必须展示 4 个标准端点 (Discovery, Authorize, Token, UserInfo)");

    // 4. 点击「注册新应用」
    console.log("3. 点击「注册新应用」按钮并填写表单...");
    const regBtn = page.locator(".create-app-btn");
    await regBtn.click();
    await page.waitForSelector(".oauth-dialog", { timeout: 5000 });

    const appNameInput = page.locator(".oauth-dialog input").first();
    await appNameInput.fill("E2E Automated SSO Client");

    const homepageInput = page.locator(".oauth-dialog input").nth(1);
    await homepageInput.fill("https://test-sso.example.com");

    const descInput = page.locator(".oauth-dialog textarea").first();
    await descInput.fill("E2E Playwright Automated Test Application for SSO");

    const callbackInput = page.locator(".oauth-dialog textarea").nth(1);
    await callbackInput.fill("https://test-sso.example.com/api/auth/callback\nhttp://localhost:3000/api/auth/callback");

    // 提交创建
    const submitBtn = page.locator(".oauth-dialog .dialog-footer-actions .el-button--primary");
    await submitBtn.click();
    await page.waitForTimeout(2000);

    // 5. 验证 GitHub-style Secret Generated Reveal Modal
    console.log("4. 验证 Client Secret 生成弹窗 (GitHub-style Secret Reveal)...");
    await page.waitForSelector(".secret-reveal-dialog", { timeout: 8000 });
    
    const clientIdEl = page.locator(".secret-reveal-dialog .rev-row").first().locator(".rev-value");
    testClientId = (await clientIdEl.innerText()).trim();
    console.log("✓ 获取生成出来的 Client ID:", testClientId);
    assert.ok(testClientId.startsWith("epo_live_"), "Client ID 必须以 epo_live_ 开头");

    const clientSecretEl = page.locator(".secret-reveal-dialog .rev-row").nth(1).locator(".rev-value");
    testClientSecret = (await clientSecretEl.innerText()).trim();
    console.log("✓ 获取生成出来的 Client Secret:", testClientSecret.substring(0, 10) + "...");
    assert.ok(testClientSecret.startsWith("epo_sec_"), "Client Secret 必须以 epo_sec_ 开头");

    // 点击确认已保存按钮
    const savedBtn = page.locator(".secret-reveal-dialog .saved-confirm-btn");
    await savedBtn.click();
    await page.waitForTimeout(1000);

    // 6. 验证应用卡片已成功呈现在列表中
    console.log("5. 验证应用卡片与凭据展示...");
    const appCards = page.locator(".apps-grid .app-card");
    const cardsCount = await appCards.count();
    console.log(`当前共有 ${cardsCount} 个 OAuth 应用卡片`);
    assert.ok(cardsCount >= 1, "列表中应至少展示刚创建的应用");

    const cardText = await appCards.first().innerText();
    assert.ok(cardText.includes("E2E Automated SSO Client"), "卡片应展示应用名称");
    assert.ok(cardText.includes(testClientId), "卡片应展示对应 Client ID");

    // 7. 测试打开「快速集成指南」
    console.log("6. 测试快速集成代码生成器 (Playground)...");
    const guideBtn = appCards.first().locator(".app-card-footer .action-btn").first();
    await guideBtn.click();
    await page.waitForSelector(".guide-dialog", { timeout: 5000 });

    const codeBody = await page.locator(".guide-dialog .code-body").first().innerText();
    console.log("生成的 NextAuth 代码预览 (首50字符):", codeBody.substring(0, 50));
    assert.ok(codeBody.includes(testClientId), "代码范例应自动注入当前应用的 Client ID");

    // 关闭代码指南弹窗
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    // 8. 验证独立 OIDC 授权确认页 (/oauth/authorize)
    console.log("7. 验证标准 OIDC 授权确认页 (/oauth/authorize)...");
    
    // 拦截测试外部域名，确保导航能顺利完成
    await page.route("https://test-sso.example.com/**", route => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Mock Third-party SSO Callback OK</body></html>"
      });
    });

    const authUrl = `${BASE}/oauth/authorize?client_id=${testClientId}&redirect_uri=${encodeURIComponent('https://test-sso.example.com/api/auth/callback')}&scope=openid%20profile%20email&state=e2e_state_test_999`;
    await page.goto(authUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".consent-state", { timeout: 10000 });

    const consentContent = await page.locator(".oauth-card-container").innerText();
    console.log("授权页面标题与内容概要:", consentContent.split("\n").slice(0, 4).join(" | "));
    assert.ok(consentContent.includes("E2E Automated SSO Client"), "授权页必须展示当前第三方应用名称");
    assert.ok(consentContent.includes("admin@epomail.bond"), "授权页必须展示当前登录账号");
    assert.ok(consentContent.includes("OpenID"), "授权页必须展示 OpenID 权限");
    assert.ok(consentContent.includes("email"), "授权页必须展示 email 权限");

    // 截图保存
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_oauth_authorize_consent.png" });
    console.log("✓ 授权确认页截图已保存: tests/audit_oauth_authorize_consent.png");

    // 9. 点击「授权并继续」，捕获重定向 Code
    console.log("8. 点击「授权并继续」进行授权确认...");
    let capturedCode = null;
    let capturedState = null;

    // 监听导航至回调地址
    await Promise.all([
      page.waitForURL(url => url.toString().includes("test-sso.example.com/api/auth/callback"), { timeout: 10000 }),
      page.locator(".authorize-btn").click()
    ]);

    const currentUrl = page.url();
    console.log("授权后重定向目标 URL:", currentUrl);
    const redirectUrlObj = new URL(currentUrl);
    capturedCode = redirectUrlObj.searchParams.get("code");
    capturedState = redirectUrlObj.searchParams.get("state");

    console.log("✓ 成功获取授权码 Authorization Code:", capturedCode);
    console.log("✓ 成功匹配状态参数 State:", capturedState);

    assert.ok(capturedCode && capturedCode.startsWith("epo_code_"), "授权码 Code 必须以 epo_code_ 开头");
    assert.strictEqual(capturedState, "e2e_state_test_999", "State 参数必须完全一致");

    // 10. 后端接口测试：使用 Code 兑换 Access Token 与 ID Token
    console.log("9. 后端测试：POST /api/oauth/token 兑换令牌...");
    const tokenRes = await page.request.post(BASE + "/api/oauth/token", {
      data: {
        grant_type: "authorization_code",
        code: capturedCode,
        client_id: testClientId,
        client_secret: testClientSecret,
        redirect_uri: "https://test-sso.example.com/api/auth/callback"
      },
      headers: { "Content-Type": "application/json" }
    });

    const tokenPayload = await tokenRes.json();
    console.log("Token 置换返回响应:", tokenPayload);
    assert.ok(tokenPayload.access_token, "响应必须包含 access_token");
    assert.ok(tokenPayload.id_token, "响应必须包含标准 OIDC id_token");
    assert.strictEqual(tokenPayload.token_type, "Bearer", "token_type 必须为 Bearer");

    // 11. 后端接口测试：使用 Access Token 获取 UserInfo
    console.log("10. 后端测试：GET /api/oauth/userinfo 获取用户档案...");
    const userInfoRes = await page.request.get(BASE + "/api/oauth/userinfo", {
      headers: {
        "Authorization": `Bearer ${tokenPayload.access_token}`
      }
    });

    const userInfoPayload = await userInfoRes.json();
    console.log("UserInfo 档案返回:", userInfoPayload);
    assert.strictEqual(userInfoPayload.email, "admin@epomail.bond", "主邮箱地址必须正确");
    assert.strictEqual(userInfoPayload.email_verified, true, "email_verified 必须为 true");
    assert.ok(userInfoPayload.sub, "必须包含 sub 身份主键");

    // 12. 验证 OIDC Discovery 发现端点
    console.log("11. 后端测试：GET /.well-known/openid-configuration 元数据发现...");
    const discRes = await page.request.get(BASE + "/.well-known/openid-configuration");
    const discPayload = await discRes.json();
    console.log("Discovery Issuer:", discPayload.issuer);
    assert.ok(discPayload.authorization_endpoint.includes("/oauth/authorize"), "应包含 authorization_endpoint");
    assert.ok(discPayload.token_endpoint.includes("/oauth/token"), "应包含 token_endpoint");
    assert.ok(discPayload.userinfo_endpoint.includes("/oauth/userinfo"), "应包含 userinfo_endpoint");

    console.log("🎉 所有 OAuth / OIDC 开放平台与独立授权页测试全部 100% 顺利通过！");

  } catch (err) {
    console.error("测试失败:", err);
    process.exitCode = 1;
  } finally {
    // 13. 清理测试应用，杜绝残留脏数据 (Zero Fake Data Guarantee)
    if (authToken && testClientId) {
      console.log("12. 清理删除测试生成的 OAuth 应用...");
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
          console.log(`✓ 测试应用 ID ${createdApp.id} (${testClientId}) 已成功清理删除`);
        }
      } catch (cleanErr) {
        console.warn("清理测试应用异常:", cleanErr);
      }
    }
    await browser.close();
  }
})();
