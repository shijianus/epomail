import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：角色UI美化、配额单行转换、纯净标识、零滑块双列弹窗与书友联动 ===");
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
    console.log("\n[步骤 1] 登录 Admin 账号获取鉴权 Token...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "Admin 登录失败: " + JSON.stringify(loginData));
    const token = loginData.data?.token;
    console.log("  ✓ Admin 登录成功");

    // 2. 注入 Token 并导航到角色管理页
    console.log("\n[步骤 2] 访问角色管理页面 /role 验证表格与头部底板渲染...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);

    await page.goto(BASE + "/role", { waitUntil: "networkidle" });
    await page.waitForSelector(".perm-box", { timeout: 15000 });

    // 验证 .header-actions 底板与 .action-btn-pill
    const headerActions = await page.$(".header-actions");
    assert.ok(headerActions, "必须存在 .header-actions 顶栏容器");
    const pills = await page.$$(".action-btn-pill");
    assert.ok(pills.length >= 2, "必须渲染至少 2 个操作按钮药丸容器 (.action-btn-pill)");
    console.log(`  ✓ 顶栏底板操作药丸按钮正常渲染 (${pills.length} 个)`);

    // 3. 验证 quota-badge 单行与无限制
    console.log("\n[步骤 3] 验证配额标签 (.quota-badge) 单行、无折行与站长展示「无限制」...");
    const quotaBadges = await page.$$(".quota-badge");
    assert.ok(quotaBadges.length >= 6, "角色表格必须包含至少 6 个配额徽章");

    // 验证 Master 站长显示「无限制」，绝无 1024MB 冗余字样
    const masterQuota = await page.$eval(".el-table__body tr:has(.role-title:text-is('站长')) .quota-badge", el => el.textContent.trim());
    console.log(`  站长配额渲染结果: [${masterQuota}]`);
    assert.ok(masterQuota.includes("无限制"), "站长配额必须明确显示「无限制」");
    assert.ok(!masterQuota.includes("1024 MB"), "站长配额严禁出现「1024 MB」干扰字样");

    // 验证所有 quota-badge 高度与无折行 (严格单行)
    for (let i = 0; i < quotaBadges.length; i++) {
      const height = await quotaBadges[i].evaluate(el => el.offsetHeight);
      const isNowrap = await quotaBadges[i].evaluate(el => window.getComputedStyle(el).whiteSpace);
      assert.ok(height <= 26, `配额徽章第 ${i} 行高度必须为单行 (实际: ${height}px)`);
      assert.strictEqual(isNowrap, "nowrap", `配额徽章必须强制 white-space: nowrap`);
    }
    console.log("  ✓ 所有角色存储配额徽章均严格处于单行 (height <= 26px, nowrap)");

    // 4. 验证附件权限标签 (att-tag) 完整展示与文字精简
    console.log("\n[步骤 4] 验证附件权限标签 (.att-tag) 完整展示无截断与精炼文案...");
    const attTags = await page.$$(".att-tag");
    assert.ok(attTags.length >= 6, "必须存在至少 6 个附件权限标签");
    for (const tag of attTags) {
      const txt = await tag.textContent();
      assert.ok(txt.includes("开放附件") || txt.includes("仅纯文本"), `附件标签文案必须精炼为开放附件/仅纯文本，实际: ${txt}`);
      assert.ok(!txt.includes("(无附件)"), "附件标签严禁冗余「(无附件)」");
    }
    console.log("  ✓ 附件权限标签文案精炼无冗余括号，140px 列宽完整展示");

    // 5. 验证角色身份标签 (custom-role-badge) 纯净无限制说明
    console.log("\n[步骤 5] 验证角色身份标志 (.custom-role-badge) 纯净化：严禁出现纯文本/含附件/沙箱限制文案...");
    const roleBadges = await page.$$eval(".custom-role-badge", els => els.map(e => e.textContent.trim()));
    console.log("  渲染出的角色身份徽章:", roleBadges);
    assert.ok(roleBadges.includes("开源体验"), "参观者默认标签必须为「开源体验」");
    assert.ok(roleBadges.includes("基础成员"), "普通用户默认标签必须为「基础成员」");
    assert.ok(roleBadges.includes("认证书友"), "普通用户 LV.0 默认标签必须为「认证书友」");
    assert.ok(roleBadges.includes("活跃学者"), "普通用户 LV.1 默认标签必须为「活跃学者」");
    assert.ok(roleBadges.includes("协同管理"), "协管者默认标签必须为「协同管理」");
    assert.ok(roleBadges.includes("最高统领"), "站长默认标签必须为「最高统领」");

    // 确保没有把功能限制写在名字里
    for (const badge of roleBadges) {
      assert.ok(!badge.includes("纯文本"), `身份标志 [${badge}] 严禁出现「纯文本」功能限制说明`);
      assert.ok(!badge.includes("含附件"), `身份标志 [${badge}] 严禁出现「含附件」功能限制说明`);
      assert.ok(!badge.includes("沙箱"), `身份标志 [${badge}] 严禁出现「沙箱」限制说明`);
    }
    console.log("  ✓ 角色身份标志纯净化核验 100% 通过：零限制字样，专属尊荣身份");

    // 6. 验证新建/编辑角色弹窗 (role-form-dialog) 绝对无滑块与双列布局
    console.log("\n[步骤 6] 打开角色弹窗，验证 860px 宽度、双列布局与绝对无滑块 (Zero Scrollbar)...");
    const addBtn = await page.waitForSelector(".action-btn-pill:first-child", { timeout: 5000 });
    await addBtn.click();
    await page.waitForTimeout(500);

    const dialog = await page.waitForSelector(".role-form-dialog", { timeout: 5000 });
    const dialogWidth = await dialog.evaluate(el => el.offsetWidth);
    console.log(`  弹窗实际渲染宽度: ${dialogWidth}px (设计基准 min(860px, 95vw))`);
    assert.ok(dialogWidth >= 780, "弹窗宽度必须扩展至至少 780px 以上以容纳双列");

    // 验证左列与右列
    const leftCol = await page.$(".modal-col-left");
    const rightCol = await page.$(".modal-col-right");
    assert.ok(leftCol && rightCol, "角色弹窗必须采用左右双列物理栅格排布 (.modal-col-left, .modal-col-right)");

    // 验证自订标识与颜色选择器
    const tagInput = await page.$(".tag-picker-row input");
    const colorPicker = await page.$(".tag-picker-row .color-picker-box");
    assert.ok(tagInput, "必须包含自订标签输入框");
    assert.ok(colorPicker, "必须包含自订标签颜色选择器");
    console.log("  ✓ 自订标签文字与颜色选择器就绪");

    // 验证弹窗绝对无垂直滑块 (body scrollHeight <= clientHeight + 5)
    const bodyScrollCheck = await page.$eval(".role-form-dialog .el-dialog__body", el => {
      return {
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        hasScrollbar: el.scrollHeight > el.clientHeight + 5
      };
    });
    console.log("  弹窗主体尺寸审计:", bodyScrollCheck);
    assert.strictEqual(bodyScrollCheck.hasScrollbar, false, "弹窗主体 (.el-dialog__body) 严禁产生任何垂直滑块！");
    console.log("  ✓ 弹窗绝对无滑块核验 100% 通过！");

    // 截图保存
    await page.screenshot({ path: "tests/role_dialog_zero_scrollbar.png" });
    console.log("  ✓ 截图已保存至 tests/role_dialog_zero_scrollbar.png");

    // 关闭弹窗
    const closeBtn = await page.$(".role-form-dialog .el-dialog__headerbtn");
    await closeBtn.click();
    await page.waitForTimeout(300);

    // 7. 验证注册码页面 /invite-code 头部底板与药丸按钮
    console.log("\n[步骤 7] 访问注册码页面 /invite-code 验证底板与操作药丸按钮...");
    await page.goto(BASE + "/invite-code", { waitUntil: "networkidle" });
    await page.waitForSelector(".reg-key .header-actions", { timeout: 10000 });
    const regKeyPills = await page.$$(".reg-key .action-btn-pill");
    assert.ok(regKeyPills.length >= 3, "注册码页面必须使用 .action-btn-pill 封装操作图标");
    console.log(`  ✓ 注册码页面操作药丸按钮正常渲染 (${regKeyPills.length} 个)`);

    // 8. 验证用户中心与顶栏下拉菜单的博客等级联动
    console.log("\n[步骤 8] 验证顶栏头像下拉菜单中的博客书友等级联动项...");
    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    const avatar = await page.waitForSelector(".avatar-wrap", { timeout: 10000 });
    await avatar.click();
    await page.waitForTimeout(400);

    const dropdownBlogTier = await page.waitForSelector(".am-blog-tier", { timeout: 5000 });
    assert.ok(dropdownBlogTier, "头像下拉菜单必须包含 .am-blog-tier 博客等级指示与同步条目");
    const tierText = await dropdownBlogTier.textContent();
    console.log(`  下拉菜单博客等级渲染: [${tierText.trim()}]`);
    assert.ok(tierText.includes("博客书友"), "条目必须包含「博客书友」");

    // 9. 验证个人中心 /settings/profile 页面中博客等级与特权联动
    console.log("\n[步骤 9] 访问个人中心设置页 /settings/profile 验证博客书友分级联动区域...");
    await page.goto(BASE + "/settings/profile", { waitUntil: "networkidle" });
    await page.waitForSelector(".box", { timeout: 10000 });
    const settingsContent = await page.textContent(".box");
    assert.ok(settingsContent.includes("博客书友分级联动"), "个人设置页必须包含「博客书友分级联动」Section");
    assert.ok(settingsContent.includes("博客等级称号"), "必须包含「博客等级称号」项");
    assert.ok(settingsContent.includes("尊享邮局权益"), "必须包含「尊享邮局权益」项");
    assert.ok(settingsContent.includes("一键同步博客等级"), "必须包含「一键同步博客等级」按钮");
    console.log("  ✓ 个人设置页博客分级联动区域与同步操作完整呈现");

    // 10. 验证用户详情公开页 (/:username) 中的博客联动卡片
    console.log("\n[步骤 10] 访问个人用户详情页 /admin 验证书友分级特权联动卡片...");
    await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
    await page.waitForSelector(".profile-container", { timeout: 10000 });
    const blogCard = await page.waitForSelector(".blog-linkage-card", { timeout: 5000 });
    assert.ok(blogCard, "个人用户详情页必须包含 .blog-linkage-card");
    const blogCardText = await blogCard.textContent();
    assert.ok(blogCardText.includes("书友分级特权联动"), "必须包含「书友分级特权联动」");
    assert.ok(blogCardText.includes("一键同步博客等级"), "必须包含「一键同步博客等级」");
    console.log("  ✓ 个人用户详情页书友分级特权联动卡片完整渲染");

    // 截图保存个人详情页
    await page.screenshot({ path: "tests/profile_blog_linkage_card.png" });
    console.log("  ✓ 个人详情页截图已保存至 tests/profile_blog_linkage_card.png");

    console.log("\n==========================================================================");
    console.log("=== 所有 UI 视觉美化、配额单行、纯净标识、零滑块弹窗与书友联动全部 100% 通过！ ===");
    console.log("==========================================================================");

  } finally {
    await browser.close();
  }
})();
