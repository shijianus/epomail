import { chromium } from "playwright";
import assert from "assert";

(async () => {
  console.log("=== 开始系统设置「邮件推送」优化及 3 大模式 Playwright 自动化测试 ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN"
  });
  const page = await context.newPage();

  const BASE = "https://epomail.epocanvas.workers.dev";

  try {
    // 1. 登录管理员
    console.log("1. 正在登录 Cloudflare 生产环境...");
    const loginRes = await page.request.post(BASE + "/api/login", {
      data: { email: "admin@epomail.bond", password: "123456" },
      headers: { "Content-Type": "application/json" }
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.token;
    assert(token, "登录未返回 Token");

    // Helper: 设置全站邮件模式
    async function setAllMailMode(mode) {
      const res = await page.request.put(BASE + "/api/setting/set", {
        data: { allMailMode: mode },
        headers: { "Content-Type": "application/json", "Authorization": token }
      });
      const data = await res.json();
      assert(data.code === 200, `设置邮件模式 ${mode} 失败: ` + JSON.stringify(data));
    }

    await page.goto(BASE + "/settings/data", { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("token", t);
      localStorage.setItem("setting", JSON.stringify({ lang: "zh" }));
      localStorage.setItem("locale", "zh");
    }, token);

    // Helper: 导航至系统设置
    async function goToSysSetting() {
      await page.goto(BASE + "/settings/data", { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      const sysNavTab = page.locator(".settings-nav-item").filter({ hasText: "系统设置" }).first();
      await sysNavTab.click();
      await page.waitForTimeout(1500);
    }

    // Helper: 获取当前展示的 Tooltip 内容
    async function getVisibleTooltipText(triggerLocator) {
      await triggerLocator.scrollIntoViewIfNeeded();
      await triggerLocator.hover();
      await page.waitForTimeout(800);
      const text = await page.evaluate(() => {
        const poppers = Array.from(document.querySelectorAll('.el-popper, [role="tooltip"]'));
        for (const p of poppers) {
          const style = window.getComputedStyle(p);
          if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
            const t = p.innerText?.trim();
            if (t) return t;
          }
        }
        return '';
      });
      return text;
    }

    // ==========================================
    // 2. 测试模式 0: 隐私邮件模式 (allMailMode = 0)
    // ==========================================
    console.log("2. 测试模式 0: 隐私邮件模式 (allMailMode = 0)...");
    await setAllMailMode(0);
    await goToSysSetting();

    const emailPushCard = page.locator(".settings-card").filter({ hasText: "邮件推送" });
    assert.ok(await emailPushCard.count() > 0, "应找到邮件推送卡片");

    // 验证转发规则后的 ? 图标及提示
    const forwardRuleRow = emailPushCard.locator(".setting-item").filter({ hasText: "转发规则" });
    const forwardRuleWarningIcon = forwardRuleRow.locator(".warning");
    assert.ok(await forwardRuleWarningIcon.count() > 0, "隐私模式下转发规则后应有 ? 提示图标");

    // 悬浮验证 tooltip 内容
    let tooltipText = await getVisibleTooltipText(forwardRuleWarningIcon);
    console.log("隐私模式转发规则 Tooltip:", tooltipText);
    assert.ok(tooltipText.includes("当前规则将局限于所有的垃圾邮件") && tooltipText.includes("隐私模式下无法查看用户的正常邮件"), "隐私模式转发规则 Tooltip 内容应符合要求");

    // 打开转发规则弹窗
    const forwardRuleBtn = forwardRuleRow.locator(".opt-button");
    await forwardRuleBtn.click();
    await page.waitForSelector(".forward-dialog", { timeout: 5000 });
    await page.waitForTimeout(500);

    // 验证转发规则弹窗内无意义的 admin-notice-callout 已被彻底删除
    const forwardRuleCalloutCount = await page.locator(".forward-dialog .admin-notice-callout").count();
    console.log("转发规则弹窗内 callout 数量:", forwardRuleCalloutCount);
    assert.strictEqual(forwardRuleCalloutCount, 0, "转发规则弹窗内无意义的 callout 应已被彻底删除");

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_sys_setting_rules_dialog_clean.png" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    // 打开第三方邮箱弹窗，验证 notice-text 中的区分与删除
    const thirdEmailRow = emailPushCard.locator(".setting-item").filter({ hasText: "第三方邮箱" });
    const thirdEmailBtn = thirdEmailRow.locator(".opt-button");
    await thirdEmailBtn.click();
    await page.waitForSelector(".sys-third-email-dialog", { timeout: 5000 });
    await page.waitForTimeout(500);

    const thirdNoticeTextMode0 = await page.locator(".sys-third-email-dialog .notice-text").innerText();
    console.log("隐私模式第三方邮箱说明:", thirdNoticeTextMode0);
    assert.ok(!thirdNoticeTextMode0.includes("加密模式安全防护：在加密邮件模式下，全站严禁向外部未验证邮箱转发"), "第三方邮箱说明中应删除旧的加密模式安全防护说明");
    assert.ok(thirdNoticeTextMode0.includes("隐私过滤保护") && thirdNoticeTextMode0.includes("底层无损路由"), "隐私模式下应正确展示隐私过滤保护说明");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    // ==========================================
    // 3. 测试模式 2: 加密邮件模式 (allMailMode = 2)
    // ==========================================
    console.log("3. 测试模式 2: 加密邮件模式 (allMailMode = 2)...");
    await setAllMailMode(2);
    await goToSysSetting();

    const emailPushCardMode2 = page.locator(".settings-card").filter({ hasText: "邮件推送" });
    
    // 验证转发规则后 ? 提示
    const forwardRuleRowMode2 = emailPushCardMode2.locator(".setting-item").filter({ hasText: "转发规则" });
    const forwardRuleWarningIconMode2 = forwardRuleRowMode2.locator(".warning");
    let tooltipTextMode2 = await getVisibleTooltipText(forwardRuleWarningIconMode2);
    console.log("加密模式转发规则 Tooltip:", tooltipTextMode2);
    assert.ok(tooltipTextMode2.includes("加密模式下无法查看任何用户的任何邮件") && tooltipTextMode2.includes("请前往用户的资料分区增设"), "加密模式转发规则 Tooltip 应符合要求");

    // 验证转发规则按钮在加密模式下为禁用状态
    const forwardRuleOptBtnMode2 = forwardRuleRowMode2.locator(".opt-button");
    const isForwardRuleBtnDisabled = await forwardRuleOptBtnMode2.isDisabled();
    console.log("加密模式转发规则按钮 disabled 状态:", isForwardRuleBtnDisabled);
    assert.ok(isForwardRuleBtnDisabled, "加密模式下转发规则按钮应被禁用");

    // 验证第三方邮箱后的 ? 提示
    const thirdEmailRowMode2 = emailPushCardMode2.locator(".setting-item").filter({ hasText: "第三方邮箱" });
    const thirdEmailWarningIconMode2 = thirdEmailRowMode2.locator(".warning");
    let thirdTooltipTextMode2 = await getVisibleTooltipText(thirdEmailWarningIconMode2);
    console.log("加密模式第三方邮箱 Tooltip:", thirdTooltipTextMode2);
    assert.ok(thirdTooltipTextMode2.includes("加密模式下第三方邮件需要在用户的资料分区中配置才能正常完成转发"), "加密模式第三方邮箱 Tooltip 应符合要求");

    // 打开 Telegram 机器人设置弹窗，验证开关和按钮被强制关闭/禁用
    const tgRowMode2 = emailPushCardMode2.locator(".setting-item").filter({ hasText: "Telegram 机器人" });
    const tgBtnMode2 = tgRowMode2.locator(".opt-button");
    await tgBtnMode2.click();
    await page.waitForSelector(".sys-tg-dialog", { timeout: 5000 });
    await page.waitForTimeout(500);

    const isTgSwitchDisabled = await page.locator(".sys-tg-dialog .el-switch input").isDisabled().catch(() => false) ||
                               await page.locator(".sys-tg-dialog .el-switch.is-disabled").count() > 0;
    const isTgSaveBtnDisabled = await page.locator(".sys-tg-dialog .dialog-footer .el-button").isDisabled();
    console.log("加密模式 TG Bot switch disabled:", isTgSwitchDisabled, ", saveBtn disabled:", isTgSaveBtnDisabled);
    assert.ok(isTgSwitchDisabled, "加密模式下 TG 机器人设置中的开关 switch 应被强制关闭且禁用无法打开");
    assert.ok(isTgSaveBtnDisabled, "加密模式下 TG 机器人保存按钮应为禁用状态");

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_sys_setting_tg_encrypted_disabled.png" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    // 打开第三方邮箱设置弹窗，验证加密模式下的 notice-text 区分
    const thirdEmailBtnMode2 = thirdEmailRowMode2.locator(".opt-button");
    await thirdEmailBtnMode2.click();
    await page.waitForSelector(".sys-third-email-dialog", { timeout: 5000 });
    await page.waitForTimeout(500);

    const thirdNoticeTextMode2 = await page.locator(".sys-third-email-dialog .notice-text").innerText();
    console.log("加密模式第三方邮箱说明:", thirdNoticeTextMode2);
    assert.ok(!thirdNoticeTextMode2.includes("加密模式安全防护：在加密邮件模式下，全站严禁向外部未验证邮箱转发"), "第三方邮箱说明中应删除旧的加密模式安全防护说明");
    assert.ok(thirdNoticeTextMode2.includes("受信任验证号池") && thirdNoticeTextMode2.includes("个人端配置要求"), "加密模式下应展示号池基座与个人端配置要求说明");

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_sys_setting_third_email_encrypted.png" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    // ==========================================
    // 4. 测试模式 1: 全部邮件模式 (allMailMode = 1)
    // ==========================================
    console.log("4. 测试模式 1: 全部邮件模式 (allMailMode = 1)...");
    await setAllMailMode(1);
    await goToSysSetting();

    // 打开第三方邮箱弹窗
    const thirdEmailBtnMode1 = page.locator(".settings-card").filter({ hasText: "邮件推送" }).locator(".setting-item").filter({ hasText: "第三方邮箱" }).locator(".opt-button");
    await thirdEmailBtnMode1.click();
    await page.waitForSelector(".sys-third-email-dialog", { timeout: 5000 });
    await page.waitForTimeout(500);

    const thirdNoticeTextMode1 = await page.locator(".sys-third-email-dialog .notice-text").innerText();
    console.log("全部模式第三方邮箱说明:", thirdNoticeTextMode1);
    assert.ok(!thirdNoticeTextMode1.includes("加密模式安全防护：在加密邮件模式下，全站严禁向外部未验证邮箱转发"), "第三方邮箱说明中应删除旧的加密模式安全防护说明");
    assert.ok(thirdNoticeTextMode1.includes("全站转发生效") && thirdNoticeTextMode1.includes("底层无损路由"), "全部模式下应展示全站转发生效说明");

    await page.screenshot({ path: "/home/shijian/projects/epocanvas-mail/tests/audit_sys_setting_third_email_mode1.png" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    console.log("🎉 系统设置「邮件推送」优化及 3 大模式所有 Playwright 自动化测试 100% 成功通过！");

    // 恢复为默认初始状态: allMailMode = 1
    await setAllMailMode(1);

  } catch (err) {
    console.error("测试失败:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
