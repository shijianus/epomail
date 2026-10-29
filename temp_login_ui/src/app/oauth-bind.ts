export interface OAuthBindContext {
  bindToken: string;
  oauthUserId: string;
  provider: string;
}

export type OAuthBindParseFailure = 'missing_proof' | 'missing_identity' | 'state_mismatch';

export type OAuthBindParseResult =
  | { ok: true; context: OAuthBindContext }
  | { ok: false; reason: OAuthBindParseFailure };

const MAX_PROOF_LENGTH = 256;
const MAX_OAUTH_USER_ID_LENGTH = 512;
const MAX_PROVIDER_LENGTH = 32;
const PROVIDER_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

function readHashParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
}

/** Detects a bind return without consuming or trusting any of its values. */
export function hasOAuthBindReturn(hash: string): boolean {
  return readHashParams(hash).has('oauth_bind');
}

/**
 * The bind proof is delivered in the URL fragment (never sent to servers).
 * The provider identity in the query string is untrusted until the server
 * matches it against the proof, and the client state proves this browser
 * started the flow — without it a crafted bind link could attach an
 * attacker's identity to an account the victim creates.
 */
export function parseOAuthBindReturn(input: {
  search: string;
  hash: string;
  expectedClientState: string | null;
}): OAuthBindParseResult {
  const bindToken = (readHashParams(input.hash).get('oauth_bind') || '').trim();
  if (!bindToken || bindToken.length > MAX_PROOF_LENGTH) {
    return { ok: false, reason: 'missing_proof' };
  }

  const searchParams = new URLSearchParams(input.search);
  const oauthUserId = (searchParams.get('oauth_user_id') || '').trim();
  const provider = (searchParams.get('oauth_provider') || '').trim();
  if (
    !oauthUserId ||
    oauthUserId.length > MAX_OAUTH_USER_ID_LENGTH ||
    !provider ||
    provider.length > MAX_PROVIDER_LENGTH ||
    !PROVIDER_PATTERN.test(provider)
  ) {
    return { ok: false, reason: 'missing_identity' };
  }

  const expected = (input.expectedClientState || '').trim();
  const returned = (searchParams.get('oauth_client_state') || '').trim();
  if (!expected || !returned || returned !== expected) {
    return { ok: false, reason: 'state_mismatch' };
  }

  return { ok: true, context: { bindToken, oauthUserId, provider } };
}

/* ------------------------------------------------------------------------- *
 * Email composition and validation
 *
 * The bind form reuses the registration page's domain list: when the operator
 * publishes domains the user types only the local part and picks a domain,
 * otherwise the full address is required. Mirroring the server's rules here
 * avoids a round trip for input the server would reject anyway — the server
 * remains authoritative and every rule below is re-checked there.
 * ------------------------------------------------------------------------- */

export type BindEmailFailure =
  | 'empty'
  | 'invalid_email'
  | 'invalid_local'
  | 'prefix_too_short'
  | 'prefix_too_long'
  | 'domain_not_allowed'
  | 'missing_domain';

export type BindEmailResult =
  | { ok: true; email: string }
  | { ok: false; reason: BindEmailFailure };

const LOCAL_PART_PATTERN = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const FULL_EMAIL_PATTERN = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
const MAX_LOCAL_PART_LENGTH = 64;

function normalizeDomain(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/^@+/, '').replace(/\.+$/, '');
}

/** Normalises the published domain list (accepts both `example.com` and `@example.com`). */
export function normalizeDomains(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    const domain = normalizeDomain(item);
    if (domain && !out.includes(domain)) out.push(domain);
  }
  return out;
}

function localPartFailure(local: string, minPrefix: number): BindEmailFailure | null {
  if (local.length < minPrefix) return 'prefix_too_short';
  if (local.length > MAX_LOCAL_PART_LENGTH) return 'prefix_too_long';
  if (!LOCAL_PART_PATTERN.test(local)) return 'invalid_local';
  return null;
}

export function validateBindEmail(input: {
  raw: string;
  domains?: string[];
  selectedDomain?: string;
  minPrefix?: number;
}): BindEmailResult {
  const raw = (input.raw || '').trim();
  if (!raw) return { ok: false, reason: 'empty' };

  const domains = normalizeDomains(input.domains);
  const minPrefix = Number.isFinite(input.minPrefix) ? Math.max(1, Number(input.minPrefix)) : 1;

  if (domains.length === 0) {
    if (!FULL_EMAIL_PATTERN.test(raw)) return { ok: false, reason: 'invalid_email' };
    return { ok: true, email: raw };
  }

  let local = raw;
  let domain: string;

  if (raw.includes('@')) {
    const at = raw.lastIndexOf('@');
    local = raw.slice(0, at).trim();
    domain = normalizeDomain(raw.slice(at + 1));
    if (!domain) return { ok: false, reason: 'invalid_email' };
    if (!domains.includes(domain)) return { ok: false, reason: 'domain_not_allowed' };
  } else {
    domain = normalizeDomain(input.selectedDomain) || domains[0];
    if (!domain) return { ok: false, reason: 'missing_domain' };
    if (!domains.includes(domain)) return { ok: false, reason: 'domain_not_allowed' };
  }

  if (!local) return { ok: false, reason: 'empty' };
  const failure = localPartFailure(local, minPrefix);
  if (failure) return { ok: false, reason: failure };

  return { ok: true, email: `${local}@${domain}` };
}

/* ------------------------------------------------------------------------- *
 * Error differentiation
 *
 * The server answers policy rejections with i18n protocol keys (a stable
 * vocabulary shared with the registration page). Mapping them to the field
 * that caused the rejection lets the form focus and annotate the right input
 * instead of showing one generic toast.
 * ------------------------------------------------------------------------- */

export type BindErrorField = 'email' | 'code' | 'form';

export interface BindErrorClassification {
  field: BindErrorField;
  /** Dictionary key resolved by the caller against the active locale. */
  key: string;
}

const POLICY_ERROR_FIELDS: Record<string, BindErrorClassification> = {
  regDisabled: { field: 'form', key: 'regDisabled' },
  emptyRegKey: { field: 'code', key: 'emptyRegKey' },
  notExistRegKey: { field: 'code', key: 'notExistRegKey' },
  noRegKeyTotal: { field: 'code', key: 'noRegKeyTotal' },
  noRegKeyCount: { field: 'code', key: 'noRegKeyTotal' },
  regKeyExpire: { field: 'code', key: 'regKeyExpire' },
  isRegAccount: { field: 'email', key: 'isRegAccount' },
  isDelAccount: { field: 'email', key: 'isDelAccount' },
  isDelUser: { field: 'email', key: 'isDelAccount' },
  notEmailDomain: { field: 'email', key: 'notEmailDomain' },
  notEmail: { field: 'email', key: 'invalidEmailFormat' },
  banEmailPrefix: { field: 'email', key: 'emailIllegalChars' },
  minEmailPrefix: { field: 'email', key: 'emailTooShort' },
  emailLengthLimit: { field: 'email', key: 'bindEmailTooLong' },
  adminReserved: { field: 'email', key: 'bindEmailReserved' },
  pwdMinLength: { field: 'form', key: 'passwordMinSix' },
  pwdLengthLimit: { field: 'form', key: 'passwordTooLong' }
};

/**
 * Stable server-side discriminators. The worker localises the human message,
 * so matching it would break in five of the six locales; the errorCode is
 * locale-independent and safe to act on.
 */
const POLICY_ERROR_CODES: Record<string, BindErrorClassification> = {
  register_closed: { field: 'form', key: 'regClosedNotice' },
  invalid_email: { field: 'email', key: 'invalidEmailFormat' },
  prefix_too_short: { field: 'email', key: 'emailTooShort' },
  prefix_too_long: { field: 'email', key: 'bindEmailTooLong' },
  invalid_local: { field: 'email', key: 'emailIllegalChars' },
  domain_not_allowed: { field: 'email', key: 'notEmailDomain' },
  domain_not_permitted: { field: 'email', key: 'notEmailDomain' },
  email_reserved: { field: 'email', key: 'bindEmailReserved' },
  email_deleted: { field: 'email', key: 'isDelAccount' },
  email_exists: { field: 'email', key: 'isRegAccount' },
  invite_code_required: { field: 'code', key: 'emptyRegKey' },
  invite_code_invalid: { field: 'code', key: 'notExistRegKey' },
  invite_code_exhausted: { field: 'code', key: 'noRegKeyTotal' },
  invite_code_expired: { field: 'code', key: 'regKeyExpire' },
  password_too_short: { field: 'form', key: 'passwordMinSix' },
  password_too_long: { field: 'form', key: 'passwordTooLong' },
  bind_identity_conflict: { field: 'form', key: 'oauthBindAlreadyBound' },
  bind_identity_missing: { field: 'form', key: 'oauthBindExpired' },
  bind_policy_rejected: { field: 'form', key: 'oauthBindRetry' },
  bind_failed: { field: 'form', key: 'oauthBindRetry' },
  bind_commit_failed: { field: 'form', key: 'oauthBindFailed' }
};

export function classifyBindPolicyError(
  message: unknown,
  errorCode?: unknown
): BindErrorClassification | null {
  if (typeof errorCode === 'string' && errorCode) {
    const byCode = POLICY_ERROR_CODES[errorCode.trim()];
    if (byCode) return byCode;
  }
  if (typeof message !== 'string' || !message) return null;
  const direct = POLICY_ERROR_FIELDS[message.trim()];
  if (direct) return direct;
  if (/已绑定|already\s+(linked|bound)/i.test(message)) {
    return { field: 'form', key: 'oauthBindAlreadyBound' };
  }
  if (/bind proof|binding proof|绑定凭证|綁定憑證/i.test(message)) {
    return { field: 'form', key: 'oauthBindExpired' };
  }
  return null;
}

export function buildOAuthBindPayload(
  context: OAuthBindContext,
  input: { email: string; code?: string }
) {
  const code = (input.code || '').trim();
  return {
    email: input.email.trim(),
    ...(code ? { code } : {}),
    oauthUserId: context.oauthUserId,
    provider: context.provider,
    bindToken: context.bindToken
  };
}

export interface OAuthBindPayload {
  token?: string | null;
  mfa?: any;
  userInfo?: any;
  alreadyBound?: boolean;
}

/**
 * Server contract:
 *   200 + alreadyBound  → the association is committed (a retry after a lost
 *                         response, or a session that could not be issued)
 *   400                 → policy/input rejection; the proof was NOT spent
 *   409 / 410           → proof spent or invalid; only a new flow can help
 *   425                 → another bind for this identity is still running
 *   429 / 5xx / no body → transient; safe to retry with the same proof
 *
 * The distinction is the whole point of B3: a wrong invite code must keep the
 * proof alive on the client, while a spent proof must never be resubmitted.
 */
export type OAuthBindOutcome =
  | { kind: 'success'; payload: OAuthBindPayload }
  | { kind: 'already_bound' }
  | {
      kind: 'retry';
      reason: 'policy' | 'in_progress' | 'rate_limited' | 'network' | 'server';
      errorCode?: string;
    }
  | {
      kind: 'restart';
      reason: 'spent_proof' | 'invalid_proof';
      errorCode?: string;
    };

type BindFailure = Extract<OAuthBindOutcome, { kind: 'retry' | 'restart' }>;

// Omit the optional errorCode entirely when the server sent none: consumers
// test the outcome shape, and an explicit `errorCode: undefined` leaks an
// implementation detail into every strict equality assertion.
function withErrorCode(outcome: BindFailure, errorCode: string | undefined): BindFailure {
  return errorCode ? { ...outcome, errorCode } : outcome;
}

export function classifyBindResponse(body: unknown): OAuthBindOutcome {
  const envelope = body as { code?: number; data?: OAuthBindPayload; errorCode?: string } | null;
  const errorCode =
    envelope && typeof envelope.errorCode === 'string' && envelope.errorCode
      ? envelope.errorCode
      : undefined;

  if (!envelope || envelope.code !== 200 || !envelope.data) {
    const code = Number(envelope?.code);
    if (code === 409) return withErrorCode({ kind: 'restart', reason: 'spent_proof' }, errorCode);
    if (code === 410) return withErrorCode({ kind: 'restart', reason: 'invalid_proof' }, errorCode);
    if (code === 425) return withErrorCode({ kind: 'retry', reason: 'in_progress' }, errorCode);
    if (code === 429) return withErrorCode({ kind: 'retry', reason: 'rate_limited' }, errorCode);
    if (code === 400) return withErrorCode({ kind: 'retry', reason: 'policy' }, errorCode);
    return withErrorCode({ kind: 'retry', reason: envelope ? 'server' : 'network' }, errorCode);
  }

  if (envelope.data.alreadyBound) {
    return { kind: 'already_bound' };
  }
  return { kind: 'success', payload: envelope.data };
}
