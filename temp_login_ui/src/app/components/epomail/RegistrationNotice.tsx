import { useId } from 'react';
import { createT, type AuthLang } from '../../i18n/authLocale';
import type { useRegistrationLegal } from '../../use-registration-legal';

interface RegistrationNoticeProps {
  legal: ReturnType<typeof useRegistrationLegal>;
  lang: AuthLang;
  disabled?: boolean;
}

/** Terms acceptance is separate from the privacy explanation and optional processing. */
export function RegistrationNotice({ legal, lang, disabled = false }: RegistrationNoticeProps) {
  const id = useId();
  const t = createT(lang);
  const { notice, ready } = legal.policy;
  const linkClass = 'rounded underline underline-offset-4 decoration-[rgba(103,232,249,0.4)] hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--epo-cyan-glow)]';
  const links = [
    [notice.termsUrl, 'legalTerms'], [notice.privacyUrl, 'legalPrivacy'],
    [notice.recipientsUrl, 'legalRecipients'], [notice.retentionUrl, 'legalRetention']
  ];

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="min-w-0 rounded-xl border border-[rgba(139,147,196,0.28)] bg-[rgba(139,147,196,0.06)] p-3 text-[12px] leading-relaxed"
      style={{ color: 'var(--epo-ink)', overflowWrap: 'anywhere' }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="flex items-center gap-1.5 text-[12px] font-medium">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0" style={{ color: 'var(--epo-cyan-glow)' }}>
            <path d="M5 2.5h7l3 3v12H5v-15Z M12 2.5v4h3 M7.5 10h5 M7.5 13h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t('legalBeforeRegister')}
        </h2>
        <button
          type="button"
          onClick={() => { void legal.refresh(); }}
          disabled={disabled || legal.refreshing}
          className="shrink-0 rounded px-1 py-0.5 text-[11px] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--epo-cyan-glow)] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ color: 'var(--epo-cyan-glow)' }}
        >
          {t(legal.refreshing ? 'legalRefreshing' : 'legalRefresh')}
        </button>
      </div>

      {(notice.operatorName || notice.operatorCountry) && (
        <p className="mt-1.5">
          <span style={{ color: 'var(--epo-muted)' }}>{t('legalOperator')} </span>
          {notice.operatorName}{notice.operatorName && notice.operatorCountry ? ' · ' : ''}{notice.operatorCountry}
        </p>
      )}
      {notice.contactEmail && <p>{t('legalContact')} {notice.contactEmail}</p>}
      {notice.contactAddress && <p style={{ color: 'var(--epo-muted)' }}>{notice.contactAddress}</p>}
      <p id={`${id}-risk`} className="mt-1.5" style={{ color: 'var(--epo-muted)' }}>{t('legalTestRisk')}</p>
      <nav aria-label={t('legalDocuments')} className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--epo-cyan-glow)' }}>
        {links.filter(([url]) => Boolean(url)).map(([url, key]) => (
          <a key={key} href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>{t(key)}</a>
        ))}
      </nav>
      {notice.termsVersion && <p className="mt-1 text-[11px]" style={{ color: 'var(--epo-muted)' }}>{t('legalVersion')} {notice.termsVersion}</p>}
      <p id={`${id}-privacy`} className="mt-1.5 text-[11.5px]" style={{ color: 'var(--epo-muted)' }}>{t('legalPrivacyExplanation')}</p>

      <div role="status" aria-live="polite" className="mt-1.5">
        {!ready && <p>{t('legalRegistrationUnready')}</p>}
        {legal.messageKey && <p>{t(legal.messageKey)}</p>}
      </div>
      <label htmlFor={`${id}-accept`} className="mt-2 flex min-h-9 cursor-pointer items-start gap-2 rounded-lg py-1 text-[12px] leading-relaxed">
        <input
          id={`${id}-accept`}
          type="checkbox"
          checked={legal.accepted}
          onChange={event => legal.setAccepted(event.target.checked)}
          disabled={disabled || !ready || legal.refreshing}
          aria-describedby={`${id}-risk ${id}-privacy`}
          className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[var(--epo-cyan-glow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--epo-cyan-glow)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--epo-void)] disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span>{t('legalAcceptTerms')}</span>
      </label>
    </section>
  );
}
