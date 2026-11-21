import app from '../hono/hono';
import telegramService from '../service/telegram-service';
import emailTextTemplate from '../template/email-text.js';
import { SHARED_EMAIL_CSP } from '../utils/safe-email-html.js';

function privateHeaders(c) {
	c.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
	c.header('Referrer-Policy', 'no-referrer');
	c.header('X-Content-Type-Options', 'nosniff');
	c.header('Content-Security-Policy', SHARED_EMAIL_CSP);
}

app.get('/telegram/getEmail/:token', async (c) => {
	privateHeaders(c);
	const content = await telegramService.getEmailContent(c, c.req.param());
	return c.html(content || emailTextTemplate('This link is unavailable'), content ? 200 : 404);
});

// Uses the SAME bearer and authority checks as the page on every request; no
// independent long-lived object capability is emitted by a shared mail page.
app.get('/telegram/attachment/:token/:attId', async (c) => {
	privateHeaders(c);
	const response = await telegramService.getAttachment(c, c.req.param());
	return response || c.text('Object Not Found', 404);
});
