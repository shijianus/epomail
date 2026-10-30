import emailService from './email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';
import { getUserDb } from '../utils/db-accessor';

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function timingSafeEqual(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

const resendService = {

	/**
	 * 验证 Resend Svix 密码学签名与时间戳，严防伪造与重放攻击
	 */
	async verifyWebhookSignature({ secret, svixId, svixTimestamp, svixSignature, rawBody }) {
		if (!secret) {
			throw new BizError('Webhook endpoint is not configured', 503);
		}
		if (!svixId || !svixTimestamp || !svixSignature) {
			throw new BizError('Missing webhook signature headers', 401);
		}

		// 5 分钟时间戳漂移检查，阻断重放攻击
		const timestampSec = parseInt(svixTimestamp, 10);
		if (isNaN(timestampSec)) {
			throw new BizError('Invalid webhook timestamp', 401);
		}
		const nowSec = Math.floor(Date.now() / 1000);
		if (Math.abs(nowSec - timestampSec) > SIGNATURE_TOLERANCE_SECONDS) {
			throw new BizError('Webhook timestamp outside tolerance', 401);
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

		const match = passedSignatures.some(sig => timingSafeEqual(sig, expectedBase64));
		if (!match) {
			throw new BizError('Invalid webhook signature', 401);
		}
		return true;
	},

	async verifySignature(c, rawBody) {
		if (typeof rawBody !== 'string' || rawBody.length === 0) {
			throw new BizError('Empty webhook body', 400);
		}
		await this.verifyWebhookSignature({
			secret: c.env?.resend_webhook_secret || c.env?.RESEND_WEBHOOK_SECRET,
			svixId: c.req.header('svix-id'),
			svixTimestamp: c.req.header('svix-timestamp'),
			svixSignature: c.req.header('svix-signature'),
			rawBody
		});
	},

	async webhooks(c, body, svixId = null) {
		if (!body || !body.type || !body.data) return { ignored: true };

		const eventId = svixId || body.id || (body.data?.email_id ? `${body.data.email_id}_${body.type}` : null);
		const userDb = getUserDb(c) || c?.env?.db || (c._mockOrm ? c._mockOrm : null);

		// 0. KV 快速去重（best-effort 短路；权威去重始终以 webhook_event 台账主键为准）
		if (eventId && c?.env?.kv) {
			try {
				const seen = await c.env.kv.get(`wh_resend:${eventId}`);
				if (seen) {
					return { deduplicated: true, eventId };
				}
			} catch (_) {}
		}

		let emailStatus = emailConst.status.SENT;
		let emailMessage = null;

		if (body.type === 'email.delivered') {
			emailStatus = emailConst.status.DELIVERED;
		} else if (body.type === 'email.complained') {
			emailStatus = emailConst.status.COMPLAINED;
		} else if (body.type === 'email.bounced') {
			emailStatus = emailConst.status.BOUNCED;
			emailMessage = typeof body.data?.bounce === 'object' ? JSON.stringify(body.data.bounce) : String(body.data?.bounce || '');
		} else if (body.type === 'email.delivery_delayed') {
			emailStatus = emailConst.status.DELAYED;
		} else if (body.type === 'email.failed') {
			emailStatus = emailConst.status.FAILED;
			emailMessage = body.data?.failed?.reason || 'Delivery failed';
		}

		const params = {
			resendEmailId: body.data?.email_id,
			status: emailStatus,
			message: emailMessage,
			// 事件键控：事实追加以 eventId 去重，保证重复事件重放不产生重复事实行
			eventId
		};

		// 1. 普通邮件记录的乱序安全投影（带源状态守卫，单调不回退、重放安全）。
		// 投影与台账分属不同域写入（mail/user 双库模式下无法同批原子）：
		// 投影先落地，若后续台账批次失败，提供商重试会再次进入本流程 ——
		// 守卫使投影幂等（重复应用为零行变更），台账批次重试直至成功，整体收敛一致。
		if (params.resendEmailId) {
			// Projection failure must abort before the ledger row is written.
			// Swallowing it would mark the event processed while the mailbox
			// record stays stale; every provider retry would then be deduped.
			await emailService.updateEmailStatus(c, params);
		}

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
