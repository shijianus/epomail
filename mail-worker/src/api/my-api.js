import app from '../hono/hono';
import userService from '../service/user-service';
import totpService from '../service/totp-service';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/my/loginUserInfo', async (c) => {
	const user = await userService.loginUserInfo(c, userContext.getUserId(c));
	return c.json(result.ok(user));
});

app.put('/my/resetPassword', async (c) => {
	await userService.resetPassword(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/my/updateProfile', async (c) => {
	await userService.updateProfile(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.post('/my/uploadImage', async (c) => {
    const res = await userService.uploadImage(c, userContext.getUserId(c));
    return c.json(result.ok(res));
});

app.put('/my/setCustomLabels', async (c) => {
	await userService.setCustomLabels(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.delete('/my/delete', async (c) => {
	await userService.delete(c, userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/my/totp/status', async (c) => {
	const data = await totpService.getStatus(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/my/totp/setup', async (c) => {
	const userObj = userContext.getUser(c);
	const data = await totpService.getSetupInfo(c, userContext.getUserId(c), userObj.email);
	return c.json(result.ok(data));
});

app.post('/my/totp/enable', async (c) => {
	const data = await totpService.enableTotp(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(data));
});

app.post('/my/totp/disable', async (c) => {
	await totpService.disableTotp(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok());
});

app.post('/my/totp/backup-codes', async (c) => {
	const data = await totpService.regenerateBackupCodes(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(data));
});


