import resendService from '../service/resend-service';
import app from '../hono/hono';

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
		console.error('Resend webhook rejected:', e?.message || e);
		const status = Number(e?.code);
		return c.text('webhook_rejected', status >= 400 && status < 600 ? status : 500);
	}
});
