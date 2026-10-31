import BizError from '../error/biz-error';
import oauthAppService from './oauth-app-service';
import userService from './user-service';
import jwtUtils from '../utils/jwt-utils';
import constant from '../const/constant';
import KvConst from '../const/kv-const';
import { isAdminUser } from '../utils/admin-utils';
import oneTimeCredential, { OTC_PURPOSE } from '../utils/one-time-credential.js';

const encoder = new TextEncoder();

function normalizeScopes(value) {
	return String(value || '').split(/\s+/).map(item => item.trim()).filter(Boolean);
}

function assertScopesAllowed(app, requestedScope) {
	const allowed = normalizeScopes(app.scopes);
	if (allowed.length === 0) return;
	const requested = normalizeScopes(requestedScope || 'openid profile email');
	const invalid = requested.filter(scope => !allowed.includes(scope));
	if (invalid.length > 0) {
		throw new BizError(`invalid_scope: 请求了未授权的 scope (${invalid.join(', ')})`, 400);
	}
}

function base64url(input) {
	const str = btoa(String.fromCharCode(...new Uint8Array(input)));
	return str.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function sha256Base64Url(str) {
	const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(str));
	return base64url(buffer);
}

async function timingSafeEqualStr(left, right) {
	if (typeof left !== 'string' || typeof right !== 'string' || !left || !right) return false;
	const [leftDigest, rightDigest] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(left)),
		crypto.subtle.digest('SHA-256', encoder.encode(right))
	]);
	const a = new Uint8Array(leftDigest);
	const b = new Uint8Array(rightDigest);
	let diff = left.length ^ right.length;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

function buildScopedIdentityClaims(user, isAdmin, scopesStr) {
	const scopes = normalizeScopes(scopesStr);
	const includeEmail = scopes.length === 0 || scopes.includes('email');
	const includeProfile = scopes.length === 0 || scopes.includes('profile');
	const claims = {
		sub: String(user.userId),
		is_admin: isAdmin,
		role: isAdmin ? 'admin' : 'reader'
	};
	if (includeEmail) {
		claims.email = user.email;
		claims.email_verified = true;
	}
	if (includeProfile) {
		claims.name = user.name || user.email.split('@')[0];
		claims.preferred_username = user.email.split('@')[0];
		claims.picture = user.avatar || user.avatarUrl || '';
	}
	return claims;
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

		assertScopesAllowed(app, scope);

		// 检查用户当前登录态
		let currentUser = null;
		const jwt = c.req.header(constant.TOKEN_HEADER) || c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
		if (jwt) {
			const payload = await jwtUtils.verifyToken(c, jwt);
			if (payload && payload.userId) {
				const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + payload.userId, { type: 'json' });
				if (authInfo && Array.isArray(authInfo.tokens) && authInfo.tokens.includes(payload.token)) {
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

		assertScopesAllowed(app, scope);

		// 验证当前用户
		const jwt = c.req.header(constant.TOKEN_HEADER) || c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
		if (!jwt) {
			throw new BizError('用户未登录，请先登录 Epomail', 401);
		}

		const payload = await jwtUtils.verifyToken(c, jwt);
		if (!payload || !payload.userId) {
			throw new BizError('登录会话已过期，请重新登录', 401);
		}

		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + payload.userId, { type: 'json' });
		if (!authInfo || !Array.isArray(authInfo.tokens) || !authInfo.tokens.includes(payload.token)) {
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

		// 存入 D1，TTL 为 300 秒 (5分钟)。授权码是单次凭证，消费采用原子
		// 条件更新，两个并发的 token 请求最多只有一个能成功兑换。
		await oneTimeCredential.issue(c, {
			purpose: OTC_PURPOSE.AUTHORIZATION_CODE,
			token: code,
			provider: app.clientId,
			oauthUserId: String(user.userId),
			payload: authPayload,
			ttlSeconds: 300
		});

		// 持久化用户授权记录 (oauth_grant)
		try {
			await oauthAppService.recordGrant(c, user.userId, app.clientId, scope || 'openid profile email');
		} catch (e) {
			console.error('Failed to record oauth_grant:', e);
		}

		// 发送第三方应用授权安全通知邮件
		try {
			const securityNoticeService = (await import('./security-notice-service.js')).default;
			const { SECURITY_EVENT_TYPES } = await import('../const/security-notice-templates.js');
			await securityNoticeService.sendNotice(c, user.userId, SECURITY_EVENT_TYPES.OAUTH_AUTHORIZED, {
				detail: `App: ${app.name || app.clientId} (Scopes: ${scope || 'openid profile email'})`
			});
		} catch (e) {
			console.error('Failed to send OAuth authorized notice:', e);
		}

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

		// 单次消费由 D1 原子条件更新保证。无论后续校验是否通过，码都已被
		// 标记消费，重放请求无法再次兑换。
		const record = await oneTimeCredential.consume(c, {
			purpose: OTC_PURPOSE.AUTHORIZATION_CODE,
			token: code
		});
		const authData = record?.payload;

		if (!authData) {
			throw new BizError('invalid_grant: 授权码已失效或已被使用', 400);
		}

		if (clientId && clientId !== authData.clientId) {
			throw new BizError('invalid_client: client_id 不匹配', 400);
		}

		const cleanRedirectUri = (redirectUri || '').replace(/\/+$/, '');
		const cleanAuthRedirectUri = (authData.redirectUri || '').replace(/\/+$/, '');
		if (cleanRedirectUri && cleanRedirectUri !== cleanAuthRedirectUri) {
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
			if (!clientSecret || !(await timingSafeEqualStr(String(clientSecret), String(app.clientSecret || '')))) {
				throw new BizError('invalid_client: client_secret 验证失败', 401);
			}
		}

		const user = await userService.selectById(c, authData.userId);
		if (!user || user.status !== 0) {
			throw new BizError('invalid_grant: 用户不存在或已被封禁', 400);
		}

		const origin = new URL(c.req.url).origin;

		const isAdmin = isAdminUser(c, user);
		const scopedClaims = buildScopedIdentityClaims(user, isAdmin, authData.scopes);

		// 1. Access Token (2小时有效)
		const accessToken = await jwtUtils.generateToken(c, {
			userId: user.userId,
			...(scopedClaims.email ? { email: scopedClaims.email } : {}),
			clientId: app.clientId,
			scopes: authData.scopes,
			is_admin: isAdmin,
			role: isAdmin ? 'admin' : 'reader',
			typ: 'oauth_access_token'
		}, 7200);

		// 2. ID Token (OIDC 标准规范)
		const idToken = await jwtUtils.generateToken(c, {
			iss: origin,
			aud: app.clientId,
			...scopedClaims
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
		if (!payload || !payload.userId || payload.typ !== 'oauth_access_token' || !payload.clientId) {
			throw new BizError('无效或已过期的 Access Token', 401);
		}

		const user = await userService.selectById(c, payload.userId);
		if (!user || user.status !== 0) {
			throw new BizError('用户不存在或已失效', 401);
		}

		if (payload.clientId) {
			const isRevoked = await oauthAppService.isGrantRevoked(c, payload.userId, payload.clientId);
			if (isRevoked) {
				throw new BizError('该应用的访问权限已被用户撤销 (Access grant revoked)', 401);
			}
		}

		const isAdmin = isAdminUser(c, user);

		return buildScopedIdentityClaims(user, isAdmin, payload.scopes);
	},

	getOpenIdConfiguration(c) {
		const origin = new URL(c.req.url).origin;
		return {
			issuer: origin,
			authorization_endpoint: `${origin}/oauth/authorize`,
			token_endpoint: `${origin}/api/oauth/token`,
			userinfo_endpoint: `${origin}/api/oauth/userinfo`,
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
