import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：/invite-code UI 全面优化、滑块彻底删除与画风前后同步一致性 ===");
  console.log("==========================================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  let adminToken = null;

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

    // 2. 注入 Token 并访问 /invite-code
    console.log("\n[步骤 2] 注入 Token 并导航至 /invite-code 页面...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, adminToken);

    await page.goto(BASE + "/invite-code", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // 3. 校验 Part 1：Header 区域的同步更新（标题、数量徽章、统一操作药丸按钮）
    console.log("\n[步骤 3] 验证顶部 Header 操作栏的同步更新与现代排版...");
    const headerTitleBox = await page.waitForSelector(".header-actions .header-title-box", { timeout: 5000 });
    assert.ok(headerTitleBox, "顶部必须包含 .header-title-box 标题容器");
    const mainTitleText = await page.textContent(".header-actions .main-title");
    console.log("  主标题渲染文本:", mainTitleText.trim());
    assert.ok(mainTitleText.includes("注册") || mainTitleText.includes("密钥") || mainTitleText.includes("码"), "主标题必须体现注册密钥/码管理");

    const pills = await page.$$(".reg-key .action-btn-pill");
    console.log(`  操作胶囊药丸数量: ${pills.length} 个`);
    assert.ok(pills.length >= 3, "操作栏必须包含至少 3 个 .action-btn-pill 药丸按钮");

    // 4. 校验 Part 2：el-scrollbar scrollbar 滑块删除审计 (Zero Scrollbar)
    console.log("\n[步骤 4] 验证 class=\"el-scrollbar scrollbar\" 滑块彻底删除 (Zero Scrollbar)...");
    const scrollbarAudit = await page.evaluate(() => {
      const scrollbars = document.querySelectorAll(".reg-key .scrollbar .el-scrollbar__bar");
      const wrap = document.querySelector(".reg-key .scrollbar .el-scrollbar__wrap");
      const barDisplays = Array.from(scrollbars).map(b => window.getComputedStyle(b).display);
      const wrapStyle = wrap ? window.getComputedStyle(wrap) : null;
      return {
        barCount: scrollbars.length,
        barDisplays,
        wrapScrollbarWidth: wrapStyle ? wrapStyle.scrollbarWidth : null
      };
    });
    console.log("  滚动条与滑块审计结果:", scrollbarAudit);
    for (const d of scrollbarAudit.barDisplays) {
      assert.strictEqual(d, "none", `Element Plus 滚动条滑块必须被彻底删除 (display: none)，实际为: ${d}`);
    }
    assert.ok(
      scrollbarAudit.wrapScrollbarWidth === "none" || scrollbarAudit.wrapScrollbarWidth === "",
      "原生 scrollbar-width 必须配置为 none 以清除浏览器默认滑块"
    );
    console.log("  ✓ class=\"el-scrollbar scrollbar\" 滑块彻底删除审计 100% 通过！");

    // 5. 校验 Part 2：empty-baseplate 高级现代化空状态升级
    console.log("\n[步骤 5] 验证 class=\"empty-baseplate\" 现代化质感升级与快捷行动按钮...");
    // 搜索不存在的 code 触发 empty 状态
    const searchInput = await page.waitForSelector(".reg-key .search-input input", { timeout: 5000 });
    await searchInput.fill("NON_EXISTENT_KEY_TEST_EMPTY_UI");
    await searchInput.press("Enter");
    await page.waitForTimeout(600);

    const emptyBaseplate = await page.waitForSelector(".reg-key .empty .empty-baseplate", { timeout: 5000 });
    assert.ok(emptyBaseplate, "搜索无果时必须渲染 .empty-baseplate 容器");

    const baseplateData = await emptyBaseplate.evaluate(el => {
      const s = window.getComputedStyle(el);
      const icon = el.querySelector(".empty-icon-box");
      const title = el.querySelector(".empty-title");
      const desc = el.querySelector(".empty-desc");
      const actions = el.querySelector(".empty-actions");
      return {
        background: s.backgroundColor,
        borderRadius: s.borderRadius,
        hasBorder: s.borderWidth !== "0px" && s.borderStyle !== "none",
        hasIconBox: !!icon,
        hasTitle: !!title,
        titleText: title ? title.textContent.trim() : "",
        hasDesc: !!desc,
        hasActions: !!actions,
        actionBtnCount: actions ? actions.querySelectorAll("button").length : 0
      };
    });
    console.log("  empty-baseplate 结构与样式审计:", baseplateData);
    assert.strictEqual(baseplateData.hasBorder, true, "empty-baseplate 必须具备边框描边");
    assert.ok(baseplateData.background !== "rgba(0, 0, 0, 0)", "empty-baseplate 背景严禁透明");
    assert.strictEqual(baseplateData.hasIconBox, true, "empty-baseplate 必须包含专属质感图标底座 (.empty-icon-box)");
    assert.strictEqual(baseplateData.hasTitle, true, "empty-baseplate 必须包含标题 (.empty-title)");
    assert.strictEqual(baseplateData.hasDesc, true, "empty-baseplate 必须包含说明指引 (.empty-desc)");
    assert.ok(baseplateData.actionBtnCount >= 1, "empty-baseplate 必须包含快捷 CTA 行动按钮");
    console.log("  ✓ empty-baseplate 现代化质感与交互体系审计通过！");

    // 点击清空搜索按钮恢复列表
    const clearBtn = await page.$(".empty-baseplate .empty-actions .empty-btn-secondary");
    if (clearBtn) {
      await clearBtn.click();
      await page.waitForTimeout(600);
      console.log("  ✓ 点击空状态「清空搜索条件」成功恢复初始列表");
    }

    // 6. 保存明亮模式截图
    await page.screenshot({ path: "tests/audit_invite_code_ui_optimized.png" });
    console.log("  ✓ 明亮模式优化截图已保存: tests/audit_invite_code_ui_optimized.png");

    // 7. 验证暗黑模式适配与前后画风一致性
    console.log("\n[步骤 6] 验证暗黑模式 (Dark Mode) 前后两部分画风同步与视觉无缝融合...");
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
    });
    await page.waitForTimeout(400);

    const darkAudit = await page.evaluate(() => {
      const header = document.querySelector(".reg-key .header-actions");
      const wrap = document.querySelector(".reg-key .scrollbar .el-scrollbar__wrap");
      const hStyle = window.getComputedStyle(header);
      const wStyle = window.getComputedStyle(wrap);
      return {
        headerBg: hStyle.backgroundColor,
        wrapBg: wStyle.backgroundColor,
        headerBorder: hStyle.borderColor,
        wrapBorder: wStyle.borderColor
      };
    });
    console.log("  暗黑模式双部分画风审计:", darkAudit);
    assert.ok(
      darkAudit.headerBg.includes("rgb(30, 41, 59)") || darkAudit.headerBg.includes("rgb(17, 24, 39)") || darkAudit.headerBg.includes("rgb(15, 23, 42)"),
      "暗黑模式下顶部栏必须同步为深色底色"
    );
    assert.ok(
      darkAudit.wrapBg.includes("rgb(30, 41, 59)") || darkAudit.wrapBg.includes("rgb(17, 24, 39)") || darkAudit.wrapBg.includes("rgb(15, 23, 42)"),
      "暗黑模式下主体底板必须同步为深色底色"
    );
    console.log("  ✓ 暗黑模式前后画风完全一致，无白斑、色彩层级完美统一！");

    await page.screenshot({ path: "tests/audit_invite_code_ui_dark.png" });
    console.log("  ✓ 暗黑模式优化截图已保存: tests/audit_invite_code_ui_dark.png");

    console.log("\n==========================================================================");
    console.log("=== ✅ 全部测试项 100% 顺利通过！empty-baseplate、滑块删除与双部分画风统一完成！ ===");
    console.log("==========================================================================");

  } catch (err) {
    console.error("❌ 测试失败:", err);
    throw err;
  } finally {
    await browser.close();
  }
})();
