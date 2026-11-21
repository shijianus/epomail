/**
 * Email Cryptography Utilities (AES-256-GCM + HKDF-SHA256)
 * Domain-isolated key derivation and authenticated encryption for stored email fields.
 * Supports dual-read of legacy un-tagged enc:v1 records while enforcing domain isolation
 * for all new writes (never falling back to jwt_secret for encryption).
 */

import { emailConst } from '../const/entity-const.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CIPHER_PREFIX = 'enc:v1:';
const DOMAIN_MARKER_PREFIX = 'd=';
const ENCRYPTED_FIELDS = ['subject', 'content', 'text', 'code'];

export const EMAIL_KEY_DOMAINS = Object.freeze({
	EMAIL_ENC_KEY: 'e',
	PREVIOUS_EMAIL_ENC_KEY: 'p',
	TOTP_COMPAT: 't'
});

const EMAIL_KEY_DOMAIN_NAMES = Object.freeze({
	e: 'email_enc_key',
	p: 'previous_email_enc_key',
	t: 'totp_enc_key_compat'
});

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

function normalizeUserId(userOrUserId) {
	return typeof userOrUserId === 'object' && userOrUserId !== null
		? Number(userOrUserId.userId ?? 0)
		: Number(userOrUserId ?? 0);
}

function buildEmailAad(userId, domainTag) {
	return encoder.encode(`epomail:email:v1:uid=${Number(userId || 0)}:d=${domainTag}`);
}

async function deriveDomainAesKey(baseKey, uid, domainName) {
	return await crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: encoder.encode(`epomail:email-enc:v2:${domainName}`),
			info: encoder.encode(`epomail:email-encryption:domain=${domainName}:user-${uid || 0}`)
		},
		baseKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

async function deriveLegacyV1AesKey(baseKey, uid, legacySalt) {
	return await crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: encoder.encode(legacySalt || `epomail-user-salt-${uid || 0}`),
			info: encoder.encode(`epomail:email-encryption:user-${uid || 0}`)
		},
		baseKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

function isCryptoKey(obj) {
	return typeof CryptoKey !== 'undefined' && obj instanceof CryptoKey;
}

function cleanSecret(val) {
	return typeof val === 'string' ? val.trim() : '';
}

const emailCryptoUtils = {
	CIPHER_PREFIX,
	ENCRYPTED_FIELDS,
	EMAIL_KEY_DOMAINS,

	inspectEncryptedValue(value) {
		if (!value || typeof value !== 'string' || !value.startsWith(CIPHER_PREFIX)) {
			return { encrypted: false, format: 'plaintext', domainTag: null };
		}
		const payload = value.slice(CIPHER_PREFIX.length);
		if (payload.startsWith(DOMAIN_MARKER_PREFIX)) {
			const secondSep = payload.indexOf(':');
			if (secondSep > DOMAIN_MARKER_PREFIX.length) {
				const domainTag = payload.slice(DOMAIN_MARKER_PREFIX.length, secondSep);
				return { encrypted: true, format: 'domain_v1', domainTag };
			}
		}
		return { encrypted: true, format: 'legacy_v1', domainTag: null };
	},

	needsEmailRecordMigration(emailRow, keyring) {
		if (!emailRow || !keyring?.activeDomain) return false;
		return ENCRYPTED_FIELDS.some(field => {
			const val = emailRow[field];
			if (!val || typeof val !== 'string') return false;
			const info = this.inspectEncryptedValue(val);
			if (!info.encrypted) return false;
			return info.format !== 'domain_v1' || info.domainTag !== keyring.activeDomain;
		});
	},

	// Normal mail reads know the ciphertext formats in the records. New writes only need the active key.
	// Migration and search use the complete keyring when the input records are not yet known.
	async getEmailRecordKey(env, userId, records = []) {
		const readFormats = new Set();
		for (const row of records) {
			for (const field of ENCRYPTED_FIELDS) {
				const info = this.inspectEncryptedValue(row?.[field]);
				if (info.encrypted) readFormats.add(info.domainTag ?? 'legacy');
			}
		}
		return this.getUserEmailCryptoKey(env, userId, null, { readFormats });
	},

	/**
	 * Derive a domain-isolated keyring for a specific user using HKDF-SHA-256.
	 * New writes prefer dedicated `email_enc_key` and NEVER fall back to `jwt_secret`.
	 * Legacy `enc:v1` ciphertexts remain readable across key upgrades via dual-read.
	 */
	async getUserEmailCryptoKey(env, userOrUserId, userSalt = null, options = {}) {
		const { requireDedicatedKey = false, allowLegacyJwtDecryptOnly = false } = options;
		const uid = normalizeUserId(userOrUserId);
		const emailSecret = cleanSecret(env?.email_enc_key);
		const prevEmailSecret = cleanSecret(env?.previous_email_enc_key);
		const totpSecret = cleanSecret(env?.totp_enc_key);
		const jwtSecret = cleanSecret(env?.jwt_secret);

		const activeDomain = emailSecret ? EMAIL_KEY_DOMAINS.EMAIL_ENC_KEY
			: (!requireDedicatedKey && totpSecret ? EMAIL_KEY_DOMAINS.TOTP_COMPAT : null);
		if (!activeDomain && (!allowLegacyJwtDecryptOnly || !jwtSecret)) {
			throw new Error('email encryption key is not configured (set email_enc_key or totp_enc_key)');
		}

		// Keep imports local to this keyring. Rotation is visible on the next call.
		const baseKeys = new Map();
		function baseKey(secret) {
			if (!baseKeys.has(secret)) {
				baseKeys.set(secret, crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']));
			}
			return baseKeys.get(secret);
		}
		const needs = format => !options.readFormats || options.readFormats.has(format);
		const domainKey = async (secret, domain) => secret
			? deriveDomainAesKey(await baseKey(secret), uid, EMAIL_KEY_DOMAIN_NAMES[domain])
			: null;
		const legacySecrets = needs('legacy')
			? [...new Set([emailSecret, prevEmailSecret, totpSecret, jwtSecret].filter(Boolean))]
			: [];
		const [currentE, previousE, previousP, currentP, compatT, legacyReadKeys] = await Promise.all([
			(activeDomain === 'e' || needs('e')) ? domainKey(emailSecret, 'e') : null,
			(needs('e') || needs('p')) ? domainKey(prevEmailSecret, 'e') : null,
			needs('p') ? domainKey(prevEmailSecret, 'p') : null,
			needs('p') ? domainKey(emailSecret, 'p') : null,
			(activeDomain === 't' || needs('t')) ? domainKey(totpSecret, 't') : null,
			Promise.all(legacySecrets.map(async secret => deriveLegacyV1AesKey(await baseKey(secret), uid, userSalt)))
		]);
		const readKeysByDomain = {
			e: [currentE, previousE].filter(Boolean),
			// A p-tagged write uses the previous secret first, including during rotation.
			p: [previousP, previousE, currentP].filter(Boolean),
			t: [compatT].filter(Boolean)
		};
		const domainName = EMAIL_KEY_DOMAIN_NAMES[activeDomain] ?? null;
		const writeKey = activeDomain ? readKeysByDomain[activeDomain][0] : null;

		return {
			__epomailEmailKeyring: true,
			userId: uid,
			activeDomain,
			domainName,
			writeKey,
			readKeysByDomain,
			legacyReadKeys
		};
	},

	/**
	 * Encrypt plain text using AES-256-GCM (12-byte random IV per record).
	 * Emits domain-tagged enc:v1:d=<domain>:<ivBase64>:<cipherBase64> bound with AAD.
	 */
	async encryptText(plainText, cryptoKeyOrKeyring, options = {}) {
		if (plainText === null || plainText === undefined) return plainText;
		if (typeof plainText !== 'string') plainText = String(plainText);
		if (plainText === '') return '';

		// Preserve already-encrypted payloads cleanly
		if (plainText.startsWith(CIPHER_PREFIX)) return plainText;

		const iv = new Uint8Array(12);
		crypto.getRandomValues(iv);
		const encodedData = encoder.encode(plainText);

		if (isCryptoKey(cryptoKeyOrKeyring)) {
			const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKeyOrKeyring, encodedData);
			return `${CIPHER_PREFIX}${uint8ToBase64(iv)}:${uint8ToBase64(new Uint8Array(cipherBuffer))}`;
		}

		const keyring = cryptoKeyOrKeyring;
		const targetDomain = options.domainOverride || keyring?.activeDomain;
		let targetKey = keyring?.writeKey;
		if (options.domainOverride) {
			targetKey = keyring?.readKeysByDomain?.[options.domainOverride]?.[0] || null;
		}
		if (!keyring?.__epomailEmailKeyring || !targetKey || !targetDomain) {
			throw new Error('Email encryption write key is unavailable for target key domain');
		}

		const aad = buildEmailAad(keyring.userId, targetDomain);
		const cipherBuffer = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv, additionalData: aad },
			targetKey,
			encodedData
		);

		return `${CIPHER_PREFIX}${DOMAIN_MARKER_PREFIX}${targetDomain}:${uint8ToBase64(iv)}:${uint8ToBase64(new Uint8Array(cipherBuffer))}`;
	},

	/**
	 * Decrypt cipher text using AES-256-GCM with domain isolation and legacy v1 dual-read.
	 * If text is not encrypted (does not start with enc:v1:), return as is.
	 */
	async decryptText(cipherText, cryptoKeyOrKeyring) {
		if (!cipherText || typeof cipherText !== 'string') return cipherText;
		if (!cipherText.startsWith(CIPHER_PREFIX)) return cipherText;

		const payload = cipherText.slice(CIPHER_PREFIX.length);

		try {
			if (payload.startsWith(DOMAIN_MARKER_PREFIX)) {
				const parts = payload.split(':');
				if (parts.length !== 3) return cipherText;
				const domainTag = parts[0].slice(DOMAIN_MARKER_PREFIX.length);
				const ivBase64 = parts[1];
				const cipherBase64 = parts[2];
				if (!domainTag || !ivBase64 || !cipherBase64 || isCryptoKey(cryptoKeyOrKeyring)) {
					return cipherText;
				}
				const candidateKeys = cryptoKeyOrKeyring?.readKeysByDomain?.[domainTag] || [];
				if (candidateKeys.length === 0) return cipherText;

				const iv = base64ToUint8(ivBase64);
				const cipherBytes = base64ToUint8(cipherBase64);
				const aad = buildEmailAad(cryptoKeyOrKeyring.userId, domainTag);
				for (const candidateKey of candidateKeys) {
					try {
						const decryptedBuffer = await crypto.subtle.decrypt(
							{ name: 'AES-GCM', iv, additionalData: aad },
							candidateKey,
							cipherBytes
						);
						return decoder.decode(decryptedBuffer);
					} catch (_) {
						// Continue trying remaining rotation keys inside this explicit domain
					}
				}
				return cipherText;
			}

			// Legacy enc:v1:<ivBase64>:<cipherBase64> format
			const sepIndex = payload.indexOf(':');
			if (sepIndex === -1) return cipherText;
			const ivBase64 = payload.slice(0, sepIndex);
			const cipherBase64 = payload.slice(sepIndex + 1);
			const iv = base64ToUint8(ivBase64);
			const cipherBytes = base64ToUint8(cipherBase64);

			const legacyKeys = isCryptoKey(cryptoKeyOrKeyring)
				? [cryptoKeyOrKeyring]
				: (cryptoKeyOrKeyring?.legacyReadKeys || []);

			for (const candidateKey of legacyKeys) {
				try {
					const decryptedBuffer = await crypto.subtle.decrypt(
						{ name: 'AES-GCM', iv },
						candidateKey,
						cipherBytes
					);
					return decoder.decode(decryptedBuffer);
				} catch (_) {
					// Continue checking legacy derivation sources
				}
			}
			return cipherText;
		} catch (_) {
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
		                      emailRecord.status === emailConst.status.NOONE;
		return !isTrashOrSpam;
	},

	PROTECTION_LEVELS: {
		0: {
			code: 'PRIVACY',
			level: 2,
			titleZh: 'Level 2: 选择性静态加密',
			titleEn: 'Level 2: Selective encryption at rest',
			badgeZh: 'Level 2: 增强隐私',
			badgeEn: 'Level 2: Privacy',
			algorithm: 'AES-256-GCM + HKDF-SHA256',
			adminPrivilegeZh: '受限：仅可审查垃圾箱、系统截断无主件，严禁查阅正常往来邮件',
			tamperProofZh: '普通邮件指定字段使用服务端派生的用户密钥加密存储'
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
			titleZh: 'Level 3: 全文件夹邮件字段静态加密',
			titleEn: 'Level 3: Mail field encryption at rest in every folder',
			badgeZh: 'Level 3: 静态加密',
			badgeEn: 'Level 3: Encryption at rest',
			algorithm: 'AES-256-GCM + HKDF-SHA256',
			adminPrivilegeZh: '管理界面限制浏览用户邮件',
			tamperProofZh: '服务端持有邮件密钥并在授权读取时解密正文；附件与投递元数据单独管理'
		}
	},

	getProtectionLevel(mode) {
		const m = Number(mode);
		return this.PROTECTION_LEVELS[m] || this.PROTECTION_LEVELS[0];
	}
};

export default emailCryptoUtils;
