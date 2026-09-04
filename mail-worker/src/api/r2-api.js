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

	return new Response(obj.body, {
		headers: {
			'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
			'Content-Disposition': obj.httpMetadata?.contentDisposition || null,
			'Cache-Control': obj.httpMetadata?.cacheControl || 'public, max-age=86400'
		}
	});
});

app.get('/oss-url/*', async (c) => {
	const key = c.req.path.split('/oss-url/')[1];
	const downloadUrl = await r2Service.getDownloadUrl(c, key);
	return c.json(result.ok({ url: downloadUrl }));
});

