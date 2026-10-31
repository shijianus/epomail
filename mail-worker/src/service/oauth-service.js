import BizError from "../error/biz-error";
import orm from "../entity/orm";
import { oauth } from "../entity/oauth";
import { eq, inArray, sql, and } from 'drizzle-orm';
import userService from "./user-service";
import loginService from "./login-service";
import cryptoUtils from "../utils/crypto-utils";
import settingService from "./setting-service";
import regKeyService from "./reg-key-service";
import { verifyAppleIdToken } from "../utils/oauth-jwt-utils";
import rateLimit from '../utils/rate-limit.js';
import { isSafePublicUrl } from '../utils/url-utils.js';
import { getUserDb } from '../utils/db-accessor.js';
import oneTimeCredential, { OTC_PURPOSE } from '../utils/one-time-credential.js';
import oauthBindClaim from '../utils/oauth-bind-claim.js';
import KvConst from '../const/kv-const.js';

const OAUTH_STATE_TTL_SECONDS = 600;
const OAUTH_LOGIN_CODE_TTL_SECONDS = 60;
const OAUTH_BIND_TTL_SECONDS = 600;

function randomToken() {
	return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
}

function defaultCallbackUri(c, providerKey) {
	return c.req ? `${new URL(c.req.url).origin}/api/oauth/callback/${providerKey}` : '';
}

/**
 * Only the instance callback (or the explicitly configured provider callback)
 * may receive an authorization code. Reflecting a caller-supplied URL here
 * would turn the provider's registered redirect into an open redirect/code
 * interception primitive.
 */
function resolveAllowedRedirectUri(c, providerKey, redirectUri, config) {
	const expected = defaultCallbackUri(c, providerKey);
	const configured = typeof config.redirectUri === 'string' ? config.redirectUri.trim() : '';
	if (!redirectUri) {
		return configured || expected;
	}
	if (redirectUri === expected || (configured && redirectUri === configured)) {
		return redirectUri;
	}
	throw new BizError('Invalid redirect_uri for OAuth callback');
}

const OIDC_NONCE_PROVIDERS = new Set(['google', 'microsoft', 'apple', 'custom']);
const PKCE_PROVIDERS = new Set(['github', 'google', 'microsoft', 'apple', 'custom', 'linuxdo']);

function generateCodeVerifier() {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function computeCodeChallengeS256(verifier) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	const bytes = new Uint8Array(digest);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function providerFromIdentity(oauthUserId) {
	const value = typeof oauthUserId === 'string' ? oauthUserId : '';
	const idx = value.indexOf(':');
	if (idx > 0) {
		return value.slice(0, idx).toLowerCase();
	}
	return 'linuxdo';
}

function assertSafeCustomEndpoints(config) {
	for (const field of ['authUrl', 'tokenUrl', 'userInfoUrl']) {
		if (!isSafePublicUrl(config?.[field])) {
			throw new BizError(`Custom provider ${field} is invalid or points to a restricted network`);
		}
	}
}

function splitLoginResult(loginResult) {
	// loginService.login returns an object in every modern path:
	//   { token, email, userId }                      → authenticated session
	//   { mfaRequired: true, tempToken, ... }         → TOTP/passkey challenge
	//   { isRestricted: true, restrictedToken, ... }  → banned-account notice
	// Treating every object as an MFA challenge discarded the mailbox token on
	// ordinary OAuth logins, so the callback fell through to the bind-proof
	// branch and the user never received a session.
	if (loginResult && typeof loginResult === 'object') {
		if (loginResult.mfaRequired || loginResult.isRestricted) {
			return { token: null, mfa: loginResult };
		}
		if (typeof loginResult.token === 'string' && loginResult.token) {
			return { token: loginResult.token };
		}
		throw new BizError('Unexpected login result shape');
	}
	return { token: loginResult };
}

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

	async assertProviderEnabled(c, providerKey) {
		const normalizedKey = typeof providerKey === 'string' ? providerKey.trim().toLowerCase() : '';
		const settingData = await settingService.query(c);
		if (Number(settingData?.oauthLoginEnabled) !== 1) {
			throw new BizError('OAuth login is currently disabled', 403, 'oauth_disabled');
		}

		if (normalizedKey === 'linuxdo') {
			const linuxdoOn = settingData?.linuxdoSwitch === true
				|| c.env?.linuxdo_switch === true
				|| c.env?.linuxdo_switch === 'true';
			if (!linuxdoOn) {
				throw new BizError('Provider linuxdo is disabled', 403, 'oauth_provider_disabled');
			}
			const cfg = await this.getProviderConfig(c, 'linuxdo');
			if (!cfg.clientId || !cfg.clientSecret || !cfg.callbackUrl) {
				throw new BizError('Provider linuxdo is missing required credentials or callback URL', 503, 'oauth_provider_unconfigured');
			}
			return cfg;
		}

		if (!PROVIDER_METADATA[normalizedKey]) {
			throw new BizError(`Unsupported provider: ${providerKey}`, 400, 'oauth_provider_unsupported');
		}

		let providers = settingData?.oauthProviders;
		if (typeof providers === 'string') {
			try { providers = JSON.parse(providers); } catch (_) { providers = {}; }
		} else if (!providers || typeof providers !== 'object') {
			providers = {};
		}

		const rawCfg = providers[normalizedKey];
		const isExplicitlyEnabled = Boolean(rawCfg && (rawCfg.enabled === 1 || rawCfg.enabled === true));
		if (!isExplicitlyEnabled) {
			throw new BizError(`Provider ${normalizedKey} is disabled`, 403, 'oauth_provider_disabled');
		}

		const config = await this.getProviderConfig(c, normalizedKey);
		const hasClientId = Boolean(config?.clientId && String(config.clientId).trim());
		const hasClientSecret = Boolean(config?.clientSecret && String(config.clientSecret).trim());
		if (!hasClientId || !hasClientSecret) {
			throw new BizError(`Provider ${normalizedKey} is not completely configured`, 503, 'oauth_provider_unconfigured');
		}

		if (normalizedKey === 'custom') {
			if (!config.authUrl || !config.tokenUrl || !config.userInfoUrl) {
				throw new BizError('Custom provider missing Auth URL, Token URL, or UserInfo URL', 503, 'oauth_provider_unconfigured');
			}
			assertSafeCustomEndpoints(config);
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
			const rawCfg = providers[key];
			const isExplicitlyEnabled = Boolean(rawCfg && (rawCfg.enabled === 1 || rawCfg.enabled === true));
			if (!isExplicitlyEnabled) continue;

			const cfg = await this.getProviderConfig(c, key);
			const hasClientId = Boolean(cfg?.clientId && String(cfg.clientId).trim());
			const hasClientSecret = Boolean(cfg?.clientSecret && String(cfg.clientSecret).trim());
			if (!hasClientId || !hasClientSecret) continue;

			if (key === 'custom') {
				if (!cfg.authUrl || !cfg.tokenUrl || !cfg.userInfoUrl) continue;
				try {
					assertSafeCustomEndpoints(cfg);
				} catch (_) {
					continue;
				}
			}

			const meta = PROVIDER_METADATA[key];
			list.push({
				key,
				name: (key === 'custom' && cfg.name) ? cfg.name : meta.name,
				icon: meta.icon
			});
		}
		return list;
	},

	async getAuthorizeUrl(c, providerKey, redirectUri = '', state = '', options = {}) {
		// A login flow without a client state cannot be distinguished from an
		// attacker-initiated one: the callback would echo no `oauth_client_state`
		// and the login page's empty-vs-empty comparison would pass (login CSRF).
		// Bind intents are exempt because the server-side `intent` already binds
		// the callback to the initiating session.
		const isBindIntent = Boolean(options.intent && options.intent.mode === 'bind');
		if (!isBindIntent && (typeof state !== 'string' || !state.trim())) {
			throw new BizError('Missing OAuth client state', 400, 'oauth_state_required');
		}

		const normalizedProvider = typeof providerKey === 'string' ? providerKey.trim().toLowerCase() : '';
		const config = await this.assertProviderEnabled(c, normalizedProvider);
		const meta = PROVIDER_METADATA[normalizedProvider];

		let authUrl = meta?.authUrl || '';
		if (normalizedProvider === 'microsoft') {
			const tenant = config.tenant || 'common';
			authUrl = authUrl.replace('{tenant}', tenant);
		} else if (normalizedProvider === 'custom') {
			authUrl = config.authUrl;
			if (!authUrl) throw new BizError('Custom provider authorization URL (authUrl) is required');
			assertSafeCustomEndpoints(config);
		} else if (normalizedProvider === 'linuxdo') {
			authUrl = 'https://connect.linux.do/oauth2/authorize';
		}

		const finalRedirectUri = resolveAllowedRedirectUri(c, normalizedProvider, redirectUri, config);
		const scope = config.scope || meta?.defaultScope || 'openid email profile';

		// Server-side state binds the callback to this browser flow. The nonce
		// is additionally echoed by OIDC providers inside the id_token, and
		// PKCE binds the authorization code to this Worker's token exchange.
		//
		// The state is stored in D1 so that consumption is a single atomic
		// compare-and-set. It is bound to the provider: a state minted for one
		// provider can never be redeemed on another provider's callback.
		const nonce = randomToken();
		const codeVerifier = PKCE_PROVIDERS.has(normalizedProvider) ? generateCodeVerifier() : '';
		const codeChallenge = codeVerifier ? await computeCodeChallengeS256(codeVerifier) : '';
		const stateToken = await oneTimeCredential.issue(c, {
			purpose: OTC_PURPOSE.STATE,
			provider: normalizedProvider,
			payload: {
				redirectUri: finalRedirectUri,
				nonce,
				codeVerifier,
				clientState: typeof state === 'string' ? state : '',
				// Server-only intent. The public /oauth/authorize route never
				// passes options, so a caller cannot mint an authenticated
				// "bind to account X" flow on its own.
				intent: options.intent && typeof options.intent === 'object' ? options.intent : null,
				createdAt: Date.now()
			},
			ttlSeconds: OAUTH_STATE_TTL_SECONDS
		});

		const url = new URL(authUrl);
		url.searchParams.set('client_id', config.clientId);
		if (finalRedirectUri) {
			url.searchParams.set('redirect_uri', finalRedirectUri);
		}
		url.searchParams.set('response_type', 'code');
		url.searchParams.set('scope', scope);
		url.searchParams.set('state', stateToken);
		if (codeChallenge) {
			url.searchParams.set('code_challenge', codeChallenge);
			url.searchParams.set('code_challenge_method', 'S256');
		}
		if (OIDC_NONCE_PROVIDERS.has(normalizedProvider)) {
			url.searchParams.set('nonce', nonce);
		}
		if (normalizedProvider === 'apple') {
			url.searchParams.set('response_mode', 'form_post');
		}
		return url.toString();
	},

	async consumeState(c, providerKey, state) {
		if (!state || typeof state !== 'string') {
			throw new BizError('Missing OAuth state', 400);
		}
		// The provider binding is part of the atomic predicate: a request on
		// the wrong provider matches zero rows and therefore cannot burn the
		// legitimate flow's state.
		const record = await oneTimeCredential.consume(c, {
			purpose: OTC_PURPOSE.STATE,
			token: state,
			provider: providerKey
		});
		if (!record || record.provider !== providerKey) {
			throw new BizError('Invalid or expired OAuth state', 400);
		}
		const row = record.payload;
		if (!row || !row.redirectUri) {
			throw new BizError('Invalid or expired OAuth state', 400);
		}
		// Preserve the shape the callback (and its tests) expect: provider was
		// previously part of the stored JSON, now it is a bound column.
		return { ...row, provider: record.provider };
	},

	async createLoginExchangeCode(c, { token = null, userInfo, provider, mfa = null }) {
		if (!token && !mfa) throw new BizError('Missing OAuth login result');
		return await oneTimeCredential.issue(c, {
			purpose: OTC_PURPOSE.LOGIN_CODE,
			provider: provider || '',
			oauthUserId: userInfo?.oauthUserId || '',
			payload: {
				token,
				mfa,
				provider,
				userInfo,
				createdAt: Date.now()
			},
			ttlSeconds: OAUTH_LOGIN_CODE_TTL_SECONDS
		});
	},

	async consumeLoginExchangeCode(c, code) {
		if (!code || typeof code !== 'string') {
			throw new BizError('Missing OAuth login code', 401);
		}
		const record = await oneTimeCredential.consume(c, {
			purpose: OTC_PURPOSE.LOGIN_CODE,
			token: code
		});
		const row = record?.payload;
		if (!row || (!row.token && !row.mfa) || !row.createdAt) {
			throw new BizError('Invalid or expired OAuth login code', 401);
		}
		// Expiry is enforced by the storage predicate; keep the explicit check
		// as defence in depth against a misconfigured TTL.
		if (Date.now() - Number(row.createdAt) > OAUTH_LOGIN_CODE_TTL_SECONDS * 1000) {
			throw new BizError('Expired OAuth login code', 401);
		}
		const codeProvider = record?.provider || row.provider || '';
		if (codeProvider) {
			await this.assertProviderEnabled(c, codeProvider);
		}
		return row;
	},

	/**
	 * Resolve the provider identity behind a completed authorization.
	 *
	 * This is a read-only step with respect to local accounts: it performs the
	 * provider HTTP exchange and returns the verified identity, but creates no
	 * OAuth row, links nothing, mints no session and never trusts a
	 * client-supplied email as proof of ownership. Both the login flow and the
	 * logged-in identity-bind flow go through this function so their identity
	 * checks cannot drift apart.
	 */
	async fetchProviderUserInfo(c, providerKey, params = {}) {
		const { code, id_token, redirectUri, nonce, codeVerifier } = params;
		if (!code && !id_token) {
			throw new BizError('Authorization code or ID token is required');
		}
		const normalizedKey = typeof providerKey === 'string' ? providerKey.trim().toLowerCase() : '';
		if (normalizedKey === 'linuxdo') {
			return await this.fetchLinuxDoUserInfo(c, params);
		}

		const config = await this.getProviderConfig(c, normalizedKey);
		if (!config || !String(config.clientId || '').trim() || !String(config.clientSecret || '').trim()) {
			throw new BizError(`Provider ${normalizedKey || providerKey} is not completely configured`, 503, 'oauth_provider_unconfigured');
		}
		const meta = PROVIDER_METADATA[normalizedKey];
		if (!meta) {
			throw new BizError(`Unsupported provider: ${providerKey}`);
		}

		const callbackUri = resolveAllowedRedirectUri(c, normalizedKey, redirectUri, config);
		let userInfo = null;

		if (normalizedKey === 'github') {
			const ghTokenPayload = {
				client_id: config.clientId,
				client_secret: config.clientSecret,
				code,
				redirect_uri: callbackUri
			};
			if (codeVerifier) {
				ghTokenPayload.code_verifier = codeVerifier;
			}
			const tokenRes = await fetch(meta.tokenUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json',
					'User-Agent': 'Epocanvas-Mail'
				},
				body: JSON.stringify(ghTokenPayload)
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

			let email = '';
			try {
				const emailsRes = await fetch('https://api.github.com/user/emails', {
					headers: {
						'Authorization': `Bearer ${accessToken}`,
						'User-Agent': 'Epocanvas-Mail'
					}
				});
				if (emailsRes.ok) {
					const emails = await emailsRes.json();
					const verified = Array.isArray(emails) ? emails.filter(e => e.verified) : [];
					const primary = verified.find(e => e.primary) || verified[0];
					if (primary) email = primary.email;
				}
			} catch (_) {}

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
		} else if (normalizedKey === 'google') {
			const formBody = new URLSearchParams();
			formBody.append('client_id', config.clientId);
			formBody.append('client_secret', config.clientSecret);
			formBody.append('code', code);
			formBody.append('redirect_uri', callbackUri);
			formBody.append('grant_type', 'authorization_code');
			if (codeVerifier) formBody.append('code_verifier', codeVerifier);

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
			const googleEmailVerified = gUser.email_verified === true || gUser.verified_email === true;

			userInfo = {
				oauthUserId: `google:${gUser.sub}`,
				username: gUser.email ? gUser.email.split('@')[0] : `google_${gUser.sub}`,
				name: gUser.name || gUser.given_name || 'Google User',
				avatar: gUser.picture || '',
				email: googleEmailVerified ? (gUser.email || '') : '',
				active: 1,
				trustLevel: 1,
				silenced: 0
			};
		} else if (normalizedKey === 'microsoft') {
			const tenant = config.tenant || 'common';
			const tokenUrl = meta.tokenUrl.replace('{tenant}', tenant);
			const formBody = new URLSearchParams();
			formBody.append('client_id', config.clientId);
			formBody.append('client_secret', config.clientSecret);
			formBody.append('code', code);
			formBody.append('redirect_uri', callbackUri);
			formBody.append('grant_type', 'authorization_code');
			if (codeVerifier) formBody.append('code_verifier', codeVerifier);

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
				// Microsoft Graph does not guarantee that `mail` is verified.
				// Do not auto-link an existing Epomail account by an unverified
				// address; the user can still bind after authenticating.
				email: '',
				active: 1,
				trustLevel: 1,
				silenced: 0
			};
		} else if (normalizedKey === 'apple') {
			let claims = null;

			if (code && config.clientSecret) {
				const formBody = new URLSearchParams();
				formBody.append('client_id', config.clientId);
				formBody.append('client_secret', config.clientSecret);
				formBody.append('code', code);
				formBody.append('grant_type', 'authorization_code');
				if (callbackUri) formBody.append('redirect_uri', callbackUri);
				if (codeVerifier) formBody.append('code_verifier', codeVerifier);

				const tokenRes = await fetch(meta.tokenUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: formBody.toString()
				});
				if (!tokenRes.ok) {
					throw new BizError(`Apple token exchange failed: HTTP ${tokenRes.status}`);
				}
				const tokenData = await tokenRes.json();
				if (!tokenData.id_token) {
					throw new BizError('Apple token exchange did not return an id_token');
				}
				claims = await verifyAppleIdToken(c, tokenData.id_token, config.clientId, { nonce });
			} else if (id_token) {
				// Never trust a client-supplied identity token without checking
				// its RS256 signature, issuer and audience.
				claims = await verifyAppleIdToken(c, id_token, config.clientId, { nonce });
			} else {
				throw new BizError('Apple authorization requires a code or a verified id_token');
			}

			const appleSub = claims?.sub;
			if (!appleSub) throw new BizError('Failed to extract Apple user identity');

			const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
			const appleEmail = emailVerified ? (claims.email || '') : '';

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
		} else if (normalizedKey === 'custom') {
			if (!config.tokenUrl || !config.userInfoUrl) {
				throw new BizError('Custom provider missing Token URL or UserInfo URL');
			}
			assertSafeCustomEndpoints(config);
			const formBody = new URLSearchParams();
			formBody.append('client_id', config.clientId);
			formBody.append('client_secret', config.clientSecret);
			formBody.append('code', code);
			formBody.append('redirect_uri', callbackUri);
			formBody.append('grant_type', 'authorization_code');
			if (codeVerifier) formBody.append('code_verifier', codeVerifier);

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
			const customEmailVerified = cUser.email_verified === true || cUser.email_verified === 'true';
			userInfo = {
				oauthUserId: `custom:${rawId}`,
				username: cUser.preferred_username || cUser.username || (email ? email.split('@')[0] : `user_${rawId}`),
				name: cUser.name || cUser.displayName || cUser.username || (config.name || 'SSO User'),
				avatar: cUser.avatar || cUser.picture || '',
				email: customEmailVerified ? email : '',
				active: 1,
				trustLevel: 1,
				silenced: 0
			};
		}

		if (!userInfo) {
			throw new BizError('OAuth provider authorization failed');
		}
		return userInfo;
	},

	async exchangeCodeAndLogin(c, providerKey, params = {}) {
		await rateLimit.check(c, { scope: 'oauth-login', limit: 30, windowSeconds: 900 });
		const normalizedKey = typeof providerKey === 'string' ? providerKey.trim().toLowerCase() : '';
		await this.assertProviderEnabled(c, normalizedKey);
		const userInfo = await this.fetchProviderUserInfo(c, normalizedKey, params);
		return await this.finishIdentityLogin(c, normalizedKey, userInfo);
	},

	/**
	 * Complete a provider authentication for an identity that was already
	 * resolved from a verified provider response.
	 *
	 * Two outcomes are possible and both are deliberate:
	 *   - the identity already belongs to a mailbox: issue a session;
	 *   - the identity is unknown/unbound: return a single-use bind proof so a
	 *     caller cannot bind by guessing an oauthUserId.
	 *
	 * The verified-email auto-link below is a *login* convenience only. The
	 * logged-in bind flow never calls it, so an address returned by a
	 * third-party provider can never attach an identity to an account.
	 */
	async finishIdentityLogin(c, providerKey, userInfo) {
		const oauthRow = await this.saveUser(c, userInfo);
		let userRow = null;
		if (oauthRow.userId && oauthRow.userId > 0) {
			userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);
		}

		// Auto associate by email if user with same email exists in Epomail.
		// The write is conditional on "this row is still unbound and no row for
		// the identity is bound", so a concurrent bind can never re-point an
		// already associated identity at a second account.
		if (!userRow && userInfo.email && !(Number(oauthRow.userId) > 0)) {
			const linked = await this.linkVerifiedEmail(c, userInfo.oauthUserId, userInfo.email);
			if (linked) {
				oauthRow.userId = linked.userId;
				userRow = linked;
			}
		}

		if (!userRow) {
			// Prove possession of the completed OAuth flow before allowing an
			// account to be created/bound. Without this one-time token any
			// caller could submit a guessed oauthUserId.
			const bindToken = await this.createBindProof(c, {
				oauthUserId: oauthRow.oauthUserId,
				provider: providerKey
			});
			return { userInfo: oauthRow, token: null, bindToken };
		}

		const loginResult = await loginService.login(c, {
			email: userRow.email,
			password: null,
			authMethod: 'oauth',
			authProvider: providerKey
		}, true);
		return { userInfo: oauthRow, ...splitLoginResult(loginResult) };
	},

	async verifyProvider(c, providerKey, config = {}) {
		if (!config.clientId) {
			throw new BizError(`Client ID is required for ${providerKey}`);
		}
		if (providerKey === 'custom') {
			if (!config.authUrl || !config.tokenUrl || !config.userInfoUrl) {
				throw new BizError('Auth URL, Token URL, and UserInfo URL are required for Custom provider');
			}
			assertSafeCustomEndpoints(config);
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

	/**
	 * Mint a one-time proof that a completed provider flow produced this
	 * OAuth identity. The proof is stored against the identity so a caller
	 * cannot redeem it for a different oauthUserId or provider.
	 */
	async createBindProof(c, { oauthUserId, provider }) {
		if (!oauthUserId || typeof oauthUserId !== 'string') {
			throw new BizError('Missing OAuth identity for bind proof', 500);
		}
		return await oneTimeCredential.issue(c, {
			purpose: OTC_PURPOSE.BIND,
			provider: provider || '',
			oauthUserId,
			payload: { oauthUserId, provider: provider || '', createdAt: Date.now() },
			ttlSeconds: OAUTH_BIND_TTL_SECONDS
		});
	},

	/**
	 * Bind an unbound provider identity to a locally created mailbox account.
	 *
	 * Ordering is the whole security argument:
	 *   1. inspect the proof (read only),
	 *   2. check the identity is unbound (read only),
	 *   3. run the full registration policy without side effects,
	 *   4. acquire the per-identity lease (D1 primary-key interlock),
	 *   5. spend the proof with one atomic CAS,
	 *   6. create the account, recording it on the lease,
	 *   7. commit the association with one conditional UPDATE that also
	 *      re-checks the lease and the unbound state,
	 *   8. only then create a session.
	 *
	 * Everything before step 5 is retryable with the same proof. Nothing after
	 * step 5 ever resurrects it. A rejected registration therefore costs the
	 * user an invitation-code correction, not a full OAuth round trip.
	 */
	async bindUser(c, params) {

		await rateLimit.check(c, { scope: 'oauth-bind', limit: 10, windowSeconds: 900 });

		const { email, oauthUserId, code, bindToken, provider } = params;

		if (!bindToken || typeof bindToken !== 'string') {
			throw new BizError('Missing OAuth bind proof; restart the OAuth login flow', 410, 'bind_proof_invalid');
		}
		if (!oauthUserId || typeof oauthUserId !== 'string' || oauthUserId.length > 512) {
			throw new BizError('Invalid OAuth bind proof; restart the OAuth login flow', 410, 'bind_proof_invalid');
		}
		if (provider !== undefined && provider !== null && provider !== ''
			&& (typeof provider !== 'string' || provider.length > 64)) {
			throw new BizError('Invalid OAuth bind proof; restart the OAuth login flow', 410, 'bind_proof_invalid');
		}

		const boundProvider = provider || null;

		// Read-only proof probe. A forged, expired or mismatched proof is
		// rejected here and stays spendable (it simply is not ours to spend).
		const proof = await oneTimeCredential.inspect(c, {
			purpose: OTC_PURPOSE.BIND,
			token: bindToken,
			provider: boundProvider,
			oauthUserId
		});
		if (!proof || proof.expired) {
			throw new BizError('Invalid or expired OAuth bind proof; restart the OAuth login flow', 410, 'bind_proof_invalid');
		}

		let oauthRow = await this.getById(c, oauthUserId);
		if (!oauthRow) {
			throw new BizError('OAuth identity not found', 404, 'bind_identity_missing');
		}

		// Idempotent final-state confirmation. The identity is already bound,
		// so the bind succeeded at some earlier point (possibly a request whose
		// response was lost). Report it without minting a session from a proof
		// that may already be spent.
		if (Number(oauthRow.userId) > 0) {
			return { userInfo: oauthRow, token: null, alreadyBound: true };
		}

		const effectiveProvider = (proof.provider || boundProvider || providerFromIdentity(oauthUserId)).toLowerCase();
		await this.assertProviderEnabled(c, effectiveProvider);

		if (proof.consumed) {
			// The proof was spent by an attempt that has not committed the
			// association. An active lease means it is still running; otherwise
			// it failed after the commit point and only a new flow can help.
			const activeClaim = await oauthBindClaim.inspect(c, { oauthUserId });
			if (activeClaim && activeClaim.active) {
				throw new BizError('OAuth binding is already in progress; retry shortly', 425, 'bind_in_progress');
			}
			throw new BizError('OAuth bind proof was already used; restart the OAuth login flow', 409, 'bind_proof_used');
		}

		// Full policy preflight. No writes and no invite-slot consumption, so
		// a rejection here leaves the proof valid for a corrected retry.
		const password = cryptoUtils.genRandomPwd();
		try {
			await loginService.validateRegistration(c, { email, password, code }, true);
		} catch (err) {
			if (err?.name === 'BizError') {
				// All preflight failures are retryable with the same proof, so
				// they are classified as client-side rejection. Rate limiting is
				// preserved as its own signal.
				throw new BizError(err.message, err.code === 429 ? 429 : 400, err.errorCode || 'bind_policy_rejected');
			}
			console.error('OAuth bind preflight failed:', err);
			throw new BizError('OAuth binding failed; retry with the same proof', 400, 'bind_failed');
		}

		// Claim before spending. If two flows for the same identity arrive
		// together, only one reaches the commit point; the loser keeps its
		// proof intact.
		const claimResult = await oauthBindClaim.acquire(c, { oauthUserId, email });
		if (!claimResult) {
			throw new BizError('Another OAuth binding is in progress for this identity; retry shortly', 425, 'bind_in_progress');
		}
		const { claimToken, stale } = claimResult;

		let proofSpent = false;

		try {
			// Re-check after acquiring: an email auto-link or another flow may
			// have bound the identity between the first read and the lease.
			oauthRow = await this.getById(c, oauthUserId);
			if (!oauthRow) {
				throw new BizError('OAuth identity not found', 404, 'bind_identity_missing');
			}
			if (Number(oauthRow.userId) > 0) {
				return { userInfo: oauthRow, token: null, alreadyBound: true };
			}

			// A previous holder crashed after creating an account but before
			// binding it. The identity is still unbound (checked above), so the
			// abandoned account can be removed. A bound identity never reaches
			// this branch, so a committed association is never deleted.
			if (stale.userId > 0) {
				await this.rollbackRegistration(c, {
					userId: stale.userId,
					code: stale.code,
					reservedRegKey: stale.reservedRegKey
				});
			}

			// Commit point: one atomic compare-and-set. From here on the proof
			// is gone and no failure may attempt to revive it.
			const record = await oneTimeCredential.consume(c, {
				purpose: OTC_PURPOSE.BIND,
				token: bindToken,
				provider: boundProvider,
				oauthUserId
			});
			if (!record) {
				throw new BizError('OAuth bind proof was already used; retry shortly', 425, 'bind_in_progress');
			}
			proofSpent = true;

			// Authoritative registration. The policy is re-evaluated here, so
			// nothing that changed since the preflight can be bypassed.
			const registration = await loginService.register(c, { email, password, code }, true);
			const userId = Number(registration?.userId);
			if (!Number.isInteger(userId) || userId <= 0) {
				throw new BizError('OAuth binding could not create the local account; restart the OAuth login flow', 409, 'bind_commit_failed');
			}

			// Record the account for crash compensation. Losing this marker is
			// not fatal: the atomic finalize below still protects the bind.
			try {
				await oauthBindClaim.recordUser(c, {
					oauthUserId,
					claimToken,
					userId,
					email,
					reservedRegKey: registration.reservedRegKey === true,
					code: typeof code === 'string' ? code : ''
				});
			} catch (err) {
				console.error('Failed to record OAuth bind claim account:', err);
			}

			// Atomic association: lease still ours AND identity still unbound.
			// A false result is a definite "not bound" answer, so the account
			// created above is compensated.
			const bound = await oauthBindClaim.finalize(c, { oauthUserId, claimToken, userId });
			if (!bound) {
				await this.rollbackRegistration(c, {
					userId,
					code,
					reservedRegKey: registration.reservedRegKey === true
				});
				throw new BizError('OAuth identity was bound by another request; restart the OAuth login flow', 409, 'bind_identity_conflict');
			}

			// The account now exists with a server-generated password the user
			// cannot present. Record that exact hash as the eligibility marker:
			// the first user-chosen password changes the stored hash, so the
			// marker invalidates itself without a second write that could be
			// lost. Failing to record it only withholds the convenience; it
			// never weakens authentication, so it must not undo a committed bind.
			try {
				const createdRow = await userService.selectById(c, userId);
				if (createdRow?.password) {
					await c.env.kv.put(KvConst.INITIAL_PASSWORD + userId, createdRow.password);
				}
			} catch (err) {
				console.error('Failed to mark initial password for OAuth account:', err);
			}
		} catch (err) {
			if (!proofSpent) {
				// Nothing irreversible happened; keep the original signal (404,
				// 425, 429, or a storage error) so the client can retry safely.
				throw err;
			}
			if (err?.name === 'BizError' && [409, 410, 425, 429].includes(Number(err.code))) {
				throw err;
			}
			if (err?.name === 'BizError') {
				// The proof is spent, so even a policy rejection now requires a
				// new flow. Preserve the user-facing message.
				throw new BizError(err.message, 409, err.errorCode || 'bind_failed');
			}
			console.error('OAuth binding failed after proof consumption:', err);
			throw new BizError('OAuth binding failed; restart the OAuth login flow', 409, 'bind_failed');
		} finally {
			try {
				await oauthBindClaim.release(c, { oauthUserId, claimToken });
			} catch (err) {
				console.error('Failed to release OAuth bind claim:', err);
			}
		}

		// Session creation is deliberately last. If it fails the association is
		// already durable; report the idempotent outcome instead of asking the
		// client to repeat a flow whose proof is gone.
		try {
			const loginResult = await loginService.login(c, {
				email,
				password: null,
				authMethod: 'oauth',
				authProvider: boundProvider || undefined
			}, true);
			return { userInfo: oauthRow, ...splitLoginResult(loginResult) }
		} catch (err) {
			console.error('OAuth binding committed but session creation failed:', err);
			return { userInfo: oauthRow, token: null, alreadyBound: true };
		}
	},

	/**
	 * Compensate an account created by an OAuth bind attempt that did not
	 * commit. Only a userId obtained by that attempt is removed; the invite
	 * slot is restored only when this attempt reserved it.
	 */
	async rollbackRegistration(c, { userId, code, reservedRegKey } = {}) {
		await loginService.rollbackPartialRegistration(c, userId);
		if (reservedRegKey === true && typeof code === 'string' && code) {
			try {
				await regKeyService.restoreOne(c, code);
			} catch (err) {
				console.error('Failed to restore invite slot after OAuth bind rollback:', err);
			}
		}
	},

	/**
	 * Associate an unbound identity with an existing local account whose
	 * address the provider has verified. The UPDATE only matches while the
	 * identity (all of its rows) is unbound, so a concurrent bind or a second
	 * login can never move an existing association to another account.
	 * Returns the linked user row, or null when nothing was linked.
	 */
	async linkVerifiedEmail(c, oauthUserId, verifiedEmail) {
		if (!oauthUserId || !verifiedEmail) return null;
		const existingUser = await userService.selectByEmail(c, verifiedEmail);
		if (!existingUser) return null;

		await orm(c).update(oauth)
			.set({ userId: existingUser.userId })
			.where(and(
				eq(oauth.oauthUserId, oauthUserId),
				eq(oauth.userId, 0),
				sql`NOT EXISTS (SELECT 1 FROM oauth AS bound WHERE bound.oauth_user_id = ${oauthUserId} AND bound.user_id > 0)`
			))
			.run();

		const linked = await this.getById(c, oauthUserId);
		if (!linked || Number(linked.userId) <= 0) return null;
		return linked.userId === existingUser.userId
			? existingUser
			: await userService.selectByIdIncludeDel(c, linked.userId);
	},

	async fetchLinuxDoUserInfo(c, params = {}) {
		const { code, codeVerifier } = params;
		if (!code) {
			throw new BizError('Authorization code is required');
		}
		if (!c.env?.linuxdo_client_id || !c.env?.linuxdo_client_secret || !c.env?.linuxdo_callback_url) {
			throw new BizError('Provider linuxdo is missing required credentials or callback URL', 503, 'oauth_provider_unconfigured');
		}

		let token = '';
		let userInfo = {}

		const reqParams = new URLSearchParams()
		reqParams.append('client_id', c.env.linuxdo_client_id)
		reqParams.append('client_secret', c.env.linuxdo_client_secret)
		reqParams.append('code', code)
		reqParams.append('redirect_uri', c.env.linuxdo_callback_url)
		reqParams.append('grant_type', 'authorization_code')
		if (codeVerifier) reqParams.append('code_verifier', codeVerifier)

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

		// Never auto-link a local account from an unverified provider email.
		const linuxEmailVerified = userInfo.email_verified === true || userInfo.email_verified === 'true';
		if (!linuxEmailVerified) userInfo.email = '';

		return userInfo;
	},

	async linuxDoLogin(c, params = {}) {
		await rateLimit.check(c, { scope: 'oauth-login', limit: 30, windowSeconds: 900 });
		await this.assertProviderEnabled(c, 'linuxdo');
		const userInfo = await this.fetchLinuxDoUserInfo(c, params);
		return await this.finishIdentityLogin(c, 'linuxdo', userInfo);
	},

	async saveUser(c, userInfo) {

		const userInfoRow = await this.getById(c, userInfo.oauthUserId);

		if (!userInfoRow) {
			// Concurrent first logins for the same identity must not create two
			// oauth rows: a duplicate row would let one copy be bound to one
			// account while the other stays unbound. The conditional INSERT is
			// a single serialised statement; a caller that loses the race
			// simply reads the winner's row.
			const db = getUserDb(c);
			if (db && typeof db.prepare === 'function') {
				try {
					await db.prepare(`
						INSERT INTO oauth (oauth_user_id, username, name, avatar, active, trust_level, silenced, user_id)
						SELECT ?, ?, ?, ?, ?, ?, ?, 0
						WHERE NOT EXISTS (SELECT 1 FROM oauth WHERE oauth_user_id = ?)
					`).bind(
						userInfo.oauthUserId,
						userInfo.username ?? null,
						userInfo.name ?? null,
						userInfo.avatar ?? null,
						userInfo.active ?? 1,
						userInfo.trustLevel ?? 1,
						userInfo.silenced ?? 0,
						userInfo.oauthUserId
					).run();
					const inserted = await this.getById(c, userInfo.oauthUserId);
					if (inserted) return inserted;
				} catch (err) {
					// A unique index (where migrated) may reject the losing
					// insert; fall through to the read below.
					if (!/UNIQUE|constraint/i.test(err?.message || '')) throw err;
				}
			}
			const existing = await this.getById(c, userInfo.oauthUserId);
			if (existing) return existing;
			return await orm(c).insert(oauth).values(userInfo).returning().get();
		} else {
			// Providers such as Apple only return the email on the first
			// authorization. Do not erase an already stored verified address
			// when a later login omits it.
			const updatePayload = { ...userInfo };
			if (!updatePayload.email && userInfoRow.email) {
				updatePayload.email = userInfoRow.email;
			}
			if (!updatePayload.username && userInfoRow.username) {
				updatePayload.username = userInfoRow.username;
			}
			return await orm(c).update(oauth).set(updatePayload).where(eq(oauth.oauthUserId, userInfo.oauthUserId)).returning().get();
		}

	},

	async getById(c, oauthUserId) {
		// Prefer a bound row if historical duplicates exist: the bind flow and
		// login flow must agree on whether this identity already has a mailbox.
		return await orm(c)
			.select()
			.from(oauth)
			.where(eq(oauth.oauthUserId, oauthUserId))
			.orderBy(sql`(${oauth.userId} > 0) DESC, ${oauth.oauthId} ASC`)
			.get();
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
