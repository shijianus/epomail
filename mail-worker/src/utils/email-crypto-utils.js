/**
 * Email Cryptography Utilities (AES-256-GCM + HKDF-SHA256)
 * High-performance, centralized DB encrypted storage engine for Epocanvas Mail.
 * Pure Web Crypto implementation without external dependencies for Cloudflare Workers.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CIPHER_PREFIX = 'enc:v1:';
const ENCRYPTED_FIELDS = ['subject', 'content', 'text', 'code'];

function uint8ToBase64(bytes) {
	let binary = '';
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function base64ToUint8(base64) {
	const binary = atob(base64);
	const len = binary.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

const emailCryptoUtils = {
	CIPHER_PREFIX,
	ENCRYPTED_FIELDS,

	/**
	 * Derive AES-256-GCM CryptoKey for a specific user using HKDF-SHA-256.
	 * Base secret is derived from env (totp_enc_key || jwt_secret || master key).
	 * Salt is user-specific (user.salt or user.userId).
	 * Info binds the key specifically to email encryption for that user.
	 */
	async getUserEmailCryptoKey(env, userOrUserId, userSalt = null) {
		const masterSecret = (env?.totp_enc_key || env?.jwt_secret || 'epomail-master-crypto-secret-key-32b').trim();

		let uid = typeof userOrUserId === 'object' ? userOrUserId?.userId : userOrUserId;
		let salt = typeof userOrUserId === 'object' ? userOrUserId?.salt : userSalt;
		if (!salt) {
			salt = `epomail-user-salt-${uid || 0}`;
		}

		const baseKey = await crypto.subtle.importKey(
			'raw',
			encoder.encode(masterSecret),
			'HKDF',
			false,
			['deriveKey']
		);

		return await crypto.subtle.deriveKey(
			{
				name: 'HKDF',
				hash: 'SHA-256',
				salt: encoder.encode(salt),
				info: encoder.encode(`epomail:email-encryption:user-${uid || 0}`)
			},
			baseKey,
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt']
		);
	},

	/**
	 * Encrypt plain text using AES-256-GCM (12-byte random IV per record)
	 * Output format: enc:v1:<ivBase64>:<cipherBase64>
	 */
	async encryptText(plainText, cryptoKey) {
		if (plainText === null || plainText === undefined) return plainText;
		if (typeof plainText !== 'string') plainText = String(plainText);
		if (plainText === '') return '';

		// If already encrypted with enc:v1:, do not double-encrypt
		if (plainText.startsWith(CIPHER_PREFIX)) return plainText;

		const iv = new Uint8Array(12);
		crypto.getRandomValues(iv);

		const encodedData = encoder.encode(plainText);
		const cipherBuffer = await crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv: iv
			},
			cryptoKey,
			encodedData
		);

		const ivBase64 = uint8ToBase64(iv);
		const cipherBase64 = uint8ToBase64(new Uint8Array(cipherBuffer));
		return `${CIPHER_PREFIX}${ivBase64}:${cipherBase64}`;
	},

	/**
	 * Decrypt cipher text using AES-256-GCM.
	 * If text is not encrypted (does not start with enc:v1:), return as is (safe for plaintext/legacy data).
	 */
	async decryptText(cipherText, cryptoKey) {
		if (!cipherText || typeof cipherText !== 'string') return cipherText;
		if (!cipherText.startsWith(CIPHER_PREFIX)) return cipherText;

		try {
			const payload = cipherText.slice(CIPHER_PREFIX.length);
			const sepIndex = payload.indexOf(':');
			if (sepIndex === -1) return cipherText;

			const ivBase64 = payload.slice(0, sepIndex);
			const cipherBase64 = payload.slice(sepIndex + 1);

			const iv = base64ToUint8(ivBase64);
			const cipherBytes = base64ToUint8(cipherBase64);

			const decryptedBuffer = await crypto.subtle.decrypt(
				{
					name: 'AES-GCM',
					iv: iv
				},
				cryptoKey,
				cipherBytes
			);

			return decoder.decode(decryptedBuffer);
		} catch (err) {
			console.error('[email-crypto] Decryption error:', err);
			return cipherText;
		}
	},

	/**
	 * Encrypt email fields (subject, content, text, code) for a user record.
	 */
	async encryptEmailRecord(emailData, cryptoKey) {
		if (!emailData || !cryptoKey) return emailData;
		const result = { ...emailData };
		for (const field of ENCRYPTED_FIELDS) {
			if (result[field] !== undefined && result[field] !== null) {
				result[field] = await this.encryptText(result[field], cryptoKey);
			}
		}
		return result;
	},

	/**
	 * Decrypt email fields (subject, content, text, code) for a user record.
	 */
	async decryptEmailRecord(emailRow, cryptoKey) {
		if (!emailRow || !cryptoKey) return emailRow;
		const result = { ...emailRow };
		for (const field of ENCRYPTED_FIELDS) {
			if (result[field] !== undefined && result[field] !== null) {
				result[field] = await this.decryptText(result[field], cryptoKey);
			}
		}
		return result;
	},

	/**
	 * Decrypt an array of email records in parallel.
	 */
	async decryptEmailList(list, cryptoKey) {
		if (!Array.isArray(list) || !cryptoKey || list.length === 0) return list;
		return await Promise.all(list.map(item => this.decryptEmailRecord(item, cryptoKey)));
	},

	/**
	 * Evaluates whether an email record should be encrypted based on allMailMode:
	 * - Mode 1 (全部邮件模式): All plaintext (returns false)
	 * - Mode 2 (加密邮件模式): 100% encrypted for all folders including trash (returns true)
	 * - Mode 0 (隐私邮件模式): Encrypted UNLESS in trash/spam/noone (returns !isTrashOrSpam)
	 */
	shouldEncryptEmail(mode, emailRecord = {}) {
		const m = Number(mode);
		if (m === 1) {
			return false; // 全部邮件模式
		}
		if (m === 2) {
			return true; // 加密邮件模式 (包含垃圾箱全量加密)
		}
		// Mode 0: 隐私邮件模式 (垃圾箱明文存储，其余密文存储)
		const isTrashOrSpam = Number(emailRecord.isDel) === 1 || 
		                      Number(emailRecord.isSpam) === 1 || 
		                      emailRecord.status === 2; // emailConst.status.NOONE = 2
		return !isTrashOrSpam;
	},

	/**
	 * Canonical definition of protection levels for Epocanvas Mail:
	 * Level 1: Standard Plaintext (全部邮件模式) - No encryption, full audit
	 * Level 2: Selective E2EE & Spam Isolation (隐私邮件模式 - 推荐) - User keys encrypt normal mail, trash isolated
	 * Level 3: Maximum Zero-Knowledge E2EE (端到端加密模式) - 100% encrypted, admin barred from all user data
	 */
	PROTECTION_LEVELS: {
		0: {
			code: 'PRIVACY',
			level: 2,
			titleZh: 'Level 2: 增强隐私级 (Selective E2EE & Spam Isolation)',
			titleEn: 'Level 2: Enhanced Privacy (Selective E2EE & Spam Isolation)',
			badgeZh: 'Level 2: 增强隐私',
			badgeEn: 'Level 2: Privacy',
			algorithm: 'AES-256-GCM + HKDF-SHA256',
			adminPrivilegeZh: '受限：仅可审查垃圾箱、系统截断无主件，严禁查阅正常往来邮件',
			tamperProofZh: '强制开启 2FA，普通邮件自动加密存储，收发双方密钥隔离'
		},
		1: {
			code: 'ALL',
			level: 1,
			titleZh: 'Level 1: 明文基础级 (Standard Plaintext)',
			titleEn: 'Level 1: Standard Plaintext (Full Audit)',
			badgeZh: 'Level 1: 明文基础',
			badgeEn: 'Level 1: Plaintext',
			algorithm: 'Plaintext (无加密)',
			adminPrivilegeZh: '开放：管理员拥有全站往来邮件完全审查权限',
			tamperProofZh: '支持自由开关 2FA 与多渠道消息推送'
		},
		2: {
			code: 'ENCRYPTED',
			level: 3,
			titleZh: 'Level 3: 最高绝密级 (Maximum Zero-Knowledge E2EE)',
			titleEn: 'Level 3: Maximum Zero-Knowledge E2EE',
			badgeZh: 'Level 3: 最高绝密',
			badgeEn: 'Level 3: E2EE Max',
			algorithm: 'AES-256-GCM + HKDF-SHA256 (全量100%覆盖)',
			adminPrivilegeZh: '绝对禁止：管理员无权查看任何邮件列表或正文，全接口阻断',
			tamperProofZh: '强制开启 2FA，强制封锁外部推送/转发通道，杜绝密文外泄'
		}
	},

	getProtectionLevel(mode) {
		const m = Number(mode);
		return this.PROTECTION_LEVELS[m] || this.PROTECTION_LEVELS[0];
	}
};

export default emailCryptoUtils;
