app.get('/email/sidebarStats', async (c) => {
	const data = await emailService.getSidebarStats(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});
