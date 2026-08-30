import app from '../hono/hono';
import loginService from '../service/login-service';
import result from '../model/result';
import userContext from '../security/user-context';

app.post('/login', async (c) => {
	const loginRes = await loginService.login(c, await c.req.json());
	if (typeof loginRes === 'object' && loginRes.mfaRequired) {
		return c.json(result.ok(loginRes));
	}
	return c.json(result.ok({ token: loginRes }));
});

app.post('/login/totp', async (c) => {
	const token = await loginService.verifyTotpLogin(c, await c.req.json());
	return c.json(result.ok({ token: token }));
});

app.post('/register', async (c) => {
	const jwt = await loginService.register(c, await c.req.json());
	return c.json(result.ok(jwt));
});

app.delete('/logout', async (c) => {
	await loginService.logout(c, userContext.getUserId(c));
	return c.json(result.ok());
});

