import { chromium } from "playwright";
import assert from "node:assert";

(async () => {
  console.log("=== 启动全用户组 UI 一致性、写邮件入口完备性、无沙盒标注与单次权限说明 E2E 审计 ===");
  const browser = await chromium.launch({ headless: true, args: ["--lang=zh-CN"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  let adminToken = null;
  let testNormalUserId = null;
  const testNormalEmail = `user_${Date.now()}@epomail.bond`;
  const testNormalPassword = "Password123!";

  let testVisitorUserId = null;
  const testVisitorEmail = `visitor_${Date.now()}@epomail.bond`;
  const testVisitorPassword = "Password123!";

  try {
    // --------------------------------------------------------------------------------------
    // 步骤 1: Admin 登录与创建测试用户
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 1] 登录 Admin 并准备测试分组用户...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, "Admin 登录失败: " + JSON.stringify(loginJson));
    adminToken = typeof loginJson.data === "string" ? loginJson.data : loginJson.data?.token;
    console.log("  ✓ Admin 登录成功");

    // 获取角色列表以定位普通用户与参观者角色 ID
    const rolesRes = await page.request.get(BASE + "/api/role/list", {
      headers: { Authorization: adminToken }
    });
    const rolesJson = await rolesRes.json();
    const roles = rolesJson.data || [];
    const visitorRole = roles.find(r => r.roleCode === "visitor" || r.name === "参观者" || r.key === "visitor");
    const userBaseRole = roles.find(r => r.roleCode === "user_base" || r.name === "普通用户" || r.key === "user_base");

    assert.ok(visitorRole, "必须存在参观者角色");
    assert.ok(userBaseRole, "必须存在普通用户角色");
    console.log(`  ✓ 找到 visitorRole(ID: ${visitorRole.roleId}) 与 userBaseRole(ID: ${userBaseRole.roleId})`);

    // 创建普通测试用户
    const addNormalRes = await page.request.post(BASE + "/api/user/add", {
      data: {
        email: testNormalEmail,
        password: testNormalPassword,
        name: "Normal_Auditor",
        type: userBaseRole.roleId
      },
      headers: { Authorization: adminToken, "Content-Type": "application/json" }
    });
    const addNormalJson = await addNormalRes.json();
    assert.strictEqual(addNormalJson.code, 200, "创建普通用户失败: " + JSON.stringify(addNormalJson));
    console.log(`  ✓ 创建普通测试用户成功: ${testNormalEmail}`);

    // 创建参观者测试用户
    const addVisitorRes = await page.request.post(BASE + "/api/user/add", {
      data: {
        email: testVisitorEmail,
        password: testVisitorPassword,
        name: "Visitor_Auditor",
        type: visitorRole.roleId
      },
      headers: { Authorization: adminToken, "Content-Type": "application/json" }
    });
    const addVisitorJson = await addVisitorRes.json();
    assert.strictEqual(addVisitorJson.code, 200, "创建参观者用户失败: " + JSON.stringify(addVisitorJson));
    console.log(`  ✓ 创建参观者测试用户成功: ${testVisitorEmail}`);

    // 获取用户 ID 以便之后清理
    const userListRes = await page.request.get(BASE + "/api/user/list?num=1&size=50", {
      headers: { Authorization: adminToken }
    });
    const userListJson = await userListRes.json();
    const userList = userListJson.data?.list || [];
    const foundNormal = userList.find(u => u.email === testNormalEmail);
    const foundVisitor = userList.find(u => u.email === testVisitorEmail);
    if (foundNormal) testNormalUserId = foundNormal.userId;
    if (foundVisitor) testVisitorUserId = foundVisitor.userId;
    console.log(`  ✓ 解析获取用户 ID: 普通用户 ID=${testNormalUserId}, 参观者 ID=${testVisitorUserId}`);

    // --------------------------------------------------------------------------------------
    // 步骤 2: Admin 界面审计（侧边栏、头像下拉、角色页面）
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 2] 审计 Admin 界面布局...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
      document.documentElement.classList.remove("dark");
    }, adminToken);
    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // 断言 2.1: 侧边栏不存在多余的管理和设置 nav-section
    const adminAsideExtraNav = await page.$eval(".aside-container", el => {
      const extraSection = el.querySelector('.nav-section[style*="margin-top: 20px"]');
      const manageBtn = el.querySelector(".manage-nav-item");
      const settingsBtn = el.querySelector(".settings-nav-item");
      return { hasExtra: !!extraSection, hasManage: !!manageBtn, hasSettings: !!settingsBtn };
    });
    console.log("  Admin 侧边栏多余导航检查:", adminAsideExtraNav);
    assert.strictEqual(adminAsideExtraNav.hasExtra, false, "Admin 侧边栏不应再存在底部的多余 nav-section");
    assert.strictEqual(adminAsideExtraNav.hasManage, false, "Admin 侧边栏不应存在 manage-nav-item");
    assert.strictEqual(adminAsideExtraNav.hasSettings, false, "Admin 侧边栏不应存在 settings-nav-item");

    // 断言 2.2: 侧边栏必须具备写邮件按钮、已发送、草稿箱
    const adminComposeBtn = await page.$(".compose-btn-wrapper");
    assert.ok(adminComposeBtn, "Admin 必须可见「写邮件」按钮");

    // 断言 2.3: 头像下拉菜单取消了“管理后台”，只保留设置
    const avatarWrap = await page.waitForSelector(".avatar-wrap", { timeout: 5000 });
    await avatarWrap.click();
    await page.waitForSelector(".user-details.account-menu.open", { timeout: 5000 });
    const adminMenuItems = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll(".account-menu .am-item span")).map(s => s.textContent.trim());
      return items;
    });
    console.log("  Admin 头像下拉菜单项:", adminMenuItems);
    assert.ok(!adminMenuItems.some(t => t.includes("管理") || t.toLowerCase().includes("admin")), "头像下拉菜单已成功取消「管理」项");
    assert.ok(adminMenuItems.some(t => t.includes("设定") || t.includes("设置") || t.toLowerCase().includes("settings")), "头像下拉菜单应包含「设定」/「设置」");

    await page.screenshot({ path: "tests/audit_admin_sidebar_and_dropdown.png" });
    console.log("  ✓ Admin 截图留存: tests/audit_admin_sidebar_and_dropdown.png");

    // --------------------------------------------------------------------------------------
    // 步骤 3: 普通用户界面审计（普通书友组）
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 3] 审计普通用户（Normal User）界面...");
    const normalLoginRes = await page.request.post(BASE + "/api/login", {
      data: { email: testNormalEmail, password: testNormalPassword },
      headers: { "Content-Type": "application/json" }
    });
    const normalLoginJson = await normalLoginRes.json();
    assert.strictEqual(normalLoginJson.code, 200, "普通用户登录失败: " + JSON.stringify(normalLoginJson));
    const normalToken = typeof normalLoginJson.data === "string" ? normalLoginJson.data : normalLoginJson.data?.token;

    const normalContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
    const normalPage = await normalContext.newPage();
    await normalPage.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await normalPage.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
      document.documentElement.classList.remove("dark");
    }, normalToken);
    await normalPage.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await normalPage.waitForTimeout(1000);

    // 检查普通用户侧边栏
    const normalComposeBtn = await normalPage.$(".compose-btn-wrapper");
    assert.ok(normalComposeBtn, "普通用户必须可见「写邮件」按钮");

    const normalSentItem = await normalPage.$(".nav-item[title='已发送'], .nav-item[title='Sent']");
    assert.ok(normalSentItem, "普通用户必须可见「已发送」邮件箱");

    const normalDraftItem = await normalPage.$(".nav-item[title='草稿箱'], .nav-item[title='Drafts']");
    assert.ok(normalDraftItem, "普通用户必须可见「草稿箱」");

    // 检查普通用户侧边栏无管理项
    const normalAsideExtra = await normalPage.$(".manage-nav-item, .settings-nav-item");
    assert.strictEqual(normalAsideExtra, null, "普通用户侧边栏绝无多余的管理和设置入口");

    // 检查普通用户头像下拉
    const normalAvatar = await normalPage.waitForSelector(".avatar-wrap", { timeout: 5000 });
    await normalAvatar.click();
    await normalPage.waitForSelector(".user-details.account-menu.open", { timeout: 5000 });
    const normalMenuItems = await normalPage.evaluate(() => {
      return Array.from(document.querySelectorAll(".account-menu .am-item span")).map(s => s.textContent.trim());
    });
    console.log("  普通用户头像下拉项:", normalMenuItems);
    assert.ok(!normalMenuItems.some(t => t.includes("管理")), "普通用户下拉菜单绝无「管理」项");

    await normalPage.screenshot({ path: "tests/audit_normal_user_inbox.png" });
    console.log("  ✓ 普通用户截图留存: tests/audit_normal_user_inbox.png");
    await normalContext.close();

    // --------------------------------------------------------------------------------------
    // 步骤 4: 参观者（Visitor）界面审计与行为断言
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 4] 审计参观者（Visitor）界面与写邮件/角色弹窗行为...");
    const visitorLoginRes = await page.request.post(BASE + "/api/login", {
      data: { email: testVisitorEmail, password: testVisitorPassword },
      headers: { "Content-Type": "application/json" }
    });
    const visitorLoginJson = await visitorLoginRes.json();
    assert.strictEqual(visitorLoginJson.code, 200, "参观者登录失败: " + JSON.stringify(visitorLoginJson));
    const visitorToken = typeof visitorLoginJson.data === "string" ? visitorLoginJson.data : visitorLoginJson.data?.token;

    const visitorContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
    const visitorPage = await visitorContext.newPage();
    await visitorPage.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await visitorPage.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
      document.documentElement.classList.remove("dark");
    }, visitorToken);
    await visitorPage.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await visitorPage.waitForTimeout(1000);

    // 断言 4.1: 参观者「写邮件」按钮必须正常可见且UI与管理员完全一致！
    const visitorComposeBtn = await visitorPage.$(".compose-btn-wrapper");
    assert.ok(visitorComposeBtn, "【核心断言】参观者界面必须完整渲染「写邮件」按钮！");
    const composeBtnText = await visitorPage.$eval(".compose-btn .compose-text", el => el.textContent.trim());
    console.log(`  ✓ 参观者写邮件按钮正常渲染，文案为: 「${composeBtnText}」`);

    // 断言 4.2: 参观者「已发送」与「草稿箱」均正常呈现
    const visitorSentItem = await visitorPage.$(".nav-item[title='已发送'], .nav-item[title='Sent']");
    assert.ok(visitorSentItem, "参观者必须可见「已发送」箱");
    const visitorDraftItem = await visitorPage.$(".nav-item[title='草稿箱'], .nav-item[title='Drafts']");
    assert.ok(visitorDraftItem, "参观者必须可见「草稿箱」");

    // 断言 4.3: 参观者侧边栏与下拉菜单没有多余的管理入口
    const visitorAsideExtra = await visitorPage.$(".manage-nav-item, .settings-nav-item");
    assert.strictEqual(visitorAsideExtra, null, "参观者侧边栏绝无多余的管理和设置入口");

    // 断言 4.4: 参观者点击「写邮件」按钮呼出写信弹窗
    console.log("\n  [交互测试 4.4] 参观者点击「写邮件」按钮...");
    await visitorPage.click(".compose-btn-wrapper");
    await visitorPage.waitForSelector(".send", { timeout: 5000 });
    const isWriteModalVisible = await visitorPage.$eval(".send", el => el.style.display !== "none");
    assert.strictEqual(isWriteModalVisible, true, "写信弹窗必须顺利展开并展示");
    console.log("  ✓ 参观者点击写邮件成功唤起写信界面");

    await visitorPage.screenshot({ path: "tests/audit_visitor_compose_modal.png" });
    console.log("  ✓ 参观者写邮件弹窗截图留存: tests/audit_visitor_compose_modal.png");

    // 关闭写信弹窗
    const closeBtn = await visitorPage.$(".send-header-right .icon");
    if (closeBtn) await closeBtn.click();
    await visitorPage.waitForTimeout(500);

    // --------------------------------------------------------------------------------------
    // 步骤 5: 参观者访问 /role 审计无沙盒横幅、无沙盒提示、保存按钮与单次 403 权限提示
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 5] 参观者访问 /role 页面进行权限与无沙盒验证...");
    await visitorPage.goto(BASE + "/role", { waitUntil: "networkidle" });
    await visitorPage.waitForSelector(".el-table", { timeout: 15000 });
    await visitorPage.waitForTimeout(800);

    // 断言 5.1: 页面顶部绝无 visitor-banner
    const visitorBanner = await visitorPage.$(".visitor-banner");
    assert.strictEqual(visitorBanner, null, "【核心要求】参观者角色页面顶部绝无 visitor-banner 沙盒横幅！");

    // 断言 5.2: 页面顶部绝无 moderator-banner
    const moderatorBanner = await visitorPage.$(".moderator-banner");
    assert.strictEqual(moderatorBanner, null, "角色页面顶部绝无 moderator-banner！");

    // 打开「修改」任意角色弹窗（点击第一行角色操作列中的修改）
    const actionBtn = await visitorPage.waitForSelector(".el-table tbody tr:first-child .el-dropdown button", { timeout: 5000 });
    await actionBtn.click();
    await visitorPage.waitForTimeout(400);
    const changeItem = await visitorPage.locator(".el-dropdown-menu .el-dropdown-menu__item:has-text('修改')").first();
    await changeItem.click();
    await visitorPage.waitForSelector(".role-form-dialog", { timeout: 5000 });
    await visitorPage.waitForTimeout(600);

    // 断言 5.3: 弹窗内绝无 visitor-dialog-notice 沙盒说明
    const dialogNotice = await visitorPage.$(".visitor-dialog-notice");
    assert.strictEqual(dialogNotice, null, "【核心要求】角色弹窗内绝无 visitor-dialog-notice 沙盒说明！");

    // 断言 5.4: 保存按钮文案与管理员一致，绝无「(沙箱模拟)」
    const saveBtnText = await visitorPage.$eval(".btn-save-role", el => el.textContent.trim());
    console.log(`  ✓ 角色弹窗保存按钮文案: 「${saveBtnText}」`);
    assert.strictEqual(saveBtnText, "保存", "保存按钮必须与管理员一致为「保存」，绝无沙箱模拟字样");

    await visitorPage.screenshot({ path: "tests/audit_visitor_role_dialog_clean.png" });
    console.log("  ✓ 参观者无沙盒标记角色弹窗截图留存: tests/audit_visitor_role_dialog_clean.png");

    // 断言 5.5: 点击保存，真实触发后端校验并断言【仅有 1 次说明提示，绝不重复】
    console.log("\n  [交互测试 5.5] 参观者点击保存角色，触发权限不足提示...");
    await visitorPage.click(".btn-save-role");
    await visitorPage.waitForTimeout(1000);

    // 统计当前页面渲染的 .el-message
    const messageInfo = await visitorPage.evaluate(() => {
      const msgs = Array.from(document.querySelectorAll(".el-message")).map(m => ({
        text: m.textContent.trim(),
        type: m.className
      }));
      return msgs;
    });

    console.log("  [页面提示统计]:", JSON.stringify(messageInfo, null, 2));
    assert.strictEqual(messageInfo.length, 1, `【核心要求】修改失败说明必须且只能出现 1 次（当前出现 ${messageInfo.length} 次）！`);
    assert.ok(messageInfo[0].text.includes("未授权") || messageInfo[0].text.includes("权限") || messageInfo[0].text.includes("Unauthorized"), "提示内容必须准确说明未授权/权限不足");

    await visitorPage.screenshot({ path: "tests/audit_visitor_single_toast_403.png" });
    console.log("  ✓ 参观者单次权限不足说明截图留存: tests/audit_visitor_single_toast_403.png");

    // --------------------------------------------------------------------------------------
    // 步骤 6: 参观者访问 /reg-key 审计无沙箱横幅
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 6] 参观者访问 /reg-key 页面审计无沙盒提示条...");
    await visitorPage.goto(BASE + "/reg-key", { waitUntil: "networkidle" });
    await visitorPage.waitForTimeout(800);

    const regKeyNotice = await visitorPage.$(".visitor-notice-bar");
    assert.strictEqual(regKeyNotice, null, "【核心要求】注册码页面顶部绝无 visitor-notice-bar 沙盒横幅！");

    // 切换暗黑模式审计
    await visitorPage.evaluate(() => document.documentElement.classList.add("dark"));
    await visitorPage.waitForTimeout(400);
    await visitorPage.screenshot({ path: "tests/audit_visitor_reg_key_dark_clean.png" });
    console.log("  ✓ 参观者暗黑模式注册密钥无横幅截图留存: tests/audit_visitor_reg_key_dark_clean.png");

    await visitorContext.close();

    console.log("\n==========================================================================");
    console.log("🎉 全部用户组视觉验证与单次错误提示行为审计 100% 通过！");
    console.log("==========================================================================");

  } finally {
    // --------------------------------------------------------------------------------------
    // 步骤 7: 测试数据自动清理（零假数据残留准则）
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 7] 清理临时测试账号，严格遵守零残留准则...");
    if (adminToken) {
      try {
        const checkListRes = await page.request.get(BASE + "/api/user/list?num=1&size=100", {
          headers: { Authorization: adminToken }
        });
        const checkListJson = await checkListRes.json();
        const list = checkListJson.data?.list || [];
        for (const u of list) {
          if (u.email === testNormalEmail || u.email === testVisitorEmail || u.email.includes("1788973558122")) {
            await page.request.delete(BASE + `/api/user/delete?userId=${u.userId}`, {
              headers: { Authorization: adminToken }
            });
            console.log(`  ✓ 已清理测试用户: ${u.email} (ID: ${u.userId})`);
          }
        }
      } catch (err) {
        console.warn("  清理用户时发生异常:", err.message);
      }
    }
    await browser.close();
  }
})();
