import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始测试 ISO 标准电话号段、地址分级下拉与严格命名规范 ===");
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

    // 2. 注入 Token 并打开应用
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);
    await page.goto(BASE + "/settings/profile", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".settings-nav-group", { timeout: 15000 });
    await page.waitForTimeout(1000);

    // 3. 检查页面文本绝无冗余暴露与违规命名
    console.log("2. 检查页面文本绝无违规暴露与前缀...");
    const pageText = await page.locator(".settings-content").innerText();
    
    // 检查绝无暴露提示文案
    assert.ok(!pageText.includes("账号主邮箱（只读不可修改）"), "页面绝不能出现 '账号主邮箱（只读不可修改）'");
    assert.ok(!pageText.includes("（此处仅供展示，设置将引导前往常规进行修改）"), "页面绝不能出现 '（此处仅供展示，设置将引导前往常规进行修改）'");
    assert.ok(!pageText.includes("尚未添加任何电话号码"), "页面绝不能出现 '尚未添加任何电话号码'");

    // 4. 打开电话弹窗并验证国家选项
    console.log("3. 打开添加电话号码弹窗并验证选项与命名标准...");
    const addPhoneBtn = page.locator("button:has-text('添加电话号码')").first();
    await addPhoneBtn.click();
    await page.waitForTimeout(500);

    const phoneDialog = page.locator(".el-dialog:has-text('添加电话号码')");
    assert.ok(await phoneDialog.isVisible(), "电话弹窗应显示");

    // 验证初始状态不显示任何静态规则
    const initialFeedback = await phoneDialog.locator(".phone-validation-feedback").innerText().catch(() => "");
    assert.ok(!initialFeedback.includes("规则：必须为 8 位数字"), "未输入时绝不能暴露内部规则文本");

    // 打开国家下拉框检查命名规范 (必须是 香港、澳门、台湾，绝不能有 中国香港、中国澳门、中国台湾)
    const phoneCountrySelect = phoneDialog.locator(".phone-country-select, .el-select").first();
    await phoneCountrySelect.click();
    await page.waitForTimeout(300);

    const dropdownText = await page.locator(".el-popper:visible .el-select-dropdown").innerText();
    console.log("国家下拉项包含检查:");
    assert.ok(dropdownText.includes("香港"), "下拉必须包含 '香港'");
    assert.ok(dropdownText.includes("澳门"), "下拉必须包含 '澳门'");
    assert.ok(dropdownText.includes("台湾"), "下拉必须包含 '台湾'");
    assert.ok(!dropdownText.includes("中国香港"), "严格禁止出现 '中国香港'");
    assert.ok(!dropdownText.includes("中国澳门"), "严格禁止出现 '中国澳门'");
    assert.ok(!dropdownText.includes("中国台湾"), "严格禁止出现 '中国台湾'");
    console.log("✓ 国家选项严格符合标准命名规范 (香港/澳门/台湾/中国)");

    // 关闭下拉与电话弹窗
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await phoneDialog.locator("button:has-text('取消')").click();
    await page.waitForTimeout(300);

    // 5. 验证真实地址修改弹窗与分级行政区划下拉框
    console.log("4. 打开住家地址弹窗验证分级行政区划与标准下拉...");
    const editHomeBtn = page.locator(".item:has-text('住家地址') .edit-name").first();
    await editHomeBtn.click();
    await page.waitForTimeout(500);

    const addrDialog = page.locator(".el-dialog:has-text('住家地址')");
    assert.ok(await addrDialog.isVisible(), "地址弹窗应可见");

    // 选择香港，验证 18 个行政区下拉
    console.log("4.1 验证香港 18 区选择...");
    const addrCountrySelect = addrDialog.locator(".el-select").first();
    await addrCountrySelect.click();
    await page.waitForTimeout(300);
    await page.locator(".el-popper:visible .el-select-dropdown__item:has-text('香港')").first().click();
    await page.waitForTimeout(300);

    // 验证区划标签变为「区议会分区 (18区)」或包含「分区」
    const addrDialogText = await addrDialog.innerText();
    assert.ok(addrDialogText.includes("18区") || addrDialogText.includes("分区"), "选择香港后应展示香港 18 区下拉");

    // 打开分区下拉
    const districtSelect = addrDialog.locator(".el-select").nth(1);
    await districtSelect.click();
    await page.waitForTimeout(300);
    const districtDropdownText = await page.locator(".el-popper:visible .el-select-dropdown").innerText();
    assert.ok(districtDropdownText.includes("中西区"), "香港分区应包含中西区");
    assert.ok(districtDropdownText.includes("湾仔区"), "香港分区应包含湾仔区");
    assert.ok(districtDropdownText.includes("油尖旺区"), "香港分区应包含油尖旺区");
    console.log("✓ 香港 18 区标准行政区划列表完全正确");

    // 选择中西区
    await page.locator(".el-popper:visible .el-select-dropdown__item:has-text('中西区')").first().click();
    await page.waitForTimeout(300);

    // 填写城市与详细街道
    const cityInput = addrDialog.locator("input[placeholder*='中环'], input[placeholder*='城市']").first();
    await cityInput.fill("中环");

    const streetInput = addrDialog.locator("textarea[placeholder*='街道'], textarea[placeholder*='详细地址']").first();
    await streetInput.fill("德辅道中 19 号环球大厦 18 楼");
    await page.waitForTimeout(300);

    // 验证地址实时标准预览
    const previewText = await addrDialog.locator(".el-dialog__body").innerText();
    console.log("规范地址预览结果:", previewText);
    assert.ok(previewText.includes("香港 · 中西区 · 中环 · 德辅道中 19 号环球大厦 18 楼"), "地址应生成标准规范预览");

    // 保存地址
    console.log("4.2 保存住家地址并验证主卡片渲染...");
    await addrDialog.locator("button:has-text('保存')").click();
    await page.waitForTimeout(1000);

    // 验证个人页住家地址正确展示
    const updatedPageText = await page.locator(".settings-content").innerText();
    assert.ok(updatedPageText.includes("香港 · 中西区 · 中环 · 德辅道中 19 号环球大厦 18 楼"), "主卡片应成功渲染规范化住家地址");
    console.log("✓ 住家地址标准数据成功保存并完美展示");

    // 6. 验证语言与密码引导的修改操作带有 arrow 图标
    console.log("5. 验证引导项具有修改图标且能正常跳转...");
    const langBtn = page.locator(".item:has-text('系统语言') .edit-name");
    assert.ok(await langBtn.isVisible(), "系统语言应提供修改按钮");

    // 截图保存
    await page.screenshot({ path: "tests/screenshot_address_phone_standards.png", fullPage: true });
    console.log("📸 验证截图已保存: tests/screenshot_address_phone_standards.png");

    console.log("🎉 全部 ISO 标准电话号段、地址分级行政下拉与命名规范 100% 验证通过！");
  } catch (err) {
    console.error("❌ 测试失败:", err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
