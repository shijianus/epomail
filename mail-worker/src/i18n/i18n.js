import i18next from 'i18next';
import { contextStorage, tryGetContext } from 'hono/context-storage';
import zh from './zh.js';
import en from './en.js';
import zhHant from './zh-Hant.js';
import fr from './fr.js';
import es from './es.js';
import nl from './nl.js';
import app from '../hono/hono';

export const DEFAULT_LANGUAGE = 'zh';
export const SUPPORTED_LANGUAGES = Object.freeze(['zh', 'zh-Hant', 'en', 'fr', 'es', 'nl']);

const I18N_CONTEXT_KEY = 'i18n';

const resources = {
	en: { translation: en },
	zh: { translation: zh },
	'zh-Hant': { translation: zhHant },
	fr: { translation: fr },
	es: { translation: es },
	nl: { translation: nl }
};

// Keep one initialized resource store, but never mutate its active language per request.
i18next.init({
	fallbackLng: DEFAULT_LANGUAGE,
	resources
});

const defaultTranslator = i18next.getFixedT(DEFAULT_LANGUAGE);

function canonicalLanguage(value) {
	if (typeof value !== 'string') return null;

	const normalized = value.trim().replaceAll('_', '-').toLowerCase();
	if (!normalized || normalized.length > 64 || !/^[a-z]{1,8}(?:-[a-z0-9]{1,8})*$/.test(normalized)) {
		return null;
	}

	const [base, ...subtags] = normalized.split('-');
	if (base === 'zh') {
		const isTraditional = subtags.includes('hant')
			|| subtags.includes('tw')
			|| subtags.includes('hk')
			|| subtags.includes('mo');
		return isTraditional ? 'zh-Hant' : 'zh';
	}

	return SUPPORTED_LANGUAGES.includes(base) ? base : null;
}

/** Normalize a stored or explicit language code to one of the six dictionaries. */
export function normalizeLanguage(value) {
	return canonicalLanguage(value) || DEFAULT_LANGUAGE;
}

function parseQuality(parameters) {
	let quality = 1;
	for (const parameter of parameters) {
		const separator = parameter.indexOf('=');
		if (separator < 0) continue;
		const name = parameter.slice(0, separator).trim().toLowerCase();
		if (name !== 'q') continue;

		const rawQuality = parameter.slice(separator + 1).trim();
		// Accept the common .8 form as well as the RFC 9110 0..1 forms.
		if (!/^(?:0|1|0?\.\d{1,3}|1\.0{1,3})$/.test(rawQuality)) return null;
		quality = Number(rawQuality);
	}
	return quality;
}

/** Resolve an Accept-Language value using q weights and original order as a tie-break. */
export function resolveAcceptLanguage(header) {
	if (typeof header !== 'string' || !header.trim()) return DEFAULT_LANGUAGE;

	const candidates = [];
	for (const [index, item] of header.split(',').entries()) {
		const parts = item.trim().split(';');
		const range = parts.shift()?.trim();
		if (!range || range === '*') continue;

		const quality = parseQuality(parts);
		const language = canonicalLanguage(range);
		if (quality === null || language === null || quality <= 0) continue;
		candidates.push({ language, quality, index });
	}

	candidates.sort((left, right) => right.quality - left.quality || left.index - right.index);
	return candidates[0]?.language || DEFAULT_LANGUAGE;
}

function translateWithExplicitLanguage(translator, key, values, rest) {
	if (!values || typeof values !== 'object' || Array.isArray(values)
		|| typeof values.lng !== 'string' || !values.lng.trim()) {
		return translator(key, values, ...rest);
	}

	return translator(key, { ...values, lng: normalizeLanguage(values.lng) }, ...rest);
}

function getRequestTranslator() {
	// Direct service calls and cron handlers have no Hono context and retain zh.
	const context = tryGetContext();
	return context?.get(I18N_CONTEXT_KEY)?.translator || defaultTranslator;
}

// Hono's ALS context is the request boundary. The translator stored below is
// immutable for that request, so async interleaving cannot change its language.
app.use('*', contextStorage());
app.use('*', async (c, next) => {
	const language = resolveAcceptLanguage(c.req.header('accept-language'));
	c.set(I18N_CONTEXT_KEY, Object.freeze({
		language,
		translator: i18next.getFixedT(language)
	}));
	return await next();
});

export const t = (key, values, ...rest) =>
	translateWithExplicitLanguage(getRequestTranslator(), key, values, rest);

export default i18next;
