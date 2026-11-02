import BizError from '../error/biz-error.js';
import { getUserDb } from '../utils/db-accessor.js';
import { isSafePublicUrl } from '../utils/url-utils.js';

export const LEGAL_LOCALES = Object.freeze(['zh', 'zh-Hant', 'en', 'es', 'fr', 'nl']);

export const LEGAL_EXT_KEYS = Object.freeze([
	'operatorName',
	'operatorCountry',
	'contactEmail',
	'contactAddress',
	'policyVersion',
	'recipientsUrl',
	'retentionUrl'
]);

export const CONTENT_PROCESSING_DEFAULTS = Object.freeze({
	verificationCodeEnabled: false,
	translationEnabled: false,
	ocrEnabled: false,
	publicTranslationFallbackEnabled: false,
	noticeUrl: ''
});

const EMPTY_LEGAL_NOTICE = Object.freeze({
	operatorName: '',
	operatorCountry: '',
	contactEmail: '',
	contactAddress: '',
	termsVersion: '',
	termsUrl: '',
	privacyUrl: '',
	recipientsUrl: '',
	retentionUrl: ''
});

function text(value, max = 512) {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isLocalEnvironment(c) {
	const env = c?.env || {};
	const value = String(env.ENVIRONMENT || env.NODE_ENV || env.environment || env.node_env || '').trim().toLowerCase();
	if (env.DEV === true || env.dev === true || String(env.DEV || env.dev || '').toLowerCase() === 'true') return true;
	return ['dev', 'development', 'test', 'testing', 'local'].includes(value);
}

function isLoopbackHost(hostname) {
	const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
	if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '127.0.0.1') return true;
	return /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host);
}

export function isProductionEnvironment(c) {
	const env = c?.env || {};
	const value = String(env.ENVIRONMENT || env.NODE_ENV || '').trim().toLowerCase();
	if (['prod', 'production'].includes(value)) return true;
	if (env.PRODUCTION === true || String(env.PRODUCTION || '').toLowerCase() === 'true') return true;
	return !isLocalEnvironment(c) && value !== 'preview';
}

export function isValidNoticeUrl(value, c, { required = false } = {}) {
	const candidate = text(value, 2048);
	if (!candidate) return required ? { ok: false, value: '', reason: 'required' } : { ok: true, value: '' };
	try {
		const url = new URL(candidate);
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
			return { ok: false, value: candidate, reason: 'protocol' };
		}
		const local = isLocalEnvironment(c) && isLoopbackHost(url.hostname);
		if (url.protocol !== 'https:' && !local) {
			return { ok: false, value: candidate, reason: 'https_required' };
		}
		if (!local && !url.hostname) return { ok: false, value: candidate, reason: 'host_required' };
		if (!local && !isSafePublicUrl(candidate)) return { ok: false, value: candidate, reason: 'public_host_required' };
		return { ok: true, value: url.toString() };
	} catch (_) {
		return { ok: false, value: candidate, reason: 'format' };
	}
}

export function validatePolicyUrl(value, { required = false, dev = false } = {}) {
	// Compatibility wrapper for callers that do not have a Hono context.
	return isValidNoticeUrl(value, { env: dev ? { ENVIRONMENT: 'dev' } : { ENVIRONMENT: 'production' } }, { required });
}

export async function readAuthoritativeLegalSettings(c, fallback = {}) {
	const settings = {
		...fallback,
		...Object.fromEntries(LEGAL_EXT_KEYS.map(key => [key, ''])),
		termsVersion: '', termsUrl: '', privacyUrl: '',
		contentProcessing: { ...CONTENT_PROCESSING_DEFAULTS }
	};
	const db = getUserDb(c);
	if (!db || typeof db.prepare !== 'function') return { available: false, settings };
	try {
		const row = await db.prepare(`SELECT terms_url, privacy_url FROM setting LIMIT 1`).first();
		if (!row) return { available: false, settings };
		settings.termsUrl = typeof row.terms_url === 'string' ? row.terms_url : '';
		settings.privacyUrl = typeof row.privacy_url === 'string' ? row.privacy_url : '';
		const extRows = await db.prepare(`SELECT key, value FROM setting_ext`).all();
		for (const item of extRows?.results || []) {
			if (LEGAL_EXT_KEYS.includes(item?.key)) settings[item.key] = typeof item.value === 'string' ? item.value : '';
			if (item?.key === 'contentProcessing') settings.contentProcessing = item.value;
		}
		return { available: true, settings };
	} catch (_) {
		return { available: false, settings: {
			...settings,
			...Object.fromEntries(LEGAL_EXT_KEYS.map(key => [key, ''])),
			termsVersion: '', termsUrl: '', privacyUrl: '',
			contentProcessing: { ...CONTENT_PROCESSING_DEFAULTS }
		} };
	}
}

export async function validateRegistrationAcceptanceAuthoritative(c, params = {}, fallback = {}) {
	const authoritative = await readAuthoritativeLegalSettings(c, fallback);
	if (!authoritative.available) {
		throw new BizError(
			'Registration is temporarily unavailable because required operator policy information is incomplete.',
			503,
			'legal_registration_unready'
		);
	}
	return validateRegistrationAcceptance(params, authoritative.settings, c);
}

export function isValidContactEmail(value) {
	const candidate = text(value, 320);
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) && candidate.length <= 320;
}

export function normalizeContentProcessing(value, c) {
	let source = value;
	if (typeof source === 'string') {
		try { source = JSON.parse(source); } catch (_) { source = {}; }
	}
	if (!source || typeof source !== 'object' || Array.isArray(source)) source = {};
	const notice = isValidNoticeUrl(source.noticeUrl, c);
	return {
		verificationCodeEnabled: source.verificationCodeEnabled === true,
		translationEnabled: source.translationEnabled === true,
		ocrEnabled: source.ocrEnabled === true,
		publicTranslationFallbackEnabled: false,
		noticeUrl: notice.ok ? notice.value : ''
	};
}

export function normalizeLegalNotice(setting = {}) {
	return {
		...EMPTY_LEGAL_NOTICE,
		operatorName: text(setting.operatorName, 200),
		operatorCountry: text(setting.operatorCountry, 120),
		contactEmail: text(setting.contactEmail, 320),
		contactAddress: text(setting.contactAddress, 500),
		termsVersion: text(setting.policyVersion || setting.termsVersion, 120),
		termsUrl: text(setting.termsUrl, 2048),
		privacyUrl: text(setting.privacyUrl, 2048),
		recipientsUrl: text(setting.recipientsUrl, 2048),
		retentionUrl: text(setting.retentionUrl, 2048)
	};
}

export function getRegistrationReadiness(setting = {}, c) {
	const notice = normalizeLegalNotice(setting);
	const missing = [];
	for (const field of ['operatorName', 'operatorCountry', 'termsVersion']) {
		if (!notice[field]) missing.push(field);
	}
	if (!isValidContactEmail(notice.contactEmail)) missing.push('contactEmail');
	for (const field of ['termsUrl', 'privacyUrl']) {
		const checked = isValidNoticeUrl(notice[field], c, { required: true });
		if (!checked.ok) missing.push(field);
	}
	return { ready: missing.length === 0, missing, notice };
}

export function validateRegistrationAcceptance(params = {}, setting = {}, c) {
	const readiness = getRegistrationReadiness(setting, c);
	if (!readiness.ready) {
		throw new BizError(
			'Registration is temporarily unavailable because required operator policy information is incomplete.',
			503,
			'legal_registration_unready'
		);
	}
	if (params.acceptedTerms !== true) {
		throw new BizError('You must accept the current Terms of Service before registering.', 400, 'terms_acceptance_required');
	}
	const submittedVersion = text(params.termsVersion, 120);
	if (!submittedVersion || submittedVersion !== readiness.notice.termsVersion) {
		throw new BizError('The Terms of Service version is out of date. Refresh and review the current terms.', 409, 'terms_version_mismatch');
	}
	const submittedSource = text(params.sourceUrl, 2048);
	if (!submittedSource || submittedSource !== readiness.notice.termsUrl) {
		throw new BizError('The Terms of Service link changed. Refresh and review the current terms.', 409, 'terms_source_mismatch');
	}
	const locale = LEGAL_LOCALES.includes(params.locale) ? params.locale : 'en';
	return {
		termsVersion: readiness.notice.termsVersion,
		acceptedAt: new Date().toISOString(),
		locale,
		sourceUrl: readiness.notice.termsUrl
	};
}

export async function recordAcceptance(c, userId, acceptance) {
	const id = Number(userId);
	if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid user id for legal acceptance evidence');
	const db = getUserDb(c);
	if (!db || typeof db.prepare !== 'function') throw new Error('User database is unavailable for legal acceptance evidence');
	const row = await db.prepare(`
		INSERT INTO legal_acceptance (user_id, terms_version, accepted_at, locale, source_url)
		SELECT ?, ?, ?, ?, ?
		WHERE EXISTS (SELECT 1 FROM setting WHERE terms_url = ? AND privacy_url <> '')
		AND EXISTS (SELECT 1 FROM setting_ext WHERE key = 'policyVersion' AND value = ?)
		AND (SELECT COUNT(*) FROM setting_ext WHERE key IN ('operatorName', 'operatorCountry', 'contactEmail') AND TRIM(value) <> '') = 3
		RETURNING id
	`).bind(
		id,
		text(acceptance?.termsVersion, 120),
		text(acceptance?.acceptedAt, 64),
		LEGAL_LOCALES.includes(acceptance?.locale) ? acceptance.locale : 'en',
		text(acceptance?.sourceUrl, 2048),
		text(acceptance?.sourceUrl, 2048),
		text(acceptance?.termsVersion, 120)
	).first();
	if (!row) throw new BizError('The registration notice changed. Refresh and review the current terms.', 409, 'terms_version_mismatch');
}

const legalPolicyService = {
	LEGAL_LOCALES,
	LEGAL_EXT_KEYS,
	CONTENT_PROCESSING_DEFAULTS,
	isProductionEnvironment,
	validatePolicyUrl,
	readAuthoritativeLegalSettings,
	validateRegistrationAcceptanceAuthoritative,
	normalizeContentProcessing,
	normalizeLegalNotice,
	getRegistrationReadiness,
	validateRegistrationAcceptance,
	recordAcceptance
};

export default legalPolicyService;
