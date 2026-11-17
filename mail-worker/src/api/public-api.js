import app from '../hono/hono';
import result from '../model/result';
import publicService from '../service/public-service';
import { readJsonObject } from '../utils/request-body.js';

app.post('/public/genToken', async (c) => {
	const data = await publicService.genToken(c, await readJsonObject(c));
	return c.json(result.ok(data));
});

app.post('/public/emailList', async (c) => {
	const list = await publicService.emailList(c, await readJsonObject(c));
	return c.json(result.ok(list));
});

app.post('/public/addUser', async (c) => {
	await publicService.addUser(c, await readJsonObject(c));
	return c.json(result.ok());
});

app.get('/public/profile/:username', async (c) => {
	const data = await publicService.getProfile(c, c.req.param('username'));
	return c.json(result.ok(data));
});
