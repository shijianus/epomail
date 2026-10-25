import { parseHTML } from 'linkedom';

const SVG_FORBIDDEN_TAGS = ['script', 'foreignObject', 'iframe', 'object', 'embed', 'form', 'base', 'link', 'meta'];
const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction']);

/**
 * Server-side defense-in-depth sanitizer for user-provided SVG icons.
 * The frontend also runs DOMPurify; this prevents a direct API caller from
 * persisting an obviously malicious SVG payload.
 */
export function sanitizeSvgString(svg) {
	if (!svg || typeof svg !== 'string') return '';
	const value = svg.trim();
	if (!value.toLowerCase().startsWith('<svg')) return '';

	const { document } = parseHTML(`<div id="__svg_root__">${value}</div>`);
	const root = document.querySelector('#__svg_root__');
	const svgEl = root?.querySelector('svg');
	if (!svgEl) return '';

	for (const tag of SVG_FORBIDDEN_TAGS) {
		svgEl.querySelectorAll(tag).forEach(el => el.remove());
	}

	svgEl.querySelectorAll('*').forEach(el => {
		for (const attr of Array.from(el.attributes || [])) {
			const name = attr.name.toLowerCase();
			const attrValue = String(attr.value || '').toLowerCase().replace(/[\s\u0000-\u001f]/g, '');
			if (name.startsWith('on')) {
				el.removeAttribute(attr.name);
				continue;
			}
			if (URL_ATTRS.has(name) && (attrValue.includes('javascript:') || attrValue.startsWith('data:text/html'))) {
				el.removeAttribute(attr.name);
				continue;
			}
			if (name === 'style' && /url\s*\(|expression|@import|javascript:/i.test(attrValue)) {
				el.removeAttribute(attr.name);
			}
		}
	});

	// The root <svg> element is not returned by querySelectorAll('*'), so its
	// own attributes must be cleaned explicitly.
	for (const el of [svgEl, ...svgEl.querySelectorAll('*')]) {
		for (const attr of Array.from(el.attributes || [])) {
			if (attr.name.toLowerCase().startsWith('on')) {
				el.removeAttribute(attr.name);
			}
		}
	}

	return svgEl.toString();
}

export function sanitizeCustomLabels(input, maxBytes = 64 * 1024) {
	let parsed = input;
	if (typeof input === 'string') {
		try {
			parsed = JSON.parse(input);
		} catch (_) {
			throw new Error('Invalid custom labels JSON');
		}
	}
	if (Array.isArray(parsed)) {
		// legacy array form
	} else if (!parsed || typeof parsed !== 'object') {
		throw new Error('Invalid custom labels shape');
	}

	const seen = new WeakSet();
	function walk(node) {
		if (Array.isArray(node)) {
			return node.map(item => walk(item));
		}
		if (!node || typeof node !== 'object') return node;
		if (seen.has(node)) return null;
		seen.add(node);
		const result = {};
		for (const [key, value] of Object.entries(node)) {
			if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
			if (key === 'icon' && typeof value === 'string' && value.trim().toLowerCase().startsWith('<svg')) {
				result[key] = sanitizeSvgString(value) || 'ic:baseline-label';
			} else {
				result[key] = walk(value);
			}
		}
		return result;
	}

	const sanitized = walk(parsed);
	const serialized = JSON.stringify(sanitized);
	if (serialized.length > maxBytes) {
		throw new Error('Custom labels payload too large');
	}
	return serialized;
}

export default { sanitizeSvgString, sanitizeCustomLabels };
