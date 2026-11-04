import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import jwtUtils from '../src/utils/jwt-utils.js';
import attService from '../src/service/att-service.js';
import settingService from '../src/service/setting-service.js';

const CREATE_ATTACHMENTS = `
CREATE TABLE IF NOT EXISTS attachments (
	att_id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	email_id INTEGER NOT NULL,
	account_id INTEGER NOT NULL,
	key TEXT NOT NULL,
	filename TEXT,
	mime_type TEXT,
	size INTEGER,
	status TEXT DEFAULT '0' NOT NULL,
	type INTEGER DEFAULT 0 NOT NULL,
	disposition TEXT,
	related TEXT,
	content_id TEXT,
	encoding TEXT,
	create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

const CREATE_USERS = `
CREATE TABLE IF NOT EXISTS user (
	user_id INTEGER PRIMARY KEY,
	email TEXT NOT NULL,
	type INTEGER NOT NULL DEFAULT 2,
	is_del INTEGER NOT NULL DEFAULT 0,
	status INTEGER NOT NULL DEFAULT 0,
	auth_version INTEGER NOT NULL DEFAULT 0,
	byo_storage_enabled INTEGER NOT NULL DEFAULT 0,
	byo_storage_config TEXT NOT NULL DEFAULT '{}'
)`;

async function seedUser(userId, email) {
	await env.db.prepare(`INSERT OR REPLACE INTO user (user_id, email, type, is_del, status)
		VALUES (?, ?, ?, 0, 0)`).bind(userId, email, userId === 1 ? 1 : 2).run();
}

async function seedAuth(userId, email, sessionToken) {
	await seedUser(userId, email);
	const token = await jwtUtils.generateToken({ env }, { userId, token: sessionToken, authVersion: 0 }, 3600);
	await env.kv.put(`auth-uid:${userId}`, JSON.stringify({
		user: { userId, email, isDel: 0, status: 0, authVersion: 0, type: userId === 1 ? 1 : 2 },
		tokens: [sessionToken],
		refreshTime: new Date().toISOString()
	}), { expirationTtl: 3600 });
	return token;
}

async function cleanup() {
	await env.db.prepare('DELETE FROM attachments').run();
	await env.db.prepare('DELETE FROM user WHERE user_id IN (1, 2, 3)').run();
	for (const key of ['auth-uid:1', 'auth-uid:2', 'auth-uid:3', 'attachments/owned-by-2.txt', 'attachments/owned-by-3.txt']) {
		await env.kv.delete(key);
	}
}

describe('Object ownership and capability signing', () => {
	beforeAll(async () => {
		await env.db.prepare(CREATE_ATTACHMENTS).run();
		await env.db.prepare(CREATE_USERS).run();
	});

	afterAll(async () => {
		await cleanup();
	});

	beforeEach(async () => {
		await cleanup();
		await seedUser(2, 'user2@example.com');
		await seedUser(3, 'user3@example.com');
		// Explicit settings fixture; keep real BYO lookup, ownership and KV reads.
		vi.spyOn(settingService, 'query').mockResolvedValue({
			userByoStorage: 1, r2Domain: '', bucket: '', endpoint: '', s3AccessKey: '', s3SecretKey: ''
		});
	});

	afterEach(async () => {
		try {
			await cleanup();
		} finally {
			vi.restoreAllMocks();
		}
	});

	it('only signs keys owned by the caller and never another user key', async () => {
		await env.db.prepare('INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(2, 10, 20, 'attachments/owned-by-2.txt', 'owned-by-2.txt', 10, 0).run();
		await env.db.prepare('INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(3, 11, 21, 'attachments/owned-by-3.txt', 'owned-by-3.txt', 10, 0).run();
		await env.kv.put('attachments/owned-by-2.txt', 'user-two-file');
		await env.kv.put('attachments/owned-by-3.txt', 'user-three-file');

		const user2Token = await seedAuth(2, 'user2@example.com', 'session-user-2');
		const response = await SELF.fetch('http://example.com/api/oss-url/batch', {
			method: 'POST',
			headers: { Authorization: user2Token, 'Content-Type': 'application/json' },
			body: JSON.stringify({ keys: ['attachments/owned-by-2.txt', 'attachments/owned-by-3.txt'] })
		});
		const body = await response.json();
		expect(body.code).toBe(200);
		expect(body.data.urls['attachments/owned-by-2.txt']).toBeTruthy();
		expect(body.data.urls['attachments/owned-by-3.txt']).toBeUndefined();

		const ownDownload = await SELF.fetch(`http://example.com/api${body.data.urls['attachments/owned-by-2.txt']}`);
		expect(ownDownload.status).toBe(200);
		expect(await ownDownload.text()).toBe('user-two-file');

		const crossRequest = await SELF.fetch('http://example.com/api/oss-url/attachments/owned-by-3.txt', {
			headers: { Authorization: user2Token }
		});
		const crossBody = await crossRequest.json();
		expect(crossBody.code).toBe(404);
	});

	it('allows an administrator to sign existing attachment keys for mailbox audit views', async () => {
		await env.db.prepare('INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(3, 11, 21, 'attachments/owned-by-3.txt', 'owned-by-3.txt', 10, 0).run();
		await env.kv.put('attachments/owned-by-3.txt', 'user-three-file');

		const adminToken = await seedAuth(1, 'admin@example.com', 'session-admin');
		const response = await SELF.fetch('http://example.com/api/oss-url/batch', {
			method: 'POST',
			headers: { Authorization: adminToken, 'Content-Type': 'application/json' },
			body: JSON.stringify({ keys: ['attachments/owned-by-3.txt'] })
		});
		const body = await response.json();
		expect(body.code).toBe(200);
		expect(body.data.urls['attachments/owned-by-3.txt']).toBeTruthy();

		const download = await SELF.fetch(`http://example.com/api${body.data.urls['attachments/owned-by-3.txt']}`);
		expect(download.status).toBe(200);
		expect(await download.text()).toBe('user-three-file');
	});

	it('rejects a signed attachment URL after the owner is banned or deleted', async () => {
		await env.db.prepare('INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(2, 10, 20, 'attachments/owned-by-2.txt', 'owned-by-2.txt', 10, 0).run();
		await env.kv.put('attachments/owned-by-2.txt', 'user-two-file');
		const token = await seedAuth(2, 'user2@example.com', 'session-user-2');
		const signed = await SELF.fetch('http://example.com/api/oss-url/batch', {
			method: 'POST',
			headers: { Authorization: token, 'Content-Type': 'application/json' },
			body: JSON.stringify({ keys: ['attachments/owned-by-2.txt'] })
		});
		const signedBody = await signed.json();
		const url = signedBody.data.urls['attachments/owned-by-2.txt'];
		expect(url).toBeTruthy();
		expect((await SELF.fetch(`http://example.com/api${url}`)).status).toBe(200);

		await env.db.prepare('UPDATE user SET status = 1 WHERE user_id = 2').run();
		expect((await SELF.fetch(`http://example.com/api${url}`)).status).toBe(404);

		await env.db.prepare('UPDATE user SET status = 0, is_del = 1 WHERE user_id = 2').run();
		expect((await SELF.fetch(`http://example.com/api${url}`)).status).toBe(404);
	});

	it('rejects anonymous batch signing', async () => {
		const response = await SELF.fetch('http://example.com/api/oss-url/batch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ keys: ['attachments/owned-by-2.txt'] })
		});
		const body = await response.json();
		expect(body.code).toBe(401);
	});

	it('never embeds another mailbox inline image while preparing a send', async () => {
		await env.db.prepare('INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(2, 10, 20, 'attachments/owned-by-2.txt', 'owned-by-2.txt', 13, 2).run();
		await env.db.prepare('INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(3, 11, 21, 'attachments/owned-by-3.txt', 'owned-by-3.txt', 15, 2).run();
		await env.kv.put('attachments/owned-by-2.txt', 'user-two-file');
		await env.kv.put('attachments/owned-by-3.txt', 'user-three-file');

		const foreign = await attService.toImageUrlHtml(
			{ env },
			'<img src="{{domain}}attachments/owned-by-3.txt">',
			2
		);
		expect(foreign.imageDataList.some(item => item.key === 'attachments/owned-by-3.txt')).toBe(false);

		const own = await attService.toImageUrlHtml(
			{ env },
			'<img src="{{domain}}attachments/owned-by-2.txt">',
			2
		);
		expect(own.imageDataList.some(item => item.key === 'attachments/owned-by-2.txt')).toBe(true);
	});
});
