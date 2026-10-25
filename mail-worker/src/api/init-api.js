import app from '../hono/hono';
import { dbInit } from '../init/init';

async function initHandler(c) {
	if (c.req.method === 'GET') {
		c.header('Warning', '299 - "Passing secret in URL is deprecated. Use POST /api/init with X-Init-Secret header"');
	}
	try {
		return await dbInit.init(c);
	} catch (err) {
		if (String(err?.message || '').includes('admin_initial_password')) {
			return c.text('admin_initial_password Secret is required (min 8 chars) to create the site owner account', 500);
		}
		throw err;
	}
}

app.post('/init', initHandler);
app.get('/init/:secret', initHandler);
