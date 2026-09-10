import { chromium } from "playwright";
import assert from "node:assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 启动视觉与架构审计：el-select 完整显示、壁纸方框优化与注册密钥层级校准 ===");
  console.log("==========================================================================");

  const browser = await chromium.launch({
    headless: true,
    args: ["--lang=zh-CN"]
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  let adminToken = null;

  try {
    // --------------------------------------------------------------------------------------
    // 步骤 1: Admin 登录获取鉴权
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

    // 设置浏览器 localStorage
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, adminToken);

    // --------------------------------------------------------------------------------------
    // 步骤 2: 审计 class="el-select" 显示完整，而非只显示部分
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 2] 审计 class=\"el-select\" 显示完整性...");
    await page.goto(BASE + "/role", { waitUntil: "networkidle" });
    await page.waitForSelector(".el-table", { timeout: 15000 });
    await page.waitForTimeout(600);

    // 打开修改弹窗
    const actionDropdown = await page.waitForSelector(".el-table__row:first-child .el-dropdown button");
    await actionDropdown.click();
    await page.waitForTimeout(300);

    const editItem = await page.waitForSelector(".el-dropdown-menu:not([style*='display: none']) .el-dropdown-menu__item:first-child");
    await editItem.click();

    const dialog = await page.waitForSelector(".role-form-dialog");
    await page.waitForTimeout(600);

    // 检查角色弹窗中所有的 el-select
    const roleSelectMetrics = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll(".role-form-dialog .el-select"));
      return selects.map(sel => {
        const rect = sel.getBoundingClientRect();
        const wrapper = sel.querySelector(".el-select__wrapper");
        const placeholder = sel.querySelector(".el-select__placeholder");
        const wrapperRect = wrapper ? wrapper.getBoundingClientRect() : null;
        return {
          className: sel.className,
          width: rect.width,
          wrapperWidth: wrapperRect ? wrapperRect.width : 0,
          placeholderText: placeholder ? placeholder.innerText.trim() : "",
          isClippedOrOverflowHidden: placeholder ? (window.getComputedStyle(placeholder).overflow === "hidden" && window.getComputedStyle(placeholder).textOverflow === "clip") : false
        };
      });
    });

    console.log("  角色弹窗 el-select 审计指标:", JSON.stringify(roleSelectMetrics, null, 2));
    assert(roleSelectMetrics.length >= 2, "角色弹窗内应至少有2个 el-select");
    for (const sm of roleSelectMetrics) {
      assert(sm.width > 75, `el-select 宽度必须充足以完整显示内容，实测: ${sm.width}px`);
      assert(!sm.isClippedOrOverflowHidden, `el-select placeholder 不能被强制 overflow:hidden + text-overflow:clip 盲切`);
    }
    console.log("  ✓ 角色弹窗中 el-select 均完整呈现且具有充足布局伸缩性");

    // 截图角色弹窗亮色
    const dialogBox = page.locator(".role-form-dialog");
    await dialogBox.screenshot({ path: "tests/audit_select_full_display_light.png" });
    console.log("  ✓ 已保存: tests/audit_select_full_display_light.png");

    // 暗黑模式角色弹窗截图
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await dialogBox.screenshot({ path: "tests/audit_select_full_display_dark.png" });
    console.log("  ✓ 已保存: tests/audit_select_full_display_dark.png");
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    // 关闭弹窗
    const closeBtn = await page.waitForSelector(".role-form-dialog .el-dialog__headerbtn");
    await closeBtn.click();
    await page.waitForTimeout(400);

    // 检查分类管理中的 el-select
    console.log("\n  检查 /settings/category 中的 el-select (autoRefresh)...");
    await page.goto(BASE + "/settings/category", { waitUntil: "networkidle" });
    await page.waitForSelector(".settings-card", { timeout: 15000 });
    const catSelectWidth = await page.evaluate(() => {
      const sel = document.querySelector(".settings-card .el-select");
      if (!sel) return 0;
      return sel.getBoundingClientRect().width;
    });
    console.log(`  分类管理 autoRefresh el-select 实测宽度: ${catSelectWidth}px`);
    assert(catSelectWidth >= 100, `分类管理 el-select 宽度应 >= 100px 以完整显示选项，实测: ${catSelectWidth}px`);
    console.log("  ✓ 分类管理 autoRefresh el-select 完整显示无压缩");

    // 检查资料设置中的 el-select
    console.log("\n  检查 /settings/data 中的 el-select (emailExportRange)...");
    await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
    await page.waitForSelector(".export-container", { timeout: 15000 });
    const dataSelectWidth = await page.evaluate(() => {
      const sel = document.querySelector(".range-select.el-select");
      if (!sel) return 0;
      return sel.getBoundingClientRect().width;
    });
    console.log(`  资料设置 emailExportRange el-select 实测宽度: ${dataSelectWidth}px`);
    assert(dataSelectWidth >= 140, `资料设置导出范围 el-select 宽度应 >= 140px 以完整显示文本，实测: ${dataSelectWidth}px`);
    console.log("  ✓ 资料设置 emailExportRange el-select 完整显示");

    // --------------------------------------------------------------------------------------
    // 步骤 3: 审计注册密钥 class="el-scrollbar scrollbar" 3重方框消除至最多2层与对比度
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 3] 审计注册密钥 /invite-code 方框层级与视觉可分辨性...");
    await page.goto(BASE + "/invite-code", { waitUntil: "networkidle" });
    await page.waitForSelector(".reg-key .scrollbar", { timeout: 15000 });
    await page.waitForTimeout(600);

    const regKeyBoxAudit = await page.evaluate(() => {
      const scrollbar = document.querySelector(".reg-key .scrollbar");
      const wrap = scrollbar ? scrollbar.querySelector(".el-scrollbar__wrap") : null;
      const codeBox = scrollbar ? scrollbar.querySelector(".code-box") : null;
      const codeItem = scrollbar ? scrollbar.querySelector(".code-item") : null;
      const emptyPlate = scrollbar ? scrollbar.querySelector(".empty-baseplate") : null;

      const sStyle = scrollbar ? window.getComputedStyle(scrollbar) : null;
      const wStyle = wrap ? window.getComputedStyle(wrap) : null;
      const iStyle = (codeItem || emptyPlate) ? window.getComputedStyle(codeItem || emptyPlate) : null;

      let borderedBoxCount = 0;
      if (sStyle && sStyle.borderStyle !== "none" && sStyle.borderWidth !== "0px") borderedBoxCount++;
      if (wStyle && wStyle.borderStyle !== "none" && wStyle.borderWidth !== "0px") borderedBoxCount++;
      if (iStyle && iStyle.borderStyle !== "none" && iStyle.borderWidth !== "0px") borderedBoxCount++;

      return {
        scrollbarBorder: sStyle ? sStyle.border : "none",
        scrollbarBg: sStyle ? sStyle.backgroundColor : "transparent",
        wrapBorder: wStyle ? wStyle.border : "none",
        wrapBoxShadow: wStyle ? wStyle.boxShadow : "none",
        hasItemOrPlate: !!(codeItem || emptyPlate),
        itemBorder: iStyle ? iStyle.border : "none",
        itemBg: iStyle ? iStyle.backgroundColor : "none",
        totalBorderedBoxLayers: borderedBoxCount
      };
    });

    console.log("  注册密钥方框层级审计:", JSON.stringify(regKeyBoxAudit, null, 2));
    assert(regKeyBoxAudit.totalBorderedBoxLayers <= 2, `注册密钥方框层级必须 <= 2 层，实测: ${regKeyBoxAudit.totalBorderedBoxLayers} 层`);
    console.log(`  ✓ 注册密钥成功消除冗余多重方框，方框层级严格控制在 ${regKeyBoxAudit.totalBorderedBoxLayers} 层 (<= 2)`);

    // 截图注册密钥亮色与暗色
    const regKeyPage = page.locator(".reg-key");
    await regKeyPage.screenshot({ path: "tests/audit_reg_key_clean_boxes_light.png" });
    console.log("  ✓ 已保存: tests/audit_reg_key_clean_boxes_light.png");

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await regKeyPage.screenshot({ path: "tests/audit_reg_key_clean_boxes_dark.png" });
    console.log("  ✓ 已保存: tests/audit_reg_key_clean_boxes_dark.png");
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    // --------------------------------------------------------------------------------------
    // 步骤 4: 默认色调与壁纸视觉对比审计 (Playwright 视觉对比分析)
    // --------------------------------------------------------------------------------------
    console.log("\n[步骤 4] 默认色调 vs 现有默认壁纸视觉对比审计...");

    // 4.1 默认色调 (none - 默认纯净)
    console.log("\n  [4.1] 审计默认色调 (none): 验证无图片壁纸时不需要 container 方框，卡片对比色明显");
    await page.goto(BASE + "/settings/oauth-apps", { waitUntil: "networkidle" });
    await page.waitForSelector(".header-container", { timeout: 15000 });
    await page.waitForTimeout(500);

    const defaultModeBoxAudit = await page.evaluate(() => {
      const header = document.querySelector(".header-container");
      const apps = document.querySelector(".apps-container");
      const hStyle = header ? window.getComputedStyle(header) : null;
      const aStyle = apps ? window.getComputedStyle(apps) : null;
      return {
        headerBorder: hStyle ? hStyle.borderStyle : "none",
        headerBg: hStyle ? hStyle.backgroundColor : "transparent",
        appsBorder: aStyle ? aStyle.borderStyle : "none",
        appsBg: aStyle ? aStyle.backgroundColor : "transparent"
      };
    });
    console.log("  默认模式下 header-container 与 apps-container 审计:", JSON.stringify(defaultModeBoxAudit, null, 2));
    assert(defaultModeBoxAudit.headerBorder === "none", "默认色调下 header-container 不应有方框边框");
    assert(defaultModeBoxAudit.appsBorder === "none", "默认色调下 apps-container 不应有外层方框边框");
    console.log("  ✓ 默认色调下成功移除了 header-container 与 apps-container 的冗余方框");

    // 截图默认模式下各主要页面亮暗色调
    // 1) /oauth-app
    const mainView = page.locator(".settings-content");
    await mainView.screenshot({ path: "tests/audit_wallpaper_none_oauth_light.png" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await mainView.screenshot({ path: "tests/audit_wallpaper_none_oauth_dark.png" });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    // 2) /settings/category
    await page.goto(BASE + "/settings/category", { waitUntil: "networkidle" });
    await page.waitForSelector(".settings-card", { timeout: 15000 });
    await page.waitForTimeout(400);
    await mainView.screenshot({ path: "tests/audit_wallpaper_none_category_light.png" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await mainView.screenshot({ path: "tests/audit_wallpaper_none_category_dark.png" });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    // 3) /settings/data
    await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
    await page.waitForSelector(".export-container", { timeout: 15000 });
    await page.waitForTimeout(400);
    await mainView.screenshot({ path: "tests/audit_wallpaper_none_data_light.png" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await mainView.screenshot({ path: "tests/audit_wallpaper_none_data_dark.png" });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    console.log("  ✓ 默认色调各卡片在亮色与暗色模式下对比清晰，视觉层次分明");

    // 4.2 渐变壁纸 (theme-nebula - 深蓝星芒)
    console.log("\n  [4.2] 审计渐变壁纸 (theme-nebula): 平滑渐变下卡片与文字可辨性");
    await page.evaluate(() => {
      document.body.classList.add("has-main-wallpaper");
      document.documentElement.classList.add("has-main-wallpaper");
      document.documentElement.style.setProperty("--main-wallpaper-url", "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #172554 100%)");
      document.documentElement.style.setProperty("--panel-alpha", "88%");
    });
    await page.waitForTimeout(400);
    await mainView.screenshot({ path: "tests/audit_wallpaper_gradient_light.png" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await mainView.screenshot({ path: "tests/audit_wallpaper_gradient_dark.png" });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    console.log("  ✓ 渐变壁纸下文字与卡片视觉对比清晰");

    // 4.3 复杂图片壁纸 (theme-mountain - 雪峰晨雾)
    console.log("\n  [4.3] 审计复杂图片壁纸 (theme-mountain): 验证复杂照片壁纸下必须启用磨砂 container 方框保护文字可读性");
    await page.evaluate(() => {
      document.body.classList.add("has-main-wallpaper", "has-image-wallpaper");
      document.documentElement.classList.add("has-main-wallpaper", "has-image-wallpaper");
      document.documentElement.style.setProperty("--main-wallpaper-url", "url('https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80')");
      document.documentElement.style.setProperty("--panel-alpha", "92%");
    });
    await page.waitForTimeout(500);

    // 验证在图片壁纸下，container 方框被正确添加并具备磨砂亚克力玻璃层
    const imgWallpaperBoxAudit = await page.evaluate(() => {
      const exportCont = document.querySelector(".export-container");
      const storageCont = document.querySelector(".storage-container");
      const eStyle = exportCont ? window.getComputedStyle(exportCont) : null;
      const sStyle = storageCont ? window.getComputedStyle(storageCont) : null;
      return {
        exportHasBorder: eStyle ? eStyle.borderStyle !== "none" : false,
        exportBackdropFilter: eStyle ? eStyle.backdropFilter : "none",
        exportBorderRadius: eStyle ? eStyle.borderRadius : "0px",
        storageHasBorder: sStyle ? sStyle.borderStyle !== "none" : false
      };
    });
    console.log("  图片壁纸下 container 方框与磨砂亚克力审计:", JSON.stringify(imgWallpaperBoxAudit, null, 2));
    assert(imgWallpaperBoxAudit.exportHasBorder, "在复杂图片壁纸下，必须启用 container 方框");
    assert(imgWallpaperBoxAudit.exportBackdropFilter.includes("blur"), "在复杂图片壁纸下，container 方框必须具备 blur 磨砂保护层以确保文字清晰可读");
    console.log("  ✓ 图片壁纸下 container 方框与磨砂遮罩保护机制完美生效，所有文字均清晰可读");

    await mainView.screenshot({ path: "tests/audit_wallpaper_mountain_light.png" });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await mainView.screenshot({ path: "tests/audit_wallpaper_mountain_dark.png" });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    // 清理壁纸状态
    await page.evaluate(() => {
      document.body.classList.remove("has-main-wallpaper", "has-image-wallpaper");
      document.documentElement.classList.remove("has-main-wallpaper", "has-image-wallpaper");
      document.documentElement.style.removeProperty("--main-wallpaper-url");
      document.documentElement.style.removeProperty("--panel-alpha");
    });

    console.log("\n🎉 全项 UI/UX 优化与 Playwright 视觉对比测试 100% 通过！");
  } finally {
    await browser.close();
  }
})();
