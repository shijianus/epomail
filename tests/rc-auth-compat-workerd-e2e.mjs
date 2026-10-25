/**
 * 认证改动兼容性真实 workerd 端到端测试 (Auth Compatibility Real workerd E2E)
 *
 * 验证本轮两项认证改动在真实 workerd 上的行为与耗时：
 *   A. PBKDF2 迭代 210000（含旧 100000 合成哈希验证成功后自动升级；错误密码绝不升级；
 *      畸形/异常迭代参数安全拒绝且无派生耗时放大）
 *   B. TOTP 加密密钥 fail-secure（现行 totp_enc_key era 数据照常登录；
 *      历史 jwt_secret 回退 era 合成数据经显式迁移自动解锁并重加密；
 *      备份码登录可用）
 *
 * 启动要求（与 rc-abuse-workerd-e2e 相同，另加 totp_enc_key 变量）：
 *   RC_INIT_SECRET   必须与 jwt_secret 一致
 *   RC_TOTP_ENC_KEY  必须与 totp_enc_key 一致（本地随机测试密钥）
 *   RC_PERSIST_TO    必须与 --persist-to 一致
 * 测试数据全部物理清理。
 */

import fs from 'node:fs';
import path from 'node:path';
import httpModule from 'node:http';
import { execFileSync } from 'node:child_process';
import saltHashUtils from '../mail-worker/src/utils/crypto-utils.js';
import totpUtils from '../mail-worker/src/utils/totp-utils.js';

const BASE = process.env.RC_BASE_URL || 'http://127.0.0.1:8799';
const WORKER_DIR = path.resolve('mail-worker');
const INIT_SECRET = process.env.RC_INIT_SECRET;
const TOTP_ENC_KEY = process.env.RC_TOTP_ENC_KEY;
const PERSIST = process.env.RC_PERSIST_TO;
const EVIDENCE = process.env.RC_EVIDENCE_DIR;

for (const [name, value] of Object.entries({ RC_INIT_SECRET: INIT_SECRET, RC_TOTP_ENC_KEY: TOTP_ENC_KEY, RC_PERSIST_TO: PERSIST, RC_EVIDENCE_DIR: EVIDENCE })) {
	if (!value) {
		console.error(`Missing required environment variable: ${name}`);
		process.exit(1);
	}
}

const results = [];
let adminToken = null;
function check(label, condition, detail = '', ms = null) {
	results.push({ label, ok: !!condition, detail, ms });
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
	const fullPath = pathname.startsWith('/api/') || pathname.startsWith('/cdn-cgi/') ? pathname : `/api${pathname}`;
	const started = Date.now();
	return new Promise((resolve, reject) => {
		const req = httpModule.request(`${BASE}${fullPath}`, { method, headers: h, agent: false }, (res) => {
			let text = '';
			res.setEncoding('utf8');
			res.on('data', chunk => { text += chunk; });
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

function snapshot(name, value) {
	fs.mkdirSync(EVIDENCE, { recursive: true });
	fs.writeFileSync(path.join(EVIDENCE, name), JSON.stringify(value, null, 2));
}

// 测试本地 PBKDF2 合成哈希（自选迭代数，与产品 hashPassword 同格式）
const enc = new TextEncoder();
async function pbkdf2HashWith(password, salt, iterations) {
	const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' }, keyMaterial, 256);
	return `pbkdf2:${iterations}:${Buffer.from(new Uint8Array(bits)).toString('base64')}`;
}

// 历史 jwt_secret 回退 era 的加密复刻（仅测试用，与当年实现逐位一致）
async function legacyDeriveKey(jwtSecret) {
	const clean = String(jwtSecret).trim();
	let keyBytes = null;
	try {
		const d = Buffer.from(clean, 'base64');
		if (d.length === 32) keyBytes = new Uint8Array(d);
	} catch (_) {}
	if (!keyBytes) {
		const h = await crypto.subtle.digest('SHA-256', enc.encode(clean));
		keyBytes = new Uint8Array(h);
	}
	return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function legacyEncrypt(plain, jwtSecret) {
	const key = await legacyDeriveKey(jwtSecret);
	const iv = new Uint8Array(12);
	crypto.getRandomValues(iv);
	const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
	return `${Buffer.from(iv).toString('base64')}:${Buffer.from(new Uint8Array(buf)).toString('base64')}`;
}

const DEV_HASH = 'pbkdf2:100000:wYbOCP3rv6muivmiYwmd/oXXroIcxp7/VcB02M+Ac5w=';
const DEV_SALT = 'ZmUlWbNgsFel3E0oxnPHcA==';
const DEV_PWD = (process.env.EPOMAIL_LIVE_E2E_ADMIN_PASSWORD || process.env.EPOMAIL_E2E_ADMIN_PASSWORD || '');

function seedUser(userId, email, passwordHash, salt, extra = {}) {
	const cols = ['user_id', 'email', 'password', 'salt', 'type', 'status', 'is_del',
		'totp_enabled', 'totp_secret', 'totp_key_version', 'totp_backup_codes'];
	const vals = [
		userId, `'${email}'`, `'${passwordHash}'`, `'${salt}'`, 1, 0, 0,
		extra.totpEnabled ?? 0,
		extra.totpSecret ? `'${extra.totpSecret}'` : "''",
		extra.totpKeyVersion ?? 1,
		`'${(extra.totpBackupCodes || '[]').replace(/'/g, "''")}'`
	];
	d1Exec(`INSERT INTO user (${cols.join(',')}) VALUES (${vals.join(',')});`);
}

// ---------------------------------------------------------------------------
// 0. init + admin login
// ---------------------------------------------------------------------------
const init = await http('/api/init', { method: 'POST', headers: { 'X-Init-Secret': INIT_SECRET } });
check('auth-compat e2e init responds success', init.status === 200 && init.text === 'success', `${init.status} ${init.text.slice(0, 60)}`);
const adminLogin = await http('/api/login', { method: 'POST', body: { email: 'admin@example.com', password: DEV_PWD } });
adminToken = adminLogin.body?.data?.token;
check('auth-compat admin login', !!adminToken, `code=${adminLogin.body?.code} ms=${adminLogin.ms}`);

// ===========================================================================
// A. PBKDF2 迭代兼容性（真实 workerd）
// ===========================================================================
{
	// A1: 现行 210000 用户正常登录 + 耗时
	seedUser(21501, 'rc-auth-210k@example.com', await pbkdf2HashWith(DEV_PWD, DEV_SALT, 210000), DEV_SALT);
	const r210 = await http('/api/login', { method: 'POST', body: { email: 'rc-auth-210k@example.com', password: DEV_PWD } });
	check('A1 pbkdf2:210000 user login succeeds on real workerd',
		r210.body?.code === 200 && !!r210.body?.data?.token,
		`code=${r210.body?.code} ms=${r210.ms}`, r210.ms);

	// A2: 旧 100000 合成哈希用户：验证成功后自动升级至 210000
	seedUser(21502, 'rc-auth-100k@example.com', await pbkdf2HashWith(DEV_PWD, DEV_SALT, 100000), DEV_SALT);
	const r100 = await http('/api/login', { method: 'POST', body: { email: 'rc-auth-100k@example.com', password: DEV_PWD } });
	check('A2 old pbkdf2:100000 hash verifies and logs in',
		r100.body?.code === 200 && !!r100.body?.data?.token,
		`code=${r100.body?.code} ms=${r100.ms}`, r100.ms);
	const hashAfter = d1Rows(`SELECT password FROM user WHERE email='rc-auth-100k@example.com';`)[0]?.password || '';
	check('A2 old 100000 hash lazily upgraded to 210000 after successful login',
		hashAfter.startsWith('pbkdf2:210000:'), `hashPrefix=${hashAfter.split(':')[0]}:${hashAfter.split(':')[1]}`);

	// A3: 错误密码绝不升级
	seedUser(21503, 'rc-auth-wrong@example.com', await pbkdf2HashWith(DEV_PWD, DEV_SALT, 100000), DEV_SALT);
	const rWrong = await http('/api/login', { method: 'POST', body: { email: 'rc-auth-wrong@example.com', password: 'TotallyWrong!999' } });
	const hashWrong = d1Rows(`SELECT password FROM user WHERE email='rc-auth-wrong@example.com';`)[0]?.password || '';
	check('A3 wrong password rejected and hash NOT upgraded',
		rWrong.body?.code !== 200 && hashWrong.startsWith('pbkdf2:100000:'),
		`code=${rWrong.body?.code} hashPrefix=${hashWrong.split(':').slice(0, 2).join(':')}`, rWrong.ms);

	// A4: legacy SHA-256 用户：登录成功后升级至 210000
	seedUser(21504, 'rc-auth-sha@example.com', await saltHashUtils.genLegacyHashPassword(DEV_PWD, DEV_SALT), DEV_SALT);
	const rSha = await http('/api/login', { method: 'POST', body: { email: 'rc-auth-sha@example.com', password: DEV_PWD } });
	const hashSha = d1Rows(`SELECT password FROM user WHERE email='rc-auth-sha@example.com';`)[0]?.password || '';
	check('A4 legacy sha256 hash verifies and upgrades to pbkdf2:210000',
		rSha.body?.code === 200 && hashSha.startsWith('pbkdf2:210000:'),
		`code=${rSha.body?.code} hashPrefix=${hashSha.split(':').slice(0, 2).join(':')}`, rSha.ms);

	// A5: 畸形/异常迭代参数安全拒绝且耗时受控（无派生放大）
	const malformedCases = [
		['21505', 'rc-auth-m1@example.com', 'pbkdf2:abc:AAAA'],
		['21506', 'rc-auth-m2@example.com', 'pbkdf2:0:AAAA'],
		['21507', 'rc-auth-m3@example.com', 'pbkdf2:900000000:AAAA'],
		['21508', 'rc-auth-m4@example.com', 'pbkdf2:999:AAAA']
	];
	for (const [id, email, hash] of malformedCases) {
		seedUser(id, email, hash, DEV_SALT);
		const r = await http('/api/login', { method: 'POST', body: { email, password: DEV_PWD } });
		check(`A5 malformed hash (${hash.slice(0, 16)}...) safely rejected`,
			r.body?.code !== 200 && r.ms < 3000,
			`code=${r.body?.code} ms=${r.ms}`, r.ms);
		const hashNow = d1Rows(`SELECT password FROM user WHERE ${email.includes('@') ? "email" : 'email'}='${email}';`)[0]?.password || '';
		check(`A5 malformed hash row untouched (${email})`, hashNow === hash, `unchanged=${hashNow === hash}`);
	}
}

// ===========================================================================
// B. TOTP 加密密钥兼容性（真实 workerd）
// ===========================================================================
const TOTP_PLAIN = 'JBSWY3DPEHPK3PXP';
{
	// B1: 现行 totp_enc_key era（key_version=1 的历史形态行）→ 登录照常，版本标记补齐
	const currentEnc = await totpUtils.encryptSecret(TOTP_PLAIN, { totp_enc_key: TOTP_ENC_KEY });
	seedUser(21510, 'rc-auth-totp-cur@example.com', DEV_HASH, DEV_SALT, {
		totpEnabled: 1, totpSecret: currentEnc, totpKeyVersion: 1
	});
	const step1 = await http('/api/login', { method: 'POST', body: { email: 'rc-auth-totp-cur@example.com', password: DEV_PWD } });
	check('B1 current-era TOTP user step1 returns mfaRequired',
		step1.body?.data?.mfaRequired === true && !!step1.body?.data?.tempToken,
		`code=${step1.body?.code} mfa=${step1.body?.data?.mfaRequired} ms=${step1.ms}`, step1.ms);
	const code1 = await totpUtils.generateTOTP(TOTP_PLAIN);
	const step2 = await http('/api/login/totp', { method: 'POST', body: { tempToken: step1.body?.data?.tempToken, code: code1 } });
	check('B1 current-era TOTP verify succeeds on real workerd',
		step2.body?.code === 200 && !!step2.body?.data?.token,
		`code=${step2.body?.code} ms=${step2.ms}`, step2.ms);
	const verAfter = d1Rows(`SELECT totp_key_version FROM user WHERE email='rc-auth-totp-cur@example.com';`)[0]?.totp_key_version;
	check('B1 current-era row version-confirmed to 2 (no re-encryption needed)', Number(verAfter) === 2, `version=${verAfter}`);

	// B2: 历史 jwt_secret 回退 era 合成数据 → 显式迁移自动解锁并重加密
	const legacyEnc = await legacyEncrypt(TOTP_PLAIN, INIT_SECRET);
	seedUser(21511, 'rc-auth-totp-leg@example.com', DEV_HASH, DEV_SALT, {
		totpEnabled: 1, totpSecret: legacyEnc, totpKeyVersion: 1
	});
	const legStep1 = await http('/api/login', { method: 'POST', body: { email: 'rc-auth-totp-leg@example.com', password: DEV_PWD } });
	check('B2 legacy-era TOTP user step1 returns mfaRequired',
		legStep1.body?.data?.mfaRequired === true, `code=${legStep1.body?.code}`, legStep1.ms);
	const code2 = await totpUtils.generateTOTP(TOTP_PLAIN);
	const legStep2 = await http('/api/login/totp', { method: 'POST', body: { tempToken: legStep1.body?.data?.tempToken, code: code2 } });
	check('B2 legacy-era TOTP user logs in via explicit auto-migration',
		legStep2.body?.code === 200 && !!legStep2.body?.data?.token,
		`code=${legStep2.body?.code} msg=${legStep2.body?.message || ''} ms=${legStep2.ms}`, legStep2.ms);
	const legRow = d1Rows(`SELECT totp_key_version, totp_secret FROM user WHERE email='rc-auth-totp-leg@example.com';`)[0];
	check('B2 legacy row migrated to version=2', Number(legRow?.totp_key_version) === 2, `version=${legRow?.totp_key_version}`);
	const decAfter = await totpUtils.decryptSecret(legRow?.totp_secret || '', { totp_enc_key: TOTP_ENC_KEY });
	check('B2 migrated secret decrypts under standalone totp_enc_key (domain isolation)',
		decAfter === TOTP_PLAIN, `decrypted=${decAfter === TOTP_PLAIN}`);
	const legacyKey = await legacyDeriveKey(INIT_SECRET);
	let oldKeyCannotDecrypt = true;
	try {
		const [ivB64, cB64] = (legRow?.totp_secret || '').split(':');
		await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: Buffer.from(ivB64, 'base64') },
			legacyKey,
			Buffer.from(cB64, 'base64'));
		oldKeyCannotDecrypt = false;
	} catch (_) {}
	check('B2 migrated ciphertext NOT decryptable with legacy jwt-derived key', oldKeyCannotDecrypt);

	// B3: 备份码登录（哈希校验路径，不依赖加密密钥）
	const backup = await totpUtils.generateBackupCodes(10, { totp_enc_key: TOTP_ENC_KEY });
	seedUser(21512, 'rc-auth-backup@example.com', DEV_HASH, DEV_SALT, {
		totpEnabled: 1,
		totpSecret: await totpUtils.encryptSecret(TOTP_PLAIN, { totp_enc_key: TOTP_ENC_KEY }),
		totpKeyVersion: 2,
		totpBackupCodes: JSON.stringify({ hashedCodes: backup.hashedCodes, encryptedRaw: backup.encryptedRaw })
	});
	const bStep1 = await http('/api/login', { method: 'POST', body: { email: 'rc-auth-backup@example.com', password: DEV_PWD } });
	const bStep2 = await http('/api/login/totp', {
		method: 'POST',
		body: { tempToken: bStep1.body?.data?.tempToken, code: backup.rawCodes[0], isBackupCode: true }
	});
	check('B3 backup-code login succeeds on real workerd',
		bStep2.body?.code === 200 && !!bStep2.body?.data?.token,
		`code=${bStep2.body?.code} ms=${bStep2.ms}`, bStep2.ms);
}

const timings = results.filter(r => typeof r.ms === 'number').map(r => ({ label: r.label, ms: r.ms }));
console.log('\n--- Latency (real workerd) ---');
for (const t of timings) console.log(`  ${t.ms}ms  ${t.label.slice(0, 70)}`);

// ---------------------------------------------------------------------------
// 物理清理
// ---------------------------------------------------------------------------
d1Exec(`DELETE FROM user WHERE email LIKE 'rc-auth-%';`);
const leftovers = d1Rows(`SELECT count(*) AS c FROM user WHERE email LIKE 'rc-auth-%';`)[0].c;
check('auth-compat synthetic users physically cleaned', leftovers === 0, `left=${leftovers}`);

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} auth-compat workerd checks passed`);
snapshot('auth-compat-workerd-e2e-summary.json', { results, timings });
if (failed.length > 0) {
	console.error('FAILED:', failed.map(f => f.label).join(' | '));
	process.exit(1);
}
