import app from '../hono/hono';
import result from '../model/result';
import oauthProviderService from '../service/oauth-provider-service';

// 1. 获取待授权应用信息与用户状态 (内部前端 /oauth/authorize 页面使用)
app.get('/oauth/authorize/info', async (c) => {
	const query = c.req.query();
	const info = await oauthProviderService.getAuthorizeInfo(c, query);
	return c.json(result.ok(info));
});

// 2. 确认授权并签发临时 code
app.post('/oauth/authorize', async (c) => {
	const body = await c.req.json();
	const authRes = await oauthProviderService.authorize(c, body);
	return c.json(result.ok(authRes));
});

// 3. 解析客户端请求体 (兼容 JSON 与 URL-encoded 以及 Basic Auth)
async function parseTokenParams(c) {
	let params = {};
	const contentType = c.req.header('content-type') || '';

	if (contentType.includes('application/x-www-form-urlencoded')) {
		const form = await c.req.parseBody();
		params = { ...form };
	} else {
		try {
			params = await c.req.json();
		} catch (e) {
			const form = await c.req.parseBody().catch(() => ({}));
			params = { ...form };
		}
	}

	// 兼容 Basic Auth (Authorization: Basic base64(client_id:client_secret))
	const authHeader = c.req.header('authorization') || '';
	if (authHeader.startsWith('Basic ')) {
		try {
			const creds = atob(authHeader.substring(6)).split(':');
			if (creds.length >= 2) {
				if (!params.client_id) params.client_id = creds[0];
				if (!params.client_secret) params.client_secret = creds.slice(1).join(':');
			}
		} catch (e) {
			// ignore
		}
	}

	return params;
}

// 4. 标准 OAuth 2.0 / OIDC Token 交换端点 (同时支持 /oauth/token 与 /api/oauth/token)
const handleToken = async (c) => {
	try {
		const params = await parseTokenParams(c);
		const tokenData = await oauthProviderService.token(c, params);
		return c.json(tokenData);
	} catch (err) {
		const status = err.status || (err.message && err.message.includes('invalid_client') ? 401 : 400);
		return c.json({
			error: err.message?.split(':')[0] || 'invalid_request',
			error_description: err.message || 'Token exchange failed'
		}, status);
	}
};

app.post('/oauth/token', handleToken);
app.post('/api/oauth/token', handleToken);

// 5. 标准 OIDC UserInfo 端点
const handleUserInfo = async (c) => {
	try {
		const authHeader = c.req.header('authorization') || '';
		const token = authHeader.replace(/^Bearer\s+/i, '').trim();
		const userInfo = await oauthProviderService.userInfo(c, token);
		return c.json(userInfo);
	} catch (err) {
		return c.json({
			error: 'invalid_token',
			error_description: err.message || 'Invalid or expired token'
		}, 401);
	}
};

app.get('/oauth/userinfo', handleUserInfo);
app.get('/api/oauth/userinfo', handleUserInfo);

// 6. 标准 OIDC Discovery 发现端点
const handleOidcDiscovery = (c) => {
	const config = oauthProviderService.getOpenIdConfiguration(c);
	return c.json(config);
};

app.get('/.well-known/openid-configuration', handleOidcDiscovery);
app.get('/oauth/openid-configuration', handleOidcDiscovery);
app.get('/api/oauth/openid-configuration', handleOidcDiscovery);

export default app;
