/**
 * 操作报告板块 浏览器 UI 全真栈实测 (Audit Report Console - Browser E2E)
 * ============================================================
 * 以真实 admin token 访问本地全真栈 (wrangler dev @8787) 的「操作报告」管理板块：
 *   U1  管理控制台路由可达 (#/manage/admin/audit)
 *   U2  KPI 汇报卡片渲染 (威胁/申诉/审查/封禁)
 *   U3  工单表格渲染 (种子基线工单可见, 工单编号/邮箱/等级呈现)
 *   U4  关键词搜索联动 (ticket: 定向搜索)
 *   U5  板块切换联动 (KPI 卡片点击 → 异常威胁/争议申诉列表切换)
 *   U6  申诉研判抽屉可用 (环境比对: 注册基线 vs 申诉设备, 处置按钮就绪)
 *   U7  页面截图留档 (主控台 + 研判抽屉)
 *
 * 只读测试: 不点击任何处置按钮, 不改动数据库。
 * 运行前提: wrangler dev (wrangler-dev.toml) @8787 已启动且已 /api/init
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8787';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PWD = '123456';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
	if (cond) { pass++; console.log('  ✓ ' + label); }
	else { fail++; failures.push(label); console.log('  ✗ ' + label); }
}
function section(title) {
	console.log('\n──────────────────────────────────────────────');
	console.log('◆ ' + title);
	console.log('──────────────────────────────────────────────');
}

async function getAdminToken() {
	const res = await fetch(BASE + '/api/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PWD })
	});
	const json = await res.json();
	if (json?.code !== 200) throw new Error('admin login failed: ' + JSON.stringify(json));
	return json.data.token;
}

async function run() {
	console.log('================================================================');
	console.log('=== 操作报告板块 浏览器 UI 全真栈实测 (Browser E2E) ===');
	console.log(`=== 目标: ${BASE} ===`);
	console.log('================================================================');

	const token = await getAdminToken();
	console.log('  ℹ admin token 获取成功');

	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		locale: 'zh-CN'
	});
	// 注入真实 admin token (与前端 epo_sessions 会话结构一致)
	await context.addInitScript(({ t, email }) => {
		localStorage.setItem('token', t);
		localStorage.setItem('epo_sessions', JSON.stringify([{ u: 0, token: t, email }]));
	}, { t: token, email: ADMIN_EMAIL });

	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
	// 捕获 /audit/list 响应用于断言 (表格可能截断长邮箱, DOM 文本不可靠)
	let lastAuditJson = null;
	page.on('response', async (res) => {
		if (res.url().includes('/api/audit/list')) {
			try { lastAuditJson = await res.json(); } catch { /* ignore */ }
		}
	});

	try {
		section('U1 · 管理控制台路由可达');
		await page.goto(`${BASE}/mail/u/0/#manage/admin/audit`, { waitUntil: 'domcontentloaded', timeout: 30000 });
		await page.waitForSelector('.audit-page-container, .audit-workbench', { timeout: 30000 });
		ok(true, 'U1-1 操作报告工作台成功加载 (#/manage/admin/audit)');
		const bodyText = await page.textContent('body');
		ok(/操作报告|風控|审计|審計/.test(bodyText), 'U1-2 页面呈现操作报告标题文案');

		section('U2 · KPI 汇报卡片渲染');
		const kpiCount = await page.locator('.kpi-card').count();
		ok(kpiCount >= 4, `U2-1 KPI 卡片渲染齐备 (${kpiCount} 张 ≥ 4)`);
		const kpiTitles = (await page.locator('.kpi-title').allTextContents()).join(' | ');
		ok(/滥用威胁/.test(kpiTitles) && /申诉审计/.test(kpiTitles) && /风险管理/.test(kpiTitles) && /操作记录/.test(kpiTitles), `U2-2 四大板块 KPI 标题齐备 (${kpiTitles})`);

		section('U3 · 工单表格渲染');
		await page.waitForSelector('.audit-box table tbody tr, .risk-data-table tbody tr, .el-table__row', { timeout: 20000 });
		const rowCount = await page.locator('.el-table__row').count();
		ok(rowCount > 0, `U3-1 工单表格渲染 (${rowCount} 行)`);
		const tableText = await page.locator('.el-table__row').first().textContent();
		ok(/#[A-Z0-9]{4,7}/.test(tableText || ''), 'U3-2 工单编号呈现 (#XXXX 格式)');
		ok(lastAuditJson?.data?.counts?.categories, `U3-3 前端真实加载 /audit/list 并取得四板块计数 (audit=${lastAuditJson?.data?.counts?.categories?.audit?.total}, risk=${lastAuditJson?.data?.counts?.categories?.risk?.total})`);

		section('U4 · 关键词搜索联动 (顶栏检索 → manage-audit-search 事件)');
		lastAuditJson = null;
		const searchInput = page.locator('.search-box input, header input[type="text"], input[placeholder*="工单"], input[placeholder*="搜索"]').first();
		await searchInput.fill('ticket:THR-2026-REP012');
		await searchInput.press('Enter');
		await page.waitForTimeout(2500);
		const hitRow = lastAuditJson?.data?.list?.find(r => r.email === 'phishing_scam@external-fake.xyz');
		ok(!!hitRow && hitRow.warningType === 'risk', 'U4-1 ticket: 定向搜索命中种子威胁工单 (12 人检举诈骗, API 响应核验)');
		ok((lastAuditJson?.data?.list || []).length >= 1 && (lastAuditJson?.data?.list || []).every(r => r.ticketId === 'THR-2026-REP012'), `U4-2 搜索结果精确过滤 (${lastAuditJson?.data?.list?.length} 行全部命中该工单)`);
		lastAuditJson = null;
		await searchInput.fill('');
		await searchInput.press('Enter');
		await page.waitForTimeout(2000);

		section('U5 · 板块切换联动 (KPI 卡片过滤)');
		await page.locator('.kpi-card.kpi-appeal').first().click();
		await page.waitForTimeout(1500);
		const appealJson = lastAuditJson;
		ok((appealJson?.data?.list || []).length > 0 && (appealJson?.data?.list || []).every(r => r.warningType === 'appeal'), `U5-1 争议申诉板块切换成功 (${appealJson?.data?.list?.length} 条全部为申诉工单)`);
		lastAuditJson = null;
		await page.locator('.kpi-card.kpi-record').first().click();
		await page.waitForTimeout(1500);
		const recordJson = lastAuditJson;
		ok((recordJson?.data?.list || []).length > 0 && (recordJson?.data?.list || []).every(r => r.warningType === 'ban' || ['banned', 'unbanned'].includes(r.status)), `U5-2 操作记录(封禁管控)板块切换成功 (${recordJson?.data?.list?.length} 条封禁/解禁台账)`);
		lastAuditJson = null;
		await page.locator('.kpi-card.kpi-threat').first().click();
		await page.waitForTimeout(1500);
		const threatJson = lastAuditJson;
		// 滥用威胁卡片设计语义: riskLevel=high + warningType=all (跨板块聚合 LV3+ 威胁账户)
		ok((threatJson?.data?.list || []).length > 0 && (threatJson?.data?.list || []).every(r => r.riskLevel === 'high'), `U5-3 滥用威胁板块切换成功 (${threatJson?.data?.list?.length} 条全部为高风险 LV3+ 工单)`);

		section('U6 · 申诉研判抽屉可用性');
		await page.locator('.kpi-card.kpi-appeal').first().click();
		await page.waitForTimeout(1500);
		// 打开第一条申诉工单的研判抽屉 (按钮文案: 研判放行 / 详情)
		const inspectBtn = page.locator('.el-table__row').first().locator('button').filter({ hasText: /研判|详情|放行/ }).first();
		if (await inspectBtn.count() > 0) {
			await inspectBtn.click();
		} else {
			await page.locator('.el-table__row').first().locator('button').nth(0).click();
		}
		await page.waitForSelector('.audit-drawer-container', { timeout: 15000 });
		ok(true, 'U6-1 申诉研判抽屉成功打开');
		const drawerText = await page.locator('.audit-drawer-container').textContent();
		ok(/注册|基准|Baseline|基线/.test(drawerText || ''), 'U6-2 环境比对呈现注册基线区块');
		ok(/申诉|设备|指纹|IP/i.test(drawerText || ''), 'U6-3 环境比对呈现申诉设备/指纹区块');
		const drawerButtons = (await page.locator('.audit-drawer-container button').allTextContents()).join(' | ');
		ok(/放行|驳回|封禁/.test(drawerButtons || ''), `U6-4 处置按钮就绪 (${drawerButtons.slice(0, 80)}…)`);
		await page.screenshot({ path: 'tests/verify_audit_ui_console.png', fullPage: false });
		// 回到主视图截图 (抽屉关闭)
		await page.locator('.audit-drawer-container button').filter({ hasText: /关闭|Close/ }).first().click().catch(() => {});
		await page.waitForTimeout(800);
		await page.screenshot({ path: 'tests/verify_audit_ui_drawer.png', fullPage: false });
		ok(true, 'U7 截图留档完成 (verify_audit_ui_console.png / verify_audit_ui_drawer.png)');

		// 前端运行时错误检查
		const realErrors = errors.filter(e => !/ResizeObserver|favicon/.test(e));
		ok(realErrors.length === 0, `U8-1 无前端运行时异常 (${realErrors.length} 个)` + (realErrors[0] ? ` → ${realErrors[0].slice(0, 80)}` : ''));

	} catch (fatal) {
		fail++;
		failures.push('[FATAL] ' + fatal.message);
		console.error('\n[FATAL] UI 测试中断:', fatal.message);
		try { await page.screenshot({ path: 'tests/verify_audit_ui_error.png' }); } catch { /* ignore */ }
	} finally {
		await browser.close();
	}

	console.log('\n================================================================');
	console.log(`=== UI 测试汇总: ${pass} 通过 / ${fail} 失败 ===`);
	console.log('================================================================');
	if (failures.length > 0) {
		console.log('失败项:');
		failures.forEach(f => console.log('  ✗ ' + f));
		process.exitCode = 1;
	}
}

run();
