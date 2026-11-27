import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { env, SELF } from 'cloudflare:test';
import { handleResendWebhook, MAX_WEBHOOK_BYTES } from '../src/api/resend-api.js';
import resendService from '../src/service/resend-service.js';
import rateLimit from '../src/utils/rate-limit.js';

const app = new Hono().post('/webhooks', handleResendWebhook);
const encoder = new TextEncoder();
const secret = 'webhook-ingress-test-only';

function fixture() {
	const entries = new Map();
	return { ENVIRONMENT: 'test', resend_webhook_secret: `whsec_${btoa(secret)}`,
		kv: { get: async key => entries.get(key) || null,
			put: async (key, value) => entries.set(key, JSON.parse(value)) } };
}

async function headers(body = '{}', offset = 0) {
	const id = 'msg_ingress';
	const timestamp = String(Math.floor(Date.now() / 1000) + offset);
	const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${id}.${timestamp}.${body}`));
	return { 'svix-id': id, 'svix-timestamp': timestamp,
		'svix-signature': `v1,${btoa(String.fromCharCode(...new Uint8Array(signature)))}`,
		'CF-Connecting-IP': '192.0.2.15' };
}

function stream(chunks) {
	let reads = 0;
	let cancelled = false;
	return {
		body: new ReadableStream({
			pull(controller) {
				if (reads < chunks.length) controller.enqueue(chunks[reads++]);
				else controller.close();
			},
			cancel() { cancelled = true; }
		}, { highWaterMark: 0 }),
		get reads() { return reads; },
		get cancelled() { return cancelled; }
	};
}

async function post(body, requestHeaders, bindings = fixture()) {
	return app.fetch(new Request('https://example.test/webhooks', {
		method: 'POST', headers: requestHeaders, body
	}), bindings);
}

afterEach(() => vi.restoreAllMocks());

describe('Webhook ingress before HMAC/body parsing', () => {
	for (const missing of ['svix-id', 'svix-timestamp', 'svix-signature']) {
		it(`rejects missing ${missing} without pulling the request stream`, async () => {
			const input = stream([new Uint8Array(MAX_WEBHOOK_BYTES * 4)]);
			const h = await headers();
			delete h[missing];
			const verify = vi.spyOn(resendService, 'verifySignature');
			const limit = vi.spyOn(rateLimit, 'check');
			try {
				expect((await post(input.body, h)).status).toBe(401);
				expect(input.reads).toBe(0);
				expect(verify).not.toHaveBeenCalled();
				expect(limit).not.toHaveBeenCalled();
			} finally { await input.body.cancel(); }
		});
	}

	for (const length of [undefined, '2', String(MAX_WEBHOOK_BYTES + 1)]) {
		it(`rejects overflow with Content-Length ${length ?? 'absent'} before HMAC and cancels streaming`, async () => {
			const input = stream([new Uint8Array(MAX_WEBHOOK_BYTES), new Uint8Array(1), new Uint8Array(MAX_WEBHOOK_BYTES)]);
			const h = await headers();
			if (length) h['Content-Length'] = length;
			const verify = vi.spyOn(resendService, 'verifySignature');
			const dispatch = vi.spyOn(resendService, 'webhooks');
			try {
				expect((await post(input.body, h)).status).toBe(413);
				expect(input.reads).toBe(length === String(MAX_WEBHOOK_BYTES + 1) ? 0 : 2);
				if (input.reads) expect(input.cancelled).toBe(true);
				expect(verify).not.toHaveBeenCalled();
				expect(dispatch).not.toHaveBeenCalled();
			} finally { await input.body.cancel(); }
		});
	}

	it('counts UTF-8 bytes, not characters', async () => {
		const body = JSON.stringify({ text: '中'.repeat(MAX_WEBHOOK_BYTES / 2) });
		expect(body.length).toBeLessThan(MAX_WEBHOOK_BYTES);
		expect((await post(body, await headers(body))).status).toBe(413);
	});

	it('accepts exactly 512 KiB and preserves Unicode split across chunks for HMAC', async () => {
		const body = JSON.stringify({ text: '中' }) + ' '.repeat(MAX_WEBHOOK_BYTES - encoder.encode(JSON.stringify({ text: '中' })).length);
		const bytes = encoder.encode(body);
		const split = encoder.encode('{"text":"').length + 1;
		const input = stream([bytes.slice(0, split), bytes.slice(split)]);
		const dispatch = vi.spyOn(resendService, 'webhooks').mockResolvedValue({ success: true });
		try {
			expect((await post(input.body, await headers(body))).status).toBe(200);
			expect(dispatch.mock.calls[0][1]).toEqual({ text: '中' });
		} finally { await input.body.cancel(); }
	});

	it('returns 429 before reading when the IP limit is reached, even with a changed event ID', async () => {
		const bindings = fixture();
		const h = await headers();
		for (let i = 0; i < 120; i++) expect((await post('{}', h, bindings)).status).toBe(200);
		const input = stream([new Uint8Array(MAX_WEBHOOK_BYTES)]);
		try {
			const response = await post(input.body, { ...h, 'svix-id': 'a-new-id', 'X-Forwarded-For': '192.0.2.99' }, bindings);
			expect(response.status).toBe(429);
			expect(response.headers.get('Retry-After')).toBe('60');
			expect(input.reads).toBe(0);
			expect((await post('{}', { ...h, 'CF-Connecting-IP': '192.0.2.16' }, bindings)).status).toBe(200);
		} finally { await input.body.cancel(); }
	});

	it('fails closed before reading if production rate-limit storage is unavailable', async () => {
		const input = stream([encoder.encode('{}')]);
		try {
			expect((await post(input.body, await headers(), { ...fixture(), ENVIRONMENT: 'production' })).status).toBe(503);
			expect(input.reads).toBe(0);
		} finally { await input.body.cancel(); }
	});

	for (const offset of [-301, 301]) {
		it(`rejects a valid HMAC outside the ${offset}s timestamp boundary`, async () => {
			expect((await post('{}', await headers('{}', offset))).status).toBe(401);
		});
	}

	it('still rejects tampering and invalid JSON after signature validation', async () => {
		expect((await post('{"changed":true}', await headers('{}'))).status).toBe(401);
		expect((await post('not-json', await headers('not-json'))).status).toBe(400);
	});

	it('applies the same guard to both real Worker webhook aliases', async () => {
		const ip = '192.0.2.17';
		try {
			for (const path of ['/webhooks', '/api/webhooks']) {
				expect((await SELF.fetch(`https://example.com${path}`, { method: 'POST', body: '{}' })).status).toBe(401);
				expect((await SELF.fetch(`https://example.com${path}`, { method: 'POST',
					headers: { ...await headers(), 'CF-Connecting-IP': ip }, body: 'x'.repeat(MAX_WEBHOOK_BYTES + 1) })).status).toBe(413);
			}
		} finally { await env.kv.delete(`rate-limit:webhook-resend:${ip}`); }
	});
});
