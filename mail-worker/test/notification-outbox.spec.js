import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import decisionNoticeService from '../src/service/decision-notice-service.js';
import resendService from '../src/service/resend-service.js';
import { ensureNoticeDeliverySchema } from '../src/utils/notice-delivery-schema.js';

// Storage and service code run in workerd against real D1. Only the provider
// network boundary is replaced; no mocked ORM, leases, receipts or projections.
const userDb = env.NOTICE_USER_DB;
const mailDb = env.NOTICE_MAIL_DB;
const WRONG_DB = { prepare() { throw new Error('Wrong default database selected'); } };
const PREFIX = 'NOTICE-SPEC-';
const USER_ID = 974001;
const CASE_ID = 974002;
const ADDRESS = 'notice-spec@example.com';
const SECRET_SENTINEL = 'NOTICE_PRIVATE_SECRET_OR_BODY';

function context(overrides = {}) {
	return {
		env: {
			...env, db: WRONG_DB, USER_DB: userDb, MAIL_DB: mailDb,
			resend_token: 're_test_only_never_real', ENVIRONMENT: 'test',
			EMAIL_OUTBOUND_ENABLED: 'false', OUTBOUND_WHITELIST_ENFORCE: 'true', OUTBOUND_WHITELIST: '',
			...overrides
		},
		get: key => key === 'user' ? { userId: USER_ID, email: env.admin } : undefined
	};
}

// Opt in only after a provider/network-blocking stub has been installed. Keep
// whitelist enforcement enabled: this fixture recipient is the only exception.
function providerContext(overrides = {}) {
	if (!vi.isMockFunction(globalThis.fetch)) throw new Error('Provider tests require a fetch stub');
	return context({ EMAIL_OUTBOUND_ENABLED: 'true', OUTBOUND_WHITELIST: ADDRESS, ...overrides });
}

async function ensureBaseTables(db, mail = false) {
	if (!mail) {
		await db.prepare(`CREATE TABLE IF NOT EXISTS user (
			user_id INTEGER PRIMARY KEY, email TEXT NOT NULL, password TEXT NOT NULL DEFAULT '',
			salt TEXT NOT NULL DEFAULT '', status INTEGER NOT NULL DEFAULT 0, is_del INTEGER NOT NULL DEFAULT 0
		)`).run();
		await db.prepare(`CREATE TABLE IF NOT EXISTS audit_log (
			id INTEGER PRIMARY KEY, email TEXT NOT NULL, status TEXT, warning_type TEXT,
			event_type TEXT NOT NULL DEFAULT 'test', category TEXT NOT NULL DEFAULT 'test',
			action_text TEXT NOT NULL DEFAULT 'test'
		)`).run();
		await db.prepare(`CREATE TABLE IF NOT EXISTS webhook_event (
			event_id TEXT PRIMARY KEY, provider TEXT NOT NULL, event_type TEXT NOT NULL,
			resource_id TEXT, payload TEXT, status TEXT NOT NULL DEFAULT 'processed',
			create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`).run();
	} else {
		await db.prepare(`CREATE TABLE IF NOT EXISTS account (
			account_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
			email TEXT NOT NULL, status INTEGER NOT NULL DEFAULT 0, is_del INTEGER NOT NULL DEFAULT 0
		)`).run();
		await db.prepare(`CREATE TABLE IF NOT EXISTS email (
			email_id INTEGER PRIMARY KEY AUTOINCREMENT, send_email TEXT, name TEXT,
			account_id INTEGER NOT NULL, user_id INTEGER NOT NULL, subject TEXT, code TEXT NOT NULL DEFAULT '',
			text TEXT, content TEXT, cc TEXT DEFAULT '[]', bcc TEXT DEFAULT '[]', recipient TEXT,
			to_email TEXT NOT NULL DEFAULT '', to_name TEXT NOT NULL DEFAULT '', in_reply_to TEXT DEFAULT '',
			relation TEXT DEFAULT '', message_id TEXT DEFAULT '', type INTEGER NOT NULL DEFAULT 0,
			status INTEGER NOT NULL DEFAULT 0, resend_email_id TEXT, message TEXT, unread INTEGER NOT NULL DEFAULT 0,
			create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, is_del INTEGER NOT NULL DEFAULT 0,
			is_spam INTEGER NOT NULL DEFAULT 0, snoozed_time TEXT, snoozed_end_time TEXT,
			labels TEXT NOT NULL DEFAULT '[]'
		)`).run();
	}
}

beforeAll(async () => {
	await ensureBaseTables(userDb);
	await ensureBaseTables(mailDb, true);
	await ensureNoticeDeliverySchema(context());
	await ensureNoticeDeliverySchema(context()); // cold start + repeated upgrade
}, 30000);

async function withFixture(run) {
	const eventIds = [];
	const triggers = [];
	const tasks = [];
	try {
		// No fixture may fall through to real HTTP, even if an internal-only
		// test unexpectedly reaches a provider after a service regression.
		vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Real network is disabled in notification fixtures'); }));
		await userDb.prepare("INSERT INTO user (user_id, email, password, salt, status, is_del) VALUES (?, ?, 'unused-test', 'unused-test', 0, 0)")
			.bind(USER_ID, ADDRESS).run();
		await mailDb.prepare('INSERT INTO account (user_id, email, status, is_del) VALUES (?, ?, 0, 0)')
			.bind(USER_ID, ADDRESS).run();
		await userDb.prepare("INSERT INTO audit_log (id, email, status, warning_type, event_type, category, action_text) VALUES (?, ?, 'unbanned', 'ban', 'test', 'test', 'test')")
			.bind(CASE_ID, ADDRESS).run();
		const createTask = async (values = {}) => {
			const taskId = `${PREFIX}${crypto.randomUUID()}`;
			tasks.push(taskId);
			await decisionNoticeService.buildOutboxInsertStmt(userDb, {
				taskId, userId: USER_ID, recipient: ADDRESS, channel: 'internal',
				templateCode: 'UNBAN', subject: 'Notice fixture', content: '<p>Notice fixture</p>',
				textContent: 'Notice fixture', ...values
			}).run();
			return taskId;
		};
		const event = async (taskId, type, providerId, correlated = true) => {
			const id = `${PREFIX}${crypto.randomUUID()}`;
			eventIds.push(id);
			await resendService.webhooks(context(), {
				type, data: {
					email_id: providerId, ...(correlated ? { tags: { notice_task_id: taskId } } : {}),
					failed: { reason: SECRET_SENTINEL }, bounce: { message: SECRET_SENTINEL }
				}
			}, id);
		};
		const installTrigger = async (db, name, sql) => {
			triggers.push([db, name]);
			await db.prepare(sql).run();
		};
		await run({ createTask, event, installTrigger });
	} finally {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		for (const [db, name] of triggers) await db.prepare(`DROP TRIGGER IF EXISTS ${name}`).run();
		await mailDb.batch([
			mailDb.prepare('DELETE FROM notice_delivery_receipt WHERE user_id = ?').bind(USER_ID),
			mailDb.prepare('DELETE FROM email WHERE user_id = ?').bind(USER_ID),
			mailDb.prepare('DELETE FROM account WHERE user_id = ?').bind(USER_ID)
		]);
		for (const taskId of tasks) await userDb.prepare('DELETE FROM notification_outbox WHERE task_id = ?').bind(taskId).run();
		for (const eventId of eventIds) {
			await userDb.prepare('DELETE FROM webhook_event WHERE event_id = ?').bind(eventId).run();
			await env.kv.delete(`wh_resend:${eventId}`);
		}
		await userDb.batch([
			userDb.prepare('DELETE FROM audit_log WHERE id = ?').bind(CASE_ID),
			userDb.prepare('DELETE FROM user WHERE user_id = ?').bind(USER_ID)
		]);
		expect((await mailDb.prepare('SELECT COUNT(*) AS n FROM email WHERE user_id = ?').bind(USER_ID).first()).n).toBe(0);
		expect((await mailDb.prepare('SELECT COUNT(*) AS n FROM notice_delivery_receipt WHERE user_id = ?').bind(USER_ID).first()).n).toBe(0);
	}
}

const readTask = taskId => userDb.prepare('SELECT * FROM notification_outbox WHERE task_id = ?').bind(taskId).first();
const makeDue = taskId => userDb.prepare("UPDATE notification_outbox SET next_retry_at = datetime('now', '-1 second') WHERE task_id = ?").bind(taskId).run();
const providerResponse = id => new Response(JSON.stringify({ id }), { status: 200, headers: { 'content-type': 'application/json' } });
function providerMock(implementation) {
	const mock = vi.fn(implementation || (() => Promise.resolve(providerResponse('provider-test-id'))));
	vi.stubGlobal('fetch', mock);
	return mock;
}

// All tests, including failures while seeding or asserting, physically remove
// their D1/KV data and restore network stubs and failure-injection triggers.
describe('notification outbox (real Worker runtime + D1)', () => {
	it('rolls back email on receipt failure and retries immediate delivery exactly once', async () => {
		await withFixture(async ({ createTask, installTrigger }) => {
			const taskId = await createTask();
			await installTrigger(mailDb, 'notice_receipt_fail', `CREATE TRIGGER notice_receipt_fail
				BEFORE INSERT ON notice_delivery_receipt WHEN NEW.user_id = ${USER_ID}
				BEGIN SELECT RAISE(ABORT, '${SECRET_SENTINEL}'); END`);
			expect((await decisionNoticeService.deliverOutboxTask(context(), taskId)).failed).toBe(1);
			expect((await readTask(taskId)).status).toBe('failed');
			expect((await readTask(taskId)).last_error).not.toContain(SECRET_SENTINEL);
			expect((await mailDb.prepare('SELECT COUNT(*) AS n FROM email WHERE user_id = ?').bind(USER_ID).first()).n).toBe(0);
			await mailDb.prepare('DROP TRIGGER notice_receipt_fail').run();
			await makeDue(taskId);
			await Promise.all([
				decisionNoticeService.processOutboxBatch(context(), 1, 'worker-a'),
				decisionNoticeService.processOutboxBatch(context(), 1, 'worker-b')
			]);
			expect((await readTask(taskId)).status).toBe('delivered');
			await decisionNoticeService.deliverOutboxTask(context(), taskId);
			const receipts = await mailDb.prepare(`SELECT r.email_id, e.message_id FROM notice_delivery_receipt r
				JOIN email e ON e.email_id = r.email_id WHERE r.task_id = ?`).bind(taskId).all();
			expect(receipts.results).toHaveLength(1);
			expect(receipts.results[0].message_id).toMatch(/^<notice-[a-f0-9]{64}@epocanvas\.com>$/);
			expect((await mailDb.prepare('SELECT COUNT(*) AS n FROM email WHERE user_id = ?').bind(USER_ID).first()).n).toBe(1);
		});
	});

	it('concurrent receipt writers converge without orphan emails', async () => {
		await withFixture(async ({ createTask }) => {
			const taskId = await createTask();
			const args = { taskId, targetUser: { userId: USER_ID, email: ADDRESS }, recipient: ADDRESS,
				subject: 'Concurrent notice', htmlContent: '<p>Concurrent</p>', textContent: 'Concurrent' };
			const [a, b] = await Promise.all([
				decisionNoticeService.persistInternalNotice(context(), args),
				decisionNoticeService.persistInternalNotice(context(), args)
			]);
			expect(a.emailId).toBe(b.emailId);
			expect((await mailDb.prepare('SELECT COUNT(*) AS n FROM email WHERE user_id = ?').bind(USER_ID).first()).n).toBe(1);
			await decisionNoticeService.deliverOutboxTask(context(), taskId);
			expect((await readTask(taskId)).status).toBe('delivered');
		});
	});

	it('recovers MAIL_DB commit after USER_DB completion write fails without duplicate mail', async () => {
		await withFixture(async ({ createTask, installTrigger }) => {
			const taskId = await createTask();
			await installTrigger(userDb, 'notice_writeback_fail', `CREATE TRIGGER notice_writeback_fail
				BEFORE UPDATE ON notification_outbox WHEN NEW.task_id = '${taskId}' AND NEW.status = 'delivered'
				BEGIN SELECT RAISE(ABORT, 'forced writeback failure'); END`);
			await decisionNoticeService.deliverOutboxTask(context(), taskId);
			expect((await readTask(taskId)).status).toBe('failed');
			const receipt = await mailDb.prepare('SELECT email_id FROM notice_delivery_receipt WHERE task_id = ?').bind(taskId).first();
			expect(receipt.email_id).toBeGreaterThan(0);
			await userDb.prepare('DROP TRIGGER notice_writeback_fail').run();
			await makeDue(taskId);
			await decisionNoticeService.deliverOutboxTask(context(), taskId);
			expect((await readTask(taskId)).status).toBe('delivered');
			expect((await mailDb.prepare('SELECT COUNT(*) AS n FROM email WHERE user_id = ?').bind(USER_ID).first()).n).toBe(1);
		});
	});

	it('does not treat a receipt without its real email as delivered or resend it', async () => {
		await withFixture(async ({ createTask }) => {
			const taskId = await createTask();
			await decisionNoticeService.deliverOutboxTask(context(), taskId);
			await mailDb.prepare('DELETE FROM email WHERE user_id = ?').bind(USER_ID).run();
			await userDb.prepare("UPDATE notification_outbox SET status = 'pending', delivered_at = NULL WHERE task_id = ?").bind(taskId).run();
			await decisionNoticeService.deliverOutboxTask(context(), taskId);
			expect((await readTask(taskId)).status).toBe('failed');
			expect((await mailDb.prepare('SELECT COUNT(*) AS n FROM email WHERE user_id = ?').bind(USER_ID).first()).n).toBe(0);
		});
	});

	it('delivers UNBAN but cancels only explicit punitive templates superseded by unban', async () => {
		await withFixture(async ({ createTask }) => {
			const unban = await createTask({ caseId: CASE_ID });
			await decisionNoticeService.deliverOutboxTask(context(), unban);
			expect((await readTask(unban)).status).toBe('delivered');
			for (const templateCode of ['FIRST_BAN', 'MAINTAIN_BAN', 'REJECT_APPEAL']) {
				const taskId = await createTask({ caseId: CASE_ID, templateCode });
				await decisionNoticeService.deliverOutboxTask(context(), taskId);
				expect((await readTask(taskId)).status).toBe('cancelled');
			}
		});
	});

	it('fails closed on unavailable case or user state and never calls the provider', async () => {
		await withFixture(async ({ createTask }) => {
			const fetch = providerMock();
			const missingCase = await createTask({ channel: 'external', caseId: CASE_ID + 1, templateCode: 'FIRST_BAN' });
			await decisionNoticeService.deliverOutboxTask(providerContext(), missingCase);
			expect((await readTask(missingCase)).status).toBe('failed');
			await userDb.prepare("UPDATE audit_log SET status = 'banned' WHERE id = ?").bind(CASE_ID).run();
			const missingUser = await createTask({ channel: 'external', caseId: CASE_ID, userId: USER_ID + 1, templateCode: 'FIRST_BAN' });
			await decisionNoticeService.deliverOutboxTask(providerContext(), missingUser);
			expect((await readTask(missingUser)).status).toBe('failed');
			expect(fetch).not.toHaveBeenCalled();
		});
	});

	it('caps batches and fails closed when D1 refuses a lease', async () => {
		await withFixture(async ({ createTask, installTrigger }) => {
			const fetch = providerMock();
			const taskId = await createTask({ channel: 'external' });
			await installTrigger(userDb, 'notice_lease_fail', `CREATE TRIGGER notice_lease_fail
				BEFORE UPDATE ON notification_outbox WHEN NEW.task_id = '${taskId}' AND NEW.status = 'processing'
				BEGIN SELECT RAISE(ABORT, '${SECRET_SENTINEL}'); END`);
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
			expect((await decisionNoticeService.processOutboxBatch(providerContext(), -1)).processed).toBe(0);
			expect((await decisionNoticeService.processOutboxBatch(providerContext(), 100000)).processed).toBe(0);
			expect((await readTask(taskId)).status).toBe('pending');
			expect(fetch).not.toHaveBeenCalled();
			expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET_SENTINEL);
		});
	});

	it.each([
		{ EMAIL_OUTBOUND_ENABLED: 'false' },
		{ EMAIL_OUTBOUND_ENABLED: false },
		{ ENVIRONMENT: 'staging', OUTBOUND_WHITELIST: '' }
	])('checks the shared outbound gate even for same-domain provider recipients: %j', async policy => {
		await withFixture(async ({ createTask }) => {
			const fetch = providerMock();
			const taskId = await createTask({ channel: 'external' });
			await decisionNoticeService.deliverOutboxTask(providerContext(policy), taskId);
			expect(fetch).not.toHaveBeenCalled();
			expect((await readTask(taskId)).status).toBe('failed');
			expect((await readTask(taskId)).provider_attempted_at).toBeNull();
		});
	});

	it('two workers send only once, provider acceptance stays sent, manual retry is denied', async () => {
		await withFixture(async ({ createTask }) => {
			const taskId = await createTask({ channel: 'external' });
			const fetch = providerMock();
			await Promise.all([
				decisionNoticeService.processOutboxBatch(providerContext(), 1, 'external-a'),
				decisionNoticeService.processOutboxBatch(providerContext(), 1, 'external-b')
			]);
			expect(fetch).toHaveBeenCalledTimes(1);
			const row = await readTask(taskId);
			expect(row.status).toBe('sent');
			expect(row.delivered_at).toBeNull();
			expect(row.provider_attempted_at).not.toBeNull();
			const headers = new Headers(fetch.mock.calls[0][1].headers);
			expect(headers.get('idempotency-key')).toBe(`notice/${taskId}`);
			await expect(decisionNoticeService.retryOutboxTask(context(), taskId)).rejects.toThrow(/cannot be retried/);
		});
	});

	it.each(['email.delivered', 'email.complained', 'email.bounced', 'email.failed'])(
		'keeps an early %s terminal despite a late provider acceptance response', async type => {
			await withFixture(async ({ createTask, event }) => {
				const taskId = await createTask({ channel: 'external' });
				const providerId = `provider-${crypto.randomUUID()}`;
				const fetch = providerMock(async () => {
					await event(taskId, type, providerId);
					return providerResponse(providerId);
				});
				await decisionNoticeService.deliverOutboxTask(providerContext(), taskId);
				const expected = { 'email.delivered': 'delivered', 'email.complained': 'complained', 'email.bounced': 'dead_letter', 'email.failed': 'dead_letter' }[type];
				expect((await readTask(taskId)).status).toBe(expected);
				expect((await readTask(taskId)).claimant_id).toBeNull();
				expect((await readTask(taskId)).last_error || '').not.toContain(SECRET_SENTINEL);
				await expect(decisionNoticeService.retryOutboxTask(context(), taskId)).rejects.toThrow(/cannot be retried/);
				await event(taskId, 'email.sent', providerId);
				expect((await readTask(taskId)).status).toBe(expected);
				expect(fetch).toHaveBeenCalledTimes(1);
			});
		}
	);

	it('does not overwrite an early complaint with the send failure retry path', async () => {
		await withFixture(async ({ createTask, event }) => {
			const taskId = await createTask({ channel: 'external' });
			providerMock(async () => {
				await event(taskId, 'email.complained', 'provider-complaint-before-error');
				throw new Error(SECRET_SENTINEL);
			});
			await decisionNoticeService.deliverOutboxTask(providerContext(), taskId);
			expect((await readTask(taskId)).status).toBe('complained');
			expect((await readTask(taskId)).retry_count).toBe(0);
		});
	});

	it('recovers a terminal webhook without task headers/tags from the ledger before setting sent', async () => {
		await withFixture(async ({ createTask, event }) => {
			const taskId = await createTask({ channel: 'external' });
			const providerId = `provider-${crypto.randomUUID()}`;
			providerMock(async () => {
				await event(taskId, 'email.delivered', providerId, false);
				return providerResponse(providerId);
			});
			await decisionNoticeService.deliverOutboxTask(providerContext(), taskId);
			expect((await readTask(taskId)).status).toBe('delivered');
		});
	});

	it('retains one idempotency key within the window and refuses expired unknown/manual retries', async () => {
		await withFixture(async ({ createTask }) => {
			const taskId = await createTask({ channel: 'external' });
			const fetch = providerMock(async () => { throw new Error(SECRET_SENTINEL); });
			await decisionNoticeService.deliverOutboxTask(providerContext(), taskId);
			const first = await readTask(taskId);
			expect(first.status).toBe('unknown');
			expect(first.last_error).not.toContain(SECRET_SENTINEL);
			await makeDue(taskId);
			await decisionNoticeService.deliverOutboxTask(providerContext(), taskId);
			expect(fetch).toHaveBeenCalledTimes(2);
			for (const [, options] of fetch.mock.calls) expect(new Headers(options.headers).get('idempotency-key')).toBe(`notice/${taskId}`);
			expect((await readTask(taskId)).provider_attempted_at).toBe(first.provider_attempted_at);
			await userDb.prepare("UPDATE notification_outbox SET provider_attempted_at = datetime('now', '-25 hours'), next_retry_at = NULL WHERE task_id = ?")
				.bind(taskId).run();
			await decisionNoticeService.deliverOutboxTask(providerContext(), taskId);
			await expect(decisionNoticeService.retryOutboxTask(context(), taskId)).rejects.toThrow(/cannot be retried/);
			expect(fetch).toHaveBeenCalledTimes(2);
		});
	});

	it('an expired processing lease with an old provider attempt becomes unknown without sending', async () => {
		await withFixture(async ({ createTask }) => {
			const taskId = await createTask({ channel: 'external' });
			await userDb.prepare(`UPDATE notification_outbox SET status = 'processing', claimant_id = 'dead-worker',
				lease_expires_at = datetime('now', '-1 second'), provider_attempted_at = datetime('now', '-25 hours') WHERE task_id = ?`)
				.bind(taskId).run();
			const fetch = providerMock();
			await decisionNoticeService.deliverOutboxTask(providerContext(), taskId);
			expect((await readTask(taskId)).status).toBe('unknown');
			expect(fetch).not.toHaveBeenCalled();
		});
	});
});
