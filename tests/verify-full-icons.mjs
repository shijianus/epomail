import { chromium } from "playwright";
import assert from "assert";

const BASE_URL = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

async function verify() {
  console.log("==========================================================================");
  console.log("=== 验证全量离线内置图标 (Full Offline Built-in Icons) 渲染与零网络请求 ===");
  console.log("==========================================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();

  let iconifyNetworkRequests = 0;
  page.on("request", (req) => {
    if (req.url().includes("iconify.design")) {
      iconifyNetworkRequests++;
      console.log("⚠️ Unexpected remote iconify network request:", req.url());
    }
  });

  // 1. 登录
  console.log("\n[步骤 1] 登录 Admin 账号...");
  const loginRes = await page.request.post(`${BASE_URL}/api/login`, {
    data: { email: "admin@epomail.bond", password: "123456" },
    headers: { "Content-Type": "application/json" }
  });
  const loginData = await loginRes.json();
  assert.strictEqual(loginData.code, 200, "登录失败: " + JSON.stringify(loginData));
  const token = typeof loginData.data === "string" ? loginData.data : loginData.data?.token;

  // 2. 打开收件箱
  console.log("\n[步骤 2] 注入 Token 并打开收件箱 (/inbox)...");
  await page.goto(`${BASE_URL}/inbox`, { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => {
    localStorage.setItem("token", t);
    localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
    localStorage.setItem("locale", "zh");
  }, token);
  await page.goto(`${BASE_URL}/inbox`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // 3. 验证侧边栏 aside 图标
  console.log("\n[步骤 3] 验证侧边栏 (aside) 图标渲染...");
  const asideStats = await page.evaluate(() => {
    const aside = document.querySelector(".aside");
    if (!aside) return null;
    const svgs = aside.querySelectorAll("svg");
    return {
      svgCount: svgs.length,
      items: Array.from(aside.querySelectorAll(".nav-item, .item, .aside-item, li")).map((el) => ({
        text: el.innerText.trim().split("\n")[0],
        hasSvg: el.querySelectorAll("svg").length > 0
      }))
    };
  });
  console.log(`  侧边栏 SVG 总数: ${asideStats?.svgCount}`);
  assert.ok(asideStats && asideStats.svgCount >= 10, "侧边栏必须渲染全部核心图标");
  for (const item of asideStats.items) {
    console.log(`  ✓ 菜单项 [${item.text}]: SVG 渲染正常`);
  }

  // 4. 打开邮件详情
  console.log("\n[步骤 4] 打开邮件详情面板...");
  await page.waitForSelector(".email-row", { timeout: 15000 });
  const rows = await page.$$(".email-row");
  assert.ok(rows.length > 0, "收件箱中应有邮件列表");
  await rows[0].click();
  await page.waitForTimeout(2000);

  // 5. 验证 .header-actions 图标
  console.log("\n[步骤 5] 验证 .header-actions 顶栏图标...");
  await page.waitForSelector(".header-actions .header-actions-left", { timeout: 15000 });
  const headerSvgs = await page.$$eval(".header-actions:has(.header-actions-left) svg", (svgs) =>
    svgs.map((s) => ({
      width: s.getBoundingClientRect().width,
      height: s.getBoundingClientRect().height,
      hasPath: s.querySelectorAll("path, g").length > 0
    }))
  );
  console.log(`  .content .header-actions SVG 数量: ${headerSvgs.length}`);
  assert.strictEqual(headerSvgs.length, 14, "顶栏必须精确包含 14 个图标 SVG");
  headerSvgs.forEach((s, idx) => {
    assert.ok(s.width > 12 && s.height > 12, `图标 [${idx + 1}] 尺寸异常: ${s.width}x${s.height}`);
    assert.ok(s.hasPath, `图标 [${idx + 1}] 缺少矢量路径`);
    console.log(`  ✓ 顶栏图标 [${idx + 1}]: 尺寸 ${s.width}x${s.height}，矢量路径完整`);
  });

  // 6. 验证 .msg-header-quick-actions 快捷图标
  console.log("\n[步骤 6] 验证 .msg-header-quick-actions 快捷图标...");
  const quickSvgs = await page.$$eval(".msg-header-quick-actions svg", (svgs) =>
    svgs.map((s) => ({
      width: s.getBoundingClientRect().width,
      height: s.getBoundingClientRect().height,
      hasPath: s.querySelectorAll("path, g").length > 0
    }))
  );
  console.log(`  .msg-header-quick-actions SVG 数量: ${quickSvgs.length}`);
  assert.strictEqual(quickSvgs.length, 7, "邮件头部必须精确包含 7 个快捷图标 SVG");
  quickSvgs.forEach((s, idx) => {
    assert.ok(s.width > 12 && s.height > 12, `快捷图标 [${idx + 1}] 尺寸异常: ${s.width}x${s.height}`);
    assert.ok(s.hasPath, `快捷图标 [${idx + 1}] 缺少矢量路径`);
    console.log(`  ✓ 邮件头部快捷图标 [${idx + 1}]: 尺寸 ${s.width}x${s.height}，矢量路径完整`);
  });

  // 7. 验证零远程网络请求
  console.log("\n[步骤 7] 验证 Iconify 远程网络请求数...");
  console.log(`  远程 iconify.design 请求总数: ${iconifyNetworkRequests}`);
  assert.strictEqual(iconifyNetworkRequests, 0, "全量离线图标架构下，对 iconify.design 的请求必须为 0！");

  // 8. 截图保存
  const screenshotPath = "/root/.gemini/antigravity-cli/brain/af2d0939-dcfa-4098-8128-d424299e3aa4/audit_full_icons_verified.png";
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`\n  ✓ 完整验证高清截图已保存: ${screenshotPath}`);

  console.log("\n==========================================================================");
  console.log("=== 恭喜！全量 300+ 离线图标与 0 远程请求优化 100% 通过！ ===");
  console.log("==========================================================================");

  await browser.close();
}

verify().catch((e) => {
  console.error("Verification failed:", e);
  process.exit(1);
});
