import { chromium } from 'playwright';
import assert from 'assert';

const BASE = 'http://127.0.0.1:8787';
let pass = 0, fail = 0;
const failures = [];

function ok(cond, label) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    failures.push(label);
    console.log('  ✗ ' + label);
  }
}

async function runTest() {
  console.log('================================================================');
  console.log('=== 全真栈端到端核验：侧边栏定位、URL更新与无选中邮件纯列表返回 ===');
  console.log('================================================================');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });
  const page = await context.newPage();

  try {
    // 1. 登录
    console.log('\n[步骤 1] 登录测试账号获取 Token...');
    const loginRes = await page.request.post(`${BASE}/api/login`, {
      data: { email: 'admin@epomail.bond', password: '123456' },
      headers: { 'Content-Type': 'application/json' }
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, `登录必须成功: ${JSON.stringify(loginJson)}`);
    const token = loginJson.data?.token;
    ok(!!token, 'JWT Token 获取就绪');

    // 注入 Token 并打开收件箱
    await page.goto(`${BASE}/inbox`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('token', t);
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
      localStorage.setItem('locale', 'zh');
    }, token);

    await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // ==========================================
    // 验证点 1: /inbox 初始状态，无选中邮件纯列表
    // ==========================================
    console.log('\n[步骤 2] 验证 /inbox 初始状态...');
    const initialUrl = page.url();
    ok(initialUrl.endsWith('/inbox'), `初始 URL 严格为 /inbox (当前: ${initialUrl})`);

    const inboxNav = page.locator('.nav-item:has-text("主要邮件"), .nav-item[title*="收件"], .nav-item[title*="主要"]').first();
    ok(await inboxNav.isVisible(), '侧边栏「主要邮件」项可见');
    const isInboxActive = await inboxNav.evaluate(el => el.classList.contains('active'));
    ok(isInboxActive, '侧边栏「主要邮件」处于高亮激活状态 (active)');

    const readingPaneInitial = page.locator('.reading-pane-column');
    const hasReadingPaneInitial = await readingPaneInitial.count();
    ok(hasReadingPaneInitial === 0, '初始状态下阅读视窗关闭，展示纯邮件列表');

    // 检查是否有邮件行
    const firstRow = page.locator('.email-row').first();
    await firstRow.waitFor({ state: 'visible', timeout: 8000 });
    ok(await firstRow.isVisible(), '邮件列表行渲染成功');

    // ==========================================
    // 验证点 2: 点击邮件进入后，URL 更新为 /inbox/:mailId
    // ==========================================
    console.log('\n[步骤 3] 点击邮件行，验证 URL 同步更新与侧边栏定位保持...');
    await firstRow.click();
    await page.waitForTimeout(1000);

    const openedUrl = page.url();
    ok(/\/inbox\/\d+/.test(openedUrl), `进入邮件后 URL 正确更新为 /inbox/:mailId (当前: ${openedUrl})`);

    const mailIdMatch = openedUrl.match(/\/inbox\/(\d+)/);
    const openedMailId = mailIdMatch ? mailIdMatch[1] : null;
    ok(!!openedMailId, `提取到已打开邮件 ID: ${openedMailId}`);

    // 验证侧边栏定位依然处于「主要邮件」
    const isInboxStillActive = await inboxNav.evaluate(el => el.classList.contains('active'));
    ok(isInboxStillActive, '进入邮件详情后，侧边栏「主要邮件」仍保持精准定位高亮 (active)');

    // 验证邮件行处于选中态 (.is-selected)
    const isRowSelected = await firstRow.evaluate(el => el.classList.contains('is-selected'));
    ok(isRowSelected, '邮件列表中对应行获得 .is-selected 选中高亮反馈');

    // 验证阅读窗已挂载
    const readingPaneOpened = page.locator('.reading-pane-column');
    ok(await readingPaneOpened.isVisible(), '阅读视窗已正常展示信件内容');

    // ==========================================
    // 验证点 3: 点击侧边栏「主要邮件」，必须返回无选中的纯邮件列表 (/inbox)
    // ==========================================
    console.log('\n[步骤 4] 点击侧边栏「主要邮件」，验证返回最初纯列表状态...');
    await inboxNav.click();
    await page.waitForTimeout(1000);

    const backUrl = page.url();
    ok(backUrl.endsWith('/inbox'), `点击「主要邮件」后 URL 恢复最初纯列表 /inbox (当前: ${backUrl})`);

    const readingPaneClosed = page.locator('.reading-pane-column');
    ok((await readingPaneClosed.count()) === 0, '阅读视窗已完全关闭，成功返回纯邮件列表');

    const isInboxActiveAfterReturn = await inboxNav.evaluate(el => el.classList.contains('active'));
    ok(isInboxActiveAfterReturn, '返回后「主要邮件」继续保持 active 状态');

    // ==========================================
    // 验证点 4: 信件内部「返回」按钮核验
    // ==========================================
    console.log('\n[步骤 5] 再次点击邮件，通过详情页返回按钮退出...');
    await firstRow.click();
    await page.waitForTimeout(1000);
    ok(/\/inbox\/\d+/.test(page.url()), '成功再次进入邮件详情');

    const backBtn = page.locator('.btn-back, span[role="button"]:has(.btn-back)').first();
    if (await backBtn.isVisible()) {
      await backBtn.click();
      await page.waitForTimeout(1000);
      ok(page.url().endsWith('/inbox'), `信件内点击返回按钮后 URL 恢复 /inbox (当前: ${page.url()})`);
      ok((await page.locator('.reading-pane-column').count()) === 0, '信件内返回后阅读窗关闭');
    }

    // ==========================================
    // 验证点 5: 浏览器后退/前进 (Browser History PopState)
    // ==========================================
    console.log('\n[步骤 6] 验证浏览器前进与后退按钮历史流转...');
    await firstRow.click();
    await page.waitForTimeout(1000);
    ok(/\/inbox\/\d+/.test(page.url()), '进入邮件详情: URL=' + page.url());

    // 浏览器后退
    await page.goBack();
    await page.waitForTimeout(1000);
    ok(page.url().endsWith('/inbox'), `浏览器后退后 URL 自动返回 /inbox (当前: ${page.url()})`);
    ok((await page.locator('.reading-pane-column').count()) === 0, '浏览器后退后邮件视窗自动关闭');

    // 浏览器前进
    await page.goForward();
    await page.waitForTimeout(1000);
    ok(/\/inbox\/\d+/.test(page.url()), `浏览器前进后 URL 重新回到 /inbox/:mailId (当前: ${page.url()})`);
    ok(await page.locator('.reading-pane-column').isVisible(), '浏览器前进后邮件视窗重新展开');

    // 再次返回列表
    await inboxNav.click();
    await page.waitForTimeout(800);

    // ==========================================
    // 验证点 6: 直接 URL 深链访问与页面刷新 (/inbox/:mailId)
    // ==========================================
    console.log('\n[步骤 7] 验证深链直达与硬刷新 (/inbox/:mailId)...');
    if (openedMailId) {
      await page.goto(`${BASE}/inbox/${openedMailId}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      ok(page.url().includes(`/inbox/${openedMailId}`), `直接访问深链 URL 保持为 /inbox/${openedMailId}`);
      ok(await page.locator('.reading-pane-column').isVisible(), '深链加载后直接在阅读窗渲染邮件正文');
      ok(await inboxNav.evaluate(el => el.classList.contains('active')), '深链访问时「主要邮件」侧边栏高亮定位正常');

      // 点击主要邮件返回纯列表
      await inboxNav.click();
      await page.waitForTimeout(1000);
      ok(page.url().endsWith('/inbox'), `深链状态下点击「主要邮件」同样能平滑返回纯列表 /inbox`);
      ok((await page.locator('.reading-pane-column').count()) === 0, '阅读视窗已关闭');
    }

    // ==========================================
    // 验证点 6.5: 整页 (no_split) 与 侧边 (right) 及 移动端 模式下的 URL 更新
    // ==========================================
    console.log('\n[步骤 7.5] 验证不同视窗模式 (整页 no_split / 侧边 right / 移动端) 下的 URL 更新与纯列表返回...');
    
    // A. 整页模式 (no_split)
    await page.evaluate(() => {
      import('@/store/ui.js').then(({ useUiStore }) => {
        useUiStore().readingPane = 'no_split';
      });
    });
    await page.waitForTimeout(500);

    await firstRow.click();
    await page.waitForTimeout(1000);
    ok(/\/inbox\/\d+/.test(page.url()), `[整页模式] 进入邮件后 URL 正确更新为 /inbox/:mailId (当前: ${page.url()})`);
    const listColHidden = await page.locator('.list-column').evaluate(el => el.classList.contains('hide-on-no-split'));
    ok(listColHidden, `[整页模式] 信件详情展开时，列表列已根据 hide-on-no-split 隐藏`);
    
    // 整页模式下点击主要邮件
    await inboxNav.click();
    await page.waitForTimeout(1000);
    ok(page.url().endsWith('/inbox'), `[整页模式] 点击「主要邮件」成功返回 /inbox 纯列表`);
    ok((await page.locator('.reading-pane-column').count()) === 0, `[整页模式] 阅读窗关闭`);

    // B. 侧边栏分栏模式 (right)
    await page.evaluate(() => {
      import('@/store/ui.js').then(({ useUiStore }) => {
        useUiStore().readingPane = 'right';
      });
    });
    await page.waitForTimeout(500);

    await firstRow.click();
    await page.waitForTimeout(1000);
    ok(/\/inbox\/\d+/.test(page.url()), `[侧边模式] 进入邮件后 URL 正确更新为 /inbox/:mailId (当前: ${page.url()})`);
    ok(await page.locator('.reading-pane-column').isVisible(), `[侧边模式] 右侧视窗展开`);
    
    // 侧边模式下点击主要邮件
    await inboxNav.click();
    await page.waitForTimeout(1000);
    ok(page.url().endsWith('/inbox'), `[侧边模式] 点击「主要邮件」成功返回 /inbox 纯列表`);
    ok((await page.locator('.reading-pane-column').count()) === 0, `[侧边模式] 阅读窗关闭`);

    // C. 移动端视口 (375x812)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(800);
    await firstRow.click();
    await page.waitForTimeout(1000);
    ok(/\/inbox\/\d+/.test(page.url()), `[移动端视口] 点击邮件后 URL 正确更新为 /inbox/:mailId (当前: ${page.url()})`);
    
    // 恢复桌面视口
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);
    await inboxNav.click();
    await page.waitForTimeout(1000);


    // ==========================================
    // 验证点 7: 其他文件夹导航一致性（已发送、加星、垃圾等）
    // ==========================================
    console.log('\n[步骤 8] 验证其他侧边栏文件夹 (Sent / Trash) 的纯列表切换...');
    const sentNav = page.locator('.nav-item:has-text("已发送"), .nav-item[title*="已发送"], .nav-item[title*="Sent"]').first();
    if (await sentNav.isVisible()) {
      await sentNav.click();
      await page.waitForTimeout(1000);
      ok(page.url().endsWith('/sent'), `点击「已发送」后 URL 切换至 /sent (当前: ${page.url()})`);
      ok(await sentNav.evaluate(el => el.classList.contains('active')), '侧边栏「已发送」变为 active');
      ok((await page.locator('.reading-pane-column').count()) === 0, '已发送文件夹中呈现纯列表');
    }

    // 重新切回主要邮件
    await inboxNav.click();
    await page.waitForTimeout(1000);
    ok(page.url().endsWith('/inbox'), '从其他文件夹返回「主要邮件」成功');
    ok(await inboxNav.evaluate(el => el.classList.contains('active')), '「主要邮件」重新获得 active');

    // 截屏归档
    await page.screenshot({ path: 'tests/verify_sidebar_and_url_state.png', fullPage: false });

  } catch (err) {
    console.error('测试异常中断:', err);
    fail++;
    failures.push('未捕获异常: ' + err.message);
  } finally {
    await browser.close();
  }

  console.log('\n==========================================');
  console.log(`=== 核验结果: ${pass} 通过 / ${fail} 失败 ===`);
  if (failures.length > 0) {
    console.log('失败清单:');
    failures.forEach(f => console.log(' - ' + f));
  }
  console.log('==========================================');

  if (fail > 0) {
    process.exit(1);
  }
}

runTest();
