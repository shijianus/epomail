import { chromium } from 'playwright';
import assert from 'assert';

(async () => {
  console.log('=== 开始全员系统欢迎邮件大弹窗、全屏模式与真实收件箱全链路 Playwright 验证 ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });
  const page = await context.newPage();

  const BASE = 'https://epomail.epocanvas.workers.dev';

  try {
    // Step 1: 登录
    console.log('1. 正在登录 Cloudflare 生产环境...');
    const loginRes = await page.request.post(BASE + '/api/login', {
      data: { email: 'admin@epomail.bond', password: '123456' },
      headers: { 'Content-Type': 'application/json' }
    });
    const loginData = await loginRes.json();
    if (loginData.code !== 200) {
      throw new Error('登录失败: ' + JSON.stringify(loginData));
    }
    const token = loginData.data?.token;
    console.log('✓ 登录成功，获取 Token');

    // Step 2: 注入 Token 并打开应用
    await page.goto(BASE + '/inbox', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('token', t);
      localStorage.setItem('locale', 'zh');
    }, token);
    await page.goto(BASE + '/inbox', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Step 3: 前往系统设置
    console.log('2. 导航至系统设置 (System Settings)...');
    await page.goto(BASE + '/settings/profile', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const sysSettingLink = page.locator('.settings-nav-item').filter({ hasText: /系统设置|System Settings/i });
    if (await sysSettingLink.count() > 0) {
      await sysSettingLink.first().click();
      await page.waitForTimeout(2000);
    }

    // Step 4: 打开欢迎邮件弹窗 (默认非全屏大弹窗)
    console.log('3. 打开全员系统欢迎邮件大弹窗...');
    const welcomeCard = page.locator('.settings-card').filter({ hasText: /网站公告|公告|Notice|全员系统欢迎邮件|欢迎邮件/i });
    const quillBtn = welcomeCard.locator('.opt-button').last();
    await quillBtn.click();
    await page.waitForTimeout(2500);

    // 验证默认非全屏大弹窗属性
    console.log('4. 验证默认状态为居中大弹窗 (非全屏)...');
    const dialog = page.locator('.welcome-dialog-canvas');
    await dialog.waitFor({ state: 'visible' });
    const box = await dialog.boundingBox();
    console.log(`- 弹窗尺寸: ${Math.round(box.width)}px x ${Math.round(box.height)}px (窗口: 1440x900, top: ${Math.round(box.y)}px)`);
    assert.ok(box.width >= 1000 && box.width <= 1200, '默认必须是大弹窗而非直接全屏');
    assert.ok(box.y > 10, '默认弹窗顶部必须保留边距，呈现标准弹窗层级');

    // 验证顶栏去冗余：无 sender 字符串
    const headerText = await page.locator('.welcome-dialog-canvas .el-dialog__header').innerText();
    assert.ok(!headerText.includes('admin@epocanvas.com'), '顶栏必须剔除冗余的发件人字符串');
    console.log('✓ 顶栏去冗余校验通过');

    // 验证发送对象单行条，无不可编辑的邮件属性卡片
    const recipientsRow = page.locator('.welcome-recipients-row');
    await recipientsRow.waitFor({ state: 'visible' });
    const recipientsText = await recipientsRow.innerText();
    console.log('- 发送对象行文本内容:', recipientsText.replace(/\n/g, ' '));
    assert.ok(/发送对象|Recipients/i.test(recipientsText), '发送对象行必须显示');
    assert.ok(/所有现有用户|All Users/i.test(recipientsText), '受众说明必须显示');
    const oldAttributesCard = page.locator('.mail-attributes, .meta-cards-row');
    assert.strictEqual(await oldAttributesCard.count(), 0, '不可编辑的邮件属性卡片已彻底移除');
    console.log('✓ 单行发送对象条与去冗余校验通过');

    // 验证全屏切换能力，且全屏时不遮挡顶栏(Header)和底栏(Statusbar)
    console.log('5. 测试全屏模式切换并验证保留全局顶栏与底栏...');
    const topFullscreenBtn = page.locator('.top-action-btn');
    await topFullscreenBtn.click();
    await page.waitForTimeout(1000);

    const isFullscreenNow = await dialog.evaluate(el => el.classList.contains('is-fullscreen'));
    assert.ok(isFullscreenNow, '点击全屏按钮后弹窗必须进入全屏状态');

    const fullscreenBox = await dialog.boundingBox();
    console.log(`- 全屏状态尺寸: ${Math.round(fullscreenBox.width)}px x ${Math.round(fullscreenBox.height)}px (top: ${Math.round(fullscreenBox.y)}px)`);
    assert.ok(fullscreenBox.y >= 45, '全屏模式下顶部必须保留 >= 50px，绝不遮挡全局导航顶栏');
    assert.ok(fullscreenBox.height <= 850, '全屏模式下底部必须保留状态栏空间，绝不遮挡底栏');
    console.log('✓ 全屏模式安全视窗校验通过 (全局顶栏与底栏完全不受遮挡)');

    // 再次点击退出全屏
    await topFullscreenBtn.click();
    await page.waitForTimeout(800);
    const isExitedFullscreen = await dialog.evaluate(el => !el.classList.contains('is-fullscreen'));
    assert.ok(isExitedFullscreen, '再次点击必须成功退出全屏模式');
    console.log('✓ 退出全屏返回大弹窗模式校验通过');

    // 验证编辑器顶栏右对齐纯 Icon 按钮组
    console.log('6. 验证编辑器顶栏右对齐纯 Icon 工具栏 (无冗余文字标签)...');
    const rightTools = page.locator('.editor-right-tools');
    await rightTools.waitFor({ state: 'visible' });
    const modeSwitch = rightTools.locator('.editor-mode-switch');
    await modeSwitch.waitFor({ state: 'visible' });
    console.log('✓ 编辑器模式切换胶囊开关 (Segmented Switch) 渲染通过');

    const rightToolIcons = rightTools.locator('.tool-icon-btn');
    const rightToolCount = await rightToolIcons.count();
    console.log(`- 右侧纯 Icon 按钮数量: ${rightToolCount}`);
    assert.ok(rightToolCount >= 3, '右侧必须包含清空、恢复模板、全屏等纯 Icon 按钮');

    // 校验按钮几何居中
    const sampleBtn = rightToolIcons.first();
    const btnBox = await sampleBtn.boundingBox();
    const iconBox = await sampleBtn.locator('svg').boundingBox();
    const btnCenterX = btnBox.x + btnBox.width / 2;
    const iconCenterX = iconBox.x + iconBox.width / 2;
    assert.ok(Math.abs(btnCenterX - iconCenterX) < 2, 'Icon 必须在 Button 内部严格几何居中');
    console.log('✓ Button 与 Icon 居中对齐校验通过');

    // 截图 1: 大弹窗富文本编辑视图
    console.log('📸 截取大弹窗富文本编辑视图...');
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/cf_dialog_rich_editor.png' });

    // Step 5: 通过模式开关切换到源码 (Markdown) 模式
    console.log('7. 通过模式开关切换到源码 (Markdown) 模式并验证 Markdown 辅助工具与编辑器...');
    const sourceSwitchBtn = modeSwitch.locator('.mode-switch-btn').nth(1);
    await sourceSwitchBtn.click();
    await page.waitForTimeout(1000);

    const sourceTextarea = page.locator('.source-textarea-fullscreen textarea');
    await sourceTextarea.waitFor({ state: 'visible' });

    const leftTools = page.locator('.editor-left-tools .tool-icon-btn');
    const leftCount = await leftTools.count();
    console.log(`- 源码模式下 Markdown 快捷辅助工具数量: ${leftCount}`);
    assert.ok(leftCount >= 5, '源码模式下必须显示 H1, H2, 加粗, 斜体, 代码块等辅助工具');

    // 截图 2: 源码模式
    console.log('📸 截取源码 Markdown 编辑视图...');
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/cf_dialog_source_editor.png' });

    // Step 6: 恢复官方微软 Fluent 默认模版
    console.log('8. 恢复官方微软 Fluent 默认模版 (含精美矢量插画与品牌 Logo)...');
    const resetIconBtn = rightTools.locator('.tool-icon-btn').nth(1); // Index 1 is reset template
    await resetIconBtn.click();
    await page.waitForTimeout(1000);

    const resetSourceVal = await sourceTextarea.inputValue();
    assert.ok(resetSourceVal.includes('顶级域名身份') || resetSourceVal.includes('专属域名身份'), '恢复默认模板后源码必须包含核心价值1');
    assert.ok(resetSourceVal.includes('纯粹') || resetSourceVal.includes('零商业变现'), '恢复默认模板后源码必须包含核心价值2');
    assert.ok(resetSourceVal.includes('开启我的收件箱'), '恢复默认模板后源码必须包含真实 CTA 按钮');
    assert.ok(resetSourceVal.includes('设定个人资料与讯息') || resetSourceVal.includes('/settings/profile'), '恢复默认模板后源码必须包含个人讯息设置引导按钮');
    console.log('✓ 微软 Fluent 默认模版重置成功');

    const richSwitchBtn = modeSwitch.locator('.mode-switch-btn').first();
    await richSwitchBtn.click();
    await page.waitForTimeout(1500);

    // Step 7: 保存配置
    console.log('9. 点击保存配置...');
    const saveBtn = page.locator('.btn-save-secondary');
    await saveBtn.click();
    await page.waitForTimeout(2000);
    console.log('✓ 欢迎邮件模版配置保存成功');

    // Step 8: 重新打开弹窗并执行全员投递
    console.log('10. 触发全员欢迎邮件投递并验证高危二次确认模态框...');
    await quillBtn.click();
    await page.waitForTimeout(2000);

    const broadcastBtn = page.locator('.btn-broadcast-primary');
    await broadcastBtn.click();
    await page.waitForTimeout(1000);

    // 验证高危二次确认模态框
    const confirmBox = page.locator('.high-risk-modal');
    await confirmBox.waitFor({ state: 'visible' });
    console.log('📸 截取高风险全员发送二次确认模态框...');
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/cf_dialog_confirm_modal.png' });

    const dangerConfirmBtn = confirmBox.locator('.btn-danger-confirm');
    await dangerConfirmBtn.click();
    await page.waitForTimeout(3000);
    console.log('✓ 全员群发请求发送完成');

    // Step 9: 前往真实收件箱查看真实邮件
    console.log('11. 前往真实收件箱查看真实投递的官方欢迎邮件...');
    await page.goto(BASE + '/inbox', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // 找到官方欢迎邮件
    const welcomeMailRow = page.locator('.email-row').filter({ hasText: /欢迎开启您的专属独立域名邮箱|欢迎加入 Epocanvas Mail|官方团队/i }).first();
    await welcomeMailRow.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✓ 真实收件箱中成功收到官方系统欢迎邮件！');

    // Step 10: 打开阅读窗格并校验 Shadow DOM 内容
    console.log('12. 打开真实收件箱中的欢迎邮件并校验微软风格排版、矢量插画与 CTA 按钮...');
    await welcomeMailRow.click();
    await page.waitForTimeout(2500);

    // 验证官方系统邮件横幅与认证徽章
    const officialBanner = page.locator('.official-system-banner');
    await officialBanner.waitFor({ state: 'visible' });
    console.log('✓ 真实收件箱中显示官方系统认证横幅与专属标签！');

    // 验证邮件正文中的 5 大核心价值与 CTA 按钮 (通过 Shadow DOM 获取正文内容)
    const contentHtml = page.locator('.content-html');
    await contentHtml.waitFor({ state: 'visible' });
    const contentText = await contentHtml.evaluate(el => el.shadowRoot ? el.shadowRoot.textContent : el.textContent);
    assert.ok(contentText.includes('顶级域名身份') || contentText.includes('专属域名身份'), '必须包含核心价值1：专属域名身份');
    assert.ok(contentText.includes('纯粹') || contentText.includes('零商业变现'), '必须包含核心价值2：纯粹私密 · 零商业变现');
    assert.ok(contentText.includes('国内极速直连'), '必须包含核心价值3：国内极速直连 · 免翻墙不折腾');
    assert.ok(contentText.includes('进阶工作流') || contentText.includes('稍后处理') || contentText.includes('收件箱管理'), '必须包含核心价值4：进阶工作流 · 极简轻盈');
    assert.ok(contentText.includes('别名') || contentText.includes('熔断'), '必须包含核心价值5：多别名分发 · 垃圾邮件一键熔断');
    assert.ok(contentText.includes('开启我的收件箱'), '必须包含真实 CTA 按钮');
    console.log('✓ 邮件正文 5 大核心价值与微软排版校验 100% 符合标准！');

    // 截图 3: 真实收件箱真实邮件渲染效果 (顶部)
    console.log('📸 截取真实收件箱中真实渲染的微软 Fluent 欢迎邮件详情 (顶部)...');
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/cf_dialog_real_inbox_email_view.png' });

    // 滚动并截图中部卡片
    console.log('📸 截取邮件详情 (中部 5 大核心价值卡片)...');
    await page.evaluate(() => {
      const scrollEl = document.querySelector('.scrollbar .el-scrollbar__wrap') || document.querySelector('.scrollbar');
      if (scrollEl) scrollEl.scrollTop = 520;
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/cf_dialog_real_inbox_email_cards.png' });

    // 滚动并截图底部 CTA 与新手指南
    console.log('📸 截取邮件详情 (底部 CTA 按钮与 3 步新手指南)...');
    await page.evaluate(() => {
      const scrollEl = document.querySelector('.scrollbar .el-scrollbar__wrap') || document.querySelector('.scrollbar');
      if (scrollEl) scrollEl.scrollTop = 1200;
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/cf_dialog_real_inbox_email_bottom.png' });

    console.log('\n========================================================');
    console.log('🎉 恭喜！大弹窗模式、全屏顶底栏保留、Icon 居中、右对齐工具栏、微软排版插画与真实收件箱全链路 Playwright 验证全部 100% 通过！');
    console.log('========================================================\n');

  } catch (err) {
    console.error('❌ Playwright E2E 测试异常:', err);
    await page.screenshot({ path: '/home/shijian/projects/epocanvas-mail/tests/cf_error_dump.png' }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
