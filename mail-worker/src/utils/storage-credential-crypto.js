import BizError from '../error/biz-error.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const BYO_ENVELOPE_TAG = 'byo:v1';
export const STORAGE_KEY_DOMAINS = Object.freeze({
	BYO_ENC_KEY: 'byo_storage_enc_key',
	STORAGE_ENC_KEY: 'storage_enc_key',
	PREVIOUS_BYO_ENC_KEY: 'previous_byo_storage_enc_key',
	PREVIOUS_STORAGE_ENC_KEY: 'previous_storage_enc_key',
	TOTP_COMPAT: 'totp_enc_key_compat'
});

const HKDF_SALT = 'epomail:byo-storage:salt:v1';

function uint8ToBase64(bytes) {
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function base64ToUint8(base64) {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function cleanSecret(val) {
	return typeof val === 'string' ? val.trim() : '';
}

function normalizeUserId(userId) {
	const uid = Number(userId);
	if (!Number.isSafeInteger(uid) || uid <= 0) {
		throw new BizError('Invalid userId for BYO storage credential cryptography', 400, 'invalid_storage_user');
	}
	return uid;
}

export function buildByoAad(userId, keyDomain, keyVersion = 1) {
	const uid = normalizeUserId(userId);
	return `${BYO_ENVELOPE_TAG}:uid=${uid}:kd=${String(keyDomain || '')}:kv=${Number(keyVersion || 1)}`;
}

export function hasByoCredentials(config) {
	return ['bucket', 'endpoint', 's3AccessKey', 's3SecretKey'].every(key =>
		typeof config?.[key] === 'string' && config[key].trim() && !config[key].includes('******'));
}

export function isEncryptedByoEnvelope(value) {
	if (!value) return false;
	let parsed = value;
	if (typeof parsed === 'string') {
		try { parsed = JSON.parse(parsed); } catch (_) { return false; }
	}
	return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.__enc === BYO_ENVELOPE_TAG);
}

/**
 * Resolve available encryption keys for BYO S3 credentials.
 * Dedicated `byo_storage_enc_key` / `storage_enc_key` are preferred and domain-isolated.
 * Strictly refuses falling back to `jwt_secret`.
 */
export function resolveStorageKeyEnv(env, { requireDedicatedKey = false } = {}) {
	const byoKey = cleanSecret(env?.byo_storage_enc_key);
	const storageKey = cleanSecret(env?.storage_enc_key);
	const prevByoKey = cleanSecret(env?.previous_byo_storage_enc_key);
	const prevStorageKey = cleanSecret(env?.previous_storage_enc_key);
	const totpKey = cleanSecret(env?.totp_enc_key);

	let active = null;
	if (byoKey) {
		active = { keyDomain: STORAGE_KEY_DOMAINS.BYO_ENC_KEY, secret: byoKey };
	} else if (storageKey) {
		active = { keyDomain: STORAGE_KEY_DOMAINS.STORAGE_ENC_KEY, secret: storageKey };
	} else if (!requireDedicatedKey && totpKey) {
		active = { keyDomain: STORAGE_KEY_DOMAINS.TOTP_COMPAT, secret: totpKey };
	}

	const decryptCandidates = {
		[STORAGE_KEY_DOMAINS.BYO_ENC_KEY]: [byoKey, prevByoKey, storageKey, prevStorageKey].filter(Boolean),
		[STORAGE_KEY_DOMAINS.STORAGE_ENC_KEY]: [storageKey, prevStorageKey, byoKey, prevByoKey].filter(Boolean),
		[STORAGE_KEY_DOMAINS.PREVIOUS_BYO_ENC_KEY]: [prevByoKey, byoKey].filter(Boolean),
		[STORAGE_KEY_DOMAINS.PREVIOUS_STORAGE_ENC_KEY]: [prevStorageKey, storageKey].filter(Boolean),
		[STORAGE_KEY_DOMAINS.TOTP_COMPAT]: [totpKey].filter(Boolean)
	};

	return {
		active,
		dedicatedKeyConfigured: Boolean(byoKey || storageKey),
		compatKeyConfigured: Boolean(totpKey),
		previousKeyConfigured: Boolean(prevByoKey || prevStorageKey),
		decryptCandidates
	};
}

async function deriveByoAesKey(rawSecret, userId, keyDomain, keyVersion = 1, usages = ['encrypt', 'decrypt']) {
	const uid = normalizeUserId(userId);
	const baseKey = await crypto.subtle.importKey(
		'raw',
		encoder.encode(rawSecret),
		'HKDF',
		false,
		['deriveKey']
	);
	return await crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: encoder.encode(HKDF_SALT),
			info: encoder.encode(`epomail:byo-storage:uid=${uid}:kd=${keyDomain}:kv=${Number(keyVersion || 1)}`)
		},
		baseKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		usages
	);
}

function normalizeCleanConfig(config) {
	return {
		bucket: String(config?.bucket || '').trim(),
		endpoint: String(config?.endpoint || '').trim(),
		region: String(config?.region || 'auto').trim() || 'auto',
		s3AccessKey: String(config?.s3AccessKey || '').trim(),
		s3SecretKey: String(config?.s3SecretKey || '').trim(),
		forcePathStyle: config?.forcePathStyle === 1 || config?.forcePathStyle === true,
		customDomain: String(config?.customDomain || '').trim()
	};
}

export async function encryptByoStorageConfig(config, env, userId, options = {}) {
	const {
		requireDedicatedKey = false,
		keyDomainOverride = null,
		keyVersion = 1
	} = options;

	const cleanConfig = normalizeCleanConfig(config);
	if (!hasByoCredentials(cleanConfig)) {
		throw new BizError('BYO storage configuration is incomplete', 400, 'invalid_storage_config');
	}

	const keyInfo = resolveStorageKeyEnv(env, { requireDedicatedKey });
	let target = keyInfo.active;

	if (keyDomainOverride) {
		const candidateSecrets = keyInfo.decryptCandidates[keyDomainOverride] || [];
		if (candidateSecrets.length === 0) {
			throw new BizError(`Target storage key domain (${keyDomainOverride}) is not configured`, 503, 'storage_enc_key_missing');
		}
		target = { keyDomain: keyDomainOverride, secret: candidateSecrets[0] };
	}

	if (!target) {
		throw new BizError('BYO storage encryption key is not configured', 503, 'storage_enc_key_missing');
	}

	const aadStr = buildByoAad(userId, target.keyDomain, keyVersion);
	const aesKey = await deriveByoAesKey(target.secret, userId, target.keyDomain, keyVersion, ['encrypt']);
	const iv = new Uint8Array(12);
	crypto.getRandomValues(iv);

	const cipherBuf = await crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv,
			additionalData: encoder.encode(aadStr)
		},
		aesKey,
		encoder.encode(JSON.stringify(cleanConfig))
	);

	return JSON.stringify({
		__enc: BYO_ENVELOPE_TAG,
		alg: 'AES-GCM',
		kdf: 'HKDF-SHA256',
		keyDomain: target.keyDomain,
		keyVersion: Number(keyVersion),
		iv: uint8ToBase64(iv),
		ct: uint8ToBase64(new Uint8Array(cipherBuf)),
		aad: aadStr
	});
}

export async function decryptByoStorageConfig(rawValue, env, userId) {
	if (rawValue === null || rawValue === undefined) {
		return { ok: true, state: 'empty', config: {}, needsMigration: false, keyDomain: null, keyVersion: 0, reason: null };
	}

	let parsed = rawValue;
	if (typeof parsed === 'string') {
		const trimmed = parsed.trim();
		if (!trimmed || trimmed === '{}') {
			return { ok: true, state: 'empty', config: {}, needsMigration: false, keyDomain: null, keyVersion: 0, reason: null };
		}
		try {
			parsed = JSON.parse(trimmed);
		} catch (_) {
			return { ok: false, state: 'invalid', config: {}, needsMigration: false, keyDomain: null, keyVersion: 0, reason: 'malformed_json' };
		}
	}

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return { ok: false, state: 'invalid', config: {}, needsMigration: false, keyDomain: null, keyVersion: 0, reason: 'invalid_shape' };
	}

	if (Object.keys(parsed).length === 0) {
		return { ok: true, state: 'empty', config: {}, needsMigration: false, keyDomain: null, keyVersion: 0, reason: null };
	}

	if (parsed.__enc !== BYO_ENVELOPE_TAG) {
		const validPlaintext = hasByoCredentials(parsed);
		if (!validPlaintext) {
			return { ok: false, state: 'invalid', config: {}, needsMigration: false, keyDomain: null, keyVersion: 0, reason: 'missing_credentials' };
		}
		return {
			ok: true,
			state: 'legacy_plaintext',
			config: { ...parsed },
			needsMigration: true,
			keyDomain: null,
			keyVersion: 0,
			reason: 'legacy_plaintext'
		};
	}

	const keyDomain = typeof parsed.keyDomain === 'string' ? parsed.keyDomain : '';
	const keyVersion = Number(parsed.keyVersion || 1);
	if (!keyDomain || !parsed.iv || !parsed.ct || !Number.isSafeInteger(keyVersion) || keyVersion < 1) {
		return { ok: false, state: 'invalid', config: {}, needsMigration: false, keyDomain, keyVersion, reason: 'malformed_envelope' };
	}

	let expectedAad;
	try {
		expectedAad = buildByoAad(userId, keyDomain, keyVersion);
	} catch (_) {
		return { ok: false, state: 'undecryptable', config: {}, needsMigration: false, keyDomain, keyVersion, reason: 'invalid_user' };
	}

	if (parsed.aad && parsed.aad !== expectedAad) {
		return { ok: false, state: 'undecryptable', config: {}, needsMigration: false, keyDomain, keyVersion, reason: 'aad_mismatch' };
	}

	const keyInfo = resolveStorageKeyEnv(env);
	const secrets = keyInfo.decryptCandidates[keyDomain] || [];
	if (secrets.length === 0) {
		return { ok: false, state: 'undecryptable', config: {}, needsMigration: false, keyDomain, keyVersion, reason: 'missing_key_domain' };
	}

	let ivBytes;
	let ctBytes;
	try {
		ivBytes = base64ToUint8(parsed.iv);
		ctBytes = base64ToUint8(parsed.ct);
	} catch (_) {
		return { ok: false, state: 'invalid', config: {}, needsMigration: false, keyDomain, keyVersion, reason: 'invalid_base64' };
	}

	for (const secret of secrets) {
		try {
			const aesKey = await deriveByoAesKey(secret, userId, keyDomain, keyVersion, ['decrypt']);
			const plainBuf = await crypto.subtle.decrypt(
				{
					name: 'AES-GCM',
					iv: ivBytes,
					additionalData: encoder.encode(expectedAad)
				},
				aesKey,
				ctBytes
			);
			const config = JSON.parse(decoder.decode(plainBuf));
			if (!hasByoCredentials(config)) {
				return { ok: false, state: 'invalid', config: {}, needsMigration: false, keyDomain, keyVersion, reason: 'decrypted_missing_credentials' };
			}
			const activeDomain = keyInfo.active?.keyDomain || null;
			const needsMigration = Boolean(activeDomain && activeDomain !== keyDomain);
			return {
				ok: true,
				state: 'encrypted',
				config: normalizeCleanConfig(config),
				needsMigration,
				keyDomain,
				keyVersion,
				reason: needsMigration ? 'key_domain_upgrade' : null
			};
		} catch (_) {
			// Try next candidate secret within the declared domain (supports zero-downtime key rotation)
		}
	}

	return { ok: false, state: 'undecryptable', config: {}, needsMigration: false, keyDomain, keyVersion, reason: 'decrypt_failed' };
}

export function maskByoStorageConfig(config) {
	if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
	if (config.__enc === BYO_ENVELOPE_TAG) return {};
	const masked = { ...config };
	for (const field of ['s3AccessKey', 's3SecretKey']) {
		if (masked[field]) {
			masked[field] = typeof masked[field] === 'string' && masked[field].length > 6
				? `${masked[field].slice(0, 6)}******`
				: '******';
		}
	}
	return masked;
}

export default {
	BYO_ENVELOPE_TAG,
	STORAGE_KEY_DOMAINS,
	buildByoAad,
	hasByoCredentials,
	isEncryptedByoEnvelope,
	resolveStorageKeyEnv,
	encryptByoStorageConfig,
	decryptByoStorageConfig,
	maskByoStorageConfig
};
