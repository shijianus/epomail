import app from '../hono/hono';
import result from "../model/result";
import oauthService from "../service/oauth-service";
import userContext from "../security/user-context";
import { isAdminUser } from "../utils/admin-utils";
import BizError from "../error/biz-error";

// Public: list enabled third-party auth providers for login UI
app.get('/oauth/providers', async (c) => {
	const list = await oauthService.getPublicProviders(c);
	return c.json(result.ok(list));
});

// Public: get OAuth authorization URL for a provider
app.get('/oauth/authorize/:provider', async (c) => {
	const provider = c.req.param('provider');
	const redirectUri = c.req.query('redirect_uri') || '';
	const state = c.req.query('state') || '';
	const url = await oauthService.getAuthorizeUrl(c, provider, redirectUri, state);
	return c.json(result.ok({ url }));
});

// Public: direct login with OAuth authorization code or ID token
app.post('/oauth/:provider/login', async (c) => {
	const provider = c.req.param('provider');
	const body = await c.req.json();
	const loginInfo = await oauthService.exchangeCodeAndLogin(c, provider, body);
	return c.json(result.ok(loginInfo));
});

// Admin only: test / verify provider configuration and network reachability
app.post('/oauth/verify/:provider', async (c) => {
	const user = userContext.getUser(c);
	if (!user || !isAdminUser(c, user)) {
		throw new BizError('Admin permission required to verify OAuth provider');
	}
	const provider = c.req.param('provider');
	const body = await c.req.json();
	const verifyResult = await oauthService.verifyProvider(c, provider, body);
	return c.json(result.ok(verifyResult));
});

// OAuth Callback handling for browser redirect flows
app.get('/oauth/callback/:provider', async (c) => {
	const provider = c.req.param('provider');
	const code = c.req.query('code');
	const state = c.req.query('state') || '';
	const origin = new URL(c.req.url).origin;
	const redirectUri = `${origin}/api/oauth/callback/${provider}`;

	if (!code) {
		return c.redirect(`/login?error=missing_code`);
	}
	try {
		const loginInfo = await oauthService.exchangeCodeAndLogin(c, provider, { code, state, redirectUri });
		if (loginInfo.token) {
			return c.redirect(`/login?oauth_token=${encodeURIComponent(loginInfo.token)}`);
		} else {
			return c.redirect(`/login?oauth_user_id=${encodeURIComponent(loginInfo.userInfo.oauthUserId)}`);
		}
	} catch (err) {
		return c.redirect(`/login?error=${encodeURIComponent(err.message || 'oauth_failed')}`);
	}
});

// Backwards compatibility for LinuxDo
app.post('/oauth/linuxDo/login', async (c) => {
	const loginInfo = await oauthService.linuxDoLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo));
});

// Bind user with email
app.put('/oauth/bindUser', async (c) => {
	const loginInfo = await oauthService.bindUser(c, await c.req.json());
	return c.json(result.ok(loginInfo));
});
