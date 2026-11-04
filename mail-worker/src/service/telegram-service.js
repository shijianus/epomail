import settingService from './setting-service';
import emailMsgTemplate from '../template/email-msg';
import emailUtils from '../utils/email-utils.js';
import emailHtmlTemplate from '../template/email-html';
import domainUtils from '../utils/domain-uitls';
import emailCryptoUtils from '../utils/email-crypto-utils';
import BizError from '../error/biz-error.js';
import { getMailDb } from '../utils/db-accessor.js';
import { authorizeTelegramRead, issueTelegramReadToken } from './telegram-share-service.js';
import { revokeTelegramLinks } from './privacy-revocation-service.js';
import { escapeHtml } from '../utils/safe-email-html.js';
import { t } from '../i18n/i18n.js';
import r2Service from './r2-service.js';
import fileUtils from '../utils/file-utils.js';
import rateLimit from '../utils/rate-limit.js';

const telegramService = {

	async getEmailContent(c, params) {
		const { token } = params;
		const access = await authorizeTelegramRead(c, token);
		if (!access) return null;
		let emailRow = access.message;
		if (emailRow.userId) {
			const cryptoKey = await emailCryptoUtils.getUserEmailCryptoKey(c.env, emailRow.userId);
			emailRow = await emailCryptoUtils.decryptEmailRecord(emailRow, cryptoKey);
		}
		const rows = await getMailDb(c).prepare(`
			SELECT att_id, key, filename, content_id FROM attachments
			WHERE email_id = ? AND user_id = ? AND account_id = ?
		`).bind(emailRow.emailId, emailRow.userId, emailRow.accountId).all();
		const urls = new Map();
		let downloads = '';
		for (const attachment of rows.results || []) {
			const url = `/api/telegram/attachment/${encodeURIComponent(token)}/${attachment.att_id}`;
			urls.set(`{{domain}}${attachment.key}`, url);
			urls.set(url, url);
			if (attachment.content_id) {
				urls.set('cid:' + attachment.content_id.replace(/^<|>$/g, ''), url);
			} else {
				downloads += `<li><a href="${url}">${escapeHtml(attachment.filename || 'Attachment')}</a></li>`;
			}
		}
		const body = emailRow.content || `<pre>${escapeHtml(emailRow.text || '')}</pre>`;
		return emailHtmlTemplate(body + (downloads ? `<hr><ul>${downloads}</ul>` : ''), '', '', urls);
	},

	async getAttachment(c, { token, attId }) {
		if (!/^\d+$/.test(String(attId)) || !Number.isSafeInteger(Number(attId)) || Number(attId) < 1) return null;
		const access = await authorizeTelegramRead(c, token);
		if (!access) return null;
		const message = access.message;
		const attachment = await getMailDb(c).prepare(`
			SELECT key, filename, content_id FROM attachments
			WHERE att_id = ? AND email_id = ? AND user_id = ? AND account_id = ?
		`).bind(Number(attId), message.emailId, message.userId, message.accountId).first();
		if (!attachment) return null;
		const response = await r2Service.toObjResponse(c, attachment.key, message.userId || null);
		if (!response) return null;
		const headers = new Headers(response.headers);
		headers.set('Cache-Control', 'private, no-store, max-age=0');
		headers.set('Referrer-Policy', 'no-referrer');
		headers.set('X-Content-Type-Options', 'nosniff');
		headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
		if (!attachment.content_id) {
			headers.set('Content-Disposition', fileUtils.encodeContentDisposition(attachment.filename || 'attachment', 'attachment'));
		}
		return new Response(response.body, { status: response.status, headers });
	},

	async revokeLinks(c, userId) {
		const data = await revokeTelegramLinks(c, userId);
		const raw = await c.env.kv.get('USER_PROFILE_' + userId);
		const profile = raw ? JSON.parse(raw) : {};
		// Old tokens already fail on the D1 version even if this KV write fails.
		profile.telegramShareVersion = data.version;
		await c.env.kv.put('USER_PROFILE_' + userId, JSON.stringify(profile));
		return data;
	},

	async sendEmailToBot(c, email) {

		const { tgBotToken, tgChatId, customDomain, tgMsgTo, tgMsgFrom, tgMsgText } = await settingService.query(c);

		const tgChatIds = String(tgChatId || '').split(',').map(value => value.trim()).filter(Boolean);

		const jwtToken = await issueTelegramReadToken(c, email.emailId, 'system');
		if (!jwtToken) return;

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

	async testPersonalBot(c, params, userId = null) {
		const { botToken, chatId, topicId } = params;
		if (!botToken || !chatId) {
			throw new BizError('Bot Token 和 Chat ID 不能为空');
		}
		if (typeof botToken !== 'string' || !/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(botToken.trim())) {
			throw new BizError('Bot Token 格式无效');
		}
		await rateLimit.check(c, {
			scope: 'telegram-test',
			limit: 10,
			windowSeconds: 900,
			subject: `user:${userId || 'anonymous'}`
		});

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
		if (!email?.userId || personalTgConfig?.enabled !== true) return;
		const profileKey = 'USER_PROFILE_' + email.userId;
		const raw = await c.env.kv.get(profileKey);
		const profile = raw ? JSON.parse(raw) : {};
		const current = profile.personalTelegram;
		if (current?.enabled !== true || !current.botToken || !current.chatId
			|| current.botToken !== personalTgConfig.botToken
			|| String(current.chatId) !== String(personalTgConfig.chatId)
			|| String(current.topicId || '') !== String(personalTgConfig.topicId || '')) return;
		const mode = current.mode;
		if (!['all', 'important', 'privacy'].includes(mode)) return;

		// ALWAYS verify owner/mailbox/message/settings/version, including when
		// preview is off. A token used for this gate need not leave the worker.
		const jwtToken = await issueTelegramReadToken(c, email.emailId, 'personal');
		if (!jwtToken) return;
		const access = await authorizeTelegramRead(c, jwtToken);
		if (!access || Number(access.message.userId) !== Number(email.userId)
			|| Number(profile.telegramShareVersion ?? 0) !== access.version) return;
		let message = access.message;
		if (mode !== 'privacy') {
			const key = await emailCryptoUtils.getUserEmailCryptoKey(c.env, message.userId);
			message = await emailCryptoUtils.decryptEmailRecord(message, key);
		}
		const code = typeof message.code === 'string' ? message.code.trim() : '';
		if (mode === 'important' && !code) {
			let labels = [];
			try { labels = JSON.parse(message.labels || '[]'); } catch (_) {}
			const labelled = Array.isArray(labels) && labels.some(label => label === '重要' || label === 'important');
			if (!labelled) {
				// The inbound row does not contain isStar. Check actual owner-scoped
				// persistence, never caller flags, subject keywords or fuzzy labels.
				const starred = await getMailDb(c).prepare(
					'SELECT 1 AS present FROM star WHERE user_id = ? AND email_id = ? LIMIT 1'
				).bind(message.userId, message.emailId).first();
				if (!starred) return;
			}
		}

		const lng = typeof profile.lang === 'string' ? profile.lang : undefined;
		const genericTitle = t('personalTelegramTitle', { lng });
		// No sender/recipient metadata is added to personal notifications.
		// Privacy mode is generic even if an old profile has both flags enabled.
		let text = `<b>${escapeHtml(mode === 'privacy' ? genericTitle : String(message.subject || genericTitle).slice(0, 200))}</b>`;
		const inlineKeyboard = [];
		if (current.includePreview === true && mode !== 'privacy') {
			const preview = emailUtils.formatText(message.text || '') || emailUtils.htmlToText(message.content || '');
			if (preview) text += `\n\n${escapeHtml(preview.slice(0, 400))}`;
			const { customDomain } = await settingService.query(c);
			if (customDomain) {
				inlineKeyboard.push([{ text: t('view', { lng }), web_app: {
					url: `${domainUtils.toOssDomain(customDomain)}/api/telegram/getEmail/${jwtToken}`
				} }]);
			}
		}
		// UI label means "attach code-copy", NOT "filter all mail to codes".
		// Only copy an already extracted code; this method invokes no AI/parser.
		if (current.notifyCodeOnly === true && mode !== 'privacy' && code && code.length <= 256) {
			inlineKeyboard.push([{ text: t('copyCode', { lng }), copy_text: { text: code } }]);
		}
		const body = {
			chat_id: current.chatId,
			parse_mode: 'HTML',
			text,
			link_preview_options: { is_disabled: true },
			...(inlineKeyboard.length ? { reply_markup: { inline_keyboard: inlineKeyboard } } : {})
		};
		const topic = Number(current.topicId);
		if (Number.isSafeInteger(topic) && topic > 0) body.message_thread_id = topic;

		// Do not send content built using a configuration that changed while we
		// assembled it. The final gate also catches a concurrent D1 revocation.
		if (await c.env.kv.get(profileKey) !== raw || !await authorizeTelegramRead(c, jwtToken)) return;
		try {
			const res = await fetch(`https://api.telegram.org/bot${current.botToken}/sendMessage`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
			});
			if (!res.ok) console.error(`Personal Telegram Bot send failed: status ${res.status}`);
		} catch (_) {
			console.error('Personal Telegram Bot send failed');
		}
	}
};

export default telegramService;
