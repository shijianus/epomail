import BizError from '../error/biz-error';
import orm from '../entity/orm';
import user from '../entity/user';
import { eq } from 'drizzle-orm';
import totpUtils from '../utils/totp-utils';
import cryptoUtils from '../utils/crypto-utils';
import KvConst from '../const/kv-const';
import constant from '../const/constant';
import userContext from '../security/user-context';
import userService from './user-service';
import emailService from './email-service';
import settingService from './setting-service';
import { t } from '../i18n/i18n';
import { Resend } from 'resend';

const totpService = {
	/**
	 * Generate setup secret and URI for the current user
	 */
	async getSetupInfo(c, userId, email) {
		const rawSecret = totpUtils.generateSecret(20);
		const otpauthUri = totpUtils.generateOtpAuthUri(rawSecret, email, 'EpoMail');

		// Store setup payload in KV with 10 minutes TTL
		await c.env.kv.put(
			KvConst.TOTP_SETUP + userId,
			JSON.stringify({
				rawSecret,
				email,
				createdAt: Date.now()
			}),
			{ expirationTtl: 600 }
		);

		return {
			secret: rawSecret,
			otpauthUri
		};
	},

	/**
	 * Verify initial code and enable 2FA
	 */
	async enableTotp(c, userId, params) {
		const { code } = params;
		if (!code) {
			throw new BizError(t('totpCodeEmpty'));
		}

		const setupData = await c.env.kv.get(KvConst.TOTP_SETUP + userId, { type: 'json' });
		if (!setupData || !setupData.rawSecret) {
			throw new BizError(t('totpSetupExpired'));
		}

		const verifyResult = await totpUtils.verifyTOTP(setupData.rawSecret, code, 1);
		if (!verifyResult.isValid) {
			throw new BizError(t('totpCodeInvalid'));
		}

		const { rawCodes, hashedCodes } = await totpUtils.generateBackupCodes(10);
		const encryptedSecret = await totpUtils.encryptSecret(setupData.rawSecret, c.env);
		const now = new Date().toISOString();

		await orm(c).update(user).set({
			totpEnabled: 1,
			totpSecret: encryptedSecret,
			totpKeyVersion: 1,
			totpBackupCodes: JSON.stringify(hashedCodes),
			totpCreatedAt: now
		}).where(eq(user.userId, userId)).run();

		// Session revocation: except current session, invalidate all other sessions
		const currentToken = userContext.getToken(c);
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		if (authInfo) {
			authInfo.tokens = currentToken ? [currentToken] : [];
			if (authInfo.user) {
				authInfo.user.totpEnabled = 1;
				authInfo.user.totpCreatedAt = now;
			}
			await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
		}

		// Delete setup key
		await c.env.kv.delete(KvConst.TOTP_SETUP + userId);

		// Deliver in-app security alert email
		try {
			const targetUser = await userService.selectById(c, userId);
			if (targetUser) {
				const acc = await orm(c).select().from((await import('../entity/account')).default)
					.where(eq((await import('../entity/account')).default.userId, userId)).get();
				if (acc) {
					await emailService.deliverWelcomeEmailToUser(c, userId, acc.accountId, targetUser.email, {
						subject: '🛡️ [安全通知] 您的账号已成功开启两步验证 (2FA)',
						text: `您好，您的 EpoCanvas Mail 账号 (${targetUser.email}) 已于 ${now} 成功启用了两步验证。除当前设备外，其他会话已自动下线。如非本人操作，请立即修改密码！`,
						content: `<div style="font-family: sans-serif; padding: 20px; line-height: 1.6;">
							<h2 style="color: #10b981;">🛡️ 您的账号已成功开启两步验证 (2FA)</h2>
							<p>您好：</p>
							<p>您的 EpoCanvas Mail 账号 <strong>${targetUser.email}</strong> 已于 <strong>${now}</strong> 成功启用了 TOTP 两步身份验证。</p>
							<p style="color: #64748b;">为了保障账户安全，系统已自动注销该账号在其他设备上的登录会话。</p>
							<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
							<p style="font-size: 12px; color: #94a3b8;">⚠️ 如非本人操作，请立即修改密码并联系系统管理员。</p>
						</div>`,
						isBroadcast: true
					});
				}
			}
		} catch (err) {
			console.error('Failed to send 2FA enable notice:', err);
		}

		return {
			backupCodes: rawCodes
		};
	},

	/**
	 * Disable 2FA for the current user (requires password + current OTP / backup code)
	 */
	async disableTotp(c, userId, params) {
		const { password, code } = params;
		if (!password || !code) {
			throw new BizError(t('totpDisableParamsEmpty'));
		}

		const userRow = await userService.selectById(c, userId);
		if (!userRow) {
			throw new BizError(t('notExistUser'));
		}

		if (userRow.totpEnabled !== 1) {
			return true;
		}

		// Verify password
		const isPwdValid = await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password);
		if (!isPwdValid) {
			throw new BizError(t('IncorrectPwd'));
		}

		// Verify OTP or Backup Code
		let codeValid = false;
		if (userRow.totpSecret) {
			const plainSecret = await totpUtils.decryptSecret(userRow.totpSecret, c.env);
			const totpCheck = await totpUtils.verifyTOTP(plainSecret, code, 1);
			if (totpCheck.isValid) {
				codeValid = true;
			}
		}

		if (!codeValid && userRow.totpBackupCodes) {
			const backupCheck = await totpUtils.verifyAndConsumeBackupCode(code, userRow.totpBackupCodes);
			if (backupCheck.isValid) {
				codeValid = true;
			}
		}

		if (!codeValid) {
			throw new BizError(t('totpCodeInvalid'));
		}

		// Update database
		await orm(c).update(user).set({
			totpEnabled: 0,
			totpSecret: '',
			totpBackupCodes: '[]',
			totpCreatedAt: ''
		}).where(eq(user.userId, userId)).run();

		// Session revocation: except current session, invalidate all other sessions
		const currentToken = userContext.getToken(c);
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		if (authInfo) {
			authInfo.tokens = currentToken ? [currentToken] : [];
			if (authInfo.user) {
				authInfo.user.totpEnabled = 0;
				authInfo.user.totpCreatedAt = '';
			}
			await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
		}

		// Deliver in-app security alert email
		try {
			const acc = await orm(c).select().from((await import('../entity/account')).default)
				.where(eq((await import('../entity/account')).default.userId, userId)).get();
			if (acc) {
				const now = new Date().toISOString();
				await emailService.deliverWelcomeEmailToUser(c, userId, acc.accountId, userRow.email, {
					subject: '⚠️ [安全警告] 您的账号已停用两步验证 (2FA)',
					text: `您好，您的 EpoCanvas Mail 账号 (${userRow.email}) 已于 ${now} 关闭了两步验证保护。如非本人操作，请立即登录并开启 2FA！`,
					content: `<div style="font-family: sans-serif; padding: 20px; line-height: 1.6;">
						<h2 style="color: #ef4444;">⚠️ 您的账号已停用两步验证 (2FA)</h2>
						<p>您好：</p>
						<p>您的 EpoCanvas Mail 账号 <strong>${userRow.email}</strong> 已于 <strong>${now}</strong> 关闭了 TOTP 两步验证。</p>
						<p style="color: #b91c1c;">当前账户仅受单重密码保护，建议尽快重新开启两步验证以防范凭据泄露风险。</p>
					</div>`,
					isBroadcast: true
				});
			}
		} catch (err) {
			console.error('Failed to send 2FA disable notice:', err);
		}

		return true;
	},

	/**
	 * Regenerate Backup Codes (requires password confirmation)
	 */
	async regenerateBackupCodes(c, userId, params) {
		const { password } = params;
		if (!password) {
			throw new BizError(t('emptyPwdMsg'));
		}

		const userRow = await userService.selectById(c, userId);
		if (!userRow) {
			throw new BizError(t('notExistUser'));
		}

		if (userRow.totpEnabled !== 1) {
			throw new BizError(t('totpNotEnabled'));
		}

		const isPwdValid = await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password);
		if (!isPwdValid) {
			throw new BizError(t('IncorrectPwd'));
		}

		const { rawCodes, hashedCodes } = await totpUtils.generateBackupCodes(10);

		await orm(c).update(user).set({
			totpBackupCodes: JSON.stringify(hashedCodes)
		}).where(eq(user.userId, userId)).run();

		return {
			backupCodes: rawCodes
		};
	},

	/**
	 * Admin emergency reset TOTP for locked-out users
	 */
	async adminResetTotp(c, adminUserId, targetUserId) {
		targetUserId = Number(targetUserId);
		if (!targetUserId) {
			throw new BizError(t('notExistUser'));
		}

		const targetUser = await userService.selectById(c, targetUserId);
		if (!targetUser) {
			throw new BizError(t('notExistUser'));
		}

		const now = new Date().toISOString();

		// Audit Log
		console.log(JSON.stringify({
			auditEvent: 'ADMIN_RESET_TOTP',
			adminUserId,
			targetUserId,
			targetEmail: targetUser.email,
			timestamp: now
		}));

		// Clear TOTP fields in D1
		await orm(c).update(user).set({
			totpEnabled: 0,
			totpSecret: '',
			totpBackupCodes: '[]',
			totpCreatedAt: ''
		}).where(eq(user.userId, targetUserId)).run();

		// Invalidate ALL session tokens in KV (force logout everywhere)
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + targetUserId, { type: 'json' });
		if (authInfo) {
			authInfo.tokens = [];
			if (authInfo.user) {
				authInfo.user.totpEnabled = 0;
				authInfo.user.totpCreatedAt = '';
			}
			await c.env.kv.put(KvConst.AUTH_INFO + targetUserId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
		}

		// Deliver security notification email (both in-app and via Resend external service if configured)
		try {
			const settingData = await settingService.query(c);
			const alertSubject = '🚨 [安全提醒] 管理员已重置您的两步验证 (2FA)';
			const alertText = `您好，管理员已于 ${now} 重置了您的 EpoCanvas Mail 账号 (${targetUser.email}) 的两步验证。您的所有活跃登录会话已被强制下线。如非您本人申请，请立即联系系统管理员！`;
			const alertHtml = `<div style="font-family: sans-serif; padding: 24px; line-height: 1.6; color: #1e293b;">
				<h2 style="color: #dc2626; margin-bottom: 16px;">🚨 管理员已重置您的两步验证 (2FA)</h2>
				<p>尊敬的用户：</p>
				<p>系统管理员已于 <strong>${now}</strong> 重置了您的 EpoCanvas Mail 账号（<strong>${targetUser.email}</strong>）的两步验证设置。</p>
				<p style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; color: #991b1b;">
					为确保账号安全，您的所有历史登录会话均已被强制终止。您可以立即使用账号密码登录系统，并重新设置两步验证。
				</p>
				<p style="font-size: 13px; color: #64748b; margin-top: 24px;">⚠️ 如果您并未申请重置，说明您的账号可能存在安全风险，请立即联系管理员。</p>
			</div>`;

			// 1. In-app mailbox injection
			const acc = await orm(c).select().from((await import('../entity/account')).default)
				.where(eq((await import('../entity/account')).default.userId, targetUserId)).get();
			if (acc) {
				await emailService.deliverWelcomeEmailToUser(c, targetUserId, acc.accountId, targetUser.email, {
					subject: alertSubject,
					text: alertText,
					content: alertHtml,
					isBroadcast: true
				});
			}

			// 2. Resend external mail dispatch if configured
			if (settingData.resendTokens && typeof settingData.resendTokens === 'object') {
				const tokens = Object.values(settingData.resendTokens);
				if (tokens.length > 0 && tokens[0]) {
					const resend = new Resend(tokens[0]);
					await resend.emails.send({
						from: `security@${c.env.domain[0] || 'epomail.bond'}`,
						to: targetUser.email,
						subject: alertSubject,
						text: alertText,
						html: alertHtml
					}).catch(err => {
						console.warn('Resend alert dispatch skipped or failed:', err.message);
					});
				}
			}
		} catch (err) {
			console.error('Failed to dispatch admin reset notification:', err);
		}

		return true;
	}
};

export default totpService;
