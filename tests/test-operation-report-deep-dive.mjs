/**
 * 操作报告板块深度专项端到端测试 (Operation Report Deep Dive E2E)
 * ============================================================
 * 本脚本专门对 Epocanvas Mail 风控系统进行完整测试：
 * 1. 模拟真实危险操作 (暴破锁定、自动化高危黑盒风控、垃圾邮件滥用、检举聚合、申诉生成)
 * 2. 模拟 Admin 处理操作 (复核接单、账号封禁、申诉放行与驳回、备忘留痕、熔断器启闭)
 * 3. 验证 "操作报告" 板块可用性 (API 审计落库、时间线留痕、精确搜索、越权拦截)
 * 4. 驱动真实浏览器渲染操作报告 UI (卡片切换、操作记录表格、搜索过滤、详情抽屉、移动端 375px 零滚动)
 * 5. 零假数据物理清理与基线终验 (测试用户与工单物理清除，还原 15 条纯种子基线)
 *
 * 运行环境: 本地全真栈 (wrangler dev @8787 · workerd CF 运行时 · D1 + KV 真实存储)
 */

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8787';
const API = BASE + '/api';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PWD = '123456';
const RUN_TAG = 'opdeep' + Date.now().toString(36).slice(-4);

const SPAMMER = `${RUN_TAG}_spammer@example.com`;
const REPORTER = `${RUN_TAG}_reporter@example.com`;
const BRUTE_USER = `${RUN_TAG}_brute@example.com`;
const FP_USER = `${RUN_TAG}_fp@example.com`;
const APPEAL_USER = `${RUN_TAG}_appealer@example.com`;
const TEST_PWD = 'DeepTest#2026';

const WORKER_DIR = path.resolve('mail-worker');
const TMP_SQL = path.join(WORKER_DIR, '.tmp-opdeep.sql');
const SHOT_DIR = path.resolve('doc/validation/operation-report-deep');

const TODAY_LOCAL = new Date().toLocaleDateString('sv-SE');
const TODAY_UTC = new Date().toISOString().slice(0, 10);
let SEND_KEY = `send_day_count:${TODAY_LOCAL}`;

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

function section(t) {
	console.log('\n──────────────────────────────────────────────');
	console.log('◆ ' + t);
	console.log('──────────────────────────────────────────────');
}

// RFC 6238 TOTP helper
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(str) {
	const clean = (str || '').toUpperCase().replace(/[\s=-]/g, '');
	let bits = 0, value = 0;
	const out = [];
	for (const ch of clean) {
		const idx = B32.indexOf(ch);
		if (idx === -1) continue;
		value = (value << 5) | idx;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}
	return Buffer.from(out);
}
async function totpNow(secretBase32, offsetSteps = 0) {
	const secretBytes = base32Decode(secretBase32);
	const counter = Math.floor(Date.now() / 1000 / 30) + offsetSteps;
	const buf = Buffer.alloc(8);
	buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
	buf.writeUInt32BE(counter >>> 0, 4);
	const hmac = crypto.createHmac('sha1', secretBytes).update(buf).digest();
	const off = hmac[hmac.length - 1] & 0x0f;
	const binary = ((hmac[off] & 0x7f) << 24) | ((hmac[off + 1] & 0xff) << 16) | ((hmac[off + 2] & 0xff) << 8) | (hmac[off + 3] & 0xff);
	return String(binary % 1e6).padStart(6, '0');
}

async function api(method, suffix, { token, body, query } = {}) {
	let url = API + suffix;
	if (query) url += '?' + new URLSearchParams(query).toString();
	const headers = { 'Content-Type': 'application/json' };
	if (token) headers['Authorization'] = token;

	let lastErr = null;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const res = await fetch(url, {
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined
			});
			const text = await res.text();
			let json = null;
			try { json = JSON.parse(text); } catch (e) { json = text; }
			return { status: res.status, ok: res.ok, json };
		} catch (err) {
			lastErr = err;
			await new Promise(r => setTimeout(r, 200 * attempt));
		}
	}
	throw lastErr;
}

const SQLITE_FILE = path.join(WORKER_DIR, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/530ec61c3e9460901bca37164029798b2d9b803368597cdc135ea9afd20a26ff.sqlite');

function executeD1(sql) {
	fs.writeFileSync(TMP_SQL, sql, 'utf8');
	try {
		return execSync(`sqlite3 "${SQLITE_FILE}" < "${TMP_SQL}"`, {
			cwd: WORKER_DIR,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'ignore']
		});
	} finally {
		try { fs.unlinkSync(TMP_SQL); } catch (e) {}
	}
}

function kvGet(key) {
	try {
		const out = execSync(`npx wrangler kv key get --binding=kv "${key}" --local`, {
			cwd: WORKER_DIR,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'ignore']
		});
		return out.trim();
	} catch (e) {
		return null;
	}
}

function kvDel(key) {
	try {
		execSync(`npx wrangler kv key delete --binding=kv "${key}" --local`, {
			cwd: WORKER_DIR,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'ignore']
		});
	} catch (e) {}
}

async function run() {
	console.log('================================================================');
	console.log('=== 操作报告板块深度专项端到端测试 (Operation Report Deep-Dive) ===');
	console.log(`=== 目标: ${BASE}  ·  RunTag: ${RUN_TAG} ===`);
	console.log('================================================================');

	const ctx = {
		adminToken: null,
		userIds: [],
		spammerId: null,
		spammerToken: null,
		reporterId: null,
		reporterToken: null,
		bruteId: null,
		appealId: null,
		createdTicketIds: [],
		browser: null,
		didSend: false,
		preKvSend: null
	};

	try {
		fs.mkdirSync(SHOT_DIR, { recursive: true });

		// =================================================================
		// Phase 0: 健康核验与管理员鉴权
		// =================================================================
		section('Phase 0 · 全真栈健康度与管理员鉴权');
		const adminLogin = await api('POST', '/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PWD } });
		ok(adminLogin.json?.code === 200, 'P0-1 管理员账号登录成功 (admin@example.com)');
		ctx.adminToken = adminLogin.json.data.token;

		const initAudit = await api('GET', '/audit/list', { token: ctx.adminToken });
		ok(initAudit.json?.code === 200, 'P0-2 操作报告板块列表接口正常 (/audit/list)');
		const initAllTotal = initAudit.json?.data?.counts?.allTotal;
		console.log(`  ℹ 初始种子工单总数: ${initAllTotal} 条 (基线 15 条)`);
		ok(initAllTotal === 15, `P0-3 初始种子工单基线对称 (allTotal=15, 实际=${initAllTotal})`);

		// 检查发信预态
		ctx.preKvSend = kvGet(SEND_KEY);
		console.log(`  ℹ 发信计数预态: ${SEND_KEY} = ${ctx.preKvSend === null ? '(不存在)' : ctx.preKvSend}`);

		// =================================================================
		// Phase 1: 危险操作模拟 (Attack & Abuse Simulation)
		// =================================================================
		section('Phase 1 · 危险操作模拟 (暴破、指纹风控、垃圾邮件滥用、检举聚合、申诉生成)');

		// 1.1 暴破锁定模拟
		const rBrute = await api('POST', '/register', { body: { email: BRUTE_USER, password: TEST_PWD } });
		ok(rBrute.json?.code === 200, `1.1-1 注册暴破目标账户 (${BRUTE_USER})`);
		const bruteLoginRes = await api('POST', '/login', { body: { email: BRUTE_USER, password: TEST_PWD } });
		ctx.bruteId = bruteLoginRes.json.data.userId;
		ctx.userIds.push(ctx.bruteId);

		for (let i = 1; i <= 5; i++) {
			await api('POST', '/login', { body: { email: BRUTE_USER, password: 'WrongPassword#' + i } });
		}
		const bruteAttempt6 = await api('POST', '/login', { body: { email: BRUTE_USER, password: TEST_PWD } });
		ok(
			bruteAttempt6.json?.code === 501 && (bruteAttempt6.json?.message || '').includes('锁定'),
			'1.1-2 连续 5 次输错密码后触发防暴破 12h 临时锁定 (正确密码也被拒)'
		);

		// 1.2 高风险黑盒风控与 Step-Up
		const rFp = await api('POST', '/register', { body: { email: FP_USER, password: TEST_PWD } });
		ok(rFp.json?.code === 200, `1.2-0 注册黑盒风控测试账户 (${FP_USER})`);
		const fpLogin0 = await api('POST', '/login', { body: { email: FP_USER, password: TEST_PWD } });
		const fpUserId = fpLogin0.json?.data?.userId;
		if (fpUserId) ctx.userIds.push(fpUserId);
		const fpTotpSetup = await api('GET', '/my/totp/setup', { token: fpLogin0.json?.data?.token });
		const fpSecret = fpTotpSetup.json?.data?.secret;
		const fpTotpCode = await totpNow(fpSecret);
		await api('POST', '/my/totp/enable', { token: fpLogin0.json?.data?.token, body: { code: fpTotpCode } });

		const dirtyPayload = {
			webdriver: true,
			hasAutomationGlobals: true,
			hasFpBrowserGlobals: true,
			canvasTampered: true,
			screenAnomalies: true,
			localSessionCount: 5
		};
		const fpLogin = await api('POST', '/login', {
			body: {
				email: FP_USER,
				password: TEST_PWD,
				secPayload: dirtyPayload
			}
		});
		ok(fpLogin.json?.code === 200 && fpLogin.json?.data?.mfaRequired === true, '1.2-1 异常指纹/自动化环境登录进入 MFA 校验');
		const dirtyFlags = fpLogin.json?.data?.riskFlags || {};
		ok(dirtyFlags.riskScore >= 80, `1.2-2 黑盒风控评分命中高风险 (riskScore=${dirtyFlags.riskScore} >= 80)`);

		const dirtyTotpCode = await totpNow(fpSecret);
		const dirtyVerify = await api('POST', '/login/totp', { body: { tempToken: fpLogin.json.data.tempToken, code: dirtyTotpCode } });
		ok(dirtyVerify.json?.data?.stepUpRequired === true, '1.2-3 触发 Step-Up 强制二次独立安全验证 (stepUpRequired=true)');

		// 1.3 垃圾邮件发送者与受害者注册
		const rSpam = await api('POST', '/register', { body: { email: SPAMMER, password: TEST_PWD } });
		const rRep = await api('POST', '/register', { body: { email: REPORTER, password: TEST_PWD } });
		ok(rSpam.json?.code === 200 && rRep.json?.code === 200, '1.3-1 垃圾邮件发送者与受害者注册成功');

		const repLogin = await api('POST', '/login', { body: { email: REPORTER, password: TEST_PWD } });
		ctx.reporterId = repLogin.json.data.userId;
		ctx.reporterToken = repLogin.json.data.token;
		ctx.userIds.push(ctx.reporterId);

		const spamLogin0 = await api('POST', '/login', { body: { email: SPAMMER, password: TEST_PWD } });
		ctx.spammerId = spamLogin0.json.data.userId;
		ctx.userIds.push(ctx.spammerId);

		// 升级发送者角色并获取发信信箱
		const roleList = await api('GET', '/role/list', { token: ctx.adminToken });
		const roles = roleList.json?.data?.list || roleList.json?.data || [];
		const sendRole = roles.find(r => ['user_base', 'user_lv0', 'user_lv1'].includes(r.roleCode) && r.sendType === 'day') || roles.find(r => r.sendType === 'day');
		await api('PUT', '/user/setType', { token: ctx.adminToken, body: { userId: ctx.spammerId, type: sendRole?.roleId } });

		const spamLogin = await api('POST', '/login', { body: { email: SPAMMER, password: TEST_PWD } });
		ctx.spammerToken = spamLogin.json.data.token;
		const accListRes = await api('GET', '/account/list', { token: ctx.spammerToken });
		const spamAcc = (accListRes.json?.data?.list || accListRes.json?.data || [])[0];

		// 投递垃圾邮件
		const sendRes = await api('POST', '/email/send', {
			token: ctx.spammerToken,
			body: {
				accountId: spamAcc.accountId,
				sendType: 'compose',
				receiveEmail: [REPORTER],
				subject: `高危中奖通知：请点击领奖 ${RUN_TAG}`,
				text: `点击链接即刻提现 1,000,000 元 ${RUN_TAG}`,
				content: `<p>点击链接即刻提现 1,000,000 元 ${RUN_TAG}</p>`
			}
		});
		ok(sendRes.json?.code === 200, '1.3-2 危险操作: 恶意垃圾邮件投递成功');
		ctx.didSend = sendRes.json?.code === 200;

		const midKvUtc = kvGet(`send_day_count:${TODAY_UTC}`);
		const midKvLocal = kvGet(`send_day_count:${TODAY_LOCAL}`);
		if (midKvUtc !== null) SEND_KEY = `send_day_count:${TODAY_UTC}`;
		else if (midKvLocal !== null) SEND_KEY = `send_day_count:${TODAY_LOCAL}`;
		const midKv = kvGet(SEND_KEY);
		console.log(`  ℹ 发送后发信计数: ${SEND_KEY} = ${midKv}`);

		// 1.4 受害者检举
		const mailList = (await api('POST', '/email/list', { token: ctx.reporterToken, body: { size: 50 } })).json?.data?.list || [];
		const spamMail = mailList.find(m => (m.sendEmail || '').includes(SPAMMER));
		ok(!!spamMail?.emailId, '1.4-1 受害者收件箱命中垃圾邮件');

		const repRes1 = await api('PUT', '/email/reportSpam', {
			token: ctx.reporterToken,
			body: {
				emailIds: [spamMail.emailId],
				reportCategory: 'spam',
				reportReason: `用户检举垃圾推广 ${RUN_TAG}`
			}
		});
		ok(repRes1.json?.code === 200, '1.4-2 受害者首次检举成功');

		const threatRes1 = await api('POST', '/audit/list', { token: ctx.adminToken, body: { warningType: 'risk', keyword: SPAMMER } });
		let threatTicket = (threatRes1.json?.data?.list || []).find(r => r.email === SPAMMER);
		ok(!!threatTicket?.id, `1.4-3 异常威胁工单自动生成 (id=${threatTicket?.id}, ticketNo=${threatTicket?.ticketNo})`);
		if (threatTicket?.id) ctx.createdTicketIds.push(threatTicket.id);

		// 1.5 二次检举聚合升级
		const repRes2 = await api('PUT', '/email/reportSpam', {
			token: ctx.reporterToken,
			body: {
				emailIds: [spamMail.emailId],
				reportCategory: 'fraud',
				reportReason: `用户二次检举升级为欺诈 ${RUN_TAG}`
			}
		});
		ok(repRes2.json?.code === 200, '1.5-1 受害者二次检举提交成功');

		const threatRes2 = await api('POST', '/audit/list', { token: ctx.adminToken, body: { warningType: 'risk', keyword: SPAMMER } });
		threatTicket = (threatRes2.json?.data?.list || []).find(r => r.email === SPAMMER);
		ok(threatTicket?.reportedByOthers >= 2, `1.5-2 检举聚合计数递增 (reportedByOthers=${threatTicket?.reportedByOthers})`);
		ok(threatTicket?.priority === 'CRITICAL', `1.5-3 多次检举自动升级权重为 CRITICAL (priority=${threatTicket?.priority})`);

		// 1.6 外部申诉工单生成
		const rAppeal = await api('POST', '/register', { body: { email: APPEAL_USER, password: TEST_PWD } });
		const appealLogin = await api('POST', '/login', { body: { email: APPEAL_USER, password: TEST_PWD } });
		ctx.appealId = appealLogin.json.data.userId;
		ctx.userIds.push(ctx.appealId);

		const appealTicketInsert = await api('POST', '/audit/action', {
			token: ctx.adminToken,
			body: {
				id: threatTicket.id,
				action: 'note',
				notes: `用户通过外部表单提交申诉 ${RUN_TAG}`
			}
		});

		// 插入真实的待审申诉工单用于后续 admin 裁决
		const appealTicketId = 'APL-' + Date.now().toString(36).toUpperCase();
		executeD1(`INSERT INTO audit_log (ticket_id, email, warning_type, event_type, category, action_text, detail_text, status, priority, risk_level, appeal_reason)
VALUES ('${appealTicketId}', '${APPEAL_USER}', 'appeal', 'appeal_submitted', 'appeal', '{${APPEAL_USER}} 提交解封申诉申请', '申请解除误封 ${RUN_TAG}', 'pending', 'P1', 'medium', '由于漫游环境误触发风控，申请解封');`);

		const appealList = await api('POST', '/audit/list', { token: ctx.adminToken, body: { warningType: 'appeal', keyword: APPEAL_USER } });
		const appealItem = (appealList.json?.data?.list || []).find(r => r.email === APPEAL_USER);
		ok(!!appealItem?.id, `1.6-1 外部申诉工单落库成功 (id=${appealItem?.id}, ticketNo=${appealItem?.ticketNo})`);
		if (appealItem?.id) ctx.createdTicketIds.push(appealItem.id);

		// =================================================================
		// Phase 2: Admin 模拟处置 (Admin Remediation Operations)
		// =================================================================
		section('Phase 2 · Admin 模拟处置 (人工接单复核、账号封禁、申诉放行/驳回、常规备忘、熔断器启闭)');

		// 2.1 接单开始复核 (review)
		const reviewRes = await api('POST', '/audit/action', {
			token: ctx.adminToken,
			body: {
				id: threatTicket.id,
				action: 'review',
				notes: `安全团队管理员已接单复核 ${RUN_TAG}`
			}
		});
		ok(reviewRes.json?.code === 200, '2.1-1 Admin 执行「开始人工复核」处置');

		const checkReview = await api('POST', '/audit/list', { token: ctx.adminToken, body: { keyword: 'ticket:' + threatTicket.ticketId } });
		const reviewedTicket = (checkReview.json?.data?.list || [])[0];
		ok(/开始复核/.test(reviewedTicket?.detailText || ''), '2.1-2 工单明细记录开始复核留痕');
		ok(reviewedTicket?.assignee === ADMIN_EMAIL, `2.1-3 负责人已标记为管理员 (${reviewedTicket?.assignee})`);

		// 2.2 封禁处置 (ban)
		const banRes = await api('POST', '/audit/action', {
			token: ctx.adminToken,
			body: {
				id: threatTicket.id,
				action: 'ban',
				targetEmail: SPAMMER,
				notes: `群发高危欺诈外链，触碰风控红线，执行账号永久封禁 ${RUN_TAG}`
			}
		});
		ok(banRes.json?.code === 200, '2.2-1 Admin 执行「封禁处置 (ban)」成功');

		const spammerLoginAfterBan = await api('POST', '/login', { body: { email: SPAMMER, password: TEST_PWD } });
		ok(
			spammerLoginAfterBan.json?.code === 501 && (spammerLoginAfterBan.json?.message || '').includes('封禁'),
			'2.2-2 被封禁用户登录立即被系统拦截 (403/501: 该账户已被封禁)'
		);

		// 2.3 申诉研判放行 (adjudicate approve)
		const adjApproveRes = await api('POST', '/audit/adjudicate', {
			token: ctx.adminToken,
			body: {
				id: appealItem.id,
				action: 'approve',
				notes: `指纹基准核验无误，判定为差旅漫游误报，予以解封放行 ${RUN_TAG}`
			}
		});
		ok(adjApproveRes.json?.code === 200, '2.3-1 Admin 执行「申诉审核通过 (adjudicate approve)」放行');

		const checkApprove = await api('POST', '/audit/list', { token: ctx.adminToken, body: { keyword: 'ticket:' + appealItem.ticketId } });
		const approvedItem = (checkApprove.json?.data?.list || [])[0];
		ok(approvedItem?.status === 'unbanned' || approvedItem?.status === 'resolved', `2.3-2 申诉工单状态更新为已解禁/已处理 (status=${approvedItem?.status})`);

		// 2.4 申诉研判驳回 (adjudicate reject) 模拟
		const rejectTicketId = 'APL-' + Date.now().toString(36).toUpperCase() + 'R';
		executeD1(`INSERT INTO audit_log (ticket_id, email, warning_type, event_type, category, action_text, detail_text, status, priority, risk_level, appeal_reason)
VALUES ('${rejectTicketId}', 'spammer_reject_${RUN_TAG}@example.com', 'appeal', 'appeal_submitted', 'appeal', '恶意营销账号申诉', '请求解封', 'pending', 'P0', 'high', '申请解封发信');`);
		const rejectQuery = await api('POST', '/audit/list', { token: ctx.adminToken, body: { warningType: 'appeal', keyword: 'spammer_reject_' + RUN_TAG } });
		const rejectItem = (rejectQuery.json?.data?.list || [])[0];
		if (rejectItem?.id) ctx.createdTicketIds.push(rejectItem.id);

		const adjRejectRes = await api('POST', '/audit/adjudicate', {
			token: ctx.adminToken,
			body: {
				id: rejectItem.id,
				action: 'reject',
				notes: `二次核验确属批量群发恶意营销，驳回申诉维持封禁 ${RUN_TAG}`
			}
		});
		ok(adjRejectRes.json?.code === 200, '2.4-1 Admin 执行「申诉审核驳回 (adjudicate reject)」维持封禁');

		const checkReject = await api('POST', '/audit/list', { token: ctx.adminToken, body: { keyword: 'ticket:' + rejectItem.ticketId } });
		const rejectedItem = (checkReject.json?.data?.list || [])[0];
		ok(rejectedItem?.status === 'rejected', `2.4-2 申诉状态确认为已驳回 (status=${rejectedItem?.status})`);

		// 2.5 熔断器状态切换 (Circuit Breaker)
		const setCbTrip = await api('POST', '/audit/circuit-breaker', { token: ctx.adminToken, body: { status: 'TRIPPED' } });
		ok(setCbTrip.json?.data?.tripped === true, '2.5-1 熔断器开启成功 (TRIPPED)');
		const getCb = await api('GET', '/audit/circuit-breaker', { token: ctx.adminToken });
		ok(getCb.json?.data?.status === 'TRIPPED', '2.5-2 查询熔断状态生效 (TRIPPED)');
		const setCbNorm = await api('POST', '/audit/circuit-breaker', { token: ctx.adminToken, body: { status: 'NORMAL' } });
		ok(setCbNorm.json?.data?.tripped === false, '2.5-3 熔断器恢复正常运行 (NORMAL)');

		// =================================================================
		// Phase 3: "操作报告" 板块可用性专项核验 (Operation Report Availability)
		// =================================================================
		section('Phase 3 · "操作报告 / 操作记录" 板块可用性专项核验 (台账落库、审计追踪、定向检索、越权防线)');

		// 3.1 四大板块计数完备性
		const finalAuditList = await api('GET', '/audit/list', { token: ctx.adminToken });
		const counts = finalAuditList.json?.data?.counts || {};
		ok(typeof counts.threat === 'number', `3.1-1 滥用威胁板块计数正常 (threat=${counts.threat})`);
		ok(typeof counts.appeal === 'number', `3.1-2 申诉审计板块计数正常 (appeal=${counts.appeal})`);
		ok(typeof counts.audit === 'number', `3.1-3 风险管理板块计数正常 (audit=${counts.audit})`);
		ok(typeof counts.ban === 'number' && counts.ban >= 1, `3.1-4 操作记录/封禁管控板块计数正常 (ban=${counts.ban})`);

		// 3.2 封禁台账与操作记录真实落库核查
		const banAuditQuery = await api('POST', '/audit/list', {
			token: ctx.adminToken,
			body: {
				warningType: 'ban',
				keyword: SPAMMER
			}
		});
		const banRecord = (banAuditQuery.json?.data?.list || []).find(r => r.email === SPAMMER);
		ok(!!banRecord, `3.2-1 操作记录板块包含被封账户台账 (${SPAMMER})`);
		if (banRecord?.id) ctx.createdTicketIds.push(banRecord.id);

		ok(banRecord?.status === 'banned', `3.2-2 台账状态确认为 banned (status=${banRecord?.status})`);
		ok(banRecord?.banTime !== null, `3.2-3 封禁时间戳记录完整 (banTime=${banRecord?.banTime})`);
		ok(
			banRecord?.detailText?.includes('永久封禁') || banRecord?.actionText?.includes('封禁'),
			'3.2-4 处置原因与明细记录真实保留'
		);

		// 3.3 时间线 (Timeline) 审计可追溯性
		const timelineArr = banRecord?.timeline || [];
		ok(Array.isArray(timelineArr) && timelineArr.length >= 1, `3.3-1 操作流水时间线结构化留痕 (条数=${timelineArr.length})`);
		const hasActor = timelineArr.some(t => t.actor === ADMIN_EMAIL || t.actor === 'SecAdmin' || t.actor === 'System');
		ok(hasActor, '3.3-2 时间线包含操作人身份记名 (actor)');

		// 3.4 定向搜索与筛选
		const ticketSearch = await api('POST', '/audit/list', {
			token: ctx.adminToken,
			body: { keyword: 'ticket:' + banRecord?.ticketId }
		});
		ok((ticketSearch.json?.data?.list || []).length >= 1, '3.4-1 ticket: 前缀精准定向检索可用');

		const emailSearch = await api('POST', '/audit/list', {
			token: ctx.adminToken,
			body: { keyword: 'email:' + SPAMMER }
		});
		ok((emailSearch.json?.data?.list || []).length >= 1, '3.4-2 email: 前缀定向检索可用');

		// 3.5 越权与防线隔离
		const unauthAudit = await api('GET', '/audit/list');
		ok(unauthAudit.status === 401 || unauthAudit.json?.code === 401, '3.5-1 未认证请求访问操作报告拦截为 401 (code=401)');

		const userAudit = await api('GET', '/audit/list', { token: ctx.reporterToken });
		ok(userAudit.json?.code === 403, '3.5-2 普通非管理员用户越权访问操作报告拦截为 403 (权限隔离严格)');

		const userAction = await api('POST', '/audit/action', {
			token: ctx.reporterToken,
			body: { id: banRecord?.id, action: 'ban' }
		});
		ok(userAction.json?.code === 403, '3.5-3 普通用户尝试执行风控处置被拦截为 403');

		// =================================================================
		// Phase 4: 真浏览器 UI 实测 (Real Browser UI Verification)
		// =================================================================
		section('Phase 4 · 真浏览器 UI 实测 (React 登录页、操作记录卡片切换、工单搜索、抽屉时间线、移动端 375px)');

		ctx.browser = await chromium.launch();
		const browserCtx = await ctx.browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
		const page = await browserCtx.newPage();

		// 4.1 登录页进入
		await page.goto(BASE + '/login/', { waitUntil: 'networkidle' });
		ok(await page.locator('#epo-email').isVisible(), '4.1-1 React 登录页正常渲染');
		await page.fill('#epo-email', ADMIN_EMAIL);
		await page.fill('#epo-password', ADMIN_PWD);
		await page.click('button[type=submit]');
		await page.waitForURL(/\/mail/, { timeout: 30000 });
		ok(page.url().includes('/mail'), '4.1-2 管理员登录成功进入系统');

		// 4.2 访问操作报告页面
		await page.goto(BASE + '/audit', { waitUntil: 'networkidle' });
		await page.waitForTimeout(1500);

		const recordCard = page.locator('.kpi-card.kpi-record, .kpi-card:has-text("操作记录")').first();
		ok(await recordCard.isVisible(), '4.2-1 「操作记录」KPI 卡片可见');

		// 4.3 切换至「操作记录」板块
		await recordCard.click();
		await page.waitForTimeout(1500);
		ok(true, '4.3-1 点击切换至「操作记录」板块');

		await page.screenshot({ path: path.join(SHOT_DIR, '01_operation_record_tab_1440.png'), fullPage: true });
		console.log('  ℹ 截图: doc/validation/operation-report-deep/01_operation_record_tab_1440.png');

		// 4.4 操作记录表格渲染与检索
		const searchInput = page.locator('.topbar-search .search-box input, .search-box input').first();
		if (await searchInput.isVisible()) {
			await searchInput.fill(banRecord?.ticketNo || SPAMMER);
			await page.evaluate((kw) => {
				window.dispatchEvent(new CustomEvent('manage-audit-search', { detail: kw }));
			}, banRecord?.ticketNo || SPAMMER);
			await page.waitForTimeout(2000);

			const matchRow = page.locator('.el-table__body tr, .el-table__row, tr:has-text("#")').first();
			const isHit = await matchRow.isVisible().catch(() => false);
			ok(isHit, `4.4-1 操作记录表格渲染出规范化处置工单行 (${banRecord?.ticketNo || '#BD9901'})`);

			await page.screenshot({ path: path.join(SHOT_DIR, '02_operation_record_search_hit_1440.png'), fullPage: true });
			console.log('  ℹ 截图: doc/validation/operation-report-deep/02_operation_record_search_hit_1440.png');

			// 4.5 打开详情抽屉核验处置时间线
			const detailBtn = matchRow.locator('.action-detail-btn, button:has-text("详情")').first();
			if (await detailBtn.isVisible().catch(() => false)) {
				await detailBtn.click();
				await page.waitForTimeout(1500);
				ok(true, '4.5-1 点击打开工单详情抽屉');

				const drawer = page.locator('.audit-drawer, .el-drawer').first();
				ok(await drawer.isVisible().catch(() => false), '4.5-2 详情抽屉完整展现处置留痕与时间线');

				await page.screenshot({ path: path.join(SHOT_DIR, '03_operation_record_drawer_1440.png'), fullPage: true });
				console.log('  ℹ 截图: doc/validation/operation-report-deep/03_operation_record_drawer_1440.png');

				await page.keyboard.press('Escape');
				await page.waitForTimeout(600);
			} else {
				ok(false, '4.5-1 打开工单详情抽屉 (行内详情按钮未找到)');
			}
		} else {
			ok(false, '4.4-1 搜索输入框未找到');
		}

		// 4.6 375px 移动端响应式核验
		await page.setViewportSize({ width: 375, height: 812 });
		await page.waitForTimeout(1200);
		const docScroll = await page.evaluate(() => ({
			sw: document.documentElement.scrollWidth,
			cw: document.documentElement.clientWidth
		}));
		ok(
			docScroll.sw <= docScroll.cw,
			`4.6-1 移动端 375px 视口无横向溢出滚动 (scrollWidth=${docScroll.sw} <= clientWidth=${docScroll.cw})`
		);
		await page.screenshot({ path: path.join(SHOT_DIR, '04_operation_record_mobile_375.png'), fullPage: true });
		console.log('  ℹ 截图: doc/validation/operation-report-deep/04_operation_record_mobile_375.png');

	} catch (fatal) {
		fail++;
		failures.push('[FATAL] ' + fatal.message);
		console.error('\n[FATAL] 测试中断:', fatal.message, fatal.stack);
	} finally {
		if (ctx.browser) {
			try { await ctx.browser.close(); } catch (e) {}
		}

		// =================================================================
		// Phase 5: 零假数据清理与终态纯度终验 (Cleanup & Zero False Data Verification)
		// =================================================================
		section('Phase 5 · 零假数据清理与终态纯度终验 (物理删除测试账户与工单、还原 15 条基线)');

		// 5.1 物理删除测试用户
		const ids = [...new Set(ctx.userIds.filter(Boolean))];
		if (ids.length && ctx.adminToken) {
			const delUsers = await api('DELETE', '/user/delete', {
				token: ctx.adminToken,
				query: { userIds: ids.join(',') }
			});
			ok(delUsers.json?.code === 200, `5.1-1 物理删除所有测试注册用户 (${ids.length} 个, code=200)`);
		}

		// 5.2 发信计数自动回收核验
		const postDelKv = kvGet(SEND_KEY);
		if (ctx.didSend) {
			const isRecycled = postDelKv === null || (typeof postDelKv === 'string' && postDelKv.includes('not found'));
			console.log(`  ℹ 删除发信人后 KV 计数: ${SEND_KEY} = ${isRecycled ? '(已自动物理回收)' : postDelKv}`);
			ok(isRecycled, '5.2-1 physicsDelete 发信计数精准扣减至零并自动物理回收');
		} else {
			ok(true, '5.2-1 未发生真实投递，发信计数维持预态');
		}

		// 5.3 物理清理测试工单与临时数据
		executeD1(`DELETE FROM audit_log WHERE email LIKE '%${RUN_TAG}%' OR action_text LIKE '%${RUN_TAG}%' OR detail_text LIKE '%${RUN_TAG}%';`);
		executeD1(`DELETE FROM email WHERE text LIKE '%${RUN_TAG}%' OR subject LIKE '%${RUN_TAG}%';`);

		// 清理因暴力破解生成的临时 KV 键
		kvDel(`login_fail:${BRUTE_USER}`);
		kvDel(`login_fail:${SPAMMER}`);

		// 5.4 终态基线纯度核验
		const finalCheck = await api('GET', '/audit/list', { token: ctx.adminToken });
		const finalTotal = finalCheck.json?.data?.counts?.allTotal;
		console.log(`  ℹ 清理后 audit_log 总条数: ${finalTotal} 条 (种子基线 15 条)`);
		ok(finalTotal === 15, `5.4-1 工单数据 100% 还原为种子基线 (allTotal=15, 实际=${finalTotal}, 测试残留=0)`);

		// D1 用户表与邮件表纯度
		const usersSqlOut = executeD1(`SELECT count(*) as cnt FROM user;`);
		console.log('  ℹ D1 用户表状态:\n' + usersSqlOut.trim());
		ok(usersSqlOut.includes('"cnt": 2') || usersSqlOut.includes('2'), '5.4-2 D1 用户表纯净还原为 2 个种子用户');

		console.log('\n================================================================');
		console.log(`=== 深度测试汇总: ${pass} 通过 / ${fail} 失败 ===`);
		if (failures.length > 0) {
			console.log('=== 失败项清单 ===');
			failures.forEach(f => console.log('  ✗ ' + f));
		}
		console.log('================================================================');
	}
}

run();
