export const SESSION_REGISTRY_KEY = 'epo_sessions';
export const TAB_IDENTITY_KEY = 'epomail_tab_identity';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface TabIdentity {
  status: 'active' | 'signed-out' | 'invalid';
  u: number;
  sessionId: string;
  token: string;
  email: string;
  accountEmail?: string;
  userId?: string | number | null;
  name?: string;
  avatarUrl?: string;
  roleName?: string;
}

const getStorage = (name: 'localStorage' | 'sessionStorage'): StorageLike | null => {
  try { return window[name]; } catch { return null; }
};
const normalizeEmail = (email: unknown) => typeof email === 'string' ? email.trim().toLowerCase() : '';
const normalizeSlot = (value: unknown) => {
  const slot = Number(value);
  return Number.isSafeInteger(slot) && slot >= 0 ? slot : null;
};
const newId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export function readTabIdentity(session: StorageLike | null = getStorage('sessionStorage')): TabIdentity | null {
  try {
    const value = JSON.parse(session?.getItem(TAB_IDENTITY_KEY) || 'null');
    if (!value || value.status !== 'active' || !value.sessionId || !value.token) return null;
    const u = normalizeSlot(value.u);
    if (u === null) return null;
    return { ...value, u, email: normalizeEmail(value.email) } as TabIdentity;
  } catch { return null; }
}

export function readSlots(local: StorageLike | null = getStorage('localStorage')): TabIdentity[] {
  try {
    const rows = JSON.parse(local?.getItem(SESSION_REGISTRY_KEY) || '[]');
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((row: Partial<TabIdentity>) => {
      const u = normalizeSlot(row?.u);
      if (u === null || !row?.token) return [];
      const sessionId = row.sessionId || `legacy-${u}`;
      if (local?.getItem(`epo_session_revoked:${sessionId}`)) return [];
      return [{ ...row, u, sessionId, email: normalizeEmail(row.email) } as TabIdentity];
    });
  } catch { return []; }
}

function writeSlots(rows: TabIdentity[], local: StorageLike | null): void {
  local?.setItem(SESSION_REGISTRY_KEY, JSON.stringify(rows));
}

export function persistLoginSession({
  token, email, userId = null, name = '', avatarUrl = '', roleName = '', preferredSlot,
  local = getStorage('localStorage'), session = getStorage('sessionStorage'),
}: {
  token: string;
  email?: string;
  userId?: string | number | null;
  name?: string;
  avatarUrl?: string;
  roleName?: string;
  preferredSlot?: number;
  local?: StorageLike | null;
  session?: StorageLike | null;
}): TabIdentity {
  if (!token?.trim()) throw new Error('Missing session credential');
  const slots = readSlots(local);
  const normalizedEmail = normalizeEmail(email);
  const existing = slots.find(row => userId != null && row.userId != null
    ? String(row.userId) === String(userId)
    : !!normalizedEmail && row.email === normalizedEmail);
  let u = existing?.u ?? normalizeSlot(preferredSlot) ?? 0;
  if (!existing && slots.some(row => row.u === u)) {
    u = 0;
    while (slots.some(row => row.u === u)) u += 1;
  }
  const record: TabIdentity = {
    status: 'active', u, sessionId: newId(), token: token.trim(), email: normalizedEmail,
    accountEmail: normalizedEmail, userId, name: name || normalizedEmail, avatarUrl, roleName,
  };
  writeSlots([...slots.filter(row => row.u !== u), record], local);
  session?.setItem(TAB_IDENTITY_KEY, JSON.stringify(record));
  // Never leave an origin-wide credential for the main application to read.
  local?.removeItem('token');
  local?.removeItem('loginEmail');
  return record;
}

export function selectSessionSlot(record: TabIdentity, {
  local = getStorage('localStorage'), session = getStorage('sessionStorage'),
}: { local?: StorageLike | null; session?: StorageLike | null } = {}): TabIdentity | null {
  const current = readSlots(local).find(row => row.u === record.u && row.sessionId === record.sessionId && row.token === record.token);
  if (!current) return null;
  const next = { ...current, status: 'active' as const };
  session?.setItem(TAB_IDENTITY_KEY, JSON.stringify(next));
  return next;
}
