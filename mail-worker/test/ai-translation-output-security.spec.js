import { env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import aiService from '../src/service/ai-service.js';
import settingService from '../src/service/setting-service.js';

import { ensureAiBudgetSchema } from '../src/utils/ai-budget.js';

const USER_ID = 970016;
const mockContext = {
	env: {
		...env,
		ai: {},
		ai_model: '@cf/meta/llama-3.1-8b-instruct'
	},
	get: key => key === 'user' ? { userId: USER_ID, email: 'admin@example.com' } : undefined
};

beforeAll(async () => {
	await ensureAiBudgetSchema(mockContext);
	await env.db.prepare('CREATE TABLE IF NOT EXISTS setting_ext (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
});

beforeEach(async () => {
	await env.db.prepare('INSERT OR REPLACE INTO setting_ext (key, value) VALUES (?, ?)').bind('contentProcessing', JSON.stringify({
		translationEnabled: true, ocrEnabled: false, noticeUrl: 'https://notice.example/policy'
	})).run();
	vi.spyOn(settingService, 'query').mockResolvedValue({ aiEnabled: 1, aiDailyQuota: 0, aiRateLimitRpm: 60, aiAdminOnly: 0 });
});

afterEach(async () => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	await env.db.prepare("DELETE FROM setting_ext WHERE key = 'contentProcessing'").run();
});

describe('B4: AI Translation Output Security Specification', () => {
	const ATTACK_PAYLOADS = [
		'</div><img src=x onerror=alert(1)>',
		'<svg onload=alert(document.domain)>',
		'<a href="javascript:alert(1)">Click here</a>',
		'<iframe src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="></iframe>',
		'<template shadowrootmode="open"><img src=x onerror=alert(1)></template>',
		'<style>@import "javascript:alert(1)";</style>',
		'<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>',
		'<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
		'<base href="https://attacker.com/">',
		'<object data="javascript:alert(1)"></object>',
		'<embed src="javascript:alert(1)"></embed>',
		'<img src="valid.png" srcset="x 1x, javascript:alert(1) 2x">'
	];

	for (const payload of ATTACK_PAYLOADS) {
		it(`neutralizes attack payload in model output: ${payload.slice(0, 35)}...`, async () => {
			const origCall = aiService.callSingleLlm;
			aiService.callSingleLlm = async () => ({
				text: `[0] Translated Text: ${payload}`,
				model: 'mock-llm',
				tokens: 10
			});

			try {
				const result = await aiService.translate(mockContext, {
					html: '<p>Hello world to translate</p>',
					targetLang: 'es',
					confirmed: true,
					noticeUrl: 'https://notice.example/policy'
				});

				expect(result.translatedHtml).toBeDefined();
				// The returned HTML must NOT contain unescaped executable script/onerror tags
				expect(result.translatedHtml).not.toContain('<img src=x onerror=');
				expect(result.translatedHtml).not.toContain('<svg onload=');
				expect(result.translatedHtml).not.toContain('javascript:alert');
				expect(result.translatedHtml).not.toContain('<iframe');
				expect(result.translatedHtml).not.toContain('<object');
				expect(result.translatedHtml).not.toContain('<embed');
				expect(result.translatedHtml).not.toContain('shadowrootmode');
			} finally {
				aiService.callSingleLlm = origCall;
			}
		});
	}

	it('strips original script, iframe, and event handlers and never re-introduces them via raw block restore', async () => {
		const maliciousOriginalHtml = `
			<div>
				<h1>Legitimate title</h1>
				<script>alert("malicious raw block")</script>
				<iframe srcdoc="<script>alert(2)</script>"></iframe>
				<p onclick="alert(3)">Click me</p>
			</div>
		`;

		const origCall = aiService.callSingleLlm;
		aiService.callSingleLlm = async () => ({
			text: '[0] Legitimate translated title\n[1] Click me translated',
			model: 'mock-llm',
			tokens: 10
		});

		try {
			const result = await aiService.translate(mockContext, {
				html: maliciousOriginalHtml,
				targetLang: 'fr',
				confirmed: true,
				noticeUrl: 'https://notice.example/policy'
			});

			expect(result.translatedHtml).not.toContain('<script');
			expect(result.translatedHtml).not.toContain('alert("malicious raw block")');
			expect(result.translatedHtml).not.toContain('<iframe');
			expect(result.translatedHtml).not.toContain('onclick=');
		} finally {
			aiService.callSingleLlm = origCall;
		}
	});

	it('drops the fallback where model returns full direct unvalidated HTML', async () => {
		const emptySegmentsHtml = '<!-- only comments -->';

		const origCall = aiService.callSingleLlm;
		let directLlmCalled = false;
		aiService.callSingleLlm = async (c, prompt) => {
			if (prompt.includes('Directly output ONLY the resulting translated HTML')) {
				directLlmCalled = true;
			}
			return { text: '<img src=x onerror=alert(1)>', model: 'mock-llm' };
		};

		try {
			const result = await aiService.translate(mockContext, {
				html: emptySegmentsHtml,
				targetLang: 'zh',
				confirmed: true,
				noticeUrl: 'https://notice.example/policy'
			});
			expect(directLlmCalled).toBe(false);
			expect(result.translatedHtml).not.toContain('onerror=alert');
		} finally {
			aiService.callSingleLlm = origCall;
		}
	});
});
