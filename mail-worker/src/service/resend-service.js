import emailService from './email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';

const resendService = {

	/**
	 * 验证 Resend Svix 密码学签名与时间戳，严防伪造与重放攻击
	 */
	async verifyWebhookSignature({ secret, svixId, svixTimestamp, svixSignature, rawBody }) {
		if (!secret) {
			throw new BizError('Webhook 签名密钥未配置 (Missing RESEND_WEBHOOK_SECRET)', 500);
		}
		if (!svixId || !svixTimestamp || !svixSignature) {
			throw new BizError('缺少必要的 Svix 签名头 (Missing svix headers)', 400);
		}

		// 5 分钟时间戳漂移检查，阻断重放攻击
		const timestampSec = parseInt(svixTimestamp, 10);
		if (isNaN(timestampSec)) {
			throw new BizError('非法时间戳格式', 400);
		}
		const nowSec = Math.floor(Date.now() / 1000);
		if (Math.abs(nowSec - timestampSec) > 300) {
			throw new BizError('Webhook 签名已过期 (Timestamp skew exceeded 300s)', 400);
		}

		let cleanSecret = secret.startsWith('whsec_') ? secret.substring(6) : secret;
		let rawKey;
		try {
			const binaryStr = atob(cleanSecret);
			rawKey = new Uint8Array(binaryStr.length);
			for (let i = 0; i < binaryStr.length; i++) {
				rawKey[i] = binaryStr.charCodeAt(i);
			}
		} catch (_) {
			rawKey = new TextEncoder().encode(cleanSecret);
		}

		const cryptoKey = await crypto.subtle.importKey(
			'raw',
			rawKey,
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);

		const signedPayload = new TextEncoder().encode(`${svixId}.${svixTimestamp}.${rawBody}`);
		const expectedSignatureBytes = await crypto.subtle.sign('HMAC', cryptoKey, signedPayload);
		const expectedBase64 = btoa(String.fromCharCode(...new Uint8Array(expectedSignatureBytes)));

		const passedSignatures = svixSignature.split(' ').map(s => {
			const parts = s.split(',');
			return parts.length > 1 ? parts[1] : parts[0];
		});

		const match = passedSignatures.some(sig => sig === expectedBase64);
		if (!match) {
			throw new BizError('Webhook 签名核验失败 (Invalid Svix signature)', 401);
		}
		return true;
	},

	async webhooks(c, body, svixId = null) {
		if (!body || !body.type || !body.data) return { ignored: true };

		const eventId = svixId || body.id || (body.data?.email_id ? `${body.data.email_id}_${body.type}` : null);
		const userDb = c?.env?.db || (c._mockOrm ? c._mockOrm : null);

		// 1. 同步常规发信表状态 (非致命尝试)
		try {
			await emailService.updateEmailStatus(c, params);
		} catch (_) {}

		// 2. 数据库级强一致去重台账与 Outbox 状态机单批原子提交
		// 严防“先标已处理、实际更新失败后永久漏处理”
		if (userDb && eventId) {
			const stmts = [];
			stmts.push(userDb.prepare(`
				INSERT INTO webhook_event (event_id, provider, event_type, resource_id, status)
				VALUES (?, 'resend', ?, ?, 'processed')
			`).bind(eventId, body.type || 'unknown', body.data?.email_id || null));

			if (body.data?.email_id) {
				const entityRefTaskId = body.data?.headers?.['X-Entity-Ref-ID'] || body.data?.headers?.['x-entity-ref-id'] || null;

				if (body.type === 'email.delivered') {
					stmts.push(userDb.prepare(`
						UPDATE notification_outbox
						SET status = 'delivered', provider_message_id = coalesce(provider_message_id, ?),
						    delivered_at = datetime('now'), update_time = datetime('now')
						WHERE (provider_message_id = ? OR (? IS NOT NULL AND task_id = ?))
						  AND status IN ('pending', 'processing', 'sent', 'failed')
					`).bind(body.data.email_id, body.data.email_id, entityRefTaskId, entityRefTaskId));
				} else if (body.type === 'email.bounced') {
					const lastError = 'Bounced: ' + (typeof body.data.bounce === 'object' ? JSON.stringify(body.data.bounce) : body.data.bounce);
					stmts.push(userDb.prepare(`
						UPDATE notification_outbox
						SET status = 'dead_letter', provider_message_id = coalesce(provider_message_id, ?),
						    last_error = ?, update_time = datetime('now')
						WHERE (provider_message_id = ? OR (? IS NOT NULL AND task_id = ?))
						  AND status != 'dead_letter' AND status != 'canceled'
					`).bind(body.data.email_id, lastError, body.data.email_id, entityRefTaskId, entityRefTaskId));
				} else if (body.type === 'email.complained') {
					stmts.push(userDb.prepare(`
						UPDATE notification_outbox
						SET status = 'complained', provider_message_id = coalesce(provider_message_id, ?),
						    last_error = 'Recipient marked notification as complained', update_time = datetime('now')
						WHERE (provider_message_id = ? OR (? IS NOT NULL AND task_id = ?))
						  AND status != 'canceled'
					`).bind(body.data.email_id, body.data.email_id, entityRefTaskId, entityRefTaskId));
				} else if (body.type === 'email.failed') {
					const lastError = body.data?.failed?.reason || 'External delivery failed';
					stmts.push(userDb.prepare(`
						UPDATE notification_outbox
						SET status = 'failed', provider_message_id = coalesce(provider_message_id, ?),
						    last_error = ?, update_time = datetime('now')
						WHERE (provider_message_id = ? OR (? IS NOT NULL AND task_id = ?))
						  AND status IN ('pending', 'processing', 'sent')
					`).bind(body.data.email_id, lastError, body.data.email_id, entityRefTaskId, entityRefTaskId));
				}
			}

			try {
				if (typeof userDb.batch === 'function') {
					await userDb.batch(stmts);
				} else {
					for (const s of stmts) {
						await s.run();
					}
				}
			} catch (err) {
				const msg = String(err?.message || err);
				if (msg.includes('UNIQUE constraint failed') || msg.includes('PRIMARY KEY')) {
					return { deduplicated: true, eventId };
				}
				throw err;
			}
		}

		// 3. 辅以 KV 缓存加速高频过滤
		if (eventId && c?.env?.kv) {
			try {
				await c.env.kv.put(`wh_resend:${eventId}`, '1', { expirationTtl: 86400 });
			} catch (_) {}
		}

		return { success: true, eventId };
	}
};

export default resendService;
