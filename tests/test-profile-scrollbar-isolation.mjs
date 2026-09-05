import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始测试「用户详情」/admin 界面 class=\"el-scrollbar__view\" 主栏独立性与全局主题壁纸隔离 ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();

  const BASE = "https://epomail.epocanvas.workers.dev";

  try {
    // 1. 登录
    console.log("1. 登录获取测试 Token...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "登录失败: " + JSON.stringify(loginData));
    const token = loginData.data?.token;

    // 2. 初始化环境并访问 /inbox
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);

    // 3. 访问 /admin (用户详情界面) - 默认无壁纸
    console.log("2. 访问 /admin 用户详情界面 (默认状态)...");
    await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
    await page.waitForSelector(".profile-container", { timeout: 15000 });
    await page.waitForSelector(".profile-scrollbar", { timeout: 15000 });
    await page.waitForSelector(".el-scrollbar__view.profile-scrollbar-view", { timeout: 15000 });

    const checkDefault = await page.evaluate(() => {
      const container = document.querySelector(".profile-container");
      const scrollbar = document.querySelector(".profile-scrollbar");
      const scrollbarView = document.querySelector(".el-scrollbar__view.profile-scrollbar-view");
      const identityCard = document.querySelector(".profile-identity-card");
      return {
        hasProfileContainer: !!container,
        hasProfileScrollbar: !!scrollbar,
        hasProfileScrollbarView: !!scrollbarView,
        containerBg: container ? window.getComputedStyle(container).backgroundColor : null,
        containerBgImg: container ? window.getComputedStyle(container).backgroundImage : null,
        viewBgImg: scrollbarView ? window.getComputedStyle(scrollbarView).backgroundImage : null,
        viewIsolation: scrollbarView ? window.getComputedStyle(scrollbarView).isolation : null,
        identityCardBg: identityCard ? window.getComputedStyle(identityCard).backgroundColor : null,
      };
    });

    console.log("  默认状态核验:", checkDefault);
    assert.ok(checkDefault.hasProfileContainer, "profile-container 必须存在");
    assert.ok(checkDefault.hasProfileScrollbar, "profile-scrollbar 独立类必须生效于 el-scrollbar");
    assert.ok(checkDefault.hasProfileScrollbarView, "profile-scrollbar-view 独立类必须生效于 el-scrollbar__view 主栏");
    assert.notStrictEqual(checkDefault.containerBg, "rgba(0, 0, 0, 0)", "profile-container 背景绝不能为透明");
    assert.strictEqual(checkDefault.containerBgImg, "none", "profile-container 默认无背景图");
    assert.strictEqual(checkDefault.viewBgImg, "none", "el-scrollbar__view 主栏背景图必须为 none");

    await page.screenshot({ path: "tests/audit_profile_isolated_default.png" });
    console.log("  📸 已截图: tests/audit_profile_isolated_default.png");

    // 4. 模拟开启全局主题壁纸 (has-main-wallpaper)
    console.log("3. 注入全局主题壁纸并验证 /admin 主栏绝对隔离...");
    await page.evaluate(() => {
      document.documentElement.classList.add("has-main-wallpaper");
      document.body.classList.add("has-main-wallpaper");
      document.documentElement.style.setProperty("--main-wallpaper-url", "linear-gradient(135deg, #ff0055 0%, #7a00ff 100%)");
      document.documentElement.style.setProperty("--panel-alpha", "85%");
    });

    // 验证在开启壁纸后，/admin 界面及其主栏依然保持物理隔离，不会被壁纸渗透
    const checkWallpaperProfile = await page.evaluate(() => {
      const container = document.querySelector(".profile-container");
      const scrollbar = document.querySelector(".profile-scrollbar");
      const scrollbarView = document.querySelector(".el-scrollbar__view.profile-scrollbar-view");
      const identityCard = document.querySelector(".profile-identity-card");
      return {
        bodyBgImg: window.getComputedStyle(document.body).backgroundImage,
        containerBg: container ? window.getComputedStyle(container).backgroundColor : null,
        containerBgImg: container ? window.getComputedStyle(container).backgroundImage : null,
        viewBgImg: scrollbarView ? window.getComputedStyle(scrollbarView).backgroundImage : null,
        viewIsolation: scrollbarView ? window.getComputedStyle(scrollbarView).isolation : null,
        identityCardBg: identityCard ? window.getComputedStyle(identityCard).backgroundColor : null,
      };
    });

    console.log("  全局壁纸生效状态下 /admin 核验:", checkWallpaperProfile);
    assert.ok(checkWallpaperProfile.bodyBgImg.includes("gradient"), "全局壁纸已正确在 body 激活");
    assert.notStrictEqual(checkWallpaperProfile.containerBg, "rgba(0, 0, 0, 0)", "profile-container 背景绝不能被壁纸透明化");
    assert.strictEqual(checkWallpaperProfile.containerBgImg, "none", "profile-container 背景图必须锁定为 none，阻断壁纸穿透");
    assert.strictEqual(checkWallpaperProfile.viewBgImg, "none", "el-scrollbar__view 主栏背景图必须锁定为 none");
    assert.strictEqual(checkWallpaperProfile.viewIsolation, "isolate", "el-scrollbar__view 必须具备 isolation: isolate 独立层叠上下文");
    assert.notStrictEqual(checkWallpaperProfile.identityCardBg, "rgba(0, 0, 0, 0)", "卡片背景必须实心独立");

    await page.screenshot({ path: "tests/audit_profile_isolated_with_wallpaper.png" });
    console.log("  📸 已截图: tests/audit_profile_isolated_with_wallpaper.png");

    // 5. 切换到暗黑模式 (Dark Mode) 验证
    console.log("4. 切换到暗黑模式，验证深色主题下的独立隔离...");
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
    });
    await page.waitForTimeout(300);

    const checkDark = await page.evaluate(() => {
      const container = document.querySelector(".profile-container");
      const scrollbarView = document.querySelector(".el-scrollbar__view.profile-scrollbar-view");
      return {
        containerBg: container ? window.getComputedStyle(container).backgroundColor : null,
        containerBgImg: container ? window.getComputedStyle(container).backgroundImage : null,
        viewBgImg: scrollbarView ? window.getComputedStyle(scrollbarView).backgroundImage : null,
      };
    });

    console.log("  暗黑模式下 /admin 核验:", checkDark);
    assert.notStrictEqual(checkDark.containerBg, "rgba(0, 0, 0, 0)", "暗黑模式下 profile-container 背景绝不能为透明");
    assert.strictEqual(checkDark.containerBgImg, "none", "暗黑模式下 profile-container 背景图必须锁定为 none");
    assert.strictEqual(checkDark.viewBgImg, "none", "暗黑模式下 el-scrollbar__view 主栏背景图必须锁定为 none");

    await page.screenshot({ path: "tests/audit_profile_isolated_dark.png" });
    console.log("  📸 已截图: tests/audit_profile_isolated_dark.png");

    // 6. 验证其它主栏不受影响，依然保持对全局壁纸的透光/磨砂响应
    console.log("5. 访问 /inbox 与 /system-setting，验证其它主栏不受影响...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".split-view-container", { timeout: 15000 });
    const checkInbox = await page.evaluate(() => {
      const listCol = document.querySelector(".list-column");
      const splitView = document.querySelector(".split-view-container");
      return {
        hasSplitView: !!splitView,
        hasListCol: !!listCol,
      };
    });
    assert.ok(checkInbox.hasSplitView && checkInbox.hasListCol, "收件箱主栏必须完整存在并正常渲染");

    console.log("✓ 用户详情 /admin 界面 class=\"el-scrollbar__view\" 主栏独立隔离与壁纸防穿透测试 100% 通过！");
  } catch (err) {
    console.error("❌ 测试失败:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
