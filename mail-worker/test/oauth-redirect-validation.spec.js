import { describe, expect, it } from 'vitest';
import oauthAppService, { validateSingleRedirectUri, validateRedirectUris } from '../src/service/oauth-app-service.js';

describe('B6: OAuth Redirect URI Strict Validation Specification', () => {
	describe('validateSingleRedirectUri rule checks', () => {
		it('allows valid HTTPS redirect URIs', () => {
			expect(() => validateSingleRedirectUri('https://myapp.com/oauth/callback')).not.toThrow();
			expect(() => validateSingleRedirectUri('https://sub.domain.org:8443/auth')).not.toThrow();
		});

		it('allows HTTP only for localhost, 127.0.0.1, [::1]', () => {
			expect(() => validateSingleRedirectUri('http://localhost:3000/callback')).not.toThrow();
			expect(() => validateSingleRedirectUri('http://127.0.0.1:8080/callback')).not.toThrow();
			expect(() => validateSingleRedirectUri('http://[::1]:3000/callback')).not.toThrow();

			// Remote domains MUST NOT use HTTP
			expect(() => validateSingleRedirectUri('http://myapp.com/callback')).toThrow(/https/i);
			expect(() => validateSingleRedirectUri('http://evil.com/auth')).toThrow(/https/i);
		});

		it('rejects URIs with fragments (#)', () => {
			expect(() => validateSingleRedirectUri('https://myapp.com/callback#token')).toThrow(/fragment/i);
			expect(() => validateSingleRedirectUri('http://localhost:3000/callback#state=1')).toThrow(/fragment/i);
		});

		it('rejects URIs with userinfo (user:pass@)', () => {
			expect(() => validateSingleRedirectUri('https://user:pass@myapp.com/callback')).toThrow(/userinfo|credentials/i);
			expect(() => validateSingleRedirectUri('https://admin@myapp.com/callback')).toThrow(/userinfo|credentials/i);
		});

		it('rejects wildcards (*)', () => {
			expect(() => validateSingleRedirectUri('https://*.myapp.com/callback')).toThrow(/wildcard/i);
			expect(() => validateSingleRedirectUri('https://myapp.com/callback/*')).toThrow(/wildcard/i);
		});

		it('rejects control characters, newlines, and unencoded spaces', () => {
			expect(() => validateSingleRedirectUri('https://myapp.com/call\nback')).toThrow();
			expect(() => validateSingleRedirectUri('https://myapp.com/call\rback')).toThrow();
			expect(() => validateSingleRedirectUri('https://myapp.com/call back')).toThrow();
		});

		it('rejects pseudo-protocols (javascript:, data:, vbscript:)', () => {
			expect(() => validateSingleRedirectUri('javascript:alert(1)')).toThrow();
			expect(() => validateSingleRedirectUri('data:text/html,evil')).toThrow();
		});

		it('rejects URIs without valid host', () => {
			expect(() => validateSingleRedirectUri('https://')).toThrow(/host|invalid/i);
			expect(() => validateSingleRedirectUri('https://:8080/path')).toThrow(/host|invalid/i);
		});
	});

	describe('Exact String Match Enforcement during verifyRedirectUri', () => {
		const mockApp = {
			redirectUris: JSON.stringify([
				'https://app.example.com/oauth/callback',
				'http://localhost:3000/callback'
			])
		};

		it('matches exact URI strings only', () => {
			expect(oauthAppService.verifyRedirectUri(mockApp, 'https://app.example.com/oauth/callback')).toBe(true);
			expect(oauthAppService.verifyRedirectUri(mockApp, 'http://localhost:3000/callback')).toBe(true);
		});

		it('refuses fuzzy matches with trailing slash differences', () => {
			// RFC 6749 Section 3.1.2.4 requires exact match - trailing slash must NOT match
			expect(oauthAppService.verifyRedirectUri(mockApp, 'https://app.example.com/oauth/callback/')).toBe(false);
		});

		it('refuses case variations in path', () => {
			expect(oauthAppService.verifyRedirectUri(mockApp, 'https://app.example.com/OAuth/Callback')).toBe(false);
		});

		it('refuses subdomain or open redirect variations', () => {
			expect(oauthAppService.verifyRedirectUri(mockApp, 'https://attacker-app.example.com/oauth/callback')).toBe(false);
			expect(oauthAppService.verifyRedirectUri(mockApp, 'https://app.example.com.attacker.com/oauth/callback')).toBe(false);
		});
	});

	describe('Symmetry between add and update', () => {
		it('validateRedirectUris parses and strictly validates all redirect URIs identically', () => {
			const valid = ['https://app.example.com/callback', 'http://localhost:3000/cb'];
			const normalized = validateRedirectUris(valid);
			expect(normalized).toEqual(valid);

			const invalid = ['https://app.example.com/callback', 'http://remote-plain-http.com/cb'];
			expect(() => validateRedirectUris(invalid)).toThrow(/https/i);

			const withFragment = ['https://app.example.com/callback#fragment'];
			expect(() => validateRedirectUris(withFragment)).toThrow(/fragment/i);
		});
	});
});
