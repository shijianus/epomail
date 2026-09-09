import { chromium } from "playwright";
import assert from "node:assert";

(async () => {
  console.log("=== 启动全量视觉与功能审计 (Audit New Features & Alignment) ===");
  const browser = await chromium.launch({ headless: true, args: ["--lang=zh-CN"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  try {
    // 1. 登录
    console.log("\n[步骤 1] 登录管理员账号...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, "登录失败");
    const token = typeof loginJson.data === "string" ? loginJson.data : loginJson.data?.token;
    console.log("  ✓ 登录成功");

    // 2. 访问 /sys-setting，审计版本号、链接与无分割线
    console.log("\n[步骤 2] 访问系统设置页 /sys-setting...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
      document.documentElement.classList.remove("dark");
    }, token);

    await page.goto(BASE + "/sys-setting", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // 审计底部 status-bar 版本
    const statusBarVersion = await page.locator(".status-text.version-tag").textContent();
    console.log(`  状态栏版本: "${statusBarVersion.trim()}"`);
    assert(statusBarVersion.includes("v1.1.0"), "状态栏版本应包含 v1.1.0");

    // 审计关于卡片中的版本 el-badge
    const aboutVersion = await page.locator(".concerning-item .el-badge .el-button").textContent();
    console.log(`  关于卡片版本: "${aboutVersion.trim()}"`);
    assert.strictEqual(aboutVersion.trim(), "v1.1.0", "关于卡片中版本号应严格等于 v1.1.0");

    // 审计关于卡片中的社区、赞助与文档链接
    const clickedUrls = await page.evaluate(() => {
      const urls = [];
      const origClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function() {
        urls.push(this.href);
      };

      const btns = Array.from(document.querySelectorAll(".concerning-item .el-button"));
      for (const btn of btns) {
        btn.click();
      }

      HTMLAnchorElement.prototype.click = origClick;
      return urls;
    });
    console.log("  点击跳转的 URLs:", JSON.stringify(clickedUrls, null, 2));

    assert(clickedUrls.includes("https://github.com/shijianus/epomail/releases"), "GitHub Releases 链接应为 shijianus/epomail/releases");
    assert(clickedUrls.includes("https://github.com/shijianus/epomail"), "GitHub 主仓库链接应为 shijianus/epomail");
    assert(clickedUrls.includes("https://t.me/epomail"), "Telegram 链接应为 t.me/epomail");
    assert(clickedUrls.includes("https://blog.epocanvas.com/support"), "Support 赞助链接应为 blog.epocanvas.com/support");
    assert(clickedUrls.includes("https://docs.epocanvas.com/epomail"), "Help 帮助文档链接应为 docs.epocanvas.com/epomail");
    console.log("  ✓ 关于卡片 5 项链接全部更新为官方项目/博客专属地址");

    // 审计 card-content 中绝无分割线 (border-bottom)
    const cardContentDividers = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll(".card-content > *"));
      let visibleBorders = 0;
      for (const item of items) {
        const style = window.getComputedStyle(item);
        if (style.borderBottomWidth !== "0px" && style.borderBottomStyle !== "none" && !style.borderBottomColor.includes("rgba(0, 0, 0, 0)")) {
          visibleBorders++;
        }
      }
      return visibleBorders;
    });
    console.log(`  .card-content 内可见分割线数量: ${cardContentDividers}`);
    assert.strictEqual(cardContentDividers, 0, ".card-content 内部不应存在任何可见分割线");
    console.log("  ✓ .card-content 分割线彻底清除");

    // 截图关于卡片
    const aboutCard = page.locator(".settings-card.about");
    await aboutCard.screenshot({ path: "tests/audit_about_card_clean.png" });
    console.log("  ✓ 已保存: tests/audit_about_card_clean.png");

    // 3. 访问 /role，审计身份编辑弹窗
    console.log("\n[步骤 3] 访问权限控制页 /role...");
    await page.goto(BASE + "/role", { waitUntil: "networkidle" });
    await page.waitForSelector(".el-table");
    await page.waitForTimeout(800);

    // 打开第一个角色的「修改」弹窗
    const actionDropdown = await page.waitForSelector(".el-table__row:first-child .el-dropdown button");
    await actionDropdown.click();
    await page.waitForTimeout(300);

    const editItem = await page.waitForSelector(".el-dropdown-menu:not([style*='display: none']) .el-dropdown-menu__item:first-child");
    await editItem.click();

    const dialog = await page.waitForSelector(".role-form-dialog");
    await page.waitForTimeout(500);

    // 验证多余提示说明已删除
    const dialogText = await page.locator(".role-form-dialog").innerText();
    assert(!dialogText.includes("0MB为无存储"), "已删除 '0MB为无存储(参观者需外接DB)' 提示说明");
    assert(!dialogText.includes("LV.1及以上书友开放附件"), "已删除 'LV.1及以上书友开放附件' 提示说明");
    console.log("  ✓ '0MB为无存储' 与 'LV.1及以上书友开放附件' 提示说明已彻底移除");

    // 验证展开收起 radio-group 已删除
    const permExpandCount = await page.locator(".role-form-dialog .perm-expand").count();
    assert.strictEqual(permExpandCount, 0, "展开/收起切换按钮组 .perm-expand 已彻底移除");
    console.log("  ✓ .perm-expand 展开/收起切换按钮已彻底移除");

    // 验证权限分配细则头部与徽章存在
    const headerTitle = await page.locator(".role-form-dialog .perm-title").textContent();
    assert.strictEqual(headerTitle.trim(), "权限分配细则", "权限标题正确");
    const countBadge = await page.locator(".role-form-dialog .perm-count-badge").textContent();
    assert(countBadge.includes("已选"), "已选计数徽章正常响应");
    console.log(`  ✓ 权限标题与徽章正常: [${headerTitle.trim()}] [${countBadge.trim()}]`);

    // 验证 select wrapper 无 '...' 尾部截断
    const selectCheck = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll(".role-form-dialog .el-select__wrapper"));
      return selects.map(s => ({
        class: s.className,
        text: s.innerText.trim(),
        hasEllipsisTail: s.innerText.trim().endsWith("...")
      }));
    });
    console.log("  Select Wrapper 审计:", JSON.stringify(selectCheck, null, 2));
    for (const sc of selectCheck) {
      assert(!sc.hasEllipsisTail, `Select wrapper 内容不能以 '...' 结尾: ${sc.text}`);
    }
    console.log("  ✓ 所有 el-select__wrapper 文本均完整展现，绝无 '...' 截断");

    // 几何对齐审计 (Strict 0px Bottom Alignment)
    const geom = await page.evaluate(() => {
      const left = document.querySelector(".modal-col-left");
      const right = document.querySelector(".modal-col-right");
      const treeWrap = document.querySelector(".perm-tree-wrap");
      const btn = document.querySelector(".modal-col-right .btn-save-role");
      const leftRect = left.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      return {
        leftHeight: left.offsetHeight,
        rightHeight: right.offsetHeight,
        treeWrapHeight: treeWrap.offsetHeight,
        deltaBottom: Math.abs(leftRect.bottom - btnRect.bottom)
      };
    });
    console.log("  [弹窗几何对齐信息]:\n", JSON.stringify(geom, null, 2));
    assert(geom.deltaBottom <= 1.0, `左右两列底边偏差应 <= 1px，实测: ${geom.deltaBottom}px`);
    console.log(`  ✓ 左右两列与保存按钮达到严格对齐 (Delta Bottom = ${geom.deltaBottom.toFixed(2)}px)`);

    // 截图留档：亮色模式
    const dialogBox = page.locator(".role-form-dialog");
    await dialogBox.screenshot({ path: "tests/audit_role_dialog_light_clean.png" });
    console.log("  ✓ 已保存: tests/audit_role_dialog_light_clean.png");

    // 切换暗黑模式审计
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
    });
    await page.waitForTimeout(400);

    await dialogBox.screenshot({ path: "tests/audit_role_dialog_dark_clean.png" });
    console.log("  ✓ 已保存: tests/audit_role_dialog_dark_clean.png");

    console.log("\n🎉 全量视觉与功能测试 100% 通过！");
  } finally {
    await browser.close();
  }
})();
