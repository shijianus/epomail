import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始「资料分区 - 第三方应用与数据共享板块」全链路端到端审计 ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: "zh-CN"
  });
  const page = await context.newPage();

  page.on("console", msg => {
    if (msg.type() === "error") {
      console.log("BROWSER ERROR:", msg.text());
    }
  });

  const BASE = "https://epomail.epocanvas.workers.dev";
  let authToken = null;
  let testUserId = null;
  let grantedId = null;

  try {
    // -----------------------------------------------------------------------------------
    // 步骤 1: 登录并获取身份令牌
    // -----------------------------------------------------------------------------------
    console.log("1. 正在以站长身份登录 (admin@epomail.bond)...");
    const loginRes = await page.request.post(`${BASE}/api/login`, {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "登录必须成功");
    authToken = loginData.data?.token;
    testUserId = loginData.data?.userId;
    console.log(`✓ 登录成功: userId=${testUserId}, Token 获取完毕`);

    // -----------------------------------------------------------------------------------
    // 步骤 2: API 端点审计 - GET /api/my/oauthGrants
    // -----------------------------------------------------------------------------------
    console.log("2. 审计 GET /api/my/oauthGrants 端点结构与生态应用列表...");
    const grantsRes = await page.request.get(`${BASE}/api/my/oauthGrants`, {
      headers: { "Authorization": authToken }
    });
    assert.strictEqual(grantsRes.status(), 200, "GET /api/my/oauthGrants 状态码应为 200");
    const grantsData = await grantsRes.json();
    assert.strictEqual(grantsData.code, 200, "响应 code 应为 200");
    assert.ok(Array.isArray(grantsData.data?.grants), "响应必须包含 grants 数组");
    assert.ok(Array.isArray(grantsData.data?.ecosystemApps), "响应必须包含 ecosystemApps 数组");
    console.log(`✓ 获取到 ${grantsData.data.grants.length} 个已关联应用，${grantsData.data.ecosystemApps.length} 个生态可用应用`);

    // -----------------------------------------------------------------------------------
    // 步骤 3: 模拟发起 OAuth 授权与授权码生成
    // -----------------------------------------------------------------------------------
    console.log("3. 模拟发起 OAuth 2.0 授权并持久化 oauth_grant...");
    const clientId = "epo_live_shijianus_blog";
    const redirectUri = "https://blog.epocanvas.com/auth/callback";
    const requestedScope = "openid profile email comments";

    const authRes = await page.request.post(`${BASE}/oauth/authorize`, {
      data: {
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: requestedScope,
        state: "audit_state_test_123"
      },
      headers: {
        "Content-Type": "application/json",
        "Authorization": authToken
      }
    });

    const authData = await authRes.json();
    assert.strictEqual(authData.code, 200, "授权请求必须成功");
    assert.ok(authData.data?.code, "必须返回授权码 code");
    const authCode = authData.data.code;
    console.log("✓ 成功生成 OAuth 授权码:", authCode);

    // -----------------------------------------------------------------------------------
    // 步骤 4: 验证 oauth_grant 已记录并能通过 GET /api/my/oauthGrants 查询
    // -----------------------------------------------------------------------------------
    console.log("4. 验证已授权应用在 GET /api/my/oauthGrants 中精准列出...");
    const grantsAfterAuthRes = await page.request.get(`${BASE}/api/my/oauthGrants`, {
      headers: { "Authorization": authToken }
    });
    const grantsAfterAuth = await grantsAfterAuthRes.json();
    const blogGrant = grantsAfterAuth.data?.grants?.find(g => g.clientId === clientId);
    assert.ok(blogGrant, "grants 列表中必须包含刚刚授权的应用");
    grantedId = blogGrant.id;
    assert.strictEqual(blogGrant.appName, "shijianus-blog", "应用名称必须正确映射");
    assert.ok(blogGrant.scopes.includes("openid"), "权限必须包含 openid");
    assert.ok(blogGrant.scopes.includes("email"), "权限必须包含 email");
    assert.ok(blogGrant.scopes.includes("comments"), "权限必须包含 comments");
    console.log(`✓ 验证成功: grantId=${grantedId}, appName=${blogGrant.appName}, scopes=${blogGrant.scopes}`);

    // -----------------------------------------------------------------------------------
    // 步骤 5: 兑换 Access Token 并测试 /oauth/userinfo 访问
    // -----------------------------------------------------------------------------------
    console.log("5. 测试 Code 兑换 Access Token 及 UserInfo 访问...");
    // 查找 app 的 clientSecret
    const appListRes = await page.request.get(`${BASE}/api/admin/oauthApp/list`, {
      headers: { "Authorization": authToken }
    });
    const appListData = await appListRes.json();
    const targetApp = appListData.data?.find(a => a.clientId === clientId);
    assert.ok(targetApp, "必须存在 shijianus-blog 应用配置");

    // 兑换 token
    const tokenRes = await page.request.post(`${BASE}/api/oauth/token`, {
      data: {
        grant_type: "authorization_code",
        code: authCode,
        client_id: clientId,
        client_secret: targetApp.clientSecret,
        redirect_uri: redirectUri
      },
      headers: { "Content-Type": "application/json" }
    });
    const tokenData = await tokenRes.json();
    assert.ok(tokenData.access_token, "必须返回 access_token");
    const accessToken = tokenData.access_token;
    console.log("✓ 成功获取 Access Token (前20字符):", accessToken.substring(0, 20) + "...");

    // 调用 UserInfo
    const userInfoRes = await page.request.get(`${BASE}/api/oauth/userinfo`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    assert.strictEqual(userInfoRes.status(), 200, "UserInfo 应当正常响应 200");
    const userInfoData = await userInfoRes.json();
    assert.strictEqual(userInfoData.email, "admin@epomail.bond", "邮箱必须匹配");
    console.log("✓ UserInfo 响应正常:", userInfoData.email);

    // -----------------------------------------------------------------------------------
    // 步骤 6: 测试即时权限撤销与边缘网关阻断 (Instant Revocation Enforcement)
    // -----------------------------------------------------------------------------------
    console.log("6. 测试 DELETE /api/my/oauthGrants/:id 一键撤销授权...");
    const revokeRes = await page.request.delete(`${BASE}/api/my/oauthGrants/${grantedId}`, {
      headers: { "Authorization": authToken }
    });
    assert.strictEqual(revokeRes.status(), 200, "撤销接口必须返回 200");
    const revokeData = await revokeRes.json();
    assert.strictEqual(revokeData.code, 200, "撤销响应 code 必须为 200");
    console.log("✓ 成功撤销应用授权");

    // 验证实时吊销生效：同一 Access Token 立即被拦截
    console.log("7. 验证实时吊销：使用已吊销应用的原 Access Token 请求 UserInfo 应被严格拦截...");
    const revokedUserInfoRes = await page.request.get(`${BASE}/api/oauth/userinfo`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    assert.strictEqual(revokedUserInfoRes.status(), 401, "已撤销授权必须被立即切断并返回 401");
    console.log("✓ 边缘网关即时阻断验证通过: 401 Unauthorized");

    // -----------------------------------------------------------------------------------
    // 步骤 7: 浏览器端真实 UI 渲染与交互测试
    // -----------------------------------------------------------------------------------
    console.log("8. 启动浏览器 Playwright 导航至「资料」设置页 (/settings/data-setting)...");
    await page.goto(`${BASE}/inbox`, { waitUntil: "domcontentloaded" });
    await page.evaluate(t => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, authToken);

    // 重新创建一次 grant 供 UI 呈现与交互
    await page.request.post(`${BASE}/oauth/authorize`, {
      data: {
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: requestedScope,
        state: "ui_visual_test"
      },
      headers: { "Content-Type": "application/json", "Authorization": authToken }
    });

    await page.goto(`${BASE}/settings/data-setting`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // 验证板块容器存在
    const thirdPartySection = page.locator("#thirdPartyApps");
    await thirdPartySection.waitFor({ state: "visible", timeout: 10000 });
    console.log("✓ 资料分区中「与第三方应用和网站共享的数据」板块已正常挂载渲染");

    // 验证标题与导言
    const sectionTitle = await thirdPartySection.locator(".title").innerText();
    console.log("板块主标题:", sectionTitle);
    assert.ok(sectionTitle.includes("第三方应用和服务"), "标题必须清晰准确");

    // 验证应用卡片与权限胶囊
    const appCard = thirdPartySection.locator(".connected-app-card").first();
    await appCard.waitFor({ state: "visible", timeout: 5000 });
    const appCardText = await appCard.innerText();
    console.log("应用卡片文字摘要:", appCardText.split("\n").slice(0, 3).join(" | "));
    assert.ok(appCardText.includes("shijianus-blog"), "卡片必须展示应用名称");

    // 验证权限胶囊标签
    const scopePills = appCard.locator(".shared-scope-chip");
    const pillsCount = await scopePills.count();
    console.log(`应用卡片展示了 ${pillsCount} 个数据共享胶囊`);
    assert.ok(pillsCount >= 3, "必须清晰展示快捷登录、公开资料、邮箱地址等共享范围");

    // 截图 1: 卡片网格展示态
    await page.screenshot({
      path: "/home/shijian/projects/epocanvas-mail/tests/audit_third_party_grid.png",
      fullPage: false
    });
    console.log("✓ 卡片网格态截图已保存: tests/audit_third_party_grid.png");

    // 测试点击「查看详情」弹窗
    console.log("9. 测试点击「查看详情」弹窗...");
    const detailBtn = appCard.locator(".view-detail-btn");
    await detailBtn.click();
    await page.waitForSelector(".app-detail-dialog", { state: "visible", timeout: 5000 });

    const modalTitle = await page.locator(".app-detail-dialog .head-app-name").innerText();
    console.log("弹窗应用名称:", modalTitle);
    assert.strictEqual(modalTitle, "shijianus-blog", "弹窗标题必须匹配");

    // 验证弹窗中已授予的权限列表
    const modalAccessText = await page.locator(".app-detail-dialog .can-access-list").innerText();
    console.log("已授予权限列表预览:", modalAccessText.split("\n").slice(0, 2).join(" | "));
    assert.ok(modalAccessText.includes("快捷登录") || modalAccessText.includes("基本资料"), "必须展示已授予的权限");

    // 截图 2: 详情弹窗态
    await page.screenshot({
      path: "/home/shijian/projects/epocanvas-mail/tests/audit_third_party_modal.png",
      fullPage: false
    });
    console.log("✓ 详情弹窗截图已保存: tests/audit_third_party_modal.png");

    // 测试通过弹窗一键解除授权
    console.log("10. 测试从详情弹窗中点击「移除此应用的全部访问权限」...");
    const revokeModalBtn = page.locator(".app-detail-dialog .danger-revoke-btn");
    await revokeModalBtn.click();

    // 确认 ElMessageBox
    await page.waitForSelector(".el-message-box", { state: "visible", timeout: 5000 });
    const confirmBtn = page.locator(".el-message-box .el-button--danger");
    await confirmBtn.click();

    await page.waitForTimeout(1500);
    console.log("✓ 成功点击移除访问权限并确认");

    // -----------------------------------------------------------------------------------
    // 步骤 8: 验证空状态自愈与零残留
    // -----------------------------------------------------------------------------------
    console.log("11. 验证解除授权后的空状态卡片呈现与零脏数据残留...");
    const emptyHero = thirdPartySection.locator(".empty-hero-card");
    await emptyHero.waitFor({ state: "visible", timeout: 5000 });
    const emptyTitle = await emptyHero.locator(".empty-hero-title").innerText();
    console.log("空状态标题:", emptyTitle);
    assert.ok(emptyTitle.includes("暂无关联的第三方应用或网站"), "必须正确恢复为空状态");

    // 截图 3: 空状态与生态应用展示态
    await page.screenshot({
      path: "/home/shijian/projects/epocanvas-mail/tests/audit_third_party_empty.png",
      fullPage: false
    });
    console.log("✓ 空状态与生态展示截图已保存: tests/audit_third_party_empty.png");

    console.log("🎉「资料分区 - 第三方应用与数据共享板块」所有 11 项审计全部 100% 完美通过！");

  } catch (err) {
    console.error("❌ 审计失败:", err);
    process.exitCode = 1;
  } finally {
    // 数据自愈清理
    if (authToken) {
      try {
        const cleanupGrants = await page.request.get(`${BASE}/api/my/oauthGrants`, {
          headers: { "Authorization": authToken }
        });
        const d = await cleanupGrants.json();
        for (const g of (d.data?.grants || [])) {
          if (g.clientId === "epo_live_shijianus_blog") {
            await page.request.delete(`${BASE}/api/my/oauthGrants/${g.id}`, {
              headers: { "Authorization": authToken }
            });
          }
        }
      } catch (_) {}
    }
    await browser.close();
  }
})();
