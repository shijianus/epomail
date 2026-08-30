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
    await page.goto(BASE + "/settings/profile", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // 3. 验证中文模式下的侧边栏选项卡
    console.log("2. 验证中文模式下的侧边栏选项卡文案...");
    const navItems = page.locator(".settings-nav-group .settings-nav-item");
    const count = await navItems.count();
    console.log("找到 " + count + " 个设定选项卡");
    assert.strictEqual(count, 3, "设定组应包含 3 个选项卡：常规、安全、标签");

    const item0Text = (await navItems.nth(0).innerText()).trim();
    const item1Text = (await navItems.nth(1).innerText()).trim();
    const item2Text = (await navItems.nth(2).innerText()).trim();

    console.log(`Tab 0: "${item0Text}" (预期包含 "常规")`);
    console.log(`Tab 1: "${item1Text}" (预期包含 "安全")`);
    console.log(`Tab 2: "${item2Text}" (预期包含 "标签")`);

    assert.ok(item0Text.includes("常规"), "第1项必须为「常规」");
    assert.ok(item1Text.includes("安全"), "第2项必须为「安全」");
    assert.ok(item2Text.includes("标签"), "第3项必须为「标签」");

    // 4. 验证「常规」页内容 (基本信息 / 个性装扮 / 数据隐私)
    console.log("3. 验证「常规」页面内容...");
    const generalTitles = await page.locator(".settings-content .title").allInnerTexts();
    console.log("常规页包含标题:", generalTitles);
    assert.ok(generalTitles.some(t => t.includes("基本信息")), "常规页应包含「基本信息」");
    assert.ok(generalTitles.some(t => t.includes("个性装扮")), "常规页应包含「个性装扮」");
    assert.ok(generalTitles.some(t => t.includes("数据隐私")), "常规页应包含「数据隐私」");

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/screenshot_settings_general_zh.png" });
    console.log("✓ 中文「常规」页截图已保存");

    // 5. 点击「安全」选项卡并验证页面内容
    console.log("4. 切换至「安全」选项卡...");
    await navItems.nth(1).click();
    await page.waitForTimeout(1500);

    const securityTitles = await page.locator(".settings-content .title").allInnerTexts();
    console.log("安全页包含标题:", securityTitles);
    assert.ok(securityTitles.some(t => t.includes("安全设置")), "安全页主标题应为「安全设置」");

    const securityBodyText = await page.locator(".settings-content").innerText();
    assert.ok(securityBodyText.includes("密码") || securityBodyText.includes("修改密码"), "安全页应包含修改密码");
    assert.ok(securityBodyText.includes("语言"), "安全页应包含语言设置");
    assert.ok(securityBodyText.includes("删除账户"), "安全页应包含删除账户");

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/screenshot_settings_security_zh.png" });
    console.log("✓ 中文「安全」页截图已保存");

    // 6. 点击「标签」选项卡并验证
    console.log("5. 切换至「标签」选项卡...");
    await navItems.nth(2).click();
    await page.waitForTimeout(1500);

    const labelTitle = await page.locator(".page-title").innerText();
    console.log("标签页主标题:", labelTitle);
    assert.ok(labelTitle.includes("标签设置"), "标签页标题应为「标签设置」");

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/screenshot_settings_labels_zh.png" });
    console.log("✓ 中文「标签」页截图已保存");

    // 7. 切换至英文模式测试 i18n
    console.log("6. 切换为英文语言环境 (i18n 验证)...");
    await page.evaluate(() => {
      let setting = {};
      try { setting = JSON.parse(localStorage.getItem("setting") || "{}"); } catch(e) {}
      localStorage.setItem("setting", JSON.stringify({ ...setting, lang: "en" }));
      localStorage.setItem("locale", "en");
    });
    await page.goto(BASE + "/settings/profile", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    const enNavItems = page.locator(".settings-nav-group .settings-nav-item");
    const enItem0Text = (await enNavItems.nth(0).innerText()).trim();
    const enItem1Text = (await enNavItems.nth(1).innerText()).trim();
    const enItem2Text = (await enNavItems.nth(2).innerText()).trim();

    console.log(`EN Tab 0: "${enItem0Text}" (预期包含 "General")`);
    console.log(`EN Tab 1: "${enItem1Text}" (预期包含 "Security")`);
    console.log(`EN Tab 2: "${enItem2Text}" (预期包含 "Labels")`);

    assert.ok(enItem0Text.includes("General"), "英文第1项必须为 General");
    assert.ok(enItem1Text.includes("Security"), "英文第2项必须为 Security");
    assert.ok(enItem2Text.includes("Labels"), "英文第3项必须为 Labels");

    // 验证英文 General 页
    const enGeneralTitles = await page.locator(".settings-content .title").allInnerTexts();
    console.log("英文 General 页标题:", enGeneralTitles);
    assert.ok(enGeneralTitles.some(t => t.includes("Basic Information")), "英文页应包含 Basic Information");
    assert.ok(enGeneralTitles.some(t => t.includes("Visual & Media")), "英文页应包含 Visual & Media");
    assert.ok(enGeneralTitles.some(t => t.includes("Data Privacy")), "英文页应包含 Data Privacy");

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/screenshot_settings_general_en.png" });
    console.log("✓ 英文「General」页截图已保存");

    // 验证英文 Security 页
    await enNavItems.nth(1).click();
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
