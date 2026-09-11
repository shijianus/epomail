import app from '../hono/hono';
import userService from '../service/user-service';
import totpService from '../service/totp-service';
import result from '../model/result';
import userContext from '../security/user-context';
import accountService from '../service/account-service';

app.post('/user/resetTotp', async (c) => {
	const { userId } = await c.req.json();
	await totpService.adminResetTotp(c, userContext.getUserId(c), userId);
	return c.json(result.ok());
});

app.delete('/user/delete', async (c) => {
	await userService.physicsDelete(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/user/setPwd', async (c) => {
	await userService.setPwd(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/user/setStatus', async (c) => {
	await userService.setStatus(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/user/setType', async (c) => {
	await userService.setType(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.post('/user/syncBlogLevel', async (c) => {
	const data = await userService.syncBlogLevel(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/user/blogLevelInfo', async (c) => {
	const data = await userService.getBlogLevelInfo(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/user/list', async (c) => {
	const data = await userService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/user/add', async (c) => {
	await userService.add(c, await c.req.json());
	return c.json(result.ok());
});

app.put('/user/resetSendCount', async (c) => {
	await userService.resetSendCount(c, await c.req.json());
	return c.json(result.ok());
});

app.put('/user/restore', async (c) => {
	await userService.restore(c, await c.req.json());
	return c.json(result.ok());
});

app.get('/user/allAccount', async (c) => {
	const data = await accountService.allAccount(c, c.req.query());
	return c.json(result.ok(data));
});

app.delete('/user/deleteAccount', async (c) => {
	await accountService.physicsDelete(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.post('/user/purgeEmails', async (c) => {
	const data = await userService.purgeUserEmails(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

// 管理员强制为指定用户补发官方欢迎邮件（修复账号恢复后欢迎邮件缺失问题）
app.post('/user/sendWelcomeEmail', async (c) => {
	const { userId, email: userEmail } = await c.req.json();
	if (!userId) {
		return c.json(result.fail('userId 不能为空'));
	}
	// 先清除 KV 缓存，强制重新投递
	try {
		await c.env.kv.delete('HAS_WELCOME_' + userId);
	} catch (_) {}
	const emailService = (await import('../service/email-service')).default;
	const emailRow = await emailService.ensureWelcomeEmailForUser(c, Number(userId), userEmail || null);
	return c.json(result.ok({ delivered: !!emailRow, emailId: emailRow?.emailId }));
});

