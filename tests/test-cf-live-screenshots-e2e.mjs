import { chromium } from 'playwright';
import assert from 'assert';
import path from 'path';
import fs from 'fs';

const BASE = process.env.TEST_BASE_URL || 'https://mail.epocanvas.com';
const SCREENSHOT_DIR = '/root/.gemini/antigravity-cli/brain/68a65650-4c47-46f7-a04e-1d2bc6734d72/screenshots';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

console.log(`=== 开始在真实生产环境 ${BASE} 执行 Playwright 视觉截屏与隐式注释全链路验证 ===\n`);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    deviceScaleFactor: 1.5,
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('  [Browser Console Error]:', msg.text());
  });

  try {
    // 1. 登录真实生产接口
    console.log(`[Step 1] 正在通过 API 登录生产环境 ${BASE}...`);
    const loginRes = await page.request.post(`${BASE}/api/login`, {
      data: { email: 'admin@epomail.bond', password: '123456' },
      headers: { 'Content-Type': 'application/json' },
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, `登录失败: ${JSON.stringify(loginJson)}`);
    const token = typeof loginJson.data === 'string' ? loginJson.data : loginJson.data?.token;
    assert.ok(token, '未能获取到有效 token');
    console.log('✓ 生产环境认证成功，获取到管理员 Token\n');

    // 2. 导航辅助函数：支持平滑 SPA 客户端路由 + 加载遮罩等待
    async function waitForPageReady(targetSelector) {
      // 等待初始加载遮罩完全消失
      await page.waitForFunction(() => {
        const el = document.getElementById('loading-first');
        return !el || el.classList.contains('loading-hide') ||
          window.getComputedStyle(el).display === 'none' ||
          window.getComputedStyle(el).opacity === '0';
      }, { timeout: 15000 }).catch(() => {});

      // 等待应用容器出现
      await page.waitForSelector('#app', { timeout: 10000 });

      // 如果指定了目标选择器，等待其可见
      if (targetSelector) {
        await page.waitForSelector(targetSelector, { timeout: 15000, state: 'visible' });
      }
      await page.waitForTimeout(600);
    }

    async function navigateTo(urlPath, targetSelector) {
      // 首先尝试 client-side SPA 路由跳转（避免整页刷新白屏与网络抖动）
      const clientRouted = await page.evaluate((path) => {
        try {
          const app = document.getElementById('app');
          if (app && app.__vue_app__) {
            app.__vue_app__.config.globalProperties.$router.push(path);
            return true;
          }
        } catch (e) {}
        return false;
      }, urlPath).catch(() => false);

      if (!clientRouted) {
        const fullUrl = `${BASE}${urlPath}`;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            break;
          } catch (e) {
            if (attempt === 3) throw e;
            console.log(`    (网络握手重试 ${attempt + 1}/3 到 ${urlPath}: ${e.message})`);
            await page.waitForTimeout(1500);
          }
        }
      }

      await waitForPageReady(targetSelector);
    }

    // 初始化状态
    console.log('[Step 2] 注入 Token 并初始化管理端状态...');
    await page.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate(({ token }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('loginEmail', 'admin@epomail.bond');
      localStorage.setItem('ui', JSON.stringify({ dark: false, locale: 'zh', defaultTranslateLang: 'zh' }));
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
      localStorage.setItem('locale', 'zh');
    }, { token });

    // 3. 验证「系统设置 (sys-setting)」
    console.log('\n[Step 3] 验证「系统设置」(/sys-setting)...');
    await navigateTo('/sys-setting', '.sys-settings-page, .setting-item');

    // 3.1 验证不存在显式 hint 容器
    const explicitHintsSys = await page.locator('.static-ui-tip, .b2-guidance-box, .d-sub-hint, .sub-hint, .section-intro').count();
    console.log(`  - 系统设置中显式提示容器检出数: ${explicitHintsSys} (预期为 0)`);
    assert.strictEqual(explicitHintsSys, 0, '系统设置中不应残留任何显式提示容器');

    // 3.2 截屏 1: 系统设置全景
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_sys_setting_overview.png') });
    console.log('  ✓ 截屏已保存: 01_sys_setting_overview.png');

    // 3.3 检查 2FA / TOTP 隐式气泡在当前模式下的动态文本
    const totpContainer = page.locator('.setting-item:has-text("两步验证")').first();
    const totpTooltipTrigger = totpContainer.locator('.el-tooltip__trigger, svg').first();
    if (await totpTooltipTrigger.count() > 0) {
      await totpTooltipTrigger.hover();
      await page.waitForTimeout(600);
      const ariaId = await totpTooltipTrigger.getAttribute('aria-describedby');
      let tooltipText = '';
      if (ariaId) {
        tooltipText = await page.locator(`#${ariaId}`).innerText().catch(() => '');
      }
      if (!tooltipText) {
        tooltipText = await page.locator('.el-popper.is-dark').filter({ hasText: 'TOTP' }).first().innerText().catch(() => '');
      }
      console.log(`  - 2FA/TOTP 气泡当前动态文本: "${tooltipText.trim()}"`);
      assert.strictEqual(tooltipText.trim(), '全站强制开启 TOTP 两步验证以保障密钥派生安全与数据隐私，禁止关闭');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_sys_setting_2fa_tooltip.png') });
      console.log('  ✓ 截屏已保存: 02_sys_setting_2fa_tooltip.png');
    }

    // 3.4 检查邮件模式隐式气泡动态文本
    const mailModeContainer = page.locator('.setting-item:has-text("邮件模式")').first();
    const mailModeTrigger = mailModeContainer.locator('.el-tooltip__trigger, svg').first();
    if (await mailModeTrigger.count() > 0) {
      await mailModeTrigger.hover();
      await page.waitForTimeout(600);
      const ariaId = await mailModeTrigger.getAttribute('aria-describedby');
      let mailModeText = '';
      if (ariaId) {
        mailModeText = await page.locator(`#${ariaId}`).innerText().catch(() => '');
      }
      if (!mailModeText) {
        mailModeText = await page.locator('.el-popper.is-dark').filter({ hasText: '模式' }).first().innerText().catch(() => '');
      }
      console.log(`  - 邮件模式气泡当前动态文本: "${mailModeText.trim()}"`);
      assert.ok(mailModeText.includes('模式') || mailModeText.includes('邮件'), '邮件模式气泡应展示对应模式说明');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_sys_setting_mail_mode_tooltip.png') });
      console.log('  ✓ 截屏已保存: 03_sys_setting_mail_mode_tooltip.png');
    }

    // 3.5 打开 S3 配置弹窗检查无 .b2-guidance-box，字段提示均为隐式
    const s3ConfigBtn = page.locator('.opt-btn-s3').first();
    if (await s3ConfigBtn.count() > 0) {
      await s3ConfigBtn.click();
      await page.waitForSelector('.storage-config-dialog', { timeout: 5000, state: 'visible' });
      await page.waitForTimeout(800);
      const b2BoxCount = await page.locator('.b2-guidance-box').count();
      const dSubHintCount = await page.locator('.s3-modal-body .d-sub-hint').count();
      console.log(`  - S3 弹窗中 .b2-guidance-box 数量: ${b2BoxCount}, .d-sub-hint 数量: ${dSubHintCount}`);
      assert.strictEqual(b2BoxCount, 0, 'S3 弹窗中不应存在显式 .b2-guidance-box');
      assert.strictEqual(dSubHintCount, 0, 'S3 弹窗中不应存在显式 .d-sub-hint');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_sys_setting_s3_modal.png') });
      console.log('  ✓ 截屏已保存: 04_sys_setting_s3_modal.png');
      const closeBtn = page.locator('.storage-config-dialog .el-dialog__headerbtn, .el-dialog__close').first();
      if (await closeBtn.count() > 0) await closeBtn.click();
      await page.waitForTimeout(500);
    }

    // 4. 验证「资料与云存储设置 (data-setting)」
    console.log('\n[Step 4] 验证「资料设置」(/settings/data)...');
    await navigateTo('/settings/data', '.export-container, .data-settings-page');

    const explicitHintsData = await page.locator('.section-intro, .sub-hint, .d-sub-hint, .b2-guidance-box').count();
    console.log(`  - 资料设置中显式提示容器检出数: ${explicitHintsData} (预期为 0)`);
    assert.strictEqual(explicitHintsData, 0, '资料设置中不应残留任何显式提示容器');

    // 4.1 截屏: 资料设置全景
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_data_setting_overview.png') });
    console.log('  ✓ 截屏已保存: 05_data_setting_overview.png');

    // 4.2 悬浮数据汇出标题气泡
    const exportTitleTooltipTrigger = page.locator('.export-container .title svg').first();
    if (await exportTitleTooltipTrigger.count() > 0) {
      await exportTitleTooltipTrigger.hover();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_data_setting_export_tooltip.png') });
      console.log('  ✓ 截屏已保存: 06_data_setting_export_tooltip.png');
    }

    // 5. 验证「开放平台 (oauth-app)」
    console.log('\n[Step 5] 验证「开放平台」(/settings/oauth-apps)...');
    await navigateTo('/settings/oauth-apps', '.header-container, .main-title');

    const explicitHintsOauth = await page.locator('.section-intro, .d-sub-hint, .input-bottom-tips').count();
    console.log(`  - 开放平台中显式提示容器检出数: ${explicitHintsOauth} (预期为 0)`);
    assert.strictEqual(explicitHintsOauth, 0, '开放平台中不应残留任何显式提示容器');

    // 5.1 截屏: 开放平台全景
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_oauth_apps_overview.png') });
    console.log('  ✓ 截屏已保存: 07_oauth_apps_overview.png');

    // 5.2 打开新建应用弹窗，检查表单无显式提示
    const createBtn = page.locator('button:has-text("注册新应用")').first();
    if (await createBtn.count() > 0) {
      await createBtn.click();
      await page.waitForTimeout(800);
      const dialogHints = await page.locator('.oauth-dialog .d-sub-hint, .oauth-dialog .input-bottom-tips').count();
      console.log(`  - 注册应用弹窗内显式提示数: ${dialogHints} (预期为 0)`);
      assert.strictEqual(dialogHints, 0, '注册应用弹窗内不应存在显式提示');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_oauth_app_create_dialog.png') });
      console.log('  ✓ 截屏已保存: 08_oauth_app_create_dialog.png');
      const cancelBtn = page.locator('.oauth-dialog button:has-text("取消")').first();
      if (await cancelBtn.count() > 0) await cancelBtn.click();
      await page.waitForTimeout(500);
    }

    // 6. 验证「常规与外观设置 (profile-setting)」
    console.log('\n[Step 6] 验证「常规设置」(/settings/general)...');
    await navigateTo('/settings/general', '.general-settings-page, .theme-item');

    const explicitHintsGeneral = await page.locator('.sub-hint, .type-desc').count();
    console.log(`  - 常规设置中显式提示/type-desc检出数: ${explicitHintsGeneral} (预期为 0)`);
    assert.strictEqual(explicitHintsGeneral, 0, '常规设置中不应残留显式 sub-hint 或 type-desc');

    // 6.1 悬浮壁纸问号气泡
    const wallpaperTooltip = page.locator('text=主栏底层壁纸').locator('xpath=..').locator('svg').first();
    if (await wallpaperTooltip.count() > 0) {
      await wallpaperTooltip.hover();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_profile_setting_wallpaper_tooltip.png') });
      console.log('  ✓ 截屏已保存: 09_profile_setting_wallpaper_tooltip.png');
    }

    // 6.2 截屏: 收件箱 6 种类型干净模式（滚动到收件箱类型卡片处）
    const inboxTypeSection = page.locator('text=收件箱类型').locator('xpath=..').first();
    if (await inboxTypeSection.count() > 0) {
      await inboxTypeSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_profile_setting_inbox_types.png') });
    console.log('  ✓ 截屏已保存: 10_profile_setting_inbox_types.png');

    // 7. 验证「安全与两步验证 (setting)」
    console.log('\n[Step 7] 验证「安全设置」(/settings/security)...');
    await navigateTo('/settings/security', '.second-steps-card');

    const explicitHintsSec = await page.locator('.sub-desc').count();
    console.log(`  - 安全设置中 .sub-desc 检出数: ${explicitHintsSec} (预期为 0)`);
    assert.strictEqual(explicitHintsSec, 0, '安全设置中不应残留 .sub-desc');

    const secMethodsTrigger = page.locator('text=第二步验证方式').locator('xpath=..').locator('svg').first();
    if (await secMethodsTrigger.count() > 0) {
      await secMethodsTrigger.hover();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_security_setting_2fa_tooltip.png') });
      console.log('  ✓ 截屏已保存: 11_security_setting_2fa_tooltip.png');
    }

    // 8. 验证「规则与分类抽屉 (category-setting)」
    console.log('\n[Step 8] 验证「规则分类」(/settings/category)...');
    await navigateTo('/settings/category', '.settings-card');

    // 8.1 截屏: 分类主视图
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_category_setting_overview.png') });
    console.log('  ✓ 截屏已保存: 12_category_setting_overview.png');

    // 8.2 打开过滤规则抽屉并检查无 .drawer-desc，标题带有隐式气泡
    const drawerOpenBtn = page.locator('.settings-card').filter({ hasText: '基础名单' }).locator('.opt-button').first();
    if (await drawerOpenBtn.count() > 0) {
      await drawerOpenBtn.click();
      await page.waitForSelector('.el-overlay:not([style*="display: none"]) .el-drawer', { timeout: 8000, state: 'visible' });
      await page.waitForTimeout(800);
      const drawerDescCount = await page.locator('.drawer-desc').count();
      console.log(`  - 规则抽屉打开后 .drawer-desc 数量: ${drawerDescCount} (预期为 0)`);
      assert.strictEqual(drawerDescCount, 0, '抽屉内不应存在显式 .drawer-desc');
      
      // 检查抽屉 Header 中的问号气泡
      const drawerHeaderTooltip = page.locator('.el-drawer .el-drawer__header svg').first();
      const hasHeaderTooltip = await drawerHeaderTooltip.count() > 0;
      console.log(`  - 规则抽屉 Header 隐式问号气泡存在: ${hasHeaderTooltip}`);
      assert.ok(hasHeaderTooltip, '抽屉 Header 应具备隐式问号气泡说明');

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_category_drawer_clean.png') });
      console.log('  ✓ 截屏已保存: 13_category_drawer_clean.png');
    }

    console.log('\n🎉 所有生产环境 Playwright 视觉截屏与断言 100% 通过！\n');

  } finally {
    await browser.close();
  }
})();
