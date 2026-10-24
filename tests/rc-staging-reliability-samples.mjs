/**
 * staging 有界可靠性采样（首达结果，无重试）
 * (Bounded Reliability Sampling — first-attempt results only, no retries)
 *
 * 样本计划（本轮）：
 *   R1 100k native 登录 ×6（同一 100k 夹具，正确口令，~6s 间隔）
 *   R2 210k noble 登录 ×6（同一 210k 夹具，正确口令；Free 套餐预期可能 1102，如实记录）
 *   R3 低迭代(1000) 惰性升级登录 ×3（3 个独立夹具）
 *   R4 legacy SHA-256 迁移登录 ×3（3 个独立夹具）
 *   R5 改密派生 ×3（同一合成账号连续三次 /my/resetPassword）
 *   R6 连续操作 ×2 轮（register→login→reset→login 背靠背，4 次派生/轮）
 * 全部记录首次 HTTP 状态/业务码/耗时；失败样本保留不覆盖；不做压力测试。
 *
 * 运行：node tests/rc-staging-reliability-samples.mjs
 * 证据：.rc3-evidence/reliability-samples.json（合成数据 finally 物理清理）
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, createHash, randomBytes } from 'node:crypto';

const BASE = 'https://epomail-staging.epocanvas.workers.dev';
const DOM = 'staging-mail.example.com';
const WORKER_DIR = path.resolve('mail-worker');
const TS = Date.now();
const PWD = 'RelSample#55q';

const samples = [];
function record(op, idx, status, biz, ms, extra = '') {
	const row = { op, idx, firstHttp: status, firstBiz: biz, ms, extra };
	samples.push(row);
	const flag = biz === 200 ? 'OK ' : (status === 503 ? '1102' : 'ERR');
	console.log(`${flag}  ${op}#${idx} http=${status} biz=${biz} ${ms}ms ${extra}`);
}
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
				resolve({ status: res.statusCode, body: json, ms: Date.now() - started });
			});
		});
		req.on('error', (e) => resolve({ status: 0, body: null, ms: Date.now() - started, err: String(e) }));
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
function d1Rows(sql) { const out = d1(sql); const p = JSON.parse(out.slice(out.indexOf('['))); return (Array.isArray(p) ? p[p.length - 1] : p).results || []; }
function seed(email, hash, salt) {
	d1(`INSERT INTO user (email,password,salt,type,status,is_del,create_time,update_time) VALUES ('${email}','${hash}','${salt}',1,0,0,datetime('now'),datetime('now'));`);
}
const refPbkdf2 = (p, s, it) => `pbkdf2:${it}:${pbkdf2Sync(Buffer.from(p), Buffer.from(s), it, 32, 'sha256').toString('base64')}`;
const refLegacy = (p, s) => createHash('sha256').update(s + p, 'utf8').digest('base64');
const refSalt = () => randomBytes(16).toString('base64');

const created = [];
const fixtureEmail = (tag) => { const e = `rc3-${tag}-${TS}-${Math.random().toString(36).slice(2, 7)}@${DOM}`; created.push(e); return e; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cleanup() {
	console.log('\n[cleanup] 物理清理采样合成数据 ...');
	try {
		for (const e of created) {
			const rows = d1Rows(`SELECT user_id FROM user WHERE email='${e}';`);
			for (const r of rows) {
				d1(`DELETE FROM email WHERE user_id=${r.user_id};`);
				d1(`DELETE FROM account WHERE user_id=${r.user_id};`);
				d1(`DELETE FROM user WHERE user_id=${r.user_id};`);
			}
		}
		const left = d1Rows(`SELECT COUNT(*) AS n FROM user WHERE email IN ('${created.join("','")}');`)[0];
		console.log('cleanup left:', left?.n);
	} catch (e) { console.error('cleanup error:', e.message); }
}

try {
	// ---- R1: 100k native ×6 ----
	{
		const e = fixtureEmail('r1');
		const s = refSalt();
		seed(e, refPbkdf2(PWD, s, 100000), s);
		for (let i = 1; i <= 6; i++) {
			const r = await login(e, PWD);
			record('R1-100k-native-login', i, r.status, r.body?.code ?? null, r.ms);
			await sleep(6000);
		}
	}
	// ---- R2: 210k noble ×6（Free 套餐如实记录 1102）----
	{
		const e = fixtureEmail('r2');
		const s = refSalt();
		seed(e, refPbkdf2(PWD, s, 210000), s);
		for (let i = 1; i <= 6; i++) {
			const r = await login(e, PWD);
			record('R2-210k-noble-login', i, r.status, r.body?.code ?? null, r.ms, r.status === 503 ? 'platform-1102' : '');
			await sleep(6000);
		}
	}
	// ---- R3: 低迭代(1000) 升级 ×3 ----
	for (let i = 1; i <= 3; i++) {
		const e = fixtureEmail('r3');
		const s = refSalt();
		seed(e, refPbkdf2(PWD, s, 1000), s);
		const r = await login(e, PWD);
		const after = d1Rows(`SELECT password FROM user WHERE email='${e}';`)[0]?.password || '';
		record('R3-lowiter-upgrade', i, r.status, r.body?.code ?? null, r.ms, `upgraded=${after.startsWith('pbkdf2:100000:')}`);
		await sleep(4000);
	}
	// ---- R4: legacy SHA-256 迁移 ×3 ----
	for (let i = 1; i <= 3; i++) {
		const e = fixtureEmail('r4');
		const s = refSalt();
		seed(e, refLegacy(PWD, s), s);
		const r = await login(e, PWD);
		const after = d1Rows(`SELECT password FROM user WHERE email='${e}';`)[0]?.password || '';
		record('R4-legacy-migrate', i, r.status, r.body?.code ?? null, r.ms, `migrated=${after.startsWith('pbkdf2:100000:')}`);
		await sleep(4000);
	}
	// ---- R5: 改密派生 ×3（同一账号连续）----
	{
		const e = fixtureEmail('r5');
		const s = refSalt();
		seed(e, refPbkdf2(PWD, s, 100000), s);
		const l = await login(e, PWD);
		record('R5-prechange-login', 0, l.status, l.body?.code ?? null, l.ms);
		const jwt = l.body?.data?.token;
		let pwd = PWD;
		for (let i = 1; i <= 3 && jwt; i++) {
			pwd = `Rot#${i}-${randomBytes(6).toString('hex')}`;
			const r = await http('/my/resetPassword', { method: 'PUT', token: jwt, body: { password: pwd } });
			record('R5-change-derive', i, r.status, r.body?.code ?? null, r.ms);
		}
	}
	// ---- R6: 连续操作 ×2 轮 ----
	for (let round = 1; round <= 2; round++) {
		const e = fixtureEmail('r6');
		const reg = await http('/register', { method: 'POST', body: { email: e, password: PWD } });
		record('R6-register', round, reg.status, reg.body?.code ?? null, reg.ms);
		const l1 = await login(e, PWD);
		record('R6-login1', round, l1.status, l1.body?.code ?? null, l1.ms);
		const jwt = l1.body?.data?.token;
		const chg = await http('/my/resetPassword', { method: 'PUT', token: jwt, body: { password: `R6#${round}x87654321` } });
		record('R6-change', round, chg.status, chg.body?.code ?? null, chg.ms);
		const l2 = await login(e, `R6#${round}x87654321`);
		record('R6-login2', round, l2.status, l2.body?.code ?? null, l2.ms);
	}
} catch (err) {
	console.error('FATAL:', err.message);
	samples.push({ op: 'script-fatal', err: err.message });
} finally {
	await cleanup();
	fs.writeFileSync('.rc3-evidence/reliability-samples.json', JSON.stringify({ plan: 'R1×6 R2×6 R3×3 R4×3 R5×3 R6×2rounds', samples }, null, 2));
	const ok = samples.filter((s) => s.firstBiz === 200).length;
	console.log(`\nfirst-attempt summary: ${ok}/${samples.length} samples biz=200; failures preserved in .rc3-evidence/reliability-samples.json`);
}
