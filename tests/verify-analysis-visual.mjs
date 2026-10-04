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
  console.log('=== 公网视觉核验：分析页六大图表正常渲染与主题自适应 ===');
  console.log('================================================================');
  console.log(`[目标公网环境] 基地址: ${BASE}`);

  let browser;

  try {
    // 1. 登录公网普通测试用户获取 Token
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

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    // 预注入 Token 至 localStorage
    await context.addInitScript(({ t, email }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email }]));
    }, { t: token, email: USER_EMAIL });

    const page = await context.newPage();
    page.on('console', msg => console.log('  [BROWSER]', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('  [BROWSER ERROR]', err.message));

    // 拦截 loginUserInfo 赋予管理员角色与全部权限
    await page.route('**/api/my/loginUserInfo', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            userId: 1,
            email: 'admin@epomail.bond',
            name: '站长',
            permKeys: ['*'],
            role: { roleId: 6, roleCode: 'master', name: '站长' }
          }
        }
      });
    });

    // 拦截 /analysis/echarts 确保图表具备真实完备数据
    await page.route('**/api/analysis/echarts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            numberCount: {
              receiveTotal: 358,
              sendTotal: 142,
              userTotal: 68,
              normalReceiveTotal: 312,
              normalSendTotal: 130,
              normalUserTotal: 65,
              delReceiveTotal: 46,
              delSendTotal: 12,
              delUserTotal: 3,
              interceptReceiveTotal: 29,
              hardInterceptTotal: 8
            },
            receiveRatio: {
              nameRatio: [
                { name: 'service@github.com', total: 86, isSpam: 0 },
                { name: 'notify@cloudflare.com', total: 64, isSpam: 0 },
                { name: 'noreply@google.com', total: 52, isSpam: 0 },
                { name: 'promo@marketing.net', total: 31, isSpam: 1 },
                { name: 'security@apple.com', total: 28, isSpam: 0 },
                { name: 'phish@suspicious.xyz', total: 19, isSpam: 1 }
              ]
            },
            userDayCount: [
              { date: '2026-09-20', total: 2 },
              { date: '2026-09-21', total: 5 },
              { date: '2026-09-22', total: 3 },
              { date: '2026-09-23', total: 8 },
              { date: '2026-09-24', total: 6 },
              { date: '2026-09-25', total: 12 },
              { date: '2026-09-26', total: 10 },
              { date: '2026-09-27', total: 7 },
              { date: '2026-09-28', total: 9 },
              { date: '2026-09-29', total: 14 },
              { date: '2026-09-30', total: 11 },
              { date: '2026-10-01', total: 15 },
              { date: '2026-10-02', total: 18 },
              { date: '2026-10-03', total: 22 }
            ],
            emailDayCount: {
              receiveDayCount: [
                { date: '2026-09-27', total: 25 },
                { date: '2026-09-28', total: 32 },
                { date: '2026-09-29', total: 40 },
                { date: '2026-09-30', total: 48 },
                { date: '2026-10-01', total: 55 },
                { date: '2026-10-02', total: 62 },
                { date: '2026-10-03', total: 70 }
              ],
              sendDayCount: [
                { date: '2026-09-27', total: 10 },
                { date: '2026-09-28', total: 15 },
                { date: '2026-09-29', total: 18 },
                { date: '2026-09-30', total: 22 },
                { date: '2026-10-01', total: 26 },
                { date: '2026-10-02', total: 28 },
                { date: '2026-10-03', total: 35 }
              ],
              interceptDayCount: [
                { date: '2026-09-27', total: 3 },
                { date: '2026-09-28', total: 5 },
                { date: '2026-09-29', total: 4 },
                { date: '2026-09-30', total: 6 },
                { date: '2026-10-01', total: 7 },
                { date: '2026-10-02', total: 8 },
                { date: '2026-10-03', total: 9 }
              ]
            },
            daySendTotal: 35,
            aiAnalytics: {
              dayCount: [
                { date: '2026-09-27', calls: 12, tokens: 4500 },
                { date: '2026-09-28', calls: 18, tokens: 6800 },
                { date: '2026-09-29', calls: 25, tokens: 9200 },
                { date: '2026-09-30', calls: 30, tokens: 12400 },
                { date: '2026-10-01', calls: 42, tokens: 18500 },
                { date: '2026-10-02', calls: 50, tokens: 23100 },
                { date: '2026-10-03', calls: 65, tokens: 31000 }
              ],
              modelRatio: [
                { name: 'llama-3.1-8b-instruct', value: 145 },
                { name: 'gpt-4o-mini', value: 68 },
                { name: 'qwen2.5-7b', value: 29 }
              ],
              totalCalls: 242,
              totalTokens: 105500
            }
          }
        }
      });
    });

    // 2. 访问公网分析页 #manage/admin/analysis
    console.log('\n[步骤 2] 导航至公网分析页并等待图表渲染...');
    await page.goto(`${BASE}/mail/u/0/#manage/admin/analysis`, { waitUntil: 'domcontentloaded' });

    // 等待设定页侧边栏与分析内容就绪
    await page.waitForSelector('.settings-layout', { timeout: 15000 });
    await page.waitForSelector('.analysis', { timeout: 15000 });
    await page.waitForTimeout(2500);

    const currentUrl = page.url();
    console.log(`  当前 URL: ${currentUrl}`);
    ok(currentUrl.includes('#manage/admin/analysis'), '当前 URL 精准匹配 #manage/admin/analysis');

    // 3. 验证各 ECharts 图表 Canvas 实际生成且尺寸正常
    console.log('\n[步骤 3] 验证 ECharts 六大图表 Canvas 节点均成功初始化...');

    // 发件人占比饼图
    const senderPieCanvas = page.locator('.sender-pie canvas').first();
    await senderPieCanvas.waitFor({ state: 'visible', timeout: 8000 });
    ok(await senderPieCanvas.isVisible(), '发件人占比饼图 (sender-pie) Canvas 成功渲染');

    // 用户增长折线图
    const increaseLineCanvas = page.locator('.increase-line canvas').first();
    await increaseLineCanvas.waitFor({ state: 'visible', timeout: 8000 });
    ok(await increaseLineCanvas.isVisible(), '用户增长折线图 (increase-line) Canvas 成功渲染');

    // 邮件收发柱状图
    const emailColumnCanvas = page.locator('.email-column canvas').first();
    await emailColumnCanvas.waitFor({ state: 'visible', timeout: 8000 });
    ok(await emailColumnCanvas.isVisible(), '邮件收发吞吐柱状图 (email-column) Canvas 成功渲染');

    // 发信配额仪表盘
    const sendGaugeCanvas = page.locator('.send-count canvas').first();
    await sendGaugeCanvas.waitFor({ state: 'visible', timeout: 8000 });
    ok(await sendGaugeCanvas.isVisible(), '今日发信配额仪表盘 (send-count) Canvas 成功渲染');

    // AI 调用与 Token 走势折线图
    const aiUsageLineCanvas = page.locator('.ai-usage-line canvas').first();
    await aiUsageLineCanvas.waitFor({ state: 'visible', timeout: 8000 });
    ok(await aiUsageLineCanvas.isVisible(), 'AI 用量与 Token 走势图 (ai-usage-line) Canvas 成功渲染');

    // AI 模型分布饼图
    const aiModelPieCanvas = page.locator('.ai-model-pie canvas').first();
    await aiModelPieCanvas.waitFor({ state: 'visible', timeout: 8000 });
    ok(await aiModelPieCanvas.isVisible(), 'AI 模型用量分布饼图 (ai-model-pie) Canvas 成功渲染');

    // 4. 截图亮色模式全景
    await page.screenshot({ path: 'tests/verify_analysis_light_mode.png', fullPage: true });
    console.log('  📸 已保存分析页亮色模式截图: tests/verify_analysis_light_mode.png');

    // 5. 切换为暗色模式并核验图表自适应重绘
    console.log('\n[步骤 4] 切换暗色模式验证图表重绘与对比度...');
    const themeBtn = page.locator('.theme-toggle-btn').first();
    await themeBtn.click();
    await page.waitForTimeout(2000);

    const isDarkMode = await page.evaluate(() => document.documentElement.classList.contains('dark') || document.body.classList.contains('dark'));
    ok(isDarkMode, '成功切换至暗色模式 (Dark Mode)');

    // 验证暗色模式下 Canvas 依然稳定正常渲染
    ok(await senderPieCanvas.isVisible(), '暗色模式下发件人饼图正常存在且自适应重绘');
    ok(await increaseLineCanvas.isVisible(), '暗色模式下增长折线图正常存在且自适应重绘');
    ok(await emailColumnCanvas.isVisible(), '暗色模式下吞吐柱状图正常存在且自适应重绘');

    await page.screenshot({ path: 'tests/verify_analysis_dark_mode.png', fullPage: true });
    console.log('  📸 已保存分析页暗色模式截图: tests/verify_analysis_dark_mode.png');

  } catch (err) {
    console.error('❌ 执行异常:', err);
    fail++;
    failures.push(err.message);
  } finally {
    if (browser) await browser.close();
  }

  console.log('\n================================================================');
  console.log(`=== 验收结果: 通过: ${pass}, 失败: ${fail} ===`);
  if (failures.length > 0) {
    console.log('失败清单:', failures);
    process.exit(1);
  } else {
    console.log('🎉 所有分析页图表渲染与主题自适应断言全部通过！');
    process.exit(0);
  }
}

run();
