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
import { getDefaultUserLabelsString } from '../const/default-labels';
import { isAdminEmail, isAdminUser } from '../utils/admin-utils';

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
        
        if (params.background && !params.backgroundUrl) params.backgroundUrl = params.background;
        if (params.backgroundUrl && !params.background) params.background = params.backgroundUrl;
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

	async loginUserInfo(c, userId, loginEmail = '') {

		const userRow = await userService.selectById(c, userId);

		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}

		// 判定当前会话应激活的信箱账号：优先使用当前会话指定的登录邮箱
		let account = null;
		const userAccounts = await accountService.list(c, { size: 30 }, userId);
		if (loginEmail) {
			account = (userAccounts || []).find(a => a.email && a.email.toLowerCase() === loginEmail.toLowerCase());
			if (!account) {
				account = await accountService.selectByEmailIncludeDel(c, loginEmail);
			}
		}
		if (!account || account.userId !== userId) {
			account = (userAccounts || []).find(a => a.email && a.email.toLowerCase() === userRow.email.toLowerCase());
			if (!account) {
				account = await accountService.selectByEmailIncludeDel(c, userRow.email);
			}
		}
		if (!account) {
			if (userAccounts && userAccounts.length > 0) {
				account = userAccounts[0];
			}
		}

		const isMaster = isAdminUser(c, userRow) || (account && isAdminEmail(c, account.email));

		const [roleRow, permKeys] = await Promise.all([
			roleService.selectById(c, userRow.type),
			isMaster ? Promise.resolve(['*']) : permService.userPermKeys(c, userId)
		]);

		const user = {};
		user.userId = userRow.userId;
		user.sendCount = userRow.sendCount;
		user.email = account ? account.email : userRow.email;
		user.primaryEmail = userRow.email;
		user.account = account;
		user.accounts = userAccounts || [];
		user.name = account ? account.name : emailUtils.getName(user.email);
		user.permKeys = permKeys;
		user.role = roleRow;
		user.type = userRow.type;
		user.customLabels = userRow.customLabels;
		if (!user.customLabels || user.customLabels === '[]') {
			user.customLabels = getDefaultUserLabelsString();
		}

		if (isMaster) {
			const masterRole = await roleService.selectByRoleCode(c, 'master') || await roleService.selectByName(c, '站长');
			if (masterRole) {
				user.role = masterRole;
				user.type = masterRole.roleId;
			} else {
				user.role = constant.ADMIN_ROLE;
				user.type = 0;
			}
		}

		user.quota = await userService.getUserQuota(c, userId);

		try {
			const emailService = (await import('./email-service')).default;
			await emailService.ensureWelcomeEmailForUser(c, userId, userRow.email);
		} catch (e) {}
		
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
        user.backgroundUrl = profile.backgroundUrl || profile.background || '';
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
        user.readingPane = profile.readingPane || 'no_split';
        user.conversationView = profile.conversationView ?? true;
        user.themeWallpaper = profile.themeWallpaper || 'none';
        user.themeWallpaperOpacity = profile.themeWallpaperOpacity ?? 85;
        user.themeMode = profile.themeMode || 'auto';
        user.lang = profile.lang || '';
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

		// Fast blog level metadata
		const roleCode = roleRow?.roleCode || '';
		const isLv1 = roleCode === 'user_lv1';
		const isLv0 = roleCode === 'user_lv0';
		user.blogLevel = {
			level: isLv1 ? 1 : (isLv0 ? 0 : 0),
			levelName: isLv1 ? '活跃学者' : (isLv0 ? '认证书友' : (roleCode === 'master' ? '站长统领' : '普通读者')),
			badge: isLv1 ? 'LV.1 活跃学者' : (isLv0 ? 'LV.0 认证书友' : '未认证'),
			hasBlogAccount: isLv0 || isLv1
		};

		return user;
	},

	async getUserQuota(c, userId) {
		const DEFAULT_MAX_EMAILS = 5000;
		const DEFAULT_MAX_STORAGE_MB = 500;
		
		let maxEmails = Math.min(Number(c.env.max_emails || DEFAULT_MAX_EMAILS), DEFAULT_MAX_EMAILS);
		let maxStorageMB = Math.min(Number(c.env.max_storage_mb || DEFAULT_MAX_STORAGE_MB), DEFAULT_MAX_STORAGE_MB);

		try {
			const storageQuotaService = (await import('./storage-quota-service')).default;
			const usage = await storageQuotaService.getUserStorageUsage(c, userId);
			if (usage) {
				if (usage.isVisitor && !usage.byoStorageEnabled) {
					maxStorageMB = 0;
				} else if (usage.quotaMb !== undefined && usage.quotaMb !== null) {
					maxStorageMB = usage.quotaMb;
				}
			}
		} catch (e) {
			console.warn('Failed to resolve user storage quota in getUserQuota:', e.message);
		}

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
		const defaultLabelsStr = getDefaultUserLabelsString();
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

			if (isAdminUser(c, user)) {
				sendAction.sendType = constant.ADMIN_ROLE.sendType;
				sendAction.sendCount = constant.ADMIN_ROLE.sendCount;
				sendAction.hasPerm = true;
				user.type = 0;
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

	async setType(c, params, callerUserId) {
		const { type, userId } = params;

		const roleRow = await roleService.selectById(c, type);
		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		if (callerUserId) {
			const caller = await this.selectById(c, callerUserId);
			if (caller) {
				if (!isAdminUser(c, caller)) {
					if (caller.userId === Number(userId)) {
						throw new BizError('协管者/管理员无权修改自身所在分组权限！', 403);
					}
					const targetUser = await this.selectById(c, userId);
					if (targetUser && isAdminUser(c, targetUser)) {
						throw new BizError('无权修改站长身份！', 403);
					}
					if (roleRow.roleCode === 'master') {
						throw new BizError('仅站长本人可分配站长角色！', 403);
					}
				}
			}
		}

		await orm(c)
			.update(user)
			.set({ type })
			.where(eq(user.userId, userId))
			.run();

		await this.updateUserInfo(c, userId, true);
	},

	async getBlogLevelInfo(c, userId) {
		const userRow = await this.selectById(c, userId);
		if (!userRow) throw new BizError(t('notExistUser'));

		const defaultTiers = [
			{ level: 0, name: '认证书友', quotaMb: 10, sendCount: 8, requirement: '在 blog.epomail.com 注册并激活账号', allowAttachment: 0 },
			{ level: 1, name: '活跃学者', quotaMb: 25, sendCount: 10, requirement: '注册满 10 天且发表 3 条评论，或累计阅读时长达到 100 分钟', allowAttachment: 1 },
			{ level: 2, name: '资深贡献者', quotaMb: 50, sendCount: 20, requirement: '注册满 90 天且获赞 30 次，或发表 20 条优质讨论', allowAttachment: 1 },
			{ level: 3, name: '终身学者', quotaMb: 100, sendCount: 50, requirement: '注册满 180 天且获赞 100 次，享有至尊特权', allowAttachment: 1 }
		];

		let blogLevelInfo = null;
		try {
			const blogUrl = (c.env.BLOG_BASE_URL || 'https://blog.epocanvas.com').replace(/\/+$/, '');
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 2500);
			const resp = await fetch(`${blogUrl}/api/auth/user-level?email=${encodeURIComponent(userRow.email)}`, {
				headers: { 'Accept': 'application/json' },
				signal: controller.signal
			});
			clearTimeout(timeoutId);
			if (resp.ok) {
				blogLevelInfo = await resp.json();
			}
		} catch (e) {
			console.warn('Query blog user level error:', e.message);
		}

		if (!blogLevelInfo || !blogLevelInfo.ok) {
			return {
				hasBlogAccount: false,
				email: userRow.email,
				level: 0,
				levelName: '未认证读者',
				badge: '未认证',
				stats: { daysRegistered: 0, commentsCount: 0, readingMinutes: 0, upvotesCount: 0 },
				message: '未关联 blog.epomail.com 账号。在博客注册相同邮箱账号即可直升 LV.0 并提升配额！',
				tiers: defaultTiers,
				allTiers: defaultTiers
			};
		}

		return {
			hasBlogAccount: true,
			tiers: defaultTiers,
			allTiers: defaultTiers,
			...blogLevelInfo
		};
	},

	async syncBlogLevel(c, userId) {
		const userRow = await this.selectById(c, userId);
		if (!userRow) throw new BizError(t('notExistUser'));

		const blogInfo = await this.getBlogLevelInfo(c, userId);
		if (!blogInfo || !blogInfo.hasBlogAccount) {
			return {
				synced: false,
				message: blogInfo?.message || '未在 blog.epomail.com 博客中找到此邮箱记录，请先使用相同邮箱在博客注册！',
				currentRole: userRow.type
			};
		}

		const targetRoleCode = blogInfo.mappedEpomailRole || (blogInfo.level >= 1 ? 'user_lv1' : 'user_lv0');
		const allRoles = await roleService.roleList(c);
		const targetRole = allRoles.find(r => r.roleCode === targetRoleCode);

		if (!targetRole) {
			return {
				synced: false,
				message: `未找到目标身份分组 [${targetRoleCode}]`,
				level: blogInfo.level
			};
		}

		if (isAdminUser(c, userRow)) {
			return {
				synced: true,
				level: blogInfo.level,
				levelName: blogInfo.levelName,
				newRoleName: '站长',
				message: `您是站长，已自动享有最高权限。博客书友等级为【${blogInfo.levelName}】。`
			};
		}

		await orm(c).update(user).set({ type: targetRole.roleId }).where(eq(user.userId, userId)).run();
		await this.updateUserInfo(c, userId, true);

		return {
			synced: true,
			level: blogInfo.level,
			levelName: blogInfo.levelName,
			newRoleName: targetRole.name,
			newRoleId: targetRole.roleId,
			message: `博客等级同步成功！已为您自动匹配并晋升为【${targetRole.name}】，享有 ${targetRole.storageQuotaMb}MB 存储空间与每日 ${targetRole.sendCount} 封发信权限！`
		};
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

		const localName = emailUtils.getName(email);
		const adminName = c.env.admin ? emailUtils.getName(c.env.admin) : '';
		if (adminName && localName.toLowerCase() === adminName.toLowerCase()) {
			throw new BizError(t('adminReserved'));
		}

		// 全局跨域名检查：无论在哪个域名下，用户名（本地名前缀）全局唯一
		const existingNameRow = await accountService.selectByNameIncludeDel(c, localName);
		if (existingNameRow && existingNameRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}
		if (existingNameRow) {
			throw new BizError(t('usernameTakenCrossDomain'));
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

		const acc = await accountService.insert(c, { userId: userId, email, type, name: emailUtils.getName(email) });

		try {
			const emailService = (await import('./email-service')).default;
			const accountRow = acc || await accountService.selectByEmail(c, email);
			if (accountRow) {
				await emailService.deliverWelcomeEmailToUser(c, userId, accountRow.accountId, email, { forceWelcome: true });
			}
		} catch (err) {
			console.error('Failed to deliver welcome email on user add:', err);
		}
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

		if (userRow.type === 0 || isAdminUser(c, userRow)) {
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
					backgroundUrl: profile.backgroundUrl || profile.background || '',
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
	},

	async getUserStorage(c, userId) {
		const storageQuotaService = (await import('./storage-quota-service')).default;
		return await storageQuotaService.getUserStorageUsage(c, userId);
	},

	async testUserStorage(c, userId, params) {
		const settingService = (await import('./setting-service')).default;
		const settingData = await settingService.query(c);
		if (Number(settingData.userByoStorage ?? 1) === 0) {
			throw new BizError('第三方云存储接入功能已被管理员停用 / BYO Storage is disabled', 403);
		}

		const s3Service = (await import('./s3-service')).default;
		return await s3Service.testConnection(params);
	},

	async updateUserStorage(c, userId, params) {
		const settingService = (await import('./setting-service')).default;
		const settingData = await settingService.query(c);
		if (Number(settingData.userByoStorage ?? 1) === 0) {
			throw new BizError('第三方云存储接入功能已被管理员停用 / BYO Storage is disabled', 403);
		}

		const { bucket, endpoint, region, s3AccessKey, s3SecretKey, forcePathStyle, customDomain } = params;
		if (!bucket || !endpoint || !s3AccessKey || !s3SecretKey) {
			throw new BizError('请填写完整的存储桶信息 (Bucket, Endpoint, Key ID, Secret Key)');
		}

		const s3Service = (await import('./s3-service')).default;
		// Test connection before saving
		const testRes = await s3Service.testConnection({
			bucket, endpoint, region, s3AccessKey, s3SecretKey, forcePathStyle, customDomain
		});

		if (!testRes.ok) {
			throw new BizError(testRes.message || '存储桶连接测试未通过，请检查凭据与权限');
		}

		const cleanConfig = {
			bucket: bucket.trim(),
			endpoint: endpoint.trim(),
			region: (region || 'auto').trim(),
			s3AccessKey: s3AccessKey.trim(),
			s3SecretKey: s3SecretKey.trim(),
			forcePathStyle: forcePathStyle === 1 || forcePathStyle === true,
			customDomain: (customDomain || '').trim()
		};

		const userDb = (await import('../utils/db-accessor')).getUserDb(c);
		await userDb.prepare(`
			UPDATE user 
			SET byo_storage_enabled = 1, byo_storage_config = ? 
			WHERE user_id = ?
		`).bind(JSON.stringify(cleanConfig), userId).run();

		return {
			ok: true,
			message: '第三方存储配置已成功绑定！',
			provider: testRes.provider
		};
	},

	async clearUserStorage(c, userId) {
		const userDb = (await import('../utils/db-accessor')).getUserDb(c);
		await userDb.prepare(`
			UPDATE user 
			SET byo_storage_enabled = 0, byo_storage_config = '{}' 
			WHERE user_id = ?
		`).bind(userId).run();

		return {
			ok: true,
			message: '已解除第三方存储绑定，已恢复使用系统默认存储。'
		};
	}
};

export default userService;
