// The pending operation survives a reload in this tab. Only a digest and
// random request ID are retained, never the administrator's message.
const pending = new Map();

export async function submitGlobalBroadcast(payload, { identity, post, storage, newId = () => crypto.randomUUID() }) {
  const owner = identity();
  if (!owner) throw new Error('Missing active administrator session');
  const storageKey = 'epomail:global-broadcast:' + owner;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  let prior = pending.get(storageKey);
  try { prior = JSON.parse(storage?.getItem(storageKey) || 'null') || prior; } catch (_) {}
  const entry = prior?.fingerprint === fingerprint ? prior : { fingerprint, operationId: newId() };
  pending.set(storageKey, entry);
  try { storage?.setItem(storageKey, JSON.stringify(entry)); } catch (_) {}
  for (;;) {
    if (identity() !== owner) throw new Error('Administrator session changed');
    const result = await post({ ...payload, operationId: entry.operationId });
    if (result.complete === false) continue;
    if (pending.get(storageKey)?.operationId === entry.operationId) {
      pending.delete(storageKey);
      try { storage?.removeItem(storageKey); } catch (_) {}
    }
    return result;
  }
}
