const encoder = new TextEncoder();

const DEFAULT_TTL_SECONDS = 300;
const MAX_TTL_SECONDS = 7 * 24 * 3600;
const DEFAULT_STATIC_TTL_SECONDS = 3600;

function base64UrlEncode(bytes) {
	let binary = '';
	for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(value) {
	const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
	return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

async function importKey(c) {
	const secret = c?.env?.jwt_secret;
	if (!secret || typeof secret !== 'string' || !secret.trim()) {
		throw new Error('jwt_secret is not configured');
	}
	return crypto.subtle.importKey(
		'raw',
		encoder.encode(secret.trim()),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

function signedMessage(key, expiresAt, ownerUserId) {
	return `epomail-object-v1\n${key}\n${expiresAt}\n${ownerUserId || 0}`;
}

function clampTtl(ttlSeconds) {
	const ttl = Number(ttlSeconds);
	if (!Number.isFinite(ttl) || ttl <= 0) return DEFAULT_TTL_SECONDS;
	return Math.min(Math.floor(ttl), MAX_TTL_SECONDS);
}

/**
 * Short-lived capability signature for worker-hosted attachment URLs.
 * The signature binds the normalized object key, expiry and owning user id.
 */
export async function signObjectAccess(c, key, { ttlSeconds = DEFAULT_TTL_SECONDS, userId = null } = {}) {
	const expiresAt = Math.floor(Date.now() / 1000) + clampTtl(ttlSeconds);
	const ownerUserId = Number(userId) || 0;
	const cryptoKey = await importKey(c);
	const signature = await crypto.subtle.sign(
		'HMAC',
		cryptoKey,
		encoder.encode(signedMessage(key, expiresAt, ownerUserId))
	);
	return {
		exp: expiresAt,
		uid: ownerUserId,
		sig: base64UrlEncode(signature)
	};
}

export async function buildSignedObjectUrl(c, key, options = {}) {
	const token = await signObjectAccess(c, key, options);
	const params = new URLSearchParams({
		exp: String(token.exp),
		uid: String(token.uid),
		sig: token.sig
	});
	return `/oss/${key}?${params.toString()}`;
}

/**
 * Verify an attachment capability. Returns the bound owner id or null.
 * Missing configuration, malformed values and bad signatures all fail closed.
 */
export async function verifyObjectAccess(c, key, url) {
	try {
		if (!key || typeof key !== 'string') return null;
		const exp = Number(url?.searchParams?.get('exp'));
		const uid = Number(url?.searchParams?.get('uid') || 0);
		const sig = url?.searchParams?.get('sig') || '';
		if (!Number.isSafeInteger(exp) || exp <= 0 || !sig) return null;
		if (!Number.isSafeInteger(uid) || uid < 0) return null;

		const now = Math.floor(Date.now() / 1000);
		if (exp < now) return null;
		// Reject signatures issued with an unreasonable lifetime even if the
		// secret is later leaked; normal signers clamp to MAX_TTL_SECONDS.
		if (exp > now + MAX_TTL_SECONDS + 60) return null;

		const cryptoKey = await importKey(c);
		const valid = await crypto.subtle.verify(
			'HMAC',
			cryptoKey,
			base64UrlDecode(sig),
			encoder.encode(signedMessage(key, exp, uid))
		);
		return valid ? { exp, userId: uid } : null;
	} catch (_) {
		return null;
	}
}

export const OBJECT_TOKEN_DEFAULTS = {
	tokenTtlSeconds: DEFAULT_TTL_SECONDS,
	staticUrlTtlSeconds: DEFAULT_STATIC_TTL_SECONDS,
	maxTtlSeconds: MAX_TTL_SECONDS
};

export default { signObjectAccess, buildSignedObjectUrl, verifyObjectAccess, OBJECT_TOKEN_DEFAULTS };
