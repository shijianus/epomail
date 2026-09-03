import app from '../hono/hono';
import result from '../model/result';
import oauthAppService from '../service/oauth-app-service';

app.get('/admin/oauthApp/list', async (c) => {
	const list = await oauthAppService.list(c);
	return c.json(result.ok(list));
});

app.post('/admin/oauthApp/add', async (c) => {
	const params = await c.req.json();
	const created = await oauthAppService.add(c, params);
	return c.json(result.ok(created));
});

app.put('/admin/oauthApp/update', async (c) => {
	const params = await c.req.json();
	const updated = await oauthAppService.update(c, params);
	return c.json(result.ok(updated));
});

app.post('/admin/oauthApp/resetSecret', async (c) => {
	const { id } = await c.req.json();
	const resetRes = await oauthAppService.resetSecret(c, id);
	return c.json(result.ok(resetRes));
});

app.put('/admin/oauthApp/status', async (c) => {
	const { id, status } = await c.req.json();
	const res = await oauthAppService.setStatus(c, id, status);
	return c.json(result.ok(res));
});

app.delete('/admin/oauthApp/delete', async (c) => {
	const { id } = await c.req.json();
	const res = await oauthAppService.delete(c, id);
	return c.json(result.ok(res));
});

export default app;
