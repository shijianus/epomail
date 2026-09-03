import { mailOrm as orm } from '../entity/orm';
import email from '../entity/email';
import settingService from './setting-service';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
import { eq } from 'drizzle-orm';
import jwtUtils from '../utils/jwt-utils';
import emailMsgTemplate from '../template/email-msg';
import emailTextTemplate from '../template/email-text';
import emailHtmlTemplate from '../template/email-html';
import verifyUtils from '../utils/verify-utils';
import domainUtils from "../utils/domain-uitls";
import emailCryptoUtils from "../utils/email-crypto-utils";

const telegramService = {

	async getEmailContent(c, params) {

		const { token } = params

		const result = await jwtUtils.verifyToken(c, token);

		if (!result) {
			return emailTextTemplate('Access denied')
		}

		let emailRow = await orm(c).select().from(email).where(eq(email.emailId, result.emailId)).get();

		if (emailRow) {
			if (emailRow.userId) {
				const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, emailRow.userId);
				emailRow = await emailCryptoUtils.decryptEmailRecord(emailRow, cryptoKey);
			}

			if (emailRow.content) {
				const { r2Domain } = await settingService.query(c);
				return emailHtmlTemplate(emailRow.content || '', r2Domain)
			} else {
				return emailTextTemplate(emailRow.text || '')
			}

		} else {
			return emailTextTemplate('The email does not exist')
		}

	},

	async sendEmailToBot(c, email) {

		const { tgBotToken, tgChatId, customDomain, tgMsgTo, tgMsgFrom, tgMsgText } = await settingService.query(c);

		const tgChatIds = tgChatId.split(',');

		const jwtToken = await jwtUtils.generateToken(c, { emailId: email.emailId })

		const webAppUrl = customDomain ? `${domainUtils.toOssDomain(customDomain)}/api/telegram/getEmail/${jwtToken}` : 'https://www.cloudflare.com/404'
		const inlineKeyboard = [
			[
				{
					text: 'View',
					web_app: { url: webAppUrl }
				}
			]
		];

		if (email.code) {
			inlineKeyboard.push([
				{
					text: email.code,
					copy_text: { text: email.code }
				}
			]);
		}

		await Promise.all(tgChatIds.map(async chatId => {
			try {
				const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						chat_id: chatId,
						parse_mode: 'HTML',
						text: emailMsgTemplate(email, tgMsgTo, tgMsgFrom, tgMsgText),
						reply_markup: {
							inline_keyboard: inlineKeyboard
						}
					})
				});
				if (!res.ok) {
					console.error(`转发 Telegram 失败 status: ${res.status} response: ${await res.text()}`);
				}
			} catch (e) {
				console.error(`转发 Telegram 失败:`, e.message);
			}
		}));

	},

	async testPersonalBot(c, params) {
		const { botToken, chatId, topicId } = params;
		if (!botToken || !chatId) {
			throw new BizError('Bot Token 和 Chat ID 不能为空');
		}

		const body = {
			chat_id: chatId,
			parse_mode: 'HTML',
			text: `🚀 <b>EpoCanvas Mail 个人通知测试</b>\n\n您的个人 Telegram 机器人已成功接入！\n\n⏱️ <b>测试时间</b>: <code>${new Date().toISOString()}</code>\n👤 <b>状态</b>: 验证通过 ✅\n📌 <b>通道</b>: 个人专属通知通道已就绪`
		};

		if (topicId && !isNaN(Number(topicId))) {
			body.message_thread_id = Number(topicId);
		}

		try {
			const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!res.ok) {
				const errText = await res.text();
				throw new BizError(`Telegram API 返回错误 (${res.status}): ${errText}`);
			}
			return { success: true };
		} catch (e) {
			if (e instanceof BizError) throw e;
			throw new BizError(`发送 Telegram 测试消息失败: ${e.message}`);
		}
	},

	async sendPersonalEmailToBot(c, email, personalTgConfig) {
		if (!personalTgConfig || !personalTgConfig.enabled || !personalTgConfig.botToken || !personalTgConfig.chatId) {
			return;
		}

		const { botToken, chatId, topicId } = personalTgConfig;
		const { customDomain, tgMsgTo, tgMsgFrom, tgMsgText } = await settingService.query(c);

		const jwtToken = await jwtUtils.generateToken(c, { emailId: email.emailId });
		const webAppUrl = customDomain ? `${domainUtils.toOssDomain(customDomain)}/api/telegram/getEmail/${jwtToken}` : 'https://www.cloudflare.com/404';

		const inlineKeyboard = [
			[
				{
					text: '📖 查看邮件 / View',
					web_app: { url: webAppUrl }
				}
			]
		];

		if (email.code) {
			inlineKeyboard.push([
				{
					text: `🔑 验证码: ${email.code}`,
					copy_text: { text: email.code }
				}
			]);
		}

		const body = {
			chat_id: chatId,
			parse_mode: 'HTML',
			text: emailMsgTemplate(email, tgMsgTo, tgMsgFrom, tgMsgText),
			reply_markup: {
				inline_keyboard: inlineKeyboard
			}
		};

		if (topicId && !isNaN(Number(topicId))) {
			body.message_thread_id = Number(topicId);
		}

		try {
			const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				console.error(`Personal Telegram Bot send failed: status ${res.status} response ${await res.text()}`);
			}
		} catch (e) {
			console.error(`Personal Telegram Bot send error:`, e.message);
		}
	}

}

export default telegramService
