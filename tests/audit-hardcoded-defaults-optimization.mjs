import { chromium } from "playwright";
import assert from "node:assert";

(async () => {
  console.log("=== 开始硬编码默认项优化、双域名用户名防冲突与参观者权限严格审计 ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  try {
    // --------------------------------------------------------------------------------------
    // 0. Admin 多域名全域登录与凭证全链路审计 (admin@epomail.cyou, admin@epomail.bond, admin)
    // --------------------------------------------------------------------------------------
    console.log("\n[0. Admin 多域名全域登录审计]");
    
    // 0.1 验证 admin@epomail.cyou 登录
    console.log("  - 测试 admin@epomail.cyou 使用管理员密码登录...");
    const loginCyouRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.cyou", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginCyouJson = await loginCyouRes.json();
    assert.strictEqual(loginCyouJson.code, 200, `admin@epomail.cyou 登录失败: ${JSON.stringify(loginCyouJson)}`);
    console.log("  ✓ admin@epomail.cyou 登录成功，获取 Token");

    // 0.2 验证 admin@epomail.bond 登录
    console.log("  - 测试 admin@epomail.bond 使用管理员密码登录...");
    const loginBondRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginBondJson = await loginBondRes.json();
    assert.strictEqual(loginBondJson.code, 200, "admin@epomail.bond 登录失败");
    console.log("  ✓ admin@epomail.bond 登录成功，获取 Token");

    // 0.3 验证纯用户名 admin 登录
    console.log("  - 测试纯用户名 admin 使用管理员密码登录...");
    const loginAdminRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginAdminJson = await loginAdminRes.json();
    assert.strictEqual(loginAdminJson.code, 200, "纯用户名 admin 登录失败");
    console.log("  ✓ 纯用户名 admin 登录成功，获取 Token");

    const token = typeof loginCyouJson.data === "string" ? loginCyouJson.data : loginCyouJson.data?.token;

    // 0.4 验证管理员账户列表中同时拥有双域名邮箱
    const accListRes = await page.request.get(BASE + "/api/account/list?size=10", {
      headers: { Authorization: token }
    });
    const accListJson = await accListRes.json();
    const adminEmails = (accListJson.data || []).map(a => a.email);
    console.log("  - 管理员当前绑定邮箱列表:", adminEmails);
    assert.ok(adminEmails.includes("admin@epomail.cyou"), "管理员必须拥有 admin@epomail.cyou 邮箱账号");
    assert.ok(adminEmails.includes("admin@epomail.bond"), "管理员必须拥有 admin@epomail.bond 邮箱账号");
    console.log("  ✓ 管理员双域名 (epomail.cyou & epomail.bond) 邮箱列表绑定无缝就绪");

    // 0.5 浏览器真实 UI 交互登录测试 (通过 /login/index.html 输入 admin@epomail.cyou 登录)
    console.log("  - 测试浏览器真实 UI 页面登录 admin@epomail.cyou...");
    await page.goto(BASE + "/login/index.html", { waitUntil: "networkidle" });
    await page.waitForSelector("#epo-email", { timeout: 10000 });
    await page.fill("#epo-email", "admin@epomail.cyou");
    await page.fill("#epo-password", "123456");
    await page.click('button[type="submit"]');
    await page.waitForURL(url => url.pathname.includes("/inbox"), { timeout: 15000 });
    console.log("  ✓ 浏览器 UI 登录 admin@epomail.cyou 成功跳转至 /inbox");

    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);

    // --------------------------------------------------------------------------------------
    // 1. 双域名的用户名冲突与 Admin 保留字严格防冲突审计
    // --------------------------------------------------------------------------------------
    console.log("\n[1. 审计双域名用户名冲突与保留管理员防范]");
    
    // 1.1 尝试注册 admin@epomail.cyou
    console.log("  - 测试跨域名注册 admin@epomail.cyou...");
    const regAdminCyouRes = await page.request.post(BASE + "/api/register", {
      data: { email: "admin@epomail.cyou", password: "password123" },
      headers: { "Content-Type": "application/json" }
    });
    const regAdminCyouJson = await regAdminCyouRes.json();
    console.log(`    响应: code=${regAdminCyouJson.code}, message=${regAdminCyouJson.message}`);
    assert.notStrictEqual(regAdminCyouJson.code, 200, "必须禁止注册 admin@epomail.cyou！");
    assert.ok(
      regAdminCyouJson.message.includes("系统保留") || regAdminCyouJson.message.includes("已存在") || regAdminCyouJson.message.includes("唯一"),
      `错误提示应指明保留或冲突: ${regAdminCyouJson.message}`
    );
    console.log("  ✓ 禁止跨域名注册 admin@epomail.cyou 验证通过");

    // 1.2 跨域名普通用户名冲突测试：在 epomail.bond 注册后，禁止在 epomail.cyou 注册相同用户名
    const testUsername = `e2e_uniq_${Date.now()}`;
    const testBondEmail = `${testUsername}@epomail.bond`;
    const testCyouEmail = `${testUsername}@epomail.cyou`;

    console.log(`  - 注册首个域名用户: ${testBondEmail}...`);
    const regBondRes = await page.request.post(BASE + "/api/register", {
      data: { email: testBondEmail, password: "password123" },
      headers: { "Content-Type": "application/json" }
    });
    const regBondJson = await regBondRes.json();
    assert.strictEqual(regBondJson.code, 200, `注册 ${testBondEmail} 应成功: ${regBondJson.message}`);
    console.log(`  ✓ 成功注册 ${testBondEmail}`);

    console.log(`  - 尝试在第二域名注册冲突用户: ${testCyouEmail}...`);
    const regCyouRes = await page.request.post(BASE + "/api/register", {
      data: { email: testCyouEmail, password: "password123" },
      headers: { "Content-Type": "application/json" }
    });
    const regCyouJson = await regCyouRes.json();
    console.log(`    响应: code=${regCyouJson.code}, message=${regCyouJson.message}`);
    assert.notStrictEqual(regCyouJson.code, 200, "禁止在另一域名注册已存在的相同用户名！");
    assert.ok(
      regCyouJson.message.includes("系统内用户名全局唯一") || regCyouJson.message.includes("已被占用"),
      `错误提示必须包含全局唯一提示: ${regCyouJson.message}`
    );
    console.log("  ✓ 双域名用户名冲突检测 100% 拦截通过");

    // 1.3 尝试通过另一用户添加相同别名别名防抢占测试
    console.log("  - 测试通过另一用户添加别名防抢占...");
    const anotherUserEmail = `e2e_other_${Date.now()}@epomail.bond`;
    const regOtherRes = await page.request.post(BASE + "/api/register", {
      data: { email: anotherUserEmail, password: "password123" },
      headers: { "Content-Type": "application/json" }
    });
    const regOtherJson = await regOtherRes.json();
    assert.strictEqual(regOtherJson.code, 200, `注册辅助用户 ${anotherUserEmail} 成功`);
    
    // 登录该辅助用户尝试添加他人用户名作为别名
    const otherLoginRes = await page.request.post(BASE + "/api/login", {
      data: { email: anotherUserEmail, password: "password123" },
      headers: { "Content-Type": "application/json" }
    });
    const otherLoginJson = await otherLoginRes.json();
    const otherToken = typeof otherLoginJson.data === "string" ? otherLoginJson.data : otherLoginJson.data?.token;

    const addAliasRes = await page.request.post(BASE + "/api/account/add", {
      data: { email: testCyouEmail },
      headers: { Authorization: otherToken, "Content-Type": "application/json" }
    });
    const addAliasJson = await addAliasRes.json();
    console.log(`    响应: code=${addAliasJson.code}, message=${addAliasJson.message}`);
    assert.notStrictEqual(addAliasJson.code, 200, "禁止抢占添加其他用户的全局用户名！");
    console.log("  ✓ 别名添加全局用户名防抢占验证通过");

    // --------------------------------------------------------------------------------------
    // 2. 参观者 "用户列表" 严格隐藏、不可访问与 403 审计
    // --------------------------------------------------------------------------------------
    console.log("\n[2. 审计参观者角色无用户列表查看权与全链路屏蔽]");
    const rolesRes = await page.request.get(BASE + "/api/role/list", {
      headers: { Authorization: token }
    });
    const rolesJson = await rolesRes.json();
    const roles = rolesJson.data || [];
    const visitorRole = roles.find(r => r.roleCode === "visitor" || r.name === "参观者");
    assert.ok(visitorRole, "必须存在参观者 (visitor) 角色");

    const permTreeRes = await page.request.get(BASE + "/api/role/tree", {
      headers: { Authorization: token }
    });
    const permTreeJson = await permTreeRes.json();
    const findPermId = (nodes, key) => {
      for (const n of nodes) {
        if (n.permKey === key) return n.permId;
        if (n.children) {
          const res = findPermId(n.children, key);
          if (res) return res;
        }
      }
      return null;
    };
    const userQueryPermId = findPermId(permTreeJson.data || [], "user:query");
    assert.ok(userQueryPermId, "必须存在 user:query 权限项");
    
    // 断言参观者绝不能具备 user:query 权限
    assert.ok(!visitorRole.permIds.includes(userQueryPermId), "参观者必须禁止具备 user:query 权限！");
    console.log(`  ✓ 参观者角色不具备 user:query 权限 (permId: ${userQueryPermId})`);

    // 后端拦截测试：尝试通过后端更新接口强行给 visitor 赋予 user:query
    console.log("  - 测试后端持久化严格过滤保护 (即使外部提交含 user:query，后端亦自动剔除)...");
    const testPermsWithUserQuery = [...visitorRole.permIds, userQueryPermId];
    const updateRes = await page.request.put(BASE + "/api/role/set", {
      data: {
        roleId: visitorRole.roleId,
        name: visitorRole.name,
        roleCode: visitorRole.roleCode,
        permIds: testPermsWithUserQuery,
        storageQuotaMb: visitorRole.storageQuotaMb,
        allowAttachment: visitorRole.allowAttachment,
        sendType: visitorRole.sendType,
        sendCount: visitorRole.sendCount,
        tagText: visitorRole.tagText,
        tagColor: visitorRole.tagColor,
        description: visitorRole.description
      },
      headers: { Authorization: token, "Content-Type": "application/json" }
    });
    const updateJson = await updateRes.json();
    assert.strictEqual(updateJson.code, 200, "更新角色 API 响应失败");

    // 重新获取并断言 user:query 依然被剔除
    const verifyRolesRes = await page.request.get(BASE + "/api/role/list", {
      headers: { Authorization: token }
    });
    const verifyRolesJson = await verifyRolesRes.json();
    const updatedVisitor = verifyRolesJson.data.find(r => r.roleId === visitorRole.roleId);
    assert.ok(!updatedVisitor.permIds.includes(userQueryPermId), "后端必须强制剔除参观者的 user:query 权限！");
    console.log("  ✓ 后端强制剔除 visitor 的 user:query 验证通过");

    // 前端 UI 测试：打开角色列表，点击参观者的设置弹窗，断言树节点 disabled 且显示禁止查看用户列表
    console.log("  - 验证前端 UI 角色弹窗中用户列表禁用状态与提示徽章...");
    await page.goto(BASE + "/role", { waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    const visitorRow = page.locator('.el-table__row', { hasText: '参观者' }).first();
    await visitorRow.locator('.el-dropdown button, .el-button').first().click();
    await page.waitForTimeout(400);

    const visibleEditItem = page.locator('.el-popper:visible .el-dropdown-menu__item, .el-dropdown-menu__item:visible').filter({ hasText: /修改|Edit/ }).first();
    await visibleEditItem.click();
    await page.waitForTimeout(600);

    const uiPermCheck = await page.evaluate(() => {
      const modal = document.querySelector(".role-form-dialog") || document.querySelector(".el-dialog");
      if (!modal) return { hasModal: false };
      
      const contents = Array.from(modal.querySelectorAll(".tree-node-content"));
      const userContent = contents.find(el => el.textContent.includes("参观者禁止查看用户列表") || (el.querySelector(".tree-node-label")?.textContent?.trim() === "用户查看"));
      if (!userContent) return { hasModal: true, hasUserListNode: false };

      const contentRow = userContent.closest(".el-tree-node__content");
      const checkbox = contentRow ? contentRow.querySelector(".el-checkbox") : null;
      const isDisabled = checkbox ? (checkbox.classList.contains("is-disabled") || checkbox.querySelector("input")?.disabled === true) : false;
      const isChecked = checkbox ? checkbox.classList.contains("is-checked") : false;
      const badge = userContent.querySelector(".el-tag");
      const badgeText = badge ? badge.textContent.trim() : "";

      return {
        hasModal: true,
        hasUserListNode: true,
        isDisabled,
        isChecked,
        badgeText
      };
    });
    console.log("  [DEBUG uiPermCheck]:", JSON.stringify(uiPermCheck, null, 2));

    assert.ok(uiPermCheck.hasModal, "角色配置弹窗已打开");
    assert.ok(uiPermCheck.hasUserListNode, "找到用户列表权限节点");
    assert.strictEqual(uiPermCheck.isDisabled, true, "用户列表复选框必须为 disabled 禁用状态");
    assert.strictEqual(uiPermCheck.isChecked, false, "用户列表复选框必须为未选中状态");
    assert.ok(uiPermCheck.badgeText.includes("参观者禁止查看用户列表"), `徽章提示必须包含禁止查看提示，实测为: ${uiPermCheck.badgeText}`);
    console.log("  ✓ 前端 UI 用户列表权限复选框已锁定禁止勾选，并显示「参观者禁止查看用户列表」徽章");

    // 2.2 参观者真实用户访问性端到端审计 (使用参观者账号登录并检查侧边栏和接口)
    console.log("  - 测试参观者实际登录后的访问性...");
    const visitorUserEmail = `visitor_test_${Date.now()}@epomail.bond`;
    const regVisitorRes = await page.request.post(BASE + "/api/register", {
      data: { email: visitorUserEmail, password: "password123" },
      headers: { "Content-Type": "application/json" }
    });
    const regVisitorJson = await regVisitorRes.json();
    assert.strictEqual(regVisitorJson.code, 200, "注册测试用户成功");

    // 登录为该参观者
    const visitorLoginRes = await page.request.post(BASE + "/api/login", {
      data: { email: visitorUserEmail, password: "password123" },
      headers: { "Content-Type": "application/json" }
    });
    const visitorLoginJson = await visitorLoginRes.json();
    assert.strictEqual(visitorLoginJson.code, 200, "参观者登录成功");
    const visitorToken = typeof visitorLoginJson.data === "string" ? visitorLoginJson.data : visitorLoginJson.data?.token;

    // 1) 接口层面测试：参观者直接调用 GET /api/user/list 必须返回 403 权限不足
    const visitorApiCall = await page.request.get(BASE + "/api/user/list", {
      headers: { Authorization: visitorToken }
    });
    const visitorApiJson = await visitorApiCall.json();
    console.log(`  - 参观者调用 GET /api/user/list 响应: code=${visitorApiJson.code}, message=${visitorApiJson.message}`);
    assert.strictEqual(visitorApiJson.code, 403, "参观者调用 /api/user/list 必须返回 403 Forbidden！");
    assert.strictEqual(visitorApiJson.message, "权限不足", "参观者调用 /api/user/list 必须提示权限不足！");
    console.log("  ✓ 参观者调用 /api/user/list 返回 403 (权限不足) 严格拦截验证通过");

    // 2) 页面层面测试：在浏览器中以参观者身份打开系统，验证侧边栏无「用户列表」
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
    }, visitorToken);
    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const navItems = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll(".settings-nav-item, a"));
      return items.map(el => el.textContent.trim()).filter(Boolean);
    });
    console.log("  - 参观者可见的导航项目列表:", navItems);
    const hasUserListInNav = navItems.some(text => text.includes("用户列表") || text.includes("All Users") || text.includes("用户管理"));
    assert.strictEqual(hasUserListInNav, false, "参观者侧边栏严禁出现「用户列表」入口！");
    console.log("  ✓ 参观者侧边栏无任何「用户列表」入口，界面完全隔离");

    // 3) 尝试直接访问 /all-users
    await page.goto(BASE + "/all-users", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const isUserTableVisible = await page.locator(".el-table").isVisible().catch(() => false);
    assert.strictEqual(isUserTableVisible, false, "参观者直接访问 /all-users 绝不能看到用户表格！");
    console.log("  ✓ 参观者直接访问 /all-users 无法查看任何用户数据，隔离验证通过");

    // 还原 Admin token
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
    }, token);

    // --------------------------------------------------------------------------------------
    // 3. 还原 EpoCanvasImage 与 OAuth 应用管理审计
    // --------------------------------------------------------------------------------------
    console.log("\n[3. 审计 OAuth 应用管理已还原 EpoCanvasImage 与 shijianus-blog]");
    const oauthListRes = await page.request.get(BASE + "/api/admin/oauthApp/list", {
      headers: { Authorization: token }
    });
    const oauthListJson = await oauthListRes.json();
    const apps = oauthListJson.data || [];
    console.log(`  ✓ 当前 OAuth 应用列表共有 ${apps.length} 个应用:`, apps.map(a => `${a.name} (${a.clientId})`));

    const imageApp = apps.find(a => a.clientId === "epo_live_epocanvas_image" || a.name === "EpoCanvasImage");
    assert.ok(imageApp, "必须成功还原 EpoCanvasImage OAuth 应用！");
    console.log(`  ✓ 成功找到已还原的 EpoCanvasImage 应用: clientId=${imageApp.clientId}, homepage=${imageApp.homepageUrl}`);

    const blogApp = apps.find(a => a.name === "shijianus-blog");
    assert.ok(blogApp, "必须存在官方博客示例应用 shijianus-blog！");
    console.log(`  ✓ 官方示例应用 shijianus-blog 存在: clientId=${blogApp.clientId}`);

    // 校验生产环境私密安全：绝对不能泄露硬编码密码
    for (const app of apps) {
      assert.notStrictEqual(app.clientSecret, "epo_sec_shijianus_blog_secret", "严禁泄露硬编码 shijianus_blog 密钥！");
      assert.ok(app.clientSecretMasked && app.clientSecretMasked.includes("••••"), "客户端必须展示脱敏掩码密钥");
    }
    console.log("  ✓ 绝对安全检验：所有密钥均已脱敏掩码展示");

    // --------------------------------------------------------------------------------------
    // 4. 清理所有测试生成的脏数据 (零假数据准则)
    // --------------------------------------------------------------------------------------
    console.log("\n[4. 清理测试产生的临时账号与数据]");
    const usersToClean = [testBondEmail, anotherUserEmail, visitorUserEmail, "visitor_test_1789121994911@epomail.bond"];
    const userListFinalRes = await page.request.get(BASE + "/api/user/list?size=50", {
      headers: { Authorization: token }
    });
    const allUsers = (await userListFinalRes.json()).data?.records || [];
    for (const email of usersToClean) {
      const u = allUsers.find(item => item.email === email);
      if (u) {
        console.log(`  - 清理测试用户: ${email} (userId: ${u.userId})...`);
        await page.request.delete(BASE + "/api/user/delete", {
          data: { userId: u.userId },
          headers: { Authorization: token, "Content-Type": "application/json" }
        });
      }
    }
    console.log("  ✓ 测试数据已全部彻底物理清理，恪守零假数据残留准则");

    console.log("\n========================================================");
    console.log("🎉 全部核心问题审计 100% 成功全绿通过！");
    console.log("========================================================");

  } catch (err) {
    console.error("\n❌ 审计执行过程中失败:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
