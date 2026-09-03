import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始 Telegram 弹窗 UI 画风同步 Visual Audit 测试 ===");
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

    // 设置全部邮件模式
    await page.request.put(BASE + "/api/setting/set", {
      data: { allMailMode: 1 },
      headers: { "Content-Type": "application/json", "Authorization": token }
    });

    await page.goto(BASE + "/settings/data", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);

    // ==========================================
    // 2. 资料分区个人 TG 弹窗截图 (亮色 & 暗色)
    // ==========================================
    console.log("2. 捕获资料分区个人 TG 弹窗截图...");
    await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const dataTgBtn = page.locator(".tg-push-item .opt-button");
    await dataTgBtn.click();
    await page.waitForSelector(".forward-dialog", { timeout: 5000 });
    await page.waitForTimeout(600);

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_data_tg_modal_light.png" });

    // 切换暗色模式
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(500);
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_data_tg_modal_dark.png" });

    // 恢复亮色
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    // ==========================================
    // 3. 系统设置分区 TG 弹窗截图 (亮色 & 暗色)
    // ==========================================
    console.log("3. 捕获系统设置分区 TG 弹窗截图...");
    const sysNavTab = page.locator(".settings-nav-item").filter({ hasText: "系统设置" }).first();
    await sysNavTab.click();
    await page.waitForTimeout(1500);

    const sysTgBtn = page.locator(".settings-card").filter({ hasText: "邮件推送" }).locator(".setting-item").filter({ hasText: "Telegram 机器人" }).locator(".opt-button");
    await sysTgBtn.click();
    await page.waitForSelector(".sys-tg-dialog", { timeout: 5000 });
    await page.waitForTimeout(600);

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_sys_tg_modal_light.png" });

    // 暗色模式
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(500);
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_sys_tg_modal_dark.png" });

    // 恢复亮色
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    // ==========================================
    // 4. 系统设置第三方邮箱弹窗与转发规则弹窗截图
    // ==========================================
    console.log("4. 捕获系统设置第三方邮箱与转发规则弹窗截图...");
    const sysThirdBtn = page.locator(".settings-card").filter({ hasText: "邮件推送" }).locator(".setting-item").filter({ hasText: "第三方邮箱" }).locator(".opt-button");
    await sysThirdBtn.click();
    await page.waitForSelector(".sys-third-email-dialog", { timeout: 5000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_sys_third_email_modal.png" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    const sysRuleBtn = page.locator(".settings-card").filter({ hasText: "邮件推送" }).locator(".setting-item").filter({ hasText: "转发规则" }).locator(".opt-button");
    await sysRuleBtn.click();
    await page.waitForSelector(".forward-dialog", { timeout: 5000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_sys_forward_rule_modal.png" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    console.log("🎉 所有 Telegram 弹窗 UI 画风同步 Visual Audit 截图捕获完成！");
  } catch (err) {
    console.error("测试失败:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
