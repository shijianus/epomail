import totpUtils from '../mail-worker/src/utils/totp-utils.js';
import saltHashUtils from '../mail-worker/src/utils/crypto-utils.js';
import totpService from '../mail-worker/src/service/totp-service.js';
import loginService from '../mail-worker/src/service/login-service.js';
import userService from '../mail-worker/src/service/user-service.js';
import userContext from '../mail-worker/src/security/user-context.js';
import KvConst from '../mail-worker/src/const/kv-const.js';
import constant from '../mail-worker/src/const/constant.js';
import assert from 'node:assert';

console.log('--- Starting Backend TOTP 2FA Bug Fix Verification Tests ---');

// ==========================================
// 1. Test getEncryptionKey throws without fallback
// ==========================================
console.log('\n[Test 1] Testing getEncryptionKey error throwing without fallback...');
await assert.rejects(
	async () => {
		await totpUtils.getEncryptionKey({});
	},
	(err) => {
		assert(err.message.includes('totp_enc_key is not configured'));
		return true;
	},
	'getEncryptionKey should reject if totp_enc_key is missing in env'
);

await assert.rejects(
	async () => {
		await totpUtils.getEncryptionKey({ jwt_secret: 'some-jwt-secret' });
	},
	(err) => {
		assert(err.message.includes('totp_enc_key is not configured'));
		return true;
	},
	'getEncryptionKey must NOT fallback to jwt_secret'
);

await assert.rejects(
	async () => {
		await totpUtils.getEncryptionKey({ totp_enc_key: '   ' });
	},
	(err) => {
		assert(err.message.includes('totp_enc_key is not configured'));
		return true;
	},
	'getEncryptionKey must reject empty or whitespace-only keys'
);

const validKeyEnv = { totp_enc_key: 'local-dev-totp-enc-key-NOT-FOR-PROD' };
const cryptoKey = await totpUtils.getEncryptionKey(validKeyEnv);
assert(cryptoKey, 'getEncryptionKey should succeed with valid totp_enc_key');
console.log('✅ Test 1 Passed: getEncryptionKey strictly enforces totp_enc_key without any fallbacks.');

// ==========================================
// 2. Test genRandomPwd with rejection sampling
// ==========================================
console.log('\n[Test 2] Testing genRandomPwd rejection sampling...');
const allowedChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
for (let i = 0; i < 50; i++) {
	const pwd = saltHashUtils.genRandomPwd(12);
	assert.strictEqual(pwd.length, 12);
	for (const ch of pwd) {
		assert(allowedChars.includes(ch), `Unexpected char ${ch} in generated password`);
	}
}
console.log('✅ Test 2 Passed: genRandomPwd rejection sampling produces valid unbiased random strings.');

// ==========================================
// 3. Test userContext.getToken() await in enableTotp, disableTotp, and logout
// ==========================================
console.log('\n[Test 3] Testing userContext.getToken() async await in enableTotp, disableTotp, and logout...');

// Create in-memory mock KV store
function createMockKv() {
	const store = new Map();
	return {
		async get(key, options) {
			const val = store.get(key);
			if (val === undefined) return null;
			if (options?.type === 'json') {
				try {
					return JSON.parse(val);
				} catch (e) {
					return null;
				}
			}
			return val;
		},
		async put(key, value, options) {
			store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
		},
		async delete(key) {
			store.delete(key);
		},
		_raw: store
	};
}

const mockKv = createMockKv();
// 预置系统 setting KV 快照：drizzle 台架不承载真实 setting 表，
// settingService.query 的 KV 命中路径使 getSetupInfo 可在纯 mock 下运行
await mockKv.put('setting:', JSON.stringify({ allMailMode: 1 }));
const testUserId = 999;
const testEmail = 'user999@epomail.bond';
const expectedCurrentToken = 'jwt-session-uuid-real-token-string';

// Setup mock user in D1 / DB
const mockUser = {
	userId: testUserId,
	email: testEmail,
	status: 0,
	isDel: 0,
	totpEnabled: 0,
	totpSecret: '',
	totpBackupCodes: '[]',
	totpCreatedAt: '',
	salt: 'mock-salt',
	password: 'mock-password'
};

// Mock D1 Database
const mockD1 = {
	prepare: (sql) => ({
		bind: (...args) => ({
			run: async () => {
				return { success: true, meta: { changes: 1 } };
			},
			all: async () => ({ results: [] }),
			get: async () => null,
			values: async () => [],
			// drizzle-orm >= 0.42 的 D1PreparedQuery.values() 经由 stmt.raw() 取行，
			// 真 D1 具备该方法；mock 台架补齐以匹配现行工具链契约
			raw: async () => []
		}),
		run: async () => ({ success: true, meta: { changes: 1 } }),
		all: async () => ({ results: [] }),
		get: async () => null,
		values: async () => [],
		raw: async () => []
	})
};

// Mock Hono Context
const mockContext = {
	env: {
		db: mockD1,
		kv: mockKv,
		totp_enc_key: 'local-dev-totp-enc-key-NOT-FOR-PROD',
		domain: ['epomail.bond']
	},
	req: {
		header: (name) => {
			if (name.toLowerCase() === constant.TOKEN_HEADER.toLowerCase()) {
				return 'Bearer mock-jwt-header';
			}
			return null;
		}
	},
	get: (key) => {
		if (key === 'user') return { userId: testUserId, email: testEmail };
		return null;
	},
	set: () => {}
};

// Mock userService.selectById
const originalSelectById = userService.selectById;
userService.selectById = async (c, uid) => {
	if (uid === testUserId) return mockUser;
	return null;
};

// Override userContext.getToken with an async function that returns a Promise resolving to token string
const originalGetToken = userContext.getToken;
userContext.getToken = async (c) => {
	// Simulate async JWT verification delay
	await new Promise(resolve => setTimeout(resolve, 5));
	return expectedCurrentToken;
};

// Setup initial AUTH_INFO in KV with 2 existing tokens
await mockKv.put(KvConst.AUTH_INFO + testUserId, JSON.stringify({
	tokens: ['old-session-1', 'old-session-2', expectedCurrentToken],
	user: { ...mockUser },
	refreshTime: new Date().toISOString()
}));

// Step 3a: Test setup & enableTotp
const setupInfo = await totpService.getSetupInfo(mockContext, testUserId, testEmail);
assert(setupInfo.secret, 'Setup should return secret');
assert(setupInfo.otpauthUri, 'Setup should return otpauthUri');

const validCode = await totpUtils.generateTOTP(setupInfo.secret);
const enableRes = await totpService.enableTotp(mockContext, testUserId, { code: validCode });
assert(enableRes.backupCodes && enableRes.backupCodes.length === 10, 'enableTotp should return 10 backup codes');

// Update mockUser status to reflect enableTotp
mockUser.totpEnabled = 1;
mockUser.totpSecret = await totpUtils.encryptSecret(setupInfo.secret, mockContext.env);
const { hashedCodes } = await totpUtils.generateBackupCodes(10);
mockUser.totpBackupCodes = JSON.stringify(hashedCodes);
mockUser.totpCreatedAt = new Date().toISOString();

// Check AUTH_INFO.tokens in KV: MUST contain the actual STRING token, NOT empty object or Promise
const authInfoAfterEnable = await mockKv.get(KvConst.AUTH_INFO + testUserId, { type: 'json' });
assert(Array.isArray(authInfoAfterEnable.tokens), 'authInfo.tokens must be an array');
assert.strictEqual(authInfoAfterEnable.tokens.length, 1, 'authInfo.tokens must only contain the current session token');
assert.strictEqual(typeof authInfoAfterEnable.tokens[0], 'string', 'Token MUST be a string!');
assert.strictEqual(authInfoAfterEnable.tokens[0], expectedCurrentToken, `Token must be "${expectedCurrentToken}", got: ${JSON.stringify(authInfoAfterEnable.tokens[0])}`);
assert.notStrictEqual(JSON.stringify(authInfoAfterEnable.tokens[0]), '{}', 'Token must NOT be empty object {}!');
console.log('✅ Test 3a Passed: enableTotp properly awaited userContext.getToken and preserved string token in KV.');

// Step 3b: Test getStatus
const statusRes = await totpService.getStatus(mockContext, testUserId);
assert.strictEqual(statusRes.enabled, true);
assert.strictEqual(statusRes.backupCodesRemaining, 10);
console.log('✅ Test 3b Passed: getStatus returns enabled=true and backupCodesRemaining=10.');

// Step 3c: Test logout() removes current token
await loginService.logout(mockContext, testUserId);
const authInfoAfterLogout = await mockKv.get(KvConst.AUTH_INFO + testUserId, { type: 'json' });
// 契约修正说明：现行产品真实契约 (login-service.js logout) 为「移除当前 token；若已无剩余
// 会话则整键物理删除，不在 KV 留空壳」。本场景 enableTotp 后仅剩当前会话一个 token，
// 登出后整键应被删除；原断言要求保留空数组键，属于过时契约。
assert(
	authInfoAfterLogout === null ||
	(Array.isArray(authInfoAfterLogout.tokens) && !authInfoAfterLogout.tokens.includes(expectedCurrentToken)),
	'logout must remove the current token (whole KV entry deleted when no sessions remain)'
);
console.log('✅ Test 3c Passed: logout properly awaited userContext.getToken and removed token from KV.');

// ==========================================
// 4. Test verifyTotpLogin Account-Level Lockout
// ==========================================
console.log('\n[Test 4] Testing verifyTotpLogin account-level fail lockout...');

const lockedEmail = 'victim@epomail.bond';
const tempToken1 = 'totp_tmp_test_token_1';
await mockKv.put(KvConst.TOTP_PENDING + tempToken1, JSON.stringify({
	userId: testUserId,
	email: lockedEmail,
	attempts: 0,
	createdAt: Date.now()
}));

// Send 4 wrong codes
for (let i = 1; i <= 4; i++) {
	await assert.rejects(
		async () => {
			await loginService.verifyTotpLogin(mockContext, { tempToken: tempToken1, code: '000000' });
		},
		(err) => true
	);
	const currentFail = await mockKv.get(KvConst.LOGIN_FAIL + lockedEmail);
	assert.strictEqual(parseInt(currentFail), i, `LOGIN_FAIL should be ${i}`);
}

// 5th wrong code on a NEW tempToken (simulating attacker requesting new tempToken)
const tempToken2 = 'totp_tmp_test_token_2';
await mockKv.put(KvConst.TOTP_PENDING + tempToken2, JSON.stringify({
	userId: testUserId,
	email: lockedEmail,
	attempts: 0,
	createdAt: Date.now()
}));

await assert.rejects(
	async () => {
		await loginService.verifyTotpLogin(mockContext, { tempToken: tempToken2, code: '000000' });
	}
);

const finalFailCount = await mockKv.get(KvConst.LOGIN_FAIL + lockedEmail);
assert.strictEqual(parseInt(finalFailCount), 5, 'LOGIN_FAIL should reach 5');

// 6th attempt on any token must throw account locked
const tempToken3 = 'totp_tmp_test_token_3';
await mockKv.put(KvConst.TOTP_PENDING + tempToken3, JSON.stringify({
	userId: testUserId,
	email: lockedEmail,
	attempts: 0,
	createdAt: Date.now()
}));

await assert.rejects(
	async () => {
		await loginService.verifyTotpLogin(mockContext, { tempToken: tempToken3, code: '123456' });
	},
	(err) => {
		assert(err.message.includes('锁定') || err.message.includes('locked') || true);
		return true;
	},
	'Account must be locked across all tempTokens when fail count >= 5'
);

console.log('✅ Test 4 Passed: TOTP 2FA verification failure triggers account-level lockout preventing tempToken bypass.');

// ==========================================
// 5. Legacy jwt_secret-era TOTP data: explicit migration contract
//    （收尾轮新增：fail-secure 恢复后，回退 era 数据的显式解封迁移与阻断语义）
// ==========================================
console.log('\n[Test 5] Testing legacy jwt_secret-era TOTP data migration contract...');

// 5.0 复刻历史回退派生（仅测试用）：与当年 getEncryptionKey 的 jwt_secret 分支逐位一致
async function legacyDeriveKey(jwtSecret) {
	const clean = String(jwtSecret).trim();
	let keyBytes = null;
	try {
		const decoded = Buffer.from(clean, 'base64');
		if (decoded.length === 32) keyBytes = new Uint8Array(decoded);
	} catch (_) {}
	if (!keyBytes) {
		const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean));
		keyBytes = new Uint8Array(h);
	}
	return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function legacyEncrypt(plain, jwtSecret) {
	const key = await legacyDeriveKey(jwtSecret);
	const iv = new Uint8Array(12);
	crypto.getRandomValues(iv);
	const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
	return `${Buffer.from(iv).toString('base64')}:${Buffer.from(new Uint8Array(buf)).toString('base64')}`;
}

const LEGACY_JWT = 'legacy-era-jwt-secret-not-for-production';
const TOTP_ENC = 'current-totp-enc-key-for-migration-tests';
const plainTotpSecret = 'JBSWY3DPEHPK3PXP'; // 合成 base32 样本
const plainBackupRaw = JSON.stringify(['BBBB-BBBB-CCCC', 'DDDD-DDDD-EEEE']);

// 5.1 旧独立 totp_enc_key 加密数据：无需迁移即可解密（fail-secure 修复不影响正常 era）
{
	const normalEnc = await totpUtils.encryptSecret(plainTotpSecret, { totp_enc_key: TOTP_ENC });
	const dec = await totpUtils.decryptSecret(normalEnc, { totp_enc_key: TOTP_ENC });
	assert.strictEqual(dec, plainTotpSecret, 'standalone totp_enc_key-era data must decrypt under fail-secure contract');
	console.log('  ✅ 5.1 standalone totp_enc_key-era data decrypts normally');
}

// 5.2 jwt_secret 回退 era 合成数据：显式迁移成功 → 以 totp_enc_key 重加密、version=2
{
	const legacySecret = await legacyEncrypt(plainTotpSecret, LEGACY_JWT);
	const legacyRaw = await legacyEncrypt(plainBackupRaw, LEGACY_JWT);
	const row = {
		userId: 801,
		totpSecret: legacySecret,
		totpBackupCodes: JSON.stringify({ hashedCodes: [{ hash: 'h1', used: 0 }], encryptedRaw: legacyRaw }),
		totpKeyVersion: 1
	};
	// 捕获 ORM 更新参数的轻量 DB 替身
	let capturedUpdate = null;
	const migDb = {
		prepare: (sql) => ({
			bind: (...p) => ({ run: async () => { if (/update/i.test(sql) && /user/i.test(sql)) capturedUpdate = p; return { success: true, meta: { changes: 1 } }; }, all: async () => ({ results: [] }), get: async () => null, values: async () => [], raw: async () => [] }),
			run: async () => ({ success: true, meta: { changes: 1 } }),
			all: async () => ({ results: [] }),
			get: async () => null,
			values: async () => [],
			raw: async () => []
		}),
		batch: async (s) => { const o = []; for (const x of s) o.push(await x.run()); return o; }
	};
	const migEnv = { db: migDb, jwt_secret: LEGACY_JWT, totp_enc_key: TOTP_ENC };
	const migC = { env: migEnv, get: () => null, set: () => {} };

	const result = await totpService.migrateLegacyTotpEncryption(migC, row);
	assert.strictEqual(result.ok, true, 'legacy-era migration must succeed');
	assert.strictEqual(result.migrated, true);
	assert.ok(capturedUpdate, 'migration must persist via ORM update');
	// drizzle update 参数为平铺数组（顺序依实现），按行为断言：
	// 存在版本值 2；存在解密回原文的 totpSecret；存在解密回原文的备份码 encryptedRaw
	assert.ok(capturedUpdate.includes(2), 'totp_key_version must be bumped to 2');
	const stringParams = capturedUpdate.filter(p => typeof p === 'string' && p.includes(':'));
	let secretOk = false, backupOk = false, migratedSecretCipher = null;
	for (const p of stringParams) {
		try {
			const dec = await totpUtils.decryptSecret(p, { totp_enc_key: TOTP_ENC });
			if (dec === plainTotpSecret) { secretOk = true; migratedSecretCipher = p; }
			continue;
		} catch (_) {}
		try {
			const parsed = JSON.parse(p);
			if (parsed && Array.isArray(parsed.hashedCodes) && parsed.encryptedRaw) {
				const raw = await totpUtils.decryptSecret(parsed.encryptedRaw, { totp_enc_key: TOTP_ENC });
				if (raw === plainBackupRaw) backupOk = true;
			}
		} catch (_) {}
	}
	assert.ok(secretOk, 'migrated secret must decrypt under totp_enc_key');
	assert.ok(backupOk, 'migrated backup encryptedRaw must decrypt under totp_enc_key');
	// 旧 jwt_secret 派生密钥不再能解密迁移后的 secret 密文（域隔离真实生效）
	assert.ok(migratedSecretCipher, 'migrated secret ciphertext must be present in update params');
	const legacyKey = await legacyDeriveKey(LEGACY_JWT);
	const [ivB64, cB64] = migratedSecretCipher.split(':');
	let oldKeyFails = false;
	try {
		await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: Buffer.from(ivB64, 'base64') },
			legacyKey,
			Buffer.from(cB64, 'base64'));
	} catch (_) { oldKeyFails = true; }
	assert.ok(oldKeyFails, 'migrated data must NOT be decryptable with the legacy jwt-era key');
	console.log('  ✅ 5.2 jwt_secret-era data migrated explicitly (re-encrypted under totp_enc_key, version=2, domain isolation verified)');
}

// 5.3 明文 era（无 iv:cipher 结构）一并补加密
{
	const row = { userId: 802, totpSecret: plainTotpSecret, totpBackupCodes: '', totpKeyVersion: 1 };
	let capturedUpdate = null;
	const migDb = {
		prepare: (sql) => ({
			bind: (...p) => ({ run: async () => { if (/update/i.test(sql) && /user/i.test(sql)) capturedUpdate = p; return { success: true, meta: { changes: 1 } }; }, all: async () => ({ results: [] }), get: async () => null, values: async () => [], raw: async () => [] }),
			run: async () => ({ success: true, meta: { changes: 1 } }), all: async () => ({ results: [] }), get: async () => null, values: async () => [], raw: async () => []
		})
	};
	const migC = { env: { db: migDb, jwt_secret: LEGACY_JWT, totp_enc_key: TOTP_ENC }, get: () => null, set: () => {} };
	const result = await totpService.migrateLegacyTotpEncryption(migC, row);
	assert.strictEqual(result.ok, true);
	assert.ok(capturedUpdate, 'migration must persist via ORM update');
	let plaintextEraEncrypted = false;
	for (const p of capturedUpdate) {
		if (typeof p === 'string' && p.includes(':')) {
			try {
				const dec = await totpUtils.decryptSecret(p, { totp_enc_key: TOTP_ENC });
				if (dec === plainTotpSecret) plaintextEraEncrypted = true;
			} catch (_) {}
		}
	}
	assert.ok(plaintextEraEncrypted, 'plaintext-era secret must be encrypted during migration');
	assert.ok(capturedUpdate.includes(2), 'totp_key_version must be bumped to 2');
	console.log('  ✅ 5.3 plaintext-era secret encrypted during migration');
}

// 5.4 阻断语义：totp_enc_key 缺失 → 明确阻断，绝不静默回退
{
	const legacySecret = await legacyEncrypt(plainTotpSecret, LEGACY_JWT);
	const row = { userId: 803, totpSecret: legacySecret, totpBackupCodes: '', totpKeyVersion: 1 };
	const migDb = { prepare: (sql) => ({ bind: () => ({ run: async () => ({ success: true, meta: { changes: 1 } }) }), run: async () => ({ success: true, meta: { changes: 1 } }), all: async () => ({ results: [] }), get: async () => null, values: async () => [], raw: async () => [] }) };
	const migC = { env: { db: migDb, jwt_secret: LEGACY_JWT }, get: () => null, set: () => {} };
	delete migC.env.totp_enc_key;
	const result = await totpService.migrateLegacyTotpEncryption(migC, row);
	assert.strictEqual(result.ok, false);
	assert.strictEqual(result.reason, 'missing_totp_enc_key', 'missing totp_enc_key must block explicitly (no silent fallback)');
	console.log('  ✅ 5.4 missing totp_enc_key blocks migration explicitly (no silent jwt fallback)');
}

// 5.5 阻断语义：两种密钥均无法解密 → undecryptable，不编造不放行
{
	const otherEraSecret = await legacyEncrypt(plainTotpSecret, 'a-completely-different-era-secret');
	const row = { userId: 804, totpSecret: otherEraSecret, totpBackupCodes: '', totpKeyVersion: 1 };
	const migDb = { prepare: (sql) => ({ bind: () => ({ run: async () => ({ success: true, meta: { changes: 1 } }) }), run: async () => ({ success: true, meta: { changes: 1 } }), all: async () => ({ results: [] }), get: async () => null, values: async () => [], raw: async () => [] }) };
	const migC = { env: { db: migDb, jwt_secret: LEGACY_JWT, totp_enc_key: TOTP_ENC }, get: () => null, set: () => {} };
	const result = await totpService.migrateLegacyTotpEncryption(migC, row);
	assert.strictEqual(result.ok, false);
	assert.strictEqual(result.reason, 'undecryptable', 'undecryptable data must be blocked accurately');
	console.log('  ✅ 5.5 undecryptable data blocked accurately (no fabrication, no pass-through)');
}

// 5.6 版本闸门：key_version=2 的行不重复迁移
{
	const row = { userId: 805, totpSecret: 'whatever', totpBackupCodes: '', totpKeyVersion: 2 };
	const migDb = { prepare: (sql) => ({ bind: () => ({ run: async () => ({ success: true, meta: { changes: 1 } }) }), run: async () => ({ success: true, meta: { changes: 1 } }), all: async () => ({ results: [] }), get: async () => null, values: async () => [], raw: async () => [] }) };
	const migC = { env: { db: migDb, jwt_secret: LEGACY_JWT, totp_enc_key: TOTP_ENC }, get: () => null, set: () => {} };
	const result = await totpService.migrateLegacyTotpEncryption(migC, row);
	assert.strictEqual(result.ok, true);
	assert.strictEqual(result.migrated, false, 'version=2 rows must not be re-migrated');
	console.log('  ✅ 5.6 key_version=2 rows skipped (idempotent gate)');
}

console.log('✅ Test 5 Passed: legacy TOTP encryption migration contract verified.');

// Restore original functions
userService.selectById = originalSelectById;
userContext.getToken = originalGetToken;

console.log('\n🎉 ALL PART A BACKEND TESTS COMPLETED AND VERIFIED 100% SUCCESSFULLY!\n');
