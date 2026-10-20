import emailService from './email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';

const resendService = {

	async webhooks(c, body) {
		if (!body || !body.type || !body.data) return;

		// 1. Webhook 事件幂等去重 (按 Provider Event ID 或 EmailID+Type 防重复投递)
		const eventId = body.id || (body.data?.email_id ? `${body.data.email_id}_${body.type}` : null);
		if (eventId && c?.env?.kv) {
			try {
				const seen = await c.env.kv.get(`wh_resend:${eventId}`);
				if (seen) {
					return { deduplicated: true };
				}
				await c.env.kv.put(`wh_resend:${eventId}`, '1', { expirationTtl: 86400 });
			} catch (_) {}
		}

		const params = {
			resendEmailId: body.data.email_id,
			status: emailConst.status.SENT
		};

		if (body.type === 'email.delivered') {
			params.status = emailConst.status.DELIVERED;
			params.message = null;
		} else if (body.type === 'email.complained') {
			params.status = emailConst.status.COMPLAINED;
			params.message = null;
		} else if (body.type === 'email.bounced') {
			let bounce = body.data.bounce;
			bounce = JSON.stringify(bounce);
			params.status = emailConst.status.BOUNCED;
			params.message = bounce;
		} else if (body.type === 'email.delivery_delayed') {
			params.status = emailConst.status.DELAYED;
			params.message = null;
		} else if (body.type === 'email.failed') {
			params.status = emailConst.status.FAILED;
			params.message = body.data?.failed?.reason || 'Delivery failed';
		}

		// 2. 同步常规邮件表状态 (若匹配)
		try {
			await emailService.updateEmailStatus(c, params);
		} catch (_) {}

		// 3. 同步裁决通知 Outbox 任务状态
		const userDb = c?.env?.db || (c._mockOrm ? c._mockOrm : null);
		if (userDb && body.data.email_id) {
			try {
				let outboxStatus = null;
				let lastError = null;

				if (body.type === 'email.delivered') {
					outboxStatus = 'delivered';
				} else if (body.type === 'email.bounced') {
					outboxStatus = 'dead_letter';
					lastError = 'Bounced: ' + (typeof body.data.bounce === 'object' ? JSON.stringify(body.data.bounce) : body.data.bounce);
				} else if (body.type === 'email.complained') {
					outboxStatus = 'complained';
					lastError = 'Recipient marked notification as complained';
				} else if (body.type === 'email.failed') {
					outboxStatus = 'failed';
					lastError = body.data?.failed?.reason || 'External delivery failed';
				}

				if (outboxStatus) {
					await userDb.prepare(`
						UPDATE notification_outbox
						SET status = ?, last_error = coalesce(?, last_error),
						    delivered_at = CASE WHEN ? = 'delivered' THEN datetime('now') ELSE delivered_at END,
						    update_time = datetime('now')
						WHERE provider_message_id = ?
					`).bind(outboxStatus, lastError, outboxStatus, body.data.email_id).run();
				}
			} catch (err) {
				console.warn('[resendService] Failed to sync outbox status on webhook:', err.message);
			}
		}

		return { success: true };
	}
}

export default resendService
