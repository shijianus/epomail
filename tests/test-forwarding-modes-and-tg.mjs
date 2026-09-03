import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始全站 3 大邮件模式与 TG / 转发机制 Playwright 自动化审计测试 ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();

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

    // Helper: 设置全站邮件模式
    async function setAllMailMode(mode, verifiedForward = "") {
      const res = await page.request.put(BASE + "/api/setting/set", {
        data: { allMailMode: mode, forwardEmail: verifiedForward, forwardStatus: verifiedForward ? 0 : 1 },
        headers: { "Content-Type": "application/json", "Authorization": token }
      });
      const data = await res.json();
      assert(data.code === 200, `设置邮件模式 ${mode} 失败: ` + JSON.stringify(data));
    }

    // 2. 测试模式 1: 全部邮件模式 (allMailMode = 1)
    console.log("2. 测试模式 1: 全部邮件模式 (allMailMode = 1)...");
    await setAllMailMode(1);

    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);

    await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
    await page.waitForSelector(".forward-toggle-row", { timeout: 10000 });

    console.log("Current URL:", page.url());
    console.log("Forward toggle row count:", await page.locator(".forward-toggle-row").count());
    console.log("Forward container count:", await page.locator(".forwarding-container").count());

    // 验证用户端没有架构警告横幅
    assert.strictEqual(await page.locator(".quota-warning-banner").count(), 0, "用户端不应展示配额警告横幅");
    assert.strictEqual(await page.locator(".mode-rule-notice-banner").count(), 0, "用户端不应展示模式架构横幅");

    // 模式 1 下，用户可配置转发规则
    assert.ok(await page.locator(".forward-toggle-row").count() > 0, "模式 1 下应展示转发开关");
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_user_data_clean_mode1.png" });

    // 3. 测试模式 0: 隐私邮件模式 (allMailMode = 0)
    console.log("3. 测试模式 0: 隐私邮件模式 (allMailMode = 0)...");
    await setAllMailMode(0);
    await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
    await page.waitForSelector(".forward-toggle-row", { timeout: 10000 });

    assert.strictEqual(await page.locator(".quota-warning-banner").count(), 0, "用户端不应展示配额警告横幅");
    assert.strictEqual(await page.locator(".mode-rule-notice-banner").count(), 0, "用户端不应展示模式架构横幅");
    assert.ok(await page.locator(".forward-toggle-row").count() > 0, "模式 0 下应展示转发开关");
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_user_data_clean_mode0.png" });

    // 4. 测试模式 2: 加密邮件模式 (allMailMode = 2) - 用户端正常支持第三方邮件转发与个人 TG 推送
    console.log("4. 测试模式 2: 加密邮件模式 (allMailMode = 2)...");
    await setAllMailMode(2);
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
    await page.waitForSelector(".forward-toggle-row", { timeout: 10000 });

    console.log("Mode 2 current forwarding-rule-section count:", await page.locator(".forwarding-rule-section").count());

    // 验证加密模式下，用户端正常展示邮件转发规则与个人 TG 推送
    assert.ok(await page.locator(".forward-toggle-row").count() > 0, "加密模式下用户端应展示邮件转发开关");
    assert.ok(await page.locator(".forwarding-rule-section").count() > 0, "加密模式下应保留用户端邮件转发配置");
    assert.ok(await page.locator(".tg-push-item").count() > 0, "加密模式下仍保留个人 Telegram 消息推送");
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_user_data_encrypted_mode2.png" });

    // 5. 验证个人 Telegram 弹窗 (极简头部与提示)
    console.log("5. 验证个人 Telegram 弹窗...");
    const tgBtn = page.locator(".tg-push-item .opt-button");
    await tgBtn.click();
    await page.waitForSelector(".forward-dialog", { timeout: 5000 });
    await page.waitForTimeout(500);
    const tgTitle = await page.locator(".forward-head .forward-set-title").innerText();
    console.log("TG 弹窗标题:", tgTitle);
    assert.strictEqual(tgTitle, "Telegram 消息推送配置", "TG 弹窗标题应为极简配置标题");
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_personal_tg_clean_modal.png" });

    // 关闭弹窗
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // 6. 验证管理员「系统设置」中的 TG 与第三方邮箱提示（管理端富集所有架构与模式说明）
    console.log("6. 验证管理员「系统设置」中的 TG 与第三方邮箱提示...");
    await setAllMailMode(1);
    await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // 点击左侧导航进入「系统设置」
    const sysNavTab = page.locator(".settings-nav-item").filter({ hasText: "系统设置" }).first();
    await sysNavTab.click();
    await page.waitForTimeout(2000);

    // 打开管理员 TG 弹窗
    const sysTgBtn = page.locator(".settings-card").filter({ hasText: "邮件推送" }).locator(".opt-button").first();
    await sysTgBtn.click();
    await page.waitForSelector(".sys-tg-dialog", { timeout: 5000 });
    await page.waitForTimeout(500);

    const adminTgCallout = await page.locator(".sys-tg-dialog .admin-notice-callout").innerText();
    console.log("管理员 TG 说明:", adminTgCallout);
    assert.ok(adminTgCallout.includes("系统全局 Telegram 机器人"), "管理员 TG 弹窗应包含全局机器人说明");
    assert.ok(adminTgCallout.includes("全部邮件模式") && adminTgCallout.includes("隐私邮件模式") && adminTgCallout.includes("加密邮件模式"), "管理员 TG 弹窗应包含 3 大模式机制说明");
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_admin_sys_setting_tg_dialog.png" });

    // 关闭 TG 弹窗
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);

    // 打开管理员第三方邮箱弹窗
    const sysOtherEmailBtn = page.locator(".settings-card").filter({ hasText: "邮件推送" }).locator(".opt-button").nth(1);
    await sysOtherEmailBtn.click();
    await page.waitForSelector(".sys-third-email-dialog", { timeout: 5000 });
    await page.waitForTimeout(500);

    const adminOtherCallout = await page.locator(".sys-third-email-dialog .admin-notice-callout").innerText();
    console.log("管理员第三方邮箱说明:", adminOtherCallout);
    assert.ok(adminOtherCallout.includes("底层无损路由") && adminOtherCallout.includes("受信任号池"), "管理员第三方邮箱弹窗应包含无损路由与号池机制说明");
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_admin_sys_setting_third_email_dialog.png" });

    // 关闭弹窗
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);

    console.log("🎉 所有全站 3 大邮件模式与 TG / 转发机制 Playwright 自动化审计测试全部 100% 通过！");

    // 恢复为默认初始状态: allMailMode = 1
    await setAllMailMode(1);

  } catch (err) {
    console.error("测试失败:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
