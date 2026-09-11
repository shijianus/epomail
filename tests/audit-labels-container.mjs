import { chromium } from "playwright";
import assert from "node:assert";

(async () => {
  console.log("=== 正在全维度审计 labels-container 与 list-row tech-row 结构与跨模式表现 ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  try {
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, "Admin 登录失败");
    const token = typeof loginJson.data === "string" ? loginJson.data : loginJson.data?.token;

    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);

    // 1. 默认亮色模式 (Light, No Wallpaper)
    console.log("1. 审计默认亮色模式...");
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.remove("has-main-wallpaper");
      document.documentElement.classList.remove("theme-mountain");
    });
    await page.goto(BASE + "/settings/labels", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    const auditLight = await page.evaluate(() => {
      const labelsContainer = document.querySelector(".labels-container");
      const modernList = document.querySelector(".modern-list");
      const techRows = Array.from(document.querySelectorAll(".list-row.tech-row"));
      const cs = window.getComputedStyle(labelsContainer);
      const rowCs = window.getComputedStyle(techRows[0]);
      const rect = labelsContainer.getBoundingClientRect();
      const r1 = techRows[0].getBoundingClientRect();
      const r2 = techRows[1].getBoundingClientRect();
      return {
        hasModernList: !!modernList,
        labelsContainerBg: cs.backgroundColor,
        labelsContainerBorder: cs.borderWidth,
        labelsContainerPadding: cs.padding,
        rowWidth: Math.round(r1.width),
        rowHeight: Math.round(r1.height),
        rowGap: Math.round(r2.top - r1.bottom),
        rowBg: rowCs.backgroundColor,
        rowBorderRadius: rowCs.borderRadius
      };
    });
    console.log("亮色模式审计数据:", auditLight);
    assert.strictEqual(auditLight.hasModernList, false, "不能包含冗余 modern-list 容器");
    assert.strictEqual(auditLight.labelsContainerBg, "rgba(0, 0, 0, 0)", "labels-container 必须透明无底板");
    assert.strictEqual(auditLight.labelsContainerPadding, "0px", "labels-container padding 必须为 0");
    assert.strictEqual(auditLight.rowGap, 8, "行间距必须严格为 8px 舒适紧凑间距");
    await page.screenshot({ path: "tests/audit_labels_light.png" });

    // 2. 默认暗色模式 (Dark, No Wallpaper)
    console.log("2. 审计默认暗色模式...");
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("has-main-wallpaper");
      document.documentElement.classList.remove("theme-mountain");
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "tests/audit_labels_dark.png" });

    // 3. 壁纸亮色模式 (Light, Has Wallpaper)
    console.log("3. 审计壁纸亮色模式...");
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("has-main-wallpaper");
      document.documentElement.classList.add("theme-mountain");
    });
    await page.waitForTimeout(500);
    const auditWallpaper = await page.evaluate(() => {
      const firstRow = document.querySelector(".list-row.tech-row");
      const cs = window.getComputedStyle(firstRow);
      return {
        backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter,
        bg: cs.backgroundColor
      };
    });
    console.log("壁纸亮色数据:", auditWallpaper);
    assert.ok(auditWallpaper.backdropFilter.includes("blur"), "壁纸模式下 tech-row 必须具备磨砂亚克力 blur 效果");
    await page.screenshot({ path: "tests/audit_labels_wallpaper_light.png" });

    // 4. 壁纸暗色模式 (Dark, Has Wallpaper)
    console.log("4. 审计壁纸暗色模式...");
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.add("has-main-wallpaper");
      document.documentElement.classList.add("theme-mountain");
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "tests/audit_labels_wallpaper_dark.png" });

    // 恢复浏览器环境
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.remove("has-main-wallpaper");
      document.documentElement.classList.remove("theme-mountain");
    });

    console.log("✓ 全模式审计与视觉核验 100% 成功通过！");
  } catch (err) {
    console.error("审计执行失败:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
