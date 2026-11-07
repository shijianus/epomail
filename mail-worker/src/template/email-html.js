import { SHARED_EMAIL_CSP, sanitizeSharedEmailHtml } from '../utils/safe-email-html.js';

// No renderer script or remote stylesheet is needed for the basic readable view.
// `domain` and `nonce` remain in the signature for older internal callers; a
// public object domain must never bypass per-request sharing revocation.
export default function emailHtmlTemplate(html, domain = '', nonce = '', attachmentUrls = new Map()) {
	const content = sanitizeSharedEmailHtml(html, attachmentUrls);
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta name="referrer" content="no-referrer">
	<meta http-equiv="Content-Security-Policy" content="${SHARED_EMAIL_CSP}">
	<style>
		body { margin: 0; padding: 16px; color: #13181d; background: #fff; font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow-wrap: anywhere; }
		main { max-width: 100%; overflow-x: auto; }
		img { max-width: 100%; height: auto; }
		table { border-collapse: collapse; max-width: 100%; }
		td, th { padding: 4px; vertical-align: top; }
		pre { white-space: pre-wrap; }
		a { color: #0e70df; }
	</style>
</head>
<body><main>${content}</main></body>
</html>`;
}
