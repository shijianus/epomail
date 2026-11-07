import { getMailDb, getUserDb } from './db-accessor.js';

/** Called only by cold-start/upgrade migrations, never from mail requests. */
export async function ensureMailReliabilitySchema(c) {
	const db = getMailDb(c);
	await db.prepare(`CREATE TABLE IF NOT EXISTS mail_transaction_guard (
		token TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid = 1)
	)`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS mail_receive_claim (
		claim_key TEXT PRIMARY KEY,
		recipient TEXT NOT NULL,
		message_id TEXT NOT NULL DEFAULT '',
		raw_sha256 TEXT NOT NULL,
		content_sha256 TEXT,
		raw_object_key TEXT NOT NULL,
		raw_expires_at INTEGER NOT NULL,
		account_id INTEGER NOT NULL DEFAULT 0,
		user_id INTEGER NOT NULL DEFAULT 0,
		state TEXT NOT NULL CHECK (state IN ('CLAIMED','SAVING','COMPLETE','RETRY','FAILED')),
		lease_token TEXT,
		lease_until INTEGER NOT NULL DEFAULT 0,
		email_id INTEGER,
		reserved_bytes INTEGER NOT NULL DEFAULT 0,
		reserved_count INTEGER NOT NULL DEFAULT 0,
		attempts INTEGER NOT NULL DEFAULT 0,
		last_error TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`).run();
	const claims = await db.prepare(`PRAGMA table_info('mail_receive_claim')`).all();
	if (!(claims.results || []).some(column => column.name === 'reserved_count')) {
		await db.prepare(`ALTER TABLE mail_receive_claim ADD COLUMN reserved_count INTEGER NOT NULL DEFAULT 0`).run();
	}
	if (!(claims.results || []).some(column => column.name === 'content_sha256')) {
		await db.prepare(`ALTER TABLE mail_receive_claim ADD COLUMN content_sha256 TEXT`).run();
	}
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_receive_claim_lease ON mail_receive_claim(state, lease_until)`).run();
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_receive_claim_expiry ON mail_receive_claim(raw_expires_at)`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS mail_outbound_task (
		task_id TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL,
		idempotency_key TEXT NOT NULL,
		content_hash TEXT NOT NULL,
		state TEXT NOT NULL CHECK (state IN ('PREPARED','SENDING','ACCEPTED','UNKNOWN','FAILED')),
		provider TEXT NOT NULL DEFAULT '',
		payload_json TEXT NOT NULL DEFAULT '{}',
		lease_token TEXT,
		lease_until INTEGER NOT NULL DEFAULT 0,
		email_id INTEGER,
		provider_id TEXT,
		quota_reconciled INTEGER NOT NULL DEFAULT 0,
		reserved_bytes INTEGER NOT NULL DEFAULT 0,
		reserved_count INTEGER NOT NULL DEFAULT 0,
		last_error TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, account_id, idempotency_key)
	)`).run();
	const tasks = await db.prepare(`PRAGMA table_info('mail_outbound_task')`).all();
	const taskColumns = new Set((tasks.results || []).map(column => column.name));
	for (const [column, ddl] of [
		['payload_json', "TEXT NOT NULL DEFAULT '{}'"],
		['reserved_count', 'INTEGER NOT NULL DEFAULT 0'],
		['quota_reconciled', 'INTEGER NOT NULL DEFAULT 0'],
		['lease_token', 'TEXT'],
		['lease_until', 'INTEGER NOT NULL DEFAULT 0']
	]) {
		if (!taskColumns.has(column)) await db.prepare(`ALTER TABLE mail_outbound_task ADD COLUMN ${column} ${ddl}`).run();
	}
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_outbound_task_state ON mail_outbound_task(state, updated_at)`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS mail_local_delivery (
		task_id TEXT NOT NULL,
		recipient TEXT NOT NULL,
		email_id INTEGER,
		state TEXT NOT NULL CHECK(state IN ('DELIVERED','BOUNCED')),
		reason TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY(task_id, recipient)
	)`).run();
	// A received message can be forwarded to several targets. Keep one durable
	// row per target so a provider outage or a process restart cannot silently
	// lose an attachment-bearing forwarding copy.
	await db.prepare(`CREATE TABLE IF NOT EXISTS mail_forward_task (
		task_id TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL,
		email_id INTEGER NOT NULL,
		target TEXT NOT NULL,
		add_prefix INTEGER NOT NULL DEFAULT 0,
		state TEXT NOT NULL CHECK (state IN ('PENDING','SENDING','SENT','FAILED')),
		attempts INTEGER NOT NULL DEFAULT 0,
		next_retry_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		lease_token TEXT,
		lease_until INTEGER NOT NULL DEFAULT 0,
		last_error TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, email_id, target)
	)`).run();
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_forward_task_due
		ON mail_forward_task(state, next_retry_at)`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS object_deletion_queue (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		object_key TEXT NOT NULL,
		user_id INTEGER NOT NULL DEFAULT 0,
		attempts INTEGER NOT NULL DEFAULT 0,
		status TEXT NOT NULL DEFAULT 'pending',
		last_error TEXT,
		next_retry_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(object_key, user_id)
	)`).run();
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_object_deletion_queue_due ON object_deletion_queue(status, next_retry_at)`).run();
	await getUserDb(c).prepare(`CREATE TABLE IF NOT EXISTS mail_send_quota_reservation (
		task_id TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL,
		quantity INTEGER NOT NULL,
		quota_day TEXT NOT NULL,
		is_daily INTEGER NOT NULL DEFAULT 0,
		state TEXT NOT NULL CHECK(state IN ('reserved','released'))
	)`).run();
	return db;
}

export default ensureMailReliabilitySchema;
