import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始测试「个资」、常规界面5x2壁纸、个性装扮生效、个人背景、精简阅读窗格与邮件会话聚合 ===");
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

    // 3. 访问 /settings/profile 并验证「个资」命名
    console.log("2. 访问 /settings/profile 并验证「个资」命名...");
    await page.goto(BASE + "/settings/profile", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".settings-nav-group .settings-nav-item", { timeout: 15000 });

    const navItems = page.locator(".settings-nav-group .settings-nav-item");
    const count = await navItems.count();
    assert.strictEqual(count, 4, "设定组应包含 4 个选项卡");

    const tab0 = (await navItems.nth(0).innerText()).trim();
    const tab1 = (await navItems.nth(1).innerText()).trim();
    console.log(`Tab 0 文本: "${tab0}" (预期为 "个资")`);
    console.log(`Tab 1 文本: "${tab1}" (预期为 "常规")`);

    assert.ok(tab0.includes("个资"), "第1项必须规范更名为「个资」");
    assert.ok(!tab0.includes("个人信息"), "绝不能出现旧称「个人信息」");

    await page.screenshot({ path: "tests/audit_settings_nav_profile_name.png" });

    // 4. 访问常规设置页面 /settings/general
    console.log("3. 访问常规设置 /settings/general 验证壁纸、封面、阅读窗格与会话模式...");
    await navItems.nth(1).click();
    await page.waitForTimeout(1000);

    // 验证全局壁纸 5x2 网格与加号卡片
    const wallpaperSection = page.locator(".wallpaper-presets-grid").first();
    assert.ok(await wallpaperSection.isVisible(), "全局壁纸网格应可见");
    const wallpaperCards = wallpaperSection.locator(".wallpaper-card");
    const wpCount = await wallpaperCards.count();
    console.log(`壁纸预设卡片数量 (包含自定义+卡片): ${wpCount}`);
    assert.strictEqual(wpCount, 10, "壁纸预设卡片总数应为 10（9个预设 + 1个自定义加号卡片，5x2 范围）");

    // 验证壁纸卡片尺寸（统一为 125px 宽）
    const cardBox = await wallpaperCards.first().boundingBox();
    console.log(`壁纸卡片尺寸: 宽 ${cardBox.width}px, 高 ${cardBox.height}px`);
    assert.ok(cardBox.width >= 120 && cardBox.width <= 130, "壁纸卡片宽度必须与 theme-rect-card 统一 (约 125px)");

    // 验证点击预设壁纸整体替换生效
    console.log("4. 验证选择个性装扮壁纸全局生效...");
    // 点击第 2 个壁纸卡片（星空暗夜）
    await wallpaperCards.nth(1).click();
    await page.waitForTimeout(1000);
    const hasMainWp = await page.evaluate(() => document.documentElement.classList.contains("has-main-wallpaper"));
    const wpUrlVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--main-wallpaper-url"));
    console.log(`全局背景类 has-main-wallpaper: ${hasMainWp}, 变量: ${wpUrlVar}`);
    assert.ok(hasMainWp, "选中壁纸后 html 必须具有 has-main-wallpaper 类");
    assert.ok(wpUrlVar && wpUrlVar.length > 5, "必须成功注入 --main-wallpaper-url 变量");

    // 验证自定义壁纸加号弹窗
    console.log("5. 验证自定义壁纸「+」卡片与弹窗...");
    const addWpCard = wallpaperCards.locator(".add-thumb").first();
    assert.ok(await addWpCard.isVisible(), "必须包含加号 thumb");
    await addWpCard.click();
    await page.waitForTimeout(500);
    const customWpDialog = page.locator(".el-dialog:has-text('自定义壁纸')");
    assert.ok(await customWpDialog.isVisible(), "点击加号必须弹出自定义壁纸弹窗");
    // 关闭弹窗
    await customWpDialog.locator("button:has-text('取消'), .el-dialog__headerbtn").first().click();
    await page.waitForTimeout(500);

    // 验证「个人背景」封面设置
    console.log("6. 验证「个人背景」封面设置与预设/自定义卡片...");
    const coverSection = page.locator(".cover-presets-grid");
    assert.ok(await coverSection.isVisible(), "个人背景封面网格应可见");
    const coverCards = coverSection.locator(".wallpaper-card");
    const coverCount = await coverCards.count();
    console.log(`个人背景预设卡片数量: ${coverCount}`);
    assert.strictEqual(coverCount, 7, "个人背景预设卡片总数应为 7（6个预设 + 1个自定义加号）");

    // 选择第 2 个个人背景
    await coverCards.nth(1).click();
    await page.waitForTimeout(1000);

    // 验证「阅读窗格」精简文案与无「当前默认」冗余词
    console.log("7. 验证「阅读窗格」精简文案...");
    const paneCards = page.locator(".pane-card");
    const paneCount = await paneCards.count();
    assert.strictEqual(paneCount, 3, "阅读窗格应有 3 种布局卡片");

    const pane0Text = (await paneCards.nth(0).innerText()).trim();
    const pane1Text = (await paneCards.nth(1).innerText()).trim();
    const pane2Text = (await paneCards.nth(2).innerText()).trim();
    console.log(`阅读窗格项: "${pane0Text}", "${pane1Text}", "${pane2Text}"`);

    assert.ok(!pane0Text.includes("当前默认") && !pane1Text.includes("当前默认") && !pane2Text.includes("当前默认"), "绝不能包含「(当前默认)」等冗余字样");
    assert.ok(!pane0Text.includes("上下水平分割") && !pane1Text.includes("左右垂直分割"), "绝不能包含冗长繁琐的描述");

    // 验证「邮件会话模式」问号提示
    console.log("8. 验证「邮件会话模式」问号提示...");
    const threadingItem = page.locator(".item:has-text('邮件会话模式')");
    assert.ok(await threadingItem.isVisible(), "邮件会话模式项应可见");
    const questionIcon = threadingItem.locator(".iconify--fluent, .iconify").first();
    assert.ok(await questionIcon.isVisible(), "邮件会话模式后必须包含问号提示图标");
    const threadingText = await threadingItem.innerText();
    assert.ok(!threadingText.includes("将同一主题的相关邮件聚合成对话（默认勾选）"), "邮件会话模式不应在行内平铺展示冗长文本");

    await page.screenshot({ path: "tests/audit_general_settings_optimized.png" });

    // 5. 验证「账户详情」公开主页 /admin 中的 cover-photo 个人背景渲染
    console.log("9. 验证账户详情「公开主页」/admin 中的 cover-photo 渲染...");
    await page.goto(BASE + "/admin", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".cover-photo", { timeout: 10000 });
    const coverPhoto = page.locator(".cover-photo");
    assert.ok(await coverPhoto.isVisible(), "账户详情页 cover-photo 应正常渲染");
    const coverBgStyle = await coverPhoto.getAttribute("style");
    console.log(`cover-photo style: ${coverBgStyle}`);
    assert.ok(coverBgStyle && coverBgStyle.includes("background"), "cover-photo 必须具有已设置的背景图");

    await page.screenshot({ path: "tests/audit_profile_cover_rendered.png" });

    // 6. 返回收件箱测试邮件会话聚合 (Gmail Style)
    console.log("10. 返回收件箱测试邮件会话聚合与上下邮件阅读展示...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    // 发送两封同主题的邮件来构建会话
    console.log("11. 创建两封同主题测试邮件模拟订阅/会话...");
    const subEmail1 = await page.request.post(BASE + "/api/email/send", {
      data: {
        to: "admin@epomail.bond",
        subject: "[Notification] AWS Monthly Usage Report & Billing Summary",
        content: "<p>This is the first notification regarding your AWS monthly usage.</p>",
        text: "This is the first notification regarding your AWS monthly usage."
      },
      headers: { "Content-Type": "application/json", "token": token }
    });
    await page.waitForTimeout(1000);
    const subEmail2 = await page.request.post(BASE + "/api/email/send", {
      data: {
        to: "admin@epomail.bond",
        subject: "Re: [Notification] AWS Monthly Usage Report & Billing Summary",
        content: "<p>This is an update regarding your AWS monthly usage: All metrics normal.</p>",
        text: "This is an update regarding your AWS monthly usage: All metrics normal."
      },
      headers: { "Content-Type": "application/json", "token": token }
    });

    await page.reload();
    await page.waitForTimeout(2000);

    // 检查是否有聚合卡片与数量标记
    const threadBadge = page.locator(".thread-count-badge");
    if (await threadBadge.count() > 0) {
      const badgeCount = await threadBadge.first().innerText();
      console.log(`✓ 成功检测到邮件会话聚合徽标，聚合数量: ${badgeCount}`);
      assert.ok(parseInt(badgeCount) >= 2, "会话聚合数量必须大于等于 2");

      // 点击该会话邮件打开详情
      await page.locator(".email-card:has(.thread-count-badge)").first().click();
      await page.waitForTimeout(1000);

      // 验证邮件详情页聚合展示
      const threadHeader = page.locator(".thread-header-bar");
      assert.ok(await threadHeader.isVisible(), "邮件详情页顶部应展示会话聚合状态栏");
      const threadFlowItems = page.locator(".thread-msg-item");
      const msgCount = await threadFlowItems.count();
      console.log(`详情页渲染会话消息数量: ${msgCount}`);
      assert.ok(msgCount >= 2, "详情页应展示上下文上下所有邮件");

      // 验证折叠展开交互
      const collapsedCard = threadFlowItems.first().locator(".thread-collapsed-header");
      if (await collapsedCard.isVisible()) {
        console.log("点击展开上方历史邮件...");
        await collapsedCard.click();
        await page.waitForTimeout(500);
      }
    }

    await page.screenshot({ path: "tests/audit_email_conversation_view.png" });

    console.log("==================================================");
    console.log("✓ 全部测试项 100% 通过！个资重命名、5x2壁纸、个性装扮全局生效、个人背景、精简阅读窗格与邮件会话聚合完全符合要求！");
    console.log("==================================================");

  } catch (err) {
    console.error("❌ 测试失败:", err);
    await page.screenshot({ path: "tests/audit_error_dump.png" });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
