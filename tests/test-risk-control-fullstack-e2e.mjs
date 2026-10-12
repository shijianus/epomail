/**
 * 风控系统全真栈端到端测试 (Risk Control Full-Stack E2E)
 * ============================================================
 * 针对本地全真栈 (wrangler dev + D1 + KV) 的完整风控测试：
 *
 * Phase 0  健康检查与管理员鉴权
 * Phase A  危险操作模拟 (攻击侧)
 *   A1  暴力破解：连续 5 次错误密码 → 账号临时锁定 (12h KV LOCK)
 *   A2  锁定后正确密码也被拒 (防爆破兜底)
 *   A3  自动化/指纹浏览器登录 (webdriver / canvas 篡改) → 黑盒风控评分 → Step-Up 强制二验
 *   A4  正常环境登录 → 单因子通过 (无 Step-Up)
 *   A5  同 IP 多账户聚集 (4 账户) → 多账户检测
 *
 * Phase B  滥用链路模拟 (举报侧)
 *   B1  站内垃圾邮件发送 (spammer → reporter)
 *   B2  受害者检举 → audit_log 异常威胁工单生成
 *   B3  二次检举聚合 (reportedByOthers 递增 / priority CRITICAL)
 *   B4  外部申诉工单落库 (epomail-docs 双轨架构模拟)
 *
 * Phase C  管理员处置 (操作报告板块 - Admin Side)
 *   C1  操作报告列表/四板块计数/筛选与搜索
 *   C2  异常威胁处置：mute_account / blacklist_sender
 *   C3  常规审查处置：archive_routine / note / extend
 *   C4  封禁处置：ban → 封禁台账留痕 → 被封用户登录 403
 *   C5  申诉研判：adjudicate approve → 解禁 + 台账 unbanned + 研判批注归档
 *   C6  申诉研判：adjudicate reject → 维持封禁
 *   C7  一键清理非关键历史 (/audit/purge)
 *   C8  越权拦截：普通用户访问 /audit/* → 403；未认证 → 401
 *
 * Phase D  数据清理 (finally 物理删除 + 种子基线还原)
 *
 * 运行前提: wrangler dev (wrangler-dev.toml) 已在 8787 端口运行且已执行 /api/init
 * 运行方式: node tests/test-risk-control-fullstack-e2e.mjs  (在仓库根目录)
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8787/api';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PWD = '123456';
const RUN_TAG = 'rkctl' + Date.now().toString(36).slice(-4); // 测试数据命名标签
const WORKER_DIR = path.resolve('mail-worker');
const TMP_SQL = path.join(WORKER_DIR, '.tmp-e2e-risk.sql');

let pass = 0, fail = 0;
const failures = [];
const cleanup = { userIds: [], auditEmails: [], adminToken: null };

function ok(cond, label) {
	if (cond) { pass++; console.log('  ✓ ' + label); }
	else { fail++; failures.push(label); console.log('  ✗ ' + label); }
}
function section(title) {
	console.log('\n──────────────────────────────────────────────');
	console.log('◆ ' + title);
	console.log('──────────────────────────────────────────────');
}

// ---------- HTTP helper (含网络抖动重试: wrangler dev 复位 keep-alive 连接时 fetch 可能瞬时失败) ----------
async function api(method, pathSuffix, { token, body, query } = {}) {
	let url = BASE + pathSuffix;
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

// ---------- D1 helper (通过 wrangler d1 execute --local 操作本地真库) ----------
// 注意: Windows 下路径含空格, 必须使用 execSync + 带引号的相对路径 (cwd=mail-worker)
function d1Exec(sql) {
	fs.writeFileSync(TMP_SQL, sql, 'utf8');
	try {
		execSync(`npx wrangler d1 execute epomail --local --file ".tmp-e2e-risk.sql" --config wrangler-dev.toml`, {
			cwd: WORKER_DIR, stdio: 'pipe', timeout: 120000
		});
	} finally {
		try { fs.unlinkSync(TMP_SQL); } catch { /* ignore */ }
	}
}
async function d1Query(sql) {
	fs.writeFileSync(TMP_SQL, sql, 'utf8');
	try {
		const out = execSync(`npx wrangler d1 execute epomail --local --file ".tmp-e2e-risk.sql" --json --config wrangler-dev.toml`, {
			cwd: WORKER_DIR, stdio: 'pipe', timeout: 120000, encoding: 'utf8'
		});
		const parsed = JSON.parse(out.slice(out.indexOf('[')));
		return parsed?.[0]?.results || [];
	} finally {
		try { fs.unlinkSync(TMP_SQL); } catch { /* ignore */ }
	}
}

// ---------- TOTP helper (RFC 6238, 与 mail-worker/src/utils/totp-utils.js 等价) ----------
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

// ---------- 测试用户 ----------
const U = {
	lock: `${RUN_TAG}_lock@example.com`,          // 暴力破解受害者
	fp1: `${RUN_TAG}_fp1@example.com`,            // 正常环境 2FA 用户
	fp2: `${RUN_TAG}_fp2@example.com`,            // 指纹浏览器 2FA 用户
	fp3: `${RUN_TAG}_fp3@example.com`,            // IP 聚集组
	fp4: `${RUN_TAG}_fp4@example.com`,            // IP 聚集组
	spammer: `${RUN_TAG}_spam@example.com`,       // 站内垃圾邮件发送者
	reporter: `${RUN_TAG}_reporter@example.com`,  // 检举者
	plain: `${RUN_TAG}_plain@example.com`         // 越权探测者
};
const PWD = 'RiskTest#2026';

async function register(email) {
	const r = await api('POST', '/register', { body: { email, password: PWD } });
	assert.strictEqual(r.json?.code, 200, `register ${email} failed: ${JSON.stringify(r.json)}`);
}
async function loginPwd(email, password, secPayload) {
	return api('POST', '/login', { body: { email, password, secPayload } });
}
async function enrollTotp(email) {
	const l = await loginPwd(email, PWD);
	assert.strictEqual(l.json?.code, 200, `login ${email} for totp enroll failed: ${JSON.stringify(l.json)}`);
	const token = l.json.data.token;
	if (l.json.data.userId) cleanup.userIds.push(l.json.data.userId);
	const setup = await api('GET', '/my/totp/setup', { token });
	assert.strictEqual(setup.json?.code, 200, 'totp setup failed: ' + JSON.stringify(setup.json));
	const secret = setup.json.data.secret;
	const code = await totpNow(secret);
	const en = await api('POST', '/my/totp/enable', { token, body: { code } });
	assert.strictEqual(en.json?.code, 200, 'totp enable failed: ' + JSON.stringify(en.json));
	return { token, secret };
}

// ============================================================
async function run() {
	console.log('================================================================');
	console.log('=== 风控系统全真栈端到端测试 (Risk Control Full-Stack E2E) ===');
	console.log(`=== 目标: ${BASE}  ·  RunTag: ${RUN_TAG} ===`);
	console.log('================================================================');

	try {
		// ---------- Phase 0: 健康检查与管理员登录 ----------
		section('Phase 0 · 全真栈健康与管理员鉴权');
		const root = await fetch(BASE.replace('/api', '/'));
		ok(root.status === 200, 'P0-1 本地全真栈响应 200 (wrangler dev @8787)');

		const adminLogin = await loginPwd(ADMIN_EMAIL, ADMIN_PWD);
		ok(adminLogin.json?.code === 200 && !!adminLogin.json?.data?.token, 'P0-2 站长账号登录成功 (admin@example.com)');
		const adminToken = adminLogin.json.data.token;
		cleanup.adminToken = adminToken;

		const auditProbe = await api('POST', '/audit/list', { token: adminToken, body: { num: 1, size: 5 } });
		ok(auditProbe.json?.code === 200 && Array.isArray(auditProbe.json?.data?.list), 'P0-3 操作报告板块列表接口可用 (/audit/list)');

		// 预清理: 扫除上次运行可能残留的 rkctl% 测试用户 (防御性, 保证幂等重跑)
		const staleUsers = await d1Query(`SELECT user_id FROM user WHERE email LIKE 'rkctl%'`);
		if (staleUsers.length > 0) {
			const staleIds = staleUsers.map(r => r.user_id).join(',');
			await d1Exec(`DELETE FROM account WHERE user_id IN (${staleIds}); DELETE FROM user WHERE user_id IN (${staleIds});`);
			console.log(`  ℹ 预清理: 移除 ${staleUsers.length} 个历史残留测试用户 (id: ${staleIds})`);
		}

		// ---------- Phase A1: 暴力破解锁定 ----------
		section('Phase A · 危险操作模拟 — 暴力破解与账号锁定');
		await register(U.lock);

		let lastWrong = null;
		for (let i = 1; i <= 5; i++) {
			lastWrong = await loginPwd(U.lock, 'WrongPwd-' + i);
		}
		ok(lastWrong.json?.code === 501, `A1-1 连续 5 次错误密码均被拒绝 (code=${lastWrong.json?.code}, msg=${lastWrong.json?.message})`);

		const lockedCorrect = await loginPwd(U.lock, PWD);
		ok(lockedCorrect.json?.code !== 200 && /锁定|locked/i.test(lockedCorrect.json?.message || ''), `A1-2 第 6 次(正确密码)被临时锁定拦截 → "${lockedCorrect.json?.message}"`);

		// ---------- Phase A2: 黑盒风控评分 + Step-Up 强制二验 ----------
		section('Phase A · 危险操作模拟 — 自动化/指纹浏览器登录与风控 Step-Up');
		for (const e of [U.fp1, U.fp2, U.fp3, U.fp4]) await register(e);
		const fp1 = await enrollTotp(U.fp1);
		const fp2 = await enrollTotp(U.fp2);
		await enrollTotp(U.fp3);
		const fp4 = await enrollTotp(U.fp4);

		// A4 正常环境：干净 secPayload
		const cleanLogin = await loginPwd(U.fp1, PWD, {});
		ok(cleanLogin.json?.code === 200 && cleanLogin.json?.data?.mfaRequired === true, 'A2-1 正常环境登录进入 2FA 校验阶段 (mfaRequired=true)');
		const cleanFlags = cleanLogin.json?.data?.riskFlags || {};
		ok(Number(cleanFlags.riskScore) < 40 && cleanFlags.stepUpRequired === false, `A2-2 正常环境风控分 ${cleanFlags.riskScore} 低于阈值，未触发 Step-Up`);
		const cleanCode = await totpNow(fp1.secret);
		const cleanVerify = await api('POST', '/login/totp', { body: { tempToken: cleanLogin.json.data.tempToken, code: cleanCode } });
		ok(cleanVerify.json?.code === 200 && !!cleanVerify.json?.data?.token && !cleanVerify.json?.data?.stepUpRequired, 'A2-3 单因子 TOTP 通过并签发完整 token (无二次验证)');

		// A3 危险环境：自动化 + 指纹浏览器 + 硬件不一致 + 多账户会话
		const dirtyPayload = {
			webdriver: true,
			hasAutomationGlobals: true,
			hasFpBrowserGlobals: true,
			canvasTampered: true,
			screenAnomalies: true,
			localSessionCount: 5
		};
		const dirtyLogin = await loginPwd(U.fp2, PWD, dirtyPayload);
		ok(dirtyLogin.json?.code === 200 && dirtyLogin.json?.data?.mfaRequired === true, 'A2-4 指纹浏览器/自动化环境登录进入 2FA 校验阶段');
		const dirtyFlags = dirtyLogin.json?.data?.riskFlags || {};
		ok(dirtyFlags.fpBrowserDetected === true && dirtyFlags.multiAccountDetected === true, `A2-5 黑盒风控命中特征标签 (fpBrowser=${dirtyFlags.fpBrowserDetected}, multiAccount=${dirtyFlags.multiAccountDetected})`);
		ok(Number(dirtyFlags.riskScore) >= 50, `A2-6 危险环境风控分 ${dirtyFlags.riskScore} 显著高于正常环境 (${cleanFlags.riskScore})`);
		const dirtyCode = await totpNow(fp2.secret);
		const dirtyVerify = await api('POST', '/login/totp', { body: { tempToken: dirtyLogin.json.data.tempToken, code: dirtyCode } });
		ok(dirtyVerify.json?.code === 200 && dirtyVerify.json?.data?.stepUpRequired === true && Number(dirtyVerify.json?.data?.step) === 2 && !dirtyVerify.json?.data?.token, `A2-7 高风险登录强制 Step-Up 二验 (step=2, 需不同因子) 提示: "${(dirtyVerify.json?.data?.message || '').slice(0, 42)}…"`);
		ok(Array.isArray(dirtyVerify.json?.data?.remainingFactors), 'A2-8 Step-Up 响应携带剩余因子清单 (remainingFactors)');

		// A5 同 IP 多账户聚集：第 4 个账户登录时应命中多账户检测
		const clusterLogin = await loginPwd(U.fp4, PWD, {});
		const clusterFlags = clusterLogin.json?.data?.riskFlags || {};
		ok(clusterFlags.multiAccountDetected === true, `A2-9 同 IP 第 4 账户登录触发多账户聚集检测 (riskScore=${clusterFlags.riskScore}, stepUp=${clusterFlags.stepUpRequired})`);

		// ---------- Phase B: 滥用链路 (检举) ----------
		section('Phase B · 滥用链路模拟 — 站内垃圾邮件与用户检举');
		await register(U.reporter);
		const reporterLogin = await loginPwd(U.reporter, PWD);
		const reporterToken = reporterLogin.json?.data?.token;
		if (reporterLogin.json?.data?.userId) cleanup.userIds.push(reporterLogin.json.data.userId);
		ok(!!reporterToken, 'B1-1 检举者账号注册并登录成功');

		await register(U.spammer);
		const spammerLogin0 = await loginPwd(U.spammer, PWD);
		const spammerId = spammerLogin0.json?.data?.userId;
		if (spammerId) cleanup.userIds.push(spammerId);
		// 将发送者角色升级为可发信角色: 优先 user_base, 兼容旧种子库取 user_lv0/user_lv1 (sendType=day)
		const roleList = await api('GET', '/role/list', { token: adminToken });
		const roles = roleList.json?.data?.list || roleList.json?.data || [];
		const userBaseRole = roles.find(r => ['user_base', 'user_lv0', 'user_lv1'].includes(r.roleCode) && r.sendType === 'day') || roles.find(r => r.sendType === 'day');
		const setTypeRes = await api('PUT', '/user/setType', { token: adminToken, body: { userId: spammerId, type: userBaseRole?.roleId } });
		ok(setTypeRes.json?.code === 200, `B1-2 管理员将垃圾邮件发送者角色升级为可发信 (${userBaseRole?.roleCode || 'role?'}, code=${setTypeRes.json?.code})`);

		const spammerLogin = await loginPwd(U.spammer, PWD);
		const spammerToken = spammerLogin.json?.data?.token;
		ok(!!spammerToken, 'B1-3 垃圾邮件发送者登录成功');
		const accList = await api('GET', '/account/list', { token: spammerToken });
		const accData = accList.json?.data?.list || accList.json?.data || [];
		const spammerAcc = accData[0];
		ok(!!spammerAcc?.accountId, 'B1-4 发送者邮箱账户就绪 (account/list)');

		// 发送 2 封垃圾邮件给检举者
		let sendOk = 0;
		for (let i = 1; i <= 2; i++) {
			const s = await api('POST', '/email/send', {
				token: spammerToken,
				body: {
					accountId: spammerAcc.accountId,
					sendType: 'compose',
					receiveEmail: [U.reporter],
					subject: `限时暴富机会#${i} ${RUN_TAG}`,
					text: '点击链接立即暴富！群发广告 ' + RUN_TAG,
					content: '<p>点击链接立即暴富！群发广告</p>'
				}
			});
			if (s.json?.code === 200) sendOk++;
		}
		ok(sendOk === 2, `B1-5 站内垃圾邮件投递成功 (${sendOk}/2)`);

		const reporterMail = await api('POST', '/email/list', { token: reporterToken, body: { size: 50 } });
		const mailList = reporterMail.json?.data?.list || [];
		const spamMailIds = mailList.filter(m => (m.sendEmail || '').includes(U.spammer)).map(m => m.emailId);
		ok(spamMailIds.length >= 2, `B2-1 检举者收件箱收到 ${spamMailIds.length} 封垃圾邮件`);

		// 第一次检举
		const rep1 = await api('PUT', '/email/reportSpam', { token: reporterToken, body: { emailIds: [spamMailIds[0]], reportCategory: 'spam', reportReason: '群发商业广告 ' + RUN_TAG } });
		ok(rep1.json?.code === 200, 'B2-2 第一次检举提交成功 (reportSpam)');

		let riskList = await api('POST', '/audit/list', { token: adminToken, body: { warningType: 'risk', num: 1, size: 50, keyword: U.spammer } });
		let riskRows = (riskList.json?.data?.list || []).filter(r => r.email === U.spammer);
		ok(riskRows.length === 1 && Number(riskRows[0].reportedByOthers) >= 1, 'B2-3 异常威胁工单自动生成 (warningType=risk, reportedByOthers≥1)');

		// 第二次检举 → 聚合
		const rep2 = await api('PUT', '/email/reportSpam', { token: reporterToken, body: { emailIds: [spamMailIds[1]], reportCategory: 'fraud', reportReason: '虚假外链诈骗 ' + RUN_TAG } });
		ok(rep2.json?.code === 200, 'B3-1 第二次检举提交成功 (升级为诈骗类别)');
		riskList = await api('POST', '/audit/list', { token: adminToken, body: { warningType: 'risk', num: 1, size: 50, keyword: U.spammer } });
		riskRows = (riskList.json?.data?.list || []).filter(r => r.email === U.spammer);
		const aggRow = riskRows[0];
		ok(aggRow && Number(aggRow.reportedByOthers) >= 2, `B3-2 同周期检举聚合递增 (reportedByOthers=${aggRow?.reportedByOthers})`);
		ok(aggRow && (aggRow.priority === 'CRITICAL' || aggRow.riskLevel === 'high'), `B3-3 多次检举自动升级权重 (priority=${aggRow?.priority}, riskLevel=${aggRow?.riskLevel})`);
		cleanup.auditEmails.push(U.spammer);

		// B4 外部申诉工单落库 (epomail-docs 双轨架构模拟: 未认证用户经静态门户提交 → 直写 D1)
		const appealId = 'APL-TEST-' + RUN_TAG.toUpperCase();
		d1Exec(`INSERT INTO audit_log (ticket_id, email, warning_type, event_type, category, action_text, detail_text, ip, geo, device, device_type, fingerprint, base_ip, base_geo, base_device, base_fingerprint, is_reg_ip, is_multi_ip, active_ip_count, reported_by_others, risk_level, priority, status, recommended_action, match_score, subnet_match, appeal_reason, ban_reason, ban_time, is_internal)
VALUES ('${appealId}', '${U.spammer}', 'appeal', 'appeal_submitted', 'appeal', '{${U.spammer}} 提交工单申诉解除风控封禁', '用户通过外部申诉通道提交表单(测试注入模拟 epomail-docs 门户): 账号被家人误用群发广告，已删除广告内容，申请核验基准解封。', '116.228.89.24', 'Shanghai, CN (Roaming)', 'Edge 128 / Windows 11', 'desktop', 'fp_appeal_${RUN_TAG}', '116.228.89.1', 'Shanghai, CN (Broadband)', 'Edge 128 / Windows 11', 'fp_appeal_${RUN_TAG}', 1, 1, 2, 0, 'medium', 'P1', 'pending', 'approve_appeal', 85, 1, '账号被家人误用群发广告，申请核验基准解封。', '站内群发商业广告', datetime('now'), 1);`);
		const appealProbe = await api('POST', '/audit/list', { token: adminToken, body: { warningType: 'appeal', num: 1, size: 50, keyword: U.spammer } });
		const appealRows = (appealProbe.json?.data?.list || []).filter(r => r.ticketId === appealId);
		ok(appealRows.length === 1 && appealRows[0].status === 'pending', 'B4-1 外部申诉工单进入操作报告·争议申诉板块 (status=pending)');

		// ---------- Phase C: 管理员处置 (操作报告板块) ----------
		section('Phase C · 管理员处置 — 操作报告板块全功能核验');

		// C1 列表与四板块计数
		const fullList = await api('POST', '/audit/list', { token: adminToken, body: { num: 1, size: 50 } });
		const counts = fullList.json?.data?.counts || {};
		const cats = counts.categories || {};
		ok(cats.audit && cats.risk && cats.appeal && cats.ban, `C1-1 四板块计数齐备 (audit=${cats.audit?.total}, risk=${cats.risk?.total}, appeal=${cats.appeal?.total}, ban=${cats.ban?.total})`);
		ok(fullList.json?.data?.mode !== undefined, `C1-2 安全模式自适应返回 (mode=${fullList.json?.data?.mode} → 时间戳完整帧)`);
		const sample = (fullList.json?.data?.list || [])[0] || {};
		ok(sample.ticketNo && sample.identityLevel && sample.finalAuthority !== undefined, `C1-3 工单编号/身分组/终裁权威字段齐备 (${sample.ticketNo}, ${sample.identityLevel}, ${sample.finalAuthority})`);

		// 搜索语法
		const byTicket = await api('POST', '/audit/list', { token: adminToken, body: { keyword: 'ticket:REV-2026-LV102' } });
		ok((byTicket.json?.data?.list || []).some(r => r.ticketId === 'REV-2026-LV102'), 'C1-4 ticket: 前缀定向搜索命中种子工单');
		const byIp = await api('POST', '/audit/list', { token: adminToken, body: { keyword: 'ip:198.51.100.99' } });
		ok((byIp.json?.data?.list || []).some(r => r.ip === '198.51.100.99'), 'C1-5 ip: 前缀定向搜索命中');
		const byLevel = await api('POST', '/audit/list', { token: adminToken, body: { violationLevel: 'lv3', num: 1, size: 50 } });
		ok((byLevel.json?.data?.list || []).every(r => ['P0', 'CRITICAL', 'LV3'].includes((r.priority || '').toUpperCase()) || r.riskLevel === 'high'), 'C1-6 违规等级筛选 (lv3) 过滤正确');

		// C2 异常威胁处置 (若检举链路工单缺失则回退种子站内威胁工单, 保证处置链可独立验证)
		riskList = await api('POST', '/audit/list', { token: adminToken, body: { warningType: 'risk', num: 1, size: 50, keyword: U.spammer } });
		let internalRisk = (riskList.json?.data?.list || []).find(r => r.email === U.spammer);
		if (!internalRisk) {
			const seedRisk = await api('POST', '/audit/list', { token: adminToken, body: { keyword: 'ticket:THR-2026-REP005' } });
			internalRisk = seedRisk.json?.data?.list?.[0];
		}
		const muteRes = await api('POST', '/audit/action', { token: adminToken, body: { id: internalRisk.id, action: 'mute_account', notes: 'E2E: 检举属实，已执行禁言' } });
		ok(muteRes.json?.code === 200, 'C2-1 站内违规用户禁言处置 (mute_account)');
		const afterMute = await api('POST', '/audit/list', { token: adminToken, body: { keyword: 'ticket:' + internalRisk.ticketId } });
		ok(/禁言/.test(afterMute.json?.data?.list?.[0]?.detailText || ''), 'C2-2 处置结果已留痕工单明细 ([处置结果] 禁言)');

		// 外部发信人拉黑 (种子工单 THR-2026-REP012)
		const extRisk = await api('POST', '/audit/list', { token: adminToken, body: { keyword: 'ticket:THR-2026-REP012' } });
		const extRow = extRisk.json?.data?.list?.[0];
		const blRes = await api('POST', '/audit/action', { token: adminToken, body: { id: extRow.id, action: 'blacklist_sender', notes: 'E2E: 核实属实拉黑' } });
		ok(blRes.json?.code === 200, 'C2-3 外部发信地址拉黑处置 (blacklist_sender)');
		const banLedger1 = await api('POST', '/audit/list', { token: adminToken, body: { warningType: 'ban', keyword: 'phishing_scam@external-fake.xyz' } });
		ok((banLedger1.json?.data?.list || []).some(r => r.warningType === 'ban' && r.status === 'banned'), 'C2-4 拉黑同步写入封禁管控台账 (warningType=ban, status=banned)');

		// C3 常规审查处置
		const routine = await api('POST', '/audit/list', { token: adminToken, body: { keyword: 'ticket:REV-2026-LV102' } });
		const routineRow = routine.json?.data?.list?.[0];
		const arcRes = await api('POST', '/audit/action', { token: adminToken, body: { id: routineRow.id, action: 'archive_routine', notes: 'E2E: 例行审查完毕' } });
		const arcAfter = await api('POST', '/audit/list', { token: adminToken, body: { keyword: 'ticket:REV-2026-LV102' } });
		ok(arcRes.json?.code === 200 && arcAfter.json?.data?.list?.[0]?.status === 'expired', 'C3-1 常规审查一键封存归档 (status=expired)');
		const noteRes = await api('POST', '/audit/action', { token: adminToken, body: { id: routineRow.id, action: 'note', notes: 'E2E 审核备忘' } });
		const noteAfter = await api('POST', '/audit/list', { token: adminToken, body: { keyword: 'ticket:REV-2026-LV102' } });
		ok(noteRes.json?.code === 200 && /审核备忘/.test(noteAfter.json?.data?.list?.[0]?.detailText || ''), 'C3-2 管理员审核备忘追加 (note)');
		const extRes = await api('POST', '/audit/action', { token: adminToken, body: { id: routineRow.id, action: 'extend', notes: 'E2E 延期处置' } });
		const extAfter = await api('POST', '/audit/list', { token: adminToken, body: { keyword: 'ticket:REV-2026-LV102' } });
		ok(extRes.json?.code === 200 && /延期处置/.test(extAfter.json?.data?.list?.[0]?.detailText || ''), 'C3-3 管控期限延期处置留痕 (extend)');

		// C4 封禁处置 (对垃圾邮件发送者; 若检举链路工单缺失则挂靠种子威胁工单并以 targetEmail 定向封禁)
		riskList = await api('POST', '/audit/list', { token: adminToken, body: { warningType: 'risk', keyword: U.spammer } });
		let banTarget = (riskList.json?.data?.list || []).find(r => r.email === U.spammer);
		if (!banTarget) {
			const seedBan = await api('POST', '/audit/list', { token: adminToken, body: { keyword: 'ticket:THR-2026-ZS88K1' } });
			banTarget = seedBan.json?.data?.list?.[0];
		}
		const banRes = await api('POST', '/audit/action', { token: adminToken, body: { id: banTarget.id, action: 'ban', targetEmail: U.spammer, notes: 'E2E: 确认违规，执行封禁' } });
		ok(banRes.json?.code === 200, 'C4-1 管理员封禁处置生效 (ban)');
		const bannedLogin = await loginPwd(U.spammer, PWD);
		ok(bannedLogin.json?.code !== 200 && /封禁/.test(bannedLogin.json?.message || ''), `C4-2 被封用户登录被拒 (code=${bannedLogin.json?.code}, "${bannedLogin.json?.message}")`);
		const banLedger2 = await api('POST', '/audit/list', { token: adminToken, body: { warningType: 'ban', keyword: U.spammer } });
		const ledgerRow = (banLedger2.json?.data?.list || []).find(r => r.email === U.spammer && r.warningType === 'ban');
		ok(!!ledgerRow && ledgerRow.status === 'banned', 'C4-3 封禁台账留痕 (永久保留供审计追溯)');

		// C5 申诉研判放行 (approve + purgeOnRelease)
		const appealRow = appealRows[0];
		const adjRes = await api('POST', '/audit/adjudicate', { token: adminToken, body: { id: appealRow.id, action: 'approve', notes: 'E2E: 指纹比对一致，予以放行', purgeOnRelease: true } });
		ok(adjRes.json?.code === 200, 'C5-1 申诉研判放行处置成功 (adjudicate approve)');
		const restoredLogin = await loginPwd(U.spammer, PWD);
		ok(restoredLogin.json?.code === 200 && !!restoredLogin.json?.data?.token, 'C5-2 放行后用户恢复登录能力 (解封生效)');
		const ledgerAfter = await api('POST', '/audit/list', { token: adminToken, body: { warningType: 'ban', keyword: U.spammer } });
		const ledgerAfterRow = (ledgerAfter.json?.data?.list || []).find(r => r.email === U.spammer && r.warningType === 'ban');
		ok(ledgerAfterRow && ledgerAfterRow.status === 'unbanned', 'C5-3 封禁台账同步为已解禁 (status=unbanned, 记录保留)');
		const appealAfter = await api('POST', '/audit/list', { token: adminToken, body: { keyword: 'ticket:' + appealId } });
		ok(/人工研判备注/.test(appealAfter.json?.data?.list?.[0]?.detailText || ''), 'C5-4 研判批注已归档至工单明细');

		// C6 申诉驳回 (种子待审工单 APL-2026-AP77X2)
		const rejSeed = await api('POST', '/audit/list', { token: adminToken, body: { keyword: 'ticket:APL-2026-AP77X2' } });
		const rejRow = rejSeed.json?.data?.list?.[0];
		const rejRes = await api('POST', '/audit/adjudicate', { token: adminToken, body: { id: rejRow.id, action: 'reject', notes: 'E2E: 复核证据确凿，维持封禁' } });
		const rejAfter = await api('POST', '/audit/list', { token: adminToken, body: { keyword: 'ticket:APL-2026-AP77X2' } });
		ok(rejRes.json?.code === 200 && rejAfter.json?.data?.list?.[0]?.status === 'rejected', 'C6-1 申诉驳回维持封禁 (status=rejected)');

		// C7 一键清理非关键历史
		const purgeRes = await api('POST', '/audit/purge', { token: adminToken });
		ok(purgeRes.json?.code === 200, 'C7-1 非关键历史清理接口可用 (/audit/purge)');
		const afterPurge = await api('POST', '/audit/list', { token: adminToken, body: { warningType: 'audit', num: 1, size: 50 } });
		const purgedNormals = (afterPurge.json?.data?.list || []).filter(r => r.warningType === 'audit' && r.riskLevel === 'normal');
		ok(purgedNormals.length === 0, 'C7-2 常规审查 (warningType=audit & riskLevel=normal) 记录已被清理');

		// C8 越权与未认证拦截
		await register(U.plain);
		const plainLogin = await loginPwd(U.plain, PWD);
		const plainToken = plainLogin.json?.data?.token;
		if (plainLogin.json?.data?.userId) cleanup.userIds.push(plainLogin.json.data.userId);
		const plainAudit = await api('POST', '/audit/list', { token: plainToken, body: {} });
		ok(plainAudit.json?.code === 403, `C8-1 普通用户访问操作报告被越权拦截 (code=${plainAudit.json?.code})`);
		const plainAction = await api('POST', '/audit/action', { token: plainToken, body: { id: 1, action: 'note', notes: 'x' } });
		ok(plainAction.json?.code === 403, 'C8-2 普通用户调用风控处置被越权拦截 (403)');
		const noAuth = await api('POST', '/audit/list', { body: {} });
		ok(noAuth.json?.code === 401, 'C8-3 未认证访问操作报告被拒绝 (401)');

	} catch (fatal) {
		fail++;
		failures.push('[FATAL] ' + fatal.message);
		console.error('\n[FATAL] 测试执行中断:', fatal.message);
	} finally {
		// ---------- Phase D: 数据清理 ----------
		section('Phase D · 测试数据清理 (finally 物理删除)');
		try {
			// D1 物理删除测试用户 (含暴力破解受害者 — 通过 D1 反查 userId)
			const lockRow = await d1Query(`SELECT user_id FROM user WHERE email = '${U.lock}'`);
			if (lockRow[0]?.user_id) cleanup.userIds.push(lockRow[0].user_id);
			const ids = [...new Set(cleanup.userIds.filter(Boolean))];
			if (ids.length > 0 && cleanup.adminToken) {
				const del = await api('DELETE', '/user/delete', { token: cleanup.adminToken, query: { userIds: ids.join(',') } });
				ok(del.json?.code === 200, `D1-1 测试用户物理删除 (${ids.length} 个, code=${del.json?.code})`);
				const gone = await loginPwd(U.spammer, PWD);
				ok(gone.json?.code !== 200 || gone.json?.data?.mfaRequired, 'D1-2 已删用户登录失败 (物理删除生效)');
				// 清理 D1-2 验证自产的 login_fail 键，杜绝测试卫生残留
				try {
					execSync(`npx wrangler kv key delete --binding kv "login_fail:${U.spammer}" --local --config wrangler-dev.toml`, {
						cwd: WORKER_DIR, stdio: 'pipe'
					});
				} catch (e) {}
			}

			// D2 清空风控测试期间产生的全部工单并还原种子基线 (audit_log 在空表时自动重新播种 15 条基线)
			d1Exec('DELETE FROM audit_log;');
			const remainProbe = await api('POST', '/audit/list', { token: cleanup.adminToken, body: { num: 1, size: 5 } });
			const remainCount = (remainProbe.json?.data?.counts?.allTotal ?? 0);
			ok(remainCount === 15, `D2-1 测试工单已物理清理且种子基线完整还原 (allTotal=${remainCount}/15, RunTag=${RUN_TAG} 零残留)`);
		} catch (cleanErr) {
			fail++;
			failures.push('[CLEANUP] ' + cleanErr.message);
			console.error('[CLEANUP ERROR]', cleanErr.message);
		}

		// ---------- 汇总 ----------
		console.log('\n================================================================');
		console.log(`=== 测试汇总: ${pass} 通过 / ${fail} 失败 ===`);
		console.log('================================================================');
		if (failures.length > 0) {
			console.log('失败项:');
			failures.forEach(f => console.log('  ✗ ' + f));
			process.exitCode = 1;
		}
	}
}

run();
