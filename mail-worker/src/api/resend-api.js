import resendService from '../service/resend-service';
import app from '../hono/hono';
import safeLogger from '../utils/safe-logger.js';
import BizError from '../error/biz-error.js';
import rateLimit from '../utils/rate-limit.js';

export const MAX_WEBHOOK_BYTES = 512 * 1024;
const RATE_WINDOW_SECONDS = 60;

async function readWebhookBody(request) {
	// Content-Length is only an early rejection hint; chunked or understated
	// bodies must pass the same byte limit while streaming.
	if (Number(request.headers.get('content-length')) > MAX_WEBHOOK_BYTES) {
		throw new BizError('Webhook body too large', 413);
	}
	if (!request.body) return '';
	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let size = 0;
	let text = '';
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) return text + decoder.decode();
			size += value.byteLength;
			if (size > MAX_WEBHOOK_BYTES) {
				await reader.cancel().catch(() => {});
				throw new BizError('Webhook body too large', 413);
			}
			text += decoder.decode(value, { stream: true });
		}
	} finally {
		reader.releaseLock();
	}
}

export async function handleResendWebhook(c) {
	try {
		for (const header of ['svix-id', 'svix-timestamp', 'svix-signature']) {
			if (!c.req.header(header)?.trim()) throw new BizError('Missing webhook signature headers', 401);
		}
		// Cloudflare's client IP, never a caller-supplied event ID, identifies
		// the counter. Storage failures reject before reading or hashing a body.
		await rateLimit.check(c, { scope: 'webhook-resend', limit: 120, windowSeconds: RATE_WINDOW_SECONDS });
		const rawBody = await readWebhookBody(c.req.raw);
		const svixId = c.req.header('svix-id');

		await resendService.verifySignature(c, rawBody);

		let body;
		try {
			body = JSON.parse(rawBody);
		} catch (e) {
			return c.text('invalid_payload', 400);
		}

		const result = await resendService.webhooks(c, body, svixId);
		return c.json(result, 200);
	} catch (e) {
		const status = Number(e?.code);
		const safeStatus = status >= 400 && status < 600 ? status : 500;
		if (safeStatus === 429) c.header('Retry-After', String(RATE_WINDOW_SECONDS));
		safeLogger.warn('resend_webhook_rejected', { status: safeStatus, error: e });
		return c.text('webhook_rejected', safeStatus);
	}
}

app.post('/webhooks', handleResendWebhook);
