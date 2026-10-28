import { env, SELF } from 'cloudflare:test';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { dbInit } from '../src/init/init.js';
import cryptoUtils from '../src/utils/crypto-utils.js';
import jwtUtils from '../src/utils/jwt-utils.js';
import settingService from '../src/service/setting-service.js';
import attService from '../src/service/att-service.js';
import emailHtmlTemplate from '../src/template/email-html.js';
import { ensureSettingExtSchema } from '../src/utils/setting-schema.js';
import { getUserDb } from '../src/utils/db-accessor.js';
import { FULL_SETTING_COLUMNS } from './fixtures/full-setting-schema.js';

vi.setConfig({ testTimeout: 60000 });

const BASE = 'http://example.com';
const R2_DOMAIN = 'https://cdn.b1b2.test';
const R2_HOST = 'cdn.b1b2.test';
const CUSTOM_DOMAIN = 'mail.b1b2.test';
const LEGACY_DOMAIN = 'cdn.legacy.test';
const THIRD_PARTY = 'https://images.thirdparty.test';
const THIRD_PARTY_HOST = 'images.thirdparty.test';

// 160x100 PNG; the browser acceptance run asserts a non-placeholder size.
const INLINE_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAABkCAIAAACO1KzYAAADG0lEQVR4nO3dW0hTcQDH8f9u52zL3DKipLUxYuZkWDicQiCFEpEP3eiiEFnUQ5cHJbBeyiDoAtIFRuutFxEsIiJ6ECOCKAyNQihKEKQGZlnYam3Oy4l1wFarCc08+fP3edr+5z/4w3fnPzY4ZzpnbacgXHqtF0D/FgODY2BwDAyOgcExMDgGBsfA4BgYHAODY2BwDAyOgcExMDgGBsfA4BgYHAODY2Bwxmxe3FO7ffpWQpkUt14Tf4VnMDgGBsfA4BgYHAODY2BwDAyOgcExMDgGBsfA4BgYHAODY2BwDAyOgcExMDgGBsfA4BgYHAODY2BwDAyOgcExMDgGBpfVpSvZOHF12LPUuGtdjvp08/F3p/baq44M+gskdWRDufXQpvlLtrzxF0iKEF9iypn9C1b7ZOeO8Os2hxBCPTQ5ubLEvOfc0MNgvl6XHFlT/zbUsNDrMom5TbPA60stV25/VgNH40r4/bjPLUkm3Z2zi1OnTY686B/d1zz0KJiffmhSkct088HXrRXW9q6YO9/Iulpu0WVFck9fYmw8+fj+s3hliTnzfK/LNPDh++w/a6yxNbd9mlDEheuRozW26VzurKVZYINelBbK3a9GhBDtXbHqckvm+feexiuKp3gTrFhm8rml+uBHxyJDoXOub84ab9HJXTpg6eiOlRfJXS9Hzh/ME0IkRpXqY4Pq0aY6e6BQVkfGxkVveLTz8o/9+ZfJFw/neRzJoo07c8sODDwO/TRzLtMycJXfHLoV2diXWLlcMhqSIxk+gy/diLTejTZsy00/lMrjMOVY9Wps0vhrkm2e3iLrWzqiU+7PQoi1q8xPehMzsi4oWp7B6i59umX4ZJ09fdcNeOWm3fbUU/N5f2JC0Wihs5Yum7/V4S0cZgxv4UC/x58qwTEwOAYGx8DgGBgcA4NjYHAMDI6BwTEwOAYGx8DgGBgcA4NjYHAMDI6BwTEwOAYGx8DgGBgcA4NjYHAMDC6rKxvo/8czGBwDg2NgcAwMjoHBMTA4BgbHwOAYGBwDg2NgcAwMjoHBMTA4BgbHwOAYGBwDC2zfABispXHQke0yAAAAAElFTkSuQmCC';

const ctx = { env, get: () => undefined, set: () => {} };

async function addColumn(table, definition) {
	try {
		await env.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run();
	} catch (_) {}
}

async function installTestSchema() {
	await dbInit.intDB(ctx);
	await dbInit.v1_1DB(ctx);
	await dbInit.v1_4DB(ctx);
	await dbInit.v1_5DB(ctx);

	for (const definition of [
		'reg_key_id INTEGER NOT NULL DEFAULT 0',
		'create_ip TEXT', 'active_ip TEXT', 'os TEXT', 'browser TEXT', 'device TEXT',
		'sort INTEGER NOT NULL DEFAULT 0', 'send_count INTEGER NOT NULL DEFAULT 0',
		'totp_enabled INTEGER NOT NULL DEFAULT 0', "totp_secret TEXT NOT NULL DEFAULT ''",
		'totp_key_version INTEGER NOT NULL DEFAULT 1', "totp_backup_codes TEXT NOT NULL DEFAULT '[]'",
		"totp_created_at TEXT NOT NULL DEFAULT ''", "security_keys TEXT NOT NULL DEFAULT '[]'",
		'storage_quota_mb INTEGER NOT NULL DEFAULT 0', 'byo_storage_enabled INTEGER NOT NULL DEFAULT 0',
		"byo_storage_config TEXT NOT NULL DEFAULT '{}'"
	]) {
		await addColumn('user', definition);
	}

	for (const definition of [
		"code TEXT NOT NULL DEFAULT ''", "cc TEXT NOT NULL DEFAULT '[]'", "bcc TEXT NOT NULL DEFAULT '[]'",
		"recipient TEXT NOT NULL DEFAULT '[]'", "to_email TEXT NOT NULL DEFAULT ''",
		"to_name TEXT NOT NULL DEFAULT ''", "in_reply_to TEXT NOT NULL DEFAULT ''",
		"relation TEXT NOT NULL DEFAULT ''", "message_id TEXT NOT NULL DEFAULT ''",
		'unread INTEGER NOT NULL DEFAULT 0', 'is_spam INTEGER NOT NULL DEFAULT 0',
		'snoozed_time DATETIME', 'snoozed_end_time DATETIME', "labels TEXT NOT NULL DEFAULT '[]'"
	]) {
		await addColumn('email', definition);
	}

	await addColumn('role', "ban_email TEXT NOT NULL DEFAULT ''");
	await addColumn('role', 'ban_email_type INTEGER NOT NULL DEFAULT 0');
	await addColumn('account', 'name TEXT');
	await addColumn('account', 'all_receive INTEGER NOT NULL DEFAULT 0');
	await addColumn('account', 'sort INTEGER NOT NULL DEFAULT 0');
	await addColumn('attachments', "status TEXT NOT NULL DEFAULT '0'");
	await addColumn('attachments', 'type INTEGER NOT NULL DEFAULT 0');

	await env.db.prepare('DROP TABLE IF EXISTS setting').run();
	await env.db.prepare(`CREATE TABLE setting (${FULL_SETTING_COLUMNS.join(', ')})`).run();
	await env.db.prepare('INSERT INTO setting (register, send, all_mail_mode, no_recipient) VALUES (0, 0, 1, 0)').run();
	await ensureSettingExtSchema(getUserDb(ctx));

	await env.db.prepare(`
		CREATE TABLE IF NOT EXISTS verify_record (
			vr_id INTEGER PRIMARY KEY AUTOINCREMENT,
			ip TEXT NOT NULL DEFAULT '',
			count INTEGER NOT NULL DEFAULT 1,
			type INTEGER NOT NULL DEFAULT 0,
			update_time DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`).run();

	await env.db.prepare(`
		CREATE TABLE IF NOT EXISTS oauth (
			oauth_id INTEGER PRIMARY KEY AUTOINCREMENT,
			oauth_user_id TEXT,
			username TEXT,
			name TEXT,
			avatar TEXT,
			active INTEGER,
			trust_level INTEGER,
			silenced INTEGER,
			create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
			platform INTEGER NOT NULL DEFAULT 0,
			user_id INTEGER NOT NULL DEFAULT 0
		)
	`).run();
}

async function permId(key) {
	const row = await env.db.prepare('SELECT perm_id FROM perm WHERE perm_key = ?').bind(key).first();
	if (!row) throw new Error(`missing perm ${key}`);
	return row.perm_id;
}

async function createRole(name, roleCode, permKeys = [], isDefault = 0) {
	const inserted = await env.db.prepare(
		`INSERT INTO role (name, key, role_code, is_default, send_type, storage_quota_mb, allow_attachment)
		 VALUES (?, ?, ?, ?, 'count', 50, 1)`
	).bind(name, roleCode, roleCode, isDefault).run();
	const roleId = inserted.meta.last_row_id;
	for (const key of permKeys) {
		await env.db.prepare('INSERT INTO role_perm (role_id, perm_id) VALUES (?, ?)')
			.bind(roleId, await permId(key)).run();
	}
	return roleId;
}

async function seedUser(email, roleId, password = 'ProbePass123!') {
	const { salt, hash } = await cryptoUtils.hashPassword(password, env);
	const inserted = await env.db.prepare(
		`INSERT INTO user (email, type, password, salt, status, is_del, reg_key_id, custom_labels)
		 VALUES (?, ?, ?, ?, 0, 0, 0, '[]')`
	).bind(email, roleId, hash, salt).run();
	const userId = inserted.meta.last_row_id;
	const account = await env.db.prepare(
		'INSERT INTO account (email, user_id, status, is_del) VALUES (?, ?, 0, 0)'
	).bind(email, userId).run();
	return { userId, accountId: account.meta.last_row_id, email, roleId, password };
}

async function session(user) {
	const tokenId = crypto.randomUUID();
	await env.kv.put(`auth-uid:${user.userId}`, JSON.stringify({
		tokens: [tokenId],
		user: { userId: user.userId, email: user.email, type: user.roleId, status: 0, isDel: 0 },
		refreshTime: new Date().toISOString()
	}), { expirationTtl: 3600 });
	return jwtUtils.generateToken({ env }, { userId: user.userId, token: tokenId, loginEmail: user.email }, 3600);
}

async function api(path, { method = 'GET', token, body } = {}) {
	const headers = {};
	if (token) headers.token = token;
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	return SELF.fetch(`${BASE}${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body)
	});
}

function base64Text(value) {
	let binary = '';
	for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function contentKeys(content) {
	const keys = new Set();
	for (const match of String(content || '').matchAll(/\{\{domain\}\}(attachments\/[A-Za-z0-9._-]+)/g)) keys.add(match[1]);
	return [...keys];
}

async function attachmentRows(emailId) {
	return env.db.prepare('SELECT * FROM attachments WHERE email_id = ? ORDER BY att_id')
		.bind(emailId).all().then(r => r.results || []);
}

async function sendInternal({ token, accountId, receiveEmail, content, attachments = [], sendType, emailId, subject }) {
	const response = await api('/api/email/send', {
		method: 'POST',
		token,
		body: {
			accountId,
			name: 'Probe',
			sendType,
			emailId,
			receiveEmail,
			subject: subject || `B1B2 probe ${crypto.randomUUID()}`,
			text: 'probe text',
			content,
			attachments
		}
	});
	return response.json();
}

async function latestReceiveEmail(toEmail) {
	return env.db.prepare(
		'SELECT * FROM email WHERE to_email = ? ORDER BY email_id DESC LIMIT 1'
	).bind(toEmail).first();
}

describe('acceptance B1/B2 fixes', () => {
	let masterRole;
	let normalRole;
	let adminUser;
	let sender;
	let recipient;
	let outsider;
	let adminToken;
	let senderToken;
	let recipientToken;
	let outsiderToken;

	beforeAll(async () => {
		await installTestSchema();
		const masterRow = await env.db.prepare(
			"SELECT role_id FROM role WHERE role_code = 'master' OR name = 'master' LIMIT 1"
		).first();
		masterRole = masterRow?.role_id || await createRole('b1b2-master', 'master');
		normalRole = await createRole('b1b2-normal', 'custom', ['email:send', 'email:delete']);
		adminUser = await seedUser('admin@example.com', masterRole);
		sender = await seedUser('b1b2-sender@example.com', normalRole);
		recipient = await seedUser('b1b2-recipient@example.com', normalRole);
		outsider = await seedUser('b1b2-outsider@example.com', normalRole);
		adminToken = await session(adminUser);
		senderToken = await session(sender);
		recipientToken = await session(recipient);
		outsiderToken = await session(outsider);

		await env.db.prepare("UPDATE setting SET r2_domain = ?, custom_domain = ? WHERE 1 = 1")
			.bind(R2_DOMAIN, CUSTOM_DOMAIN).run();
		await settingService.refresh(ctx);
	});

	afterAll(async () => {
		await env.db.prepare('DELETE FROM attachments').run();
		await env.db.prepare('DELETE FROM star').run();
		await env.db.prepare('DELETE FROM email').run();
		await env.db.prepare('DELETE FROM account').run();
		await env.db.prepare('DELETE FROM role_perm').run();
		await env.db.prepare('DELETE FROM role').run();
		await env.db.prepare('DELETE FROM user').run();
		await env.kv.delete('SETTING');
		for (const userId of [adminUser.userId, sender.userId, recipient.userId, outsider.userId]) {
			await env.kv.delete(`auth-uid:${userId}`);
		}
	});

	it('B1: delivers EMBED and ATT relations to the internal recipient and signs both for that recipient', async () => {
		const sent = await sendInternal({
			token: senderToken,
			accountId: sender.accountId,
			receiveEmail: [recipient.email],
			content: `<p>inline probe</p><img src="data:image/png;base64,${INLINE_PNG_B64}">`,
			attachments: [{ filename: 'b1b2-note.txt', type: 'text/plain', content: base64Text('b1b2-attachment-bytes') }]
		});
		expect(sent.code).toBe(200);

		const received = await latestReceiveEmail(recipient.email);
		expect(received).toBeTruthy();
		const recipientEmailId = received.email_id;

		const rows = await attachmentRows(recipientEmailId);
		const embed = rows.find(row => Number(row.type) === 1);
		const download = rows.find(row => Number(row.type) === 0);
		expect(embed).toBeTruthy();
		expect(download).toBeTruthy();
		expect(download.key.startsWith('attachments/')).toBe(true);
		// The delivered copies keep the physical object in the sender's storage
		// (including a BYO bucket) while the rows belong to the recipient.
		expect(embed.storage_user_id).toBe(sender.userId);
		expect(download.storage_user_id).toBe(sender.userId);

		const keys = [...new Set([embed.key, download.key])];
		const batch = await api('/api/oss-url/batch', { method: 'POST', token: recipientToken, body: { keys } });
		const urls = (await batch.json()).data.urls;
		expect(urls[embed.key]).toBeTruthy();
		expect(urls[download.key]).toBeTruthy();

		const inline = await SELF.fetch(`${BASE}${urls[embed.key]}`);
		expect(inline.status).toBe(200);
		expect(inline.headers.get('Content-Type')).toBe('image/png');
		expect(new Uint8Array(await inline.arrayBuffer()).length).toBeGreaterThan(100);

		const downloadRes = await SELF.fetch(`${BASE}${urls[download.key]}`);
		expect(downloadRes.status).toBe(200);
		expect(await downloadRes.text()).toBe('b1b2-attachment-bytes');

		// The content actually carries the placeholder the browser signs.
		const contentKeySet = contentKeys(received.content);
		expect(contentKeySet).toContain(embed.key);

		// A third mailbox that received nothing cannot mint capabilities.
		const outsiderBatch = await api('/api/oss-url/batch', {
			method: 'POST', token: outsiderToken, body: { keys }
		});
		const outsiderUrls = (await outsiderBatch.json()).data.urls;
		expect(outsiderUrls[embed.key]).toBeUndefined();
		expect(outsiderUrls[download.key]).toBeUndefined();
		expect((await SELF.fetch(`${BASE}/oss/${embed.key}`)).status).toBe(404);
	});

	it('B1: recipient can reply and forward with the delivered inline image re-embedded', async () => {
		const subject = `B1B2 reply ${crypto.randomUUID()}`;
		const sent = await sendInternal({
			token: senderToken,
			accountId: sender.accountId,
			receiveEmail: [recipient.email],
			subject,
			content: `<p>inline probe</p><img src="data:image/png;base64,${INLINE_PNG_B64}">`
		});
		expect(sent.code).toBe(200);

		const received = await env.db.prepare(
			'SELECT * FROM email WHERE to_email = ? AND subject = ? ORDER BY email_id DESC LIMIT 1'
		).bind(recipient.email, subject).first();
		const rows = await attachmentRows(received.email_id);
		const embed = rows.find(row => Number(row.type) === 1);
		expect(embed).toBeTruthy();

		const quoted = `<p>quoted</p><img src="{{domain}}${embed.key}">`;
		const reply = await sendInternal({
			token: recipientToken,
			accountId: recipient.accountId,
			receiveEmail: [sender.email],
			content: quoted,
			sendType: 'reply',
			emailId: received.email_id
		});
		expect(reply.code).toBe(200);

		const replyReceived = await latestReceiveEmail(sender.email);
		const replyRows = await attachmentRows(replyReceived.email_id);
		expect(replyRows.some(row => row.key === embed.key && Number(row.type) === 1)).toBe(true);

		const forward = await sendInternal({
			token: recipientToken,
			accountId: recipient.accountId,
			receiveEmail: [outsider.email],
			content: quoted
		});
		expect(forward.code).toBe(200);

		const forwarded = await latestReceiveEmail(outsider.email);
		const forwardRows = await attachmentRows(forwarded.email_id);
		expect(forwardRows.some(row => row.key === embed.key && Number(row.type) === 1)).toBe(true);

		const batch = await api('/api/oss-url/batch', {
			method: 'POST', token: outsiderToken, body: { keys: [embed.key] }
		});
		expect((await batch.json()).data.urls[embed.key]).toBeTruthy();
	});

	it('B1: forging another mailbox key inside an outgoing message creates no access relation', async () => {
		// Build a key that belongs to the administrator and was never delivered
		// to the attacker or to the recipient.
		const sourceSubject = `B1B2 admin source ${crypto.randomUUID()}`;
		const adminSend = await sendInternal({
			token: adminToken,
			accountId: adminUser.accountId,
			receiveEmail: [adminUser.email],
			subject: sourceSubject,
			content: `<p>admin inline</p><img src="data:image/png;base64,${INLINE_PNG_B64}">`
		});
		expect(adminSend.code).toBe(200);
		const adminEmailId = adminSend.data[0].emailId;
		const adminRows = await attachmentRows(adminEmailId);
		const foreignEmbed = adminRows.find(row => Number(row.type) === 1);
		expect(foreignEmbed).toBeTruthy();

		const forgeSubject = `B1B2 forged ${crypto.randomUUID()}`;
		const forged = await sendInternal({
			token: outsiderToken,
			accountId: outsider.accountId,
			receiveEmail: [recipient.email],
			subject: forgeSubject,
			content: `<p>forged</p><img src="{{domain}}${foreignEmbed.key}">`
		});
		expect(forged.code).toBe(200);

		const received = await env.db.prepare(
			'SELECT * FROM email WHERE to_email = ? AND subject = ? ORDER BY email_id DESC LIMIT 1'
		).bind(recipient.email, forgeSubject).first();
		const content = String(received.content || '');
		expect(content.includes(foreignEmbed.key)).toBe(false);

		const recipientForeignRows = await attachmentRows(received.email_id);
		expect(recipientForeignRows.some(row => row.key === foreignEmbed.key)).toBe(false);

		const batch = await api('/api/oss-url/batch', {
			method: 'POST', token: recipientToken, body: { keys: [foreignEmbed.key] }
		});
		expect((await batch.json()).data.urls[foreignEmbed.key]).toBeUndefined();
	});

	it('B1: deleting one mailbox keeps objects still referenced by another delivery', async () => {
		const subject = `B1B2 delete ${crypto.randomUUID()}`;
		const sent = await sendInternal({
			token: senderToken,
			accountId: sender.accountId,
			receiveEmail: [recipient.email],
			subject,
			content: '<p>delete probe</p>',
			attachments: [{ filename: 'b1b2-delete.txt', type: 'text/plain', content: base64Text('b1b2-delete-bytes') }]
		});
		expect(sent.code).toBe(200);
		const senderEmailId = sent.data[0].emailId;
		const received = await env.db.prepare(
			'SELECT * FROM email WHERE to_email = ? AND subject = ? ORDER BY email_id DESC LIMIT 1'
		).bind(recipient.email, subject).first();
		const rows = await attachmentRows(received.email_id);
		const download = rows.find(row => Number(row.type) === 0);
		expect(download).toBeTruthy();
		const objectBefore = await env.kv.get(download.key);
		expect(objectBefore).toBeTruthy();

		const recipientDelete = await api(`/api/email/delete?emailIds=${received.email_id}&physical=true`, {
			method: 'DELETE', token: recipientToken
		});
		expect((await recipientDelete.json()).code).toBe(200);
		expect(await attachmentRows(received.email_id)).toHaveLength(0);
		expect(await env.db.prepare('SELECT email_id FROM email WHERE email_id = ?').bind(received.email_id).first()).toBeNull();
		const stillThere = await env.kv.get(download.key);
		expect(stillThere).toBeTruthy();

		const senderDelete = await api(`/api/email/delete?emailIds=${senderEmailId}&physical=true`, {
			method: 'DELETE', token: senderToken
		});
		expect((await senderDelete.json()).code).toBe(200);
		expect(await attachmentRows(senderEmailId)).toHaveLength(0);

		// Explicit cleanup of the probe object. (Physical object deletion for a
		// fully unreferenced key is a pre-existing behaviour outside B1 scope.)
		await env.kv.delete(download.key);
		expect(await env.kv.get(download.key)).toBeNull();
	});

	it('B1: signing binds the physical storage owner, not the mailbox viewer', async () => {
		await env.kv.put('attachments/b1b2-owner.png', 'owner-bytes', {
			metadata: { contentType: 'image/png', contentDisposition: 'inline' }
		});
		try {
			await env.db.prepare(
				`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, status, type, storage_user_id)
				 VALUES (?, 0, 0, 'attachments/b1b2-owner.png', 'b1b2-owner.png', 'image/png', 11, 0, 1, ?)`
			).bind(recipient.userId, sender.userId).run();

			const batch = await api('/api/oss-url/batch', {
				method: 'POST', token: recipientToken, body: { keys: ['attachments/b1b2-owner.png'] }
			});
			const url = (await batch.json()).data.urls['attachments/b1b2-owner.png'];
			expect(url).toBeTruthy();
			const parsed = new URL(url, BASE);
			expect(parsed.searchParams.get('uid')).toBe(String(sender.userId));
			expect((await SELF.fetch(`${BASE}${url}`)).status).toBe(200);

			const getObj = vi.spyOn((await import('../src/service/r2-service.js')).default, 'getObj');
			const prepared = await attService.toImageUrlHtml(
				ctx, `<img src="{{domain}}attachments/b1b2-owner.png">`, recipient.userId
			);
			expect(prepared.imageDataList.some(item => item.key === 'attachments/b1b2-owner.png')).toBe(true);
			expect(getObj).toHaveBeenCalledWith(expect.anything(), 'attachments/b1b2-owner.png', sender.userId);
			getObj.mockRestore();
		} finally {
			await env.db.prepare("DELETE FROM attachments WHERE key = 'attachments/b1b2-owner.png'").run();
			await env.kv.delete('attachments/b1b2-owner.png');
		}
	});

	it('B2: Telegram share neutralizes unowned absolute URLs and signs only owned attachments', async () => {
		const ownedKey = 'attachments/b1b2-tg-owned.png';
		const unownedKey = 'attachments/b1b2-tg-unowned.png';
		await env.kv.put(ownedKey, 'owned-bytes', { metadata: { contentType: 'image/png', contentDisposition: 'inline' } });
		await env.kv.put(unownedKey, 'unowned-bytes', { metadata: { contentType: 'image/png', contentDisposition: 'inline' } });
		const content = [
			'<p>mixed</p>',
			`<img src="{{domain}}${ownedKey}">`,
			`<img src="{{domain}}${unownedKey}">`,
			`<img src="{{domain}}/${ownedKey}">`,
			`<img src="{{domain}}/${unownedKey}">`,
			`<img src="{{domain}}//${ownedKey}">`,
			`<img src="{{domain}}//${unownedKey}">`,
			`<img src="${R2_DOMAIN}/${ownedKey}">`,
			`<img src="${R2_DOMAIN}/${unownedKey}">`,
			`<img src="//${CUSTOM_DOMAIN}/${ownedKey}">`,
			`<img src="//${CUSTOM_DOMAIN}/${unownedKey}">`,
			`<img src="//${LEGACY_DOMAIN}/${ownedKey}">`,
			`<img src="//${LEGACY_DOMAIN}/${unownedKey}">`,
			`<img src="HTTPS://${R2_HOST}/${ownedKey}">`,
			`<img src="https://${R2_HOST}./${unownedKey}">`,
			`<img src="${THIRD_PARTY}/attachments/third-party.png">`,
			`<img src="//${THIRD_PARTY_HOST}/attachments/third-party-2.png">`,
			`<img src="${THIRD_PARTY}/${unownedKey}">`,
			`<img src="${THIRD_PARTY}/${ownedKey}">`,
			`<img src="/${ownedKey}">`,
			`<img src="/${unownedKey}">`,
			`<img src="${ownedKey}">`,
			`<img src="${unownedKey}">`,
			`<img src="https://${LEGACY_DOMAIN}/${unownedKey}">`,
			`<img src="https://${LEGACY_DOMAIN}/${ownedKey}">`,
			`<a href="${R2_DOMAIN}/${unownedKey}">download</a>`,
			`<a href="HTTPS://${R2_HOST}/${unownedKey}">download2</a>`
		].join('');
		const inserted = await env.db.prepare(
			`INSERT INTO email (send_email, account_id, user_id, subject, text, content, to_email, type, status)
			 VALUES ('b1b2-tg@example.com', ?, ?, 'B1B2 Telegram', 'telegram', ?, ?, 0, 0)`
		).bind(recipient.accountId, recipient.userId, content, recipient.email).run();
		const emailId = inserted.meta.last_row_id;
		try {
			await env.db.prepare(
				`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, status, type, content_id)
				 VALUES (?, ?, ?, ?, 'b1b2-tg-owned.png', 'image/png', 11, 0, 1, 'b1b2-tg')`
			).bind(recipient.userId, emailId, recipient.accountId, ownedKey).run();

			const shareToken = await jwtUtils.generateToken({ env }, { emailId }, 3600);
			const response = await SELF.fetch(`${BASE}/api/telegram/getEmail/${shareToken}`);
			expect(response.status).toBe(200);
			const html = await response.text();

			expect(html).toMatch(/\/oss\/attachments\/b1b2-tg-owned\.png\?[^"'\\\s]+/);
			expect(html).not.toContain(`${R2_DOMAIN}/${ownedKey}`);
			expect(html).not.toContain(`${R2_DOMAIN}/${unownedKey}`);
			expect(html).not.toContain(`//${CUSTOM_DOMAIN}/${ownedKey}`);
			expect(html).not.toContain(`//${CUSTOM_DOMAIN}/${unownedKey}`);
			expect(html).not.toContain(`//${LEGACY_DOMAIN}/${ownedKey}`);
			expect(html).not.toContain(`//${LEGACY_DOMAIN}/${unownedKey}`);
			expect(html).not.toContain(`HTTPS://${R2_HOST}/${ownedKey}`);
			expect(html).not.toContain(`https://${R2_HOST}./${unownedKey}`);
			expect(html).toContain(`/${unownedKey}`);
			expect(html).toContain(`${THIRD_PARTY}/attachments/third-party.png`);
			expect(html).toContain(`//${THIRD_PARTY_HOST}/attachments/third-party-2.png`);
			expect(html).toContain(`${THIRD_PARTY}/${unownedKey}`);
			// Third-party hosts are never signed, even when the key is owned.
			expect(html).toContain(`${THIRD_PARTY}/${ownedKey}`);
			expect(html).not.toContain(`${R2_DOMAIN}/attachments/`);
			expect(html).not.toContain(`${CUSTOM_DOMAIN}/attachments/`);
			expect(html).not.toContain(`https://${LEGACY_DOMAIN}/${unownedKey}`);
			// An owned key on an explicitly identified legacy object host is signed.
			expect(html).not.toContain(`https://${LEGACY_DOMAIN}/${ownedKey}`);

			const signedMatch = html.match(/\/oss\/attachments\/b1b2-tg-owned\.png\?[^"'\\\s]+/);
			expect((await SELF.fetch(`${BASE}${signedMatch[0].replace(/&amp;/g, '&')}`)).status).toBe(200);
		} finally {
			await env.db.prepare('DELETE FROM attachments WHERE email_id = ?').bind(emailId).run();
			await env.db.prepare('DELETE FROM email WHERE email_id = ?').bind(emailId).run();
			await env.kv.delete(ownedKey);
			await env.kv.delete(unownedKey);
		}
	});

	it('B2: current worker host and configured custom domain count as this site storage', async () => {
		const ownedKey = 'attachments/b1b2-tg-host.png';
		await env.kv.put(ownedKey, 'host-bytes', { metadata: { contentType: 'image/png', contentDisposition: 'inline' } });
		const inserted = await env.db.prepare(
			`INSERT INTO email (send_email, account_id, user_id, subject, text, content, to_email, type, status)
			 VALUES ('b1b2-tg@example.com', ?, ?, 'B1B2 Host', 'telegram', ?, ?, 0, 0)`
		).bind(recipient.accountId, recipient.userId,
			`<img src="${BASE}/${ownedKey}"><img src="https://${CUSTOM_DOMAIN}/${ownedKey}">`, recipient.email).run();
		const emailId = inserted.meta.last_row_id;
		try {
			await env.db.prepare(
				`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, status, type)
				 VALUES (?, ?, ?, ?, 'b1b2-tg-host.png', 'image/png', 10, 0, 1)`
			).bind(recipient.userId, emailId, recipient.accountId, ownedKey).run();

			const shareToken = await jwtUtils.generateToken({ env }, { emailId }, 3600);
			const html = await (await SELF.fetch(`${BASE}/api/telegram/getEmail/${shareToken}`)).text();
			expect(html).toMatch(/\/oss\/attachments\/b1b2-tg-host\.png\?[^"'\\\s]+/);
			expect(html).not.toContain(`${BASE}/${ownedKey}`);
			expect(html).not.toContain(`https://${CUSTOM_DOMAIN}/${ownedKey}`);
		} finally {
			await env.db.prepare('DELETE FROM attachments WHERE email_id = ?').bind(emailId).run();
			await env.db.prepare('DELETE FROM email WHERE email_id = ?').bind(emailId).run();
			await env.kv.delete(ownedKey);
		}
	});

	it('B2: template fallback never turns unsignable placeholders into public object URLs', () => {
		const html = emailHtmlTemplate(
			'<img src="{{domain}}//attachments/fallback-double.png"><img src="{{domain}}/attachments/fallback-slash.png"><img src="{{domain}}attachments/fallback-plain.png">',
			R2_DOMAIN
		);
		expect(html).not.toContain('{{domain}}');
		expect(html).not.toContain('cdn.b1b2.test');
		expect(html).toContain('/attachments/fallback-double.png');
		expect(html).toContain('/attachments/fallback-slash.png');
		expect(html).toContain('/attachments/fallback-plain.png');
	});

	it('B2: a signing failure neutralizes the URL instead of falling back to the public link', async () => {
		const ownedKey = 'attachments/b1b2-tg-fail.png';
		await env.kv.put(ownedKey, 'fail-bytes', { metadata: { contentType: 'image/png', contentDisposition: 'inline' } });
		try {
			await env.db.prepare(
				`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, status, type)
				 VALUES (?, 0, 0, ?, 'b1b2-tg-fail.png', 'image/png', 10, 0, 1)`
			).bind(recipient.userId, ownedKey).run();

			// Missing jwt_secret makes capability signing throw; the served HTML
			// must still not expose the original public attachment URL.
			const brokenCtx = { ...ctx, env: { ...env, jwt_secret: '' } };
			const html = await attService.signContentAttachmentUrls(
				brokenCtx, `<img src="${R2_DOMAIN}/${ownedKey}">`, recipient.userId, 60
			);
			expect(html).not.toContain(`${R2_DOMAIN}/${ownedKey}`);
			expect(html).toContain(`/${ownedKey}`);
		} finally {
			await env.db.prepare("DELETE FROM attachments WHERE key = ?").bind(ownedKey).run();
			await env.kv.delete(ownedKey);
		}
	});

	it('B1: mail delivered before this fix keeps its inline image inaccessible (no content-only grant)', async () => {
		const embedKey = 'attachments/b1b2-old-embed.png';
		const downloadKey = 'attachments/b1b2-old-download.txt';
		await env.kv.put(embedKey, 'old-embed-bytes', { metadata: { contentType: 'image/png', contentDisposition: 'inline' } });
		await env.kv.put(downloadKey, 'old-download-bytes', { metadata: { contentType: 'text/plain', contentDisposition: 'attachment' } });
		const inserted = await env.db.prepare(
			`INSERT INTO email (send_email, account_id, user_id, subject, text, content, to_email, type, status)
			 VALUES ('b1b2-sender@example.com', ?, ?, 'B1B2 legacy mail', 'legacy', ?, ?, 0, 0)`
		).bind(recipient.accountId, recipient.userId,
			`<img src="{{domain}}${embedKey}"><a href="{{domain}}${downloadKey}">dl</a>`, recipient.email).run();
		const emailId = inserted.meta.last_row_id;
		try {
			// Pre-B1 rows: only the downloadable ATT row was copied, and the
			// inline EMBED row exists solely for the sender.
			await env.db.prepare(
				`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, status, type)
				 VALUES (?, ?, ?, ?, 'old-download.txt', 'text/plain', 18, 0, 0)`
			).bind(recipient.userId, emailId, recipient.accountId, downloadKey).run();
			await env.db.prepare(
				`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, status, type)
				 VALUES (?, 0, 0, ?, 'old-embed.png', 'image/png', 15, 0, 1)`
			).bind(sender.userId, embedKey).run();

			const batch = await api('/api/oss-url/batch', {
				method: 'POST', token: recipientToken, body: { keys: [embedKey, downloadKey] }
			});
			const urls = (await batch.json()).data.urls;
			expect(urls[downloadKey]).toBeTruthy();
			expect(urls[embedKey]).toBeUndefined();

			const shareToken = await jwtUtils.generateToken({ env }, { emailId }, 3600);
			const html = await (await SELF.fetch(`${BASE}/api/telegram/getEmail/${shareToken}`)).text();
			expect(html).not.toContain(`/oss/${embedKey}`);
			expect(html).toContain(`/${embedKey}`);
			expect(html).toContain(`/oss/${downloadKey}?`);
		} finally {
			await env.db.prepare("DELETE FROM attachments WHERE key IN (?, ?)").bind(embedKey, downloadKey).run();
			await env.db.prepare('DELETE FROM email WHERE email_id = ?').bind(emailId).run();
			await env.kv.delete(embedKey);
			await env.kv.delete(downloadKey);
		}
	});

	it('B1: the storage owner migration upgrades a pre-B1 attachments table idempotently', async () => {
		// Rebuild the table in its pre-B1 shape (no storage_user_id) with an
		// existing delivered row, then let the real migration add the column.
		await env.db.prepare('DROP TABLE IF EXISTS attachments').run();
		await env.db.prepare(`
			CREATE TABLE attachments (
				att_id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				email_id INTEGER NOT NULL,
				account_id INTEGER NOT NULL,
				key TEXT NOT NULL,
				filename TEXT NOT NULL,
				mime_type TEXT NOT NULL,
				size INTEGER NOT NULL,
				status INTEGER NOT NULL DEFAULT 0,
				type INTEGER NOT NULL DEFAULT 0,
				content_id TEXT,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`).run();
		await env.db.prepare(
			`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, status, type)
			 VALUES (?, 0, 0, 'attachments/b1b2-legacy-row.txt', 'legacy.txt', 'text/plain', 4, 0, 0)`
		).bind(recipient.userId).run();

		await dbInit.v3_20DB(ctx);
		let columns = await env.db.prepare("SELECT name FROM pragma_table_info('attachments') WHERE name = 'storage_user_id'").all();
		expect((columns.results || []).length).toBe(1);
		const legacyRow = await env.db.prepare(
			"SELECT user_id, storage_user_id FROM attachments WHERE key = 'attachments/b1b2-legacy-row.txt'"
		).first();
		expect(legacyRow.user_id).toBe(recipient.userId);
		expect(legacyRow.storage_user_id).toBeNull();

		// Existing rows keep the pre-B1 behaviour: the row owner is the storage
		// owner until a trusted delivery record says otherwise.
		const rows = await attService.findAccessibleAttachmentRows(
			ctx, ['attachments/b1b2-legacy-row.txt'], recipient.userId
		);
		expect(rows.get('attachments/b1b2-legacy-row.txt').storageOwnerId).toBe(recipient.userId);

		await dbInit.v3_20DB(ctx);
		columns = await env.db.prepare("SELECT name FROM pragma_table_info('attachments') WHERE name = 'storage_user_id'").all();
		expect((columns.results || []).length).toBe(1);
		await env.db.prepare("DELETE FROM attachments WHERE key = 'attachments/b1b2-legacy-row.txt'").run();
	});
});
