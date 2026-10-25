import { chromium } from 'playwright';
import assert from 'node:assert';

const BASE = 'https://mail.epocanvas.com';
const ADMIN_EMAIL = 'admin@epomail.cyou';
const ADMIN_PWD = '123456';

async function test() {
  console.log('=== [E2E] 生产环境全真栈自动化终验 ===');
  const loginRes = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PWD })
  });
  const json = await loginRes.json();
  const token = json.data?.token;
  assert.ok(token, '成功获取管理员 Token');
  console.log('✓ 成功获取管理员凭证');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN'
  });

  await context.addInitScript(({ t, email }) => {
    localStorage.setItem('token', t);
    localStorage.setItem('loginEmail', email);
    localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email }]));
  }, { t: token, email: ADMIN_EMAIL });

  const page = await context.newPage();

  try {
    console.log('1. 导航至审计控制台...');
    const t0 = Date.now();
    await page.goto(BASE + '/mail/u/0/#manage/admin/audit', { waitUntil: 'networkidle' });
    await page.waitForSelector('.audit-page-container', { timeout: 15000 });
    console.log('  ✓ 页面初始加载完成，耗时:', Date.now() - t0, 'ms');

    // 1. 验证 KPI 卡片 1 (滥用威胁) 数字展示
    const threatCard = page.locator('.kpi-card.kpi-threat').first();
    const threatCardNumber = (await threatCard.locator('.stat-number').textContent()).trim();
    console.log('2. 验证 KPI 卡片数字:', threatCardNumber);
    assert.strictEqual(threatCardNumber, '2', '滥用威胁卡片必须显示真实拥有的数据量 2 (非 02/00/00/5)');

    // 2. 点击进入威胁板块并监控响应
    console.log('3. 点击滥用威胁卡片并等待接口响应...');
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/audit/list') && res.url().includes('warningType=risk')),
      threatCard.click()
    ]);
    assert.strictEqual(response.status(), 200, '威胁接口响应 200');
    await page.waitForTimeout(600);

    // 3. 验证表格渲染行数
    const rows = page.locator('.table-area tbody tr:not(.abuse-cluster-child-row)');
    const rowCount = await rows.count();
    console.log('4. 验证威胁表格行数:', rowCount);
    assert.strictEqual(rowCount, 2, '表格行数必须严格等于 2 (一人多号集群 + 遭受举报)');

    // 4. 验证表头列集必须包含“处理建议”，且位置在“当前状态”之后、“报警时间”之前
    const headers = page.locator('.table-area thead th');
    const headerCount = await headers.count();
    const headerTexts = [];
    for (let i = 0; i < headerCount; i++) {
      headerTexts.push((await headers.nth(i).textContent()).trim().replace(/\s+/g, ' '));
    }
    console.log('5. 验证表头列集:', headerTexts);

    const statusColIdx = headerTexts.findIndex(h => h.includes('状态') || h.includes('Status'));
    const suggestionColIdx = headerTexts.findIndex(h => h.includes('建议') || h.includes('Suggestion'));
    const timeColIdx = headerTexts.findIndex(h => h.includes('时间') || h.includes('Time'));
    console.log(`  列顺序位置: 状态[${statusColIdx}] -> 建议[${suggestionColIdx}] -> 时间[${timeColIdx}]`);

    assert.ok(suggestionColIdx > -1, '表头必须包含处理建议列');
    assert.ok(suggestionColIdx > statusColIdx, '处理建议必须位于当前状态之后');
    assert.ok(suggestionColIdx < timeColIdx, '处理建议必须位于报警时间之前');

    // 5. 验证表格行内容及违规说明
    const row1 = (await rows.nth(0).textContent()).replace(/\s+/g, ' ');
    const row2 = (await rows.nth(1).textContent()).replace(/\s+/g, ' ');
    console.log('6. 验证行内容:');
    console.log('  行 1:', row1.slice(0, 100));
    console.log('  行 2:', row2.slice(0, 100));

    assert.ok(row1.includes('一人多号'), '第 1 行违规内容必须展示“一人多号”');
    assert.ok(row2.includes('遭受举报'), '第 2 行违规内容必须展示“遭受举报”');
    assert.ok(row1.includes('账号暂停') || row1.includes('封禁'), '第 1 行处理建议展示正确建议');
    assert.ok(row2.includes('建议封禁') || row2.includes('封禁') || row2.includes('处置'), '第 2 行处理建议展示正确建议');

    // 6. 保存全真栈终验实测截图
    await page.screenshot({ path: 'tests/verify_threat_final_live.png' });
    console.log('✓ 截图已成功保存: tests/verify_threat_final_live.png');

    console.log('\n================================================================');
    console.log('=== 全部断言 100% 通过！用户全部 3 项核心需求完美交付！ ===');
    console.log('================================================================\n');
  } finally {
    await browser.close();
  }
}

test().catch(err => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
