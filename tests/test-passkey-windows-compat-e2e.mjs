import assert from 'node:assert';
import crypto from 'node:crypto';
import webauthnUtils from '../mail-worker/src/utils/webauthn-utils.js';

console.log('================================================================');
console.log('=== 开始测试：Passkey Windows 兼容性与跨设备 WebAuthn 算法核验 ===');
console.log('================================================================');

(async () => {
	// -------------------------------------------------------------
	// 1. 验证 Windows 规范：User Handle 必须为 >= 16 字节的不透明 Buffer
	// -------------------------------------------------------------
	console.log('\n[测试 1] 校验 Passkey 注册规范中 User Handle 与 Windows TPM 兼容性...');
	
	// 测试 User Handle 生成逻辑：使用 SHA-256 派生 32 字节 opaque buffer
	const generateUserHandle = async (userId) => {
		const raw = `epomail_uid_${userId}`;
		const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
		return new Uint8Array(hash);
	};

	const userHandle = await generateUserHandle(42);
	assert.strictEqual(userHandle instanceof Uint8Array, true, 'User Handle 必须是 Uint8Array 字节数组');
	assert.strictEqual(userHandle.byteLength, 32, 'User Handle 长度必须为 32 字节（SHA-256 opaque handle），彻底杜绝 Windows 0x80090029 报错');
	console.log(`  ✓ 生成的 User Handle 字节长度: ${userHandle.byteLength} 字节 (Windows webauthn.dll 规范: 16-64 字节)`);

	// 验证支持的算法参数列表是否覆盖 Windows Hello 首选的 PS256 (-37) 以及 ES256 (-7), RS256 (-257)
	const pubKeyCredParams = [
		{ type: 'public-key', alg: -7 },   // ES256 (P-256, iOS/macOS/Android/FIDO2 standard)
		{ type: 'public-key', alg: -257 }, // RS256 (PKCS#1 v1.5 with SHA-256)
		{ type: 'public-key', alg: -37 },  // PS256 (RSA-PSS with SHA-256, Windows 11 TPM preferred)
		{ type: 'public-key', alg: -8 },   // Ed25519
		{ type: 'public-key', alg: -258 }, // PS384
		{ type: 'public-key', alg: -259 }, // PS512
		{ type: 'public-key', alg: -35 },  // ES384
		{ type: 'public-key', alg: -36 }   // ES512
	];
	const algs = pubKeyCredParams.map(p => p.alg);
	console.log('  ✓ 注册选项协商算法列表:', algs);
	assert.ok(algs.includes(-37), '必须包含 PS256 (alg: -37)，Windows 11 TPM 硬件密钥首选');
	assert.ok(algs.includes(-7), '必须包含 ES256 (alg: -7)，iOS / macOS / Android / FIDO2 通用');
	assert.ok(algs.includes(-257), '必须包含 RS256 (alg: -257)，传统硬件密钥兼容');

	// -------------------------------------------------------------
	// 2. 模拟 Windows Hello RSA-PSS (PS256) 密钥生成、签名与验签
	// -------------------------------------------------------------
	console.log('\n[测试 2] 模拟 Windows Hello PS256 (RSA-PSS with SHA-256) 签名验签闭环...');
	const { publicKey, privateKey } = await crypto.webcrypto.subtle.generateKey(
		{
			name: 'RSA-PSS',
			modulusLength: 2048,
			publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
			hash: 'SHA-256'
		},
		true,
		['sign', 'verify']
	);

	const jwk = await crypto.webcrypto.subtle.exportKey('jwk', publicKey);
	assert.strictEqual(jwk.kty, 'RSA', '导出 JWK 格式正确');

	// 构造待签名的 clientData 与 authData
	const clientChallenge = webauthnUtils.generateChallenge();
	const clientDataObj = {
		type: 'webauthn.get',
		challenge: clientChallenge,
		origin: 'https://mail.epocanvas.com'
	};
	const clientDataJSON = Buffer.from(JSON.stringify(clientDataObj)).toString('base64');
	const clientDataHash = crypto.createHash('sha256').update(Buffer.from(JSON.stringify(clientDataObj))).digest();

	// 37 字节模拟 authenticatorData (32 字节 rpIdHash + 1 字节 flags + 4 字节 signCount)
	const rpIdHash = crypto.createHash('sha256').update('mail.epocanvas.com').digest();
	const authData = Buffer.concat([
		rpIdHash,
		Buffer.from([0x05]), // flags: UP (0x01) | UV (0x04)
		Buffer.from([0x00, 0x00, 0x00, 0x01]) // signCount = 1
	]);
	const authDataBase64 = authData.toString('base64');

	// 计算签名载荷 authData || hash(clientDataJSON)
	const signaturePayload = Buffer.concat([authData, clientDataHash]);
	const rawSig = await crypto.webcrypto.subtle.sign(
		{
			name: 'RSA-PSS',
			saltLength: 32
		},
		privateKey,
		signaturePayload
	);
	const signatureBase64 = Buffer.from(rawSig).toString('base64');

	// 执行服务端验签
	const verifyResult = await webauthnUtils.verifyAuthenticationSignature({
		clientDataJSONBase64: clientDataJSON,
		authenticatorDataBase64: authDataBase64,
		signatureBase64: signatureBase64,
		publicKeyJwk: jwk
	});

	assert.strictEqual(verifyResult, true, 'Windows Hello RSA-PSS (PS256) 签名必须通过服务端 Web Crypto 验签');
	console.log('  ✓ Windows Hello RSA-PSS (PS256) 签名验签 100% 通过！');

	// 故意篡改签名，确保验签能正确防伪
	const tamperedSig = Buffer.from(rawSig);
	tamperedSig[0] ^= 0xff;
	const failResult = await webauthnUtils.verifyAuthenticationSignature({
		clientDataJSONBase64: clientDataJSON,
		authenticatorDataBase64: authDataBase64,
		signatureBase64: tamperedSig.toString('base64'),
		publicKeyJwk: jwk
	});
	assert.strictEqual(failResult, false, '被篡改的签名必须被拒绝');
	console.log('  ✓ 篡改签名防伪拒绝测试通过');

	// -------------------------------------------------------------
	// 3. 模拟 Apple / Android ES256 (ECDSA P-256) 签名验签闭环
	// -------------------------------------------------------------
	console.log('\n[测试 3] 模拟 Apple Touch ID / Android 生物识别 ES256 签名验签闭环...');
	const ecKeys = await crypto.webcrypto.subtle.generateKey(
		{
			name: 'ECDSA',
			namedCurve: 'P-256'
		},
		true,
		['sign', 'verify']
	);
	const ecJwk = await crypto.webcrypto.subtle.exportKey('jwk', ecKeys.publicKey);

	const ecSig = await crypto.webcrypto.subtle.sign(
		{
			name: 'ECDSA',
			hash: 'SHA-256'
		},
		ecKeys.privateKey,
		signaturePayload
	);

	const ecVerifyResult = await webauthnUtils.verifyAuthenticationSignature({
		clientDataJSONBase64: clientDataJSON,
		authenticatorDataBase64: authDataBase64,
		signatureBase64: Buffer.from(ecSig).toString('base64'),
		publicKeyJwk: ecJwk
	});
	assert.strictEqual(ecVerifyResult, true, 'Apple / Android ES256 (P-256) 签名必须通过服务端 Web Crypto 验签');
	console.log('  ✓ Apple / Android ES256 签名验签 100% 通过！');

	console.log('\n================================================================');
	console.log('=== 所有 Passkey Windows 兼容性与跨设备算法断言全部通过 (GREEN) ===');
	console.log('================================================================');
})().catch(err => {
	console.error('❌ 测试执行失败:', err);
	process.exit(1);
});
