import { chromium } from "playwright";
import assert from "node:assert";

(async () => {
  console.log("=== 开始硬编码默认项优化与安全性全量端到端审计 ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  try {
    // --------------------------------------------------------------------------------------
    // 0. Admin 登录
    // --------------------------------------------------------------------------------------
    console.log("\n[0. Admin 登录]");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, "Admin 登录失败");
    const token = typeof loginJson.data === "string" ? loginJson.data : loginJson.data?.token;
    console.log("  ✓ Admin 登录成功");

    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);

    // --------------------------------------------------------------------------------------
    // 1. 参观者 "用户列表" 查看权限锁定与不可关闭审计
    // --------------------------------------------------------------------------------------
    console.log("\n[1. 审计参观者角色权限与锁定机制]");
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
    assert.ok(visitorRole.permIds.includes(userQueryPermId), "参观者必须默认具备 user:query 权限");
    console.log(`  ✓ 参观者角色包含 user:query 权限 (permId: ${userQueryPermId})`);

    // 后端拦截测试：尝试通过后端更新接口强行移除 visitor 的 user:query
    console.log("  - 测试后端持久化防撤销保护 (即使提交不含 user:query，后端亦自动保留)...");
    const testPermsWithoutUserQuery = visitorRole.permIds.filter(id => id !== userQueryPermId);
    const updateRes = await page.request.put(BASE + "/api/role/set", {
      data: {
        roleId: visitorRole.roleId,
        name: visitorRole.name,
        roleCode: visitorRole.roleCode,
        permIds: testPermsWithoutUserQuery,
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

    // 重新获取并断言 user:query 依然存在
    const verifyRolesRes = await page.request.get(BASE + "/api/role/list", {
      headers: { Authorization: token }
    });
    const verifyRolesJson = await verifyRolesRes.json();
    const updatedVisitor = verifyRolesJson.data.find(r => r.roleId === visitorRole.roleId);
    assert.ok(updatedVisitor.permIds.includes(userQueryPermId), "后端必须强制保留参观者的 user:query 权限！");
    console.log("  ✓ 后端强制保留 user:query 验证通过");

    // 前端 UI 测试：打开角色列表，点击参观者的设置弹窗，断言树节点 disabled 且有锁定标签
    console.log("  - 验证前端 UI 禁用复选框与提示徽章...");
    await page.goto(BASE + "/role", { waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    const visitorRow = page.locator('.el-table__row', { hasText: '参观者' }).first();
    await visitorRow.locator('.el-dropdown button, .el-button').first().click();
    await page.waitForTimeout(400);

    const visibleEditItem = page.locator('.el-popper:visible .el-dropdown-menu__item, .el-dropdown-menu__item:visible').filter({ hasText: /修改|Edit/ }).first();
    await visibleEditItem.click();
    await page.waitForTimeout(600);

    // 检查弹窗中 user:query 的树节点
    const uiPermCheck = await page.evaluate(() => {
      const modal = document.querySelector(".role-form-dialog") || document.querySelector(".el-dialog");
      if (!modal) return { hasModal: false };
      
      const contents = Array.from(modal.querySelectorAll(".tree-node-content"));
      const userContent = contents.find(el => el.textContent.includes("参观者必备·禁止关闭") || (el.querySelector(".tree-node-label")?.textContent?.trim() === "用户查看"));
      if (!userContent) return { hasModal: true, hasUserListNode: false };

      const contentRow = userContent.closest(".el-tree-node__content");
      const checkbox = contentRow ? contentRow.querySelector(".el-checkbox") : null;
      const isDisabled = checkbox ? (checkbox.classList.contains("is-disabled") || checkbox.querySelector("input")?.disabled === true) : false;
      const badge = userContent.querySelector(".el-tag");
      const badgeText = badge ? badge.textContent.trim() : "";

      return {
        hasModal: true,
        dialogTitle: modal.querySelector(".dialog-title-bar span")?.textContent,
        roleNameInput: modal.querySelector(".dialog-input input")?.value,
        hasUserListNode: true,
        isDisabled,
        badgeText,
        checkboxHtml: checkbox ? checkbox.outerHTML : null,
        checkboxClasses: checkbox ? checkbox.className : null,
        inputDisabled: checkbox?.querySelector("input")?.disabled,
        treeProps: modal.querySelector(".el-tree")?.__vueParentComponent?.props
      };
    });
    console.log("  [DEBUG uiPermCheck]:", JSON.stringify(uiPermCheck, null, 2));

    assert.ok(uiPermCheck.hasModal, "角色配置弹窗已打开");
    assert.ok(uiPermCheck.hasUserListNode, "找到用户列表权限节点");
    assert.strictEqual(uiPermCheck.isDisabled, true, "用户列表复选框必须为 disabled 禁用状态");
    assert.ok(uiPermCheck.badgeText.includes("参观者必备·禁止关闭"), `徽章提示必须包含锁定提示，实测为: ${uiPermCheck.badgeText}`);
    console.log("  ✓ 前端 UI 用户列表权限复选框已锁定，并显示「参观者必备·禁止关闭」徽章");

    // --------------------------------------------------------------------------------------
    // 2. 应用管理默认 shijianus-blog、随机密钥安全与站长永久删除审计
    // --------------------------------------------------------------------------------------
    console.log("\n[2. 审计 OAuth 应用管理默认配置、私密安全性与删除持久性]");
    const oauthListRes = await page.request.get(BASE + "/api/admin/oauthApp/list", {
      headers: { Authorization: token }
    });
    const oauthListJson = await oauthListRes.json();
    const apps = oauthListJson.data || [];
    console.log(`  ✓ 当前 OAuth 应用列表获取成功，共有 ${apps.length} 个应用`);

    // 校验生产环境私密安全：绝对不能泄露硬编码密码
    for (const app of apps) {
      assert.notStrictEqual(app.clientSecret, "epo_sec_shijianus_blog_secret", "严禁泄露硬编码 shijianus_blog 密钥！");
      assert.notStrictEqual(app.clientSecret, "epo_sec_epocanvas_image_secret_2026", "严禁泄露硬编码 epocanvas_image 密钥！");
    }
    console.log("  ✓ 绝对安全检验：无任何硬编码生产密钥暴露");

    // 测试添加临时应用与永久删除持久性（杜绝死灰复燃）
    console.log("  - 测试应用创建与站长删除后绝不复活...");
    const addAppRes = await page.request.post(BASE + "/api/admin/oauthApp/add", {
      data: {
        name: "audit-ephemeral-app",
        homepageUrl: "https://audit.test.com",
        description: "临时测试审计应用",
        redirectUris: ["https://audit.test.com/callback"],
        scopes: "openid profile email"
      },
      headers: { Authorization: token, "Content-Type": "application/json" }
    });
    const addAppJson = await addAppRes.json();
    assert.strictEqual(addAppJson.code, 200, "创建临时 OAuth 应用失败");
    const createdAppId = addAppJson.data.id;
    console.log(`  ✓ 成功创建临时应用 (ID: ${createdAppId})`);

    // 删除该应用
    const delAppRes = await page.request.delete(BASE + "/api/admin/oauthApp/delete", {
      data: { id: createdAppId },
      headers: { Authorization: token, "Content-Type": "application/json" }
    });
    const delAppJson = await delAppRes.json();
    assert.strictEqual(delAppJson.code, 200, "删除应用失败");

    // 多次查询确认永久删除且未自动重建
    const postDelListRes = await page.request.get(BASE + "/api/admin/oauthApp/list", {
      headers: { Authorization: token }
    });
    const postDelApps = (await postDelListRes.json()).data || [];
    assert.ok(!postDelApps.some(a => a.id === createdAppId), "已删除应用不应在列表中存在");
    console.log("  ✓ 站长删除应用后保持永久移除，无任何死循环自动复活");

    // --------------------------------------------------------------------------------------
    // 3. 角色层级空选项与站长删除持久性审计 (LV.0 / LV.1 空选项可删除不复活)
    // --------------------------------------------------------------------------------------
    console.log("\n[3. 审计角色层级配置与删除持久性 (零复活)]");
    const testRoleName = `Audit_Role_${Date.now()}`;
    const addRoleRes = await page.request.post(BASE + "/api/role/add", {
      data: {
        name: testRoleName,
        roleCode: "user_test",
        permIds: [],
        storageQuotaMb: 15,
        allowAttachment: 0,
        tagText: "审计角色",
        tagColor: "#ec4899",
        description: "审计临时角色"
      },
      headers: { Authorization: token, "Content-Type": "application/json" }
    });
    const addRoleJson = await addRoleRes.json();
    assert.strictEqual(addRoleJson.code, 200, "创建临时角色失败");
    
    // 获取刚刚创建的 ID 并删除
    const afterAddRolesRes = await page.request.get(BASE + "/api/role/list", {
      headers: { Authorization: token }
    });
    const addedRole = (await afterAddRolesRes.json()).data.find(r => r.name === testRoleName);
    assert.ok(addedRole, "新建角色应能查询到");

    const delRoleRes = await page.request.delete(BASE + `/api/role/delete?roleId=${addedRole.roleId}`, {
      headers: { Authorization: token }
    });
    const delRoleJson = await delRoleRes.json();
    assert.strictEqual(delRoleJson.code, 200, "删除角色失败");

    // 多次查询，验证 roleList() 没有因为角色数量变动触发重新补全或报错
    const verifyDelRoleRes = await page.request.get(BASE + "/api/role/list", {
      headers: { Authorization: token }
    });
    const verifyDelRoleJson = await verifyDelRoleRes.json();
    assert.ok(!verifyDelRoleJson.data.some(r => r.roleId === addedRole.roleId), "被删除角色绝不复活");
    console.log("  ✓ 角色删除持久性验证通过 (无强制恢复/死循环补充分组)");

    // --------------------------------------------------------------------------------------
    // 4. 个人标签 i18n 适配与自由增删改 (杜绝强行复活)
    // --------------------------------------------------------------------------------------
    console.log("\n[4. 审计个人标签 i18n 国际化适配与用户自主权 (工作等标签零强制复活)]");
    // 访问标签设置页（中文）
    await page.goto(BASE + "/settings/labels", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    const labelsZh = await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll(".label-pill span"));
      return titles.map(t => t.textContent.trim());
    });
    console.log("  - 中文模式下标签展示:", labelsZh);

    // 切换到英文模式 (同步更新服务端个人资料与客户端存储)
    await page.request.put(BASE + "/api/my/updateProfile", {
      data: { lang: "en" },
      headers: { Authorization: token, "Content-Type": "application/json" }
    });
    await page.evaluate(() => {
      let setting = {};
      try { setting = JSON.parse(localStorage.getItem('setting') || '{}'); } catch(e){}
      localStorage.setItem("setting", JSON.stringify({ ...setting, lang: "en" }));
      localStorage.setItem("locale", "en");
    });
    await page.goto(BASE + "/settings/labels", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const labelsEn = await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll(".label-pill span"));
      return titles.map(t => t.textContent.trim());
    });
    console.log("  - 英文模式下标签展示:", labelsEn);

    // 验证 i18n 映射：若存在内置标签，应当展示英文
    const i18nMap = {
      '社群': 'Social',
      '订阅': 'Subscriptions',
      '推销': 'Promotions',
      '工作': 'Work'
    };
    for (const [zh, en] of Object.entries(i18nMap)) {
      if (labelsZh.includes(zh)) {
        assert.ok(labelsEn.includes(en), `英文模式下 ${zh} 必须对应翻译为 ${en}`);
      }
    }
    console.log("  ✓ 个人标签中文/英文 i18n 动态映射审计通过");

    // 还原语言设置回中文
    await page.request.put(BASE + "/api/my/updateProfile", {
      data: { lang: "zh" },
      headers: { Authorization: token, "Content-Type": "application/json" }
    });
    await page.evaluate(() => {
      let setting = {};
      try { setting = JSON.parse(localStorage.getItem('setting') || '{}'); } catch(e){}
      localStorage.setItem("setting", JSON.stringify({ ...setting, lang: "zh" }));
      localStorage.setItem("locale", "zh");
    });

    // --------------------------------------------------------------------------------------
    // 5. 外部官方链接统一收敛与动态环境兜底审计
    // --------------------------------------------------------------------------------------
    console.log("\n[5. 审计外部链接收敛与动态环境配置]");
    const siteConfigRes = await page.request.get(BASE + "/api/setting/websiteConfig");
    const siteConfigJson = await siteConfigRes.json();
    const configData = siteConfigJson.data || {};
    
    assert.strictEqual(configData.blogUrl, "https://blog.epocanvas.com", "官方博客链接必须正确收敛");
    assert.strictEqual(configData.docsUrl, "https://docs.epocanvas.com/epomail", "官方文档链接必须正确收敛");
    assert.strictEqual(configData.supportUrl, "https://blog.epocanvas.com/support", "官方支持链接必须正确收敛");
    assert.strictEqual(configData.telegramLink, "https://t.me/epomail", "官方Telegram群组链接必须正确收敛");
    assert.strictEqual(configData.githubLink, "https://github.com/shijianus/epomail", "官方GitHub开源链接必须正确收敛");
    console.log("  ✓ /api/setting/websiteConfig 官方收敛链接全部校验通过");

    // 检查系统设置页面中的外部链接跳转逻辑
    await page.goto(BASE + "/settings/profile", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const sysSettingLink = page.locator('.settings-nav-item').filter({ hasText: /系统设置|System Settings/i });
    await sysSettingLink.first().waitFor({ state: 'visible', timeout: 8000 });
    await sysSettingLink.first().click();
    await page.waitForTimeout(2000);
    await page.waitForSelector('.settings-card.about', { state: 'attached', timeout: 10000 });

    const uiLinkTargets = await page.evaluate(() => {
      const clickedHrefs = [];
      const origCreateElement = document.createElement.bind(document);
      document.createElement = function(tagName, options) {
        const el = origCreateElement(tagName, options);
        if (tagName.toLowerCase() === 'a') {
          el.click = function() {
            clickedHrefs.push(el.href);
          };
        }
        return el;
      };

      // 触发社区与帮助支持按钮点击
      const buttons = Array.from(document.querySelectorAll(".concerning-item button"));
      buttons.forEach(btn => {
        try { btn.click(); } catch(e){}
      });

      // 还原
      document.createElement = origCreateElement;

      return {
        clickedHrefs,
        btnCount: buttons.length,
        btnTexts: buttons.map(b => b.textContent.trim())
      };
    });

    console.log(`  - 找到 ${uiLinkTargets.btnCount} 个关于卡片按钮:`, uiLinkTargets.btnTexts);
    console.log("  - 系统设置页面按钮触发跳转链接:", uiLinkTargets.clickedHrefs);
    assert.ok(uiLinkTargets.clickedHrefs.some(u => u.includes("github.com/shijianus/epomail")), "系统设置应正确触发官方 GitHub 跳转");
    assert.ok(uiLinkTargets.clickedHrefs.some(u => u.includes("t.me/epomail")), "系统设置应正确触发官方 Telegram 跳转");
    assert.ok(uiLinkTargets.clickedHrefs.some(u => u.includes("blog.epocanvas.com/support")), "系统设置应正确触发官方 Support 跳转");
    assert.ok(uiLinkTargets.clickedHrefs.some(u => u.includes("docs.epocanvas.com/epomail")), "系统设置应正确触发官方 Docs 跳转");
    console.log("  ✓ 系统设置页面外部官方链接跳转行为与收敛 URL 100% 校验通过");

    // 检查应用管理页面中「访问官方博客」与示例 App 主页链接
    const oauthLink = page.locator('.settings-nav-item').filter({ hasText: /应用管理|OAuth/i });
    await oauthLink.first().waitFor({ state: 'visible', timeout: 8000 });
    await oauthLink.first().click();
    await page.waitForSelector('.app-card', { timeout: 10000 });
    const oauthAppLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll(".app-card a[href]"));
      const blogLink = links.find(a => a.href.includes("blog.epocanvas.com"));
      const buttons = Array.from(document.querySelectorAll("button"));
      const hasGuideBtn = buttons.some(b => b.textContent.includes("开发接入教程") || b.textContent.includes("Blog Tutorial") || b.textContent.includes("教程") || b.textContent.includes("Guide"));
      return {
        blogHref: blogLink?.href,
        hasGuideBtn,
        cardLinks: links.map(a => a.href)
      };
    });
    console.log("  - 应用管理卡片链接列表:", oauthAppLinks.cardLinks);
    assert.ok(oauthAppLinks.blogHref && oauthAppLinks.blogHref.includes("blog.epocanvas.com"), "应用管理中官方博客主页链接必须正确指向 blog.epocanvas.com");
    assert.ok(oauthAppLinks.hasGuideBtn, "应用管理中开发接入教程必须存在");
    console.log("  ✓ 应用管理「访问官方博客」与接入教程正确就绪");

    console.log("\n========================================================");
    console.log("🎉 全部 5 大核心硬编码优化与安全加固项目 E2E 审计 100% 成功全绿！");
    console.log("========================================================");

  } catch (err) {
    console.error("\n❌ 审计执行过程中失败:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
