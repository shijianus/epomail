import { chromium } from "playwright";

(async () => {
  console.log("=== 启动 Role Form Dialog 视觉与几何布局审计 ===");
  const browser = await chromium.launch({ headless: true, args: ["--lang=zh-CN"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  try {
    // 1. 登录
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginJson = await loginRes.json();
    const token = typeof loginJson.data === "string" ? loginJson.data : loginJson.data?.token;

    // 2. 访问 /role
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
      document.documentElement.classList.remove("dark");
    }, token);

    await page.goto(BASE + "/role", { waitUntil: "networkidle" });
    await page.waitForSelector(".el-table", { timeout: 15000 });
    await page.waitForTimeout(1000);

    // 3. 打开第一个角色的「修改」弹窗
    const actionDropdown = await page.waitForSelector(".el-table__row:first-child .el-dropdown button", { timeout: 5000 });
    await actionDropdown.click();
    await page.waitForTimeout(400);

    const editItem = await page.waitForSelector(".el-dropdown-menu:not([style*='display: none']) .el-dropdown-menu__item:first-child", { timeout: 5000 });
    await editItem.click();

    const dialog = await page.waitForSelector(".role-form-dialog", { timeout: 5000 });
    await page.waitForTimeout(600);

    const dialogBox = await page.locator(".role-form-dialog");

    // 4. 截图：亮色模式 - 初始折叠态
    await dialogBox.screenshot({ path: "tests/audit_role_dialog_light_initial.png" });
    console.log("  ✓ 已保存: tests/audit_role_dialog_light_initial.png");

    let geomInitial = await page.evaluate(() => {
      const left = document.querySelector(".modal-col-left");
      const right = document.querySelector(".modal-col-right");
      const treeWrap = document.querySelector(".perm-tree-wrap");
      const scrollWrap = document.querySelector(".perm-tree-scrollbar .el-scrollbar__wrap");
      const scrollThumb = document.querySelector(".perm-tree-scrollbar .el-scrollbar__thumb");
      const btn = document.querySelector(".modal-col-right .btn");
      const countBadge = document.querySelector(".perm-count-badge");
      return {
        leftHeight: left?.offsetHeight,
        rightHeight: right?.offsetHeight,
        treeWrapHeight: treeWrap?.offsetHeight,
        scrollWrapScrollHeight: scrollWrap?.scrollHeight,
        scrollWrapClientHeight: scrollWrap?.clientHeight,
        thumbHeight: scrollThumb?.offsetHeight,
        countBadgeText: countBadge?.textContent?.trim(),
        deltaBottom: Math.abs((left?.getBoundingClientRect().bottom || 0) - (btn?.getBoundingClientRect().bottom || 0))
      };
    });
    console.log("  [初始态几何信息]:\n", JSON.stringify(geomInitial, null, 2));

    // 5. 点击「展开」单选按钮
    console.log("  -> 点击展开全部权限树...");
    const expandBtn = await page.locator(".perm-expand .el-radio-button:first-child");
    await expandBtn.click();
    await page.waitForTimeout(600);

    // 截图：亮色模式 - 展开全部态 (滚动顶部)
    await dialogBox.screenshot({ path: "tests/audit_role_dialog_light_expanded_top.png" });
    console.log("  ✓ 已保存: tests/audit_role_dialog_light_expanded_top.png");

    let geomExpanded = await page.evaluate(() => {
      const left = document.querySelector(".modal-col-left");
      const right = document.querySelector(".modal-col-right");
      const treeWrap = document.querySelector(".perm-tree-wrap");
      const scrollWrap = document.querySelector(".perm-tree-scrollbar .el-scrollbar__wrap");
      const scrollThumb = document.querySelector(".perm-tree-scrollbar .el-scrollbar__thumb");
      const btn = document.querySelector(".modal-col-right .btn");
      return {
        leftHeight: left?.offsetHeight,
        rightHeight: right?.offsetHeight,
        treeWrapHeight: treeWrap?.offsetHeight,
        scrollWrapScrollHeight: scrollWrap?.scrollHeight,
        scrollWrapClientHeight: scrollWrap?.clientHeight,
        thumbHeight: scrollThumb?.offsetHeight,
        deltaBottom: Math.abs((left?.getBoundingClientRect().bottom || 0) - (btn?.getBoundingClientRect().bottom || 0))
      };
    });
    console.log("  [展开态几何信息]:\n", JSON.stringify(geomExpanded, null, 2));

    // 滚动到底部
    await page.evaluate(() => {
      const scrollWrap = document.querySelector(".perm-tree-scrollbar .el-scrollbar__wrap");
      if (scrollWrap) scrollWrap.scrollTop = scrollWrap.scrollHeight;
    });
    await page.waitForTimeout(400);

    // 截图：亮色模式 - 展开全部态 (滚动到底部)
    await dialogBox.screenshot({ path: "tests/audit_role_dialog_light_expanded_bottom.png" });
    console.log("  ✓ 已保存: tests/audit_role_dialog_light_expanded_bottom.png");

    // 6. 切换暗黑模式
    console.log("  -> 切换暗黑模式...");
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
    });
    await page.waitForTimeout(400);

    // 截图：暗黑模式 - 展开到底部
    await dialogBox.screenshot({ path: "tests/audit_role_dialog_dark_expanded_bottom.png" });
    console.log("  ✓ 已保存: tests/audit_role_dialog_dark_expanded_bottom.png");

    // 滚动回顶部
    await page.evaluate(() => {
      const scrollWrap = document.querySelector(".perm-tree-scrollbar .el-scrollbar__wrap");
      if (scrollWrap) scrollWrap.scrollTop = 0;
    });
    await page.waitForTimeout(400);

    // 截图：暗黑模式 - 展开顶部
    await dialogBox.screenshot({ path: "tests/audit_role_dialog_dark_expanded_top.png" });
    console.log("  ✓ 已保存: tests/audit_role_dialog_dark_expanded_top.png");

    // 点击收起
    const collapseBtn = await page.locator(".perm-expand .el-radio-button:last-child");
    await collapseBtn.click();
    await page.waitForTimeout(600);

    // 截图：暗黑模式 - 收起态
    await dialogBox.screenshot({ path: "tests/audit_role_dialog_dark_initial.png" });
    console.log("  ✓ 已保存: tests/audit_role_dialog_dark_initial.png");

  } catch (err) {
    console.error("测试出错:", err);
  } finally {
    await browser.close();
  }
})();
