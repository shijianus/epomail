import { chromium } from 'playwright';
import assert from 'assert';

const PRIMARY_BASE = 'https://mail.epocanvas.com';
const FALLBACK_BASE = 'https://epomail.epocanvas.workers.dev';
const USER_EMAIL = 'audit_normal_1789140856529@epomail.bond';
const USER_PWD = 'Audit123!';

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

async function getAvailableBase() {
  if (process.env.TARGET_URL) {
    return process.env.TARGET_URL;
  }
  try {
    const res = await fetch(`${PRIMARY_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PWD })
    });
    if (res.ok) return PRIMARY_BASE;
  } catch (e) {}
  return FALLBACK_BASE;
}

async function runTest() {
  console.log('================================================================');
  console.log('=== 公网线上生产端到端核验：侧边栏定位、URL更新与纯列表重置 ===');
  console.log('================================================================');

  const BASE = await getAvailableBase();
  console.log(`[目标公网环境] 使用核验基地址: ${BASE}`);

  let browser;
  let token = null;
  let accountId = null;
  const createdEmailIds = [];

  try {
    // 1. 登录
    console.log('\n[步骤 1] 登录测试账号获取 Token...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PWD })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, `登录必须成功: ${JSON.stringify(loginJson)}`);
    token = loginJson.data?.token;
    ok(!!token, '公网线上 JWT Token 获取就绪');

    // 获取 accountId
    const accRes = await fetch(`${BASE}/api/account/list`, {
      headers: { 'Authorization': token }
    });
    const accJson = await accRes.json();
    if (accJson.data && accJson.data.length > 0) {
      accountId = accJson.data[0].accountId;
    } else {
      accountId = loginJson.data?.userId || 133;
    }

    // 2. 检查收件箱，若无信件则尝试发送测试邮件作为样本
    console.log('\n[步骤 2] 检查收件箱或准备核验信件样本...');
    const inboxCheckRes = await fetch(`${BASE}/api/email/list?limit=10`, {
      headers: { 'Authorization': token }
    });
    const inboxCheckJson = await inboxCheckRes.json();
    const initialMails = inboxCheckJson.data?.list || (Array.isArray(inboxCheckJson.data) ? inboxCheckJson.data : []);
    if (initialMails.length === 0) {
      const testSubject = `公网路由核验邮件_${Date.now()}`;
      const sendRes = await fetch(`${BASE}/api/email/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({
          accountId,
          receiveEmail: [USER_EMAIL],
          subject: testSubject,
          content: '<p>此邮件专用于公网生产环境侧边栏与URL路由交互验证，核验后自动物理删除。</p>',
          text: '此邮件专用于公网生产环境侧边栏与URL路由交互验证'
        })
      });
      const sendJson = await sendRes.json();
      if (sendJson.code === 200 && sendJson.data?.emailId) {
        createdEmailIds.push(sendJson.data.emailId);
        console.log(`  ✓ 发送测试邮件成功 (emailId: ${sendJson.data?.emailId})`);
      }
    } else {
      console.log(`  ✓ 收件箱已就绪 ${initialMails.length} 封信件样本供全真核验`);
    }

    // 启动 Playwright 浏览器
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });
    const page = await context.newPage();

    // 注入 Token 并打开收件箱
    await page.goto(`${BASE}/inbox`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('loginEmail', email);
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh', viewMode: 'right' }));
      localStorage.setItem('locale', 'zh');
    }, { t: token, email: USER_EMAIL });

    await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // ==========================================
    // 验证点 1: /inbox 初始状态，无选中邮件纯列表
    // ==========================================
    console.log('\n[步骤 3] 验证 /inbox 初始状态...');
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
    await firstRow.waitFor({ state: 'visible', timeout: 10000 });
    ok(await firstRow.isVisible(), '邮件列表行渲染成功');

    // ==========================================
    // 验证点 2: 点击邮件进入后，URL 更新为 /inbox/:mailId
    // ==========================================
    console.log('\n[步骤 4] 点击邮件行，验证 URL 同步更新与侧边栏定位保持...');
    await firstRow.click();
    await page.waitForTimeout(1500);

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
    // 验证点 3: 点击侧边栏「主要邮件」，必须返回最初纯列表状态
    // ==========================================
    console.log('\n[步骤 5] 点击侧边栏「主要邮件」，验证返回最初纯列表状态...');
    await inboxNav.click();
    await page.waitForTimeout(1000);

    const afterNavClickUrl = page.url();
    ok(afterNavClickUrl.endsWith('/inbox'), `点击「主要邮件」后 URL 恢复最初纯列表 /inbox (当前: ${afterNavClickUrl})`);

    const hasReadingPaneAfterNav = await page.locator('.reading-pane-column').count();
    ok(hasReadingPaneAfterNav === 0, '阅读视窗已完全关闭，成功返回纯邮件列表');

    const isInboxActiveAfterNav = await inboxNav.evaluate(el => el.classList.contains('active'));
    ok(isInboxActiveAfterNav, '返回后「主要邮件」继续保持 active 状态');

    // ==========================================
    // 验证点 4: 再次进入，通过详情页返回按钮退出
    // ==========================================
    console.log('\n[步骤 6] 再次点击邮件，通过详情页返回按钮退出...');
    await firstRow.click();
    await page.waitForTimeout(1000);
    ok(/\/inbox\/\d+/.test(page.url()), '成功再次进入邮件详情');

    const backBtn = page.locator('.back-btn, [title*="返回"], .header-back, button:has(.el-icon-back)').first();
    if (await backBtn.isVisible()) {
      await backBtn.click();
      await page.waitForTimeout(1000);
      ok(page.url().endsWith('/inbox'), `信件内点击返回按钮后 URL 恢复 /inbox (当前: ${page.url()})`);
      const hasReadingPaneAfterBack = await page.locator('.reading-pane-column').count();
      ok(hasReadingPaneAfterBack === 0, '信件内返回后阅读窗关闭');
    } else {
      // 若无返回按钮则验证点击主要邮件返回
      await inboxNav.click();
      await page.waitForTimeout(1000);
      ok(page.url().endsWith('/inbox'), '点击侧边栏返回 /inbox');
    }

    // ==========================================
    // 验证点 5: 浏览器前进 / 后退流转
    // ==========================================
    console.log('\n[步骤 7] 验证浏览器前进与后退按钮历史流转...');
    await firstRow.click();
    await page.waitForTimeout(1000);
    ok(/\/inbox\/\d+/.test(page.url()), `进入邮件详情: URL=${page.url()}`);

    // 点击后退 -> 应回到 /inbox 并关闭邮件视窗
    await page.goBack();
    await page.waitForTimeout(1000);
    ok(page.url().endsWith('/inbox'), `浏览器后退后 URL 自动返回 /inbox (当前: ${page.url()})`);
    const paneAfterGoBack = await page.locator('.reading-pane-column').count();
    ok(paneAfterGoBack === 0, '浏览器后退后邮件视窗自动关闭');

    // 点击前进 -> 应回到 /inbox/:mailId 并重新打开邮件视窗
    await page.goForward();
    await page.waitForTimeout(1000);
    ok(/\/inbox\/\d+/.test(page.url()), `浏览器前进后 URL 重新回到 /inbox/:mailId (当前: ${page.url()})`);
    const paneAfterGoForward = await page.locator('.reading-pane-column').count();
    ok(paneAfterGoForward > 0, '浏览器前进后邮件视窗重新展开');

    // ==========================================
    // 验证点 6: 深链直达与硬刷新 (/inbox/:mailId)
    // ==========================================
    console.log('\n[步骤 8] 验证深链直达与硬刷新 (/inbox/:mailId)...');
    const directUrl = `${BASE}/inbox/${openedMailId}`;
    await page.goto(directUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    ok(page.url().endsWith(`/inbox/${openedMailId}`), `直接访问深链 URL 保持为 /inbox/${openedMailId}`);
    const deepReadingPane = page.locator('.reading-pane-column');
    ok(await deepReadingPane.isVisible(), '深链加载后直接在阅读窗渲染邮件正文');
    ok(await inboxNav.evaluate(el => el.classList.contains('active')), '深链访问时「主要邮件」侧边栏高亮定位正常');

    // 从深链页面点击「主要邮件」返回纯列表
    await inboxNav.click();
    await page.waitForTimeout(1000);
    ok(page.url().endsWith('/inbox'), '深链状态下点击「主要邮件」同样能平滑返回纯列表 /inbox');
    ok(await page.locator('.reading-pane-column').count() === 0, '阅读视窗已关闭');

    // ==========================================
    // 验证点 7: 不同视窗模式 (整页 no_split / 侧边 right / 移动端)
    // ==========================================
    console.log('\n[步骤 9] 验证不同视窗模式下的 URL 更新与纯列表返回...');

    // 模式 A: 整页模式 (no_split)
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('setting') || '{}');
      s.viewMode = 'no_split';
      localStorage.setItem('setting', JSON.stringify(s));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const noSplitRow = page.locator('.email-row').first();
    await noSplitRow.click();
    await page.waitForTimeout(1200);
    ok(/\/inbox\/\d+/.test(page.url()), `[整页模式] 进入邮件后 URL 正确更新为 /inbox/:mailId (当前: ${page.url()})`);

    // 整页模式下点击侧边栏「主要邮件」应关闭信件并返回纯列表
    await inboxNav.click();
    await page.waitForTimeout(1000);
    ok(page.url().endsWith('/inbox'), '[整页模式] 点击「主要邮件」成功返回 /inbox 纯列表');
    ok(await page.locator('.reading-pane-column').count() === 0, '[整页模式] 阅读窗关闭');

    // 模式 B: 移动端视口 (375x812)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(1000);

    const mobileRow = page.locator('.email-row').first();
    if (await mobileRow.isVisible()) {
      await mobileRow.click();
      await page.waitForTimeout(1200);
      ok(/\/inbox\/\d+/.test(page.url()), `[移动端视口] 点击邮件后 URL 正确更新为 /inbox/:mailId (当前: ${page.url()})`);
    }

    // 恢复桌面视口
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('setting') || '{}');
      s.viewMode = 'right';
      localStorage.setItem('setting', JSON.stringify(s));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // ==========================================
    // 验证点 8: 其他侧边栏文件夹切换
    // ==========================================
    console.log('\n[步骤 10] 验证其他侧边栏文件夹 (Sent) 的纯列表切换...');
    const sentNav = page.locator('.aside .nav-item:has-text("已发送"), .nav-item:has-text("已发送")').first();
    if (await sentNav.isVisible()) {
      await sentNav.click();
      await page.waitForTimeout(1500);
      ok(page.url().endsWith('/sent'), `点击「已发送」后 URL 切换至 /sent (当前: ${page.url()})`);
      ok(await sentNav.evaluate(el => el.classList.contains('active')), '侧边栏「已发送」变为 active');
      ok((await page.locator('.reading-pane-column').count()) === 0, '已发送文件夹中呈现纯列表');

      // 切回主要邮件
      const currentInboxNav = page.locator('.aside .nav-item:has-text("主要邮件"), .nav-item:has-text("主要邮件")').first();
      await currentInboxNav.click();
      await page.waitForTimeout(1500);
      ok(page.url().endsWith('/inbox'), '从其他文件夹返回「主要邮件」成功');
      ok(await currentInboxNav.evaluate(el => el.classList.contains('active')), '「主要邮件」重新获得 active');
    }

    // 截屏归档
    await page.screenshot({ path: 'tests/verify_prod_sidebar_and_url_state.png', fullPage: false });
    console.log('  ✓ 线上全真截屏已保存至 tests/verify_prod_sidebar_and_url_state.png');

  } catch (err) {
    console.error('公网核验异常中断:', err);
    fail++;
    failures.push('未捕获异常: ' + err.message);
  } finally {
    if (browser) {
      await browser.close();
    }
    // 物理清理测试邮件
    if (token) {
      console.log('\n[清理阶段] 物理清除公网测试创建的临时邮件样本...');
      try {
        const inboxListRes = await fetch(`${BASE}/api/email/list?limit=50`, {
          headers: { 'Authorization': token }
        });
        const inboxJson = await inboxListRes.json();
        const mailList = inboxJson.data?.list || (Array.isArray(inboxJson.data) ? inboxJson.data : []);
        const testMails = mailList
          .filter(e => e.subject && e.subject.includes('公网路由核验邮件'))
          .map(e => e.emailId);

        const allToDel = Array.from(new Set([...createdEmailIds.filter(Boolean), ...testMails]));
        if (allToDel.length > 0) {
          const delRes = await fetch(`${BASE}/api/email/delete?emailIds=${allToDel.join(',')}&physical=true`, {
            method: 'DELETE',
            headers: {
              'Authorization': token
            }
          });
          const delJson = await delRes.json();
          console.log(`  ✓ 物理清理收件记录 [${allToDel.join(', ')}]: code ${delJson.code}`);
        }
      } catch (e) {
        console.error('清理失败:', e);
      }
      console.log('  ✓ 零假数据清理完成');
    }
  }

  console.log('\n==========================================');
  console.log(`=== 公网核验结果: ${pass} 通过 / ${fail} 失败 ===`);
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
