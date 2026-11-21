import app from '../hono/hono';
import result from '../model/result';
import oauthProviderService from '../service/oauth-provider-service';
import rateLimit from '../utils/rate-limit.js';
import safeLogger from '../utils/safe-logger.js';
import BizError from '../error/biz-error.js';
import readJsonObject from '../utils/request-body.js';

const OAUTH_ERROR_DESCRIPTIONS = {
	invalid_request: 'The request is invalid',
	invalid_client: 'Client authentication failed',
	invalid_grant: 'The authorization grant is invalid or expired',
	invalid_token: 'The access token is invalid or expired',
	unauthorized_client: 'The client is not authorized',
	unsupported_grant_type: 'The grant type is not supported',
	unsupported_token_type: 'The token type is not supported',
	invalid_scope: 'The requested scope is invalid'
};

function safeOauthError(err, fallbackCode = 'invalid_request') {
	const raw = typeof err?.message === 'string' ? err.message : '';
	const match = raw.match(/^(invalid_request|invalid_client|invalid_grant|invalid_token|unauthorized_client|unsupported_grant_type|unsupported_token_type|invalid_scope)\b/i);
	const code = (match?.[1] || fallbackCode).toLowerCase();
	if (!match || !OAUTH_ERROR_DESCRIPTIONS[code]) {
		safeLogger.error('oauth_provider_endpoint_error', {
			errorName: typeof err?.name === 'string' ? err.name : 'Error',
			status: Number.isInteger(err?.status) ? err.status : (Number.isInteger(err?.code) ? err.code : 500)
		});
	}
	return {
		error: OAUTH_ERROR_DESCRIPTIONS[code] ? code : fallbackCode,
		error_description: OAUTH_ERROR_DESCRIPTIONS[code] || 'Request failed'
	};
}

// 1. 获取待授权应用信息与用户状态 (内部前端 /oauth/authorize 页面使用)
app.get('/oauth/authorize/info', async (c) => {
	const query = c.req.query();
	const info = await oauthProviderService.getAuthorizeInfo(c, query);
	return c.json(result.ok(info));
});

// 2. 确认授权并签发临时 code
app.post('/oauth/authorize', async (c) => {
	const body = await readJsonObject(c);
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
	if (!params || typeof params !== 'object' || Array.isArray(params)) {
		throw new BizError('JSON request body must be an object', 400, 'INVALID_JSON');
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
		await rateLimit.check(c, { scope: 'oidc-token', limit: 60, windowSeconds: 900 });
		const params = await parseTokenParams(c);
		const tokenData = await oauthProviderService.token(c, params);
		return c.json(tokenData);
	} catch (err) {
		const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500
			? err.status
			: (String(err?.message || '').startsWith('invalid_client') ? 401 : 400);
		return c.json({
			...safeOauthError(err, 'invalid_request')
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
		return c.json(safeOauthError(err, 'invalid_token'), 401);
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
