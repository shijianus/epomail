import { env, SELF } from 'cloudflare:test';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { dbInit } from '../src/init/init.js';
import settingService from '../src/service/setting-service.js';
import { isAdminEmail, isAdminUser } from '../src/utils/admin-utils.js';
import cryptoUtils from '../src/utils/crypto-utils.js';
import jwtUtils from '../src/utils/jwt-utils.js';

vi.setConfig({ testTimeout: 60000 });

const BASE = 'http://example.com';

async function seedAuth(userId, email, type, sessionToken) {
	const token = await jwtUtils.generateToken({ env }, { userId, token: sessionToken }, 3600);
	await env.kv.put(`auth-uid:${userId}`, JSON.stringify({
		user: { userId, email, isDel: 0, status: 0, type },
		tokens: [sessionToken],
		refreshTime: new Date().toISOString()
	}), { expirationTtl: 3600 });
	return token;
}

async function prepareBaseSchema(ctx) {
	await dbInit.intDB(ctx);
	await dbInit.v1_1DB(ctx);
	await dbInit.v1_2DB(ctx);
	await dbInit.v1_3DB(ctx);
	await dbInit.v1_3_1DB(ctx);
	await dbInit.v1_4DB(ctx);
	await dbInit.v1_5DB(ctx);
	await dbInit.v1_6DB(ctx);
	await dbInit.v1_7DB(ctx);
}

async function resetTables() {
	for (const table of ['user', 'account', 'role', 'role_perm', 'attachments', 'setting_ext']) {
		try {
			await env.db.prepare(`DELETE FROM ${table}`).run();
		} catch (_) {}
	}
	try {
		await env.db.prepare(`DELETE FROM sqlite_sequence WHERE name IN ('user', 'account', 'role')`).run();
	} catch (_) {}
	for (const key of ['auth-uid:1', 'auth-uid:2', 'setting:', 'roles_seeded_v2', 'attachments/private-owner-2.txt']) {
		await env.kv.delete(key);
	}
}

describe('Module B: Fixed visitor account removal, userId=1 de-escalation, and idempotent bootstrap', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	afterAll(async () => {
		await resetTables();
	});

	it('admin-utils never grants super-admin privileges based on userId === 1 alone', () => {
		const c = { env: { admin: 'admin@example.com' } };

		expect(isAdminUser(c, { userId: 1, email: 'admin@epomail.cyou' })).toBe(false);
		expect(isAdminUser(c, { userId: 1, email: 'visitor@example.com' })).toBe(false);
		expect(isAdminUser(c, { userId: 1, email: '' })).toBe(false);
		expect(isAdminUser(c, { userId: 2, email: 'admin@example.com' })).toBe(true);
		expect(isAdminUser(c, { userId: 2, email: '  ADMIN@EXAMPLE.COM ' })).toBe(true);
		expect(isAdminEmail(c, 'admin@epomail.cyou')).toBe(false);
		expect(isAdminEmail(c, 'admin@example.com')).toBe(true);
	});

	it('cold-start POST /api/init fails closed in production when admin_initial_password is missing and seeds all 6 roles without visitor account', async () => {
		await resetTables();

		// Ensure production path even if local .dev.vars defines dev/admin_initial_password
		const prodCtx = {
			env: {
				...env,
				dev: undefined,
				DEV: undefined,
				admin: 'admin@example.com',
				admin_initial_password: ''
			},
			req: {
				method: 'POST',
				header: (name) => (name === 'X-Init-Secret' ? env.jwt_secret : ''),
				param: () => undefined,
				json: async () => ({})
			},
			get: () => undefined,
			set: () => {},
			text: (body, status = 200) => new Response(body, { status })
		};

		await expect(dbInit.init(prodCtx)).rejects.toThrow('admin_initial_password');

		// Six standard RBAC roles were seeded cleanly (including upgrading v1_1DB legacy 普通用户 -> user_base)
		const roleCount = await env.db.prepare(
			`SELECT count(*) AS cnt FROM role WHERE role_code IN ('visitor','user_base','user_lv0','user_lv1','moderator','master')`
		).first();
		expect(Number(roleCount?.cnt)).toBe(6);

		// Zero fixed visitor or passwordless admin rows exist
		const users = await env.db.prepare(`SELECT user_id, email FROM user`).all();
		expect(users.results || []).toEqual([]);
	});

	it('cold-start bootstrap with admin_initial_password creates site owner at user_id=1, refreshes >100-col setting in D1, never seeds admin@epomail.cyou, and stays idempotent', async () => {
		await resetTables();

		const initCtx = {
			env: {
				...env,
				dev: undefined,
				DEV: undefined,
				admin: 'admin@example.com',
				admin_initial_password: 'TestInitOwner#2026!Safe'
			},
			get: () => undefined,
			set: () => {}
		};

		await prepareBaseSchema(initCtx);
		await dbInit.v3_13DB(initCtx);
		await dbInit.v3_14DB(initCtx);

		const allUsers = (await env.db.prepare(`SELECT user_id, email, password, salt, type, is_del FROM user ORDER BY user_id ASC`).all()).results || [];
		expect(allUsers.length).toBe(1);
		expect(allUsers[0].user_id).toBe(1);
		expect(allUsers[0].email).toBe('admin@example.com');

		const visitorRow = await env.db.prepare(`SELECT user_id FROM user WHERE email = 'admin@epomail.cyou'`).first();
		expect(visitorRow).toBeNull();

		// Verify owner password works and is NOT '123456'
		expect(await cryptoUtils.verifyPassword('123456', allUsers[0].salt, allUsers[0].password)).toBe(false);
		expect(await cryptoUtils.verifyPassword('TestInitOwner#2026!Safe', allUsers[0].salt, allUsers[0].password)).toBe(true);

		// Repeat full POST /api/init WITHOUT admin_initial_password on an already-initialized install:
		// exercises full migration chain + settingService.refresh across >100 D1 setting columns
		const repeatRes = await SELF.fetch(`${BASE}/api/init`, {
			method: 'POST',
			headers: { 'X-Init-Secret': env.jwt_secret }
		});
		expect(repeatRes.status).toBe(200);
		expect(await repeatRes.text()).toBe('success');

		// Verify setting table stays safely below D1's hard 100-column limit and persists oauth + audit config
		const settingTableCols = (await env.db.prepare(`PRAGMA table_info('setting')`).all()).results || [];
		expect(settingTableCols.length).toBeLessThanOrEqual(100);

		await env.kv.delete('setting:');
		const queriedSetting = await settingService.query({ env, get: () => undefined, set: () => {} });
		expect(queriedSetting.title).toBe('EpoCanvas Mail');
		expect(queriedSetting.oauthLoginEnabled).toBe(0);
		expect(queriedSetting.auditLogEnabled).toBe(1);
		expect(queriedSetting.auditMaxIpPerAccount).toBe(3);

		await settingService.set({ env, get: () => undefined, set: () => {} }, {
			oauthLoginEnabled: 1,
			auditLogEnabled: 0,
			auditMaxIpPerAccount: 7
		});
		await env.kv.delete('setting:');
		const updatedSetting = await settingService.query({ env, get: () => undefined, set: () => {} });
		expect(updatedSetting.oauthLoginEnabled).toBe(1);
		expect(updatedSetting.auditLogEnabled).toBe(0);
		expect(updatedSetting.auditMaxIpPerAccount).toBe(7);

		// Restore defaults
		await settingService.set({ env, get: () => undefined, set: () => {} }, {
			oauthLoginEnabled: 0,
			auditLogEnabled: 1,
			auditMaxIpPerAccount: 3
		});

		const afterRepeat = (await env.db.prepare(`SELECT user_id, email, password FROM user ORDER BY user_id ASC`).all()).results || [];
		expect(afterRepeat.length).toBe(1);
		expect(afterRepeat[0].email).toBe('admin@example.com');
		expect(afterRepeat[0].password).toBe(allUsers[0].password);
	});

	it('isolates pre-existing installations where a legacy visitor occupies user_id=1 and site owner is user_id=2 without deleting or resurrecting accounts', async () => {
		await resetTables();

		const initCtx = { env: { ...env, dev: undefined, DEV: undefined }, get: () => undefined, set: () => {} };
		await prepareBaseSchema(initCtx);
		await dbInit.v3_13DB(initCtx);

		const visitorRole = await env.db.prepare(`SELECT role_id FROM role WHERE role_code = 'visitor' LIMIT 1`).first();
		const masterRole = await env.db.prepare(`SELECT role_id FROM role WHERE role_code = 'master' LIMIT 1`).first();
		expect(visitorRole?.role_id).toBeTruthy();
		expect(masterRole?.role_id).toBeTruthy();

		const rotatedCreds = await cryptoUtils.hashPassword('DisabledLegacy#2026!Rotated');
		const ownerCreds = await cryptoUtils.hashPassword('SiteOwner#2026!Authentic');

		// Reproduce legacy staging state: user_id = 1 is visitor, user_id = 2 is site owner
		await env.db.prepare(`
			INSERT INTO user (user_id, email, password, salt, type, status, is_del)
			VALUES (1, 'admin@epomail.cyou', ?, ?, ?, 0, 0)
		`).bind(rotatedCreds.hash, rotatedCreds.salt, visitorRole.role_id).run();
		await env.db.prepare(`
			INSERT INTO user (user_id, email, password, salt, type, status, is_del)
			VALUES (2, 'admin@example.com', ?, ?, ?, 0, 0)
		`).bind(ownerCreds.hash, ownerCreds.salt, masterRole.role_id).run();

		await env.db.prepare(`
			INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type)
			VALUES (2, 100, 200, 'attachments/private-owner-2.txt', 'private.txt', 12, 0)
		`).run();
		await env.kv.put('attachments/private-owner-2.txt', 'owner-2-secret');

		const legacyVisitorToken = await seedAuth(1, 'admin@epomail.cyou', visitorRole.role_id, 'sess-visitor-1');
		const realOwnerToken = await seedAuth(2, 'admin@example.com', masterRole.role_id, 'sess-owner-2');

		// 1. Legacy visitor at user_id=1 CANNOT access admin endpoints or sign another user's attachment
		const visitorUserList = await SELF.fetch(`${BASE}/api/user/list?num=1&size=10`, {
			headers: { Authorization: legacyVisitorToken }
		});
		const visitorUserListBody = await visitorUserList.json();
		expect(visitorUserListBody.code).toBe(403);

		const visitorBatchSign = await SELF.fetch(`${BASE}/api/oss-url/batch`, {
			method: 'POST',
			headers: { Authorization: legacyVisitorToken, 'Content-Type': 'application/json' },
			body: JSON.stringify({ keys: ['attachments/private-owner-2.txt'] })
		});
		const visitorBatchBody = await visitorBatchSign.json();
		expect(visitorBatchBody.data.urls['attachments/private-owner-2.txt']).toBeUndefined();

		// 2. Real site owner at user_id=2 retains full super-admin capabilities
		const ownerBatchSign = await SELF.fetch(`${BASE}/api/oss-url/batch`, {
			method: 'POST',
			headers: { Authorization: realOwnerToken, 'Content-Type': 'application/json' },
			body: JSON.stringify({ keys: ['attachments/private-owner-2.txt'] })
		});
		const ownerBatchBody = await ownerBatchSign.json();
		expect(ownerBatchBody.code).toBe(200);
		expect(ownerBatchBody.data.urls['attachments/private-owner-2.txt']).toBeTruthy();

		// 3. Operator disables legacy visitor (is_del=1, status=1); re-running /api/init must NOT resurrect or delete it
		await env.db.prepare(`UPDATE user SET is_del = 1, status = 1 WHERE user_id = 1`).run();
		const reinit = await SELF.fetch(`${BASE}/api/init`, {
			method: 'POST',
			headers: { 'X-Init-Secret': env.jwt_secret }
		});
		expect(reinit.status).toBe(200);

		const preservedVisitor = await env.db.prepare(`SELECT user_id, is_del, status, password FROM user WHERE user_id = 1`).first();
		expect(preservedVisitor.is_del).toBe(1);
		expect(preservedVisitor.status).toBe(1);
		expect(preservedVisitor.password).toBe(rotatedCreds.hash);
	});

	it('rejects weak passwords when DEMO_VISITOR_ENABLED=true is explicitly requested', async () => {
		await resetTables();
		const baseEnv = {
			...env,
			dev: undefined,
			DEV: undefined,
			admin: 'admin@example.com',
			admin_initial_password: 'TestInitOwner#2026!Safe',
			DEMO_VISITOR_ENABLED: 'true',
			DEMO_VISITOR_EMAIL: 'demo@example.com'
		};
		const ctxWeak = { env: { ...baseEnv, DEMO_VISITOR_PASSWORD: '123456' }, get: () => undefined, set: () => {} };
		await prepareBaseSchema(ctxWeak);
		await dbInit.v3_13DB(ctxWeak);
		await expect(dbInit.v3_14DB(ctxWeak)).rejects.toThrow('DEMO_VISITOR_PASSWORD');

		const ctxStrong = {
			env: { ...baseEnv, DEMO_VISITOR_PASSWORD: 'StrongDemoVisitor#2026!' },
			get: () => undefined,
			set: () => {}
		};
		await dbInit.v3_14DB(ctxStrong);
		const users = (await env.db.prepare(`SELECT user_id, email FROM user ORDER BY user_id ASC`).all()).results || [];
		expect(users.map(u => u.email)).toEqual(['admin@example.com', 'demo@example.com']);
		expect(users[0].user_id).toBe(1);
	});
});
