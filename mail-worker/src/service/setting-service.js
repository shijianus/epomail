import KvConst from '../const/kv-const';
import settingEntity from '../entity/setting';
import orm from '../entity/orm';
import {verifyRecordType} from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import {t} from '../i18n/i18n'
import verifyRecordService from './verify-record-service';
import userContext from '../security/user-context';
import { isDualDbMode, getDbModeInfo } from '../utils/db-accessor';

const settingService = {

	async refresh(c) {
		const settingRow = await orm(c).select().from(settingEntity).get();
		settingRow.resendTokens = JSON.parse(settingRow.resendTokens);
		if (typeof settingRow.authI18n === 'string') {
			try {
				settingRow.authI18n = JSON.parse(settingRow.authI18n);
			} catch (e) {
				settingRow.authI18n = {};
			}
		}
		c.set('setting', settingRow);
		await c.env.kv.put(KvConst.SETTING, JSON.stringify(settingRow));
	},

	async query(c) {

		if (c.get?.('setting')) {
			return c.get('setting')
		}

		let settingVal = await c.env.kv.get(KvConst.SETTING, { type: 'json' });

		if (!settingVal) {
			const settingRow = await orm(c).select().from(settingEntity).get();
			if (!settingRow) {
				throw new BizError('数据库未初始化 Database not initialized.');
			}
			await this.refresh(c);
			settingVal = await c.env.kv.get(KvConst.SETTING, { type: 'json' });
		}

		const setting = settingVal;

		let domainList = c.env.domain;

		if (typeof domainList === 'string') {
			try {
				domainList = JSON.parse(domainList)
			} catch (error) {
				throw new BizError(t('notJsonDomain'));
			}
		}

		if (!c.env.domain) {
			throw new BizError(t('noDomainVariable'));
		}

		domainList = domainList.map(item => '@' + item);
		setting.domainList = domainList;


		let linuxdoSwitch = c.env.linuxdo_switch;
		let projectLink = c.env.project_link;

		if (typeof linuxdoSwitch === 'string' && linuxdoSwitch === 'true') {
			linuxdoSwitch = true
		} else if (linuxdoSwitch === true) {
			linuxdoSwitch = true
		} else {
			linuxdoSwitch = false
		}

		if (typeof projectLink === 'string' && projectLink === 'false') {
			projectLink = false
		} else if (projectLink === false) {
			projectLink = false
		} else {
			projectLink = true
		}

		setting.projectLink = projectLink;

		setting.linuxdoClientId = c.env.linuxdo_client_id;
		setting.linuxdoCallbackUrl = c.env.linuxdo_callback_url;
		setting.linuxdoSwitch = linuxdoSwitch;

		setting.emailPrefixFilter = (setting.emailPrefixFilter || '').split(",").filter(Boolean);

		let isTotp = true;
		const mode = Number(setting.allMailMode);
		if (mode === 0 || mode === 2) {
			isTotp = true;
		} else {
			try {
				const totpStatus = await c.env.kv.get('setting_totp_status');
				isTotp = totpStatus !== '0';
			} catch (e) {}
		}

		if (mode === 0 || mode === 2) {
			setting.totp = 1;
			setting.forceTotp = 1;
		} else {
			setting.totp = isTotp ? 1 : 0;
			setting.forceTotp = 0;
		}

		setting.userTgForward = setting.userTgForward !== undefined ? Number(setting.userTgForward) : 1;
		setting.userEmailForward = setting.userEmailForward !== undefined ? Number(setting.userEmailForward) : 1;
		setting.userApiSupport = setting.userApiSupport !== undefined ? Number(setting.userApiSupport) : 1;
		setting.userByoStorage = setting.userByoStorage !== undefined ? Number(setting.userByoStorage) : 1;
		setting.defaultStorageQuotaMb = setting.defaultStorageQuotaMb !== undefined ? Number(setting.defaultStorageQuotaMb) : 500;
		setting.storageProvider = setting.storageProvider || 'auto';
		setting.externalDbEnabled = setting.externalDbEnabled !== undefined ? Number(setting.externalDbEnabled) : 0;
		setting.externalDbProvider = setting.externalDbProvider || 'turso';
		setting.externalDbEndpoint = setting.externalDbEndpoint || '';
		setting.externalDbName = setting.externalDbName || '';
		setting.externalDbTarget = setting.externalDbTarget || 'mail';
		setting.attachmentPolicy = setting.attachmentPolicy !== undefined ? Number(setting.attachmentPolicy) : 0;
		setting.attachmentMaxSizeMb = setting.attachmentMaxSizeMb !== undefined ? Number(setting.attachmentMaxSizeMb) : 25;
		setting.attachmentCascadeDelete = setting.attachmentCascadeDelete !== undefined ? Number(setting.attachmentCascadeDelete) : 1;

		const dbModeInfo = getDbModeInfo(c);
		setting.isDual = dbModeInfo.isDual;
		setting.hasUserDb = dbModeInfo.hasUserDb;
		setting.hasMailDb = dbModeInfo.hasMailDb;
		setting.hasDefaultDb = dbModeInfo.hasDefaultDb;
		setting.dbMode = dbModeInfo.isDual ? 'dual' : (Number(setting.externalDbEnabled) === 1 ? 'external' : 'single');

		c.set?.('setting', setting);
		return setting;
	},

	async getStorageType(c) {
		return await r2Service.storageType(c);
	},

	async get(c, showSiteKey = false) {

		const [settingRow, recordList] = await Promise.all([
			await this.query(c),
			verifyRecordService.selectListByIP(c)
		]);


		if (!showSiteKey) {
			settingRow.siteKey = settingRow.siteKey ? `${settingRow.siteKey.slice(0, 6)}******` : null;
		}

		settingRow.secretKey = settingRow.secretKey ? `${settingRow.secretKey.slice(0, 6)}******` : null;

		Object.keys(settingRow.resendTokens).forEach(key => {
			settingRow.resendTokens[key] = `${settingRow.resendTokens[key].slice(0, 12)}******`;
		});

		settingRow.s3AccessKey = settingRow.s3AccessKey ? `${settingRow.s3AccessKey.slice(0, 12)}******` : null;
		settingRow.s3SecretKey = settingRow.s3SecretKey ? `${settingRow.s3SecretKey.slice(0, 12)}******` : null;
		settingRow.externalDbToken = settingRow.externalDbToken ? `${settingRow.externalDbToken.slice(0, 8)}******` : null;
		settingRow.tgBotToken = settingRow.tgBotToken ? `${settingRow.tgBotToken.slice(0, 20)}******` : null;
		settingRow.hasR2 = !!c.env.r2
		settingRow.hasCfEmail = !!c.env.email

		const dbModeInfo = getDbModeInfo(c);
		settingRow.isDual = dbModeInfo.isDual;
		settingRow.hasUserDb = dbModeInfo.hasUserDb;
		settingRow.hasMailDb = dbModeInfo.hasMailDb;
		settingRow.hasDefaultDb = dbModeInfo.hasDefaultDb;
		settingRow.dbMode = dbModeInfo.isDual ? 'dual' : (Number(settingRow.externalDbEnabled) === 1 ? 'external' : 'single');

		let regVerifyOpen = false
		let addVerifyOpen = false

		recordList.forEach(row => {
			if (row.type === verifyRecordType.REG) {
				regVerifyOpen = row.count >= settingRow.regVerifyCount
			}
			if (row.type === verifyRecordType.ADD) {
				addVerifyOpen = row.count >= settingRow.addVerifyCount
			}
		})

		settingRow.regVerifyOpen = regVerifyOpen
		settingRow.addVerifyOpen = addVerifyOpen

		settingRow.storageType = await r2Service.storageType(c);

		const isTotp = await this.isTotpEnabled(c, settingRow);

		// In Mode 0 (Privacy) and Mode 2 (Encrypted), TOTP is mandatory (1) and cannot be disabled
		if (Number(settingRow.allMailMode) === 0 || Number(settingRow.allMailMode) === 2) {
			settingRow.totp = 1;
			settingRow.forceTotp = 1;
		} else {
			settingRow.totp = isTotp ? 1 : 0;
			settingRow.forceTotp = 0;
		}

		return settingRow;
	},

	async isTotpEnabled(c, preloadedSetting = null) {
		const settingRow = preloadedSetting || (await this.query(c));
		const mode = Number(settingRow.allMailMode);
		if (mode === 0 || mode === 2) {
			return true;
		}
		let totpStatus = null;
		try {
			totpStatus = await c.env.kv.get('setting_totp_status');
		} catch (e) {}
		return totpStatus !== '0';
	},

	async set(c, params) {
		const settingData = await this.query(c);
		let resendTokens = { ...settingData.resendTokens, ...params.resendTokens };
		Object.keys(resendTokens).forEach(domain => {
			if (!resendTokens[domain]) delete resendTokens[domain];
		});

		if (Array.isArray(params.emailPrefixFilter)) {
			params.emailPrefixFilter = params.emailPrefixFilter.join(',');
		}

		if (Array.isArray(params.aiCodeFilter)) {
			params.aiCodeFilter = params.aiCodeFilter.join(',');
		}

		if (params.authI18n && typeof params.authI18n === 'object') {
			params.authI18n = JSON.stringify(params.authI18n);
		}

		if (params.allMailMode !== undefined) {
			const m = Number(params.allMailMode);
			params.allMailMode = [0, 1, 2].includes(m) ? m : 0;
			if (params.allMailMode === 2) {
				params.tgBotStatus = 1;
				params.ruleEmail = '';
				params.ruleType = 0;
			}
		} else {
			const currentMode = Number(settingData.allMailMode);
			if (currentMode === 2) {
				if (params.tgBotStatus !== undefined) {
					params.tgBotStatus = 1;
				}
				if (params.ruleType !== undefined) {
					params.ruleType = 0;
				}
				if (params.ruleEmail !== undefined) {
					params.ruleEmail = '';
				}
			}
		}
		const targetMode = params.allMailMode !== undefined ? Number(params.allMailMode) : Number(settingData.allMailMode);

		if (params.totp !== undefined) {
			let totpVal = Number(params.totp) === 0 ? '0' : '1';
			// 防篡改守护：处于隐私模式 (0) 或 加密模式 (2) 时强制开启 2FA，禁止关闭
			if (targetMode === 0 || targetMode === 2) {
				totpVal = '1';
				params.totp = 1;
			}
			try {
				await c.env.kv.put('setting_totp_status', totpVal);
			} catch (e) {}

			// When global 2FA is explicitly disabled in All Mail Mode, completely purge all users' 2FA data
			// so that when 2FA is re-enabled later, all users are cleanly required to re-configure
			if (totpVal === '0') {
				try {
					const user = (await import('../entity/user')).default;
					await orm(c).update(user).set({
						totpEnabled: 0,
						totpSecret: '',
						totpBackupCodes: '[]',
						totpCreatedAt: '',
						securityKeys: '[]'
					}).run();
					console.log(JSON.stringify({
						auditEvent: 'GLOBAL_TOTP_DISABLED_ALL_USERS_PURGED',
						timestamp: new Date().toISOString()
					}));
				} catch (err) {
					console.error('Failed to purge user 2FA records upon global TOTP disable:', err);
				}
			}
		}

		if (params.publicProfile !== undefined) {
			params.publicProfile = Number(params.publicProfile) === 1 ? 1 : 0;
		}

		if (params.userTgForward !== undefined) {
			params.userTgForward = Number(params.userTgForward) === 1 ? 1 : 0;
		}

		if (params.userEmailForward !== undefined) {
			params.userEmailForward = Number(params.userEmailForward) === 1 ? 1 : 0;
		}

		if (params.userApiSupport !== undefined) {
			params.userApiSupport = Number(params.userApiSupport) === 1 ? 1 : 0;
		}

		if (params.userByoStorage !== undefined) {
			params.userByoStorage = Number(params.userByoStorage) === 1 ? 1 : 0;
		}

		if (params.defaultStorageQuotaMb !== undefined) {
			params.defaultStorageQuotaMb = Number(params.defaultStorageQuotaMb) >= 0 ? Number(params.defaultStorageQuotaMb) : 500;
		}

		if (params.externalDbEnabled !== undefined) {
			params.externalDbEnabled = (Number(params.externalDbEnabled) === 1 || params.externalDbEnabled === true) ? 1 : 0;
		}

		if (params.externalDbToken && params.externalDbToken.includes('******')) {
			delete params.externalDbToken;
		}

		params.resendTokens = JSON.stringify(resendTokens);

		// Whitelist only valid DB columns in setting table
		const validColumns = [
			'register', 'receive', 'title', 'manyEmail', 'addEmail', 'autoRefresh',
			'addEmailVerify', 'registerVerify', 'regVerifyCount', 'addVerifyCount', 'send',
			'r2Domain', 'secretKey', 'siteKey', 'regKey', 'background',
			'tgBotToken', 'tgChatId', 'tgBotStatus', 'forwardEmail', 'forwardStatus',
			'ruleEmail', 'ruleType', 'loginOpacity', 'resendTokens', 'noticeTitle',
			'noticeContent', 'noticeType', 'noticeDuration', 'noticePosition', 'noticeOffset',
			'noticeWidth', 'notice', 'noRecipient', 'loginDomain', 'bucket',
			'region', 'endpoint', 's3AccessKey', 's3SecretKey', 'forcePathStyle',
			'customDomain', 'tgMsgFrom', 'tgMsgTo', 'tgMsgText', 'minEmailPrefix',
			'emailPrefixFilter', 'blackSubject', 'blackContent', 'blackFrom', 'aiCode',
			'aiCodeFilter', 'spamRetentionDays', 'noLandingNodes', 'noNewNodes',
			'authI18n', 'publicProfile', 'allMailMode',
			'welcomeSubject', 'welcomeContent', 'welcomeText', 'welcomeExpireDays',
			'welcomeAutoSend', 'welcomeLastBroadcast',
			'userTgForward', 'userEmailForward', 'userApiSupport',
			'userByoStorage', 'defaultStorageQuotaMb', 'storageProvider',
			'externalDbEnabled', 'externalDbProvider', 'externalDbEndpoint',
			'externalDbToken', 'externalDbName', 'externalDbTarget',
			'attachmentPolicy', 'attachmentMaxSizeMb', 'attachmentCascadeDelete'
		];

		const updateData = {};
		for (const key of validColumns) {
			if (params[key] !== undefined) {
				updateData[key] = params[key];
			}
		}

		if (Object.keys(updateData).length > 0) {
			await orm(c).update(settingEntity).set(updateData).run();
		}
		await this.refresh(c);
	},

	async deleteBackground(c) {

		const { background } = await this.query(c);
		if (!background) return

		if (background.startsWith('http')) {
			await orm(c).update(settingEntity).set({ background: '' }).run();
			await this.refresh(c)
			return;
		}

		if (background) {
			await r2Service.delete(c,background)
			await orm(c).update(settingEntity).set({ background: '' }).run();
			await this.refresh(c)
		}
	},

	async setBackground(c, params) {

		let { background } = params

		await this.deleteBackground(c);

		if (background && !background.startsWith('http')) {

			const file = fileUtils.base64ToFile(background)

			const arrayBuffer = await file.arrayBuffer();
			background = constant.BACKGROUND_PREFIX + await fileUtils.getBuffHash(arrayBuffer) + fileUtils.getExtFileName(file.name);


			await r2Service.putObj(c, background, arrayBuffer, {
				contentType: file.type,
				cacheControl: `public, max-age=31536000, immutable`,
				contentDisposition: `inline; filename="${file.name}"`
			});

		}

		await orm(c).update(settingEntity).set({ background }).run();
		await this.refresh(c);
		return background;
	},


	async setBlacklist(c, params) {
		const { blackSubject, blackContent, blackFrom  } = params
		await orm(c).update(settingEntity).set({ blackSubject, blackContent, blackFrom }).run();
		await this.refresh(c);
		return this.get(c);
	},

	async sendWelcomeEmailToAll(c, params) {
		let { welcomeSubject, welcomeContent, welcomeText, welcomeExpireDays, welcomeAutoSend } = params || {};
		if (!welcomeSubject || !welcomeSubject.trim()) {
			welcomeSubject = '🎉 欢迎加入 Epocanvas Mail - 开启您的私密、高效云端邮件体验';
		}
		welcomeExpireDays = Number(welcomeExpireDays) >= 0 ? Number(welcomeExpireDays) : 7;
		welcomeAutoSend = welcomeAutoSend === 0 ? 0 : 1;
		const nowIso = new Date().toISOString();

		if (!welcomeText && welcomeContent) {
			const emailUtils = (await import('../utils/email-utils')).default;
			welcomeText = emailUtils.htmlToText(welcomeContent);
		}

		await this.set(c, {
			welcomeSubject,
			welcomeContent: welcomeContent || '',
			welcomeText: welcomeText || '',
			welcomeExpireDays,
			welcomeAutoSend,
			welcomeLastBroadcast: nowIso
		});

		const user = (await import('../entity/user')).default;
		const account = (await import('../entity/account')).default;
		const emailService = (await import('./email-service')).default;
		const { eq, and } = await import('drizzle-orm');

		const users = await orm(c).select({
			userId: user.userId,
			email: user.email,
		}).from(user).where(eq(user.status, 0)).all();

		let deliverCount = 0;
		for (const u of users) {
			const acc = await orm(c).select({
				accountId: account.accountId,
				name: account.name
			}).from(account).where(and(eq(account.userId, u.userId), eq(account.isDel, 0))).limit(1).get();

			if (acc) {
				const res = await emailService.deliverWelcomeEmailToUser(c, u.userId, acc.accountId, u.email, {
					subject: welcomeSubject,
					expireDays: welcomeExpireDays,
					content: welcomeContent,
					text: welcomeText,
					isBroadcast: true
				});
				if (res) deliverCount++;
			}
		}

		return { success: true, deliverCount, totalUsers: users.length };
	},

	async websiteConfig(c) {

		const settingRow = await this.get(c, true);
		const token = await userContext.getToken(c);

		return {
			register: settingRow.register,
			title: settingRow.title,
			manyEmail: settingRow.manyEmail,
			addEmail: settingRow.addEmail,
			autoRefresh: settingRow.autoRefresh,
			addEmailVerify: settingRow.addEmailVerify,
			registerVerify: settingRow.registerVerify,
			send: settingRow.send,
			r2Domain: settingRow.r2Domain,
			siteKey: settingRow.siteKey,
			background: settingRow.background,
			loginOpacity: settingRow.loginOpacity,
			domainList: settingRow.loginDomain === 1 && !token ? [] : settingRow.domainList,
			regKey: settingRow.regKey,
			regVerifyOpen: settingRow.regVerifyOpen,
			addVerifyOpen: settingRow.addVerifyOpen,
			noticeTitle: settingRow.noticeTitle,
			noticeContent: settingRow.noticeContent,
			noticeType: settingRow.noticeType,
			noticeDuration: settingRow.noticeDuration,
			noticePosition: settingRow.noticePosition,
			noticeWidth: settingRow.noticeWidth,
			noticeOffset: settingRow.noticeOffset,
			notice: settingRow.notice,
			loginDomain: settingRow.loginDomain,
			linuxdoClientId: settingRow.linuxdoClientId,
			linuxdoCallbackUrl: settingRow.linuxdoCallbackUrl,
			linuxdoSwitch: settingRow.linuxdoSwitch,
			minEmailPrefix: settingRow.minEmailPrefix,
			projectLink: settingRow.projectLink,
			noLandingNodes: settingRow.noLandingNodes,
			noNewNodes: settingRow.noNewNodes,
			authI18n: settingRow.authI18n || {},
			publicProfile: settingRow.publicProfile ?? 0,
			allMailMode: settingRow.allMailMode ?? 0,
			totp: settingRow.totp ?? 1,
			forceTotp: settingRow.forceTotp ?? 0,
			forwardEmail: settingRow.forwardEmail || '',
			forwardStatus: settingRow.forwardStatus ?? 1,
			welcomeSubject: settingRow.welcomeSubject || '',
			welcomeExpireDays: settingRow.welcomeExpireDays ?? 7,
			welcomeAutoSend: settingRow.welcomeAutoSend ?? 1,
			welcomeLastBroadcast: settingRow.welcomeLastBroadcast || '',
			userTgForward: settingRow.userTgForward ?? 1,
			userEmailForward: settingRow.userEmailForward ?? 1,
			userApiSupport: settingRow.userApiSupport ?? 1
		};
	},

};

export default settingService;
