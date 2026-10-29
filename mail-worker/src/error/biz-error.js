class BizError extends Error {
	/**
	 * @param {string} message Localized, user-safe message.
	 * @param {number} [code] HTTP-style status code.
	 * @param {string} [errorCode] Stable machine-readable discriminator. It is
	 *   deliberately independent of the localized message so clients can
	 *   distinguish policy rejections without parsing translations.
	 */
	constructor(message, code, errorCode) {
		super(message);
		this.code = code ? code : 501;
		this.errorCode = typeof errorCode === 'string' && errorCode ? errorCode : undefined;
		this.name = 'BizError';
	}
}

export default BizError;
