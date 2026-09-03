import BizError from '../error/biz-error';
import oauthAppService from './oauth-app-service';
import userService from './user-service';
import jwtUtils from '../utils/jwt-utils';
import constant from '../const/constant';

const encoder = new TextEncoder();

function base64url(input) {
	const str = btoa(String.fromCharCode(...new Uint8Array(input)));
	return str.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function sha256Base64Url(str) {
	const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(str));
	return base64url(buffer);
}

function genRandomHex(bytesCount = 16) {
	const array = new Uint8Array(bytesCount);
	crypto.getRandomValues(array);
	return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

const oauthProviderService = {
	async getAuthorizeInfo(c, query) {
		const clientId = query.client_id || query.clientId;
		const redirectUri = query.redirect_uri || query.redirectUri;
		const scope = query.scope || 'openid profile email';
		const state = query.state || '';

		if (!clientId) {
			throw new BizError('缺少 client_id 参数');
		}

		const app = await oauthAppService.getByClientId(c, clientId);
		if (!app) {
			throw new BizError('未找到对应的 OAuth 应用 (Invalid client_id)');
		}

		if (Number(app.status) !== 1) {
			throw new BizError('该 OAuth 应用已被管理员禁用');
		}

		if (redirectUri && !oauthAppService.verifyRedirectUri(app, redirectUri)) {
			throw new BizError('未授权的回调地址 (redirect_uri mismatch)');
		}

		// 检查用户当前登录态
		let currentUser = null;
		const jwt = c.req.header(constant.TOKEN_HEADER) || c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
		if (jwt) {
			const payload = await jwtUtils.verifyToken(c, jwt);
			if (payload && payload.userId) {
				const userRow = await userService.selectById(c, payload.userId);
				if (userRow && userRow.status === 0) {
					currentUser = {
						userId: userRow.userId,
						email: userRow.email,
						name: userRow.name || userRow.email.split('@')[0],
						avatar: userRow.avatar || ''
					};
				}
			}
		}

		return {
			isLoggedIn: !!currentUser,
			user: currentUser,
			app: {
				id: app.id,
				name: app.name,
				clientId: app.clientId,
				logoUrl: app.logoUrl,
				homepageUrl: app.homepageUrl,
				description: app.description
			},
			requestedScopes: scope.split(/\s+/).filter(Boolean),
			redirectUri: redirectUri || (Array.isArray(app.redirectUris) ? app.redirectUris[0] : JSON.parse(app.redirectUris || '[]')[0] || ''),
			state
		};
	},

	async authorize(c, params) {
		const { client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = params;

		if (!client_id) {
			throw new BizError('缺少 client_id');
		}

		const app = await oauthAppService.getByClientId(c, client_id);
		if (!app || Number(app.status) !== 1) {
			throw new BizError('应用无效或已禁用');
		}

		if (!oauthAppService.verifyRedirectUri(app, redirect_uri)) {
			throw new BizError('无效的 redirect_uri');
		}

		// 验证当前用户
		const jwt = c.req.header(constant.TOKEN_HEADER) || c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
		if (!jwt) {
			throw new BizError('用户未登录，请先登录 Epomail', 401);
		}

		const payload = await jwtUtils.verifyToken(c, jwt);
		if (!payload || !payload.userId) {
			throw new BizError('登录会话已过期，请重新登录', 401);
		}

		const user = await userService.selectById(c, payload.userId);
		if (!user || user.status !== 0) {
			throw new BizError('用户账户异常或已被禁用', 403);
		}

		const code = `epo_code_${genRandomHex(16)}`;
		const authPayload = {
			userId: user.userId,
			userEmail: user.email,
			clientId: app.clientId,
			redirectUri: redirect_uri,
			scopes: scope || 'openid profile email',
			codeChallenge: code_challenge || '',
			codeChallengeMethod: code_challenge_method || 'S256',
			createdAt: Date.now()
		};

		// 存入 KV 缓存，TTL 为 300 秒 (5分钟)
		await c.env.kv.put(`OAUTH_CODE_${code}`, JSON.stringify(authPayload), { expirationTtl: 300 });

		const finalUrl = new URL(redirect_uri);
		finalUrl.searchParams.set('code', code);
		if (state) {
			finalUrl.searchParams.set('state', state);
		}

		return {
			code,
			state: state || '',
			redirectUri: finalUrl.toString()
		};
	},

	async token(c, body) {
		const grantType = body.grant_type;
		const code = body.code;
		const clientId = body.client_id;
		const clientSecret = body.client_secret;
		const redirectUri = body.redirect_uri;
		const codeVerifier = body.code_verifier;

		if (grantType !== 'authorization_code') {
			throw new BizError('unsupported_grant_type: 仅支持 authorization_code 模式', 400);
		}

		if (!code) {
			throw new BizError('invalid_request: 缺少 code 参数', 400);
		}

		const kvKey = `OAUTH_CODE_${code}`;
		const authData = await c.env.kv.get(kvKey, { type: 'json' });

		if (!authData) {
			throw new BizError('invalid_grant: 授权码已失效或已被使用', 400);
		}

		// 无论验证成功与否，立即删除 code 防止重放攻击
		await c.env.kv.delete(kvKey);

		if (clientId && clientId !== authData.clientId) {
			throw new BizError('invalid_client: client_id 不匹配', 400);
		}

		if (redirectUri && redirectUri !== authData.redirectUri) {
			throw new BizError('invalid_grant: redirect_uri 与授权时不一致', 400);
		}

		const app = await oauthAppService.getByClientId(c, authData.clientId);
		if (!app || Number(app.status) !== 1) {
			throw new BizError('invalid_client: 应用无效或已禁用', 400);
		}

		// PKCE 验证或者 Secret 验证
		if (authData.codeChallenge) {
			if (!codeVerifier) {
				throw new BizError('invalid_request: PKCE 流程缺少 code_verifier', 400);
			}
			const computedChallenge = await sha256Base64Url(codeVerifier);
			if (computedChallenge !== authData.codeChallenge) {
				throw new BizError('invalid_grant: PKCE code_verifier 校验失败', 400);
			}
		} else {
			if (!clientSecret || clientSecret !== app.clientSecret) {
				throw new BizError('invalid_client: client_secret 验证失败', 401);
			}
		}

		const user = await userService.selectById(c, authData.userId);
		if (!user || user.status !== 0) {
			throw new BizError('invalid_grant: 用户不存在或已被封禁', 400);
		}

		const now = Math.floor(Date.now() / 1000);
		const origin = new URL(c.req.url).origin;

		// 1. Access Token (2小时有效)
		const accessToken = await jwtUtils.generateToken(c, {
			userId: user.userId,
			email: user.email,
			clientId: app.clientId,
			scopes: authData.scopes,
			typ: 'oauth_access_token'
		}, 7200);

		// 2. ID Token (OIDC 标准规范)
		const idToken = await jwtUtils.generateToken(c, {
			iss: origin,
			sub: String(user.userId),
			aud: app.clientId,
			email: user.email,
			email_verified: true,
			name: user.name || user.email.split('@')[0],
			preferred_username: user.email.split('@')[0],
			picture: user.avatar || ''
		}, 7200);

		return {
			access_token: accessToken,
			token_type: 'Bearer',
			expires_in: 7200,
			id_token: idToken,
			scope: authData.scopes
		};
	},

	async userInfo(c, tokenStr) {
		if (!tokenStr) {
			throw new BizError('缺少 Bearer Token', 401);
		}

		const payload = await jwtUtils.verifyToken(c, tokenStr);
		if (!payload || !payload.userId) {
			throw new BizError('无效或已过期的 Access Token', 401);
		}

		const user = await userService.selectById(c, payload.userId);
		if (!user || user.status !== 0) {
			throw new BizError('用户不存在或已失效', 401);
		}

		return {
			sub: String(user.userId),
			email: user.email,
			email_verified: true,
			name: user.name || user.email.split('@')[0],
			preferred_username: user.email.split('@')[0],
			picture: user.avatar || ''
		};
	},

	getOpenIdConfiguration(c) {
		const origin = new URL(c.req.url).origin;
		return {
			issuer: origin,
			authorization_endpoint: `${origin}/oauth/authorize`,
			token_endpoint: `${origin}/api/oauth/token`,
			userinfo_endpoint: `${origin}/api/oauth/userinfo`,
			jwks_uri: `${origin}/api/oauth/jwks`,
			response_types_supported: ['code'],
			subject_types_supported: ['public'],
			id_token_signing_alg_values_supported: ['HS256'],
			scopes_supported: ['openid', 'profile', 'email'],
			token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
			claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'email', 'email_verified', 'name', 'preferred_username', 'picture']
		};
	}
};

export default oauthProviderService;
