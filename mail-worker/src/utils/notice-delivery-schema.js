import { getUserDb, getMailDb } from './db-accessor.js';

/**
 * Call after the identity/mail base tables, on both fresh init and upgrades.
 * Each database owns its schema transaction; this is NOT a cross-D1 transaction.
 * A partial migration is safe to run again. Failures must abort initialization.
 */
export async function ensureNoticeDeliverySchema(c) {
	const userDb = getUserDb(c);
	const mailDb = getMailDb(c);
	if (!userDb?.prepare || !mailDb?.prepare) throw new Error('Notice databases unavailable');
	try {
		await userDb.prepare(`CREATE TABLE IF NOT EXISTS notification_outbox (
			id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL UNIQUE,
			case_id INTEGER, ticket_id TEXT, user_id INTEGER, recipient TEXT NOT NULL,
			channel TEXT NOT NULL DEFAULT 'internal', template_code TEXT NOT NULL,
			subject TEXT NOT NULL, content TEXT NOT NULL, text_content TEXT, reason_code TEXT,
			status TEXT NOT NULL DEFAULT 'pending', provider_message_id TEXT,
			provider_attempted_at TEXT, retry_count INTEGER NOT NULL DEFAULT 0,
			max_retries INTEGER NOT NULL DEFAULT 5, last_error TEXT, next_retry_at TEXT,
			delivered_at TEXT, read_at TEXT, claimant_id TEXT, lease_expires_at TEXT,
			lease_version INTEGER NOT NULL DEFAULT 0,
			create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
			update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`).run();
		const info = await userDb.prepare("PRAGMA table_info('notification_outbox')").all();
		const columns = new Set(info.results.map(row => row.name));
		// Quarantine before adding the marker column, so an interrupted upgrade
		// cannot skip this safety step on its next run. Legacy sends had no key.
		if (!columns.has('provider_attempted_at')) {
			await userDb.prepare(`UPDATE notification_outbox
				SET status = CASE WHEN provider_message_id IS NOT NULL THEN 'sent' ELSE 'unknown' END,
					last_error = 'Legacy provider attempt requires reconciliation',
					next_retry_at = NULL
				WHERE channel != 'internal' AND status IN ('pending', 'processing', 'failed', 'dead_letter')
					AND (provider_message_id IS NOT NULL OR status != 'pending' OR retry_count > 0)`).run();
		}
		for (const [name, definition] of [
			['text_content', 'TEXT'],
			['provider_attempted_at', 'TEXT'],
			['claimant_id', 'TEXT'],
			['lease_expires_at', 'TEXT'],
			['lease_version', 'INTEGER NOT NULL DEFAULT 0']
		]) {
			if (columns.has(name)) continue;
			try {
				await userDb.prepare(`ALTER TABLE notification_outbox ADD COLUMN ${name} ${definition}`).run();
			} catch (_) {
				// Another initializer may have added this column. Only that race is safe.
				const current = await userDb.prepare("PRAGMA table_info('notification_outbox')").all();
				if (!current.results.some(row => row.name === name)) throw new Error('Notice schema migration failed');
			}
		}
		await userDb.prepare('CREATE INDEX IF NOT EXISTS idx_outbox_status_retry ON notification_outbox(status, next_retry_at)').run();
		await userDb.prepare('CREATE INDEX IF NOT EXISTS idx_outbox_provider_message ON notification_outbox(provider_message_id)').run();
		await mailDb.prepare(`CREATE TABLE IF NOT EXISTS notice_delivery_receipt (
			task_id TEXT PRIMARY KEY NOT NULL,
			message_id TEXT UNIQUE NOT NULL,
			email_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`).run();
	} catch (_) {
		// D1 errors can include SQL/bound values; do not expose them to logs/API.
		throw new Error('Notice delivery schema initialization failed');
	}
}
