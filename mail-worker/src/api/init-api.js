import app from '../hono/hono';
import { dbInit } from '../init/init';

app.get('/init/:secret', (c) => {
	c.header('Warning', '299 - "Passing secret in URL is deprecated. Use POST /api/init with X-Init-Secret header"');
	return dbInit.init(c);
});

app.post('/init', (c) => {
	return dbInit.init(c);
});
