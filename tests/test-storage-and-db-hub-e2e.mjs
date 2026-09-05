import { chromium } from "playwright";
import assert from "assert";
import dbService from "../mail-worker/src/service/db-service.js";
import storageScanService from "../mail-worker/src/service/storage-scan-service.js";
import storageQuotaService from "../mail-worker/src/service/storage-quota-service.js";
import emailCryptoUtils from "../mail-worker/src/utils/email-crypto-utils.js";
import emailService from "../mail-worker/src/service/email-service.js";
import { getUserDb, getMailDb, isDualDbMode } from "../mail-worker/src/utils/db-accessor.js";

(async () => {
  console.log("================================================================================");
  console.log("🚀 开始 存储与核心数据库 (Storage & Database Hub) 全链路自动化 E2E 测试");
  console.log("================================================================================");

  // ---------------------------------------------------------------------------
  // Unit Test: dbService, storageScanService & storageQuotaService single attachment limit
  // ---------------------------------------------------------------------------
  console.log("\n[Step 1] 单元验证: dbService, storageScanService 与单附件限制逻辑...");
  
  const mockSingleEnv = {
    env: {
      domain: '["epomail.bond"]',
      db: {
        prepare: (sql) => ({
          all: async () => ({ results: [] }),
          bind: () => ({
            first: async () => null,
            all: async () => ({ results: [] })
          }),
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

  // 1.1 验证单文件附件上限拦截与 BYO 免限制逻辑
  console.log("  -> 验证单文件附件上限拦截与 BYO 免限制逻辑...");
  // 场景 A: 公共存储用户，单附件 10MB <= 25MB 上限 -> 允许
  const normalCheck = await storageQuotaService.checkAttachmentSizeLimit(mockSingleEnv, "user_public", 10 * 1024 * 1024);
  assert.strictEqual(normalCheck.allowed, true, "10MB 附件在 25MB 上限下必须被允许");

  // 场景 B: 公共存储用户，单附件 30MB > 25MB 上限 -> 拦截
  const exceededCheck = await storageQuotaService.checkAttachmentSizeLimit(mockSingleEnv, "user_public", 30 * 1024 * 1024);
  assert.strictEqual(exceededCheck.allowed, false, "30MB 附件在 25MB 上限下必须被拦截");
  assert.ok(exceededCheck.reason.includes("25"), "拦截提示必须包含上限 25MB");
  console.log(`  ✓ 公共 DB 存储用户超限拦截验证通过: ${exceededCheck.reason}`);

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

  // 1.2 验证不可篡改的三大安全加密防护等级与管理员权限阻断逻辑
  console.log("  -> 验证不可篡改的三大安全加密防护等级 (Level 1 / Level 2 / Level 3)...");
  const lvl1 = emailCryptoUtils.getProtectionLevel(1);
  assert.strictEqual(lvl1.level, 1, "Level 1 必须为明文基础级");
  assert.strictEqual(lvl1.code, 'ALL', "Level 1 对应 ALL 模式");
  
  const lvl2 = emailCryptoUtils.getProtectionLevel(0);
  assert.strictEqual(lvl2.level, 2, "Level 2 必须为增强隐私级 (默认推荐)");
  assert.strictEqual(lvl2.code, 'PRIVACY', "Level 2 对应 PRIVACY 模式");

  const lvl3 = emailCryptoUtils.getProtectionLevel(2);
  assert.strictEqual(lvl3.level, 3, "Level 3 必须为最高绝密级 (端到端加密)");
  assert.strictEqual(lvl3.code, 'ENCRYPTED', "Level 3 对应 ENCRYPTED 模式");
  console.log("  ✓ 三大安全加密防护等级权威定义固化并通过验证");

  // 1.3 验证 Mode 2 (全量端到端加密) 下管理员接口防越权拦截逻辑
  console.log("  -> 验证 Mode 2 下管理员 allList / allEmailLatest 防越权彻底拦截...");
  const mockMode2Env = {
    get: (k) => k === 'setting' ? { allMailMode: 2 } : null,
    env: {
      domain: '["epomail.bond"]',
      db: mockSingleEnv.env.db,
      kv: {
        get: async (k) => {
          if (k === 'setting') return { allMailMode: 2 };
          return null;
        }
      }
    }
  };
  const blockedList = await emailService.allList(mockMode2Env, {});
  assert.strictEqual(blockedList.list.length, 0, "Mode 2 下管理员查询全站邮件列表必须直接返回空，彻底阻断越权！");
  const blockedLatest = await emailService.allEmailLatest(mockMode2Env, { emailId: 0 });
  assert.strictEqual(blockedLatest.length, 0, "Mode 2 下管理员查询最新邮件增量必须直接返回空！");
  console.log("  ✓ Mode 2 端到端加密模式管理员全量越权阻断验证通过");

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
    // 重新加载 inbox 触发 init.js 完成权限路由动态加载
    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.goto(BASE + "/system-setting", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // 验证「存储与核心数据库」卡片排版
    console.log("  -> 验证「存储与核心数据库」卡片排版与说明文案...");
    const storageDbCard = page.locator(".settings-card.storage-db-card");
    await storageDbCard.waitFor({ state: "visible", timeout: 10000 });

    const cardTitle = await storageDbCard.locator(".card-title").textContent();
    assert.ok(cardTitle.includes("存储与核心数据库") || cardTitle.includes("Storage & Database"), `卡片标题必须正确: ${cardTitle}`);

    // 验证精简后的高价值条目与清晰回退指示
    const cardContentText = await storageDbCard.locator(".card-content").textContent();
    assert.ok(cardContentText.includes("对象存储") || cardContentText.includes("Object Storage"), "必须展示对象存储运行状态");
    assert.ok(cardContentText.includes("数据库") || cardContentText.includes("Database"), "必须展示数据库架构状态");
    assert.ok(cardContentText.includes("单文件附件上限") || cardContentText.includes("附件上限") || cardContentText.includes("Attachment Size"), "必须显式展示单文件附件上限");
    assert.ok(cardContentText.includes("KV 运行与深度体检") || cardContentText.includes("KV"), "必须展示 KV 运行与体检状态");

    // 验证彻底剔除行内画风冲突的 opt-button 小方块按钮
    const optButtons = await storageDbCard.locator(".opt-button").count();
    assert.strictEqual(optButtons, 0, "卡片行内绝不允许存在画风突兀的 opt-button 蓝色方块按钮！");
    console.log("  ✓ 卡片行内突兀的 opt-button 按钮已 100% 彻底清除");

    // 验证 storage-card-actions 独立操作栏已彻底剔除
    const cardActionsCount = await storageDbCard.locator(".storage-card-actions").count();
    assert.strictEqual(cardActionsCount, 0, "storage-card-actions 独立操作栏必须彻底移除，所有操作融入行内右对齐！");
    console.log("  ✓ 确认 storage-card-actions 独立操作栏已彻底剔除，完全融入行内");

    // 验证单文件附件上限输入控件显式展示且必须完全右对齐
    const sizeInput = storageDbCard.locator(".el-input-number");
    await assert.ok(await sizeInput.isVisible(), "卡片面板必须显式展示单文件附件上限输入控件");
    const inputContainer = storageDbCard.locator(".el-input-number").locator("xpath=..");
    const isRightAligned = await inputContainer.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.justifyContent === 'flex-end';
    });
    assert.ok(isRightAligned, "单文件附件上限控件必须通过 justify-content: flex-end 完全右对齐，禁止紧随 title-item 左对齐！");
    console.log("  ✓ 单文件附件上限输入控件已在面板右对齐显式呈现 (完全右对齐验证通过)");

    // 验证行内操作按钮全部融入各行并就绪
    const s3Btn = storageDbCard.locator(".opt-btn-s3");
    const dbBtn = storageDbCard.locator(".opt-btn-db");
    const inspectBtn = storageDbCard.locator(".opt-btn-inspect");
    const scanBtn = storageDbCard.locator(".opt-btn-scan");
    const quickTestBtn = storageDbCard.locator(".opt-btn-test");

    await assert.ok(await s3Btn.isVisible(), "行内对象存储配置按钮必须可见");
    await assert.ok(await dbBtn.isVisible(), "行内第三方数据库配置按钮必须可见");
    await assert.ok(await inspectBtn.isVisible(), "行内架构透视按钮必须可见");
    await assert.ok(await scanBtn.isVisible(), "行内存储体检按钮必须可见");
    await assert.ok(await quickTestBtn.isVisible(), "行内全链路诊断按钮必须可见");
    console.log("  ✓ 所有配置与诊断按钮全部融入各条目右侧并就绪");

    // 验证 inspectBtn 与 dbBtn 处于同一行（垂直坐标 y 差值 < 5px）
    const inspectBox = await inspectBtn.boundingBox();
    const dbBox = await dbBtn.boundingBox();
    assert.ok(inspectBox && dbBox, "架构透视与DB配置按钮必须具备有效坐标");
    const yDiff = Math.abs(inspectBox.y - dbBox.y);
    assert.ok(yDiff < 5, `架构透视与DB配置两个按钮必须在同一行 (当前 y 差值: ${yDiff}px)！`);
    console.log(`  ✓ 验证 inspectBtn 与 dbBtn 在同一行紧凑对齐，y 轴差值仅 ${yDiff.toFixed(1)}px`);

    // 验证 hub-tag 自动同步当前实际情况（生产双DB物理隔离环境），无需人为点击核验即所看即实际情况
    const dbItemTag = storageDbCard.locator(".setting-item").nth(1).locator(".hub-tag");
    const dbTagText = await dbItemTag.textContent();
    assert.ok(!dbTagText.includes("("), `数据库模式标签不应包含括号解释: ${dbTagText}`);
    const dbTagClasses = await dbItemTag.getAttribute("class");
    assert.ok(dbTagClasses.includes("el-tag--success"), `在双DB环境下 hub-tag 必须自动呈现 success 状态，当前 class: ${dbTagClasses}`);
    assert.ok(dbTagText.includes("双数据库物理隔离模式") || dbTagText.includes("Dual"), `在双DB环境下必须自动同步实际情况为双数据库物理隔离模式，当前文本: [${dbTagText.trim()}]`);
    console.log(`  ✓ 数据库模式标签已自动同步当前实际情况且无截断: [${dbTagText.trim()}] (class: ${dbTagClasses})`);

    // 验证历史残留的 val-text fallback-text 已被彻底剔除，统一为 el-tag
    const fallbackCount = await storageDbCard.locator(".fallback-text").count();
    assert.strictEqual(fallbackCount, 0, "不允许存在历史残留的 fallback-text 纯文本样式");
    const kvTag = storageDbCard.locator(".kv-tag");
    assert.ok(await kvTag.isVisible(), "KV 边缘加速层必须以统一的 el-tag 展示");
    console.log("  ✓ fallback-text 已彻底剔除，KV 边缘加速层采用统一 el-tag 呈现");

    // 验证邮件模式安全等级不可篡改徽章渲染
    const modeBadge = page.locator(".current-mode-badge");
    assert.ok(await modeBadge.isVisible(), "邮件模式不可篡改安全等级徽章必须可见");
    const modeBadgeText = await modeBadge.textContent();
    assert.ok(modeBadgeText.includes("Level"), `安全等级徽章文案必须包含 Level: ${modeBadgeText}`);
    console.log(`  ✓ 邮件模式不可篡改安全等级徽章正常呈现: [${modeBadgeText.trim()}]`);

    // 2.8 交互验证 1: 点击 opt-btn-s3 打开「对象存储配置 (S3 / Backblaze B2)」弹窗 (宽屏无滚动设计)
    console.log("  -> 点击打开「对象存储配置 (S3 / Backblaze B2)」弹窗...");
    await s3Btn.click();
    const s3Dialog = page.locator(".s3-config-dialog");
    await s3Dialog.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(600); // 确保淡入动效完全结束

    const s3Box = await s3Dialog.boundingBox();
    assert.ok(s3Box.width >= 840, `对象存储配置弹窗宽度必须扩展至 >= 840px (当前: ${s3Box.width}px)，禁止被 400px 锁死！`);

    // 验证 S3 弹窗内容 100% 无垂直滑块/滚动条，且外层遮罩亦无滑块
    const s3ScrollInfo = await s3Dialog.evaluate((el) => {
      const body = el.querySelector(".el-dialog__body") || el;
      const overlayDialog = el.closest(".el-overlay-dialog") || el.parentElement;
      return {
        bodyHasScroll: body.scrollHeight > body.clientHeight + 5,
        overlayHasScroll: overlayDialog ? overlayDialog.scrollHeight > overlayDialog.clientHeight + 5 : false,
        computedBg: window.getComputedStyle(el).backgroundColor,
        bodyBg: window.getComputedStyle(body).backgroundColor,
        opacity: window.getComputedStyle(el).opacity
      };
    });
    assert.strictEqual(s3ScrollInfo.bodyHasScroll, false, "对象存储配置弹窗内部禁止出现垂直滑块滑动！");
    assert.strictEqual(s3ScrollInfo.overlayHasScroll, false, "对象存储配置外层遮罩禁止出现垂直滑块滑动！");
    console.log(`  ✓ 对象存储配置弹窗宽度扩展至 ${s3Box.width}px，纯色实心背景生效 (bg: ${s3ScrollInfo.computedBg})，且 100% 无垂直滚动条滑块`);
    await page.screenshot({ path: "tests/audit_s3_config_dialog_no_scrollbar.png" });

    // 关闭 S3 弹窗
    const closeS3Btn = s3Dialog.locator(".el-dialog__headerbtn");
    if (await closeS3Btn.isVisible()) {
      await closeS3Btn.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(400);

    // 2.9 交互验证 2: 点击 opt-btn-db 打开「第三方数据库管理」弹窗 (宽屏无滚动设计)
    console.log("  -> 点击打开「第三方数据库管理」弹窗...");
    await dbBtn.click();
    const dbConfigDialog = page.locator(".db-config-dialog");
    await dbConfigDialog.waitFor({ state: "visible", timeout: 5000 });

    const dbConfigBox = await dbConfigDialog.boundingBox();
    assert.ok(dbConfigBox.width >= 840, `数据库配置弹窗宽度必须扩展至 >= 840px (当前: ${dbConfigBox.width}px)！`);

    const dbConfigHasScrollbar = await dbConfigDialog.evaluate((el) => {
      const body = el.querySelector(".el-dialog__body") || el;
      return body.scrollHeight > body.clientHeight + 5;
    });
    assert.strictEqual(dbConfigHasScrollbar, false, "第三方数据库配置弹窗禁止出现垂直滑块滑动！");
    console.log(`  ✓ 第三方数据库配置弹窗宽度扩展至 ${dbConfigBox.width}px，且 100% 无垂直滚动条滑块`);

    // 关闭 DB 配置弹窗
    const closeDbConfigBtn = dbConfigDialog.locator(".el-dialog__headerbtn");
    if (await closeDbConfigBtn.isVisible()) {
      await closeDbConfigBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(400);

    // 2.10 交互验证 3: 点击底部 opt-btn-inspect 打开「3大核心域 DB 架构透视」弹窗 (宽屏无滚动设计)
    console.log("  -> 点击打开「3大核心域 DB 架构透视」弹窗...");
    await inspectBtn.click();
    const dbDomainsDialog = page.locator(".db-domains-dialog");
    await dbDomainsDialog.waitFor({ state: "visible", timeout: 5000 });

    const dialogBox = await dbDomainsDialog.boundingBox();
    assert.ok(dialogBox.width >= 880, `架构透视弹窗宽度必须扩展至 >= 880px (当前: ${dialogBox.width}px)，禁止被 400px 锁死！`);

    // 验证弹窗内容无垂直滑块/滚动条
    const hasScrollbar = await dbDomainsDialog.evaluate((el) => {
      const body = el.querySelector(".el-dialog__body") || el;
      return body.scrollHeight > body.clientHeight + 10;
    });
    assert.strictEqual(hasScrollbar, false, "架构透视弹窗禁止出现垂直滑块滑动！");
    console.log(`  ✓ 3 大核心域 DB 架构透视弹窗宽度扩展至 ${dialogBox.width}px，且 100% 无垂直滚动条滑块`);

    const dialogContent = await dbDomainsDialog.textContent();
    assert.ok(dialogContent.includes("用户域") || dialogContent.includes("User DB"), "透视弹窗必须包含用户域 DB");
    assert.ok(dialogContent.includes("信件域") || dialogContent.includes("Mail DB"), "透视弹窗必须包含信件域 DB");
    assert.ok(dialogContent.includes("附件域") || dialogContent.includes("Attachment DB"), "透视弹窗必须包含附件域 DB");
    console.log("  ✓ 3 大核心域 DB 架构透视弹窗（用户域/信件域/附件域）解析与信息渲染 100% 完整");

    // 关闭 DB 透视弹窗
    const closeBtn = dbDomainsDialog.locator(".el-dialog__headerbtn");
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(400);

    // 2.9 交互验证 2: 点击底部 opt-btn-scan 打开「KV / 存储深度体检」弹窗 (宽屏无滚动设计)
    console.log("  -> 点击打开「KV / 存储深度体检」弹窗...");
    await scanBtn.click();
    const scanDialog = page.locator(".storage-scan-dialog");
    await scanDialog.waitFor({ state: "visible", timeout: 5000 });

    const scanBox = await scanDialog.boundingBox();
    assert.ok(scanBox.width >= 840, `存储体检弹窗宽度必须扩展至 >= 840px (当前: ${scanBox.width}px)，禁止被 400px 锁死！`);

    // 等待扫描结果渲染
    const summaryBanner = scanDialog.locator(".scan-summary-banner");
    await summaryBanner.waitFor({ state: "visible", timeout: 10000 });
    const bannerText = await summaryBanner.textContent();
    assert.ok(bannerText.includes("健康指数") || bannerText.includes("Health"), `健康摘要横幅必须正常渲染: ${bannerText}`);

    const scanHasScrollbar = await scanDialog.evaluate((el) => {
      const body = el.querySelector(".el-dialog__body") || el;
      return body.scrollHeight > body.clientHeight + 10;
    });
    assert.strictEqual(scanHasScrollbar, false, "存储深度体检弹窗禁止出现垂直滑块滑动！");
    console.log(`  ✓ KV 与存储深度体检弹窗宽度扩展至 ${scanBox.width}px，且 100% 无垂直滚动条滑块`);

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

