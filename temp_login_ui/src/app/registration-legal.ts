import { AUTH_LANGS, type AuthLang } from './i18n/authLocale.ts';

export interface RegistrationNoticeData {
  operatorName: string;
  operatorCountry: string;
  contactEmail: string;
  contactAddress: string;
  termsVersion: string;
  termsUrl: string;
  privacyUrl: string;
  recipientsUrl: string;
  retentionUrl: string;
}

export interface RegistrationPolicy {
  notice: RegistrationNoticeData;
  ready: boolean;
  revision: string;
}

export interface TermsAcceptancePayload {
  acceptedTerms: true;
  termsVersion: string;
  locale: AuthLang;
  sourceUrl: string;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max
      || /[\u0000-\u001f\u007f]/u.test(value)) return '';
  return value;
}

/** Validate without repairing/normalising: acceptance must retain the exact URL. */
export function registrationNoticeUrl(value: unknown, isDev = false): string {
  if (typeof value !== 'string' || !value || value.length > 2048
      || !/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f\\]/u.test(value)
      || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value)) return '';
  try {
    const url = new URL(value);
    const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1] || '';
    if (!url.hostname || url.username || url.password || /[@%]/.test(authority)) return '';
    if (url.protocol === 'https:') return value;
    const loopback = url.hostname === 'localhost' || url.hostname === '[::1]'
      || /^127\.\d+\.\d+\.\d+$/.test(url.hostname);
    return isDev && url.protocol === 'http:' && loopback ? value : '';
  } catch {
    return '';
  }
}

/** Public configuration is not identity verification. Missing facts never get defaults. */
export function readRegistrationPolicy(config: unknown, isDev = false): RegistrationPolicy {
  const data = object(config);
  const raw = object(data.legalNotice);
  const readiness = object(data.registrationReadiness);
  const notice: RegistrationNoticeData = {
    operatorName: text(raw.operatorName, 200),
    operatorCountry: text(raw.operatorCountry, 120),
    contactEmail: text(raw.contactEmail, 320),
    contactAddress: text(raw.contactAddress, 500),
    termsVersion: text(raw.termsVersion, 120),
    termsUrl: registrationNoticeUrl(raw.termsUrl, isDev),
    privacyUrl: registrationNoticeUrl(raw.privacyUrl, isDev),
    recipientsUrl: registrationNoticeUrl(raw.recipientsUrl, isDev),
    retentionUrl: registrationNoticeUrl(raw.retentionUrl, isDev)
  };
  const ready = readiness.ready === true && Array.isArray(readiness.missing) && readiness.missing.length === 0
    && Boolean(notice.operatorName && notice.operatorCountry && notice.termsVersion
      && notice.termsUrl && notice.privacyUrl)
    && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(notice.contactEmail);
  // Include all displayed notice fields: changing a version, URL or operator
  // invalidates the old check immediately, before a React effect can run.
  return { notice, ready, revision: ready ? JSON.stringify(notice) : '' };
}

export function buildTermsAcceptance(
  policy: RegistrationPolicy,
  acceptedRevision: string | null,
  locale: AuthLang
): TermsAcceptancePayload | null {
  if (!policy.ready || !policy.revision || acceptedRevision !== policy.revision
      || !(AUTH_LANGS as readonly string[]).includes(locale)) return null;
  return {
    acceptedTerms: true,
    termsVersion: policy.notice.termsVersion,
    locale,
    sourceUrl: policy.notice.termsUrl
  };
}

const LEGAL_ERROR_KEYS = {
  legal_registration_unready: 'legalRegistrationUnready',
  terms_acceptance_required: 'legalAcceptanceRequired',
  terms_version_mismatch: 'legalVersionChanged',
  terms_source_mismatch: 'legalSourceChanged'
} as const;

export function registrationErrorKey(errorCode: unknown): string | null {
  return typeof errorCode === 'string' && Object.hasOwn(LEGAL_ERROR_KEYS, errorCode)
    ? LEGAL_ERROR_KEYS[errorCode as keyof typeof LEGAL_ERROR_KEYS] : null;
}
