/**
 * AWS SigV4 Presigner and URL Utility
 * Pure WebCrypto API implementation for Cloudflare Workers and Node.js >= 18
 * Zero external dependencies, ultra-fast sub-millisecond execution
 */

async function hmacSha256(key, data) {
	const cryptoKey = typeof key === 'string'
		? await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(key),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		)
		: (key instanceof CryptoKey ? key : await crypto.subtle.importKey(
			'raw',
			key,
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		));

	const signature = await crypto.subtle.sign(
		'HMAC',
		cryptoKey,
		typeof data === 'string' ? new TextEncoder().encode(data) : data
	);
	return new Uint8Array(signature);
}

async function sha256Hex(data) {
	const hash = await crypto.subtle.digest(
		'SHA-256',
		typeof data === 'string' ? new TextEncoder().encode(data) : data
	);
	return Array.from(new Uint8Array(hash))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
}

function toHex(uint8Array) {
	return Array.from(uint8Array)
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
}

function uriEncode(str, encodeSlash = true) {
	let result = '';
	for (let i = 0; i < str.length; i++) {
		const char = str[i];
		if (
			(char >= 'A' && char <= 'Z') ||
			(char >= 'a' && char <= 'z') ||
			(char >= '0' && char <= '9') ||
			char === '_' || char === '-' || char === '~' || char === '.'
		) {
			result += char;
		} else if (char === '/' && !encodeSlash) {
			result += char;
		} else {
			const hex = char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
			result += `%${hex}`;
		}
	}
	return result;
}

export function detectProvider(endpoint = '') {
	const ep = (endpoint || '').toLowerCase();
	if (ep.includes('backblazeb2.com') || ep.includes('backblaze.com')) {
		return 'Backblaze B2';
	}
	if (ep.includes('r2.cloudflarestorage.com')) {
		return 'Cloudflare R2';
	}
	if (ep.includes('amazonaws.com')) {
		return 'AWS S3';
	}
	if (ep.includes('wasabisys.com')) {
		return 'Wasabi';
	}
	if (ep.includes('minio') || ep.includes('localhost') || ep.includes('127.0.0.1')) {
		return 'MinIO';
	}
	return 'S3 Compatible';
}

export const s3Signer = {
	detectProvider,

	/**
	 * Normalize S3 Endpoint URL
	 */
	normalizeEndpoint(endpoint) {
		if (!endpoint) return '';
		let ep = endpoint.trim();
		if (!ep.startsWith('http://') && !ep.startsWith('https://')) {
			ep = `https://${ep}`;
		}
		return ep.replace(/\/+$/, '');
	},

	/**
	 * Generate an AWS SigV4 Presigned GET URL
	 */
	async getPresignedUrl({
		bucket,
		endpoint,
		region = 'auto',
		accessKeyId,
		secretAccessKey,
		key,
		forcePathStyle = true,
		expiresIn = 3600,
		customDomain = ''
	}) {
		if (!bucket || !endpoint || !accessKeyId || !secretAccessKey || !key) {
			return null;
		}

		// If a public custom CDN domain is configured (e.g. Bandwidth Alliance CDN), return direct CDN link
		if (customDomain) {
			let cdn = customDomain.trim().replace(/\/+$/, '');
			if (!cdn.startsWith('http://') && !cdn.startsWith('https://')) {
				cdn = `https://${cdn}`;
			}
			const sanitizedKey = key.startsWith('/') ? key.slice(1) : key;
			return `${cdn}/${sanitizedKey}`;
		}

		const normEndpoint = this.normalizeEndpoint(endpoint);
		const endpointUrl = new URL(normEndpoint);
		const cleanKey = key.startsWith('/') ? key.slice(1) : key;

		let host = endpointUrl.host;
		let pathname = '';

		if (forcePathStyle) {
			pathname = `/${bucket}/${cleanKey}`;
		} else {
			// Virtual host style: bucket.s3.region.backblazeb2.com
			host = `${bucket}.${endpointUrl.host}`;
			pathname = `/${cleanKey}`;
		}

		const now = new Date();
		const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
		const dateStamp = amzDate.slice(0, 8); // YYYYMMDD
		const s3Region = region || 'auto';
		const credentialScope = `${dateStamp}/${s3Region}/s3/aws4_request`;

		const canonicalUri = pathname.split('/').map(seg => uriEncode(seg, true)).join('/');

		const queryParams = [
			['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
			['X-Amz-Credential', `${accessKeyId}/${credentialScope}`],
			['X-Amz-Date', amzDate],
			['X-Amz-Expires', expiresIn.toString()],
			['X-Amz-SignedHeaders', 'host']
		];

		// Sort query params alphabetically
		queryParams.sort((a, b) => a[0].localeCompare(b[0]));
		const canonicalQueryString = queryParams
			.map(([k, v]) => `${uriEncode(k, true)}=${uriEncode(v, true)}`)
			.join('&');

		const canonicalHeaders = `host:${host}\n`;
		const signedHeaders = 'host';
		const payloadHash = 'UNSIGNED-PAYLOAD';

		const canonicalRequest = [
			'GET',
			canonicalUri,
			canonicalQueryString,
			canonicalHeaders,
			signedHeaders,
			payloadHash
		].join('\n');

		const canonicalRequestHash = await sha256Hex(canonicalRequest);

		const stringToSign = [
			'AWS4-HMAC-SHA256',
			amzDate,
			credentialScope,
			canonicalRequestHash
		].join('\n');

		// Derive signing key
		const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
		const kRegion = await hmacSha256(kDate, s3Region);
		const kService = await hmacSha256(kRegion, 's3');
		const kSigning = await hmacSha256(kService, 'aws4_request');

		const signatureUint8 = await hmacSha256(kSigning, stringToSign);
		const signature = toHex(signatureUint8);

		const protocol = endpointUrl.protocol;
		const finalUrl = `${protocol}//${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
		return finalUrl;
	}
};

export default s3Signer;
