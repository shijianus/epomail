import { describe, it, expect, vi } from 'vitest';
import { readRawEmail, senderPatternMatches, isAuthenticatedInternalSender } from '../src/email/email.js';

function streamFromBytes(bytes) {
	return new ReadableStream({
		start(controller) {
			for (const byte of bytes) {
				controller.enqueue(new Uint8Array([byte]));
			}
			controller.close();
		}
	});
}

describe('Inbound email stream decoding', () => {
	it('preserves multi-byte characters split across every chunk boundary', async () => {
		const source = 'Subject: 测试\r\n\r\n中文内容 🙂 emoji';
		const bytes = new TextEncoder().encode(source);
		const message = {
			raw: streamFromBytes(bytes),
			setReject: vi.fn()
		};

		const result = await readRawEmail(message, 1024 * 1024, 25);
		expect(result.tooLarge).toBe(false);
		expect(result.totalBytes).toBe(bytes.length);
		expect(result.content).toBe(source);
		expect(message.setReject).not.toHaveBeenCalled();
	});

	it('rejects oversized payloads before buffering the whole message', async () => {
		const bytes = new Uint8Array(2048).fill(0x41);
		const message = {
			raw: streamFromBytes(bytes),
			setReject: vi.fn()
		};

		const result = await readRawEmail(message, 100, 1);
		expect(result.tooLarge).toBe(true);
		expect(result.content).toBe('');
		expect(message.setReject).toHaveBeenCalledWith(expect.stringContaining('1MB'));
	});
});

describe('Sender wildcard patterns', () => {
	it('matches supported wildcards without throwing', () => {
		expect(senderPatternMatches('*@spam.example', 'anyone@spam.example', 'spam.example')).toBe(true);
		expect(senderPatternMatches('*@spam.example', 'user@example.com', 'example.com')).toBe(false);
		expect(senderPatternMatches('alerts-*@example.com', 'alerts-1@example.com', 'example.com')).toBe(true);
		expect(senderPatternMatches('*.example.com', 'user@mail.example.com', 'mail.example.com')).toBe(true);
	});

	it('matches exact addresses, domains and subdomains as before', () => {
		expect(senderPatternMatches('user@example.com', 'user@example.com', 'example.com')).toBe(true);
		expect(senderPatternMatches('example.com', 'user@mail.example.com', 'mail.example.com')).toBe(true);
		expect(senderPatternMatches('other.com', 'user@example.com', 'example.com')).toBe(false);
	});

	it('fails a malformed pattern closed instead of breaking delivery', () => {
		expect(senderPatternMatches('[unterminated', 'user@example.com', 'example.com')).toBe(false);
		expect(senderPatternMatches('*[', 'user@example.com', 'example.com')).toBe(false);
	});
});

describe('Authenticated internal sender detection', () => {
	const local = { from: { address: 'user@example.com' }, headers: [] };

	it('does not trust a local From domain without an authenticated result', () => {
		expect(isAuthenticatedInternalSender(local, ['example.com'])).toBe(false);
	});

	it('accepts a DKIM/DMARC pass bound to the local domain', () => {
		const email = { ...local, headers: [
			{ key: 'Authentication-Results', value: 'mx.example; dkim=pass header.d=example.com' }
		] };
		expect(isAuthenticatedInternalSender(email, ['example.com'])).toBe(true);
	});

	it('rejects a spoofed local From when authentication belongs to another domain', () => {
		const email = { ...local, headers: [
			{ key: 'Authentication-Results', value: 'mx.example; dkim=pass header.d=evil.example' }
		] };
		expect(isAuthenticatedInternalSender(email, ['example.com'])).toBe(false);
	});

	it('rejects a non-local domain even with a pass', () => {
		const email = { from: { address: 'user@evil.example' }, headers: [
			{ key: 'Authentication-Results', value: 'mx.example; dkim=pass header.d=evil.example' }
		] };
		expect(isAuthenticatedInternalSender(email, ['example.com'])).toBe(false);
	});
});
