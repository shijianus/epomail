import { chromium } from "playwright";
import assert from "node:assert";

(async () => {
  console.log("=== 启动欢迎邮件触发优化、参观者全量保障与 0MB 配额端到端审计 ===");
  const browser = await chromium.launch({ headless: true, args: ["--lang=zh-CN"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  let adminToken = null;
  const timestamp = Date.now();

  const testVisitorEmail = `visitor_${timestamp}@epomail.bond`;
  const testVisitorPassword = "Password123!";
  let testVisitorUserId = null;

  const testNormalEmail = `normal_${timestamp}@epomail.bond`;
  const testNormalPassword = "Password123!";
  let testNormalUserId = null;

  try {
    // --------------------------------------------------------------------------------------
    // 步骤 1: Admin 登录获取 Token 与角色信息
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 1] 登录系统管理员并查询角色定义...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, "Admin 登录失败: " + JSON.stringify(loginJson));
    adminToken = typeof loginJson.data === "string" ? loginJson.data : loginJson.data?.token;
    console.log("  ✓ Admin 登录成功");

    // 获取角色列表
    const rolesRes = await page.request.get(BASE + "/api/role/list", {
      headers: { Authorization: adminToken }
    });
    const rolesJson = await rolesRes.json();
    const roles = rolesJson.data || [];
    const visitorRole = roles.find(r => r.roleCode === "visitor" || r.name === "参观者" || r.key === "visitor");
    const normalRole = roles.find(r => r.roleCode === "user_base" || r.name === "普通用户" || r.key === "user_base");

    assert.ok(visitorRole, "必须存在参观者角色");
    assert.ok(normalRole, "必须存在普通用户角色");
    console.log(`  ✓ 找到 visitorRole (ID: ${visitorRole.roleId}, 配额: ${visitorRole.storageQuotaMb}MB) 与 normalRole (ID: ${normalRole.roleId})`);

    // --------------------------------------------------------------------------------------
    // 步骤 2: 创建 0MB 存储空间的参观者测试账号
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 2] 新建 0MB 存储空间的参观者账号...");
    const addVisitorRes = await page.request.post(BASE + "/api/user/add", {
      data: {
        email: testVisitorEmail,
        password: testVisitorPassword,
        name: "Visitor_Tester",
        type: visitorRole.roleId
      },
      headers: { Authorization: adminToken, "Content-Type": "application/json" }
    });
    const addVisitorJson = await addVisitorRes.json();
    assert.strictEqual(addVisitorJson.code, 200, "创建参观者失败: " + JSON.stringify(addVisitorJson));
    console.log(`  ✓ 成功创建参观者账号: ${testVisitorEmail}`);

    // 查询该参观者的 userId
    const usersListRes = await page.request.get(BASE + `/api/user/list?email=${testVisitorEmail}`, {
      headers: { Authorization: adminToken }
    });
    const usersListJson = await usersListRes.json();
    const visitorUser = (usersListJson.data?.list || []).find(u => u.email === testVisitorEmail);
    assert.ok(visitorUser, "应能检索到新建的参观者用户");
    testVisitorUserId = visitorUser.userId;
    console.log(`  ✓ 参观者 User ID: ${testVisitorUserId}`);

    // --------------------------------------------------------------------------------------
    // 步骤 3: 参观者登录并检查欢迎邮件 (0MB 存储空间依然必须收到欢迎邮件)...
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 3] 参观者登录并检查欢迎邮件 (0MB 存储空间依然必须收到欢迎邮件)...");
    const visitorLoginRes = await page.request.post(BASE + "/api/login", {
      data: { email: testVisitorEmail, password: testVisitorPassword },
      headers: { "Content-Type": "application/json" }
    });
    const visitorLoginJson = await visitorLoginRes.json();
    assert.strictEqual(visitorLoginJson.code, 200, "参观者登录失败: " + JSON.stringify(visitorLoginJson));
    const visitorToken = typeof visitorLoginJson.data === "string" ? visitorLoginJson.data : visitorLoginJson.data?.token;
    console.log("  ✓ 参观者登录成功，获得 JWT");

    // 检查邮箱列表
    const emailListRes = await page.request.get(BASE + "/api/email/list", {
      headers: { Authorization: visitorToken }
    });
    const emailListJson = await emailListRes.json();
    assert.strictEqual(emailListJson.code, 200, "邮件列表查询失败: " + JSON.stringify(emailListJson));
    const emailList = emailListJson.data?.list || [];
    console.log(`  ✓ 参观者收件箱邮件总数: ${emailList.length}`);
    assert.strictEqual(emailList.length, 1, "参观者账号创建后必须精确收到 1 封欢迎邮件");

    const welcomeEmail = emailList[0];
    console.log(`  ✓ 欢迎邮件主题: ${welcomeEmail.subject}`);
    console.log(`  ✓ 欢迎邮件发件人: ${welcomeEmail.sendEmail} (${welcomeEmail.name})`);
    console.log(`  ✓ 欢迎邮件标签: ${welcomeEmail.labels}`);
    console.log(`  ✓ 欢迎邮件官方标识: ${welcomeEmail.isOfficial}`);
    console.log(`  ✓ 欢迎邮件星标状态: ${welcomeEmail.isStar}`);

    assert.strictEqual(welcomeEmail.sendEmail, "admin@epocanvas.com", "欢迎邮件发件人必须为官方 admin@epocanvas.com");
    assert.strictEqual(welcomeEmail.isOfficial, 1, "欢迎邮件必须具备官方认证 isOfficial = 1");
    assert.strictEqual(welcomeEmail.isStar, 1, "欢迎邮件必须默认被星标 (重要) isStar = 1");
    assert.ok(welcomeEmail.subject.includes("欢迎"), "邮件主题必须包含欢迎词");
    assert.ok(welcomeEmail.content && welcomeEmail.content.length > 100, "欢迎邮件内容必须非空且包含精美模板");

    // --------------------------------------------------------------------------------------
    // 步骤 4: 浏览器端 UI 视觉审计参观者收件箱与打开欢迎邮件
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 4] 浏览器实际访问参观者收件箱并打开欢迎邮件详情...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((token) => {
      localStorage.setItem("token", token);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
      document.documentElement.classList.remove("dark");
    }, visitorToken);

    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // 断言邮件列表中显示了欢迎邮件
    const emailItem = page.locator(".email-row").first();
    await emailItem.waitFor({ state: "visible", timeout: 10000 });
    console.log("  ✓ 邮件列表渲染成功，找到 .email-row");

    // 检查主题与官方认证
    const rowText = await emailItem.innerText();
    assert.ok(rowText.includes("欢迎"), "邮件行应显示欢迎主题");
    console.log("  ✓ 邮件行文本包含欢迎信息");

    // 点击该邮件进入详情
    await emailItem.click();
    await page.waitForTimeout(1200);

    // 验证邮件详情包含欢迎问候
    const pageText = await page.locator("body").innerText();
    assert.ok(pageText.includes("欢迎") || pageText.includes("Epocanvas"), "邮件详情应渲染官方欢迎信内容");
    console.log("  ✓ 欢迎邮件详情内容渲染正常");

    await page.screenshot({ path: "tests/audit_visitor_welcome_email_inbox.png" });
    console.log("  ✓ 保存参观者收件箱与欢迎邮件截图: tests/audit_visitor_welcome_email_inbox.png");

    // --------------------------------------------------------------------------------------
    // 步骤 5: 审计参观者 0MB 存储空间在数据设置页的精准显示
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 5] 参观者访问 /settings/data 验证 0MB 存储与专属提示...");
    await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    const quotaCard = page.locator(".quota-meter-card");
    await quotaCard.waitFor({ state: "visible", timeout: 10000 });
    const storageCardText = await quotaCard.innerText();
    console.log("  存储用量卡片文字摘要:\n    " + storageCardText.replace(/\n+/g, " "));

    assert.ok(storageCardText.includes("/ 0 MB"), "参观者存储空间上限必须清晰标示为 '/ 0 MB' 而非 '不限容量'");
    assert.ok(storageCardText.includes("0 MB"), "百分比徽章必须正确呈现 0 MB");
    assert.ok(
      storageCardText.includes("参观者默认未分配持久化存储空间") || storageCardText.includes("除官方欢迎引导信件外无法接收"),
      "必须展示参观者专属存储限制与欢迎信豁免说明"
    );
    console.log("  ✓ 参观者 0MB 存储与欢迎邮件豁免提示展示完美");

    await page.screenshot({ path: "tests/audit_visitor_storage_zero_mb.png" });
    console.log("  ✓ 保存参观者 0MB 存储审计截图: tests/audit_visitor_storage_zero_mb.png");

    // --------------------------------------------------------------------------------------
    // 步骤 6: 注册新普通用户并验证欢迎邮件必达与自愈机制
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 6] 创建普通用户并验证欢迎邮件必达...");
    const addNormalRes = await page.request.post(BASE + "/api/user/add", {
      data: {
        email: testNormalEmail,
        password: testNormalPassword,
        name: "Normal_Tester",
        type: normalRole.roleId
      },
      headers: { Authorization: adminToken, "Content-Type": "application/json" }
    });
    const addNormalJson = await addNormalRes.json();
    assert.strictEqual(addNormalJson.code, 200, "创建普通用户失败: " + JSON.stringify(addNormalJson));
    console.log(`  ✓ 成功创建普通用户: ${testNormalEmail}`);

    const normalUsersListRes = await page.request.get(BASE + `/api/user/list?email=${testNormalEmail}`, {
      headers: { Authorization: adminToken }
    });
    const normalUsersListJson = await normalUsersListRes.json();
    const normalUser = (normalUsersListJson.data?.list || []).find(u => u.email === testNormalEmail);
    assert.ok(normalUser, "应能检索到新建的普通用户");
    testNormalUserId = normalUser.userId;

    const normalLoginRes = await page.request.post(BASE + "/api/login", {
      data: { email: testNormalEmail, password: testNormalPassword },
      headers: { "Content-Type": "application/json" }
    });
    const normalLoginJson = await normalLoginRes.json();
    assert.strictEqual(normalLoginJson.code, 200, "普通用户登录失败: " + JSON.stringify(normalLoginJson));
    const normalToken = typeof normalLoginJson.data === "string" ? normalLoginJson.data : normalLoginJson.data?.token;

    const normalEmailListRes = await page.request.get(BASE + "/api/email/list", {
      headers: { Authorization: normalToken }
    });
    const normalEmailListJson = await normalEmailListRes.json();
    const normalEmailList = normalEmailListJson.data?.list || [];
    assert.strictEqual(normalEmailList.length, 1, "普通用户账号创建后必须精确收到 1 封欢迎邮件");
    assert.strictEqual(normalEmailList[0].sendEmail, "admin@epocanvas.com");
    assert.strictEqual(normalEmailList[0].isOfficial, 1);
    assert.strictEqual(normalEmailList[0].isStar, 1);
    console.log("  ✓ 普通用户同样 100% 成功接收官方欢迎引导信件");

    console.log("\n🎉 全量断言顺利通过！欢迎邮件触发自愈优化与参观者 0MB 存储隔离验证 100% 全绿！");

  } finally {
    // --------------------------------------------------------------------------------------
    // 自动清理测试假数据
    // --------------------------------------------------------------------------------------
    console.log("\n[清理] 清除临时测试用户与测试数据...");
    const cleanupIds = [testVisitorUserId, testNormalUserId].filter(Boolean);
    if (cleanupIds.length > 0 && adminToken) {
      try {
        await page.request.delete(BASE + `/api/user/physics?userIds=${cleanupIds.join(",")}`, {
          headers: { Authorization: adminToken }
        });
        console.log(`  ✓ 物理清理测试账号: ${cleanupIds.join(", ")}`);
      } catch (e) {
        console.warn("  ⚠️ 清理失败: ", e.message);
      }
    }
    await browser.close();
  }
})();
