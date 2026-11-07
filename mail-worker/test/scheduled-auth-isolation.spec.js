import { describe, expect, it } from 'vitest';
import { checkScheduledAuth } from '../src/index.js';

describe('B3: scheduled_secret Isolation Specification', () => {
	const mockSec = (tag) => `mock-sec-${tag}-` + 'x'.repeat(16);
	const BASE_ENV = {
		ENVIRONMENT: 'staging',
		scheduled_secret: mockSec('sched'),
		jwt_secret: mockSec('jwt'),
		init_secret: mockSec('init'),
		totp_enc_key: mockSec('totp'),
		email_enc_key: mockSec('email')
	};

	function createReq(method = 'POST', headers = {}) {
		const lowerHeaders = {};
		for (const [k, v] of Object.entries(headers)) {
			lowerHeaders[k.toLowerCase()] = v;
		}
		return {
			method,
			headers: {
				get: (name) => lowerHeaders[name.toLowerCase()] ?? null
			}
		};
	}

	it('accepts correct scheduled_secret via x-scheduled-secret in staging', async () => {
		const req = createReq('POST', { 'x-scheduled-secret': BASE_ENV.scheduled_secret });
		const result = await checkScheduledAuth(req, BASE_ENV);
		expect(result.ok).toBe(true);
	});

	it('rejects x-admin-secret compatibility header in staging and production', async () => {
		const req = createReq('POST', { 'x-admin-secret': BASE_ENV.scheduled_secret });
		const result = await checkScheduledAuth(req, BASE_ENV);
		expect(result.ok).toBe(false);
	});

	it('rejects fallback to jwt_secret in staging and production', async () => {
		const req = createReq('POST', { 'x-scheduled-secret': BASE_ENV.jwt_secret });
		const result = await checkScheduledAuth(req, BASE_ENV);
		expect(result.ok).toBe(false);
	});

	it('fails closed when scheduled_secret is missing in staging or production', async () => {
		const envMissing = { ...BASE_ENV, scheduled_secret: undefined };
		const req = createReq('POST', { 'x-scheduled-secret': BASE_ENV.jwt_secret });
		const result = await checkScheduledAuth(req, envMissing);
		expect(result.ok).toBe(false);
	});

	it('fails closed when scheduled_secret collides with other credential domains', async () => {
		// Collision with jwt_secret
		const envCollideJwt = { ...BASE_ENV, scheduled_secret: BASE_ENV.jwt_secret };
		const req1 = createReq('POST', { 'x-scheduled-secret': BASE_ENV.jwt_secret });
		expect((await checkScheduledAuth(req1, envCollideJwt)).ok).toBe(false);

		// Collision with init_secret
		const envCollideInit = { ...BASE_ENV, scheduled_secret: BASE_ENV.init_secret };
		const req2 = createReq('POST', { 'x-scheduled-secret': BASE_ENV.init_secret });
		expect((await checkScheduledAuth(req2, envCollideInit)).ok).toBe(false);

		// Collision with totp_enc_key
		const envCollideTotp = { ...BASE_ENV, scheduled_secret: BASE_ENV.totp_enc_key };
		const req3 = createReq('POST', { 'x-scheduled-secret': BASE_ENV.totp_enc_key });
		expect((await checkScheduledAuth(req3, envCollideTotp)).ok).toBe(false);

		// Collision with email_enc_key
		const envCollideEmail = { ...BASE_ENV, scheduled_secret: BASE_ENV.email_enc_key };
		const req4 = createReq('POST', { 'x-scheduled-secret': BASE_ENV.email_enc_key });
		expect((await checkScheduledAuth(req4, envCollideEmail)).ok).toBe(false);
	});

	it('rejects empty string and whitespace variants', async () => {
		const reqEmpty = createReq('POST', { 'x-scheduled-secret': '' });
		expect((await checkScheduledAuth(reqEmpty, BASE_ENV)).ok).toBe(false);

		const reqTrim = createReq('POST', { 'x-scheduled-secret': `  ${BASE_ENV.scheduled_secret}  ` });
		expect((await checkScheduledAuth(reqTrim, BASE_ENV)).ok).toBe(false);
	});

	it('does not fall through to admin JWT when an invalid scheduled secret is provided', async () => {
		const req = createReq('POST', {
			'x-scheduled-secret': 'wrong-secret',
			'Authorization': 'Bearer some-admin-token'
		});
		const result = await checkScheduledAuth(req, BASE_ENV);
		expect(result.ok).toBe(false);
	});
});
