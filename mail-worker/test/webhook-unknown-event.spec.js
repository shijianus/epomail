import { env } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import resendService from '../src/service/resend-service.js';
import { dbInit } from '../src/init/init.js';
import { emailConst } from '../src/const/entity-const.js';

describe('B9: Webhook Unknown Event & State Transition Protection Specification', () => {
	const mockContext = {
		env: {
			...env,
			resend_webhook_secret: 'whsec_' + 'dGVzdC1zZWNyZXQtZm9yLXN2aXgtMzkxODIzNzc='
		}
	};

	const fixtureIds = { messages: [], tasks: [], events: [] };

	beforeAll(async () => {
		await dbInit.intDB({ env });
		await dbInit.v1_1DB({ env });
	});

	afterEach(async () => {
		const deletes = [
			...fixtureIds.messages.splice(0).map(id => env.db.prepare('DELETE FROM email WHERE resend_email_id=?').bind(id)),
			...fixtureIds.tasks.splice(0).map(id => env.db.prepare('DELETE FROM notification_outbox WHERE task_id=?').bind(id))
		];
		const events = fixtureIds.events.splice(0);
		deletes.push(...events.map(id => env.db.prepare('DELETE FROM webhook_event WHERE event_id=?').bind(id)));
		if (deletes.length) await env.db.batch(deletes);
		await Promise.all(events.map(id => env.kv.delete(`wh_resend:${id}`)));
	});

	async function seedDelivery(taskId, messageId) {
		fixtureIds.tasks.push(taskId);
		fixtureIds.messages.push(messageId);
		await env.db.batch([
			env.db.prepare(`INSERT INTO notification_outbox
				(task_id, channel, status, provider_message_id, recipient, template_code, subject, content)
				VALUES (?, 'resend', 'delivered', ?, 'user@example.com', 'notice_tpl', 'Notice Subject', 'Notice Content')`)
				.bind(taskId, messageId),
			env.db.prepare(`INSERT INTO email (account_id, user_id, resend_email_id, status) VALUES (?, ?, ?, ?)`)
				.bind(910001, 910001, messageId, emailConst.status.DELIVERED)
		]);
	}

	it('safely ignores unknown/unsupported webhook events without modifying outbox or email', async () => {
		const emailId = `resend_msg_${Date.now()}_unknown`;
		const taskId = `task_${Date.now()}_unknown`;
		const eventId = `evt_${Date.now()}_unknown`;

		fixtureIds.events.push(eventId);
		await seedDelivery(taskId, emailId);

		// 模拟第三方发送了一个未支持的新事件类型 (如 email.clicked, email.opened, domain.verified)
		const unknownPayload = {
			type: 'email.opened',
			id: eventId,
			data: {
				email_id: emailId,
				click: { link: 'https://example.com' }
			}
		};

		const result = await resendService.webhooks(mockContext, unknownPayload, eventId);

		// 必须返回 200 { success: true, ignored: true } 防止第三方重试风暴
		expect(result.success).toBe(true);
		expect(result.ignored).toBe(true);

		// 检查 webhook_event 台账，状态必须记录为 ignored
		const ledgerRow = await env.db.prepare('SELECT status, event_type FROM webhook_event WHERE event_id = ?')
			.bind(eventId).first();
		expect(ledgerRow).toBeDefined();
		expect(ledgerRow.status).toBe('ignored');
		expect(ledgerRow.event_type).toBe('email.opened');

		// 检查 notification_outbox 状态绝不被改变
		const outboxRow = await env.db.prepare('SELECT status FROM notification_outbox WHERE task_id = ?')
			.bind(taskId).first();
		expect(outboxRow.status).toBe('delivered');

		// 检查 email 状态绝不被改变
		const emailRow = await env.db.prepare('SELECT status FROM email WHERE resend_email_id = ?')
			.bind(emailId).first();
		expect(emailRow.status).toBe(emailConst.status.DELIVERED);
	});

	it('prevents terminal state rollback when late out-of-order events arrive', async () => {
		const emailId = `resend_msg_${Date.now()}_ooo`;
		const taskId = `task_${Date.now()}_ooo`;

		await seedDelivery(taskId, emailId);

		// 2. 模拟延迟到达的 email.sent 事件 (早于 delivered 发生，但网络乱序迟到)
		const lateSentEventId = `evt_late_sent_${Date.now()}`;
		fixtureIds.events.push(lateSentEventId);
		const latePayload = {
			type: 'email.sent',
			id: lateSentEventId,
			data: {
				email_id: emailId
			}
		};

		const result = await resendService.webhooks(mockContext, latePayload, lateSentEventId);
		expect(result.success).toBe(true);

		// 3. 验证 notification_outbox 依然保持 delivered 终态，绝不倒退为 sent
		const outboxRow = await env.db.prepare('SELECT status FROM notification_outbox WHERE task_id = ?')
			.bind(taskId).first();
		expect(outboxRow.status).toBe('delivered');

		// 4. 验证 email 记录依然保持 DELIVERED，绝不倒退为 SENT
		const emailRow = await env.db.prepare('SELECT status FROM email WHERE resend_email_id = ?')
			.bind(emailId).first();
		expect(emailRow.status).toBe(emailConst.status.DELIVERED);
	});

	it('rejects invalid signature with 401', async () => {
		const fakeSecret = 'whsec_' + 'dGVzdC1zZWNyZXQtZm9yLXN2aXgtMzkxODIzNzc=';
		const svixId = 'msg_invalid_sig_123';
		const svixTimestamp = Math.floor(Date.now() / 1000).toString();
		const svixSignature = 'v1,invalid_signature_base64_here';
		const rawBody = JSON.stringify({ type: 'email.delivered', data: { email_id: 're_123' } });

		await expect(resendService.verifyWebhookSignature({
			secret: fakeSecret,
			svixId,
			svixTimestamp,
			svixSignature,
			rawBody
		})).rejects.toThrow(/invalid webhook signature/i);
	});
});
