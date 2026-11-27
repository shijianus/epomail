import { describe, expect, it, vi } from 'vitest';
import emailService from '../src/service/email-service.js';
import turnstileService from '../src/service/turnstile-service.js';
import oauthService from '../src/service/oauth-service.js';
import aiService from '../src/service/ai-service.js';
import s3Service from '../src/service/s3-service.js';
import settingService from '../src/service/setting-service.js';

// Exercise the real SDKs and service readers. Only the network is replaced;
// the deadline remains a native AbortSignal, shortened for deterministic tests.
async function slowTransport(phase, test, { before = [], status = 200 } = {}) {
	const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
	const timers = [];
	const requests = [];
	const budgets = [];
	vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
		budgets.push(ms);
		return nativeTimeout(100);
	});
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const signal = init?.signal || input.signal;
		const record = { signal, input, init, aborted: false };
		requests.push(record);
		expect(signal).toBeInstanceOf(AbortSignal);
		if (before.length) return Response.json(before.shift());
		const hang = fail => {
			const onAbort = () => { record.aborted = true; fail(signal.reason); };
			if (signal.aborted) onAbort();
			else signal.addEventListener('abort', onAbort, { once: true });
			timers.push(setTimeout(() => fail(new Error('transport did not abort')), 1500));
		};
		if (phase === 'headers') return new Promise((_, reject) => hang(reject));
		return new Response(new ReadableStream({ start(controller) { hang(error => controller.error(error)); } }), { status });
	});
	try {
		await test({ requests, budgets });
		expect(requests.at(-1).aborted).toBe(true);
	} finally {
		for (const timer of timers) clearTimeout(timer);
		vi.restoreAllMocks();
	}
}

const context = {
	env: { linuxdo_client_id: 'test-client', linuxdo_client_secret: 'test-only-secret', linuxdo_callback_url: 'https://example.test/api/oauth/callback/linuxdo' },
	req: { url: 'https://example.test/api/oauth/callback/github', header: () => '192.0.2.1' },
};
const storage = { endpoint: 'https://storage.example.com', region: 'us-east-1', bucket: 'test', accessKeyId: 'test-only-access', secretAccessKey: 'test-only-secret', forcePathStyle: true };

describe('external requests have deadlines through response bodies', () => {
	it.each(['headers', 'body'])('Resend aborts stalled %s while preserving the idempotency key', async phase => {
		await slowTransport(phase, async ({ requests, budgets }) => {
			const result = await emailService.sendByResend('test-only-resend-key', {
				name: 'Test', accountEmail: 'sender@example.test', receiveEmail: ['recipient@example.test'],
				subject: 'Deadline', text: 'Test', attachments: [], idempotencyKey: 'timeout-test',
			});
			expect(result.data).toBeNull();
			expect(result.error).toBeTruthy();
			expect(new Headers(requests[0].init.headers).get('Idempotency-Key')).toBe('timeout-test');
			expect(budgets).toEqual([15000]);
		});
	});

	it.each(['headers', 'body'])('Turnstile aborts stalled %s without accepting the challenge', async phase => {
		await slowTransport(phase, async ({ budgets }) => {
			vi.spyOn(settingService, 'query').mockResolvedValue({ secretKey: 'test-only-turnstile-secret' });
			await expect(turnstileService.verify(context, 'test-token')).rejects.toMatchObject({ name: 'TimeoutError' });
			expect(budgets).toEqual([10000]);
		});
	});

	for (const provider of ['github', 'google', 'microsoft', 'apple', 'linuxdo']) {
		it.each(['headers', 'body'])(`${provider} aborts token exchange at stalled %s`, async phase => {
			await slowTransport(phase, async ({ budgets }) => {
				vi.spyOn(oauthService, 'getProviderConfig').mockResolvedValue({ clientId: 'test-client', clientSecret: 'test-only-secret' });
				await expect(oauthService.fetchProviderUserInfo(context, provider, { code: 'test-code' }))
					.rejects.toMatchObject({ name: 'TimeoutError' });
				expect(budgets).toEqual([10000]);
			});
		});
	}

	it.each(['github', 'google', 'microsoft', 'linuxdo'])('%s times out while reading user info', async provider => {
		await slowTransport('body', async ({ budgets }) => {
			vi.spyOn(oauthService, 'getProviderConfig').mockResolvedValue({ clientId: 'test-client', clientSecret: 'test-only-secret' });
			await expect(oauthService.fetchProviderUserInfo(context, provider, { code: 'test-code' }))
				.rejects.toMatchObject({ name: 'TimeoutError' });
			expect(budgets).toEqual([10000, 10000]);
		}, { before: [{ access_token: 'test-token' }] });
	});

	it('GitHub email discovery times out and retains only the verified provider identity', async () => {
		await slowTransport('body', async ({ budgets }) => {
			vi.spyOn(oauthService, 'getProviderConfig').mockResolvedValue({ clientId: 'test-client', clientSecret: 'test-only-secret' });
			const result = await oauthService.fetchProviderUserInfo(context, 'github', { code: 'test-code' });
			expect(result).toMatchObject({ oauthUserId: 'github:42', email: '' });
			expect(budgets).toEqual([10000, 10000, 10000]);
		}, { before: [{ access_token: 'test-token' }, { id: 42, login: 'test-user' }] });
	});

	it('AI model listing aborts stalled bodies and reaches its documented fallback', async () => {
		await slowTransport('body', async ({ budgets }) => {
			vi.spyOn(aiService, 'getCandidateModelEndpoints').mockReturnValue(['https://ai.example.com/models']);
			const result = await aiService.fetchModels(context, { aiApiKey: 'test-only-key', aiApiUrl: 'https://93.184.216.34' });
			expect(result.fallback).toBe(true);
			expect(budgets).toEqual([4000]);
		});
	});

	it.each([200, 502])('AI metadata and inference consume/abort the body even on HTTP %s', async status => {
		await slowTransport('body', async ({ requests, budgets }) => {
			vi.spyOn(aiService, 'getCandidateModelEndpoints').mockReturnValue(['https://ai.example.com/models/test']);
			vi.spyOn(aiService, 'getCandidateChatEndpoints').mockReturnValue(['https://ai.example.com/chat/completions']);
			const result = await aiService.testSingleModel(context, 'test-only-key', 'https://ai.example.com', 'test');
			expect(result.success).toBe(false);
			expect(budgets).toEqual([3500, 5000]);
			// Failed metadata responses are unused; the inference body must be bounded.
			if (status === 200) expect(requests.every(request => request.aborted)).toBe(true);
		}, { status });
	});

	it.each(['headers', 'body'])('S3 aborts stalled %s through the real SDK and streaming reader', async phase => {
		await slowTransport(phase, async ({ budgets }) => {
			await expect((async () => {
				const response = await s3Service.getObj(context, 'timeout-test', storage);
				await response.text();
			})()).rejects.toMatchObject({ name: expect.stringMatching(/AbortError|TimeoutError/) });
			expect(budgets).toEqual([15000]);
		});
	});
});
