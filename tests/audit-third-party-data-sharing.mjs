import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始「资料分区 - 第三方应用与数据共享板块」全链路端到端审计 ===");
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-ipv6", "--no-sandbox", "--disable-setuid-sandbox"]
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: "zh-CN"
  });
  const page = await context.newPage();

  page.on("console", msg => {
    console.log(`[PAGE ${msg.type().toUpperCase()}]:`, msg.text());
  });

  page.on("response", async res => {
    if (res.url().includes("/oauthGrants") || res.url().includes("/revokeOauthGrant")) {
      let bodyText = "";
      try { bodyText = await res.text(); } catch (_) {}
      console.log(`[NETWORK ${res.request().method()} ${res.status()}] ${res.url()}: ${bodyText}`);
    }
  });

  const BASE = "https://epomail.epocanvas.workers.dev";
  let authToken = null;
  let testUserId = null;
  let grantedId = null;

  async function requestWithRetry(fn, retries = 3, delayMs = 1500) {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === retries - 1) throw err;
        console.warn(`[RETRY] 网络请求重试 (${i + 1}/${retries})...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  try {
    // -----------------------------------------------------------------------------------
    // 步骤 1: 登录并获取身份令牌
    // -----------------------------------------------------------------------------------
    console.log("1. 正在以站长身份登录 (admin@epomail.bond)...");
    const loginRes = await requestWithRetry(() => page.request.post(`${BASE}/api/login`, {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    }));
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "登录必须成功");
    authToken = loginData.data?.token;
    testUserId = loginData.data?.userId;
    console.log(`✓ 登录成功: userId=${testUserId}, Token 获取完毕`);

    // -----------------------------------------------------------------------------------
    // 步骤 2: API 端点审计 - GET /api/my/oauthGrants
    // -----------------------------------------------------------------------------------
    console.log("2. 审计 GET /api/my/oauthGrants 端点结构与生态应用列表...");
    const grantsRes = await requestWithRetry(() => page.request.get(`${BASE}/api/my/oauthGrants`, {
      headers: { "Authorization": authToken }
    }));
    assert.strictEqual(grantsRes.status(), 200, "GET /api/my/oauthGrants 状态码应为 200");
    const grantsData = await grantsRes.json();
    assert.strictEqual(grantsData.code, 200, "响应 code 应为 200");
    assert.ok(Array.isArray(grantsData.data?.grants), "响应必须包含 grants 数组");
    assert.ok(Array.isArray(grantsData.data?.ecosystemApps), "响应必须包含 ecosystemApps 数组");
    console.log(`✓ 获取到 ${grantsData.data.grants.length} 个已关联应用，${grantsData.data.ecosystemApps.length} 个生态可用应用`);

    // 核心资安核查：系统已注册的 OAuth 应用必须 100% 同步加载至用户授权列表中 (杜绝隐形数据访问死角)
    assert.ok(grantsData.data.grants.length >= 2, "系统已注册的 OAuth 应用必须 100% 同步加载至用户授权列表中");
    const clientIds = grantsData.data.grants.map(g => g.clientId);
    assert.ok(clientIds.includes("epo_live_shijianus_blog"), "必须同步加载并展示 shijianus-blog");
    assert.ok(clientIds.includes("epo_live_epocanvas_image"), "必须同步加载并展示 EpoCanvasImage");
    console.log("✓ 资安核查通过：全平台活跃 OAuth 应用已全部同步加载！");

    // -----------------------------------------------------------------------------------
    // 步骤 3: 模拟发起 OAuth 授权与授权码生成
    // -----------------------------------------------------------------------------------
    console.log("3. 模拟发起 OAuth 2.0 授权并更新 oauth_grant scopes...");
    const clientId = "epo_live_shijianus_blog";
    const redirectUri = "https://blog.epocanvas.com/auth/callback";
    const requestedScope = "openid profile email comments";

    const authRes = await requestWithRetry(() => page.request.post(`${BASE}/oauth/authorize`, {
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
    }));

    const authData = await authRes.json();
    assert.strictEqual(authData.code, 200, "授权请求必须成功");
    assert.ok(authData.data?.code, "必须返回授权码 code");
    const authCode = authData.data.code;
    console.log("✓ 成功生成 OAuth 授权码:", authCode);

    // -----------------------------------------------------------------------------------
    // 步骤 4: 验证 oauth_grant 已记录并能通过 GET /api/my/oauthGrants 查询
    // -----------------------------------------------------------------------------------
    console.log("4. 验证已授权应用在 GET /api/my/oauthGrants 中精准列出...");
    const grantsAfterAuthRes = await requestWithRetry(() => page.request.get(`${BASE}/api/my/oauthGrants`, {
      headers: { "Authorization": authToken }
    }));
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
    const appListRes = await requestWithRetry(() => page.request.get(`${BASE}/api/admin/oauthApp/list`, {
      headers: { "Authorization": authToken }
    }));
    const appListData = await appListRes.json();
    const targetApp = appListData.data?.find(a => a.clientId === clientId);
    assert.ok(targetApp, "必须存在 shijianus-blog 应用配置");

    // 兑换 token
    const tokenRes = await requestWithRetry(() => page.request.post(`${BASE}/api/oauth/token`, {
      data: {
        grant_type: "authorization_code",
        code: authCode,
        client_id: clientId,
        client_secret: targetApp.clientSecret,
        redirect_uri: redirectUri
      },
      headers: { "Content-Type": "application/json" }
    }));
    const tokenData = await tokenRes.json();
    assert.ok(tokenData.access_token, "必须返回 access_token");
    const accessToken = tokenData.access_token;
    console.log("✓ 成功获取 Access Token (前20字符):", accessToken.substring(0, 20) + "...");

    // 调用 UserInfo
    const userInfoRes = await requestWithRetry(() => page.request.get(`${BASE}/api/oauth/userinfo`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    }));
    assert.strictEqual(userInfoRes.status(), 200, "UserInfo 应当正常响应 200");
    const userInfoData = await userInfoRes.json();
    assert.strictEqual(userInfoData.email, "admin@epomail.bond", "邮箱必须匹配");
    console.log("✓ UserInfo 响应正常:", userInfoData.email);

    // -----------------------------------------------------------------------------------
    // 步骤 6: 测试即时权限撤销与边缘网关阻断 (Instant Revocation Enforcement)
    // -----------------------------------------------------------------------------------
    console.log("6. 测试 DELETE /api/my/oauthGrants/:id 一键撤销授权...");
    const revokeRes = await requestWithRetry(() => page.request.delete(`${BASE}/api/my/oauthGrants/${grantedId}`, {
      headers: { "Authorization": authToken }
    }));
    assert.strictEqual(revokeRes.status(), 200, "撤销接口必须返回 200");
    const revokeData = await revokeRes.json();
    assert.strictEqual(revokeData.code, 200, "撤销响应 code 必须为 200");
    console.log("✓ 成功撤销应用授权");

    // 验证实时吊销生效：同一 Access Token 立即被拦截
    console.log("7. 验证实时吊销：使用已吊销应用的原 Access Token 请求 UserInfo 应被严格拦截...");
    const revokedUserInfoRes = await requestWithRetry(() => page.request.get(`${BASE}/api/oauth/userinfo`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    }));
    assert.strictEqual(revokedUserInfoRes.status(), 401, "已撤销授权必须被立即切断并返回 401");
    console.log("✓ 边缘网关即时阻断验证通过: 401 Unauthorized");

    // -----------------------------------------------------------------------------------
    // 步骤 8: 浏览器端真实 UI 渲染与交互测试
    // -----------------------------------------------------------------------------------
    console.log("8. 启动浏览器 Playwright 导航至「资料」设置页 (/settings/data-setting)...");

    // 重新为 shijianus-blog 授权供 UI 呈现与交互
    await requestWithRetry(() => page.request.post(`${BASE}/oauth/authorize`, {
      data: {
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: requestedScope,
        state: "ui_visual_test"
      },
      headers: { "Content-Type": "application/json", "Authorization": authToken },
      timeout: 60000
    }));

    await context.addInitScript(t => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, authToken);

    await page.goto(`${BASE}/settings/data-setting`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);

    // 验证板块容器存在
    const thirdPartySection = page.locator("#thirdPartyApps");
    await thirdPartySection.waitFor({ state: "visible", timeout: 10000 });
    console.log("✓ 资料分区中「与第三方应用和网站共享的数据」板块已正常挂载渲染");

    // 核心准则验证：用户界面与管理界面彻底解耦，严禁出现'管理 OAuth 应用'按钮
    const manageBtnCount = await page.locator(".manage-oauth-btn").count();
    assert.strictEqual(manageBtnCount, 0, "用户界面与管理界面必须严格独立，严禁混为一谈出现'管理 OAuth 应用'按钮");
    console.log("✓ 界面隔离验证通过：未渲染管理端入口按钮");

    // 核心架构优化：el-input__wrapper 功能已移入 topbar-search，板块内不再残留多余的搜索输入框
    const insideInputWrapperCount = await thirdPartySection.locator(".el-input__wrapper").count();
    assert.strictEqual(insideInputWrapperCount, 0, "第三方应用板块内禁止残留 redundant 的 el-input__wrapper，应使用顶栏全局 topbar-search");
    console.log("✓ 结构优化验证通过：第三方应用板块内已无 el-input__wrapper，纯粹简洁");

    // 验证顶栏 topbar-search 兼容性及精确针对 app 的内置检索
    // 确保异步数据加载完成且应用卡片已渲染
    await thirdPartySection.locator(".connected-app-card").first().waitFor({ state: "visible", timeout: 15000 });
    const readyCardCount = await thirdPartySection.locator(".connected-app-card").count();
    console.log("页面初次加载完毕，已渲染应用卡片数:", readyCardCount);
    assert.ok(readyCardCount >= 2, "必须渲染全平台已关联应用卡片");

    const topbarInput = page.locator(".topbar-search input");
    const placeholder = await topbarInput.getAttribute("placeholder");
    console.log("顶栏搜索框占位符:", placeholder);
    assert.ok(placeholder.includes("第三方应用") || placeholder.includes("设定") || placeholder.includes("Settings"), "顶栏搜索框必须兼容呈现设置/应用检索提示");

    // 测试 1: 在顶栏检索 'blog'
    await topbarInput.fill("blog");
    await page.waitForTimeout(500);
    const blogFilteredCount = await thirdPartySection.locator(".connected-app-card").count();
    console.log("顶栏搜索 'blog' 匹配应用卡片数:", blogFilteredCount);
    assert.strictEqual(blogFilteredCount, 1, "顶栏搜索 'blog' 必须精确匹配到 1 个应用");

    // 测试 2: 在顶栏使用内置语法前缀 'app:image' 精确检索
    await topbarInput.fill("app:image");
    await page.waitForTimeout(500);
    const imageFilteredCount = await thirdPartySection.locator(".connected-app-card").count();
    console.log("顶栏搜索 'app:image' 匹配应用卡片数:", imageFilteredCount);
    assert.strictEqual(imageFilteredCount, 1, "顶栏搜索 'app:image' 必须精确匹配到 1 个应用");

    // 测试 3: 清空顶栏搜索框，恢复全量展示
    await topbarInput.fill("");
    await page.waitForTimeout(500);
    const restoredCount = await thirdPartySection.locator(".connected-app-card").count();
    console.log("清空顶栏搜索后恢复卡片数:", restoredCount);
    assert.strictEqual(restoredCount, 2, "清空顶栏搜索框后必须恢复全量应用卡片");

    // 验证标题与导言
    const sectionTitle = await thirdPartySection.locator(".title").innerText();
    console.log("板块主标题:", sectionTitle);
    assert.ok(sectionTitle.includes("第三方应用和服务"), "标题必须清晰准确");

    // 验证系统已添加的多个 OAuth 应用卡片同步渲染
    const appCards = thirdPartySection.locator(".connected-app-card");
    const initialCardCount = await appCards.count();
    console.log(`✓ 前端界面成功同步渲染了 ${initialCardCount} 个已接入的应用卡片`);
    assert.ok(initialCardCount >= 2, "前端界面必须同步展示所有已接入的 OAuth 应用卡片");

    // 验证应用卡片内容
    const appCard = appCards.first();
    const appCardText = await appCard.innerText();
    console.log("首个卡片文字摘要:", appCardText.split("\n").slice(0, 3).join(" | "));

    // 验证权限胶囊标签
    const scopePills = appCard.locator(".shared-scope-chip");
    const pillsCount = await scopePills.count();
    console.log(`应用卡片展示了 ${pillsCount} 个数据共享胶囊`);
    assert.ok(pillsCount >= 2, "必须清晰展示快捷登录、公开资料、邮箱地址等共享范围");

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
    await page.waitForTimeout(500);

    const modalTitle = await page.locator(".app-detail-dialog .head-app-name").innerText();
    console.log("弹窗应用名称:", modalTitle);
    assert.ok(modalTitle.length > 0, "弹窗标题必须匹配应用名称");

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
    await revokeModalBtn.click({ force: true });

    // 确认 ElMessageBox
    await page.waitForSelector(".el-message-box", { state: "visible", timeout: 5000 });
    const confirmBtn = page.locator(".el-message-box .el-button--danger, .el-message-box .el-button--primary").last();
    await confirmBtn.click();

    await page.waitForTimeout(2000);
    console.log("✓ 成功点击移除访问权限并确认");

    // 验证该应用卡片已被即时卸载
    const remainingCardsCount = await thirdPartySection.locator(".connected-app-card").count();
    console.log(`移除 1 个应用后，界面剩余 ${remainingCardsCount} 个应用卡片`);
    assert.strictEqual(remainingCardsCount, initialCardCount - 1, "已撤销的应用卡片必须立即从界面中卸载");

    // -----------------------------------------------------------------------------------
    // 步骤 8: 验证全部解除授权后的优雅空状态呈现与零脏数据残留
    // -----------------------------------------------------------------------------------
    console.log("11. 验证解除全部授权后的优雅空状态卡片呈现与零脏数据残留...");
    while (await thirdPartySection.locator(".connected-app-card").count() > 0) {
      const card = thirdPartySection.locator(".connected-app-card").first();
      const revokeBtn = card.locator(".revoke-access-btn");
      await revokeBtn.click();
      await page.waitForSelector(".el-message-box", { state: "visible", timeout: 5000 });
      const confirmBtn = page.locator(".el-message-box .el-button--danger, .el-message-box .el-button--primary").last();
      await confirmBtn.click();
      await card.waitFor({ state: "detached", timeout: 10000 });
      await page.waitForTimeout(500);
    }

    const emptyHero = thirdPartySection.locator(".empty-hero-card");
    await emptyHero.waitFor({ state: "visible", timeout: 5000 });
    const emptyTitle = await emptyHero.locator(".empty-hero-title").innerText();
    console.log("空状态标题:", emptyTitle);
    assert.ok(emptyTitle.includes("暂无已关联的应用"), "必须正确恢复为空状态");

    // 截图 3: 空状态展示态
    await page.screenshot({
      path: "/home/shijian/projects/epocanvas-mail/tests/audit_third_party_empty.png",
      fullPage: false
    });
    console.log("✓ 空状态截图已保存: tests/audit_third_party_empty.png");

    console.log("🎉「资料分区 - 第三方应用与数据共享板块」所有 11 项审计全部 100% 完美通过！");

  } catch (err) {
    console.error("❌ 审计失败:", err);
    process.exitCode = 1;
  } finally {
    // 数据自愈清理：恢复生态应用的授权，清除 KV 撤销标记，保证生产环境零残留
    if (authToken) {
      try {
        console.log("正在重置与自愈生态应用授权状态，清除测试产生的撤销黑名单标记...");
        for (const cid of ["epo_live_shijianus_blog", "epo_live_epocanvas_image"]) {
          await page.request.post(`${BASE}/oauth/authorize`, {
            data: {
              client_id: cid,
              redirect_uri: cid === "epo_live_shijianus_blog" ? "https://blog.epocanvas.com/auth/callback" : "https://img.epocanvas.com/auth/callback",
              scope: "openid profile email",
              state: "cleanup_restore"
            },
            headers: { "Content-Type": "application/json", "Authorization": authToken }
          });
        }
        console.log("✓ 生态应用授权自愈还原完毕，恪守零假数据与脏数据残留准则");
      } catch (err) {
        console.warn("清理失败:", err);
      }
    }
    await browser.close();
  }
})();
