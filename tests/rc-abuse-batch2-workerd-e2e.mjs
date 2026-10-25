/**
 * 第二批修复真实 workerd 端到端测试 (Batch-2 Real workerd E2E)
 *
 * 依赖运行中的 wrangler dev（与第一批 rc-abuse-workerd-e2e 相同启动方式）：
 *   RC_INIT_SECRET 必须与 jwt_secret 一致；RC_PERSIST_TO 必须与 --persist-to 一致。
 *
 * 覆盖：
 *   阶段2 R1→R2 申诉全链路（独立台账轮次、原材料保留、驳回后可再申诉、重复申诉去重）
 *   阶段3 purgeOnRelease 真实清理与事实分离（范围收窄、无关案件零波及、批次台账）
 *   阶段4 legacy extend（版本 CAS、终态拒绝、类型校验、决策台账留痕）
 *
 * 测试数据全部物理清理（零假数据残留）。
 */

import fs from 'node:fs';
import path from 'node:path';
import httpModule from 'node:http';
import { execFileSync } from 'node:child_process';

const BASE = process.env.RC_BASE_URL || 'http://127.0.0.1:8799';
const WORKER_DIR = path.resolve('mail-worker');
const INIT_SECRET = process.env.RC_INIT_SECRET;
const PERSIST = process.env.RC_PERSIST_TO;
const EVIDENCE = process.env.RC_EVIDENCE_DIR;

for (const [name, value] of Object.entries({ RC_INIT_SECRET: INIT_SECRET, RC_PERSIST_TO: PERSIST, RC_EVIDENCE_DIR: EVIDENCE })) {
	if (!value) {
		console.error(`Missing required environment variable: ${name}`);
		process.exit(1);
	}
}

const results = [];
let adminToken = null;
function check(label, condition, detail = '') {
	results.push({ label, ok: !!condition, detail });
	console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` :: ${detail}` : ''}`);
}

function d1Rows(sql) {
	const output = execFileSync(process.execPath, [
		path.join(WORKER_DIR, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
		'd1', 'execute', 'epomail', '--local',
		'--persist-to', PERSIST, '--config', 'wrangler-dev.toml',
		'--json', '--command', sql
	], { cwd: WORKER_DIR, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
	const start = output.indexOf('[');
	const parsed = JSON.parse(output.slice(start));
	const last = Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed;
	return last?.results || [];
}

function d1Exec(sql) {
	return d1Rows(sql);
}

async function http(pathname, { method = 'GET', token, body, headers = {} } = {}) {
	const h = { Accept: 'application/json', Connection: 'close', ...headers };
	if (token) h.Authorization = `Bearer ${token}`;
	if (body !== undefined) h['Content-Type'] = 'application/json';
	const payload = body === undefined ? null : JSON.stringify(body);
	const fullPath = pathname.startsWith('/api/') || pathname.startsWith('/cdn-cgi/')
		? pathname
		: `/api${pathname}`;
	return new Promise((resolve, reject) => {
		const req = httpModule.request(`${BASE}${fullPath}`, { method, headers: h, agent: false }, (res) => {
			let text = '';
			res.setEncoding('utf8');
			res.on('data', chunk => { text += chunk; });
			res.on('end', () => {
				let json = null;
				try { json = JSON.parse(text); } catch (_) {}
				resolve({ status: res.statusCode, body: json, text });
			});
		});
		req.on('error', reject);
		if (payload) req.write(payload);
		req.end();
	});
}

function snapshot(name, value) {
	fs.mkdirSync(EVIDENCE, { recursive: true });
	fs.writeFileSync(path.join(EVIDENCE, name), JSON.stringify(value, null, 2));
}

function seedUser(userId, email, status = 0) {
	d1Exec(`INSERT INTO user (user_id,email,password,salt,type,status,is_del)
	VALUES (${userId},'${email}','pbkdf2:100000:wYbOCP3rv6muivmiYwmd/oXXroIcxp7/VcB02M+Ac5w=','ZmUlWbNgsFel3E0oxnPHcA==',1,${status},0);`);
}

async function adjudicate(id, action, version, notes, extra = {}) {
	return http('/audit/adjudicate', {
		method: 'POST', token: adminToken,
		body: { id, action, version, notes, ...extra }
	});
}

// ---------------------------------------------------------------------------
// 0. init + admin login
// ---------------------------------------------------------------------------
const init = await http('/api/init', { method: 'POST', headers: { 'X-Init-Secret': INIT_SECRET } });
check('batch2 e2e init responds success', init.status === 200 && init.text === 'success', `${init.status} ${init.text.slice(0, 80)}`);
const adminLogin = await http('/api/login', { method: 'POST', body: { email: 'admin@example.com', password: (process.env.EPOMAIL_LIVE_E2E_ADMIN_PASSWORD || process.env.EPOMAIL_E2E_ADMIN_PASSWORD || '') } });
adminToken = adminLogin.body?.data?.token;
check('batch2 e2e admin login', !!adminToken, `code=${adminLogin.body?.code}`);

// ===========================================================================
// 1. 阶段2: R1 → 驳回 → R2 全链路（独立台账轮次 + 原材料保留）
// ===========================================================================
{
	seedUser(19400, 'rc-b2-appeal@example.com', 0);
	d1Exec(`INSERT INTO audit_log (id,ticket_id,user_id,email,warning_type,event_type,category,action_text,status,version,is_internal)
	VALUES (19401,'SRC-B2',19400,'rc-b2-appeal@example.com','risk','spam','security','synthetic source case','active',1,1);`);

	const banRes = await adjudicate(19401, 'ban_account', 1, 'batch2 ban');
	check('B2 source ban succeeds with restricted token',
		banRes.body?.code === 200 && !!banRes.body?.data?.restrictedToken,
		`code=${banRes.body?.code}`);
	const banRow = d1Rows(`SELECT id FROM audit_log WHERE original_decision_id='19401' AND warning_type='ban';`)[0];
	check('B2 derived penalty row linked to source', !!banRow, JSON.stringify(banRow));

	const restrictedToken = banRes.body.data.restrictedToken;

	// R1 提交
	const r1 = await http('/notice/restricted/appeal', {
		method: 'POST', token: restrictedToken,
		body: { appealReason: 'R1 first appeal text: this is my formal appeal for review.' }
	});
	check('B2 R1 appeal submitted', r1.body?.code === 200, `code=${r1.body?.code} msg=${r1.body?.message || r1.body?.data?.message}`);
	check('B2 R1 returns stable appeal identity and round',
		!!r1.body?.data?.appealId && r1.body?.data?.appealRound === 1,
		`appealId=${r1.body?.data?.appealId} round=${r1.body?.data?.appealRound}`);

	const r1Ledger = d1Rows(`SELECT appeal_id, round, status, content FROM audit_appeal WHERE case_id=${banRow.id} ORDER BY round;`);
	check('B2 R1 ledger row created with verbatim content',
		r1Ledger.length === 1 && r1Ledger[0].round === 1 && r1Ledger[0].status === 'pending' &&
		r1Ledger[0].content === 'R1 first appeal text: this is my formal appeal for review.',
		JSON.stringify(r1Ledger));

	// 重复申诉去重
	const dup = await http('/notice/restricted/appeal', {
		method: 'POST', token: restrictedToken,
		body: { appealReason: 'duplicate appeal attempt should be blocked.' }
	});
	check('B2 duplicate appeal while pending is blocked', dup.body?.code === 400, `code=${dup.body?.code}`);

	// R1 驳回
	const banVersion1 = d1Rows(`SELECT version FROM audit_log WHERE id=${banRow.id};`)[0].version;
	const rejectRes = await adjudicate(banRow.id, 'reject_appeal', banVersion1, 'R1 rejected after review');
	check('B2 R1 rejection succeeds', rejectRes.body?.code === 200, `code=${rejectRes.body?.code}`);

	const afterReject = d1Rows(`SELECT appeal_reason, version, status FROM audit_log WHERE id=${banRow.id};`)[0];
	const ledgerAfterReject = d1Rows(`SELECT round, status, content FROM audit_appeal WHERE case_id=${banRow.id} ORDER BY round;`);
	check('B2 rejection clears pending marker and keeps penalty banned',
		afterReject.appeal_reason === null && afterReject.status === 'banned',
		JSON.stringify(afterReject));
	check('B2 R1 ledger records rejected outcome with original text intact',
		ledgerAfterReject.length === 1 && ledgerAfterReject[0].status === 'rejected' &&
		ledgerAfterReject[0].content === 'R1 first appeal text: this is my formal appeal for review.',
		JSON.stringify(ledgerAfterReject));

	// R2 再申诉（新证据）
	const r2 = await http('/notice/restricted/appeal', {
		method: 'POST', token: restrictedToken,
		body: { appealReason: 'R2 second appeal with new subscription-source evidence attached.' }
	});
	check('B2 R2 appeal accepted after R1 rejection', r2.body?.code === 200, `code=${r2.body?.code}`);
	check('B2 R2 round is 2', r2.body?.data?.appealRound === 2, `round=${r2.body?.data?.appealRound}`);

	const ledgerR2 = d1Rows(`SELECT appeal_id, round, status, content FROM audit_appeal WHERE case_id=${banRow.id} ORDER BY round;`);
	check('B2 R1 and R2 are independent ledger rows, R1 content untouched',
		ledgerR2.length === 2 &&
		ledgerR2[0].round === 1 && ledgerR2[0].content.includes('R1 first appeal text') &&
		ledgerR2[1].round === 2 && ledgerR2[1].content.includes('R2 second appeal') && ledgerR2[1].status === 'pending',
		JSON.stringify(ledgerR2));

	// R2 批准
	const banVersion2 = d1Rows(`SELECT version FROM audit_log WHERE id=${banRow.id};`)[0].version;
	const approveRes = await adjudicate(banRow.id, 'approve_appeal', banVersion2, 'R2 approved');
	check('B2 R2 approval succeeds', approveRes.body?.code === 200, `code=${approveRes.body?.code}`);
	const ledgerFinal = d1Rows(`SELECT round, status FROM audit_appeal WHERE case_id=${banRow.id} ORDER BY round;`);
	check('B2 R2 approved in ledger, R1 stays rejected',
		ledgerFinal[0].status === 'rejected' && ledgerFinal[1].status === 'approved',
		JSON.stringify(ledgerFinal));

	snapshot('batch2-appeal-traceability.json', { banRow: banRow.id, r1: r1.body?.data, r2: r2.body?.data, ledgerFinal });
}

// ===========================================================================
// 2. 阶段3: purgeOnRelease 能力边界（真实 HTTP）
//    用户确定：无成文政策依据 → 不再可执行；显式请求明确拒绝、零副作用；
//    普通解封零清理；独立 /audit/purge 维护入口按保留期/引用保护单独验证。
// ===========================================================================
{
	seedUser(19500, 'rc-b2-purge@example.com', 0);
	d1Exec(`INSERT INTO audit_log (id,ticket_id,user_id,email,warning_type,event_type,category,action_text,status,version,is_internal,ip,geo,device,fingerprint)
	VALUES (19501,'SRC-PURGE',19500,'rc-b2-purge@example.com','risk','spam','security','source case with identity','active',1,1,'203.0.113.50','CN','Chrome/Win','fp-19501');`);
	// 同邮箱无关 audit 工单（旧缺陷会被波及改写）
	d1Exec(`INSERT INTO audit_log (id,ticket_id,user_id,email,warning_type,event_type,category,action_text,status,version,is_internal,ip,geo)
	VALUES (19602,'AUD-UNREL',19500,'rc-b2-purge@example.com','audit','routine','security','unrelated routine case','active',1,1,'203.0.113.51','CN');`);

	const banRes = await adjudicate(19501, 'ban_account', 1, 'purge scenario ban');
	check('B3 purge source ban succeeds', banRes.body?.code === 200, `code=${banRes.body?.code}`);
	const penalty = d1Rows(`SELECT id, version FROM audit_log WHERE original_decision_id='19501' AND warning_type='ban';`)[0];
	check('B3 penalty row created', !!penalty, JSON.stringify(penalty));
	// 为该处罚行补齐身份特征字段，使「普通放行是否误删身份字段」可被真实观测
	d1Exec(`UPDATE audit_log SET ip='203.0.113.70', geo='CN', device='Edge/Win', fingerprint='fp-penalty-19501' WHERE id=${penalty.id};`);

	const restrictedToken = banRes.body.data.restrictedToken;
	await http('/notice/restricted/appeal', {
		method: 'POST', token: restrictedToken,
		body: { appealReason: 'Purge scenario appeal body for release decision.' }
	});
	const freshVersion = d1Rows(`SELECT version FROM audit_log WHERE id=${penalty.id};`)[0].version;

	const beforeReject = {
		penalty: d1Rows(`SELECT * FROM audit_log WHERE id=${penalty.id};`)[0],
		source: d1Rows(`SELECT * FROM audit_log WHERE id=19501;`)[0],
		unrelated: d1Rows(`SELECT * FROM audit_log WHERE id=19602;`)[0],
		appeal: d1Rows(`SELECT * FROM audit_appeal WHERE case_id=${penalty.id} ORDER BY round;`),
		decisions: d1Rows('SELECT count(*) AS c FROM audit_decision;')[0].c,
		outbox: d1Rows(`SELECT count(*) AS c FROM notification_outbox WHERE recipient='rc-b2-purge@example.com';`)[0].c,
		purgeBatches: d1Rows('SELECT count(*) AS c FROM audit_purge_batch;')[0].c
	};

	// 3A：显式请求 → 准确拒绝 + 零副作用
	const approveRes = await adjudicate(penalty.id, 'approve_appeal', freshVersion, 'release with purge', { purgeOnRelease: true });
	check('B3 explicit purgeOnRelease request rejected with 400',
		approveRes.body?.code === 400 && /暂不提供「放行即清理」能力/.test(approveRes.body?.message || ''),
		`code=${approveRes.body?.code} msg=${(approveRes.body?.message || '').slice(0, 40)}`);

	const afterReject = {
		penalty: d1Rows(`SELECT * FROM audit_log WHERE id=${penalty.id};`)[0],
		source: d1Rows(`SELECT * FROM audit_log WHERE id=19501;`)[0],
		unrelated: d1Rows(`SELECT * FROM audit_log WHERE id=19602;`)[0],
		appeal: d1Rows(`SELECT * FROM audit_appeal WHERE case_id=${penalty.id} ORDER BY round;`),
		decisions: d1Rows('SELECT count(*) AS c FROM audit_decision;')[0].c,
		outbox: d1Rows(`SELECT count(*) AS c FROM notification_outbox WHERE recipient='rc-b2-purge@example.com';`)[0].c,
		purgeBatches: d1Rows('SELECT count(*) AS c FROM audit_purge_batch;')[0].c
	};
	check('B3 rejection leaves penalty row byte-identical (no unban, no PURGED, no field purge)',
		JSON.stringify(afterReject.penalty) === JSON.stringify(beforeReject.penalty),
		`status=${afterReject.penalty.status} circuit=${afterReject.penalty.circuit_status}`);
	check('B3 rejection leaves source/unrelated cases untouched',
		JSON.stringify(afterReject.source) === JSON.stringify(beforeReject.source) &&
		JSON.stringify(afterReject.unrelated) === JSON.stringify(beforeReject.unrelated),
		`source=${afterReject.source.status} unrelated=${afterReject.unrelated.status}`);
	check('B3 rejection leaves appeal ledger untouched',
		JSON.stringify(afterReject.appeal) === JSON.stringify(beforeReject.appeal),
		JSON.stringify(afterReject.appeal.map(a => a.status)));
	check('B3 rejection writes no decision/outbox/purge side effects',
		afterReject.decisions === beforeReject.decisions &&
		afterReject.outbox === beforeReject.outbox &&
		afterReject.purgeBatches === beforeReject.purgeBatches,
		JSON.stringify({ decisions: afterReject.decisions, outbox: afterReject.outbox, purgeBatches: afterReject.purgeBatches }));

	// 3B：普通放行 → 正常解封，零清理、零虚假脱敏记录
	const plainVersion = d1Rows(`SELECT version FROM audit_log WHERE id=${penalty.id};`)[0].version;
	const plainRes = await adjudicate(penalty.id, 'approve_appeal', plainVersion, 'release without purge');
	check('B3 plain approve (no purge flag) succeeds', plainRes.body?.code === 200, `code=${plainRes.body?.code}`);

	const penaltyAfter = d1Rows(`SELECT circuit_status, status, ip, geo, device, fingerprint, detail_text FROM audit_log WHERE id=${penalty.id};`)[0];
	const sourceAfter = d1Rows(`SELECT circuit_status, status, ip, geo, device, fingerprint FROM audit_log WHERE id=19501;`)[0];
	const unrelatedAfter = d1Rows(`SELECT circuit_status, status, ip FROM audit_log WHERE id=19602;`)[0];

	check('B3 plain release performs zero cleanup (no PURGED, identity fields retained)',
		penaltyAfter.status === 'resolved' && penaltyAfter.circuit_status === 'NORMAL' &&
		penaltyAfter.ip === '203.0.113.70' && penaltyAfter.fingerprint === 'fp-penalty-19501',
		JSON.stringify({ status: penaltyAfter.status, circuit: penaltyAfter.circuit_status, ip: penaltyAfter.ip }));
	check('B3 plain release emits no false cleanup/desensitization note',
		!penaltyAfter.detail_text.includes('[隐私清理]') && !penaltyAfter.detail_text.includes('已脱敏'));
	check('B3 source case keeps its own outcome and identity fields',
		sourceAfter.status === 'resolved' && sourceAfter.circuit_status === 'NORMAL' &&
		sourceAfter.ip === '203.0.113.50' && sourceAfter.fingerprint === 'fp-19501',
		JSON.stringify(sourceAfter));
	check('B3 unrelated same-email case NOT rewritten',
		unrelatedAfter.status === 'active' && unrelatedAfter.circuit_status === 'NORMAL' && unrelatedAfter.ip === '203.0.113.51',
		JSON.stringify(unrelatedAfter));
	check('B3 plain release creates no purge batch',
		d1Rows('SELECT count(*) AS c FROM audit_purge_batch;')[0].c === beforeReject.purgeBatches);

	// 3C：独立维护清理入口 /audit/purge —— 管理员可达，且按保留期保护（今日合成数据不得被删）
	const purgeRes = await http('/audit/purge', { method: 'POST', token: adminToken });
	check('B3 maintenance /audit/purge reachable by admin', purgeRes.body?.code === 200, `code=${purgeRes.body?.code}`);
	const auditRowsAfterPurge = d1Rows(`SELECT id FROM audit_log WHERE id=19602;`);
	check('B3 maintenance purge respects 180-day retention (fresh rows retained)', auditRowsAfterPurge.length === 1);

	snapshot('batch2-purge-facts.json', { rejection: afterReject.penalty, plainRelease: penaltyAfter, source: sourceAfter, unrelated: unrelatedAfter });
}

// ===========================================================================
// 3. 阶段4: legacy extend（真实 HTTP：版本 CAS、终态拒绝、类型校验）
// ===========================================================================
{
	d1Exec(`INSERT INTO audit_log (id,ticket_id,user_id,email,warning_type,event_type,category,action_text,status,version,is_internal,detail_text)
	VALUES (19703,'AUD-EXT','19500','rc-b2-purge@example.com','audit','routine','security','extendable routine case','active',1,1,'routine baseline');`);
	d1Exec(`INSERT INTO audit_log (id,ticket_id,user_id,email,warning_type,event_type,category,action_text,status,version,is_internal,detail_text)
	VALUES (19704,'AUD-CLOSED','19500','rc-b2-purge@example.com','audit','routine','security','closed routine case','resolved',1,1,'closed fact');`);
	d1Exec(`INSERT INTO audit_log (id,ticket_id,user_id,email,warning_type,event_type,category,action_text,status,version,is_internal,detail_text)
	VALUES (19705,'BAN-NEXT','19500','rc-b2-purge@example.com','ban','admin_ban','security','banned penalty row','banned',1,1,'penalty fact');`);

	const extRes = await http('/audit/action', {
		method: 'POST', token: adminToken,
		body: { id: 19703, action: 'extend', version: 1, notes: 'extend for deeper review' }
	});
	check('B4 valid extend succeeds via real HTTP', extRes.body?.code === 200, `code=${extRes.body?.code}`);
	const case19703 = d1Rows(`SELECT version, resolved_time, detail_text FROM audit_log WHERE id=19703;`)[0];
	check('B4 extend increments version, keeps resolved_time null, appends marker',
		case19703.version === 2 && case19703.resolved_time === null && case19703.detail_text.includes('[延期处置]'),
		JSON.stringify(case19703));
	const extendDecision = d1Rows(`SELECT action_type FROM audit_decision WHERE case_id=19703 AND action_type='extend';`);
	check('B4 extension recorded in decision ledger', extendDecision.length === 1, JSON.stringify(extendDecision));

	const staleRes = await http('/audit/action', {
		method: 'POST', token: adminToken,
		body: { id: 19703, action: 'extend', version: 1, notes: 'stale version attempt' }
	});
	check('B4 stale version extend rejected with 409', staleRes.body?.code === 409, `code=${staleRes.body?.code}`);

	const closedRes = await http('/audit/action', {
		method: 'POST', token: adminToken,
		body: { id: 19704, action: 'extend', version: 1, notes: 'illegal terminal modify' }
	});
	check('B4 terminal (resolved) case extend rejected', closedRes.body?.code === 409, `code=${closedRes.body?.code}`);
	const case19704 = d1Rows(`SELECT version, detail_text FROM audit_log WHERE id=19704;`)[0];
	check('B4 terminal case untouched',
		case19704.version === 1 && !case19704.detail_text.includes('illegal terminal modify'),
		JSON.stringify(case19704));

	const banRes2 = await http('/audit/action', {
		method: 'POST', token: adminToken,
		body: { id: 19705, action: 'extend', version: 1, notes: 'illegal ban extend' }
	});
	check('B4 ban-type case extend rejected with 400', banRes2.body?.code === 400, `code=${banRes2.body?.code}`);

	snapshot('batch2-extend-guards.json', { case19703, case19704 });
}

// ---------------------------------------------------------------------------
// 4. 物理清理合成数据（零假数据残留）
// ---------------------------------------------------------------------------
const cleanup = d1Exec(`
	DELETE FROM audit_appeal WHERE case_id IN (19401, 19501, 19602, 19703, 19704, 19705) OR case_id IN (SELECT id FROM audit_log WHERE email LIKE 'rc-b2-%');
	DELETE FROM audit_decision WHERE case_id IN (SELECT id FROM audit_log WHERE email LIKE 'rc-b2-%');
	DELETE FROM notification_outbox WHERE recipient LIKE 'rc-b2-%';
	DELETE FROM one_time_exchange_code WHERE email LIKE 'rc-b2-%';
	DELETE FROM audit_log WHERE email LIKE 'rc-b2-%';
	DELETE FROM user WHERE email LIKE 'rc-b2-%';
`);
const leftovers = d1Rows(`SELECT
	(SELECT count(*) FROM audit_log WHERE email LIKE 'rc-b2-%') AS a,
	(SELECT count(*) FROM user WHERE email LIKE 'rc-b2-%') AS u,
	(SELECT count(*) FROM notification_outbox WHERE recipient LIKE 'rc-b2-%') AS o,
	(SELECT count(*) FROM audit_appeal WHERE email LIKE 'rc-b2-%') AS x;`)[0];
check('batch2 synthetic HTTP/D1 fixture physically cleaned',
	leftovers.a === 0 && leftovers.u === 0 && leftovers.o === 0 && leftovers.x === 0,
	JSON.stringify(leftovers));

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} batch2 workerd checks passed`);
snapshot('batch2-workerd-e2e-summary.json', results);
if (failed.length > 0) {
	console.error('FAILED:', failed.map(f => f.label).join(' | '));
	process.exit(1);
}
