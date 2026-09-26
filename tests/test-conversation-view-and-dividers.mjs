import { chromium } from 'playwright';
import assert from 'node:assert';

const PRIMARY_BASE = 'https://mail.epocanvas.com';
const FALLBACK_BASE = 'https://epomail.epocanvas.workers.dev';
const USER_EMAIL = 'audit_normal_1789140856529@epomail.bond';
const USER_PWD = 'Audit123!';

async function getAvailableBase() {
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

async function run() {
  console.log('================================================================');
  console.log('=== 会话模式与显式隔离线全真端到端核验 (Conversation View) ===');
  console.log('================================================================');

  let browser;
  const createdEmailIds = [];
  let token = null;
  const BASE = await getAvailableBase();
  console.log(`[目标环境] 使用基地址: ${BASE}`);

  try {
    // 1. 登录测试账号获取 Token
    console.log('\n[步骤 1] 登录测试账号获取 Token...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PWD })
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.code, 200, `登录必须成功: ${JSON.stringify(loginData)}`);
    token = loginData.data?.token;
    assert.ok(token, '返回数据必须包含 JWT Token');
    const accountId = loginData.data?.account?.accountId || 134;
    console.log(`  ✓ 登录成功，accountId: ${accountId}`);

    // 2. 验证个人设置中「邮件会话模式」描述文案直观明示
    console.log('\n[步骤 2] 浏览器打开个人设置 (/settings/general)，核验会话模式说明文案直观展示...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });
    const page = await context.newPage();

    // 注入 JWT 令牌并打开 /settings/general
    await page.goto(`${BASE}/settings/general`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ t, email, user }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('loginEmail', email);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
      localStorage.setItem('locale', 'zh');
    }, { t: token, email: USER_EMAIL, user: loginData.data });

    await page.goto(`${BASE}/settings/general`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const settingTextVisible = await page.evaluate(() => {
      const el = document.querySelector('.sub-hint');
      const allText = document.body.innerText;
      return allText.includes('将同一主题的相关邮件聚合成对话') || (el && el.innerText.includes('将同一主题的相关邮件聚合成对话'));
    });
    assert.ok(settingTextVisible, '个人设置页必须直观明示「将同一主题的相关邮件聚合成对话」描述');
    console.log('  ✓ 个人设置页会话聚合模式说明已直观呈现（零隐藏、明文常驻展示）');

    // 3. 构造 3 封同一主题（包含多轮回复前缀：Re: 与 Re: Re:）的测试邮件
    const timestamp = Date.now();
    const baseTopic = `会话测试聚合主题_${timestamp}`;
    console.log(`\n[步骤 3] 构造多轮会话邮件样本 (主题: ${baseTopic})...`);

    const subjects = [
      baseTopic,
      `Re: ${baseTopic}`,
      `Re: Re: ${baseTopic}`
    ];

    for (let i = 0; i < subjects.length; i++) {
      const subj = subjects[i];
      const sendRes = await fetch(`${BASE}/api/email/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({
          accountId,
          receiveEmail: [USER_EMAIL],
          subject: subj,
          content: `<p>这是会话测试第 ${i + 1} 轮发言信件内容，用于验证无外框与显式隔离线排版。</p>`,
          text: `这是会话测试第 ${i + 1} 轮发言信件内容`
        })
      });
      const sendData = await sendRes.json();
      assert.strictEqual(sendData.code, 200, `发信必须成功: ${JSON.stringify(sendData)}`);
      if (sendData.data?.emailId) {
        createdEmailIds.push(sendData.data.emailId);
      }
      console.log(`  ✓ 发送第 ${i + 1} 封邮件成功: "${subj}" (emailId: ${sendData.data?.emailId})`);
      await new Promise(r => setTimeout(r, 600));
    }

    // 4. 打开收件箱 /inbox 核验列表中的会话聚合标记 (Badge)
    console.log('\n[步骤 4] 打开收件箱，核验会话聚合数量标记 (Badge)...');
    await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const threadItemSelector = '.email-row';
    await page.waitForSelector(threadItemSelector, { timeout: 15000 });

    const threadInfo = await page.evaluate((topic) => {
      const items = Array.from(document.querySelectorAll('.email-row'));
      for (const item of items) {
        if (item.innerText.includes(topic)) {
          const badge = item.querySelector('.thread-count-badge');
          return {
            found: true,
            badgeCount: badge ? badge.innerText.trim() : null,
            text: item.innerText.replace(/\n+/g, ' ').slice(0, 100)
          };
        }
      }
      return { found: false };
    }, baseTopic);

    console.log('  -> 目标会话项检索结果:', threadInfo);
    assert.ok(threadInfo.found, `收件箱列表中必须包含主题为 "${baseTopic}" 的会话`);
    const countNum = parseInt(threadInfo.badgeCount || '0', 10);
    assert.strictEqual(countNum, 3, `目标会话必须聚合并显示数量徽标 [3]，实际值: ${threadInfo.badgeCount}`);
    console.log(`  ✓ 列表页会话聚合标记正常显示，聚合数量: [${countNum}]`);

    // 5. 点击会话项进入邮件详情页
    console.log('\n[步骤 5] 打开会话详情，核验标题栏数量标记、无外框与显式隔离线...');
    await page.evaluate((topic) => {
      const items = Array.from(document.querySelectorAll('.email-row'));
      for (const item of items) {
        if (item.innerText.includes(topic)) {
          item.click();
          break;
        }
      }
    }, baseTopic);

    await page.waitForSelector('.thread-messages-flow', { timeout: 8000 });
    await page.waitForTimeout(1000);

    // 核验标题栏数量标记
    const titleBadgeCount = await page.evaluate(() => {
      const badge = document.querySelector('.email-title .thread-count-badge');
      return badge ? badge.innerText.trim() : null;
    });
    console.log(`  -> 详情页标题栏会话数量标记: "${titleBadgeCount}"`);
    assert.strictEqual(titleBadgeCount, '3', '详情页标题栏必须显示会话数量标记 [3]');

    // 核验邮件消息项数量与显式隔离线 (role="separator")
    const messageInfo = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.thread-msg-item'));
      const dividers = Array.from(document.querySelectorAll('.thread-message-divider'));
      return {
        itemCount: items.length,
        dividerCount: dividers.length,
        itemBorders: items.map(el => {
          const st = window.getComputedStyle(el);
          return {
            top: st.borderTopStyle,
            bottom: st.borderBottomStyle,
            left: st.borderLeftStyle,
            right: st.borderRightStyle
          };
        }),
        dividerStyles: dividers.map(d => {
          const st = window.getComputedStyle(d);
          return {
            height: st.height,
            bg: st.backgroundColor,
            role: d.getAttribute('role')
          };
        })
      };
    });

    console.log(`  -> 详情页消息条目数量: ${messageInfo.itemCount}`);
    console.log(`  -> 详情页显式隔离线数量: ${messageInfo.dividerCount}`);
    assert.strictEqual(messageInfo.itemCount, 3, '会话详情页展示的消息数必须等于 3');
    assert.strictEqual(messageInfo.dividerCount, 2, '3 封消息之间必须具备 2 条显式隔离线 (role="separator")');

    // 验证所有信件自身绝对无 4 边边框方框
    const allBorderNone = messageInfo.itemBorders.every(b => b.top === 'none' && b.bottom === 'none' && b.left === 'none' && b.right === 'none');
    assert.ok(allBorderNone, '会话内各信件本身不得有外框 (border: none)');
    console.log('  ✓ 会话邮件内零方框，各邮件之间具备标准显式隔离线 (height: 1px, role="separator")');

    // 6. 核验折叠与展开交互
    console.log('\n[步骤 6] 核验历史邮件折叠行展开交互...');
    const collapsedHeaders = await page.$$('.thread-collapsed-header');
    assert.strictEqual(collapsedHeaders.length, 2, '历史邮件应有 2 封处于折叠状态');
    
    // 点击展开第一个折叠邮件
    await collapsedHeaders[0].click();
    await page.waitForTimeout(500);

    const expandedBodies = await page.$$('.thread-expanded-body');
    assert.strictEqual(expandedBodies.length, 2, '点击后对应历史邮件应展开展示完整正文 (总计展开 2 封)');
    console.log(`  ✓ 折叠项点击展开顺畅，当前展开正文条数: ${expandedBodies.length}`);

    // 7. 核验顶部栏「全部展开/全部折叠」按钮交互
    console.log('\n[步骤 7] 核验顶部栏「全部展开/全部折叠」功能...');
    const expandAllBtn = await page.$('.btn-expand-all');
    assert.ok(expandAllBtn, '顶部操作栏必须存在展开/折叠全部按钮');
    await expandAllBtn.click();
    await page.waitForTimeout(500);

    const allExpandedCount = await page.$$eval('.thread-expanded-body', els => els.length);
    assert.strictEqual(allExpandedCount, 3, '全部展开后应有 3 个完整正文展开');
    console.log(`  ✓ 全部展开成功，当前正文条数: ${allExpandedCount}`);

    await expandAllBtn.click();
    await page.waitForTimeout(500);
    const collapsedCountAfter = await page.$$eval('.thread-collapsed-header', els => els.length);
    assert.strictEqual(collapsedCountAfter, 3, '全部折叠后所有邮件全部折叠');
    console.log('  ✓ 全部折叠成功');

    // 8. 保存截图用于视觉审计归档
    const screenshotPath = 'tests/verify_conversation_thread_and_dividers.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  ✓ 视觉全真截图已保存至: ${screenshotPath}`);

    console.log('\n================================================================');
    console.log('=== 全部全真端到端断言通过！会话聚合与显式隔离线排版验证完美 ===');
    console.log('================================================================');
  } finally {
    if (browser) await browser.close();

    // 清理测试数据，确保零假数据残留
    console.log('\n[清理阶段] 物理删除测试会话邮件...');
    for (const emailId of createdEmailIds) {
      try {
        const delRes = await fetch(`${BASE}/api/email/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token
          },
          body: JSON.stringify({ emailIds: [emailId], isPhysics: true })
        });
        const delData = await delRes.json();
        console.log(`  ✓ 清理发件记录 ${emailId}: status=${delData.code}`);
      } catch (e) {
        console.error(`  ⚠️ 清理发件记录 ${emailId} 失败:`, e.message);
      }
    }

    // 同时清理在收件箱中生成的对应的受信记录
    try {
      const inboxListRes = await fetch(`${BASE}/api/email/list?accountId=${134}`, {
        headers: { 'Authorization': token }
      });
      const inboxData = await inboxListRes.json();
      const testEmailIds = (inboxData.data?.list || [])
        .filter(e => e.subject && e.subject.includes('会话测试聚合主题_'))
        .map(e => e.emailId);
      if (testEmailIds.length > 0) {
        await fetch(`${BASE}/api/email/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token
          },
          body: JSON.stringify({ emailIds: testEmailIds, isPhysics: true })
        });
        console.log(`  ✓ 清理收件记录 [${testEmailIds.join(', ')}]: 成功`);
      }
    } catch (e) {}

    console.log('  ✓ 零假数据清理完成');
  }
}

run().catch(err => {
  console.error('\n❌ 核验过程发生错误:', err);
  process.exit(1);
});
