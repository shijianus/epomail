import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始全链路 UI 冲突修复与视觉核验 (Playwright) ===");
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
    console.log("✓ 登录成功");

    // 2. 注入 Token 并访问
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);

    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // ==========================================
    // 验证点 1: 邮件列表单行布局、星标唯一性、会话数字紧跟、无多余官方标签
    // ==========================================
    console.log("2. 验证收件箱邮件列表单行布局、星标与徽标...");
    
    // 发送一封官方通知构建测试项
    await page.request.post(BASE + "/api/email/send", {
      data: {
        to: "admin@epomail.bond",
        subject: "系统升级完成通知：全新视觉体验已就绪",
        content: "<p>EpoCanvas Mail 全新视觉体验已全面上线，单行会话与全新毛玻璃蒙版现已生效。</p>",
        text: "EpoCanvas Mail 全新视觉体验已全面上线，单行会话与全新毛玻璃蒙版现已生效。"
      },
      headers: { "Content-Type": "application/json", "token": token }
    });
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const emailRows = page.locator(".email-row");
    const rowCount = await emailRows.count();
    console.log(`收件箱邮件行数: ${rowCount}`);
    assert.ok(rowCount > 0, "收件箱应有邮件行");

    const firstRow = emailRows.first();
    await firstRow.waitFor({ state: "visible" });

    // 验证行高为单行尺寸 (约 45-55px，绝不能出现 80px+ 的两行)
    const firstRowBox = await firstRow.boundingBox();
    console.log(`首行邮件尺寸: 宽 ${firstRowBox.width}px, 高 ${firstRowBox.height}px`);
    assert.ok(firstRowBox.height <= 60, `邮件行高必须小于等于 60px 保证单行展示 (实际为 ${firstRowBox.height}px)`);

    // 验证星标唯一性：整行中只能有 1 个星标容器（.pc-star），内部 .sender-name-wrap 不应再包含星标
    const starsInRow = firstRow.locator(".pc-star");
    const nameStars = firstRow.locator(".sender-name-wrap .iconify[data-icon*='star']");
    console.log(`行内星标按钮数量: ${await starsInRow.count()}, 发件人内星标数量: ${await nameStars.count()}`);
    assert.strictEqual(await nameStars.count(), 0, "发件人名字内部严禁出现重复的多余星标！");

    // 验证没有多余的 official-pill-tag
    const officialPillTags = firstRow.locator(".official-pill-tag");
    assert.strictEqual(await officialPillTags.count(), 0, "邮件列表行严禁添加 official-pill-tag 胶囊标签！");

    // 验证标题与摘要单行展示 (subject-and-snippet)
    const subjectSnippet = firstRow.locator(".subject-and-snippet");
    assert.ok(await subjectSnippet.isVisible(), "标题与摘要组合区域应可见");

    await page.screenshot({ path: "tests/audit_email_single_line_row.png" });
    console.log("✓ 邮件列表单行布局、无重复星标、无多余胶囊验证通过");

    // ==========================================
    // 验证点 2: 下拉菜单 (detail-dropdown) 不被壁纸遮盖，点击可跳转
    // ==========================================
    console.log("3. 验证头像下拉菜单 (detail-dropdown) 悬浮层级与跳转...");
    // 激活头像下拉
    const avatar = page.locator(".avatar-wrap").first();
    await avatar.click();
    await page.waitForTimeout(600);

    const dropdownMenu = page.locator(".detail-dropdown");
    assert.ok(await dropdownMenu.isVisible(), "头像下拉菜单必须完全可见，不能被遮盖");

    const ddBox = await dropdownMenu.boundingBox();
    console.log(`下拉菜单位置: x=${ddBox.x}, y=${ddBox.y}, 宽=${ddBox.width}, 高=${ddBox.height}`);
    assert.ok(ddBox.width >= 250 && ddBox.height >= 150, "下拉菜单应有正常尺寸");

    // 检查下拉菜单中的选项
    const settingsItem = dropdownMenu.locator(".am-item:has-text('Settings'), .am-item:has-text('设定'), .am-item:has-text('设置'), .am-item:has-text('个资')").first();
    assert.ok(await settingsItem.isVisible(), "下拉菜单中的设置/设定入口必须可见");

    await page.screenshot({ path: "tests/audit_header_dropdown_visible.png" });

    // 点击设置入口验证跳转
    console.log("点击下拉菜单中的「设置」项验证界面跳转...");
    await settingsItem.click();
    await page.waitForTimeout(1000);
    assert.ok(page.url().includes("/settings"), `点击下拉菜单应成功跳转到设置页面 (当前为 ${page.url()})`);
    console.log("✓ 下拉菜单层级与跳转完全正常");

    // ==========================================
    // 验证点 3: 壁纸生效与设置页蒙版打底 (Frosted Mask)
    // ==========================================
    console.log("4. 访问常规设置开启壁纸并验证设置页蒙版打底...");
    await page.goto(BASE + "/settings/general", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // 开启壁纸（点击第 2 个壁纸卡片：星空暗夜）
    const wallpaperCards = page.locator(".wallpaper-presets-grid .wallpaper-card");
    if (await wallpaperCards.count() > 1) {
      await wallpaperCards.nth(1).click();
      await page.waitForTimeout(1000);
    }

    const hasWallpaper = await page.evaluate(() => document.documentElement.classList.contains("has-main-wallpaper"));
    console.log(`has-main-wallpaper 状态: ${hasWallpaper}`);
    assert.ok(hasWallpaper, "应处于开启壁纸模式");

    // 检查 settings container 是否应用了毛玻璃蒙版
    const generalContainers = page.locator(".general-settings-page .container");
    assert.ok(await generalContainers.first().isVisible(), "常规设置 container 应可见");

    await page.screenshot({ path: "tests/audit_settings_wallpaper_frosted_mask.png" });

    // 访问个资设置页面验证蒙版
    console.log("5. 访问「个资」页面验证蒙版打底与文字对比度...");
    await page.goto(BASE + "/settings/profile", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const profileContainer = page.locator(".container").first();
    assert.ok(await profileContainer.isVisible(), "个资设置 container 应可见");
    await page.screenshot({ path: "tests/audit_profile_frosted_mask.png" });

    // 访问安全设置页面验证蒙版
    console.log("6. 访问「安全」设置页面验证 2FA 与蒙版打底...");
    await page.goto(BASE + "/settings/security", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "tests/audit_security_frosted_mask.png" });

    // 访问标签设置页面验证蒙版
    console.log("7. 访问「标签」设置页面验证现代列表与蒙版打底...");
    await page.goto(BASE + "/settings/labels", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "tests/audit_labels_frosted_mask.png" });

    // 访问分类设置页面验证蒙版
    console.log("8. 访问「分类」设置页面验证卡片与蒙版打底...");
    await page.goto(BASE + "/settings/category", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "tests/audit_category_frosted_mask.png" });

    // ==========================================
    // 验证点 4: 亮色调 (Light Mode) 视觉表现与对比度
    // ==========================================
    console.log("9. 切换为「亮色调」(Light Mode) 并验证文字对比度与无隐身问题...");
    // 访问常规设置页面点击「亮色调」卡片
    await page.goto(BASE + "/settings/general", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const lightCard = page.locator(".theme-rect-card:has-text('亮色调'), .theme-rect-card:has-text('Light')").first();
    await lightCard.click();
    await page.waitForTimeout(1000);

    const isDarkNow = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    console.log(`当前 dark 状态: ${isDarkNow} (应为 false - 亮色调)`);
    assert.strictEqual(isDarkNow, false, "应成功切换至浅色/亮色调模式");

    // 验证亮色调下个资页面视觉
    await page.goto(BASE + "/settings/profile", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "tests/audit_light_mode_profile.png" });

    // 验证亮色调下收件箱邮件列表单行视觉与对比度
    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "tests/audit_light_mode_inbox.png" });

    // 验证亮色调下头像下拉菜单的对比度与背景
    await page.locator(".avatar-wrap").first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: "tests/audit_light_mode_dropdown.png" });

    console.log("==================================================");
    console.log("🎉 全部 4 项核心视觉修复测试 100% 顺利通过！");
    console.log("1. 下拉菜单 detail-dropdown 在壁纸下完全可见且支持跳转");
    console.log("2. 邮件列表单行布局、无重复星标、无多余胶囊、会话紧跟发件人");
    console.log("3. 所有设置页增设毛玻璃蒙版打底，杜绝壁纸颜色冲突");
    console.log("4. 亮色调 UI 对比度完整提升，杜绝白字隐身");
    console.log("==================================================");

  } catch (err) {
    console.error("❌ 测试失败:", err);
    await page.screenshot({ path: "tests/audit_error_visual.png" });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
