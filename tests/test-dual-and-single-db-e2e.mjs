import { chromium } from "playwright";
import assert from "assert";
import { getUserDb, getMailDb, isDualDbMode, getDbModeInfo } from "../mail-worker/src/utils/db-accessor.js";
import analysisDao from "../mail-worker/src/dao/analysis-dao.js";

(async () => {
  console.log("================================================================================");
  console.log("🚀 开始全链路数据库双库分离与单库向下兼容自动化测试 (Single & Dual DB E2E Suite)");
  console.log("================================================================================");

  // ---------------------------------------------------------------------------
  // Unit Test: DB Accessor & Dual-DB Routing Verification
  // ---------------------------------------------------------------------------
  console.log("\n[Step 1] 单元验证: 数据库访问器 (db-accessor) 路由与退化机制...");
  
  // 1.1 默认单库环境 (仅 env.db)
  const singleEnv = { env: { db: { type: "unified-single-d1" } } };
  assert.strictEqual(getUserDb(singleEnv).type, "unified-single-d1", "单库模式下 getUserDb 必须退化为 env.db");
  assert.strictEqual(getMailDb(singleEnv).type, "unified-single-d1", "单库模式下 getMailDb 必须退化为 env.db");
  assert.strictEqual(isDualDbMode(singleEnv), false, "仅配置单库时 isDualDbMode 必须为 false");
  const singleInfo = getDbModeInfo(singleEnv);
  assert.strictEqual(singleInfo.mode, "single");
  console.log("  ✓ 单库模式 (Default Single-DB): 自动回退为单一 D1 数据库，100% 向下兼容");

  // 1.2 双库隔离环境 (USER_DB 与 MAIL_DB 独立)
  const mockUserDb = { type: "user-d1", prepare: (sql) => ({ all: async () => ({ results: [{ userTotal: 10, delUserTotal: 1, normalUserTotal: 9 }] }), bind: () => ({ all: async () => ({ results: [{ userTotal: 10, delUserTotal: 1, normalUserTotal: 9 }] }) }) }) };
  const mockMailDb = { type: "mail-d1", prepare: (sql) => ({ all: async () => ({ results: [{ receiveTotal: 50, sendTotal: 20, normalReceiveTotal: 48, accountTotal: 15 }] }), bind: () => ({ all: async () => ({ results: [{ receiveTotal: 50, sendTotal: 20, normalReceiveTotal: 48, accountTotal: 15 }] }) }) }) };
  const dualEnv = { env: { USER_DB: mockUserDb, MAIL_DB: mockMailDb } };

  assert.strictEqual(getUserDb(dualEnv).type, "user-d1", "双库模式下 getUserDb 必须精确路由到 USER_DB");
  assert.strictEqual(getMailDb(dualEnv).type, "mail-d1", "双库模式下 getMailDb 必须精确路由到 MAIL_DB");
  assert.strictEqual(isDualDbMode(dualEnv), true, "配置双库时 isDualDbMode 必须为 true");
  const dualInfo = getDbModeInfo(dualEnv);
  assert.strictEqual(dualInfo.mode, "dual");
  console.log("  ✓ 双库模式 (Dual-DB Mode): USER_DB 与 MAIL_DB 物理隔离并精确分流");

  // 1.3 验证 analysisDao.numberCount 在双库模式下的并行解耦合并
  const mergedStats = await analysisDao.numberCount(dualEnv);
  assert.strictEqual(mergedStats.userTotal, 10, "用户统计数据必须从 USER_DB 正确合并");
  assert.strictEqual(mergedStats.receiveTotal, 50, "邮件统计数据必须从 MAIL_DB 正确合并");
  assert.strictEqual(mergedStats.accountTotal, 15, "账号统计数据必须从 MAIL_DB 正确合并");
  console.log("  ✓ 跨库聚合 (Cross-DB Aggregation): analysisDao.numberCount 跨库并行合并 100% 成功");

  // ---------------------------------------------------------------------------
  // E2E Test: 生产环境真实 API 运行链路与向下兼容验证
  // ---------------------------------------------------------------------------
  console.log("\n[Step 2] 端到端验证: 生产环境 D1 数据链路与核心业务闭环...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();

  const BASE = "https://epomail.epocanvas.workers.dev";
  let authToken = null;

  try {
    // 2.1 验证数据库初始化端点 (/api/init/:secret)
    console.log("  -> 触发 /api/init/123456 验证 DDL 分发与幂等升级...");
    const initRes = await page.request.get(BASE + "/api/init/123456");
    const initText = await initRes.text();
    assert.strictEqual(initText, "success", "数据库初始化必须返回 success");
    console.log("  ✓ 数据库 DDL 幂等升级顺利完成");

    // 2.2 管理员登录
    console.log("  -> 执行管理员登录获取会话...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "登录必须返回 HTTP 200: " + JSON.stringify(loginData));
    authToken = loginData.data?.token;
    assert.ok(authToken, "必须获取到有效的 JWT Token");
    console.log("  ✓ 登录成功，获取管理员 Token");

    const authHeaders = {
      "Authorization": authToken
    };

    // 2.3 验证用户域 (USER_DB) 查询: GET /api/user/list
    console.log("  -> 验证用户中心表 (user / role) 查询...");
    const userRes = await page.request.get(BASE + "/api/user/list?num=1&size=20&status=-1", {
      headers: authHeaders
    });
    const userData = await userRes.json();
    assert.strictEqual(userData.code, 200, "用户列表查询必须返回 200: " + JSON.stringify(userData));
    assert.ok(Array.isArray(userData.data?.list), "用户列表必须是数组");
    console.log(`  ✓ 用户中心数据正常，获取到 ${userData.data.list.length} 位用户`);

    // 2.4 验证邮件域 (MAIL_DB) 查询与内存拼装 (allEmail / userEmail hydration)
    console.log("  -> 验证全站邮件查询与内存用户水合 (allEmail hydration)...");
    const emailRes = await page.request.get(BASE + "/api/allEmail/list?emailId=0&size=20", {
      headers: authHeaders
    });
    const emailData = await emailRes.json();
    assert.strictEqual(emailData.code, 200, "邮件列表查询必须返回 200: " + JSON.stringify(emailData));
    assert.ok(Array.isArray(emailData.data?.list), "邮件列表必须是数组");
    console.log(`  ✓ 邮件查询与跨库内存 Hydration 正常，检索到 ${emailData.data.list.length} 封邮件`);

    // 2.5 验证分析域图表数据: GET /api/analysis/echarts
    console.log("  -> 验证分析中心 ECharts 统计数据聚合...");
    const analysisRes = await page.request.get(BASE + "/api/analysis/echarts?timeZone=Asia%2FShanghai", {
      headers: authHeaders
    });
    const analysisData = await analysisRes.json();
    assert.strictEqual(analysisData.code, 200, "分析数据必须返回 200: " + JSON.stringify(analysisData));
    assert.ok(analysisData.data?.numberCount, "必须包含全站概览数字统计");
    console.log("  ✓ 分析中心统计聚合正常:", JSON.stringify({
      receiveTotal: analysisData.data.numberCount.receiveTotal,
      sendTotal: analysisData.data.numberCount.sendTotal,
      userTotal: analysisData.data.numberCount.userTotal
    }));

    // 2.6 验证应用平台 (OAuth Apps): GET /api/admin/oauthApp/list
    console.log("  -> 验证 OAuth 应用中心数据读取...");
    const appListRes = await page.request.get(BASE + "/api/admin/oauthApp/list", {
      headers: authHeaders
    });
    const appListData = await appListRes.json();
    assert.strictEqual(appListData.code, 200, "OAuth 应用列表必须返回 200: " + JSON.stringify(appListData));
    console.log(`  ✓ OAuth 应用管理正常，当前拥有 ${appListData.data?.length || 0} 个应用`);

    // 2.7 验证个人数据汇出: GET /api/my/exportData
    console.log("  -> 验证用户完整数据汇出 (User + Mail 跨领域组装)...");
    const exportRes = await page.request.get(BASE + "/api/my/exportData", {
      headers: authHeaders
    });
    const exportData = await exportRes.json();
    assert.strictEqual(exportData.code, 200, "数据导出必须返回 200: " + JSON.stringify(exportData));
    assert.ok(exportData.data?.user, "导出数据必须包含 user 元数据");
    assert.ok(Array.isArray(exportData.data?.emails), "导出数据必须包含 emails 数组");
    console.log(`  ✓ 用户数据全量汇出正常: 用户 ${exportData.data.user.email}，邮件共 ${exportData.data.totalEmails} 封`);

    console.log("\n================================================================================");
    console.log("🎉 恭喜！单库向下兼容与双库物理分离架构端到端测试 100% 全量顺利通过！");
    console.log("================================================================================");
  } finally {
    await browser.close();
  }
})();
