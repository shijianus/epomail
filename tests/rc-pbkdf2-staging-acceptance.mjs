/**
 * PBKDF2 云端兼容性热修复 · 真实 staging 产品路径验收
 * (Cloud PBKDF2 Hotfix — Real Staging Product-Path Acceptance)
 *
 * 目标环境：https://epomail-staging.epocanvas.workers.dev（已批准的隔离预发布 Worker）
 *
 * 分两类验收，严格区分：
 *   【产品写入路径】绝不手工写密码哈希，全部经真实 API：
 *     S1 注册（POST /api/register，写入 pbkdf2:210000）
 *     S2 本人改密（PUT /api/my/resetPassword）
 *     S3 旧密码失效 / 新密码生效（含错误密码负控）
 *     S4 2FA 无回归：/my/totp/setup→enable(登录密码确认)→登录 mfa→/login/totp→disable
 *   【存量兼容夹具】明确标记为旧数据验证（可信参考实现 Node pbkdf2Sync 生成，仅用于
 *     模拟历史存量哈希；不代替上方产品写入路径验收）：
 *     L1 旧 pbkdf2:100000 登录 + 惰性升级为 210000（升级写入由产品完成）
 *     L2 旧 pbkdf2:210000 按原哈希语义登录（noble 纯 JS 路径在云端执行）
 *     L3 legacy 单轮 SHA-256 登录 + 迁移为 pbkdf2:210000
 *     L4 错误密码绝不升级（负控）
 *
 * 已知阻塞（如实呈现，不伪造）：
 *   - 验收项 1/3/6（master 初始密码修改 / 管理员 API 建号 / 管理员重置）需站长 JWT；
 *     现 staging 站长口令为前次 smoke 会话手工写入哈希的未知随机值（本轮热修复
 *     正是要消除的反模式），在不手工写哈希/不清库/不动 Secret 的红线内无法取得
 *     站长会话。等价服务函数路径已由本地真实 workerd e2e（rc-auth-compat 25/25）
 *     覆盖；云端 210k 写入能力由 S1/S2/L1 证明。
 *
 * 运行前置：mail-worker/wrangler-staging-real.toml（临时部署配置）存在；
 *           CLOUDFLARE_API_TOKEN 已认证（wrangler 远程 D1 使用）。
 * 运行：node tests/rc-pbkdf2-staging-acceptance.mjs
 * 清理：finally 物理删除全部合成 user/account/email 行（零假数据残留）。
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import httpModule from 'node:http';
import httpsModule from 'node:https';
import { pbkdf2Sync, createHash, createHmac, randomBytes } from 'node:crypto';

const BASE = process.env.RC3_BASE_URL || 'https://epomail-staging.epocanvas.workers.dev';
const WORKER_DIR = path.resolve('mail-worker');
const STAGING_CONFIG = 'wrangler-staging-real.toml';
const DOM = 'staging-mail.example.com';

const TS = Date.now();
const R = Math.random().toString(36).slice(2, 8);
const REG_EMAIL = `rc3-reg-${TS}-${R}@${DOM}`;
const FIX_100K = `rc3-fix100k-${TS}-${R}@${DOM}`;
const FIX_210K = `rc3-fix210k-${TS}-${R}@${DOM}`;
const FIX_LEGACY = `rc3-fixleg-${TS}-${R}@${DOM}`;
const FIX_NEG = `rc3-fixneg-${TS}-${R}@${DOM}`;
const REG_PWD = 'Reg密码99x';
const REG_PWD_NEW = 'New密码77z!';
const FIX_PWD = 'FixPass42#';

const results = [];
function check(label, ok, detail = '', ms = null) {
	results.push({ label, ok: !!ok, detail, ms });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` :: ${detail}` : ''}`);
}

async function http(pathname, { method = 'GET', token, body } = {}) {
	const headers = { Accept: 'application/json' };
	if (token) headers.Authorization = `Bearer ${token}`;
	let payload = null;
	if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
	const started = Date.now();
	const lib = BASE.startsWith('https') ? httpsModule : httpModule;
	return new Promise((resolve, reject) => {
		const req = lib.request(`${BASE}/api${pathname}`, { method, headers }, (res) => {
			let text = '';
			res.setEncoding('utf8');
			res.on('data', (c) => { text += c; });
			res.on('end', () => {
				let json = null;
				try { json = JSON.parse(text); } catch (_) {}
				resolve({ status: res.statusCode, body: json, text, ms: Date.now() - started });
			});
		});
		req.on('error', reject);
		if (payload) req.write(payload);
		req.end();
	});
}

function d1(sql) {
	const out = execFileSync(process.execPath, [
		path.join(WORKER_DIR, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
		'd1', 'execute', 'epomail-staging-db', '--remote',
		'--config', STAGING_CONFIG, '--json', '--command', sql
	], { cwd: WORKER_DIR, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
	const parsed = JSON.parse(out.slice(out.indexOf('[')));
	return (Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed).results || [];
}

function userRow(email) {
	return d1(`SELECT user_id, password, salt, totp_enabled FROM user WHERE email='${email}';`)[0] || null;
}

/** 可信参考实现（Node OpenSSL pbkdf2Sync）——仅用于生成历史存量夹具 */
function refPbkdf2Hash(password, saltB64, iterations) {
	const dk = pbkdf2Sync(Buffer.from(password, 'utf8'), Buffer.from(saltB64, 'utf8'), iterations, 32, 'sha256');
	return `pbkdf2:${iterations}:${dk.toString('base64')}`;
}
function refLegacySha256(password, saltB64) {
	return createHash('sha256').update(saltB64 + password, 'utf8').digest('base64');
}
function refSalt() {
	return randomBytes(16).toString('base64');
}

/** 存量夹具播种（明确标记：仅为旧数据兼容验证，绝不用于产品写入路径验收） */
function seedFixture(email, hash, salt) {
	d1(`INSERT INTO user (email, password, salt, type, status, is_del, create_time, update_time) VALUES ('${email}', '${hash}', '${salt}', 1, 0, 0, datetime('now'), datetime('now'));`);
}

// ---- 与产品一致的 TOTP 生成（RFC 6238, SHA-1, 6 位, 30s）----
function totpCode(base32Secret) {
	const counter = Math.floor(Date.now() / 1000 / 30);
	const buf = Buffer.alloc(8);
	buf.writeUInt32BE(counter, 4);
	const h = createHmac('sha1', Buffer.from(base32ToBufForHmac(base32Secret))).update(buf).digest();
	const offset = h[h.length - 1] & 0xf;
	const code = ((h[offset] & 0x7f) << 24 | h[offset + 1] << 16 | h[offset + 2] << 8 | h[offset + 3]) % 1000000;
	return String(code).padStart(6, '0');
}
function base32ToBufForHmac(base32) {
	const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = '';
	for (const ch of base32.replace(/=+$/, '').toUpperCase()) bits += alpha.indexOf(ch).toString(2).padStart(5, '0');
	const bytes = new Uint8Array(Math.floor(bits.length / 8));
	for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
	return bytes;
}

async function login(email, password) {
	return http('/login', { method: 'POST', body: { email, password } });
}

let regUserId = null;

async function cleanup() {
	const emails = [REG_EMAIL, FIX_100K, FIX_210K, FIX_LEGACY, FIX_NEG];
	console.log('\n[cleanup] 物理清理合成数据 ...');
	for (const e of emails) {
		try {
			const rows = d1(`SELECT user_id FROM user WHERE email='${e}';`);
			for (const r of rows) {
				d1(`DELETE FROM email WHERE user_id=${r.user_id};`);
				d1(`DELETE FROM account WHERE user_id=${r.user_id};`);
				d1(`DELETE FROM user WHERE user_id=${r.user_id};`);
			}
		} catch (err) { console.error(`cleanup ${e} failed:`, err.message); }
	}
	const left = d1(`SELECT COUNT(*) AS n FROM user WHERE email IN ('${emails.join("','")}');`)[0];
	check('staging synthetic data physically cleaned', Number(left?.n) === 0, `left=${left?.n}`);
	// KV 残留清理（登录失败计数，best-effort，逐 key）
	for (const e of emails) {
		try {
			execFileSync(process.execPath, [
				path.join(WORKER_DIR, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
				'kv', 'key', 'delete', 'login_fail:' + e,
				'--namespace-id', 'c5a59d7cfc6a4091b792238ec569e315', '--remote', '--force'
			], { cwd: WORKER_DIR, encoding: 'utf8', stdio: 'ignore' });
		} catch (_) {}
	}
	console.log('[cleanup] KV login_fail keys deleted (best-effort)');
}

try {
	// ============ S1 产品路径：注册（真实 API，写入 210k） ============
	const reg = await http('/register', { method: 'POST', body: { email: REG_EMAIL, password: REG_PWD } });
	check('S1 register via real API succeeds on cloud (was P0-500 before hotfix)', reg.body?.code === 200, `code=${reg.body?.code} msg=${reg.body?.message} ms=${reg.ms}`, reg.ms);
	const regRow = userRow(REG_EMAIL);
	regUserId = regRow?.user_id;
	check('S1 registered row stores self-described pbkdf2:210000 hash (product-written, not hand-written)',
		!!regRow && regRow.password.startsWith('pbkdf2:210000:'), `prefix=${regRow?.password?.slice(0, 16)}`);

	// ============ S3a 新密码可登录 ============
	const l1 = await login(REG_EMAIL, REG_PWD);
	check('S1 registered user logs in with chosen password on cloud (210k verify via pure-JS path)',
		l1.body?.data?.token, `code=${l1.body?.code} ms=${l1.ms}`, l1.ms);
	const userJwt = l1.body?.data?.token;

	// ============ S2 产品路径：本人改密 ============
	const chg = await http('/my/resetPassword', { method: 'PUT', token: userJwt, body: { password: REG_PWD_NEW } });
	check('S2 self password change via real API succeeds on cloud (210k derive+persist)',
		chg.body?.code === 200, `code=${chg.body?.code} ms=${chg.ms}`, chg.ms);
	const chgRow = userRow(REG_EMAIL);
	check('S2 stored hash rewritten to fresh pbkdf2:210000 with new salt',
		!!chgRow && chgRow.password.startsWith('pbkdf2:210000:') && chgRow.salt !== regRow.salt, `salt-rotated=${chgRow?.salt !== regRow?.salt}`);

	// ============ S3 旧密码失效 / 新密码生效 ============
	const lOld = await login(REG_EMAIL, REG_PWD);
	check('S3 old password rejected after change', lOld.body?.code !== 200, `code=${lOld.body?.code}`, lOld.ms);
	const lNew = await login(REG_EMAIL, REG_PWD_NEW);
	check('S3 new password accepted after change', !!lNew.body?.data?.token, `code=${lNew.body?.code} ms=${lNew.ms}`, lNew.ms);
	const userJwt2 = lNew.body?.data?.token;

	// ============ S4 2FA 无回归（含登录密码确认路径） ============
	const setup = await http('/my/totp/setup', { token: userJwt2 });
	const secret = setup.body?.data?.secret;
	check('S4 TOTP setup returns secret', !!secret, `code=${setup.body?.code}`, setup.ms);
	const en1 = await http('/my/totp/enable', { method: 'POST', token: userJwt2, body: { code: totpCode(secret) } });
	check('S4 TOTP enable succeeds on cloud', en1.body?.code === 200, `code=${en1.body?.code} msg=${en1.body?.message}`, en1.ms);

	const mfa1 = await login(REG_EMAIL, REG_PWD_NEW);
	const tempToken = mfa1.body?.data?.tempToken;
	check('S4 password login now challenges 2FA (mfaRequired)', mfa1.body?.data?.mfaRequired === true && !!tempToken, `code=${mfa1.body?.code} ms=${mfa1.ms}`, mfa1.ms);
	await new Promise((r) => setTimeout(r, 1000)); // 跨时间步防重放
	const mfa2 = await http('/login/totp', { method: 'POST', body: { tempToken, code: totpCode(secret) } });
	check('S4 TOTP second-factor login succeeds on cloud', mfa2.body?.data?.token, `code=${mfa2.body?.code} msg=${mfa2.body?.message} ms=${mfa2.ms}`, mfa2.ms);

	// view-backup-codes 需要登录密码确认 → 再验证一次 210k 密码派生路径
	const vc = await http('/my/totp/view-backup-codes', { method: 'POST', token: mfa2.body?.data?.token, body: { password: REG_PWD_NEW } });
	check('S4 backup-codes view with password confirmation (210k verify) works', vc.body?.code === 200, `code=${vc.body?.code}`, vc.ms);
	const vcBad = await http('/my/totp/view-backup-codes', { method: 'POST', token: mfa2.body?.data?.token, body: { password: 'wrong-password' } });
	check('S4 password confirmation rejects wrong password', vcBad.body?.code !== 200, `code=${vcBad.body?.code}`);

	const dis = await http('/my/totp/disable', { method: 'POST', token: mfa2.body?.data?.token, body: { password: REG_PWD_NEW, code: totpCode(secret) } });
	check('S4 TOTP disable with password confirmation works', dis.body?.code === 200, `code=${dis.body?.code} msg=${dis.body?.message}`, dis.ms);

	// ============ L1 存量夹具：旧 100k + 惰性升级（产品完成升级写入） ============
	{
		const salt = refSalt();
		seedFixture(FIX_100K, refPbkdf2Hash(FIX_PWD, salt, 100000), salt);
		const t0 = Date.now();
		const lg = await login(FIX_100K, FIX_PWD);
		check('[fixture] L1 old pbkdf2:100000 login succeeds and lazily upgrades on cloud',
			!!lg.body?.data?.token, `code=${lg.body?.code} ms=${lg.ms}`, lg.ms);
		const row = userRow(FIX_100K);
		check('[fixture] L1 hash upgraded by product to pbkdf2:210000 (native WebCrypto + noble write path)',
			row?.password?.startsWith('pbkdf2:210000:'), `now=${row?.password?.slice(0, 16)} upgrade+login-total=${Date.now() - t0}ms`);
		const re = await login(FIX_100K, FIX_PWD);
		check('[fixture] L1 re-login after upgrade verifies 210k on cloud', !!re.body?.data?.token, `code=${re.body?.code} ms=${re.ms}`, re.ms);
	}

	// ============ L2 存量夹具：旧 210k 原语义登录（云端 noble 路径） ============
	{
		const salt = refSalt();
		seedFixture(FIX_210K, refPbkdf2Hash(FIX_PWD, salt, 210000), salt);
		const before = userRow(FIX_210K).password;
		const lg = await login(FIX_210K, FIX_PWD);
		check('[fixture] L2 legacy pbkdf2:210000 login verifies with original iteration semantics on cloud',
			!!lg.body?.data?.token, `code=${lg.body?.code} ms=${lg.ms}`, lg.ms);
		const after = userRow(FIX_210K).password;
		check('[fixture] L2 210k hash NOT rewritten (no spurious upgrade)', before === after);
	}

	// ============ L3 存量夹具：legacy 单轮 SHA-256 迁移 ============
	{
		const salt = refSalt();
		seedFixture(FIX_LEGACY, refLegacySha256(FIX_PWD, salt), salt);
		const lg = await login(FIX_LEGACY, FIX_PWD);
		check('[fixture] L3 legacy single-round SHA-256 login succeeds on cloud',
			!!lg.body?.data?.token, `code=${lg.body?.code} ms=${lg.ms}`, lg.ms);
		const row = userRow(FIX_LEGACY);
		check('[fixture] L3 migrated by product to pbkdf2:210000',
			row?.password?.startsWith('pbkdf2:210000:'), `now=${row?.password?.slice(0, 16)}`);
	}

	// ============ L4 负控：错误密码绝不升级 ============
	{
		const salt = refSalt();
		seedFixture(FIX_NEG, refPbkdf2Hash(FIX_PWD, salt, 100000), salt);
		const rowBefore = userRow(FIX_NEG).password;
		const lw = await login(FIX_NEG, 'totally-wrong-pass');
		check('[fixture] L4 wrong password rejected', lw.body?.code !== 200, `code=${lw.body?.code}`, lw.ms);
		check('[fixture] L4 wrong password never rewrites hash', userRow(FIX_NEG).password === rowBefore);
	}
} catch (err) {
	console.error('FATAL:', err);
	results.push({ label: 'script-fatal', ok: false, detail: err.message });
} finally {
	await cleanup();
}

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass === results.length ? 'ALL GREEN' : 'HAS FAILURES'}: ${pass}/${results.length} staging checks passed`);
const timings = results.filter((r) => typeof r.ms === 'number').map((r) => `  ${r.ms}ms  ${r.label.slice(0, 72)}`);
console.log('--- Observed cloud latency (auth-related) ---\n' + timings.join('\n'));
process.exit(pass === results.length ? 0 : 1);
