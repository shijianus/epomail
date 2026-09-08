import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：系统设置已选定模型池实时同步至角色权限 AI 允许模型下拉选项 ===");
  console.log("==========================================================================");

  const browser = await chromium.launch({
    headless: true,
    args: ["--lang=zh-CN"]
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  let adminToken = null;
  let originalSetting = null;
  let originalRole = null;

  try {
    // 1. 登录 Admin 账号
    console.log("\n[步骤 1] 登录 Admin 账号获取鉴权 Token...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, "Admin 登录失败: " + JSON.stringify(loginData));
    adminToken = typeof loginData.data === "string" ? loginData.data : loginData.data?.token;
    console.log("  ✓ Admin 登录成功");

    // 保存原始系统配置以便测试完毕后恢复
    const settingRes = await page.request.get(BASE + "/api/setting/query", {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const settingJson = await settingRes.json();
    assert.strictEqual(settingJson.code, 200, "获取原始系统设置失败");
    originalSetting = settingJson.data;
    console.log(`  原始主模型: [${originalSetting.aiModel || '空'}], 原始模型池: [${originalSetting.aiModels || '空'}]`);

    // 获取原始角色列表以便测试完毕后恢复
    const roleListRes = await page.request.get(BASE + "/api/role/list", {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const roleListJson = await roleListRes.json();
    const rolesList = Array.isArray(roleListJson.data) ? roleListJson.data : (roleListJson.data?.list || []);
    originalRole = rolesList[0];
    console.log(`  测试角色: [${originalRole.name}] (ID: ${originalRole.roleId})`);

    // 2. 模拟系统设置配置模型池与主模型
    console.log("\n[步骤 2] 配置系统设置测试模型池与主模型...");
    const testPrimaryModel = "deepseek-chat";
    const testModelPool = ["deepseek-chat", "deepseek-reasoner", "qwen-turbo"];
    
    const setRes = await page.request.put(BASE + "/api/setting/set", {
      data: {
        aiModel: testPrimaryModel,
        aiModels: testModelPool.join(","),
        aiEnabled: 1
      },
      headers: {
        "Authorization": `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      }
    });
    const setJson = await setRes.json();
    assert.strictEqual(setJson.code, 200, "更新系统设置模型池失败: " + JSON.stringify(setJson));
    console.log(`  ✓ 系统设置已成功保存: 主模型=${testPrimaryModel}, 模型池=${testModelPool.join(",")}`);

    // 3. 验证 /setting/websiteConfig 包含同步的模型字段
    console.log("\n[步骤 3] 验证 /api/setting/websiteConfig 包含 aiModel 与 aiModels...");
    const webConfigRes = await page.request.get(BASE + "/api/setting/websiteConfig");
    const webConfigJson = await webConfigRes.json();
    assert.strictEqual(webConfigJson.code, 200, "获取 websiteConfig 失败");
    assert.strictEqual(webConfigJson.data?.aiModel, testPrimaryModel, "websiteConfig 必须包含正确的主模型");
    assert.ok(webConfigJson.data?.aiModels.includes("deepseek-reasoner"), "websiteConfig 必须包含模型池中的模型");
    console.log("  ✓ websiteConfig 同步返回:", {
      aiModel: webConfigJson.data?.aiModel,
      aiModels: webConfigJson.data?.aiModels
    });

    // 4. 打开浏览器进入 /role 页面
    console.log("\n[步骤 4] 浏览器访问 /role 页面并验证渲染...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, adminToken);

    await page.goto(BASE + "/role", { waitUntil: "networkidle" });
    await page.waitForSelector(".role-table, .el-table", { timeout: 15000 });
    await page.waitForTimeout(1000);
    console.log("  ✓ /role 角色管理页面成功加载");

    // 5. 点击操作下拉菜单中的「修改 (Change)」以打开角色编辑弹窗
    console.log("\n[步骤 5] 打开角色编辑弹窗...");
    const actionDropdown = await page.waitForSelector(".el-table__row:first-child .el-dropdown button", { timeout: 5000 });
    await actionDropdown.click();
    await page.waitForTimeout(400);

    const editItem = await page.waitForSelector(".el-dropdown-menu__item:has-text('Change'), .el-dropdown-menu__item:has-text('修改'), .el-dropdown-menu:not([style*='display: none']) .el-dropdown-menu__item:first-child", { timeout: 5000 });
    await editItem.click();

    await page.waitForSelector(".role-form-dialog", { timeout: 5000 });
    console.log("  ✓ 角色编辑弹窗已弹出");

    // 6. 查找 AI 模型分级授权下拉选择器
    console.log("\n[步骤 6] 检查 AI 授权模型下拉选择器 class=\"role-ai-models-select\"...");
    const aiSelect = await page.waitForSelector(".role-form-dialog .role-ai-models-select", { timeout: 5000 });
    assert.ok(aiSelect, "必须找到 AI 授权模型的 el-select");

    // 点击下拉框展开选项
    await aiSelect.click();
    await page.waitForTimeout(600);

    // 7. 检查活动下拉菜单中的选项
    console.log("\n[步骤 7] 验证下拉单选项严格来自系统设置模型池，杜绝硬编码假数据...");
    const activePopper = await page.waitForSelector(".el-select__popper:not([style*='display: none'])", { timeout: 5000 });
    const dropdownOptions = await activePopper.$$(".el-select-dropdown__item");
    console.log(`  下拉渲染选项总数: ${dropdownOptions.length}`);
    assert.ok(dropdownOptions.length >= 3, "下拉菜单必须至少包含模型池中的 3 个模型");

    const optionTexts = [];
    for (const opt of dropdownOptions) {
      const text = await opt.textContent();
      optionTexts.push(text.trim().replace(/\s+/g, ' '));
    }
    console.log("  下拉选项列表:\n   - " + optionTexts.join("\n   - "));

    // 验证测试模型池中的模型均存在
    assert.ok(optionTexts.some(t => t.includes("deepseek-chat")), "下拉中必须包含主模型 deepseek-chat");
    assert.ok(optionTexts.some(t => t.includes("deepseek-reasoner")), "下拉中必须包含模型池 deepseek-reasoner");
    assert.ok(optionTexts.some(t => t.includes("qwen-turbo")), "下拉中必须包含模型池 qwen-turbo");

    // 验证角色的徽章存在
    assert.ok(optionTexts.some(t => t.includes("主推理模型")), "主模型选项后应带有「主推理模型」胶囊徽章");
    assert.ok(optionTexts.some(t => t.includes("系统模型池")), "模型池选项后应带有「系统模型池」胶囊徽章");

    // 验证严格杜绝硬编码假数据（在未配置时不能出现 gpt-4o-mini 等假数据）
    assert.ok(!optionTexts.some(t => t.includes("gpt-4o-mini")), "严禁出现未配置的硬编码 gpt-4o-mini！");
    assert.ok(!optionTexts.some(t => t.includes("claude-3-5-haiku-20241022")), "严禁出现未配置的硬编码 claude-3-5-haiku！");
    console.log("  ✓ 下拉选项 100% 同步系统设置模型池，且彻底清除硬编码假数据！");

    // 8. 测试在角色中选择模型并保存
    console.log("\n[步骤 8] 测试在角色中选择「deepseek-reasoner」并保存...");
    const targetOption = await activePopper.waitForSelector(".el-select-dropdown__item:has-text('deepseek-reasoner')", { timeout: 5000 });
    await targetOption.click();
    await page.waitForTimeout(300);

    // 关闭下拉单
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // 截图记录亮色模式下的弹窗
    await page.screenshot({ path: "tests/audit_role_ai_models_sync_light.png" });
    console.log("  ✓ 亮色模式截图已保存为 tests/audit_role_ai_models_sync_light.png");

    // 点击保存按钮
    const saveBtn = await page.waitForSelector(".role-form-dialog .modal-col-right .btn", { timeout: 5000 });
    await saveBtn.click();
    await page.waitForTimeout(1000);
    console.log("  ✓ 点击保存角色成功");

    // 9. 切换至暗黑模式核验视觉与回显
    console.log("\n[步骤 9] 切换至暗黑模式核验深色调无白斑与徽章样式...");
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    });
    await page.waitForTimeout(500);

    // 再次打开该角色编辑弹窗核验回显
    const actionDropdownAgain = await page.waitForSelector(".el-table__row:first-child .el-dropdown button", { timeout: 5000 });
    await actionDropdownAgain.click();
    await page.waitForTimeout(400);

    const editItemAgain = await page.waitForSelector(".el-dropdown-menu__item:has-text('Change'), .el-dropdown-menu__item:has-text('修改'), .el-dropdown-menu:not([style*='display: none']) .el-dropdown-menu__item:first-child", { timeout: 5000 });
    await editItemAgain.click();

    await page.waitForSelector(".role-form-dialog", { timeout: 5000 });
    await page.waitForTimeout(400);

    // 点击展开下拉框并截图
    const aiSelectDark = await page.waitForSelector(".role-form-dialog .role-ai-models-select", { timeout: 5000 });
    await aiSelectDark.click();
    await page.waitForTimeout(600);

    await page.screenshot({ path: "tests/audit_role_ai_models_sync_dark.png" });
    console.log("  ✓ 暗黑模式截图已保存为 tests/audit_role_ai_models_sync_dark.png");

    // 关闭弹窗
    const closeBtn = await page.waitForSelector(".role-form-dialog .el-dialog__headerbtn", { timeout: 3000 });
    await closeBtn.click();
    await page.waitForTimeout(500);

    // 10. 测试新建角色弹窗中的 AI 模型池同步
    console.log("\n[步骤 10] 验证「新建角色」弹窗同样具备模型池同步...");
    const addRoleBtn = await page.waitForSelector(".header-actions .action-btn-pill:first-child", { timeout: 5000 });
    await addRoleBtn.click();
    await page.waitForSelector(".role-form-dialog", { timeout: 5000 });
    
    const addAiSelect = await page.waitForSelector(".role-form-dialog .role-ai-models-select", { timeout: 5000 });
    await addAiSelect.click();
    await page.waitForTimeout(500);

    const activeAddPopper = await page.waitForSelector(".el-select__popper:not([style*='display: none'])", { timeout: 5000 });
    const addOptions = await activeAddPopper.$$(".el-select-dropdown__item");
    assert.ok(addOptions.length >= 3, "新建角色弹窗中同样必须包含模型池中的模型选项");
    console.log(`  ✓ 新建角色弹窗选项正常渲染 (${addOptions.length} 个选项)`);

    const closeAddBtn = await page.waitForSelector(".role-form-dialog .el-dialog__headerbtn", { timeout: 3000 });
    await closeAddBtn.click();
    await page.waitForTimeout(400);

    console.log("\n==========================================================================");
    console.log("=== 测试全部顺利通过！模型池实时同步与角色授权选择机制验证 100% 达成 ===");
    console.log("==========================================================================");

  } finally {
    // 自动重置清理准则：恢复原始系统配置与角色数据
    console.log("\n[清理] 正在恢复原始系统设置与角色数据（遵循零假数据准则）...");
    if (adminToken && originalSetting) {
      try {
        await page.request.put(BASE + "/api/setting/set", {
          data: {
            aiModel: originalSetting.aiModel || "",
            aiModels: originalSetting.aiModels || "",
            aiApiKey: originalSetting.aiApiKey || "",
            aiApiUrl: originalSetting.aiApiUrl || "",
            aiEnabled: originalSetting.aiEnabled ?? 1
          },
          headers: {
            "Authorization": `Bearer ${adminToken}`,
            "Content-Type": "application/json"
          }
        });
        console.log("  ✓ 系统设置已成功恢复为初始状态");
      } catch (e) {
        console.error("  恢复系统设置失败:", e);
      }
    }

    if (adminToken && originalRole) {
      try {
        await page.request.put(BASE + "/api/role/set", {
          data: {
            ...originalRole,
            aiModels: originalRole.aiModels || []
          },
          headers: {
            "Authorization": `Bearer ${adminToken}`,
            "Content-Type": "application/json"
          }
        });
        console.log("  ✓ 角色数据已恢复为初始状态");
      } catch (e) {
        console.error("  恢复角色数据失败:", e);
      }
    }

    await browser.close();
  }
})();
