import { env } from 'cloudflare:test';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import telegramService from '../src/service/telegram-service.js';

const userId = 57101;
const accountId = 57102;
const emailId = 57103;
const emailAddress = 'tg-prefs@example.com';
const config = {
	enabled: true,
	botToken: 'unit-personal-token',
	chatId: '57104',
	topicId: '',
	mode: 'all',
	notifyCodeOnly: false,
	includePreview: false
};
const settings = {
	publicProfile: 1,
	userTgForward: 1,
	userByoStorage: 1,
	tgBotStatus: 0,
	tgBotToken: 'unit-system-token',
	tgChatId: '57105',
	allMailMode: 1,
	ruleType: 0,
	customDomain: 'https://mail.example.test'
};

const c = { env, get: () => undefined, set: () => {}, req: { header: () => '', raw: {} } };

async function setProfile(personalTelegram = config, extra = {}) {
	await env.kv.put(`USER_PROFILE_${userId}`, JSON.stringify({
		lang: 'en', telegramShareVersion: 0, personalTelegram, ...extra
	}));
	await env.kv.put('setting:', JSON.stringify(settings));
}

async function send({ personalTelegram = config, stored = {}, caller = {} } = {}) {
	await setProfile(personalTelegram);
	await env.db.prepare('UPDATE email SET subject=?, text=?, content=?, code=?, labels=? WHERE email_id=?')
		.bind(stored.subject ?? 'Private subject', stored.text ?? 'Private preview', stored.content ?? '<p>Private preview</p>',
			stored.code ?? '', stored.labels ?? '[]', emailId).run();
	const calls = [];
	const originalFetch = globalThis.fetch;
	vi.stubGlobal('fetch', async (url, options) => {
		calls.push({ url: String(url), body: JSON.parse(options.body) });
		return new Response('{}', { status: 200 });
	});
	try {
		await telegramService.sendPersonalEmailToBot(c, { emailId, userId, accountId, ...caller }, personalTelegram);
		return calls;
	} finally {
		vi.stubGlobal('fetch', originalFetch);
	}
}

beforeAll(async () => {
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS user (
		user_id INTEGER PRIMARY KEY, email TEXT NOT NULL, type INTEGER NOT NULL DEFAULT 2,
		password TEXT NOT NULL DEFAULT 'unit-password', salt TEXT NOT NULL DEFAULT 'unit-salt',
		status INTEGER NOT NULL DEFAULT 0, is_del INTEGER NOT NULL DEFAULT 0,
		auth_version INTEGER NOT NULL DEFAULT 0, telegram_share_version INTEGER NOT NULL DEFAULT 0,
		deletion_requested_at TEXT NOT NULL DEFAULT '', deletion_status TEXT NOT NULL DEFAULT ''
	)`).run();
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS account (
		account_id INTEGER PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', user_id INTEGER NOT NULL,
		status INTEGER NOT NULL DEFAULT 0, is_del INTEGER NOT NULL DEFAULT 0, all_receive INTEGER NOT NULL DEFAULT 0
	)`).run();
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS email (
		email_id INTEGER PRIMARY KEY, send_email TEXT, name TEXT, account_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
		subject TEXT, code TEXT NOT NULL DEFAULT '', text TEXT, content TEXT, to_email TEXT NOT NULL DEFAULT '',
		type INTEGER NOT NULL DEFAULT 0, status INTEGER NOT NULL DEFAULT 0, is_del INTEGER NOT NULL DEFAULT 0,
		is_spam INTEGER NOT NULL DEFAULT 0, labels TEXT NOT NULL DEFAULT '[]', create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		cc TEXT DEFAULT '[]', bcc TEXT DEFAULT '[]', recipient TEXT, to_name TEXT DEFAULT '',
		in_reply_to TEXT DEFAULT '', relation TEXT DEFAULT '', message_id TEXT DEFAULT '', resend_email_id TEXT,
		message TEXT, unread INTEGER NOT NULL DEFAULT 0, snoozed_time TEXT, snoozed_end_time TEXT,
		trashed_at TEXT, spam_at TEXT, receive_claim_key TEXT, outbound_task_id TEXT
	)`).run();
	await env.db.prepare('CREATE TABLE IF NOT EXISTS star (star_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, email_id INTEGER)').run();
	await env.db.prepare('INSERT INTO user (user_id,email) VALUES (?,?)').bind(userId, emailAddress).run();
	await env.db.prepare('INSERT INTO account (account_id,user_id,email,name) VALUES (?,?,?,?)').bind(accountId, userId, emailAddress, 'tg-prefs').run();
	await env.db.prepare(`INSERT INTO email (email_id,user_id,account_id,subject,text,content,to_email)
		VALUES (?,?,?,?,?,?,?)`).bind(emailId, userId, accountId, 'Private subject', 'Private preview', '<p>Private preview</p>', emailAddress).run();
});

afterEach(async () => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	for (const key of [`USER_PROFILE_${userId}`, 'setting:']) await env.kv.delete(key);
	await env.db.prepare('DELETE FROM star WHERE user_id=?').bind(userId).run();
	await env.db.prepare('UPDATE email SET subject="Private subject",text="Private preview",content="<p>Private preview</p>",code="",labels="[]",is_del=0 WHERE email_id=?').bind(emailId).run();
});

afterAll(async () => {
	for (const key of [`USER_PROFILE_${userId}`, 'setting:']) await env.kv.delete(key);
	await env.db.prepare('DELETE FROM star WHERE user_id=?').bind(userId).run();
	await env.db.prepare('DELETE FROM email WHERE user_id=?').bind(userId).run();
	await env.db.prepare('DELETE FROM account WHERE user_id=?').bind(userId).run();
	await env.db.prepare('DELETE FROM user WHERE user_id=?').bind(userId).run();
});

describe('personal Telegram notification preferences', () => {
	it('keeps mode=all minimal by default and never adds sender or recipient', async () => {
		const calls = await send({ caller: { sendEmail: 'secret@sender.example', name: 'Secret', toEmail: emailAddress } });
		expect(calls).toHaveLength(1);
		const payload = JSON.stringify(calls[0].body);
		expect(payload).toContain('Private subject');
		expect(payload).not.toContain('Private preview');
		expect(payload).not.toContain('secret@sender.example');
		expect(payload).not.toContain(emailAddress);
		expect(payload).not.toContain('/api/telegram/getEmail/');
	});

	it('adds preview and a state-bound link only when includePreview is explicitly true', async () => {
		const calls = await send({ personalTelegram: { ...config, includePreview: true } });
		expect(calls).toHaveLength(1);
		expect(calls[0].body.text).toContain('Private preview');
		expect(calls[0].body.reply_markup.inline_keyboard[0][0].web_app.url).toContain('/api/telegram/getEmail/');
	});

	it('adds only an existing code when explicitly selected without turning it into a filter', async () => {
		const withoutCopy = await send({ stored: { code: '246810' } });
		expect(withoutCopy).toHaveLength(1);
		expect(JSON.stringify(withoutCopy[0].body)).not.toContain('246810');
		const withCopy = await send({ personalTelegram: { ...config, notifyCodeOnly: true }, stored: { code: '246810' } });
		expect(withCopy).toHaveLength(1);
		expect(withCopy[0].body.reply_markup.inline_keyboard[0][0].copy_text.text).toBe('246810');
		const noCode = await send({ personalTelegram: { ...config, notifyCodeOnly: true } });
		expect(noCode).toHaveLength(1);
		expect(noCode[0].body.text).toContain('Private subject');
		expect(noCode[0].body.reply_markup).toBeUndefined();
	});

	it('uses important mode only for a real owner star, exact label, or existing code', async () => {
		expect(await send({ personalTelegram: { ...config, mode: 'important' } })).toHaveLength(0);
		expect(await send({ personalTelegram: { ...config, mode: 'important' }, stored: { labels: '["unimportant"]' }, caller: { isStar: true } })).toHaveLength(0);
		await env.db.prepare('INSERT INTO star (user_id,email_id) VALUES (?,?)').bind(userId, emailId).run();
		expect(await send({ personalTelegram: { ...config, mode: 'important' } })).toHaveLength(1);
		await env.db.prepare('DELETE FROM star WHERE user_id=?').bind(userId).run();
		expect(await send({ personalTelegram: { ...config, mode: 'important' }, stored: { labels: '["重要"]' } })).toHaveLength(1);
		expect(await send({ personalTelegram: { ...config, mode: 'important' }, stored: { labels: '[]', code: '246810' } })).toHaveLength(1);
	});

	it('uses a generic privacy title and suppresses subject, code, preview, and link', async () => {
		const calls = await send({ personalTelegram: { ...config, mode: 'privacy', includePreview: true, notifyCodeOnly: true }, stored: {
			subject: 'Sensitive subject', text: 'Sensitive preview', content: '<p>Sensitive preview</p>', code: '135790'
		} });
		expect(calls).toHaveLength(1);
		const payload = JSON.stringify(calls[0].body);
		expect(payload).not.toContain('Sensitive subject');
		expect(payload).not.toContain('Sensitive preview');
		expect(payload).not.toContain('135790');
		expect(payload).not.toContain('/api/telegram/getEmail/');
		expect(calls[0].body.text).toContain('Telegram');
	});

	it('does not notify after the account is disabled or the mail is soft-deleted', async () => {
		await env.db.prepare('UPDATE user SET status=1 WHERE user_id=?').bind(userId).run();
		expect(await send()).toHaveLength(0);
		await env.db.prepare('UPDATE user SET status=0 WHERE user_id=?').bind(userId).run();
		await env.db.prepare('UPDATE email SET is_del=1 WHERE email_id=?').bind(emailId).run();
		expect(await send()).toHaveLength(0);
	});
});
