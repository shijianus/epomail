import app from '../hono/hono';
import emailService from '../service/email-service';
import result from '../model/result';
import userContext from '../security/user-context';
import { isAdminUser } from '../utils/admin-utils';
import BizError from '../error/biz-error';

app.get('/allEmail/list', async (c) => {
	const data = await emailService.allList(c, c.req.query());
	return c.json(result.ok(data));
})

app.get('/allEmail/outbound/unknown', async (c) => {
	const data = await emailService.listUnknownOutbound(c, c.req.query());
	return c.json(result.ok(data));
})

app.post('/allEmail/outbound/resolve', async (c) => {
	const user = userContext.getUser(c);
	if (!isAdminUser(c, user)) {
		throw new BizError('Only the site owner may resolve an ambiguous outbound send', 403, 'admin_required');
	}
	const body = await c.req.json().catch(() => ({}));
	const data = await emailService.resolveUnknownOutbound(c, body);
	return c.json(result.ok(data));
})

app.delete('/allEmail/delete', async (c) => {
	const list = await emailService.physicsDelete(c, c.req.query());
	return c.json(result.ok(list));
})

app.delete('/allEmail/batchDelete', async (c) => {
	await emailService.batchDelete(c, c.req.query());
	return c.json(result.ok());
})

app.get('/allEmail/latest', async (c) => {
	const list = await emailService.allEmailLatest(c, c.req.query());
	return c.json(result.ok(list));
})
