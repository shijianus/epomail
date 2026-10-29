import BizError from '../error/biz-error.js';
import userService from './user-service.js';
import emailUtils from '../utils/email-utils.js';
import { isDel, settingConst, userConst } from '../const/entity-const.js';
import JwtUtils from '../utils/jwt-utils.js';
import { v4 as uuidv4 } from 'uuid';
import KvConst from '../const/kv-const.js';
import constant from '../const/constant.js';
import userContext from '../security/user-context.js';
import verifyUtils from '../utils/verify-utils.js';
import accountService from './account-service.js';
import settingService from './setting-service.js';
import saltHashUtils from '../utils/crypto-utils.js';
import cryptoUtils from '../utils/crypto-utils.js';
import turnstileService from './turnstile-service.js';
import roleService from './role-service.js';
import regKeyService from './reg-key-service.js';
import dayjs from 'dayjs';
import { toUtc } from '../utils/date-uitil.js';
import { t } from '../i18n/i18n.js';
import verifyRecordService from './verify-record-service.js';
import totpUtils from '../utils/totp-utils.js';
import webauthnUtils from '../utils/webauthn-utils.js';
import orm from '../entity/orm.js';
import user from '../entity/user.js';
import { auditLog } from '../entity/audit-log.js';
import { eq, and, desc } from 'drizzle-orm';
import riskService from './risk-service.js';
import deviceTrustService from './device-trust-service.js';
import rateLimit from '../utils/rate-limit.js';
import decisionNoticeService from './decision-notice-service.js';
import totpService from './totp-service.js';

function getSafeSessionUser(userRow) {
	if (!userRow) return null;
	const safe = { ...userRow };
	delete safe.password;
	delete safe.salt;
	delete safe.totpSecret;
	delete safe.totpBackupCodes;
	delete safe.byoStorageConfig;
	delete safe.securityKeys;
	return safe;
}

/**
 * Per-session authentication provenance. Only the issuing server (OAuth
 * service) can set it, and it is stored next to the token list so a stale or
 * forged marker cannot outlive the session it describes.
 *
 * The initial-password flow uses this to prove the caller just completed a
 * provider authentication; a plain password session never carries it.
 */
function buildSessionMeta(method, provider) {
	if (method !== 'oauth') return null;
	return {
		method: 'oauth',
		provider: typeof provider === 'string' && provider ? provider.slice(0, 64) : null,
		at: Date.now()
	};
}

function attachSessionMeta(authInfo, token, meta) {
	if (!meta) return;
	if (!authInfo.tokenMeta || typeof authInfo.tokenMeta !== 'object') authInfo.tokenMeta = {};
	authInfo.tokenMeta[token] = meta;
	// Keep the map bounded by the live token list so it can never grow past
	// the ten sessions the account is allowed to keep.
	for (const key of Object.keys(authInfo.tokenMeta)) {
		if (!Array.isArray(authInfo.tokens) || !authInfo.tokens.includes(key)) {
			delete authInfo.tokenMeta[key];
		}
	}
}

const loginService = {

	/**
	 * Read-only registration policy evaluation.
	 *
	 * Every check below is a read: it never inserts, updates, reserves an
	 * invite slot or writes a session. It exists so a caller can reject an
	 * invalid request *before* spending a single-use credential, and it is
	 * deliberately the same function `register()` runs before any write — so
	 * the preflight can never drift into a weaker policy than the write path.
	 *
	 * A preflight pass is not an authorization: `register()` re-runs this
	 * function inside the write path, and the invite slot is still reserved
	 * with an atomic decrement afterwards.
	 */
	async validateRegistration(c, params, oauth = false) {
		const { email, password } = params;
		// A non-string invite code is treated as absent instead of being handed
		// to SQL as a binding parameter.
		const code = typeof params.code === 'string' ? params.code : '';

		let { regKey, register, registerVerify, regVerifyCount, minEmailPrefix, emailPrefixFilter } = await settingService.query(c)

		if (oauth) {
			// The provider already verified the identity, so the local captcha
			// challenge is unnecessary. Registration policy still applies:
			// closing registration must also block OAuth account creation.
			registerVerify = settingConst.registerVerify.CLOSE;
		}

		if (register === settingConst.register.CLOSE) {
			throw new BizError(t('regDisabled'), undefined, 'register_closed');
		}

		if (typeof email !== 'string' || !verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'), undefined, 'invalid_email');
		}

		if (emailUtils.getName(email).length < minEmailPrefix) {
			throw new BizError(t('minEmailPrefix', { msg: minEmailPrefix } ), undefined, 'prefix_too_short');
		}

		if (emailPrefixFilter.some(content => emailUtils.getName(email).includes(content)))  {
			throw new BizError(t('banEmailPrefix'), undefined, 'invalid_local');
		}

		if (emailUtils.getName(email).length > 64) {
			throw new BizError(t('emailLengthLimit'), undefined, 'prefix_too_long');
		}

		if (typeof password !== 'string' || password.length > 30) {
			throw new BizError(t('pwdLengthLimit'), undefined, 'password_too_long');
		}

		if (password.length < 6) {
			throw new BizError(t('pwdMinLength'), undefined, 'password_too_short');
		}

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notEmailDomain'), undefined, 'domain_not_allowed');
		}

		let type = null;
		let regKeyId = 0

		if (regKey === settingConst.regKey.OPEN) {
			const result = await this.handleOpenRegKey(c, regKey, code)
			type = result?.type
			regKeyId = result?.regKeyId
		}

		if (regKey === settingConst.regKey.OPTIONAL) {
			const result = await this.handleOpenOptional(c, regKey, code)
			type = result?.type
			regKeyId = result?.regKeyId
		}

		const localName = emailUtils.getName(email);
		const adminName = c.env.admin ? emailUtils.getName(c.env.admin) : '';
		if (adminName && localName.toLowerCase() === adminName.toLowerCase()) {
			throw new BizError(t('adminReserved'), undefined, 'email_reserved');
		}

		// 检查该完整邮箱是否已被注册或已注销
		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'), undefined, 'email_deleted');
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'), undefined, 'email_exists');
		}

		// 用户名抢注规则：第一个抢注用户名的人优先拥有用户名，后来者使用完整的邮箱作为用户名
		const existingNameRow = await accountService.selectByNameIncludeDel(c, localName);
		let assignedName = localName;
		if (existingNameRow) {
			assignedName = email;
		}

		let defType = null

		if (!type) {
			const roleRow = await roleService.selectDefaultRole(c);
			defType = roleRow.roleId
		}


		const roleRow = await roleService.selectById(c, type || defType);

		if(!roleService.hasAvailDomainPerm(roleRow.availDomain, email)) {

			if (type) {
				throw new BizError(t('noDomainPermRegKey'),403, 'domain_not_permitted')
			}

			if (defType) {
				throw new BizError(t('noDomainPermReg'),403, 'domain_not_permitted')
			}

		}

		let regVerifyOpen = false

		if (registerVerify === settingConst.registerVerify.OPEN) {
			regVerifyOpen = true
		}

		if (registerVerify === settingConst.registerVerify.COUNT) {
			regVerifyOpen = await verifyRecordService.isOpenRegVerify(c, regVerifyCount);
		}

		return {
			code,
			email,
			regKey,
			registerVerify,
			regVerifyCount,
			type,
			regKeyId,
			defType,
			assignedName,
			regVerifyOpen
		};
	},

	/**
	 * Remove the rows of an account created by the current request when a
	 * later step fails. Only a userId this request just obtained is passed in,
	 * so nothing that existed before the request can be touched.
	 */
	async rollbackPartialRegistration(c, userId) {
		const id = Number(userId);
		if (!Number.isInteger(id) || id <= 0) return;

		try {
			await accountService.physicsDeleteByUserIds(c, [id]);
		} catch (err) {
			console.error('Failed to roll back OAuth registration account rows:', err);
		}

		try {
			await orm(c).delete(user).where(eq(user.userId, id)).run();
		} catch (err) {
			console.error('Failed to roll back OAuth registration user row:', err);
		}

		try {
			await c.env.kv.delete(KvConst.AUTH_INFO + id);
		} catch (_) {}
	},

	async register(c, params, oauth = false) {

		await rateLimit.check(c, { scope: 'register', limit: 20, windowSeconds: 3600 });

		const { password, token } = params;

		// Authoritative policy evaluation. The preflight used by the OAuth bind
		// path calls the same function, but this invocation is the gate that
		// actually protects the write: policy changes between preflight and
		// commit are still enforced here.
		const policy = await this.validateRegistration(c, params, oauth);
		const {
			code,
			email,
			regKey,
			registerVerify,
			regVerifyCount,
			type,
			regKeyId,
			defType,
			assignedName,
			regVerifyOpen: precomputedRegVerifyOpen
		} = policy;

		let regVerifyOpen = precomputedRegVerifyOpen;

		if (registerVerify === settingConst.registerVerify.OPEN) {
			await turnstileService.verify(c,token)
		}

		if (registerVerify === settingConst.registerVerify.COUNT && regVerifyOpen) {
			await turnstileService.verify(c,token)
		}

		const { salt, hash } = await saltHashUtils.hashPassword(password, c.env);

		// Reserve the invite slot atomically before creating the account. A
		// read-then-decrement flow lets concurrent registrations over-redeem
		// the same code.
		let reservedRegKey = false;
		if (regKey !== settingConst.regKey.CLOSE && type) {
			reservedRegKey = await regKeyService.consumeOne(c, code);
			if (!reservedRegKey) {
				throw new BizError(t('noRegKeyCount'), undefined, 'invite_code_exhausted');
			}
		}

		let userId;
		let acc;
		try {
			userId = await userService.insert(c, { email, regKeyId, password: hash, salt, type: type || defType });
			acc = await accountService.insert(c, { userId: userId, email, name: assignedName });
			await userService.updateUserInfo(c, userId, true);
		} catch (err) {
			if (reservedRegKey) {
				try { await regKeyService.restoreOne(c, code); } catch (_) {}
			}
			// Do not leave a half-created identity behind: a user row without
			// its account row would permanently reserve the unique email and
			// block every retry.
			await this.rollbackPartialRegistration(c, userId);
			throw err;
		}

		try {
			const emailService = (await import('./email-service')).default;
			const accountRow = acc || await accountService.selectByEmail(c, email);
			if (accountRow) {
				await emailService.deliverWelcomeEmailToUser(c, userId, accountRow.accountId, email, { forceWelcome: true });
			}
		} catch (err) {
			console.error('Failed to deliver welcome email on register:', err);
		}

		const extra = oauth ? { userId, email, reservedRegKey } : {};

		if (registerVerify === settingConst.registerVerify.COUNT && !regVerifyOpen) {
			const row = await verifyRecordService.increaseRegCount(c);
			return {regVerifyOpen: row.count >= regVerifyCount, ...extra}
		}

		return {regVerifyOpen, ...extra}

	},

	async registerVerify() {

	},

	async handleOpenRegKey(c, regKey, code) {

		if (!code) {
			throw new BizError(t('emptyRegKey'), undefined, 'invite_code_required');
		}

		const regKeyRow = await regKeyService.selectByCode(c, code);

		if (!regKeyRow) {
			throw new BizError(t('notExistRegKey'), undefined, 'invite_code_invalid');
		}

		if (regKeyRow.count <= 0) {
			throw new BizError(t('noRegKeyCount'), undefined, 'invite_code_exhausted');
		}

		const today = toUtc().tz('Asia/Shanghai').startOf('day')
		const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');

		if (expireTime.isBefore(today)) {
			throw new BizError(t('regKeyExpire'), undefined, 'invite_code_expired');
		}

		return { type: regKeyRow.roleId, regKeyId: regKeyRow.regKeyId };
	},

	async handleOpenOptional(c, regKey, code) {

		if (!code) {
			return null
		}

		const regKeyRow = await regKeyService.selectByCode(c, code);

		if (!regKeyRow) {
			return null
		}

		const today = toUtc().tz('Asia/Shanghai').startOf('day')
		const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');

		if (regKeyRow.count <= 0 || expireTime.isBefore(today)) {
			return null
		}

		return { type: regKeyRow.roleId, regKeyId: regKeyRow.regKeyId };
	},

	async lazyMigratePassword(c, userId, plainPassword) {
		try {
			const { salt, hash } = await cryptoUtils.hashPassword(plainPassword, c.env);
			await orm(c).update(user).set({ password: hash, salt }).where(eq(user.userId, userId)).run();
		} catch (err) {
			console.error('Lazy password migration failed:', err);
		}
	},

	async login(c, params, noVerifyPwd = false) {

		await rateLimit.check(c, { scope: 'login', limit: 30, windowSeconds: 900 });

		const { email, password } = params;

		const inputEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
		const inputPassword = typeof password === 'string' ? password : '';
		if ((!inputEmail || !inputPassword) && !noVerifyPwd) {
			throw new BizError(t('emailAndPwdEmpty'));
		}

		const failKey = KvConst.LOGIN_FAIL + inputEmail;
		let failCountStr = await c.env.kv.get(failKey);
		let failCount = failCountStr ? parseInt(failCountStr) : 0;

		if (failCount >= 5) {
			throw new BizError(t('accountLocked'));
		}

		const incrementFail = async () => {
			try {
				let latest = await c.env.kv.get(failKey);
				let current = latest ? parseInt(latest) : 0;
				const nextCount = current + 1;
				await c.env.kv.put(failKey, nextCount.toString(), { expirationTtl: 12 * 60 * 60 });
				if (nextCount >= 5 && userRow && userRow.userId) {
					try {
						const securityNoticeService = (await import('./security-notice-service.js')).default;
						const { SECURITY_EVENT_TYPES } = await import('../const/security-notice-templates.js');
						await securityNoticeService.sendNotice(c, userRow.userId, SECURITY_EVENT_TYPES.ACCOUNT_LOCKED, {
							detail: '12 hours lockdown (5 consecutive failed attempts)'
						});
					} catch (e) {
						console.error('Failed to send account locked notice:', e);
					}
				}
			} catch {}
		};

		let userRow = await userService.selectByEmailIncludeDel(c, inputEmail);

		if (!userRow) {
			// 1. 尝试从 account 表查询是否为用户的附属/别名邮箱
			const accountRow = await accountService.selectByEmailIncludeDel(c, inputEmail);
			if (accountRow && accountRow.userId) {
				userRow = await userService.selectByIdIncludeDel(c, accountRow.userId);
			}
		}

		if (!userRow) {
			// 2. 纯用户名登录支持（如直接输入 'admin'）
			const adminLocal = c.env.admin ? emailUtils.getName(c.env.admin).toLowerCase() : '';
			if (inputEmail && !inputEmail.includes('@')) {
				if (adminLocal && inputEmail.toLowerCase() === adminLocal) {
					userRow = await userService.selectByEmailIncludeDel(c, c.env.admin);
				} else {
					const accountRow = await accountService.selectByNameIncludeDel(c, inputEmail);
					if (accountRow && accountRow.userId) {
						userRow = await userService.selectByIdIncludeDel(c, accountRow.userId);
					}
				}
			}
		}

		if (!userRow) {
			await incrementFail();
			// Perform a comparable PBKDF2 derivation so the response time does
			// not reveal whether the account exists.
			try {
				await cryptoUtils.genHashPassword(inputPassword, 'epomail-timing-equalization-salt');
			} catch (_) {}
			throw new BizError(t('IncorrectPwd'));
		}

		if (userRow.isDel === isDel.DELETE) {
			// Same generic message as a wrong password to avoid account
			// enumeration via the login endpoint.
			throw new BizError(t('IncorrectPwd'));
		}

		let isLegacy = false;
		if (!noVerifyPwd) {
			const checkResult = await cryptoUtils.verifyPasswordWithUpgrade(inputPassword, userRow.salt, userRow.password, c.env);
			if (!checkResult.isValid) {
				await incrementFail();
				throw new BizError(t('IncorrectPwd'));
			}
			// 收尾轮扩展：needsUpgrade 涵盖 legacy SHA-256 与低迭代 PBKDF2（如历史 100,000 次），
			// 两者都在完整登录成功后经 lazyMigratePassword 重哈希至当前 PBKDF2_ITERATIONS（210,000）；
			// needsUpgrade 仅在 isValid 时为 true，校验失败的请求永远不会触发升级。
			isLegacy = checkResult.needsUpgrade === true;
		}

		// Check if TOTP 2FA or Security Key is enabled
		const isGlobalTotpEnabled = await settingService.isTotpEnabled(c);
		let securityKeysList = [];
		if (isGlobalTotpEnabled && userRow.securityKeys) {
			try {
				securityKeysList = typeof userRow.securityKeys === 'string' ? JSON.parse(userRow.securityKeys) : userRow.securityKeys;
				if (!Array.isArray(securityKeysList)) securityKeysList = [];
			} catch (e) {
				securityKeysList = [];
			}
		}

		// Only active passkeys can be used for login (pending_verification under timelock are excluded)
		const activePasskeys = securityKeysList.filter(k => k.status !== 'pending_verification');

		const hasActiveTotp = userRow.totpEnabled === 1 && !!userRow.totpSecret;
		const hasActivePasskey = activePasskeys.length > 0;

		const deviceTag = params.deviceTag || (typeof c.req.header === 'function' ? c.req.header('x-device-tag') : '') || '';
		const trustedDeviceToken = params.trustedDeviceToken || (typeof c.req.header === 'function' ? c.req.header('x-device-trust') : '') || '';

		let sessionTrustEpoch = null;
		let sessionMaxEpoch = null;

		if (isGlobalTotpEnabled && (hasActiveTotp || hasActivePasskey)) {
			// Evaluate autonomous black-box device trust state
			const trustEval = await deviceTrustService.evaluateTrust(
				c,
				userRow.userId,
				deviceTag,
				trustedDeviceToken,
				params.secPayload || {}
			);

			// 封禁账号必须强制完成真实二次认证，严禁通过可信设备免密绕过 2FA 签发受限凭据
			const canBypass2FA = userRow.status === userConst.status.BAN ? false : trustEval.canBypass2FA;

			if (canBypass2FA) {
				// Trusted device 30-day grace bypass is active!
				sessionTrustEpoch = trustEval.trustEpoch;
				sessionMaxEpoch = trustEval.maxSessionEpoch;
			} else {
				const tempToken = 'totp_tmp_' + uuidv4().replace(/-/g, '');
				const passkeyChallenge = webauthnUtils.generateChallenge();

				// Evaluate black-box risk model
				const riskAssessment = await riskService.evaluateRisk(c, userRow, params.secPayload || {});

				let backupCodesRemaining = 0;
				if (userRow.totpBackupCodes) {
					try {
						const parsed = typeof userRow.totpBackupCodes === 'string' ? JSON.parse(userRow.totpBackupCodes) : userRow.totpBackupCodes;
						if (Array.isArray(parsed)) {
							backupCodesRemaining = parsed.filter(i => i.used === 0).length;
						} else if (parsed && Array.isArray(parsed.hashedCodes)) {
							backupCodesRemaining = parsed.hashedCodes.filter(i => i.used === 0).length;
						}
					} catch (e) {}
				}

				await c.env.kv.put(
					KvConst.TOTP_PENDING + tempToken,
					JSON.stringify({
						userId: userRow.userId,
						email: userRow.email,
						attempts: 0,
						passkeyChallenge,
						needsPasswordUpgrade: isLegacy ? inputPassword : null,
						stepUpRequired: riskAssessment.stepUpRequired,
						riskScore: riskAssessment.riskScore,
					step: 1,
					verifiedFactors: [],
					deviceTag,
					// Provenance survives the MFA challenge so the session that
					// is finally issued can still prove a provider login.
					authMethod: params.authMethod || null,
					authProvider: params.authProvider || null,
					createdAt: Date.now()
					}),
					{ expirationTtl: 300 } // 5 minutes TTL
				);

				return {
					mfaRequired: true,
					tempToken,
					authType: 'totp',
					email: userRow.email,
					hasTotp: !!userRow.totpSecret,
					hasPasskeys: activePasskeys.length > 0,
					hasBackupCodes: backupCodesRemaining > 0,
					passkeys: activePasskeys.map(k => ({ id: k.credentialId, type: 'public-key' })),
					passkeyChallenge,
					stepUpRequired: riskAssessment.stepUpRequired,
					step: 1,
					riskFlags: riskAssessment.clientFlags
				};
			}
		}

		// 受限用户安全通道：针对无 2FA 的账号（或完成 2FA 后），若账号已被封禁管控，阻断常规发信与读信会话，签发专用受限通知凭证
		if (userRow.status === userConst.status.BAN) {
			let latestBan = null;
			try {
				latestBan = await orm(c).select().from(auditLog).where(
					and(
						eq(auditLog.email, userRow.email),
						eq(auditLog.status, 'banned')
					)
				).orderBy(desc(auditLog.id)).limit(1).get();
			} catch (_) {}

			const restrictedToken = await decisionNoticeService.generateRestrictedToken(c, {
				userId: userRow.userId,
				caseId: latestBan?.id || null,
				ticketId: latestBan?.ticketId || null,
				email: userRow.email
			});

			const exchangeCode = await decisionNoticeService.createOneTimeExchangeCode(c, {
				restrictedToken,
				user: {
					email: userRow.email,
					status: userRow.status
				}
			});

			return {
				isRestricted: true,
				restrictedToken,
				code: exchangeCode,
				user: {
					email: userRow.email,
					status: userRow.status
				},
				message: '账号已被系统管控限制，已提供受限处置通知与申诉入口'
			};
		}

		// Clear fail count on success
		if (failCount > 0) {
			await c.env.kv.delete(failKey);
		}
		if (userRow.email && (KvConst.LOGIN_FAIL + userRow.email) !== failKey) {
			await c.env.kv.delete(KvConst.LOGIN_FAIL + userRow.email);
		}

		// If legacy single-round SHA-256 hash was detected, upgrade to PBKDF2 lazily
		if (isLegacy && inputPassword) {
			await this.lazyMigratePassword(c, userRow.userId, inputPassword);
		}

		const activeLoginEmail = inputEmail.includes('@') ? inputEmail : userRow.email;
		const uuid = uuidv4();
		const jwt = await JwtUtils.generateToken(c, { 
			userId: userRow.userId, 
			loginEmail: activeLoginEmail,
			token: uuid 
		});

		let authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userRow.userId, { type: 'json' });

		if (authInfo && (authInfo.user.email === userRow.email)) {

			if (authInfo.tokens.length > 10) {
				authInfo.tokens.shift();
			}

			authInfo.tokens.push(uuid);

		} else {

			authInfo = {
				tokens: [],
				user: getSafeSessionUser(userRow),
				refreshTime: dayjs().toISOString()
			};

			authInfo.tokens.push(uuid);

		}

		attachSessionMeta(authInfo, uuid, buildSessionMeta(params.authMethod, params.authProvider));

		if (sessionMaxEpoch) {
			authInfo.trustEpoch = sessionTrustEpoch;
			authInfo.maxSessionEpoch = sessionMaxEpoch;
		}

		await userService.updateUserInfo(c, userRow.userId);

		try {
			const emailService = (await import('./email-service')).default;
			await emailService.ensureWelcomeEmailForUser(c, userRow.userId, userRow.email);
		} catch (e) {
			console.warn('Failed to ensure welcome email on login:', e.message);
		}

		try {
			const securityNoticeService = (await import('./security-notice-service.js')).default;
			await securityNoticeService.checkAndTriggerLoginEnvironmentNotice(c, userRow.userId, userRow.email);
		} catch (e) {
			console.warn('Failed to check login environment notice:', e.message);
		}

		await c.env.kv.put(KvConst.AUTH_INFO + userRow.userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
		return { token: jwt, email: activeLoginEmail, userId: userRow.userId };
	},

	async verifyTotpLogin(c, params) {
		await rateLimit.check(c, { scope: 'login-totp', limit: 30, windowSeconds: 900 });

		const {
			tempToken,
			code,
			isBackupCode = false,
			isPasskey = false,
			credentialId,
			clientDataJSON,
			authenticatorData,
			signature,
			rememberDevice = false,
			deviceTag
		} = params;

		if (!tempToken) {
			throw new BizError(t('totpCodeEmpty'));
		}

		if (!isPasskey && !code) {
			throw new BizError(t('totpCodeEmpty'));
		}

		const pendingKey = KvConst.TOTP_PENDING + tempToken;
		const pendingData = await c.env.kv.get(pendingKey, { type: 'json' });

		if (!pendingData || !pendingData.userId) {
			throw new BizError(t('totpSessionExpired'));
		}

		const targetEmail = pendingData.email;
		const failKey = targetEmail ? KvConst.LOGIN_FAIL + targetEmail : null;
		let failCount = 0;
		if (failKey) {
			const failCountStr = await c.env.kv.get(failKey);
			failCount = failCountStr ? parseInt(failCountStr) : 0;
			if (failCount >= 5) {
				throw new BizError(t('accountLocked'));
			}
		}

		const incrementAccountFail = async () => {
			if (failKey) {
				const currentFailStr = await c.env.kv.get(failKey);
				const currentFail = currentFailStr ? parseInt(currentFailStr) : 0;
				await c.env.kv.put(failKey, (currentFail + 1).toString(), { expirationTtl: 12 * 60 * 60 });
			}
		};

		if (pendingData.attempts >= 5) {
			await c.env.kv.delete(pendingKey);
			await incrementAccountFail();
			throw new BizError(t('totpTooManyAttempts'));
		}

		pendingData.attempts += 1;
		await c.env.kv.put(pendingKey, JSON.stringify(pendingData), { expirationTtl: 300 });

		let userRow = await userService.selectById(c, pendingData.userId);
		if (!userRow || userRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}

		const factorType = isPasskey ? 'passkey' : (isBackupCode ? 'backup_code' : 'totp');

		if (pendingData.step === 2 && Array.isArray(pendingData.verifiedFactors) && pendingData.verifiedFactors.includes(factorType)) {
			throw new BizError(t('stepUpDifferentFactorRequired'));
		}

		if (isPasskey) {
			// Verify WebAuthn / Passkey signature
			if (!credentialId || !clientDataJSON || !authenticatorData || !signature) {
				throw new BizError('Missing passkey authentication credentials');
			}

			const clientData = webauthnUtils.parseClientData(clientDataJSON);
			if (clientData.challenge !== pendingData.passkeyChallenge) {
				await incrementAccountFail();
				throw new BizError('Passkey challenge mismatch or expired');
			}

			let keys = [];
			if (userRow.securityKeys) {
				try {
					keys = typeof userRow.securityKeys === 'string' ? JSON.parse(userRow.securityKeys) : userRow.securityKeys;
					if (!Array.isArray(keys)) keys = [];
				} catch (e) {
					keys = [];
				}
			}

			const targetKey = keys.find(k => k.credentialId === credentialId);
			if (!targetKey) {
				await incrementAccountFail();
				throw new BizError('Unrecognized security key');
			}

			if (targetKey.status === 'pending_verification') {
				await incrementAccountFail();
				throw new BizError(t('passkeyTimelockedNotice') || '该通行密钥处于安全观察期中，尚未激活生效，暂无法用于登录');
			}

			const isValidSig = await webauthnUtils.verifyAuthenticationSignature({
				clientDataJSONBase64: clientDataJSON,
				authenticatorDataBase64: authenticatorData,
				signatureBase64: signature,
				publicKeyJwk: targetKey.publicKeyJwk,
				publicKeyRaw: targetKey.publicKeyRaw
			});

			if (!isValidSig) {
				await incrementAccountFail();
				throw new BizError('Security key authentication signature invalid');
			}
		} else if (isBackupCode) {
			// Verify backup recovery code
			const backupResult = await totpUtils.verifyAndConsumeBackupCode(code, userRow.totpBackupCodes);
			if (!backupResult.isValid) {
				await incrementAccountFail();
				throw new BizError(t('backupCodeInvalid'));
			}
			await orm(c).update(user).set({
				totpBackupCodes: backupResult.updatedCodesJson
			}).where(eq(user.userId, userRow.userId)).run();
		} else {
			// Verify 6-digit TOTP code
			if (!userRow.totpSecret) {
				throw new BizError(t('totpNotEnabled'));
			}

			// 显式迁移（收尾轮）：历史 jwt_secret 回退 era 加密数据先解封重加密；
			// 阻断时给出准确原因，绝不静默回退到 jwt_secret 解密。
			const migration = await totpService.migrateLegacyTotpEncryption(c, userRow);
			if (!migration.ok) {
				if (migration.reason === 'missing_totp_enc_key') {
					throw new BizError('系统 TOTP 加密密钥未配置 (totp_enc_key missing)，2FA 验证暂时不可用，请联系管理员配置密钥', 500);
				}
				throw new BizError('2FA 凭据数据无法解密（历史密钥 era 数据损坏或不匹配），请联系管理员重置两步验证', 500);
			}
			if (migration.migrated) {
				// 迁移可能重加密了数据：以最新持久化行继续验证（不改动原行对象，避免污染共享引用）
				const freshRow = await userService.selectById(c, userRow.userId);
				if (freshRow) userRow = freshRow;
			}

			const plainSecret = await totpUtils.decryptSecret(userRow.totpSecret, c.env);
			const totpCheck = await totpUtils.verifyTOTP(plainSecret, code, 1);

			if (!totpCheck.isValid) {
				await incrementAccountFail();
				throw new BizError(t('totpCodeInvalid'));
			}

			// Anti-replay: prevent OTP reuse in the same 60-second time window
			const replayKey = KvConst.TOTP_REPLAY + userRow.userId + ':' + totpCheck.timeStep;
			const alreadyUsed = await c.env.kv.get(replayKey);
			if (alreadyUsed) {
				await incrementAccountFail();
				throw new BizError(t('totpCodeReplay'));
			}
			await c.env.kv.put(replayKey, '1', { expirationTtl: 60 });
		}

		// Check Step-Up (二验) decision: If step-up required and step 1 just completed
		if (pendingData.stepUpRequired && (!pendingData.step || pendingData.step === 1)) {
			let remainingBackupCount = 0;
			if (userRow.totpBackupCodes) {
				try {
					const parsed = typeof userRow.totpBackupCodes === 'string' ? JSON.parse(userRow.totpBackupCodes) : userRow.totpBackupCodes;
					if (Array.isArray(parsed)) remainingBackupCount = parsed.filter(i => i.used === 0).length;
					else if (parsed && Array.isArray(parsed.hashedCodes)) remainingBackupCount = parsed.hashedCodes.filter(i => i.used === 0).length;
				} catch (e) {}
			}

			let userKeys = [];
			if (userRow.securityKeys) {
				try {
					userKeys = typeof userRow.securityKeys === 'string' ? JSON.parse(userRow.securityKeys) : userRow.securityKeys;
					if (!Array.isArray(userKeys)) userKeys = [];
				} catch (e) {}
			}

			const activeUserKeys = userKeys.filter(k => k.status !== 'pending_verification');

			const availableFactors = [];
			if (userRow.totpSecret) availableFactors.push('totp');
			if (activeUserKeys.length > 0) availableFactors.push('passkey');
			if (remainingBackupCount > 0) availableFactors.push('backup_code');

			const remainingFactors = availableFactors.filter(f => f !== factorType);

			if (remainingFactors.length > 0) {
				// Transition to Step 2
				pendingData.step = 2;
				pendingData.verifiedFactors = [factorType];
				const nextPasskeyChallenge = webauthnUtils.generateChallenge();
				pendingData.passkeyChallenge = nextPasskeyChallenge;

				await c.env.kv.put(pendingKey, JSON.stringify(pendingData), { expirationTtl: 300 });

				return {
					stepUpRequired: true,
					step: 2,
					tempToken,
					verifiedFactor: factorType,
					remainingFactors,
					hasTotp: !!userRow.totpSecret,
					hasPasskeys: userKeys.length > 0,
					hasBackupCodes: remainingBackupCount > 0,
					passkeys: userKeys.map(k => ({ id: k.credentialId, type: 'public-key' })),
					passkeyChallenge: nextPasskeyChallenge,
					email: userRow.email,
					message: t('stepUpAbnormalNotice')
				};
			}
		}

		// Verification fully passed: consume temporary token
		await c.env.kv.delete(pendingKey);

		// Clear login fail rate limit
		if (failKey) {
			await c.env.kv.delete(failKey);
		}

		// Lazy migration of legacy password if needed
		if (pendingData.needsPasswordUpgrade) {
			await this.lazyMigratePassword(c, userRow.userId, pendingData.needsPasswordUpgrade);
		}

		// 受限用户安全通道：2FA 核验通过后，若账号已被封禁管控，阻断常规发信与读信会话，签发专用受限通知凭证
		if (userRow.status === userConst.status.BAN) {
			let latestBan = null;
			try {
				latestBan = await orm(c).select().from(auditLog).where(
					and(
						eq(auditLog.email, userRow.email),
						eq(auditLog.status, 'banned')
					)
				).orderBy(desc(auditLog.id)).limit(1).get();
			} catch (_) {}

			const restrictedToken = await decisionNoticeService.generateRestrictedToken(c, {
				userId: userRow.userId,
				caseId: latestBan?.id || null,
				ticketId: latestBan?.ticketId || null,
				email: userRow.email
			});

			const exchangeCode = await decisionNoticeService.createOneTimeExchangeCode(c, {
				restrictedToken,
				user: {
					email: userRow.email,
					status: userRow.status
				}
			});

			return {
				isRestricted: true,
				restrictedToken,
				code: exchangeCode,
				user: {
					email: userRow.email,
					status: userRow.status
				},
				message: '账号已被系统管控限制，已提供受限处置通知与申诉入口'
			};
		}

		// Generate formal session JWT
		const activeLoginEmail = targetEmail && targetEmail.includes('@') ? targetEmail : userRow.email;
		const uuid = uuidv4();
		const jwt = await JwtUtils.generateToken(c, { 
			userId: userRow.userId, 
			loginEmail: activeLoginEmail,
			token: uuid 
		});

		// Issue trusted device token if rememberDevice was requested
		let issuedTrustToken = null;
		let sessionTrustEpoch = null;
		let sessionMaxEpoch = null;

		const effectiveDeviceTag = deviceTag || pendingData.deviceTag || (typeof c.req.header === 'function' ? c.req.header('x-device-tag') : '') || '';
		if (rememberDevice && effectiveDeviceTag) {
			const trustResult = await deviceTrustService.issueTrust(c, userRow.userId, effectiveDeviceTag);
			if (trustResult) {
				issuedTrustToken = trustResult.trustedDeviceToken;
				sessionTrustEpoch = trustResult.trustEpoch;
				sessionMaxEpoch = trustResult.maxSessionEpoch;
			}
		}

		let authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userRow.userId, { type: 'json' });

		if (authInfo && (authInfo.user.email === userRow.email)) {
			if (authInfo.tokens.length > 10) {
				authInfo.tokens.shift();
			}
			authInfo.tokens.push(uuid);
		} else {
			authInfo = {
				tokens: [uuid],
				user: getSafeSessionUser(userRow),
				refreshTime: dayjs().toISOString()
			};
		}

		// The challenge may have started from a provider login; carry that
		// provenance (never the client's claim) onto the issued session.
		attachSessionMeta(authInfo, uuid, buildSessionMeta(pendingData.authMethod, pendingData.authProvider));

		if (sessionMaxEpoch) {
			authInfo.trustEpoch = sessionTrustEpoch;
			authInfo.maxSessionEpoch = sessionMaxEpoch;
		}

		await userService.updateUserInfo(c, userRow.userId);

		try {
			const emailService = (await import('./email-service')).default;
			await emailService.ensureWelcomeEmailForUser(c, userRow.userId, userRow.email);
		} catch (e) {
			console.warn('Failed to ensure welcome email on TOTP login:', e.message);
		}

		try {
			const securityNoticeService = (await import('./security-notice-service.js')).default;
			await securityNoticeService.checkAndTriggerLoginEnvironmentNotice(c, userRow.userId, userRow.email);
		} catch (e) {
			console.warn('Failed to check login environment notice on TOTP login:', e.message);
		}

		await c.env.kv.put(KvConst.AUTH_INFO + userRow.userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
		return { token: jwt, email: activeLoginEmail, userId: userRow.userId, trustedDeviceToken: issuedTrustToken };
	},

	async logout(c, userId) {
		const token = await userContext.getToken(c);
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		if (authInfo && authInfo.tokens) {
			const index = authInfo.tokens.findIndex(item => item === token);
			if (index > -1) {
				authInfo.tokens.splice(index, 1);
			}
			if (authInfo.tokens.length === 0) {
				await c.env.kv.delete(KvConst.AUTH_INFO + userId);
			} else {
				await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
			}
		}
	}

};

export default loginService;
