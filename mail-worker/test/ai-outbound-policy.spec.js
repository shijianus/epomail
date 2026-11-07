import { env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertOutboundAllowed } from '../src/utils/outbound-policy.js';
import { ensureAiBudgetSchema, reserveAiRequest, purgeAiBudgets } from '../src/utils/ai-budget.js';
import aiService from '../src/service/ai-service.js';
import settingService from '../src/service/setting-service.js';

const USER_ID = 970015;
const c = { env, get: key => key === 'user' ? { userId: USER_ID, email: 'budget-test@example.com' } : undefined };

beforeAll(async () => {
	await ensureAiBudgetSchema(c);
	await env.db.prepare('CREATE TABLE IF NOT EXISTS setting_ext (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
});
beforeEach(async () => {
	await env.db.prepare('INSERT OR REPLACE INTO setting_ext (key, value) VALUES (?, ?)').bind('contentProcessing', JSON.stringify({
		translationEnabled: true, ocrEnabled: false, noticeUrl: 'https://notice.example/policy'
	})).run();
});
afterEach(async () => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	await env.db.prepare('DELETE FROM ai_request_budget WHERE user_id = ?').bind(USER_ID).run();
	await env.db.prepare("DELETE FROM setting_ext WHERE key = 'contentProcessing'").run();
});

describe('provider dispatch isolation', () => {
	it.each(['false', ' FALSE ', '', '0', false])('blocks an explicit disabled flag: %s', flag => {
		expect(() => assertOutboundAllowed({ env: { EMAIL_OUTBOUND_ENABLED: flag } }, ['user@example.com']))
			.toThrow('disabled');
	});
	it('permits database-only internal delivery but not a same-domain provider dispatch', () => {
		const context = { env: { EMAIL_OUTBOUND_ENABLED: 'false' } };
		expect(() => assertOutboundAllowed(context, ['local@example.com'], { domains: ['@example.com'] })).not.toThrow();
		expect(() => assertOutboundAllowed(context, ['local@example.com'])).toThrow('disabled');
	});
	it('enforces staging and explicit whitelist mode without leaking blocked addresses', () => {
		for (const policy of [{ ENVIRONMENT: 'staging' }, { OUTBOUND_WHITELIST_ENFORCE: 'true' }]) {
			const context = { env: { ...policy, EMAIL_OUTBOUND_ENABLED: 'true', OUTBOUND_WHITELIST: ' QA@EXAMPLE.TEST ' } };
			expect(() => assertOutboundAllowed(context, ['qa@example.test'])).not.toThrow();
			expect(() => assertOutboundAllowed(context, ['delivered@resend.dev'])).not.toThrow();
			expect(() => assertOutboundAllowed(context, ['private@elsewhere.test'])).toThrow('whitelist');
		}
	});
});

describe('AI request budget (real D1)', () => {
	it('admits exactly the configured daily quota under 32 concurrent requests', async () => {
		try {
			const results = await Promise.allSettled(Array.from({ length: 32 }, () => reserveAiRequest(c, USER_ID, { dayLimit: 5, minuteLimit: 0 })));
			expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(5);
			for (const failure of results.filter(result => result.status === 'rejected')) expect(failure.reason.code).toBe(429);
			const row = await env.db.prepare("SELECT request_count FROM ai_request_budget WHERE user_id = ? AND kind = 'day'").bind(USER_ID).first();
			expect(row.request_count).toBe(5);
		} finally {
			await env.db.prepare('DELETE FROM ai_request_budget WHERE user_id = ?').bind(USER_ID).run();
		}
	});
	it('enforces minute quota and rejects malformed configuration or missing identity', async () => {
		await reserveAiRequest(c, USER_ID, { minuteLimit: 1 });
		await expect(reserveAiRequest(c, USER_ID, { minuteLimit: 1 })).rejects.toMatchObject({ code: 429 });
		await expect(reserveAiRequest(c, USER_ID, { minuteLimit: -1 })).rejects.toMatchObject({ code: 503 });
		await expect(reserveAiRequest(c, 0)).rejects.toMatchObject({ code: 401 });
	});
	it('removes expired budgets and never falls back to a weaker store', async () => {
		await env.db.prepare("INSERT INTO ai_request_budget VALUES (?, 'day', 0, 1, 1)").bind(USER_ID).run();
		await purgeAiBudgets(c);
		expect(await env.db.prepare('SELECT * FROM ai_request_budget WHERE user_id = ?').bind(USER_ID).first()).toBeNull();
		await expect(reserveAiRequest({ env: {} }, USER_ID)).rejects.toMatchObject({ code: 503 });
	});
});

describe('translation data custody', () => {
	it('does not send text to public translation services when the configured provider fails', async () => {
		const network = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
		vi.stubGlobal('fetch', network);
		const fallback = vi.fn();
		const result = await aiService.callSingleLlm({ env: { ai: { run: fallback } } }, 'Confidential test content', 'Translate', {
			apiKey: 'test-only-key', apiUrl: 'https://configured.example/v1', model: 'test-model',
			overallDeadlineMs: 1000, startTime: Date.now()
		});
		expect(result.model).toBe('unavailable');
		expect(result.text).toBe('');
		expect(fallback).not.toHaveBeenCalled();
		for (const [target] of network.mock.calls) expect(new URL(target).hostname).toBe('configured.example');
	});
	it('denies ordinary users when AI is restricted to administrators', async () => {
		vi.spyOn(settingService, 'query').mockResolvedValue({ aiEnabled: 1, aiAdminOnly: 1 });
		const inference = vi.spyOn(aiService, 'callSingleLlm');
		await expect(aiService.translate(c, { confirmed: true, noticeUrl: 'https://notice.example/policy', text: 'This is synthetic text.', targetLang: 'fr' })).rejects.toMatchObject({ code: 403, errorCode: 'ai_admin_only' });
		expect(inference).not.toHaveBeenCalled();
	});
	it('fails closed on unavailable settings and disabled AI', async () => {
		vi.spyOn(settingService, 'query').mockRejectedValue(new Error('injected setting fault'));
		await expect(aiService.translate(c, { confirmed: true, noticeUrl: 'https://notice.example/policy', text: 'Synthetic text', targetLang: 'nl' })).rejects.toThrow('injected');
		settingService.query.mockResolvedValue({ aiEnabled: 0 });
		await expect(aiService.translate(c, { confirmed: true, noticeUrl: 'https://notice.example/policy', text: 'Synthetic text', targetLang: 'nl' })).rejects.toMatchObject({ errorCode: 'ai_disabled' });
	});
	it('keeps OCR off unless explicitly selected and reports incomplete HTML without public fallback', async () => {
		vi.spyOn(settingService, 'query').mockResolvedValue({ aiEnabled: 1, aiDailyQuota: 0, aiRateLimitRpm: 60 });
		const network = vi.fn(() => { throw new Error('unexpected external request'); });
		vi.stubGlobal('fetch', network);
		const ocr = vi.spyOn(aiService, 'enhanceImagesWithOverlayAndOcr').mockImplementation(async (_c, skeleton) => skeleton);
		vi.spyOn(aiService, 'callSingleLlm').mockResolvedValue({ text: '[0] Bonjour', model: 'test-model', tokens: 1 });
		await expect(aiService.translate(c, { confirmed: true, noticeUrl: 'https://notice.example/policy', html: '<p>Hello test world</p><p>Another test paragraph</p>', targetLang: 'fr' })).rejects.toMatchObject({ errorCode: 'translation_incomplete' });
		expect(ocr.mock.calls[0][6]).toBe(false);
		expect(network).not.toHaveBeenCalled();
	});
	it('translates all plain-text chunks instead of silently dropping text after character 4000', async () => {
		vi.spyOn(settingService, 'query').mockResolvedValue({ aiEnabled: 1, aiDailyQuota: 0, aiRateLimitRpm: 60 });
		const call = vi.spyOn(aiService, 'callSingleLlm').mockImplementation(async (_c, text) => ({ text, model: 'test-model', tokens: 1 }));
		const input = 'Synthetic paragraph '.repeat(250) + ' FINAL_MARKER';
		const translated = await aiService.translate(c, { confirmed: true, noticeUrl: 'https://notice.example/policy', text: input, targetLang: 'fr' });
		expect(call.mock.calls.length).toBeGreaterThan(1);
		expect(translated.translatedText).toContain('FINAL_MARKER');
	});
});
