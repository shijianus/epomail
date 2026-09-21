import orm from '../entity/orm';
import perm from '../entity/perm';
import { eq, ne, and, asc } from 'drizzle-orm';
import rolePerm from '../entity/role-perm';
import user from '../entity/user';
import role from '../entity/role';
import { permConst } from '../const/entity-const';
import { t } from '../i18n/i18n'

// 权限名本地化：优先按稳定的 perm_key 取词条，分组行无 perm_key 时按库内名称取；
// 词条缺失则回退数据库原文，绝不把 "perms.xxx" 这类裸键抛给用户。
function permLabel(row) {
	const key = row.permKey && String(row.permKey).trim() ? String(row.permKey).trim() : row.name;
	const dictKey = 'perms.' + key;
	const text = t(dictKey);
	return (!text || text === dictKey) ? row.name : text;
}

const permService = {
	async tree(c) {
		const pList = await orm(c).select().from(perm).where(eq(perm.pid, 0)).orderBy(asc(perm.sort)).all();
		const cList = await orm(c).select().from(perm).where(ne(perm.pid, 0)).orderBy(asc(perm.sort)).all();

		cList.forEach(cItem => {
			cItem.name = permLabel(cItem)
		})

		pList.forEach(pItem => {
			pItem.name = permLabel(pItem)
			pItem.children = cList.filter(cItem => cItem.pid === pItem.permId)
		})
		return pList;
	},

	async userPermKeys(c, userId) {
		const userPerms = await orm(c).select({permKey: perm.permKey}).from(user)
			.leftJoin(role, eq(role.roleId,user.type))
			.rightJoin(rolePerm, eq(rolePerm.roleId,role.roleId))
			.leftJoin(perm, eq(rolePerm.permId,perm.permId))
			.where(and(eq(user.userId,userId),eq(perm.type,permConst.type.BUTTON)))
			.all();
		return userPerms.map(perm => perm.permKey);
	}
}

export default permService
