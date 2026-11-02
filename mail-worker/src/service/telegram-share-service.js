import { mailOrm } from '../entity/orm.js';
import email from '../entity/email.js';
import { eq } from 'drizzle-orm';
import { getMailDb } from '../utils/db-accessor.js';
import jwtUtils from '../utils/jwt-utils.js';
import { isActiveUser, readPrivacyState } from './privacy-revocation-service.js';
import settingService from './setting-service.js';
import { emailConst } from '../const/entity-const.js';

const PURPOSE = 'telegram_read_v2';
const TTL = 7 * 24 * 3600;

function integer(value, min = 0) {
	return Number.isSafeInteger(value) && value >= min;
}

async function fingerprint(value) {
	const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
	return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function loadState(c, emailId, channel) {
	const message = await mailOrm(c).select().from(email).where(eq(email.emailId, emailId)).get();
	if (!message || Number(message.isDel) !== 0 || Number(message.status) === emailConst.status.SAVING) return null;
	const userId = Number(message.userId);
	const accountId = Number(message.accountId);
	if (!integer(userId) || !integer(accountId)) return null;
	let owner = null;
	if (userId > 0) {
		owner = await readPrivacyState(c, userId);
		if (!isActiveUser(owner) || accountId < 1) return null;
		const account = await getMailDb(c).prepare('SELECT user_id, is_del, status FROM account WHERE account_id = ?')
			.bind(accountId).first();
		if (!account || Number(account.user_id) !== userId || Number(account.is_del) !== 0 || Number(account.status) !== 0) return null;
	} else if (channel !== 'system' || accountId !== 0 || Number(message.status) !== emailConst.status.NOONE) {
		return null;
	}

	const settings = await settingService.query(c);
	let config;
	if (channel === 'personal') {
		if (!owner || Number(settings.userTgForward ?? 1) !== 1) return null;
		const raw = await c.env.kv.get('USER_PROFILE_' + userId);
		const profile = raw ? JSON.parse(raw) : {};
		const tg = profile.personalTelegram;
		// A settings update increments D1 before touching KV. Until that write
		// reaches this reader, the old profile cannot mint a new-version link.
		if (Number(profile.telegramShareVersion ?? 0) !== Number(owner.telegramShareVersion)) return null;
		if (tg?.enabled !== true || !tg.botToken || !tg.chatId) return null;
		config = [channel, tg.botToken, tg.chatId, tg.topicId || '', tg.mode || 'privacy',
			tg.notifyCodeOnly ?? true, tg.includePreview ?? true];
	} else if (channel === 'system') {
		const mode = Number(settings.allMailMode ?? 0);
		if (Number(settings.tgBotStatus) !== 0 || !settings.tgBotToken || !settings.tgChatId || mode === 2) return null;
		if (mode !== 1 && Number(message.isSpam) !== 1 && Number(message.status) !== emailConst.status.NOONE) return null;
		if (Number(settings.ruleType) === 1 && !String(settings.ruleEmail || '').split(',')
			.map(value => value.trim().toLowerCase()).includes(String(message.toEmail || '').toLowerCase())) return null;
		config = [channel, settings.tgBotToken, settings.tgChatId, mode, settings.ruleType, settings.ruleEmail || ''];
	} else {
		return null;
	}
	return { message, version: Number(owner?.telegramShareVersion ?? 0), binding: await fingerprint(config) };
}

export async function issueTelegramReadToken(c, emailId, channel) {
	const state = await loadState(c, emailId, channel);
	if (!state) return null;
	return jwtUtils.generateToken(c, {
		purpose: PURPOSE, channel,
		emailId: state.message.emailId,
		userId: Number(state.message.userId), accountId: Number(state.message.accountId),
		version: state.version, binding: state.binding
	}, TTL);
}

/** Signature verification alone is never sufficient to read mail or an attachment. */
export async function authorizeTelegramRead(c, token) {
	const payload = await jwtUtils.verifyToken(c, token);
	const now = Math.floor(Date.now() / 1000);
	if (!payload || payload.purpose !== PURPOSE || !integer(payload.emailId, 1)
		|| !integer(payload.userId) || !integer(payload.accountId) || !integer(payload.version)
		|| !integer(payload.exp, 1) || payload.exp <= now || !integer(payload.iat, 1)
		|| payload.iat > now + 60 || payload.exp - payload.iat > TTL) return null;
	const state = await loadState(c, payload.emailId, payload.channel);
	if (!state || Number(state.message.userId) !== payload.userId
		|| Number(state.message.accountId) !== payload.accountId || state.version !== payload.version
		|| state.binding !== payload.binding) return null;
	return { ...state, payload };
}
