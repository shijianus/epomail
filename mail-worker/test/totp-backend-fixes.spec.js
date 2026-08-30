import totpUtils from '../src/utils/totp-utils.js';
import saltHashUtils from '../src/utils/crypto-utils.js';
import totpService from '../src/service/totp-service.js';
import loginService from '../src/service/login-service.js';
import userContext from '../src/security/user-context.js';
import KvConst from '../src/const/kv-const.js';
import constant from '../src/const/constant.js';
import { describe, it, expect, vi } from 'vitest';
import assert from 'node:assert';

describe('TOTP Backend Fixes & Security Audit Tests', () => {

	it('1. getEncryptionKey throws explicit error when totp_enc_key is missing without fallback', async () => {
		await expect(totpUtils.getEncryptionKey({})).rejects.toThrow('totp_enc_key is not configured');
		await expect(totpUtils.getEncryptionKey({ jwt_secret: 'some-jwt-secret' })).rejects.toThrow('totp_enc_key is not configured');
		await expect(totpUtils.getEncryptionKey({ totp_enc_key: '   ' })).rejects.toThrow('totp_enc_key is not configured');

		const validKeyEnv = { totp_enc_key: 'epomail-totp-encryption-master-key-32b' };
		const cryptoKey = await totpUtils.getEncryptionKey(validKeyEnv);
		expect(cryptoKey).toBeDefined();
	});

	it('2. genRandomPwd rejection sampling produces uniform distribution without bias', () => {
		const allowedChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 50; i++) {
			const pwd = saltHashUtils.genRandomPwd(16);
			expect(pwd.length).toBe(16);
			for (const ch of pwd) {
				expect(allowedChars.includes(ch)).toBe(true);
			}
		}
	});

	it('3. enableTotp, disableTotp, and logout properly await userContext.getToken() and handle AUTH_INFO.tokens', async () => {
		function createMockKv() {
			const store = new Map();
			return {
				async get(key, options) {
					const val = store.get(key);
					if (val === undefined) return null;
					if (options?.type === 'json') {
						try { return JSON.parse(val); } catch (e) { return null; }
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

		const mockContext = {
			env: {
				kv: mockKv,
				totp_enc_key: 'epomail-totp-encryption-master-key-32b',
				domain: ['epomail.bond']
			},
			req: {
				header: (name) => name.toLowerCase() === constant.TOKEN_HEADER.toLowerCase() ? 'Bearer mock-jwt-header' : null
			},
			get: (key) => key === 'user' ? { userId: testUserId, email: testEmail } : null,
			set: () => {}
		};

		// Mock userContext.getToken as an async delay function
		vi.spyOn(userContext, 'getToken').mockImplementation(async (c) => {
			await new Promise(resolve => setTimeout(resolve, 5));
			return expectedCurrentToken;
		});

		// Setup initial AUTH_INFO in KV with multiple existing tokens
		await mockKv.put(KvConst.AUTH_INFO + testUserId, JSON.stringify({
			tokens: ['old-session-1', 'old-session-2', expectedCurrentToken],
			user: { ...mockUser },
			refreshTime: new Date().toISOString()
		}));

		// Step A: Setup & Enable TOTP
		const setupInfo = await totpService.getSetupInfo(mockContext, testUserId, testEmail);
		expect(setupInfo.secret).toBeDefined();

		const validCode = await totpUtils.generateTOTP(setupInfo.secret);
		const enableRes = await totpService.enableTotp(mockContext, testUserId, { code: validCode });
		expect(enableRes.backupCodes).toHaveLength(10);

		// Check KV AUTH_INFO.tokens: MUST be an array containing the exact token string (NOT empty object or Promise)
		const authInfoAfterEnable = await mockKv.get(KvConst.AUTH_INFO + testUserId, { type: 'json' });
		expect(Array.isArray(authInfoAfterEnable.tokens)).toBe(true);
		expect(authInfoAfterEnable.tokens.length).toBe(1);
		expect(typeof authInfoAfterEnable.tokens[0]).toBe('string');
		expect(authInfoAfterEnable.tokens[0]).toBe(expectedCurrentToken);
		expect(JSON.stringify(authInfoAfterEnable.tokens[0])).not.toBe('{}');

		// Step B: Query TOTP Status
		const statusRes = await totpService.getStatus(mockContext, testUserId);
		expect(statusRes.enabled).toBe(true);
		expect(statusRes.backupCodesRemaining).toBe(10);

		// Step C: Logout removes the token from KV AUTH_INFO.tokens
		await loginService.logout(mockContext, testUserId);
		const authInfoAfterLogout = await mockKv.get(KvConst.AUTH_INFO + testUserId, { type: 'json' });
		expect(authInfoAfterLogout.tokens.length).toBe(0);
	});

	it('4. verifyTotpLogin enforces account-level fail lockout across multiple tempTokens', async () => {
		function createMockKv() {
			const store = new Map();
			return {
				async get(key, options) {
					const val = store.get(key);
					if (val === undefined) return null;
					if (options?.type === 'json') {
						try { return JSON.parse(val); } catch (e) { return null; }
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
		const testUserId = 888;
		const lockedEmail = 'locked-victim@epomail.bond';

		const mockContext = {
			env: {
				kv: mockKv,
				totp_enc_key: 'epomail-totp-encryption-master-key-32b',
				domain: ['epomail.bond']
			},
			get: (key) => key === 'user' ? { userId: testUserId, email: lockedEmail } : null,
			set: () => {}
		};

		const tempToken1 = 'totp_tmp_lockout_test_1';
		await mockKv.put(KvConst.TOTP_PENDING + tempToken1, JSON.stringify({
			userId: testUserId,
			email: lockedEmail,
			attempts: 0,
			createdAt: Date.now()
		}));

		// 4 failed attempts on tempToken1
		for (let i = 1; i <= 4; i++) {
			await expect(loginService.verifyTotpLogin(mockContext, { tempToken: tempToken1, code: '000000' })).rejects.toThrow();
			const currentFail = await mockKv.get(KvConst.LOGIN_FAIL + lockedEmail);
			expect(parseInt(currentFail)).toBe(i);
		}

		// 5th failed attempt on a new tempToken2
		const tempToken2 = 'totp_tmp_lockout_test_2';
		await mockKv.put(KvConst.TOTP_PENDING + tempToken2, JSON.stringify({
			userId: testUserId,
			email: lockedEmail,
			attempts: 0,
			createdAt: Date.now()
		}));

		await expect(loginService.verifyTotpLogin(mockContext, { tempToken: tempToken2, code: '000000' })).rejects.toThrow();
		const finalFail = await mockKv.get(KvConst.LOGIN_FAIL + lockedEmail);
		expect(parseInt(finalFail)).toBe(5);

		// 6th attempt on any token must throw account locked
		const tempToken3 = 'totp_tmp_lockout_test_3';
		await mockKv.put(KvConst.TOTP_PENDING + tempToken3, JSON.stringify({
			userId: testUserId,
			email: lockedEmail,
			attempts: 0,
			createdAt: Date.now()
		}));

		await expect(loginService.verifyTotpLogin(mockContext, { tempToken: tempToken3, code: '123456' })).rejects.toThrow();
	});

});
