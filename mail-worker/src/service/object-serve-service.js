import r2Service from './r2-service';
import { normalizeObjectKey } from '../utils/object-key-utils';
import { verifyObjectAccess } from '../utils/object-token';

/**
 * Single object-serving path shared by the Worker root routes (/oss, /static,
 * /attachments) and the Hono /oss routes. Keeping key normalization,
 * capability verification and response-header sanitization here prevents the
 * two entry points from drifting into different security policies.
 *
 * Returns null when the object must not be served; callers answer with the
 * uniform 404 body so key existence is never disclosed.
 */
export async function serveObject(c, key, url) {
	const safeKey = normalizeObjectKey(key);
	if (!safeKey) {
		return null;
	}

	let ownerUserId = null;
	if (safeKey.startsWith('attachments/')) {
		const access = await verifyObjectAccess(c, safeKey, url);
		if (!access) {
			return null;
		}
		ownerUserId = access.userId || null;
	}

	return r2Service.toObjResponse(c, safeKey, ownerUserId);
}

export function objectNotFound() {
	return new Response('Object Not Found', {
		status: 404,
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	});
}

export default { serveObject, objectNotFound };
