import BizError from "../error/biz-error";
import orm from "../entity/orm";
import { oauth } from "../entity/oauth";
import { eq, inArray } from 'drizzle-orm';
import userService from "./user-service";
import loginService from "./login-service";
import cryptoUtils from "../utils/crypto-utils";
import settingService from "./setting-service";

const PROVIDER_METADATA = {
	github: {
		name: 'GitHub',
		authUrl: 'https://github.com/login/oauth/authorize',
		tokenUrl: 'https://github.com/login/oauth/access_token',
		userInfoUrl: 'https://api.github.com/user',
		defaultScope: 'read:user user:email',
		icon: 'mdi:github'
	},
	google: {
		name: 'Google',
		authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
		tokenUrl: 'https://oauth2.googleapis.com/token',
		userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
		defaultScope: 'openid email profile',
		icon: 'logos:google-icon'
	},
	microsoft: {
		name: 'Microsoft',
		authUrl: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize',
		tokenUrl: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
		userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
		defaultScope: 'openid email profile User.Read',
		icon: 'logos:microsoft-icon'
	},
	apple: {
		name: 'Apple',
		authUrl: 'https://appleid.apple.com/auth/authorize',
		tokenUrl: 'https://appleid.apple.com/auth/token',
		userInfoUrl: '',
		defaultScope: 'name email',
		icon: 'ic:baseline-apple'
	},
	custom: {
		name: 'Custom SSO',
		authUrl: '',
		tokenUrl: '',
		userInfoUrl: '',
		defaultScope: 'openid email profile',
		icon: 'fluent:shield-keyhole-20-filled'
	}
};

const oauthService = {

	async getProviderConfig(c, providerKey) {
		const settingData = await settingService.query(c);
		let providers = settingData.oauthProviders;
		if (typeof providers === 'string') {
			try { providers = JSON.parse(providers); } catch (_) { providers = {}; }
		} else if (!providers || typeof providers !== 'object') {
			providers = {};
		}
		const config = { ...(providers[providerKey] || {}) };

		// Fallback to env variables if available
		const envKey = providerKey.toLowerCase();
		const upperKey = providerKey.toUpperCase();
		if (!config.clientId) {
			config.clientId = c.env?.[`${upperKey}_CLIENT_ID`] || c.env?.[`${envKey}_client_id`] || config.clientId || '';
		}
		if (!config.clientSecret) {
			config.clientSecret = c.env?.[`${upperKey}_CLIENT_SECRET`] || c.env?.[`${envKey}_client_secret`] || config.clientSecret || '';
		}
		if (providerKey === 'linuxdo') {
			config.clientId = config.clientId || c.env?.linuxdo_client_id || '';
			config.clientSecret = config.clientSecret || c.env?.linuxdo_client_secret || '';
			config.callbackUrl = config.callbackUrl || c.env?.linuxdo_callback_url || '';
		}
		return config;
	},

	async getPublicProviders(c) {
		const settingData = await settingService.query(c);
		if (Number(settingData.oauthLoginEnabled) !== 1) {
			return [];
		}
		let providers = settingData.oauthProviders;
		if (typeof providers === 'string') {
			try { providers = JSON.parse(providers); } catch (_) { providers = {}; }
		} else if (!providers || typeof providers !== 'object') {
			providers = {};
		}

		const list = [];
		const keys = ['github', 'google', 'microsoft', 'apple', 'custom'];
		for (const key of keys) {
			const cfg = providers[key];
			const isEnabled = cfg && (cfg.enabled === 1 || cfg.enabled === true || (cfg.clientId && cfg.enabled !== false && cfg.enabled !== 0));
			if (isEnabled) {
				const meta = PROVIDER_METADATA[key];
				list.push({
					key,
					name: (key === 'custom' && cfg.name) ? cfg.name : meta.name,
					icon: meta.icon
				});
			}
		}
		return list;
	},

	async getAuthorizeUrl(c, providerKey, redirectUri = '', state = '') {
		const config = await this.getProviderConfig(c, providerKey);
		if (!config || !config.clientId) {
			throw new BizError(`Provider ${providerKey} is not configured or missing Client ID`);
		}
		const meta = PROVIDER_METADATA[providerKey];
		if (!meta && providerKey !== 'linuxdo') {
			throw new BizError(`Unsupported provider: ${providerKey}`);
		}

		let authUrl = meta?.authUrl || '';
		if (providerKey === 'microsoft') {
			const tenant = config.tenant || 'common';
			authUrl = authUrl.replace('{tenant}', tenant);
		} else if (providerKey === 'custom') {
			authUrl = config.authUrl;
			if (!authUrl) throw new BizError('Custom provider authorization URL (authUrl) is required');
		} else if (providerKey === 'linuxdo') {
			authUrl = 'https://connect.linux.do/oauth2/authorize';
		}

		const finalRedirectUri = redirectUri || config.redirectUri || (c.req ? `${new URL(c.req.url).origin}/api/oauth/callback/${providerKey}` : '');
		const scope = config.scope || meta?.defaultScope || 'openid email profile';

		const url = new URL(authUrl);
		url.searchParams.set('client_id', config.clientId);
		if (finalRedirectUri) {
			url.searchParams.set('redirect_uri', finalRedirectUri);
		}
		url.searchParams.set('response_type', 'code');
		url.searchParams.set('scope', scope);
		if (state) {
			url.searchParams.set('state', state);
		}
		if (providerKey === 'apple') {
			url.searchParams.set('response_mode', 'form_post');
		}
		return url.toString();
	},

	async exchangeCodeAndLogin(c, providerKey, params) {
		const { code, id_token, redirectUri } = params;
		if (!code && !id_token) {
			throw new BizError('Authorization code or ID token is required');
		}
		if (providerKey === 'linuxdo') {
			return await this.linuxDoLogin(c, params);
		}

		const config = await this.getProviderConfig(c, providerKey);
		if (!config || !config.clientId) {
			throw new BizError(`Provider ${providerKey} is not configured`);
		}
		const meta = PROVIDER_METADATA[providerKey];
		if (!meta) {
			throw new BizError(`Unsupported provider: ${providerKey}`);
		}

		const callbackUri = redirectUri || config.redirectUri || (c.req ? `${new URL(c.req.url).origin}/api/oauth/callback/${providerKey}` : '');
		let userInfo = null;

		if (providerKey === 'github') {
			const tokenRes = await fetch(meta.tokenUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json',
					'User-Agent': 'Epocanvas-Mail'
				},
				body: JSON.stringify({
					client_id: config.clientId,
					client_secret: config.clientSecret,
					code,
					redirect_uri: callbackUri
				})
			});
			if (!tokenRes.ok) throw new BizError(`GitHub token exchange failed: ${tokenRes.statusText}`);
			const tokenData = await tokenRes.json();
			if (tokenData.error) throw new BizError(tokenData.error_description || tokenData.error);
			const accessToken = tokenData.access_token;

			const userRes = await fetch(meta.userInfoUrl, {
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'User-Agent': 'Epocanvas-Mail'
				}
			});
			if (!userRes.ok) throw new BizError('Failed to fetch GitHub user profile');
			const ghUser = await userRes.json();

			let email = ghUser.email;
			if (!email) {
				try {
					const emailsRes = await fetch('https://api.github.com/user/emails', {
						headers: {
							'Authorization': `Bearer ${accessToken}`,
							'User-Agent': 'Epocanvas-Mail'
						}
					});
					if (emailsRes.ok) {
						const emails = await emailsRes.json();
						const primary = emails.find(e => e.primary && e.verified) || emails[0];
						if (primary) email = primary.email;
					}
				} catch (_) {}
			}

			userInfo = {
				oauthUserId: `github:${ghUser.id}`,
				username: ghUser.login || `gh_${ghUser.id}`,
				name: ghUser.name || ghUser.login || 'GitHub User',
				avatar: ghUser.avatar_url || '',
				email: email || '',
				active: 1,
				trustLevel: 1,
				silenced: 0
			};
		} else if (providerKey === 'google') {
			const formBody = new URLSearchParams();
			formBody.append('client_id', config.clientId);
			formBody.append('client_secret', config.clientSecret);
			formBody.append('code', code);
			formBody.append('redirect_uri', callbackUri);
			formBody.append('grant_type', 'authorization_code');

			const tokenRes = await fetch(meta.tokenUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: formBody.toString()
			});
			if (!tokenRes.ok) {
				const errText = await tokenRes.text();
				throw new BizError(`Google token exchange failed: ${errText}`);
			}
			const tokenData = await tokenRes.json();
			const userRes = await fetch(meta.userInfoUrl, {
				headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
			});
			if (!userRes.ok) throw new BizError('Failed to fetch Google user profile');
			const gUser = await userRes.json();

			userInfo = {
				oauthUserId: `google:${gUser.sub}`,
				username: gUser.email ? gUser.email.split('@')[0] : `google_${gUser.sub}`,
				name: gUser.name || gUser.given_name || 'Google User',
				avatar: gUser.picture || '',
				email: gUser.email || '',
				active: 1,
				trustLevel: 1,
				silenced: 0
			};
		} else if (providerKey === 'microsoft') {
			const tenant = config.tenant || 'common';
			const tokenUrl = meta.tokenUrl.replace('{tenant}', tenant);
			const formBody = new URLSearchParams();
			formBody.append('client_id', config.clientId);
			formBody.append('client_secret', config.clientSecret);
			formBody.append('code', code);
			formBody.append('redirect_uri', callbackUri);
			formBody.append('grant_type', 'authorization_code');

			const tokenRes = await fetch(tokenUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: formBody.toString()
			});
			if (!tokenRes.ok) {
				const errText = await tokenRes.text();
				throw new BizError(`Microsoft token exchange failed: ${errText}`);
			}
			const tokenData = await tokenRes.json();
			const userRes = await fetch(meta.userInfoUrl, {
				headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
			});
			if (!userRes.ok) throw new BizError('Failed to fetch Microsoft user profile');
			const msUser = await userRes.json();
			const msEmail = msUser.mail || msUser.userPrincipalName || '';

			userInfo = {
				oauthUserId: `microsoft:${msUser.id}`,
				username: msEmail ? msEmail.split('@')[0] : `ms_${msUser.id}`,
				name: msUser.displayName || 'Microsoft User',
				avatar: '',
				email: msEmail,
				active: 1,
				trustLevel: 1,
				silenced: 0
			};
		} else if (providerKey === 'apple') {
			let appleSub = '';
			let appleEmail = '';
			if (id_token) {
				try {
					const parts = id_token.split('.');
					if (parts.length >= 2) {
						const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
						appleSub = payload.sub;
						appleEmail = payload.email || '';
					}
				} catch (_) {}
			}
			if (!appleSub && code && config.clientSecret) {
				const formBody = new URLSearchParams();
				formBody.append('client_id', config.clientId);
				formBody.append('client_secret', config.clientSecret);
				formBody.append('code', code);
				formBody.append('grant_type', 'authorization_code');
				const tokenRes = await fetch(meta.tokenUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: formBody.toString()
				});
				if (tokenRes.ok) {
					const tokenData = await tokenRes.json();
					if (tokenData.id_token) {
						const parts = tokenData.id_token.split('.');
						const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
						appleSub = payload.sub;
						appleEmail = payload.email || appleEmail;
					}
				}
			}
			if (!appleSub) throw new BizError('Failed to extract Apple user identity');

			userInfo = {
				oauthUserId: `apple:${appleSub}`,
				username: appleEmail ? appleEmail.split('@')[0] : `apple_${appleSub.slice(0, 8)}`,
				name: 'Apple User',
				avatar: '',
				email: appleEmail,
				active: 1,
				trustLevel: 1,
				silenced: 0
			};
		} else if (providerKey === 'custom') {
			if (!config.tokenUrl || !config.userInfoUrl) {
				throw new BizError('Custom provider missing Token URL or UserInfo URL');
			}
			const formBody = new URLSearchParams();
			formBody.append('client_id', config.clientId);
			formBody.append('client_secret', config.clientSecret);
			formBody.append('code', code);
			formBody.append('redirect_uri', callbackUri);
			formBody.append('grant_type', 'authorization_code');

			const tokenRes = await fetch(config.tokenUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Accept': 'application/json'
				},
				body: formBody.toString()
			});
			if (!tokenRes.ok) {
				const errText = await tokenRes.text();
				throw new BizError(`Custom token exchange failed: ${errText}`);
			}
			const tokenData = await tokenRes.json();
			const accessToken = tokenData.access_token;

			const userRes = await fetch(config.userInfoUrl, {
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Accept': 'application/json'
				}
			});
			if (!userRes.ok) throw new BizError('Failed to fetch user profile from custom provider');
			const cUser = await userRes.json();
			const rawId = cUser.sub || cUser.id || cUser.userId || cUser.uid || cUser.email;
			if (!rawId) throw new BizError('Custom user profile missing identifier (sub/id)');

			const email = cUser.email || '';
			userInfo = {
				oauthUserId: `custom:${rawId}`,
				username: cUser.preferred_username || cUser.username || (email ? email.split('@')[0] : `user_${rawId}`),
				name: cUser.name || cUser.displayName || cUser.username || (config.name || 'SSO User'),
				avatar: cUser.avatar || cUser.picture || '',
				email: email,
				active: 1,
				trustLevel: 1,
				silenced: 0
			};
		}

		if (!userInfo) {
			throw new BizError('OAuth provider authorization failed');
		}

		const oauthRow = await this.saveUser(c, userInfo);
		let userRow = null;
		if (oauthRow.userId && oauthRow.userId > 0) {
			userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);
		}

		// Auto associate by email if user with same email exists in Epomail
		if (!userRow && userInfo.email) {
			const existingUser = await userService.selectByEmail(c, userInfo.email);
			if (existingUser) {
				await orm(c).update(oauth).set({ userId: existingUser.userId }).where(eq(oauth.oauthUserId, userInfo.oauthUserId)).run();
				oauthRow.userId = existingUser.userId;
				userRow = existingUser;
			}
		}

		if (!userRow) {
			return { userInfo: oauthRow, token: null };
		}

		const jwtToken = await loginService.login(c, { email: userRow.email, password: null }, true);
		return { userInfo: oauthRow, token: jwtToken };
	},

	async verifyProvider(c, providerKey, config = {}) {
		if (!config.clientId) {
			throw new BizError(`Client ID is required for ${providerKey}`);
		}
		if (providerKey === 'custom') {
			if (!config.authUrl || !config.tokenUrl || !config.userInfoUrl) {
				throw new BizError('Auth URL, Token URL, and UserInfo URL are required for Custom provider');
			}
			try {
				new URL(config.authUrl);
				new URL(config.tokenUrl);
				new URL(config.userInfoUrl);
			} catch (_) {
				throw new BizError('Invalid URL format for Custom provider endpoints');
			}
			// Probe connectivity to tokenUrl host
			try {
				const testRes = await fetch(config.tokenUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: 'grant_type=client_credentials'
				});
				return { success: true, status: testRes.status, message: 'Custom endpoint connectivity verified' };
			} catch (e) {
				throw new BizError(`Custom endpoint unreachable: ${e.message}`);
			}
		}

		const testUrls = {
			github: 'https://api.github.com',
			google: 'https://accounts.google.com/.well-known/openid-configuration',
			microsoft: `https://login.microsoftonline.com/${config.tenant || 'common'}/v2.0/.well-known/openid-configuration`,
			apple: 'https://appleid.apple.com/.well-known/openid-configuration'
		};

		const url = testUrls[providerKey];
		if (url) {
			try {
				const res = await fetch(url, { method: 'GET', headers: { 'User-Agent': 'Epocanvas-Mail' } });
				if (!res.ok && res.status >= 500) {
					throw new BizError(`Provider endpoint responded with status ${res.status}`);
				}
				return { success: true, status: res.status, message: `${providerKey} connectivity verified successfully` };
			} catch (e) {
				throw new BizError(`Provider connectivity check failed: ${e.message}`);
			}
		}

		return { success: true, message: 'Provider configuration verified' };
	},

	async bindUser(c, params) {

		const { email, oauthUserId, code } = params;

		const oauthRow = await this.getById(c, oauthUserId);

		let userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (userRow) {
			throw new BizError('用户已绑定有邮箱')
		}

		await loginService.register(c, { email, password: cryptoUtils.genRandomPwd(), code }, true);

		userRow = await userService.selectByEmail(c, email);

		orm(c).update(oauth).set({ userId: userRow.userId }).where(eq(oauth.oauthUserId, oauthUserId)).run();
		const jwtToken = await loginService.login(c, { email, password: null }, true);

		return { userInfo: oauthRow, token: jwtToken}
	},

	async linuxDoLogin(c, params) {

		const { code } = params;

		let token = '';
		let userInfo = {}

		const reqParams = new URLSearchParams()
		reqParams.append('client_id', c.env.linuxdo_client_id)
		reqParams.append('client_secret', c.env.linuxdo_client_secret)
		reqParams.append('code', code)
		reqParams.append('redirect_uri', c.env.linuxdo_callback_url)
		reqParams.append('grant_type', 'authorization_code')

		const tokenRes = await fetch("https://connect.linux.do/oauth2/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: reqParams.toString()
		})

		if (!tokenRes.ok) {
			throw new BizError(tokenRes.statusText)
		}

		token = await tokenRes.json()

		const userRes = await fetch('https://connect.linux.do/api/user', {
			headers: {
				Authorization: 'Bearer ' + token.access_token
			}
		});

		if (!userRes.ok) {
			throw new BizError(userRes.statusText)
		}

		userInfo = await userRes.json();

		userInfo.oauthUserId = String(userInfo.id);
		userInfo.active = userInfo.active ? 0 : 1;
		userInfo.silenced = userInfo.silenced ? 0 : 1;
		userInfo.trustLevel = userInfo.trust_level;
		userInfo.avatar = userInfo.avatar_url;

		const  oauthRow = await this.saveUser(c, userInfo);
		const userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (!userRow) {
			return { userInfo: oauthRow, token: null }
		}

		const JwtToken = await loginService.login(c, { email: userRow.email, password: null }, true);
		return { userInfo: oauthRow, token: JwtToken }
	},

	async saveUser(c, userInfo) {

		const userInfoRow = await this.getById(c, userInfo.oauthUserId);

		if (!userInfoRow) {
			return await orm(c).insert(oauth).values(userInfo).returning().get();
		} else {
			return await orm(c).update(oauth).set(userInfo).where(eq(oauth.oauthUserId, userInfo.oauthUserId)).returning().get();
		}

	},

	async getById(c, oauthUserId) {
		return await orm(c).select().from(oauth).where(eq(oauth.oauthUserId, oauthUserId)).get();
	},

	async deleteByUserId(c, userId) {
		await this.deleteByUserIds(c, [userId]);
	},

	async deleteByUserIds(c, userIds) {
		await orm(c).delete(oauth).where(inArray(oauth.userId, userIds)).run();
	},

	//定时任务凌晨清除未绑定邮箱的oauth用户
	async clearNoBindOathUser(c) {
		await orm(c).delete(oauth).where(eq(oauth.userId, 0)).run();
	},

}

export default oauthService
