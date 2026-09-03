import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始 topbar-search 与 clear-icon 视觉核验 ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();

  const BASE = "https://epomail.epocanvas.workers.dev";

  try {
    // 1. 登录
    console.log("1. 正在登录 Cloudflare 生产环境...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "登录失败: " + JSON.stringify(loginData));
    const token = loginData.data?.token;

    // 2. 注入 Token 并访问 inbox
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);

    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // 3. 检查 topbar-search 与 search-box
    const topbar = page.locator(".topbar");
    const topbarSearch = page.locator(".topbar-search");
    await topbarSearch.waitFor({ state: "visible" });
    console.log("✓ topbar-search 元素存在且可见");

    const searchInput = page.locator(".search-box input");
    await searchInput.waitFor({ state: "visible" });

    // 4. 空输入状态截图
    const searchBox = page.locator(".search-box");
    await searchBox.screenshot({ path: "tests/audit_search_empty.png" });
    await topbar.screenshot({ path: "tests/audit_topbar_empty.png" });
    console.log("✓ 已保存空输入框截图 tests/audit_search_empty.png & tests/audit_topbar_empty.png");

    // 5. 输入文字并检查 clear-icon
    console.log("5. 输入关键词测试 clear-icon...");
    await searchInput.fill("EpoCanvas");
    await page.waitForTimeout(500);

    const clearIcon = page.locator(".search-box .clear-icon");
    await clearIcon.waitFor({ state: "visible" });

    // 获取搜索框与 clear-icon 坐标以验证垂直居中与容纳在内
    const searchBoxBox = await searchBox.boundingBox();
    const clearIconBox = await clearIcon.boundingBox();
    const searchIcon = page.locator(".search-box .search-icon");
    const searchIconBox = await searchIcon.boundingBox();

    console.log("SearchBox BoundingBox:", searchBoxBox);
    console.log("SearchIcon BoundingBox:", searchIconBox);
    console.log("ClearIcon BoundingBox:", clearIconBox);

    // 验证 search-icon 在 searchBox 内部垂直居中
    const searchBoxCenterY = searchBoxBox.y + searchBoxBox.height / 2;
    const searchIconCenterY = searchIconBox.y + searchIconBox.height / 2;
    const clearIconCenterY = clearIconBox.y + clearIconBox.height / 2;

    const searchIconDiff = Math.abs(searchBoxCenterY - searchIconCenterY);
    const clearIconDiff = Math.abs(searchBoxCenterY - clearIconCenterY);

    console.log(`SearchIcon 垂直中心偏移: ${searchIconDiff.toFixed(2)}px`);
    console.log(`ClearIcon 垂直中心偏移: ${clearIconDiff.toFixed(2)}px`);

    assert.ok(searchIconDiff < 3, "SearchIcon 应在垂直方向居中对齐");
    assert.ok(clearIconDiff < 3, "ClearIcon 应在垂直方向居中对齐");

    // 验证 clear-icon 位于搜索框右侧内部（不在下方）
    assert.ok(clearIconBox.y >= searchBoxBox.y && (clearIconBox.y + clearIconBox.height) <= (searchBoxBox.y + searchBoxBox.height + 2), "ClearIcon 必须严格位于搜索框垂直范围内");
    assert.ok(clearIconBox.x > searchBoxBox.x + searchBoxBox.width - 50, "ClearIcon 必须位于搜索框右侧边缘内部");

    await searchBox.screenshot({ path: "tests/audit_search_typed.png" });
    await topbar.screenshot({ path: "tests/audit_topbar_typed.png" });
    console.log("✓ 已保存有输入状态截图 tests/audit_search_typed.png & tests/audit_topbar_typed.png");

    // 6. 点击 clear-icon 测试清除
    console.log("6. 测试点击 clear-icon 清除搜索...");
    await clearIcon.click();
    await page.waitForTimeout(500);

    const valAfterClear = await searchInput.inputValue();
    assert.strictEqual(valAfterClear, "", "点击 clear-icon 后输入框应清空");
    const isClearVisible = await clearIcon.isVisible();
    assert.strictEqual(isClearVisible, false, "清空后 clear-icon 应隐藏");
    console.log("✓ 点击 clear-icon 成功清空输入并自动隐藏");

    // 7. 测试暗色模式下的 topbar 搜索视觉
    console.log("7. 测试暗色模式...");
    const themeBtn = page.locator(".theme-toggle-btn");
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await page.waitForTimeout(600);
      await searchInput.fill("Search in Dark Mode");
      await page.waitForTimeout(300);
      await topbar.screenshot({ path: "tests/audit_topbar_dark_typed.png" });
      console.log("✓ 已保存暗色模式头部截图 tests/audit_topbar_dark_typed.png");
    }

    console.log("=== 所有 topbar-search & clear-icon 视觉与逻辑核验全部通过！ ===");
  } catch (err) {
    console.error("❌ 核验失败:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
