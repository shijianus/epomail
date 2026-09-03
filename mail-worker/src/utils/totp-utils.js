/**
 * TOTP & Cryptography Utilities (RFC 6238, RFC 4226, RFC 4648, AES-256-GCM)
 * Pure Web Crypto implementation without external dependencies for Cloudflare Workers.
 */

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function uint8ToBase64(bytes) {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function base64ToUint8(base64Str) {
	const binary = atob(base64Str);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
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

const totpUtils = {
	/**
	 * Encode bytes to Base32 string (RFC 4648)
	 */
	base32Encode(buffer) {
		const bytes = new Uint8Array(buffer);
		let bits = 0;
		let value = 0;
		let output = '';

		for (let i = 0; i < bytes.length; i++) {
			value = (value << 8) | bytes[i];
			bits += 8;
			while (bits >= 5) {
				output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
				bits -= 5;
			}
		}

		if (bits > 0) {
			output += BASE32_CHARS[(value << (5 - bits)) & 31];
		}

		return output;
	},

	/**
	 * Decode Base32 string to Uint8Array
	 */
	base32Decode(base32Str) {
		const cleaned = (base32Str || '').toUpperCase().replace(/[\s=-]/g, '');
		let bits = 0;
		let value = 0;
		const bytes = [];

		for (let i = 0; i < cleaned.length; i++) {
			const index = BASE32_CHARS.indexOf(cleaned[i]);
			if (index === -1) {
				continue;
			}
			value = (value << 5) | index;
			bits += 5;
			if (bits >= 8) {
				bytes.push((value >>> (bits - 8)) & 255);
				bits -= 8;
			}
		}

		return new Uint8Array(bytes);
	},

	/**
	 * Generate cryptographically secure Base32 secret (default 20 bytes = 160 bits)
	 */
	generateSecret(byteLength = 20) {
		const randomBytes = new Uint8Array(byteLength);
		crypto.getRandomValues(randomBytes);
		return this.base32Encode(randomBytes);
	},

	/**
	 * Generate standard otpauth:// URI for Google Authenticator / 1Password / Bitwarden
	 */
	generateOtpAuthUri(secretBase32, email, issuer = 'EpoMail') {
		const cleanIssuer = encodeURIComponent(issuer.trim());
		const cleanEmail = encodeURIComponent(email.trim());
		return `otpauth://totp/${cleanIssuer}:${cleanEmail}?secret=${secretBase32}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=30`;
	},

	/**
	 * Generate HOTP (RFC 4226) code
	 */
	async generateHOTP(secretBytes, counter, digits = 6) {
		const counterBuffer = new ArrayBuffer(8);
		const counterView = new DataView(counterBuffer);
		counterView.setBigUint64(0, BigInt(counter), false); // Big-endian

		const key = await crypto.subtle.importKey(
			'raw',
			secretBytes,
			{ name: 'HMAC', hash: 'SHA-1' },
			false,
			['sign']
		);

		const signature = await crypto.subtle.sign('HMAC', key, counterBuffer);
		const hmac = new Uint8Array(signature);

		const offset = hmac[hmac.length - 1] & 0x0f;
		const binary =
			((hmac[offset] & 0x7f) << 24) |
			((hmac[offset + 1] & 0xff) << 16) |
			((hmac[offset + 2] & 0xff) << 8) |
			(hmac[offset + 3] & 0xff);

		const otp = binary % Math.pow(10, digits);
		return otp.toString().padStart(digits, '0');
	},

	/**
	 * Generate current TOTP code (RFC 6238)
	 */
	async generateTOTP(secretBase32, timeStepSeconds = 30, digits = 6, timestamp = Date.now()) {
		const secretBytes = this.base32Decode(secretBase32);
		const counter = Math.floor(timestamp / 1000 / timeStepSeconds);
		return await this.generateHOTP(secretBytes, counter, digits);
	},

	/**
	 * Verify TOTP code with time window tolerance (+- 1 step = +- 30s)
	 */
	async verifyTOTP(secretBase32, token, window = 1, timeStepSeconds = 30, digits = 6, timestamp = Date.now()) {
		if (!secretBase32 || !token) {
			return { isValid: false, timeStep: null };
		}
		const cleanToken = token.trim();
		if (cleanToken.length !== digits || !/^\d+$/.test(cleanToken)) {
			return { isValid: false, timeStep: null };
		}

		const secretBytes = this.base32Decode(secretBase32);
		const currentStep = Math.floor(timestamp / 1000 / timeStepSeconds);

		for (let i = -window; i <= window; i++) {
			const step = currentStep + i;
			const expectedCode = await this.generateHOTP(secretBytes, step, digits);
			if (timingSafeEqual(expectedCode, cleanToken)) {
				return { isValid: true, timeStep: step };
			}
		}

		return { isValid: false, timeStep: null };
	},

	/**
	 * Derive 256-bit AES-GCM CryptoKey from environment secret (totp_enc_key)
	 */
	async getEncryptionKey(env) {
		const rawKey = env?.totp_enc_key || env?.jwt_secret;
		if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) {
			throw new Error('totp_enc_key is not configured, please run: wrangler secret put totp_enc_key');
		}

		const cleanKey = rawKey.trim();
		let keyBytes;

		try {
			// If totp_enc_key is base64 encoded 32 bytes
			const decoded = base64ToUint8(cleanKey);
			if (decoded.length === 32) {
				keyBytes = decoded;
			} else {
				// Hash to 32 bytes if length is not exactly 32
				const hash = await crypto.subtle.digest('SHA-256', encoder.encode(cleanKey));
				keyBytes = new Uint8Array(hash);
			}
		} catch (e) {
			const hash = await crypto.subtle.digest('SHA-256', encoder.encode(cleanKey));
			keyBytes = new Uint8Array(hash);
		}

		return await crypto.subtle.importKey(
			'raw',
			keyBytes,
			{ name: 'AES-GCM' },
			false,
			['encrypt', 'decrypt']
		);
	},

	/**
	 * Encrypt secret with AES-256-GCM (12-byte random IV per record)
	 * Returns format: base64(iv) + ':' + base64(ciphertext+tag)
	 */
	async encryptSecret(plainText, env) {
		if (!plainText) return '';
		const key = await this.getEncryptionKey(env);
		const iv = new Uint8Array(12);
		crypto.getRandomValues(iv);

		const cipherBuffer = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv },
			key,
			encoder.encode(plainText)
		);

		return `${uint8ToBase64(iv)}:${uint8ToBase64(new Uint8Array(cipherBuffer))}`;
	},

	/**
	 * Decrypt AES-256-GCM ciphertext
	 */
	async decryptSecret(encryptedStr, env) {
		if (!encryptedStr) return '';
		// If legacy or not encrypted with separator, return as is
		if (!encryptedStr.includes(':')) {
			return encryptedStr;
		}

		const [ivBase64, cipherBase64] = encryptedStr.split(':');
		if (!ivBase64 || !cipherBase64) return '';

		const key = await this.getEncryptionKey(env);
		const iv = base64ToUint8(ivBase64);
		const ciphertext = base64ToUint8(cipherBase64);

		try {
			const decryptedBuffer = await crypto.subtle.decrypt(
				{ name: 'AES-GCM', iv },
				key,
				ciphertext
			);
			return decoder.decode(decryptedBuffer);
		} catch (err) {
			console.error('Failed to decrypt TOTP secret:', err);
			return '';
		}
	},

	/**
	 * Compute SHA-256 hash of a string (for backup codes)
	 */
	async sha256Hash(text) {
		const data = encoder.encode(text);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		return uint8ToBase64(new Uint8Array(hashBuffer));
	},

	/**
	 * Generate 10 single-use Backup Codes (Format: XXXX-XXXX)
	 * Returns raw codes for user display and SHA-256 hashed structures for DB persistence.
	 */
	async generateBackupCodes(count = 10, env = null) {
		const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude ambiguous 0/O, 1/I/L
		const rawCodes = [];
		const hashedCodes = [];

		for (let i = 0; i < count; i++) {
			const randomBytes = new Uint8Array(8);
			crypto.getRandomValues(randomBytes);
			let code = '';
			for (let j = 0; j < 8; j++) {
				code += charset[randomBytes[j] % charset.length];
				if (j === 3) code += '-';
			}
			rawCodes.push(code);

			const normalized = code.replace(/[\s-]/g, '').toUpperCase();
			const hash = await this.sha256Hash(normalized);
			hashedCodes.push({
				hash,
				used: 0,
				usedAt: null
			});
		}

		let encryptedRaw = '';
		if (env) {
			encryptedRaw = await this.encryptSecret(JSON.stringify(rawCodes), env);
		}

		return {
			rawCodes,
			hashedCodes,
			encryptedRaw
		};
	},

	/**
	 * Verify and mark a backup code as used
	 */
	async verifyAndConsumeBackupCode(rawInputCode, backupCodesJson) {
		if (!rawInputCode || !backupCodesJson) {
			return { isValid: false, updatedCodesJson: backupCodesJson };
		}

		let parsed = null;
		let list = [];
		let isWrapped = false;
		try {
			parsed = typeof backupCodesJson === 'string' ? JSON.parse(backupCodesJson) : backupCodesJson;
			if (Array.isArray(parsed)) {
				list = parsed;
			} else if (parsed && Array.isArray(parsed.hashedCodes)) {
				list = parsed.hashedCodes;
				isWrapped = true;
			}
		} catch (e) {
			return { isValid: false, updatedCodesJson: backupCodesJson };
		}

		const normalizedInput = rawInputCode.replace(/[\s-]/g, '').toUpperCase();
		const inputHash = await this.sha256Hash(normalizedInput);

		let matched = false;
		for (const item of list) {
			if (item.used === 0 && timingSafeEqual(item.hash, inputHash)) {
				item.used = 1;
				item.usedAt = new Date().toISOString();
				matched = true;
				break;
			}
		}

		let updatedJson = '';
		if (isWrapped) {
			parsed.hashedCodes = list;
			updatedJson = JSON.stringify(parsed);
		} else {
			updatedJson = JSON.stringify(list);
		}

		return {
			isValid: matched,
			updatedCodesJson: updatedJson
		};
	}
};

export default totpUtils;
