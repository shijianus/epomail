import { chromium } from 'playwright';
import assert from 'assert';

const BASE = process.env.TARGET_URL || 'https://mail.epocanvas.com';
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

async function run() {
  console.log('================================================================');
  console.log('=== 公网生产全真端到端核验：Gmail级多账户前缀隔离与Hash防越权路由 ===');
  console.log('================================================================');
  console.log(`[目标公网环境] 基地址: ${BASE}`);

  let browser;

  try {
    // 1. 登录测试账号
    console.log('\n[步骤 1] 登录测试账号获取公网 Token...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PWD })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, `登录必须成功: ${JSON.stringify(loginJson)}`);
    const token = loginJson.data?.token;
    ok(!!token, '公网线上 JWT Token 获取就绪');

    // 启动浏览器
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });
    const page = await context.newPage();

    // 注入 Token 并打开
    await page.goto(`${BASE}/mail/u/0/#inbox`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('loginEmail', email);
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh', viewMode: 'right' }));
      localStorage.setItem('locale', 'zh');
    }, { t: token, email: USER_EMAIL });

    // ==========================================
    // 验证点 1: 访问根路径 / 或 /inbox 自动规范化到 /mail/u/0/#inbox
    // ==========================================
    console.log('\n[步骤 2] 验证账户前缀与纯列表 URL 规范化...');
    await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const canonicalUrl = page.url();
    ok(canonicalUrl.includes('/mail/u/0/'), `URL 包含 Gmail 规范账户隔离前缀 /mail/u/0/ (当前: ${canonicalUrl})`);
    ok(canonicalUrl.endsWith('#inbox'), `URL 规范化为 #inbox 纯列表 (当前: ${canonicalUrl})`);

    const inboxNav = page.locator('.aside .nav-item:has-text("主要邮件"), .nav-item:has-text("主要邮件")').first();
    ok(await inboxNav.isVisible(), '侧边栏「主要邮件」可见');
    ok(await inboxNav.evaluate(el => el.classList.contains('active')), '侧边栏「主要邮件」处于 active 高亮状态');

    const readingPaneInitial = page.locator('.reading-pane-column');
    ok((await readingPaneInitial.count()) === 0, '初始状态下阅读视窗关闭，展示纯邮件列表');

    // ==========================================
    // 验证点 2: 点击邮件进入详情，URL 更新为 /mail/u/0/#inbox/<mailHash>
    // ==========================================
    console.log('\n[步骤 3] 点击邮件行，核验 Opaque Hash 路由（非自增数字编号）与防越权特征...');
    const firstRow = page.locator('.email-row').first();
    await firstRow.waitFor({ state: 'visible', timeout: 10000 });
    await firstRow.click();
    await page.waitForTimeout(1500);

    const openedUrl = page.url();
    console.log(`  打开邮件后完整 URL: ${openedUrl}`);

    const hashMatch = openedUrl.match(/\/mail\/u\/0\/#inbox\/([A-Za-z0-9_-]+)/);
    ok(!!hashMatch, `URL 符合 /mail/u/0/#inbox/<mailHash> 结构 (当前: ${openedUrl})`);

    const mailHash = hashMatch ? hashMatch[1] : '';
    ok(mailHash.length >= 15, `邮件 Hash 具有足够随机熵 (长度: ${mailHash.length}, Hash: ${mailHash})`);
    ok(!/^\d+$/.test(mailHash), `邮件 ID 彻底告别可枚举纯数字自增编号 (确认使用 Hash: ${mailHash})`);

    ok(await inboxNav.evaluate(el => el.classList.contains('active')), '打开邮件后侧边栏「主要邮件」持续保持高亮 active');
    ok(await firstRow.evaluate(el => el.classList.contains('is-selected')), '列表对应邮件行呈现 .is-selected 选中高亮反馈');
    ok(await page.locator('.reading-pane-column').isVisible(), '阅读视窗正常渲染邮件内容');

    // ==========================================
    // 验证点 3: 点击侧边栏「主要邮件」一键返回最初纯列表状态
    // ==========================================
    console.log('\n[步骤 4] 点击侧边栏「主要邮件」，验证返回最初纯列表状态...');
    await inboxNav.click();
    await page.waitForTimeout(1200);

    const returnedUrl = page.url();
    ok(returnedUrl.endsWith('#inbox'), `点击「主要邮件」后 URL 恢复最初状态 /mail/u/0/#inbox (当前: ${returnedUrl})`);
    ok((await page.locator('.reading-pane-column').count()) === 0, '阅读视窗已完全关闭，成功返回纯邮件列表');
    ok(await inboxNav.evaluate(el => el.classList.contains('active')), '返回后「主要邮件」继续稳定保持 active 状态');

    // ==========================================
    // 验证点 4: 浏览器前进 / 后退流转
    // ==========================================
    console.log('\n[步骤 5] 验证浏览器前进与后退按钮流转...');
    await firstRow.click();
    await page.waitForTimeout(1200);
    ok(page.url().includes(`#inbox/${mailHash}`), `重新进入邮件详情: URL=${page.url()}`);

    // 后退 -> 回到 #inbox 纯列表并关闭阅读视窗
    await page.goBack();
    await page.waitForTimeout(1200);
    ok(page.url().endsWith('#inbox'), `浏览器后退后 URL 恢复 /mail/u/0/#inbox (当前: ${page.url()})`);
    ok((await page.locator('.reading-pane-column').count()) === 0, '浏览器后退后邮件视窗自动关闭');

    // 前进 -> 回到 #inbox/<mailHash> 并重新打开邮件视窗
    await page.goForward();
    await page.waitForTimeout(1200);
    ok(page.url().includes(`#inbox/${mailHash}`), `浏览器前进后 URL 恢复 /mail/u/0/#inbox/${mailHash} (当前: ${page.url()})`);
    ok(await page.locator('.reading-pane-column').isVisible(), '浏览器前进后邮件视窗重新展开');

    // ==========================================
    // 验证点 5: 深链直达与硬刷新 (/mail/u/0/#inbox/<mailHash>)
    // ==========================================
    console.log('\n[步骤 6] 验证深链直达与硬刷新 (/mail/u/0/#inbox/<mailHash>)...');
    const directUrl = `${BASE}/mail/u/0/#inbox/${mailHash}`;
    await page.goto(directUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    ok(page.url() === directUrl, `硬刷新深链保持为 ${directUrl}`);
    ok(await page.locator('.reading-pane-column').isVisible(), '深链直接在阅读视窗渲染邮件正文');
    ok(await inboxNav.evaluate(el => el.classList.contains('active')), '深链硬刷新后「主要邮件」侧边高亮正常');

    // 从深链点击「主要邮件」返回纯列表
    await inboxNav.click();
    await page.waitForTimeout(1000);
    ok(page.url().endsWith('#inbox'), '深链模式下点击「主要邮件」平滑返回纯列表 #inbox');
    ok((await page.locator('.reading-pane-column').count()) === 0, '阅读视窗已关闭');

    // ==========================================
    // 验证点 6: 后端防越权 (BOLA/IDOR) 校验核验
    // ==========================================
    console.log('\n[步骤 7] 核验后端防越权与非法 Hash 防御机制...');
    // A. 真实合法 Hash 获取成功
    const validHashRes = await fetch(`${BASE}/api/email/get?hash=${mailHash}`, {
      headers: { 'Authorization': token }
    });
    const validJson = await validHashRes.json();
    ok(validJson.code === 200 && !!validJson.data?.emailId, '合法 Hash 成功获取邮件正文');

    // B. 伪造/篡改 Hash 严格拦截
    const tamperedHash = mailHash.slice(0, -2) + 'XX';
    const fakeHashRes = await fetch(`${BASE}/api/email/get?hash=${tamperedHash}`, {
      headers: { 'Authorization': token }
    });
    const fakeJson = await fakeHashRes.json();
    ok(fakeJson.code !== 200, `篡改伪造 Hash 被系统严格拦截拒绝: code=${fakeJson.code}, message="${fakeJson.message}"`);

    // ==========================================
    // 验证点 7: 切换至其他分类 (已发送) 与账户隔离一致性
    // ==========================================
    console.log('\n[步骤 8] 验证其他侧边栏分类 (已发送) 纯列表与 Hash 流转...');
    const sentNav = page.locator('.aside .nav-item:has-text("已发送"), .nav-item:has-text("已发送")').first();
    if (await sentNav.isVisible()) {
      await sentNav.click();
      await page.waitForTimeout(1200);
      ok(page.url().endsWith('#sent'), `点击「已发送」后 URL 为 /mail/u/0/#sent (当前: ${page.url()})`);
      ok(await sentNav.evaluate(el => el.classList.contains('active')), '侧边栏「已发送」获得 active 高亮');
      ok((await page.locator('.reading-pane-column').count()) === 0, '已发送呈现纯邮件列表');

      // 从已发送返回主要邮件
      await inboxNav.click();
      await page.waitForTimeout(1200);
      ok(page.url().endsWith('#inbox'), '从其他文件夹返回「主要邮件」恢复 /mail/u/0/#inbox');
      ok(await inboxNav.evaluate(el => el.classList.contains('active')), '「主要邮件」重新获得 active');
    }

    // 截屏归档
    await page.screenshot({ path: 'tests/verify_gmail_hash_routing_prod.png', fullPage: false });
    console.log('  ✓ 线上公网真实截屏已保存至 tests/verify_gmail_hash_routing_prod.png');

  } catch (err) {
    console.error('公网测试异常中断:', err);
    fail++;
    failures.push('未捕获异常: ' + err.message);
  } finally {
    if (browser) {
      await browser.close();
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

run();
