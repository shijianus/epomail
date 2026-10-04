import app from '../hono/hono';
import result from '../model/result';
import auditService from '../service/audit-service';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const ensureAuthUser = (c) => {
	const user = c.get('user');
	if (!user) {
		throw new BizError(t('authExpired'), 401);
	}
	return user;
};

const handleAuditList = async (c) => {
	ensureAuthUser(c);
	await auditService.seedBaselineIfEmpty(c);
	const query = c.req.method === 'GET' ? c.req.query() : (await c.req.json().catch(() => ({})));
	const data = await auditService.list(c, query);
	return c.json(result.ok(data));
};
app.get('/audit/list', handleAuditList);
app.post('/audit/list', handleAuditList);

app.post('/audit/action', async (c) => {
	ensureAuthUser(c);
	const body = await c.req.json();
	const data = await auditService.takeAction(c, body);
	return c.json(result.ok(data));
});

app.post('/audit/adjudicate', async (c) => {
	ensureAuthUser(c);
	const body = await c.req.json();
	const data = await auditService.adjudicate(c, body);
	return c.json(result.ok(data));
});

app.post('/audit/purge', async (c) => {
	ensureAuthUser(c);
	const data = await auditService.purgeNonCritical(c);
	return c.json(result.ok(data));
});

