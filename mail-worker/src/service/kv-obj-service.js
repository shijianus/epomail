const kvObjService = {

	async putObj(c, key, content, metadata) {
		await c.env.kv.put(key, content, { metadata: metadata });
	},

	async deleteObj(c, keys) {

		if (typeof keys === 'string') {
			keys = [keys];
		}

		if (keys.length === 0) {
			return;
		}

		await Promise.all(keys.map( key => c.env.kv.delete(key)));
	},

	async getObj(c, key) {
		const obj = await c.env.kv.getWithMetadata(key, { type: "arrayBuffer"});
		if (!obj.value) {
			return null;
		}

		const rawType = (obj.metadata?.contentType || '').toLowerCase().trim();
		const SAFE_INLINE_IMAGE_TYPES = [
			'image/png', 'image/jpeg', 'image/jpg', 'image/gif',
			'image/webp', 'image/avif', 'image/bmp', 'image/x-icon'
		];

		let finalType = 'application/octet-stream';
		let finalDisposition = 'attachment';

		if (SAFE_INLINE_IMAGE_TYPES.includes(rawType)) {
			finalType = rawType;
			finalDisposition = obj.metadata?.contentDisposition?.startsWith('inline') ? 'inline' : 'attachment';
		}

		return new Response(obj.value, {
			headers: {
				'Content-Type': finalType,
				'Content-Disposition': finalDisposition,
				'Cache-Control': obj.metadata?.cacheControl || 'public, max-age=86400',
				'X-Content-Type-Options': 'nosniff',
				'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
			}
		});
	},

	async toObjResp(c, key) {

		return await this.getObj(c, key);

	}

};

export default kvObjService;
