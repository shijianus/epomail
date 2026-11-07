/**
 * Test-only stand-in for the `svix` package.
 *
 * Resend's ESM entry imports `Webhook` for its optional webhook helper. The
 * real package is CommonJS with extensionless relative requires; the Windows
 * Workers pool cannot resolve those through its module fallback. Product code
 * verifies Resend signatures with its own WebCrypto implementation, so tests
 * never need the real helper.
 */
export class Webhook {
	constructor(secret) {
		this.secret = secret;
	}

	verify() {
		throw new Error('svix webhook helper is not available in the unit-test stub');
	}
}

export default { Webhook };
