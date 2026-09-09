import { chromium } from "playwright";
import assert from "node:assert";

(async () => {
  console.log("=== 启动「常规默认设置与用户绑定、新账户全量默认、多账户相互隔离」E2E 审计 ===");
  const browser = await chromium.launch({ headless: true, args: ["--lang=zh-CN"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  let adminToken = null;
  const timestamp = Date.now();
  const userAEmail = `user_a_${timestamp}@epomail.bond`;
  const userAPassword = "Password123!";
  let userAId = null;
  let userAToken = null;

  const userBEmail = `user_b_${timestamp}@epomail.bond`;
  const userBPassword = "Password123!";
  let userBId = null;
  let userBToken = null;

  try {
    // --------------------------------------------------------------------------------------
    // 步骤 1: Admin 登录与创建测试用户 A 和 用户 B
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 1] 登录 Admin 并创建测试用户 A 与用户 B...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, "Admin 登录失败: " + JSON.stringify(loginJson));
    adminToken = typeof loginJson.data === "string" ? loginJson.data : loginJson.data?.token;
    console.log("  ✓ Admin 登录成功");

    // 获取普通角色 ID
    const rolesRes = await page.request.get(BASE + "/api/role/list", {
      headers: { Authorization: adminToken }
    });
    const rolesJson = await rolesRes.json();
    const roles = rolesJson.data || [];
    const normalRole = roles.find(r => r.roleCode === "user_base" || r.name === "普通用户" || r.key === "user_base") || roles[0];
    assert.ok(normalRole, "必须存在角色");

    // 创建测试用户 A
    const addARes = await page.request.post(BASE + "/api/user/add", {
      data: { email: userAEmail, password: userAPassword, name: "User_A_Auditor", type: normalRole.roleId },
      headers: { Authorization: adminToken, "Content-Type": "application/json" }
    });
    const addAJson = await addARes.json();
    assert.strictEqual(addAJson.code, 200, "创建用户 A 失败: " + JSON.stringify(addAJson));
    console.log(`  ✓ 创建测试用户 A 成功: ${userAEmail}`);

    // 创建测试用户 B
    const addBRes = await page.request.post(BASE + "/api/user/add", {
      data: { email: userBEmail, password: userBPassword, name: "User_B_Auditor", type: normalRole.roleId },
      headers: { Authorization: adminToken, "Content-Type": "application/json" }
    });
    const addBJson = await addBRes.json();
    assert.strictEqual(addBJson.code, 200, "创建用户 B 失败: " + JSON.stringify(addBJson));
    console.log(`  ✓ 创建测试用户 B 成功: ${userBEmail}`);

    // 获取各用户 ID
    const listRes = await page.request.get(BASE + "/api/user/list?num=1&size=50", {
      headers: { Authorization: adminToken }
    });
    const listJson = await listRes.json();
    const users = listJson.data?.list || [];
    const foundA = users.find(u => u.email === userAEmail);
    const foundB = users.find(u => u.email === userBEmail);
    if (foundA) userAId = foundA.userId;
    if (foundB) userBId = foundB.userId;
    console.log(`  ✓ 用户 ID 解析: User A ID=${userAId}, User B ID=${userBId}`);

    // --------------------------------------------------------------------------------------
    // 步骤 2: 登录新创建的用户 A，审计「常规」页面初始所有选项是否 100% 保持默认
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 2] 审计新建用户 A 的「常规」页面各项初始默认值...");
    const loginARes = await page.request.post(BASE + "/api/login", {
      data: { email: userAEmail, password: userAPassword },
      headers: { "Content-Type": "application/json" }
    });
    const loginAJson = await loginARes.json();
    assert.strictEqual(loginAJson.code, 200, "用户 A 登录失败: " + JSON.stringify(loginAJson));
    userAToken = typeof loginAJson.data === "string" ? loginAJson.data : loginAJson.data?.token;

    // 访问常规设置页面
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, userAToken);
    await page.goto(BASE + "/settings/general", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // 断言 2.1: 个人简介默认未设置
    const bioText = await page.$eval(".bio-preview-box .bio-display", el => el.textContent.trim());
    console.log(`  ✓ 个人简介展示: 「${bioText}」`);
    assert.ok(bioText.includes("未设置") || bioText === "", "新建账户个人简介必须为未设置");

    // 断言 2.2: 外观色调默认保持「跟随系统」或默认模式
    const themeAutoActive = await page.$eval(".theme-options-group", el => {
      const cards = Array.from(el.querySelectorAll(".theme-rect-card"));
      const activeCard = cards.find(c => c.classList.contains("active"));
      return activeCard ? activeCard.textContent.trim() : null;
    });
    console.log(`  ✓ 外观色调当前选中项: 「${themeAutoActive}」`);
    assert.ok(themeAutoActive && (themeAutoActive.includes("跟随系统") || themeAutoActive.includes("暗色调")), "外观色调应为默认选项");

    // 断言 2.3: 主题壁纸默认必须为「默认纯净」(none)
    const activeWallpaper = await page.$eval(".wallpaper-presets-grid", el => {
      const cards = Array.from(el.querySelectorAll(".wallpaper-card"));
      const activeCard = cards.find(c => c.classList.contains("active"));
      return activeCard ? activeCard.querySelector(".wallpaper-name")?.textContent.trim() : null;
    });
    console.log(`  ✓ 主题壁纸当前选中项: 「${activeWallpaper}」`);
    assert.strictEqual(activeWallpaper, "默认纯净", "【核心断言】新建账户主题壁纸必须默认为「默认纯净」！");

    // 断言 2.4: 个人背景封面默认必须为「默认极光」
    const activeCover = await page.$eval(".cover-presets-grid", el => {
      const cards = Array.from(el.querySelectorAll(".wallpaper-card"));
      const activeCard = cards.find(c => c.classList.contains("active"));
      return activeCard ? activeCard.querySelector(".wallpaper-name")?.textContent.trim() : null;
    });
    console.log(`  ✓ 个人背景封面当前选中项: 「${activeCover}」`);
    assert.strictEqual(activeCover, "默认极光", "【核心断言】新建账户个人背景封面必须默认为「默认极光」！");

    // 断言 2.5: 视图密度默认必须为「默认 (54px)」
    const activeDensity = await page.$eval(".density-group", el => {
      const cards = Array.from(el.querySelectorAll(".density-card"));
      const activeCard = cards.find(c => c.classList.contains("active"));
      return activeCard ? activeCard.querySelector(".d-name")?.textContent.trim() : null;
    });
    console.log(`  ✓ 视图密度当前选中项: 「${activeDensity}」`);
    assert.strictEqual(activeDensity, "默认", "【核心断言】新建账户视图密度必须默认为「默认」！");

    // 断言 2.6: 收件箱类型默认必须为「默认收件箱」
    const activeInboxType = await page.$eval(".inbox-type-wrapper", el => {
      const checkedRadio = el.querySelector(".el-radio.is-checked");
      return checkedRadio ? checkedRadio.querySelector(".type-name")?.textContent.trim() : null;
    });
    console.log(`  ✓ 收件箱类型当前选中项: 「${activeInboxType}」`);
    assert.strictEqual(activeInboxType, "默认收件箱", "【核心断言】新建账户收件箱类型必须默认为「默认收件箱」！");

    // 断言 2.7: 阅读窗格默认必须为「无拆分」
    const activeReadingPane = await page.$eval(".pane-options-group", el => {
      const cards = Array.from(el.querySelectorAll(".pane-card"));
      const activeCard = cards.find(c => c.classList.contains("active"));
      return activeCard ? activeCard.querySelector(".p-name")?.textContent.trim() : null;
    });
    console.log(`  ✓ 阅读窗格当前选中项: 「${activeReadingPane}」`);
    assert.strictEqual(activeReadingPane, "无拆分", "【核心修复】新建账户阅读窗格必须默认为「无拆分」，绝非收件箱右侧！");

    await page.screenshot({ path: "tests/audit_new_user_default_general_settings.png" });
    console.log("  ✓ 新建用户默认常规截图已留存: tests/audit_new_user_default_general_settings.png");

    // --------------------------------------------------------------------------------------
    // 步骤 3: 用户 A 自定义各项常规设置并保存
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 3] 用户 A 自定义常规设置（视图密度设为紧凑、阅读窗格设为右侧、壁纸设为深蓝星芒、色调设为暗色）...");

    // 3.1 切换阅读窗格为「收件箱右侧」
    const rightPaneCard = page.locator(".pane-card:has-text('收件箱右侧')");
    await rightPaneCard.click();
    await page.waitForTimeout(600);

    // 3.2 切换视图密度为「紧凑」
    const compactDensityCard = page.locator(".density-card:has-text('紧凑')");
    await compactDensityCard.click();
    await page.waitForTimeout(600);

    // 3.3 切换主题壁纸为「深蓝星芒」
    const nebulaWallpaperCard = page.locator(".wallpaper-presets-grid .wallpaper-card:has-text('深蓝星芒')");
    await nebulaWallpaperCard.click();
    await page.waitForTimeout(600);

    // 3.4 切换外观色调为「暗色调」
    const darkThemeCard = page.locator(".theme-rect-card:has-text('暗色调')");
    await darkThemeCard.click();
    await page.waitForTimeout(600);

    await page.screenshot({ path: "tests/audit_user_a_customized_settings.png" });
    console.log("  ✓ 用户 A 自定义后截图留存: tests/audit_user_a_customized_settings.png");

    // --------------------------------------------------------------------------------------
    // 步骤 4: 登录用户 B（新账户），断言用户 B 完全不受用户 A 的自定义影响，依然是纯净默认！
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 4] 同浏览器中切换至新建用户 B，核验是否严格保持独立默认（杜绝被用户 A 污染）...");
    const loginBRes = await page.request.post(BASE + "/api/login", {
      data: { email: userBEmail, password: userBPassword },
      headers: { "Content-Type": "application/json" }
    });
    const loginBJson = await loginBRes.json();
    assert.strictEqual(loginBJson.code, 200, "用户 B 登录失败: " + JSON.stringify(loginBJson));
    userBToken = typeof loginBJson.data === "string" ? loginBJson.data : loginBJson.data?.token;

    // 模拟同一浏览器中登出用户 A 并登录用户 B
    await page.evaluate((t) => {
      localStorage.removeItem("token");
      localStorage.removeItem("ui");
      localStorage.setItem("token", t);
    }, userBToken);

    await page.goto(BASE + "/settings/general", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // 断言用户 B 的阅读窗格依然是「无拆分」
    const bReadingPane = await page.$eval(".pane-options-group", el => {
      const cards = Array.from(el.querySelectorAll(".pane-card"));
      const activeCard = cards.find(c => c.classList.contains("active"));
      return activeCard ? activeCard.querySelector(".p-name")?.textContent.trim() : null;
    });
    console.log(`  ✓ 用户 B 阅读窗格: 「${bReadingPane}」`);
    assert.strictEqual(bReadingPane, "无拆分", "【多用户隔离断言】用户 B 必须是默认「无拆分」，绝不能继承用户 A 的「收件箱右侧」！");

    // 断言用户 B 的视图密度依然是「默认」
    const bDensity = await page.$eval(".density-group", el => {
      const cards = Array.from(el.querySelectorAll(".density-card"));
      const activeCard = cards.find(c => c.classList.contains("active"));
      return activeCard ? activeCard.querySelector(".d-name")?.textContent.trim() : null;
    });
    console.log(`  ✓ 用户 B 视图密度: 「${bDensity}」`);
    assert.strictEqual(bDensity, "默认", "【多用户隔离断言】用户 B 必须是默认「默认」，绝不能继承用户 A 的「紧凑」！");

    // 断言用户 B 的壁纸依然是「默认纯净」
    const bWallpaper = await page.$eval(".wallpaper-presets-grid", el => {
      const cards = Array.from(el.querySelectorAll(".wallpaper-card"));
      const activeCard = cards.find(c => c.classList.contains("active"));
      return activeCard ? activeCard.querySelector(".wallpaper-name")?.textContent.trim() : null;
    });
    console.log(`  ✓ 用户 B 主题壁纸: 「${bWallpaper}」`);
    assert.strictEqual(bWallpaper, "默认纯净", "【多用户隔离断言】用户 B 必须是「默认纯净」，绝不能继承用户 A 的「深蓝星芒」！");

    await page.screenshot({ path: "tests/audit_user_b_isolated_defaults.png" });
    console.log("  ✓ 用户 B 独立默认截图留存: tests/audit_user_b_isolated_defaults.png");

    // --------------------------------------------------------------------------------------
    // 步骤 5: 重新切回用户 A，验证用户 A 的自定义配置完好如初（真正的用户绑定持久化）
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 5] 重新切回用户 A，验证用户 A 绑定的个性化设置依然生效...");
    await page.evaluate((t) => {
      localStorage.removeItem("token");
      localStorage.removeItem("ui");
      localStorage.setItem("token", t);
    }, userAToken);

    await page.goto(BASE + "/settings/general", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const aRestoredPane = await page.$eval(".pane-options-group", el => {
      const cards = Array.from(el.querySelectorAll(".pane-card"));
      const activeCard = cards.find(c => c.classList.contains("active"));
      return activeCard ? activeCard.querySelector(".p-name")?.textContent.trim() : null;
    });
    console.log(`  ✓ 用户 A 恢复后阅读窗格: 「${aRestoredPane}」`);
    assert.strictEqual(aRestoredPane, "收件箱右侧", "用户 A 之前设置的「收件箱右侧」必须完好保留");

    const aRestoredDensity = await page.$eval(".density-group", el => {
      const cards = Array.from(el.querySelectorAll(".density-card"));
      const activeCard = cards.find(c => c.classList.contains("active"));
      return activeCard ? activeCard.querySelector(".d-name")?.textContent.trim() : null;
    });
    console.log(`  ✓ 用户 A 恢复后视图密度: 「${aRestoredDensity}」`);
    assert.strictEqual(aRestoredDensity, "紧凑", "用户 A 之前设置的「紧凑」必须完好保留");

    const aRestoredWallpaper = await page.$eval(".wallpaper-presets-grid", el => {
      const cards = Array.from(el.querySelectorAll(".wallpaper-card"));
      const activeCard = cards.find(c => c.classList.contains("active"));
      return activeCard ? activeCard.querySelector(".wallpaper-name")?.textContent.trim() : null;
    });
    console.log(`  ✓ 用户 A 恢复后主题壁纸: 「${aRestoredWallpaper}」`);
    assert.strictEqual(aRestoredWallpaper, "深蓝星芒", "用户 A 之前设置的「深蓝星芒」壁纸必须完好保留");

    console.log("\n==========================================================================");
    console.log("🎉 常规默认设置与用户绑定、新账户全量默认、多账户相互隔离验证 100% 通过！");
    console.log("==========================================================================");

  } finally {
    // --------------------------------------------------------------------------------------
    // 步骤 6: 测试数据自动清理（零假数据残留准则）
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 6] 清理临时测试账号，严格遵守零残留准则...");
    if (adminToken) {
      try {
        const checkListRes = await page.request.get(BASE + "/api/user/list?num=1&size=100", {
          headers: { Authorization: adminToken }
        });
        const checkListJson = await checkListRes.json();
        const list = checkListJson.data?.list || [];
        for (const u of list) {
          if (u.email === userAEmail || u.email === userBEmail || u.email.includes("user_a_") || u.email.includes("user_b_")) {
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
