import r2Service from '../service/r2-service';
import app from '../hono/hono';
import result from '../model/result';
import attService from '../service/att-service';
import userContext from '../security/user-context';
import { normalizeObjectKey } from '../utils/object-key-utils';
import { safeObjectHeaders } from '../utils/object-response.js';

app.get('/oss/*', async (c) => {
	const key = c.req.path.split('/oss/')[1];
	const obj = await r2Service.getObj(c, key);

	if (!obj) {
		return c.text('Object Not Found', 404);
	}

	// R2 returns an object with httpMetadata, KV/S3 return a Response. In both
	// cases the stored Content-Type is untrusted and must not be echoed as-is.
	if (obj instanceof Response) {
		return new Response(obj.body, {
			headers: safeObjectHeaders({
				contentType: obj.headers.get('Content-Type'),
				contentDisposition: obj.headers.get('Content-Disposition'),
				cacheControl: obj.headers.get('Cache-Control')
			})
		});
	}

	return new Response(obj.body, {
		headers: safeObjectHeaders({
			contentType: obj.httpMetadata?.contentType,
			contentDisposition: obj.httpMetadata?.contentDisposition,
			cacheControl: obj.httpMetadata?.cacheControl
		})
	});
});

app.get('/oss-url/*', async (c) => {
	const key = normalizeObjectKey(c.req.path.split('/oss-url/')[1]);
	if (!key) {
		return c.json(result.fail('Object Not Found', 404));
	}

	const userId = userContext.getUserId(c);
	const isAttachment = key.startsWith('attachments/');
	const isOwnAvatar = key.startsWith(`static/avatar/${userId}/`);
	const isPublicStatic = key.startsWith('static/') && !key.startsWith('static/avatar/');

	if (isAttachment && !(await attService.existsForUser(c, key, userId))) {
		return c.json(result.fail('Object Not Found', 404));
	}
	if (!isAttachment && !isOwnAvatar && !isPublicStatic) {
		return c.json(result.fail('Object Not Found', 404));
	}

	const downloadUrl = await r2Service.getDownloadUrl(c, key);
	if (!downloadUrl) {
		return c.json(result.fail('Object Not Found', 404));
	}
	return c.json(result.ok({ url: downloadUrl }));
});
