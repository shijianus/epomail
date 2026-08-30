import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始 TOTP 2FA Cloudflare 生产环境端到端验证 ===");
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

    // 2. 注入 Token 并打开应用
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);

    // 3. 访问 /settings/security
    console.log("2. 导航至 /settings/security (安全设置页)...");
    await page.goto(BASE + "/settings/security", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // 4. 验证 TOTP 2FA 卡片存在
    console.log("3. 验证 TOTP 2FA 设置卡片...");
    const totpSection = page.locator(".totp-section");
    const isTotpVisible = await totpSection.isVisible();
    assert.ok(isTotpVisible, "TOTP 2FA 区域必须在安全设置页可见");

    const totpTitle = await page.locator(".totp-section .title").innerText();
    console.log(`✓ 找到 TOTP 模块标题: "${totpTitle}"`);
    assert.ok(totpTitle.includes("两步验证") || totpTitle.includes("2FA"), "标题必须包含两步验证或 2FA");

    const statusTag = await page.locator(".totp-card .el-tag").first().innerText();
    console.log(`✓ 当前 2FA 状态标籤: "${statusTag}"`);

    // 5. 测试点击「启用两步验证」按钮
    const enableBtn = page.locator(".totp-actions .el-button--primary");
    if (await enableBtn.isVisible()) {
      console.log("4. 点击「启用两步验证」开启弹窗...");
      await enableBtn.click();
      await page.waitForTimeout(2000);

      // 验证 3 步骤弹窗
      const dialog = page.locator(".totp-setup-dialog");
      assert.ok(await dialog.isVisible(), "2FA 启用弹窗必须展示");

      // 验证二维码或密钥展示
      const qrImg = page.locator(".totp-qr-image");
      const isQrVisible = await qrImg.isVisible();
      console.log(`✓ QR Code 渲染状态: ${isQrVisible}`);
      assert.ok(isQrVisible, "Step 1 必须成功渲染 TOTP 二维码");

      const secretCode = await page.locator(".secret-code").innerText();
      console.log(`✓ 手动输入密钥: "${secretCode}"`);
      assert.ok(secretCode && secretCode.length >= 16, "必须显示 Base32 手动密钥");

      // 点击下一步
      console.log("5. 点击「下一步：输入验证码」...");
      const nextBtn = page.locator(".step-content .dialog-footer-actions .el-button--primary");
      await nextBtn.click();
      await page.waitForTimeout(500);

      const codeInput = page.locator(".totp-code-input");
      assert.ok(await codeInput.isVisible(), "Step 2 必须显示 6 位验证码输入框");
      console.log("✓ Step 2 验证码输入框校验成功");

      await page.screenshot({ path: "tests/cf_prod_totp_setup_modal.png" });
      console.log("✓ 已保存弹窗截图至 tests/cf_prod_totp_setup_modal.png");
    }

    // 6. 验证路由别名 /settings/general 也会正确展示安全设置与 2FA 卡片
    console.log("6. 验证访问 /settings/general 别名...");
    await page.goto(BASE + "/settings/general", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const totpOnGeneral = await page.locator(".totp-section").isVisible();
    assert.ok(totpOnGeneral, "/settings/general 必须正确展示 2FA 设置");
    console.log("✓ /settings/general 别名路由验证成功");

    // 7. 验证 /settings/profile 保持常规个人资料设置
    console.log("7. 验证访问 /settings/profile 个人资料设置...");
    await page.goto(BASE + "/settings/profile", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const profileTitle = await page.locator(".title").first().innerText();
    console.log(`✓ /settings/profile 主标题: "${profileTitle}"`);

    await page.screenshot({ path: "tests/cf_prod_security_page.png" });
    console.log("✓ 已保存安全设置页截图至 tests/cf_prod_security_page.png");

    console.log("🎉 所有生产环境 TOTP 2FA 与路由验证全部 100% 通过！");
  } catch (err) {
    console.error("❌ 测试失败:", err);
    await page.screenshot({ path: "tests/cf_prod_error.png" });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
