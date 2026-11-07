import JwtUtils from '../utils/jwt-utils.js';
import constant from '../const/constant.js';
import KvConst from '../const/kv-const.js';
import BizError from '../error/biz-error.js';
import { getUserDb } from '../utils/db-accessor.js';
import { authVersionOf } from '../utils/one-time-credential.js';

const userContext = {
	getUserId(c) {
		return c.get('user').userId;
	},

	getUser(c) {
		return c.get('user');
	},

	async getToken(c) {
		const jwt = c.req.header(constant.TOKEN_HEADER) || c.req.header('token');
		const result = await JwtUtils.verifyToken(c,jwt);
		return result?.token;
	},

	async requireSession(c, userId, row = null) {
		const jwt = c.req.header(constant.TOKEN_HEADER) || c.req.header('token');
		const decoded = await JwtUtils.verifyToken(c, jwt);
		const current = row || await getUserDb(c).prepare('SELECT user_id, auth_version, is_del, status FROM user WHERE user_id=?').bind(userId).first();
		const info = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		if (!current || !decoded || decoded.purpose || decoded.userId !== userId || !decoded.token
			|| authVersionOf(decoded) !== authVersionOf(current) || Number(current.isDel ?? current.is_del) !== 0
			|| Number(current.status) !== 0 || !info?.tokens?.includes(decoded.token)) {
			throw new BizError('Authentication expired', 401, 'auth_expired');
		}
		return { token: decoded.token, authVersion: authVersionOf(current), meta: info.tokenMeta?.[decoded.token] || null };
	},

	getLoginEmail(c) {
		return c.get('loginEmail') || '';
	}
};
export default userContext;
