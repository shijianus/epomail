import BizError from '../error/biz-error.js';
import { t } from '../i18n/i18n.js';
import { getUserDb } from '../utils/db-accessor.js';
import { isValidNoticeUrl as validateLegalNoticeUrl } from './legal-policy-service.js';

export const CONTENT_PROCESSING_KEY = 'contentProcessing';

export const CONTENT_PROCESSING_DEFAULTS = Object.freeze({
	verificationCodeEnabled: false,
	translationEnabled: false,
	ocrEnabled: false,
	publicTranslationFallbackEnabled: false,
	noticeUrl: ''
});

function asBoolean(value) {
	return value === true;
}

function parseConfig(value) {
	if (typeof value === 'string') {
		try {
			value = JSON.parse(value);
		} catch (_) {
			return { ...CONTENT_PROCESSING_DEFAULTS };
		}
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { ...CONTENT_PROCESSING_DEFAULTS };
	}

	return {
		verificationCodeEnabled: asBoolean(value.verificationCodeEnabled),
		translationEnabled: asBoolean(value.translationEnabled),
		ocrEnabled: asBoolean(value.ocrEnabled),
		publicTranslationFallbackEnabled: false,
		noticeUrl: typeof value.noticeUrl === 'string' ? value.noticeUrl : ''
	};
}

export function isValidNoticeUrl(noticeUrl, env = {}) {
	if (typeof noticeUrl !== 'string' || !noticeUrl || noticeUrl.trim() !== noticeUrl) return false;
	return validateLegalNoticeUrl(noticeUrl, { env }, { required: true }).ok;
}

async function readSettingExtValue(c, key) {
	const db = getUserDb(c);
	if (!db || typeof db.prepare !== 'function') return null;

	try {
		const statement = db.prepare('SELECT value FROM setting_ext WHERE key = ?');
		const bound = typeof statement.bind === 'function' ? statement.bind(key) : statement;
		if (typeof bound.first === 'function') {
			const row = await bound.first();
			return row?.value ?? null;
		}
		if (typeof bound.all === 'function') {
			const result = await bound.all();
			return result?.results?.[0]?.value ?? null;
		}
	} catch (_) {
		// Missing setting_ext or a lightweight test binding means all features stay off.
	}
	return null;
}

export async function getContentProcessingConfig(c) {
	const stored = await readSettingExtValue(c, CONTENT_PROCESSING_KEY);
	if (stored !== null && stored !== undefined) return parseConfig(stored);
	return { ...CONTENT_PROCESSING_DEFAULTS };
}

export async function requireTranslationConfirmation(c, options = {}) {
	const config = await getContentProcessingConfig(c);
	if (config.translationEnabled !== true || !isValidNoticeUrl(config.noticeUrl, c?.env || {})) {
		throw new BizError(t('privacyProcessing.disabled'), 403, 'privacy_processing_disabled');
	}
	if (options.confirmed !== true) {
		throw new BizError(t('privacyProcessing.confirmationRequired'), 409, 'privacy_confirmation_required');
	}
	if (typeof options.noticeUrl !== 'string' || options.noticeUrl !== config.noticeUrl) {
		throw new BizError(t('privacyProcessing.noticeChanged'), 409, 'privacy_notice_changed');
	}
	return config;
}

export function isVerificationCodeAllowed(config, userProfile) {
	return config?.verificationCodeEnabled === true &&
		userProfile?.privacyPreferences?.aiVerificationCode === true;
}

export default {
	CONTENT_PROCESSING_KEY,
	CONTENT_PROCESSING_DEFAULTS,
	getContentProcessingConfig,
	isValidNoticeUrl,
	requireTranslationConfirmation,
	isVerificationCodeAllowed
};
