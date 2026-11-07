import app from '../hono/hono';
import result from "../model/result";
import oauthService from "../service/oauth-service";
import userContext from "../security/user-context";
import { isAdminUser } from "../utils/admin-utils";
import BizError from "../error/biz-error";
import rateLimit from '../utils/rate-limit.js';

const FLOW_COOKIE = 'epo_oauth_flow';

function flowCookie(value, maxAge = 600) {
	return `${FLOW_COOKIE}=${encodeURIComponent(value)}; Path=/api/oauth; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
}

function redirectToLogin(c, params) {
	return c.redirect(`/login?${new URLSearchParams(params).toString()}`);
}

async function readCallbackParams(c) {
	if (c.req.method === 'POST') {
		const contentType = c.req.header('content-type') || '';
		const body = contentType.includes('application/json')
			? await c.req.json().catch(() => ({}))
			: await c.req.parseBody().catch(() => ({}));
		return { code: body.code, state: body.state, id_token: body.id_token, error: body.error };
	}
	return {
		code: c.req.query('code'), state: c.req.query('state'),
		id_token: c.req.query('id_token'), error: c.req.query('error')
	};
}

async function loginWithState(c, provider, params) {
	const stateRow = await oauthService.consumeState(c, provider, params.state);
	return oauthService.exchangeCodeAndLogin(c, provider, {
		code: params.code,
		id_token: params.id_token,
		redirectUri: stateRow.redirectUri,
		nonce: stateRow.nonce,
		flowId: params.state
	});
}

async function handleOAuthCallback(c) {
	const provider = c.req.param('provider');
	try {
		const params = await readCallbackParams(c);
		if (params.error) return redirectToLogin(c, { error: 'oauth_denied' });
		if (!params.code && !params.id_token) return redirectToLogin(c, { error: 'oauth_missing_code' });

		const loginInfo = await loginWithState(c, provider, params);
		if (loginInfo.token || loginInfo.mfa) {
			const loginCode = await oauthService.createLoginExchangeCode(c, {
				token: loginInfo.token, mfa: loginInfo.mfa, userInfo: loginInfo.userInfo, provider
			});
			c.header('Set-Cookie', flowCookie('', 0));
			return redirectToLogin(c, { oauth_code: loginCode });
		}

		const query = new URLSearchParams({
			oauth_user_id: loginInfo.userInfo?.oauthUserId || '',
			oauth_provider: provider
		});
		return c.redirect(`/login?${query.toString()}#oauth_bind=${encodeURIComponent(loginInfo.bindToken || '')}`);
	} catch (err) {
		console.warn(`OAuth callback failed for ${provider}: ${err?.message || 'unknown error'}`);
		c.header('Set-Cookie', flowCookie('', 0));
		return redirectToLogin(c, { error: 'oauth_failed' });
	}
}

app.get('/oauth/providers', async (c) => {
	const list = await oauthService.getPublicProviders(c);
	return c.json(result.ok(list));
});

app.get('/oauth/authorize/:provider', async (c) => {
	const provider = c.req.param('provider');
	const redirectUri = c.req.query('redirect_uri') || '';
	const state = c.req.query('state') || '';
	const url = await oauthService.getAuthorizeUrl(c, provider, redirectUri, state);
	const flowId = new URL(url).searchParams.get('state');
	c.header('Set-Cookie', flowCookie(flowId));
	return c.json(result.ok({ url }));
});

app.post('/oauth/:provider/login', async (c) => {
	const provider = c.req.param('provider');
	const body = await c.req.json();
	const loginInfo = await loginWithState(c, provider, body);
	return c.json(result.ok(loginInfo));
});

app.post('/oauth/exchange', async (c) => {
	await rateLimit.check(c, { scope: 'oauth-exchange', limit: 60, windowSeconds: 900 });
	const body = await c.req.json().catch(() => ({}));
	const exchange = await oauthService.consumeLoginExchangeCode(c, body.code);
	if (exchange.mfa) {
		return c.json(result.ok({ ...exchange.mfa, userInfo: exchange.userInfo }));
	}
	return c.json(result.ok({ token: exchange.token, userInfo: exchange.userInfo }));
});

app.post('/oauth/verify/:provider', async (c) => {
	let user = userContext.getUser(c);
	if (!user) {
		const jwt = c.req.header('token') || c.req.header('jwt');
		if (jwt) {
			const jwtUtils = (await import('../utils/jwt-utils.js')).default;
			const decoded = await jwtUtils.verifyToken(c, jwt);
			if (decoded?.userId) {
				const KvConst = (await import('../const/kv-const.js')).default;
				const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + decoded.userId, { type: 'json' });
				if (authInfo?.user && authInfo.tokens?.includes(decoded.token)) {
					user = authInfo.user;
					c.set('user', user);
				}
			}
		}
	}
	if (!user || !isAdminUser(c, user)) {
		throw new BizError('Admin permission required to verify OAuth provider');
	}
	const provider = c.req.param('provider');
	const body = await c.req.json();
	const verifyResult = await oauthService.verifyProvider(c, provider, body);
	return c.json(result.ok(verifyResult));
});

app.get('/oauth/callback/:provider', handleOAuthCallback);
app.post('/oauth/callback/:provider', handleOAuthCallback);

app.post('/oauth/linuxDo/login', async (c) => {
	const loginInfo = await loginWithState(c, 'linuxdo', await c.req.json());
	return c.json(result.ok(loginInfo));
});

app.put('/oauth/bindUser', async (c) => {
	const loginInfo = await oauthService.bindUser(c, await c.req.json());
	c.header('Set-Cookie', flowCookie('', 0));
	return c.json(result.ok(loginInfo));
});
