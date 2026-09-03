import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始「资料」分区 (Data Settings Partition) 全链路 Playwright 自动化审计测试 ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER UNCAUGHT ERROR:', err));

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

    // 3. 进入设置页，验证侧边栏导航项与精确位置
    console.log("2. 导航至设定页，验证导航列表顺序...");
    await page.goto(BASE + "/settings/profile", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".settings-nav-group .settings-nav-item", { timeout: 15000 });

    const navItems = page.locator(".settings-nav-group .settings-nav-item");
    const count = await navItems.count();
    console.log("找到 " + count + " 个个人设定选项卡");
    assert.strictEqual(count, 5, "设定组必须严格包含 5 个选项卡：个资、常规、安全、资料、标签");

    const item0Text = (await navItems.nth(0).innerText()).trim();
    const item1Text = (await navItems.nth(1).innerText()).trim();
    const item2Text = (await navItems.nth(2).innerText()).trim();
    const item3Text = (await navItems.nth(3).innerText()).trim();
    const item4Text = (await navItems.nth(4).innerText()).trim();

    console.log(`Tab 0: "${item0Text}" (个资)`);
    console.log(`Tab 1: "${item1Text}" (常规)`);
    console.log(`Tab 2: "${item2Text}" (安全)`);
    console.log(`Tab 3: "${item3Text}" (资料 - 严格在安全之下、标签之上)`);
    console.log(`Tab 4: "${item4Text}" (标签)`);

    assert.ok(item0Text.includes("个资") || item0Text.includes("个人"), "第1项必须为「个资」");
    assert.ok(item1Text.includes("常规"), "第2项必须为「常规」");
    assert.ok(item2Text.includes("安全"), "第3项必须为「安全」");
    assert.ok(item3Text.includes("资料"), "第4项必须为「资料」");
    assert.ok(item4Text.includes("标签"), "第5项必须为「标签」");

    // 4. 点击「资料」选项卡并验证路由和高亮
    console.log("3. 点击「资料」选项卡...");
    await navItems.nth(3).click();
    await page.waitForTimeout(1500);
    assert.ok(page.url().includes("/settings/data"), "当前路由应包含 /settings/data");

    const activeItemText = (await page.locator(".settings-nav-item.active").innerText()).trim();
    console.log(`当前激活导航项: "${activeItemText}"`);
    assert.ok(activeItemText.includes("资料"), "激活的导航项必须为「资料」");

    // 5. 验证「资料」页面 4 大核心模块
    console.log("4. 验证「资料」页面 4 大核心模块内容...");
    const content = page.locator(".settings-content");
    const fullText = await content.innerText();

    // Section 1: 数据汇出
    assert.ok(fullText.includes("用户资料与数据汇出"), "应包含「用户资料与数据汇出」标题");
    assert.ok(fullText.includes("全量数据"), "应包含全量数据备份选项");
    assert.ok(fullText.includes("邮件历史归档"), "应包含邮件历史归档选项");
    assert.ok(fullText.includes("通讯录与配置"), "应包含通讯录与配置选项");

    // Section 2: 邮件与消息转发 (Merged Telegram Push & Email Forwarding)
    assert.ok(fullText.includes("邮件与消息转发") || fullText.includes("邮件规则转发"), "应包含「邮件与消息转发」标题");
    assert.ok(fullText.includes("Telegram 消息推送") || fullText.includes("Telegram 机器人"), "应包含「Telegram 消息推送」项");
    assert.ok(fullText.includes("全部邮件直接抄送转发") || fullText.includes("抄送转发") || fullText.includes("启用自动邮件转发"), "应包含转发选项");

    // 开启自动转发，展示转发详细选项
    const fwSwitch = page.locator(".forward-toggle-row .el-switch");
    if (!(await fwSwitch.evaluate(el => el.classList.contains('is-checked')))) {
      await fwSwitch.click();
      await page.waitForTimeout(500);
    }

    // 截图保存（中文浅色完整模式）
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_data_settings_zh.png", fullPage: true });
    console.log("✓ 中文「资料」设置页完整审计截图已保存: tests/audit_data_settings_zh.png");

    // 6. 测试交互：点击 Telegram 设置按钮唤起弹窗并配置保存
    console.log("5. 测试个人 Telegram 设置按钮与弹窗配置保存...");
    const tgSetBtn = page.locator(".tg-push-item .opt-button");
    await tgSetBtn.click();
    await page.waitForSelector(".forward-dialog", { timeout: 5000 });
    console.log("✓ 成功唤起个人 Telegram 机器人配置弹窗");

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_tg_modal_open.png" });
    console.log("✓ TG 弹窗截图已保存: tests/audit_tg_modal_open.png");

    const tgDialogText = await page.locator(".forward-dialog").innerText();
    assert.ok(tgDialogText.includes("个人 Telegram 机器人配置") || tgDialogText.includes("Telegram"), "弹窗应包含标题");
    assert.ok(tgDialogText.includes("Bot Token"), "弹窗应包含 Bot Token 字段");
    assert.ok(tgDialogText.includes("Chat ID"), "弹窗应包含 Chat ID 字段");

    const tokenInput = page.locator(".forward-dialog input[type='password']");
    await tokenInput.fill("123456789:AAFakeTokenTestForEpoMailAuditing");

    const chatIdInput = page.locator(".forward-dialog input[placeholder*='987654321']").first();
    await chatIdInput.fill("987654321");

    const saveTgBtn = page.locator(".forward-dialog .el-dialog__footer .el-button--primary, .forward-dialog .el-button--primary").last();
    await saveTgBtn.click();
    await page.waitForTimeout(1000);
    console.log("✓ 个人 Telegram 设置成功在弹窗中提交保存");

    // 清理重置个人 Telegram 设置为空和禁用，严禁残留测试虚假数据
    await page.request.put(BASE + "/api/my/updateProfile", {
      data: {
        personalTelegram: {
          enabled: false,
          botToken: "",
          chatId: "",
          topicId: "",
          mode: "privacy",
          notifyCodeOnly: true,
          includePreview: true
        }
      },
      headers: { "Content-Type": "application/json", "Authorization": token }
    });
    console.log("✓ 个人 Telegram 设置已完全重置为空与未启用状态");

    // 8. 切换为暗色调模式并截图
    console.log("7. 验证暗色调 (Dark Mode) 下的视觉呈现...");
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_data_settings_dark.png", fullPage: true });
    console.log("✓ 暗色调「资料」设置页完整审计截图已保存: tests/audit_data_settings_dark.png");

    // 9. 切换为英文模式验证 i18n
    console.log("8. 切换为英文环境 (i18n 验证)...");
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      let setting = {};
      try { setting = JSON.parse(localStorage.getItem("setting") || "{}"); } catch(e) {}
      localStorage.setItem("setting", JSON.stringify({ ...setting, lang: "en" }));
      localStorage.setItem("locale", "en");
    });
    await page.goto(BASE + "/settings/data", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const enNavItems = page.locator(".settings-nav-group .settings-nav-item");
    const enCount = await enNavItems.count();
    assert.strictEqual(enCount, 5, "英文模式下也必须有 5 个选项卡");

    const enTab3Text = (await enNavItems.nth(3).innerText()).trim();
    console.log(`EN Tab 3: "${enTab3Text}" (预期包含 "Data")`);
    assert.ok(enTab3Text.includes("Data"), "英文第4项必须为 Data");

    const enFullText = await page.locator(".settings-content").innerText();
    assert.ok(enFullText.includes("User Data & Mail Export"), "英文应包含 User Data & Mail Export");
    assert.ok(enFullText.includes("Email & Message Forwarding") || enFullText.includes("Email Forwarding"), "英文应包含 Email & Message Forwarding");
    assert.ok(enFullText.includes("Telegram Message Push") || enFullText.includes("Telegram Bot") || enFullText.includes("Telegram"), "英文应包含 Telegram 消息推送");

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_data_settings_en.png", fullPage: true });
    console.log("✓ 英文「Data」设置页完整审计截图已保存: tests/audit_data_settings_en.png");

    console.log("🎉 所有「资料」分区 (Data Settings Partition) 自动化测试全部 100% 通过！");

  } catch (err) {
    console.error("测试失败:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
