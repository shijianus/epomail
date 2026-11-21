import { env, SELF } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import jwtUtils from '../src/utils/jwt-utils.js';

const userId = 92501;
const authKey = `auth-uid:${userId}`;

beforeAll(async () => {
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS user (
		user_id INTEGER PRIMARY KEY, email TEXT NOT NULL, password TEXT NOT NULL DEFAULT 'dummy', salt TEXT NOT NULL DEFAULT 'dummy', type INTEGER NOT NULL DEFAULT 1,
		is_del INTEGER NOT NULL DEFAULT 0, status INTEGER NOT NULL DEFAULT 0,
		auth_version INTEGER NOT NULL DEFAULT 0
	)`).run();
});

afterEach(async () => {
	await env.kv.delete(authKey);
	await env.db.prepare('DELETE FROM user WHERE user_id = ?').bind(userId).run();
});

async function createSession({ deleted = 0, disabled = 0, exists = true } = {}) {
	if (exists) {
		await env.db.prepare('INSERT INTO user (user_id, email, password, salt, type, is_del, status) VALUES (?, ?, "dummy_pw", "dummy_salt", 1, ?, ?)')
			.bind(userId, 'session-privacy@example.com', deleted, disabled).run();
	}
	await env.kv.put(authKey, JSON.stringify({
		user: { userId, email: 'session-privacy@example.com', type: 1, isDel: 0, status: 0 },
		tokens: ['stale-but-signed-session'],
		refreshTime: new Date().toISOString()
	}));
	return jwtUtils.generateToken({ env }, { userId, token: 'stale-but-signed-session' }, 3600);
}

async function protectedRequest(token) {
	const response = await SELF.fetch('https://example.com/api/my/geo', {
		headers: { token, 'cf-ipcountry': 'TW' }
	});
	return response.json();
}

describe('authoritative account state for ordinary sessions', () => {
	it('continues to allow an active account', async () => {
		const token = await createSession();
		expect((await protectedRequest(token)).code).toBe(200);
	});

	it('rejects a soft-deleted account even while KV still claims it is active', async () => {
		const token = await createSession({ deleted: 1 });
		expect((await protectedRequest(token)).code).toBe(401);
	});

	it('rejects an account disabled after its session was cached', async () => {
		const token = await createSession({ disabled: 1 });
		expect((await protectedRequest(token)).code).toBe(403);
	});

	it('rejects a deleted database identity whose signed session remains cached', async () => {
		const token = await createSession({ exists: false });
		expect((await protectedRequest(token)).code).toBe(401);
	});

	it('checks account state again on the next request', async () => {
		const token = await createSession();
		expect((await protectedRequest(token)).code).toBe(200);
		await env.db.prepare('UPDATE user SET is_del = 1 WHERE user_id = ?').bind(userId).run();
		expect((await protectedRequest(token)).code).toBe(401);
	});
});
