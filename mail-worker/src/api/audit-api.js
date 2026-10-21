import app from '../hono/hono';
import result from '../model/result';
import auditService from '../service/audit-service';
import decisionNoticeService from '../service/decision-notice-service';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import { isAdminUser } from '../utils/admin-utils';
import permService from '../service/perm-service';

const ensureAuthUser = (c) => {
	const user = c.get('user');
	if (!user) {
		throw new BizError(t('authExpired'), 401);
	}
	return user;
};

const ensureAdminUser = async (c) => {
	const user = ensureAuthUser(c);
	if (!isAdminUser(c, user)) {
		let permKeys = [];
		try {
			permKeys = await permService.userPermKeys(c, user.userId);
		} catch (_) {}
		const hasPerm = permKeys.includes('*') || permKeys.includes('audit:adjudicate') || permKeys.includes('audit:*');
		if (!hasPerm) {
			throw new BizError(t('unauthorized'), 403);
		}
	}
	return user;
};

const handleAuditList = async (c) => {
	await ensureAdminUser(c);
	await auditService.seedBaselineIfEmpty(c);
	const query = c.req.method === 'GET' ? c.req.query() : (await c.req.json().catch(() => ({})));
	const data = await auditService.list(c, query);
	return c.json(result.ok(data));
};
app.get('/audit/list', handleAuditList);
app.post('/audit/list', handleAuditList);

app.post('/audit/action', async (c) => {
	await ensureAdminUser(c);
	const body = await c.req.json();
	const data = await auditService.takeAction(c, body);
	return c.json(result.ok(data));
});

app.post('/audit/adjudicate', async (c) => {
	await ensureAdminUser(c);
	const body = await c.req.json();
	const data = await auditService.adjudicate(c, body);
	return c.json(result.ok(data));
});

app.post('/audit/purge', async (c) => {
	await ensureAdminUser(c);
	const data = await auditService.purgeNonCritical(c);
	return c.json(result.ok(data));
});

app.get('/audit/circuit-breaker', async (c) => {
	await ensureAdminUser(c);
	const data = await auditService.getCircuitBreaker(c);
	return c.json(result.ok(data));
});

app.post('/audit/circuit-breaker', async (c) => {
	await ensureAdminUser(c);
	const body = await c.req.json();
	const data = await auditService.setCircuitBreaker(c, body);
	return c.json(result.ok(data));
});

// 最终处置通知 Outbox 台账与运维管理
app.get('/audit/outbox/list', async (c) => {
	await ensureAdminUser(c);
	const query = c.req.query();
	const data = await decisionNoticeService.listOutboxTasks(c, query);
	return c.json(result.ok(data));
});

app.post('/audit/outbox/retry', async (c) => {
	await ensureAdminUser(c);
	const body = await c.req.json();
	const data = await decisionNoticeService.retryOutboxTask(c, body.taskId || body.task_id);
	return c.json(result.ok(data));
});

app.post('/audit/outbox/process', async (c) => {
	await ensureAdminUser(c);
	const data = await decisionNoticeService.processOutboxBatch(c, 20);
	return c.json(result.ok(data));
});


