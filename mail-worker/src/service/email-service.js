import { mailOrm as orm, userOrm } from '../entity/orm';
import email from '../entity/email';
import { attConst, emailConst, isDel, settingConst } from '../const/entity-const';
import { and, desc, eq, gt, inArray, lt, count, asc, sql, ne, or, like, lte, gte } from 'drizzle-orm';
import { star } from '../entity/star';
import settingService from './setting-service';
import accountService from './account-service';
import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import fileUtils from '../utils/file-utils';
import { Resend } from 'resend';
import attService from './att-service';
import { parseHTML } from 'linkedom';
import userService from './user-service';
import roleService from './role-service';
import user from '../entity/user';
import starService from './star-service';
import dayjs from 'dayjs';
import kvConst from '../const/kv-const';
import { t } from '../i18n/i18n'
import domainUtils from '../utils/domain-uitls';
import account from "../entity/account";
import { att } from '../entity/att';
import telegramService from './telegram-service';
import emailCryptoUtils from '../utils/email-crypto-utils';

const emailService = {

	async list(c, params, userId) {

		let { emailId, type, accountId, size, timeSort, allReceive, folder, keyword } = params;

		size = Number(size);
		emailId = Number(emailId);
		timeSort = Number(timeSort);
		accountId = Number(accountId);
		allReceive = Number(allReceive);

		if (size > 50) {
			size = 50;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		if (isNaN(allReceive)) {
			if (!accountId || isNaN(accountId)) {
				allReceive = 1;
			} else {
				let accountRow = await accountService.selectById(c, accountId);
				allReceive = accountRow ? accountRow.allReceive : 1;
			}
		}

		const query = orm(c)
			.select({
				...email,
				starId: star.starId
			})
			.from(email)
			.leftJoin(
				star,
				and(
					eq(star.emailId, email.emailId),
					eq(star.userId, userId)
				)
			).leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
		let isGlobal = false;
		let isSent = false;
		let isSpam = false;
		let isTrash = false;

		let pFrom = null;
		let pTo = null;
		let pSubject = null;
		let pSubjectOrBody = null;
		let pBody = null;
		let pSizeAtLeast = null;
		let pSizeAtMost = null;
		let pBefore = null;
		let pAfter = null;
		let pLabel = null;

		if (keyword) {
			isGlobal = /global:/i.test(keyword);
			isSent = /is:sent/i.test(keyword) || /from:me/i.test(keyword);
			isSpam = /is:spam/i.test(keyword);
			isTrash = /is:trash/i.test(keyword);

			const extractParam = (prefix) => {
				const regex = new RegExp(prefix + ':("([^"]+)"|([^\\s]+))', 'i');
				const match = keyword.match(regex);
				if (match) {
					keyword = keyword.replace(match[0], '');
					return match[2] || match[3];
				}
				return null;
			};

			pFrom = extractParam('from');
			pTo = extractParam('to');
			pSubject = extractParam('subject');
			pSubjectOrBody = extractParam('subject_or_body');
			pBody = extractParam('body');
			pSizeAtLeast = extractParam('larger');
			pSizeAtMost = extractParam('smaller');
			pBefore = extractParam('before');
			pAfter = extractParam('after');
			pLabel = extractParam('label');

			keyword = keyword.replace(/global:/ig, '')
				.replace(/is:sent/ig, '')
				.replace(/from:me/ig, '')
				.replace(/is:draft/ig, '') // drafts are local only, so we just strip it
				.replace(/is:spam/ig, '')
				.replace(/is:trash/ig, '')
				.replace(/hl:off/ig, '')
				.replace(/exact:true/ig, '')
				.replace(/case:true/ig, '')
				.trim();
		}

		const commonConditions = [
			allReceive ? eq(1,1) : eq(email.accountId, accountId),
			eq(email.userId, userId),
			eq(account.isDel, isDel.NORMAL)
		];

		if (isGlobal) {
			// global search searches everywhere except maybe we only enforce account/user constraints
		} else {
			commonConditions.push(folder === 'trash' ? eq(email.isDel, 1) : (isTrash ? eq(email.isDel, 1) : eq(email.isDel, 0)));
			commonConditions.push(folder === 'spam' ? eq(email.isSpam, 1) : (isSpam ? eq(email.isSpam, 1) : (folder === 'trash' || folder === 'snoozed' || folder === 'all' ? eq(1,1) : eq(email.isSpam, 0))));
			commonConditions.push(folder === 'snoozed' ? sql`snoozed_time IS NOT NULL` : (folder === 'trash' || folder === 'spam' ? eq(1,1) : sql`(snoozed_time IS NULL OR send_email = 'admin@epocanvas.com')`));
			
			if (isSent) {
				const currentType = (folder === 'all' ? emailConst.type.RECEIVE : (type !== undefined ? type : emailConst.type.RECEIVE));
				commonConditions.push(inArray(email.type, [currentType, emailConst.type.SEND]));
			} else {
				commonConditions.push((!folder && type !== undefined) ? eq(email.type, type) : (folder === 'all' ? eq(email.type, 0) : eq(1,1)));
			}
		}

		if (pFrom) {
			commonConditions.push(
				or(like(email.sendEmail, '%'+ pFrom + '%'), like(email.name, '%'+ pFrom + '%'))
			);
		}
		if (pTo) {
			commonConditions.push(
				or(like(email.toEmail, '%'+ pTo + '%'), like(email.toName, '%'+ pTo + '%'))
			);
		}
		if (pSubject) {
			commonConditions.push(like(email.subject, '%'+ pSubject + '%'));
		}
		if (pSubjectOrBody) {
			commonConditions.push(
				or(like(email.subject, '%'+ pSubjectOrBody + '%'), like(email.text, '%'+ pSubjectOrBody + '%'))
			);
		}
		if (pBody) {
			commonConditions.push(like(email.text, '%'+ pBody + '%'));
		}
		if (pSizeAtLeast) {
			commonConditions.push(sql`ifnull(length(text), 0) + ifnull(length(content), 0) >= ${parseInt(pSizeAtLeast)}`);
		}
		if (pSizeAtMost) {
			commonConditions.push(sql`ifnull(length(text), 0) + ifnull(length(content), 0) <= ${parseInt(pSizeAtMost)}`);
		}
		if (pBefore) {
			commonConditions.push(lt(email.createTime, pBefore));
		}
		if (pAfter) {
			commonConditions.push(gt(email.createTime, pAfter));
		}
		if (pLabel) {
			commonConditions.push(like(email.labels, '%"' + pLabel + '"%'));
		}

		if (keyword) {
			commonConditions.push(
				or(
					like(email.subject, '%'+ keyword + '%'),
					like(email.name, '%'+ keyword + '%'),
					like(email.sendEmail, '%'+ keyword + '%'),
					like(email.toEmail, '%'+ keyword + '%'),
					like(email.text, '%'+ keyword + '%')
				)
			);
		}

		query.where(
			and(
				...commonConditions,
				timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId)
			)
		);

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();

		const totalQuery = orm(c).select({ total: count() }).from(email)
			.leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(...commonConditions)
			).get();

		const latestEmailQuery = orm(c).select().from(email).where(
			and(
				allReceive ? eq(1,1) : eq(email.accountId, accountId),
				eq(email.userId, userId),
				folder === 'trash' ? eq(email.isDel, 1) : eq(email.isDel, 0),
				folder === 'spam' ? eq(email.isSpam, 1) : (folder === 'trash' || folder === 'snoozed' || folder === 'all' ? eq(1,1) : eq(email.isSpam, 0)),
				folder === 'snoozed' ? sql`snoozed_time IS NOT NULL` : (folder === 'trash' || folder === 'spam' ? eq(1,1) : sql`(snoozed_time IS NULL OR send_email = 'admin@epocanvas.com')`),
				(!folder && type !== undefined) ? eq(email.type, type) : (folder === 'all' ? eq(email.type, 0) : eq(1,1))
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		const settingData = await settingService.query(c);

		if (settingData.welcomeExpireDays > 0) {
			// Auto-clean expired official welcome emails older than welcomeExpireDays
			await c.env.db.prepare(`
				UPDATE email 
				SET is_del = 1, snoozed_time = NULL, snoozed_end_time = NULL 
				WHERE user_id = ? 
				  AND send_email = 'admin@epocanvas.com' 
				  AND is_del = 0 
				  AND datetime(create_time, '+' || ? || ' days') < datetime('now')
			`).bind(userId, settingData.welcomeExpireDays).run().catch(() => {});
		}

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		if (userId) {
			const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
			list = await emailCryptoUtils.decryptEmailList(list, cryptoKey);
			if (latestEmail && latestEmail.emailId) {
				latestEmail = await emailCryptoUtils.decryptEmailRecord(latestEmail, cryptoKey);
			}
		}

		list = list.map(item => {
			const isOfficial = item.sendEmail === 'admin@epocanvas.com' || (item.labels && item.labels.includes('官方'));
			return {
				...item,
				isStar: item.starId != null ? 1 : 0,
				isOfficial: isOfficial ? 1 : 0,
				content: (!item.content && isOfficial && settingData.welcomeContent) ? settingData.welcomeContent : item.content,
				expireDays: isOfficial ? (settingData.welcomeExpireDays ?? 7) : 0
			};
		});

		await this.emailAddAtt(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: accountId,
				userId: userId,
			}
		}

		return { list, total: totalRow.total, latestEmail };
	},

	async delete(c, params, userId) {
		const { emailIds, physical } = params;
		const emailIdList = emailIds.split(',').map(Number);
		if (physical) {
			await orm(c).delete(email).where(
				and(
					eq(email.userId, userId),
					inArray(email.emailId, emailIdList)))
				.run();
		} else {
			const quota = await userService.getUserQuota(c, userId);
			if (quota.maxStorageBytes > 0 && quota.usedStorageBytes / quota.maxStorageBytes > 0.9) {
				// Immediate physical delete if quota > 90%
				await orm(c).delete(email).where(
					and(
						eq(email.userId, userId),
						inArray(email.emailId, emailIdList)))
					.run();
			} else {
				const settingRow = await settingService.query(c);
				const mode = Number(settingRow?.allMailMode);

				// In Mode 0 (Privacy Mail Mode): Trash emails must be stored in plaintext.
				if (mode === 0 && userId) {
					const targetEmails = await orm(c).select().from(email).where(
						and(eq(email.userId, userId), inArray(email.emailId, emailIdList))
					).all();
					const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
					for (const row of targetEmails) {
						const decrypted = await emailCryptoUtils.decryptEmailRecord(row, cryptoKey);
						await orm(c).update(email).set({
							isDel: isDel.DELETE,
							snoozedTime: null,
							subject: decrypted.subject,
							content: decrypted.content,
							text: decrypted.text,
							code: decrypted.code
						}).where(eq(email.emailId, row.emailId)).run();
					}
				} else {
					await orm(c).update(email).set({ isDel: isDel.DELETE, snoozedTime: null }).where(
						and(
							eq(email.userId, userId),
							inArray(email.emailId, emailIdList)))
						.run();
				}
			}
		}
	},

	async reportNotSpam(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = emailIds.split(',').map(Number);
		
		// 1. Move email back to inbox
		const emailRows = await orm(c).update(email).set({ 
			isSpam: 0, 
			isDel: 0, 
			snoozedTime: null 
		}).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)
			)
		).returning().all();

		if (emailRows.length === 0) return;

		// 2. Extract unique senders
		const senders = [];
		for (const row of emailRows) {
			if (row.sendEmail) {
				const match = row.sendEmail.match(/<([^>]+)>/);
				const cleanSender = match ? match[1].trim() : row.sendEmail.trim();
				if (!senders.includes(cleanSender)) {
					senders.push(cleanSender);
				}
			}
		}

		if (senders.length === 0) return;

		// 3. Add senders to user's Whitelist (信任名单)
		const userRow = await userOrm(c).select().from(user).where(eq(user.userId, userId)).get();
		let customLabels = userRow.customLabels;
		let labelsObj = [];
		try {
			labelsObj = JSON.parse(customLabels || '[]');
			if (!Array.isArray(labelsObj)) {
			   if (labelsObj && Array.isArray(labelsObj.customLabels)) {
				   labelsObj = labelsObj.customLabels;
			   } else {
				   labelsObj = [];
			   }
			}
		} catch (e) {
			labelsObj = [];
		}

		let whitelistLabel = labelsObj.find(l => l.name === '信任名单');
		if (!whitelistLabel) {
			whitelistLabel = {
				id: Date.now().toString(),
				name: '信任名单',
				actions: { priority: 1, stopProcessing: true },
				rules: [{
					id: Date.now().toString() + 'r',
					condition: { type: 'sender_is', value: '' },
					exception: { type: 'none', value: '' }
				}]
			};
			labelsObj.push(whitelistLabel);
		}

		// Update sender list
		const cond = whitelistLabel.rules[0].condition;
		const existingSenders = cond.value ? cond.value.split(',').map(s => s.trim()) : [];
		
		let updated = false;
		for (const s of senders) {
			if (!existingSenders.includes(s)) {
				existingSenders.push(s);
				updated = true;
			}
		}

		if (updated) {
			cond.value = existingSenders.join(',');
			
			// ensure priority
			whitelistLabel.actions = { priority: 1, stopProcessing: true };

			// Save back
			await orm(c).update(user).set({ customLabels: JSON.stringify(labelsObj) }).where(eq(user.userId, userId)).run();
			
			const authInfo = await c.env.kv.get(kvConst.AUTH_INFO + userId, { type: 'json' });
			if (authInfo && authInfo.user) {
				authInfo.user.customLabels = JSON.stringify(labelsObj);
				await c.env.kv.put(kvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: 60 * 60 * 24 * 7 });
			}
		}

		// In Mode 0 (Privacy Mail Mode): Restored emails are back in Inbox, so encrypt them
		const settingRow = await settingService.query(c);
		const mode = Number(settingRow?.allMailMode);
		if (mode === 0 && userId) {
			const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
			for (const row of emailRows) {
				const encrypted = await emailCryptoUtils.encryptEmailRecord(row, cryptoKey);
				await orm(c).update(email).set({
					subject: encrypted.subject,
					content: encrypted.content,
					text: encrypted.text,
					code: encrypted.code
				}).where(eq(email.emailId, row.emailId)).run();
			}
		}
	},

	async setSpam(c, params, userId) {
		const { emailIds, isSpam } = params;
		const emailIdList = emailIds.split(',').map(Number);
		await orm(c).update(email).set({ isSpam: isSpam ? 1 : 0, snoozedTime: null }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)))
			.run();
	},

	async setSnooze(c, params, userId) {
		const { emailIds, time, endTime } = params;
		const emailIdList = Array.isArray(emailIds) ? emailIds.map(Number) : String(emailIds).split(',').map(Number);
		await orm(c).update(email).set({ snoozedTime: time, snoozedEndTime: endTime }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)))
			.run();
	},

	async restore(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = Array.isArray(emailIds) ? emailIds.map(Number) : String(emailIds).split(',').map(Number);
		const settingRow = await settingService.query(c);
		const mode = Number(settingRow?.allMailMode);

		if (mode === 0 && userId) {
			const targetEmails = await orm(c).select().from(email).where(
				and(eq(email.userId, userId), inArray(email.emailId, emailIdList))
			).all();
			const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
			for (const row of targetEmails) {
				const encrypted = await emailCryptoUtils.encryptEmailRecord(row, cryptoKey);
				await orm(c).update(email).set({
					isDel: 0,
					isSpam: 0,
					snoozedTime: null,
					snoozedEndTime: null,
					subject: encrypted.subject,
					content: encrypted.content,
					text: encrypted.text,
					code: encrypted.code
				}).where(eq(email.emailId, row.emailId)).run();
			}
		} else {
			await orm(c).update(email).set({ isDel: 0, isSpam: 0, snoozedTime: null, snoozedEndTime: null }).where(
				and(
					eq(email.userId, userId),
					inArray(email.emailId, emailIdList)))
				.run();
		}
	},

	async clearTrashAndSpam(c) {
		const settings = await settingService.query(c);
		const spamRetentionDays = settings.spamRetentionDays || 7;
		
		// Move Spam to Trash after spamRetentionDays
		await orm(c).update(email).set({ isDel: 1 }).where(
			and(
				eq(email.isSpam, 1),
				eq(email.isDel, 0),
				lt(email.createTime, sql`datetime('now', '-' || ${spamRetentionDays} || ' days')`)
			)
		).run();

		// Physical Delete Trash after 7 days
		await orm(c).delete(email).where(
			and(
				eq(email.isDel, 1),
				lt(email.createTime, sql`datetime('now', '-7 days')`)
			)
		).run();
	},

	async receive(c, params, cidAttList, r2domain) {
		params.content = this.imgReplace(params.content, cidAttList, r2domain);
		const settingRow = await settingService.query(c);
		let dbParams = { ...params };
		if (params.userId && emailCryptoUtils.shouldEncryptEmail(settingRow?.allMailMode, params)) {
			const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, params.userId);
			dbParams = await emailCryptoUtils.encryptEmailRecord(dbParams, cryptoKey);
		}
		return orm(c).insert(email).values(dbParams).returning().get();
	},

	//邮件发送
	async send(c, params, userId) {

		let {
			accountId, //发送账号id
			name, //发件人名字
			sendType, //发件类型
			emailId, //邮件id，如果是回复邮件会带
			receiveEmail, //收件人邮箱
			text, //邮件纯文本
			content, //邮件内容
			subject, //邮件标题
			attachments = [] //附件
		} = params;

		const { resendTokens, r2Domain, send, domainList } = await settingService.query(c);

		let { imageDataList, html } = await attService.toImageUrlHtml(c, content);

		//判断是否关闭发件功能
		if (send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		// 计算邮件总大小限制
		const maxLimitMB = (c.env.admin === userRow.email) ? 100 : 25;
		const maxLimitBytes = maxLimitMB * 1024 * 1024;
		
		let totalSize = 0;
		if (text) totalSize += new Blob([text]).size;
		if (html) totalSize += new Blob([html]).size;
		
		imageDataList.forEach(img => {
			if (img.content) totalSize += (img.content.length * 3) / 4;
		});
		
		attachments.forEach(att => {
			if (att.content) totalSize += (att.content.length * 3) / 4;
		});

		if (totalSize > maxLimitBytes) {
			throw new BizError(t('emailSizeLimit', { msg: maxLimitMB + 'MB' }));
		}

		//判断接收方是不是全部为站内邮箱
		const allInternal = receiveEmail.every(email => {
			const domain = '@' + emailUtils.getDomain(email);
			return domainList.includes(domain);
		});

		if (c.env.admin !== userRow.email) {

			//发件被禁用
			if (roleRow.sendType === 'ban') {
				throw new BizError(t('bannedSend'), 403);
			}

			//发件被禁用
			if (roleRow.sendType === 'internal' && !allInternal) {
				throw new BizError(t('onlyInternalSend'), 403);
			}

		}

		//如果不是管理员，权限设置了发送次数
		if (c.env.admin !== userRow.email && roleRow.sendCount) {

			if (userRow.sendCount >= roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLimit'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLimit'), 403);
			}

			if (userRow.sendCount + receiveEmail.length > roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLack'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLack'), 403);
			}

		}

		const accountRow = await accountService.selectById(c, accountId);

		if (!accountRow) {
			throw new BizError(t('senderAccountNotExist'));
		}

		if (accountRow.userId !== userId) {
			throw new BizError(t('sendEmailNotCurUser'));
		}

		if (c.env.admin !== userRow.email) {
			//用户没有这个域名的使用权限
			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, accountRow.email)) {
				throw new BizError(t('noDomainPermSend'),403)
			}

		}

		const domain = emailUtils.getDomain(accountRow.email);
		const resendToken = resendTokens[domain];
		const useCloudflareEmail = !!c.env.email;

		//如果接收方存在站外邮箱，又没有发信服务
		if (!useCloudflareEmail && !resendToken && !allInternal) {
			throw new BizError(t('noSendProvider'));
		}

		//没有发件人名字自动截取
		if (!name) {
			name = emailUtils.getName(accountRow.email);
		}

		let emailRow = {
			messageId: null
		};

		//如果是回复邮件
		if (sendType === 'reply') {

			emailRow = await this.selectById(c, emailId, userId);

			if (!emailRow) {
				throw new BizError(t('notExistEmailReply'));
			}

		}

		let sendResult = {};

		//存在站外邮箱时，如果配置了 Cloudflare Email Service 就优先使用，否则使用 Resend
		if (!allInternal) {

			if (useCloudflareEmail) {
				sendResult = await this.sendByCloudflareEmail(c, {
					name,
					accountEmail: accountRow.email,
					receiveEmail,
					subject,
					text,
					html,
					attachments: [...imageDataList, ...attachments],
					sendType,
					messageId: emailRow.messageId
				});
			} else {
				sendResult = await this.sendByResend(resendToken, {
					name,
					accountEmail: accountRow.email,
					receiveEmail,
					subject,
					text,
					html,
					attachments: [...imageDataList, ...attachments],
					sendType,
					messageId: emailRow.messageId
				});
			}

		}

		const { data, error } = sendResult;


		if (error) {
			throw new BizError(error.message);
		}

		imageDataList = imageDataList.map(item => ({...item, contentId: `<${item.contentId}>`}))

		//把图片标签cid标签切换会通用url
		html = this.imgReplace(html, imageDataList, r2Domain);

		//封装数据保存到数据库
		const emailData = {};
		emailData.sendEmail = accountRow.email;
		emailData.name = name;
		emailData.subject = subject;
		emailData.content = html;
		emailData.text = text;
		emailData.accountId = accountId;
		emailData.status = useCloudflareEmail ? emailConst.status.DELIVERED : emailConst.status.SENT;
		emailData.type = emailConst.type.SEND;
		emailData.userId = userId;
		emailData.resendEmailId = data?.id || null;

		const recipient = [];

		receiveEmail.forEach(item => {
			recipient.push({ address: item, name: '' });
		});

		emailData.recipient = JSON.stringify(recipient);

		if (sendType === 'reply') {
			emailData.inReplyTo = emailRow.messageId;
			emailData.relation = emailRow.messageId;
		}

		//如果权限有发送次数增加用户发送次数
		if (roleRow.sendCount && roleRow.sendType !== 'internal') {
			await userService.incrUserSendCount(c, receiveEmail.length, userId);
		}

		const settingRow = await settingService.query(c);
		let dbEmailData = { ...emailData };
		if (userId && emailCryptoUtils.shouldEncryptEmail(settingRow?.allMailMode, emailData)) {
			const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
			dbEmailData = await emailCryptoUtils.encryptEmailRecord(dbEmailData, cryptoKey);
		}

		//保存到数据库并返回结果
		const emailResult = await orm(c).insert(email).values(dbEmailData).returning().get();

		//保存内嵌附件
		if (imageDataList.length > 0) {
			if (imageDataList.length > 10) {
				throw new BizError(t('imageAttLimit'));
			}
			await attService.saveArticleAtt(c, imageDataList, userId, accountId, emailResult.emailId);
		}

		//保存普通附件
		if (attachments?.length > 0) {
			if (attachments.length > 10) {
				throw new BizError(t('attLimit'));
			}
			await attService.saveSendAtt(c, attachments, userId, accountId, emailResult.emailId);
		}

		const attList = await attService.selectByEmailIds(c, [emailResult.emailId]);
		emailResult.attList = attList;

		//如果全是站内接收方，直接写入数据库
		if (allInternal) {
			await this.HandleOnSiteEmail(c, receiveEmail, emailResult, attList);
		}

		const dateStr = dayjs().format('YYYY-MM-DD');
		let daySendTotal = await c.env.kv.get(kvConst.SEND_DAY_COUNT + dateStr);

		//记录每天发件次数统计
		if (!daySendTotal) {
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(receiveEmail.length), { expirationTtl: 60 * 60 * 24 });
		} else  {
			daySendTotal = Number(daySendTotal) + receiveEmail.length
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(daySendTotal), { expirationTtl: 60 * 60 * 24 });
		}

		return [ { ...emailResult, subject, content: html, text } ];
	},

	async sendByCloudflareEmail(c, params) {
		const sendForm = {
			from: { email: params.accountEmail, name: params.name },
			to: [...params.receiveEmail],
			subject: params.subject
		};

		if (params.text) {
			sendForm.text = params.text;
		}

		if (params.html) {
			sendForm.html = params.html;
		}

		const attachments = await this.toCloudflareAttachments(params.attachments);
		if (attachments.length > 0) {
			sendForm.attachments = attachments;
		}

		if (params.sendType === 'reply' && params.messageId) {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		const result = await c.env.email.send(sendForm);

		return {
			data: {
				id: result.messageId
			}
		};
	},

	async sendByResend(resendToken, params) {
		console.log('RESEND TOKEN IS:', resendToken);
		if (resendToken && resendToken.startsWith('mailjet:')) {
			return await this.sendByMailjet(resendToken, params);
		}

		const resend = new Resend(resendToken);

		const sendForm = {
			from: `${params.name} <${params.accountEmail}>`,
			to: [...params.receiveEmail],
			subject: params.subject,
			text: params.text,
			html: params.html,
			attachments: await this.toResendAttachments(params.attachments)
		};

		if (params.sendType === 'reply') {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		return await resend.emails.send(sendForm);
	},

	async sendByMailjet(mailjetToken, params) {
		const parts = mailjetToken.split(':');
		const apiKey = parts[1];
		const apiSecret = parts[2];

		const messages = [
			{
				From: {
					Email: params.accountEmail,
					Name: params.name
				},
				To: params.receiveEmail.map(email => ({ Email: email })),
				Subject: params.subject,
				TextPart: params.text,
				HTMLPart: params.html
			}
		];

		const attachments = await this.toResendAttachments(params.attachments);
		if (attachments && attachments.length > 0) {
			messages[0].Attachments = attachments.map(att => ({
				ContentType: att.contentType,
				Filename: att.filename,
				Base64Content: att.content
			}));
		}

		if (params.sendType === 'reply' && params.messageId) {
			messages[0].Headers = {
				'In-Reply-To': params.messageId,
				'References': params.messageId
			};
		}

		const response = await fetch('https://api.mailjet.com/v3.1/send', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': 'Basic ' + btoa(`${apiKey}:${apiSecret}`)
			},
			body: JSON.stringify({ Messages: messages })
		});

		const result = await response.json();
		console.log('Mailjet response:', JSON.stringify(result));
		
		if (!response.ok) {
			return { data: null, error: { message: JSON.stringify(result) } };
		}
		
		return {
			data: {
				id: String(result.Messages[0].To[0].MessageID)
			},
			error: null
		};
	},

	async toCloudflareAttachments(attachments) {
		const arrayBufferAttachments = await this.toArrayBufferAttachments(attachments);

		return arrayBufferAttachments.map(attachment => {
			const item = {
				content: attachment.content,
				filename: attachment.filename,
				type: attachment.mimeType || attachment.contentType || attachment.type || 'application/octet-stream',
				disposition: attachment.contentId ? 'inline' : 'attachment'
			};

			if (attachment.contentId) {
				item.contentId = attachment.contentId.replace(/^<|>$/g, '');
			}

			return item;
		});
	},

	async toResendAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentBase64(attachment);
			if (!content) {
				continue;
			}

			result.push({
				...attachment,
				content,
				contentType: attachment.contentType || attachment.mimeType || attachment.type || 'application/octet-stream'
			});
		}

		return result;
	},

	async toArrayBufferAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentArrayBuffer(attachment);
			if (!content) {
				continue;
			}

			result.push({ ...attachment, content });
		}

		return result;
	},

	async toAttachmentBase64(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return content.replace(/\s+/g, '');
		}

		const arrayBuffer = await this.toAttachmentArrayBuffer(attachment);
		if (!arrayBuffer) {
			return null;
		}

		const bytes = new Uint8Array(arrayBuffer);
		let binary = '';

		for (let i = 0; i < bytes.length; i += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}

		return btoa(binary);
	},

	async toAttachmentArrayBuffer(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (content instanceof ArrayBuffer) {
			return content;
		}

		if (content instanceof Uint8Array) {
			return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return fileUtils.base64ToUint8Array(content.replace(/\s+/g, '')).buffer;
		}

		return content;
	},

	//处理站内邮件发送
	async HandleOnSiteEmail(c, receiveEmail, sendEmailData, attList) {

		const { noRecipient  } = await settingService.query(c);

		//查询所有收件人账号信息
		let accountList = await orm(c).select().from(account).where(inArray(account.email, receiveEmail)).all();

		//查询所有收件人权限身份
		const userIds = accountList.map(accountRow => accountRow.userId);
		let roleList = await roleService.selectByUserIds(c, userIds);

		//封装数据库准备保存到数据库
		const emailDataList = [];

		for (const email of receiveEmail) {

			//把发件人邮件改成收件
			const emailValues = {...sendEmailData}
			emailValues.status = emailConst.status.RECEIVE;
			emailValues.type = emailConst.type.RECEIVE;
			emailValues.toEmail = email;
			emailValues.toName = emailUtils.getName(email);
			emailValues.emailId = null;

			const accountRow = accountList.find(accountRow => accountRow.email === email);

			//如果收件人存在就把邮件信息改成收件人的
			if (accountRow) {

				//设置给收件人保存
				emailValues.userId = accountRow.userId;
				emailValues.accountId = accountRow.accountId;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.RECEIVE;

				const roleRow = roleList.find(roleRow => roleRow.userId === accountRow.userId);

				let { banEmail, availDomain } = roleRow;

				//如果收件人没有这个域名的使用权限和有邮件拦截，就把邮件改为拒收状态
				if (email !== c.env.admin) {

					if (!roleService.hasAvailDomainPerm(availDomain, email)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is not authorized to use this domain.`;
					} else if(roleService.isBanEmail(banEmail, sendEmailData.sendEmail)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is disabled from receiving emails.`;
					}

				}

				emailDataList.push(emailValues);

			} else {

				//设置无收件人邮件信息
				emailValues.userId = 0;
				emailValues.accountId = 0;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.NOONE;

				//如果无人收件关闭改为拒收
				if (noRecipient === settingConst.noRecipient.CLOSE) {
					emailValues.status = emailConst.status.BOUNCED;
					emailValues.message = `Recipient not found: <${email}>`;
				}

				emailDataList.push(emailValues);

			}

		}

		const settingRow = await settingService.query(c);
		//保存邮件
		const receiveEmailList = emailDataList.filter(emailRow => emailRow.status === emailConst.status.RECEIVE || emailRow.status === emailConst.status.NOONE);

		for (const emailData of receiveEmailList) {
			let dbEmailData = { ...emailData };
			if (emailData.userId && emailCryptoUtils.shouldEncryptEmail(settingRow?.allMailMode, emailData)) {
				const recipientKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, emailData.userId);
				dbEmailData = await emailCryptoUtils.encryptEmailRecord(dbEmailData, recipientKey);
			}
			const emailRow = await orm(c).insert(email).values(dbEmailData).returning().get();

			//设置附件保存
			for (const attRow of attList) {
				const attValues = {...attRow};
				attValues.emailId = emailRow.emailId;
				attValues.accountId = emailRow.accountId;
				attValues.userId = emailRow.userId;
				attValues.attId = null;
				await orm(c).insert(att).values(attValues).run();
			}

		}

		const bouncedEmail = emailDataList.find(emailRow => emailRow.status === emailConst.status.BOUNCED);


		let status = emailConst.status.DELIVERED;
		let message = ''
		//如果有拒收邮件，就把发件人的邮件改成拒收
		if (bouncedEmail) {
			const messageJson = { message: bouncedEmail.message };
			message = JSON.stringify(messageJson);
			status = emailConst.status.BOUNCED;
		}

		await orm(c).update(email).set({ status, message: message }).where(eq(email.emailId, sendEmailData.emailId)).run();

	},

	imgReplace(content, cidAttList, r2domain) {

		if (!content) {
			return ''
		}

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		const useAtts = []

		for (const img of images) {

			const src = img.getAttribute('src');
			if (src && src.startsWith('cid:') && cidAttList) {

				const cid = src.replace(/^cid:/, '');
				const attCidIndex = cidAttList.findIndex(cidAtt => cidAtt.contentId.replace(/^<|>$/g, '') === cid);

				if (attCidIndex > -1) {
					const cidAtt = cidAttList[attCidIndex];
					img.setAttribute('src', '{{domain}}' + cidAtt.key);
					useAtts.push(cidAtt)
				}

			}

			r2domain = domainUtils.toOssDomain(r2domain)

			if (src && src.startsWith(r2domain + '/')) {
				img.setAttribute('src', src.replace(r2domain + '/', '{{domain}}'));
			}

		}

		useAtts.forEach(att => {
			att.type = attConst.type.EMBED
		})

		return document.toString();
	},

	async deliverWelcomeEmailToUser(c, userId, accountId, userEmail, overrideData = null) {
		const settingData = await settingService.query(c);
		if (!overrideData && settingData.welcomeAutoSend === 0) {
			return null;
		}
		let subject = overrideData?.subject || settingData.welcomeSubject || '🎉 欢迎加入 Epocanvas Mail - 开启您的私密、高效云端邮件体验';
		const expireDays = overrideData?.expireDays !== undefined ? Number(overrideData.expireDays) : (Number(settingData.welcomeExpireDays) >= 0 ? Number(settingData.welcomeExpireDays) : 7);
		let text = overrideData?.text || settingData.welcomeText;
		let rawContent = overrideData?.content || settingData.welcomeContent || '';
		if (!text && rawContent) {
			text = emailUtils.htmlToText(rawContent);
		}
		if (!text) {
			text = '欢迎使用 Epocanvas Mail，开启您的私密、高效云端邮件体验！';
		}

		// Interpolate dynamic template placeholders ({{user_name}}, {{user_id}}, {{user_email}}, {{domain}}, {{current_date}})
		let userName = emailUtils.getName(userEmail) || (userEmail ? userEmail.split('@')[0] : '用户');
		try {
			const userEntity = (await import('../entity/user')).default;
			const userRow = await orm(c).select({ nickname: userEntity.nickname, email: userEntity.email }).from(userEntity).where(eq(userEntity.userId, userId)).get();
			if (userRow && userRow.nickname) {
				userName = userRow.nickname;
			}
		} catch (e) {}

		const domain = userEmail ? (userEmail.split('@')[1] || 'epomail.bond') : 'epomail.bond';
		const dateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

		const interpolate = (str) => {
			if (!str || typeof str !== 'string') return str;
			return str
				.replace(/\{\{\s*user_name\s*\}\}/gi, userName)
				.replace(/\{\{\s*username\s*\}\}/gi, userName)
				.replace(/\{\{\s*user_id\s*\}\}/gi, String(userId))
				.replace(/\{\{\s*user_email\s*\}\}/gi, userEmail || '')
				.replace(/\{\{\s*domain\s*\}\}/gi, domain)
				.replace(/\{\{\s*current_date\s*\}\}/gi, dateStr)
				.replace(/\{\{\s*date\s*\}\}/gi, dateStr);
		};

		subject = interpolate(subject);
		const contentSnapshot = interpolate(rawContent);
		text = interpolate(text);

		// Check if user already has this welcome email (only check on auto-send on registration)
		if (!overrideData?.isBroadcast) {
			const existing = await orm(c).select({ emailId: email.emailId }).from(email).where(
				and(
					eq(email.userId, userId),
					eq(email.sendEmail, 'admin@epocanvas.com'),
					eq(email.subject, subject),
					eq(email.isDel, isDel.NORMAL)
				)
			).limit(1).get();

			if (existing) {
				return null;
			}
		}

		const now = new Date().toISOString();
		const snoozedEndTime = expireDays > 0 ? new Date(Date.now() + expireDays * 86400000).toISOString() : null;

		let welcomeData = {
			userId: userId,
			accountId: accountId,
			sendEmail: 'admin@epocanvas.com',
			name: 'Epocanvas 官方团队',
			subject: subject,
			content: contentSnapshot, // Immutable snapshot with interpolated user variables
			text: text,
			toEmail: userEmail,
			toName: userName,
			recipient: JSON.stringify([{ address: userEmail, name: userName }]),
			cc: '[]',
			bcc: '[]',
			inReplyTo: '',
			relation: '',
			messageId: '',
			type: emailConst.type.RECEIVE,
			status: 0,
			unread: emailConst.unread.UNREAD,
			isDel: isDel.NORMAL,
			isSpam: 0,
			snoozedTime: now, // Automatically marked as Snoozed / 代办
			snoozedEndTime: snoozedEndTime,
			labels: JSON.stringify(['官方', '代办']),
			code: '',
			createTime: now
		};

		if (userId && emailCryptoUtils.shouldEncryptEmail(settingData?.allMailMode, welcomeData)) {
			const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
			welcomeData = await emailCryptoUtils.encryptEmailRecord(welcomeData, cryptoKey);
		}

		const emailRow = await orm(c).insert(email).values(welcomeData).returning().get();

		if (emailRow && emailRow.emailId) {
			// Automatically mark as Starred (重要)
			await orm(c).insert(star).values({
				userId: userId,
				emailId: emailRow.emailId,
				createTime: now
			}).run().catch(() => {});
		}

		return emailRow;
	},

	async selectById(c, emailId, expectedUserId = null) {
		const conditions = [
			eq(email.emailId, emailId),
			eq(email.isDel, isDel.NORMAL)
		];
		if (expectedUserId !== null && expectedUserId !== undefined) {
			conditions.push(eq(email.userId, expectedUserId));
		}
		let emailRow = await orm(c).select().from(email).where(
			and(...conditions))
			.get();
		if (emailRow) {
			if (emailRow.userId) {
				const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, emailRow.userId);
				emailRow = await emailCryptoUtils.decryptEmailRecord(emailRow, cryptoKey);
			}
			const isOfficial = emailRow.sendEmail === 'admin@epocanvas.com' || (emailRow.labels && emailRow.labels.includes('官方'));
			if (isOfficial) {
				emailRow.isOfficial = 1;
				const settingData = await settingService.query(c);
				if (!emailRow.content && settingData.welcomeContent) {
					emailRow.content = settingData.welcomeContent;
				}
				if (emailRow.content && emailRow.content.includes('{{')) {
					const userName = emailRow.toName || (emailRow.toEmail ? emailRow.toEmail.split('@')[0] : '用户');
					const domain = emailRow.toEmail ? (emailRow.toEmail.split('@')[1] || 'epomail.bond') : 'epomail.bond';
					const dateStr = new Date(emailRow.createTime || Date.now()).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
					emailRow.content = emailRow.content
						.replace(/\{\{\s*user_name\s*\}\}/gi, userName)
						.replace(/\{\{\s*username\s*\}\}/gi, userName)
						.replace(/\{\{\s*user_id\s*\}\}/gi, String(emailRow.userId || ''))
						.replace(/\{\{\s*user_email\s*\}\}/gi, emailRow.toEmail || '')
						.replace(/\{\{\s*domain\s*\}\}/gi, domain)
						.replace(/\{\{\s*current_date\s*\}\}/gi, dateStr)
						.replace(/\{\{\s*date\s*\}\}/gi, dateStr);
				}
				emailRow.expireDays = settingData.welcomeExpireDays ?? 7;
			}
		}
		return emailRow;
	},

	async latest(c, params, userId) {
		let { emailId, accountId, allReceive } = params;
		allReceive = Number(allReceive);

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		let list = await orm(c).select({...email}).from(email)
			.leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.userId, userId),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL),
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.type, emailConst.type.RECEIVE)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		await this.emailAddAtt(c, list);

		if (userId) {
			const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
			list = await emailCryptoUtils.decryptEmailList(list, cryptoKey);
		}

		const settingData = await settingService.query(c);
		list.forEach(item => {
			const isOfficial = item.sendEmail === 'admin@epocanvas.com' || (item.labels && item.labels.includes('官方'));
			if (isOfficial) {
				item.isOfficial = 1;
				if (!item.content && settingData.welcomeContent) {
					item.content = settingData.welcomeContent;
				}
				item.expireDays = settingData.welcomeExpireDays ?? 7;
			}
		});

		return list;
	},

	async physicsDelete(c, params) {
		let { emailIds } = params;
		emailIds = emailIds.split(',').map(Number);
		await attService.removeByEmailIds(c, emailIds);
		await starService.removeByEmailIds(c, emailIds);
		await orm(c).delete(email).where(inArray(email.emailId, emailIds)).run();
	},

	async physicsDeleteUserIds(c, userIds) {
		await attService.removeByUserIds(c, userIds);
		await orm(c).delete(email).where(inArray(email.userId, userIds)).run();
	},

	updateEmailStatus(c, params) {
		const { status, resendEmailId, message } = params;
		return orm(c).update(email).set({
			status: status,
			message: message
		}).where(eq(email.resendEmailId, resendEmailId)).returning().get();
	},

	async selectUserEmailCountList(c, userIds, type, del = isDel.NORMAL) {
		if (!userIds || userIds.length === 0) {
			return [];
		}
		const result = await orm(c)
			.select({
				userId: email.userId,
				count: count(email.emailId)
			})
			.from(email)
			.where(and(
				inArray(email.userId, userIds),
				eq(email.type, type),
				eq(email.isDel, del),
				ne(email.status, emailConst.status.SAVING),
			))
			.groupBy(email.userId);
		return result;
	},

	async allList(c, params) {

		let { emailId, size, name, subject, accountEmail, userEmail, type, timeSort } = params;

		size = Number(size);

		emailId = Number(emailId);
		timeSort = Number(timeSort);

		if (size > 50) {
			size = 50;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		const conditions = [];

		if (type === 'send') {
			conditions.push(eq(email.type, emailConst.type.SEND));
		}

		if (type === 'receive') {
			conditions.push(eq(email.type, emailConst.type.RECEIVE));
		}

		if (type === 'delete') {
			conditions.push(eq(email.isDel, isDel.DELETE));
		}

		if (type === 'noone') {
			conditions.push(eq(email.status, emailConst.status.NOONE));
		}

		if (userEmail) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${'%'+ userEmail + '%'}`);
		}

		if (accountEmail) {
			conditions.push(
				or(
					sql`${email.toEmail} COLLATE NOCASE LIKE ${'%'+ accountEmail + '%'}`,
					sql`${email.sendEmail} COLLATE NOCASE LIKE ${'%'+ accountEmail + '%'}`,
				)
			)
		}

		if (name) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${'%'+ name + '%'}`);
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${'%'+ subject + '%'}`);
		}

		// keyword = free-text search (no $-prefix), OR across name + subject + sendEmail
		if (params.keyword) {
			const kw = '%' + params.keyword + '%';
			conditions.push(
				or(
					sql`${email.name} COLLATE NOCASE LIKE ${kw}`,
					sql`${email.subject} COLLATE NOCASE LIKE ${kw}`,
					sql`${email.sendEmail} COLLATE NOCASE LIKE ${kw}`,
					sql`${email.toEmail} COLLATE NOCASE LIKE ${kw}`,
				)
			);
		}

		// Privacy mode filtering:
		// Mode 1 (allMailMode === 1): Admin sees all emails (plaintext)
		// Mode 0 (allMailMode === 0): Admin only sees spam / deleted / noone emails (plaintext in mode 0)
		// Mode 2 (allMailMode === 2): Admin strictly forbidden from listing/viewing any user emails
		const settingRow = await settingService.query(c);
		const mode = Number(settingRow?.allMailMode);
		if (mode === 2) {
			return { list: [], total: 0, latestEmail: { emailId: 0, accountId: 0, userId: 0 } };
		}
		if (mode === 0) {
			conditions.push(
				or(
					eq(email.isSpam, 1),
					eq(email.isDel, isDel.DELETE),
					eq(email.status, emailConst.status.NOONE)
				)
			);
		}

		conditions.push(ne(email.status, emailConst.status.SAVING));

		const countConditions = [...conditions];

		if (timeSort) {
			conditions.unshift(gt(email.emailId, emailId));
		} else {
			conditions.unshift(lt(email.emailId, emailId));
		}

		const query = orm(c).select()
			.from(email)
			.where(and(...conditions));

		const queryCount = orm(c).select({ total: count() })
			.from(email)
			.where(and(...countConditions));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();
		const totalQuery = queryCount.get();
		
		const latestConditions = [
			eq(email.type, emailConst.type.RECEIVE),
			ne(email.status, emailConst.status.SAVING)
		];
		if (mode === 0) {
			latestConditions.push(
				or(
					eq(email.isSpam, 1),
					eq(email.isDel, isDel.DELETE),
					eq(email.status, emailConst.status.NOONE)
				)
			);
		} else if (mode === 2) {
			latestConditions.push(
				eq(email.status, emailConst.status.NOONE)
			);
		}

		const latestEmailQuery = orm(c).select().from(email)
			.where(and(...latestConditions))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		const userIds = [...new Set(list.map(item => item.userId).filter(Boolean))];
		if (userIds.length > 0) {
			try {
				const userList = await userOrm(c).select({ userId: user.userId, email: user.email }).from(user).where(inArray(user.userId, userIds)).all();
				const userMap = new Map(userList.map(u => [u.userId, u.email]));
				list.forEach(item => {
					item.userEmail = userMap.get(item.userId) || '';
				});
			} catch (e) {
				list.forEach(item => {
					item.userEmail = '';
				});
			}
		} else {
			list.forEach(item => {
				item.userEmail = '';
			});
		}

		await this.emailAddAtt(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: 0,
				userId: 0,
			}
		}

		return { list: list, total: totalRow.total, latestEmail };
	},

	async allEmailLatest(c, params) {

		const { emailId } = params;
		const settingRow = await settingService.query(c);
		const mode = Number(settingRow?.allMailMode);
		if (mode === 2) {
			return [];
		}

		const conditions = [
			gt(email.emailId, emailId),
			eq(email.type, emailConst.type.RECEIVE),
			ne(email.status, emailConst.status.SAVING)
		];
		if (mode === 0) {
			conditions.push(
				or(
					eq(email.isSpam, 1),
					eq(email.isDel, isDel.DELETE),
					eq(email.status, emailConst.status.NOONE)
				)
			);
		}

		let list = await orm(c).select().from(email)
			.where(and(...conditions))
			.orderBy(desc(email.emailId))
			.limit(20);

		const userIds = [...new Set(list.map(item => item.userId).filter(Boolean))];
		if (userIds.length > 0) {
			try {
				const userList = await userOrm(c).select({ userId: user.userId, email: user.email }).from(user).where(inArray(user.userId, userIds)).all();
				const userMap = new Map(userList.map(u => [u.userId, u.email]));
				list.forEach(item => {
					item.userEmail = userMap.get(item.userId) || '';
				});
			} catch (e) {
				list.forEach(item => {
					item.userEmail = '';
				});
			}
		} else {
			list.forEach(item => {
				item.userEmail = '';
			});
		}

		await this.emailAddAtt(c, list);

		return list;
	},

	async emailAddAtt(c, list) {

		const emailIds = list.map(item => item.emailId);

		if (emailIds.length > 0) {

			const attList = await attService.selectByEmailIds(c, emailIds);

			list.forEach(emailRow => {
				const atts = attList.filter(attRow => attRow.emailId === emailRow.emailId);
				emailRow.attList = atts;
			});
		}
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(eq(email.userId, userId)).run();
	},

	async completeReceive(c, status, emailId, delStatus) {
		return await orm(c).update(email).set({
			isDel: delStatus !== undefined ? delStatus : isDel.NORMAL,
			status: status
		}).where(eq(email.emailId, emailId)).returning().get();
	},

	async completeReceiveAll(c) {
		await c.env.db.prepare(`UPDATE email as e SET status = ${emailConst.status.RECEIVE} WHERE status = ${emailConst.status.SAVING} AND EXISTS (SELECT 1 FROM account WHERE account_id = e.account_id)`).run();
		await c.env.db.prepare(`UPDATE email as e SET status = ${emailConst.status.NOONE} WHERE status = ${emailConst.status.SAVING} AND NOT EXISTS (SELECT 1 FROM account WHERE account_id = e.account_id)`).run();
	},

	async batchDelete(c, params) {
		let { sendName, sendEmail, toEmail, subject, startTime, endTime, type  } = params

		let right = type === 'left' || type === 'include'
		let left = type === 'include'

		const conditions = []

		if (sendName) {
			conditions.push(like(email.name,`${left ? '%' : ''}${sendName}${right ? '%' : ''}`))
		}

		if (subject) {
			conditions.push(like(email.subject,`${left ? '%' : ''}${subject}${right ? '%' : ''}`))
		}

		if (sendEmail) {
			conditions.push(like(email.sendEmail,`${left ? '%' : ''}${sendEmail}${right ? '%' : ''}`))
		}

		if (toEmail) {
			conditions.push(like(email.toEmail,`${left ? '%' : ''}${toEmail}${right ? '%' : ''}`))
		}

		if (startTime && endTime) {
			conditions.push(gte(email.createTime,`${startTime}`))
			conditions.push(lte(email.createTime,`${endTime}`))
		}

		if (conditions.length === 0) {
			return;
		}

		const emailIdsRow = await orm(c).select({emailId: email.emailId}).from(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).all();

		const emailIds = emailIdsRow.map(row => row.emailId);

		if (emailIds.length === 0){
			return;
		}

		await attService.removeByEmailIds(c, emailIds);

		await orm(c).delete(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).run();
	},

	async physicsDeleteByAccountId(c, accountId) {
		await attService.removeByAccountId(c, accountId);
		await orm(c).delete(email).where(eq(email.accountId, accountId)).run();
	},

	async read(c, params, userId) {
		const { emailIds } = params;
		await orm(c).update(email).set({ unread: emailConst.unread.READ }).where(and(eq(email.userId, userId), inArray(email.emailId, emailIds)));
	},

	async searchSuggestions(c, params, userId) {
		const { query, type, accountId } = params;
		if (!query || query.length < 1) return [];

		const searchPattern = `%${query}%`;
		const conditionList = [eq(email.userId, userId)];
		if (accountId && accountId > 0) {
			conditionList.push(eq(email.accountId, Number(accountId)));
		}

		let fieldToSelect = null;
		let results = [];
		const isFrom = ['from', 'sender_address_includes'].includes(type);
		const isTo = ['to', 'recipient_address_includes', 'email_received_for_others'].includes(type);
		const isSubject = ['subject_include', 'subject_or_body_include'].includes(type);

		if (isFrom) {
			conditionList.push(like(email.sendEmail, searchPattern));
			const list = await orm(c).select({ value: email.sendEmail }).from(email)
				.where(and(...conditionList))
				.groupBy(email.sendEmail)
				.limit(15);
			
			const extracted = list.map(item => {
				const match = (item.value || '').match(/<([^>]+)>/);
				let emailStr = match ? match[1].trim() : (item.value || '').trim();
				if (type === 'sender_address_includes') {
					const parts = emailStr.split('@');
					if (parts.length > 1) emailStr = parts[1];
				}
				return emailStr;
			});
			results = [...new Set(extracted)].filter(v => v.toLowerCase().includes(query.toLowerCase()));
		} else if (isTo) {
			conditionList.push(like(email.toEmail, searchPattern));
			const list = await orm(c).select({ value: email.toEmail }).from(email)
				.where(and(...conditionList))
				.groupBy(email.toEmail)
				.limit(15);
				
			const extracted = list.map(item => {
				const match = (item.value || '').match(/<([^>]+)>/);
				let emailStr = match ? match[1].trim() : (item.value || '').trim();
				if (type === 'recipient_address_includes') {
					const parts = emailStr.split('@');
					if (parts.length > 1) emailStr = parts[1];
				}
				return emailStr;
			});
			results = [...new Set(extracted)].filter(v => v.toLowerCase().includes(query.toLowerCase()));
		} else if (isSubject) {
			const list = await orm(c).select({ value: email.subject }).from(email)
				.where(and(...conditionList))
				.groupBy(email.subject)
				.limit(25);
			if (userId) {
				const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, userId);
				const decryptedSubjects = await Promise.all(list.map(async item => {
					return await emailCryptoUtils.decryptText(item.value, cryptoKey);
				}));
				results = [...new Set(decryptedSubjects.filter(v => v && v.toLowerCase().includes(query.toLowerCase())))].slice(0, 15);
			} else {
				results = list.map(item => item.value);
			}
		}

		return results;
	},

	async getSidebarStats(c, userId) {
		const stats = await c.env.db.prepare(`
			SELECT 
				SUM(CASE WHEN is_del = 0 AND is_spam = 0 AND (snoozed_time IS NULL OR send_email = 'admin@epocanvas.com') AND type = 0 AND unread = 0 THEN 1 ELSE 0 END) as inboxUnread,
				SUM(CASE WHEN is_del = 0 AND is_spam = 0 AND snoozed_time IS NULL AND type = 1 AND status = 6 AND unread = 0 THEN 1 ELSE 0 END) as draftUnread,
				SUM(CASE WHEN is_del = 0 AND is_spam = 0 AND snoozed_time IS NULL AND type = 1 AND status != 6 AND unread = 0 THEN 1 ELSE 0 END) as sentUnread,
				SUM(CASE WHEN is_del = 0 AND is_spam = 1 AND unread = 0 THEN 1 ELSE 0 END) as spamUnread,
				SUM(CASE WHEN is_del = 0 AND is_spam = 1 AND unread = 1 THEN 1 ELSE 0 END) as spamRead,
				SUM(CASE WHEN is_del = 1 AND unread = 0 THEN 1 ELSE 0 END) as trashUnread,
				SUM(CASE WHEN is_del = 1 AND unread = 1 THEN 1 ELSE 0 END) as trashRead,
				SUM(CASE WHEN is_del = 0 AND snoozed_time IS NOT NULL AND (snoozed_end_time IS NULL OR datetime(snoozed_end_time) <= datetime('now')) THEN 1 ELSE 0 END) as snoozedUrgent,
				SUM(CASE WHEN is_del = 0 AND snoozed_time IS NOT NULL AND snoozed_end_time IS NOT NULL AND datetime(snoozed_end_time) > datetime('now') THEN 1 ELSE 0 END) as snoozedWaiting,
				SUM(CASE WHEN is_del = 0 AND unread = 0 THEN 1 ELSE 0 END) as allUnread
			FROM email
			WHERE user_id = ?
		`).bind(userId).first();

		const labelEmails = await c.env.db.prepare(`
			SELECT labels, unread FROM email WHERE user_id = ? AND is_del = 0 AND labels != '[]' AND labels IS NOT NULL
		`).bind(userId).all();

		const labelStats = {};
		if (labelEmails && labelEmails.results) {
			for (const row of labelEmails.results) {
				try {
					const labels = JSON.parse(row.labels);
					for (const lbl of labels) {
						if (!labelStats[lbl]) {
							labelStats[lbl] = { unread: 0, read: 0 };
						}
						if (row.unread === 0) {
							labelStats[lbl].unread++;
						} else {
							labelStats[lbl].read++;
						}
					}
				} catch (e) {}
			}
		}

		return {
			...stats,
			labelStats
		};
	},

	async getAnalytics(c, userId) {
		const result = {
			totalProcessed: 0,
			totalIntercepted: 0,
			interceptRate: '0%',
			trend: [],
			topRules: []
		};
		try {
			// Bug Fix #3: Use reliable count via .all() to avoid ambiguous column name
			const countRows = await orm(c).select({ cnt: sql`count(*) as cnt` }).from(email).where(eq(email.userId, userId)).all();
			result.totalProcessed = countRows && countRows[0] ? (countRows[0].cnt || 0) : 0;

			const allEmails = await orm(c).select({ createTime: email.createTime, labels: email.labels, isSpam: email.isSpam })
				.from(email).where(eq(email.userId, userId)).all();
				
			const trendMap = {};
			const ruleMap = {};
			const now = new Date();
			for (let i = 6; i >= 0; i--) {
				const d = new Date(now);
				d.setDate(d.getDate() - i);
				const dateStr = d.toISOString().split('T')[0];
				trendMap[dateStr] = 0;
			}
			
			let totalIntercepted = 0;
			allEmails.forEach(e => {
				// Bug Fix #2: SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" (no T).
				// new Date("2026-08-15 10:00:00") is Invalid Date in V8. Replace space with T.
				const rawTime = e.createTime ? String(e.createTime).replace(' ', 'T') : '';
				const dateObj = rawTime ? new Date(rawTime) : new Date();
				const dateStr = dateObj.toISOString().split('T')[0];
				
				let intercepted = false;
				if (e.isSpam === 1) intercepted = true;
				let labs = [];
				if (e.labels) {
					try {
						labs = JSON.parse(e.labels);
						if (Array.isArray(labs)) {
							if (labs.includes('推销') || labs.includes('垃圾')) intercepted = true;
							labs.forEach(l => {
								if (l !== '收件箱') {
									ruleMap[l] = (ruleMap[l] || 0) + 1;
								}
							});
						}
					} catch(err) {}
				}
				
				if (intercepted) totalIntercepted++;
				if (intercepted && trendMap[dateStr] !== undefined) {
					trendMap[dateStr]++;
				}
			});
			
			result.totalIntercepted = totalIntercepted;
			if (result.totalProcessed > 0) {
				result.interceptRate = ((result.totalIntercepted / result.totalProcessed) * 100).toFixed(1) + '%';
			}
			
			let maxTrend = 0;
			for (const k in trendMap) {
				if (trendMap[k] > maxTrend) maxTrend = trendMap[k];
			}
			
			for (const date in trendMap) {
				const count = trendMap[date];
				const label = date.substring(5);
				result.trend.push({
					date,
					label,
					count,
					percent: maxTrend === 0 ? 0 : Math.max(2, (count / maxTrend) * 100)
				});
			}
			
			let maxRule = 0;
			for (const k in ruleMap) {
				if (ruleMap[k] > maxRule) maxRule = ruleMap[k];
			}
			
			result.topRules = Object.keys(ruleMap).map(name => {
				return {
					name,
					count: ruleMap[name],
					percent: maxRule === 0 ? 0 : (ruleMap[name] / maxRule) * 100
				};
			}).sort((a,b) => b.count - a.count).slice(0, 5);
			
		} catch (e) {
			console.error('Analytics error:', e);
		}
		return result;
	}
};

export default emailService;
