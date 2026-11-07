import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthLang } from './i18n/authLocale';
import { buildTermsAcceptance, readRegistrationPolicy, registrationErrorKey } from './registration-legal';

/** Used only by new-account forms; never gates password/OAuth sign-in. */
export function useRegistrationLegal(config: unknown, lang: AuthLang, active = true) {
  const [snapshot, setSnapshot] = useState<{ source: unknown; value: unknown }>({ source: config, value: config });
  const [acceptedRevision, setAcceptedRevision] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const sourceRef = useRef(config);
  sourceRef.current = config;
  const mounted = useRef(false);
  const policy = useMemo(() => readRegistrationPolicy(
    snapshot.source === config ? snapshot.value : config, import.meta.env.DEV
  ), [snapshot, config]);
  const payload = active && !refreshing ? buildTermsAcceptance(policy, acceptedRevision, lang) : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestId.current++;
      requestRef.current?.abort();
    };
  }, []);

  // Never retain stale approval while upstream config changes. A failed refresh
  // below also clears its snapshot rather than falling back to cached readiness.
  useEffect(() => {
    requestId.current++;
    requestRef.current?.abort();
    setRefreshing(false);
    setSnapshot({ source: config, value: config });
    setAcceptedRevision(null);
    setMessageKey(null);
  }, [config]);

  useEffect(() => {
    setAcceptedRevision(null);
  }, [policy.revision, active]);

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    const source = sourceRef.current;
    const id = ++requestId.current;
    requestRef.current = controller;
    setAcceptedRevision(null);
    setRefreshing(true);
    setMessageKey(null);
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch('/api/setting/websiteConfig', {
        cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal
      });
      const envelope = response.ok ? await response.json() : null;
      if (!envelope || envelope.code !== 200 || !envelope.data
          || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) throw new Error('configuration unavailable');
      if (mounted.current && id === requestId.current) {
        setSnapshot({ source, value: envelope.data });
        setMessageKey('legalReviewAgain');
      }
    } catch {
      if (mounted.current && id === requestId.current) {
        setSnapshot({ source, value: null });
        setMessageKey('legalRefreshFailed');
      }
    } finally {
      clearTimeout(timer);
      if (mounted.current && id === requestId.current) setRefreshing(false);
    }
  }, []);

  const setAccepted = (checked: boolean) => {
    setAcceptedRevision(checked === true && policy.ready && !refreshing ? policy.revision : null);
    setMessageKey(null);
  };

  const handleError = (errorCode: unknown): boolean => {
    const key = registrationErrorKey(errorCode);
    if (!key) return false;
    setAcceptedRevision(null);
    setMessageKey(key);
    if (errorCode === 'legal_registration_unready' || errorCode === 'terms_version_mismatch'
        || errorCode === 'terms_source_mismatch') {
      setSnapshot({ source: sourceRef.current, value: null });
      void refresh();
    }
    return true;
  };

  return {
    policy, payload, accepted: payload !== null, refreshing, messageKey,
    setAccepted, refresh, handleError,
    reset: () => { setAcceptedRevision(null); setMessageKey(null); }
  };
}
