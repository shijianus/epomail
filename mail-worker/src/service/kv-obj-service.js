import { normalizeObjectKey } from '../utils/object-key-utils.js';
import { safeObjectHeaders } from '../utils/object-response.js';

const kvObjService = {

	async putObj(c, key, content, metadata) {
		const safeKey = normalizeObjectKey(key);
		if (!safeKey) {
			throw new Error('Invalid storage object key');
		}
		await c.env.kv.put(safeKey, content, { metadata: metadata });
	},

	async deleteObj(c, keys) {

		if (typeof keys === 'string') {
			keys = [keys];
		}

		if (keys.length === 0) {
			return;
		}

		// Each KV delete is a subrequest. Chunking keeps a large cascade delete
		// below the Workers per-request subrequest ceiling.
		for (let i = 0; i < keys.length; i += 50) {
			const chunk = keys.slice(i, i + 50);
			await Promise.all(chunk.map(key => {
				const safeKey = normalizeObjectKey(key);
				return safeKey ? c.env.kv.delete(safeKey) : null;
			}));
		}
	},

	async getObj(c, key) {
		const safeKey = normalizeObjectKey(key);
		if (!safeKey) {
			return null;
		}

		const obj = await c.env.kv.getWithMetadata(safeKey, { type: "arrayBuffer"});
		if (!obj.value) {
			return null;
		}

		const rawType = (obj.metadata?.contentType || '').toLowerCase().trim();
		return new Response(obj.value, {
			headers: safeObjectHeaders({
				contentType: rawType,
				contentDisposition: obj.metadata?.contentDisposition,
				cacheControl: obj.metadata?.cacheControl,
				isPublic: safeKey.startsWith('static/')
			})
		});
	},

	async toObjResp(c, key) {

		return await this.getObj(c, key);

	}

};

export default kvObjService;
