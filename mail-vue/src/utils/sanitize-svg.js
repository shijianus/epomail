import DOMPurify from 'dompurify';

/**
 * Sanitize a user-provided SVG icon before it is injected with v-html.
 * Label icons are stored per user, but admin/user-list views may render them,
 * so an unsanitized SVG would be a stored-XSS sink.
 */
export function sanitizeSvgIcon(svg) {
	if (!svg || typeof svg !== 'string') return '';
	const value = svg.trim();
	if (!value.startsWith('<svg')) return '';
	return DOMPurify.sanitize(value, {
		USE_PROFILES: { svg: true, svgFilters: true },
		FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed', 'form'],
		FORBID_ATTR: ['onbegin', 'onend', 'onload', 'onerror', 'onclick']
	});
}

export default sanitizeSvgIcon;
