/**
 * Storage object key policy.
 *
 * The same KV namespace is used for sessions, settings and object storage.
 * Any public object route must therefore refuse keys that are not explicitly
 * provisioned as stored objects. Without this guard `/oss/auth-uid:1` would
 * return the session-token bundle and `/oss/setting:` would return the full
 * settings document (including provider secrets).
 */

const ALLOWED_PREFIXES = ['attachments/', 'static/'];
const MAX_KEY_LENGTH = 512;
const SAFE_KEY_PATTERN = /^[A-Za-z0-9._/-]+$/;

function hasTraversal(key) {
	return key.split('/').some(segment => segment === '..' || segment === '.');
}

export function isAllowedObjectKey(key) {
	if (typeof key !== 'string') return false;

	const value = key.trim();
	if (!value || value.length > MAX_KEY_LENGTH) return false;
	if (value.startsWith('/') || value.includes('\\') || value.includes('%')) return false;
	if (value.includes(':') || value.includes('\0')) return false;
	if (!SAFE_KEY_PATTERN.test(value)) return false;
	if (hasTraversal(value)) return false;

	return ALLOWED_PREFIXES.some(prefix => value.length > prefix.length && value.startsWith(prefix));
}

export function normalizeObjectKey(key) {
	return isAllowedObjectKey(key) ? key.trim() : null;
}

export default { isAllowedObjectKey, normalizeObjectKey };
