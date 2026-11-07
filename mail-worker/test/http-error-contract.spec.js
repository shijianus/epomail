import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import BizError from '../src/error/biz-error.js';
import app from '../src/hono/hono.js';

describe('B1: HTTP Error Status Contract', () => {
	const statusCases = [400, 401, 403, 404, 409, 410, 413, 425, 429, 500, 502, 503];

	const testApp = new Hono();
	// Inherit error handler from main app
	testApp.onError(app.errorHandler);

	for (const status of statusCases) {
		testApp.get(`/test-error-${status}`, () => {
			const opts = status === 429 ? { retryAfter: 60 } : {};
			throw new BizError(`Test error for ${status}`, status, `ERR_${status}`, opts);
		});
	}

	testApp.get('/test-error-unspecified', () => {
		throw new BizError('Unspecified status error');
	});

	testApp.get('/test-error-unknown-unhandled', () => {
		throw new Error('Database connection failed unexpectedly');
	});

	for (const status of statusCases) {
		it(`returns real HTTP status ${status} matching JSON code`, async () => {
			const res = await testApp.request(`/test-error-${status}`, {
				headers: { 'Accept': 'application/json' }
			}, { ...env, jwt_secret: '01234567890123456789012345678901' });

			expect(res.status).toBe(status);
			const json = await res.json();
			expect(json.code).toBe(status);
			expect(json.message).toBe(`Test error for ${status}`);
			expect(json.errorCode).toBe(`ERR_${status}`);
			if (status === 429) {
				expect(res.headers.get('Retry-After')).toBe('60');
			}
		});
	}

	it('defaults unspecified or invalid BizError status to HTTP 400', async () => {
		const res = await testApp.request('/test-error-unspecified', {
			headers: { 'Accept': 'application/json' }
		}, { ...env, jwt_secret: '01234567890123456789012345678901' });

		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.code).toBe(400);
		expect(json.message).toBe('Unspecified status error');
	});

	it('returns real HTTP 500 for unknown unhandled exceptions', async () => {
		const res = await testApp.request('/test-error-unknown-unhandled', {
			headers: { 'Accept': 'application/json' }
		}, { ...env, jwt_secret: '01234567890123456789012345678901' });

		expect(res.status).toBe(500);
		const json = await res.json();
		expect(json.code).toBe(500);
		expect(json.message).toBe('Internal Server Error');
		expect(json.message).not.toContain('Database connection');
	});
});
