const encoder = new TextEncoder();

const PBKDF2_ITERATIONS = 210000;
const PBKDF2_KEY_LEN = 256; // bits (32 bytes)

function uint8ToBase64(bytes) {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function timingSafeEqual(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string') return false;
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

const saltHashUtils = {
	/**
	 * Generate 16 bytes cryptographically secure salt in base64
	 */
	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return uint8ToBase64(array);
	},

	/**
	 * Compute modern PBKDF2-HMAC-SHA256 hash (210,000 iterations)
	 */
	async hashPassword(password) {
		const salt = this.generateSalt();
		const hash = await this.genHashPassword(password, salt);
		return { salt, hash };
	},

	/**
	 * Generate PBKDF2-HMAC-SHA256 password hash string
	 * Format: pbkdf2:210000:<base64Hash>
	 */
	async genHashPassword(password, salt) {
		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			encoder.encode(password),
			'PBKDF2',
			false,
			['deriveBits']
		);

		const derivedBits = await crypto.subtle.deriveBits(
			{
				name: 'PBKDF2',
				salt: encoder.encode(salt),
				iterations: PBKDF2_ITERATIONS,
				hash: 'SHA-256'
			},
			keyMaterial,
			PBKDF2_KEY_LEN
		);

		const hashBase64 = uint8ToBase64(new Uint8Array(derivedBits));
		return `pbkdf2:${PBKDF2_ITERATIONS}:${hashBase64}`;
	},

	/**
	 * Compute legacy single-round SHA-256(salt + password) hash
	 */
	async genLegacyHashPassword(password, salt) {
		const data = encoder.encode(salt + password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		return uint8ToBase64(new Uint8Array(hashBuffer));
	},

	/**
	 * Verify password with support for both PBKDF2 and legacy SHA-256
	 */
	async verifyPassword(inputPassword, salt, storedHash) {
		const result = await this.verifyPasswordWithUpgrade(inputPassword, salt, storedHash);
		return result.isValid;
	},

	/**
	 * Verify password and indicate if it needs lazy migration from legacy SHA-256 to PBKDF2
	 */
	async verifyPasswordWithUpgrade(inputPassword, salt, storedHash) {
		if (!inputPassword || !storedHash) {
			return { isValid: false, isLegacy: false };
		}

		// Check if storedHash uses PBKDF2 format
		if (storedHash.startsWith('pbkdf2:')) {
			const parts = storedHash.split(':');
			const iterations = parseInt(parts[1], 10) || PBKDF2_ITERATIONS;
			const expectedBase64 = parts[2];

			const keyMaterial = await crypto.subtle.importKey(
				'raw',
				encoder.encode(inputPassword),
				'PBKDF2',
				false,
				['deriveBits']
			);

			const derivedBits = await crypto.subtle.deriveBits(
				{
					name: 'PBKDF2',
					salt: encoder.encode(salt),
					iterations: iterations,
					hash: 'SHA-256'
				},
				keyMaterial,
				PBKDF2_KEY_LEN
			);

			const derivedBase64 = uint8ToBase64(new Uint8Array(derivedBits));
			const isValid = timingSafeEqual(derivedBase64, expectedBase64);
			return { isValid, isLegacy: false };
		}

		// Fallback to legacy single-round SHA-256
		const legacyHash = await this.genLegacyHashPassword(inputPassword, salt);
		const isValid = timingSafeEqual(legacyHash, storedHash);
		return { isValid, isLegacy: true };
	},

	/**
	 * Generate cryptographically secure random password
	 */
	genRandomPwd(length = 8) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const randomBytes = new Uint8Array(length);
		crypto.getRandomValues(randomBytes);
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(randomBytes[i] % chars.length);
		}
		return result;
	}
};

export default saltHashUtils;
