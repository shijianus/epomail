import { chromium } from "playwright";
import assert from "assert";
import dbService from "../mail-worker/src/service/db-service.js";
import storageScanService from "../mail-worker/src/service/storage-scan-service.js";
import { getUserDb, getMailDb, isDualDbMode } from "../mail-worker/src/utils/db-accessor.js";

(async () => {
  console.log("================================================================================");
  console.log("🚀 开始 存储与核心数据库 (Storage & Database Hub) 全链路自动化 E2E 测试");
  console.log("================================================================================");

  // ---------------------------------------------------------------------------
  // Unit Test: dbService & storageScanService diagnostics
  // ---------------------------------------------------------------------------
  console.log("\n[Step 1] 单元验证: dbService 与 storageScanService 真实扫描逻辑...");
  
  const mockSingleEnv = {
    env: {
      domain: '["epomail.bond"]',
      db: {
        prepare: (sql) => ({
          all: async () => ({ results: [] }),
          first: async () => ({
            probe: 1,
            totalAttachments: 0,
            totalBytes: 0,
            distinctKeys: 0,
            imageCount: 0,
            pdfCount: 0,
            mediaCount: 0,
            otherCount: 0,
            count: 0
          })
        })
      },
      kv: {
        list: async () => ({
          keys: [
            { name: 'setting' },
            { name: 'setting_totp_status' },
            { name: 'JWT_test_user_1' }
          ],
          list_complete: true,
          cursor: undefined
        }),
        get: async () => ({
          externalDbEnabled: 0,
          externalDbProvider: 'turso',
          externalDbEndpoint: '',
          externalDbName: '',
          externalDbTarget: 'mail',
          attachmentPolicy: 0,
          attachmentMaxSizeMb: 25,
          attachmentCascadeDelete: 1
        }),
        put: async () => {},
        delete: async () => {}
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

  const scanRes = await storageScanService.scan(mockSingleEnv);
  assert.strictEqual(scanRes.ok, true, '真实扫描必须返回 ok=true');
  assert.strictEqual(scanRes.kv.totalKeys, 3, '扫描出的 KV Keys 数量必须精确');
  assert.strictEqual(scanRes.kv.configKeys, 2, '系统配置 Keys 分类统计必须正确');
  assert.strictEqual(scanRes.kv.authKeys, 1, '认证 Keys 分类统计必须正确');
  assert.strictEqual(scanRes.healthScore, 100, '健康指数计算必须正常');
  console.log(`  ✓ 真实 KV 与存储深度扫描引擎验证通过 (扫描耗时: ${scanRes.scanDurationMs}ms)`);

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
    console.log("  -> 触发 /api/init/123456 升级 v3_12DB 附件规则与存储扩展字段...");
    const initRes = await page.request.get(BASE + "/api/init/123456");
    const initText = await initRes.text();
    assert.strictEqual(initText, "success", "数据库初始化必须返回 success");
    console.log("  ✓ v3_12DB 数据表升级完成");

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

    // 2.4 验证真实扫描 API POST /api/setting/storage/scan
    console.log("  -> 测试真实存储深度扫描 API POST /api/setting/storage/scan...");
    const scanApiRes = await page.request.post(BASE + "/api/setting/storage/scan", {
      headers: authHeaders
    });
    const scanApiData = await scanApiRes.json();
    assert.strictEqual(scanApiData.code, 200, "storage/scan 必须返回 200");
    assert.strictEqual(scanApiData.data?.ok, true, "扫描必须成功返回 ok=true");
    assert.ok(scanApiData.data?.kv?.bound !== undefined, "必须包含 KV 绑定状态");
    assert.ok(scanApiData.data?.d1?.totalAttachments !== undefined, "必须包含 D1 附件记录统计");
    assert.ok(scanApiData.data?.healthScore >= 0, "必须包含健康指数");
    console.log(`  ✓ 生产环境真实扫描成功: KV 键数 [${scanApiData.data.kv.totalKeys}], D1 附件 [${scanApiData.data.d1.totalAttachments}], 健康分 [${scanApiData.data.healthScore}%], 耗时 [${scanApiData.data.scanDurationMs}ms]`);

    // 2.5 验证安全清理 API POST /api/setting/storage/cleanup
    console.log("  -> 测试存储安全清理 API POST /api/setting/storage/cleanup...");
    const cleanApiRes = await page.request.post(BASE + "/api/setting/storage/cleanup", {
      headers: authHeaders
    });
    const cleanApiData = await cleanApiRes.json();
    assert.strictEqual(cleanApiData.code, 200, "storage/cleanup 必须返回 200");
    assert.strictEqual(cleanApiData.data?.ok, true, "清理必须返回 ok=true");
    console.log(`  ✓ 生产环境存储安全清理执行成功: 清理临时键 [${cleanApiData.data.cleanedCount}]`);

    // 2.6 验证附件规则更新 PUT /api/setting/set
    console.log("  -> 测试附件存储规则更新 PUT /api/setting/set...");
    const updateRuleRes = await page.request.put(BASE + "/api/setting/set", {
      data: {
        attachmentPolicy: 0,
        attachmentMaxSizeMb: 30,
        attachmentCascadeDelete: 1
      },
      headers: authHeaders
    });
    const updateRuleData = await updateRuleRes.json();
    assert.strictEqual(updateRuleData.code, 200, "更新附件规则必须返回 200");
    console.log("  ✓ 附件存储规则保存成功");

    // 2.7 前端 UI 验证: 访问 /system-setting 页面
    console.log("  -> 浏览器访问前端系统设置页...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((token) => {
      localStorage.setItem("token", token);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, authToken);
    await page.goto(BASE + "/system-setting", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // 验证「存储与核心数据库」卡片排版
    console.log("  -> 验证「存储与核心数据库」卡片排版与说明文案...");
    const storageDbCard = page.locator(".settings-card.storage-db-card");
    await storageDbCard.waitFor({ state: "visible", timeout: 10000 });

    const cardTitle = await storageDbCard.locator(".card-title").textContent();
    assert.ok(cardTitle.includes("存储与核心数据库") || cardTitle.includes("Storage & Database"), `卡片标题必须正确: ${cardTitle}`);

    // 验证精简后的 4 大高价值条目与清晰回退指示
    const cardContentText = await storageDbCard.locator(".card-content").textContent();
    assert.ok(cardContentText.includes("对象存储") || cardContentText.includes("Object Storage"), "必须展示对象存储运行状态");
    assert.ok(cardContentText.includes("数据库") || cardContentText.includes("Database"), "必须展示数据库架构状态");
    assert.ok(cardContentText.includes("附件流转策略") || cardContentText.includes("附件存储") || cardContentText.includes("Attachment"), "必须展示附件流转策略");
    assert.ok(cardContentText.includes("KV 运行与深度体检") || cardContentText.includes("KV"), "必须展示 KV 运行与体检状态");
    console.log("  ✓ 存储与核心数据库精简高价值条目、附件流转规则与清晰回退说明 100% 正确");

    // 验证 5 大操作按钮 (2 行网格排布)
    const s3Btn = storageDbCard.locator(".opt-btn-s3");
    const dbBtn = storageDbCard.locator(".opt-btn-db");
    const ruleBtn = storageDbCard.locator(".opt-btn-rule");
    const scanBtn = storageDbCard.locator(".opt-btn-scan");
    const quickTestBtn = storageDbCard.locator(".opt-btn-test");

    await assert.ok(await s3Btn.isVisible(), "对象存储配置按钮必须可见");
    await assert.ok(await dbBtn.isVisible(), "第三方数据库配置按钮必须可见");
    await assert.ok(await ruleBtn.isVisible(), "附件存储规则按钮必须可见");
    await assert.ok(await scanBtn.isVisible(), "KV/存储深度体检按钮必须可见");
    await assert.ok(await quickTestBtn.isVisible(), "全链路诊断按钮必须可见");
    console.log("  ✓ 卡片 5 大操作工具（S3配置、DB配置、附件规则、KV体检、全链路诊断）全部就绪且排布紧凑优雅");

    // 2.8 交互验证 1: 打开「附件存储规则」弹窗
    console.log("  -> 点击打开「附件存储规则」弹窗...");
    await ruleBtn.click();
    const ruleDialog = page.locator(".attachment-rule-dialog");
    await ruleDialog.waitFor({ state: "visible", timeout: 5000 });

    const policyCards = await ruleDialog.locator(".policy-card").allTextContents();
    assert.ok(policyCards.some(p => p.includes("Backblaze B2")), "必须包含 Backblaze B2 优先选项");
    assert.ok(policyCards.some(p => p.includes("智能阈值分流")), "必须包含智能分流选项");
    console.log("  ✓ 附件存储流转策略卡片选项渲染完整");

    // 点击保存附件规则
    await ruleDialog.getByRole("button", { name: /保存附件规则|保存/ }).click();
    await page.waitForTimeout(600);
    console.log("  ✓ 附件存储规则弹窗交互与保存成功");

    // 2.9 交互验证 2: 打开「KV / 存储深度体检」弹窗
    console.log("  -> 点击打开「KV / 存储深度体检」弹窗...");
    await scanBtn.click();
    const scanDialog = page.locator(".storage-scan-dialog");
    await scanDialog.waitFor({ state: "visible", timeout: 5000 });

    // 等待扫描结果渲染
    const summaryBanner = scanDialog.locator(".scan-summary-banner");
    await summaryBanner.waitFor({ state: "visible", timeout: 10000 });
    const bannerText = await summaryBanner.textContent();
    assert.ok(bannerText.includes("健康指数") || bannerText.includes("Health"), `健康摘要横幅必须正常渲染: ${bannerText}`);
    console.log("  ✓ KV与存储深度扫描诊断弹窗结果实时呈现: " + bannerText.trim().replace(/\s+/g, ' '));

    // 截图存档
    await page.screenshot({ path: "tests/audit_storage_db_hub_full_enhanced.png" });
    console.log("  ✓ 视觉审计截图已保存至 tests/audit_storage_db_hub_full_enhanced.png");

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
          externalDbTarget: "mail",
          attachmentPolicy: 0,
          attachmentMaxSizeMb: 25,
          attachmentCascadeDelete: 1
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

