import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始测试「个人 (Profile)」与「常规 (General)」全功能与 Gmail 视图体系 ===");
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

    // 2. 注入 Token 并打开应用
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // 3. 访问 /settings/profile 并验证 4 个选项卡
    console.log("2. 访问 /settings/profile 并验证设定选项卡...");
    await page.goto(BASE + "/settings/profile", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".settings-nav-group .settings-nav-item", { timeout: 15000 });

    const navItems = page.locator(".settings-nav-group .settings-nav-item");
    const count = await navItems.count();
    console.log(`设定选项卡数量: ${count}`);
    assert.strictEqual(count, 4, "设定组应包含 4 个选项卡：个人、常规、安全、标签");

    const tab0 = (await navItems.nth(0).innerText()).trim();
    const tab1 = (await navItems.nth(1).innerText()).trim();
    const tab2 = (await navItems.nth(2).innerText()).trim();
    const tab3 = (await navItems.nth(3).innerText()).trim();

    console.log(`Tab 0: "${tab0}" (预期包含 "个人")`);
    console.log(`Tab 1: "${tab1}" (预期包含 "常规")`);
    console.log(`Tab 2: "${tab2}" (预期包含 "安全")`);
    console.log(`Tab 3: "${tab3}" (预期包含 "标签")`);

    assert.ok(tab0.includes("个人"), "第1项必须为「个人」");
    assert.ok(tab1.includes("常规"), "第2项必须为「常规」");
    assert.ok(tab2.includes("安全"), "第3项必须为「安全」");
    assert.ok(tab3.includes("标签"), "第4项必须为「标签」");

    // 4. 验证「个人」页 (个资) 核心元素
    console.log("3. 验证「个人」个资页面内容...");
    const profilePageText = await page.locator(".settings-content").innerText();
    assert.ok(profilePageText.includes("个人资料照片") || profilePageText.includes("基本信息"), "应包含基本信息/个人资料照片");
    assert.ok(profilePageText.includes("名称") || profilePageText.includes("个人昵称"), "应包含名称/个人昵称");
    assert.ok(profilePageText.includes("性别"), "应包含性别");
    assert.ok(profilePageText.includes("生日"), "应包含生日");
    assert.ok(profilePageText.includes("电子邮件"), "应包含电子邮件");
    assert.ok(profilePageText.includes("电话"), "应包含电话");
    assert.ok(profilePageText.includes("住家地址"), "应包含住家地址");
    assert.ok(profilePageText.includes("公司地址"), "应包含公司地址");
    assert.ok(profilePageText.includes("其他地址"), "应包含其他地址");
    assert.ok(profilePageText.includes("语言"), "应包含语言展示");
    assert.ok(profilePageText.includes("EpoCanvas 密码") || profilePageText.includes("密码"), "应包含EpoCanvas密码");

    // 验证电子邮件只读展示 (包含用户主邮箱且无修改按钮)
    assert.ok(profilePageText.includes("admin@epomail.bond"), "电子邮箱应展示当前用户邮箱");
    const emailItemText = await page.locator(".item:has-text('电子邮件')").innerText();
    assert.ok(!emailItemText.includes("只读不可修改"), "不应暴露多余冗余解释文本");

    // 5. 验证电话号码严格格式校验与 HK 8 位规则
    console.log("4. 验证添加电话号码弹窗与 HK 8位校验规则...");
    const addPhoneBtn = page.locator("button:has-text('添加电话号码')");
    assert.ok(await addPhoneBtn.isVisible(), "应包含「添加电话号码」按钮");
    await addPhoneBtn.click();
    await page.waitForTimeout(500);

    const phoneDialog = page.locator(".el-dialog:has-text('添加电话号码')");
    assert.ok(await phoneDialog.isVisible(), "添加电话号码弹窗应可见");

    // 切换到香港以测试特定 HK 8位验证与 11 位拦截规则
    const countrySelect = phoneDialog.locator(".phone-country-select, .el-select").first();
    await countrySelect.click();
    await page.waitForTimeout(300);
    const hkOption = page.locator(".el-select-dropdown__item:has-text('香港')").first();
    if (await hkOption.isVisible()) {
      await hkOption.click();
      await page.waitForTimeout(300);
    }

    // 验证初始状态下绝不暴露静态内部规则文案
    const initialFeedback = await phoneDialog.locator(".phone-validation-feedback").innerText().catch(() => "");
    assert.ok(!initialFeedback.includes("规则：必须为 8 位数字"), "未输入时绝不暴露内部要求规则文本");

    // 输入 11 位 HK 号码
    const phoneInput = phoneDialog.locator(".phone-number-input input, input[placeholder*='91234567'], input[placeholder*='电话号码']").first();
    await phoneInput.fill("12345678901");
    await page.waitForTimeout(300);

    const errorFeedback = await phoneDialog.locator(".phone-validation-feedback").innerText();
    console.log("11位HK号码校验反馈:", errorFeedback);
    assert.ok(errorFeedback.includes("8 位") || errorFeedback.includes("11 位"), "必须阻止输入 11 位 HK 号码并给出精确提示");

    // 输入合规 8 位 HK 号码
    await phoneInput.fill("91234567");
    await page.waitForTimeout(300);
    const validFeedback = await phoneDialog.locator(".phone-validation-feedback").innerText();
    console.log("8位HK号码校验反馈:", validFeedback);
    assert.ok(validFeedback.includes("正确") || validFeedback.includes("+852 9123 4567"), "合规8位HK号码应通过校验并格式化预览");

    // 关闭电话弹窗
    await phoneDialog.locator("button:has-text('取消')").click();
    await page.waitForTimeout(300);

    // 验证标准分级地址选择弹窗
    console.log("4.1 验证标准分级地址选择弹窗 (ISO 标准与区划下拉)...");
    const editHomeAddrBtn = page.locator(".item:has-text('住家地址') .edit-name");
    await editHomeAddrBtn.click();
    await page.waitForTimeout(500);
    const addrDialog = page.locator(".el-dialog:has-text('住家地址')");
    assert.ok(await addrDialog.isVisible(), "地址修改弹窗应可见");
    const addrDialogText = await addrDialog.innerText();
    assert.ok(addrDialogText.includes("国家 / 地区"), "应包含国家/地区下拉框");
    assert.ok(addrDialogText.includes("详细地址"), "应包含详细地址输入框");
    // 关闭地址弹窗
    await addrDialog.locator("button:has-text('取消')").click();
    await page.waitForTimeout(300);

    // 6. 验证语言跳转引导至常规设置
    console.log("5. 验证语言跳转引导至常规设置...");
    const langGuideBtn = page.locator(".item:has-text('系统语言') .edit-name, button:has-text('前往常规设置')").first();
    await langGuideBtn.click();
    await page.waitForTimeout(1500);
    assert.ok(page.url().includes("/settings/general"), "点击语言设置后应成功导航至 /settings/general");

    // 7. 验证「常规」页全部 Gmail 体系功能
    console.log("6. 验证「常规」页 Gmail 视图与主题美化...");
    const generalText = await page.locator(".settings-content").innerText();
    assert.ok(generalText.includes("个人简介"), "常规页应包含个人简介");
    assert.ok(generalText.includes("外观色调"), "常规页应包含外观色调 (暗/亮/跟随系统)");
    assert.ok(generalText.includes("主栏底层图片设置") || generalText.includes("面板美化"), "常规页应包含主栏底层图片设置");
    assert.ok(generalText.includes("视图密度") || generalText.includes("Density"), "常规页应包含视图密度 (Density)");
    assert.ok(generalText.includes("收件箱类型") || generalText.includes("Inbox type"), "常规页应包含收件箱类型");
    assert.ok(generalText.includes("阅读窗格") || generalText.includes("Reading pane"), "常规页应包含阅读窗格");
    assert.ok(generalText.includes("邮件会话模式") || generalText.includes("对话视图"), "常规页应包含邮件会话模式 (Conversation view)");

    // 验证预设主题卡片数量
    const wallpaperCards = page.locator(".wallpaper-presets-grid .wallpaper-card");
    const wpCount = await wallpaperCards.count();
    console.log(`主栏壁纸预设卡片数量: ${wpCount}`);
    assert.ok(wpCount >= 6, "应内置至少 6 组精选主栏壁纸主题");

    // 验证收件箱类型包含全部 6 项
    assert.ok(generalText.includes("默认收件箱"), "应包含默认收件箱");
    assert.ok(generalText.includes("重要邮件优先"), "应包含重要邮件优先");
    assert.ok(generalText.includes("未读邮件优先"), "应包含未读邮件优先");
    assert.ok(generalText.includes("星标邮件优先"), "应包含星标邮件优先");
    assert.ok(generalText.includes("优先收件箱"), "应包含优先收件箱");
    assert.ok(generalText.includes("多收件箱"), "应包含多收件箱");

    // 验证自定义弹窗
    console.log("7. 验证收件箱类型自定义弹窗...");
    const customizeButtons = page.locator(".inbox-type-row .customize-btn");
    assert.ok(await customizeButtons.count() >= 2, "应提供收件箱自定义按钮");

    // 点击默认收件箱的自定义
    await customizeButtons.first().click();
    await page.waitForTimeout(500);
    const defaultDialog = page.locator(".el-dialog:has-text('自定义收件箱设置')");
    assert.ok(await defaultDialog.isVisible(), "默认收件箱自定义弹窗应打开");
    await defaultDialog.locator("button:has-text('取消')").click();
    await page.waitForTimeout(300);

    // 8. 验证个资页「修改密码」跳转到安全界面并打开弹窗
    console.log("8. 验证密码引导至安全界面...");
    await navItems.nth(0).click(); // 返回个人
    await page.waitForTimeout(1000);

    const changePwdGuideBtn = page.locator("button:has-text('修改密码')").first();
    await changePwdGuideBtn.click();
    await page.waitForTimeout(1500);

    assert.ok(page.url().includes("/settings/security"), "点击修改密码后应导航至 /settings/security");
    const pwdModal = page.locator(".el-dialog:has-text('修改密码')");
    assert.ok(await pwdModal.isVisible(), "安全界面应自动弹出修改密码对话框");

    await page.screenshot({ path: "tests/screenshot_profile_general_verified.png", fullPage: true });
    console.log("📸 截图已保存: tests/screenshot_profile_general_verified.png");

    console.log("\n🎉 全部「个人信息 (Profile)」与「常规 (General)」全功能端到端测试 100% 验证通过！");
  } finally {
    await browser.close();
  }
})();
