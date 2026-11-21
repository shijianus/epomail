const LOCALE_KEYS = ['zh', 'zh-Hant', 'en', 'fr', 'es', 'nl'];

// Keep locale metadata in one registry. UI labels remain in the locale dictionaries;
// this registry only contains protocol/resource identifiers and formatting metadata.
export const UI_LOCALE_REGISTRY = Object.freeze({
  zh: Object.freeze({
    htmlLang: 'zh-CN',
    intlLocale: 'zh-CN',
    dayjsLocale: 'zh-cn',
    docsSegment: '',
    dir: 'ltr'
  }),
  'zh-Hant': Object.freeze({
    htmlLang: 'zh-Hant',
    intlLocale: 'zh-TW',
    dayjsLocale: 'zh-tw',
    docsSegment: 'zh-tw',
    dir: 'ltr'
  }),
  en: Object.freeze({
    htmlLang: 'en',
    intlLocale: 'en',
    dayjsLocale: 'en',
    docsSegment: 'en',
    dir: 'ltr'
  }),
  fr: Object.freeze({
    htmlLang: 'fr',
    intlLocale: 'fr',
    dayjsLocale: 'fr',
    docsSegment: 'fr',
    dir: 'ltr'
  }),
  es: Object.freeze({
    htmlLang: 'es',
    intlLocale: 'es',
    dayjsLocale: 'es',
    docsSegment: 'es',
    dir: 'ltr'
  }),
  nl: Object.freeze({
    htmlLang: 'nl',
    intlLocale: 'nl',
    dayjsLocale: 'nl',
    docsSegment: 'nl',
    dir: 'ltr'
  })
});

export const SUPPORTED_UI_LOCALES = Object.freeze([...LOCALE_KEYS]);
export const DEFAULT_DOCS_BASE_URL = 'https://docs.epocanvas.com/epomail';

function canonicalizeLocale(value) {
  if (typeof value !== 'string') return '';
  const raw = value.trim().replace(/_/g, '-');
  if (!raw || !/^[a-z]{1,8}(?:-[a-z0-9]{1,8})*$/i.test(raw)) return '';
  const parts = raw.toLowerCase().split('-');
  const language = parts[0];

  if (language === 'zh') {
    const script = parts.find((part) => part === 'hant' || part === 'hans');
    const region = parts.slice(1).find((part) => /^[a-z]{2}$/.test(part));
    if (script) return script === 'hant' ? 'zh-Hant' : 'zh';
    return ['tw', 'hk', 'mo'].includes(region) ? 'zh-Hant' : 'zh';
  }

  if (['hant', 'tw', 'hk', 'mo'].includes(language)) return 'zh-Hant';
  if (['hans', 'cn', 'sg'].includes(language)) return 'zh';

  if (LOCALE_KEYS.includes(language)) return language;
  return '';
}

function canonicalFallback(fallback) {
  return canonicalizeLocale(fallback) || 'zh';
}

/**
 * Convert browser, legacy, and stored locale values to one of the six UI keys.
 * Unknown values use the supplied canonical fallback and never leak into URLs.
 */
export function normalizeUiLocale(value, fallback = 'zh') {
  return canonicalizeLocale(value) || canonicalFallback(fallback);
}

/** Return true only for a recognized locale or one of its supported aliases. */
export function isRecognizedUiLocale(value) {
  return Boolean(canonicalizeLocale(value));
}

/** Resolve persisted preference first, then browser language, then English. */
export function resolveUiLocale(stored, browserLanguage) {
  return canonicalizeLocale(stored) || canonicalizeLocale(browserLanguage) || 'en';
}

export function getUiLocaleMetadata(locale) {
  return UI_LOCALE_REGISTRY[normalizeUiLocale(locale)];
}

export function getUiIntlLocale(locale) {
  return getUiLocaleMetadata(locale).intlLocale;
}

function parseUiDate(value) {
  if (value instanceof Date || typeof value === 'number') {
    const date = new Date(value instanceof Date ? value.getTime() : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  // API timestamps without an offset are UTC by contract. Keep offset-bearing
  // strings intact so Date can honor their explicit offset.
  const normalized = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)?$/.test(raw)
    ? `${raw.replace(' ', 'T')}${raw.length === 10 ? 'T00:00:00' : ''}Z`
    : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatUiNumber(value, locale, options = {}) {
  if (value === null || value === undefined || value === '') return '-';
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return '-';
  return new Intl.NumberFormat(getUiIntlLocale(locale), options).format(number);
}

export function formatUiDate(value, locale, options = {}) {
  const date = parseUiDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat(getUiIntlLocale(locale), options).format(date);
}

export function formatUiDateTime(value, locale, options = {}) {
  return formatUiDate(value, locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  });
}

function isCompleteHttpUrl(value) {
  if (typeof value !== 'string' || !value || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname) && !url.username && !url.password;
  } catch (_) {
    return false;
  }
}

/** Build a docs URL using only a registered language segment. */
export function buildDocsPageUrl(path, locale, baseUrl = DEFAULT_DOCS_BASE_URL) {
  const base = isCompleteHttpUrl(baseUrl) ? baseUrl.replace(/\/+$/, '') : DEFAULT_DOCS_BASE_URL;
  const { docsSegment } = getUiLocaleMetadata(locale);
  const cleanPath = String(path || '').replace(/^\/+/, '');
  return `${base}/${docsSegment ? `${docsSegment}/` : ''}${cleanPath}`;
}

/** Preserve a legal complete custom policy URL exactly; otherwise use docs fallback. */
export function resolvePolicyUrl(customUrl, path, locale, baseUrl = DEFAULT_DOCS_BASE_URL) {
  return isCompleteHttpUrl(customUrl) ? customUrl : buildDocsPageUrl(path, locale, baseUrl);
}

export function isCompletePolicyUrl(value) {
  return isCompleteHttpUrl(value);
}
