import app from '../hono/hono';
import telegramService from '../service/telegram-service';

app.get('/telegram/getEmail/:token', async (c) => {
	const nonce = crypto.randomUUID().replace(/-/g, '');
	const content = await telegramService.getEmailContent(c, c.req.param(), nonce);
	c.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
	c.header('Content-Security-Policy', `default-src 'self' data: blob: https:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; object-src 'none'`);
	return c.html(content)
});

