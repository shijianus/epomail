import { describe, it, expect, vi } from 'vitest';
import jwtUtils from '../src/utils/jwt-utils.js';
import hashUtils from '../src/utils/hash-utils.js';
import emailCryptoUtils from '../src/utils/email-crypto-utils.js';
import { isSafePublicUrl, assertSafePublicUrl } from '../src/utils/url-utils.js';
import fileUtils from '../src/utils/file-utils.js';
import { isAllowedObjectKey, normalizeObjectKey } from '../src/utils/object-key-utils.js';
import { safeObjectHeaders } from '../src/utils/object-response.js';
import { sanitizeSvgString } from '../src/utils/svg-utils.js';
import { verifyRs256Jwt } from '../src/utils/oauth-jwt-utils.js';
import resendService from '../src/service/resend-service.js';
import { PRIVILEGED_PERMS } from '../src/service/rbac-guard-service.js';
import { isOfficialEmailRow } from '../src/service/email-service.js';
import { applyRules } from '../src/email/rule-engine.js';
import reqUtils from '../src/utils/req-utils.js';
import userService from '../src/service/user-service.js';
import roleService from '../src/service/role-service.js';
import accountService from '../src/service/account-service.js';
import loginService from '../src/service/login-service.js';
import rateLimit from '../src/utils/rate-limit.js';
import cryptoUtils from '../src/utils/crypto-utils.js';

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

	it('round-trips AES-GCM fields and decouples mailbox key from mutable password salt', async () => {
		const keyA = await emailCryptoUtils.getUserEmailCryptoKey(env, { userId: 5, salt: 'old-pwd-salt' });
		const keyB = await emailCryptoUtils.getUserEmailCryptoKey(env, { userId: 5, salt: 'rotated-pwd-salt' });
		const keyC = await emailCryptoUtils.getUserEmailCryptoKey(env, 5);
		const encrypted = await emailCryptoUtils.encryptText('secret subject', keyA);
		expect(encrypted.startsWith('enc:v1:')).toBe(true);
		expect(await emailCryptoUtils.decryptText(encrypted, keyB)).toBe('secret subject');
		expect(await emailCryptoUtils.decryptText(encrypted, keyC)).toBe('secret subject');
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
			'http://[::127.0.0.1]/',
			'http://[64:ff9b::10.0.0.1]/',
			'http://[2002:7f00:1::]/',
			'http://[febf::1]/',
			'http://metadata.google.internal/',
			'https://user:pass@example.com/',
			'file:///etc/passwd'
		]) {
			expect(isSafePublicUrl(url), url).toBe(false);
		}
		expect(isSafePublicUrl('https://s3.us-west-004.backblazeb2.com')).toBe(true);
		expect(isSafePublicUrl('https://example.com/path')).toBe(true);
	});

	it('rejects DNS answers that resolve a public hostname into private space', async () => {
		const privateDns = async () => ({ ok: true, json: async () => ({ Answer: [{ data: '10.0.0.7' }] }) });
		const publicDns = async (url) => ({ ok: true, json: async () => ({ Answer: [{ data: url.includes('type=AAAA') ? '2606:4700:4700::1111' : '8.8.8.8' }] }) });
		expect(await assertSafePublicUrl('https://storage.example.com', { fetchImpl: privateDns })).toBe(false);
		expect(await assertSafePublicUrl('https://storage.example.com', { fetchImpl: publicDns })).toBe(true);
		expect(await assertSafePublicUrl('https://127.0.0.1', { fetchImpl: publicDns })).toBe(false);
	});

	it('rejects DNS answers that point a BYO endpoint into private space', async () => {
		const answer = (data) => new Response(JSON.stringify({ Status: 0, Answer: [{ data }] }), {
			status: 200, headers: { 'Content-Type': 'application/dns-json' }
		});
		const fetchImpl = vi.fn(async (url) => {
			const type = new URL(url).searchParams.get('type');
			return type === 'A' ? answer('93.184.216.34') : answer('2606:2800:220:1:248:1893:25c8:1946');
		});
		await expect(assertSafePublicUrl('https://storage.example.com', { fetchImpl })).resolves.toBe(true);

		const privateFetch = vi.fn(async (url) => {
			const type = new URL(url).searchParams.get('type');
			return type === 'A' ? answer('10.0.0.8') : answer('fd00::1');
		});
		await expect(assertSafePublicUrl('https://storage.example.com', { fetchImpl: privateFetch })).resolves.toBe(false);
		await expect(assertSafePublicUrl('https://storage.example.com', {
			fetchImpl: vi.fn(async () => { throw new Error('dns unavailable'); })
		})).resolves.toBe(false);
		await expect(assertSafePublicUrl('https://93.184.216.34', { fetchImpl })).resolves.toBe(true);

		// CNAME-only or CNAME-to-localhost answers must never satisfy assertSafePublicUrl
		const cnameOnlyFetch = vi.fn(async () => answer('target.example.com.'));
		await expect(assertSafePublicUrl('https://cname.example.com', { fetchImpl: cnameOnlyFetch })).resolves.toBe(false);

		const cnameToPrivateFetch = vi.fn(async () => new Response(JSON.stringify({
			Status: 0,
			Answer: [
				{ type: 5, data: 'target.example.com.' },
				{ type: 1, data: '127.0.0.1' }
			]
		}), { status: 200, headers: { 'Content-Type': 'application/dns-json' } }));
		await expect(assertSafePublicUrl('https://cname.example.com', { fetchImpl: cnameToPrivateFetch })).resolves.toBe(false);
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

		const named = safeObjectHeaders({ contentType: 'application/pdf', filename: 'invoice 2026.pdf' });
		expect(named['Content-Disposition']).toContain('attachment');
		expect(named['Content-Disposition']).toContain('filename="invoice 2026.pdf"');
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

describe('Freeze convergence regressions (P1/P2)', () => {
	it('only grants isOfficial badge to genuine system rows without inbound/outbound claim keys and blocks reserved labels in rules', () => {
		expect(isOfficialEmailRow({
			sendEmail: 'announcement@epocanvas.com',
			receiveClaimKey: null,
			outboundTaskId: null
		})).toBe(true);

		expect(isOfficialEmailRow({
			sendEmail: 'announcement@epocanvas.com',
			receiveClaimKey: 'claim:external-spoof',
			outboundTaskId: null
		})).toBe(false);

		expect(isOfficialEmailRow({
			sendEmail: 'admin@epocanvas.com',
			receiveClaimKey: 'local:1:2',
			outboundTaskId: null
		})).toBe(false);

		expect(isOfficialEmailRow({
			sendEmail: 'attacker@example.com',
			labels: '["官方"]',
			receiveClaimKey: null,
			outboundTaskId: null
		})).toBe(false);

		const ruleOut = applyRules(
			{ sendEmail: 'anyone@example.com', subject: 'hi', content: 'body', text: 'body' },
			JSON.stringify([
				{ name: '官方', rules: [{ condition: { type: 'all_messages' } }] },
				{ name: '安全', rules: [{ condition: { type: 'all_messages' } }] },
				{ name: '自定义标签', rules: [{ condition: { type: 'all_messages' } }] }
			])
		);
		expect(JSON.parse(ruleOut.labelsStr)).toEqual(['自定义标签']);
	});

	it('enforces blog sync role allowlist and protects visitor/moderator/master accounts', async () => {
		const selectSpy = vi.spyOn(userService, 'selectById');
		const roleListSpy = vi.spyOn(roleService, 'roleList').mockResolvedValue([
			{ roleId: 1, roleCode: 'master', name: '站长' },
			{ roleId: 2, roleCode: 'moderator', name: '协管者' },
			{ roleId: 3, roleCode: 'visitor', name: '参观者' },
			{ roleId: 4, roleCode: 'user_base', name: '普通用户' },
			{ roleId: 5, roleCode: 'user_lv1', name: 'LV1用户', storageQuotaMb: 25, sendCount: 10 }
		]);
		const blogInfoSpy = vi.spyOn(userService, 'getBlogLevelInfo');

		// 1. Visitor cannot sync blog level
		selectSpy.mockResolvedValueOnce({ userId: 10, email: 'visitor@example.com', type: 3 });
		await expect(userService.syncBlogLevel({ env: {} }, 10)).rejects.toThrow(/参观者/);

		// 2. Moderator is not downgraded by blog sync
		selectSpy.mockResolvedValueOnce({ userId: 11, email: 'mod@example.com', type: 2 });
		blogInfoSpy.mockResolvedValueOnce({ hasBlogAccount: true, level: 0, levelName: '认证书友', mappedEpomailRole: 'user_lv0' });
		const modRes = await userService.syncBlogLevel({ env: {} }, 11);
		expect(modRes.synced).toBe(true);
		expect(modRes.newRoleName).toBe('协管者');

		// 3. Forged/compromised blog response returning mappedEpomailRole='master' is rejected
		selectSpy.mockResolvedValueOnce({ userId: 12, email: 'user@example.com', type: 4 });
		blogInfoSpy.mockResolvedValueOnce({ hasBlogAccount: true, level: 3, levelName: '终身学者', mappedEpomailRole: 'master' });
		await expect(userService.syncBlogLevel({ env: {} }, 12)).rejects.toThrow(/非法的目标同步角色分组/);

		selectSpy.mockRestore();
		roleListSpy.mockRestore();
		blogInfoSpy.mockRestore();
	});

	it('ignores spoofed X-Forwarded-For in reqUtils.getIp', () => {
		const spoofedCtx = {
			req: {
				header(name) {
					if (name === 'X-Forwarded-For') return '1.2.3.4, 5.6.7.8';
					return '';
				}
			}
		};
		expect(reqUtils.getIp(spoofedCtx)).toBe('Unknown');

		const cfCtx = {
			req: {
				header(name) {
					if (name === 'CF-Connecting-IP') return '203.0.113.9';
					if (name === 'X-Forwarded-For') return '1.2.3.4';
					return '';
				}
			}
		};
		expect(reqUtils.getIp(cfCtx)).toBe('203.0.113.9');
	});

	it('blocks visitor and admin-squatting in accountService.setName', async () => {
		const selectUserSpy = vi.spyOn(userService, 'selectById').mockResolvedValue({
			userId: 20,
			email: 'normal@example.com',
			type: 4
		});
		const selectRoleSpy = vi.spyOn(roleService, 'selectById').mockResolvedValue({
			roleId: 4,
			roleCode: 'user_base'
		});

		await expect(accountService.setName(
			{ env: { admin: 'admin@example.com' } },
			{ accountId: 1, name: 'admin' },
			20
		)).rejects.toThrow();

		selectRoleSpy.mockResolvedValueOnce({ roleId: 3, roleCode: 'visitor' });
		await expect(accountService.setName(
			{ env: { admin: 'admin@example.com' } },
			{ accountId: 1, name: 'normal-nick' },
			20
		)).rejects.toThrow(/参观者/);

		selectUserSpy.mockRestore();
		selectRoleSpy.mockRestore();
	});

	it('accumulates login failure lockout across canonical userRow.email when logging in via alias or short username', async () => {
		const kvStore = new Map();
		const c = {
			env: {
				admin: 'admin@example.com',
				kv: {
					get: async (k) => kvStore.get(k) ?? null,
					put: async (k, v) => { kvStore.set(k, v); },
					delete: async (k) => { kvStore.delete(k); }
				}
			},
			req: { header: () => '' }
		};
		const rlSpy = vi.spyOn(rateLimit, 'check').mockResolvedValue(undefined);
		const userByEmailSpy = vi.spyOn(userService, 'selectByEmailIncludeDel').mockResolvedValue(null);
		const accByEmailSpy = vi.spyOn(accountService, 'selectByEmailIncludeDel').mockImplementation(async (_c, email) => {
			if (email.startsWith('alias')) return { accountId: 10, userId: 77, email };
			return null;
		});
		const userByIdSpy = vi.spyOn(userService, 'selectByIdIncludeDel').mockResolvedValue({
			userId: 77,
			email: 'canonical@example.com',
			password: 'stored-hash',
			salt: 'stored-salt',
			isDel: 0,
			status: 0
		});
		const verifySpy = vi.spyOn(cryptoUtils, 'verifyPasswordWithUpgrade').mockResolvedValue({ isValid: false });

		// 5 failed attempts rotating across distinct aliases of the same account
		for (let i = 1; i <= 5; i++) {
			await expect(loginService.login(c, { email: `alias${i}@example.com`, password: 'wrong' })).rejects.toThrow();
		}

		// The 6th attempt via a brand-new alias is blocked because canonical@example.com reached 5 failures
		await expect(loginService.login(c, { email: 'alias6@example.com', password: 'wrong' })).rejects.toThrow();
		expect(kvStore.get('login_fail:canonical@example.com')).toBe('5');
		expect(verifySpy).toHaveBeenCalledTimes(5);

		rlSpy.mockRestore();
		userByEmailSpy.mockRestore();
		accByEmailSpy.mockRestore();
		userByIdSpy.mockRestore();
		verifySpy.mockRestore();
	});
});
