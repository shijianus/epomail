import { env } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import aiService from '../src/service/ai-service.js';
import settingService from '../src/service/setting-service.js';
import { ensureAiBudgetSchema } from '../src/utils/ai-budget.js';
import {
	CONTENT_PROCESSING_DEFAULTS,
	getContentProcessingConfig,
	isValidNoticeUrl,
	isVerificationCodeAllowed,
	requireTranslationConfirmation
} from '../src/service/content-processing-service.js';
import { isInboundOwnerActive, shouldForwardPersonalMode } from '../src/email/email.js';

const NOTICE_URL = 'https://notice.example/content-processing';
const USER_ID = 970021;
const context = () => ({
	env,
	get: key => key === 'user' ? { userId: USER_ID, email: 'privacy-test@example.com' } : undefined
});

async function writeProcessing(value) {
	await env.db.prepare(
		'INSERT OR REPLACE INTO setting_ext (key, value) VALUES (?, ?)'
	).bind('contentProcessing', JSON.stringify(value)).run();
}

async function clearProcessing() {
	await env.db.prepare("DELETE FROM setting_ext WHERE key = 'contentProcessing'").run();
}

beforeAll(async () => {
	await env.db.prepare('CREATE TABLE IF NOT EXISTS setting_ext (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
});

afterEach(async () => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	await clearProcessing();
});

describe('content-processing policy gates', () => {
	it('defaults every optional processor to strict false', async () => {
		const config = await getContentProcessingConfig(context());
		expect(config).toEqual(CONTENT_PROCESSING_DEFAULTS);
		expect(isVerificationCodeAllowed(config, { privacyPreferences: { aiVerificationCode: true } })).toBe(false);
	});

	it('fails closed when setting_ext is unavailable or unreadable', async () => {
		const broken = { env: { db: { prepare: () => { throw new Error('D1 unavailable'); } } } };
		expect(await getContentProcessingConfig(broken)).toEqual(CONTENT_PROCESSING_DEFAULTS);
		await expect(requireTranslationConfirmation(broken, {
			confirmed: true,
			noticeUrl: NOTICE_URL
		})).rejects.toMatchObject({
			code: 403,
			errorCode: 'privacy_processing_disabled'
		});
	});

	it('accepts only literal booleans and rejects invalid production notice URLs', async () => {
		await writeProcessing({
			verificationCodeEnabled: true,
			translationEnabled: 'true',
			ocrEnabled: 1,
			publicTranslationFallbackEnabled: true,
			noticeUrl: 'http://localhost/notice'
		});
		const config = await getContentProcessingConfig(context());
		expect(config.verificationCodeEnabled).toBe(true);
		expect(config.translationEnabled).toBe(false);
		expect(config.ocrEnabled).toBe(false);
		expect(config.publicTranslationFallbackEnabled).toBe(false);
		expect(isValidNoticeUrl('http://localhost/notice', {})).toBe(false);
		expect(isValidNoticeUrl(NOTICE_URL, {})).toBe(true);
		await expect(requireTranslationConfirmation(context(), {
			confirmed: true,
			noticeUrl: 'http://localhost/notice'
		})).rejects.toMatchObject({ errorCode: 'privacy_processing_disabled' });
	});

	it('uses the registration notice rules for explicit local development only', () => {
		for (const marker of [{ DEV: true }, { DEV: 'true' }, { ENVIRONMENT: 'local' }]) {
			expect(isValidNoticeUrl('http://127.0.0.2/notice', marker)).toBe(true);
			expect(isValidNoticeUrl('http://localhost/notice', marker)).toBe(true);
			expect(isValidNoticeUrl('http://0.0.0.0/notice', marker)).toBe(false);
			expect(isValidNoticeUrl('http://public.example/notice', marker)).toBe(false);
		}
		expect(isValidNoticeUrl('http://127.0.0.2/notice', { ENVIRONMENT: 'production' })).toBe(false);
		expect(isValidNoticeUrl('https://user:pass@notice.example/notice', {})).toBe(false);
	});

	it('requires confirmed true and the exact current notice URL', async () => {
		await writeProcessing({ translationEnabled: true, noticeUrl: NOTICE_URL });
		await expect(requireTranslationConfirmation(context(), {
			noticeUrl: NOTICE_URL
		})).rejects.toMatchObject({
			code: 409,
			errorCode: 'privacy_confirmation_required'
		});
		await expect(requireTranslationConfirmation(context(), {
			confirmed: true,
			noticeUrl: 'https://notice.example/old'
		})).rejects.toMatchObject({
			code: 409,
			errorCode: 'privacy_notice_changed'
		});
		await expect(requireTranslationConfirmation(context(), {
			confirmed: true,
			noticeUrl: NOTICE_URL
		})).resolves.toMatchObject({ translationEnabled: true });
	});

	it('blocks verification extraction and makes zero AI calls without a valid notice', async () => {
		await writeProcessing({ verificationCodeEnabled: true, noticeUrl: '' });
		const run = vi.fn();
		const result = await aiService.extractCode({ env: { db: env.db, ai: { run } } }, {
			subject: 'Your code',
			text: '123456',
			from: { address: 'sender@example.test' }
		}, {
			aiCode: 0,
			userProfile: { privacyPreferences: { aiVerificationCode: true } }
		});
		expect(result).toBe('');
		expect(run).not.toHaveBeenCalled();

		await writeProcessing({
			verificationCodeEnabled: true,
			noticeUrl: 'http://127.0.0.1/notice'
		});
		const second = await aiService.extractCode({ env: { db: env.db, ai: { run } } }, {
			subject: 'Your code',
			text: '123456',
			from: { address: 'sender@example.test' }
		}, {
			aiCode: 0,
			userProfile: { privacyPreferences: { aiVerificationCode: true } }
		});
		expect(second).toBe('');
		expect(run).not.toHaveBeenCalled();
	});

	it('requires a strict per-user preference before verification extraction', async () => {
		await writeProcessing({ verificationCodeEnabled: true, noticeUrl: NOTICE_URL });
		const run = vi.fn().mockResolvedValue({ response: '{"code":"123456"}' });
		const base = {
			subject: 'Your code',
			text: '123456',
			from: { address: 'sender@example.test' }
		};
		expect(await aiService.extractCode({ env: { db: env.db, ai: { run } } }, base, {
			aiCode: 0,
			userProfile: { privacyPreferences: { aiVerificationCode: 'true' } }
		})).toBe('');
		expect(run).not.toHaveBeenCalled();
		expect(await aiService.extractCode({ env: { db: env.db, ai: { run } } }, base, {
			aiCode: 0,
			userProfile: { privacyPreferences: { aiVerificationCode: true } }
		})).toBe('123456');
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('keeps OCR request input and public fallback disabled by default', async () => {
		await writeProcessing({
			translationEnabled: true,
			noticeUrl: NOTICE_URL,
			ocrEnabled: false
		});
		const ocr = vi.spyOn(aiService, 'enhanceImagesWithOverlayAndOcr');
		const call = vi.spyOn(aiService, 'callSingleLlm').mockResolvedValue({
			text: '[0] Bonjour', model: 'test-model', tokens: 1
		});
		vi.spyOn(settingService, 'query').mockResolvedValue({
			aiEnabled: 1,
			aiDailyQuota: 0,
			aiRateLimitRpm: 60
		});
		await ensureAiBudgetSchema(context());
		const result = await aiService.translate(context(), {
			html: '<p>Synthetic content</p>',
			targetLang: 'fr',
			confirmed: true,
			noticeUrl: NOTICE_URL,
			enableOcr: true
		});
		expect(result.translatedText).toBe('Bonjour');
		expect(ocr).toHaveBeenCalled();
		expect(ocr.mock.calls[0][6]).toBe(false);
		expect(call).toHaveBeenCalled();
	});

	it('rejects a deleted or disabled inbound owner without an administrator bypass', () => {
		const active = { accountId: 1, isDel: 0, status: 0 };
		const owner = { userId: USER_ID, isDel: 0, status: 0 };
		expect(isInboundOwnerActive(active, owner)).toBe(true);
		for (const account of [
			{ ...active, isDel: 1 },
			{ ...active, status: 1 }
		]) {
			expect(isInboundOwnerActive(account, { ...owner, email: 'admin@example.com' })).toBe(false);
		}
		expect(isInboundOwnerActive(active, { ...owner, isDel: 1 })).toBe(false);
		expect(isInboundOwnerActive(active, { ...owner, status: 1 })).toBe(false);
		expect(isInboundOwnerActive(active, null)).toBe(false);
	});

	it('fails closed for unimplemented personal forwarding modes', () => {
		expect(shouldForwardPersonalMode('all', [], 'alias')).toBe(true);
		expect(shouldForwardPersonalMode('alias', [], 'alias')).toBe(false);
		expect(shouldForwardPersonalMode('alias', [''], 'alias')).toBe(false);
		expect(shouldForwardPersonalMode('alias', ['billing'], 'billing-alert')).toBe(true);
		expect(shouldForwardPersonalMode('rules', ['billing'], 'billing-alert')).toBe(false);
	});
});
