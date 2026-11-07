// Shared slots are an account picker, not the current request credential.
// Each tab pins one immutable { u, sessionId, token }; an invalid pin fails
// closed and cannot bootstrap from epo_sessions again until explicit login.
export const SESSION_REGISTRY_KEY = 'epo_sessions';
export const TAB_IDENTITY_KEY = 'epomail_tab_identity';
const REVOKED_PREFIX = 'epo_session_revoked:';

function browserStorage(name) {
  try { return globalThis[name]; } catch { return null; }
}
function readJson(storage, key, fallback = null) {
  try { return JSON.parse(storage?.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function validSlot(value) {
  return /^(0|[1-9]\d*)$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}
const cleanEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const userIdentityKey = user => user?.userId != null && String(user.userId).trim() !== ''
  ? `user:${String(user.userId)}` : '';
export const createIdentityId = () => {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch (_) {}
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export function isSameTabIdentity(a, b) {
  return !!a && !!b && a.u === b.u && a.sessionId === b.sessionId && a.token === b.token;
}

export function createSessionManager({
  localStorage = browserStorage('localStorage'),
  sessionStorage = browserStorage('sessionStorage'),
  pathname = () => globalThis.location?.pathname || '/',
  randomId = createIdentityId,
} = {}) {
  let tab = readJson(sessionStorage, TAB_IDENTITY_KEY);
  const listeners = new Set();
  const notify = () => listeners.forEach(listener => listener());
  function setTab(value) {
    tab = value;
    // If persistence is unavailable, do not silently carry a different identity
    // across a navigation. A subsequent page will require explicit sign-in.
    sessionStorage?.setItem(TAB_IDENTITY_KEY, JSON.stringify(value));
    notify();
  }
  function revoked(record) {
    try { return !!localStorage?.getItem(REVOKED_PREFIX + record.sessionId); } catch { return true; }
  }
  function list() {
    const rows = readJson(localStorage, SESSION_REGISTRY_KEY, []);
    if (!Array.isArray(rows)) return [];
    return rows.flatMap(row => {
      const u = validSlot(row?.u);
      if (u === null || typeof row?.token !== 'string' || !row.token.trim()) return [];
      const record = { ...row, u, email: cleanEmail(row.email), sessionId: row.sessionId || `legacy-${u}` };
      return revoked(record) ? [] : [record];
    });
  }
  function write(records) {
    // Keep [] instead of deleting the registry: legacy global token migration
    // must never resurrect a signed-out credential.
    localStorage?.setItem(SESSION_REGISTRY_KEY, JSON.stringify(records));
  }
  function routeSlot() {
    const path = pathname();
    if (!path.startsWith('/mail/u/')) return null;
    const match = path.match(/^\/mail\/u\/(0|[1-9]\d*)(?:\/|$)/);
    return match ? validSlot(match[1]) : -1;
  }
  function peek() {
    return tab?.status === 'active' ? { ...tab } : null;
  }
  function matchesRegistry(identity) {
    const rows = list().filter(row => row.u === identity.u);
    // Duplicate slot identities are ambiguous, never pick the first token.
    return rows.length === 1 && isSameTabIdentity(rows[0], identity) &&
      (!identity.userId || !rows[0].userId || String(identity.userId) === String(rows[0].userId));
  }
  function current() {
    const identity = peek();
    const u = routeSlot();
    if (!identity || (u !== null && u !== identity.u) || !matchesRegistry(identity)) return null;
    return identity;
  }
  function bind(record) {
    if (!record || !matchesRegistry(record)) return null;
    const identity = { ...record, status: 'active', accountEmail: record.accountEmail || record.email };
    setTab(identity);
    return current() || identity;
  }
  function bootstrap() {
    // A fresh tab may explicitly enter a registry slot from the account URL.
    // A signed-out or stale tab pin is sticky and must not be revived.
    if (tab) return current();
    const u = routeSlot() ?? 0;
    const rows = list().filter(record => record.u === u);
    if (rows.length === 1) return bind(rows[0]);
    setTab({ status: 'invalid', u });
    return null; // Never use a legacy global token fallback.
  }
  function select(record) {
    // A rendered account picker passes the identity it displayed. Re-check it,
    // rather than following a slot that may now belong to somebody else.
    return bind(record);
  }
  function signIn({ token, email, userId, name = '', nickname = '', avatarUrl = '', roleName = '' }, { preferredSlot } = {}) {
    if (typeof token !== 'string' || !token.trim()) throw new Error('Missing session credential');
    const records = list();
    const normalizedEmail = cleanEmail(email);
    const existing = records.find(record => userId && record.userId
      ? String(record.userId) === String(userId)
      : normalizedEmail && record.email === normalizedEmail);
    let u = existing?.u ?? validSlot(preferredSlot) ?? 0;
    // A normal sign-in must not destroy an unrelated tab's account at /u/0.
    if (!existing && records.some(record => record.u === u)) {
      u = 0;
      while (records.some(record => record.u === u)) u++;
    }
    if (existing) localStorage?.setItem(REVOKED_PREFIX + existing.sessionId, '1');
    const record = { u, sessionId: randomId(), token: token.trim(), email: normalizedEmail,
      accountEmail: normalizedEmail, userId: userId ?? null, name: name || nickname || normalizedEmail, avatarUrl, roleName };
    write([...records.filter(item => item.u !== u), record]);
    setTab({ ...record, status: 'active' });
    // Retire global credential storage. No reader in either frontend uses it.
    try { localStorage?.removeItem('token'); localStorage?.removeItem('loginEmail'); } catch {}
    return { ...record };
  }
  function update(details, expected = peek()) {
    if (!isSameTabIdentity(expected, current())) return null;
    if (details.userId != null && expected.userId != null && String(details.userId) !== String(expected.userId)) return null;
    const identity = { ...expected, ...details, u: expected.u, sessionId: expected.sessionId, token: expected.token, status: 'active' };
    // accountEmail is tab-local (different tabs may select different aliases).
    const { accountEmail, status, ...shared } = identity;
    write(list().map(record => isSameTabIdentity(record, expected) ? shared : record));
    setTab(identity);
    return identity;
  }
  function invalidate(expected = peek()) {
    const wasCurrent = isSameTabIdentity(expected, peek());
    if (expected?.sessionId && expected.token) {
      // The per-identity tombstone prevents a stale registry writer from
      // restoring a removed row, and does not revoke a newly signed-in token.
      localStorage?.setItem(REVOKED_PREFIX + expected.sessionId, '1');
      write(list().filter(record => !isSameTabIdentity(record, expected)));
      try {
        if (localStorage?.getItem('token') === expected.token) {
          localStorage.removeItem('token');
          localStorage.removeItem('loginEmail');
        }
      } catch {}
    }
    if (wasCurrent || !tab) setTab({ status: 'signed-out', u: expected?.u ?? routeSlot() ?? 0 });
    return { current: wasCurrent, identity: expected };
  }
  function detach() {
    // Account selection in OAuth may leave this tab without logging out other
    // tabs that are still using the previous account.
    setTab({ status: 'signed-out', u: peek()?.u ?? routeSlot() ?? 0 });
  }
  return { list, peek, current, bootstrap, select, signIn, update, invalidate, detach,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}

export const tabSession = createSessionManager();
export const getTabIdentity = () => tabSession.peek();
export const resolveTabSession = () => tabSession.current();
export const getCurrentAuthToken = () => tabSession.current()?.token || '';
export const getCurrentLoginEmail = () => {
  const current = tabSession.current();
  return current?.accountEmail || current?.email || '';
};
export const updateCurrentIdentity = (details, expected) => tabSession.update(details, expected);
export const listSessionRecords = () => tabSession.list();
export const invalidateTabSession = identity => tabSession.invalidate(identity);
export const getLoginReturnUrl = () => `/login/?u=${tabSession.peek()?.u ?? 0}`;

export function makeIdempotencyKey() {
  return `mail-${Date.now().toString(36)}-${createIdentityId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

function stableComposeValue(form) {
  return JSON.stringify({
    accountId: form?.accountId ?? null,
    sendEmail: form?.sendEmail ?? '',
    receiveEmail: Array.isArray(form?.receiveEmail) ? form.receiveEmail : [],
    subject: form?.subject ?? '',
    content: form?.content ?? '',
    text: form?.text ?? '',
    sendType: form?.sendType ?? '',
    emailId: form?.emailId ?? 0,
    manyType: form?.manyType ?? null,
    attachments: Array.isArray(form?.attachments) ? form.attachments.map(item => ({
      filename: item?.filename || '', size: item?.size || 0, contentType: item?.contentType || '', content: item?.content || ''
    })) : [],
  });
}

export function composeFingerprint(form) {
  const input = stableComposeValue(form);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${hash >>> 0}:${input.length}`;
}

/** Preserve a key for retries of unchanged compose data; changing any send
 * field starts a new idempotency window. */
export function idempotencyKeyForCompose(form, state = new WeakMap()) {
  const fingerprint = composeFingerprint(form);
  const previous = form && typeof form === 'object' ? state.get(form) : null;
  if (previous?.fingerprint === fingerprint) return previous.key;
  const key = makeIdempotencyKey();
  if (form && typeof form === 'object') state.set(form, { fingerprint, key });
  return key;
}

export function clearComposeIdempotencyKey(form, state) {
  if (form && typeof form === 'object' && state && typeof state.delete === 'function') state.delete(form);
}

/** Bind once, then use the same snapshot for both the request and its response. */
export function attachRequestSession(config, manager = tabSession) {
  const identity = manager.current();
  config.authSession = identity;
  config.headers ||= {};
  if (identity) config.headers.Authorization = identity.token;
  else delete config.headers.Authorization;
  return config;
}
export function isCurrentResponse(config, manager = tabSession) {
  return !config.authSession || isSameTabIdentity(config.authSession, manager.current());
}
