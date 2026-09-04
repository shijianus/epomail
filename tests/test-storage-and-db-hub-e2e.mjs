import { chromium } from "playwright";
import assert from "assert";
import dbService from "../mail-worker/src/service/db-service.js";
import { getUserDb, getMailDb, isDualDbMode } from "../mail-worker/src/utils/db-accessor.js";

(async () => {
  console.log("================================================================================");
  console.log("🚀 开始 存储与核心数据库 (Storage & Database Hub) 全链路自动化 E2E 测试");
  console.log("================================================================================");

  // ---------------------------------------------------------------------------
  // Unit Test: dbService & Multi-DB diagnostics
  // ---------------------------------------------------------------------------
  console.log("\n[Step 1] 单元验证: dbService 数据库状态与连通性探针...");
  
  const mockSingleEnv = {
    env: {
      domain: '["epomail.bond"]',
      db: {
        prepare: (sql) => ({
          all: async () => ({ results: [] }),
          first: async () => ({ probe: 1 })
        })
      },
      kv: {
        get: async () => ({
          externalDbEnabled: 0,
          externalDbProvider: 'turso',
          externalDbEndpoint: '',
          externalDbName: '',
          externalDbTarget: 'mail'
        }),
        put: async () => {}
      }
    }
  };

  const statusRes = await dbService.getDbStatus(mockSingleEnv);
  assert.strictEqual(statusRes.mode, 'single', '默认单库模式下 mode 必须为 single');
  assert.strictEqual(statusRes.userDb.status, 'connected', 'User DB 必须处于 connected 状态');
  assert.strictEqual(statusRes.mailDb.status, 'connected', 'Mail DB 必须处于 connected 状态');
  console.log("  ✓ 单库模式状态与元数据探针提取正常");

  const probeRes = await dbService.testConnection(mockSingleEnv);
  assert.strictEqual(probeRes.ok, true, '探针测试在本地 D1 下必须返回 ok=true');
  assert.ok(probeRes.latencyMs >= 0, '必须包含 latencyMs 测量');
  console.log(`  ✓ 本地 D1 SQL 探针执行成功 (耗时: ${probeRes.latencyMs}ms)`);

  // ---------------------------------------------------------------------------
  // E2E Test: 生产环境 API 与 Web 前端 UI 验证
  // ---------------------------------------------------------------------------
  console.log("\n[Step 2] 端到端验证: 生产环境 API 与 Web 前端 UI 交互...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();

  const BASE = "https://epomail.epocanvas.workers.dev";
  let authToken = null;

  try {
    // 2.1 触发 DDL 幂等升级
    console.log("  -> 触发 /api/init/123456 升级 v3_11DB 数据表扩展字段...");
    const initRes = await page.request.get(BASE + "/api/init/123456");
    const initText = await initRes.text();
    assert.strictEqual(initText, "success", "数据库初始化必须返回 success");
    console.log("  ✓ v3_11DB 数据表升级完成");

    // 2.2 管理员登录
    console.log("  -> 执行管理员登录...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "管理员登录必须成功");
    authToken = loginData.data?.token;
    assert.ok(authToken, "必须获取到 JWT Token");
    console.log("  ✓ 登录成功");

    const authHeaders = { "Authorization": authToken };

    // 2.3 验证后端 GET /api/setting/db/status
    console.log("  -> 测试 GET /api/setting/db/status...");
    const statusApiRes = await page.request.get(BASE + "/api/setting/db/status", {
      headers: authHeaders
    });
    const statusApiData = await statusApiRes.json();
    assert.strictEqual(statusApiData.code, 200, "db/status 必须返回 200");
    assert.ok(statusApiData.data?.userDb, "返回数据必须包含 userDb");
    assert.ok(statusApiData.data?.mailDb, "返回数据必须包含 mailDb");
    console.log(`  ✓ 数据库状态 API 返回正常: 模式 [${statusApiData.data.mode}], 用户数 [${statusApiData.data.stats?.userCount}]`);

    // 2.4 验证后端 POST /api/setting/db/test (实时探针)
    console.log("  -> 测试 POST /api/setting/db/test (实时探针)...");
    const testApiRes = await page.request.post(BASE + "/api/setting/db/test", {
      data: {
        externalDbEnabled: 0,
        externalDbProvider: "turso"
      },
      headers: authHeaders
    });
    const testApiData = await testApiRes.json();
    assert.strictEqual(testApiData.code, 200, "db/test 必须返回 200");
    assert.strictEqual(testApiData.data?.ok, true, "默认探针诊断必须为 ok=true");
    console.log(`  ✓ 数据库实时连通性探针通过 (响应时间: ${testApiData.data.latencyMs}ms)`);

    // 2.5 验证前端 UI: 访问 /system-setting 页面
    console.log("  -> 浏览器访问前端系统设置页...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((token) => {
      localStorage.setItem("token", token);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, authToken);
    await page.goto(BASE + "/system-setting", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // 验证「存储与核心数据库」卡片渲染
    console.log("  -> 验证「存储与核心数据库」卡片排版...");
    const storageDbCard = page.locator(".settings-card.storage-db-card");
    await storageDbCard.waitFor({ state: "visible", timeout: 10000 });

    const cardTitle = await storageDbCard.locator(".card-title").textContent();
    assert.ok(cardTitle.includes("存储与核心数据库") || cardTitle.includes("Storage & Database"), `卡片标题必须正确: ${cardTitle}`);

    const secLabels = await storageDbCard.locator(".sec-label").allTextContents();
    assert.ok(secLabels.some(l => l.includes("对象存储") || l.includes("Object Storage")), "必须展示对象存储子分区");
    assert.ok(secLabels.some(l => l.includes("核心与第三方数据库") || l.includes("Database")), "必须展示核心与第三方数据库子分区");
    console.log("  ✓ 存储与核心数据库卡片结构与子分区渲染 100% 正确");

    // 验证操作按钮
    const s3Btn = storageDbCard.getByRole("button", { name: /S3 \/ Backblaze|对象存储/ });
    const dbBtn = storageDbCard.getByRole("button", { name: /第三方数据库|Third-Party DB/ });
    const quickTestBtn = storageDbCard.locator(".opt-btn-test");

    await assert.ok(await s3Btn.isVisible(), "对象存储配置按钮必须可见");
    await assert.ok(await dbBtn.isVisible(), "第三方数据库配置按钮必须可见");
    await assert.ok(await quickTestBtn.isVisible(), "全链路诊断按钮必须可见");
    console.log("  ✓ 卡片操作工具栏（S3配置、DB配置、全链路诊断）全部就绪");

    // 打开第三方数据库配置弹窗
    console.log("  -> 点击打开「第三方数据库配置」弹窗...");
    await dbBtn.click();

    const dbDialog = page.locator(".db-config-dialog");
    await dbDialog.waitFor({ state: "visible", timeout: 5000 });

    // 验证模版预设
    const presets = await dbDialog.locator(".provider-pill").allTextContents();
    assert.ok(presets.some(p => p.includes("Turso")), "必须包含 Turso 预设");
    assert.ok(presets.some(p => p.includes("D1")), "必须包含 D1 预设");
    console.log("  ✓ 数据库提供商预设模版渲染正常: " + presets.map(p => p.trim()).join(", "));

    // 点击诊断测试按钮
    console.log("  -> 触发弹窗内连通性测试...");
    const testProbeBtn = dbDialog.locator(".test-conn-btn");
    await testProbeBtn.click();

    const fbBox = dbDialog.locator(".test-feedback-box");
    await fbBox.waitFor({ state: "visible", timeout: 10000 });

    const fbText = await fbBox.textContent();
    assert.ok(fbText.includes("成功") || fbText.includes("Successful") || fbText.includes("⚡"), `探针反馈框必须包含成功提示: ${fbText}`);
    console.log("  ✓ 弹窗内数据库实时探针测试反馈正常展示");

    // 截图存档
    await page.screenshot({ path: "tests/audit_storage_and_db_hub_modal.png" });
    console.log("  ✓ 视觉审计截图已保存至 tests/audit_storage_and_db_hub_modal.png");

  } finally {
    // 零假数据还原
    console.log("\n[Step 3] 测试清理与状态自动还原...");
    if (authToken) {
      await page.request.put(BASE + "/api/setting/set", {
        data: {
          externalDbEnabled: 0,
          externalDbProvider: "turso",
          externalDbEndpoint: "",
          externalDbToken: "",
          externalDbName: "",
          externalDbTarget: "mail"
        },
        headers: { "Authorization": authToken }
      });
      console.log("  ✓ 测试配置已干净还原");
    }
    await browser.close();
  }

  console.log("\n================================================================================");
  console.log("🎉 存储与核心数据库 (Storage & Database Hub) 全链路自动化 E2E 测试 100% 通过！");
  console.log("================================================================================");
})();
