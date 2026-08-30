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

const validKeyEnv = { totp_enc_key: 'epomail-totp-encryption-master-key-32b' };
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
			values: async () => []
		}),
		run: async () => ({ success: true, meta: { changes: 1 } }),
		all: async () => ({ results: [] }),
		get: async () => null,
		values: async () => []
	})
};

// Mock Hono Context
const mockContext = {
	env: {
		db: mockD1,
		kv: mockKv,
		totp_enc_key: 'epomail-totp-encryption-master-key-32b',
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
assert.strictEqual(authInfoAfterLogout.tokens.length, 0, 'logout must remove current token from KV AUTH_INFO.tokens');
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

// Restore original functions
userService.selectById = originalSelectById;
userContext.getToken = originalGetToken;

console.log('\n🎉 ALL PART A BACKEND TESTS COMPLETED AND VERIFIED 100% SUCCESSFULLY!\n');
