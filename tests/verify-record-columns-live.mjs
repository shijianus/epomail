import { chromium } from 'playwright';
import assert from 'assert';

const BASE = 'https://mail.epocanvas.com';

async function run() {
  console.log('====================================================================');
  console.log('=== 公网生产环境实测：操作记录板块列集优化（违规等级前置 & 死局时间删除）===');
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

    console.log('\n[步骤 3] 打开安全审计控制台 /audit-report...');
    await page.goto(`${BASE}/audit-report`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 点击操作记录卡片
    console.log('\n[步骤 4] 点击并激活「操作记录」KPI 卡片...');
    const recordKpiCard = page.locator('.kpi-card.kpi-record');
    await recordKpiCard.waitFor({ state: 'visible', timeout: 10000 });
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/audit/list') && res.url().includes('warningType=ban')),
      recordKpiCard.click()
    ]);
    assert.strictEqual(response.status(), 200, '操作记录接口响应 200');
    await page.waitForTimeout(800);

    // 检查表头列集
    console.log('\n[步骤 5] 核验「操作记录」板块表头列集...');
    const headers = page.locator('.table-area thead th');
    const headerCount = await headers.count();
    const headerTexts = [];
    for (let i = 0; i < headerCount; i++) {
      headerTexts.push((await headers.nth(i).textContent()).trim().replace(/\s+/g, ' '));
    }
    console.log('  当前操作记录表头列:', headerTexts);

    // 1. 验证不包含“死局时间”
    const deadlockHeader = headerTexts.find(h => h.includes('死局') || h.includes('Deadlock'));
    assert.strictEqual(deadlockHeader, undefined, '操作记录板块必须已彻底删除「死局时间」列');
    console.log('  ✓ 验证成功删除「死局时间」列');

    // 2. 验证包含“违规等级”与“违规分类”
    const levelIdx = headerTexts.findIndex(h => h.includes('违规等级') || h.includes('Violation Level'));
    const categoryIdx = headerTexts.findIndex(h => h.includes('违规分类') || h.includes('Violation Category'));
    assert.ok(levelIdx > -1, '操作记录必须包含「违规等级」列');
    assert.ok(categoryIdx > -1, '操作记录必须包含「违规分类」列');
    assert.ok(levelIdx < categoryIdx, `「违规等级」[${levelIdx}] 必须位于「违规分类」[${categoryIdx}] 之前`);
    console.log(`  ✓ 验证「违规等级」已置于「违规分类」之前: 等级[${levelIdx}] -> 分类[${categoryIdx}]`);

    // 3. 验证数据行
    const rows = page.locator('.table-area tbody tr');
    const rowCount = await rows.count();
    console.log(`\n[步骤 6] 验证操作记录数据行渲染 (当前共 ${rowCount} 行)...`);
    if (rowCount > 0) {
      for (let i = 0; i < rowCount; i++) {
        const row = rows.nth(i);
        const levelCell = row.locator('.level-cell .plain-level-text');
        const levelText = (await levelCell.textContent()).trim();
        const catCell = row.locator('.category-cell .plain-category-text');
        const catText = (await catCell.textContent()).trim();
        console.log(`  - 行 ${i + 1}: 违规等级 = "${levelText}", 违规分类 = "${catText}"`);
        assert.ok(levelText.length > 0, `行 ${i + 1} 违规等级不可为空`);
        assert.ok(catText.length > 0, `行 ${i + 1} 违规分类不可为空`);
      }
      console.log('  ✓ 数据行违规等级与分类渲染正常！');
    }

    // 截屏留存
    console.log('\n[步骤 7] 截取公网生产全真栈现场截图...');
    await page.screenshot({ path: 'tests/verify_record_columns_live.png', fullPage: true });
    console.log('  ✓ 生产全真栈截图已成功保存至 tests/verify_record_columns_live.png');

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
