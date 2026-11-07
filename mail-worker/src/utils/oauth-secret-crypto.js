import BizError from '../error/biz-error.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

/**
 * 恒定时间字符串比较，防止针对 Secret 的定时侧信道攻击
 */
export async function timingSafeEqualStr(a, b) {
	const strA = String(a ?? '');
	const strB = String(b ?? '');
	const bufA = encoder.encode(strA);
	const bufB = encoder.encode(strB);

	if (bufA.byteLength !== bufB.byteLength) {
		// 仍然执行一次固定长度比较避免短路泄露长度
		let dummy = 0;
		for (let i = 0; i < bufA.byteLength; i++) {
			dummy |= bufA[i] ^ (bufB[i % (bufB.byteLength || 1)] || 0);
		}
		return false;
	}

	let mismatch = 0;
	for (let i = 0; i < bufA.byteLength; i++) {
		mismatch |= bufA[i] ^ bufB[i];
	}
	return mismatch === 0;
}

/**
 * 获取独立的 OAuth Client Secret 根加密密钥
 * 严格禁止回退至 jwt_secret，缺失时严格 fail-closed
 */
function getOAuthClientEncKey(env) {
	const key = (env?.oauth_client_enc_key || '').trim();
	if (!key) {
		throw new BizError(
			'OAuth client encryption key (oauth_client_enc_key) is not configured',
			500,
			'oauth_client_enc_key_missing'
		);
	}
	return key;
}

/**
 * 基于 HKDF-SHA256 派生 AES-256-GCM 对称密钥
 */
async function deriveAesGcmKey(rawKey) {
	const baseKey = await crypto.subtle.importKey(
		'raw',
		encoder.encode(rawKey),
		'HKDF',
		false,
		['deriveKey']
	);

	return await crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: encoder.encode('epomail-oauth-client-secret-salt-v1'),
			info: encoder.encode('epomail-oauth-client-secret-key-v1')
		},
		baseKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

/**
 * AES-256-GCM 信封加密 Client Secret 并强制 AAD 绑定 client_id
 * 格式: v1:iv:tag:ciphertext
 * @param {object} env
 * @param {string} clientId
 * @param {string} plaintextSecret
 * @returns {Promise<string>}
 */
export async function encryptClientSecret(env, clientId, plaintextSecret) {
	if (!plaintextSecret || typeof plaintextSecret !== 'string') {
		throw new BizError('Client secret plaintext cannot be empty', 400);
	}
	if (!clientId || typeof clientId !== 'string') {
		throw new BizError('Client ID is required for AAD binding', 400);
	}

	const rootKey = getOAuthClientEncKey(env);
	const aesKey = await deriveAesGcmKey(rootKey);

	const iv = crypto.getRandomValues(new Uint8Array(12));
	const aad = encoder.encode(clientId);

	// Web Crypto 的 AES-GCM 密文末尾包含了 16 字节的认证标签 (Authentication Tag)
	const encryptedBuffer = await crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv,
			additionalData: aad,
			tagLength: 128
		},
		aesKey,
		encoder.encode(plaintextSecret)
	);

	const encryptedBytes = new Uint8Array(encryptedBuffer);
	const tagLength = 16;
	const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - tagLength);
	const tag = encryptedBytes.slice(encryptedBytes.length - tagLength);

	return `v1:${uint8ToBase64(iv)}:${uint8ToBase64(tag)}:${uint8ToBase64(ciphertext)}`;
}

/**
 * 解密 AES-256-GCM 封装的 Client Secret (支持对存量明文记录的平滑兼容 Dual-Read)
 * @param {object} env
 * @param {string} clientId
 * @param {string} storedSecret
 * @returns {Promise<string>}
 */
export async function decryptClientSecret(env, clientId, storedSecret) {
	if (!storedSecret) return '';

	// 存量明文平滑兼容
	if (!storedSecret.startsWith('v1:')) {
		return storedSecret;
	}

	const parts = storedSecret.split(':');
	if (parts.length !== 4 || parts[0] !== 'v1') {
		throw new BizError('Invalid encrypted client secret envelope format', 500, 'invalid_secret_envelope');
	}

	const rootKey = getOAuthClientEncKey(env);
	const aesKey = await deriveAesGcmKey(rootKey);

	const iv = base64ToUint8(parts[1]);
	const tag = base64ToUint8(parts[2]);
	const ciphertext = base64ToUint8(parts[3]);

	// 重构 Web Crypto 预期的 ciphertext + tag 缓冲区
	const combined = new Uint8Array(ciphertext.length + tag.length);
	combined.set(ciphertext, 0);
	combined.set(tag, ciphertext.length);

	const aad = encoder.encode(clientId);

	try {
		const decrypted = await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv,
				additionalData: aad,
				tagLength: 128
			},
			aesKey,
			combined
		);
		return decoder.decode(decrypted);
	} catch (e) {
		throw new BizError('Failed to decrypt client secret (integrity failure or AAD mismatch)', 401, 'client_secret_decrypt_failed');
	}
}

/**
 * 校验候选明文 Secret 与存储记录是否匹配
 * @param {object} env
 * @param {string} clientId
 * @param {string} candidatePlaintext
 * @param {string} storedSecret
 * @returns {Promise<boolean>}
 */
export async function verifyClientSecret(env, clientId, candidatePlaintext, storedSecret) {
	if (!candidatePlaintext || !storedSecret) return false;

	if (storedSecret.startsWith('v1:')) {
		try {
			const decrypted = await decryptClientSecret(env, clientId, storedSecret);
			return await timingSafeEqualStr(candidatePlaintext, decrypted);
		} catch (_) {
			return false;
		}
	}

	// 存量明文记录验证
	return await timingSafeEqualStr(candidatePlaintext, storedSecret);
}

export default {
	encryptClientSecret,
	decryptClientSecret,
	verifyClientSecret,
	timingSafeEqualStr
};
