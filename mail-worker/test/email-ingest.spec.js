import { describe, it, expect, vi } from 'vitest';
import { readRawEmail } from '../src/email/email.js';

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
