import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { buildSignedObjectUrl } from '../src/utils/object-token.js';
import { issueOAuthToken } from '../src/service/oauth-one-time-service.js';

describe('Public object storage isolation', () => {
	beforeEach(async () => {
		await env.kv.delete('auth-uid:1');
		await env.kv.delete('setting:');
		await env.kv.delete('public_key:');
		await env.kv.delete('attachments/test-secret.txt');
	});

	it('does not expose KV control keys through /api/oss', async () => {
		await env.kv.put('auth-uid:1', JSON.stringify({ tokens: ['session-token'], user: { userId: 1 } }));
		await env.kv.put('setting:', JSON.stringify({ aiApiKey: 'should-not-leak' }));
		await env.kv.put('public_key:', 'public-token');

		for (const key of ['auth-uid:1', 'setting:', 'public_key:']) {
			const response = await SELF.fetch(`http://example.com/api/oss/${encodeURIComponent(key)}`);
			expect(response.status).toBe(404);
			const body = await response.text();
			expect(body).not.toContain('session-token');
			expect(body).not.toContain('should-not-leak');
			expect(body).not.toContain('public-token');
		}
	});

	it('does not serve attachments without a capability signature', async () => {
		await env.kv.put('attachments/test-secret.txt', 'hello attachment', {
			metadata: { contentType: 'text/plain' }
		});

		const viaOss = await SELF.fetch('http://example.com/api/oss/attachments/test-secret.txt');
		expect(viaOss.status).toBe(404);
		expect(await viaOss.text()).not.toContain('hello attachment');

		const viaDirect = await SELF.fetch('http://example.com/attachments/test-secret.txt');
		expect(viaDirect.status).toBe(404);
		expect(await viaDirect.text()).not.toContain('hello attachment');
	});

	it('returns 404 for encoded traversal on the root static route and still serves public static objects', async () => {
		await env.kv.put('static/probe-static.txt', 'static-body', {
			metadata: { contentType: 'text/plain' }
		});
		try {
			const traversal = await SELF.fetch('http://example.com/static/..%2Fauth-uid%3A2');
			expect(traversal.status).toBe(404);
			expect(await traversal.text()).not.toContain('session');

			const response = await SELF.fetch('http://example.com/static/probe-static.txt');
			expect(response.status).toBe(200);
			expect(await response.text()).toBe('static-body');
			expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
			expect(response.headers.get('Cache-Control')).toContain('public');
		} finally {
			await env.kv.delete('static/probe-static.txt');
		}
	});

	it('serves explicitly allow-listed object keys through a signed capability', async () => {
		await env.kv.put('attachments/test-secret.txt', 'hello attachment', {
			metadata: { contentType: 'text/plain' }
		});

		const signedUrl = await buildSignedObjectUrl({ env }, 'attachments/test-secret.txt', { userId: 1, ttlSeconds: 60 });
		const response = await SELF.fetch(`http://example.com/api${signedUrl}`);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('hello attachment');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Cache-Control')).toBe('no-store');
	});

	it('rejects tampered signatures, keys and expiry parameters', async () => {
		await env.kv.put('attachments/test-secret.txt', 'hello attachment', {
			metadata: { contentType: 'text/plain' }
		});

		const signedUrl = await buildSignedObjectUrl({ env }, 'attachments/test-secret.txt', { userId: 1, ttlSeconds: 60 });
		const tamperedSignature = signedUrl.replace(/sig=[^&]+/, 'sig=AAAA');
		const tamperedKey = signedUrl.replace('test-secret.txt', 'other-secret.txt');
		const malformedExpiry = signedUrl.replace(/exp=\d+/, 'exp=99999999999999');

		for (const url of [tamperedSignature, tamperedKey, malformedExpiry]) {
			const response = await SELF.fetch(`http://example.com/api${url}`);
			expect(response.status).toBe(404);
			expect(await response.text()).not.toContain('hello attachment');
		}
	});

	it('keeps static assets public without a signature', async () => {
		await env.kv.put('static/avatar/1/avatar.png', 'avatar-bytes', {
			metadata: { contentType: 'image/png', contentDisposition: 'inline' }
		});

		const response = await SELF.fetch('http://example.com/api/oss/static/avatar/1/avatar.png');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('avatar-bytes');
		expect(response.headers.get('Content-Type')).toBe('image/png');
	});

	it('rejects traversal and encoded KV-style keys', async () => {
		for (const key of ['../auth-uid:1', 'attachments/../auth-uid:1', 'attachments/%2e%2e/auth-uid:1']) {
			const response = await SELF.fetch(`http://example.com/api/oss/${key}`);
			const body = await response.text();
			expect(body).not.toContain('session-token');
			if (response.status === 200) {
				// Auth middleware uses a body-level code and HTTP 200 by design.
				expect(JSON.parse(body).code).toBe(401);
			} else {
				expect([400, 404, 401]).toContain(response.status);
			}
		}
	});
});

describe('Public API hardening', () => {
	it('rejects unsigned Resend webhooks', async () => {
		const response = await SELF.fetch('http://example.com/api/webhooks', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'email.delivered', data: { email_id: 'x' } })
		});
		expect(response.status).toBe(401);
	});

	it('rejects a wrong init secret', async () => {
		const response = await SELF.fetch('http://example.com/api/init/not-the-secret');
		expect(response.status).toBe(403);
	});

	it('does not allow cross-origin API reads by default', async () => {
		const response = await SELF.fetch('http://example.com/api/email/list?size=1', {
			headers: { Origin: 'https://evil.example' }
		});
		const body = await response.json();
		expect(body.code).toBe(401);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
		expect(response.headers.get('Cache-Control')).toBe('no-store');
	});

	it('reflects same-origin CORS and keeps OAuth endpoints public', async () => {
		const sameOrigin = await SELF.fetch('http://example.com/api/email/list?size=1', {
			headers: { Origin: 'http://example.com' }
		});
		expect(sameOrigin.headers.get('Access-Control-Allow-Origin')).toBe('http://example.com');

		const oauth = await SELF.fetch('http://example.com/api/oauth/userinfo', {
			headers: { Origin: 'https://third-party.example' }
		});
		expect(oauth.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});

	it('does not grant a cross-origin preflight by default', async () => {
		const response = await SELF.fetch('http://example.com/api/email/list', {
			method: 'OPTIONS',
			headers: {
				Origin: 'https://evil.example',
				'Access-Control-Request-Method': 'GET',
				'Access-Control-Request-Headers': 'authorization'
			}
		});
		expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
	});
});

describe('OAuth public callback boundary', () => {
	it('rejects a callback without a server-issued state before contacting the provider', async () => {
		const missingCode = await SELF.fetch('http://example.com/api/oauth/callback/apple', { redirect: 'manual' });
		expect(missingCode.status).toBe(302);
		expect(missingCode.headers.get('Location')).toContain('oauth_missing_code');

		const badState = await SELF.fetch('http://example.com/api/oauth/callback/apple?code=fake&state=guessed', { redirect: 'manual' });
		expect(badState.status).toBe(302);
		expect(badState.headers.get('Location')).toContain('oauth_state_invalid');
	});

	it('exchanges a short-lived login code once and never via the callback URL', async () => {
		const code = await issueOAuthToken({ env }, {
			kind: 'login_code',
			payload: {
				token: 'mailbox-jwt-value',
				provider: 'apple',
				userInfo: { oauthUserId: 'apple:user-1' }
			},
			ttlSeconds: 60
		});

		const first = await SELF.fetch('http://example.com/api/oauth/exchange', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code })
		});
		const firstBody = await first.json();
		expect(firstBody.code).toBe(200);
		expect(firstBody.data.token).toBe('mailbox-jwt-value');

		const second = await SELF.fetch('http://example.com/api/oauth/exchange', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code })
		});
		expect((await second.json()).code).toBe(401);
	});

	it('propagates an MFA challenge instead of issuing a session token', async () => {
		const code = await issueOAuthToken({ env }, {
			kind: 'login_code',
			payload: {
				token: null,
				mfa: {
					mfaRequired: true,
					tempToken: 'totp_tmp_oauth',
					email: 'mfa@example.com',
					hasTotp: true,
					hasPasskeys: false
				},
				provider: 'apple',
				userInfo: { oauthUserId: 'apple:user-1' }
			},
			ttlSeconds: 60
		});

		const response = await SELF.fetch('http://example.com/api/oauth/exchange', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code })
		});
		const body = await response.json();
		expect(body.code).toBe(200);
		expect(body.data.token).toBeUndefined();
		expect(body.data.mfaRequired).toBe(true);
		expect(body.data.tempToken).toBe('totp_tmp_oauth');
	});

	it('rejects an unregistered redirect_uri on the authorize endpoint', async () => {
		await env.kv.put('setting:', JSON.stringify({
			oauthProviders: { apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 } }
		}));
		try {
			const response = await SELF.fetch('http://example.com/api/oauth/authorize/apple?redirect_uri=https%3A%2F%2Fattacker.example%2Fcallback');
			const body = await response.json();
			expect(body.code).not.toBe(200);
			expect(body.message).toContain('redirect_uri');
		} finally {
			await env.kv.delete('setting:');
		}
	});

	it('binds the callback to the browser that initiated the authorize flow', async () => {
		const pair = await crypto.subtle.generateKey(
			{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
			true,
			['sign', 'verify']
		);
		const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
		jwk.kid = 'flow-binding-test';
		jwk.use = 'sig';
		await env.kv.put('apple_jwks_v1', JSON.stringify({ keys: [jwk] }));
		await env.kv.put('setting:', JSON.stringify({
			oauthProviders: { apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 } }
		}));
		try {
			const authorize = await SELF.fetch('http://example.com/api/oauth/authorize/apple');
			const authorizeBody = await authorize.json();
			const state = new URL(authorizeBody.data.url).searchParams.get('state');
			expect(state).toBeTruthy();
			const setCookie = authorize.headers.get('Set-Cookie') || '';
			expect(setCookie).toContain(`epo_oauth_flow=${state}`);

			// A different browser has the state URL but not the initiating
			// browser's cookie and must not be able to complete the flow.
			const foreign = await SELF.fetch(
				`http://example.com/api/oauth/callback/apple?id_token=fake&state=${state}`,
				{ redirect: 'manual' }
			);
			expect(foreign.headers.get('Location')).toContain('oauth_state_invalid');
			const pendingAfterForeign = await env.db.prepare(
				"SELECT COUNT(*) AS total FROM oauth_one_time_token WHERE kind = 'state' AND provider = 'apple'"
			).first();
			expect(Number(pendingAfterForeign.total)).toBe(1);

			// The initiating browser owns the cookie and reaches the provider
			// exchange (the fake token is then rejected by the Apple verifier).
			const own = await SELF.fetch(
				`http://example.com/api/oauth/callback/apple?id_token=fake&state=${state}`,
				{ redirect: 'manual', headers: { cookie: `epo_oauth_flow=${state}` } }
			);
			const location = own.headers.get('Location') || '';
			expect(location).toContain('error=oauth_failed');
			const pendingAfterConsume = await env.db.prepare(
				"SELECT COUNT(*) AS total FROM oauth_one_time_token WHERE kind = 'state' AND provider = 'apple'"
			).first();
			expect(Number(pendingAfterConsume.total)).toBe(0);

			const replay = await SELF.fetch(
				`http://example.com/api/oauth/callback/apple?id_token=fake&state=${state}`,
				{ redirect: 'manual', headers: { cookie: `epo_oauth_flow=${state}` } }
			);
			expect(replay.headers.get('Location')).toContain('oauth_state_invalid');
		} finally {
			await env.kv.delete('setting:');
			await env.kv.delete('apple_jwks_v1');
		}
	});

	it('requires a server-issued state for direct OAuth login', async () => {
		const missing = await SELF.fetch('http://example.com/api/oauth/apple/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id_token: 'fake' })
		});
		const missingBody = await missing.json();
		expect(missingBody.code).toBe(400);
		expect(missingBody.message).toContain('state');

		const guessed = await SELF.fetch('http://example.com/api/oauth/apple/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id_token: 'fake', state: 'guessed-state' })
		});
		const guessedBody = await guessed.json();
		expect(guessedBody.code).toBe(400);
		expect(guessedBody.message).toContain('state');
	});
});
