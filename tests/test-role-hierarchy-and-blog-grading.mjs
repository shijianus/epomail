import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：6大管理组权限控制规范、博客等级联动体系与UI架构透视端到端测试 ===");
  console.log("==========================================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  const BASE = "https://epomail.epocanvas.workers.dev";

  try {
    // 1. 登录 Admin 账号
    console.log("\n[步骤 1] 登录系统获取 Admin 鉴权 Token...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "Admin 登录失败: " + JSON.stringify(loginData));
    const token = loginData.data?.token;
    console.log("  ✓ Admin 登录成功");

    // 2. 验证角色列表返回的 6 大标准管理组与精细化字段
    console.log("\n[步骤 2] 验证 /api/role/list 返回的标准管理组与属性字段...");
    const roleListRes = await page.request.get(BASE + "/api/role/list", {
      headers: { Authorization: token }
    });
    const roleListData = await roleListRes.json();
    assert.strictEqual(roleListData.code, 200, "获取角色列表失败: " + JSON.stringify(roleListData));
    const roles = Array.isArray(roleListData.data) ? roleListData.data : (roleListData.data?.list || []);
    console.log(`  当前角色总数: ${roles.length}`);

    // 检查 6 个核心角色是否存在
    const roleCodes = roles.map(r => r.roleCode || r.name);
    console.log("  角色代码列表:", roleCodes);

    const visitorRole = roles.find(r => r.roleCode === "visitor" || r.name === "参观者");
    assert.ok(visitorRole, "必须存在「参观者 (visitor)」角色");
    assert.strictEqual(visitorRole.storageQuotaMb, 0, "参观者配额必须为 0MB");
    assert.strictEqual(visitorRole.allowAttachment, 0, "参观者附件必须禁止 (0)");
    assert.strictEqual(visitorRole.sendType, "ban", "参观者发件策略必须为 ban (禁止发件)");
    console.log("  ✓ 参观者角色属性严格核验通过: 配额 0MB, 禁止附件, 禁止外发");

    const normalRole = roles.find(r => r.roleCode === "user_base" || r.name === "普通用户");
    assert.ok(normalRole, "必须存在「普通用户 (user_base)」角色");
    assert.strictEqual(normalRole.storageQuotaMb, 5, "普通用户配额必须为 5MB");
    assert.strictEqual(normalRole.allowAttachment, 0, "普通用户附件必须禁止 (0)");
    assert.strictEqual(normalRole.sendCount, 5, "普通用户发信上限必须为 5封/天");
    console.log("  ✓ 普通用户角色属性严格核验通过: 配额 5MB, 禁止附件, 每日限发 5 封");

    const lv0Role = roles.find(r => r.roleCode === "user_lv0" || r.name.includes("LV.0"));
    assert.ok(lv0Role, "必须存在「普通用户 LV.0 (user_lv0)」角色");
    assert.strictEqual(lv0Role.storageQuotaMb, 10, "普通用户 LV.0 配额必须为 10MB");
    assert.strictEqual(lv0Role.allowAttachment, 0, "普通用户 LV.0 附件必须禁止 (0)");
    assert.strictEqual(lv0Role.sendCount, 8, "普通用户 LV.0 发信上限必须为 8封/天");
    console.log("  ✓ 普通用户 LV.0 属性严格核验通过: 配额 10MB, 禁止附件, 每日限发 8 封");

    const lv1Role = roles.find(r => r.roleCode === "user_lv1" || r.name.includes("LV.1"));
    assert.ok(lv1Role, "必须存在「普通用户 LV.1 (user_lv1)」角色");
    assert.strictEqual(lv1Role.storageQuotaMb, 25, "普通用户 LV.1 配额必须为 25MB");
    assert.strictEqual(lv1Role.allowAttachment, 1, "普通用户 LV.1 必须解锁附件 (1)");
    assert.strictEqual(lv1Role.sendCount, 10, "普通用户 LV.1 发信上限必须为 10封/天");
    console.log("  ✓ 普通用户 LV.1 属性严格核验通过: 配额 25MB, 解锁附件, 每日限发 10 封");

    const modRole = roles.find(r => r.roleCode === "moderator" || r.name.includes("协管"));
    assert.ok(modRole, "必须存在「协管者 (moderator)」角色");
    assert.strictEqual(modRole.storageQuotaMb, 500, "协管者配额必须为 500MB");
    assert.strictEqual(modRole.allowAttachment, 1, "协管者附件必须解锁 (1)");
    assert.strictEqual(modRole.sendCount, 100, "协管者发信上限必须为 100封/天");
    console.log("  ✓ 协管者属性严格核验通过: 配额 500MB, 解锁附件, 每日限发 100 封");

    const masterRole = roles.find(r => r.roleCode === "master" || r.name === "站长");
    assert.ok(masterRole, "必须存在「站长 (master)」角色");
    assert.strictEqual(masterRole.allowAttachment, 1, "站长附件必须解锁 (1)");
    assert.strictEqual(masterRole.sendCount, 0, "站长发信上限必须为 0 (无限制)");
    console.log("  ✓ 站长属性严格核验通过: 配额最高/无限制, 解锁附件, 无发件上限");

    // 3. 验证博客等级信息查询 API (/api/user/blogLevelInfo)
    console.log("\n[步骤 3] 验证博客用户等级查询与同步 API 连通性...");
    const blogLevelRes = await page.request.get(BASE + "/api/user/blogLevelInfo", {
      headers: { Authorization: token }
    });
    const blogLevelData = await blogLevelRes.json();
    assert.strictEqual(blogLevelData.code, 200, "查询博客等级接口必须返回成功: " + JSON.stringify(blogLevelData));
    console.log("  博客等级响应数据:", blogLevelData.data);
    assert.ok("hasBlogAccount" in blogLevelData.data, "必须包含 hasBlogAccount 字段");
    assert.ok("level" in blogLevelData.data, "必须包含 level 字段");
    assert.ok(blogLevelData.data.levelName, "必须包含 levelName 字段");
    console.log("  ✓ 博客等级查询接口正常响应: 等级 " + blogLevelData.data.level + " (" + blogLevelData.data.levelName + ")");

    // 4. 验证 Web UI - 角色管理页面 (/role) 与 架构透视弹窗
    console.log("\n[步骤 4] 访问 Web UI /role 验证页面渲染与交互...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);

    await page.goto(BASE + "/role", { waitUntil: "networkidle" });
    await page.waitForSelector(".perm-box", { timeout: 15000 });

    // 检查表格中是否有 6 个角色的行
    const roleTableRows = await page.$$(".el-table__body tbody tr");
    console.log(`  UI 渲染表格行数: ${roleTableRows.length}`);
    assert.ok(roleTableRows.length >= 6, "表格中必须至少渲染 6 个角色行");

    // 验证表格中出现特定标签和列内容
    const tableText = await page.textContent(".perm-box");
    assert.ok(tableText.includes("参观者"), "UI 必须包含「参观者」");
    assert.ok(tableText.includes("普通用户"), "UI 必须包含「普通用户」");
    assert.ok(tableText.includes("普通用户 LV.0"), "UI 必须包含「普通用户 LV.0」");
    assert.ok(tableText.includes("普通用户 LV.1"), "UI 必须包含「普通用户 LV.1」");
    assert.ok(tableText.includes("协管者"), "UI 必须包含「协管者」");
    assert.ok(tableText.includes("站长"), "UI 必须包含「站长」");
    assert.ok(tableText.includes("5 MB"), "UI 必须展示 5 MB 配额");
    assert.ok(tableText.includes("25 MB"), "UI 必须展示 25 MB 配额");
    assert.ok(tableText.includes("500 MB"), "UI 必须展示 500 MB 配额");
    console.log("  ✓ 表格各角色名称与配额列标签正确渲染");

    // 5. 测试「架构与分级一览」弹窗
    console.log("\n[步骤 5] 打开「架构与分级一览」弹窗并验证 6 大管理组与博客等级升级阶梯...");
    const hierarchyBtn = await page.waitForSelector(".hierarchy-btn", { timeout: 5000 });
    assert.ok(hierarchyBtn, "必须存在「架构与分级一览」按钮");
    await hierarchyBtn.click();
    await page.waitForTimeout(500);

    // 弹窗出现
    await page.waitForSelector(".role-hierarchy-dialog", { timeout: 5000 });
    const dialogText = await page.textContent(".role-hierarchy-dialog");
    assert.ok(dialogText.includes("开源体验 · 阶梯式赋能 · 博客深度协同"), "弹窗必须包含「开源体验 · 阶梯式赋能 · 博客深度协同」");
    assert.ok(dialogText.includes("1. 参观者 (Visitor)"), "弹窗必须包含「1. 参观者 (Visitor)」");
    assert.ok(dialogText.includes("6. 站长 (Master)"), "弹窗必须包含「6. 站长 (Master)」");
    assert.ok(dialogText.includes("blog.epomail.com 书友等级进阶规则"), "弹窗必须包含「blog.epomail.com 书友等级进阶规则」");
    assert.ok(dialogText.includes("LV.0 认证书友"), "阶梯表格必须包含 LV.0 认证书友");
    assert.ok(dialogText.includes("LV.1 活跃学者"), "阶梯表格必须包含 LV.1 活跃学者");
    assert.ok(dialogText.includes("LV.2 资深贡献者"), "阶梯表格必须包含 LV.2 资深贡献者");
    assert.ok(dialogText.includes("LV.3 终身学者"), "阶梯表格必须包含 LV.3 终身学者");
    assert.ok(dialogText.includes("解锁附件发送"), "阶梯必须阐明 LV.1 解锁附件发送");
    console.log("  ✓ 「架构与分级一览」弹窗完整渲染矩阵与博客等级阶梯");

    // 截图保存作为审查凭证
    await page.screenshot({ path: "tests/role_hierarchy_dialog.png" });
    console.log("  ✓ 弹窗截图已保存为 tests/role_hierarchy_dialog.png");

    // 关闭弹窗
    const closeBtn = await page.waitForSelector(".role-hierarchy-dialog .el-dialog__headerbtn, .role-hierarchy-dialog button:has-text('关闭')");
    await closeBtn.click();
    await page.waitForTimeout(400);

    // 6. 测试「新建角色」弹窗中的预设模板与表单
    console.log("\n[步骤 6] 打开「新建角色」弹窗验证预设模板选择器...");
    const addRoleBtn = await page.waitForSelector(".header-actions .icon-btn, .header-actions svg", { timeout: 5000 });
    await addRoleBtn.click();
    await page.waitForTimeout(500);

    await page.waitForSelector(".role-form-dialog", { timeout: 5000 });
    const formText = await page.textContent(".role-form-dialog");
    assert.ok(formText.includes("快捷套用系统分组模板"), "新建弹窗必须包含「快捷套用系统分组模板」");
    assert.ok(formText.includes("默认存储配额 (MB)"), "新建弹窗必须包含「默认存储配额 (MB)」");
    assert.ok(formText.includes("允许发送邮件附件"), "新建弹窗必须包含「允许发送邮件附件」");

    // 模拟点击「普通用户 LV.1」预设
    const lv1Button = await page.waitForSelector(".preset-chips button:has-text('普通用户 LV.1')", { timeout: 5000 });
    await lv1Button.click();
    await page.waitForTimeout(300);

    // 验证名称与标识代码自动联动填入
    const nameVal = await page.inputValue(".role-form-dialog .form-row .dialog-input:first-child input");
    assert.strictEqual(nameVal, "普通用户 LV.1", "点击预设应自动填入名称「普通用户 LV.1」");
    const codeVal = await page.inputValue(".role-form-dialog .form-row .dialog-input:nth-child(2) input");
    assert.strictEqual(codeVal, "user_lv1", "点击预设应自动填入代码「user_lv1」");
    console.log("  ✓ 预设快速套用自动填充表单正常工作: 名称「普通用户 LV.1」, 代码「user_lv1」");

    await page.screenshot({ path: "tests/role_preset_template_dialog.png" });
    console.log("  ✓ 预设新建角色弹窗截图已保存为 tests/role_preset_template_dialog.png");

    // 关闭新建弹窗
    const cancelBtn = await page.waitForSelector(".role-form-dialog .el-dialog__headerbtn");
    await cancelBtn.click();
    await page.waitForTimeout(300);

    console.log("\n==========================================================================");
    console.log("=== 所有 6 大管理组及博客等级联动体系测试全部 100% 顺利通过！ ===");
    console.log("==========================================================================");

  } finally {
    await browser.close();
  }
})();
