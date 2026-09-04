import app from '../hono/hono';
import result from '../model/result';
import settingService from '../service/setting-service';
import s3Service from '../service/s3-service';
import dbService from '../service/db-service';
import storageScanService from '../service/storage-scan-service';
import userContext from "../security/user-context";

app.put('/setting/set', async (c) => {
	await settingService.set(c, await c.req.json());
	return c.json(result.ok());
});

app.get('/setting/query', async (c) => {
	const setting = await settingService.get(c);
	return c.json(result.ok(setting));
});

app.get('/setting/websiteConfig', async (c) => {
	const setting = await settingService.websiteConfig(c);
	return c.json(result.ok(setting));
})

app.put('/setting/setBackground', async (c) => {
	const key = await settingService.setBackground(c, await c.req.json());
	return c.json(result.ok(key));
});

app.delete('/setting/deleteBackground', async (c) => {
	await settingService.deleteBackground(c);
	return c.json(result.ok());
});

app.put('/setting/setBlacklist', async (c) => {
	const setting = await settingService.setBlacklist(c, await c.req.json());
	return c.json(result.ok(setting));
});

app.post('/setting/sendWelcomeEmail', async (c) => {
	const res = await settingService.sendWelcomeEmailToAll(c, await c.req.json());
	return c.json(result.ok(res));
});

app.post('/setting/s3/test', async (c) => {
	const body = await c.req.json();
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


