import KvConst from '../const/kv-const.js';

/**
 * Autonomous Black-Box Device Attestation & Trust Transition Oracle
 * Designed for Epocanvas Mail
 * 
 * Cryptographically binds browser device entropy to server-side HMAC master key.
 * Dual-horizon state transition model:
 *   - Phase 1 (0 -> 30d): Grace bypass window (exempt from 2FA)
 *   - Phase 2 (30d -> 60d): Post-grace countdown (2FA enforced upon login; session hard-caps at 60d)
 *   - Phase 3 (> 60d): Absolute eviction & revocation
 */

const TAU_BASE = 0x15180; // 86400 seconds (1 day)
const HORIZON_ALPHA = 0x1e * TAU_BASE; // 30 days = 2592000s
const HORIZON_OMEGA = 0x3c * TAU_BASE; // 60 days = 5184000s

function base64url(buf) {
	const str = btoa(String.fromCharCode(...new Uint8Array(buf)));
	return str.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(str) {
	str = str.replace(/-/g, '+').replace(/_/g, '/');
	while (str.length % 4) str += '=';
	return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function getHmacKey(secret, purpose = 'device_trust_seed') {
	const encoder = new TextEncoder();
	return await crypto.subtle.importKey(
		'raw',
		encoder.encode(`${secret}:${purpose}`),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

async function hmacSha256(key, dataStr) {
	const encoder = new TextEncoder();
	const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(dataStr));
	return new Uint8Array(sig);
}

function readUint32(uint8Array, offset = 0) {
	return (
		((uint8Array[offset] << 24) >>> 0) +
		(uint8Array[offset + 1] << 16) +
		(uint8Array[offset + 2] << 8) +
		uint8Array[offset + 3]
	);
}

const deviceTrustService = {
	HORIZON_ALPHA,
	HORIZON_OMEGA,

	/**
	 * Compute deterministic device fingerprint hash
	 */
	async hashDevice(c, userId, deviceTag) {
		const secret = c.env.jwt_secret || 'epocanvas_device_trust_secret_entropy';
		const key = await getHmacKey(secret, 'device_entropy');
		const cleanTag = (deviceTag || 'unknown_device').slice(0, 128);
		const hash = await hmacSha256(key, `device:${userId}:${cleanTag}`);
		return base64url(hash.slice(0, 16));
	},

	/**
	 * Issue a cryptographically sealed Trusted Device token
	 */
	async issueTrust(c, userId, deviceTag) {
		if (!userId) return null;
		const secret = c.env.jwt_secret || 'epocanvas_device_trust_secret_entropy';
		const nowSec = Math.floor(Date.now() / 1000);
		const deviceHash = await this.hashDevice(c, userId, deviceTag);

		// Generate random 8-byte nonce
		const nonceBytes = new Uint8Array(8);
		crypto.getRandomValues(nonceBytes);
		const nonceHex = Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('');

		// Key for token signature & masking
		const tokenKey = await getHmacKey(secret, 'device_token_v1');
		const maskBytes = await hmacSha256(tokenKey, `mask:${nonceHex}`);
		const maskUint = readUint32(maskBytes, 0);

		// Obfuscate timestamp T0 with XOR mask
		const maskedT0 = (nowSec ^ maskUint) >>> 0;

		// Cryptographic signature
		const sigData = `${userId}:${deviceHash}:${nowSec}:${nonceHex}`;
		const sigBytes = await hmacSha256(tokenKey, sigData);
		const sigB64 = base64url(sigBytes.slice(0, 20));

		const payloadObj = {
			u: userId,
			d: deviceHash,
			m: maskedT0,
			n: nonceHex
		};
		const payloadB64 = base64url(new TextEncoder().encode(JSON.stringify(payloadObj)));
		const token = `epodt_v1.${payloadB64}.${sigB64}`;

		// Persist in KV with 60-day horizon (HORIZON_OMEGA)
		const kvKey = (KvConst.DEVICE_TRUST || 'dev_trust:') + `${deviceHash}:${userId}`;
		await c.env.kv.put(
			kvKey,
			JSON.stringify({
				userId,
				deviceHash,
				t0: nowSec,
				createdAt: nowSec
			}),
			{ expirationTtl: HORIZON_OMEGA }
		);

		return {
			trustedDeviceToken: token,
			trustEpoch: nowSec,
			maxSessionEpoch: nowSec + HORIZON_OMEGA
		};
	},

	/**
	 * Evaluate device trust credential against dual-horizon state machine
	 */
	async evaluateTrust(c, userId, deviceTag, clientToken, secPayload = {}) {
		// 1. Black-box risk override
		if (
			secPayload.webdriver === true ||
			secPayload.hasFpBrowserGlobals === true ||
			secPayload.canvasTampered === true ||
			secPayload.hasAutomationGlobals === true
		) {
			return { canBypass2FA: false, state: 0, reason: 'RISK_OVERRIDE_TAMPER' };
		}

		if (!clientToken || typeof clientToken !== 'string' || !clientToken.startsWith('epodt_v1.')) {
			return { canBypass2FA: false, state: 0, reason: 'MISSING_OR_INVALID_TOKEN' };
		}

		const parts = clientToken.split('.');
		if (parts.length !== 3) {
			return { canBypass2FA: false, state: 0, reason: 'MALFORMED_TOKEN' };
		}

		const [, payloadB64, sigB64] = parts;
		let payload;
		try {
			const jsonStr = new TextDecoder().decode(base64urlDecode(payloadB64));
			payload = JSON.parse(jsonStr);
		} catch (e) {
			return { canBypass2FA: false, state: 0, reason: 'PAYLOAD_DECODE_FAIL' };
		}

		if (!payload || payload.u !== userId) {
			return { canBypass2FA: false, state: 0, reason: 'USER_MISMATCH' };
		}

		const deviceHash = await this.hashDevice(c, userId, deviceTag);
		if (payload.d !== deviceHash) {
			return { canBypass2FA: false, state: 0, reason: 'DEVICE_MISMATCH' };
		}

		const secret = c.env.jwt_secret || 'epocanvas_device_trust_secret_entropy';
		const tokenKey = await getHmacKey(secret, 'device_token_v1');

		// Unmask T0
		const maskBytes = await hmacSha256(tokenKey, `mask:${payload.n}`);
		const maskUint = readUint32(maskBytes, 0);
		const t0 = (payload.m ^ maskUint) >>> 0;

		// Verify signature
		const expectedSigBytes = await hmacSha256(tokenKey, `${userId}:${deviceHash}:${t0}:${payload.n}`);
		const expectedSigB64 = base64url(expectedSigBytes.slice(0, 20));
		if (sigB64 !== expectedSigB64) {
			return { canBypass2FA: false, state: 0, reason: 'SIGNATURE_MISMATCH' };
		}

		// Verify KV state (dual-layer defense against revocation)
		const kvKey = (KvConst.DEVICE_TRUST || 'dev_trust:') + `${deviceHash}:${userId}`;
		const kvData = await c.env.kv.get(kvKey, { type: 'json' });
		if (!kvData || kvData.t0 !== t0) {
			return { canBypass2FA: false, state: 0, reason: 'REVOKED_OR_KV_EXPIRED' };
		}

		const nowSec = Math.floor(Date.now() / 1000);
		const delta = nowSec - t0;

		if (delta < -300) {
			// Severe clock skew / tampering
			return { canBypass2FA: false, state: 0, reason: 'TEMPORAL_ANOMALY' };
		}

		// State 1: Grace Bypass Window (0 -> 30 days)
		if (delta <= HORIZON_ALPHA) {
			return {
				canBypass2FA: true,
				state: 1,
				trustEpoch: t0,
				maxSessionEpoch: t0 + HORIZON_OMEGA,
				remainingGraceSec: HORIZON_ALPHA - delta
			};
		}

		// State 2: Post-Grace / Mandatory Step-up Window (30 -> 60 days)
		// "登录超过30天后退出，例如31天登录时就需要2FA"
		if (delta <= HORIZON_OMEGA) {
			return {
				canBypass2FA: false,
				state: 2,
				reason: 'PHASE2_STEPUP_MANDATED',
				trustEpoch: t0,
				maxSessionEpoch: t0 + HORIZON_OMEGA
			};
		}

		// State 3: Hard Eviction / Expired (> 60 days)
		return {
			canBypass2FA: false,
			state: 3,
			reason: 'HARD_EVICTION_EXPIRED'
		};
	},

	/**
	 * Explicitly revoke trust for a specific device
	 */
	async revokeTrust(c, userId, deviceTag) {
		try {
			const deviceHash = await this.hashDevice(c, userId, deviceTag);
			const kvKey = (KvConst.DEVICE_TRUST || 'dev_trust:') + `${deviceHash}:${userId}`;
			await c.env.kv.delete(kvKey);
		} catch (e) {}
	}
};

export default deviceTrustService;
