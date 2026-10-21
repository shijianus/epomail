import resendService from '../service/resend-service';
import app from '../hono/hono';

app.post('/webhooks', async (c) => {
	try {
		const rawBody = await c.req.text();
		const svixId = c.req.header('svix-id');
		const svixTimestamp = c.req.header('svix-timestamp');
		const svixSignature = c.req.header('svix-signature');
		const secret = c.env?.resend_webhook_secret || c.env?.RESEND_WEBHOOK_SECRET;

		await resendService.verifyWebhookSignature({
			secret,
			svixId,
			svixTimestamp,
			svixSignature,
			rawBody
		});

		let body;
		try {
			body = JSON.parse(rawBody);
		} catch (e) {
			return c.text('Invalid JSON payload', 400);
		}

		const result = await resendService.webhooks(c, body, svixId);
		return c.json(result, 200);
	} catch (e) {
		const status = e.status || (e.message?.includes('未配置') ? 500 : 401);
		return c.text(e.message, status);
	}
});
