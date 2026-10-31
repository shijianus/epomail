/**
 * Logged-in third-party identity management (B5).
 *
 * Scope: an authenticated user lists the provider identities bound to their
 * mailbox, binds an additional one and unbinds an existing one.
 *
 * Security model
 * --------------
 * 1. The local account is ALWAYS taken from the verified session
 *    (`userContext.getUserId`). No request body, query parameter or provider
 *    response can name the account an identity is attached to.
 * 2. A bind can only be started after a recent re-authentication: the account
 *    password plus a second factor when TOTP is enabled, or — for accounts
 *    created by the provider flow that never had a user-chosen password — a
 *    provider-issued session that is still fresh. The re-authentication is
 *    condensed into a single-use step-up grant bound to the exact session
 *    token, so a stolen grant is useless in another session.
 * 3. The provider callback never binds anything by itself. It verifies the
 *    provider response, then hands the initiating browser a single-use claim
 *    bound to (user, session token hash, provider identity). Only that exact
 *    session can redeem it, which closes the classic "attacker completes the
 *    victim's OAuth flow" binding attack.
 * 4. The association itself is a single conditional UPDATE guarded by a
 *    per-identity lease, so one identity can never end up on two accounts,
 *    even with concurrent flows.
 * 5. Unbinding requires the same step-up proof, is scoped by user_id in the
 *    DELETE predicate, and refuses to remove the last usable login method.
 * 6. Audit rows contain event metadata only. Tokens, claims, authorization
 *    codes and provider credentials are never written to the audit table.
 */
import BizError from '../error/biz-error.js';
import orm from '../entity/orm.js';
import { oauth } from '../entity/oauth.js';
import user from '../entity/user.js';
import { eq, and } from 'drizzle-orm';
import userService from './user-service.js';
import oauthService from './oauth-service.js';
import oauthBindClaim from '../utils/oauth-bind-claim.js';
import oneTimeCredential, { OTC_PURPOSE, hashToken } from '../utils/one-time-credential.js';
import cryptoUtils from '../utils/crypto-utils.js';
import totpUtils from '../utils/totp-utils.js';
import userContext from '../security/user-context.js';
import KvConst from '../const/kv-const.js';
import constant from '../const/constant.js';
import { getUserDb } from '../utils/db-accessor.js';
import rateLimit from '../utils/rate-limit.js';
import { t } from '../i18n/i18n.js';
import reqUtils from '../utils/req-utils.js';

const STEP_UP_TTL_SECONDS = 300;
const STEP_UP_TTL_MS = STEP_UP_TTL_SECONDS * 1000;
const BIND_LINK_TTL_SECONDS = 600;
// How fresh a provider-issued session must be to stand in for a password when
// the account has no user-chosen password. Matches the initial-password
// window: both encode "the provider authenticated this person moments ago".
const PROVIDER_SESSION_FRESH_MS = 15 * 60 * 1000;
const UNBIND_LOCK_TTL_SECONDS = 30;

const KNOWN_PROVIDER_PREFIXES = new Set(['github', 'google', 'microsoft', 'apple', 'custom', 'linuxdo']);

const AUDIT_EVENTS = Object.freeze({
	REAUTH_GRANTED: 'reauth_granted',
	REAUTH_FAILED: 'reauth_failed',
	BIND_STARTED: 'identity_bind_started',
	BIND_COMPLETED: 'identity_bound',
	BIND_REJECTED: 'identity_bind_rejected',
	UNBIND_COMPLETED: 'identity_unbound',
	UNBIND_REJECTED: 'identity_unbind_rejected',
	SESSION_REVOKED: 'identity_sessions_revoked'
});

function providerFromIdentity(oauthUserId) {
	const value = typeof oauthUserId === 'string' ? oauthUserId : '';
	const separator = value.indexOf(':');
	if (separator > 0) {
		const prefix = value.slice(0, separator).toLowerCase();
		if (KNOWN_PROVIDER_PREFIXES.has(prefix)) return prefix;
	}
	// Legacy LinuxDo rows stored the numeric provider id without a prefix.
	return 'linuxdo';
}

function stepUpBinding(userId) {
	return `user:${userId}`;
}

/**
 * True only when the stored credential is one the account owner can actually
 * present. Accounts created by the OAuth bind flow are seeded with a random
 * password and marked in KV; while that marker matches, the password is not a
 * usable login method.
 */
async function hasUsablePassword(c, userRow) {
	if (!userRow || typeof userRow.password !== 'string' || !userRow.password) return false;
	try {
		const marker = await c.env.kv.get(KvConst.INITIAL_PASSWORD + userRow.userId);
		if (marker && marker === userRow.password) return false;
	} catch (err) {
		// Without KV the session itself cannot be validated by the auth
		// middleware, so this path is not reachable in practice. Be
		// conservative and report "no usable password".
		return false;
	}
	return true;
}

async function currentSessionToken(c) {
	try {
		return await userContext.getToken(c);
	} catch (_) {
		return null;
	}
}

async function recordAudit(c, { userId, event, provider = '', oauthUserId = '', outcome = 'success', detail = '' }) {
	try {
		const db = getUserDb(c);
		if (!db || typeof db.prepare !== 'function') return;
		let ip = '';
		let userAgent = '';
		try {
			ip = reqUtils.getIp(c) || '';
			userAgent = (c.req.header('user-agent') || '').slice(0, 256);
		} catch (_) {}
		await db.prepare(`
			INSERT INTO oauth_identity_audit
				(user_id, event, provider, oauth_user_id, outcome, ip, user_agent, detail)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`).bind(
			userId,
			String(event).slice(0, 64),
			String(provider || '').slice(0, 64),
			String(oauthUserId || '').slice(0, 512),
			String(outcome || 'success').slice(0, 32),
			String(ip || '').slice(0, 64),
			String(userAgent || ''),
			String(detail || '').slice(0, 256)
		).run();
	} catch (err) {
		// Auditing must never break a user-visible security operation.
		console.error('Failed to record OAuth identity audit event:', err);
	}
}

async function notifyIdentityEvent(c, userId, eventCode, detail) {
	try {
		const securityNoticeService = (await import('./security-notice-service.js')).default;
		const { SECURITY_EVENT_TYPES } = await import('../const/security-notice-templates.js');
		await securityNoticeService.sendNotice(c, userId, SECURITY_EVENT_TYPES[eventCode], { detail });
	} catch (err) {
		console.error('Failed to send OAuth identity security notice:', err);
	}
}

async function providerDisplayName(c, provider) {
	try {
		const providers = await oauthService.getPublicProviders(c);
		const match = providers.find(item => item.key === provider);
		if (match && match.name) return match.name;
	} catch (_) {}
	const fallback = {
		github: 'GitHub',
		google: 'Google',
		microsoft: 'Microsoft',
		apple: 'Apple',
		custom: 'Custom SSO',
		linuxdo: 'LinuxDo'
	};
	return fallback[provider] || provider || 'OAuth';
}

async function issueStepUpGrant(c, userId, method) {
	const sessionToken = await currentSessionToken(c);
	if (!sessionToken) {
		throw new BizError(t('oauthReauthRequired'), 401, 'reauth_required');
	}
	const token = await oneTimeCredential.issue(c, {
		purpose: OTC_PURPOSE.STEP_UP,
		oauthUserId: stepUpBinding(userId),
		payload: {
			userId,
			tokenHash: await hashToken(sessionToken),
			method,
			createdAt: Date.now()
		},
		ttlSeconds: STEP_UP_TTL_SECONDS
	});
	return { stepUpToken: token, expiresIn: STEP_UP_TTL_SECONDS, method };
}

/**
 * Spend a step-up grant. Throws unless the grant is unexpired, unused, issued
 * to this user AND issued to this exact session token.
 */
async function consumeStepUpGrant(c, userId, stepUpToken) {
	if (!stepUpToken || typeof stepUpToken !== 'string') {
		throw new BizError(t('oauthReauthRequired'), 403, 'reauth_required');
	}

	const probe = await oneTimeCredential.inspect(c, {
		purpose: OTC_PURPOSE.STEP_UP,
		token: stepUpToken,
		oauthUserId: stepUpBinding(userId)
	});
	if (!probe || probe.consumed || probe.expired || !probe.payload) {
		throw new BizError(t('oauthReauthRequired'), 403, 'reauth_required');
	}

	const sessionToken = await currentSessionToken(c);
	const payload = probe.payload;
	const valid = payload.userId === userId
		&& typeof payload.tokenHash === 'string'
		&& sessionToken
		&& payload.tokenHash === await hashToken(sessionToken)
		&& Number.isFinite(payload.createdAt)
		&& Date.now() - payload.createdAt <= STEP_UP_TTL_MS;
	if (!valid) {
		throw new BizError(t('oauthReauthRequired'), 403, 'reauth_required');
	}

	const record = await oneTimeCredential.consume(c, {
		purpose: OTC_PURPOSE.STEP_UP,
		token: stepUpToken,
		oauthUserId: stepUpBinding(userId)
	});
	if (!record) {
		throw new BizError(t('oauthReauthRequired'), 403, 'reauth_required');
	}
	return record.payload;
}

/**
 * Verify a TOTP code or a backup code for a step-up. Reuses the login-time
 * anti-replay key so a code consumed by a concurrent login cannot be reused
 * here inside the same 30s step.
 */
async function verifySecondFactor(c, userRow, code, isBackupCode) {
	if (!isBackupCode) {
		if (!userRow.totpSecret) {
			throw new BizError(t('totpNotEnabled'), 403, 'totp_not_enabled');
		}
		const plainSecret = await totpUtils.decryptSecret(userRow.totpSecret, c.env);
		const check = await totpUtils.verifyTOTP(plainSecret, code, 1);
		if (!check.isValid) {
			throw new BizError(t('totpCodeInvalid'), 403, 'totp_invalid');
		}
		const replayKey = KvConst.TOTP_REPLAY + userRow.userId + ':' + check.timeStep;
		if (await c.env.kv.get(replayKey)) {
			throw new BizError(t('totpCodeReplay'), 403, 'totp_replay');
		}
		await c.env.kv.put(replayKey, '1', { expirationTtl: 60 });
		return;
	}

	const backupResult = await totpUtils.verifyAndConsumeBackupCode(code, userRow.totpBackupCodes);
	if (!backupResult.isValid) {
		throw new BizError(t('backupCodeInvalid'), 403, 'backup_code_invalid');
	}
	await orm(c).update(user).set({ totpBackupCodes: backupResult.updatedCodesJson })
		.where(eq(user.userId, userRow.userId)).run();
}

const oauthIdentityService = {

	AUDIT_EVENTS,

	/**
	 * List every provider identity bound to the account plus the providers the
	 * operator currently offers for binding.
	 */
	async listIdentities(c, userId) {
		const rows = await orm(c).select().from(oauth)
			.where(eq(oauth.userId, userId))
			.orderBy(oauth.oauthId)
			.all();

		const identities = (rows || [])
			.filter(row => typeof row.oauthUserId === 'string' && row.oauthUserId)
			.map(row => ({
				id: row.oauthId,
				provider: providerFromIdentity(row.oauthUserId),
				name: row.name || '',
				username: row.username || '',
				avatar: row.avatar || '',
				boundAt: row.createTime || null
			}));

		let providers = [];
		try {
			providers = await oauthService.getPublicProviders(c);
		} catch (err) {
			console.error('Failed to load bindable OAuth providers:', err);
		}

		const boundProviders = new Set(identities.map(item => item.provider));
		const bindable = providers.map(item => ({
			key: item.key,
			name: item.name,
			icon: item.icon,
			bound: boundProviders.has(item.key)
		}));

		const userRow = await userService.selectById(c, userId);
		const hasPassword = await hasUsablePassword(c, userRow);

		return {
			providers: bindable,
			identities,
			login: {
				hasPassword,
				totpEnabled: Boolean(userRow && userRow.totpEnabled === 1 && userRow.totpSecret),
				identityCount: identities.length,
				// Mirrors the server-side guard so the UI can disable the last
				// unbind instead of offering an action that will be rejected.
				canRemoveIdentity: hasPassword || identities.length > 1
			}
		};
	},

	/**
	 * Recent re-authentication for a sensitive identity operation.
	 *
	 * Password accounts must present the password (plus TOTP/backup code when
	 * MFA is enabled). Accounts that only ever authenticated through a provider
	 * have no password the owner could type; for them a provider-issued session
	 * that is still fresh is the equivalent proof.
	 */
	async reauthenticate(c, userId, params = {}) {
		await rateLimit.check(c, {
			scope: 'oauth-identity-reauth',
			limit: 10,
			windowSeconds: 900,
			subject: `user:${userId}`
		});

		const userRow = await userService.selectById(c, userId);
		if (!userRow) {
			throw new BizError(t('userNotExist'), 404, 'user_not_found');
		}

		const passwordUsable = await hasUsablePassword(c, userRow);
		const hasTotp = userRow.totpEnabled === 1 && Boolean(userRow.totpSecret);

		if (passwordUsable) {
			const password = typeof params.password === 'string' ? params.password : '';
			if (!password) {
				throw new BizError(t('passwordEmpty'), 400, 'password_required');
			}
			const valid = await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password);
			if (!valid) {
				await recordAudit(c, {
					userId,
					event: AUDIT_EVENTS.REAUTH_FAILED,
					outcome: 'failure',
					detail: 'password_mismatch'
				});
				throw new BizError(t('oauthReauthFailed'), 403, 'reauth_failed');
			}

			if (hasTotp) {
				const code = typeof params.code === 'string' ? params.code.trim() : '';
				if (!code) {
					throw new BizError(t('totpCodeEmpty'), 400, 'totp_required');
				}
				try {
					await verifySecondFactor(c, userRow, code, params.isBackupCode === true);
				} catch (err) {
					await recordAudit(c, {
						userId,
						event: AUDIT_EVENTS.REAUTH_FAILED,
						outcome: 'failure',
						detail: err?.errorCode || 'second_factor_invalid'
					});
					throw err;
				}
			}

			await recordAudit(c, {
				userId,
				event: AUDIT_EVENTS.REAUTH_GRANTED,
				detail: hasTotp ? 'password+second_factor' : 'password'
			});
			return await issueStepUpGrant(c, userId, hasTotp ? 'password+totp' : 'password');
		}

		// Provider-only account: the session must carry provider provenance and
		// must be recent. The marker is written by the server at login time; a
		// client cannot forge it.
		const sessionToken = await currentSessionToken(c);
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		const meta = sessionToken && authInfo?.tokenMeta ? authInfo.tokenMeta[sessionToken] : null;
		const fresh = meta
			&& meta.method === 'oauth'
			&& Number.isFinite(meta.at)
			&& Date.now() - meta.at <= PROVIDER_SESSION_FRESH_MS;

		if (!fresh) {
			await recordAudit(c, {
				userId,
				event: AUDIT_EVENTS.REAUTH_FAILED,
				outcome: 'failure',
				detail: 'provider_session_stale'
			});
			throw new BizError(t('oauthReauthProviderRequired'), 403, 'reauth_provider_required');
		}

		await recordAudit(c, {
			userId,
			event: AUDIT_EVENTS.REAUTH_GRANTED,
			provider: typeof meta.provider === 'string' ? meta.provider : '',
			detail: 'provider_session'
		});
		return await issueStepUpGrant(c, userId, 'provider_session');
	},

	/**
	 * Start a bind. Returns the provider authorization URL; the account to bind
	 * to is taken from the session, never from the request body.
	 */
	async startBind(c, userId, params = {}) {
		await rateLimit.check(c, {
			scope: 'oauth-identity-bind',
			limit: 10,
			windowSeconds: 900,
			subject: `user:${userId}`
		});

		const provider = typeof params.provider === 'string' ? params.provider.trim().toLowerCase() : '';
		if (!provider || provider.length > 64) {
			throw new BizError(t('oauthProviderInvalid'), 400, 'provider_invalid');
		}

		const providerList = await oauthService.getPublicProviders(c);
		if (!providerList.some(item => item.key === provider)) {
			throw new BizError(t('oauthProviderUnavailable'), 400, 'provider_unavailable');
		}
		await oauthService.assertProviderEnabled(c, provider);

		const existingRows = await orm(c).select().from(oauth).where(eq(oauth.userId, userId)).all();
		const alreadyBound = (existingRows || []).some(row =>
			typeof row.oauthUserId === 'string'
			&& row.oauthUserId.toLowerCase().startsWith(provider + ':')
		);
		if (alreadyBound) {
			throw new BizError(t('oauthIdentityAlreadyBound'), 409, 'identity_already_bound');
		}

		await consumeStepUpGrant(c, userId, params.stepUpToken);

		const sessionToken = await currentSessionToken(c);
		if (!sessionToken) {
			throw new BizError(t('oauthReauthRequired'), 401, 'reauth_required');
		}

		// The callback must return to the account slot the flow started from.
		// It only shapes a client-side URL; the claim stays bound to this
		// session, so a forged index cannot complete someone else's bind.
		const rawAccountIndex = Number(params.accountIndex);
		const accountIndex = Number.isInteger(rawAccountIndex) && rawAccountIndex >= 0 && rawAccountIndex < 100
			? rawAccountIndex
			: 0;

		const url = await oauthService.getAuthorizeUrl(c, provider, '', '', {
			intent: {
				mode: 'bind',
				userId,
				sessionHash: await hashToken(sessionToken),
				provider,
				accountIndex,
				issuedAt: Date.now()
			}
		});

		await recordAudit(c, {
			userId,
			event: AUDIT_EVENTS.BIND_STARTED,
			provider
		});

		return { url, provider };
	},

	/**
	 * Provider callback for a bind intent.
	 *
	 * Never associates anything: it verifies the provider response and returns
	 * a single-use claim bound to the initiating session. Any failure is
	 * reported as a redirect so the settings page can explain it.
	 */
	async handleBindCallback(c, provider, params, stateRow) {
		await rateLimit.check(c, { scope: 'oauth-identity-callback', limit: 30, windowSeconds: 900 });

		const intent = stateRow?.intent;
		const userId = Number(intent?.userId);
		if (!intent || intent.mode !== 'bind' || !Number.isInteger(userId) || userId <= 0
			|| typeof intent.sessionHash !== 'string' || !intent.sessionHash) {
			throw new BizError(t('oauthStateInvalid'), 400, 'state_invalid');
		}
		if (intent.provider && intent.provider !== provider) {
			throw new BizError(t('oauthStateInvalid'), 400, 'state_invalid');
		}

		await oauthService.assertProviderEnabled(c, provider);

		const userInfo = await oauthService.fetchProviderUserInfo(c, provider, {
			code: params.code,
			id_token: params.id_token,
			redirectUri: stateRow.redirectUri,
			nonce: stateRow.nonce,
			codeVerifier: stateRow.codeVerifier || ''
		});
		if (!userInfo || typeof userInfo.oauthUserId !== 'string' || !userInfo.oauthUserId) {
			throw new BizError('OAuth provider authorization failed');
		}

		const oauthRow = await oauthService.saveUser(c, userInfo);
		const boundUserId = Number(oauthRow?.userId) || 0;

		if (boundUserId > 0) {
			await recordAudit(c, {
				userId,
				event: AUDIT_EVENTS.BIND_REJECTED,
				provider,
				oauthUserId: userInfo.oauthUserId,
				outcome: 'rejected',
				detail: boundUserId === userId ? 'already_bound_to_self' : 'identity_owned_by_other_account'
			});
			return {
				outcome: boundUserId === userId ? 'already' : 'conflict',
				claimToken: null,
				provider,
				identityName: oauthRow?.name || ''
			};
		}

		const claimToken = await oneTimeCredential.issue(c, {
			purpose: OTC_PURPOSE.BIND_LINK,
			provider,
			oauthUserId: userInfo.oauthUserId,
			payload: {
				userId,
				sessionHash: intent.sessionHash,
				provider,
				oauthUserId: userInfo.oauthUserId,
				createdAt: Date.now()
			},
			ttlSeconds: BIND_LINK_TTL_SECONDS
		});

		await recordAudit(c, {
			userId,
			event: AUDIT_EVENTS.BIND_STARTED,
			provider,
			oauthUserId: userInfo.oauthUserId,
			outcome: 'callback_verified'
		});

		return { outcome: 'claim', claimToken, provider, identityName: oauthRow?.name || '' };
	},

	/**
	 * Redeem a bind claim. The claim is bound to the session token that started
	 * the flow, so another user (or another session of the same user) cannot
	 * complete it.
	 */
	async completeBind(c, userId, params = {}) {
		await rateLimit.check(c, {
			scope: 'oauth-identity-complete',
			limit: 20,
			windowSeconds: 900,
			subject: `user:${userId}`
		});

		const claimToken = typeof params.token === 'string' ? params.token : '';
		if (!claimToken) {
			throw new BizError(t('oauthBindProofInvalid'), 410, 'bind_claim_invalid');
		}

		const probe = await oneTimeCredential.inspect(c, {
			purpose: OTC_PURPOSE.BIND_LINK,
			token: claimToken
		});
		if (!probe || probe.consumed || probe.expired || !probe.payload) {
			throw new BizError(t('oauthBindProofInvalid'), 410, 'bind_claim_invalid');
		}

		const payload = probe.payload;
		const sessionToken = await currentSessionToken(c);
		const valid = payload.userId === userId
			&& typeof payload.sessionHash === 'string'
			&& sessionToken
			&& payload.sessionHash === await hashToken(sessionToken)
			&& Number.isFinite(payload.createdAt)
			&& Date.now() - payload.createdAt <= BIND_LINK_TTL_SECONDS * 1000;
		if (!valid) {
			await recordAudit(c, {
				userId,
				event: AUDIT_EVENTS.BIND_REJECTED,
				provider: probe.provider,
				oauthUserId: probe.oauthUserId,
				outcome: 'rejected',
				detail: 'claim_session_mismatch'
			});
			throw new BizError(t('oauthBindProofInvalid'), 410, 'bind_claim_invalid');
		}

		const oauthUserId = probe.oauthUserId;
		const provider = probe.provider;
		await oauthService.assertProviderEnabled(c, provider);

		// Serialise concurrent completes for this identity. The loser keeps its
		// claim intact (nothing was spent) and receives a clear conflict.
		const lease = await oauthBindClaim.acquire(c, { oauthUserId, ttlSeconds: 60 });
		if (!lease) {
			throw new BizError(t('oauthIdentityBindInProgress'), 425, 'bind_in_progress');
		}

		try {
			const record = await oneTimeCredential.consume(c, {
				purpose: OTC_PURPOSE.BIND_LINK,
				token: claimToken,
				provider,
				oauthUserId
			});
			if (!record) {
				throw new BizError(t('oauthBindProofInvalid'), 409, 'bind_claim_used');
			}

			const bound = await oauthBindClaim.finalize(c, {
				oauthUserId,
				claimToken: lease.claimToken,
				userId
			});

			if (!bound) {
				const current = await oauthService.getById(c, oauthUserId);
				const currentOwner = Number(current?.userId) || 0;
				if (currentOwner === userId) {
					// Idempotent success: a concurrent retry already committed.
					return { bound: true, provider, alreadyBound: true };
				}
				if (!current) {
					await recordAudit(c, {
						userId,
						event: AUDIT_EVENTS.BIND_REJECTED,
						provider,
						oauthUserId,
						outcome: 'rejected',
						detail: 'identity_missing'
					});
					throw new BizError(t('oauthBindProofInvalid'), 404, 'bind_identity_missing');
				}
				if (currentOwner > 0) {
					await recordAudit(c, {
						userId,
						event: AUDIT_EVENTS.BIND_REJECTED,
						provider,
						oauthUserId,
						outcome: 'rejected',
						detail: 'identity_owned_by_other_account'
					});
					throw new BizError(t('oauthIdentityInUse'), 409, 'identity_in_use');
				}
				// Still unbound but our lease predicate did not hold: another
				// attempt is mid-flight. The claim is already spent, so the user
				// must restart the flow.
				await recordAudit(c, {
					userId,
					event: AUDIT_EVENTS.BIND_REJECTED,
					provider,
					oauthUserId,
					outcome: 'rejected',
					detail: 'lease_lost'
				});
				throw new BizError(t('oauthIdentityBindInProgress'), 409, 'bind_conflict');
			}
		} finally {
			try {
				await oauthBindClaim.release(c, { oauthUserId, claimToken: lease.claimToken });
			} catch (err) {
				console.error('Failed to release OAuth identity bind lease:', err);
			}
		}

		await recordAudit(c, {
			userId,
			event: AUDIT_EVENTS.BIND_COMPLETED,
			provider,
			oauthUserId
		});
		await notifyIdentityEvent(c, userId, 'OAUTH_IDENTITY_BOUND', `${await providerDisplayName(c, provider)} · ${payload.oauthUserId}`);

		return { bound: true, provider };
	},

	/**
	 * Unbind an identity from the current account.
	 *
	 * The DELETE predicate includes user_id, so an oauthId belonging to another
	 * account matches zero rows and is reported as "not found" (no ownership
	 * oracle). A per-user lease makes the "last login method" check and the
	 * delete atomic with respect to parallel unbinds.
	 */
	async unbind(c, userId, oauthIdParam, params = {}) {
		await rateLimit.check(c, {
			scope: 'oauth-identity-unbind',
			limit: 10,
			windowSeconds: 900,
			subject: `user:${userId}`
		});

		const oauthId = Number(oauthIdParam);
		if (!Number.isInteger(oauthId) || oauthId <= 0) {
			throw new BizError(t('oauthIdentityNotFound'), 404, 'identity_not_found');
		}

		const existing = await orm(c).select().from(oauth)
			.where(and(eq(oauth.oauthId, oauthId), eq(oauth.userId, userId)))
			.get();
		if (!existing) {
			await recordAudit(c, {
				userId,
				event: AUDIT_EVENTS.UNBIND_REJECTED,
				outcome: 'rejected',
				detail: 'identity_not_found'
			});
			throw new BizError(t('oauthIdentityNotFound'), 404, 'identity_not_found');
		}

		const stepUp = await consumeStepUpGrant(c, userId, params.stepUpToken);
		// Removing the last identity is only safe when the caller just proved a
		// password. A provider-session grant proves the provider, not a password
		// the user could use afterwards — which is exactly the lockout we must
		// prevent. Deliberately not inferred from stored state: an OAuth-created
		// account may hold a random password nobody knows.
		const provedPassword = stepUp.method === 'password' || stepUp.method === 'password+totp';

		const provider = providerFromIdentity(existing.oauthUserId);
		const lockKey = `lock:unbind:${userId}`;
		const lease = await oauthBindClaim.acquire(c, { oauthUserId: lockKey, ttlSeconds: UNBIND_LOCK_TTL_SECONDS });
		if (!lease) {
			throw new BizError(t('oauthIdentityUnbindInProgress'), 425, 'unbind_in_progress');
		}

		try {
			const remainingRows = (await orm(c).select().from(oauth).where(eq(oauth.userId, userId)).all())
				.filter(row => row.oauthId !== oauthId && typeof row.oauthUserId === 'string' && row.oauthUserId);

			if (!provedPassword && remainingRows.length === 0) {
				await recordAudit(c, {
					userId,
					event: AUDIT_EVENTS.UNBIND_REJECTED,
					provider,
					oauthUserId: existing.oauthUserId,
					outcome: 'rejected',
					detail: 'last_login_method'
				});
				throw new BizError(t('oauthLastLoginMethod'), 409, 'last_login_method');
			}

			const result = await orm(c).delete(oauth)
				.where(and(eq(oauth.oauthId, oauthId), eq(oauth.userId, userId)))
				.run();
			const removed = Number(result?.meta?.changes ?? result?.changes ?? 0);
			if (removed !== 1) {
				await recordAudit(c, {
					userId,
					event: AUDIT_EVENTS.UNBIND_REJECTED,
					provider,
					oauthUserId: existing.oauthUserId,
					outcome: 'rejected',
					detail: 'delete_matched_zero_rows'
				});
				throw new BizError(t('oauthIdentityNotFound'), 404, 'identity_not_found');
			}

			const revoked = await this.revokeProviderSessions(c, userId, provider, await currentSessionToken(c));

			await recordAudit(c, {
				userId,
				event: AUDIT_EVENTS.UNBIND_COMPLETED,
				provider,
				oauthUserId: existing.oauthUserId
			});
			if (revoked > 0) {
				await recordAudit(c, {
					userId,
					event: AUDIT_EVENTS.SESSION_REVOKED,
					provider,
					outcome: 'success',
					detail: `revoked=${revoked}`
				});
			}
			await notifyIdentityEvent(c, userId, 'OAUTH_IDENTITY_UNBOUND', await providerDisplayName(c, provider));

			return { unbound: true, provider, revokedSessions: revoked };
		} finally {
			try {
				await oauthBindClaim.release(c, { oauthUserId: lockKey, claimToken: lease.claimToken });
			} catch (err) {
				console.error('Failed to release OAuth identity unbind lease:', err);
			}
		}
	},

	/**
	 * Drop sessions that were authenticated by the provider that was just
	 * unbound. The current session is kept: the caller re-authenticated with a
	 * password/TOTP moments ago, and signing them out of the page they are
	 * using would be a usability regression without a security gain.
	 */
	async revokeProviderSessions(c, userId, provider, keepToken) {
		let revoked = 0;
		try {
			const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
			if (!authInfo || !Array.isArray(authInfo.tokens) || !authInfo.tokenMeta) return 0;

			const drop = new Set();
			for (const token of authInfo.tokens) {
				if (token === keepToken) continue;
				const meta = authInfo.tokenMeta[token];
				if (meta && meta.method === 'oauth' && meta.provider === provider) {
					drop.add(token);
				}
			}
			if (drop.size === 0) return 0;

			authInfo.tokens = authInfo.tokens.filter(token => !drop.has(token));
			for (const token of drop) delete authInfo.tokenMeta[token];
			revoked = drop.size;

			if (authInfo.tokens.length === 0 && Object.keys(authInfo.tokenMeta).length === 0) {
				await c.env.kv.delete(KvConst.AUTH_INFO + userId);
			} else {
				await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo), {
					expirationTtl: constant.TOKEN_EXPIRE
				});
			}
		} catch (err) {
			console.error('Failed to revoke sessions for unbound OAuth provider:', err);
		}
		return revoked;
	}
};

export default oauthIdentityService;
