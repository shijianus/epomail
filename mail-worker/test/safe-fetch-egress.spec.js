import { describe, expect, it, vi } from 'vitest';
import { isSafeTargetUrl, readBoundedText, safeFetch } from '../src/utils/safe-fetch.js';

describe('B5: Unified Outbound safeFetch & SSRF Defense Specification', () => {
	describe('URL & SSRF Target Validation', () => {
		it('accepts legitimate public HTTPS URLs', () => {
			expect(isSafeTargetUrl('https://api.openai.com/v1/chat/completions')).toBe(true);
			expect(isSafeTargetUrl('https://github.com/login/oauth/access_token')).toBe(true);
			expect(isSafeTargetUrl('https://api.resend.com/emails')).toBe(true);
			expect(isSafeTargetUrl('https://challenges.cloudflare.com/turnstile/v0/siteverify')).toBe(true);
		});

		it('rejects non-HTTP/HTTPS protocols', () => {
			expect(isSafeTargetUrl('file:///etc/passwd')).toBe(false);
			expect(isSafeTargetUrl('ftp://ftp.example.com/')).toBe(false);
			expect(isSafeTargetUrl('gopher://evil.com/')).toBe(false);
			expect(isSafeTargetUrl('javascript:alert(1)')).toBe(false);
			expect(isSafeTargetUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
		});

		it('rejects URLs containing embedded user credentials', () => {
			expect(isSafeTargetUrl('https://admin:secret@api.example.com/data')).toBe(false);
			expect(isSafeTargetUrl('http://user@example.com/')).toBe(false);
		});

		it('rejects private and loopback IPv4 ranges', () => {
			// Loopback 127.0.0.0/8
			expect(isSafeTargetUrl('http://127.0.0.1:8080/')).toBe(false);
			expect(isSafeTargetUrl('https://127.0.0.2/')).toBe(false);
			expect(isSafeTargetUrl('http://127.255.255.254/')).toBe(false);
			// 10.0.0.0/8
			expect(isSafeTargetUrl('https://10.0.0.1/')).toBe(false);
			expect(isSafeTargetUrl('https://10.254.1.1/')).toBe(false);
			// 172.16.0.0/12
			expect(isSafeTargetUrl('https://172.16.0.1/')).toBe(false);
			expect(isSafeTargetUrl('https://172.31.255.255/')).toBe(false);
			// 192.168.0.0/16
			expect(isSafeTargetUrl('https://192.168.1.1/')).toBe(false);
			// 0.0.0.0/8
			expect(isSafeTargetUrl('http://0.0.0.0/')).toBe(false);
			// 100.64.0.0/10 (CGNAT)
			expect(isSafeTargetUrl('https://100.64.0.1/')).toBe(false);
			expect(isSafeTargetUrl('https://100.127.255.255/')).toBe(false);
			// 169.254.0.0/16 (Link Local / Cloud Metadata)
			expect(isSafeTargetUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
			// 198.18.0.0/15
			expect(isSafeTargetUrl('https://198.18.0.1/')).toBe(false);
		});

		it('rejects alternative / mixed IP representations that normalize to private addresses', () => {
			// Hex notation 0x7f000001 = 127.0.0.1
			expect(isSafeTargetUrl('http://0x7f000001/')).toBe(false);
			// Octal notation 0177.0.0.1 = 127.0.0.1
			expect(isSafeTargetUrl('http://0177.0.0.1/')).toBe(false);
			// Pure integer notation 2130706433 = 127.0.0.1
			expect(isSafeTargetUrl('http://2130706433/')).toBe(false);
			// Hex 169.254.169.254
			expect(isSafeTargetUrl('http://0xa9fea9fe/')).toBe(false);
		});

		it('rejects IPv6 loopback, link-local, and unique-local ranges', () => {
			// Loopback [::1]
			expect(isSafeTargetUrl('http://[::1]/')).toBe(false);
			expect(isSafeTargetUrl('http://[::]/')).toBe(false);
			// IPv4-mapped IPv6
			expect(isSafeTargetUrl('http://[::ffff:127.0.0.1]/')).toBe(false);
			expect(isSafeTargetUrl('http://[::ffff:7f00:1]/')).toBe(false);
			expect(isSafeTargetUrl('http://[::ffff:169.254.169.254]/')).toBe(false);
			// Link-local fe80::/10
			expect(isSafeTargetUrl('http://[fe80::1]/')).toBe(false);
			// Unique-local fc00::/7 (fc00, fd00)
			expect(isSafeTargetUrl('http://[fc00::1]/')).toBe(false);
			expect(isSafeTargetUrl('http://[fd12:3456:789a::1]/')).toBe(false);
		});

		it('rejects cloud metadata hostnames and local domains', () => {
			expect(isSafeTargetUrl('http://metadata.google.internal/')).toBe(false);
			expect(isSafeTargetUrl('http://localhost:3000/')).toBe(false);
			expect(isSafeTargetUrl('http://service.localhost/')).toBe(false);
			expect(isSafeTargetUrl('http://internal.local/')).toBe(false);
		});
	});

	describe('Redirect & Header Stripping Protection', () => {
		it('drops Authorization and Cookie headers when redirected across different origins', async () => {
			const fetchedRequests = [];
			const mockFetch = vi.fn().mockImplementation(async (url, init) => {
				fetchedRequests.push({ url, headers: { ...init.headers } });
				if (url === 'https://origin-a.com/start') {
					return new Response(null, {
						status: 302,
						headers: { Location: 'https://origin-b.com/destination' }
					});
				}
				if (url === 'https://origin-b.com/destination') {
					return new Response(JSON.stringify({ ok: true }), {
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					});
				}
				return new Response('Not found', { status: 404 });
			});

			const response = await safeFetch('https://origin-a.com/start', {
				headers: {
					'Authorization': 'Bearer secret-token-123',
					'Cookie': 'session=abc',
					'X-Custom-Safe': 'safe-value'
				}
			}, {
				fetchFn: mockFetch,
				maxRedirects: 3
			});

			expect(response.status).toBe(200);
			expect(fetchedRequests).toHaveLength(2);
			// First request should contain Authorization & Cookie
			expect(fetchedRequests[0].headers.Authorization).toBe('Bearer secret-token-123');
			expect(fetchedRequests[0].headers.Cookie).toBe('session=abc');
			// Cross-origin redirect MUST have stripped Authorization and Cookie!
			expect(fetchedRequests[1].headers.Authorization).toBeUndefined();
			expect(fetchedRequests[1].headers.Cookie).toBeUndefined();
			// Safe header should be preserved
			expect(fetchedRequests[1].headers['X-Custom-Safe']).toBe('safe-value');
		});

		it('refuses to follow redirect to private SSRF targets', async () => {
			const mockFetch = vi.fn().mockImplementation(async (url) => {
				if (url === 'https://public-service.com/redirect') {
					return new Response(null, {
						status: 302,
						headers: { Location: 'http://169.254.169.254/latest/meta-data/' }
					});
				}
				return new Response('ok', { status: 200 });
			});

			await expect(safeFetch('https://public-service.com/redirect', {}, {
				fetchFn: mockFetch,
				maxRedirects: 3
			})).rejects.toThrow(/SSRF|forbidden|unsafe/i);
		});

		it('enforces maximum redirect limit of 3 hops to prevent redirect loops', async () => {
			let hop = 0;
			const mockFetch = vi.fn().mockImplementation(async (url) => {
				hop++;
				return new Response(null, {
					status: 302,
					headers: { Location: `https://public-service.com/hop-${hop}` }
				});
			});

			await expect(safeFetch('https://public-service.com/hop-0', {}, {
				fetchFn: mockFetch,
				maxRedirects: 3
			})).rejects.toThrow(/redirect limit exceeded/i);
		});
	});

	describe('Resource Protection & Body Size Limits', () => {
		it('reads response body within size limits', async () => {
			const smallPayload = 'hello world bounded';
			const res = new Response(smallPayload);
			const text = await readBoundedText(res, 1024);
			expect(text).toBe(smallPayload);
		});

		it('throws BizError/error when response body exceeds maximum allowed byte limit', async () => {
			const largeData = new Uint8Array(2048).fill(65); // 2KB of 'A'
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(largeData);
					controller.close();
				}
			});
			const res = new Response(stream);

			await expect(readBoundedText(res, 1024)).rejects.toThrow(/exceeded.*limit/i);
		});
	});
});
