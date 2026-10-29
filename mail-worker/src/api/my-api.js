import app from '../hono/hono';
import userService from '../service/user-service';
import totpService from '../service/totp-service';
import telegramService from '../service/telegram-service';
import oauthAppService from '../service/oauth-app-service';
import oauthIdentityService from '../service/oauth-identity-service';
import result from '../model/result';
import userContext from '../security/user-context';
import constant from '../const/constant';

app.get('/my/loginUserInfo', async (c) => {
	const user = await userService.loginUserInfo(c, userContext.getUserId(c), userContext.getLoginEmail(c));
	return c.json(result.ok(user));
});

// Eligibility for the one-time "set first password" flow. The response is
// deliberately limited to booleans/timing: the generated hash used for the
// compare-and-set never leaves the worker. `providerLinked` and
// `hasInitialPassword` let the settings page explain why the action is
// unavailable instead of offering a change-password form the user cannot pass.
app.get('/my/initialPasswordStatus', async (c) => {
	const userId = userContext.getUserId(c);
	const eligibility = await userService.evaluateInitialPassword(c, userId);
	return c.json(result.ok({
		canSet: eligibility.canSet === true,
		provider: eligibility.provider || null,
		expiresAt: eligibility.expiresAt || null,
		providerLinked: eligibility.providerLinked === true,
		hasInitialPassword: eligibility.hasInitialPassword === true,
		windowMinutes: Math.round(constant.INITIAL_PASSWORD_WINDOW_MS / 60000)
	}));
});

app.put('/my/setInitialPassword', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	await userService.setInitialPassword(c, body, userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/my/resetPassword', async (c) => {
	const body = await c.req.json();
	await userService.resetPassword(c, body, userContext.getUserId(c), {
		requireCurrent: true,
		currentPassword: body?.currentPassword
	});
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

app.get('/my/geo', (c) => {
	const country = c.req.header('cf-ipcountry') || c.req.raw?.cf?.country || '';
	return c.json(result.ok({ country }));
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

app.post('/my/totp/view-backup-codes', async (c) => {
	const data = await totpService.viewBackupCodes(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(data));
});

app.get('/my/passkey/setup', async (c) => {
	const userObj = userContext.getUser(c);
	const data = await totpService.getPasskeyRegistrationOptions(c, userContext.getUserId(c), userObj.email);
	return c.json(result.ok(data));
});

app.post('/my/passkey/register', async (c) => {
	const data = await totpService.registerPasskey(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(data));
});

app.get('/my/passkey/list', async (c) => {
	const data = await totpService.getPasskeys(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.delete('/my/passkey/:id', async (c) => {
	const passkeyId = c.req.param('id');
	await totpService.deletePasskey(c, userContext.getUserId(c), passkeyId);
	return c.json(result.ok());
});

app.post('/my/totp/update', async (c) => {
	const data = await totpService.updateTotp(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(data));
});

app.post('/my/passkey/:id/approve-totp', async (c) => {
	const passkeyId = c.req.param('id');
	const data = await totpService.approvePasskeyWithTotp(c, userContext.getUserId(c), passkeyId, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/my/passkey/:id/activate-timelock', async (c) => {
	const passkeyId = c.req.param('id');
	const data = await totpService.activateTimelockedPasskey(c, userContext.getUserId(c), passkeyId);
	return c.json(result.ok(data));
});

app.post('/my/passkey/:id/test-options', async (c) => {
	const passkeyId = c.req.param('id');
	const data = await totpService.getPasskeyTestOptions(c, userContext.getUserId(c), passkeyId);
	return c.json(result.ok(data));
});

app.post('/my/passkey/:id/test-verify', async (c) => {
	const passkeyId = c.req.param('id');
	const data = await totpService.verifyPasskeyTest(c, userContext.getUserId(c), passkeyId, await c.req.json());
	return c.json(result.ok(data));
});

app.put('/my/passkey/:id', async (c) => {
	const passkeyId = c.req.param('id');
	const { name } = await c.req.json();
	await totpService.renamePasskey(c, userContext.getUserId(c), passkeyId, name);
	return c.json(result.ok());
});

app.get('/my/exportData', async (c) => {
	const data = await userService.exportUserData(c, userContext.getUserId(c), c.req.query());
	return c.json(result.ok(data));
});

app.post('/my/testTelegram', async (c) => {
	const data = await telegramService.testPersonalBot(c, await c.req.json());
	return c.json(result.ok(data));
});

app.get('/my/apiTokens', async (c) => {
	const data = await userService.getApiTokens(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/my/apiTokens', async (c) => {
	const data = await userService.createApiToken(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(data));
});

app.delete('/my/apiTokens/:id', async (c) => {
	const tokenId = c.req.param('id');
	await userService.deleteApiToken(c, userContext.getUserId(c), tokenId);
	return c.json(result.ok());
});

app.get('/my/storage', async (c) => {
	const data = await userService.getUserStorage(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/my/storage/test', async (c) => {
	const data = await userService.testUserStorage(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(data));
});

app.put('/my/storage', async (c) => {
	const data = await userService.updateUserStorage(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(data));
});

app.delete('/my/storage', async (c) => {
	const data = await userService.clearUserStorage(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

// 获取当前登录用户已授权的应用列表及生态应用
app.get('/my/oauthGrants', async (c) => {
	const data = await oauthAppService.getUserGrants(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

// 解除特定应用授权 (通过 grant id)
app.delete('/my/oauthGrants/:id', async (c) => {
	const grantId = c.req.param('id');
	const data = await oauthAppService.revokeGrant(c, userContext.getUserId(c), grantId);
	return c.json(result.ok(data));
});

// 解除特定应用授权 (通过 client_id 或 id)
app.post('/my/revokeOauthGrant', async (c) => {
	const body = await c.req.json();
	const data = await oauthAppService.revokeGrant(c, userContext.getUserId(c), body.id || body.clientId);
	return c.json(result.ok(data));
});

// ---------------------------------------------------------------------------
// Third-party login identity management for the signed-in account.
//
// Every handler derives the account from the verified session; the request
// body never names a user. Bind and unbind additionally require a single-use
// step-up grant minted by /my/oauthIdentities/reauth.
// ---------------------------------------------------------------------------

app.get('/my/oauthIdentities', async (c) => {
	const data = await oauthIdentityService.listIdentities(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/my/oauthIdentities/reauth', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const data = await oauthIdentityService.reauthenticate(c, userContext.getUserId(c), body);
	return c.json(result.ok(data));
});

app.post('/my/oauthIdentities/bind/start', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const data = await oauthIdentityService.startBind(c, userContext.getUserId(c), body);
	return c.json(result.ok(data));
});

app.post('/my/oauthIdentities/bind/complete', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const data = await oauthIdentityService.completeBind(c, userContext.getUserId(c), body);
	return c.json(result.ok(data));
});

// State-changing unbind is DELETE only. A GET never mutates an identity.
app.delete('/my/oauthIdentities/:id', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const data = await oauthIdentityService.unbind(c, userContext.getUserId(c), c.req.param('id'), body);
	return c.json(result.ok(data));
});


