import app from '../hono/hono';
import result from '../model/result';
import settingService from '../service/setting-service';
import s3Service from '../service/s3-service';
import dbService from '../service/db-service';
import storageScanService from '../service/storage-scan-service';
import userContext from "../security/user-context";
import aiService from '../service/ai-service';
import rbacGuard from '../service/rbac-guard-service.js';
import byoStorageMigrationService from '../service/byo-storage-migration-service.js';
import emailKeyMigrationService from '../service/email-key-migration-service.js';
import BizError from '../error/biz-error.js';
import { readJsonObject } from '../utils/request-body.js';

const handleSetSetting = async (c) => {
	await settingService.set(c, await readJsonObject(c));
	return c.json(result.ok());
};
app.put('/setting/set', handleSetSetting);
app.post('/setting/set', handleSetSetting);

app.get('/setting/query', async (c) => {
	const setting = await settingService.get(c);
	return c.json(result.ok(setting));
});

app.get('/setting/websiteConfig', async (c) => {
	const setting = await settingService.websiteConfig(c);
	return c.json(result.ok(setting));
})

app.put('/setting/setBackground', async (c) => {
	const key = await settingService.setBackground(c, await readJsonObject(c));
	return c.json(result.ok(key));
});

app.delete('/setting/deleteBackground', async (c) => {
	await settingService.deleteBackground(c);
	return c.json(result.ok());
});

app.put('/setting/setBlacklist', async (c) => {
	const setting = await settingService.setBlacklist(c, await readJsonObject(c));
	return c.json(result.ok(setting));
});

app.post('/setting/sendWelcomeEmail', async (c) => {
	const res = await settingService.sendWelcomeEmailToAll(c, await readJsonObject(c));
	return c.json(result.ok(res));
});

app.post('/setting/sendGlobalEmail', async (c) => {
	const res = await settingService.sendGlobalBroadcastEmail(c, await readJsonObject(c));
	return c.json(result.ok(res));
});

app.get('/setting/globalEmailConfig', async (c) => {
	const res = await settingService.getGlobalEmailConfig(c);
	return c.json(result.ok(res));
});

app.post('/setting/s3/test', async (c) => {
	const body = await readJsonObject(c);
	const testResult = await s3Service.testConnection(body);
	return c.json(result.ok(testResult));
});

app.get('/setting/db/status', async (c) => {
	const status = await dbService.getDbStatus(c);
	return c.json(result.ok(status));
});

app.post('/setting/db/test', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const testResult = await dbService.testConnection(c, body);
	return c.json(result.ok(testResult));
});

app.post('/setting/storage/scan', async (c) => {
	const scanResult = await storageScanService.scan(c);
	return c.json(result.ok(scanResult));
});

app.post('/setting/storage/cleanup', async (c) => {
	const cleanResult = await storageScanService.cleanup(c);
	return c.json(result.ok(cleanResult));
});

app.post('/setting/storage/orphans/cleanup', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const cleanResult = await storageScanService.cleanupOrphans(c, body);
	return c.json(result.ok(cleanResult));
});

app.post('/setting/ai/test', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const testResult = await aiService.testConnection(c, body);
	return c.json(result.ok(testResult));
});

app.post('/setting/ai/models', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const modelsResult = await aiService.fetchModels(c, body);
	return c.json(result.ok(modelsResult));
});

app.get('/setting/security/encryption-status', async (c) => {
	await rbacGuard.assertAdmin(c, userContext.getUserId(c));
	const userIdParam = c.req.query('userId');
	const parsedUserId = userIdParam ? Number(userIdParam) : null;
	const userId = Number.isInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : null;
	const sampleLimit = Math.max(1, Math.min(Number(c.req.query('sampleLimit')) || 20, 50));
	const [emailKeys, byoStorage] = await Promise.all([
		emailKeyMigrationService.preDeployCheck(c, { userId, sampleLimit }),
		byoStorageMigrationService.preDeployCheck(c)
	]);
	return c.json(result.ok({ emailKeys, byoStorage }));
});

app.post('/setting/security/email-key/migrate', async (c) => {
	await rbacGuard.assertAdmin(c, userContext.getUserId(c));
	const body = await c.req.json().catch(() => ({}));
	const userId = body?.userId ? Number(body.userId) : null;
	const limit = Math.max(1, Math.min(Number(body?.limit) || 100, 500));
	const dryRun = body?.dryRun === true;
	const requireDedicatedKey = body?.requireDedicatedKey !== false;
	const migration = await emailKeyMigrationService.migrateBatch(c, {
		userId: Number.isInteger(userId) && userId > 0 ? userId : null,
		limit,
		dryRun,
		requireDedicatedKey
	});
	const verification = await emailKeyMigrationService.postDeployVerify(c, {
		userId: Number.isInteger(userId) && userId > 0 ? userId : null
	});
	return c.json(result.ok({ migration, verification }));
});

app.post('/setting/security/email-key/rollback', async (c) => {
	await rbacGuard.assertAdmin(c, userContext.getUserId(c));
	const body = await c.req.json().catch(() => ({}));
	if (body?.confirmRollback !== true) {
		throw new BizError('Rollback requires explicit confirmRollback: true confirmation', 400, 'rollback_confirmation_required');
	}
	const userId = body?.userId ? Number(body.userId) : null;
	const emailIds = Array.isArray(body?.emailIds) ? body.emailIds.map(Number).filter(id => Number.isInteger(id) && id > 0) : null;
	const rollback = await emailKeyMigrationService.rollbackMigration(c, {
		emailIds: emailIds?.length ? emailIds : null,
		userId: Number.isInteger(userId) && userId > 0 ? userId : null,
		targetDomain: body?.targetDomain
	});
	return c.json(result.ok(rollback));
});

app.post('/setting/security/byo-storage/migrate', async (c) => {
	await rbacGuard.assertAdmin(c, userContext.getUserId(c));
	const body = await c.req.json().catch(() => ({}));
	const dryRun = body?.dryRun === true;
	const userIds = Array.isArray(body?.userIds) ? body.userIds.map(Number).filter(id => Number.isInteger(id) && id > 0) : null;
	const migration = await byoStorageMigrationService.migrateBatch(c, { dryRun, userIds });
	const verification = await byoStorageMigrationService.postDeployVerify(c);
	return c.json(result.ok({ migration, verification }));
});

app.post('/setting/security/byo-storage/rollback', async (c) => {
	await rbacGuard.assertAdmin(c, userContext.getUserId(c));
	const body = await c.req.json().catch(() => ({}));
	if (body?.confirmRollback !== true) {
		throw new BizError('Rollback requires explicit confirmRollback: true confirmation', 400, 'rollback_confirmation_required');
	}
	const userIds = Array.isArray(body?.userIds) ? body.userIds.map(Number).filter(id => Number.isInteger(id) && id > 0) : null;
	const rollback = await byoStorageMigrationService.rollbackMigration(c, {
		userIds,
		targetMode: body?.targetMode,
		targetKeyDomain: body?.targetKeyDomain
	});
	return c.json(result.ok(rollback));
});


