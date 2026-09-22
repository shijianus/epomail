import r2Service from '../service/r2-service';
import app from '../hono/hono';
import result from '../model/result';

app.get('/oss/*', async (c) => {
	const key = c.req.path.split('/oss/')[1];
	const obj = await r2Service.getObj(c, key);

	if (!obj) {
		return c.text('Object Not Found', 404);
	}

	if (obj instanceof Response) {
		return obj;
	}

	const rawType = (obj.httpMetadata?.contentType || '').toLowerCase().trim();
	const SAFE_INLINE_IMAGE_TYPES = [
		'image/png', 'image/jpeg', 'image/jpg', 'image/gif',
		'image/webp', 'image/avif', 'image/bmp', 'image/x-icon'
	];

	let finalType = 'application/octet-stream';
	let finalDisposition = 'attachment';

	if (SAFE_INLINE_IMAGE_TYPES.includes(rawType)) {
		finalType = rawType;
		finalDisposition = obj.httpMetadata?.contentDisposition?.startsWith('inline') ? 'inline' : 'attachment';
	}

	return new Response(obj.body, {
		headers: {
			'Content-Type': finalType,
			'Content-Disposition': finalDisposition,
			'Cache-Control': obj.httpMetadata?.cacheControl || 'public, max-age=86400',
			'X-Content-Type-Options': 'nosniff',
			'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
		}
	});
});

app.get('/oss-url/*', async (c) => {
	const key = c.req.path.split('/oss-url/')[1];
	const downloadUrl = await r2Service.getDownloadUrl(c, key);
	return c.json(result.ok({ url: downloadUrl }));
});

