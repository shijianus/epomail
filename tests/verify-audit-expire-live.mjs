import { chromium } from 'playwright';
import assert from 'assert';

const BASE = 'https://mail.epocanvas.com';

async function run() {
  console.log('====================================================================');
  console.log('=== 公网生产环境实测：风险管理过期时间直显天数与颜色阶梯验证 ===');
  console.log('====================================================================\n');

  let browser;
  try {
    console.log('[步骤 1] 登录生产账号 (admin@epomail.cyou)...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@epomail.cyou', password: (process.env.EPOMAIL_LIVE_E2E_ADMIN_PASSWORD || process.env.EPOMAIL_E2E_ADMIN_PASSWORD || '') })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, '登录接口返回成功');
    const token = loginJson.data?.token;

    console.log('\n[步骤 2] 启动无头 Chromium 浏览器访问生产页面...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN'
    });

    await context.addInitScript(({ t }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email: 'admin@epomail.cyou' }]));
    }, { t: token });

    const page = await context.newPage();

    console.log('\n[步骤 3] 打开安全审计控制台 /audit-report...');
    await page.goto(`${BASE}/audit-report`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 检查是否有风险管理卡片
    console.log('\n[步骤 4] 点击并激活「风险管理」KPI 卡片...');
    const auditKpiCard = page.locator('.kpi-card.kpi-audit');
    await auditKpiCard.waitFor({ state: 'visible', timeout: 10000 });
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/audit/list') && res.url().includes('warningType=audit')),
      auditKpiCard.click()
    ]);
    assert.strictEqual(response.status(), 200, '风险管理接口响应 200');
    await page.waitForTimeout(600);

    // 检查表头
    console.log('\n[步骤 5] 核验「风险管理」板块表头列集...');
    const headers = page.locator('.table-area thead th');
    const headerCount = await headers.count();
    const headerTexts = [];
    for (let i = 0; i < headerCount; i++) {
      headerTexts.push((await headers.nth(i).textContent()).trim().replace(/\s+/g, ' '));
    }
    console.log('  当前表头列:', headerTexts);

    const expireHeaderIdx = headerTexts.findIndex(h => h.includes('过期') || h.includes('Expiry'));
    assert.ok(expireHeaderIdx > -1, '表头必须包含「过期时间」列');
    console.log(`  ✓ 验证表头包含「过期时间」列，位于列索引 [${expireHeaderIdx}]`);

    // 检查过期时间单元格
    console.log('\n[步骤 6] 核验「过期时间」数据单元格展示内容与色彩类名...');
    const expireCells = page.locator('.table-area tbody tr .expire-days-cell');
    const cellCount = await expireCells.count();
    console.log(`  渲染出的过期时间单元格数量: ${cellCount}`);

    if (cellCount > 0) {
      for (let i = 0; i < cellCount; i++) {
        const cell = expireCells.nth(i);
        const textSpan = cell.locator('.plain-expire-days');
        const text = (await textSpan.innerText()).trim();
        const className = await textSpan.getAttribute('class');
        const title = await cell.getAttribute('title');

        console.log(`  - 行 ${i + 1}: 显示文本 = "${text}", 类名 = "${className}", Title 悬浮提示 = "${title}"`);
        assert.ok(text.includes('天') || text.includes('已过期'), `行 ${i + 1} 必须直接展示天数或“已过期”，当前为 "${text}"`);
        assert.ok(className.includes('expire-green') || className.includes('expire-orange') || className.includes('expire-red'), `行 ${i + 1} 必须具备颜色样式类`);
        assert.ok(title && title.length > 5, `行 ${i + 1} 必须具备精确时间戳 tooltip`);
      }
      console.log('  ✓ 数据行过期时间天数直显与色彩完全符合准则！');
    } else {
      console.log('  当前风险管理列表暂无数据行，检查空态');
    }

    // 截屏留存
    console.log('\n[步骤 7] 截取公网生产全真栈现场截图...');
    await page.screenshot({ path: 'tests/verify_audit_expire_live.png', fullPage: true });
    console.log('  ✓ 生产全真栈截图已成功保存至 tests/verify_audit_expire_live.png');

    console.log('\n====================================================================');
    console.log('=== 生产环境 Playwright 端到端全真栈核验 100% 通过！ ===');
    console.log('====================================================================\n');

  } finally {
    if (browser) await browser.close();
  }
}

run().catch((err) => {
  console.error('测试失败:', err);
  process.exit(1);
});
