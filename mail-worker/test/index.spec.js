import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';

describe('Public object storage isolation', () => {
	beforeEach(async () => {
		await env.kv.delete('auth-uid:1');
		await env.kv.delete('setting:');
		await env.kv.delete('public_key:');
		await env.kv.delete('attachments/test-secret.txt');
		await env.kv.delete('static/public.txt');
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

	it('serves explicitly allow-listed public static objects', async () => {
		await env.kv.put('static/public.txt', 'hello public asset', {
			metadata: { contentType: 'text/plain' }
		});

		const response = await SELF.fetch('http://example.com/api/oss/static/public.txt');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('hello public asset');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});

	it('denies anonymous attachment reads through both object proxies', async () => {
		await env.kv.put('attachments/test-secret.txt', 'private attachment body', {
			metadata: { contentType: 'text/plain' }
		});

		for (const path of ['/api/oss/attachments/test-secret.txt', '/attachments/test-secret.txt']) {
			const response = await SELF.fetch(`http://example.com${path}`);
			expect(response.status, path).toBe(404);
			expect(await response.text(), path).not.toContain('private attachment body');
		}
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
});
