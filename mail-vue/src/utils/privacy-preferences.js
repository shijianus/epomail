export function privacyPreferences(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function verificationCodeNotice(config) {
  const processing = config?.contentProcessing;
  if (processing?.verificationCodeEnabled !== true || typeof processing.noticeUrl !== 'string') return '';
  try {
    const url = new URL(processing.noticeUrl);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

export function withVerificationCodePreference(existing, enabled) {
  return { ...privacyPreferences(existing), aiVerificationCode: enabled === true };
}
