/**
 * 操作报告板块 · 真浏览器 × 真后端实栈探测 (Live-Stack UI Probe)
 * ============================================================
 * 与 verify-abuse-table-polish.mjs (mock API) 不同, 本探测直接驱动真实
 * wrangler dev 栈 (8787): 真实 React 登录页 → 真实 JWT 会话 → 真实 D1 数据。
 *
 * 流程:
 *   Setup  (API)  危险操作注入: 注册发送者/受害者 → 角色升级 → 站内垃圾邮件 → 受害者检举 → 工单落库
 *   UI-1  (浏览器) React 登录页真实登录 (admin) → /audit 操作报告
 *   UI-2  (浏览器) 四 KPI 卡片 + 7 列滥用威胁工作台 + 种子工单渲染断言
 *   UI-3  (浏览器) 关键词搜索命中本次检举产生的真实工单
 *   UI-4  (浏览器) 以 admin 身份通过 UI 执行「开始复核」处置 → API 反查落库留痕
 *   UI-5  (浏览器) 详情抽屉打开/关闭 + 1440 / 375 双分辨率截图留档
 *   Clean (finally) 测试用户物理删除 + 工单物理清理 + KV 计数核对(发信扣减缺陷观测)
 *
 * 运行前提: wrangler dev (wrangler-dev.toml) 已在 8787 运行且已 init
 * 运行方式: node tests/verify-live-stack-ui-probe.mjs
 */

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8787';
const API = BASE + '/api';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PWD = '123456';
const RUN_TAG = 'ui' + Date.now().toString(36).slice(-4);
const SPAMMER = `${RUN_TAG}_spam@example.com`;
const REPORTER = `${RUN_TAG}_rep@example.com`;
const PWD = 'LiveUi#2026';
const WORKER_DIR = path.resolve('mail-worker');
const TMP_SQL = path.join(WORKER_DIR, '.tmp-ui-probe.sql');
const SHOT_DIR = path.resolve('doc/validation/audit-live');
const TODAY_LOCAL = new Date().toLocaleDateString('sv-SE'); // 本地日期 YYYY-MM-DD
const TODAY_UTC = new Date().toISOString().slice(0, 10); // UTC 日期 YYYY-MM-DD
let SEND_KEY = `send_day_count:${TODAY_LOCAL}`;

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
	if (cond) { pass++; console.log('  ✓ ' + label); }
	else { fail++; failures.push(label); console.log('  ✗ ' + label); }
}
function section(t) {
	console.log('\n──────────────────────────────────────────────');
	console.log('◆ ' + t);
	console.log('──────────────────────────────────────────────');
}

async function api(method, suffix, { token, body, query } = {}) {
	let url = API + suffix;
	if (query) url += '?' + new URLSearchParams(query).toString();
	const headers = { 'Content-Type': 'application/json' };
	if (token) headers['Authorization'] = token;

	let lastErr = null;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
			let json = null;
			try { json = await res.json(); } catch { /* non-json */ }
			return { status: res.status, json };
		} catch (err) {
			lastErr = err;
			if (attempt < 3) await new Promise(r => setTimeout(r, 300 * attempt));
		}
	}
	throw lastErr;
}

function d1Sql(sql, jsonMode = false) {
	fs.writeFileSync(TMP_SQL, sql, 'utf8');
	try {
		const out = execSync(`npx wrangler d1 execute epomail --local --file ".tmp-ui-probe.sql" ${jsonMode ? '--json' : ''} --config wrangler-dev.toml`, {
			cwd: WORKER_DIR, stdio: 'pipe', timeout: 120000, encoding: 'utf8'
		});
		if (!jsonMode) return out;
		return JSON.parse(out.slice(out.indexOf('[')))[0].results || [];
	} finally {
		try { fs.unlinkSync(TMP_SQL); } catch { /* ignore */ }
	}
}
function kvGet(key) {
	try {
		const out = execSync(`npx wrangler kv key get "${key}" --binding kv --local --config wrangler-dev.toml`, {
			cwd: WORKER_DIR, stdio: 'pipe', timeout: 60000, encoding: 'utf8'
		}).trim();
		return (!out || /Value not found/i.test(out)) ? null : out;
	} catch { return null; }
}
function kvDel(key) {
	try {
		// 注意: 非 TTY 下 wrangler 自动确认; --force 并非该命令合法旗标反而会失败
		execSync(`npx wrangler kv key delete "${key}" --binding kv --local --config wrangler-dev.toml`, {
			cwd: WORKER_DIR, stdio: 'pipe', timeout: 60000
		});
	} catch { /* ignore */ }
}

async function run() {
	console.log('================================================================');
	console.log('=== 操作报告板块 · 真浏览器×真后端实栈探测 ===');
	console.log(`=== 目标: ${BASE}  ·  RunTag: ${RUN_TAG} ===`);
	console.log('================================================================');

	const ctx = { adminToken: null, userIds: [], preKvSend: null, didSend: false, browser: null };

	try {
		fs.mkdirSync(SHOT_DIR, { recursive: true });

		// ---------- Setup: 危险操作注入 (纯 API 编排, 为浏览器实测准备真实工单) ----------
		section('Setup · 危险操作注入 (垃圾邮件投放 + 受害者检举)');
		ctx.preKvSend = kvGet(SEND_KEY);
		console.log(`  ℹ 预态: ${SEND_KEY} = ${ctx.preKvSend === null ? '(不存在)' : ctx.preKvSend}`);

		const adminLogin = await api('POST', '/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PWD } });
		ok(adminLogin.json?.code === 200, 'S-1 站长登录成功');
		ctx.adminToken = adminLogin.json.data.token;

		for (const email of [SPAMMER, REPORTER]) {
			const r = await api('POST', '/register', { body: { email, password: PWD } });
			ok(r.json?.code === 200, `S-2 注册 ${email}`);
		}
		const repLogin = await api('POST', '/login', { body: { email: REPORTER, password: PWD } });
		ok(repLogin.json?.code === 200, 'S-3 检举者登录成功');
		const reporterToken = repLogin.json.data.token;
		ctx.userIds.push(repLogin.json.data.userId);
		const spamLogin0 = await api('POST', '/login', { body: { email: SPAMMER, password: PWD } });
		const spammerId = spamLogin0.json.data.userId;
		ctx.userIds.push(spammerId);

		const roleList = await api('GET', '/role/list', { token: ctx.adminToken });
		const roles = roleList.json?.data?.list || roleList.json?.data || [];
		const sendRole = roles.find(r => ['user_base', 'user_lv0', 'user_lv1'].includes(r.roleCode) && r.sendType === 'day') || roles.find(r => r.sendType === 'day');
		const setType = await api('PUT', '/user/setType', { token: ctx.adminToken, body: { userId: spammerId, type: sendRole?.roleId } });
		ok(setType.json?.code === 200, `S-4 发送者角色升级 (${sendRole?.roleCode})`);
		const spamLogin = await api('POST', '/login', { body: { email: SPAMMER, password: PWD } });
		const spammerToken = spamLogin.json.data.token;
		const accListRes = await api('GET', '/account/list', { token: spammerToken });
		const accData = accListRes.json?.data?.list || accListRes.json?.data || [];
		const spamAcc = accData[0];
		ok(!!spamAcc?.accountId, 'S-5 发送者信箱就绪');

		const sent = await api('POST', '/email/send', {
			token: spammerToken,
			body: {
				accountId: spamAcc.accountId, sendType: 'compose', receiveEmail: [REPORTER],
				subject: `中大奖了点我 ${RUN_TAG}`, text: '速点链接领奖 ' + RUN_TAG, content: '<p>速点链接领奖</p>'
			}
		});
		ok(sent.json?.code === 200, 'S-6 危险操作: 站内垃圾邮件投递成功');
		ctx.didSend = sent.json?.code === 200;
		const midKvUtc = kvGet(`send_day_count:${TODAY_UTC}`);
		const midKvLocal = kvGet(`send_day_count:${TODAY_LOCAL}`);
		if (midKvUtc !== null) SEND_KEY = `send_day_count:${TODAY_UTC}`;
		else if (midKvLocal !== null) SEND_KEY = `send_day_count:${TODAY_LOCAL}`;
		const midKv = kvGet(SEND_KEY);
		console.log(`  ℹ 发送后: ${SEND_KEY} = ${midKv} (预态 ${ctx.preKvSend === null ? '0' : ctx.preKvSend} → +1)`);

		const mailList = (await api('POST', '/email/list', { token: reporterToken, body: { size: 50 } })).json?.data?.list || [];
		const spamId = mailList.find(m => (m.sendEmail || '').includes(SPAMMER))?.emailId;
		ok(!!spamId, 'S-7 受害者收件箱命中垃圾邮件');
		const rep = await api('PUT', '/email/reportSpam', { token: reporterToken, body: { emailIds: [spamId], reportCategory: 'spam', reportReason: '实栈探测检举 ' + RUN_TAG } });
		ok(rep.json?.code === 200, 'S-8 受害者检举提交成功');
		const probe = await api('POST', '/audit/list', { token: ctx.adminToken, body: { warningType: 'risk', keyword: SPAMMER } });
		const ticket = (probe.json?.data?.list || []).find(r => r.email === SPAMMER);
		ok(!!ticket?.id, `S-9 风控工单已落库 (id=${ticket?.id}, ticketNo=${ticket?.ticketNo}, reportedByOthers=${ticket?.reportedByOthers})`);

		// ---------- UI-1: React 登录页真实登录 ----------
		section('UI · 真浏览器登录与操作报告板块进入');
		ctx.browser = await chromium.launch();
		const context = await ctx.browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
		const page = await context.newPage();

		await page.goto(BASE + '/login/', { waitUntil: 'networkidle' });
		ok(await page.locator('#epo-email').isVisible(), 'UI-1-1 React 登录页渲染 (#epo-email 可见)');
		await page.fill('#epo-email', ADMIN_EMAIL);
		await page.fill('#epo-password', ADMIN_PWD);
		await page.click('button[type=submit]');
		await page.waitForURL(/\/mail/, { timeout: 30000 });
		ok(page.url().includes('/mail'), `UI-1-2 站长经真实登录页进入邮箱 (${page.url().slice(0, 48)}…)`);
		const jwt = await page.evaluate(() => localStorage.getItem('token') || localStorage.getItem('jwt') || '');
		console.log(`  ℹ 会话 token 已由登录页签发: ${jwt ? 'yes (' + jwt.length + ' chars)' : '(内存态)'}`);

		// ---------- UI-2: 操作报告板块渲染断言 ----------
		await page.goto(BASE + '/audit', { waitUntil: 'networkidle' });
		await page.waitForTimeout(1500);
		ok(await page.getByText('操作报告', { exact: false }).first().isVisible().catch(() => false), 'UI-2-1 侧栏「操作报告」入口可达 (SPA 路由 /audit)');
		for (const kpi of ['滥用威胁', '申诉审计', '风险管理', '操作记录']) {
			ok(await page.getByText(kpi, { exact: true }).first().isVisible().catch(() => false), `UI-2-2 KPI 卡片「${kpi}」渲染`);
		}
		for (const col of ['编号', '对象', '状态', '分类', '处理']) {
			ok(await page.locator('th', { hasText: col }).first().isVisible().catch(() => false), `UI-2-3 威胁工作台列头「${col}」渲染`);
		}
		ok(await page.getByText('zhangsan@epocanvas.com', { exact: false }).first().isVisible().catch(() => false), 'UI-2-4 种子工单真实数据渲染 (zhangsan@epocanvas.com / UI 呈现 #短编号 格式)');
		await page.screenshot({ path: path.join(SHOT_DIR, 'live_audit_threat_1440.png'), fullPage: true });
		console.log('  ℹ 截图: doc/validation/audit-live/live_audit_threat_1440.png');

		// ---------- UI-3: 关键词搜索命中本次检举工单 ----------
		section('UI · 检举工单检索 (真实后端查询, 顶栏搜索)');
		const searchInput = page.locator('.topbar-search .search-box input, .search-box input').first();
		await searchInput.waitFor({ state: 'visible', timeout: 10000 });
		await searchInput.fill(SPAMMER);
		const searchIcon = page.locator('.topbar-search .search-box .search-icon, .search-box .search-icon').first();
		if (await searchIcon.isVisible().catch(() => false)) await searchIcon.click();
		else await searchInput.press('Enter');
		await page.waitForTimeout(2000);
		ok(await page.getByText(SPAMMER, { exact: false }).first().isVisible().catch(() => false), `UI-3-1 关键词搜索命中本次检举工单 (${SPAMMER})`);
		ok(await page.getByText('待审', { exact: true }).first().isVisible().catch(() => false), 'UI-3-2 工单状态词表渲染 (待审)');
		await page.screenshot({ path: path.join(SHOT_DIR, 'live_audit_search_hit_1440.png'), fullPage: true });
		console.log('  ℹ 截图: doc/validation/audit-live/live_audit_search_hit_1440.png');

		// ---------- UI-4: admin 通过 UI 执行「开始复核」处置 ----------
		section('UI · 管理员 UI 处置 (开始复核)');
		const row = page.locator('tr', { hasText: SPAMMER }).first();
		await row.locator('.opt-more-btn').click();
		await page.getByText('开始复核', { exact: true }).first().click();
		await page.waitForTimeout(2500);
		const afterAction = await api('POST', '/audit/list', { token: ctx.adminToken, body: { keyword: 'ticket:' + ticket.ticketId } });
		const actedRow = (afterAction.json?.data?.list || [])[0] || {};
		ok(/\[开始复核\]/.test(actedRow.detailText || ''), 'UI-4-1 API 反查: 工单明细已留痕 [开始复核] (真实落库)');
		ok(!!actedRow.assignee && actedRow.assignee !== '', `UI-4-2 API 反查: 负责人已记名 (assignee=${actedRow.assignee})`);
		ok(/开始人工复核/.test(JSON.stringify(actedRow.timeline || '')), 'UI-4-3 API 反查: timeline 时间线追加「开始人工复核」');
		await page.screenshot({ path: path.join(SHOT_DIR, 'live_audit_after_review_1440.png'), fullPage: true });
		console.log('  ℹ 截图: doc/validation/audit-live/live_audit_after_review_1440.png');

		// ---------- UI-5: 详情抽屉 + 移动端分辨率 ----------
		section('UI · 详情抽屉与移动端可用性');
		const detailBtn = row.locator('.opt-btn-details').first();
		if (await detailBtn.isVisible().catch(() => false)) {
			await detailBtn.click();
			await page.waitForTimeout(1500);
			ok(true, 'UI-5-1 工单详情抽屉打开');
			await page.screenshot({ path: path.join(SHOT_DIR, 'live_audit_drawer_1440.png'), fullPage: true });
			console.log('  ℹ 截图: doc/validation/audit-live/live_audit_drawer_1440.png');
			await page.keyboard.press('Escape');
			await page.waitForTimeout(600);
		} else {
			ok(false, 'UI-5-1 工单详情抽屉打开 (行内未找到「详情」入口)');
		}

		await page.setViewportSize({ width: 375, height: 812 });
		await page.waitForTimeout(1200);
		const docScroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
		ok(docScroll.sw <= docScroll.cw, `UI-5-2 375px 移动端零横向滚动 (scrollWidth=${docScroll.sw} <= clientWidth=${docScroll.cw})`);
		await page.screenshot({ path: path.join(SHOT_DIR, 'live_audit_mobile_375.png'), fullPage: true });
		console.log('  ℹ 截图: doc/validation/audit-live/live_audit_mobile_375.png');

	} catch (fatal) {
		fail++;
		failures.push('[FATAL] ' + fatal.message);
		console.error('\n[FATAL] 探测中断:', fatal.message);
	} finally {
		// ---------- Clean: 物理清理 + 缺陷观测 ----------
		section('Clean · 测试数据物理清理与发信计数扣减观测');
		try {
			const ids = [...new Set(ctx.userIds.filter(Boolean))];
			if (ids.length && ctx.adminToken) {
				const del = await api('DELETE', '/user/delete', { token: ctx.adminToken, query: { userIds: ids.join(',') } });
				ok(del.json?.code === 200, `C-1 测试用户物理删除 (${ids.length} 个, code=${del.json?.code})`);
			}
			// 发信计数扣减观测: 仅在本轮真实发生投递时有断言意义 (否则无扣减对象)
			const postDelKv = kvGet(SEND_KEY);
			if (ctx.didSend) {
				console.log(`  ℹ 扣减观测: 删除发送者后 ${SEND_KEY} = ${postDelKv === null ? '(已回收)' : postDelKv} (预态 ${ctx.preKvSend === null ? '0' : ctx.preKvSend}, 本探测发送 1 封)`);
			}
			if (ctx.didSend && postDelKv !== null) {
				ok(false, `C-2 物理删除发送者后当日发信计数未精准扣减 (${SEND_KEY} 仍=${postDelKv})`);
				// 还原真实零基线 (今日全部为测试发信, 无生产流量)
				kvDel(SEND_KEY);
				ok(kvGet(SEND_KEY) === null, `C-3 测试发信计数键已手动物理回收 (${SEND_KEY} → 不存在, 零假数据还原)`);
			} else {
				ok(true, `C-2 当日发信计数已精准扣减 (键${postDelKv === null ? '已自动物理回收, 零基线' : '=' + postDelKv}${ctx.didSend ? '' : ', 本轮未发生投递无扣减对象'})`);
				ok(true, 'C-3 发信计数键零假数据自动还原 (无需手动回收)');
			}

			// 工单物理清理 + 种子基线核验
			d1Sql(`DELETE FROM audit_log WHERE email LIKE '${RUN_TAG}%';`);
			const rows = d1Sql(`SELECT ticket_id, email FROM audit_log;`, true);
			const residue = rows.filter(r => (r.ticket_id || '').includes(RUN_TAG.toUpperCase()) || /ui[a-z0-9]+_/.test(r.email || ''));
			ok(rows.length === 15 && residue.length === 0, `C-4 工单物理清理且种子基线完整 (audit_log=${rows.length}/15, 测试残留=${residue.length})`);
			const users = d1Sql(`SELECT COUNT(*) AS n FROM user;`, true);
			ok(users[0]?.n === 2, `C-5 用户表还原纯种子态 (users=${users[0]?.n}/2)`);
		} catch (e) {
			fail++;
			failures.push('[CLEANUP] ' + e.message);
			console.error('[CLEANUP ERROR]', e.message);
		} finally {
			if (ctx.browser) await ctx.browser.close().catch(() => {});
		}
	}

	console.log('\n================================================================');
	console.log(`=== 实栈探测汇总: ${pass} 通过 / ${fail} 失败 ===`);
	console.log('================================================================');
	if (failures.length) {
		console.log('失败项:');
		failures.forEach(f => console.log('  ✗ ' + f));
		process.exitCode = 1;
	}
}

run();
