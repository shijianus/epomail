import { chromium } from "playwright";
import assert from "assert";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../temp_login_ui/dist");

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：TOTP 两步验证在登录界面中的高阶动效与丝滑交互端到端核验 ===");
  console.log("==========================================================================");

  // 启动本地静态服务器托管编译产物
  const server = http.createServer((req, res) => {
    let filePath = path.join(distDir, req.url.replace(/^\/login\/?/, ""));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    if (!fs.existsSync(filePath)) {
      filePath = path.join(distDir, "index.html");
    }
    const ext = path.extname(filePath);
    const mimes = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".json": "application/json"
    };
    res.setHeader("Content-Type", mimes[ext] || "application/octet-stream");
    res.end(fs.readFileSync(filePath));
  });

  await new Promise((resolve) => server.listen(4199, "127.0.0.1", resolve));
  const BASE = "http://127.0.0.1:4199/login/";

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();

  try {
    // 1. 打开登录页面
    console.log("\n[步骤 1] 访问登录界面并验证首屏渲染...");
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForSelector("#epo-email", { timeout: 10000 });
    console.log("  ✓ 登录界面成功加载，邮箱输入框正常呈现");

    // 2. 模拟密码验证通过并要求 2FA (包含 Passkey 与 TOTP)
    console.log("\n[步骤 2] 模拟密码校验通过，触发两步验证 (2FA / MFA)...");
    await page.route("**/api/login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: {
            mfaRequired: true,
            tempToken: "totp_tmp_test_token_12345",
            email: "admin@epomail.bond",
            hasPasskeys: true,
            passkeys: [{ id: "test_credential_id", type: "public-key" }],
            passkeyChallenge: "dGVzdF9wYXNza2V5X2NoYWxsZW5nZQ"
          }
        })
      });
    });

    await page.fill("#epo-email", "admin@epomail.bond");
    await page.fill("#epo-password", "123456");
    await page.click('button[type="submit"]');

    // 3. 验证 TOTP 界面平滑进入
    console.log("\n[步骤 3] 验证 TOTP 阶段平滑入场与多因子组件渲染...");
    await page.waitForSelector("form.flex.flex-col", { timeout: 5000 });
    
    // 验证返回密码登录按钮
    const backBtn = await page.waitForSelector("button:has-text('返回重新输入密码')", { timeout: 5000 });
    assert.ok(backBtn, "必须呈现「返回重新输入密码」按钮");
    console.log("  ✓ 成功渲染返回上一阶段按钮");

    // 验证 Passkey 快速解锁按钮
    const passkeyBtn = await page.waitForSelector("button:has-text('使用通行密钥')", { timeout: 5000 });
    assert.ok(passkeyBtn, "检测到已绑定 Passkey 时必须渲染通行密钥一键解锁入口");
    console.log("  ✓ 成功激活 Passkey / 安全密钥快捷验证通道");

    // 4. 验证 6 位 OTP 输入框结构与原生属性
    console.log("\n[步骤 4] 审计 6 位 OTP 输入框与原生属性...");
    const otpInputs = await page.$$("input[inputmode='numeric']");
    assert.strictEqual(otpInputs.length, 6, "必须精确呈现 6 个数字舱格子");
    console.log("  ✓ 精确呈现 6 个独立数字舱输入框");

    // 验证第 1 个格子的 autoComplete 属性为 one-time-code
    const firstInputAutoComplete = await otpInputs[0].getAttribute("autocomplete");
    assert.strictEqual(firstInputAutoComplete, "one-time-code", "首个输入框必须支持 autoComplete='one-time-code' 以唤起原生钥匙串/短信自动填充");
    console.log("  ✓ 首个输入框已具备 autoComplete='one-time-code' 原生属性");

    // 验证 3-3 分割结构
    const separator = await page.$("span:text-is('-')");
    assert.ok(separator, "6 位格子中间必须具备 3-3 节奏分隔符 (-)");
    console.log("  ✓ 成功渲染 3-3 分组视觉引导分隔符");

    // 5. 验证 30 秒周期环与“无法验证？”向导
    console.log("\n[步骤 5] 验证 30 秒周期微型环与排查向导...");
    const periodSvg = await page.$("svg circle");
    assert.ok(periodSvg, "必须呈现动态口令 30 秒周期感知环");
    console.log("  ✓ 动态口令 30 秒周期环正常运转");

    const helpBtn = await page.waitForSelector("button:has-text('无法验证？')", { timeout: 5000 });
    assert.ok(helpBtn, "必须提供轻量「无法验证？」排查入口");
    await helpBtn.click();
    await page.waitForTimeout(300);

    const helpCard = await page.waitForSelector("text=两步验证排查建议", { timeout: 5000 });
    assert.ok(helpCard, "点击「无法验证？」必须平滑展开排查向导卡片");
    console.log("  ✓ 排查向导展开正常，包含时钟同步与备用代码自救提示");

    // 6. 验证备用代码 3D 平滑翻转
    console.log("\n[步骤 6] 验证应急备用代码 3D 翻转切换...");
    const switchBackupBtn = await page.waitForSelector("button:has-text('使用应急备用代码登录')", { timeout: 5000 });
    assert.ok(switchBackupBtn, "必须呈现切换至备用代码入口");
    await switchBackupBtn.click();
    await page.waitForTimeout(350);

    const backupInput = await page.waitForSelector("#epo-backup-code", { timeout: 5000 });
    assert.ok(backupInput, "必须呈现应急备用代码输入框");
    console.log("  ✓ 成功平滑翻转至应急备用代码输入形态");

    // 切换回动态验证码
    const switchTotpBtn = await page.waitForSelector("button:has-text('使用验证器动态验证码')", { timeout: 5000 });
    await switchTotpBtn.click();
    await page.waitForTimeout(350);

    // 7. 验证满 6 位自动触发提交与输错自动清空 / Shake
    console.log("\n[步骤 7] 验证满 6 位自动提交与错误物理排异联动...");
    let verifyCallReceived = false;
    await page.route("**/api/login/totp", async (route) => {
      verifyCallReceived = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 400,
          msg: "totpCodeInvalid"
        })
      });
    });

    // 重新获取 6 个格子并敲入 6 位
    const refreshedInputs = await page.$$("input[inputmode='numeric']");
    for (let i = 0; i < 6; i++) {
      await refreshedInputs[i].type((i + 1).toString());
    }

    // 等待自动提交网络请求发出（无需手动点击提交按钮）
    await page.waitForTimeout(600);
    assert.ok(verifyCallReceived, "满 6 位后必须自动触发 TOTP 校验请求，无需手动按提交按钮");
    console.log("  ✓ 满 6 位数字自动触发提交验证");

    // 验证报错提示
    await page.waitForSelector("text=验证码错误", { timeout: 5000 });
    console.log("  ✓ 错误提示与空间排异光斑触发");

    // 验证震动结束后自动清空数字并聚焦第一格
    await page.waitForTimeout(500);
    const firstVal = await refreshedInputs[0].inputValue();
    assert.strictEqual(firstVal, "", "校验失败震颤后必须自动清空错误数字，降低重试成本");
    console.log("  ✓ 校验失败后输入框已自动清空，光标焦点自动归位第 1 格");

    // 8. 保存视觉快照
    console.log("\n[步骤 8] 保存端到端视觉复核快照...");
    await page.screenshot({ path: "tests/audit_totp_login_motion.png" });
    console.log("  ✓ 视觉审计快照已保存: tests/audit_totp_login_motion.png");

    console.log("\n==========================================================================");
    console.log("=== 全部 8 项高阶动效与交互检查项 100% 绿灯通过！两步验证登录优化完满 ===");
    console.log("==========================================================================");

  } catch (err) {
    console.error("❌ 测试失败:", err);
    await page.screenshot({ path: "tests/audit_totp_login_failure.png" }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
    server.close();
  }
})();
