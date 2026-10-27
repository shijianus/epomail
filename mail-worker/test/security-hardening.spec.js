import { describe, it, expect } from 'vitest';
import jwtUtils from '../src/utils/jwt-utils.js';
import hashUtils from '../src/utils/hash-utils.js';
import emailCryptoUtils from '../src/utils/email-crypto-utils.js';
import { isSafePublicUrl } from '../src/utils/url-utils.js';
import fileUtils from '../src/utils/file-utils.js';
import { isAllowedObjectKey, normalizeObjectKey } from '../src/utils/object-key-utils.js';
import { safeObjectHeaders } from '../src/utils/object-response.js';
import { sanitizeSvgString } from '../src/utils/svg-utils.js';
import { verifyRs256Jwt } from '../src/utils/oauth-jwt-utils.js';
import resendService from '../src/service/resend-service.js';
import { PRIVILEGED_PERMS } from '../src/service/rbac-guard-service.js';

const enc = new TextEncoder();

function b64url(bytes) {
	let binary = '';
	for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeB64url(value) {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
	return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

async function signRs256(privateKey, header, payload) {
	const headerPart = b64url(enc.encode(JSON.stringify(header)));
	const payloadPart = b64url(enc.encode(JSON.stringify(payload)));
	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		privateKey,
		enc.encode(`${headerPart}.${payloadPart}`)
	);
	return `${headerPart}.${payloadPart}.${b64url(signature)}`;
}

describe('JWT session tokens', () => {
	const c = { env: { jwt_secret: 'unit-test-jwt-secret-32-bytes-minimum' } };

	it('round-trips a signed token and rejects tampering', async () => {
		const token = await jwtUtils.generateToken(c, { userId: 7, token: 'session-id' }, 60);
		const payload = await jwtUtils.verifyToken(c, token);
		expect(payload.userId).toBe(7);
		expect(payload.token).toBe('session-id');

		const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
		expect(await jwtUtils.verifyToken(c, tampered)).toBeNull();
	});

	it('fails closed when the signing secret is missing', async () => {
		await expect(jwtUtils.generateToken({ env: {} }, { userId: 1 }, 60)).rejects.toThrow('jwt_secret');
		expect(await jwtUtils.verifyToken({ env: {} }, 'a.b.c')).toBeNull();
	});

	it('rejects non-HS256 headers', async () => {
		const header = b64url(enc.encode(JSON.stringify({ alg: 'none', typ: 'JWT' })));
		const payload = b64url(enc.encode(JSON.stringify({ userId: 1, exp: Math.floor(Date.now() / 1000) + 60 })));
		expect(await jwtUtils.verifyToken(c, `${header}.${payload}.sig`)).toBeNull();
	});
});

describe('Email hash tokens', () => {
	const secret = 'unit-test-hmac-secret';

	it('binds an opaque email hash to one user', async () => {
		const hash = await hashUtils.encodeEmailHash(42, 7, secret);
		expect(await hashUtils.decodeEmailHash(hash, 7, secret)).toBe(42);
		expect(await hashUtils.decodeEmailHash(hash, 8, secret)).toBeNull();
	});

	it('fails closed without a secret', async () => {
		await expect(hashUtils.encodeEmailHash(1, 1, '')).rejects.toThrow('jwt_secret');
	});
});

describe('Email encryption', () => {
	const env = { totp_enc_key: 'unit-test-email-encryption-key' };

	it('round-trips AES-GCM fields', async () => {
		const key = await emailCryptoUtils.getUserEmailCryptoKey(env, { userId: 5, salt: 'salt' });
		const encrypted = await emailCryptoUtils.encryptText('secret subject', key);
		expect(encrypted.startsWith('enc:v1:')).toBe(true);
		expect(await emailCryptoUtils.decryptText(encrypted, key)).toBe('secret subject');
	});

	it('refuses to derive a key without configuration', async () => {
		await expect(emailCryptoUtils.getUserEmailCryptoKey({}, 5)).rejects.toThrow('not configured');
	});
});

describe('Network and storage boundaries', () => {
	it('blocks loopback, private, metadata and credential-bearing URLs', () => {
		for (const url of [
			'http://127.0.0.1/',
			'http://localhost/',
			'http://10.1.2.3/',
			'http://172.16.0.1/',
			'http://192.168.1.1/',
			'http://169.254.169.254/latest/meta-data/',
			'http://[::1]/',
			'http://[::ffff:127.0.0.1]/',
			'http://[fe90::1]/',
			'http://[febf::1]/',
			'http://[fec0::1]/',
			'http://[fed0::1]/',
			'http://[feff::1]/',
			'http://metadata.google.internal/',
			'https://user:pass@example.com/',
			'file:///etc/passwd'
		]) {
			expect(isSafePublicUrl(url), url).toBe(false);
		}
		expect(isSafePublicUrl('https://s3.us-west-004.backblazeb2.com')).toBe(true);
		expect(isSafePublicUrl('https://example.com/path')).toBe(true);
		expect(isSafePublicUrl('http://[2001:4860:4860::8888]/')).toBe(true);
	});

	it('only allows object keys under attachments/ or static/', () => {
		expect(isAllowedObjectKey('attachments/abc123.pdf')).toBe(true);
		expect(isAllowedObjectKey('static/avatar/1/abc.png')).toBe(true);
		for (const key of ['auth-uid:1', 'setting:', 'public_key:', '../attachments/x', 'attachments/../x', 'attachments/%2e%2e/x', '/attachments/x', 'foo/bar']) {
			expect(isAllowedObjectKey(key), key).toBe(false);
			expect(normalizeObjectKey(key)).toBeNull();
		}
	});

	it('sanitizes filenames and detects real image signatures', () => {
		expect(fileUtils.sanitizeFilename('..\\..\\evil\r\nX: y.html')).not.toMatch(/[\r\n"\\/]/);
		expect(fileUtils.getExtFileName('photo.PNG')).toBe('.png');
		expect(fileUtils.getExtFileName('photo.html')).toBe('');
		expect(fileUtils.getExtFileName('photo.<script>')).toBe('');
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
		expect(fileUtils.detectImageMime(png)).toBe('image/png');
		expect(fileUtils.detectImageMime(new TextEncoder().encode('<html>not an image</html>'))).toBeNull();
	});

	it('forces untrusted storage content types to safe downloads', () => {
		const html = safeObjectHeaders({ contentType: 'text/html', contentDisposition: 'inline' });
		expect(html['Content-Type']).toBe('application/octet-stream');
		expect(html['Content-Disposition']).toBe('attachment');
		expect(html['X-Content-Type-Options']).toBe('nosniff');

		const png = safeObjectHeaders({ contentType: 'image/png', contentDisposition: 'inline' });
		expect(png['Content-Type']).toBe('image/png');
		expect(png['Content-Disposition']).toBe('inline');

		const svg = safeObjectHeaders({ contentType: 'image/svg+xml', contentDisposition: 'inline' });
		expect(svg['Content-Type']).toBe('application/octet-stream');
		expect(svg['Content-Disposition']).toBe('attachment');
	});

	it('never lets stored metadata make a private attachment publicly cacheable', () => {
		const privateObj = safeObjectHeaders({
			contentType: 'image/png',
			contentDisposition: 'inline',
			cacheControl: 'public, max-age=31536000, immutable',
			isPublic: false
		});
		expect(privateObj['Cache-Control']).toBe('private, no-store');
		expect(privateObj['Cross-Origin-Resource-Policy']).toBe('same-origin');

		const publicObj = safeObjectHeaders({ contentType: 'image/png', isPublic: true });
		expect(publicObj['Cache-Control']).toBe('public, max-age=86400');
		expect(publicObj['Cross-Origin-Resource-Policy']).toBe('cross-origin');
	});
});

describe('SVG and RS256 hardening', () => {
	it('removes scripts and event handlers from SVG icons', () => {
		const cleaned = sanitizeSvgString('<svg onload="alert(1)"><script>alert(2)</script><path d="M0 0" onclick="x()"/></svg>');
		expect(cleaned).not.toContain('<script');
		expect(cleaned.toLowerCase()).not.toContain('onload');
		expect(cleaned.toLowerCase()).not.toContain('onclick');
		expect(cleaned).toContain('<path');
	});

	it('verifies RS256 signatures and rejects a wrong audience', async () => {
		const pair = await crypto.subtle.generateKey(
			{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
			true,
			['sign', 'verify']
		);
		const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
		publicJwk.kid = 'test-key';
		publicJwk.use = 'sig';
		const jwks = { keys: [publicJwk] };
		const now = Math.floor(Date.now() / 1000);

		const token = await signRs256(
			pair.privateKey,
			{ alg: 'RS256', kid: 'test-key', typ: 'JWT' },
			{ iss: 'https://appleid.apple.com', aud: 'client-id', sub: 'user-1', exp: now + 300 }
		);

		const payload = await verifyRs256Jwt(token, jwks, { issuer: 'https://appleid.apple.com', audience: 'client-id' });
		expect(payload.sub).toBe('user-1');
		await expect(verifyRs256Jwt(token, jwks, { issuer: 'https://appleid.apple.com', audience: 'other-client' })).rejects.toThrow('audience');
	});
});

describe('Resend webhook signatures', () => {
	const secret = 'test-webhook-secret';
	const secretB64 = btoa(secret);

	function context() {
		return {
			env: { resend_webhook_secret: `whsec_${secretB64}` },
			req: {
				header(name) {
					const map = {
						'svix-id': 'msg_1',
						'svix-timestamp': String(Math.floor(Date.now() / 1000)),
						'svix-signature': 'v1,invalid'
					};
					return map[name.toLowerCase()];
				}
			}
		};
	}

	async function sign(body, id, timestamp) {
		const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
		const signature = await crypto.subtle.sign('HMAC', key, enc.encode(`${id}.${timestamp}.${body}`));
		return btoa(String.fromCharCode(...new Uint8Array(signature)));
	}

	it('rejects a missing or invalid signature', async () => {
		await expect(resendService.verifySignature(context(), '{"type":"email.delivered"}')).rejects.toThrow();
	});

	it('accepts a valid Svix signature', async () => {
		const body = '{"type":"email.delivered","data":{"email_id":"x"}}';
		const id = 'msg_1';
		const timestamp = String(Math.floor(Date.now() / 1000));
		const signature = await sign(body, id, timestamp);
		const c = context();
		c.req.header = (name) => ({
			'svix-id': id,
			'svix-timestamp': timestamp,
			'svix-signature': `v1,${signature}`
		}[name.toLowerCase()]);
		await expect(resendService.verifySignature(c, body)).resolves.toBeUndefined();
	});

	it('rejects stale timestamps', async () => {
		const body = '{}';
		const id = 'msg_1';
		const timestamp = String(Math.floor(Date.now() / 1000) - 3600);
		const signature = await sign(body, id, timestamp);
		const c = context();
		c.req.header = (name) => ({
			'svix-id': id,
			'svix-timestamp': timestamp,
			'svix-signature': `v1,${signature}`
		}[name.toLowerCase()]);
		await expect(resendService.verifySignature(c, body)).rejects.toThrow(/timestamp/i);
	});
});

describe('RBAC privileged permission set', () => {
	it('always classifies password and role management as privileged', () => {
		for (const key of ['user:set-pwd', 'user:set-type', 'role:set', 'setting:set']) {
			expect(PRIVILEGED_PERMS.has(key)).toBe(true);
		}
		expect(PRIVILEGED_PERMS.has('email:send')).toBe(false);
	});
});
