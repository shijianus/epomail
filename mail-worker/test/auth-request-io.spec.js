import { env } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import userService from '../src/service/user-service.js';
import worker from '../src/index.js';
import jwtUtils from '../src/utils/jwt-utils.js';
import { ensureSessionRevocationSchema, revokeSessionToken, withoutRevokedTokens } from '../src/utils/session-revocation.js';

it('reads current account and token revocation once per authenticated request', async () => {
	const userId = 905124;
	const token = 'ordinary-session';
	const c = { env };
	await ensureSessionRevocationSchema(c);
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS user (
		user_id INTEGER PRIMARY KEY, email TEXT, type INTEGER, status INTEGER, is_del INTEGER, auth_version INTEGER
	)`).run();
	await env.db.prepare('INSERT INTO user (user_id,email,type,status,is_del,auth_version) VALUES (?, ?, 2, 0, 0, 0)')
		.bind(userId, 'auth-io@example.test').run();
	const authorization = await jwtUtils.generateToken(c, { userId, token, authVersion: 0 });
	const authKey = 'auth-uid:' + userId;
	await env.kv.put(authKey, JSON.stringify({
		user: { userId }, tokens: [token], sessionHorizons: { [token]: null }, refreshTime: new Date().toISOString()
	}));
	const reads = [];
	const measured = {
		...env,
		USER_DB: { prepare(sql) { reads.push(sql); return env.db.prepare(sql); } },
		kv: {
			get(...args) { reads.push('KV ' + args[0]); return env.kv.get(...args); },
			put: (...args) => env.kv.put(...args)
		}
	};
	const request = (bindings = measured) =>
		worker.fetch(new Request('https://example.test/api/my/geo', { headers: { authorization } }), bindings);
	const unavailable = (pattern) => ({
		...measured,
		USER_DB: { prepare(sql) {
			if (pattern.test(sql)) throw new Error('Test database unavailable');
			return measured.USER_DB.prepare(sql);
		} }
	});
	try {
		expect((await request()).status).toBe(200);
		expect(reads.filter(sql => sql.includes('session_revocation'))).toHaveLength(1);
		expect(reads.filter(sql => /FROM user WHERE/i.test(sql))).toHaveLength(1);
		expect(reads.filter(sql => sql.startsWith('KV '))).toEqual(['KV ' + authKey]);
		expect(reads).toHaveLength(3);
		expect((await request(unavailable(/session_revocation/))).status).toBe(401);
		expect((await request(unavailable(/FROM user WHERE/i))).status).toBe(500);

		reads.length = 0;
		await revokeSessionToken(c, userId, 'replaced-device');
		expect(await withoutRevokedTokens({ env: measured }, userId, ['first-device', 'replaced-device', token])).toEqual(['first-device', token]);
		expect(reads).toHaveLength(1);

		const cached = await env.kv.get(authKey, { type: 'json' });
		await env.kv.put(authKey, JSON.stringify({
			...cached, user: { userId, type: 3, nickname: 'daily reader' }, refreshTime: '2000-01-01T00:00:00Z'
		}));
		const refresh = vi.spyOn(userService, 'updateUserInfo').mockResolvedValue(undefined);
		try {
			expect((await request()).status).toBe(200);
			const [context] = refresh.mock.calls[0];
			expect(context.get('user')).toMatchObject({ userId, type: 2, nickname: 'daily reader' });
		} finally {
			refresh.mockRestore();
		}

		reads.length = 0;
		await env.db.prepare('UPDATE user SET auth_version = 1 WHERE user_id = ?').bind(userId).run();
		expect((await request()).status).toBe(401);
		expect(reads.filter(sql => /FROM user WHERE/i.test(sql))).toHaveLength(1);

		await revokeSessionToken(c, userId, token);
		reads.length = 0;
		expect((await request()).status).toBe(401);
		expect(reads).toHaveLength(1);
		expect(reads[0]).toContain('session_revocation');
	} finally {
		await env.db.prepare('DELETE FROM session_revocation WHERE user_id = ?').bind(userId).run();
		await env.db.prepare('DELETE FROM user WHERE user_id = ?').bind(userId).run();
		await env.kv.delete(authKey);
	}
});
