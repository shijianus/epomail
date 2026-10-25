/**
 * Minimal RS256 JWT verification for third-party OIDC providers (Apple).
 * The token signature MUST be checked against the provider JWKS; decoding the
 * payload alone is never sufficient.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlToBytes(value) {
	const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function decodeJson(value) {
	return JSON.parse(decoder.decode(base64UrlToBytes(value)));
}

export async function verifyRs256Jwt(token, jwks, { issuer, audience, clockSkewSeconds = 300 } = {}) {
	if (!token || typeof token !== 'string') throw new Error('Missing JWT');
	const parts = token.split('.');
	if (parts.length !== 3) throw new Error('Malformed JWT');

	let header;
	try {
		header = decodeJson(parts[0]);
	} catch (_) {
		throw new Error('Malformed JWT header');
	}
	if (!header || header.alg !== 'RS256' || !header.kid) {
		throw new Error('Unsupported JWT algorithm');
	}

	const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
	const jwk = keys.find(key => key && key.kid === header.kid && key.kty === 'RSA' && (!key.use || key.use === 'sig'));
	if (!jwk) throw new Error('JWT signing key not found');

	const key = await crypto.subtle.importKey(
		'jwk',
		jwk,
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['verify']
	);

	const valid = await crypto.subtle.verify(
		'RSASSA-PKCS1-v1_5',
		key,
		base64UrlToBytes(parts[2]),
		encoder.encode(`${parts[0]}.${parts[1]}`)
	);
	if (!valid) throw new Error('JWT signature invalid');

	const payload = decodeJson(parts[1]);
	const now = Math.floor(Date.now() / 1000);

	if (!payload || typeof payload !== 'object') throw new Error('Malformed JWT payload');
	if (payload.exp !== undefined && Number(payload.exp) + clockSkewSeconds < now) {
		throw new Error('JWT expired');
	}
	if (payload.nbf !== undefined && Number(payload.nbf) - clockSkewSeconds > now) {
		throw new Error('JWT not yet valid');
	}
	if (issuer && payload.iss !== issuer) {
		throw new Error('JWT issuer mismatch');
	}
	if (audience) {
		const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
		if (!audiences.includes(audience)) {
			throw new Error('JWT audience mismatch');
		}
	}

	return payload;
}

const APPLE_JWKS_KEY = 'apple_jwks_v1';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

export async function getAppleJwks(c) {
	try {
		const cached = await c.env.kv.get(APPLE_JWKS_KEY, { type: 'json' });
		if (cached && Array.isArray(cached.keys) && cached.keys.length > 0) return cached;
	} catch (_) {}

	const response = await fetch(APPLE_JWKS_URL, { signal: AbortSignal.timeout(5000) });
	if (!response.ok) {
		throw new Error(`Unable to fetch Apple JWKS (HTTP ${response.status})`);
	}
	const jwks = await response.json();
	if (!jwks || !Array.isArray(jwks.keys)) {
		throw new Error('Invalid Apple JWKS response');
	}
	try {
		await c.env.kv.put(APPLE_JWKS_KEY, JSON.stringify(jwks), { expirationTtl: 3600 });
	} catch (_) {}
	return jwks;
}

export async function verifyAppleIdToken(c, idToken, clientId) {
	const jwks = await getAppleJwks(c);
	return verifyRs256Jwt(idToken, jwks, {
		issuer: 'https://appleid.apple.com',
		audience: clientId
	});
}

export default { verifyRs256Jwt, getAppleJwks, verifyAppleIdToken };
