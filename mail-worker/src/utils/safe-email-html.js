import { parseHTML } from 'linkedom';

export const SHARED_EMAIL_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; font-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function escapeHtml(value) {
	return String(value ?? '').replace(/[&<>"']/g, char => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
	}[char]));
}

const TAGS = new Set('p br hr div span strong b em i u s del ins sub sup blockquote pre code h1 h2 h3 h4 h5 h6 ul ol li table thead tbody tfoot tr td th caption a img'.split(' '));
const DROP = new Set('script style iframe frame frameset object embed form input button select textarea base link meta applet svg math video audio source track canvas template noscript xmp plaintext'.split(' '));
const VOID = new Set(['br', 'hr', 'img']);

function safeLink(value, attachmentUrls) {
	if (attachmentUrls.has(value)) return attachmentUrls.get(value);
	const href = String(value || '').trim();
	if (/[\u0000-\u0020\u007f\\]/.test(href)) return '';
	if (/^mailto:[^<>"']+$/i.test(href)) return href;
	try {
		const url = new URL(href);
		return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : '';
	} catch (_) { return ''; }
}

/**
 * Server-side allowlist. Sender CSS, URL-bearing attributes and remote images
 * are not copied. Only attachments already bound to this message get an image
 * URL. CSP is an additional boundary, not the sanitizer.
 */
export function sanitizeSharedEmailHtml(html, attachmentUrls = new Map()) {
	const { document } = parseHTML(String(html || ''));
	function render(node) {
		if (node.nodeType === 3) return escapeHtml(node.textContent);
		if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return '';
		const tag = String(node.localName || '').toLowerCase();
		if (DROP.has(tag)) return '';
		const children = () => Array.from(node.childNodes || []).map(render).join('');
		if (!TAGS.has(tag)) return children();
		let attrs = '';
		if (tag === 'img') {
			const src = attachmentUrls.get(node.getAttribute('src'));
			const alt = node.getAttribute('alt') || '';
			if (!src) return alt ? `<span>${escapeHtml(alt)}</span>` : '';
			attrs = ` src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" referrerpolicy="no-referrer"`;
		}
		if (tag === 'a') {
			const href = safeLink(node.getAttribute('href'), attachmentUrls);
			if (href) attrs = ` href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"`;
		}
		if (tag === 'td' || tag === 'th') {
			for (const attr of ['colspan', 'rowspan']) {
				const number = Number(node.getAttribute(attr));
				if (Number.isInteger(number) && number > 0 && number <= 100) attrs += ` ${attr}="${number}"`;
			}
		}
		return `<${tag}${attrs}>${VOID.has(tag) ? '' : children() + `</${tag}>`}`;
	}
	return render(document);
}
