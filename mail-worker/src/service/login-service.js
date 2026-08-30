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
import orm from '../entity/orm.js';
import user from '../entity/user.js';
import { eq } from 'drizzle-orm';

const loginService = {

	async register(c, params, oauth = false) {

		const { email, password, token, code } = params;

		let { regKey, register, registerVerify, regVerifyCount, minEmailPrefix, emailPrefixFilter } = await settingService.query(c)

		if (oauth) {
			registerVerify = settingConst.registerVerify.CLOSE;
			register = settingConst.register.OPEN;
		}

		if (register === settingConst.register.CLOSE) {
			throw new BizError(t('regDisabled'));
		}

		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}

		if (emailUtils.getName(email).length < minEmailPrefix) {
			throw new BizError(t('minEmailPrefix', { msg: minEmailPrefix } ));
		}

		if (emailPrefixFilter.some(content => emailUtils.getName(email).includes(content)))  {
			throw new BizError(t('banEmailPrefix'));
		}

		if (emailUtils.getName(email).length > 64) {
			throw new BizError(t('emailLengthLimit'));
		}

		if (password.length > 30) {
			throw new BizError(t('pwdLengthLimit'));
		}

		if (password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notEmailDomain'));
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

		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		let defType = null

		if (!type) {
			const roleRow = await roleService.selectDefaultRole(c);
			defType = roleRow.roleId
		}


		const roleRow = await roleService.selectById(c, type || defType);

		if(!roleService.hasAvailDomainPerm(roleRow.availDomain, email)) {

			if (type) {
				throw new BizError(t('noDomainPermRegKey'),403)
			}

			if (defType) {
				throw new BizError(t('noDomainPermReg'),403)
			}

		}

		let regVerifyOpen = false

		if (registerVerify === settingConst.registerVerify.OPEN) {
			regVerifyOpen = true
			await turnstileService.verify(c,token)
		}

		if (registerVerify === settingConst.registerVerify.COUNT) {
			regVerifyOpen = await verifyRecordService.isOpenRegVerify(c, regVerifyCount);
			if (regVerifyOpen) {
				await turnstileService.verify(c,token)
			}
		}

		const { salt, hash } = await saltHashUtils.hashPassword(password);

		const userId = await userService.insert(c, { email, regKeyId,password: hash, salt, type: type || defType });

		await accountService.insert(c, { userId: userId, email, name: emailUtils.getName(email) });

		await userService.updateUserInfo(c, userId, true);

		try {
			const emailService = (await import('./email-service')).default;
			const acc = await accountService.selectByEmail(c, email);
			if (acc) {
				await emailService.deliverWelcomeEmailToUser(c, userId, acc.accountId, email);
			}
		} catch (err) {
			console.error('Failed to deliver welcome email on register:', err);
		}

		if (regKey !== settingConst.regKey.CLOSE && type) {
			await regKeyService.reduceCount(c, code, 1);
		}

		if (registerVerify === settingConst.registerVerify.COUNT && !regVerifyOpen) {
			const row = await verifyRecordService.increaseRegCount(c);
			return {regVerifyOpen: row.count >= regVerifyCount}
		}

		return {regVerifyOpen}

	},

	async registerVerify() {

	},

	async handleOpenRegKey(c, regKey, code) {

		if (!code) {
			throw new BizError(t('emptyRegKey'));
		}

		const regKeyRow = await regKeyService.selectByCode(c, code);

		if (!regKeyRow) {
			throw new BizError(t('notExistRegKey'));
		}

		if (regKeyRow.count <= 0) {
			throw new BizError(t('noRegKeyCount'));
		}

		const today = toUtc().tz('Asia/Shanghai').startOf('day')
		const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');

		if (expireTime.isBefore(today)) {
			throw new BizError(t('regKeyExpire'));
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
			const { salt, hash } = await cryptoUtils.hashPassword(plainPassword);
			await orm(c).update(user).set({ password: hash, salt }).where(eq(user.userId, userId)).run();
		} catch (err) {
			console.error('Lazy password migration failed:', err);
		}
	},

	async login(c, params, noVerifyPwd = false) {

		const { email, password } = params;

		if ((!email || !password) && !noVerifyPwd) {
			throw new BizError(t('emailAndPwdEmpty'));
		}

		const failKey = KvConst.LOGIN_FAIL + email;
		let failCountStr = await c.env.kv.get(failKey);
		let failCount = failCountStr ? parseInt(failCountStr) : 0;

		if (failCount >= 5) {
			throw new BizError(t('accountLocked'));
		}

		const incrementFail = async () => {
			await c.env.kv.put(failKey, (failCount + 1).toString(), { expirationTtl: 12 * 60 * 60 });
		};

		const userRow = await userService.selectByEmailIncludeDel(c, email);

		if (!userRow) {
			await incrementFail();
			throw new BizError(t('notExistUser'));
		}

		if (userRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}

		if (userRow.status === userConst.status.BAN) {
			throw new BizError(t('isBanUser'));
		}

		let isLegacy = false;
		if (!noVerifyPwd) {
			const checkResult = await cryptoUtils.verifyPasswordWithUpgrade(password, userRow.salt, userRow.password);
			if (!checkResult.isValid) {
				await incrementFail();
				throw new BizError(t('IncorrectPwd'));
			}
			isLegacy = checkResult.isLegacy;
		}

		// Check if TOTP 2FA is enabled
		if (userRow.totpEnabled === 1) {
			const tempToken = 'totp_tmp_' + uuidv4().replace(/-/g, '');
			await c.env.kv.put(
				KvConst.TOTP_PENDING + tempToken,
				JSON.stringify({
					userId: userRow.userId,
					email: userRow.email,
					attempts: 0,
					needsPasswordUpgrade: isLegacy ? password : null,
					createdAt: Date.now()
				}),
				{ expirationTtl: 300 } // 5 minutes TTL
			);

			return {
				mfaRequired: true,
				tempToken,
				authType: 'totp',
				email: userRow.email
			};
		}

		// Clear fail count on success
		if (failCount > 0) {
			await c.env.kv.delete(failKey);
		}

		// If legacy single-round SHA-256 hash was detected, upgrade to PBKDF2 lazily
		if (isLegacy && password) {
			await this.lazyMigratePassword(c, userRow.userId, password);
		}

		const uuid = uuidv4();
		const jwt = await JwtUtils.generateToken(c, { userId: userRow.userId, token: uuid });

		let authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userRow.userId, { type: 'json' });

		if (authInfo && (authInfo.user.email === userRow.email)) {

			if (authInfo.tokens.length > 10) {
				authInfo.tokens.shift();
			}

			authInfo.tokens.push(uuid);

		} else {

			authInfo = {
				tokens: [],
				user: userRow,
				refreshTime: dayjs().toISOString()
			};

			authInfo.tokens.push(uuid);

		}

		await userService.updateUserInfo(c, userRow.userId);

		await c.env.kv.put(KvConst.AUTH_INFO + userRow.userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
		return jwt;
	},

	async verifyTotpLogin(c, params) {
		const { tempToken, code, isBackupCode = false } = params;

		if (!tempToken || !code) {
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

		const userRow = await userService.selectById(c, pendingData.userId);
		if (!userRow || userRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}
		if (userRow.status === userConst.status.BAN) {
			throw new BizError(t('isBanUser'));
		}

		if (isBackupCode) {
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

		// Verification passed: consume temporary token
		await c.env.kv.delete(pendingKey);

		// Clear login fail rate limit
		if (failKey) {
			await c.env.kv.delete(failKey);
		}

		// Lazy migration of legacy password if needed
		if (pendingData.needsPasswordUpgrade) {
			await this.lazyMigratePassword(c, userRow.userId, pendingData.needsPasswordUpgrade);
		}

		// Generate formal session JWT
		const uuid = uuidv4();
		const jwt = await JwtUtils.generateToken(c, { userId: userRow.userId, token: uuid });

		let authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userRow.userId, { type: 'json' });

		if (authInfo && (authInfo.user.email === userRow.email)) {
			if (authInfo.tokens.length > 10) {
				authInfo.tokens.shift();
			}
			authInfo.tokens.push(uuid);
		} else {
			authInfo = {
				tokens: [uuid],
				user: userRow,
				refreshTime: dayjs().toISOString()
			};
		}

		await userService.updateUserInfo(c, userRow.userId);
		await c.env.kv.put(KvConst.AUTH_INFO + userRow.userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
		return jwt;
	},

	async logout(c, userId) {
		const token = await userContext.getToken(c);
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		if (authInfo && authInfo.tokens) {
			const index = authInfo.tokens.findIndex(item => item === token);
			if (index > -1) {
				authInfo.tokens.splice(index, 1);
				await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo));
			}
		}
	}

};

export default loginService;
