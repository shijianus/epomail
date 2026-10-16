import { chromium } from 'playwright';
import assert from 'assert';

const BASE = 'https://mail.epocanvas.com';

async function run() {
  console.log('====================================================================');
  console.log('=== 公网生产全真栈核验：申诉审计死局时间专属 "*天" 与默认全量表保留详细时间 ===');
  console.log('====================================================================\n');

  let browser;
  try {
    console.log('[步骤 1] 登录生产账号 (admin@epomail.cyou)...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@epomail.cyou', password: '123456' })
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

    console.log('\n[步骤 3] 打开安全审计控制台 /audit-report (默认全量表)...');
    await page.goto(`${BASE}/audit-report`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    // 1. 验证默认全量表中的死局时间列
    console.log('\n[步骤 4] 核验默认全量表 (currentSection === all) 死局时间保留详细时间戳...');
    const defaultHeaders = page.locator('.table-area thead th');
    const defaultHeaderCount = await defaultHeaders.count();
    const defaultHeaderTexts = [];
    for (let i = 0; i < defaultHeaderCount; i++) {
      defaultHeaderTexts.push((await defaultHeaders.nth(i).textContent()).trim().replace(/\s+/g, ' '));
    }
    console.log('  默认全量表当前表头列:', defaultHeaderTexts);

    const deadlockHeaderIdx = defaultHeaderTexts.findIndex(h => h.includes('死局') || h.includes('Deadlock'));
    assert.ok(deadlockHeaderIdx > -1, '默认表必须包含「死局时间」列');
    console.log(`  ✓ 默认表包含「死局时间」列，位于列索引 [${deadlockHeaderIdx}]`);

    // 检查默认全量表单元格中的死局时间展示格式
    const defaultDeadlockSpans = page.locator('.table-area tbody tr .deadlock-cell .plain-time');
    const defaultSpanCount = await defaultDeadlockSpans.count();
    console.log(`  默认全量表渲染出的死局时间单元格数量: ${defaultSpanCount}`);

    if (defaultSpanCount > 0) {
      for (let i = 0; i < defaultSpanCount; i++) {
        const text = (await defaultDeadlockSpans.nth(i).innerText()).trim();
        console.log(`  - 默认表行 ${i + 1}: 死局时间显示文本 = "${text}"`);
        if (text !== '-') {
          // 详细时间戳格式（如 "2026-11-03 01:35" 或 "11/03/26 01:35"），绝不能是 "*天"
          assert.ok(
            /\d{2,4}[-/]\d{1,2}[-/]\d{1,2}/.test(text) || /\d{1,2}:\d{2}/.test(text),
            `默认全量表中必须保留原本详细时间，当前文本: "${text}"`
          );
          assert.ok(
            !/^\d+\s*天$/.test(text),
            `默认全量表死局时间严禁显式为单纯的 "*天"，当前文本: "${text}"`
          );
        }
      }
      console.log('  ✓ 默认全量表死局时间 100% 保留原本详细时间戳，未被格式化为天数！');
    }

    await page.screenshot({ path: 'tests/verify_default_deadlock_time_live.png', fullPage: true });
    console.log('  ✓ 默认全量表现场截图已保存至 tests/verify_default_deadlock_time_live.png');

    // 2. 切换至「申诉审计」板块
    console.log('\n[步骤 5] 切换至「申诉审计」板块...');
    const appealCard = page.locator('.kpi-card.kpi-appeal');
    await appealCard.waitFor({ state: 'visible', timeout: 10000 });
    const [appealResp] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/audit/list') && res.url().includes('warningType=appeal')),
      appealCard.click()
    ]);
    assert.strictEqual(appealResp.status(), 200, '申诉审计接口响应 200');
    await page.waitForTimeout(1000);

    // 核验「申诉审计」表头
    console.log('\n[步骤 6] 核验「申诉审计」板块表头列集...');
    const appealHeaders = page.locator('.table-area thead th');
    const appealHeaderCount = await appealHeaders.count();
    const appealHeaderTexts = [];
    for (let i = 0; i < appealHeaderCount; i++) {
      appealHeaderTexts.push((await appealHeaders.nth(i).textContent()).trim().replace(/\s+/g, ' '));
    }
    console.log('  申诉审计当前表头列:', appealHeaderTexts);

    const appealDeadlockIdx = appealHeaderTexts.findIndex(h => h.includes('死局') || h.includes('Deadlock'));
    assert.ok(appealDeadlockIdx > -1, '申诉审计板块必须包含「死局时间」列');
    console.log(`  ✓ 申诉审计表头包含「死局时间」列，位于列索引 [${appealDeadlockIdx}]`);

    // 核验「申诉审计」中的死局时间单元格：必须为 "*天" 或 "已成死局"
    console.log('\n[步骤 7] 核验「申诉审计」死局时间单元格格式 (*天 或 已成死局)...');
    const appealDeadlockSpans = page.locator('.table-area tbody tr .deadlock-cell .plain-time');
    const appealSpanCount = await appealDeadlockSpans.count();
    console.log(`  申诉审计渲染出的死局时间单元格数量: ${appealSpanCount}`);

    if (appealSpanCount > 0) {
      for (let i = 0; i < appealSpanCount; i++) {
        const span = appealDeadlockSpans.nth(i);
        const text = (await span.innerText()).trim();
        const title = await span.getAttribute('title');
        console.log(`  - 申诉审计行 ${i + 1}: 显示文本 = "${text}", Title 悬浮完整时间 = "${title}"`);

        // 必须为 "* 天" / "*天" / "已成死局" 或 "-"
        if (text !== '-') {
          assert.ok(
            text.includes('天') || text.includes('已成死局') || text.includes('day'),
            `申诉审计死局时间必须展示为 "*天" 或 "已成死局"，当前为 "${text}"`
          );
          // title 属性必须包含完整时间戳
          assert.ok(title && title.length > 5, `申诉审计死局时间 hover 必须保留详细时间戳，当前 title="${title}"`);
        }
      }
      console.log('  ✓ 申诉审计死局时间成功显式为 "*天" 格式，且 hover 具备完整时间戳！');
    }

    await page.screenshot({ path: 'tests/verify_appeal_deadlock_days_live.png', fullPage: true });
    console.log('  ✓ 申诉审计板块截图已保存至 tests/verify_appeal_deadlock_days_live.png');

    console.log('\n====================================================================');
    console.log('=== 生产全真栈端到端测试 100% 全部通过！ ===');
    console.log('====================================================================\n');

  } finally {
    if (browser) await browser.close();
  }
}

run().catch(err => {
  console.error('\n❌ 验收失败:', err);
  process.exit(1);
});
