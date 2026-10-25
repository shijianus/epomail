const SAFE_INLINE_IMAGE_TYPES = [
	'image/png', 'image/jpeg', 'image/jpg', 'image/gif',
	'image/webp', 'image/avif', 'image/bmp', 'image/x-icon'
];

/**
 * Normalize object-storage response headers. Storage backends (KV, R2, S3/B2)
 * may return an attacker-controlled Content-Type. Only passive image types may
 * be rendered inline; everything else is forced to a download with nosniff.
 */
export function safeObjectHeaders({ contentType, contentDisposition, cacheControl } = {}) {
	const rawType = String(contentType || '').toLowerCase().split(';')[0].trim();
	const isSafeImage = SAFE_INLINE_IMAGE_TYPES.includes(rawType);
	const wantsInline = String(contentDisposition || '').toLowerCase().trim().startsWith('inline');

	return {
		'Content-Type': isSafeImage ? rawType : 'application/octet-stream',
		'Content-Disposition': isSafeImage && wantsInline ? 'inline' : 'attachment',
		'Cache-Control': cacheControl || 'public, max-age=86400',
		'X-Content-Type-Options': 'nosniff',
		'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
	};
}

export { SAFE_INLINE_IMAGE_TYPES };
export default { safeObjectHeaders, SAFE_INLINE_IMAGE_TYPES };
