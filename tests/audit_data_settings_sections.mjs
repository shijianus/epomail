import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始「资料」分区 (Data Settings Partition) 视觉审计全项截图 ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();

  const BASE = "https://epomail.epocanvas.workers.dev";

  try {
    // 1. 登录
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.token;

    // 2. 注入 Token 并打开应用 (中文模式)
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);
    await page.goto(BASE + "/settings/data", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // 确保自动转发处于开启状态以完整呈现所有字段
    const fwSwitch = page.locator(".forward-toggle-row .el-switch");
    if (!(await fwSwitch.evaluate(el => el.classList.contains('is-checked')))) {
      await fwSwitch.click();
      await page.waitForTimeout(500);
    }

    // 截图 1: 数据汇出区域
    const exportSec = page.locator("#dataExport");
    await exportSec.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await exportSec.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_sec1_export_zh.png" });
    console.log("✓ Section 1 数据汇出截图已保存: tests/audit_sec1_export_zh.png");

    // 截图 2: 邮件与消息转发区域
    const forwardSec = page.locator("#forwarding");
    await forwardSec.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await forwardSec.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_sec2_forward_zh.png" });
    console.log("✓ Section 2 邮件与消息转发截图已保存: tests/audit_sec2_forward_zh.png");

    // 截图 3: 开发者 API 区域
    const apiSec = page.locator("#apiAccess");
    await apiSec.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await apiSec.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_sec3_api_zh.png" });
    console.log("✓ Section 3 开发者 API 截图已保存: tests/audit_sec3_api_zh.png");

    // 截图 4: 打开 Telegram 配置弹窗
    const tgSetBtn = page.locator(".tg-push-item .opt-button");
    await tgSetBtn.click();
    await page.waitForSelector(".forward-dialog", { timeout: 5000 });
    await page.waitForTimeout(600); // 等待动画完成
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_tg_modal_open.png" });
    console.log("✓ TG 弹窗打开截图已保存: tests/audit_tg_modal_open.png");

    // 关闭弹窗
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // 截图 5: 暗色调模式全区截图
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    await page.waitForTimeout(800);

    await exportSec.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await exportSec.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_sec1_export_dark.png" });

    await forwardSec.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await forwardSec.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_sec2_forward_dark.png" });

    await apiSec.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await apiSec.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_sec3_api_dark.png" });

    // 打开暗色调 TG 弹窗
    await tgSetBtn.click();
    await page.waitForSelector(".forward-dialog", { timeout: 5000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_tg_modal_dark.png" });
    console.log("✓ 暗色调 TG 弹窗截图已保存: tests/audit_tg_modal_dark.png");

    console.log("🎉 视觉审计全项截图抓取完成！");

  } catch (err) {
    console.error("测试失败:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
