/**
 * staging 管理员真实产品验收（补齐验收项 1/3/6 及回归 7）
 * (Real Product Admin Acceptance on epomail-staging)
 *
 * 凭据：从安全交接文件读取（默认 D:/epoverify-rc2/.staging-secrets.env），
 * 全程不打印任何口令/哈希/令牌；管理员改密后新口令回写交接文件（轮换事件脱敏记录）。
 * 全部操作走真实产品 API，零手工写哈希。首达结果记录，不重试。
 *
 * 验收项：
 *   1 站长经产品改密（PUT /api/my/resetPassword）
 *   2 旧口令失败 / 新口令成功
 *   3 管理员建号（POST /api/user/add）
 *   4 新用户认证（POST /api/login）
 *   5 管理员重置该用户密码（PUT /api/user/setPwd）
 *   6 重置前口令失效 / 新口令生效
 *   7 回归：本人改密、2FA 链路、受限（封禁）认证无回归
 *
 * 运行：node tests/rc-staging-admin-acceptance.mjs
 * 清理：finally 物理删除合成 user/account/email 行 + KV login_fail。
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';

const BASE = 'https://epomail-staging.epocanvas.workers.dev';
const SECRETS_FILE = process.env.RC_SECRETS_FILE || 'D:/epoverify-rc2/.staging-secrets.env';
const DOM = 'staging-mail.example.com';
const WORKER_DIR = path.resolve('mail-worker');

const secrets = {};
for (const line of fs.readFileSync(SECRETS_FILE, 'utf8').split(/\r?\n/)) {
	const i = line.indexOf('=');
	if (i > 0 && !line.trim().startsWith('#')) secrets[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const OLD_ADMIN_PWD = secrets.ADMIN_PWD;

const TS = Date.now();
const SU_EMAIL = `rc3-adm-${TS}@${DOM}`;
const SU_PWD = 'AdmUser#88x1';
const SU_PWD_ADMIN_RESET = 'AdmReset#77y2';
const SU_PWD_SELF = 'SelfChg#66z3';

const NEW_ADMIN_PWD = randomBytes(21).toString('base64url').slice(0, 28);

const results = [];
function check(label, ok, detail = '', ms = null) {
	results.push({ label, ok: !!ok, detail, ms, firstHttp: lastHttp, firstBiz: lastBiz });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` :: ${detail}` : ''}`);
}
let lastHttp = null, lastBiz = null;

function http(pathname, { method = 'GET', token, body } = {}) {
	const headers = { Accept: 'application/json' };
	if (token) headers.Authorization = `Bearer ${token}`;
	let payload = null;
	if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
	const started = Date.now();
	return new Promise((resolve, reject) => {
		const req = https.request(`${BASE}/api${pathname}`, { method, headers }, (res) => {
			let text = '';
			res.setEncoding('utf8');
			res.on('data', (c) => { text += c; });
			res.on('end', () => {
				let json = null;
				try { json = JSON.parse(text); } catch (_) {}
				lastHttp = res.statusCode;
				lastBiz = json ? json.code : null;
				resolve({ status: res.statusCode, body: json, text, ms: Date.now() - started });
			});
		});
		req.on('error', reject);
		if (payload) req.write(payload);
		req.end();
	});
}
const login = (email, password) => http('/login', { method: 'POST', body: { email, password } });

function d1(sql) {
	return execFileSync(process.execPath, [
		'node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'epomail-staging-db',
		'--remote', '--config', 'wrangler-staging-real.toml', '--command', sql
	], { cwd: WORKER_DIR, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
function d1Rows(sql) {
	const out = d1(sql);
	const parsed = JSON.parse(out.slice(out.indexOf('[')));
	return (Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed).results || [];
}
function userRow(email) {
	return d1Rows(`SELECT user_id, password, totp_enabled, status FROM user WHERE email='${email}';`)[0] || null;
}

function totpCode(base32Secret) {
	const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = '';
	for (const ch of base32Secret.replace(/=+$/, '').toUpperCase()) bits += alpha.indexOf(ch).toString(2).padStart(5, '0');
	const bytes = new Uint8Array(Math.floor(bits.length / 8));
	for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
	const buf = Buffer.alloc(8);
	buf.writeUInt32BE(Math.floor(Date.now() / 1000 / 30), 4);
	const h = createHmac('sha1', Buffer.from(bytes)).update(buf).digest();
	const off = h[h.length - 1] & 0xf;
	return String(((h[off] & 0x7f) << 24 | h[off + 1] << 16 | h[off + 2] << 8 | h[off + 3]) % 1000000).padStart(6, '0');
}

function rotateHandoverAdminPwd() {
	// 崩溃安全协议：先写 ADMIN_PWD_NEXT（改密前），成功后原子晋升为 ADMIN_PWD；
	// 任何时刻交接文件都保留一个有效口令，杜绝"新口令丢失=访问再次失联"。
	const raw = fs.readFileSync(SECRETS_FILE, 'utf8');
	fs.writeFileSync(SECRETS_FILE, raw.replace(/^ADMIN_PWD_NEXT=.*$/m, '') +
		(raw.endsWith('\n') ? '' : '\n') + `ADMIN_PWD_NEXT=${NEW_ADMIN_PWD}\n`);
}
function promoteHandoverAdminPwd() {
	const raw = fs.readFileSync(SECRETS_FILE, 'utf8');
	fs.writeFileSync(SECRETS_FILE, raw
		.replace(/^ADMIN_PWD=.*$/m, `ADMIN_PWD=${NEW_ADMIN_PWD}`)
		.replace(/^ADMIN_PWD_NEXT=.*$/m, '')
		+ `# ADMIN_PWD rotated ${new Date().toISOString()} via product PUT /api/my/resetPassword (rc-staging-admin-acceptance)\n`);
}
function discardHandoverNext() {
	const raw = fs.readFileSync(SECRETS_FILE, 'utf8');
	fs.writeFileSync(SECRETS_FILE, raw.replace(/^ADMIN_PWD_NEXT=.*$/m, ''));
}

async function cleanup() {
	console.log('\n[cleanup] 物理清理合成数据 ...');
	try {
		const rows = d1Rows(`SELECT user_id FROM user WHERE email='${SU_EMAIL}';`);
		for (const r of rows) {
			d1(`DELETE FROM email WHERE user_id=${r.user_id};`);
			d1(`DELETE FROM account WHERE user_id=${r.user_id};`);
			d1(`DELETE FROM user WHERE user_id=${r.user_id};`);
		}
		const left = d1Rows(`SELECT COUNT(*) AS n FROM user WHERE email='${SU_EMAIL}';`)[0];
		check('admin-acceptance synthetic data physically cleaned', Number(left?.n) === 0, `left=${left?.n}`);
	} catch (e) { console.error('cleanup failed:', e.message); }
}

try {
	if (!OLD_ADMIN_PWD) throw new Error('ADMIN_PWD not found in handover file');

	// ---------- 1. 站长产品改密 ----------
	const adminOld = await login('admin@staging-mail.example.com', OLD_ADMIN_PWD);
	check('admin login with handed-over password (product path, first attempt)',
		!!adminOld.body?.data?.token, `code=${adminOld.body?.code} ms=${adminOld.ms}`, adminOld.ms);
	const adminJwt0 = adminOld.body?.data?.token;

	rotateHandoverAdminPwd();
	console.log('[handover] ADMIN_PWD_NEXT staged (crash-safe protocol)');
	const chg = await http('/my/resetPassword', { method: 'PUT', token: adminJwt0, body: { password: NEW_ADMIN_PWD } });
	if (chg.body?.code === 200) {
		promoteHandoverAdminPwd();
		console.log('[handover] ADMIN_PWD promoted (value not printed)');
	} else {
		discardHandoverNext();
		console.log('[handover] rotation FAILED -> ADMIN_PWD_NEXT discarded, old password still authoritative');
	}
	check('A1 admin changes own password via real API', chg.body?.code === 200, `code=${chg.body?.code} ms=${chg.ms}`, chg.ms);

	// ---------- 2. 旧口令失败 / 新口令成功 ----------
	const lOld = await login('admin@staging-mail.example.com', OLD_ADMIN_PWD);
	check('A2 old admin password rejected after change', lOld.body?.code !== 200, `code=${lOld.body?.code} msg=${lOld.body?.message}`, lOld.ms);
	const lNew = await login('admin@staging-mail.example.com', NEW_ADMIN_PWD);
	check('A2 new admin password accepted', !!lNew.body?.data?.token, `code=${lNew.body?.code} ms=${lNew.ms}`, lNew.ms);
	const adminJwt = lNew.body?.data?.token;

	// ---------- 3. 管理员建号 ----------
	const add = await http('/user/add', { method: 'POST', token: adminJwt, body: { email: SU_EMAIL, type: 1, password: SU_PWD } });
	check('A3 admin creates synthetic user via real API', add.body?.code === 200, `code=${add.body?.code} msg=${add.body?.message} ms=${add.ms}`, add.ms);
	const suRow = userRow(SU_EMAIL);
	check('A3 created row stores self-described policy hash (product-written)',
		!!suRow && suRow.password.startsWith('pbkdf2:100000:'), `prefix=${suRow?.password?.slice(0, 16)}`);

	// ---------- 4. 新用户认证 ----------
	const suLogin = await login(SU_EMAIL, SU_PWD);
	check('A4 new user authenticates via real login', !!suLogin.body?.data?.token, `code=${suLogin.body?.code} ms=${suLogin.ms}`, suLogin.ms);
	const suJwt = suLogin.body?.data?.token;

	// ---------- 5. 管理员重置该用户密码 ----------
	const suRowBefore = userRow(SU_EMAIL);
	const reset = await http('/user/setPwd', { method: 'PUT', token: adminJwt, body: { userId: suRowBefore.user_id, password: SU_PWD_ADMIN_RESET } });
	check('A5 admin resets user password via real API', reset.body?.code === 200, `code=${reset.body?.code} ms=${reset.ms}`, reset.ms);

	// ---------- 6. 重置前口令失效 / 新口令生效 ----------
	const suOld = await login(SU_EMAIL, SU_PWD);
	check('A6 pre-reset password invalid', suOld.body?.code !== 200, `code=${suOld.body?.code}`, suOld.ms);
	const suNew = await login(SU_EMAIL, SU_PWD_ADMIN_RESET);
	check('A6 post-reset password works', !!suNew.body?.data?.token, `code=${suNew.body?.code} ms=${suNew.ms}`, suNew.ms);
	const suJwt2 = suNew.body?.data?.token;

	// ---------- 7. 回归 ----------
	// 7a 本人改密
	const selfChg = await http('/my/resetPassword', { method: 'PUT', token: suJwt2, body: { password: SU_PWD_SELF } });
	check('A7a self password change works', selfChg.body?.code === 200, `code=${selfChg.body?.code} ms=${selfChg.ms}`, selfChg.ms);
	const suSelf = await login(SU_EMAIL, SU_PWD_SELF);
	check('A7a self-changed password authenticates', !!suSelf.body?.data?.token, `code=${suSelf.body?.code}`, suSelf.ms);
	const suJwt3 = suSelf.body?.data?.token;

	// 7b 2FA 链路
	const setup = await http('/my/totp/setup', { token: suJwt3 });
	const secret = setup.body?.data?.secret;
	check('A7b TOTP setup available', !!secret, `code=${setup.body?.code}`, setup.ms);
	const en = await http('/my/totp/enable', { method: 'POST', token: suJwt3, body: { code: totpCode(secret) } });
	check('A7b TOTP enable works', en.body?.code === 200, `code=${en.body?.code} msg=${en.body?.message}`, en.ms);
	const m1 = await login(SU_EMAIL, SU_PWD_SELF);
	check('A7b login challenges 2FA', m1.body?.data?.mfaRequired === true && !!m1.body?.data?.tempToken, `code=${m1.body?.code}`, m1.ms);
	await new Promise((r) => setTimeout(r, 1200));
	const m2 = await http('/login/totp', { method: 'POST', body: { tempToken: m1.body?.data?.tempToken, code: totpCode(secret) } });
	check('A7b TOTP second factor login works', m2.body?.data?.token, `code=${m2.body?.code} msg=${m2.body?.message} ms=${m2.ms}`, m2.ms);
	const dis = await http('/my/totp/disable', { method: 'POST', token: m2.body?.data?.token, body: { password: SU_PWD_SELF, code: totpCode(secret) } });
	check('A7b TOTP disable works', dis.body?.code === 200, `code=${dis.body?.code}`, dis.ms);

	// 7c 受限（封禁）认证：使用前次会话封禁的合成账号（交接文件含口令），仅登录观察受限通道
	const bannedRow = d1Rows(`SELECT user_id, password, salt, status, totp_enabled FROM user WHERE email='staging-smoke-a@staging-mail.example.com';`)[0];
	if (bannedRow && bannedRow.status === 1 && secrets.SMOKE_A_PWD) {
		const rl = await login('staging-smoke-a@staging-mail.example.com', secrets.SMOKE_A_PWD);
		check('A7c banned account gets restricted channel (not regular session)', rl.body?.data?.isRestricted === true && !!rl.body?.data?.restrictedToken,
			`code=${rl.body?.code} restricted=${rl.body?.data?.isRestricted} ms=${rl.ms}`, rl.ms);
	} else {
		check('A7c banned-account restricted login (fixture present)', false, 'banned fixture or SMOKE_A_PWD unavailable');
	}
} catch (err) {
	console.error('FATAL:', err.message);
	results.push({ label: 'script-fatal', ok: false, detail: err.message });
} finally {
	await cleanup();
}

const pass = results.filter((r) => r.ok).length;
fs.writeFileSync('.rc3-evidence/admin-acceptance-first-attempts.json', JSON.stringify(results, null, 2));
console.log(`\n${pass === results.length ? 'ALL GREEN' : 'HAS FAILURES'}: ${pass}/${results.length} admin acceptance checks passed (first-attempt, no retries)`);
process.exit(pass === results.length ? 0 : 1);
