import BizError from '../error/biz-error';
import { isAdminUser } from '../utils/admin-utils';
import permService from './perm-service';

/**
 * Permissions that must never be delegated by a non-site-owner, even if the
 * caller happens to hold them. Without this list a moderator could grant
 * themselves (or a puppet account) the ability to reset passwords or rewrite
 * roles, turning a scoped role into a site-wide administrator.
 */
export const PRIVILEGED_PERMS = new Set([
	'user:set-pwd',
	'user:set-status',
	'user:set-type',
	'user:delete',
	'role:add',
	'role:set',
	'role:delete',
	'setting:set',
	'all-email:delete'
]);

async function loadCaller(c, callerUserId) {
	const { default: userService } = await import('./user-service.js');
	const caller = await userService.selectById(c, callerUserId);
	if (!caller) throw new BizError('操作者账号不存在', 403);
	return caller;
}

function assertSubset(requestedKeys, callerKeys, message) {
	const missing = requestedKeys.filter(key => !callerKeys.has(key));
	if (missing.length > 0) {
		throw new BizError(`${message}（越权权限: ${missing.join(', ')}）`, 403);
	}
	if (requestedKeys.some(key => PRIVILEGED_PERMS.has(key))) {
		throw new BizError(`${message}（高危权限仅站长可分配）`, 403);
	}
}

const rbacGuard = {
	PRIVILEGED_PERMS,

	async assertAdmin(c, callerUserId) {
		const caller = await loadCaller(c, callerUserId);
		if (!isAdminUser(c, caller)) {
			throw new BizError('仅站长可执行该操作', 403);
		}
		return caller;
	},

	/**
	 * A non-admin may only manage a user whose role is a strict subset of the
	 * caller's own permissions, and that role must not contain privileged
	 * permissions (which would allow lateral account takeover).
	 */
	async assertCanManageUser(c, callerUserId, targetUserId) {
		const caller = await loadCaller(c, callerUserId);
		if (isAdminUser(c, caller)) return caller;

		const { default: userService } = await import('./user-service.js');
		const target = await userService.selectByIdIncludeDel(c, targetUserId);
		if (!target) throw new BizError('目标用户不存在', 404);
		if (isAdminUser(c, target)) {
			throw new BizError('无权操作站长账号', 403);
		}

		const callerKeys = new Set(await permService.userPermKeys(c, caller.userId));
		const targetKeys = await permService.rolePermKeys(c, target.type);
		assertSubset(targetKeys, callerKeys, '无权管理该用户');
		return caller;
	},

	async assertCanAssignRole(c, callerUserId, roleId) {
		const caller = await loadCaller(c, callerUserId);
		if (isAdminUser(c, caller)) return caller;

		const { default: roleService } = await import('./role-service.js');
		const role = await roleService.selectById(c, roleId);
		if (!role) throw new BizError('角色不存在', 404);
		if (role.roleCode === 'master' || role.key === 'master') {
			throw new BizError('仅站长本人可分配站长角色', 403);
		}

		const callerKeys = new Set(await permService.userPermKeys(c, caller.userId));
		const roleKeys = await permService.rolePermKeys(c, role.roleId);
		assertSubset(roleKeys, callerKeys, '无权分配该角色');
		return caller;
	},

	async assertCanGrantPermIds(c, callerUserId, permIds) {
		const caller = await loadCaller(c, callerUserId);
		if (isAdminUser(c, caller)) return caller;

		const callerKeys = new Set(await permService.userPermKeys(c, caller.userId));
		const requestedKeys = await permService.permKeysByPermIds(c, permIds);
		assertSubset(requestedKeys, callerKeys, '无权授予该权限');
		return caller;
	}
};

export default rbacGuard;
