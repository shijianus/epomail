const IMAGE_EXTENSION_BY_MIME = {
	'image/png': '.png',
	'image/jpeg': '.jpg',
	'image/gif': '.gif',
	'image/webp': '.webp',
	'image/bmp': '.bmp',
	'image/x-icon': '.ico',
	'image/avif': '.avif'
};

function sanitizeFilename(filename, fallback = 'file') {
	let name = typeof filename === 'string' ? filename : '';
	// Strip any path component, control characters and header delimiters.
	name = name.replace(/\\/g, '/').split('/').pop() || '';
	name = name.replace(/[\u0000-\u001f\u007f"<>|]/g, '').trim();
	if (!name || name === '.' || name === '..') name = fallback;
	if (name.length > 200) {
		const dot = name.lastIndexOf('.');
		const ext = dot > 0 ? name.slice(dot, dot + 11) : '';
		name = name.slice(0, 200 - ext.length) + ext;
	}
	return name;
}

const DANGEROUS_EXTENSIONS = new Set(['.html', '.htm', '.xhtml', '.svg', '.xml', '.js', '.mjs', '.cjs', '.script']);

function getSafeExtension(filename) {
	const name = sanitizeFilename(filename, '');
	const dot = name.lastIndexOf('.');
	if (dot <= 0) return '';
	const ext = name.slice(dot);
	if (!/^\.[A-Za-z0-9]{1,10}$/.test(ext)) return '';
	const lower = ext.toLowerCase();
	return DANGEROUS_EXTENSIONS.has(lower) ? '' : lower;
}

function encodeContentDisposition(filename, disposition = 'attachment') {
	const safe = sanitizeFilename(filename);
	const ascii = safe.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
	const encoded = encodeURIComponent(safe).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
	return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function detectImageMime(bytes) {
	if (!bytes || bytes.byteLength < 12) return null;
	const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

	if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
		return 'image/png';
	}
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
		return 'image/jpeg';
	}
	if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
		return 'image/gif';
	}
	if (b[0] === 0x42 && b[1] === 0x4d) {
		return 'image/bmp';
	}
	if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) {
		return 'image/x-icon';
	}
	if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
		return 'image/webp';
	}
	if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
		const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
		if (brand === 'avif' || brand === 'avis') return 'image/avif';
	}
	return null;
}

const fileUtils = {
	sanitizeFilename,
	getSafeExtension,
	encodeContentDisposition,
	detectImageMime,

	getExtFileName(filename) {
		return getSafeExtension(filename);
	},

	async getBuffHash(buff) {
		const hashBuffer = await crypto.subtle.digest('SHA-256', buff);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
	},

	base64ToDataStr(base64) {
		return base64.split(',')[1] || base64;
	},

	base64ToUint8Array(base64) {
		const binaryStr = atob(base64);
		const len = binaryStr.length;
		const bytes = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			bytes[i] = binaryStr.charCodeAt(i);
		}
		return bytes;
	},

	/**
	 * 将 Base64 数据转换为 File 对象（自动识别 MIME 类型和文件扩展名）
	 * @param {string} base64Data 带有 data: 前缀的 base64 数据
	 * @param {string} [customFilename] 可选，传入自定义文件名（不含扩展名）
	 * @returns {File} File 对象
	 */
	base64ToFile(base64Data, customFilename) {
		const match = base64Data.match(/^data:(image|jpeg|video)\/([a-zA-Z0-9.+-]+);base64,/);
		if (!match) {
			throw new Error('Invalid base64 data format');
		}

		const type = match[1]; // image 或 video
		const ext = match[2];  // jpg, png, mp4 等
		const mimeType = `${type}/${ext}`;
		const cleanBase64 = base64Data.replace(/^data:(image|jpeg|video)\/[a-zA-Z0-9.+-]+;base64,/, '');

		const byteCharacters = atob(cleanBase64);
		const byteArrays = [];

		for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
			const slice = byteCharacters.slice(offset, offset + 1024);
			const byteNumbers = new Array(slice.length);
			for (let i = 0; i < slice.length; i++) {
				byteNumbers[i] = slice.charCodeAt(i);
			}
			byteArrays.push(new Uint8Array(byteNumbers));
		}

		const blob = new Blob(byteArrays, { type: mimeType });

		const filename = sanitizeFilename(`${customFilename || `${type}_${Date.now()}`}.${ext}`);
		return new File([blob], filename, { type: mimeType });
	},

	imageExtensionForMime(mimeType) {
		return IMAGE_EXTENSION_BY_MIME[String(mimeType || '').toLowerCase()] || '';
	}
};


export default fileUtils;
