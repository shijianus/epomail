import { SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import oauthProviderService from '../src/service/oauth-provider-service.js';

describe('OAuth provider endpoint error sanitization', () => {
	afterEach(() => vi.restoreAllMocks());

	it('does not reflect internal token-exchange errors', async () => {
		vi.spyOn(oauthProviderService, 'token').mockRejectedValueOnce(
			new Error('D1_ERROR: SELECT secret FROM oauth WHERE internal_url=https://db.internal')
		);
		const response = await SELF.fetch('https://example.test/api/oauth/token', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}'
		});
		const body = await response.json();
		expect(response.status).toBe(400);
		expect(body.error).toBe('invalid_request');
		expect(body.error_description).toBe('The request is invalid');
		expect(JSON.stringify(body)).not.toMatch(/D1_ERROR|db\.internal|secret/i);
	});

	it('returns a fixed invalid-token description', async () => {
		vi.spyOn(oauthProviderService, 'userInfo').mockRejectedValueOnce(
			new Error('KV binding auth-uid:1 contains bearer-token material')
		);
		const response = await SELF.fetch('https://example.test/api/oauth/userinfo', {
			headers: { Authorization: 'Bearer synthetic-token' }
		});
		const body = await response.json();
		expect(response.status).toBe(401);
		expect(body).toEqual({ error: 'invalid_token', error_description: 'The access token is invalid or expired' });
	});

	it.each(['null', '[]'])('rejects non-object token request bodies with a client error', async (body) => {
		const response = await SELF.fetch('https://example.test/api/oauth/token', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body
		});
		expect(response.status).toBe(400);
		const result = await response.json();
		expect(result.error).toBe('invalid_request');
	});
});
