import JwtUtils from '../utils/jwt-utils.js';
import constant from '../const/constant.js';

const userContext = {
	getUserId(c) {
		return c.get('user').userId;
	},

	getUser(c) {
		return c.get('user');
	},

	async getToken(c) {
		const jwt = c.req.header(constant.TOKEN_HEADER);
		const result = await JwtUtils.verifyToken(c,jwt);
		return result?.token;
	},

	getLoginEmail(c) {
		return c.get('loginEmail') || '';
	}
};
export default userContext;
