import resendService from '../service/resend-service';
import app from '../hono/hono';
import safeLogger from '../utils/safe-logger.js';

app.post('/webhooks', async (c) => {
	try {
		const rawBody = await c.req.text();
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
		safeLogger.warn('resend_webhook_rejected', { status: safeStatus, error: e });
		return c.text('webhook_rejected', safeStatus);
	}
});
