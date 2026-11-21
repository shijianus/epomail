/** Walk every KV page. An incomplete or stalled cursor is a failure, not success. */
export async function forEachKvPage(kv, prefix, visit) {
	let cursor;
	const seen = new Set();
	while (true) {
		const page = await kv.list({ prefix, limit: 100, ...(cursor ? { cursor } : {}) });
		if (!page || !Array.isArray(page.keys)) throw new Error('Invalid KV listing');
		await visit(page.keys);
		if (page.list_complete === true) return;
		if (!page.cursor || seen.has(page.cursor)) throw new Error('Incomplete KV listing');
		seen.add(page.cursor);
		cursor = page.cursor;
	}
}

/** Attempt the entire set, but never hide failed deletes from the caller. */
export async function deleteKvKeys(kv, keys) {
	let deleted = 0;
	let failed = 0;
	const unique = [...new Set(keys)];
	for (let i = 0; i < unique.length; i += 25) {
		const results = await Promise.allSettled(unique.slice(i, i + 25).map(key => kv.delete(key)));
		for (const result of results) result.status === 'fulfilled' ? deleted++ : failed++;
	}
	if (failed) throw new Error(`KV revocation incomplete (${failed} failed deletes)`);
	return deleted;
}

export async function deleteKvMatching(kv, prefix, matches = () => true) {
	let deleted = 0;
	let failed = 0;
	await forEachKvPage(kv, prefix, async keys => {
		const selected = [];
		for (const key of keys) {
			try {
				if (await matches(key)) selected.push(key.name);
			} catch (_) {
				failed++;
			}
		}
		try {
			deleted += await deleteKvKeys(kv, selected);
		} catch (_) {
			failed++;
		}
	});
	if (failed) throw new Error('KV revocation incomplete');
	return deleted;
}
