import { chromium } from 'playwright';
import assert from 'assert';

const BASE = 'https://mail.epocanvas.com';

async function run() {
  console.log('====================================================================');
  console.log('=== 公网生产全真栈验证：安全审计与治理链路严格分流 (待处置 vs 已结案归档) ===');
  console.log('====================================================================\n');

  let browser;

  try {
    console.log('[步骤 1] 登录生产管理员账号 (admin@epomail.cyou)...');
    const loginRes = await fetch(`${BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@epomail.cyou', password: '123456' })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.code, 200, '登录接口返回成功');
    const token = loginJson.data?.token;
    assert.ok(token, '登录成功获取有效 JWT Token');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    console.log('\n[步骤 2] 后端 API 接口链路生命周期分流深度验证...');

    // 2.1 滥用威胁 (risk)
    const riskRes = await fetch(`${BASE}/api/audit/list?warningType=risk`, { headers });
    const riskJson = await riskRes.json();
    assert.strictEqual(riskJson.code, 200, '滥用威胁接口响应 200');
    const riskList = riskJson.data?.list || [];
    console.log(`  - 滥用威胁返回记录数: ${riskList.length}, 指标 counts.threat: ${riskJson.data?.counts?.threat}`);
    assert.strictEqual(riskList.length, riskJson.data?.counts?.threat, '滥用威胁列表行数与指标一致');
    for (const r of riskList) {
      assert.ok(!['banned', 'unbanned', 'resolved', 'rejected', 'expired'].includes(r.status), 
        `滥用威胁中绝对不可包含已处理状态 [${r.status}]: ${r.email}`);
    }
    console.log('  ✓ 验证通过：滥用威胁中 100% 为活动待审威胁，零已处理/已过期记录！');

    // 2.2 申诉审计 (appeal)
    const appealRes = await fetch(`${BASE}/api/audit/list?warningType=appeal`, { headers });
    const appealJson = await appealRes.json();
    assert.strictEqual(appealJson.code, 200, '申诉审计接口响应 200');
    const appealList = appealJson.data?.list || [];
    console.log(`  - 申诉审计返回记录数: ${appealList.length}, 指标 counts.appeal: ${appealJson.data?.counts?.appeal}`);
    assert.strictEqual(appealList.length, appealJson.data?.counts?.appeal, '申诉审计列表行数与指标一致');
    for (const r of appealList) {
      assert.strictEqual(r.status, 'pending', `申诉审计中必须且仅为待复核状态 pending: ${r.email} (${r.status})`);
      assert.notStrictEqual(r.status, 'rejected', '已驳回申诉绝对不可出现在申诉审计待办中');
    }
    console.log('  ✓ 验证通过：申诉审计中 100% 为 pending 待复核工单，已驳回申诉已成功移出！');

    // 2.3 风险管理 (audit)
    const auditRes = await fetch(`${BASE}/api/audit/list?warningType=audit`, { headers });
    const auditJson = await auditRes.json();
    assert.strictEqual(auditJson.code, 200, '风险管理接口响应 200');
    const auditList = auditJson.data?.list || [];
    console.log(`  - 风险管理返回记录数: ${auditList.length}, 指标 counts.audit: ${auditJson.data?.counts?.audit}`);
    assert.strictEqual(auditList.length, auditJson.data?.counts?.audit, '风险管理列表行数与指标一致');
    for (const r of auditList) {
      assert.ok(['active', 'pending'].includes(r.status), `风险管理必须为 active/pending 状态: ${r.email} (${r.status})`);
      assert.notStrictEqual(r.status, 'expired', '已过期工单绝对不可出现在风险管理待办中');
      assert.notStrictEqual(r.status, 'resolved', '已结案工单绝对不可出现在风险管理待办中');
    }
    console.log('  ✓ 验证通过：风险管理中 100% 为 14 天审计期限内待审工单，零已结案/已过期工单！');

    // 2.4 操作记录 (ban / record)
    const recordRes = await fetch(`${BASE}/api/audit/list?warningType=ban`, { headers });
    const recordJson = await recordRes.json();
    assert.strictEqual(recordJson.code, 200, '操作记录接口响应 200');
    const recordList = recordJson.data?.list || [];
    console.log(`  - 操作记录返回全量归档数: ${recordList.length}, 指标 counts.record: ${recordJson.data?.counts?.record}`);
    assert.strictEqual(recordList.length, recordJson.data?.counts?.record, '操作记录列表行数与指标一致');
    
    // 检查是否包含已处理案件
    const statusesFound = new Set(recordList.map(r => r.status));
    console.log('  - 操作记录涵盖的状态集合:', [...statusesFound]);
    assert.ok(statusesFound.has('banned'), '操作记录必须包含已封禁记录 banned');
    assert.ok(statusesFound.has('unbanned'), '操作记录必须包含已解除记录 unbanned');
    assert.ok(statusesFound.has('rejected'), '操作记录必须包含已驳回记录 rejected');
    console.log('  ✓ 验证通过：操作记录完整汇聚封禁、解禁与驳回案件！');

    console.log('\n[步骤 3] 启动无头 Chromium 浏览器进行真实 UI 与交互链路验证...');
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

    console.log('\n[步骤 4] 打开安全审计控制台 /audit-report...');
    await page.goto(`${BASE}/audit-report`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // 4.1 验证 4 大 KPI 卡片数值
    console.log('\n[步骤 5] 核验 4 大治理板块 KPI 卡片统计值...');
    const threatCardVal = (await page.locator('.kpi-card.kpi-threat .stat-number').textContent()).trim();
    const appealCardVal = (await page.locator('.kpi-card.kpi-appeal .stat-number').textContent()).trim();
    const auditCardVal = (await page.locator('.kpi-card.kpi-audit .stat-number').textContent()).trim();
    const recordCardVal = (await page.locator('.kpi-card.kpi-record .stat-number').textContent()).trim();

    console.log(`  - 滥用威胁 KPI: ${threatCardVal}`);
    console.log(`  - 申诉审计 KPI: ${appealCardVal}`);
    console.log(`  - 风险管理 KPI: ${auditCardVal}`);
    console.log(`  - 操作记录 KPI: ${recordCardVal}`);

    assert.strictEqual(Number(threatCardVal), riskJson.data?.counts?.threat, '滥用威胁卡片数值与后端真实指标拉齐');
    assert.strictEqual(Number(appealCardVal), appealJson.data?.counts?.appeal, '申诉审计卡片数值与后端真实指标拉齐');
    assert.strictEqual(Number(auditCardVal), auditJson.data?.counts?.audit, '风险管理卡片数值与后端真实指标拉齐');
    assert.strictEqual(Number(recordCardVal), recordJson.data?.counts?.record, '操作记录卡片数值与后端真实指标拉齐');
    console.log('  ✓ 4 大 KPI 卡片数值与后端生命周期指标 100% 对齐！');

    // 4.2 验证各板块交互与纯净待处置表格
    console.log('\n[步骤 6] 逐一核验各板块切换与表格展示...');

    // A. 切换到「滥用威胁」
    console.log('  -> 切换至「滥用威胁」板块...');
    const [resThreat] = await Promise.all([
      page.waitForResponse(r => r.url().includes('warningType=risk')),
      page.locator('.kpi-card.kpi-threat').click()
    ]);
    assert.strictEqual(resThreat.status(), 200);
    await page.waitForTimeout(500);
    const threatRowCount = await page.locator('.table-area tbody tr').count();
    console.log(`    滥用威胁展示行数: ${threatRowCount}`);
    assert.strictEqual(threatRowCount, Number(threatCardVal), '滥用威胁表格展示行数与卡片数值 100% 绝对一致');

    // B. 切换到「申诉审计」
    console.log('  -> 切换至「申诉审计」板块...');
    const [resAppeal] = await Promise.all([
      page.waitForResponse(r => r.url().includes('warningType=appeal')),
      page.locator('.kpi-card.kpi-appeal').click()
    ]);
    assert.strictEqual(resAppeal.status(), 200);
    await page.waitForTimeout(500);
    const appealRowCount = await page.locator('.table-area tbody tr').count();
    console.log(`    申诉审计展示行数: ${appealRowCount}`);
    assert.strictEqual(appealRowCount, Number(appealCardVal), '申诉审计表格展示行数与卡片数值 100% 绝对一致');

    // C. 切换到「风险管理」
    console.log('  -> 切换至「风险管理」板块...');
    const [resAudit] = await Promise.all([
      page.waitForResponse(r => r.url().includes('warningType=audit')),
      page.locator('.kpi-card.kpi-audit').click()
    ]);
    assert.strictEqual(resAudit.status(), 200);
    await page.waitForTimeout(500);
    const auditRowCount = await page.locator('.table-area tbody tr').count();
    console.log(`    风险管理展示行数: ${auditRowCount}`);
    assert.strictEqual(auditRowCount, Number(auditCardVal), '风险管理表格展示行数与卡片数值 100% 绝对一致');

    // D. 切换到「操作记录」
    console.log('  -> 切换至「操作记录」板块...');
    const [resRecord] = await Promise.all([
      page.waitForResponse(r => r.url().includes('warningType=ban')),
      page.locator('.kpi-card.kpi-record').click()
    ]);
    assert.strictEqual(resRecord.status(), 200);
    await page.waitForTimeout(500);
    const recordRowCount = await page.locator('.table-area tbody tr').count();
    console.log(`    操作记录展示行数: ${recordRowCount}`);
    assert.strictEqual(recordRowCount, Number(recordCardVal), '操作记录表格展示行数与卡片数值 100% 绝对一致');

    // 核验操作记录中各行的状态显式与图标
    console.log('\n[步骤 7] 验证操作记录表格中归档案件的状态显式 (已封禁/已解除/已驳回)...');
    const recordRows = page.locator('.table-area tbody tr');
    const renderedStatuses = [];
    for (let i = 0; i < recordRowCount; i++) {
      const row = recordRows.nth(i);
      const statusText = (await row.locator('.status-clean-item .status-text-inline').textContent()).trim();
      const ticketText = (await row.locator('.ticket-id').textContent()).trim();
      renderedStatuses.push(statusText);
      console.log(`  - 行 ${i + 1} [${ticketText}]: 状态 = "${statusText}"`);
    }

    assert.ok(renderedStatuses.some(s => s.includes('封禁')), '表格中成功渲染已封禁案件');
    assert.ok(renderedStatuses.some(s => s.includes('解除')), '表格中成功渲染已解除案件');
    assert.ok(renderedStatuses.some(s => s.includes('驳回')), '表格中成功渲染已驳回案件');
    console.log('  ✓ 操作记录中所有最终归档状态标签完美渲染！');

    // 截屏留存
    console.log('\n[步骤 8] 保存公网全真栈操作记录全景现场截图...');
    await page.screenshot({ path: 'tests/verify_pipeline_segregation_live.png', fullPage: true });
    console.log('  ✓ 生产全真栈截图已成功保存至 tests/verify_pipeline_segregation_live.png');

    console.log('\n====================================================================');
    console.log('=== 公网生产环境端到端验证 100% 全部通过！无任何报错！ ===');
    console.log('====================================================================\n');

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

run().catch(err => {
  console.error('\n❌ 验证过程中发生异常:', err);
  process.exit(1);
});
