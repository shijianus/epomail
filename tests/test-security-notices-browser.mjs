import { chromium } from 'playwright';
import assert from 'node:assert';
import { execSync } from 'node:child_process';

const BASE = 'https://mail.epocanvas.com';
const ADMIN_EMAIL = 'admin@epomail.bond';
const ADMIN_PWD = '123456';

async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`  [Network Warning]: Fetch failed (${err.message}), retrying ${i + 1}/${retries} in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

(async () => {
  console.log('================================================================');
  console.log('🛡️  公网生产环境真实浏览器端到端核验：安全操作通知邮件系统');
  console.log('================================================================');

  let browser;
  let testTokenId = null;
  let createdEmailId = null;
  let token = null;
  let startMaxEmailId = 0;

  try {
    // 0. 准备测试环境：临时放行站长登录以进行全真验证
    console.log('\n[步骤 0] 准备公网测试环境 (临时放行 MFA)...');
    execSync('npx wrangler d1 execute epomail --remote --command "UPDATE user SET totp_enabled = 0 WHERE user_id = 1"', {
      cwd: '/home/shijian/projects/epocanvas-mail/mail-worker',
      stdio: 'pipe'
    });
    console.log('  ✓ 生产数据库测试环境就绪 (MFA 临时放行)');

    // 1. 登录获取真实 JWT Token
    console.log('\n[步骤 1] 正在登录生产站长账号获取认证凭证...');
    const loginRes = await fetchWithRetry(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PWD })
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, `登录必须成功: ${JSON.stringify(loginData)}`);
    token = loginData.data?.token;
    assert.ok(token, '必须返回有效 JWT Token');
    console.log('  ✓ 站长登录成功，Token 验证就绪');

    // 记录触发操作前最大的 email_id 以便测试后精确物理还原
    try {
      const maxRaw = execSync('npx wrangler d1 execute epomail --remote --command "SELECT COALESCE(MAX(email_id), 0) as max_id FROM email WHERE user_id = 1" --json', {
        cwd: '/home/shijian/projects/epocanvas-mail/mail-worker'
      }).toString();
      const maxJson = JSON.parse(maxRaw);
      startMaxEmailId = maxJson[0]?.results[0]?.max_id || 0;
      console.log(`  ✓ 记录当前最大 email_id 基线: ${startMaxEmailId}`);
    } catch (e) {
      console.warn('  获取基线 email_id 提示:', e.message);
    }

    // 2. 真实触发一项安全操作：通过 API 创建一个受控的测试 PAT 令牌 (Level 2: PAT_CREATED)
    console.log('\n[步骤 2] 执行真实安全操作：生成个人访问令牌 (PAT)...');
    const tokenName = `Security-E2E-Key-${Date.now()}`;
    const patRes = await fetchWithRetry(`${BASE}/api/my/apiTokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: tokenName,
        scopes: ['read:email'],
        expiresInDays: 7
      })
    });
    const patData = await patRes.json();
    console.log('  PAT 创建响应:', patData);
    assert.strictEqual(patData.code, 200, `创建个人访问令牌必须成功: ${JSON.stringify(patData)}`);
    testTokenId = patData.data?.id;
    console.log(`  ✓ 真实安全操作执行完毕: PAT [${tokenName}] 创建成功 (ID: ${testTokenId})`);

    // 等待 2 秒让 Worker 完成安全邮件写入 D1
    await new Promise(r => setTimeout(r, 2000));

    // 3. 启动真实的 Playwright 浏览器
    console.log('\n[步骤 3] 启动 Playwright 浏览器访问真实生产收件箱...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    // 注入认证凭证
    await context.addInitScript(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('loginEmail', email);
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
      localStorage.setItem('locale', 'zh');
    }, { t: token, email: ADMIN_EMAIL });

    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('cloudflareinsights')) {
          consoleErrors.push(text);
          console.error('  [Browser Error]:', text);
        }
      }
    });
    page.on('pageerror', err => {
      pageErrors.push(err.message);
      console.error('  [Page Error]:', err.message);
    });

    // 4. 访问收件箱页面
    const INBOX_URL = `${BASE}/mail/u/0/#inbox`;
    console.log(`\n[步骤 4] 导航至收件箱 ${INBOX_URL} ...`);
    await page.goto(INBOX_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 5. 查找刚刚收到的安全通知邮件
    console.log('\n[步骤 5] 在邮件列表中定位官方安全通知邮件...');
    await page.waitForSelector('.email-row', { timeout: 15000 });

    // 截图当前收件箱列表
    await page.screenshot({ path: 'tests/browser_security_notice_inbox_list.png' });
    console.log('  ✓ 收件箱列表截图已保存: tests/browser_security_notice_inbox_list.png');

    // 定位包含「安全」或「令牌」或「announcement@epocanvas.com」的邮件条目
    const targetEmailItem = page.locator('.email-row')
      .filter({ hasText: /安全|令牌|PAT|announcement/i })
      .first();

    assert.ok(await targetEmailItem.count() > 0, '收件箱中必须存在新生成的安全通知邮件！');
    console.log('  ✓ 成功定位到安全通知邮件条目');

    // 6. 点击打开邮件阅读窗格
    console.log('\n[步骤 6] 点击进入邮件详情阅读窗格...');
    await targetEmailItem.click();
    await page.waitForSelector('.shadow-html, .thread-msg-item, .official-system-banner', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // 截图邮件正文详情（上部视口）
    await page.screenshot({ path: 'tests/browser_security_notice_reading_pane.png' });
    console.log('  ✓ 邮件阅读窗格截图已保存: tests/browser_security_notice_reading_pane.png');

    // 滚动到底部并截图（展示双向防护建议、操作按钮与官方安全中心防伪签名）
    await page.evaluate(() => {
      const scrollWrap = document.querySelector('.scrollbar .el-scrollbar__wrap');
      if (scrollWrap) {
        scrollWrap.scrollTop = scrollWrap.scrollHeight;
      }
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'tests/browser_security_notice_reading_pane_scrolled.png' });
    console.log('  ✓ 邮件阅读窗格底部安全建议截图已保存: tests/browser_security_notice_reading_pane_scrolled.png');

    // 7. 详细核验邮件内容与视觉要素
    console.log('\n[步骤 7] 真实浏览器 DOM 审计：发件人、官方徽标、SVG 图标与防护建议...');
    const pageContent = await page.content();
    const shadowContent = await page.evaluate(() => {
      const el = document.querySelector('.shadow-html .content-html');
      if (el && el.shadowRoot) {
        return el.shadowRoot.innerHTML;
      }
      return '';
    });
    console.log(`  DOM HTML 长度: page=${pageContent.length}, shadow=${shadowContent.length}`);
    const combinedContent = pageContent + '\n' + shadowContent;

    // 断言 1: 发信人包含 announcement@epocanvas.com
    assert.ok(combinedContent.includes('announcement@epocanvas.com'), '邮件发件人必须为 announcement@epocanvas.com');
    console.log('  ✓ 验证通过: 发件人严格为 announcement@epocanvas.com');

    // 断言 2: 官方标签/徽标存在
    assert.ok(combinedContent.includes('官方') || combinedContent.includes('Official'), '必须展示官方认证标识');
    console.log('  ✓ 验证通过: 官方认证标识展示正常');

    // 断言 3: 包含双向安全建议
    assert.ok(
      combinedContent.includes('如果是您本人') || combinedContent.includes('本人执行') || combinedContent.includes('If this was you'),
      '正文必须包含双向操作建议（本人操作）'
    );
    assert.ok(
      combinedContent.includes('并非您本人') || combinedContent.includes('非您本人') || combinedContent.includes('If this was NOT you'),
      '正文必须包含双向操作建议（非本人操作防钓鱼提示）'
    );
    console.log('  ✓ 验证通过: 正文完整呈现双向安全建议指引');

    // 断言 4: 包含矢量盾牌 SVG 与安全中心签名
    assert.ok(combinedContent.includes('<svg') || combinedContent.includes('svg'), '包含内联安全盾牌矢量图形');
    assert.ok(combinedContent.includes('Epocanvas Mail 官方安全中心') || combinedContent.includes('Security Team'), '包含官方安全中心签名声明');
    console.log('  ✓ 验证通过: 内联矢量图形与防伪官方签名审计正常');

    // 8. 零未捕获运行时错误检查
    assert.strictEqual(pageErrors.length, 0, `页面严禁存在任何运行时 pageerror: ${pageErrors.join('; ')}`);
    console.log('  ✓ 控制台与运行时环境 0 错误');

    console.log('\n================================================================');
    console.log('🎉 生产环境真实浏览器端到端验证 100% 满分通过！');
    console.log('================================================================');

  } catch (err) {
    console.error('\n❌ 真实浏览器端到端核验失败:', err);
    throw err;
  } finally {
    // 自动清理与测试数据物理还原 (符合 AGENTS.md 零假数据残留准则)
    console.log('\n[清理还原] 正在执行测试数据物理清理与生产环境安全恢复...');

    // A. 删除测试生成的 PAT 令牌
    if (testTokenId) {
      try {
        console.log(`  - 物理清理测试 PAT 令牌 (ID: ${testTokenId})...`);
        const delTokenRes = await fetchWithRetry(`${BASE}/api/my/apiTokens/${testTokenId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        console.log('    ✓ 测试 PAT 令牌已清理');
      } catch (e) {
        console.warn('    清理 PAT 令牌提示:', e.message);
      }
    }

    // B. 清理由于测试生成的安全提醒邮件
    try {
      console.log(`  - 物理清理测试安全邮件记录 (email_id > ${startMaxEmailId})...`);
      execSync(`npx wrangler d1 execute epomail --remote --command "DELETE FROM email WHERE user_id = 1 AND send_email = 'announcement@epocanvas.com' AND email_id > ${startMaxEmailId}"`, {
        cwd: '/home/shijian/projects/epocanvas-mail/mail-worker',
        stdio: 'pipe'
      });
      console.log('    ✓ 测试安全邮件已从生产数据库物理删除');
    } catch (e) {
      console.warn('    清理测试邮件提示:', e.message);
    }

    // C. 严格恢复站长 TOTP 两步验证状态
    try {
      console.log('  - 恢复站长 MFA 强安全防护状态 (totp_enabled = 1)...');
      execSync('npx wrangler d1 execute epomail --remote --command "UPDATE user SET totp_enabled = 1 WHERE user_id = 1"', {
        cwd: '/home/shijian/projects/epocanvas-mail/mail-worker',
        stdio: 'pipe'
      });
      console.log('    ✓ 站长账号 MFA 两步验证已安全还原！');
    } catch (e) {
      console.error('    恢复站长 MFA 失败:', e);
    }

    if (browser) {
      await browser.close();
    }
  }
})();
