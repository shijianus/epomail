import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { buildSignedObjectUrl } from '../src/utils/object-token.js';
import { ensureOtcTable, seedOtc } from './helpers/one-time-credential.js';

beforeAll(async () => {
	await ensureOtcTable(env.db);
});

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

	it('serves a signed capability on the origin-relative /oss route the browser uses', async () => {
		await env.kv.put('attachments/root-route.txt', 'root-route-secret', {
			metadata: { contentType: 'text/plain' }
		});
		const signedUrl = await buildSignedObjectUrl({ env }, 'attachments/root-route.txt', { userId: 1, ttlSeconds: 60 });

		// Batch signing returns exactly this shape and mail-vue consumes it as a
		// bare <img src>/<a href>, i.e. without an /api prefix.
		const response = await SELF.fetch(`http://example.com${signedUrl}`);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('root-route-secret');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});

	it('keeps the root /oss route closed to unsigned and control keys', async () => {
		await env.kv.put('attachments/root-unsigned.txt', 'unsigned-secret', {
			metadata: { contentType: 'text/plain' }
		});
		await env.kv.put('auth-uid:1', JSON.stringify({ tokens: ['session-token'], user: { userId: 1 } }));

		for (const path of [
			'/oss/attachments/root-unsigned.txt',
			'/oss/auth-uid:1',
			'/oss/static/../auth-uid:1',
			'/oss/attachments/%2e%2e/auth-uid:1'
		]) {
			const response = await SELF.fetch(`http://example.com${path}`);
			const body = await response.text();
			expect(body).not.toContain('unsigned-secret');
			expect(body).not.toContain('session-token');
			expect(response.status).toBe(404);
		}
	});

	it('serves public static assets on the root /oss route without a signature', async () => {
		await env.kv.put('static/avatar/1/root-public.png', 'root-avatar-bytes', {
			metadata: { contentType: 'image/png', contentDisposition: 'inline' }
		});

		const response = await SELF.fetch('http://example.com/oss/static/avatar/1/root-public.png');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('root-avatar-bytes');
		expect(response.headers.get('Content-Type')).toBe('image/png');
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
	beforeEach(async () => {
		await env.db.prepare('DELETE FROM oauth_one_time_credential').run();
	});

	it('rejects a callback without a server-issued state before contacting the provider', async () => {
		const missingCode = await SELF.fetch('http://example.com/api/oauth/callback/apple', { redirect: 'manual' });
		expect(missingCode.status).toBe(302);
		expect(missingCode.headers.get('Location')).toContain('oauth_missing_code');

		const badState = await SELF.fetch('http://example.com/api/oauth/callback/apple?code=fake&state=guessed', { redirect: 'manual' });
		expect(badState.status).toBe(302);
		expect(badState.headers.get('Location')).toContain('oauth_state_invalid');
	});

	it('exchanges a short-lived login code once and never via the callback URL', async () => {
		const code = 'short-lived-login-code';
		await seedOtc(env.db, {
			purpose: 'oauth_login_code',
			token: code,
			provider: 'apple',
			oauthUserId: 'apple:user-1',
			payload: {
				token: 'mailbox-jwt-value',
				provider: 'apple',
				userInfo: { oauthUserId: 'apple:user-1' },
				createdAt: Date.now()
			}
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
		const code = 'oauth-mfa-code';
		await seedOtc(env.db, {
			purpose: 'oauth_login_code',
			token: code,
			provider: 'apple',
			oauthUserId: 'apple:user-1',
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
				userInfo: { oauthUserId: 'apple:user-1' },
				createdAt: Date.now()
			}
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
			const response = await SELF.fetch('http://example.com/api/oauth/authorize/apple?redirect_uri=https%3A%2F%2Fattacker.example%2Fcallback&state=index-foreign-redirect-state');
			const body = await response.json();
			expect(body.code).not.toBe(200);
			expect(body.message).toContain('redirect_uri');
		} finally {
			await env.kv.delete('setting:');
		}
	});

	it('rejects an authorize request without a client state', async () => {
		await env.kv.put('setting:', JSON.stringify({
			oauthProviders: { apple: { clientId: 'test-client-id', clientSecret: 'test-client-secret', enabled: 1 } }
		}));
		try {
			const response = await SELF.fetch('http://example.com/api/oauth/authorize/apple');
			const body = await response.json();
			expect(body.code).toBe(400);
			expect(body.errorCode).toBe('oauth_state_required');
			expect(body.message).toContain('client state');
		} finally {
			await env.kv.delete('setting:');
		}
	});
});
