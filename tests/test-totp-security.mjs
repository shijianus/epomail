import totpUtils from '../mail-worker/src/utils/totp-utils.js';
import saltHashUtils from '../mail-worker/src/utils/crypto-utils.js';
import assert from 'node:assert';

console.log('--- Starting TOTP & Security Utilities Tests ---');

// 1. Test Base32 encode & decode
const testBuffer = new Uint8Array([72, 101, 108, 108, 111, 33]); // "Hello!"
const base32 = totpUtils.base32Encode(testBuffer);
assert.strictEqual(base32, 'JBSWY3DPEE');
const decoded = totpUtils.base32Decode(base32);
assert.deepStrictEqual(Array.from(decoded), Array.from(testBuffer));
console.log('✅ Base32 Encode/Decode test passed');

// 2. Test TOTP generation & verification
const secret = totpUtils.generateSecret(20);
assert.strictEqual(secret.length, 32);
const otp = await totpUtils.generateTOTP(secret);
assert.strictEqual(otp.length, 6);
const verifyValid = await totpUtils.verifyTOTP(secret, otp, 1);
assert.strictEqual(verifyValid.isValid, true);
const verifyInvalid = await totpUtils.verifyTOTP(secret, '000000', 1);
if (otp !== '000000') {
	assert.strictEqual(verifyInvalid.isValid, false);
}
console.log(`✅ TOTP Generate & Verify test passed (Secret: ${secret}, OTP: ${otp})`);

// 3. Test AES-256-GCM Encryption & Decryption
const mockEnv = { totp_enc_key: 'dGVzdC1lbmMta2V5LTMyLWJ5dGVzLXJhbmRvbS1rZXk=' };
const encrypted = await totpUtils.encryptSecret(secret, mockEnv);
assert(encrypted.includes(':'), 'Encrypted string should have IV:Cipher format');
const decrypted = await totpUtils.decryptSecret(encrypted, mockEnv);
assert.strictEqual(decrypted, secret, 'Decrypted secret should match original secret');

// Verify IV uniqueness
const encrypted2 = await totpUtils.encryptSecret(secret, mockEnv);
assert.notStrictEqual(encrypted.split(':')[0], encrypted2.split(':')[0], 'IVs must be unique per encryption');
console.log('✅ AES-256-GCM Encryption, Decryption & IV uniqueness test passed');

// 4. Test Backup Codes
const { rawCodes, hashedCodes } = await totpUtils.generateBackupCodes(10);
assert.strictEqual(rawCodes.length, 10);
assert.strictEqual(hashedCodes.length, 10);
const firstCode = rawCodes[0];
const consumeResult = await totpUtils.verifyAndConsumeBackupCode(firstCode, JSON.stringify(hashedCodes));
assert.strictEqual(consumeResult.isValid, true);
const parsedUpdated = JSON.parse(consumeResult.updatedCodesJson);
assert.strictEqual(parsedUpdated[0].used, 1);

// Consuming again should fail
const consumeAgain = await totpUtils.verifyAndConsumeBackupCode(firstCode, consumeResult.updatedCodesJson);
assert.strictEqual(consumeAgain.isValid, false);
console.log('✅ Backup Codes Generation & Single-Use Consumption test passed');

// 5. Test PBKDF2 Password Hashing & Legacy Upgrade
const plainPwd = 'SuperSecurePassword!2026';
const { salt: newSalt, hash: pbkdf2Hash } = await saltHashUtils.hashPassword(plainPwd);
assert(pbkdf2Hash.startsWith('pbkdf2:210000:'), 'Hash must start with pbkdf2:210000:');
const pbkdf2Check = await saltHashUtils.verifyPasswordWithUpgrade(plainPwd, newSalt, pbkdf2Hash);
assert.strictEqual(pbkdf2Check.isValid, true);
assert.strictEqual(pbkdf2Check.isLegacy, false);

// Legacy SHA-256 simulation
const legacySalt = saltHashUtils.generateSalt();
const legacyHash = await saltHashUtils.genLegacyHashPassword(plainPwd, legacySalt);
assert(!legacyHash.startsWith('pbkdf2:'), 'Legacy hash should not have pbkdf2 prefix');
const legacyCheck = await saltHashUtils.verifyPasswordWithUpgrade(plainPwd, legacySalt, legacyHash);
assert.strictEqual(legacyCheck.isValid, true);
assert.strictEqual(legacyCheck.isLegacy, true);
console.log('✅ PBKDF2 Password Hashing & Legacy Migration Detection test passed');

// 6. Test genRandomPwd with crypto.getRandomValues
const randPwd = saltHashUtils.genRandomPwd(16);
assert.strictEqual(randPwd.length, 16);
console.log(`✅ Secure Random Password Generation passed (Sample: ${randPwd})`);

// 7. 收尾轮：迭代兼容性与畸形/异常参数安全拒绝
console.log('\n[7] PBKDF2 iteration compatibility & malformed-parameter safety...');
{
	// 7a. 旧 100,000 次合成哈希可验证，且标记需要升级
	const legacyIterations = 100000;
	const baseKeyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(plainPwd), 'PBKDF2', false, ['deriveBits']);
	const legacyBits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt: new TextEncoder().encode(newSalt), iterations: legacyIterations, hash: 'SHA-256' },
		baseKeyMaterial, 256);
	const legacyB64 = Buffer.from(legacyBits).toString('base64');
	const legacyPbkdf2Hash = `pbkdf2:${legacyIterations}:${legacyB64}`;
	const legacyIterCheck = await saltHashUtils.verifyPasswordWithUpgrade(plainPwd, newSalt, legacyPbkdf2Hash);
	assert.strictEqual(legacyIterCheck.isValid, true, 'old 100000-iteration hash must verify');
	assert.strictEqual(legacyIterCheck.needsUpgrade, true, 'old 100000-iteration hash must be flagged for upgrade');
	assert.strictEqual(legacyIterCheck.iterations, legacyIterations);

	// 7b. 正确密码验证成功才升级；错误密码 isValid=false 且绝不升级
	const wrongCheck = await saltHashUtils.verifyPasswordWithUpgrade('WrongPassword!999', newSalt, legacyPbkdf2Hash);
	assert.strictEqual(wrongCheck.isValid, false);
	assert.strictEqual(wrongCheck.needsUpgrade, false, 'wrong password must NEVER trigger upgrade');
	const modernCheck = await saltHashUtils.verifyPasswordWithUpgrade(plainPwd, newSalt, pbkdf2Hash);
	assert.strictEqual(modernCheck.isValid, true);
	assert.strictEqual(modernCheck.needsUpgrade, false, 'current-iteration hash needs no upgrade');

	// 7c. 畸形/异常迭代参数安全拒绝（不派生、不代偿、不崩溃）
	for (const malformed of [
		'pbkdf2:abc:' + legacyB64,        // 非整数
		'pbkdf2:0:' + legacyB64,          // 零迭代
		'pbkdf2:' + legacyB64,            // 缺迭代段
		'pbkdf2:210000:',                 // 缺摘要段
		'pbkdf2:900000000:' + legacyB64,  // 异常超大迭代（DoS 注入形态）
		'pbkdf2:999:' + legacyB64         // 低于下限
	]) {
		const r = await saltHashUtils.verifyPasswordWithUpgrade(plainPwd, newSalt, malformed);
		assert.strictEqual(r.isValid, false, `malformed hash must be rejected: ${malformed.slice(0, 24)}`);
		assert.strictEqual(r.needsUpgrade, false, `malformed hash must not trigger upgrade: ${malformed.slice(0, 24)}`);
	}
	console.log('✅ Iteration compatibility & malformed-parameter safety passed (100000 verifies+upgrades, wrong pwd never upgrades, 6 malformed forms rejected)');
}

console.log('\n🎉 ALL SECURITY & TOTP UNIT TESTS PASSED 100%!');
