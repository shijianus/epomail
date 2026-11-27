import { ensureSendQuotaPeriods } from './send-quota-period.js';
import { getMailDb, getUserDb } from './db-accessor.js';

/** Called only by cold-start/upgrade migrations, never from mail requests. */
export async function ensureMailReliabilitySchema(c) {
	const db = getMailDb(c);
	await db.prepare(`CREATE TABLE IF NOT EXISTS mail_ingress_stat (
		metric TEXT PRIMARY KEY, total INTEGER NOT NULL DEFAULT 0
	)`).run();
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
		cleanup_retry_at INTEGER NOT NULL DEFAULT 0,
		cleanup_attempts INTEGER NOT NULL DEFAULT 0,
		cleanup_review_at INTEGER NOT NULL DEFAULT 0,
		generation INTEGER NOT NULL DEFAULT 0,
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
	for (const column of ['cleanup_retry_at', 'cleanup_review_at', 'generation']) {
		if (!(claims.results || []).some(existing => existing.name === column)) {
			await db.prepare(`ALTER TABLE mail_receive_claim ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`).run();
		}
	}
	if (!(claims.results || []).some(column => column.name === 'cleanup_attempts')) {
		await db.batch([
			db.prepare('ALTER TABLE mail_receive_claim ADD COLUMN cleanup_attempts INTEGER NOT NULL DEFAULT 0'),
			db.prepare(`UPDATE mail_receive_claim SET cleanup_attempts = 1 WHERE raw_object_key <> ''
				AND cleanup_retry_at > 0 AND last_error = 'raw_cleanup_failed'`)
		]);
	}
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_receive_claim_lease ON mail_receive_claim(state, lease_until)`).run();
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_receive_claim_expiry ON mail_receive_claim(raw_expires_at)`).run();
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_receive_claim_cleanup_due
		ON mail_receive_claim(MAX(raw_expires_at, cleanup_retry_at)) WHERE raw_object_key <> '' AND cleanup_review_at = 0`).run();
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_receive_claim_cleanup_failures
		ON mail_receive_claim(cleanup_review_at) WHERE raw_object_key <> '' AND cleanup_attempts > 0`).run();
	await db.prepare(`DROP INDEX IF EXISTS idx_mail_receive_claim_cleanup`).run();
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_receive_claim_message
		ON mail_receive_claim(recipient, message_id, generation)`).run();
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mail_receive_claim_content
		ON mail_receive_claim(recipient, content_sha256, generation) WHERE message_id = ''`).run();
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
		counted_day TEXT,
		counted_recipients INTEGER NOT NULL DEFAULT 0,
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
		['counted_day', 'TEXT'],
		['counted_recipients', 'INTEGER NOT NULL DEFAULT 0'],
		['lease_token', 'TEXT'],
		['lease_until', 'INTEGER NOT NULL DEFAULT 0']
	]) {
		if (taskColumns.has(column)) continue;
		try {
			await db.prepare(`ALTER TABLE mail_outbound_task ADD COLUMN ${column} ${ddl}`).run();
		} catch (cause) {
			if (!/duplicate column name/i.test(cause.message)) throw cause;
			const fresh = await db.prepare("PRAGMA table_info('mail_outbound_task')").all();
			if (!fresh.results?.some(field => field.name === column)) throw cause;
		}
	}
	await db.prepare('CREATE INDEX IF NOT EXISTS idx_mail_counted_day ON mail_outbound_task(counted_day,counted_recipients) WHERE counted_day IS NOT NULL').run();
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
	await db.prepare(`CREATE TABLE IF NOT EXISTS mail_forward_policy (user_id INTEGER PRIMARY KEY, revision TEXT NOT NULL, preferences TEXT NOT NULL)`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS mail_forward_task (
		task_id TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL,
		email_id INTEGER NOT NULL,
		target TEXT NOT NULL,
		add_prefix INTEGER NOT NULL DEFAULT 0,
		policy_revision TEXT NOT NULL DEFAULT 'legacy',
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
	const forwardColumns = await db.prepare("PRAGMA table_info('mail_forward_task')").all();
	if (!(forwardColumns.results || []).some(col => col.name === 'policy_revision')) {
		await db.prepare("ALTER TABLE mail_forward_task ADD COLUMN policy_revision TEXT NOT NULL DEFAULT 'legacy'").run();
	}
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
		quota_generation INTEGER,
		is_daily INTEGER NOT NULL DEFAULT 0,
		state TEXT NOT NULL CHECK(state IN ('reserved','released'))
	)`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS mail_welcome_receipt (
		user_id INTEGER PRIMARY KEY NOT NULL, email_id INTEGER
	) WITHOUT ROWID`).run();
	await db.prepare(`CREATE TABLE IF NOT EXISTS mail_global_receipt (
		user_id INTEGER NOT NULL, campaign_id TEXT NOT NULL, PRIMARY KEY (user_id,campaign_id)
	) WITHOUT ROWID`).run();
	const userDb = getUserDb(c);
	await userDb.batch([
		userDb.prepare(`CREATE TABLE IF NOT EXISTS mail_global_operation (
			owner_id INTEGER NOT NULL, operation_id TEXT NOT NULL, content_hash TEXT NOT NULL, broadcast_id TEXT NOT NULL UNIQUE,
			target_count INTEGER NOT NULL DEFAULT 0, delivered INTEGER NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY(owner_id,operation_id)
		) WITHOUT ROWID`),
		userDb.prepare(`CREATE TABLE IF NOT EXISTS mail_global_audience (
			broadcast_id TEXT NOT NULL,user_id INTEGER NOT NULL,resolved INTEGER NOT NULL DEFAULT 0,delivered INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY(broadcast_id,user_id)
		) WITHOUT ROWID`),
		userDb.prepare('CREATE INDEX IF NOT EXISTS idx_global_pending ON mail_global_audience(broadcast_id,resolved,user_id)')
	]);
	await ensureSendQuotaPeriods(userDb);
	return db;
}

// Global announcements and security notices use different server-written metadata.
// Never promote legacy messages to official based on a sender address or labels.
export const LEGACY_WELCOME_PREDICATE = `is_official=1 AND type=0
	AND send_email='announcement@epocanvas.com' AND labels='["官方","代办"]'
	AND COALESCE(message_id,'')='' AND receive_claim_key IS NULL AND outbound_task_id IS NULL`;

export async function backfillWelcomeReceipts(c) {
	await getMailDb(c).prepare(`INSERT INTO mail_welcome_receipt(user_id,email_id)
		SELECT user_id, MAX(email_id) FROM email WHERE user_id>0 AND ${LEGACY_WELCOME_PREDICATE}
		GROUP BY user_id ON CONFLICT(user_id) DO UPDATE SET email_id=excluded.email_id
		WHERE mail_welcome_receipt.email_id IS NULL`).run();
}

export default ensureMailReliabilitySchema;
