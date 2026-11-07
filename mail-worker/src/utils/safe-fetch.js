import { BizError } from '../error/biz-error.js';

/**
 * 校验目标 URL 是否安全，拦截一切内网 IP、回环地址、云厂商元数据服务及私有协议 (SSRF 防护)
 * @param {string} rawUrl
 * @param {object} [options]
 * @returns {boolean}
 */
export function isSafeTargetUrl(rawUrl, options = {}) {
	if (!rawUrl || typeof rawUrl !== 'string') return false;

	let parsed;
	try {
		parsed = new URL(rawUrl.trim());
	} catch {
		return false;
	}

	// 1. 协议白名单校验
	const protocol = parsed.protocol.toLowerCase();
	if (options.requireHttps) {
		if (protocol !== 'https:') return false;
	} else {
		if (protocol !== 'https:' && protocol !== 'http:') return false;
	}

	// 2. 严禁包含内嵌认证凭证 (user:pass@host)
	if (parsed.username || parsed.password) {
		return false;
	}

	const hostname = parsed.hostname.toLowerCase();
	if (!hostname) return false;

	// 3. 拦截本地与内部保留域名
	if (
		hostname === 'localhost' ||
		hostname.endsWith('.localhost') ||
		hostname.endsWith('.local') ||
		hostname.endsWith('.internal') ||
		hostname === 'metadata.google.internal' ||
		hostname === 'metadata'
	) {
		return false;
	}

	// 4. IPv4 私有与保留地址段拦截 (WHATWG URL 解析已自动规范化十六进制、八进制和纯整数 IP)
	const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (ipv4Match) {
		const a = Number(ipv4Match[1]);
		const b = Number(ipv4Match[2]);
		const c = Number(ipv4Match[3]);
		const d = Number(ipv4Match[4]);

		if (a > 255 || b > 255 || c > 255 || d > 255) return false;

		// 0.0.0.0/8 (当前网络)
		if (a === 0) return false;
		// 10.0.0.0/8 (私网 RFC 1918)
		if (a === 10) return false;
		// 100.64.0.0/10 (运营商级 NAT / CGNAT)
		if (a === 100 && b >= 64 && b <= 127) return false;
		// 127.0.0.0/8 (回环地址)
		if (a === 127) return false;
		// 169.254.0.0/16 (链路本地 / 云元数据服务 169.254.169.254)
		if (a === 169 && b === 254) return false;
		// 172.16.0.0/12 (私网 RFC 1918)
		if (a === 172 && b >= 16 && b <= 31) return false;
		// 192.168.0.0/16 (私网 RFC 1918)
		if (a === 192 && b === 168) return false;
		// 198.18.0.0/15 (基准测试)
		if (a === 198 && (b === 18 || b === 19)) return false;
		// 224.0.0.0/4 (多播组播)
		if (a >= 224 && a <= 239) return false;
		// 240.0.0.0/4 (保留地址) 及 255.255.255.255 (广播)
		if (a >= 240) return false;
	}

	// 5. IPv6 私有与保留地址段拦截
	let rawIpv6 = hostname;
	if (rawIpv6.startsWith('[') && rawIpv6.endsWith(']')) {
		rawIpv6 = rawIpv6.slice(1, -1);
	}

	if (rawIpv6.includes(':')) {
		const lowerV6 = rawIpv6.toLowerCase();
		// Loopback & Unspecified
		if (lowerV6 === '::1' || lowerV6 === '::') return false;
		// Link-local fe80::/10 (fe8, fe9, fea, feb)
		if (/^fe[89ab]/i.test(lowerV6)) return false;
		// Unique-local fc00::/7 (fc, fd)
		if (/^f[cd]/i.test(lowerV6)) return false;
		// IPv4-mapped IPv6 (::ffff:0:0/96)
		if (lowerV6.includes('ffff:') || lowerV6.startsWith('::ffff:')) return false;
	}

	return true;
}

const SENSITIVE_HEADERS = [
	'authorization',
	'cookie',
	'set-cookie',
	'x-api-key',
	'api-key',
	'x-admin-secret',
	'proxy-authorization'
];

/**
 * 清除跨域请求中不应透传的敏感头
 */
function stripSensitiveHeaders(headers) {
	if (!headers) return headers;
	const sanitized = {};
	if (typeof headers.entries === 'function') {
		for (const [k, v] of headers.entries()) {
			if (!SENSITIVE_HEADERS.includes(k.toLowerCase())) {
				sanitized[k] = v;
			}
		}
	} else if (typeof headers === 'object') {
		for (const [k, v] of Object.entries(headers)) {
			if (!SENSITIVE_HEADERS.includes(k.toLowerCase())) {
				sanitized[k] = v;
			}
		}
	}
	return sanitized;
}

/**
 * 统一出站安全 Fetch 请求包装器
 * @param {string} targetUrl
 * @param {RequestInit} [init]
 * @param {object} [options]
 * @returns {Promise<Response>}
 */
export async function safeFetch(targetUrl, init = {}, options = {}) {
	if (!isSafeTargetUrl(targetUrl, options)) {
		throw new BizError(`Unsafe outbound target URL (SSRF protection): ${targetUrl}`, 403, 'ssrf_blocked');
	}

	const maxRedirects = Number.isInteger(options.maxRedirects) ? options.maxRedirects : 0;
	const fetchFn = options.fetchFn || fetch;
	const timeoutMs = options.timeoutMs || 15000;

	let currentUrl = targetUrl;
	let currentInit = { ...init };

	// 统一超时控制
	if (!currentInit.signal && typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
		currentInit.signal = AbortSignal.timeout(timeoutMs);
	}

	// 严格禁用原生无感知重定向，改由 safeFetch 逐跳显式鉴权控制
	currentInit.redirect = 'manual';

	for (let hop = 0; hop <= maxRedirects; hop++) {
		const res = await fetchFn(currentUrl, currentInit);

		// 若为重定向状态码 (301, 302, 303, 307, 308)
		if ([301, 302, 303, 307, 308].includes(res.status)) {
			if (hop >= maxRedirects) {
				throw new BizError('Outbound redirect limit exceeded', 502, 'redirect_limit_exceeded');
			}

			const location = res.headers.get('Location');
			if (!location) {
				return res;
			}

			const nextUrl = new URL(location, currentUrl).toString();
			if (!isSafeTargetUrl(nextUrl, options)) {
				throw new BizError(`Unsafe outbound redirect target (SSRF protection): ${nextUrl}`, 403, 'ssrf_redirect_blocked');
			}

			// 检查是否跨域，若跨域则必须丢弃授权认证凭据
			const currOrigin = new URL(currentUrl).origin;
			const nextOrigin = new URL(nextUrl).origin;
			if (currOrigin !== nextOrigin) {
				currentInit.headers = stripSensitiveHeaders(currentInit.headers);
			}

			// 处理 303 或 POST 后的 301/302 方法降级为 GET
			if (res.status === 303 || ((res.status === 301 || res.status === 302) && currentInit.method?.toUpperCase() === 'POST')) {
				currentInit.method = 'GET';
				delete currentInit.body;
			}

			currentUrl = nextUrl;
			continue;
		}

		return res;
	}

	throw new BizError('Outbound redirect limit exceeded', 502, 'redirect_limit_exceeded');
}

/**
 * 安全有限流读取响应体文本，杜绝内存耗尽与上游流式死循环 (Bounded Response Reader)
 * @param {Response} response
 * @param {number} [maxBytes=5242880] 默认 5MB 限制
 * @returns {Promise<string>}
 */
export async function readBoundedText(response, maxBytes = 5 * 1024 * 1024) {
	if (!response.body) return '';

	const reader = response.body.getReader();
	let receivedBytes = 0;
	const chunks = [];
	const decoder = new TextDecoder();

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			receivedBytes += value.byteLength;
			if (receivedBytes > maxBytes) {
				await reader.cancel();
				throw new BizError(`Response body exceeded maximum allowed limit of ${maxBytes} bytes`, 502, 'response_too_large');
			}
			chunks.push(decoder.decode(value, { stream: true }));
		}
		chunks.push(decoder.decode());
	} catch (err) {
		if (err instanceof BizError) throw err;
		throw new BizError(`Failed to read response body: ${err.message}`, 502, 'response_read_failed');
	}

	return chunks.join('');
}

/**
 * 安全读取响应体并解析为 JSON
 */
export async function readBoundedJson(response, maxBytes = 5 * 1024 * 1024) {
	const text = await readBoundedText(response, maxBytes);
	try {
		return JSON.parse(text);
	} catch (e) {
		throw new BizError(`Invalid JSON response: ${e.message}`, 502, 'invalid_json');
	}
}
