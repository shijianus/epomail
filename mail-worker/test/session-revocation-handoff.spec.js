import { env, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import jwtUtils from '../src/utils/jwt-utils.js';
import { ensureSessionRevocationSchema, isSessionRevoked } from '../src/utils/session-revocation.js';
import { persistSessionRecord, readAuthorizedSession, refreshSessionAuthInfo, removeSessionToken, removeSessionTokens } from '../src/utils/session-auth-store.js';
import { dbInit } from '../src/init/init.js';

const uid = 885100;
afterEach(async () => {
	await env.db.prepare('DELETE FROM session_revocation WHERE user_id=?').bind(uid).run();
	const exists = await env.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_session'").first();
	if (exists) await env.db.prepare('DELETE FROM user_session WHERE user_id=?').bind(uid).run();
});

function cache() {
	let value = { tokens: ['test-old-token', 'test-keep-token'], user: { userId: uid }, tokenMeta: { 'test-old-token': { method: 'oauth' } } };
	return { snapshot: () => structuredClone(value), kv: {
		get: async () => structuredClone(value), put: async (_key, raw) => { value = JSON.parse(raw); }, delete: async () => { value = null; }
	} };
}

describe('durable revocation over remote D1+KV hybrid sessions', () => {
	it('preserves remote D1 login fallback while a stale cache cannot authorize a logged-out token', async () => {
		const { kv, snapshot } = cache();
		const c = { env: { ...env, kv } };
		const stale = snapshot();
		await persistSessionRecord(c, uid, stale, 'test-old-token');
		await persistSessionRecord(c, uid, stale, 'test-keep-token');
		const oldJwt = await jwtUtils.generateToken(c, { userId: uid, token: 'test-old-token' });
		const keepJwt = await jwtUtils.generateToken(c, { userId: uid, token: 'test-keep-token' });
		await removeSessionToken(c, uid, 'test-old-token');
		await kv.put('ignored', JSON.stringify(stale));
		expect(await jwtUtils.verifyToken(c, oldJwt)).toBeNull();
		expect(await readAuthorizedSession(c, uid, 'test-old-token')).toBeNull();
		await refreshSessionAuthInfo(c, uid, stale);
		expect(snapshot().tokens).toEqual(['test-keep-token']);
		expect(snapshot().tokenMeta['test-old-token']).toBeUndefined();
		expect(await jwtUtils.verifyToken(c, keepJwt)).toMatchObject({ token: 'test-keep-token' });
		await kv.delete('ignored');
		expect((await readAuthorizedSession(c, uid, 'test-keep-token')).tokens).toContain('test-keep-token');
		expect(await persistSessionRecord(c, uid, stale, 'test-old-token')).toBeNull();
	});

	it('retains the signed JWT expiry and revocation despite cleanup failure, using the DB alias', async () => {
		const c = { env: { DB: env.db, jwt_secret: env.jwt_secret, kv: { get: async () => { throw new Error('test-cache-outage'); } } } };
		const expiry = Math.floor(Date.now() / 1000) + 60 * 86400;
		await expect(removeSessionToken(c, uid, 'test-long-token', { expiresAt: expiry })).resolves.toBeNull();
		expect(await isSessionRevoked(c, uid, 'test-long-token')).toBe(true);
		const row = await env.db.prepare('SELECT * FROM session_revocation WHERE user_id=?').bind(uid).first();
		expect(row.expires_at).toBeGreaterThanOrEqual(expiry);
		expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/);
		expect(JSON.stringify(row)).not.toContain('test-long-token');
	});

	it('does not recreate absent KV sessions or succeed when authoritative writes fail', async () => {
		const put = [];
		const c = { env: { ...env, kv: { get: async () => null, put: async raw => put.push(raw) } } };
		expect(await refreshSessionAuthInfo(c, uid, { tokens: ['test-old-token'] })).toBeNull();
		expect(put).toHaveLength(0);
		const bad = { env: { db: { prepare() { throw new Error('test-db-outage'); } }, kv: {} } };
		await expect(removeSessionToken(bad, uid, 'test-old-token')).rejects.toThrow('test-db-outage');
	});

	it('creates the new table idempotently without replacing the remote v3_26 hybrid schema', async () => {
		const c = { env: { ...env, USER_DB: env.NOTICE_USER_DB } };
		try {
			await dbInit.v3_26DB(c);
			await dbInit.v3_27DB(c);
			await dbInit.v3_27DB(c);
			await ensureSessionRevocationSchema(c);
			const rows = await env.NOTICE_USER_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user_session','session_revocation')").all();
			expect(rows.results.map(row => row.name).sort()).toEqual(['session_revocation', 'user_session']);
		} finally {
			await env.NOTICE_USER_DB.prepare('DROP TABLE IF EXISTS session_revocation').run();
			await env.NOTICE_USER_DB.prepare('DROP TABLE IF EXISTS user_session').run();
		}
	});

	it('rejects a logged-out token with 401 on real HTTP API even if stale KV is restored while keeping the second session active', async () => {
		const apiUid = 885101;
		const state = new Map();
		await dbInit.init({
			env: { ...env, admin_initial_password: 'test-bootstrap-password-only' },
			req: { method: 'POST', header: () => env.jwt_secret },
			get: key => state.get(key),
			set: (key, value) => state.set(key, value),
			text: text => text
		});
		const roleRow = await env.db.prepare('SELECT role_id FROM role ORDER BY role_id ASC LIMIT 1').first();
		const tokA = 'test-http-logout-tok-a';
		const tokB = 'test-http-logout-tok-b';
		const kvKey = `auth-uid:${apiUid}`;
		try {
			await env.db.prepare(
				"INSERT INTO user(user_id,email,type,password,salt,status,is_del,auth_version) VALUES (?,?,?,'test-unused','test-unused',0,0,0)"
			).bind(apiUid, 'http-revoke@example.test', roleRow.role_id).run();
			const baseSession = {
				tokens: [tokA],
				user: { userId: apiUid, email: 'http-revoke@example.test', type: roleRow.role_id, status: 0, isDel: 0, authVersion: 0 },
				refreshTime: new Date().toISOString()
			};
			await persistSessionRecord({ env }, apiUid, baseSession, tokA);
			await persistSessionRecord({ env }, apiUid, { ...baseSession, tokens: [tokB] }, tokB);
			const staleKv = await env.kv.get(kvKey);
			expect(JSON.parse(staleKv).tokens).toEqual(expect.arrayContaining([tokA, tokB]));

			const jwtA = await jwtUtils.generateToken({ env }, { userId: apiUid, token: tokA, authVersion: 0 });
			const jwtB = await jwtUtils.generateToken({ env }, { userId: apiUid, token: tokB, authVersion: 0 });

			const logoutRes = await SELF.fetch('https://example.test/api/logout', {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${jwtA}` }
			});
			expect((await logoutRes.json()).code).toBe(200);

			// Restore stale pre-logout KV snapshot containing both tokens.
			await env.kv.put(kvKey, staleKv);

			const revokedRes = await SELF.fetch('https://example.test/api/my/loginUserInfo', {
				headers: { Authorization: `Bearer ${jwtA}` }
			});
			expect((await revokedRes.json()).code).toBe(401);

			const keptRes = await SELF.fetch('https://example.test/api/my/loginUserInfo', {
				headers: { Authorization: `Bearer ${jwtB}` }
			});
			expect((await keptRes.json()).code).toBe(200);

			// Delete KV completely; session B still recovers from D1 user_session.
			await env.kv.delete(kvKey);
			const fallbackRes = await SELF.fetch('https://example.test/api/my/loginUserInfo', {
				headers: { Authorization: `Bearer ${jwtB}` }
			});
			expect((await fallbackRes.json()).code).toBe(200);
		} finally {
			await env.kv.delete(kvKey).catch(() => {});
			await env.db.prepare('DELETE FROM session_revocation WHERE user_id=?').bind(apiUid).run().catch(() => {});
			await env.db.prepare('DELETE FROM user_session WHERE user_id=?').bind(apiUid).run().catch(() => {});
			await env.db.prepare('DELETE FROM user WHERE user_id=?').bind(apiUid).run().catch(() => {});
		}
	});

	it('durably revokes removeSessionTokens drops and increments auth_version on userService.setType', async () => {
		const { kv, snapshot } = cache();
		const c = { env: { ...env, kv } };
		const stale = snapshot();
		await persistSessionRecord(c, uid, stale, 'test-old-token');
		await persistSessionRecord(c, uid, stale, 'test-keep-token');
		const oldJwt = await jwtUtils.generateToken(c, { userId: uid, token: 'test-old-token' });
		const dropped = await removeSessionTokens(c, uid, token => token === 'test-old-token');
		expect(dropped).toBe(1);
		await kv.put('ignored', JSON.stringify(stale));
		expect(await isSessionRevoked(c, uid, 'test-old-token')).toBe(true);
		expect(await jwtUtils.verifyToken(c, oldJwt)).toBeNull();
		expect(await readAuthorizedSession(c, uid, 'test-old-token')).toBeNull();
		expect(await readAuthorizedSession(c, uid, 'test-keep-token')).toBeTruthy();

		const roleUid = 885102;
		const kvKey = `auth-uid:${roleUid}`;
		const state = new Map();
		await dbInit.init({
			env: { ...env, admin_initial_password: 'test-bootstrap-password-only' },
			req: { method: 'POST', header: () => env.jwt_secret },
			get: key => state.get(key),
			set: (key, value) => state.set(key, value),
			text: text => text
		});
		const roles = await env.db.prepare('SELECT role_id FROM role ORDER BY role_id ASC LIMIT 2').all();
		const adminRow = await env.db.prepare("SELECT user_id, email, type, auth_version FROM user WHERE email=?").bind(String(env.admin || 'admin@example.com').trim().toLowerCase()).first();
		const adminTok = 'test-role-admin-tok';
		const adminKvKey = `auth-uid:${adminRow.user_id}`;
		try {
			await env.db.prepare(
				"INSERT INTO user(user_id,email,type,password,salt,status,is_del,auth_version) VALUES (?,?,?,'test-unused','test-unused',0,0,0)"
			).bind(roleUid, 'role-revoke@example.test', roles.results[0].role_id).run();
			const tok = 'test-role-change-tok';
			const sessionPayload = {
				tokens: [tok],
				user: { userId: roleUid, email: 'role-revoke@example.test', type: roles.results[0].role_id, status: 0, isDel: 0, authVersion: 0 },
				refreshTime: new Date().toISOString()
			};
			await persistSessionRecord({ env }, roleUid, sessionPayload, tok);
			await persistSessionRecord({ env }, adminRow.user_id, {
				tokens: [adminTok],
				user: { userId: adminRow.user_id, email: adminRow.email, type: adminRow.type, status: 0, isDel: 0, authVersion: adminRow.auth_version || 0 },
				refreshTime: new Date().toISOString()
			}, adminTok);
			const staleKv = await env.kv.get(kvKey);
			const jwt = await jwtUtils.generateToken({ env }, { userId: roleUid, token: tok, authVersion: 0 });
			const adminJwt = await jwtUtils.generateToken({ env }, { userId: adminRow.user_id, token: adminTok, authVersion: adminRow.auth_version || 0 });
			const setTypeRes = await SELF.fetch('https://example.test/api/user/setType', {
				method: 'PUT',
				headers: { Authorization: `Bearer ${adminJwt}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: roleUid, type: roles.results[1]?.role_id || roles.results[0].role_id })
			});
			expect((await setTypeRes.json()).code).toBe(200);
			// Restore stale KV even if kv.delete succeeded; auth_version bump must still block old JWT.
			await env.kv.put(kvKey, staleKv);
			const afterRoleChange = await SELF.fetch('https://example.test/api/my/loginUserInfo', {
				headers: { Authorization: `Bearer ${jwt}` }
			});
			expect((await afterRoleChange.json()).code).toBe(401);
		} finally {
			await env.kv.delete(kvKey).catch(() => {});
			await env.kv.delete(adminKvKey).catch(() => {});
			await env.db.prepare('DELETE FROM session_revocation WHERE user_id IN (?, ?)').bind(roleUid, adminRow.user_id).run().catch(() => {});
			await env.db.prepare('DELETE FROM user_session WHERE user_id IN (?, ?)').bind(roleUid, adminRow.user_id).run().catch(() => {});
			await env.db.prepare('DELETE FROM user WHERE user_id=?').bind(roleUid).run().catch(() => {});
		}
	});
});
