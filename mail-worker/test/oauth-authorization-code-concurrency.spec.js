import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import oauthAppService from '../src/service/oauth-app-service.js';
import oauthProviderService from '../src/service/oauth-provider-service.js';
import userService from '../src/service/user-service.js';
import oneTimeCredential, { OTC_PURPOSE } from '../src/utils/one-time-credential.js';

describe('B7: OAuth Authorization Code Consumption Order Specification', () => {
	let testUser;
	let testApp;
	const mockContext = {
		env: {
			...env,
			oauth_client_enc_key: 'test-oauth-client-enc-key-32chars!!',
			jwt_secret: 'test-jwt-secret-for-b7-suite-32chars!!'
		},
		req: {
			url: 'https://mail.epocanvas.com/api/oauth/token',
			header: () => undefined
		}
	};

	beforeAll(async () => {
		// 1. 创建测试用户
		const userDb = env.db;
		await userDb.prepare(`
			CREATE TABLE IF NOT EXISTS user (
				user_id INTEGER PRIMARY KEY AUTOINCREMENT,
				email TEXT UNIQUE NOT NULL,
				type INTEGER NOT NULL DEFAULT 0,
				password TEXT NOT NULL DEFAULT '',
				salt TEXT NOT NULL DEFAULT '',
				status INTEGER NOT NULL DEFAULT 0,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
				active_time DATETIME DEFAULT CURRENT_TIMESTAMP,
				create_ip TEXT DEFAULT '',
				active_ip TEXT DEFAULT '',
				os TEXT DEFAULT '',
				browser TEXT DEFAULT '',
				device TEXT DEFAULT '',
				sort INTEGER DEFAULT 0,
				send_count INTEGER DEFAULT 0,
				reg_key_id INTEGER DEFAULT 0,
				is_del INTEGER DEFAULT 0,
				auth_version INTEGER DEFAULT 1
			)
		`).run();

		await userDb.prepare(`
			INSERT OR REPLACE INTO user (user_id, email, type, status, is_del, auth_version)
			VALUES (99001, 'b7-user@example.com', 0, 0, 0, 1)
		`).run();

		testUser = await userService.selectById(mockContext, 99001);

		// 2. 创建测试 OAuth App
		await oauthAppService.ensureTables(mockContext);
		testApp = await oauthAppService.add(mockContext, {
			name: 'B7 Test App',
			homepageUrl: 'https://b7.example.com',
			redirectUris: ['https://b7.example.com/callback'],
			scopes: 'openid profile email'
		});
	});

	async function createAuthCode({ clientId, redirectUri, scopes = 'openid email', codeChallenge = null, codeChallengeMethod = null }) {
		return await oneTimeCredential.issue(mockContext, {
			purpose: OTC_PURPOSE.AUTHORIZATION_CODE,
			payload: {
				clientId,
				userId: testUser.userId,
				authVersion: testUser.auth_version || 1,
				redirectUri,
				scopes,
				codeChallenge,
				codeChallengeMethod,
				nonce: null
			},
			ttlSeconds: 600
		});
	}

	it('does NOT consume the authorization code when client_secret is invalid', async () => {
		const code = await createAuthCode({
			clientId: testApp.clientId,
			redirectUri: 'https://b7.example.com/callback'
		});

		// 第一次调用：提供错误的 client_secret
		await expect(oauthProviderService.token(mockContext, {
			grant_type: 'authorization_code',
			code,
			client_id: testApp.clientId,
			client_secret: 'wrong_' + 'secret_mock',
			redirect_uri: 'https://b7.example.com/callback'
		})).rejects.toThrow(/client_secret.*验证失败/i);

		// 验证 authorization code 依然存在且未被核销
		const inspected = await oneTimeCredential.inspect(mockContext, {
			purpose: OTC_PURPOSE.AUTHORIZATION_CODE,
			token: code
		});
		expect(inspected).not.toBeNull();
		expect(inspected.consumed).toBe(false);

		// 纠正 client_secret 之后应该能够成功兑换
		const tokenRes = await oauthProviderService.token(mockContext, {
			grant_type: 'authorization_code',
			code,
			client_id: testApp.clientId,
			client_secret: testApp.clientSecretPlain,
			redirect_uri: 'https://b7.example.com/callback'
		});
		expect(tokenRes.access_token).toBeDefined();

		// 成功兑换后，该 code 被正式核销
		const inspectedAfter = await oneTimeCredential.inspect(mockContext, {
			purpose: OTC_PURPOSE.AUTHORIZATION_CODE,
			token: code
		});
		expect(inspectedAfter.consumed).toBe(true);
	});

	it('does NOT consume the authorization code when redirect_uri does not match', async () => {
		const code = await createAuthCode({
			clientId: testApp.clientId,
			redirectUri: 'https://b7.example.com/callback'
		});

		// 第一次调用：提供不匹配的 redirect_uri
		await expect(oauthProviderService.token(mockContext, {
			grant_type: 'authorization_code',
			code,
			client_id: testApp.clientId,
			client_secret: testApp.clientSecretPlain,
			redirect_uri: 'https://b7.example.com/different-callback'
		})).rejects.toThrow(/redirect_uri 与授权时不一致/i);

		// 验证 code 依然未被核销
		const inspected = await oneTimeCredential.inspect(mockContext, {
			purpose: OTC_PURPOSE.AUTHORIZATION_CODE,
			token: code
		});
		expect(inspected).not.toBeNull();
		expect(inspected.consumed).toBe(false);
	});

	it('does NOT consume the authorization code when PKCE code_verifier fails', async () => {
		// 生成 PKCE challenge (S256 of "my-secret-verifier-12345678901234567890")
		const verifier = 'my-secret-verifier-12345678901234567890';
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
		const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
			.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

		const code = await createAuthCode({
			clientId: testApp.clientId,
			redirectUri: 'https://b7.example.com/callback',
			codeChallenge: challenge,
			codeChallengeMethod: 'S256'
		});

		// 错误的 verifier
		await expect(oauthProviderService.token(mockContext, {
			grant_type: 'authorization_code',
			code,
			client_id: testApp.clientId,
			code_verifier: 'wrong-verifier-12345678901234567890',
			redirect_uri: 'https://b7.example.com/callback'
		})).rejects.toThrow(/PKCE code_verifier 校验失败/i);

		// 验证 code 未被核销
		const inspected = await oneTimeCredential.inspect(mockContext, {
			purpose: OTC_PURPOSE.AUTHORIZATION_CODE,
			token: code
		});
		expect(inspected.consumed).toBe(false);

		// 正确的 verifier 成功兑换
		const tokenRes = await oauthProviderService.token(mockContext, {
			grant_type: 'authorization_code',
			code,
			client_id: testApp.clientId,
			code_verifier: verifier,
			redirect_uri: 'https://b7.example.com/callback'
		});
		expect(tokenRes.access_token).toBeDefined();
	});

	it('permits only one exchange among concurrent requests sharing the same code', async () => {
		const code = await createAuthCode({
			clientId: testApp.clientId,
			redirectUri: 'https://b7.example.com/callback'
		});

		// 8 个并发请求同时发起 token 兑换
		const promises = Array.from({ length: 8 }, () =>
			oauthProviderService.token(mockContext, {
				grant_type: 'authorization_code',
				code,
				client_id: testApp.clientId,
				client_secret: testApp.clientSecretPlain,
				redirect_uri: 'https://b7.example.com/callback'
			}).then(() => 'success').catch(err => err.message)
		);

		const results = await Promise.all(promises);
		const successes = results.filter(r => r === 'success');
		const failures = results.filter(r => r !== 'success');

		expect(successes).toHaveLength(1);
		expect(failures).toHaveLength(7);
		for (const failMsg of failures) {
			expect(failMsg).toMatch(/invalid_grant/i);
		}
	});
});
