/**
 * URL and Network Safety Utilities
 * Validates external endpoints to prevent SSRF against loopback, RFC 1918 private subnets, link-local and cloud metadata.
 */

function isPrivateIpv4(parts) {
	if (parts.length !== 4 || !parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)) {
		return false;
	}
	if (parts[0] === 0) return true; // 0.0.0.0/8
	if (parts[0] === 10) return true; // 10/8
	if (parts[0] === 127) return true; // 127/8
	if (parts[0] === 169 && parts[1] === 254) return true; // link-local / metadata
	if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16/12
	if (parts[0] === 192 && parts[1] === 168) return true; // 192.168/16
	if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // CGNAT 100.64/10
	if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true; // benchmark
	if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return true; // IETF protocol assignments
	if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true; // TEST-NET-1
	if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true; // TEST-NET-2
	if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true; // TEST-NET-3
	if (parts[0] === 255) return true;
	return false;
}

function isPrivateIpv6(hostname) {
	const inner = hostname.slice(1, -1).toLowerCase();
	if (!inner) return true;
	if (inner === '::' || inner === '::1') return true;
	if (inner.startsWith('fe80:') || inner.startsWith('fec0:')) return true;
	if (inner.startsWith('fc') || inner.startsWith('fd')) return true; // unique local
	if (inner.startsWith('::ffff:')) {
		const mapped = inner.slice('::ffff:'.length);
		if (mapped.includes('.')) {
			return isPrivateIpv4(mapped.split('.').map(Number));
		}
		const hex = mapped.split(':');
		if (hex.length === 2) {
			const a = parseInt(hex[0], 16);
			const b = parseInt(hex[1], 16);
			if (Number.isFinite(a) && Number.isFinite(b)) {
				return isPrivateIpv4([(a >> 8) & 255, a & 255, (b >> 8) & 255, b & 255]);
			}
		}
		return true;
	}
	return false;
}

export function isSafePublicUrl(urlStr) {
	if (!urlStr || typeof urlStr !== 'string') return false;
	try {
		const parsed = new URL(urlStr);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
		if (parsed.username || parsed.password) return false;

		const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
		if (!hostname) return false;

		if (
			hostname === 'localhost' ||
			hostname === '127.0.0.1' ||
			hostname === '0.0.0.0' ||
			hostname === '::1'
		) {
			return false;
		}
		if (
			hostname.endsWith('.localhost') ||
			hostname.endsWith('.local') ||
			hostname.endsWith('.internal') ||
			hostname.endsWith('.lan') ||
			hostname.endsWith('.home.arpa')
		) {
			return false;
		}
		if (
			hostname === 'metadata' ||
			hostname === 'metadata.google.internal' ||
			hostname === 'instance-data' ||
			hostname === 'kubernetes.default'
		) {
			return false;
		}

		if (hostname.startsWith('[') && hostname.endsWith(']')) {
			return !isPrivateIpv6(hostname);
		}

		const parts = hostname.split('.').map(Number);
		if (parts.length === 4 && parts.every(part => !isNaN(part))) {
			return !isPrivateIpv4(parts);
		}

		return true;
	} catch {
		return false;
	}
}

export default {
	isSafePublicUrl
};
