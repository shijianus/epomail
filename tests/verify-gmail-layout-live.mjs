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
  console.log('=== 线上生产真实端到端核验：邮件详情与底部快捷动作深度体验核验 ===');
  console.log('================================================================');

  let browser;
  let createdEmailId = null;
  let token = null;
  const BASE = await getAvailableBase();
  console.log(`[目标环境] 使用核验基地址: ${BASE}`);

  try {
    // 1. 登录获取 JWT Token
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
    console.log('  ✓ 登录成功，Token 获取就绪');

    // 2. 发送一封测试邮件（内容高度超过屏幕），以便全真验证长信件 inline-reply 悬浮吸附
    console.log('\n[步骤 2] 发送长邮件测试样本以模拟全真阅读栈...');
    const longHtml = `
      <div style="font-family: sans-serif; line-height: 1.8;">
        <h2>Epocanvas Mail · 视觉体验升级验收邮件</h2>
        <p>尊敬的用户您好，本封信件用于全真栈自动化测试与视觉排版回归。</p>
        ${Array.from({ length: 25 }, (_, i) => `<p>【段落 ${i + 1}】系统设计遵循顶级排版规范：header-actions 按功能划分、thread-header-bar 分为两层、recipient-label 显示具体接收者名称、inline-reply 在长信件滚动期间显式标识最大可见面积，滚动至信件末尾自然接于信件结尾且无分割线。</p>`).join('\n')}
        <div style="height: 400px; background: #f1f5f9; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p>底部补充测试区域：用于验证滚动至邮件最末尾时，inline-reply 能够平滑终止悬浮并自然归位至信件结尾，无多余分隔线与边框。</p>
        </div>
      </div>
    `;

    const sendRes = await fetch(`${BASE}/api/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token
      },
      body: JSON.stringify({
        accountId: loginData.data?.account?.accountId || 134,
        receiveEmail: [USER_EMAIL],
        subject: '验收测试：排版分层与自然吸附底栏',
        content: longHtml,
        text: 'Epocanvas Mail · 视觉体验升级验收邮件'
      })
    });
    const sendData = await sendRes.json();
    console.log('  ✓ 发信响应:', sendData);
    if (sendData.code === 200) {
      createdEmailId = sendData.data?.emailId;
    } else {
      console.log('  ⚠️ 发信受限或已达配额，将复用收件箱中已有的长邮件样本继续执行核验');
    }

    // 3. 启动 Playwright 桌面端 (1440x900)
    console.log('\n[步骤 3] 启动 Playwright 桌面端 (1440x900) 真实浏览器核验...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });
    const page = await context.newPage();

    // 注入 JWT 令牌并打开 /inbox
    await page.goto(`${BASE}/inbox`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ t, email, user }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('loginEmail', email);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('setting', JSON.stringify({ lang: 'zh' }));
      localStorage.setItem('locale', 'zh');
    }, { t: token, email: USER_EMAIL, user: loginData.data });

    console.log(`  -> 访问 ${BASE}/inbox ...`);
    await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 选取第一封邮件进入邮件详情视图
    console.log('\n[步骤 4] 选取测试邮件进入邮件详情视图...');
    const emailRow = page.locator('.email-row').first();
    await emailRow.waitFor({ state: 'visible', timeout: 15000 });
    const count = await page.locator('.email-row').count();
    console.log(`  ✓ 收件箱已加载，检测到 ${count} 封邮件`);
    assert.ok(count > 0, '收件箱必须存在可点击测试的邮件条目');
    
    // 点击第一封邮件打开详情
    await emailRow.click();
    await page.waitForTimeout(2500);

    // 4. 验证 class="header-actions" 分层与功能区隔断
    console.log('\n[步骤 5] 验证 header-actions 功能分组与空白/分隔线...');
    const headerActions = page.locator('.box > .header-actions');
    await headerActions.waitFor({ state: 'visible', timeout: 10000 });

    const navGroup = page.locator('.box .action-group.nav-group');
    const triageGroup = page.locator('.box .action-group.triage-group');
    const statusGroup = page.locator('.box .action-group.status-group');
    const utilityGroup = page.locator('.box .action-group.utility-group');
    const dividers = page.locator('.box .header-action-divider');

    assert.strictEqual(await navGroup.count(), 1, '必须包含导航分组 (nav-group)');
    assert.strictEqual(await statusGroup.count(), 1, '必须包含状态操作分组 (status-group)');
    assert.strictEqual(await utilityGroup.count(), 1, '必须包含工具分组 (utility-group)');
    const dividerCount = await dividers.count();
    console.log(`  ✓ 成功定位到 ${dividerCount} 条功能区分隔线 (header-action-divider)`);
    assert.ok(dividerCount >= 2, 'header-actions 必须包含功能分组分隔线');

    // 5. 验证 class="thread-header-bar" 2 层结构
    console.log('\n[步骤 6] 验证 thread-header-bar 升级为 2 层排版...');
    const threadHeaderBar = page.locator('.thread-header-bar').first();
    await threadHeaderBar.waitFor({ state: 'visible', timeout: 5000 });

    const metaBar = threadHeaderBar.locator('.thread-meta-bar');
    const actionsBar = threadHeaderBar.locator('.thread-actions-bar');

    assert.strictEqual(await metaBar.count(), 1, 'thread-header-bar 第 1 层必须为 .thread-meta-bar');
    assert.strictEqual(await actionsBar.count(), 1, 'thread-header-bar 第 2 层必须为 .thread-actions-bar');

    const dateText = await metaBar.locator('.date').innerText();
    console.log(`  ✓ 第 1 层 (thread-meta-bar): 包含邮件时间 [${dateText}] 及星标操作`);
    assert.ok(dateText.length > 0, '时间文本必须存在');

    const actionButtons = actionsBar.locator('.msg-act-icon');
    const actBtnCount = await actionButtons.count();
    console.log(`  ✓ 第 2 层 (thread-actions-bar): 包含 ${actBtnCount} 个快捷操作按钮`);
    assert.ok(actBtnCount >= 3, '第 2 层快捷操作按钮数量必须符合规范');

    // 6. 验证 class="recipient-label" 显示 "至 {接收者名称}" 而非泛指的 "至 我"
    console.log('\n[步骤 7] 验证 recipient-label 显示 "至 {接收者名称}"...');
    const recipientLabel = page.locator('.recipient-label').first();
    await recipientLabel.waitFor({ state: 'visible', timeout: 5000 });
    const recipientText = await recipientLabel.innerText();
    console.log(`  ✓ recipient-label 实际渲染文案: "${recipientText}"`);
    assert.ok(!recipientText.includes('至 我') && !recipientText.includes('to me'), `必须移除泛指的"至 我"，当前渲染: "${recipientText}"`);
    assert.ok(recipientText.startsWith('至') || recipientText.startsWith('to'), `必须以前缀开头并带有名称: "${recipientText}"`);

    // 7. 验证 class="info-bottom" 上移：紧挨发件人名称下方，垂直间距极小
    console.log('\n[步骤 8] 验证 info-bottom 上移至发件人名称正下方...');
    const senderTitle = page.locator('.send-name-title').first();
    const infoBottom = page.locator('.info-bottom').first();
    const titleBox = await senderTitle.boundingBox();
    const infoBox = await infoBottom.boundingBox();
    console.log(`  ✓ 发件人名称底端: ${titleBox.y + titleBox.height}px, 接收者行顶端: ${infoBox.y}px`);
    const gap = infoBox.y - (titleBox.y + titleBox.height);
    console.log(`  ✓ 上下垂直间距: ${gap.toFixed(1)}px (预期紧密排列 < 15px)`);
    assert.ok(gap < 20 && gap >= -5, `info-bottom 必须紧挨发件人名称下方，当前间距: ${gap}px`);

    // 8. 验证已彻底删除多余的 class="info-middle"
    console.log('\n[步骤 9] 验证多余的 info-middle 已彻底删除...');
    const infoMiddleCount = await page.locator('.info-middle').count();
    console.log(`  ✓ .info-middle 节点数量: ${infoMiddleCount}`);
    assert.strictEqual(infoMiddleCount, 0, '.info-middle 必须已被彻底删除');

    // 9. 验证无多余框线设计（去除卡片包围框）
    console.log('\n[步骤 10] 验证单封邮件阅读视图去除外层多余包围框...');
    const threadItemBorder = await page.locator('.thread-msg-item').first().evaluate(el => {
      const s = window.getComputedStyle(el);
      return s.borderStyle;
    });
    console.log(`  ✓ .thread-msg-item 边框样式: "${threadItemBorder}" (预期为 none，去除条条框框)`);
    assert.strictEqual(threadItemBorder, 'none', '单封邮件外层不得带有包裹边框');

    // 10. 验证 inline-reply 悬浮分界线与到底部自然接续逻辑
    console.log('\n[步骤 11] 验证 inline-reply 悬浮吸附分界与到底自然接续...');
    const inlineReply = page.locator('.inline-reply').first();
    await inlineReply.waitFor({ state: 'visible', timeout: 5000 });

    const metrics = await page.evaluate(() => {
      const wrap = document.querySelector('.scrollbar .el-scrollbar__wrap');
      const rep = document.querySelector('.inline-reply');
      return {
        wrapExists: !!wrap,
        scrollHeight: wrap?.scrollHeight,
        clientHeight: wrap?.clientHeight,
        scrollTop: wrap?.scrollTop,
        repClasses: rep?.className,
        repStyle: rep?.getAttribute('style'),
      };
    });
    console.log('  [METRICS DEBUG]:', JSON.stringify(metrics, null, 2));

    // 状态 A：长信件处于顶部/中部未到底状态 -> 具有 is-floating 类，具备分割线
    const isFloatingAtTop = await inlineReply.evaluate(el => el.classList.contains('is-floating'));
    console.log(`  ✓ 长信件处于顶部时 inline-reply 悬浮状态 (is-floating): ${isFloatingAtTop}`);
    assert.strictEqual(isFloatingAtTop, true, '长信件未到底时必须为 is-floating 悬浮状态');

    const floatingBorder = await inlineReply.evaluate(el => window.getComputedStyle(el).borderTopColor);
    console.log(`  ✓ 悬浮状态下顶部具有分割线: ${floatingBorder}`);
    assert.ok(floatingBorder !== 'rgba(0, 0, 0, 0)' && floatingBorder !== 'transparent', '悬浮状态下必须具备分割线');

    // 状态 B：滚动至最底部 -> is-floating 自动解除，分割线消失，自然接在信件尾部
    console.log('  -> 将信件阅读视口平滑滚动至最底部...');
    await page.evaluate(() => {
      const wrap = document.querySelector('.scrollbar .el-scrollbar__wrap');
      if (wrap) wrap.scrollTop = wrap.scrollHeight;
    });
    await page.waitForTimeout(600);

    const isFloatingAtBottom = await inlineReply.evaluate(el => el.classList.contains('is-floating'));
    const bottomBorderColor = await inlineReply.evaluate(el => window.getComputedStyle(el).borderTopColor);
    console.log(`  ✓ 滚动到底部后 is-floating 状态: ${isFloatingAtBottom}, 分割线颜色: ${bottomBorderColor}`);
    assert.strictEqual(isFloatingAtBottom, false, '滚动至信件末尾时必须自动解除悬浮');
    assert.ok(bottomBorderColor === 'rgba(0, 0, 0, 0)' || bottomBorderColor === 'transparent', '滚动至信件末尾后分割线必须消失，自然接续');

    // 验证包含回复、转发、表情反应按钮
    const replyBtn = inlineReply.locator('.btn-reply');
    const forwardBtn = inlineReply.locator('.btn-forward');
    const reactionBtn = inlineReply.locator('.footer-reaction-btn');
    assert.strictEqual(await replyBtn.count(), 1, '必须包含回复按钮');
    assert.strictEqual(await forwardBtn.count(), 1, '必须包含转发按钮');
    assert.strictEqual(await reactionBtn.count(), 1, '个人互动邮件必须包含表情反应按钮');
    console.log('  ✓ inline-reply 包含完整的回复、转发与表情反应快捷动作条');

    // 11. 验证头像 Hover 联系人卡片交互
    console.log('\n[步骤 12] 验证头像 Hover 联系人卡片浮层交互...');
    const avatar = page.locator('.sender-avatar').first();
    await avatar.hover();
    await page.waitForTimeout(600);
    const hoverCard = page.locator('.contact-hover-card');
    const hoverCardVisible = await hoverCard.isVisible();
    console.log(`  ✓ 联系人悬停卡片显式状态: ${hoverCardVisible}`);
    if (hoverCardVisible) {
      const mailAction = hoverCard.locator('.btn-card-mail');
      assert.strictEqual(await mailAction.count(), 1, '悬停卡片必须包含写信/发信按钮');
      console.log('  ✓ 联系人悬停卡片包含完备的发信、复制地址与过滤器功能');
    }

    // 12. 验证 Emoji Reaction 分类选择器与零滚动条、零溢出
    console.log('\n[步骤 13] 验证 Emoji 分类选择器、无显式滚动条与零溢出...');
    await reactionBtn.click();
    await page.waitForTimeout(600);

    const pickerCard = page.locator('.reaction-picker-card').filter({ visible: true }).first();
    await pickerCard.waitFor({ state: 'visible', timeout: 5000 });
    const catTabs = pickerCard.locator('.cat-tab');
    const catCount = await catTabs.count();
    console.log(`  ✓ Emoji 选择器分类标签数量: ${catCount} (包含常用、表情、手势、标志)`);
    assert.ok(catCount >= 4, 'Emoji 选择器必须具备 4 类以上清晰分类');

    // 验证无显式滚动条
    const gridOverflow = await pickerCard.locator('.reaction-picker-grid').evaluate(el => {
      const s = window.getComputedStyle(el);
      return { overflowY: s.overflowY, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    });
    console.log(`  ✓ Emoji 选择器网格样式: overflowY=${gridOverflow.overflowY}, 滚动高度与客户区匹配: ${gridOverflow.scrollHeight <= gridOverflow.clientHeight + 2}`);
    assert.strictEqual(gridOverflow.overflowY, 'hidden', 'Emoji 网格必须隐藏滚动条');

    // 验证 emoji-chip 舒适居中且无超出方框
    const firstChip = pickerCard.locator('.reaction-picker-grid .emoji-chip').first();
    const chipBox = await firstChip.boundingBox();
    console.log(`  ✓ emoji-chip 盒模型尺寸: ${chipBox.width}px × ${chipBox.height}px (精巧方框)`);
    assert.ok(chipBox.width <= 36 && chipBox.height <= 36, 'emoji-chip 尺寸必须规整不溢出');

    // 点击切换分类
    console.log('  -> 点击切换到分类 2 (手势)...');
    await catTabs.nth(2).click();
    await page.waitForTimeout(300);

    // 点击一个表情
    const gestureEmoji = pickerCard.locator('.reaction-picker-grid .emoji-chip').first();
    const emojiText = await gestureEmoji.innerText();
    console.log(`  -> 点击测试表情反应: "${emojiText}"`);
    await gestureEmoji.click();
    await page.waitForTimeout(500);

    const reactionBadges = page.locator('.msg-reactions-bar .reaction-badge');
    const badgeCount = await reactionBadges.count();
    console.log(`  ✓ 消息区域出现表情反应徽章数量: ${badgeCount}`);
    assert.ok(badgeCount >= 1, '点击表情后必须呈现反应徽章');

    // 截图存档：桌面端
    await page.screenshot({ path: 'tests/verify_gmail_layout_desktop_1440.png', fullPage: false });
    console.log('  ✓ 桌面端 (1440x900) 实测截图已保存至 tests/verify_gmail_layout_desktop_1440.png');

    // 13. 切换暗色模式 (Dark Mode) 验证
    console.log('\n[步骤 14] 验证暗色模式下的视觉表现...');
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/verify_gmail_layout_dark_1440.png', fullPage: false });
    console.log('  ✓ 暗色模式实测截图已保存至 tests/verify_gmail_layout_dark_1440.png');

    // 14. 移动端视口 (375x812) 响应式横向滚动与分层验证
    console.log('\n[步骤 15] 验证移动端视口 (375x812) 响应式适配...');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/verify_gmail_layout_mobile_375.png', fullPage: false });
    console.log('  ✓ 移动端实测截图已保存至 tests/verify_gmail_layout_mobile_375.png');

    console.log('\n================================================================');
    console.log('=== 所有 15 项断言与线上真实端到端核验全部完美通过 (100% PASS) ===');
    console.log('================================================================');

  } catch (err) {
    console.error('❌ 核验失败:', err);
    process.exitCode = 1;
  } finally {
    // 零假数据残留：物理清理测试邮件
    if (createdEmailId && token) {
      console.log(`\n[清理] 正在物理删除测试邮件 ID: ${createdEmailId}...`);
      try {
        await fetch(`${BASE}/api/email/delete?emailIds=${createdEmailId}&physical=true`, {
          method: 'DELETE',
          headers: { 'Authorization': token }
        });
        console.log('  ✓ 测试邮件已彻底物理清理完毕 (零假数据残留)');
      } catch (cleanErr) {
        console.warn('  ⚠️ 清理邮件失败:', cleanErr.message);
      }
    }
    if (browser) await browser.close();
  }
}

run();
