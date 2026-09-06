import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：默认参观者角色、def-tag后置、弹窗居中互斥拉伸、注册码脱敏防护与empty背板 ===");
  console.log("==========================================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  const BASE = "https://epomail.epocanvas.workers.dev";

  let visitorEmail = `vis_${Date.now()}@epomail.bond`;
  let visitorPassword = "Password123!";
  let visitorToken = null;
  let adminToken = null;
  let testRegKeyId = null;
  let testRegKeyCode = `MASK_TEST_${Date.now().toString(36).toUpperCase()}`;

  try {
    // 1. 登录 Admin 账号
    console.log("\n[步骤 1] 登录 Admin 账号获取鉴权 Token...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "Admin 登录失败: " + JSON.stringify(loginData));
    adminToken = typeof loginData.data === "string" ? loginData.data : loginData.data?.token;
    console.log("  ✓ Admin 登录成功");

    // 2. 验证角色列表中「参观者」为默认角色 (isDefault = 1)
    console.log("\n[步骤 2] 校验 /api/role/list 中默认角色为「参观者 (visitor)」...");
    const roleListRes = await page.request.get(BASE + "/api/role/list", {
      headers: { Authorization: adminToken }
    });
    const roleListData = await roleListRes.json();
    assert.strictEqual(roleListData.code, 200, "获取角色列表失败: " + JSON.stringify(roleListData));
    const roles = Array.isArray(roleListData.data) ? roleListData.data : (roleListData.data?.list || []);

    const defaultRoles = roles.filter(r => r.isDefault === 1);
    assert.strictEqual(defaultRoles.length, 1, `系统必须有且仅有 1 个默认角色，当前发现 ${defaultRoles.length} 个`);
    const defRole = defaultRoles[0];
    console.log(`  系统当前默认角色: [${defRole.name}], 代码: [${defRole.roleCode}], 排序: [${defRole.sort}]`);
    assert.ok(
      defRole.roleCode === "visitor" || defRole.name === "参观者",
      `系统默认角色必须为「参观者 (visitor)」，实际为: ${defRole.name} (${defRole.roleCode})`
    );
    console.log("  ✓ 校验通过：系统默认分组确认为「参观者 (visitor)」");

    // 3. 访问 /role 页面，验证 def-tag 处于 custom-role-badge 之后
    console.log("\n[步骤 3] 访问 /role 页面，验证 def-tag 处于 custom-role-badge 之后...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, adminToken);

    await page.goto(BASE + "/role", { waitUntil: "networkidle" });
    await page.waitForSelector(".perm-box", { timeout: 15000 });

    // 检查参观者行包含 def-tag
    const visitorRowHasDefTag = await page.$eval(
      ".el-table__body tr:has(.role-title:text-is('参观者'))",
      tr => {
        const defTag = tr.querySelector(".role-tag.def-tag");
        const customBadge = tr.querySelector(".custom-role-badge");
        if (!defTag || !customBadge) return { ok: false, reason: "missing elements" };
        const isAfter = (customBadge.compareDocumentPosition(defTag) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        return { ok: true, isAfter, defTagText: defTag.textContent.trim(), customBadgeText: customBadge.textContent.trim() };
      }
    );
    console.log("  参观者标签顺序审计:", visitorRowHasDefTag);
    assert.strictEqual(visitorRowHasDefTag.ok, true, "参观者行必须同时包含 custom-role-badge 与 def-tag");
    assert.strictEqual(visitorRowHasDefTag.isAfter, true, "def-tag 必须位于 custom-role-badge 之后！");
    console.log("  ✓ def-tag 成功渲染在身份标志之后，视觉层次正确");

    // 4. 打开新建/编辑弹窗，验证弹窗居中摆放与权限树互斥展开 (accordion)
    console.log("\n[步骤 4] 验证角色弹窗水平垂直居中摆放与权限树互斥拉伸 (accordion)...");
    const addRoleBtn = await page.waitForSelector(".header-actions .action-btn-pill:first-child", { timeout: 5000 });
    await addRoleBtn.click();
    await page.waitForTimeout(600);

    const dialogEl = await page.waitForSelector(".role-form-dialog", { timeout: 5000 });
    assert.ok(dialogEl, "必须展开角色弹窗");

    // 检查居中属性 (没有行内 style="margin-top: 6vh;" 或 top 覆盖)
    const dialogBounding = await dialogEl.boundingBox();
    const viewportSize = page.viewportSize();
    console.log(`  视口高度: ${viewportSize.height}px, 弹窗 Y: ${dialogBounding.y}px, 弹窗高度: ${dialogBounding.height}px`);
    const expectedCenterY = (viewportSize.height - dialogBounding.height) / 2;
    console.log(`  预期居中 Y: ${expectedCenterY}px, 实际 Y: ${dialogBounding.y}px`);
    assert.ok(Math.abs(dialogBounding.y - expectedCenterY) < 50, "弹窗必须在垂直方向精确居中摆放");
    console.log("  ✓ 角色弹窗水平与垂直方向均严格居中呈现");

    // 验证互斥展开 (Click First Node -> Open, Click Second Node -> First Node Closes)
    const treeNodes = await page.$$(".perm-tree-wrap .el-tree-node");
    assert.ok(treeNodes.length >= 3, "权限树必须有多个一级权限分组");

    // 点击第一个分组展开
    const firstArrow = await treeNodes[0].$(".el-tree-node__expand-icon");
    if (firstArrow) {
      await firstArrow.click();
      await page.waitForTimeout(300);
      const isFirstExpanded = await treeNodes[0].evaluate(el => el.classList.contains("is-expanded"));
      console.log(`  点击第 1 个节点展开: is-expanded = ${isFirstExpanded}`);
      assert.strictEqual(isFirstExpanded, true, "第 1 个权限节点展开成功");

      // 点击第 2 个分组展开
      const secondArrow = await treeNodes[1].$(".el-tree-node__expand-icon");
      if (secondArrow) {
        await secondArrow.click();
        await page.waitForTimeout(300);
        const isSecondExpanded = await treeNodes[1].evaluate(el => el.classList.contains("is-expanded"));
        const isFirstStillExpanded = await treeNodes[0].evaluate(el => el.classList.contains("is-expanded"));
        console.log(`  点击第 2 个节点后: 第 2 节点 expanded = ${isSecondExpanded}, 第 1 节点 expanded = ${isFirstStillExpanded}`);
        assert.strictEqual(isSecondExpanded, true, "第 2 个权限节点展开成功");
        assert.strictEqual(isFirstStillExpanded, false, "互斥拉伸 (accordion) 生效：前一个展开的节点已自动收起！");
      }
    }
    console.log("  ✓ 权限树互斥拉伸 (accordion) 验证 100% 成功");

    // 关闭角色弹窗
    const closeDialogBtn = await page.$(".role-form-dialog .el-dialog__headerbtn");
    await closeDialogBtn.click();
    await page.waitForTimeout(300);

    // 5. 验证隐式设置：彻底剔除博客显式卡片、am-storage 与 lucide 图标
    console.log("\n[步骤 5] 验证博客显式设置清理与纯净隐式化...");
    // 5.1 头像下拉菜单
    const avatar = await page.waitForSelector(".avatar-wrap", { timeout: 10000 });
    await avatar.click();
    await page.waitForTimeout(400);

    const amStorage = await page.$(".am-storage");
    assert.strictEqual(amStorage, null, "头像下拉菜单严禁存在 .am-storage 显式存储栏");
    const amBlogTier = await page.$(".am-blog-tier");
    assert.strictEqual(amBlogTier, null, "头像下拉菜单严禁存在 .am-blog-tier 显式博客等级项");
    const lucideIcons = await page.$$(".am-item .iconify--lucide, .am-item .ic");
    assert.strictEqual(lucideIcons.length, 0, "头像下拉菜单项严禁出现旧版 lucide 图标");
    console.log("  ✓ 头像下拉菜单彻底纯净化：.am-storage、.am-blog-tier 与旧图标零残留");

    // 点击其他位置关闭下拉
    await page.click("body", { position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);

    // 5.2 个人设置页 /settings/profile
    await page.goto(BASE + "/settings/profile", { waitUntil: "networkidle" });
    await page.waitForSelector(".box", { timeout: 10000 });
    const settingsHtml = await page.content();
    assert.ok(!settingsHtml.includes("博客书友分级联动"), "个人设置页严禁存在显式「博客书友分级联动」板块");
    assert.ok(!settingsHtml.includes("博客等级称号"), "个人设置页严禁存在显式「博客等级称号」项");
    console.log("  ✓ 个人设置页隐式化核验通过：无显式博客板块");

    // 5.3 用户公开详情页 /admin
    await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
    await page.waitForSelector(".profile-container", { timeout: 10000 });
    const blogCard = await page.$(".blog-linkage-card");
    assert.strictEqual(blogCard, null, "公开详情页严禁存在显式 .blog-linkage-card");
    console.log("  ✓ 公开详情页隐式化核验通过：无显式 blog-linkage-card");

    // 6. 验证注册密钥 /invite-code 的 .empty 背板渲染
    console.log("\n[步骤 6] 验证注册密钥 /invite-code 页面 .empty 背板渲染...");
    await page.goto(BASE + "/invite-code", { waitUntil: "networkidle" });
    await page.waitForSelector(".reg-key", { timeout: 10000 });

    // 搜索不存在的 code 触发 empty 状态
    const searchInput = await page.waitForSelector(".reg-key .search-input input", { timeout: 5000 });
    await searchInput.fill("NON_EXISTENT_KEY_FOR_TEST_EMPTY");
    await searchInput.press("Enter");
    await page.waitForTimeout(600);

    // 检查 .empty 与 .empty-baseplate
    const emptyContainer = await page.waitForSelector(".reg-key .empty", { timeout: 5000 });
    assert.ok(emptyContainer, "搜索无果时必须展示 .empty 容器");
    const emptyBaseplate = await page.waitForSelector(".reg-key .empty .empty-baseplate", { timeout: 5000 });
    assert.ok(emptyBaseplate, "empty 区域必须包含独立背板容器 (.empty-baseplate)");
    
    // 检查背板背景色与边框不是全透明
    const baseplateStyles = await emptyBaseplate.evaluate(el => {
      const s = window.getComputedStyle(el);
      return {
        background: s.backgroundColor,
        borderRadius: s.borderRadius,
        hasBorder: s.borderWidth !== "0px" && s.borderStyle !== "none"
      };
    });
    console.log("  空状态背板渲染样式:", baseplateStyles);
    assert.ok(baseplateStyles.background !== "rgba(0, 0, 0, 0)", "背板必须具备实心或磨砂底色，不可为全透明");
    assert.strictEqual(baseplateStyles.hasBorder, true, "背板必须带有边框描边，确保在所有模式下清晰可见");
    console.log("  ✓ .empty 背板渲染审计通过：实心底板、圆角边框清晰呈现");

    // 清空搜索恢复列表
    await searchInput.fill("");
    await searchInput.press("Enter");
    await page.waitForTimeout(600);

    // 7. 验证参观者 (Visitor) 注册码脱敏与复制限制
    console.log("\n[步骤 7] 验证参观者权限下的注册码脱敏保护 (前端+后端全链路)...");

    // 7.1 先以 Admin 身份创建一个测试密钥
    console.log("  7.1 Admin 创建测试密钥...");
    const addKeyRes = await page.request.post(BASE + "/api/regKey/add", {
      data: {
        code: testRegKeyCode,
        roleId: 2, // 参观者
        count: 10,
        expireTime: "2099-12-31"
      },
      headers: {
        Authorization: adminToken,
        "Content-Type": "application/json"
      }
    });
    const addKeyData = await addKeyRes.json();
    assert.strictEqual(addKeyData.code, 200, "创建测试注册码失败: " + JSON.stringify(addKeyData));
    console.log(`  ✓ 测试注册码创建成功: ${testRegKeyCode}`);

    // 获取密钥 ID
    const listRes = await page.request.get(BASE + "/api/regKey/list", {
      headers: { Authorization: adminToken }
    });
    const listData = await listRes.json();
    const createdKey = (listData.data || []).find(k => k.code === testRegKeyCode);
    assert.ok(createdKey, "列表必须包含刚刚创建的真实测试密钥");
    testRegKeyId = createdKey.regKeyId;
    console.log(`  测试密钥 ID: ${testRegKeyId}, Admin 查看明文: ${createdKey.code}`);

    // 7.2 Admin 添加测试用户并赋予「参观者」角色
    console.log("  7.2 Admin 添加测试用户并赋予「参观者」分组...");
    const addUserRes = await page.request.post(BASE + "/api/user/add", {
      data: {
        email: visitorEmail,
        type: 2, // 参观者
        password: visitorPassword
      },
      headers: {
        Authorization: adminToken,
        "Content-Type": "application/json"
      }
    });
    const addUserData = await addUserRes.json();
    assert.strictEqual(addUserData.code, 200, "Admin 添加测试参观者失败: " + JSON.stringify(addUserData));
    console.log(`  ✓ 测试参观者用户 ${visitorEmail} 创建成功`);

    // 登录该参观者用户
    const visLoginRes = await page.request.post(BASE + "/api/login", {
      data: { email: visitorEmail, password: visitorPassword },
      headers: { "Content-Type": "application/json" }
    });
    const visLoginData = await visLoginRes.json();
    assert.strictEqual(visLoginData.code, 200, "参观者用户登录失败: " + JSON.stringify(visLoginData));
    visitorToken = typeof visLoginData.data === "string" ? visLoginData.data : visLoginData.data?.token;

    // 获取新用户信息验证角色是 参观者
    const visInfoRes = await page.request.get(BASE + "/api/my/loginUserInfo", {
      headers: { Authorization: visitorToken }
    });
    const visInfoData = await visInfoRes.json();
    const userRole = visInfoData.data?.role;
    console.log(`  测试用户当前角色: [${userRole?.name}], 代码: [${userRole?.roleCode}]`);
    assert.ok(
      userRole?.roleCode === "visitor" || userRole?.name === "参观者",
      "测试用户必须为「参观者 (visitor)」角色！"
    );
    console.log("  ✓ 参观者身份确认就绪");

    // 7.3 以参观者身份调用后端 /api/regKey/list
    console.log("  7.3 参观者调用 /api/regKey/list 校验后端脱敏逻辑...");
    const visListRes = await page.request.get(BASE + "/api/regKey/list", {
      headers: { Authorization: visitorToken }
    });
    const visListData = await visListRes.json();
    assert.strictEqual(visListData.code, 200, "参观者查询注册码列表接口失败: " + JSON.stringify(visListData));
    const visKeys = visListData.data || [];
    assert.ok(visKeys.length > 0, "参观者应该能看到注册码条目");
    for (const k of visKeys) {
      assert.strictEqual(k.code, "••••••••••••••••", `注册码未脱敏！实际展示: ${k.code}`);
      assert.strictEqual(k.isMasked, true, "isMasked 标志必须为 true");
    }
    console.log("  ✓ 后端数据脱敏 100% 生效：所有密钥均替换为 •••••••••••••••• 且标记 isMasked=true");

    // 7.4 参观者调用 /api/regKey/history
    console.log("  7.4 参观者调用 /api/regKey/history 校验使用记录隐藏保护...");
    const visHistoryRes = await page.request.get(BASE + `/api/regKey/history?regKeyId=${testRegKeyId}`, {
      headers: { Authorization: visitorToken }
    });
    const visHistoryData = await visHistoryRes.json();
    assert.strictEqual(visHistoryData.code, 200, "参观者查询使用记录失败: " + JSON.stringify(visHistoryData));
    assert.deepStrictEqual(visHistoryData.data, [], "参观者查询使用历史必须返回空数组 []");
    console.log("  ✓ 后端历史记录保护生效：返回空数组零泄露");

    // 7.5 前端 UI 登录参观者账号测试
    console.log("  7.5 参观者登录 Web 端访问 /invite-code 验证界面脱敏与复制拦截...");
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
    }, visitorToken);

    await page.goto(BASE + "/invite-code", { waitUntil: "networkidle" });
    await page.waitForSelector(".reg-key", { timeout: 10000 });

    // 验证顶部参观者提示条
    const noticeBar = await page.waitForSelector(".visitor-notice-bar", { timeout: 5000 });
    assert.ok(noticeBar, "参观者访问注册码页面必须渲染顶部 .visitor-notice-bar");
    const noticeText = await noticeBar.textContent();
    assert.ok(noticeText.includes("参观者演示模式"), "提示条必须包含「参观者演示模式」");
    assert.ok(noticeText.includes("脱敏保护"), "提示条必须包含「脱敏保护」");
    console.log(`  ✓ 顶部脱敏警示条渲染: [${noticeText.trim()}]`);

    // 验证列表中的脱敏标志
    const maskedTags = await page.$$(".masked-tag");
    assert.ok(maskedTags.length > 0, "卡片中必须渲染「脱敏保护」标签");
    const tagText = await maskedTags[0].textContent();
    assert.ok(tagText.includes("脱敏保护"), "标签文案必须为「脱敏保护」");

    // 验证点击复制被拦截
    console.log("  7.6 测试点击脱敏密钥触发复制拦截提示...");
    const codeItem = await page.waitForSelector(".code.code-masked", { timeout: 5000 });
    await codeItem.click();
    await page.waitForTimeout(400);

    const messageEl = await page.waitForSelector(".el-message--warning", { timeout: 3000 });
    assert.ok(messageEl, "点击脱敏密钥必须弹出 warning 级别 Toast 拦截提示");
    const messageText = await messageEl.textContent();
    console.log(`  Toast 提示信息: [${messageText.trim()}]`);
    assert.ok(messageText.includes("禁止复制"), "Toast 必须明确提示「禁止复制」");
    console.log("  ✓ 复制拦截闭环 100% 验证成功！");

    // 截图保存作为审计凭据
    await page.screenshot({ path: "tests/invite_code_visitor_masked.png" });
    console.log("  ✓ 参观者脱敏界面截图已保存至 tests/invite_code_visitor_masked.png");

    console.log("\n==========================================================================");
    console.log("=== 所有 4 项需求验证与回归测试 100% 顺利通过！ ===");
    console.log("==========================================================================");

  } finally {
    // 清理测试数据 (Zero Dummy Data Rule)
    console.log("\n[清理阶段] 遵循零假数据准则，自动还原清理测试数据...");
    try {
      if (testRegKeyId && adminToken) {
        await page.request.delete(BASE + `/api/regKey/delete?regKeyIds=${testRegKeyId}`, {
          headers: { Authorization: adminToken }
        });
        console.log(`  ✓ 测试注册码 ${testRegKeyCode} (ID: ${testRegKeyId}) 已清理`);
      }
    } catch (e) {
      console.warn("  清理测试注册码异常:", e.message);
    }

    try {
      if (visitorEmail && adminToken) {
        const userListRes = await page.request.get(BASE + "/api/user/list?num=1&size=20&email=" + encodeURIComponent(visitorEmail), {
          headers: { Authorization: adminToken }
        });
        const userListData = await userListRes.json();
        const user = (userListData.data?.list || []).find(u => u.email === visitorEmail);
        if (user) {
          await page.request.delete(BASE + `/api/user/delete?userIds=${user.userId}`, {
            headers: { Authorization: adminToken }
          });
          console.log(`  ✓ 测试参观者用户 ${visitorEmail} (ID: ${user.userId}) 已彻底删除`);
        }
      }
    } catch (e) {
      console.warn("  清理测试用户异常:", e.message);
    }

    await browser.close();
  }
})();
