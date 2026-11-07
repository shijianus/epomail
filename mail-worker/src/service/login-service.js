import BizError from '../error/biz-error.js';
import userService from './user-service.js';
import emailUtils, { RESERVED_EMAIL_LOCAL_NAMES } from '../utils/email-utils.js';
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
import rbacGuard from './rbac-guard-service.js';
import permService from './perm-service.js';
import dayjs from 'dayjs';
import { toUtc } from '../utils/date-uitil.js';
import { isAdminUser } from '../utils/admin-utils.js';
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
import authOperation from '../utils/auth-security-operation.js';
import { authVersionOf, hashToken } from '../utils/one-time-credential.js';
import { getUserDb } from '../utils/db-accessor.js';
import legalPolicyService from './legal-policy-service.js';

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

function unusedBackupCodeCount(value) {
	if (!value) return 0;
	try {
		const parsed = typeof value === 'string' ? JSON.parse(value) : value;
		if (Array.isArray(parsed)) return parsed.filter(item => item.used === 0).length;
		if (parsed && Array.isArray(parsed.hashedCodes)) {
			return parsed.hashedCodes.filter(item => item.used === 0).length;
		}
	} catch (_) {}
	return 0;
}

/**
 * Per-session authentication provenance. Only the issuing server (OAuth
 * service) can set it, and it is stored next to the token list so a stale or
 * forged marker cannot outlive the session it describes.
 *
 * The initial-password flow uses this to prove the caller just completed a
 * provider authentication; a plain password session never carries it.
 */
function buildSessionMeta(method, provider, authVersion, mfaCompleted = false) {
	if (method !== 'oauth') return null;
	return {
		method: 'oauth',
		authVersion, mfaCompleted,
		provider: typeof provider === 'string' && provider ? provider.slice(0, 64) : null,
		at: Date.now()
	};
}

function normalizeAuthContext(authContext) {
	if (!authContext || authContext.method !== 'oauth') return null;
	const provider = typeof authContext.provider === 'string' ? authContext.provider.trim() : '';
	return {
		method: 'oauth',
		provider: provider || null
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

const LOGIN_FAIL_WINDOW_SECONDS = 12 * 60 * 60;

function loginFailWindow() {
	const now = Math.floor(Date.now() / 1000);
	const start = Math.floor(now / LOGIN_FAIL_WINDOW_SECONDS) * LOGIN_FAIL_WINDOW_SECONDS;
	return { start, expires: start + LOGIN_FAIL_WINDOW_SECONDS };
}

async function readLoginFail(c, email) {
	if (String(c?.env?.ENVIRONMENT || '').toLowerCase() === 'test') return null;
	try {
		const db = getUserDb(c);
		if (!db?.prepare) return null;
		const window = loginFailWindow();
		const row = await db.prepare(`SELECT count FROM rate_limit_counter
			WHERE scope = 'login-fail' AND subject = ? AND window_start = ?`)
			.bind(`email:${email}`, window.start).first();
		return Number(row?.count) || 0;
	} catch (_) {
		return null;
	}
}

async function incrementLoginFail(c, email) {
	if (String(c?.env?.ENVIRONMENT || '').toLowerCase() === 'test') return null;
	try {
		const db = getUserDb(c);
		if (!db?.prepare) return null;
		const window = loginFailWindow();
		const row = await db.prepare(`
			INSERT INTO rate_limit_counter (scope, subject, window_start, count, expires_at)
			VALUES ('login-fail', ?, ?, 1, ?)
			ON CONFLICT(scope, subject, window_start)
			DO UPDATE SET count = count + 1
			RETURNING count
		`).bind(`email:${email}`, window.start, window.expires).first();
		return Number(row?.count) || 0;
	} catch (_) {
		return null;
	}
}

async function clearLoginFail(c, email) {
	if (String(c?.env?.ENVIRONMENT || '').toLowerCase() !== 'test') {
		try {
			const db = getUserDb(c);
			if (db?.prepare) {
				await db.prepare(`DELETE FROM rate_limit_counter
					WHERE scope = 'login-fail' AND subject = ?`).bind(`email:${email}`).run();
			}
		} catch (_) {}
	}
	try {
		await c.env.kv.delete(KvConst.LOGIN_FAIL + email);
	} catch (_) {}
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

			const settingData = await settingService.query(c);
			const acceptance = await legalPolicyService.validateRegistrationAcceptanceAuthoritative(c, params, settingData);
			let { regKey, register, registerVerify, regVerifyCount, minEmailPrefix, emailPrefixFilter } = settingData;


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

		// RFC 5321 邮箱总长上限：拦截超长地址在 account/audit/rate-limit 等键位上的存储滥用
		if (email.length > 254) {
			throw new BizError(t('emailLengthLimit'), undefined, 'email_too_long');
		}

		if (emailUtils.getName(email).length < minEmailPrefix) {
			throw new BizError(t('minEmailPrefix', { msg: minEmailPrefix } ), undefined, 'prefix_too_short');
		}

		// 大小写归一后再匹配：否则 "Support@" 可绕过 "support" 过滤；同时空过滤条目不再全量拦截
		const registerLocalName = emailUtils.getName(email);
		if (emailPrefixFilter.some(content => {
			const needle = String(content || '').trim().toLowerCase();
			return needle && registerLocalName.toLowerCase().includes(needle);
		}))  {
			throw new BizError(t('banEmailPrefix'), undefined, 'invalid_local');
		}

		if (emailUtils.getName(email).length > 64) {
			throw new BizError(t('emailLengthLimit'), undefined, 'prefix_too_long');
		}

		if (typeof password !== 'string' || password.length > 128) {
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

		// RFC 2142 合规保留地址：严禁新注册/新别名占用 postmaster、abuse、security 等官方身份
		if (RESERVED_EMAIL_LOCAL_NAMES.has(localName.toLowerCase())) {
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
			regVerifyOpen,
			acceptance
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
			await (await import('../utils/db-accessor.js')).getUserDb(c)
				.prepare('DELETE FROM legal_acceptance WHERE user_id = ?').bind(id).run();
		} catch (error) {
			console.error('Failed to roll back registration acceptance:', error);
		}
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
			const acceptance = await legalPolicyService.validateRegistrationAcceptanceAuthoritative(c, params);
			userId = await userService.insert(c, { email, regKeyId, password: hash, salt, type: type || defType });
			acc = await accountService.insert(c, { userId: userId, email, name: assignedName });
			await legalPolicyService.recordAcceptance(c, userId, acceptance);
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

	/**
	 * A legacy or delegated invite code must not be able to grant a privileged
	 * role on redemption. Creation is already guarded by
	 * rbacGuard.assertCanAssignRole; this is the defence-in-depth check for
	 * codes created before that guard existed or by a since-demoted operator.
	 * It covers master and every role carrying PRIVILEGED_PERMS (for example a
	 * legacy moderator code), not only master.
	 */
	async assertInviteRoleBoundary(c, regKeyRow) {
		let role;
		try {
			role = await roleService.selectById(c, regKeyRow.roleId);
		} catch (err) {
			// A failed role lookup cannot prove the invite is harmless. Fail
			// closed for legacy/privileged codes instead of granting a role.
			console.warn('Invite role lookup unavailable:', err?.message || err);
			return false;
		}
		if (!role) return false;
		const isMasterRole = role.roleCode === 'master' || role.key === 'master';
		const roleKey = String(role.roleCode || role.key || '').toLowerCase();
		let roleKeys = [];
		let permLookupFailed = false;
		try {
			roleKeys = await permService.rolePermKeys(c, role.roleId);
		} catch (err) {
			// Lightweight/legacy schemas may not expose role_perm. Normal roles
			// may continue for compatibility, but a code that is known to map to
			// a privileged seed role must not silently bypass the owner check.
			permLookupFailed = true;
			console.warn('Invite role permission lookup unavailable:', err?.message || err);
		}
		if (permLookupFailed && (isMasterRole || roleKey === 'moderator')) return false;
		const hasPrivilegedPerm = roleKeys.some(key => rbacGuard.PRIVILEGED_PERMS.has(key));
		if (!isMasterRole && !hasPrivilegedPerm) return true;
		const creatorId = Number(regKeyRow.userId) || 0;
		const creator = creatorId > 0 ? await userService.selectByIdIncludeDel(c, creatorId) : null;
		const creatorActive = Boolean(creator)
			&& Number(creator.isDel ?? creator.is_del ?? 0) === 0
			&& Number(creator.status ?? 0) === 0;
		return creatorActive && isAdminUser(c, creator);
	},

	async handleOpenRegKey(c, regKey, code) {

		if (!code) {
			throw new BizError(t('emptyRegKey'), undefined, 'invite_code_required');
		}

		const regKeyRow = await regKeyService.selectByCode(c, code);

		if (!regKeyRow) {
			throw new BizError(t('notExistRegKey'), undefined, 'invite_code_invalid');
		}

		if (!await this.assertInviteRoleBoundary(c, regKeyRow)) {
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

		if (!await this.assertInviteRoleBoundary(c, regKeyRow)) {
			return null
		}

		const today = toUtc().tz('Asia/Shanghai').startOf('day')
		const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');

		if (regKeyRow.count <= 0 || expireTime.isBefore(today)) {
			return null
		}

		return { type: regKeyRow.roleId, regKeyId: regKeyRow.regKeyId };
	},

	async lazyMigratePassword(c, row, plainPassword) {
		try {
			const { salt, hash } = await cryptoUtils.hashPassword(plainPassword, c.env);
			await orm(c).update(user).set({ password: hash, salt }).where(and(eq(user.userId, row.userId), eq(user.password, row.password), eq(user.salt, row.salt), eq(user.authVersion, authVersionOf(row)))).run();
		} catch (err) {
			console.error('Lazy password migration failed:', err);
		}
	},

	async login(c, params, noVerifyPwd = false, authContext = null) {

		await rateLimit.check(c, { scope: 'login', limit: 30, windowSeconds: 900 });

		const { email, password } = params;
		const trustedAuthContext = normalizeAuthContext(authContext);

		const inputEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
		const inputPassword = typeof password === 'string' ? password : '';
		// 输入上限必须先于任何 PBKDF2 派生与 D1/KV 查询执行：超长凭据曾是
		// 冷 isolate CPU 耗尽 (1102) 与 rate_limit_counter 行膨胀的攻击入口。
		if (inputEmail.length > 254 || /[\r\n\0]/.test(inputEmail)) {
			throw new BizError(t('notEmail'), undefined, 'invalid_email');
		}
		if (inputPassword.length > 128) {
			throw new BizError(t('pwdLengthLimit'), undefined, 'password_too_long');
		}
		if ((!inputEmail || !inputPassword) && !noVerifyPwd) {
			throw new BizError(t('emailAndPwdEmpty'));
		}

		const readFailForIdentifier = async (identifier) => {
			if (!identifier) return 0;
			const durable = await readLoginFail(c, identifier);
			if (durable !== null) return durable;
			const str = await c.env.kv.get(KvConst.LOGIN_FAIL + identifier);
			return str ? parseInt(str) : 0;
		};

		const incrementFailForIdentifier = async (identifier) => {
			if (!identifier) return 0;
			const durableCount = await incrementLoginFail(c, identifier);
			if (durableCount !== null) return durableCount;
			// Pre-migration / test fallback. The D1 counter is authoritative when
			// the rate_limit_counter table is present.
			try {
				const key = KvConst.LOGIN_FAIL + identifier;
				const latest = await c.env.kv.get(key);
				const current = latest ? parseInt(latest) : 0;
				const nextCount = current + 1;
				await c.env.kv.put(key, nextCount.toString(), { expirationTtl: 12 * 60 * 60 });
				return nextCount;
			} catch {
				return 0;
			}
		};

		const failCount = await readFailForIdentifier(inputEmail);
		if (failCount >= 5) {
			throw new BizError(t('accountLocked'));
		}

		let canonicalEmail = '';
		const notifyLocked = async () => {
			if (!userRow || !userRow.userId) return;
			try {
				const securityNoticeService = (await import('./security-notice-service.js')).default;
				const { SECURITY_EVENT_TYPES } = await import('../const/security-notice-templates.js');
				await securityNoticeService.sendNotice(c, userRow.userId, SECURITY_EVENT_TYPES.ACCOUNT_LOCKED, {
					detail: '12 hours lockdown (5 consecutive failed attempts)'
				});
			} catch (e) {
				console.error('Failed to send account locked notice:', e);
			}
		};

		const incrementFail = async () => {
			const inputCount = await incrementFailForIdentifier(inputEmail);
			let canonicalCount = 0;
			if (canonicalEmail && canonicalEmail !== inputEmail) {
				canonicalCount = await incrementFailForIdentifier(canonicalEmail);
			}
			if (inputCount >= 5 || canonicalCount >= 5) {
				await notifyLocked();
			}
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

		if (userRow?.email) {
			canonicalEmail = String(userRow.email).trim().toLowerCase();
			if (canonicalEmail && canonicalEmail !== inputEmail) {
				const canonicalFailCount = await readFailForIdentifier(canonicalEmail);
				if (canonicalFailCount >= 5) {
					throw new BizError(t('accountLocked'));
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
				let tempToken;
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

				const loginBinding = { userId:userRow.userId, authVersion:authVersionOf(userRow), purpose:'login_mfa',
					target:'login', sessionHash:await hashToken('login:' + uuidv4()) };
				const pendingData = { email:userRow.email, passkeyChallenge, ...webauthnUtils.ceremonyContext(c),
					stepUpRequired:riskAssessment.stepUpRequired, step:1, verifiedFactors:[], deviceTag,
					authContext:trustedAuthContext, createdAt:Date.now() };
				tempToken = await authOperation.issue(c,{...loginBinding,payload:pendingData,ttlSeconds:300});

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
		await clearLoginFail(c, inputEmail);
		if (userRow.email && userRow.email.toLowerCase() !== inputEmail) {
			await clearLoginFail(c, userRow.email.toLowerCase());
		}

		// If legacy single-round SHA-256 hash was detected, upgrade to PBKDF2 lazily
		if (isLegacy && inputPassword) {
			await this.lazyMigratePassword(c, userRow, inputPassword);
		}

		const activeLoginEmail = inputEmail.includes('@') ? inputEmail : userRow.email;
		const uuid = uuidv4();
		const jwt = await JwtUtils.generateToken(c, { 
			userId: userRow.userId, 
			loginEmail: activeLoginEmail,
			token: uuid,
			authVersion: authVersionOf(userRow)
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

		attachSessionMeta(authInfo, uuid, trustedAuthContext && buildSessionMeta(trustedAuthContext.method, trustedAuthContext.provider, authVersionOf(userRow)));

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
		const legalAcceptance = await legalPolicyService.getLegalAcceptanceStatus(c, userRow.userId);
		return { token: jwt, email: activeLoginEmail, userId: userRow.userId, legalAcceptance };
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

		// The pending token itself is the pre-login session capability. Its immutable
		// D1 binding is recovered by digest; no client may supply a user/version.
		const stored = /^[a-f0-9]{64}$/.test(tempToken) ? await getUserDb(c).prepare(
			'SELECT user_id,auth_version,session_hash FROM auth_security_operation WHERE token_hash=? AND purpose=?'
		).bind(await hashToken(tempToken),'login_mfa').first() : null;
		if (!stored) throw new BizError(t('totpSessionExpired'));
		const binding={token:tempToken,userId:stored.user_id,authVersion:stored.auth_version,sessionHash:stored.session_hash,purpose:'login_mfa',target:'login'};
		const attempt=await authOperation.incrementAttempt(c,binding);
		if (!attempt) throw new BizError(t('totpSessionExpired'));
		const operation=await authOperation.inspect(c,binding);
		const pendingData=operation.payload;
		const targetEmail = pendingData.email;
		const failKey = targetEmail ? KvConst.LOGIN_FAIL + targetEmail.toLowerCase() : null;
		let failCount = 0;
		if (failKey) {
			const durable = await readLoginFail(c, targetEmail.toLowerCase());
			if (durable === null) {
				const failCountStr = await c.env.kv.get(failKey);
				failCount = failCountStr ? parseInt(failCountStr) : 0;
			} else {
				failCount = durable;
			}
			if (failCount >= 5) {
				throw new BizError(t('accountLocked'));
			}
		}

		const incrementAccountFail = async () => {
			if (!failKey) return;
			const durable = await incrementLoginFail(c, targetEmail.toLowerCase());
			if (durable !== null) return;
			const currentFailStr = await c.env.kv.get(failKey);
			const currentFail = currentFailStr ? parseInt(currentFailStr) : 0;
			await c.env.kv.put(failKey, (currentFail + 1).toString(), { expirationTtl: 12 * 60 * 60 });
		};

		let userRow = await userService.selectById(c, binding.userId);
		if (!userRow || authVersionOf(userRow)!==binding.authVersion) throw new BizError(t('totpSessionExpired'));
		const factorType = isPasskey ? 'passkey' : ((isBackupCode || !/^\d{6}$/.test(String(code).trim())) ? 'backup_code' : 'totp');

		if (pendingData.step === 2 && Array.isArray(pendingData.verifiedFactors) && pendingData.verifiedFactors.includes(factorType)) {
			throw new BizError(t('stepUpDifferentFactorRequired'));
		}

		try {
			await totpService.verifyExistingFactor(c,userRow,params,{challenge:pendingData.passkeyChallenge,origin:pendingData.origin,rpId:pendingData.rpId});
		} catch (err) { await incrementAccountFail(); throw err; }
		userRow=await userService.selectById(c,binding.userId);
		if (!userRow || authVersionOf(userRow)!==binding.authVersion) throw new BizError(t('totpSessionExpired'));
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

				// Transition the same row: never reset attempts or extend its deadline.
				const transitioned = await getUserDb(c).prepare(`UPDATE auth_security_operation SET payload=?
					WHERE token_hash=? AND purpose='login_mfa' AND consumed=0 AND attempts=? AND expires_at>unixepoch()
					AND EXISTS (SELECT 1 FROM user WHERE user_id=? AND auth_version=? AND is_del=0)
					RETURNING token_hash`).bind(JSON.stringify(pendingData),await hashToken(tempToken),attempt,binding.userId,binding.authVersion).first();
				if (!transitioned) throw new BizError(t('totpSessionExpired'));
				const nextToken=tempToken;

				return {
					stepUpRequired: true,
					step: 2,
					tempToken: nextToken,
					verifiedFactor: factorType,
					remainingFactors,
					hasTotp: !!userRow.totpSecret,
					hasPasskeys: activeUserKeys.length > 0,
					hasBackupCodes: remainingBackupCount > 0,
					passkeys: activeUserKeys.map(k => ({ id: k.credentialId, type: 'public-key' })),
					passkeyChallenge: nextPasskeyChallenge,
					email: userRow.email,
					message: t('stepUpAbnormalNotice')
				};
			}
		}

		// Verification fully passed: consume temporary token
		if (!await authOperation.consume(c,{...binding,attempt})) throw new BizError(t('totpSessionExpired'));

		// Clear login fail rate limit
		if (targetEmail) {
			await clearLoginFail(c, targetEmail.toLowerCase());
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
		let recoveredBackupCodes = null;
		if (factorType === 'backup_code' && unusedBackupCodeCount(userRow.totpBackupCodes) === 0) {
			// The last recovery code was the only remaining factor. Issue a new
			// set without bumping authVersion: the just-verified login must remain
			// usable, while losing the device can no longer strand the account.
			const backup = await totpUtils.generateBackupCodes(10, c.env);
			const serialized = JSON.stringify({
				hashedCodes: backup.hashedCodes,
				encryptedRaw: backup.encryptedRaw
			});
			const updated = await getUserDb(c).prepare(`UPDATE user
				SET totp_backup_codes=?, update_time=CURRENT_TIMESTAMP
				WHERE user_id=? AND auth_version=? AND totp_backup_codes=? AND is_del=0`)
				.bind(serialized, userRow.userId, authVersionOf(userRow), userRow.totpBackupCodes).run();
			if (Number(updated?.meta?.changes ?? 0) === 1) recoveredBackupCodes = backup.rawCodes;
		}
		const activeLoginEmail = targetEmail && targetEmail.includes('@') ? targetEmail : userRow.email;
		const uuid = uuidv4();
		const jwt = await JwtUtils.generateToken(c, { 
			userId: userRow.userId, 
			loginEmail: activeLoginEmail,
			token: uuid,
			authVersion: authVersionOf(userRow)
		});

		// Issue trusted device token if rememberDevice was requested
		let issuedTrustToken = null;
		let sessionTrustEpoch = null;
		let sessionMaxEpoch = null;

		const effectiveDeviceTag = deviceTag || pendingData.deviceTag || (typeof c.req.header === 'function' ? c.req.header('x-device-tag') : '') || '';
		// 严格布尔判定：字符串 "false" 曾按 truthy 处理，意外签发 30 天可信设备令牌
		const wantsRememberDevice = rememberDevice === true || rememberDevice === 'true';
		if (wantsRememberDevice && effectiveDeviceTag) {
			const trustResult = await deviceTrustService.issueTrust(c, userRow.userId, effectiveDeviceTag, authVersionOf(userRow));
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
		attachSessionMeta(authInfo, uuid, pendingData.authContext && buildSessionMeta(pendingData.authContext.method, pendingData.authContext.provider, authVersionOf(userRow), true));

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
		const legalAcceptance = await legalPolicyService.getLegalAcceptanceStatus(c, userRow.userId);
		return { token: jwt, email: activeLoginEmail, userId: userRow.userId, trustedDeviceToken: issuedTrustToken,
			legalAcceptance, ...(recoveredBackupCodes ? { backupCodes: recoveredBackupCodes } : {}) };
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
