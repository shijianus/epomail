class BizError extends Error {
	/**
	 * @param {string} message Localized, user-safe message.
	 * @param {number} [code] HTTP-style status code.
	 * @param {object} [options] Additional narrow protocol metadata.
	 */
	constructor(message, code, errorCode, options = {}) {
		super(message);
		this.code = code ? code : 501;
		this.errorCode = typeof errorCode === 'string' && errorCode ? errorCode : undefined;
		if (typeof options?.proofConsumed === 'boolean') this.proofConsumed = options.proofConsumed;
		this.name = 'BizError';
	}
}

export default BizError;
