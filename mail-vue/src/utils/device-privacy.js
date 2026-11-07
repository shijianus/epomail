import { tabSession, TAB_IDENTITY_KEY } from './tab-session.js';

// Browser storage is origin-scoped. Still use an application allowlist so a
// sibling application on the same origin keeps its own storage and databases.
export const DRAFT_DATABASE_REGISTRY = 'epo_draft_databases';
export const DEVICE_CLEAR_SIGNAL = 'epo_device_clear';
const LOCAL_KEYS = new Set([
  'token', 'loginEmail', 'email', 'writer', 'ui', 'user', 'account', 'setting',
  'draft', 'role', 'send', 'multiAccountEnabled', 'all-email-params', 'user-params',
  'auth_expired_msg', 'DEV_TRUST'
]);
const closeHandlers = new Set();
let localSessionEnded = false;
export const isLocalSessionEnded = () => localSessionEnded;

export function isAppStorageKey(key) {
  return LOCAL_KEYS.has(key) || /^(?:epo_|epomail_|dev_trust(?:$|[:_]))/i.test(key);
}

function browserStorage(name) {
  try { return globalThis[name]; } catch { return null; }
}
export function createPrivateStorage(storage = browserStorage('localStorage')) {
  return {
    getItem: key => storage?.getItem(key) ?? null,
    setItem: (key, value) => {
      if (!localSessionEnded || !isAppStorageKey(key)) storage?.setItem(key, value);
    }
  };
}

function readJson(storage, key, fallback) {
  try { return JSON.parse(storage?.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function removeKeys(storage, predicate) {
  if (!storage) return false;
  let complete = true;
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) {
      if (!key || !predicate(key)) continue;
      try { storage.removeItem(key); } catch { complete = false; }
    }
  } catch { complete = false; }
  return complete;
}

export function rememberDraftDatabase(name, storage = browserStorage('localStorage')) {
  if (!name || !storage) return;
  try {
    const previous = readJson(storage, DRAFT_DATABASE_REGISTRY, []);
    const names = new Set(Array.isArray(previous) ? previous.filter(item => typeof item === 'string') : []);
    names.add(name);
    storage.setItem(DRAFT_DATABASE_REGISTRY, JSON.stringify([...names]));
  } catch { /* Enumeration can recover legacy databases when storage is full. */ }
}

export function registerDatabaseCloser(close) {
  closeHandlers.add(close);
  return () => closeHandlers.delete(close);
}
export function closeLocalDatabases() {
  for (const close of closeHandlers) close();
}

/** Ordinary logout: clear sensitive caches, not drafts or other account slots. */
export function clearCurrentSession({
  localStorage = browserStorage('localStorage'),
  sessionStorage = browserStorage('sessionStorage'),
  email,
  preserveEmail = false,
  sessionManager = tabSession,
  session = sessionManager.peek(),
} = {}) {
  // A request with no captured identity must not sign out a later login either.
  if (!session && sessionManager.peek()) return false;
  let legacyToken = null;
  let legacyEmail = '';
  try {
    legacyToken = localStorage?.getItem('token');
    legacyEmail = localStorage?.getItem('loginEmail') || '';
  } catch {}
  const result = sessionManager.invalidate(session);
  // A late 401 from a previous login must not close/reset the new session.
  if (session && !result.current) return false;
  localSessionEnded = true;
  const savedEmail = email || session?.accountEmail || session?.email || legacyEmail;
  const retireLegacyCredential = !session || !legacyToken || legacyToken === session.token;
  const sensitiveKeys = new Set(['email', 'writer', 'ui', 'user', 'account', 'all-email-params', 'user-params', 'epomail_msg_reactions']);
  const localComplete = removeKeys(localStorage, key => sensitiveKeys.has(key) ||
    /^(?:epo_trusted_device_token|dev_trust(?:$|[:_]))/i.test(key) ||
    // Retire matching pre-tab credentials too, including an unpinned legacy
    // login. Never remove a different account's shared credential by slot.
    (retireLegacyCredential && key === 'token' && localStorage.getItem(key) === legacyToken) ||
    (retireLegacyCredential && key === 'loginEmail' && localStorage.getItem(key) === legacyEmail));
  // Keep the signed-out tombstone so reload cannot revive epo_sessions.
  const sessionComplete = removeKeys(sessionStorage, key => isAppStorageKey(key) && key !== TAB_IDENTITY_KEY);
  if (preserveEmail && savedEmail) {
    try { sessionStorage?.setItem('epomail_login_email', savedEmail); } catch {}
  }
  try { closeLocalDatabases(); } catch {}
  return localComplete && sessionComplete;
}

export function installDeviceCleanupListener(target = globalThis.window) {
  if (!target?.addEventListener) return;
  target.addEventListener('storage', event => {
    if (event.key !== DEVICE_CLEAR_SIGNAL || !event.newValue) return;
    localSessionEnded = true;
    try { closeLocalDatabases(); } catch {}
    removeKeys(browserStorage('sessionStorage'), isAppStorageKey);
    target.location.replace('/login/');
  });
}

function requestFailure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// Inspect only schema, never records. Abort upgrade so a disappearing database
// is not accidentally recreated during discovery.
export function isDraftDatabase(indexedDB, name, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let request;
    let done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(requestFailure('blocked')), timeoutMs);
    try {
      request = indexedDB.open(name);
      request.onupgradeneeded = () => {
        request.transaction.abort();
        finish(null, false);
      };
      request.onerror = () => finish(requestFailure('database'));
      request.onsuccess = () => {
        const database = request.result;
        if (done) { database.close(); return; }
        try {
          const tables = [...database.objectStoreNames].sort();
          let owned = tables.length === 2 && tables[0] === 'att' && tables[1] === 'draft';
          if (owned) {
            const transaction = database.transaction(['draft', 'att'], 'readonly');
            const draft = transaction.objectStore('draft');
            const att = transaction.objectStore('att');
            owned = draft.keyPath === 'draftId' && draft.autoIncrement === true && att.keyPath === 'draftId';
          }
          finish(null, owned);
        } catch { finish(requestFailure('database')); }
        finally { database.close(); }
      };
    } catch { finish(requestFailure('database')); }
  });
}

export function deleteLocalDatabase(indexedDB, name, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let blocked = false;
    let finished = false;
    const finish = error => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => finish(requestFailure(blocked ? 'blocked' : 'database')), timeoutMs);
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onblocked = () => { blocked = true; };
      request.onerror = () => finish(requestFailure('database'));
      request.onsuccess = () => finish();
    } catch { finish(requestFailure('database')); }
  });
}

export function isAppCacheName(name, origin) {
  return /^(?:epomail|epo)-/.test(name) || Boolean(origin &&
    /^workbox-(?:precache-v\d+|runtime)-/.test(name) && name.endsWith(`${origin}/`));
}

/** Must be called only after explicit consent to erase ALL this site's accounts. */
export async function clearDeviceData({
  localStorage = browserStorage('localStorage'),
  sessionStorage = browserStorage('sessionStorage'),
  indexedDB = browserStorage('indexedDB'),
  caches = browserStorage('caches'),
  origin = globalThis.location?.origin,
  listDatabaseNames,
  timeoutMs = 4000
} = {}) {
  const result = { complete: true, blocked: 0, failed: 0, deletedDatabases: 0 };
  const failedNames = [];
  const rememberRetry = name => {
    failedNames.push(name);
    // Preserve inventory immediately, even if the tab closes before a blocked
    // delete completes. The registry never contains credentials or records.
    rememberDraftDatabase(name, localStorage);
  };
  const remembered = readJson(localStorage, DRAFT_DATABASE_REGISTRY, []);
  const names = new Set(Array.isArray(remembered) ? remembered.filter(name => typeof name === 'string') : []);
  const sessions = readJson(localStorage, 'epo_sessions', []);
  for (const session of Array.isArray(sessions) ? sessions : []) {
    if (typeof session?.email === 'string' && session.email) names.add(session.email);
  }
  try {
    const email = localStorage?.getItem('loginEmail');
    if (email) names.add(email);
  } catch {}
  const registered = new Set(names);

  // Capture the inventory before another tab receives the sign-out signal.
  try {
    if (indexedDB?.databases) {
      for (const database of await indexedDB.databases()) if (typeof database.name === 'string') names.add(database.name);
    } else if (listDatabaseNames) {
      for (const name of await listDatabaseNames()) names.add(name);
      // Legacy databases cannot be fully enumerated on this browser.
      result.failed++;
    } else if (indexedDB) {
      result.failed++;
    }
  } catch { result.failed++; }

  localSessionEnded = true;
  try { closeLocalDatabases(); } catch { result.failed++; }
  try {
    localStorage?.removeItem('token');
    localStorage?.removeItem('epo_sessions');
    localStorage?.setItem(DEVICE_CLEAR_SIGNAL, `${Date.now()}-${Math.random()}`);
  } catch { result.failed++; }

  if (indexedDB) {
    const candidates = [...names].filter(name => registered.has(name) || /^[^\s@]+@[^\s@]+$/.test(name) || name === 'undefined');
    await Promise.all(candidates.map(async name => {
      try {
        if (await isDraftDatabase(indexedDB, name, timeoutMs)) {
          await deleteLocalDatabase(indexedDB, name, timeoutMs);
          result.deletedDatabases++;
        }
      } catch (error) {
        rememberRetry(name);
        if (error.code === 'blocked') result.blocked++; else result.failed++;
      }
    }));
  } else {
    result.failed++;
  }

  if (caches) {
    try {
      await Promise.all((await caches.keys()).filter(name => isAppCacheName(name, origin)).map(name => caches.delete(name)));
    } catch { result.failed++; }
  }
  if (!removeKeys(localStorage, isAppStorageKey)) result.failed++;
  if (!removeKeys(sessionStorage, isAppStorageKey)) result.failed++;
  // Keep failed names discoverable for a retry; never report a partial erasure
  // as complete. No database contents or credentials are included in the result.
  for (const name of failedNames) rememberDraftDatabase(name, localStorage);
  result.complete = result.blocked === 0 && result.failed === 0;
  return result;
}

export function deleteDraftsAndAttachments(database, draftIds) {
  const ids = Array.isArray(draftIds) ? draftIds : [draftIds];
  return database.transaction('rw', database.draft, database.att, async () => {
    await database.draft.bulkDelete(ids);
    await database.att.bulkDelete(ids);
  });
}
