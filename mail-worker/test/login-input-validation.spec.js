import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

async function request(path, body, headers = {}) {
	const response = await SELF.fetch(`https://example.com/api${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body
	});
	return { response, body: await response.json() };
}

describe('login and registration JSON input contract', () => {
	it.each([
		['empty body', '', 'Invalid JSON request body'],
		['truncated JSON', '{"email":', 'Invalid JSON request body'],
		['scalar JSON', 'null', 'JSON request body must be an object'],
		['array JSON', '[]', 'JSON request body must be an object']
	])('rejects %s without an HTTP 500', async (_label, body, message) => {
		for (const path of ['/login', '/register']) {
			const { response, body: payload } = await request(path, body);
			expect(response.status).toBe(400);
			expect(payload).toMatchObject({ code: 400, errorCode: 'INVALID_JSON' });
			expect(payload.message).toBe(message);
		}
	});

	it('rejects a JSON primitive with the object-body error', async () => {
		const { response, body } = await request('/login', '"password"');
		expect(response.status).toBe(400);
		expect(body).toEqual({
			code: 400,
			message: 'JSON request body must be an object',
			errorCode: 'INVALID_JSON'
		});
	});

	it('rejects malformed TOTP JSON before invoking authentication', async () => {
		const { response, body } = await request('/login/totp', '{"tempToken":');
		expect(response.status).toBe(400);
		expect(body).toMatchObject({ code: 400, errorCode: 'INVALID_JSON' });
	});
});
