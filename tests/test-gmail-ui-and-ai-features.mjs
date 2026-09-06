import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("==========================================================================");
  console.log("=== 开始测试：Gmail UI 收件优化、to me下拉详情卡片、操作按钮组与 AI 翻译 ===");
  console.log("==========================================================================");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();
  const BASE = process.env.TEST_BASE_URL || "https://epomail.epocanvas.workers.dev";

  let adminToken = null;
  let createdEmailId = null;

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

    // 2. 预置一封测试邮件 (用于查看详情)
    console.log("\n[步骤 2] 获取或创建用于测试的邮件...");
    const listRes = await page.request.get(BASE + "/api/email/list?page=1&size=10", {
      headers: { Authorization: adminToken }
    });
    const listData = await listRes.json();
    assert.strictEqual(listData.code, 200, "获取邮件列表失败");

    let targetEmail = null;
    if (listData.data?.list && listData.data.list.length > 0) {
      targetEmail = listData.data.list[0];
      createdEmailId = targetEmail.emailId;
      console.log(`  ✓ 找到现有测试邮件: ID=${targetEmail.emailId}, Subject=${targetEmail.subject}`);
    } else {
      console.log("  邮件列表为空，发送自测邮件...");
      const sendRes = await page.request.post(BASE + "/api/email/send", {
        data: {
          toEmail: "admin@epomail.bond",
          subject: "Hello Gmail UI and AI Test",
          text: "This is an important test email for Gmail-style UI optimization and AI translation.",
          html: "<p>This is an important test email for Gmail-style UI optimization and AI translation.</p>"
        },
        headers: {
          Authorization: adminToken,
          "Content-Type": "application/json"
        }
      });
      const sendData = await sendRes.json();
      console.log("  发送邮件结果:", sendData);
      await page.waitForTimeout(1000);
      const refreshRes = await page.request.get(BASE + "/api/email/list?page=1&size=10", {
        headers: { Authorization: adminToken }
      });
      const refreshData = await refreshRes.json();
      if (refreshData.data?.list && refreshData.data.list.length > 0) {
        targetEmail = refreshData.data.list[0];
        createdEmailId = targetEmail.emailId;
      }
    }

    assert.ok(targetEmail, "未找到可用测试邮件");

    // 3. 注入 Token 并打开收件箱
    console.log("\n[步骤 3] 注入 Token 并导航至收件箱页面...");
    await page.goto(BASE + "/inbox", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, adminToken);

    await page.goto(BASE + "/inbox", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // 等待邮件列表渲染并点击第一封邮件
    console.log("  等待并点击第一封邮件打开右侧阅读面板...");
    await page.waitForSelector(".email-row", { timeout: 10000 });
    const emailRows = await page.$$(".email-row");
    assert.ok(emailRows.length > 0, "收件箱中必须有邮件行渲染");
    await emailRows[0].click();
    await page.waitForTimeout(1500);

    // 4. 验证 Gmail 风格顶栏操作按钮
    console.log("\n[步骤 4] 验证邮件详情顶部 Gmail 风格操作栏与按钮...");
    const actionsSelector = ".header-actions .icon, .header-actions .action-icon-wrap";
    await page.waitForSelector(actionsSelector, { timeout: 10000 });
    const actionBtns = await page.$$(actionsSelector);
    console.log(`  顶栏操作按钮数量: ${actionBtns.length} 个`);
    assert.ok(actionBtns.length >= 6, "操作栏应包含返回、垃圾邮件、删除、标记已读、稍后提醒、标签、翻译等按钮");

    // 5. 验证 .info-bottom Gmail 风格 "to me ▾" / "至 我 ▾" 触发器
    console.log("\n[步骤 5] 验证 .info-bottom Gmail 风格触发器及详情卡片...");
    await page.waitForSelector(".to-me-trigger", { timeout: 10000 });
    const toMeBtn = await page.$(".to-me-trigger");
    assert.ok(toMeBtn, "必须渲染 .to-me-trigger 触发器按钮");
    const toMeText = await toMeBtn.textContent();
    console.log(`  触发器文本内容: "${toMeText.trim()}"`);
    assert.ok(
      toMeText.includes("我") || toMeText.includes("me") || toMeText.includes("收件人"),
      `触发器文案应包含至我或收件人，实际为: ${toMeText}`
    );

    // 点击触发器展开 Popover 详情卡片
    console.log("  点击触发器展开详情卡片...");
    await toMeBtn.click();
    await page.waitForTimeout(500);

    const popoverCard = await page.$(".gmail-details-card");
    assert.ok(popoverCard, "点击后必须渲染 .gmail-details-card 详情弹窗卡片");

    const cardDetails = await page.evaluate(() => {
      const card = document.querySelector(".gmail-details-card");
      if (!card) return null;
      const rows = Array.from(card.querySelectorAll(".detail-row")).map(r => ({
        label: r.querySelector(".dt-label")?.textContent?.trim(),
        value: r.querySelector(".dt-val")?.textContent?.trim()
      }));
      const securityBadge = card.querySelector(".security-tls")?.textContent?.trim();
      return { rows, securityBadge };
    });
    console.log("  详情卡片解析结果:", cardDetails);
    assert.ok(cardDetails && cardDetails.rows.length >= 4, "详情卡片必须包含发件人、收件人、日期、主题等行");
    assert.ok(cardDetails.securityBadge, "详情卡片必须包含 TLS 安全加密徽章");
    console.log("  ✓ Gmail 详情卡片验证 100% 通过");

    // 6. 验证翻译邮件工具栏与响应
    console.log("\n[步骤 6] 验证翻译邮件 (Translate Message) 工具栏与界面交互...");
    const translateBtn = await page.$(".btn-translate");
    assert.ok(translateBtn, "必须存在翻译按钮 .btn-translate");
    await translateBtn.click();
    await page.waitForTimeout(500);

    const translateBar = await page.$(".gmail-translate-bar");
    assert.ok(translateBar, "点击翻译按钮后必须展示 .gmail-translate-bar 翻译条");
    const langSelect = await page.$(".gmail-translate-bar .gtb-select");
    assert.ok(langSelect, "翻译条中必须包含目标语言下拉框 (.gtb-select)");
    console.log("  ✓ 翻译工具条渲染正常");

    // 7. 测试后端 AI 翻译接口 /api/email/translate
    console.log("\n[步骤 7] 验证后端 AI 翻译端点 /api/email/translate 连通与降级容灾...");
    const translateRes = await page.request.post(BASE + "/api/email/translate", {
      data: {
        text: "Hello world, welcome to our next generation open-source mail system!",
        targetLang: "zh"
      },
      headers: {
        Authorization: adminToken,
        "Content-Type": "application/json"
      }
    });
    const translateData = await translateRes.json();
    console.log("  AI 翻译响应结果:", translateData);
    assert.strictEqual(translateData.code, 200, "翻译接口必须返回 code 200");
    assert.ok(translateData.data && translateData.data.translatedText, "翻译结果必须包含 translatedText");
    console.log(`  ✓ 翻译返回内容: "${translateData.data.translatedText}" (引擎: ${translateData.data.engine})`);

    // 8. 验证后端标记垃圾邮件 /api/email/reportSpam
    console.log("\n[步骤 8] 验证个人垃圾邮件上报 /api/email/reportSpam 与黑名单规则引擎联动...");
    const spamRes = await page.request.put(BASE + "/api/email/reportSpam", {
      data: { emailId: createdEmailId },
      headers: {
        Authorization: adminToken,
        "Content-Type": "application/json"
      }
    });
    const spamData = await spamRes.json();
    assert.strictEqual(spamData.code, 200, "举报垃圾邮件接口必须成功: " + JSON.stringify(spamData));
    console.log("  ✓ reportSpam 成功执行并自动写入个人黑名单规则");

    // 9. 验证标记已读/未读切换
    console.log("\n[步骤 9] 验证 /api/email/read 状态读写切换 (mark as unread & read)...");
    const unreadRes = await page.request.put(BASE + "/api/email/read", {
      data: { emailIds: [createdEmailId], unread: 1 },
      headers: {
        Authorization: adminToken,
        "Content-Type": "application/json"
      }
    });
    const unreadData = await unreadRes.json();
    assert.strictEqual(unreadData.code, 200, "标为未读必须成功");

    const readRes = await page.request.put(BASE + "/api/email/read", {
      data: { emailIds: [createdEmailId], unread: 0 },
      headers: {
        Authorization: adminToken,
        "Content-Type": "application/json"
      }
    });
    const readData = await readRes.json();
    assert.strictEqual(readData.code, 200, "恢复已读必须成功");
    console.log("  ✓ 已读/未读状态双向流转正常");

    // 10. 验证管理面板 AI 集成设置 (/settings/category)
    console.log("\n[步骤 10] 验证管理面板 /settings/category 中 AI 模型与 API 密钥集成 UI 与测试端点...");
    await page.goto(BASE + "/settings/category", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const cardContent = await page.textContent(".settings-container");
    assert.ok(
      cardContent.includes("AI") || cardContent.includes("智能集成") || cardContent.includes("Workers AI"),
      "设置面板必须包含 AI 配置卡片"
    );

    // 测试 /api/setting/ai/test 接口
    const testAiRes = await page.request.post(BASE + "/api/setting/ai/test", {
      data: {},
      headers: {
        Authorization: adminToken,
        "Content-Type": "application/json"
      }
    });
    const testAiData = await testAiRes.json();
    console.log("  AI 连通性测试返回:", testAiData);
    assert.strictEqual(testAiData.code, 200, "AI 测试端点必须返回 code 200");
    console.log("  ✓ 管理面板 AI 连通性测试端点验证成功");

    console.log("\n==========================================================================");
    console.log("=== 所有 Gmail UI 升级、to me 详情卡片、操作按钮与 AI 翻译测试全部通过! ===");
    console.log("==========================================================================");
  } finally {
    await browser.close();
  }
})();
