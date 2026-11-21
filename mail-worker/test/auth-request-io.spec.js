import { getTableColumns } from 'drizzle-orm';
import account from '../src/entity/account.js';
import { env } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import userService from '../src/service/user-service.js';
import { persistSessionRecord } from '../src/utils/session-auth-store.js';
import worker from '../src/index.js';
import jwtUtils from '../src/utils/jwt-utils.js';
import { ensureSessionRevocationSchema, revokeSessionToken, withoutRevokedTokens } from '../src/utils/session-revocation.js';

it('reads current account and token revocation together per authenticated request', async () => {
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
		expect(reads.filter(sql => /LEFT JOIN user/i.test(sql))).toHaveLength(1);
		expect(reads.filter(sql => sql.startsWith('KV '))).toEqual(['KV ' + authKey]);
		expect(reads).toHaveLength(2);
		const expired = await jwtUtils.generateToken(c, { userId, token, authVersion: 0 }, -1);
		const invalid = await worker.fetch(new Request('https://example.test/api/my/geo',
			{ headers: { authorization: expired } }), measured);
		expect(invalid.status).toBe(401);
		expect(reads).toHaveLength(2);
		expect((await request(unavailable(/session_revocation/))).status).toBe(401);
		expect((await request(unavailable(/LEFT JOIN user/i))).status).toBe(500);

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

		// A normal issued session works with cold KV and reads its authority only once.
		await persistSessionRecord(c,userId,{...cached,user:{userId,type:3}},token);
		await env.kv.delete(authKey);
		reads.length = 0;
		expect((await request()).status).toBe(200);
		expect(reads).toHaveLength(1);
		expect((await request({...measured,kv:undefined})).status).toBe(401);
		await env.kv.put(authKey,JSON.stringify(cached));
		await env.db.prepare('UPDATE user_session SET max_session_epoch=unixepoch()-1 WHERE user_id=?').bind(userId).run();
		expect((await request()).status).toBe(401);
		await env.db.prepare('UPDATE user_session SET max_session_epoch=NULL WHERE user_id=?').bind(userId).run();

		reads.length = 0;
		await env.db.prepare('UPDATE user SET auth_version = 1 WHERE user_id = ?').bind(userId).run();
		expect((await request()).status).toBe(401);
		expect(reads.filter(sql => /LEFT JOIN user/i.test(sql))).toHaveLength(1);

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

it('enforces live role grants and account state on a physically split mailbox with a warm cache', async () => {
	const userDb = env.NOTICE_USER_DB;
	const mailDb = env.NOTICE_MAIL_DB;
	const uid = 905125;
	const token = 'split-role-fixture';
	const bindings = { ...env, USER_DB:userDb, MAIL_DB:mailDb };
	await ensureSessionRevocationSchema({ env:bindings });
	await userDb.batch([
		userDb.prepare('CREATE TABLE user(user_id INTEGER PRIMARY KEY,email TEXT,type INTEGER,is_del INTEGER,status INTEGER,auth_version INTEGER)'),
		userDb.prepare('CREATE TABLE role(role_id INTEGER PRIMARY KEY)'),
		userDb.prepare('CREATE TABLE role_perm(role_id INTEGER,perm_id INTEGER)'),
		userDb.prepare('CREATE TABLE perm(perm_id INTEGER PRIMARY KEY,perm_key TEXT,type INTEGER)'),
		userDb.prepare('INSERT INTO user VALUES(?, ?, 31, 0, 0, 0)').bind(uid,'split-role@example.test'),
		userDb.prepare('INSERT INTO role VALUES(31)'),
		userDb.prepare("INSERT INTO perm VALUES(3,'account:query',2)"),
		userDb.prepare('INSERT INTO role_perm VALUES(31,3)')
	]);
	const columns = Object.values(getTableColumns(account)).map(col => '"' + col.name + '" ' + col.getSQLType()).join(',');
	await mailDb.prepare('CREATE TABLE account(' + columns + ')').run();
	const key = 'auth-uid:' + uid;
	const cached = { user:{userId:uid,type:31},tokens:[token],sessionHorizons:{[token]:null},refreshTime:new Date().toISOString() };
	await env.kv.put(key,JSON.stringify(cached));
	const authorization = await jwtUtils.generateToken({env:bindings},{userId:uid,token,authVersion:0});
	const calls = [];
	const original = bindings.USER_DB;
	bindings.USER_DB = { prepare(sql) { calls.push(sql); return original.prepare(sql); }, batch: rows=>original.batch(rows) };
	const request = () => worker.fetch(new Request('https://example.test/api/account/list',{headers:{ authorization }}),bindings);
	expect((await request()).status).toBe(200);
	expect(calls).toHaveLength(1);
	await userDb.prepare('DELETE FROM role_perm').run();
	expect((await request()).status).toBe(403);
	await userDb.prepare('INSERT INTO role_perm VALUES(31,3)').run();
	expect((await request()).status).toBe(200);
	await userDb.prepare('DELETE FROM role').run();
	expect((await request()).status).toBe(403);
	await userDb.prepare('UPDATE user SET status=1 WHERE user_id=?').bind(uid).run();
	expect((await request()).status).toBe(403);
	await env.kv.put(key,JSON.stringify(cached));
	await userDb.prepare('UPDATE user SET status=0,is_del=1 WHERE user_id=?').bind(uid).run();
	expect((await request()).status).toBe(401);
});
