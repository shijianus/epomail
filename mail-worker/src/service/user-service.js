import BizError from '../error/biz-error';
import accountService from './account-service';
import { userOrm as orm, mailOrm } from '../entity/orm';
import user from '../entity/user';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { emailConst, isDel, roleConst, userConst } from '../const/entity-const';
import { email } from '../entity/email';
import { att } from '../entity/att';
import kvConst from '../const/kv-const';
import KvConst from '../const/kv-const';
import cryptoUtils from '../utils/crypto-utils';
import emailService from './email-service';
import dayjs from 'dayjs';
import permService from './perm-service';
import roleService from './role-service';
import emailUtils from '../utils/email-utils';
import saltHashUtils from '../utils/crypto-utils';
import constant from '../const/constant';
import { t } from '../i18n/i18n'
import reqUtils from '../utils/req-utils';
import {oauth} from "../entity/oauth";
import oauthService from "./oauth-service";
import emailCryptoUtils from '../utils/email-crypto-utils';

const userService = {

	async setCustomLabels(c, params, userId) {
		const { customLabels } = params;
		await orm(c).update(user).set({ customLabels }).where(eq(user.userId, userId));
		
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		if (authInfo && authInfo.user) {
			authInfo.user.customLabels = customLabels;
			await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
		}
	},

	async updateProfile(c, params, userId) {
        let profile = {};
        try {
            const profileStr = await c.env.kv.get('USER_PROFILE_' + userId);
            if (profileStr) {
                profile = JSON.parse(profileStr);
            }
        } catch (e) {}
        
        Object.assign(profile, params);
        await c.env.kv.put('USER_PROFILE_' + userId, JSON.stringify(profile));
        
        const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		if (authInfo && authInfo.user) {
            Object.assign(authInfo.user, params);
			await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
		}
	},
	
	async uploadImage(c, userId) {
        const formData = await c.req.formData();
        const file = formData.get('file');
        
        if (!file) throw new BizError('No file');
        
        const newFormData = new FormData();
        newFormData.append('file', file);
        
        const res = await fetch('https://drawing.shijian.qzz.io/upload', {
            method: 'POST',
            body: newFormData
        });
        
        if (!res.ok) {
            // fallback if drawing.shijian.qzz.io is unavailable, just return a dummy or throw
            throw new BizError('Failed to upload image to host');
        }
        
        const data = await res.json();
        // Adjust depending on the actual response format of the image host
        let url = data.url;
        if (!url && data.data) {
            if (data.data.url) url = data.data.url;
            else if (data.data.links && data.data.links.url) url = data.data.links.url;
        }
        if (!url) {
            // fallback
            url = data[0]?.src || '';
        }
        return url;
	},

	async loginUserInfo(c, userId) {

		const userRow = await userService.selectById(c, userId);

		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}

		const [account, roleRow, permKeys] = await Promise.all([
			accountService.selectByEmailIncludeDel(c, userRow.email),
			roleService.selectById(c, userRow.type),
			userRow.email === c.env.admin ? Promise.resolve(['*']) : permService.userPermKeys(c, userId)
		]);

		const user = {};
		user.userId = userRow.userId;
		user.sendCount = userRow.sendCount;
		user.email = userRow.email;
		user.account = account;
		user.name = account.name;
		user.permKeys = permKeys;
		user.role = roleRow;
		user.type = userRow.type;
		user.customLabels = userRow.customLabels;
		if (!user.customLabels || user.customLabels === '[]') {
			user.customLabels = JSON.stringify({
				allLabels: [
					{ name: '社群', icon: 'ic:outline-people-alt', color: '#3b82f6', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [
						{ condition: { type: 'sender_address_includes', value: 'gmail.com, outlook.com, qq.com, 163.com, yahoo.com, hotmail.com, foxmail.com, sina.com' } }
					]},
					{ name: '订阅', icon: 'ic:outline-subscriptions', color: '#10b981', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [
						{ condition: { type: 'system_setting', value: '' } }
					]},
					{ name: '推销', icon: 'ic:outline-local-offer', color: '#f59e0b', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [
						{ condition: { type: 'system_setting', value: '' } }
					]},
					{ name: '工作', icon: 'ic:outline-work-outline', color: '#8b5cf6', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: []}
				]
			});
		}

		if (c.env.admin === userRow.email) {
			user.role = constant.ADMIN_ROLE
			user.type = 0;
		}

		user.quota = await userService.getUserQuota(c, userId);
		
		// Load profile data
        let profile = {};
        try {
            const profileStr = await c.env.kv.get('USER_PROFILE_' + userId);
            if (profileStr) {
                profile = JSON.parse(profileStr);
            }
        } catch (e) {}
        
        user.nickname = profile.nickname || '';
        user.bio = profile.bio || '';
        user.avatarUrl = profile.avatarUrl || '';
        user.backgroundUrl = profile.backgroundUrl || '';
        user.showStats = profile.showStats ?? true;
        user.showTrend = profile.showTrend ?? true;
        user.showSources = profile.showSources ?? true;

        user.gender = profile.gender || 'prefer_not_to_say';
        user.genderCustom = profile.genderCustom || '';
        user.birthday = profile.birthday || '';
        user.phones = Array.isArray(profile.phones) ? profile.phones : [];
        user.addresses = profile.addresses || { home: '', work: '', other: '' };
        user.passwordUpdatedAt = profile.passwordUpdatedAt || userRow.createTime || '';
        user.density = profile.density || 'default';
        user.inboxType = profile.inboxType || 'default';
        user.inboxConfig = profile.inboxConfig || {};
        user.readingPane = profile.readingPane || 'right';
        user.conversationView = profile.conversationView ?? true;
        user.themeWallpaper = profile.themeWallpaper || '';
        user.themeWallpaperOpacity = profile.themeWallpaperOpacity ?? 85;
        user.personalTelegram = profile.personalTelegram || {
            enabled: false,
            botToken: '',
            chatId: '',
            topicId: '',
            mode: 'privacy',
            notifyCodeOnly: true,
            includePreview: true
        };
        user.personalForwarding = profile.personalForwarding || {
            enabled: false,
            targets: '',
            mode: 'all',
            aliasPrefixes: '',
            keepCopy: true,
            addPrefix: true
        };
        user.apiTokens = Array.isArray(profile.apiTokens) ? profile.apiTokens : [];
        user.clientCountry = c.req.header('cf-ipcountry') || c.req.raw?.cf?.country || '';

		let remainingBackupCodes = 0;
		if (userRow.totpEnabled === 1 && userRow.totpBackupCodes) {
			try {
				const codes = JSON.parse(userRow.totpBackupCodes);
				if (Array.isArray(codes)) {
					remainingBackupCodes = codes.filter(item => item.used === 0).length;
				}
			} catch (e) {}
		}

		user.totp = {
			enabled: userRow.totpEnabled === 1,
			createdAt: userRow.totpCreatedAt || '',
			remainingBackupCodes
		};
		user.totpEnabled = userRow.totpEnabled === 1;

		return user;
	},

	async getUserQuota(c, userId) {
		const DEFAULT_MAX_EMAILS = 5000;
		const DEFAULT_MAX_STORAGE_MB = 500;
		
		const maxEmails = Math.min(Number(c.env.max_emails || DEFAULT_MAX_EMAILS), DEFAULT_MAX_EMAILS);
		const maxStorageMB = Math.min(Number(c.env.max_storage_mb || DEFAULT_MAX_STORAGE_MB), DEFAULT_MAX_STORAGE_MB);

		const emailCountRes = await orm(c)
			.select({ count: sql`count(*)` })
			.from(email)
			.where(and(eq(email.userId, userId), eq(email.isDel, 0)))
			.get();
		const usedEmails = emailCountRes?.count || 0;

		const emailStorageRes = await orm(c)
			.select({ size: sql`sum(length(ifnull(text, '')) + length(ifnull(content, '')))` })
			.from(email)
			.where(and(eq(email.userId, userId), eq(email.isDel, 0)))
			.get();
		const emailStorage = emailStorageRes?.size || 0;

		const attStorageRes = await orm(c)
			.select({ size: sql`sum(size)` })
			.from(att)
			.where(eq(att.userId, userId))
			.get();
		const attStorage = attStorageRes?.size || 0;

		let dbFull = false;
		try {
			const dbFullFlag = await c.env.kv.get('db_full_status');
			if (dbFullFlag === 'true') {
				dbFull = true;
			}
		} catch (e) {}

		return {
			maxEmails,
			maxStorageMB,
			maxStorageBytes: maxStorageMB * 1024 * 1024,
			usedEmails,
			usedStorageBytes: Number(emailStorage) + Number(attStorage),
			dbFull
		};
	},


	async resetPassword(c, params, userId) {

		const { password } = params;

		if (password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}
		const { salt, hash } = await cryptoUtils.hashPassword(password);
		await orm(c).update(user).set({ password: hash, salt: salt }).where(eq(user.userId, userId)).run();

		try {
			let profile = {};
			const profileStr = await c.env.kv.get('USER_PROFILE_' + userId);
			if (profileStr) {
				profile = JSON.parse(profileStr);
			}
			profile.passwordUpdatedAt = new Date().toISOString();
			await c.env.kv.put('USER_PROFILE_' + userId, JSON.stringify(profile));
			const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
			if (authInfo && authInfo.user) {
				authInfo.user.passwordUpdatedAt = profile.passwordUpdatedAt;
				await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
			}
		} catch (e) {
			console.error('Failed to update password timestamp', e);
		}
	},

	selectByEmail(c, email) {
		return orm(c).select().from(user).where(
			and(
				eq(user.email, email),
				eq(user.isDel, isDel.NORMAL)))
			.get();
	},

	async insert(c, params) {
		const defaultLabelsStr = JSON.stringify({
			allLabels: [
				{ name: '社群', icon: 'ic:outline-people-alt', color: '#3b82f6', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [
					{ condition: { type: 'sender_address_includes', value: 'gmail.com, outlook.com, qq.com, 163.com, yahoo.com, hotmail.com, foxmail.com, sina.com' } }
				]},
				{ name: '订阅', icon: 'ic:outline-subscriptions', color: '#10b981', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [
					{ condition: { type: 'system_setting', value: '' } }
				]},
				{ name: '推销', icon: 'ic:outline-local-offer', color: '#f59e0b', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: [
					{ condition: { type: 'system_setting', value: '' } }
				]},
				{ name: '工作', icon: 'ic:outline-work-outline', color: '#8b5cf6', listVis: true, stats: { total: 0, current: 0, unread: 0 }, rules: []}
			]
		});
		const finalParams = { customLabels: defaultLabelsStr, ...params };
		const { userId } = await orm(c).insert(user).values(finalParams).returning().get();
		return userId;
	},

	selectByEmailIncludeDel(c, email) {
		return orm(c).select().from(user).where(sql`${user.email} COLLATE NOCASE = ${email}`).get();
	},

	selectByIdIncludeDel(c, userId) {
		return orm(c).select().from(user).where(eq(user.userId, userId)).get();
	},

	selectById(c, userId) {
		return orm(c).select().from(user).where(
			and(
				eq(user.userId, userId),
				eq(user.isDel, isDel.NORMAL)))
			.get();
	},

	async delete(c, userId) {
		await orm(c).update(user).set({ isDel: isDel.DELETE }).where(eq(user.userId, userId)).run();
		await c.env.kv.delete(kvConst.AUTH_INFO + userId)
	},

	async physicsDelete(c, params) {
		let { userIds } = params;
		userIds = userIds.split(',').map(Number);
		await accountService.physicsDeleteByUserIds(c, userIds);
		await oauthService.deleteByUserIds(c, userIds);
		await orm(c).delete(user).where(inArray(user.userId, userIds)).run();
	},

	async list(c, params) {

		let { num, size, email, timeSort, status } = params;

		size = Number(size);
		num = Number(num);
		timeSort = Number(timeSort);
		params.isDel = Number(params.isDel);
		if (size > 50) {
			size = 50;
		}

		num = (num - 1) * size;

		const conditions = [];

		if (status > -1) {
			conditions.push(eq(user.status, status));
			conditions.push(eq(user.isDel, isDel.NORMAL));
		}


		if (email) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${'%'+ email + '%'}`);
		}


		if (params.isDel) {
			conditions.push(eq(user.isDel, params.isDel));
		}


		const query = orm(c).select({
			...user,
			username: oauth.username,
			trustLevel: oauth.trustLevel,
			avatar: oauth.avatar,
			name: oauth.name
		}).from(user).leftJoin(oauth, eq(oauth.userId, user.userId))
			.where(and(...conditions));


		if (timeSort) {
			query.orderBy(asc(user.userId));
		} else {
			query.orderBy(desc(user.userId));
		}

		const list = await query.limit(size).offset(num);

		const { total } = await orm(c)
			.select({ total: count() })
			.from(user)
			.where(and(...conditions)).get();

		if (!list || list.length === 0) {
			return { list: [], total: total || 0 };
		}

		const userIds = list.map(user => user.userId);

		const types = [...new Set(list.map(user => user.type))];

		const [emailCounts, delEmailCounts, sendCounts, delSendCounts, accountCounts, delAccountCounts, roleList] = await Promise.all([
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.RECEIVE),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.RECEIVE, isDel.DELETE),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.SEND),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.SEND, isDel.DELETE),
			accountService.selectUserAccountCountList(c, userIds),
			accountService.selectUserAccountCountList(c, userIds, isDel.DELETE),
			roleService.selectByIdsHasPermKey(c, types,'email:send')
		]);

		const receiveMap = Object.fromEntries(emailCounts.map(item => [item.userId, item.count]));
		const sendMap = Object.fromEntries(sendCounts.map(item => [item.userId, item.count]));
		const accountMap = Object.fromEntries(accountCounts.map(item => [item.userId, item.count]));

		const delReceiveMap = Object.fromEntries(delEmailCounts.map(item => [item.userId, item.count]));
		const delSendMap = Object.fromEntries(delSendCounts.map(item => [item.userId, item.count]));
		const delAccountMap = Object.fromEntries(delAccountCounts.map(item => [item.userId, item.count]));

		for (const user of list) {

			const userId = user.userId;

			user.receiveEmailCount = receiveMap[userId] || 0;
			user.sendEmailCount = sendMap[userId] || 0;
			user.accountCount = accountMap[userId] || 0;

			user.delReceiveEmailCount = delReceiveMap[userId] || 0;
			user.delSendEmailCount = delSendMap[userId] || 0;
			user.delAccountCount = delAccountMap[userId] || 0;

			const roleIndex = roleList.findIndex(roleRow => user.type === roleRow.roleId);
			let sendAction = {};

			if (roleIndex > -1) {
				sendAction.sendType = roleList[roleIndex].sendType;
				sendAction.sendCount = roleList[roleIndex].sendCount;
				sendAction.hasPerm = true;
			} else {
				sendAction.hasPerm = false;
			}

			if (user.email === c.env.admin) {
				sendAction.sendType = constant.ADMIN_ROLE.sendType;
				sendAction.sendCount = constant.ADMIN_ROLE.sendCount;
				sendAction.hasPerm = true;
				user.type = 0
			}

			user.sendAction = sendAction;
		}

		return { list, total };
	},

	async updateUserInfo(c, userId, recordCreateIp = false) {



		const activeIp = reqUtils.getIp(c);

		const {os, browser, device} = reqUtils.getUserAgent(c);

		const params = {
			os,
			browser,
			device,
			activeIp,
			activeTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
		};

		if (recordCreateIp) {
			params.createIp = activeIp;
		}

		await orm(c)
			.update(user)
			.set(params)
			.where(eq(user.userId, userId))
			.run();
	},

	async setPwd(c, params) {

		const { password, userId } = params;
		await this.resetPassword(c, { password }, userId);
		await c.env.kv.delete(KvConst.AUTH_INFO + userId);
	},

	async setStatus(c, params) {

		const { status, userId } = params;

		await orm(c)
			.update(user)
			.set({ status })
			.where(eq(user.userId, userId))
			.run();

		if (status === userConst.status.BAN) {
			await c.env.kv.delete(KvConst.AUTH_INFO + userId);
		}
	},

	async setType(c, params) {

		const { type, userId } = params;

		const roleRow = await roleService.selectById(c, type);

		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		await orm(c)
			.update(user)
			.set({ type })
			.where(eq(user.userId, userId))
			.run();

	},

	async incrUserSendCount(c, quantity, userId) {
		await orm(c).update(user).set({
			sendCount: sql`${user.sendCount}
	  +
	  ${quantity}`
		}).where(eq(user.userId, userId)).run();
	},

	async updateAllUserType(c, type, curType) {
		await orm(c)
			.update(user)
			.set({ type })
			.where(eq(user.type, curType))
			.run();
	},

	async add(c, params) {

		const { email, type, password } = params;

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notEmailDomain'));
		}

		if (password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}

		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		const role = roleService.selectById(c, type);

		if (!role) {
			throw new BizError(t('roleNotExist'));
		}

		const { salt, hash } = await saltHashUtils.hashPassword(password);

		const userId = await userService.insert(c, { email, password: hash, salt, type });

		await userService.updateUserInfo(c, userId, true);

		await accountService.insert(c, { userId: userId, email, type, name: emailUtils.getName(email) });
	},

	async resetDaySendCount(c) {
		const roleList = await roleService.selectByIdsAndSendType(c, 'email:send', roleConst.sendType.DAY);
		const roleIds = roleList.map(action => action.roleId);
		await orm(c).update(user).set({ sendCount: 0 }).where(inArray(user.type, roleIds)).run();
	},

	async resetSendCount(c, params) {
		await orm(c).update(user).set({ sendCount: 0 }).where(eq(user.userId, params.userId)).run();
	},

	async restore(c, params) {
		const { userId, type } = params
		await orm(c)
			.update(user)
			.set({ isDel: isDel.NORMAL })
			.where(eq(user.userId, userId))
			.run();
		const userRow = await this.selectById(c, userId);
		await accountService.restoreByEmail(c, userRow.email);

		if (type) {
			await emailService.restoreByUserId(c, userId);
			await accountService.restoreByUserId(c, userId);
		}

	},

	listByRegKeyId(c, regKeyId) {
		return orm(c)
			.select({email: user.email,createTime: user.createTime})
			.from(user)
			.where(eq(user.regKeyId, regKeyId))
			.orderBy(desc(user.userId))
			.all();
	},

	async purgeUserEmails(c, params) {
		const { userId } = params;
		const uid = Number(userId);
		if (!uid) {
			throw new BizError(t('userNotExist'));
		}

		const userRow = await this.selectById(c, uid);
		if (!userRow) {
			throw new BizError(t('userNotExist'));
		}

		if (userRow.type === 0 || userRow.email === c.env.admin) {
			throw new BizError('Cannot purge administrator emails', 403);
		}

		// Security rule: User MUST be banned (status === 1) before admin can force purge emails
		if (userRow.status !== 1) {
			throw new BizError(t('purgeRequireBannedMsg') || '必须先对该用户进行【封禁】处理，才能强制清空其邮件释放空间', 400);
		}

		const quota = await this.getUserQuota(c, uid);

		const starService = (await import('./star-service')).default;
		try {
			await starService.removeByUserIds(c, [uid]);
		} catch (e) {}

		await emailService.physicsDeleteUserIds(c, [uid]);

		return {
			userId: uid,
			releasedStorageBytes: quota.usedStorageBytes,
			releasedEmails: quota.usedEmails
		};
	},

	async exportUserData(c, userId, options = {}) {
		const userRow = await userService.selectById(c, userId);
		if (!userRow) throw new BizError('User not found');

		const [account, roleRow, userEmails] = await Promise.all([
			accountService.selectByEmailIncludeDel(c, userRow.email),
			roleService.selectById(c, userRow.type),
			mailOrm(c).select().from(email).where(and(eq(email.userId, userId), eq(email.isDel, 0))).all()
		]);

		let profile = {};
		try {
			const profileStr = await c.env.kv.get('USER_PROFILE_' + userId);
			if (profileStr) profile = JSON.parse(profileStr);
		} catch (e) {}

		let decryptedEmails = userEmails;
		try {
			const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
			decryptedEmails = await Promise.all(userEmails.map(em => emailCryptoUtils.decryptEmailRecord(em, cryptoKey)));
		} catch (err) {
			console.error('Decryption during export:', err);
		}

		return {
			exportTime: new Date().toISOString(),
			version: '1.0.0',
			user: {
				userId: userRow.userId,
				email: userRow.email,
				name: account?.name || '',
				createTime: userRow.createTime,
				role: roleRow?.name || '',
				profile: {
					nickname: profile.nickname || '',
					bio: profile.bio || '',
					avatarUrl: profile.avatarUrl || '',
					backgroundUrl: profile.backgroundUrl || '',
					gender: profile.gender || '',
					birthday: profile.birthday || '',
					phones: profile.phones || [],
					addresses: profile.addresses || {}
				}
			},
			emails: decryptedEmails.map(em => ({
				emailId: em.emailId,
				messageId: em.messageId,
				toEmail: em.toEmail,
				sendEmail: em.sendEmail,
				name: em.name,
				subject: em.subject,
				createTime: em.createTime,
				content: em.content,
				text: em.text,
				isSpam: em.isSpam,
				unread: em.unread,
				labels: em.labels
			})),
			customLabels: userRow.customLabels ? JSON.parse(userRow.customLabels) : null,
			totalEmails: decryptedEmails.length
		};
	},

	async getApiTokens(c, userId) {
		let profile = {};
		try {
			const profileStr = await c.env.kv.get('USER_PROFILE_' + userId);
			if (profileStr) profile = JSON.parse(profileStr);
		} catch (e) {}
		return Array.isArray(profile.apiTokens) ? profile.apiTokens : [];
	},

	async createApiToken(c, userId, params) {
		const settingService = (await import('./setting-service')).default;
		const settingData = await settingService.query(c);
		if (Number(settingData.userApiSupport ?? 1) === 0) {
			throw new BizError('第三方 API 与开发者访问功能已被管理员停用 / Third-party API support is disabled', 403);
		}

		const { name, expiresInDays, scopes } = params;
		if (!name) throw new BizError('Token name is required');

		let profile = {};
		try {
			const profileStr = await c.env.kv.get('USER_PROFILE_' + userId);
			if (profileStr) profile = JSON.parse(profileStr);
		} catch (e) {}

		if (!Array.isArray(profile.apiTokens)) profile.apiTokens = [];

		const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(24)))
			.map(b => b.toString(16).padStart(2, '0'))
			.join('');
		const tokenStr = `epo_live_${randomHex}`;
		const tokenObj = {
			id: 'tok_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
			name,
			token: tokenStr,
			scopes: scopes || ['emails:read', 'emails:send', 'profile:read'],
			createdAt: new Date().toISOString(),
			expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null,
			lastUsedAt: null
		};

		profile.apiTokens.unshift(tokenObj);
		await c.env.kv.put('USER_PROFILE_' + userId, JSON.stringify(profile));

		try {
			await c.env.kv.put(`API_TOKEN_${tokenStr}`, JSON.stringify({ userId, scopes: tokenObj.scopes, expiresAt: tokenObj.expiresAt }));
		} catch (e) {}

		return tokenObj;
	},

	async deleteApiToken(c, userId, tokenId) {
		let profile = {};
		try {
			const profileStr = await c.env.kv.get('USER_PROFILE_' + userId);
			if (profileStr) profile = JSON.parse(profileStr);
		} catch (e) {}

		if (Array.isArray(profile.apiTokens)) {
			const target = profile.apiTokens.find(t => t.id === tokenId);
			if (target && target.token) {
				try { await c.env.kv.delete(`API_TOKEN_${target.token}`); } catch (e) {}
			}
			profile.apiTokens = profile.apiTokens.filter(t => t.id !== tokenId);
			await c.env.kv.put('USER_PROFILE_' + userId, JSON.stringify(profile));
		}
	}
};

export default userService;
