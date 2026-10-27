import r2Service from '../service/r2-service';
import app from '../hono/hono';
import result from '../model/result';
import attService from '../service/att-service';
import userContext from '../security/user-context';
import { normalizeObjectKey } from '../utils/object-key-utils';
import { isAdminUser } from '../utils/admin-utils';
import { buildSignedObjectUrl, verifyObjectAccess } from '../utils/object-token';

function isPublicStaticKey(key, userId) {
	if (!key.startsWith('static/')) return false;
	if (!key.startsWith('static/avatar/')) return true;
	return key.startsWith(`static/avatar/${userId}/`);
}

app.get('/oss/*', async (c) => {
	const key = normalizeObjectKey(c.req.path.split('/oss/')[1]);
	if (!key) {
		return c.text('Object Not Found', 404);
	}

	// static/ assets (avatars, backgrounds) are intentionally public. Every
	// attachment read requires a short-lived capability signature in addition
	// to the object-key namespace check.
	let ownerUserId = null;
	if (key.startsWith('attachments/')) {
		const access = await verifyObjectAccess(c, key, new URL(c.req.url));
		if (!access) {
			return c.text('Object Not Found', 404);
		}
		ownerUserId = access.userId || null;
	}

	const response = await r2Service.toObjResponse(c, key, ownerUserId);
	if (!response) {
		return c.text('Object Not Found', 404);
	}
	return response;
});

app.get('/oss-url/*', async (c) => {
	const key = normalizeObjectKey(c.req.path.split('/oss-url/')[1]);
	if (!key) {
		return c.json(result.fail('Object Not Found', 404));
	}

	const user = userContext.getUser(c);
	const userId = user.userId;
	const admin = isAdminUser(c, user);

	let ownerUserId = null;
	if (key.startsWith('attachments/')) {
		const owners = await attService.findOwnedKeyOwners(c, [key], admin ? null : userId);
		if (!owners.has(key)) {
			return c.json(result.fail('Object Not Found', 404));
		}
		ownerUserId = owners.get(key);
	} else if (!isPublicStaticKey(key, userId)) {
		return c.json(result.fail('Object Not Found', 404));
	}

	const downloadUrl = key.startsWith('attachments/')
		? await buildSignedObjectUrl(c, key, { userId: ownerUserId, ttlSeconds: 300 })
		: await r2Service.getDownloadUrl(c, key, null, ownerUserId);
	if (!downloadUrl) {
		return c.json(result.fail('Object Not Found', 404));
	}
	return c.json(result.ok({ url: downloadUrl }));
});

/**
 * Sign a batch of keys for the current mailbox view. This is what lets inline
 * email images keep working after anonymous attachment URLs are removed: the
 * client asks for short-lived URLs only for keys it actually owns (or, for an
 * administrator, keys that exist in the attachment index).
 */
app.post('/oss-url/batch', async (c) => {
	const user = userContext.getUser(c);
	const userId = user.userId;
	const admin = isAdminUser(c, user);

	const body = await c.req.json().catch(() => ({}));
	const requested = Array.isArray(body?.keys) ? body.keys.slice(0, 200) : [];
	const uniqueKeys = [...new Set(requested
		.filter(key => typeof key === 'string')
		.map(key => normalizeObjectKey(key))
		.filter(Boolean))];

	const attachmentKeys = uniqueKeys.filter(key => key.startsWith('attachments/'));
	const owners = await attService.findOwnedKeyOwners(c, attachmentKeys, admin ? null : userId);

	const urls = {};
	await Promise.all(uniqueKeys.map(async (key) => {
		if (key.startsWith('attachments/')) {
			if (!owners.has(key)) return;
			urls[key] = await buildSignedObjectUrl(c, key, {
				userId: owners.get(key),
				ttlSeconds: 3600
			});
			return;
		}
		if (isPublicStaticKey(key, userId)) {
			urls[key] = `/oss/${key}`;
		}
	}));

	return c.json(result.ok({ urls }));
});
