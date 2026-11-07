class BizError extends Error {
	/**
	 * @param {string} message Localized, user-safe message.
	 * @param {number} [code] HTTP-style status code (400-599). Defaults to 400.
	 * @param {string} [errorCode] Stable machine-readable error classification.
	 * @param {object} [options] Additional narrow protocol metadata.
	 */
	constructor(message, code, errorCode, options = {}) {
		super(message);
		const numCode = Number(code);
		this.code = (Number.isInteger(numCode) && numCode >= 400 && numCode <= 599) ? numCode : 400;
		this.errorCode = typeof errorCode === 'string' && errorCode ? errorCode : undefined;
		if (typeof options?.proofConsumed === 'boolean') this.proofConsumed = options.proofConsumed;
		if (options?.retryAfter !== undefined) this.retryAfter = options.retryAfter;
		this.name = 'BizError';
	}
}

export { BizError };
export default BizError;
