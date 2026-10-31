import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
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

async function seedAuth(userId, email, sessionToken) {
	const token = await jwtUtils.generateToken({ env }, { userId, token: sessionToken }, 3600);
	await env.kv.put(`auth-uid:${userId}`, JSON.stringify({
		user: { userId, email, isDel: 0, status: 0, type: userId === 1 ? 1 : 2 },
		tokens: [sessionToken],
		refreshTime: new Date().toISOString()
	}), { expirationTtl: 3600 });
	return token;
}

async function cleanup() {
	await env.db.prepare('DELETE FROM attachments').run();
	for (const key of ['auth-uid:1', 'auth-uid:2', 'auth-uid:3', 'attachments/owned-by-2.txt', 'attachments/owned-by-3.txt']) {
		await env.kv.delete(key);
	}
}

describe('Object ownership and capability signing', () => {
	beforeAll(async () => {
		await env.db.prepare(CREATE_ATTACHMENTS).run();
	});

	afterAll(async () => {
		await cleanup();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('only signs keys owned by the caller and never another user key', async () => {
		await cleanup();
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
		await cleanup();
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
		await cleanup();
		await env.db.prepare('INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(2, 10, 20, 'attachments/owned-by-2.txt', 'owned-by-2.txt', 13, 2).run();
		await env.db.prepare('INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(3, 11, 21, 'attachments/owned-by-3.txt', 'owned-by-3.txt', 15, 2).run();
		await env.kv.put('attachments/owned-by-2.txt', 'user-two-file');
		await env.kv.put('attachments/owned-by-3.txt', 'user-three-file');
		vi.spyOn(settingService, 'query').mockResolvedValue({ r2Domain: '' });

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
