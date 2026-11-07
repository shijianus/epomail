import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import oauthAppService from '../src/service/oauth-app-service.js';
import oauthProviderService from '../src/service/oauth-provider-service.js';
import {
	decryptClientSecret,
	encryptClientSecret,
	verifyClientSecret
} from '../src/utils/oauth-secret-crypto.js';

describe('B8: OAuth Client Secret Encrypted Storage Specification', () => {
	const TEST_ENC_KEY = 'test-oauth-client-enc-key-32bytes-long!!';
	const mockContext = {
		env: {
			...env,
			oauth_client_enc_key: TEST_ENC_KEY,
			jwt_secret: 'your-dummy-jwt-secret'
		}
	};

	beforeAll(async () => {
		await oauthAppService.ensureTables(mockContext);
	});

	describe('AES-GCM Envelope Encryption & AAD Binding', () => {
		it('encrypts client secret into v1:iv:tag:ciphertext format', async () => {
			const clientId = 'epo_live_testclient123';
			const plainSecret = ['epo', 'sec', 'supersecretvalue987654321'].join('_');

			const cipher = await encryptClientSecret(mockContext.env, clientId, plainSecret);
			expect(cipher).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
			expect(cipher).not.toContain(plainSecret);

			const decrypted = await decryptClientSecret(mockContext.env, clientId, cipher);
			expect(decrypted).toBe(plainSecret);
		});

		it('rejects cross-client_id ciphertext substitution via AAD binding', async () => {
			const clientA = 'epo_live_client_A';
			const clientB = 'epo_live_client_B';
			const plainSecret = ['epo', 'sec', 'secret_for_A'].join('_');

			const cipherForA = await encryptClientSecret(mockContext.env, clientA, plainSecret);

			// 尝试用 clientB 解密属于 clientA 的密文，必须因 AAD 不匹配被拒绝
			await expect(decryptClientSecret(mockContext.env, clientB, cipherForA)).rejects.toThrow(/decrypt|integrity|AAD/i);
			expect(await verifyClientSecret(mockContext.env, clientB, plainSecret, cipherForA)).toBe(false);
		});

		it('fails closed when oauth_client_enc_key is missing', async () => {
			const envWithoutKey = { ...env, jwt_secret: 'your-jwt-without-oauth-key' };
			delete envWithoutKey.oauth_client_enc_key;

			await expect(encryptClientSecret(envWithoutKey, 'client1', 'secret1')).rejects.toThrow(/oauth_client_enc_key/i);
		});
	});

	describe('Database Encrypted Storage in oauth_app', () => {
		it('persists encrypted secret in D1 and never leaves plaintext secret in DB', async () => {
			const created = await oauthAppService.add(mockContext, {
				name: 'Encrypted App Test',
				homepageUrl: 'https://enc.example.com',
				redirectUris: ['https://enc.example.com/callback'],
				scopes: 'openid email'
			});

			expect(created.clientSecretPlain).toMatch(/^epo_sec_/);

			// 直接从数据库底层查询原始字段
			const row = await env.db.prepare('SELECT client_secret FROM oauth_app WHERE client_id = ?')
				.bind(created.clientId).first();

			expect(row).toBeDefined();
			expect(row.client_secret).toMatch(/^v1:/);
			expect(row.client_secret).not.toBe(created.clientSecretPlain);

			// 验证密码校验函数能正确校验
			const isValid = await verifyClientSecret(mockContext.env, created.clientId, created.clientSecretPlain, row.client_secret);
			expect(isValid).toBe(true);

			const isInvalid = await verifyClientSecret(mockContext.env, created.clientId, 'wrong-plain-secret', row.client_secret);
			expect(isInvalid).toBe(false);
		});

		it('smoothly handles legacy plaintext secrets via Dual-Read migration', async () => {
			const legacyClientId = 'epo_live_legacy_client';
			const legacySecret = ['epo', 'sec', 'legacy_plaintext_secret_12345'].join('_');

			await env.db.prepare(`
				INSERT INTO oauth_app (client_id, client_secret, name, homepage_url, redirect_uris, scopes, status)
				VALUES (?, ?, 'Legacy App', 'https://legacy.example.com', '["https://legacy.example.com/cb"]', 'openid', 1)
			`).bind(legacyClientId, legacySecret).run();

			// 校验明文记录正常通过
			const verified = await verifyClientSecret(mockContext.env, legacyClientId, legacySecret, legacySecret);
			expect(verified).toBe(true);
		});
	});
});
