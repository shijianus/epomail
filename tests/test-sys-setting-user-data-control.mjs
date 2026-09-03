import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始「系统设置」用户资料控制卡片与「资料」分区权限 Playwright 自动化测试 ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err));

  const BASE = "https://epomail.epocanvas.workers.dev";

  try {
    // 1. 登录管理员
    console.log("1. 正在登录 Cloudflare 生产环境...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.token;
    assert(token, "登录未返回 Token");

    // Helper: 更新系统设置
    async function updateSystemSetting(settingsObj) {
      const res = await page.request.put(BASE + "/api/setting/set", {
        data: settingsObj,
        headers: { "Content-Type": "application/json", "Authorization": token }
      });
      const data = await res.json();
      assert(data.code === 200, "更新系统设置失败: " + JSON.stringify(data));
    }

    await page.goto(BASE + "/settings/data", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);

    // ==========================================
    // 2. 验证管理员「系统设置」中新增的用户资料控制卡片
    // ==========================================
    console.log("2. 进入系统设置，验证「用户资料控制」卡片...");
    await updateSystemSetting({ 
      allMailMode: 1,
      userTgForward: 1, 
      userEmailForward: 1, 
      userApiSupport: 1 
    });

    await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const sysNavTab = page.locator(".settings-nav-item").filter({ hasText: "系统设置" }).first();
    await sysNavTab.click();
    await page.waitForTimeout(1500);

    const dataControlCard = page.locator(".settings-card.user-data-control-card, .settings-card").filter({ hasText: "用户资料控制" });
    assert.ok(await dataControlCard.count() > 0, "系统设置中必须存在「用户资料控制」卡片");

    const tgSettingItem = dataControlCard.locator(".setting-item").filter({ hasText: "用户 Telegram 推送" });
    const emailFwSettingItem = dataControlCard.locator(".setting-item").filter({ hasText: "用户邮件规则转发" });
    const apiSettingItem = dataControlCard.locator(".setting-item").filter({ hasText: "第三方 API 支援" });

    assert.ok(await tgSettingItem.count() > 0, "必须包含「用户 Telegram 推送」设置项");
    assert.ok(await emailFwSettingItem.count() > 0, "必须包含「用户邮件规则转发」设置项");
    assert.ok(await apiSettingItem.count() > 0, "必须包含「第三方 API 支援」设置项");

    console.log("✓ 系统设置「用户资料控制」卡片与 3 大开关项渲染正常");
    await page.screenshot({ path: "tests/audit_sys_setting_user_data_control.png" });

    // ==========================================
    // 3. 测试场景 A: 全量开启 (1, 1, 1)
    // ==========================================
    console.log("3. 测试场景 A: 全部开关开启 (1, 1, 1)...");
    await updateSystemSetting({ userTgForward: 1, userEmailForward: 1, userApiSupport: 1 });
    await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    assert.ok(await page.locator(".container.export-container").count() > 0, "资料汇出容器 export-container 必须存在");
    assert.ok(await page.locator(".container.forwarding-container").count() > 0, "邮件与消息转发容器 forwarding-container 应存在");
    assert.ok(await page.locator(".item.tg-push-item").count() > 0, "TG 推送项应存在");
    assert.ok(await page.locator(".forwarding-rule-section").count() > 0, "邮件规则转发区域应存在");
    assert.ok(await page.locator(".container.api-container").count() > 0, "开发者 API 容器 api-container 应存在");
    console.log("✓ 场景 A (全量开启) 校验通过");
    await page.screenshot({ path: "tests/audit_data_page_all_enabled.png" });

    // ==========================================
    // 4. 测试场景 B: 仅关闭 TG 消息推送 (0, 1, 1)
    // ==========================================
    console.log("4. 测试场景 B: 关闭用户 TG 推送 (0, 1, 1)...");
    await updateSystemSetting({ userTgForward: 0, userEmailForward: 1, userApiSupport: 1 });
    await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    assert.ok(await page.locator(".container.export-container").count() > 0, "export-container 必须直接允许");
    assert.ok(await page.locator(".container.forwarding-container").count() > 0, "forwarding-container 仍应存在 (因为邮件转发开启)");
    assert.strictEqual(await page.locator(".item.tg-push-item").count(), 0, "TG 推送项应隐藏");
    assert.ok(await page.locator(".forwarding-rule-section").count() > 0, "邮件规则转发应保留");
    assert.ok(await page.locator(".container.api-container").count() > 0, "api-container 仍应存在");
    console.log("✓ 场景 B (关闭 TG 推送) 校验通过");

    // ==========================================
    // 5. 测试场景 C: 仅关闭邮件规则转发 (1, 0, 1)
    // ==========================================
    console.log("5. 测试场景 C: 关闭用户邮件规则转发 (1, 0, 1)...");
    await updateSystemSetting({ userTgForward: 1, userEmailForward: 0, userApiSupport: 1 });
    await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    assert.ok(await page.locator(".container.export-container").count() > 0, "export-container 必须直接允许");
    assert.ok(await page.locator(".container.forwarding-container").count() > 0, "forwarding-container 仍应存在 (因为 TG 开启)");
    assert.ok(await page.locator(".item.tg-push-item").count() > 0, "TG 推送项应保留");
    assert.strictEqual(await page.locator(".forwarding-rule-section").count(), 0, "邮件规则转发区域应隐藏");
    assert.ok(await page.locator(".container.api-container").count() > 0, "api-container 仍应存在");
    console.log("✓ 场景 C (关闭邮件转发) 校验通过");

    // ==========================================
    // 6. 测试场景 D: 同时关闭 TG 与邮件转发 (0, 0, 1)
    // ==========================================
    console.log("6. 测试场景 D: 同时关闭 TG 与邮件转发 (0, 0, 1)...");
    await updateSystemSetting({ userTgForward: 0, userEmailForward: 0, userApiSupport: 1 });
    await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    assert.ok(await page.locator(".container.export-container").count() > 0, "export-container 必须直接允许");
    assert.strictEqual(await page.locator(".container.forwarding-container").count(), 0, "forwarding-container 应完全隐藏");
    assert.ok(await page.locator(".container.api-container").count() > 0, "api-container 仍应存在");
    console.log("✓ 场景 D (关闭整个转发容器) 校验通过");

    // ==========================================
    // 7. 测试场景 E: 仅关闭第三方 API 支援 (1, 1, 0)
    // ==========================================
    console.log("7. 测试场景 E: 关闭第三方 API 支援 (1, 1, 0)...");
    await updateSystemSetting({ userTgForward: 1, userEmailForward: 1, userApiSupport: 0 });
    await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    assert.ok(await page.locator(".container.export-container").count() > 0, "export-container 必须直接允许");
    assert.ok(await page.locator(".container.forwarding-container").count() > 0, "forwarding-container 应存在");
    assert.strictEqual(await page.locator(".container.api-container").count(), 0, "api-container 应完全隐藏");

    // 尝试后端调用创建 Token，验证被 403 阻断
    const createTokRes = await page.request.post(BASE + "/api/my/apiTokens", {
      data: { name: "Test Prohibited Token" },
      headers: { "Content-Type": "application/json", "Authorization": token }
    });
    const createTokData = await createTokRes.json();
    console.log("禁用 API 时创建 Token 后端响应:", createTokData);
    assert.notStrictEqual(createTokData.code, 200, "禁用 API 时后端应阻断 Token 创建");
    console.log("✓ 场景 E (关闭第三方 API 支援与后端拦截) 校验通过");

    // ==========================================
    // 8. 测试场景 F: 全部关闭 (0, 0, 0) -> 仅直接允许 export-container
    // ==========================================
    console.log("8. 测试场景 F: 全部关闭 (0, 0, 0) -> 仅保留 class=\"container export-container\"...");
    await updateSystemSetting({ userTgForward: 0, userEmailForward: 0, userApiSupport: 0 });
    await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const totalContainers = page.locator(".data-settings-page > .container");
    const containerCount = await totalContainers.count();
    console.log("当前可见的 container 数量:", containerCount);
    assert.strictEqual(containerCount, 1, "全部功能关闭时，资料界面应只有 1 个 container");

    const onlyContainerClass = await totalContainers.first().getAttribute("class");
    console.log("唯一存在的 container 类名:", onlyContainerClass);
    assert.ok(onlyContainerClass.includes("export-container"), "唯一的 container 必须是 export-container");
    assert.strictEqual(await page.locator(".container.forwarding-container").count(), 0, "forwarding-container 应已隐藏");
    assert.strictEqual(await page.locator(".container.api-container").count(), 0, "api-container 应已隐藏");

    await page.screenshot({ path: "tests/audit_data_page_only_export_allowed.png" });
    console.log("✓ 场景 F (仅 export-container 自由支配) 校验 100% 通过！");

    // ==========================================
    // 9. 恢复初始配置 (1, 1, 1)
    // ==========================================
    console.log("9. 恢复默认全站配置...");
    await updateSystemSetting({ 
      allMailMode: 1,
      userTgForward: 1, 
      userEmailForward: 1, 
      userApiSupport: 1 
    });

    console.log("🎉 所有用户资料控制与利用度测试 100% 全部通过！");
  } catch (err) {
    console.error("测试失败:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
