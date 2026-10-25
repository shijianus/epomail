import app from '../hono/hono';
import { dbInit } from '../init/init';

async function initHandler(c) {
	try {
		return await dbInit.init(c);
	} catch (err) {
		if (String(err?.message || '').includes('admin_initial_password')) {
			return c.text('admin_initial_password Secret is required (min 8 chars) to create the site owner account', 500);
		}
		throw err;
	}
}

// Prefer POST + x-init-secret header so the bootstrap secret never appears in
// URLs, access logs or browser history. The GET form is retained for existing
// deployment scripts but uses the same constant-time check.
app.post('/init', initHandler);
app.get('/init/:secret', initHandler);
