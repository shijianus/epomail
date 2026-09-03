import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始设定页「常规 / 安全 / 标签」与 i18n Playwright 全链路测试 ===");
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
    if (loginData.code !== 200) {
      throw new Error("登录失败: " + JSON.stringify(loginData));
    }
    const token = loginData.data?.token;
    console.log("✓ 登录成功，获取 Token");

    // 2. 注入 Token 并打开应用 (中文模式)
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.goto(BASE + "/settings/profile", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".settings-nav-group .settings-nav-item", { timeout: 15000 });

    // 3. 验证中文模式下的侧边栏选项卡
    console.log("2. 验证中文模式下的侧边栏选项卡文案...");
    const navItems = page.locator(".settings-nav-group .settings-nav-item");
    const count = await navItems.count();
    console.log("找到 " + count + " 个设定选项卡");
    assert.strictEqual(count, 5, "设定组应包含 5 个选项卡：个资、常规、安全、资料、标签");

    const item0Text = (await navItems.nth(0).innerText()).trim();
    const item1Text = (await navItems.nth(1).innerText()).trim();
    const item2Text = (await navItems.nth(2).innerText()).trim();
    const item3Text = (await navItems.nth(3).innerText()).trim();
    const item4Text = (await navItems.nth(4).innerText()).trim();

    console.log(`Tab 0: "${item0Text}" (预期包含 "个资")`);
    console.log(`Tab 1: "${item1Text}" (预期包含 "常规")`);
    console.log(`Tab 2: "${item2Text}" (预期包含 "安全")`);
    console.log(`Tab 3: "${item3Text}" (预期包含 "资料")`);
    console.log(`Tab 4: "${item4Text}" (预期包含 "标签")`);

    assert.ok(item0Text.includes("个资") || item0Text.includes("个人"), "第1项必须为「个资」");
    assert.ok(item1Text.includes("常规"), "第2项必须为「常规」");
    assert.ok(item2Text.includes("安全"), "第3项必须为「安全」");
    assert.ok(item3Text.includes("资料"), "第4项必须为「资料」");
    assert.ok(item4Text.includes("标签"), "第5项必须为「标签」");

    // 4. 点击「常规」选项卡并验证内容
    console.log("3. 切换至「常规」选项卡...");
    await navItems.nth(1).click();
    await page.waitForTimeout(1500);

    const generalBodyText = await page.locator(".settings-content").innerText();
    assert.ok(generalBodyText.includes("个人简介"), "常规页应包含个人简介");
    assert.ok(generalBodyText.includes("外观色调") || generalBodyText.includes("暗色调"), "常规页应包含外观色调");
    assert.ok(generalBodyText.includes("全局主题壁纸") || generalBodyText.includes("个性装扮") || generalBodyText.includes("壁纸"), "常规页应包含壁纸设置");
    assert.ok(generalBodyText.includes("视图密度"), "常规页应包含视图密度");
    assert.ok(generalBodyText.includes("收件箱类型"), "常规页应包含收件箱类型");
    assert.ok(generalBodyText.includes("阅读窗格"), "常规页应包含阅读窗格");
    assert.ok(generalBodyText.includes("邮件会话模式"), "常规页应包含邮件会话模式");
    assert.ok(generalBodyText.includes("系统语言"), "常规页应包含系统语言");

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/screenshot_settings_general_zh.png" });
    console.log("✓ 中文「常规」页截图已保存");

    // 5. 点击「安全」选项卡并验证内容
    console.log("4. 切换至「安全」选项卡...");
    await navItems.nth(2).click();
    await page.waitForTimeout(1500);

    const securityTitles = await page.locator(".settings-content .title").allInnerTexts();
    console.log("安全页标题列表:", securityTitles);
    assert.ok(securityTitles.some(t => t.includes("安全设置")), "应包含「安全设置」主标题");
    assert.ok(securityTitles.some(t => t.includes("两步验证中心")), "应包含「两步验证中心」标题");
    assert.ok(securityTitles.some(t => t.includes("注销账号") || t.includes("删除账户")), "应包含「删除账户」或「注销账号」标题");

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/screenshot_settings_security_zh.png" });
    console.log("✓ 中文「安全」页截图已保存");

    // 6. 切换为英文语言模式
    console.log("5. 切换系统语言为英文...");
    await page.evaluate(() => {
      let setting = {};
      try {
        setting = JSON.parse(localStorage.getItem("setting") || "{}");
      } catch (e) {}
      localStorage.setItem("setting", JSON.stringify({ ...setting, lang: "en" }));
      localStorage.setItem("locale", "en");
    });
    await page.goto(BASE + "/settings/profile", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".settings-nav-group .settings-nav-item", { timeout: 15000 });
    await page.waitForTimeout(1000);

    const enNavItems = page.locator(".settings-nav-group .settings-nav-item");
    const enCount = await enNavItems.count();
    assert.strictEqual(enCount, 5, "英文模式下也必须有 5 个选项卡");

    const enItem0Text = (await enNavItems.nth(0).innerText()).trim();
    const enItem1Text = (await enNavItems.nth(1).innerText()).trim();
    const enItem2Text = (await enNavItems.nth(2).innerText()).trim();
    const enItem3Text = (await enNavItems.nth(3).innerText()).trim();
    const enItem4Text = (await enNavItems.nth(4).innerText()).trim();

    console.log(`EN Tab 0: "${enItem0Text}" (预期包含 "Profile")`);
    console.log(`EN Tab 1: "${enItem1Text}" (预期包含 "General")`);
    console.log(`EN Tab 2: "${enItem2Text}" (预期包含 "Security")`);
    console.log(`EN Tab 3: "${enItem3Text}" (预期包含 "Data")`);
    console.log(`EN Tab 4: "${enItem4Text}" (预期包含 "Labels")`);

    assert.ok(enItem0Text.includes("Profile"), "英文第1项必须为 Profile");
    assert.ok(enItem1Text.includes("General"), "英文第2项必须为 General");
    assert.ok(enItem2Text.includes("Security"), "英文第3项必须为 Security");
    assert.ok(enItem3Text.includes("Data"), "英文第4项必须为 Data");
    assert.ok(enItem4Text.includes("Labels"), "英文第5项必须为 Labels");

    // 验证英文 General 页
    await enNavItems.nth(1).click();
    await page.waitForTimeout(1500);
    const enGeneralBody = await page.locator(".settings-content").innerText();
    assert.ok(enGeneralBody.includes("Bio"), "英文页应包含 Bio");
    assert.ok(enGeneralBody.toLowerCase().includes("density"), "英文页应包含 Density");
    assert.ok(enGeneralBody.toLowerCase().includes("inbox type"), "英文页应包含 Inbox type");
    assert.ok(enGeneralBody.toLowerCase().includes("reading pane"), "英文页应包含 Reading pane");

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/screenshot_settings_general_en.png" });
    console.log("✓ 英文「General」页截图已保存");

    // 验证英文 Security 页
    await enNavItems.nth(2).click();
    await page.waitForTimeout(1500);

    const enSecurityTitles = await page.locator(".settings-content .title").allInnerTexts();
    console.log("英文 Security 页标题:", enSecurityTitles);
    assert.ok(enSecurityTitles.some(t => t.includes("Security Settings")), "英文 Security 主标题应为 Security Settings");

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/screenshot_settings_security_en.png" });
    console.log("✓ 英文「Security」页截图已保存");

    console.log("🎉 所有「常规 / 安全 / 标签」与 i18n 验证全部 100% 通过！");

  } catch (err) {
    console.error("测试失败:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
