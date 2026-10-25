import app from '../hono/hono';
import result from "../model/result";
import oauthService from "../service/oauth-service";
import userContext from "../security/user-context";
import { isAdminUser } from "../utils/admin-utils";
import BizError from "../error/biz-error";
import rateLimit from '../utils/rate-limit.js';

function redirectToLogin(c, params) {
	const query = new URLSearchParams(params);
	return c.redirect(`/login?${query.toString()}`);
}

async function readCallbackParams(c) {
	if (c.req.method === 'POST') {
		const contentType = c.req.header('content-type') || '';
		if (contentType.includes('application/json')) {
			const body = await c.req.json().catch(() => ({}));
			return {
				code: body.code,
				state: body.state,
				id_token: body.id_token,
				error: body.error
			};
		}
		const body = await c.req.parseBody().catch(() => ({}));
		return {
			code: body.code,
			state: body.state,
			id_token: body.id_token,
			error: body.error
		};
	}
	return {
		code: c.req.query('code'),
		state: c.req.query('state'),
		id_token: c.req.query('id_token'),
		error: c.req.query('error')
	};
}

async function handleOAuthCallback(c) {
	const provider = c.req.param('provider');
	try {
		const params = await readCallbackParams(c);
		if (params.error) {
			console.warn(`OAuth provider ${provider} returned an authorization error`);
			return redirectToLogin(c, { error: 'oauth_denied' });
		}
		if (!params.code && !params.id_token) {
			return redirectToLogin(c, { error: 'oauth_missing_code' });
		}

		// State is single-use and binds this callback to the authorization URL
		// issued by this Worker (provider, redirect URI and nonce).
		let stateRow;
		try {
			stateRow = await oauthService.consumeState(c, provider, params.state);
		} catch (_) {
			console.warn(`OAuth state rejected for provider ${provider}`);
			return redirectToLogin(c, { error: 'oauth_state_invalid' });
		}

		const loginInfo = await oauthService.exchangeCodeAndLogin(c, provider, {
			code: params.code,
			id_token: params.id_token,
			redirectUri: stateRow.redirectUri,
			nonce: stateRow.nonce
		});

		if (loginInfo.token || loginInfo.mfa) {
			// Long-lived mailbox JWT must never appear in a URL. Exchange a
			// short-lived, single-use code on the login page instead.
			const loginCode = await oauthService.createLoginExchangeCode(c, {
				token: loginInfo.token,
				mfa: loginInfo.mfa,
				userInfo: loginInfo.userInfo,
				provider
			});
			const query = { oauth_code: loginCode };
			if (stateRow.clientState) {
				query.oauth_client_state = stateRow.clientState;
			}
			return redirectToLogin(c, query);
		}

		// Unbound identities never receive a session here. The bind proof is
		// delivered in the fragment so it is not sent to servers or logs.
		const bindProof = encodeURIComponent(loginInfo.bindToken || '');
		const query = new URLSearchParams({
			oauth_user_id: loginInfo.userInfo?.oauthUserId || '',
			oauth_provider: provider
		});
		if (stateRow.clientState) {
			query.set('oauth_client_state', stateRow.clientState);
		}
		return c.redirect(`/login?${query.toString()}#oauth_bind=${bindProof}`);
	} catch (err) {
		console.warn(`OAuth callback failed for ${provider}: ${err?.message || 'unknown error'}`);
		return redirectToLogin(c, { error: 'oauth_failed' });
	}
}

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

// Public: exchange the short-lived callback code for the real mailbox token
app.post('/oauth/exchange', async (c) => {
	await rateLimit.check(c, { scope: 'oauth-exchange', limit: 60, windowSeconds: 900 });
	const body = await c.req.json().catch(() => ({}));
	const exchange = await oauthService.consumeLoginExchangeCode(c, body.code);
	if (exchange.mfa) {
		return c.json(result.ok({
			...exchange.mfa,
			...(exchange.mfa.mfaRequired ? { mfaRequired: true } : {}),
			userInfo: exchange.userInfo
		}));
	}
	return c.json(result.ok({ token: exchange.token, userInfo: exchange.userInfo }));
});

// Admin only: test / verify provider configuration and network reachability
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

// OAuth callback handling for browser redirect flows (GET and Apple form_post)
app.get('/oauth/callback/:provider', handleOAuthCallback);
app.post('/oauth/callback/:provider', handleOAuthCallback);

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
