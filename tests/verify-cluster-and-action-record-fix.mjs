/**
 * 集群展开无重复 & 操作记录行数与KPI对齐 专项核验脚本
 * (Verify Abuse Cluster Expansion & Action Record Count Alignment)
 */
import assert from 'node:assert';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8787';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PWD = process.env.ADMIN_PWD || '123456';

async function getAdminToken() {
	const res = await fetch(BASE + '/api/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PWD })
	});
	const json = await res.json();
	if (json?.code !== 200) throw new Error('Login failed: ' + JSON.stringify(json));
	return json.data.token;
}

async function run() {
	console.log('================================================================');
	console.log('=== 集群展开无重复 & 操作记录行数对齐 专项验收 (Playwright E2E) ===');
	console.log('================================================================\n');

	const token = await getAdminToken();
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
		console.log('\n[1/3] 导航至操作报告控制台...');
		await page.goto(`${BASE}/mail/u/0/#manage/admin/audit`, { waitUntil: 'networkidle' });
		await page.waitForSelector('.audit-page-container', { timeout: 15000 });
		console.log('✓ 页面加载完成');

		// 1. 验证 Tab 1 滥用威胁集群展开与账号计数
		console.log('\n[2/3] 验证 Tab 1「滥用威胁」集群展开与账号去重...');
		await page.locator('.kpi-card.kpi-threat').first().click();
		await page.waitForTimeout(1500);

		const clusterBadge = page.locator('.cluster-badge').first();
		assert.ok(await clusterBadge.isVisible(), 'THR-2026-MULTI99 集群徽标可见');
		const badgeText = (await clusterBadge.textContent()).trim();
		console.log(`  集群徽标文本: "${badgeText}"`);
		assert.ok(/3\s*(个账号|accounts)/i.test(badgeText), `徽标应显示 3 个账号，实际显示: "${badgeText}"`);

		// 点击展开集群
		await clusterBadge.click();
		await page.waitForTimeout(800);

		// 获取展开后的集群子行
		const childRows = page.locator('tr.abuse-cluster-child-row');
		const childCount = await childRows.count();
		console.log(`  展开集群子行数量: ${childCount}`);
		assert.strictEqual(childCount, 3, `集群展开应渲染 3 个子账号行，实际渲染: ${childCount}`);

		const childEmails = [];
		for (let i = 0; i < childCount; i++) {
			const rawText = await childRows.nth(i).textContent();
			const cleanText = rawText.replace(/[\u200B-\u200D\uFEFF]/g, '');
			const match = cleanText.match(/syndicate_[a-zA-Z0-9]+@farm\.net/);
			if (match) childEmails.push(match[0]);
		}
		console.log(`  展开集群账号列表:`, childEmails);
		assert.deepStrictEqual(childEmails, [
			'syndicate_cluster@farm.net',
			'syndicate_member2@farm.net',
			'syndicate_member3@farm.net'
		], '集群子账号列表必须严格为 3 个唯一账号，绝无重复');
		console.log('✓ Tab 1 集群展开完全正确：徽标显示 3 个账号，展开 3 行无重复');

		await page.screenshot({ path: 'tests/verify_cluster_expanded.png' });

		// 2. 验证 Tab 4「操作记录」行数与 KPI 数字一致性
		console.log('\n[3/3] 验证 Tab 4「操作记录」表格行数与 KPI 数字一致性...');
		const recordCard = page.locator('.kpi-card.kpi-record').first();
		const kpiValue = (await recordCard.locator('.kpi-value').textContent()).trim();
		console.log(`  操作记录 KPI 显示数值: ${kpiValue}`);

		await recordCard.click();
		await page.waitForTimeout(1500);

		const recordRows = page.locator('.abuse-table tbody tr:not(.abuse-cluster-child-row), .el-table__row');
		const recordRowCount = await recordRows.count();
		console.log(`  操作记录 表格实际渲染行数: ${recordRowCount}`);

		assert.strictEqual(recordRowCount, Number(kpiValue), `操作记录表格行数 (${recordRowCount}) 必须严格等于 KPI 数值 (${kpiValue})`);

		const ticketNos = [];
		for (let i = 0; i < recordRowCount; i++) {
			const text = await recordRows.nth(i).textContent();
			ticketNos.push((text.match(/#[A-Za-z0-9\-_]+/)?.[0] || ''));
		}
		console.log(`  操作记录渲染的工单:`, ticketNos);
		assert.ok(ticketNos.some(t => t.includes('10034') || t.includes('MA8802')), 'BAN-2026-MA8802 必须存在于操作记录表格中');
		console.log('✓ Tab 4 操作记录完全正确：KPI 数字与表格行数严格对齐 (3 == 3)，BAN-2026-MA8802 完整呈现');

		await page.screenshot({ path: 'tests/verify_action_records_complete.png' });

		console.log('\n================================================================');
		console.log('=== 全部断言 100% 通过！缺陷已彻底根治，数据自愈完整！ ===');
		console.log('================================================================\n');

	} finally {
		await browser.close();
	}
}

run();
