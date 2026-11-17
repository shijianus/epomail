const result = {
	ok(data) {
		return { code: 200, message: 'success', data: data !== undefined && data !== null ? data : null };
	},
	fail(message, code = 400, errorCode) {
		const statusCode = Number.isInteger(Number(code)) ? Number(code) : 400;
		const body = { code: statusCode, message };
		if (typeof errorCode === 'string' && errorCode) body.errorCode = errorCode;
		return body;
	}
};
export default result;
