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

function noticeTaskReference(data) {
	const headers = data?.headers;
	const tags = data?.tags;
	const header = Array.isArray(headers)
		? headers.find(item => String(item?.name || '').toLowerCase() === 'x-entity-ref-id')?.value
		: headers?.['X-Entity-Ref-ID'] || headers?.['x-entity-ref-id'];
	const tag = Array.isArray(tags)
		? tags.find(item => item?.name === 'notice_task_id')?.value
		: tags?.notice_task_id;
	return typeof (tag || header) === 'string' ? (tag || header) : null;
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
		const userDb = getUserDb(c);

		// 0. KV 快速去重（best-effort 短路；权威去重始终以 webhook_event 台账主键为准）
		if (eventId && c?.env?.kv) {
			try {
				const seen = await c.env.kv.get(`wh_resend:${eventId}`);
				if (seen) {
					return { deduplicated: true, eventId };
				}
			} catch (_) {}
		}

		const KNOWN_STATUS_MAP = {
			'email.sent': emailConst.status.SENT,
			'email.delivered': emailConst.status.DELIVERED,
			'email.delivery_delayed': emailConst.status.DELAYED,
			'email.bounced': emailConst.status.BOUNCED,
			'email.failed': emailConst.status.FAILED,
			'email.complained': emailConst.status.COMPLAINED
		};

		const isKnownEvent = Object.prototype.hasOwnProperty.call(KNOWN_STATUS_MAP, body.type);

		// 若签名有效但属于未知/不支持的事件类型：
		// 1. 绝不修改 outbox 或 email 记录状态
		// 2. 将 webhook_event 状态记录为 ignored
		// 3. 正常返回 HTTP 200 { success: true, ignored: true }，防止第三方重试风暴
		if (!isKnownEvent) {
			if (userDb && eventId) {
				try {
					await userDb.prepare(`
						INSERT INTO webhook_event (event_id, provider, event_type, resource_id, status)
						VALUES (?, 'resend', ?, ?, 'ignored')
					`).bind(eventId, body.type || 'unknown', body.data?.email_id || null).run();
				} catch (err) {
					const msg = String(err?.message || err);
					if (msg.includes('UNIQUE constraint failed') || msg.includes('PRIMARY KEY')) {
						return { deduplicated: true, ignored: true, eventId };
					}
				}
			}
			if (eventId && c?.env?.kv) {
				try {
					await c.env.kv.put(`wh_resend:${eventId}`, '1', { expirationTtl: 86400 });
				} catch (_) {}
			}
			return { success: true, ignored: true, eventId };
		}

		let emailStatus = KNOWN_STATUS_MAP[body.type];
		let emailMessage = null;

		if (body.type === 'email.bounced') {
			emailMessage = typeof body.data?.bounce === 'object' ? JSON.stringify(body.data.bounce) : String(body.data?.bounce || '');
		} else if (body.type === 'email.failed') {
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
				const entityRefTaskId = noticeTaskReference(body.data);
				const inFlight = ['pending', 'processing', 'sent', 'failed', 'unknown'];
				const transitions = {
					'email.sent': { status: 'sent', from: inFlight, error: null },
					'email.delivery_delayed': { status: 'sent', from: inFlight, error: 'Provider delivery delayed' },
					'email.delivered': { status: 'delivered', from: inFlight, error: null },
					'email.bounced': { status: 'dead_letter', from: [...inFlight, 'delivered'], error: 'Provider reported a bounce' },
					// A signed provider failure is a terminal fact, not permission to resend.
					'email.failed': { status: 'dead_letter', from: inFlight, error: 'Provider reported delivery failure' },
					'email.complained': { status: 'complained', from: [...inFlight, 'delivered', 'dead_letter'], error: 'Recipient reported a complaint' }
				};
				const transition = transitions[body.type];
				if (transition) {
					stmts.push(userDb.prepare(`UPDATE notification_outbox
						SET status = ?, provider_message_id = COALESCE(provider_message_id, ?), last_error = ?,
							delivered_at = CASE WHEN ? = 'delivered' THEN COALESCE(delivered_at, datetime('now')) ELSE delivered_at END,
							claimant_id = NULL, lease_expires_at = NULL, next_retry_at = NULL, update_time = datetime('now')
						WHERE channel IN ('external', 'resend')
							AND (provider_message_id = ? OR (provider_message_id IS NULL AND task_id = ?))
							AND status IN (${transition.from.map(() => '?').join(', ')})`)
						.bind(transition.status, body.data.email_id, transition.error, transition.status,
							body.data.email_id, entityRefTaskId, ...transition.from));
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
