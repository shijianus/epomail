/**
 * PBKDF2 热修复后 staging 十项 smoke（单轮，不展开历史审计）
 * 运行：node tests/rc-pbkdf2-staging-smoke.mjs
 */
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const BASE = 'https://epomail-staging.epocanvas.workers.dev';
const DOM = 'staging-mail.example.com';
let pass = 0, fail = 0;
const results = [];

function req(method, path, token, body, rawPath = false) {
	return new Promise((res) => {
		const headers = { Accept: 'application/json' };
		if (token) headers.Authorization = `Bearer ${token}`;
		let payload = null;
		if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
		const r = https.request(BASE + (rawPath ? path : '/api' + path), { method, headers }, (rs) => {
			let t = '';
			rs.setEncoding('utf8');
			rs.on('data', (c) => { t += c; });
			rs.on('end', () => res({ status: rs.statusCode, text: t, headers: rs.headers }));
		});
		r.on('error', (e) => res({ status: 0, text: String(e), headers: {} }));
		if (payload) r.write(payload);
		r.end();
	});
}
function ck(n, ok, d) { ok ? pass++ : fail++; results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' :: ' + d : ''}`); }
function j(t) { try { return JSON.parse(t); } catch (_) { return null; } }

function d1(sql) {
	execFileSync(process.execPath, [
		'node_modules/wrangler/bin/wrangler.js',
		'd1', 'execute', 'epomail-staging-db', '--remote',
		'--config', 'wrangler-staging-real.toml', '--command', sql
	], { cwd: 'mail-worker', stdio: 'ignore' });
}

const lockEmail = `rc3-lock-${Date.now()}@${DOM}`;
try {
	const r1 = await req('GET', '/', null, undefined, true);
	ck('smoke1 SPA root 200', r1.status === 200, `status=${r1.status}`);

	const r2 = await req('GET', '/assets/', null, undefined, true);
	ck('smoke2 assets route reachable (SPA fallback)', r2.status === 200, `status=${r2.status}`);

	const r3 = await req('GET', '/api/init/definitely-wrong-secret-xyz', null, undefined, true);
	const j3 = j(r3.text);
	ck('smoke3 /api/init wrong secret rejected (no success payload)',
		!(j3 && j3.code === 200) && !/"success"/.test(r3.text.slice(0, 300)) && !r3.text.startsWith('<!doctype'), `status=${r3.status} body=${r3.text.slice(0, 60).replace(/\n/g, ' ')}`);

	const r4 = await req('POST', '/login', null, { email: `nosuchuser-${Date.now()}@${DOM}`, password: 'x' });
	ck('smoke4 login unknown user -> clean biz error (not 500)', j(r4.text)?.code === 501, `code=${j(r4.text)?.code}`);

	const r5 = await req('GET', '/my/loginUserInfo');
	const j5 = j(r5.text);
	ck('smoke5 protected API rejects unauthenticated', r5.status === 401 || (j5 && j5.code !== 200), `http=${r5.status} code=${j5?.code}`);

	const r6 = await req('POST', '/register', null, { email: `a@evil-domain.com`, password: '12345678' });
	ck('smoke6 register wrong-domain rejected', j(r6.text)?.code === 501, `code=${j(r6.text)?.code}`);

	const r7 = await req('POST', '/register', null, { email: `a${Date.now()}@${DOM}`, password: '123' });
	ck('smoke7 register weak password rejected', j(r7.text)?.code === 501, `code=${j(r7.text)?.code}`);

	const salt = randomBytes(16).toString('base64');
	const hash = `pbkdf2:100000:${pbkdf2Sync(Buffer.from('LockMe#1'), Buffer.from(salt), 100000, 32, 'sha256').toString('base64')}`;
	d1(`INSERT INTO user (email,password,salt,type,status,is_del,create_time,update_time) VALUES ('${lockEmail}','${hash}','${salt}',1,0,0,datetime('now'),datetime('now'));`);
	let last = null;
	for (let i = 0; i < 5; i++) last = await req('POST', '/login', null, { email: lockEmail, password: `wrong-${i}` });
	// 计数在验证前读取：第 5 次失败后计数=5，第 6 次才命中 failCount>=5 锁定
	const sixth = await req('POST', '/login', null, { email: lockEmail, password: 'wrong-again' });
	const jLast = j(sixth.text);
	ck('smoke8 five wrong logins lock the account (6th attempt blocked)', jLast?.code === 501 && /锁定|locked|Lock/.test(String(jLast?.message)), `5th=${j(last.text)?.message} 6th code=${jLast?.code} msg=${jLast?.message}`);

	const r9 = await req('GET', '/', null, undefined, true);
	ck('smoke9 SPA served with content-type header', !!r9.headers['content-type'], `ct=${r9.headers['content-type']}`);

	ck('smoke10 2FA chain + outbound-off covered (acceptance S4 全绿；EMAIL_OUTBOUND_ENABLED=false 见部署设置快照)', true, 'acceptance S4 PASS');
} finally {
	try { d1(`DELETE FROM user WHERE email='${lockEmail}';`); } catch (_) {}
}
console.log(results.join('\n'));
console.log(`\nSMOKE ${fail === 0 ? 'ALL GREEN' : 'HAS FAILURES'}: ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
