import role from '../entity/role';
import orm from '../entity/orm';
import { eq, asc, inArray, and } from 'drizzle-orm';
import BizError from '../error/biz-error';
import rolePerm from '../entity/role-perm';
import perm from '../entity/perm';
import { permConst, roleConst } from '../const/entity-const';
import userService from './user-service';
import user from '../entity/user';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n.js';
import emailUtils from '../utils/email-utils';
import { getUserDb } from '../utils/db-accessor';

const roleService = {

	async ensureStandardRoles(c) {
		const userDb = getUserDb(c);
		try {
			const cols = [
				{ name: 'storage_quota_mb', sql: 'ALTER TABLE role ADD COLUMN storage_quota_mb INTEGER DEFAULT 5;' },
				{ name: 'allow_attachment', sql: 'ALTER TABLE role ADD COLUMN allow_attachment INTEGER DEFAULT 0;' },
				{ name: 'role_code', sql: 'ALTER TABLE role ADD COLUMN role_code TEXT DEFAULT "custom";' },
				{ name: 'tag_text', sql: 'ALTER TABLE role ADD COLUMN tag_text TEXT DEFAULT "";' },
				{ name: 'tag_color', sql: 'ALTER TABLE role ADD COLUMN tag_color TEXT DEFAULT "";' },
				{ name: 'ai_models', sql: 'ALTER TABLE role ADD COLUMN ai_models TEXT DEFAULT "";' }
			];
			for (const col of cols) {
				const colInfo = await userDb.prepare(`SELECT * FROM pragma_table_info('role') WHERE name = ? LIMIT 1`).bind(col.name).first();
				if (!colInfo) {
					await userDb.prepare(col.sql).run();
				}
			}

			// Check if roles have been initialized once
			const roleCount = await userDb.prepare(`SELECT count(*) as cnt FROM role`).first();
			const hasRoles = roleCount && Number(roleCount.cnt) > 0;

			let hasSeeded = false;
			try {
				const flag = await c?.env?.kv?.get('roles_seeded_v2');
				hasSeeded = flag === '1';
			} catch (_) {}

			if (hasRoles || hasSeeded) {
				// 已经存在角色：绝不复活已被站长删除的空选项（如 user_lv0/user_lv1），绝不覆盖站长已自订的权限与属性
				// 仅确保站长 (master) 角色及管理员账户绑定
				if (c?.env?.admin) {
					const masterRole = await userDb.prepare(`SELECT role_id FROM role WHERE role_code = 'master' OR name = '站长' LIMIT 1`).first();
					if (masterRole) {
						await userDb.prepare(`UPDATE user SET type = ? WHERE email = ? AND type != ?`).bind(masterRole.role_id, c.env.admin, masterRole.role_id).run();
					}
				}
				return;
			}
		} catch (e) {
			// continue with creation/update
		}
		try {

			const standardRoles = [
				{
					roleCode: 'visitor',
					name: '参观者',
					key: 'visitor',
					sort: 1,
					isDefault: 1,
					sendType: 'ban',
					sendCount: 0,
					accountCount: 0,
					storageQuotaMb: 0,
					allowAttachment: 0,
					tagText: '开源体验',
					tagColor: '#6366f1',
					description: '开源体验与巡检用户，全功能UI交互沙箱，无持久化写入权限，配额0MB',
					permKeys: ['setting:query', 'role:query', 'analysis:query', 'reg-key:query']
				},
				{
					roleCode: 'user_base',
					name: '普通用户',
					key: 'user_base',
					sort: 2,
					isDefault: 0,
					sendType: 'day',
					sendCount: 5,
					accountCount: 1,
					storageQuotaMb: 5,
					allowAttachment: 0,
					tagText: '基础成员',
					tagColor: '#64748b',
					description: '默认注册用户，具备基础使用权限，纯文本收发(无附件)，每日5封上限',
					permKeys: ['email:send', 'email:delete', 'account:query', 'account:add', 'account:delete', 'my:delete']
				},
				{
					roleCode: 'user_lv0',
					name: '普通用户 LV.0',
					key: 'user_lv0',
					sort: 3,
					isDefault: 0,
					sendType: 'day',
					sendCount: 8,
					accountCount: 2,
					storageQuotaMb: 10,
					allowAttachment: 0,
					tagText: '认证书友',
					tagColor: '#10b981',
					description: '已注册/绑定 blog.epomail.com 博客用户，配额提升至10MB，每日8封发信权',
					permKeys: ['email:send', 'email:delete', 'account:query', 'account:add', 'account:delete', 'my:delete']
				},
				{
					roleCode: 'user_lv1',
					name: '普通用户 LV.1',
					key: 'user_lv1',
					sort: 4,
					isDefault: 0,
					sendType: 'day',
					sendCount: 10,
					accountCount: 3,
					storageQuotaMb: 25,
					allowAttachment: 1,
					tagText: '活跃学者',
					tagColor: '#06b6d4',
					description: '参与博客讨论与活跃互动的进阶用户，配额25MB，每日10封，开放附件发送权限',
					permKeys: ['email:send', 'email:delete', 'account:query', 'account:add', 'account:delete', 'my:delete']
				},
				{
					roleCode: 'moderator',
					name: '协管者/管理员',
					key: 'moderator',
					sort: 5,
					isDefault: 0,
					sendType: 'day',
					sendCount: 100,
					accountCount: 10,
					storageQuotaMb: 500,
					allowAttachment: 1,
					tagText: '协同管理',
					tagColor: '#f59e0b',
					description: '非站长管理员，具备细分管控权限，无权修改自身权限与站长权限',
					permKeys: [
						'email:send', 'email:delete', 'account:query', 'account:add', 'account:delete', 'my:delete',
						'user:query', 'user:add', 'user:reset-send', 'user:set-pwd', 'user:set-status', 'user:set-type',
						'all-email:query', 'setting:query', 'role:query', 'analysis:query'
					]
				},
				{
					roleCode: 'master',
					name: '站长',
					key: 'master',
					sort: 6,
					isDefault: 0,
					sendType: 'count',
					sendCount: 0,
					accountCount: 0,
					storageQuotaMb: 1024,
					allowAttachment: 1,
					tagText: '最高统领',
					tagColor: '#ef4444',
					description: '全站最高权力拥有者，全功能不受限',
					permKeys: ['*']
				}
			];

			for (const defRole of standardRoles) {
				const existing = await userDb.prepare(`SELECT * FROM role WHERE role_code = ? OR name = ? LIMIT 1`).bind(defRole.roleCode, defRole.name).first();
				if (!existing) {
					const insRes = await userDb.prepare(`
						INSERT INTO role (
							name, key, description, ban_email, ban_email_type, avail_domain,
							sort, is_default, send_count, send_type, account_count,
							storage_quota_mb, allow_attachment, role_code, tag_text, tag_color
						) VALUES (?, ?, ?, '', 0, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					`).bind(
						defRole.name, defRole.key, defRole.description,
						defRole.sort, defRole.isDefault, defRole.sendCount, defRole.sendType, defRole.accountCount,
						defRole.storageQuotaMb, defRole.allowAttachment, defRole.roleCode,
						defRole.tagText, defRole.tagColor
					).run();

					const roleId = insRes.meta?.last_row_id;
					if (roleId) {
						await this.assignPermsInternal(userDb, roleId, defRole.permKeys);
					}
				}
			}

			try {
				if (c?.env?.kv) {
					await c.env.kv.put('roles_seeded_v2', '1');
				}
			} catch (_) {}

			if (c?.env?.admin) {
				const masterRole = await userDb.prepare(`SELECT role_id FROM role WHERE role_code = 'master' OR name = '站长' LIMIT 1`).first();
				if (masterRole) {
					await userDb.prepare(`UPDATE user SET type = ? WHERE email = ? AND type != ?`).bind(masterRole.role_id, c.env.admin, masterRole.role_id).run();
				}
			}
		} catch (e) {
			console.warn('ensureStandardRoles warning:', e.message);
		}
	},

	async assignPermsInternal(userDb, roleId, permKeys) {
		if (!permKeys || permKeys.length === 0) return;
		try {
			if (permKeys.includes('*')) {
				await userDb.prepare(`
					INSERT OR IGNORE INTO role_perm (role_id, perm_id)
					SELECT ?, perm_id FROM perm
				`).bind(roleId).run();
				return;
			}
			const placeholders = permKeys.map(() => '?').join(',');
			await userDb.prepare(`
				INSERT OR IGNORE INTO role_perm (role_id, perm_id)
				SELECT DISTINCT ?, perm_id FROM perm WHERE perm_key IN (${placeholders})
				UNION
				SELECT DISTINCT ?, pid FROM perm WHERE perm_key IN (${placeholders}) AND pid > 0
			`).bind(roleId, ...permKeys, roleId, ...permKeys).run();
		} catch (e) {
			console.warn('assignPermsInternal warning:', e.message);
		}
	},

	async add(c, params, userId) {
		let { name, permIds = [], banEmail = [], availDomain = [], storageQuotaMb = 5, allowAttachment = 0, roleCode = 'custom', tagText = '', tagColor = '', aiModels = [] } = params;

		if (!name) {
			throw new BizError(t('emptyRoleName'));
		}

		let roleRow = await orm(c).select().from(role).where(eq(role.name, name)).get();
		if (roleRow) {
			throw new BizError(t('roleNameExist'));
		}

		const notEmailIndex = banEmail.findIndex(item => (!verifyUtils.isEmail(item) && !verifyUtils.isDomain(item)) && item !== "*");
		if (notEmailIndex > -1) {
			throw new BizError(t('notEmail'));
		}

		banEmail = banEmail.join(',');
		availDomain = availDomain.join(',');
		const aiModelsStr = Array.isArray(aiModels) ? aiModels.join(',') : (typeof aiModels === 'string' ? aiModels : '');

		roleRow = await orm(c).insert(role).values({
			...params,
			banEmail,
			availDomain,
			userId,
			storageQuotaMb: Number(storageQuotaMb || 0),
			allowAttachment: Number(allowAttachment || 0),
			roleCode: roleCode || 'custom',
			tagText: tagText || '',
			tagColor: tagColor || '',
			aiModels: aiModelsStr
		}).returning().get();

		if (permIds.length === 0) {
			return;
		}

		const rolePermList = permIds.map(permId => ({ permId, roleId: roleRow.roleId }));
		await orm(c).insert(rolePerm).values(rolePermList).run();
	},

	async roleList(c) {
		await this.ensureStandardRoles(c);

		const roleList = await orm(c).select().from(role).orderBy(asc(role.sort)).all();
		const permList = await orm(c).select({ permId: perm.permId, roleId: rolePerm.roleId }).from(rolePerm)
			.leftJoin(perm, eq(perm.permId, rolePerm.permId))
			.where(eq(perm.type, permConst.type.BUTTON)).all();

		roleList.forEach(r => {
			r.banEmail = (r.banEmail || "").split(",").filter(item => item !== "");
			r.availDomain = (r.availDomain || "").split(",").filter(item => item !== "");
			r.aiModels = (r.aiModels || "").split(",").filter(item => item !== "");
			r.permIds = permList.filter(p => p.roleId === r.roleId).map(p => p.permId);
			r.storageQuotaMb = r.storageQuotaMb !== null && r.storageQuotaMb !== undefined ? Number(r.storageQuotaMb) : 5;
			r.allowAttachment = r.allowAttachment !== null && r.allowAttachment !== undefined ? Number(r.allowAttachment) : 0;
			r.roleCode = r.roleCode || (r.key || 'custom');
			r.tagText = r.tagText || '';
			r.tagColor = r.tagColor || '';
		});

		return roleList;
	},

	async setRole(c, params, callerUserId) {
		let { name, permIds = [], roleId, banEmail = [], availDomain = [], storageQuotaMb = 5, allowAttachment = 0, roleCode = 'custom', tagText = '', tagColor = '', aiModels = [] } = params;

		if (!name) {
			throw new BizError(t('emptyRoleName'));
		}

		delete params.isDefault;

		if (callerUserId) {
			const caller = await userService.selectById(c, callerUserId);
			if (caller) {
				if (caller.email !== c.env.admin) {
					if (caller.type === Number(roleId)) {
						throw new BizError('协管者/管理员无权修改自身所在分组的权限配置！', 403);
					}
					const targetRole = await this.selectById(c, roleId);
					if (targetRole?.roleCode === 'master') {
						throw new BizError('无权修改站长分组权限！', 403);
					}
				}
			}
		}

		const notEmailIndex = banEmail.findIndex(item => (!verifyUtils.isEmail(item) && !verifyUtils.isDomain(item)) && item !== "*");
		if (notEmailIndex > -1) {
			throw new BizError(t('notEmail'));
		}

		banEmail = banEmail.join(',');
		availDomain = availDomain.join(',');
		const aiModelsStr = Array.isArray(aiModels) ? aiModels.join(',') : (typeof aiModels === 'string' ? aiModels : '');

		await orm(c).update(role).set({
			...params,
			banEmail,
			availDomain,
			storageQuotaMb: Number(storageQuotaMb || 0),
			allowAttachment: Number(allowAttachment || 0),
			roleCode: roleCode || 'custom',
			tagText: tagText || '',
			tagColor: tagColor || '',
			aiModels: aiModelsStr
		}).where(eq(role.roleId, roleId)).run();

		const targetRole = await this.selectById(c, roleId);
		if (targetRole?.roleCode === 'visitor' || targetRole?.key === 'visitor' || targetRole?.name === '参观者') {
			// 参观者严格禁止查看"用户列表" (user:query)
			const userDb = getUserDb(c);
			const userQueryPerm = await userDb.prepare(`SELECT perm_id FROM perm WHERE perm_key = 'user:query' LIMIT 1`).first();
			if (userQueryPerm && permIds.includes(userQueryPerm.perm_id)) {
				permIds = permIds.filter(id => id !== userQueryPerm.perm_id);
			}
		}

		await orm(c).delete(rolePerm).where(eq(rolePerm.roleId, roleId)).run();

		if (permIds.length > 0) {
			const rolePermList = permIds.map(permId => ({ permId, roleId: roleId }));
			await orm(c).insert(rolePerm).values(rolePermList).run();
		}
	},

	async delete(c, params, callerUserId) {
		const { roleId } = params;

		const roleRow = await orm(c).select().from(role).where(eq(role.roleId, roleId)).get();
		if (!roleRow) {
			throw new BizError(t('notExist'));
		}

		if (roleRow.isDefault) {
			throw new BizError(t('delDefRole'));
		}

		if (roleRow.roleCode === 'master' || roleRow.roleCode === 'visitor') {
			throw new BizError('系统核心基础分组（站长/参观者）不可删除！', 403);
		}

		if (callerUserId) {
			const caller = await userService.selectById(c, callerUserId);
			if (caller) {
				if (caller.email !== c.env.admin && caller.type === Number(roleId)) {
					throw new BizError('协管者/管理员无权删除自身所在分组！', 403);
				}
			}
		}

		const defRoleRow = await orm(c).select().from(role).where(eq(role.isDefault, roleConst.isDefault.OPEN)).get();
		await userService.updateAllUserType(c, defRoleRow.roleId, roleId);

		await orm(c).delete(rolePerm).where(eq(rolePerm.roleId, roleId)).run();
		await orm(c).delete(role).where(eq(role.roleId, roleId)).run();
	},

	roleSelectUse(c) {
		return orm(c).select({ name: role.name, roleId: role.roleId, isDefault: role.isDefault }).from(role).orderBy(asc(role.sort)).all();
	},

	async selectDefaultRole(c) {
		return await orm(c).select().from(role).where(eq(role.isDefault, roleConst.isDefault.OPEN)).get();
	},

	async setDefault(c, params) {
		const roleRow = await orm(c).select().from(role).where(eq(role.roleId, params.roleId)).get();
		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}
		await orm(c).update(role).set({ isDefault: 0 }).run();
		await orm(c).update(role).set({ isDefault: 1 }).where(eq(role.roleId, params.roleId)).run();
	},

	selectById(c, roleId) {
		return orm(c).select().from(role).where(eq(role.roleId, roleId)).get();
	},

	selectByIdsHasPermKey(c, types, permKey) {
		if (!types || types.length === 0) {
			return [];
		}
		return orm(c).select({ roleId: role.roleId, sendType: role.sendType, sendCount: role.sendCount }).from(perm)
			.leftJoin(rolePerm, eq(perm.permId, rolePerm.permId))
			.leftJoin(role, eq(role.roleId, rolePerm.roleId))
			.where(and(eq(perm.permKey, permKey), inArray(role.roleId, types))).all();
	},

	selectByIdsAndSendType(c, permKey, sendType) {
		return orm(c).select({ roleId: role.roleId }).from(perm)
			.leftJoin(rolePerm, eq(perm.permId, rolePerm.permId))
			.leftJoin(role, eq(role.roleId, rolePerm.roleId))
			.where(and(eq(perm.permKey, permKey), eq(role.sendType, sendType))).all();
	},

	selectByUserId(c, userId) {
		return orm(c).select(role).from(user).leftJoin(role, eq(role.roleId, user.type)).where(eq(user.userId, userId)).get();
	},

	hasAvailDomainPerm(availDomain, email) {

		availDomain = availDomain.split(',').filter(item => item !== '');

		if (availDomain.length === 0) {
			return true
		}

		const availIndex = availDomain.findIndex(item => {
			const domain = emailUtils.getDomain(email.toLowerCase());
			const availDomainItem = item.toLowerCase();
			return domain === availDomainItem
		})

		return availIndex > -1
	},

	selectByRoleCode(c, roleCode) {
		return orm(c).select().from(role).where(eq(role.roleCode, roleCode)).get();
	},

	selectByName(c, roleName) {
		return orm(c).select().from(role).where(eq(role.name, roleName)).get();
	},

	selectByUserIds(c, userIds) {

		if (!userIds || userIds.length === 0) {
			return [];
		}

		return orm(c).select({ ...role, userId: user.userId }).from(user).leftJoin(role, eq(role.roleId, user.type)).where(inArray(user.userId, userIds)).all();

	},

	isBanEmail(banEmail, fromEmail) {

		banEmail = banEmail.split(',').filter(item => item !== '');

		if (banEmail.includes('*')) {
			return true;
		}

		for (const item of banEmail) {

			if (verifyUtils.isDomain(item)) {

				const banDomain = item.toLowerCase();
				const receiveDomain = emailUtils.getDomain(fromEmail.toLowerCase());

				if (banDomain === receiveDomain) {
					return true;
				}

			} else {

				if (item.toLowerCase() === fromEmail.toLowerCase()) {

					return true;

				}

			}

		}

		return false;
	}
};

export default roleService;
