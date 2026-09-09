import { chromium } from "playwright";
import assert from "node:assert";

(async () => {
  console.log("=== 启动 Role 弹窗滑块锁定、预设模板 3x2 对齐与真实身份组用户全链路审计 ===");
  const browser = await chromium.launch({ headless: true, args: ["--lang=zh-CN"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  let adminToken = null;
  let testRoleId = null;
  let testRoleName = `E2E_Auditor_${Date.now()}`;
  let testUserEmail = `auditor_${Date.now()}@epomail.bond`;
  let testUserPassword = "Password123!";
  let testUserId = null;

  try {
    // --------------------------------------------------------------------------------------
    // 步骤 1: Admin 登录
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 1] 登录 Admin 账号...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, "Admin 登录失败: " + JSON.stringify(loginJson));
    adminToken = typeof loginJson.data === "string" ? loginJson.data : loginJson.data?.token;
    console.log("  ✓ Admin 登录成功");

    // --------------------------------------------------------------------------------------
    // 步骤 2: 打开 /role 页面审计弹窗尺寸与几何对齐
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 2] 访问 /role 页面审计 Role 弹窗几何尺寸...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
      document.documentElement.classList.remove("dark");
    }, adminToken);

    await page.goto(BASE + "/role", { waitUntil: "networkidle" });
    await page.waitForSelector(".el-table", { timeout: 15000 });
    await page.waitForTimeout(1000);

    // 打开「新建角色」弹窗
    const addRoleBtn = await page.waitForSelector(".action-btn-group .action-btn-pill:first-child", { timeout: 5000 });
    await addRoleBtn.click();
    await page.waitForSelector(".role-form-dialog", { timeout: 5000 });
    await page.waitForTimeout(600);

    const dialogBox = page.locator(".role-form-dialog");

    // 审计 .preset-templates 尺寸与 3x2 布局
    const presetGeom = await page.evaluate(() => {
      const el = document.querySelector(".preset-templates");
      const chips = document.querySelector(".preset-chips");
      const buttons = document.querySelectorAll(".preset-chips .el-button");
      const b0 = buttons[0]?.getBoundingClientRect();
      const b1 = buttons[1]?.getBoundingClientRect();
      const b2 = buttons[2]?.getBoundingClientRect();
      const b3 = buttons[3]?.getBoundingClientRect();

      return {
        containerHeight: el?.offsetHeight,
        buttonCount: buttons.length,
        col1Left: b0?.left,
        col2Left: b1?.left,
        col3Left: b2?.left,
        row2Col1Left: b3?.left,
        btn0Width: b0?.width,
        btn1Width: b1?.width,
        btn2Width: b2?.width,
        btnHeight: b0?.height
      };
    });

    console.log("  [预设模板矩阵几何信息]:", JSON.stringify(presetGeom, null, 2));
    assert.strictEqual(presetGeom.buttonCount, 6, "预设模板必须包含 6 个身份组按钮");
    assert.ok(presetGeom.containerHeight >= 94 && presetGeom.containerHeight <= 104, `preset-templates 高度必须严格锁定在 98px 左右，实测: ${presetGeom.containerHeight}px`);
    // 验证第一行第1列与第二行第1列绝对左对齐
    assert.ok(Math.abs(presetGeom.col1Left - presetGeom.row2Col1Left) < 1, "第 1 列上下按钮必须严格垂直对齐");
    // 验证三列宽度一致
    assert.ok(Math.abs(presetGeom.btn0Width - presetGeom.btn1Width) < 2, "3 列按钮宽度必须一致均分");
    console.log("  ✓ 预设模板尺寸严格固定 98px 且 3x2 按钮矩阵完全像素级对齐");

    // 审计 .perm-tree-wrap 与 .el-scrollbar__wrap 高度锁定
    const scrollbarGeom = await page.evaluate(() => {
      const treeWrap = document.querySelector(".perm-tree-wrap");
      const scrollWrap = document.querySelector(".perm-tree-scrollbar .el-scrollbar__wrap");
      const tree = document.querySelector(".el-tree");
      const thumb = document.querySelector(".perm-tree-scrollbar .el-scrollbar__thumb");
      const bar = document.querySelector(".perm-tree-scrollbar .el-scrollbar__bar.is-vertical");

      return {
        treeWrapHeight: treeWrap?.offsetHeight,
        scrollWrapClientHeight: scrollWrap?.clientHeight,
        scrollWrapScrollHeight: scrollWrap?.scrollHeight,
        treeScrollHeight: tree?.scrollHeight,
        barOpacity: window.getComputedStyle(bar || document.body).opacity
      };
    });

    console.log("  [权限树展开态滑块几何信息]:", JSON.stringify(scrollbarGeom, null, 2));
    assert.ok(scrollbarGeom.treeWrapHeight >= 365 && scrollbarGeom.treeWrapHeight <= 380, `perm-tree-wrap 高度必须严格锁定在 372px，实测: ${scrollbarGeom.treeWrapHeight}px`);
    assert.ok(scrollbarGeom.scrollWrapClientHeight >= 365 && scrollbarGeom.scrollWrapClientHeight <= 380, `el-scrollbar__wrap 可视高度必须锁定，实测: ${scrollbarGeom.scrollWrapClientHeight}px`);
    assert.ok(scrollbarGeom.scrollWrapScrollHeight > 600, `全部展开后内部内容总高应大于 600px，实测: ${scrollbarGeom.scrollWrapScrollHeight}px`);
    console.log("  ✓ el-scrollbar__wrap 高度牢固锁定，绝无无限向下蔓延扩展！");

    // 截图留档：亮色模式
    await dialogBox.screenshot({ path: "tests/audit_role_dialog_light_fixed.png" });
    console.log("  ✓ 已截图留档: tests/audit_role_dialog_light_fixed.png");

    // 切换至暗色模式审计
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
    });
    await page.waitForTimeout(400);
    await dialogBox.screenshot({ path: "tests/audit_role_dialog_dark_fixed.png" });
    console.log("  ✓ 已截图留档 (暗黑模式): tests/audit_role_dialog_dark_fixed.png");

    // 恢复亮色模式并关闭弹窗
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
    });
    const cancelBtn = page.locator(".role-form-dialog .el-dialog__headerbtn");
    await cancelBtn.click();
    await page.waitForTimeout(400);

    // --------------------------------------------------------------------------------------
    // 步骤 3: 创建真实自定义身份组 (例如 Auditor 审计员)，赋予查看/查询权限
    // --------------------------------------------------------------------------------------
    console.log(`\n[步骤 3] 创建真实测试身份组: ${testRoleName}...`);
    // 获取全部权限树以检索 query 权限的 permId
    const treeRes = await page.request.get(BASE + "/api/role/tree", {
      headers: { Authorization: adminToken }
    });
    const treeData = await treeRes.json();
    assert.strictEqual(treeData.code, 200, "获取权限树失败");

    // 提取 query 权限 permId
    const queryKeys = ["user:query", "role:query", "analysis:query", "reg-key:query", "setting:query", "all-email:query"];
    const queryPermIds = [];
    function extractPermIds(nodes) {
      for (const n of nodes) {
        if (queryKeys.includes(n.permKey)) {
          queryPermIds.push(n.permId);
        }
        if (n.children && n.children.length) {
          extractPermIds(n.children);
        }
      }
    }
    extractPermIds(treeData.data);
    console.log(`  找到 ${queryPermIds.length} 项查询权限 ID:`, queryPermIds);
    assert.ok(queryPermIds.length >= 4, "必须找到至少 4 项关键查询权限");

    const addRoleRes = await page.request.post(BASE + "/api/role/add", {
      data: {
        name: testRoleName,
        roleCode: "audit_inspector",
        tagText: "审计巡检",
        tagColor: "#8b5cf6",
        description: "自动化全链路测试审计身份",
        permIds: queryPermIds,
        storageQuotaMb: 10,
        allowAttachment: 0
      },
      headers: {
        Authorization: adminToken,
        "Content-Type": "application/json"
      }
    });
    const addRoleData = await addRoleRes.json();
    assert.strictEqual(addRoleData.code, 200, "创建角色失败: " + JSON.stringify(addRoleData));

    // 获取该角色的 roleId
    const roleListRes = await page.request.get(BASE + "/api/role/list", {
      headers: { Authorization: adminToken }
    });
    const roleListData = await roleListRes.json();
    const createdRole = (roleListData.data || []).find(r => r.name === testRoleName);
    assert.ok(createdRole, "创建的角色必须出现在角色列表中");
    testRoleId = createdRole.roleId;
    console.log(`  ✓ 身份组创建成功! Role ID: ${testRoleId}, 包含权限数: ${createdRole.permIds?.length}`);

    // --------------------------------------------------------------------------------------
    // 步骤 4: 创建赋予该身份组的真实测试用户
    // --------------------------------------------------------------------------------------
    console.log(`\n[步骤 4] 创建赋予该身份组的真实测试用户: ${testUserEmail}...`);
    const addUserRes = await page.request.post(BASE + "/api/user/add", {
      data: {
        email: testUserEmail,
        type: testRoleId,
        password: testUserPassword
      },
      headers: {
        Authorization: adminToken,
        "Content-Type": "application/json"
      }
    });
    const addUserData = await addUserRes.json();
    assert.strictEqual(addUserData.code, 200, "创建用户失败: " + JSON.stringify(addUserData));
    console.log("  ✓ 测试用户创建成功");

    // 获取 testUserId
    const userListRes = await page.request.get(BASE + "/api/user/list?num=1&size=20&email=" + encodeURIComponent(testUserEmail), {
      headers: { Authorization: adminToken }
    });
    const userListData = await userListRes.json();
    const createdUser = (userListData.data?.list || []).find(u => u.email === testUserEmail);
    assert.ok(createdUser, "创建的用户必须存在于用户列表");
    testUserId = createdUser.userId;
    console.log(`  ✓ 获取到测试用户 ID: ${testUserId}`);

    // --------------------------------------------------------------------------------------
    // 步骤 5: 真实登录该测试用户并全链路审计查看权限
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 5] 以测试用户身份登录并验证权限对齐与页面访问...");
    const testUserContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
    const testPage = await testUserContext.newPage();

    const userLoginRes = await testPage.request.post(BASE + "/api/login", {
      data: { email: testUserEmail, password: testUserPassword },
      headers: { "Content-Type": "application/json" }
    });
    const userLoginJson = await userLoginRes.json();
    assert.strictEqual(userLoginJson.code, 200, "测试用户登录失败: " + JSON.stringify(userLoginJson));
    const testUserToken = typeof userLoginJson.data === "string" ? userLoginJson.data : userLoginJson.data?.token;

    // 获取该用户 /api/my/loginUserInfo 校验 permKeys
    const userInfoRes = await testPage.request.get(BASE + "/api/my/loginUserInfo", {
      headers: { Authorization: testUserToken }
    });
    const userInfoJson = await userInfoRes.json();
    assert.strictEqual(userInfoJson.code, 200);
    console.log("  测试用户已获得 permKeys:", userInfoJson.data.permKeys);
    assert.ok(userInfoJson.data.permKeys.includes("role:query"), "测试用户必须拥有 role:query");
    assert.ok(userInfoJson.data.permKeys.includes("user:query"), "测试用户必须拥有 user:query");
    assert.ok(userInfoJson.data.permKeys.includes("analysis:query"), "测试用户必须拥有 analysis:query");

    // 浏览器访问 Inbox 并设置 Token
    await testPage.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await testPage.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
      document.documentElement.classList.remove("dark");
    }, testUserToken);

    await testPage.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await testPage.waitForTimeout(1000);

    // 5.1 验证侧边栏是否直接呈现「管理后台」导航入口
    console.log("  -> 验证测试用户侧边栏导航...");
    const manageNav = await testPage.locator(".manage-nav-item");
    const hasManageNav = await manageNav.isVisible();
    console.log(`  侧边栏是否具备「管理后台」入口: ${hasManageNav}`);
    assert.ok(hasManageNav, "具备查看权限的用户侧边栏必须显式呈现「管理后台」入口");

    // 5.2 验证直接导航至 /role 页面
    console.log("  -> 验证测试用户访问 /role 页面...");
    await testPage.goto(BASE + "/role", { waitUntil: "networkidle" });
    await testPage.waitForTimeout(1000);

    // 验证角色列表表格渲染，无 403 错误
    const roleTable = await testPage.locator(".el-table");
    assert.ok(await roleTable.isVisible(), "/role 角色表格必须对测试用户正常渲染");
    const roleRowCount = await testPage.locator(".el-table__row").count();
    console.log(`  ✓ 测试用户成功查看角色列表，表格包含 ${roleRowCount} 个角色`);
    assert.ok(roleRowCount >= 6, "至少展示系统 6 个基础分组");

    // 打开修改弹窗验证权限树查看
    const firstRoleDropdown = await testPage.locator(".el-table__row:first-child .el-dropdown button");
    await firstRoleDropdown.click();
    await testPage.waitForTimeout(400);
    const editItem = await testPage.getByRole('menuitem', { name: '修改' }).first();
    await editItem.click();
    await testPage.waitForSelector(".role-form-dialog", { timeout: 5000 });
    await testPage.waitForTimeout(600);

    await testPage.screenshot({ path: "tests/audit_test_user_role_view.png" });
    console.log("  ✓ 已截图留档: tests/audit_test_user_role_view.png");

    const closeBtn = testPage.locator(".role-form-dialog .el-dialog__headerbtn");
    await closeBtn.click();
    await testPage.waitForTimeout(400);

    // 5.3 验证测试用户访问 /all-users 页面
    console.log("  -> 验证测试用户访问 /all-users 页面...");
    await testPage.goto(BASE + "/all-users", { waitUntil: "networkidle" });
    await testPage.waitForTimeout(1000);
    const userTable = await testPage.locator(".el-table");
    assert.ok(await userTable.isVisible(), "/all-users 用户表格必须对测试用户正常渲染");
    console.log("  ✓ 测试用户成功进入用户管理列表");

    // 5.4 验证测试用户访问 /analysis 页面
    console.log("  -> 验证测试用户访问 /analysis 页面...");
    await testPage.goto(BASE + "/analysis", { waitUntil: "networkidle" });
    await testPage.waitForTimeout(1500);
    const analysisBox = await testPage.locator(".analysis");
    assert.ok(await analysisBox.isVisible(), "/analysis 分析大屏必须正常渲染");
    await testPage.screenshot({ path: "tests/audit_test_user_analysis_view.png" });
    console.log("  ✓ 已截图留档: tests/audit_test_user_analysis_view.png");

    console.log("\n==========================================================================");
    console.log("🎉 全部断言 100% 通过！滑块锁定、预设对齐与用户真实查看权限全链路完备无懈可击！");
    console.log("==========================================================================");

    await testUserContext.close();

  } finally {
    // --------------------------------------------------------------------------------------
    // 清理测试数据 (Zero Fake Data SOP)
    // --------------------------------------------------------------------------------------
    console.log("\n[清理阶段] 遵循零假数据准则，彻底清理测试用户与测试角色...");
    if (testUserId && adminToken) {
      try {
        await page.request.delete(BASE + `/api/user/delete?userIds=${testUserId}`, {
          headers: { Authorization: adminToken }
        });
        console.log(`  ✓ 测试用户 (ID: ${testUserId}) 已彻底删除`);
      } catch (e) {
        console.warn("  清理测试用户异常:", e.message);
      }
    }

    if (testRoleId && adminToken) {
      try {
        await page.request.delete(BASE + `/api/role/delete?roleId=${testRoleId}`, {
          headers: { Authorization: adminToken }
        });
        console.log(`  ✓ 测试角色 (ID: ${testRoleId}) 已彻底删除`);
      } catch (e) {
        console.warn("  清理测试角色异常:", e.message);
      }
    }

    await browser.close();
  }
})();
