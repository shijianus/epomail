import r2Service from './r2-service';
import { normalizeObjectKey } from '../utils/object-key-utils';
import { verifyObjectAccess } from '../utils/object-token';
import { getUserDb, getMailDb } from '../utils/db-accessor.js';

/**
 * Single read path for every worker-hosted object URL (`/oss/*`,
 * `/api/oss/*` and the legacy `/attachments/*` alias).
 *
 * The same verification rules must apply on all of them: the key allowlist is
 * enforced first, then `attachments/*` additionally requires a capability
 * signature bound to the key, expiry and owning user. `static/*` stays public
 * by policy. Returns null when the object must not be served, so callers can
 * respond with a uniform 404 that does not disclose whether the key exists.
 */
export async function readObjectForRequest(c, key, url) {
	const safeKey = normalizeObjectKey(key);
	if (!safeKey) return null;

	let ownerUserId = null;
	let filename = null;
	if (safeKey.startsWith('attachments/')) {
		const access = await verifyObjectAccess(c, safeKey, url);
		if (!access) return null;
		ownerUserId = access.userId || null;
		// A capability signed before a ban/deletion must not outlive the account
		// state. This is the authoritative D1 check; KV token caches are not.
		if (ownerUserId) {
			const owner = await getUserDb(c).prepare(
				'SELECT status, is_del FROM user WHERE user_id = ? LIMIT 1'
			).bind(ownerUserId).first();
			if (!owner || Number(owner.status) !== 0 || Number(owner.is_del) !== 0) return null;
			try {
				const attachment = await getMailDb(c).prepare(
					'SELECT filename FROM attachments WHERE key = ? AND user_id = ? LIMIT 1'
				).bind(safeKey, ownerUserId).first();
				filename = attachment?.filename || null;
			} catch (_) {
				// A legacy/partial schema must not turn a valid object read into 500.
			}
		}
	}

	return await r2Service.toObjResponse(c, safeKey, ownerUserId, filename);
}

export default { readObjectForRequest };
