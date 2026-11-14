/**
 * Unified Safe Redacted Logger for Epocanvas Mail Worker
 * Ensures zero leakage of secrets, credentials, tokens, PII, email bodies,
 * and internal database/upstream error payloads into logs.
 */

const SENSITIVE_KEY_PATTERNS = [
	/password/i,
	/passwd/i,
	/secret/i,
	/client_?secret/i,
	/jwt_?secret/i,
	/init_?secret/i,
	/scheduled_?secret/i,
	/webhook_?secret/i,
	/totp_?enc_?key/i,
	/email_?enc_?key/i,
	/oauth_?client_?enc_?key/i,
	/storage_?enc_?key/i,
	/byo_?enc_?key/i,
	/s3_?access_?key/i,
	/s3_?secret_?key/i,
	/access_?key_?id/i,
	/secret_?access_?key/i,
	/byo_?storage_?config/i,
	/authorization/i,
	/cookie/i,
	/^token$/i,
	/access_?token/i,
	/refresh_?token/i,
	/id_?token/i,
	/bind_?token/i,
	/bot_?token/i,
	/api_?token/i,
	/external_?db_?token/i,
	/device_?trust/i,
	/^code$/i,
	/auth_?code/i,
	/backup_?codes?/i,
	/recovery_?codes?/i,
	/encrypted_?raw/i,
	/private_?key/i,
	/session_?key/i,
	/verifier/i,
	/totp/i,
	/api_?key/i,
	/x-?init-?secret/i,
	/x-?scheduled-?secret/i,
	/x-?api-?key/i,
	/body_?html/i,
	/html/i,
	/content/i,
	/^text$/i,
	/attachment/i,
	/attachments/i,
	/sql/i,
	/params/i,
	/payload/i,
	/upstream_?response/i,
	/response_?body/i,
	/raw_?body/i
];

const BEARER_REGEX = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const JWT_REGEX = /ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g;
const TG_BOT_URL_REGEX = /(https?:\/\/api\.telegram\.org\/bot)[^/\s?#]+/gi;
const TG_BOT_TOKEN_REGEX = /\bbot\d{5,20}:[A-Za-z0-9_-]{20,}\b/g;
const AWS_ACCESS_KEY_REGEX = /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g;
const URL_QUERY_SECRET_REGEX = /([?&](?:secret|token|key|password|code|access_token|refresh_token|api_key|init_secret|scheduled_secret|client_secret)=)[^&#\s]+/gi;
const KV_IN_STRING_REGEX = /\b(password|passwd|secret|api_?key|token|auth|bearer|jwt|totp|client_?secret|cookie|set-cookie|x-init-secret|x-scheduled-secret|x-api-key|s3AccessKey|s3SecretKey|accessKeyId|secretAccessKey)\b\s*[:=]\s*([^\s,;)"']+)/gi;

export function sanitizeUrl(urlStr) {
	if (typeof urlStr !== 'string') return '';
	return urlStr
		.replace(TG_BOT_URL_REGEX, '$1[REDACTED]')
		.replace(URL_QUERY_SECRET_REGEX, '$1[REDACTED]');
}

export function sanitizeString(str) {
	if (typeof str !== 'string') return str;
	return str
		.replace(TG_BOT_URL_REGEX, '$1[REDACTED]')
		.replace(TG_BOT_TOKEN_REGEX, 'bot[REDACTED]')
		.replace(AWS_ACCESS_KEY_REGEX, '[REDACTED_AWS_KEY]')
		.replace(BEARER_REGEX, 'Bearer [REDACTED]')
		.replace(JWT_REGEX, '[REDACTED_JWT]')
		.replace(URL_QUERY_SECRET_REGEX, '$1[REDACTED]')
		.replace(KV_IN_STRING_REGEX, '$1: [REDACTED]');
}

function isSensitiveKey(key) {
	if (typeof key !== 'string') return false;
	return SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
}

export function redactSensitiveData(data, depth = 0, seen = new WeakSet()) {
	if (depth > 6) return '[MAX_DEPTH_REACHED]';
	if (data === null || data === undefined) return data;

	if (typeof data === 'string') {
		return sanitizeString(data);
	}

	if (typeof data === 'number' || typeof data === 'boolean') {
		return data;
	}

	if (data instanceof Error) {
		return {
			name: data.name,
			message: sanitizeString(data.message),
			code: data.code,
			errorCode: data.errorCode
		};
	}

	if (typeof data === 'object') {
		if (seen.has(data)) return '[CIRCULAR]';
		seen.add(data);

		if (Array.isArray(data)) {
			return data.map(item => redactSensitiveData(item, depth + 1, seen));
		}

		const result = {};
		for (const [key, value] of Object.entries(data)) {
			if (isSensitiveKey(key)) {
				result[key] = '[REDACTED]';
			} else {
				result[key] = redactSensitiveData(value, depth + 1, seen);
			}
		}
		return result;
	}

	return '[UNLOGGABLE]';
}

function formatLog(level, message, meta) {
	const sanitizedMeta = meta ? redactSensitiveData(meta) : undefined;
	const timestamp = new Date().toISOString();
	const base = {
		ts: timestamp,
		level,
		msg: sanitizeString(message),
		...(sanitizedMeta && typeof sanitizedMeta === 'object' ? sanitizedMeta : { data: sanitizedMeta })
	};
	return JSON.stringify(base);
}

export const safeLogger = {
	info(message, meta) {
		console.log(formatLog('INFO', message, meta));
	},
	warn(message, meta) {
		console.warn(formatLog('WARN', message, meta));
	},
	error(message, meta) {
		console.error(formatLog('ERROR', message, meta));
	}
};

export default safeLogger;
