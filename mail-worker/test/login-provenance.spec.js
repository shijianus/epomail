import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/hono/hono.js';
import '../src/api/login-api.js';
import loginService from '../src/service/login-service.js';
import userService from '../src/service/user-service.js';
import settingService from '../src/service/setting-service.js';
import deviceTrustService from '../src/service/device-trust-service.js';
import riskService from '../src/service/risk-service.js';
import emailService from '../src/service/email-service.js';
import securityNoticeService from '../src/service/security-notice-service.js';
import cryptoUtils from '../src/utils/crypto-utils.js';
import webauthnUtils from '../src/utils/webauthn-utils.js';
import KvConst from '../src/const/kv-const.js';

const USER_ID = 970001;
const EMAIL = 'provenance-test@example.com';
const credentialId = 'test-only-credential';
const user = {
	userId: USER_ID, email: EMAIL, password: 'test-only-hash', salt: 'test-only-salt',
	status: 0, isDel: 0, totpEnabled: 0,
	securityKeys: JSON.stringify([{ credentialId, status: 'active', publicKeyJwk: {} }])
};

function fixture() {
	const values = new Map();
	const kv = {
		async get(key, options) {
			const value = values.get(key);
			return value === undefined ? null : options?.type === 'json' ? JSON.parse(value) : value;
		},
		async put(key, value) { values.set(key, value); },
		async delete(key) { values.delete(key); }
	};
	return {
		values, kv,
		c: {
			env: { kv, jwt_secret: 'test-only-provenance-secret', domain: ['example.com'], admin: 'admin@example.com' },
			req: { url: 'http://example.com/login', header: () => null }
		}
	};
}

beforeEach(() => {
	vi.spyOn(userService, 'selectByEmailIncludeDel').mockResolvedValue(user);
	vi.spyOn(userService, 'selectById').mockResolvedValue(user);
	vi.spyOn(userService, 'updateUserInfo').mockResolvedValue();
	vi.spyOn(cryptoUtils, 'verifyPasswordWithUpgrade').mockResolvedValue({ isValid: true, needsUpgrade: false });
	vi.spyOn(settingService, 'isTotpEnabled').mockResolvedValue(false);
	vi.spyOn(emailService, 'ensureWelcomeEmailForUser').mockResolvedValue();
	vi.spyOn(securityNoticeService, 'checkAndTriggerLoginEnvironmentNotice').mockResolvedValue();
	vi.spyOn(deviceTrustService, 'evaluateTrust').mockResolvedValue({ canBypass2FA: false });
	vi.spyOn(riskService, 'evaluateRisk').mockResolvedValue({ stepUpRequired: false, riskScore: 0, clientFlags: [] });
});

afterEach(() => vi.restoreAllMocks());

async function request(env, pathname, body) {
	const response = await app.request(pathname, {
		method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
	}, env);
	expect(response.status).toBe(200);
	const json = await response.json();
	expect(json.code).toBe(200);
	return json.data;
}

async function completeMfa(env, kv, challenge) {
	const pending = await kv.get(KvConst.TOTP_PENDING + challenge.tempToken, { type: 'json' });
	vi.spyOn(webauthnUtils, 'parseClientData').mockReturnValue({ challenge: pending.passkeyChallenge });
	vi.spyOn(webauthnUtils, 'verifyAuthenticationSignature').mockResolvedValue(true);
	const result = await request(env, '/login/totp', {
		tempToken: challenge.tempToken, isPasskey: true, credentialId,
		clientDataJSON: 'test-client-data', authenticatorData: 'test-authenticator-data', signature: 'test-signature',
		authMethod: 'oauth', authProvider: 'client-claim', authContext: { method: 'oauth', provider: 'client-claim' }
	});
	expect(result.token).toBeTruthy();
	expect(await kv.get(KvConst.TOTP_PENDING + challenge.tempToken)).toBeNull();
	return kv.get(KvConst.AUTH_INFO + USER_ID, { type: 'json' });
}

describe('server-owned session authentication provenance', () => {
	it('password route ignores authentication context in request JSON', async () => {
		const { c, kv, values } = fixture();
		try {
			const result = await request(c.env, '/login', {
				email: EMAIL, password: 'test-only-password', authMethod: 'oauth', authProvider: 'apple',
				authContext: { method: 'oauth', provider: 'apple' }, noVerifyPwd: true
			});
			expect(result.token).toBeTruthy();
			expect(cryptoUtils.verifyPasswordWithUpgrade).toHaveBeenCalledOnce();
			const authInfo = await kv.get(KvConst.AUTH_INFO + USER_ID, { type: 'json' });
			expect(authInfo.tokens).toHaveLength(1);
			expect(authInfo.tokenMeta?.[authInfo.tokens[0]]).toBeUndefined();
		} finally { values.clear(); }
	});

	it('service also ignores provenance in ordinary login parameters', async () => {
		const { c, kv, values } = fixture();
		try {
			await loginService.login(c, { email: EMAIL, password: 'test-only-password', authMethod: 'oauth', authProvider: 'apple' });
			const authInfo = await kv.get(KvConst.AUTH_INFO + USER_ID, { type: 'json' });
			expect(authInfo.tokenMeta?.[authInfo.tokens[0]]).toBeUndefined();
		} finally { values.clear(); }
	});

	it('password MFA challenge and completed session never inherit client provenance', async () => {
		const { c, kv, values } = fixture();
		try {
			settingService.isTotpEnabled.mockResolvedValue(true);
			const challenge = await request(c.env, '/login', {
				email: EMAIL, password: 'test-only-password', authMethod: 'oauth', authProvider: 'apple'
			});
			expect(challenge.mfaRequired).toBe(true);
			const pending = await kv.get(KvConst.TOTP_PENDING + challenge.tempToken, { type: 'json' });
			expect(pending.authContext).toBeNull();
			expect(pending.authMethod).toBeUndefined();
			const authInfo = await completeMfa(c.env, kv, challenge);
			expect(authInfo.tokenMeta?.[authInfo.tokens[0]]).toBeUndefined();
		} finally { values.clear(); }
	});

	it('trusted OAuth context survives MFA without accepting completion request overrides', async () => {
		const { c, kv, values } = fixture();
		try {
			settingService.isTotpEnabled.mockResolvedValue(true);
			const challenge = await loginService.login(c, { email: EMAIL, password: null }, true, { method: 'oauth', provider: 'apple' });
			expect(challenge.mfaRequired).toBe(true);
			const pending = await kv.get(KvConst.TOTP_PENDING + challenge.tempToken, { type: 'json' });
			expect(pending.authContext).toEqual({ method: 'oauth', provider: 'apple' });
			const authInfo = await completeMfa(c.env, kv, challenge);
			expect(authInfo.tokenMeta[authInfo.tokens[0]]).toMatchObject({ method: 'oauth', provider: 'apple' });
		} finally { values.clear(); }
	});

	it('does not trust legacy pending provenance fields', async () => {
		const { c, kv, values } = fixture();
		try {
			const challenge = { tempToken: 'test-legacy-challenge' };
			await kv.put(KvConst.TOTP_PENDING + challenge.tempToken, JSON.stringify({
				userId: USER_ID, email: EMAIL, attempts: 0, passkeyChallenge: 'test-challenge',
				authMethod: 'oauth', authProvider: 'apple'
			}));
			const authInfo = await completeMfa(c.env, kv, challenge);
			expect(authInfo.tokenMeta?.[authInfo.tokens[0]]).toBeUndefined();
		} finally { values.clear(); }
	});
});
