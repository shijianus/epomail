import { describe, expect, it } from 'vitest';
import app from '../src/hono/hono.js';
import {
	normalizeLanguage,
	resolveAcceptLanguage,
	t
} from '../src/i18n/i18n.js';

const PROBE_PATH = '/oauth/__i18n-request-isolation';

const sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

app.get(PROBE_PATH, async (c) => {
	const pause = Math.max(0, Number(c.req.query('pause') || 0));
	const first = t('loginSuccess');
	await sleep(pause);
	const second = t('loginSuccess');
	const explicit = t('loginSuccess', { lng: c.req.query('explicit') || 'en' });
	return c.json({ first, second, explicit });
});

function probe(language, pause, explicit) {
	const query = new URLSearchParams({ pause: String(pause), explicit });
	return app.fetch(new Request(`https://example.com${PROBE_PATH}?${query}`, {
		headers: { 'accept-language': language }
	}));
}

describe('request-scoped i18n', () => {
	it('keeps interleaved async requests on their own fixed translator', async () => {
		const [englishResponse, frenchResponse] = await Promise.all([
			probe('en-US,en;q=0.8', 25, 'zh-TW'),
			probe('fr-FR,fr;q=0.8', 0, 'en')
		]);

		expect(englishResponse.status).toBe(200);
		expect(frenchResponse.status).toBe(200);
		expect(await englishResponse.json()).toEqual({
			first: 'Login Success',
			second: 'Login Success',
			explicit: '登入成功'
		});
		expect(await frenchResponse.json()).toEqual({
			first: 'Connexion réussie',
			second: 'Connexion réussie',
			explicit: 'Login Success'
		});
	});

	it('uses q weights, supported aliases, malformed-header fallback, and explicit lng', () => {
		expect(resolveAcceptLanguage('fr;q=.4, en-US;q=0.8, zh-TW;q=0.7')).toBe('en');
		expect(resolveAcceptLanguage('de;q=1, zh_HK;q=.9, en;q=.8')).toBe('zh-Hant');
		expect(resolveAcceptLanguage('not a language;q=wat, ???')).toBe('zh');
		expect(resolveAcceptLanguage('de;q=1, en;q=.9')).toBe('en');

		expect(normalizeLanguage('zh-CN')).toBe('zh');
		expect(normalizeLanguage('zh_TW')).toBe('zh-Hant');
		expect(normalizeLanguage('zh-Hant')).toBe('zh-Hant');
		expect(normalizeLanguage('nl-NL')).toBe('nl');
		expect(normalizeLanguage('unsupported')).toBe('zh');
		expect(normalizeLanguage(null)).toBe('zh');

		expect(t('loginSuccess', { lng: 'en-US' })).toBe('Login Success');
		expect(t('loginSuccess', { lng: 'zh-HK' })).toBe('登入成功');
		expect(t('loginSuccess', { lng: 'unknown' })).toBe('登录成功');
	});
});
