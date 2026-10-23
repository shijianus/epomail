import fs from 'node:fs';
import path from 'node:path';
import httpModule from 'node:http';
import { execFileSync } from 'node:child_process';

const BASE = process.env.RC_BASE_URL || 'http://127.0.0.1:8799';
const WORKER_DIR = path.resolve('mail-worker');
const INIT_SECRET = process.env.RC_INIT_SECRET;
const PERSIST = process.env.RC_PERSIST_TO;
const EVIDENCE = process.env.RC_EVIDENCE_DIR;

for (const [name, value] of Object.entries({
	RC_INIT_SECRET: INIT_SECRET,
	RC_PERSIST_TO: PERSIST,
	RC_EVIDENCE_DIR: EVIDENCE
})) {
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

// ---------------------------------------------------------------------------
// 1. Init (idempotent), admin login, HTTP route availability
// ---------------------------------------------------------------------------
const init = await http('/api/init', { method: 'POST', headers: { 'X-Init-Secret': INIT_SECRET } });
check('real workerd init responds success', init.status === 200 && init.text === 'success', `${init.status} ${init.text.slice(0, 80)}`);

const adminLogin = await http('/api/login', {
	method: 'POST', body: { email: 'admin@example.com', password: '123456' }
});
adminToken = adminLogin.body?.data?.token;
check('admin login issues a real session token', !!adminToken, `http=${adminLogin.status} code=${adminLogin.body?.code}`);

// Normal user for F6 negative matrix
d1Exec(`INSERT INTO user (user_id,email,password,salt,type,status,is_del)
VALUES (9000,'rc-normal@example.com','pbkdf2:100000:wYbOCP3rv6muivmiYwmd/oXXroIcxp7/VcB02M+Ac5w=','ZmUlWbNgsFel3E0oxnPHcA==',1,0,0);`);
const normalLogin = await http('/api/login', {
	method: 'POST', body: { email: 'rc-normal@example.com', password: '123456' }
});
const normalToken = normalLogin.body?.data?.token;
check('normal user login issues a session token', !!normalToken, `code=${normalLogin.body?.code}`);

const schedGet = await http('/api/scheduled');
check('F6 GET /api/scheduled is rejected with 405', schedGet.status === 405, `http=${schedGet.status}`);
const schedAnon = await http('/api/scheduled', { method: 'POST' });
check('F6 anonymous POST is rejected with 401', schedAnon.status === 401, `http=${schedAnon.status}`);
const schedNormal = await http('/api/scheduled', { method: 'POST', token: normalToken });
check('F6 normal user POST is forbidden with 403', schedNormal.status === 403, `http=${schedNormal.status}`);
const schedAdmin = await http('/api/scheduled', { method: 'POST', token: adminToken });
check('F6 verified admin POST succeeds', schedAdmin.status === 200, `http=${schedAdmin.status}`);
const schedSecret = await http('/api/scheduled', {
	method: 'POST', headers: { 'x-scheduled-secret': INIT_SECRET }
});
check('F6 system secret POST succeeds', schedSecret.status === 200, `http=${schedSecret.status}`);

// The Wrangler-owned path is recorded, not asserted as product behavior.
const cdn = await http('/cdn-cgi/handler/scheduled', { method: 'POST' });
console.log(`INFO  /cdn-cgi/handler/scheduled status=${cdn.status} body=${cdn.text.slice(0, 120)}`);

// ---------------------------------------------------------------------------
// 2. F2: empty HTTP list must not seed
// ---------------------------------------------------------------------------
const emptyList = await http('/audit/list', { token: adminToken });
const emptyCount = d1Rows('SELECT count(*) AS c FROM audit_log;')[0].c;
check('F2 empty HTTP list returns zero rows', emptyList.body?.data?.list?.length === 0 && emptyList.body?.data?.total === 0,
	`list=${emptyList.body?.data?.list?.length} total=${emptyList.body?.data?.total}`);
check('F2 empty HTTP list leaves audit_log at zero', emptyCount === 0, `db=${emptyCount}`);
for (const query of ['?page=2&size=5', '?warningType=risk&status=active', '?keyword=REV-2026']) {
	await http(`/audit/list${query}`, { token: adminToken });
}
check('F2 repeated/paged/filtered reads still leave audit_log at zero',
	d1Rows('SELECT count(*) AS c FROM audit_log;')[0].c === 0);

// ---------------------------------------------------------------------------
// 3. Seed synthetic users/cases through D1, then use real adjudication HTTP
// ---------------------------------------------------------------------------
function seedUser(userId, email, status = 0) {
	d1Exec(`INSERT INTO user (user_id,email,password,salt,type,status,is_del)
	VALUES (${userId},'${email}','pbkdf2:100000:wYbOCP3rv6muivmiYwmd/oXXroIcxp7/VcB02M+Ac5w=','ZmUlWbNgsFel3E0oxnPHcA==',1,${status},0);`);
}
function seedCase(id, userId, email, ticket, overrides = '') {
	d1Exec(`INSERT INTO audit_log (id,ticket_id,user_id,email,warning_type,event_type,category,action_text,status,version,is_internal ${overrides ? ',' + Object.keys(overrides).join(',') : ''})
	VALUES (${id},'${ticket}',${userId},'${email}','risk','spam','security','synthetic case','active',1,1${overrides ? ',' + Object.values(overrides).map(v => v === null ? 'NULL' : `'${v}'`).join(',') : ''});`);
}

async function adjudicate(id, action, version, notes, extra = {}) {
	return http('/audit/adjudicate', {
		method: 'POST', token: adminToken,
		body: { id, action, version, notes, ...extra }
	});
}

async function banPair(userId, email, caseE, caseF, tokenLabel) {
	seedUser(userId, email, 0);
	seedCase(caseE, userId, email, `SRC-${caseE}`);
	seedCase(caseF, userId, email, `SRC-${caseF}`);
	const banE = await adjudicate(caseE, 'ban_account', 1, `ban E ${caseE}`);
	const banF = await adjudicate(caseF, 'ban_account', 1, `ban F ${caseF}`);
	check(`${tokenLabel} first ban succeeds`, banE.body?.code === 200 && !!banE.body?.data?.restrictedToken,
		`code=${banE.body?.code} token=${!!banE.body?.data?.restrictedToken}`);
	check(`${tokenLabel} second ban succeeds`, banF.body?.code === 200 && !!banF.body?.data?.restrictedToken,
		`code=${banF.body?.code}`);
	const bans = d1Rows(`SELECT id,status,original_decision_id,ticket_id,version,appeal_reason
		FROM audit_log WHERE email='${email}' AND warning_type='ban' ORDER BY id;`);
	check(`${tokenLabel} creates two independently linked active bans`,
		bans.length === 2 && bans.every(b => b.status === 'banned') &&
		bans.some(b => String(b.original_decision_id) === String(caseE)) &&
		bans.some(b => String(b.original_decision_id) === String(caseF)),
		JSON.stringify(bans));
	const bE = bans.find(b => String(b.original_decision_id) === String(caseE));
	const bF = bans.find(b => String(b.original_decision_id) === String(caseF));
	return { banERes: banE, banFRes: banF, banE: bE, banF: bF, bans };
}

// Forward order E then F
const forward = await banPair(9100, 'rc-e2e@example.com', 9101, 9102, 'E/F');
const tokenE = forward.banERes.body.data.restrictedToken;
check('E credential binds to case E at issuance', forward.banERes.body?.data?.version === 2, `version=${forward.banERes.body?.data?.version}`);

// Process the internal final-notice outbox through the product scheduled entry.
const schedAfterBan = await http('/api/scheduled', { method: 'POST', token: adminToken });
const deliveredOutbox = d1Rows(`SELECT case_id,status FROM notification_outbox
	WHERE recipient='rc-e2e@example.com' AND case_id IN (9101,9102) ORDER BY case_id;`);
check('internal final notices are delivered by the scheduled outbox processor',
	schedAfterBan.status === 200 && deliveredOutbox.length === 2 && deliveredOutbox.every(r => r.status === 'delivered'),
	JSON.stringify(deliveredOutbox));

const bannedLogin = await http('/api/login', {
	method: 'POST', body: { email: 'rc-e2e@example.com', password: '123456' }
});
check('banned user login returns only the restricted notice channel',
	bannedLogin.body?.data?.isRestricted === true && !!bannedLogin.body?.data?.restrictedToken && !!bannedLogin.body?.data?.code,
	`code=${bannedLogin.body?.code} restricted=${bannedLogin.body?.data?.isRestricted}`);
const exchange = await http('/notice/restricted/exchange', {
	method: 'POST', body: { code: bannedLogin.body?.data?.code }
});
check('one-time restricted exchange code is consumed successfully',
	exchange.body?.code === 200 && !!exchange.body?.data?.restrictedToken,
	`code=${exchange.body?.code}`);
const exchangeReplay = await http('/notice/restricted/exchange', {
	method: 'POST', body: { code: bannedLogin.body?.data?.code }
});
check('one-time restricted exchange code cannot be replayed',
	exchangeReplay.body?.code === 401,
	`code=${exchangeReplay.body?.code}`);

const restrictedSched = await http('/api/scheduled', { method: 'POST', token: tokenE });
check('F6 restricted_notice token is forbidden from scheduled trigger', restrictedSched.status === 403,
	`http=${restrictedSched.status}`);

const viewE = await http('/notice/restricted/view', { token: tokenE });
check('E restricted view resolves E penalty, not newest F',
	viewE.body?.data?.caseId === forward.banE.id && viewE.body?.data?.boundCaseId === 9101,
	`caseId=${viewE.body?.data?.caseId} bound=${viewE.body?.data?.boundCaseId}`);
check('E restricted view exposes E ticket and no fabricated reason code',
	viewE.body?.data?.ticketId === forward.banE.ticket_id && viewE.body?.data?.reasonCode === null,
	`ticket=${viewE.body?.data?.ticketId} reason=${viewE.body?.data?.reasonCode}`);

const appealE = await http('/notice/restricted/appeal', {
	method: 'POST', token: tokenE, body: { appealReason: 'This appeal is for synthetic case E only.' }
});
check('E restricted appeal binds to E penalty',
	appealE.body?.code === 200 && appealE.body?.data?.caseId === forward.banE.id && appealE.body?.data?.boundCaseId === 9101,
	`code=${appealE.body?.code} case=${appealE.body?.data?.caseId}`);
const afterAppealE = d1Rows(`SELECT id,appeal_reason,version FROM audit_log WHERE id IN (${forward.banE.id},${forward.banF.id}) ORDER BY id;`);
check('E appeal is stored on E only',
	!!afterAppealE.find(r => r.id === forward.banE.id)?.appeal_reason &&
	afterAppealE.find(r => r.id === forward.banF.id)?.appeal_reason === null,
	JSON.stringify(afterAppealE));
const versionEAfterAppeal = afterAppealE.find(r => r.id === forward.banE.id).version;

const approveE = await adjudicate(forward.banE.id, 'approve_appeal', versionEAfterAppeal, 'approve E only');
check('approving E succeeds', approveE.body?.code === 200, `code=${approveE.body?.code} ${approveE.body?.message || ''}`);
const afterApproveE = d1Rows(`SELECT id,status FROM audit_log WHERE id IN (${forward.banE.id},${forward.banF.id}) ORDER BY id;`);
const userAfterE = d1Rows("SELECT status FROM user WHERE user_id=9100;")[0].status;
check('E is lifted while F remains active and user stays restricted',
	afterApproveE.find(r => r.id === forward.banE.id)?.status !== 'banned' &&
	afterApproveE.find(r => r.id === forward.banF.id)?.status === 'banned' && userAfterE === 1,
	JSON.stringify({ afterApproveE, userAfterE }));

const tokenF = forward.banFRes.body.data.restrictedToken;
const appealF = await http('/notice/restricted/appeal', {
	method: 'POST', token: tokenF, body: { appealReason: 'This appeal is for synthetic case F only.' }
});
check('F credential still binds to F after E is lifted', appealF.body?.data?.caseId === forward.banF.id,
	`case=${appealF.body?.data?.caseId}`);
const versionFAfterAppeal = d1Rows(`SELECT version FROM audit_log WHERE id=${forward.banF.id};`)[0].version;
const approveF = await adjudicate(forward.banF.id, 'approve_appeal', versionFAfterAppeal, 'approve F only');
const afterApproveF = d1Rows(`SELECT status FROM user WHERE user_id=9100;`)[0].status;
check('approving F restores the user after both penalties are lifted',
	approveF.body?.code === 200 && afterApproveF === 0, `code=${approveF.body?.code} user=${afterApproveF}`);

// Reverse order F then E
const reverse = await banPair(9200, 'rc-reverse@example.com', 9201, 9202, 'reverse');
const reverseTokenF = reverse.banFRes.body.data.restrictedToken;
const reverseViewF = await http('/notice/restricted/view', { token: reverseTokenF });
check('reverse: F credential resolves F penalty', reverseViewF.body?.data?.caseId === reverse.banF.id,
	`case=${reverseViewF.body?.data?.caseId}`);
const reverseAppealF = await http('/notice/restricted/appeal', {
	method: 'POST', token: reverseTokenF, body: { appealReason: 'Reverse-order appeal for synthetic case F.' }
});
check('reverse: F appeal is stored on F',
	reverseAppealF.body?.data?.caseId === reverse.banF.id &&
	!!d1Rows(`SELECT appeal_reason FROM audit_log WHERE id=${reverse.banF.id};`)[0].appeal_reason);
const reverseVersionF = d1Rows(`SELECT version FROM audit_log WHERE id=${reverse.banF.id};`)[0].version;
await adjudicate(reverse.banF.id, 'approve_appeal', reverseVersionF, 'reverse approve F');
const reverseAfterF = d1Rows(`SELECT id,status FROM audit_log WHERE id IN (${reverse.banE.id},${reverse.banF.id}) ORDER BY id;`);
check('reverse: lifting F leaves E active and user restricted',
	reverseAfterF.find(r => r.id === reverse.banF.id)?.status !== 'banned' &&
	reverseAfterF.find(r => r.id === reverse.banE.id)?.status === 'banned' &&
	d1Rows('SELECT status FROM user WHERE user_id=9200;')[0].status === 1,
	JSON.stringify(reverseAfterF));
const reverseTokenE = reverse.banERes.body.data.restrictedToken;
await http('/notice/restricted/appeal', {
	method: 'POST', token: reverseTokenE, body: { appealReason: 'Reverse-order appeal for synthetic case E.' }
});
const reverseVersionE = d1Rows(`SELECT version FROM audit_log WHERE id=${reverse.banE.id};`)[0].version;
await adjudicate(reverse.banE.id, 'approve_appeal', reverseVersionE, 'reverse approve E');
check('reverse: lifting E finally restores the user',
	d1Rows('SELECT status FROM user WHERE user_id=9200;')[0].status === 0);

// ---------------------------------------------------------------------------
// 4. Legacy "ID.0" link through real HTTP unban
// ---------------------------------------------------------------------------
seedUser(9300, 'rc-legacy@example.com', 1);
seedCase(9301, 9300, 'rc-legacy@example.com', 'LEGACY-SRC');
d1Exec(`INSERT INTO audit_log (id,ticket_id,user_id,email,warning_type,event_type,category,action_text,status,version,is_internal,original_decision_id,ban_time)
VALUES (9302,'LEGACY-BAN',9300,'rc-legacy@example.com','ban','admin_ban','security','legacy linked ban','banned',1,1,'9301.0','2026-01-01T00:00:00Z');`);
const legacyUnban = await adjudicate(9301, 'unban', 1, 'unban legacy ID.0 link');
const legacyState = d1Rows('SELECT id,status FROM audit_log WHERE id IN (9301,9302) ORDER BY id;');
check('legacy "9301.0" link allows source-case unban',
	legacyUnban.body?.code === 200 &&
	legacyState.find(r => r.id === 9302)?.status !== 'banned' &&
	d1Rows('SELECT status FROM user WHERE user_id=9300;')[0].status === 0,
	JSON.stringify(legacyState));

// ---------------------------------------------------------------------------
// 5. F1 NULL version and unknown status through real HTTP
// ---------------------------------------------------------------------------
seedUser(9400, 'rc-null@example.com', 0);
d1Exec(`INSERT INTO audit_log (id,ticket_id,user_id,email,warning_type,event_type,category,action_text,status,version,is_internal)
VALUES (9401,'NULL-VERSION',9400,'rc-null@example.com','risk','spam','security','null version case','active',NULL,1);`);
const nullRes = await adjudicate(9401, 'ban_account', 1, 'null version');
const nullState = d1Rows("SELECT status,version FROM audit_log WHERE id=9401;")[0];
check('F1 NULL version real HTTP adjudication fails',
	nullRes.body?.code === 409 && nullState.status === 'active' && nullState.version === null,
	`code=${nullRes.body?.code} state=${JSON.stringify(nullState)}`);
check('F1 NULL version leaves user, decision, outbox and bans untouched',
	d1Rows('SELECT status FROM user WHERE user_id=9400;')[0].status === 0 &&
	d1Rows("SELECT count(*) c FROM audit_decision WHERE case_id=9401;")[0].c === 0 &&
	d1Rows("SELECT count(*) c FROM notification_outbox WHERE case_id=9401;")[0].c === 0 &&
	d1Rows("SELECT count(*) c FROM audit_log WHERE email='rc-null@example.com' AND warning_type='ban';")[0].c === 0);

d1Exec(`INSERT INTO audit_log (id,ticket_id,user_id,email,warning_type,event_type,category,action_text,status,version,is_internal)
VALUES (9402,'BOGUS-STATUS',9400,'rc-null@example.com','risk','spam','security','bogus status case','bogus_state',1,1);`);
const bogusRes = await adjudicate(9402, 'ban_account', 1, 'bogus status');
check('F1 bogus_state real HTTP adjudication fails without rewriting state',
	bogusRes.body?.code === 409 &&
	d1Rows('SELECT status FROM audit_log WHERE id=9402;')[0].status === 'bogus_state' &&
	d1Rows("SELECT count(*) c FROM audit_decision WHERE case_id=9402;")[0].c === 0,
	`code=${bogusRes.body?.code}`);

// ---------------------------------------------------------------------------
// 6. F2 response facts through real HTTP
// ---------------------------------------------------------------------------
d1Exec(`INSERT INTO audit_log (id,ticket_id,user_id,email,warning_type,event_type,category,action_text,status,version,is_internal,ip,geo,device,fingerprint,base_ip,base_geo,base_device,base_fingerprint,timeline,evidence_summary,report_source,reason_code)
VALUES (9501,'DTO-NULL',9400,'rc-dto@example.com','risk','generic','security','dto null case','active',1,1,'203.0.113.9','Tokyo, JP','Chrome','fp_x',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);`);
const dtoList = await http('/audit/list?keyword=DTO-NULL', { token: adminToken });
const dtoRow = dtoList.body?.data?.list?.find(r => r.id === 9501);
check('F2 real HTTP DTO keeps missing facts missing',
	dtoRow && dtoRow.baseIp === null && dtoRow.baseGeo === null && dtoRow.baseDevice === null &&
	dtoRow.baseFingerprint === null && dtoRow.timeline === null && dtoRow.evidenceSummary === null &&
	dtoRow.reportSource === null && dtoRow.reasonCode === null && dtoRow.banTime === null,
	dtoRow ? JSON.stringify({ baseIp: dtoRow.baseIp, baseDevice: dtoRow.baseDevice, timeline: dtoRow.timeline, evidenceSummary: dtoRow.evidenceSummary, reportSource: dtoRow.reportSource, reasonCode: dtoRow.reasonCode, banTime: dtoRow.banTime }) : 'row missing');

snapshot('workerd-final-db.json', {
	audit_log: d1Rows('SELECT * FROM audit_log ORDER BY id;'),
	audit_decision: d1Rows('SELECT * FROM audit_decision ORDER BY create_time;'),
	notification_outbox: d1Rows('SELECT id,task_id,case_id,recipient,channel,status FROM notification_outbox ORDER BY id;'),
	users: d1Rows('SELECT user_id,email,status FROM user ORDER BY user_id;')
});

// ---------------------------------------------------------------------------
// 7. Cleanup synthetic rows (physical delete, task-local D1 only)
// ---------------------------------------------------------------------------
const syntheticEmails = "'rc-normal@example.com','rc-e2e@example.com','rc-reverse@example.com','rc-legacy@example.com','rc-null@example.com','rc-dto@example.com'";
d1Exec(`DELETE FROM audit_decision WHERE case_id IN (SELECT id FROM audit_log WHERE email IN (${syntheticEmails}));`);
d1Exec(`DELETE FROM notification_outbox WHERE recipient IN (${syntheticEmails}) OR user_id IN (SELECT user_id FROM user WHERE email IN (${syntheticEmails}));`);
d1Exec(`DELETE FROM one_time_exchange_code WHERE email IN (${syntheticEmails});`);
d1Exec(`DELETE FROM email WHERE user_id IN (SELECT user_id FROM user WHERE email IN (${syntheticEmails}));`);
d1Exec(`DELETE FROM audit_log WHERE email IN (${syntheticEmails});`);
d1Exec(`DELETE FROM user WHERE email IN (${syntheticEmails});`);
const leftover = d1Rows(`SELECT (SELECT count(*) FROM audit_log WHERE email IN (${syntheticEmails})) a,
	(SELECT count(*) FROM user WHERE email IN (${syntheticEmails})) u,
	(SELECT count(*) FROM notification_outbox WHERE recipient IN (${syntheticEmails})) o,
	(SELECT count(*) FROM one_time_exchange_code WHERE email IN (${syntheticEmails})) x;`)[0];
check('synthetic HTTP/D1 fixture physically cleaned',
	leftover.a === 0 && leftover.u === 0 && leftover.o === 0 && leftover.x === 0,
	JSON.stringify(leftover));

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} workerd checks passed`);
if (failed.length) {
	console.log('FAILED CHECKS:');
	for (const f of failed) console.log(` - ${f.label} :: ${f.detail}`);
	process.exitCode = 1;
}
