import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始测试「个人背景」同步至「用户详情」/admin 界面 class=\"cover-photo\" ===");
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

    // 记录初始 backgroundUrl 以便测试结束还原
    const initialProfileRes = await page.request.get(BASE + "/api/my/loginUserInfo", {
      headers: { Authorization: token }
    });
    const initialProfileData = await initialProfileRes.json();
    const initialBackground = initialProfileData.data?.backgroundUrl || initialProfileData.data?.background || "";
    console.log(`  初始个人背景: "${initialBackground}"`);

    // 2. 初始化环境并访问 /inbox
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);

    // 3. 测试场景 1：通过 API 更新个人背景为赛博朋克预设渐变色 (Cyberpunk Gradient)
    console.log("\n2. 测试场景 1: 更新个人背景为赛博朋克预设渐变...");
    const CYBER_GRADIENT = "linear-gradient(135deg, #4c1d95 0%, #831843 50%, #c2410c 100%)";
    const updateRes1 = await page.request.put(BASE + "/api/my/updateProfile", {
      data: { backgroundUrl: CYBER_GRADIENT },
      headers: {
        Authorization: token,
        "Content-Type": "application/json"
      }
    });
    const updateData1 = await updateRes1.json();
    assert.strictEqual(updateData1.code, 200, "更新背景失败: " + JSON.stringify(updateData1));

    // 验证 public profile 接口同步返回该背景
    const publicProfile1 = await page.request.get(BASE + "/api/public/profile/admin", {
      headers: { Authorization: token }
    });
    const publicData1 = await publicProfile1.json();
    assert.strictEqual(publicData1.code, 200, "公开资料获取失败");
    assert.strictEqual(publicData1.data?.userInfo?.backgroundUrl, CYBER_GRADIENT, "public/profile 必须返回最新背景渐变");

    // 打开 /admin 并验证 .cover-photo 呈现赛博朋克渐变，而非默认祖母绿
    await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
    await page.waitForSelector(".cover-photo", { timeout: 15000 });

    const coverCheck1 = await page.evaluate(() => {
      const cover = document.querySelector(".cover-photo");
      if (!cover) return null;
      const style = window.getComputedStyle(cover);
      return {
        inlineStyle: cover.getAttribute("style"),
        computedBgImg: style.backgroundImage,
      };
    });
    console.log("  场景 1 .cover-photo 样式:", coverCheck1);
    assert.ok(coverCheck1, ".cover-photo 必须存在");
    assert.ok(coverCheck1.computedBgImg.includes("rgb(76, 29, 149)") || coverCheck1.computedBgImg.includes("rgb(131, 24, 67)"), 
      "computedBgImg 必须包含赛博朋克渐变色，当前值为: " + coverCheck1.computedBgImg);
    
    await page.screenshot({ path: "tests/audit_profile_cover_cyber.png" });
    console.log("  📸 已截图: tests/audit_profile_cover_cyber.png");

    // 4. 测试场景 2：更新个人背景为日落渐变 (Sunset Gradient)
    console.log("\n3. 测试场景 2: 更新个人背景为日落预设渐变...");
    const SUNSET_GRADIENT = "linear-gradient(135deg, #ea580c 0%, #db2777 50%, #7c3aed 100%)";
    const updateRes2 = await page.request.put(BASE + "/api/my/updateProfile", {
      data: { backgroundUrl: SUNSET_GRADIENT },
      headers: {
        Authorization: token,
        "Content-Type": "application/json"
      }
    });
    const updateData2 = await updateRes2.json();
    assert.strictEqual(updateData2.code, 200, "更新背景失败: " + JSON.stringify(updateData2));

    await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
    await page.waitForSelector(".cover-photo", { timeout: 15000 });

    const coverCheck2 = await page.evaluate(() => {
      const cover = document.querySelector(".cover-photo");
      if (!cover) return null;
      const style = window.getComputedStyle(cover);
      return {
        inlineStyle: cover.getAttribute("style"),
        computedBgImg: style.backgroundImage,
      };
    });
    console.log("  场景 2 .cover-photo 样式:", coverCheck2);
    assert.ok(coverCheck2.computedBgImg.includes("rgb(234, 88, 12)") || coverCheck2.computedBgImg.includes("rgb(219, 39, 119)"),
      "computedBgImg 必须包含日落渐变色，当前值为: " + coverCheck2.computedBgImg);

    await page.screenshot({ path: "tests/audit_profile_cover_sunset.png" });
    console.log("  📸 已截图: tests/audit_profile_cover_sunset.png");

    // 5. 测试场景 3：更新个人背景为图片 URL
    console.log("\n4. 测试场景 3: 更新个人背景为图片 URL...");
    const IMAGE_URL = "https://images.unsplash.com/photo-1579546929518-9e396f3cc809";
    const updateRes3 = await page.request.put(BASE + "/api/my/updateProfile", {
      data: { backgroundUrl: IMAGE_URL },
      headers: {
        Authorization: token,
        "Content-Type": "application/json"
      }
    });
    const updateData3 = await updateRes3.json();
    assert.strictEqual(updateData3.code, 200, "更新背景失败: " + JSON.stringify(updateData3));

    await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
    await page.waitForSelector(".cover-photo", { timeout: 15000 });

    const coverCheck3 = await page.evaluate(() => {
      const cover = document.querySelector(".cover-photo");
      if (!cover) return null;
      const style = window.getComputedStyle(cover);
      return {
        inlineStyle: cover.getAttribute("style"),
        computedBgImg: style.backgroundImage,
      };
    });
    console.log("  场景 3 .cover-photo 样式:", coverCheck3);
    assert.ok(coverCheck3.computedBgImg.includes(IMAGE_URL),
      "computedBgImg 必须包含图片 URL，当前值为: " + coverCheck3.computedBgImg);

    await page.screenshot({ path: "tests/audit_profile_cover_image.png" });
    console.log("  📸 已截图: tests/audit_profile_cover_image.png");

    // 6. 测试场景 4：通过 /settings/general 常规设置页点击预设卡片，验证 UI 交互与即时生效
    console.log("\n5. 测试场景 4: 在 /settings/general 常规设置页点击预设卡片，验证 UI 交互与即时生效...");
    await page.goto(BASE + "/settings/general", { waitUntil: "networkidle" });
    await page.waitForSelector(".cover-presets-grid .wallpaper-card", { timeout: 15000 });

    const presetCards = page.locator(".cover-presets-grid .wallpaper-card:not(.wallpaper-add-card)");
    const cardCount = await presetCards.count();
    console.log(`  发现 ${cardCount} 个封面预设卡片`);
    assert.ok(cardCount >= 2, "应至少有2个预设封面卡片");

    // 点击第 2 个预设（赛博朋克紫粉渐变）
    await presetCards.nth(1).click();
    await page.waitForTimeout(500);

    // 验证选中态
    const activeCard = page.locator(".cover-presets-grid .wallpaper-card.active");
    assert.ok(await activeCard.isVisible(), "点击后预设卡片应展示 active 选中态");

    // 跳转回 /admin 页面验证 cover-photo 是否同步生效
    await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
    await page.waitForSelector(".cover-photo", { timeout: 15000 });

    const coverCheckUI = await page.evaluate(() => {
      const cover = document.querySelector(".cover-photo");
      return cover ? window.getComputedStyle(cover).backgroundImage : null;
    });
    console.log("  UI 切换后 /admin .cover-photo 样式:", coverCheckUI);
    assert.ok(coverCheckUI && coverCheckUI !== "none", "cover-photo 背景图必须已更新");

    // 7. 测试场景 5：还原初始背景（零假数据与自动还原准则）
    console.log("\n6. 测试场景 5: 自动还原初始个人背景...");
    await page.request.put(BASE + "/api/my/updateProfile", {
      data: { backgroundUrl: initialBackground },
      headers: {
        Authorization: token,
        "Content-Type": "application/json"
      }
    });
    console.log("✓ 初始个人背景已成功还原");

    console.log("\n==================================================================");
    console.log("✓ 个人背景修改同步至「用户详情」/admin class=\"cover-photo\" 测试 100% 通过！");
    console.log("==================================================================");

  } catch (err) {
    console.error("❌ 测试失败:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
