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
import oauthAppService from '../service/oauth-app-service.js';
import BizError from '../error/biz-error.js';
import { readJsonObject } from '../utils/request-body.js';
import { migrationCursor, migrationLimit, migrationUserId, migrationIds } from '../utils/migration-page.js';

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
	const userId = migrationUserId(c.req.query('userId'));
	const limit = migrationLimit(c.req.query('limit') ?? 5000);
	const cursor = migrationCursor(c.req.query('cursor'));
	const byoCursor = migrationCursor(c.req.query('byoCursor'));
	const [emailKeys, byoStorage, oauthApps] = await Promise.all([
		emailKeyMigrationService.preDeployCheck(c, { userId, limit, cursor }),
		byoStorageMigrationService.preDeployCheck(c, { userIds: userId === null ? null : [userId], limit, cursor: byoCursor }),
		oauthAppService.inspectSecretState(c)
	]);
	return c.json(result.ok({ emailKeys, byoStorage, oauthApps }));
});

app.post('/setting/security/oauth-apps/migrate', async (c) => {
	await rbacGuard.assertAdmin(c, userContext.getUserId(c));
	const body = await readJsonObject(c, { allowEmpty: true });
	const dryRun = body?.dryRun === true;
	const migration = await oauthAppService.migratePlaintextSecrets(c, { dryRun });
	const verification = await oauthAppService.inspectSecretState(c);
	return c.json(result.ok({ migration, verification }));
});

app.post('/setting/security/email-key/migrate', async (c) => {
	await rbacGuard.assertAdmin(c, userContext.getUserId(c));
	const body = await readJsonObject(c);
	const userId = migrationUserId(body.userId);
	const limit = migrationLimit(body.limit === undefined ? 100 : body.limit);
	const cursor = migrationCursor(body.cursor);
	const dryRun = body?.dryRun === true;
	const requireDedicatedKey = body?.requireDedicatedKey !== false;
	const migration = await emailKeyMigrationService.migrateBatch(c, {
		userId,
		limit,
		cursor,
		dryRun,
		requireDedicatedKey
	});
	const verification = await emailKeyMigrationService.postDeployVerify(c, {
		userId
	});
	return c.json(result.ok({ migration, verification }));
});

app.post('/setting/security/email-key/rollback', async (c) => {
	await rbacGuard.assertAdmin(c, userContext.getUserId(c));
	const body = await readJsonObject(c);
	if (body?.confirmRollback !== true) {
		throw new BizError('Rollback requires explicit confirmRollback: true confirmation', 400, 'rollback_confirmation_required');
	}
	const userId = migrationUserId(body.userId);
	const emailIds = migrationIds(body.emailIds);
	const rollback = await emailKeyMigrationService.rollbackMigration(c, {
		emailIds,
		limit: migrationLimit(body.limit),
		cursor: migrationCursor(body.cursor),
		userId,
		targetDomain: body?.targetDomain
	});
	return c.json(result.ok(rollback));
});

app.post('/setting/security/byo-storage/migrate', async (c) => {
	await rbacGuard.assertAdmin(c, userContext.getUserId(c));
	const body = await readJsonObject(c);
	const dryRun = body?.dryRun === true;
	const userIds = migrationIds(body.userIds);
	const migration = await byoStorageMigrationService.migrateBatch(c, {
		dryRun, userIds, limit: migrationLimit(body.limit), cursor: migrationCursor(body.cursor),
		requireDedicatedKey: body.requireDedicatedKey !== false
	});
	const verification = await byoStorageMigrationService.postDeployVerify(c, { userIds });
	return c.json(result.ok({ migration, verification }));
});

app.post('/setting/security/byo-storage/rollback', async (c) => {
	await rbacGuard.assertAdmin(c, userContext.getUserId(c));
	const body = await readJsonObject(c);
	if (body?.confirmRollback !== true) {
		throw new BizError('Rollback requires explicit confirmRollback: true confirmation', 400, 'rollback_confirmation_required');
	}
	const userIds = migrationIds(body.userIds);
	const rollback = await byoStorageMigrationService.rollbackMigration(c, {
		userIds,
		limit: migrationLimit(body.limit),
		cursor: migrationCursor(body.cursor),
		targetMode: body?.targetMode,
		targetKeyDomain: body?.targetKeyDomain
	});
	return c.json(result.ok(rollback));
});


