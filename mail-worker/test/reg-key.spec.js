import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import regKeyService from '../src/service/reg-key-service.js';
import rbacGuard from '../src/service/rbac-guard-service.js';
import roleService from '../src/service/role-service.js';
import userService from '../src/service/user-service.js';
import loginService from '../src/service/login-service.js';
import permService from '../src/service/perm-service.js';

const CREATE_REG_KEY = `
CREATE TABLE IF NOT EXISTS reg_key (
	rege_key_id INTEGER PRIMARY KEY AUTOINCREMENT,
	code TEXT NOT NULL DEFAULT '',
	count INTEGER NOT NULL DEFAULT 0,
	role_id INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL DEFAULT 0,
	expire_time TEXT,
	create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

describe('Invite code atomic redemption', () => {
	beforeAll(async () => {
		await env.db.prepare(CREATE_REG_KEY).run();
	});

	afterAll(async () => {
		// Row-level cleanup only: dropping the table here could remove schema
		// another test file still relies on when files share a worker.
		await env.db.prepare('DELETE FROM reg_key').run();
	});

	it('allows exactly one concurrent redemption from a single-use code', async () => {
		await env.db.prepare('DELETE FROM reg_key').run();
		await env.db.prepare('INSERT INTO reg_key (code, count, role_id) VALUES (?, ?, ?)')
			.bind('ONE-USE-CODE', 1, 1).run();

		const results = await Promise.all([
			regKeyService.consumeOne({ env }, 'ONE-USE-CODE'),
			regKeyService.consumeOne({ env }, 'ONE-USE-CODE')
		]);
		expect(results.filter(Boolean)).toHaveLength(1);

		const row = await env.db.prepare('SELECT count FROM reg_key WHERE code = ?')
			.bind('ONE-USE-CODE').first();
		expect(row.count).toBe(0);
	});

	it('restores a reservation when registration aborts', async () => {
		await env.db.prepare('DELETE FROM reg_key').run();
		await env.db.prepare('INSERT INTO reg_key (code, count, role_id) VALUES (?, ?, ?)')
			.bind('RESTORE-CODE', 1, 1).run();

		expect(await regKeyService.consumeOne({ env }, 'RESTORE-CODE')).toBe(true);
		await regKeyService.restoreOne({ env }, 'RESTORE-CODE');
		const row = await env.db.prepare('SELECT count FROM reg_key WHERE code = ?')
			.bind('RESTORE-CODE').first();
		expect(row.count).toBe(1);
	});

	it('checks the unified role-assignment guard before creating an invite', async () => {
		const guard = vi.spyOn(rbacGuard, 'assertCanAssignRole')
			.mockRejectedValueOnce(new Error('role assignment denied'));
		await expect(regKeyService.add({ env }, {
			code: 'GUARDED-CODE',
			roleId: 99,
			count: 1,
			expireTime: '2030-01-01'
		}, 7)).rejects.toThrow('role assignment denied');
		expect(guard).toHaveBeenCalledWith({ env }, 7, 99);
		guard.mockRestore();
	});

	it('rejects master invites whose creator is not the site owner', async () => {
		const role = vi.spyOn(roleService, 'selectById').mockResolvedValue({ roleCode: 'master', key: 'master' });
		const perms = vi.spyOn(permService, 'rolePermKeys').mockResolvedValue([]);
		const creator = vi.spyOn(userService, 'selectByIdIncludeDel').mockResolvedValue({
			userId: 2,
			email: 'operator@example.com'
		});
		const c = { env: { admin: 'admin@example.com' } };

		expect(await loginService.assertInviteRoleBoundary(c, { roleId: 1, userId: 2 })).toBe(false);
		creator.mockResolvedValue({ userId: 1, email: 'admin@example.com' });
		expect(await loginService.assertInviteRoleBoundary(c, { roleId: 1, userId: 1 })).toBe(true);
		role.mockResolvedValue({ roleCode: 'user_base', key: 'user_base' });
		expect(await loginService.assertInviteRoleBoundary(c, { roleId: 2, userId: 2 })).toBe(true);

		// A legacy code for a non-master role that carries privileged permissions
		// (e.g. moderator before the creation guard) must also require the owner.
		role.mockResolvedValue({ roleCode: 'moderator', key: 'moderator' });
		perms.mockResolvedValue(['user:set-pwd']);
		creator.mockResolvedValue({ userId: 2, email: 'operator@example.com' });
		expect(await loginService.assertInviteRoleBoundary(c, { roleId: 3, userId: 2 })).toBe(false);
		creator.mockResolvedValue({ userId: 1, email: 'admin@example.com' });
		expect(await loginService.assertInviteRoleBoundary(c, { roleId: 3, userId: 1 })).toBe(true);

		role.mockRestore();
		perms.mockRestore();
		creator.mockRestore();
	});

	it('prevents visitor role from using regKeyService.list code filter as a blind prefix oracle', async () => {
		await env.db.prepare('DELETE FROM reg_key').run();
		await env.db.prepare('INSERT INTO reg_key (code, count, role_id, expire_time) VALUES (?, ?, ?, ?)')
			.bind('SECRET-ALPHA-01', 1, 1, '2030-01-01').run();
		await env.db.prepare('INSERT INTO reg_key (code, count, role_id, expire_time) VALUES (?, ?, ?, ?)')
			.bind('OTHER-BETA-02', 1, 1, '2030-01-01').run();

		const roleSelectSpy = vi.spyOn(roleService, 'roleSelectUse').mockResolvedValue([{ roleId: 1, name: '普通用户' }]);
		const visitorSpy = vi.spyOn(regKeyService, 'isCallerVisitor').mockResolvedValue(true);

		const visitorRows = await regKeyService.list({ env }, { code: 'SECRET-A' }, 999);
		expect(visitorRows).toHaveLength(2);
		expect(visitorRows.every(row => row.code === '••••••••••••••••' && row.isMasked === true)).toBe(true);

		visitorSpy.mockResolvedValue(false);
		const adminRows = await regKeyService.list({ env }, { code: 'SECRET-A' }, 1);
		expect(adminRows).toHaveLength(1);
		expect(adminRows[0].code).toBe('SECRET-ALPHA-01');

		roleSelectSpy.mockRestore();
		visitorSpy.mockRestore();
	});
});
