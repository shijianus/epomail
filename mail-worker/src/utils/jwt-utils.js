import safeLogger from './safe-logger.js';
import { isSessionRevoked, readMailboxAccess } from './session-revocation.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const base64url = (input) => {
	const str = btoa(String.fromCharCode(...new Uint8Array(input)));
	return str.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const base64urlDecode = (str) => {
	str = str.replace(/-/g, '+').replace(/_/g, '/');
	while (str.length % 4) str += '=';
	return Uint8Array.from(atob(str), c => c.charCodeAt(0));
};

const issuedHeader = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
let verificationKey;

function requireJwtSecret(c) {
	const secret = c?.env?.jwt_secret;
	if (!secret || typeof secret !== 'string' || !secret.trim()) {
		throw new Error('jwt_secret is not configured');
	}
	return secret.trim();
}

// Only standard login JWTs have an account/session revocation record.
export function hasSessionRevocationCheck(payload) {
	return !payload.purpose && Boolean(payload.userId && payload.token);
}

async function verifySignedClaims(c, token) {
	try {
		const secret = requireJwtSecret(c);
		if (!token) return null;
		const cleanToken = typeof token === 'string' && token.startsWith('Bearer ') ? token.slice(7).trim() : (typeof token === 'string' ? token.trim() : '');
		const parts = cleanToken.split('.');
		if (parts.length !== 3) return null;
		const [headerB64, payloadB64, signatureB64] = parts;

		if (!headerB64 || !payloadB64 || !signatureB64) return null;

		// Reject non-HS256 headers explicitly. The signature below is always
		// HMAC-SHA256, so this prevents algorithm-confusion style confusion.
		if (headerB64 !== issuedHeader) {
			try {
				if (JSON.parse(decoder.decode(base64urlDecode(headerB64)))?.alg !== 'HS256') return null;
			} catch {
				return null;
			}
		}

		const data = `${headerB64}.${payloadB64}`;
		// An isolate retains only a settled CryptoKey for the current secret.
		// Concurrent cold requests own their imports. After a rotation an older
		// import can only write its old slot, never replace the new key.
		if (verificationKey?.secret !== secret) verificationKey = { secret, key: null };
		const slot = verificationKey;
		const key = slot.key ?? await crypto.subtle.importKey(
			'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
		);
		slot.key = key;

		const valid = await crypto.subtle.verify(
			'HMAC',
			key,
			base64urlDecode(signatureB64),
			encoder.encode(data)
		);

		if (!valid) return null;

		const payloadJson = decoder.decode(base64urlDecode(payloadB64));
		const payload = JSON.parse(payloadJson);

		const now = Math.floor(Date.now() / 1000);
		// 无 exp 的令牌一律拒绝：本系统签发的所有 JWT（会话/受限通知/分享/访问令牌）
		// 都携带 exp，缺失即异常构造，绝不给"永不过期"留任何通道。
		if (!Number.isFinite(payload.exp) || payload.exp <= now) return null;

		return payload;
	} catch (err) {
		safeLogger.warn('jwt_verify_failed', { error: err });
		return null;
	}
}

const jwtUtils = {
	async generateTokenWithSecret(c, secret, payload, expiresInSeconds) {
		if (!secret || typeof secret !== 'string' || !secret.trim()) {
			throw new Error('JWT signing secret is not configured');
		}
		const now = Math.floor(Date.now() / 1000);
		const defaultTtl = 30 * 24 * 3600; // 30 days default expiration
		const exp = now + (expiresInSeconds || defaultTtl);

		const fullPayload = {
			...payload,
			iat: now,
			exp
		};

		const payloadStr = base64url(encoder.encode(JSON.stringify(fullPayload)));
		const data = `${issuedHeader}.${payloadStr}`;

		const key = await crypto.subtle.importKey(
			'raw',
			encoder.encode(secret.trim()),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);

		const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
		const signatureStr = base64url(signature);

		return `${data}.${signatureStr}`;
	},

	async generateToken(c, payload, expiresInSeconds) {
		return await this.generateTokenWithSecret(c, requireJwtSecret(c), payload, expiresInSeconds);
	},

	async verifyToken(c, token) {
		const claims = await verifySignedClaims(c, token);
		if (!claims || !hasSessionRevocationCheck(claims)) return claims;
		try {
			return await isSessionRevoked(c, claims.userId, claims.token) ? null : claims;
		} catch (error) {
			safeLogger.warn('jwt_verify_failed', { error });
			return null;
		}
	},

	async verifyMailboxAccess(c, token, permissionKeys) {
		const claims = await verifySignedClaims(c, token);
		if (!claims || claims.purpose === 'restricted_notice') return { claims, currentUser: null };
		if (!hasSessionRevocationCheck(claims)) return { claims: null, currentUser: null };
		let currentUser;
		try {
			currentUser = await readMailboxAccess(c, claims, permissionKeys);
		} catch (error) {
			// Keep the established fail-closed response when revocation is unavailable.
			// Other storage errors remain visible to the application's error handler.
			try {
				if (await isSessionRevoked(c, claims.userId, claims.token)) return { claims: null, currentUser: null };
			} catch {
				return { claims: null, currentUser: null };
			}
			throw error;
		}
		if (!currentUser || currentUser.revoked) return { claims: null, currentUser: null };
		return { claims, currentUser };
	}
};

export default jwtUtils;
