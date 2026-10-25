import emailService from './email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';

const encoder = new TextEncoder();
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(value) {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function timingSafeEqual(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

async function hmacBase64(secretBytes, message) {
	const key = await crypto.subtle.importKey(
		'raw',
		secretBytes,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
	let binary = '';
	const bytes = new Uint8Array(signature);
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}

function webhookSecret(c) {
	const secret = c.env?.resend_webhook_secret;
	if (!secret || typeof secret !== 'string' || !secret.trim()) {
		throw new BizError('Webhook endpoint is not configured', 503);
	}
	const raw = secret.trim();
	const encoded = raw.startsWith('whsec_') ? raw.slice('whsec_'.length) : raw;
	try {
		return base64ToBytes(encoded);
	} catch (_) {
		return encoder.encode(raw);
	}
}

const resendService = {

	/**
	 * Verify a Resend/Svix webhook signature over the exact raw request body.
	 * https://docs.resend.com/guides/webhooks/verify-webhooks
	 */
	async verifySignature(c, rawBody) {
		if (typeof rawBody !== 'string' || rawBody.length === 0) {
			throw new BizError('Empty webhook body', 400);
		}

		const id = c.req.header('svix-id');
		const timestamp = c.req.header('svix-timestamp');
		const signatureHeader = c.req.header('svix-signature');
		if (!id || !timestamp || !signatureHeader) {
			throw new BizError('Missing webhook signature headers', 401);
		}

		const timestampNumber = Number(timestamp);
		const now = Math.floor(Date.now() / 1000);
		if (!Number.isFinite(timestampNumber) || Math.abs(now - timestampNumber) > SIGNATURE_TOLERANCE_SECONDS) {
			throw new BizError('Webhook timestamp outside tolerance', 401);
		}

		const expected = await hmacBase64(webhookSecret(c), `${id}.${timestamp}.${rawBody}`);
		const candidates = signatureHeader.split(/\s+/)
			.map(item => {
				const comma = item.indexOf(',');
				return comma === -1 ? item : item.slice(comma + 1);
			})
			.filter(Boolean);

		if (!candidates.some(candidate => timingSafeEqual(candidate, expected))) {
			throw new BizError('Invalid webhook signature', 401);
		}
	},

	async webhooks(c, body) {
		if (!body || typeof body !== 'object' || !body.type || !body.data || typeof body.data !== 'object') {
			throw new BizError('Invalid webhook payload', 400);
		}

		const resendEmailId = body.data.email_id;
		if (!resendEmailId || typeof resendEmailId !== 'string') {
			throw new BizError('Webhook payload missing email_id', 400);
		}

		const params = {
			resendEmailId,
			status: emailConst.status.SENT
		};

		if (body.type === 'email.delivered') {
			params.status = emailConst.status.DELIVERED
			params.message = null
		} else if (body.type === 'email.complained') {
			params.status = emailConst.status.COMPLAINED
			params.message = null
		} else if (body.type === 'email.bounced') {
			const bounce = JSON.stringify(body.data.bounce ?? null).slice(0, 2000);
			params.status = emailConst.status.BOUNCED
			params.message = bounce
		} else if (body.type === 'email.delivery_delayed') {
			params.status = emailConst.status.DELAYED
			params.message = null
		} else if (body.type === 'email.failed') {
			const reason = body.data.failed?.reason;
			params.status = emailConst.status.FAILED
			params.message = typeof reason === 'string' ? reason.slice(0, 500) : 'failed'
		} else {
			// Unknown event types are acknowledged without mutating state.
			return;
		}

		const emailRow = await emailService.updateEmailStatus(c, params)

		if (!emailRow) {
			throw new BizError('更新邮件状态记录失败');
		}

	}
}

export default resendService
