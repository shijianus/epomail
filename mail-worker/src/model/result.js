const result = {
	ok(data) {
		return { code: 200, message: 'success', data: data ? data : null };
	},
	fail(message, code = 500, errorCode) {
		const body = { code, message };
		if (typeof errorCode === 'string' && errorCode) body.errorCode = errorCode;
		return body;
	}
};
export default result;
