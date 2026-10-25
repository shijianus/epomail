/**
 * PBKDF2 云端兼容性热修复本地快测 (Cloud PBKDF2 Compatibility Hotfix Fast Tests)
 *
 * 背景：Cloudflare Workers WebCrypto 拒绝迭代数 > 100000 的 PBKDF2 deriveBits
 * （"iteration counts above 100000 are not supported"）。crypto-utils.js 现采用混合派发：
 * ≤100000 走原生 WebCrypto；>100000 走 @noble/hashes 1.8.0 纯 JS 实现。
 *
 * 本套件验证：
 *   1. RFC 7914 §12 官方 PBKDF2-HMAC-SHA-256 测试向量（WebCrypto 路径）
 *   2. noble 高迭代路径与 Node WebCrypto(BoringSSL) / node:crypto.pbkdf2Sync 双参考实现逐位一致
 *      （覆盖 100000/100001/210000 边界两侧与真实存量参数）
 *   3. salt 语义：base64 字符串按 UTF-8 原样作为 salt 字节（绝不先 base64 解码）
 *   4. 非 ASCII 密码（中文/emoji）双向验证
 *   5. 畸形哈希（缺段/脏迭代参数/前后缀垃圾）安全拒绝且不派生
 *   6. 越界迭代（<1000 / >840000）安全拒绝
 *   7. 新密码生成格式契约与惰性升级标记语义
 *
 * 运行：node tests/test-pbkdf2-cloud-compat.mjs
 */

import assert from 'node:assert';
import { webcrypto, pbkdf2Sync } from 'node:crypto';
import saltHashUtils from '../mail-worker/src/utils/crypto-utils.js';

const subtle = webcrypto.subtle;
const enc = new TextEncoder();

let passed = 0;
const failed = [];
function check(label, fn) {
	return Promise.resolve()
		.then(fn)
		.then(() => { passed++; console.log(`PASS  ${label}`); })
		.catch((e) => { failed.push({ label, e }); console.log(`FAIL  ${label} :: ${e.message}`); });
}

function b64(bytes) {
	return Buffer.from(bytes).toString('base64');
}

/** Node WebCrypto 参考实现（BoringSSL，本地支持任意迭代数） */
async function refWebcrypto(password, salt, iterations, keyLenBits = 256) {
	const keyMaterial = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await subtle.deriveBits(
		{ name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
		keyMaterial,
		keyLenBits
	);
	return new Uint8Array(bits);
}

/** node:crypto 第二参考实现（OpenSSL） */
function refNodeCrypto(password, salt, iterations, dkLen = 32) {
	return pbkdf2Sync(Buffer.from(password, 'utf8'), Buffer.from(salt, 'utf8'), iterations, dkLen, 'sha256');
}

const results = [];
async function main() {
	// ---------- 1. RFC 7914 §12 官方向量（经 verifyPasswordWithUpgrade 的 WebCrypto 路径） ----------
	await check('RFC7914 vector P="passwd" S="salt" c=1 is below min-iterations bound (rejected, no derive)', async () => {
		// c=1 官方向量 dkLen=64 的前 32 字节；因 c=1 < 1000 被策略拒绝
		const r = await saltHashUtils.verifyPasswordWithUpgrade('passwd', 'salt', 'pbkdf2:1:AAAA');
		assert.strictEqual(r.isValid, false);
		assert.strictEqual(r.needsUpgrade, false);
	});

	await check('RFC7914 vector P="Password" S="NaCl" c=80000 dkLen=32 (WebCrypto path, exact match)', async () => {
		const fullVector64 = '4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56a1d425a1225833549adb841b51c9b3176a272bdebba1d078478f62b397f33c8d';
		const first32BytesB64 = b64(Buffer.from(fullVector64.slice(0, 64), 'hex'));
		const stored = `pbkdf2:80000:${first32BytesB64}`;
		const ok = await saltHashUtils.verifyPasswordWithUpgrade('Password', 'NaCl', stored);
		assert.strictEqual(ok.isValid, true, 'RFC vector must verify via WebCrypto path');
		const bad = await saltHashUtils.verifyPasswordWithUpgrade('password', 'NaCl', stored);
		assert.strictEqual(bad.isValid, false);
	});

	// ---------- 2. 双参考实现交叉验证（noble >100000 路径 vs Node WebCrypto + pbkdf2Sync） ----------
	const PWD = 'Hotfix验证密码-Xy9!热修#';
	const SALTS = ['ZmUlWbNgsFel3E0oxnPHcA==', 'short', '超长盐值-'.repeat(8) + b64(new Uint8Array(64)) + '=='];
	for (const iterations of [100000, 100001, 210000, 840000]) {
		for (let si = 0; si < SALTS.length; si++) {
			await check(`cross-check noble-vs-BoringSSL-vs-OpenSSL iterations=${iterations} salt#${si}`, async () => {
				const wc = await refWebcrypto(PWD, SALTS[si], iterations);
				const nc = refNodeCrypto(PWD, SALTS[si], iterations);
				const stored = `pbkdf2:${iterations}:${b64(wc)}`;
				const r = await saltHashUtils.verifyPasswordWithUpgrade(PWD, SALTS[si], stored);
				assert.strictEqual(r.isValid, true, 'crypto-utils must match both reference implementations');
				assert.ok(Buffer.from(wc).equals(nc), 'reference implementations must agree');
				const wrong = await saltHashUtils.verifyPasswordWithUpgrade(PWD + 'x', SALTS[si], stored);
				assert.strictEqual(wrong.isValid, false);
			});
		}
	}

	// ---------- 3. 新密码生成契约 ----------
	let genFixture = null;
	await check('genHashPassword emits pbkdf2:210000:<43-char b64> with fresh random salts', async () => {
		const { salt, hash } = await saltHashUtils.hashPassword(PWD);
		genFixture = { salt, hash };
		assert.ok(/^pbkdf2:210000:[A-Za-z0-9+/]{43}=$/.test(hash), `format contract broken: ${hash}`);
		const { salt: salt2, hash: hash2 } = await saltHashUtils.hashPassword(PWD);
		assert.notStrictEqual(salt, salt2, 'salt must be fresh per hash');
		assert.notStrictEqual(hash, hash2);
	});

	await check('generated hash equals independent Node reference derivation (same salt, UTF-8 salt bytes)', async () => {
		const ref = refNodeCrypto(PWD, genFixture.salt, 210000);
		const expected = `pbkdf2:210000:${b64(ref)}`;
		assert.strictEqual(genFixture.hash, expected, 'salt must be the raw UTF-8 bytes of the base64 string, never base64-decoded');
	});

	// ---------- 4. 非 ASCII 密码双向 ----------
	await check('non-ASCII password (中文+emoji) verifies both 210k and legacy SHA-256', async () => {
		const pwd = '密码🔐Paßw0rd!';
		const { salt, hash } = await saltHashUtils.hashPassword(pwd);
		assert.strictEqual((await saltHashUtils.verifyPasswordWithUpgrade(pwd, salt, hash)).isValid, true);
		assert.strictEqual((await saltHashUtils.verifyPasswordWithUpgrade('密码🔐Paßw0rd', salt, hash)).isValid, false);
		const legacySalt = saltHashUtils.generateSalt();
		const legacyHash = await saltHashUtils.genLegacyHashPassword(pwd, legacySalt);
		const lr = await saltHashUtils.verifyPasswordWithUpgrade(pwd, legacySalt, legacyHash);
		assert.strictEqual(lr.isValid, true);
		assert.strictEqual(lr.isLegacy, true);
		assert.strictEqual(lr.needsUpgrade, true);
	});

	// ---------- 5. 畸形哈希安全拒绝（不派生、不异常） ----------
	const malformed = [
		['pbkdf2:210000', 'missing digest segment'],
		['pbkdf2::AAAA', 'empty iteration segment'],
		['pbkdf2:210000abc:AAAA', 'iteration with alpha suffix (parseInt trap)'],
		['pbkdf2:abc210000:AAAA', 'iteration with alpha prefix'],
		['pbkdf2: 210000 :AAAA', 'iteration with whitespace'],
		['pbkdf2:+210000:AAAA', 'signed iteration'],
		['pbkdf2:210000.5:AAAA', 'float iteration'],
		['pbkdf2:0x100:AAAA', 'hex-ish iteration'],
		['pbkdf2:00210000:AAAA', 'leading-zero iteration rejected (strict digit form)'],
		['pbkdf2:999:AAAA', 'below min bound 1000'],
		['pbkdf2:840001:AAAA', 'above max bound 840000'],
		['pbkdf2:1000000000000000000000:AAAA', 'overlong digit string']
	];
	for (const [stored, why] of malformed) {
		await check(`malformed hash rejected without derive (${why})`, async () => {
			const t0 = Date.now();
			const r = await saltHashUtils.verifyPasswordWithUpgrade('anypwd', 'anysalt', stored);
			const ms = Date.now() - t0;
			assert.strictEqual(r.isValid, false);
			assert.strictEqual(r.needsUpgrade, false);
			assert.ok(ms < 50, `must not derive on malformed hash (took ${ms}ms)`);
		});
	}

	// ---------- 6. 惰性升级标记语义 ----------
	await check('needsUpgrade flag: 100k->true, 210k->false, 840k(stored above standard)->false', async () => {
		const { salt } = await saltHashUtils.hashPassword(PWD);
		const mk = async (it) => `pbkdf2:${it}:${b64(await refWebcrypto(PWD, salt, it))}`;
		assert.strictEqual((await saltHashUtils.verifyPasswordWithUpgrade(PWD, salt, await mk(100000))).needsUpgrade, true);
		assert.strictEqual((await saltHashUtils.verifyPasswordWithUpgrade(PWD, salt, await mk(210000))).needsUpgrade, false);
		assert.strictEqual((await saltHashUtils.verifyPasswordWithUpgrade(PWD, salt, await mk(400000))).needsUpgrade, false);
		// 错误密码绝不标记升级
		assert.strictEqual((await saltHashUtils.verifyPasswordWithUpgrade('wrong', salt, await mk(100000))).needsUpgrade, false);
	});

	// ---------- 7. 空值防御 ----------
	await check('null/empty inputs return invalid without throwing', async () => {
		assert.strictEqual((await saltHashUtils.verifyPasswordWithUpgrade(null, 's', 'pbkdf2:1000:AAAA')).isValid, false);
		assert.strictEqual((await saltHashUtils.verifyPasswordWithUpgrade('p', 's', '')).isValid, false);
		assert.strictEqual((await saltHashUtils.verifyPasswordWithUpgrade('p', 's', null)).isValid, false);
	});

	// ---------- 8. 写入策略开关 PBKDF2_WRITER_ITERATIONS ----------
	await check('writer policy: default (no env) keeps 210000 contract', async () => {
		const { hash } = await saltHashUtils.hashPassword(PWD);
		assert.ok(hash.startsWith('pbkdf2:210000:'));
	});

	await check('writer policy: env=100000 writes pbkdf2:100000 matching reference derivation', async () => {
		const env = { PBKDF2_WRITER_ITERATIONS: '100000' };
		const { salt, hash } = await saltHashUtils.hashPassword(PWD, env);
		assert.ok(hash.startsWith('pbkdf2:100000:'));
		const ref = refNodeCrypto(PWD, salt, 100000);
		assert.strictEqual(hash, `pbkdf2:100000:${b64(ref)}`);
		const ok = await saltHashUtils.verifyPasswordWithUpgrade(PWD, salt, hash, env);
		assert.strictEqual(ok.isValid, true);
	});

	for (const bad of ['999', '210000abc', '00210000', '', ' ', 100000, null, true, '900000']) {
		await check(`writer policy: invalid env value ${JSON.stringify(bad)} falls back to 210000`, async () => {
			const { hash } = await saltHashUtils.hashPassword(PWD, { PBKDF2_WRITER_ITERATIONS: bad });
			assert.ok(hash.startsWith('pbkdf2:210000:'), `got ${hash.slice(0, 16)}`);
		});
	}

	await check('writer policy: lazy-upgrade target follows env (100k hash + 100k target => no rewrite)', async () => {
		const salt = saltHashUtils.generateSalt();
		const mk = async (it) => `pbkdf2:${it}:${b64(await refWebcrypto(PWD, salt, it))}`;
		const stored100k = await mk(100000);
		const withDefault = await saltHashUtils.verifyPasswordWithUpgrade(PWD, salt, stored100k);
		assert.strictEqual(withDefault.needsUpgrade, true, 'default target 210k must flag 100k for upgrade');
		const withEnv = await saltHashUtils.verifyPasswordWithUpgrade(PWD, salt, stored100k, { PBKDF2_WRITER_ITERATIONS: '100000' });
		assert.strictEqual(withEnv.needsUpgrade, false, '100k target: already at policy, no rewrite');
		const stored210k = await mk(210000);
		const upFrom210 = await saltHashUtils.verifyPasswordWithUpgrade(PWD, salt, stored210k, { PBKDF2_WRITER_ITERATIONS: '400000' });
		assert.strictEqual(upFrom210.needsUpgrade, true, 'higher target flags 210k for upgrade (bounded by 840000)');
	});

	console.log(`\n${failed.length === 0 ? 'ALL GREEN' : 'HAS FAILURES'}: ${passed} passed, ${failed.length} failed`);
	if (failed.length > 0) process.exit(1);
}

await main();
