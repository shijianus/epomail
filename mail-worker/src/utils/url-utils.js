/**
 * URL and Network Safety Utilities
 * Validates external endpoints to prevent SSRF against loopback, RFC 1918 private subnets, and cloud metadata.
 */
export function isSafePublicUrl(urlStr) {
	if (!urlStr || typeof urlStr !== 'string') return false;
	try {
		const parsed = new URL(urlStr);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
		const hostname = parsed.hostname.toLowerCase();
		if (
			hostname === 'localhost' ||
			hostname === '127.0.0.1' ||
			hostname === '::1' ||
			hostname === '0.0.0.0'
		) {
			return false;
		}
		if (
			hostname.endsWith('.localhost') ||
			hostname.endsWith('.local') ||
			hostname.endsWith('.internal') ||
			hostname.endsWith('.lan')
		) {
			return false;
		}
		const parts = hostname.split('.').map(Number);
		if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
			// 127.0.0.0/8 (Loopback)
			if (parts[0] === 127) return false;
			// 10.0.0.0/8 (Private)
			if (parts[0] === 10) return false;
			// 0.0.0.0/8 (Current network)
			if (parts[0] === 0) return false;
			// 172.16.0.0/12 (Private)
			if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
			// 192.168.0.0/16 (Private)
			if (parts[0] === 192 && parts[1] === 168) return false;
			// 169.254.0.0/16 (Link-local & cloud metadata)
			if (parts[0] === 169 && parts[1] === 254) return false;
			// 100.64.0.0/10 (Shared address space)
			if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return false;
		}
		if (hostname.startsWith('[') && hostname.endsWith(']')) {
			const inner = hostname.slice(1, -1);
			if (inner === '::1' || inner.startsWith('fe80:') || inner.startsWith('fc') || inner.startsWith('fd')) {
				return false;
			}
		}
		return true;
	} catch {
		return false;
	}
}

export default {
	isSafePublicUrl
};
