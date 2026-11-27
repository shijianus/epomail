import { getUserDb, getMailDb } from '../utils/db-accessor.js';

// D1 arbitrates across isolates. Do not expire a live migration's lock: a slow
// statement could otherwise keep writing after another initializer takes over.
// After a killed runtime, operators must verify it has stopped before clearing
// the row. Normal failures and successful runs always release it in finally.
export async function withInitializationLock(c, migrate) {
	const db = getUserDb(c);
	await db.prepare(`CREATE TABLE IF NOT EXISTS schema_init_lock (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		owner TEXT NOT NULL,
		started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`).run();
	const owner = crypto.randomUUID();
	const acquired = await db.prepare(`INSERT INTO schema_init_lock (id, owner) VALUES (1, ?)
		ON CONFLICT(id) DO NOTHING RETURNING owner`).bind(owner).first();
	if (!acquired) return c.text('Initialization is already running', 409);
	try {
		return await migrate();
	} finally {
		await db.prepare('DELETE FROM schema_init_lock WHERE id = 1 AND owner = ?').bind(owner).run();
	}
}

const USER_TABLES = {
	user: ['user_id', 'email', 'auth_version', 'passkey_history', 'totp_secret'],
	role: ['role_id', 'role_code', 'is_default'],
	perm: ['perm_id', 'perm_key'],
	role_perm: ['role_id', 'perm_id'],
	setting: ['oauth_providers', 'secret_key', 'resend_tokens'],
	setting_ext: ['key', 'value'],
	oauth: ['oauth_user_id', 'user_id'],
	oauth_bind_claim: ['oauth_user_id', 'claim_token', 'expires_at'],
	oauth_one_time_credential: ['token_hash', 'consumed', 'expires_at'],
	oauth_identity_audit: ['audit_id', 'user_id'],
	oauth_app: ['client_id', 'client_secret'],
	oauth_grant: ['user_id', 'client_id'],
	user_session: ['user_id', 'token', 'expires_at'],
	session_revocation: ['user_id', 'expires_at'],
	auth_security_operation: ['expires_at'],
	rate_limit_counter: ['expires_at'],
	audit_log: ['id', 'version', 'status'],
	audit_decision: ['decision_id', 'expected_version', 'expected_status'],
	notification_outbox: ['task_id', 'claimant_id', 'lease_version'],
	mail_send_quota_reservation: ['task_id', 'user_id'],
};

const MAIL_TABLES = {
	email: ['email_id', 'user_id', 'is_official', 'receive_claim_key', 'outbound_task_id'],
	account: ['account_id', 'user_id', 'email'],
	attachments: ['email_id', 'user_id', 'key'],
	star: ['user_id', 'email_id'],
	mail_receive_claim: ['claim_key', 'state', 'lease_until'],
	mail_outbound_task: ['task_id', 'state', 'lease_until'],
	object_deletion_queue: ['object_key', 'user_id', 'status'],
	notice_delivery_receipt: ['email_id', 'user_id', 'message_id'],
};

// Validate unique constraints too: IF NOT EXISTS accepts a same-named,
// non-unique index, which would silently leave identity/idempotency unprotected.
const USER_INDEXES = [
	['idx_user_email_nocase', 'user', ['email'], true, 'NOCASE'],
	['idx_oauth_user_id_unique', 'oauth', ['oauth_user_id'], true],
	['idx_oauth_bind_claim_expires', 'oauth_bind_claim', ['expires_at']],
	['idx_oauth_otc_expires', 'oauth_one_time_credential', ['expires_at']],
	['idx_user_session_uid_seq', 'user_session', ['user_id', 'seq']],
	['idx_role_perm_membership', 'role_perm', ['role_id', 'perm_id']],
	['idx_outbox_status_retry', 'notification_outbox', ['status', 'next_retry_at']],
];
const MAIL_INDEXES = [
	['idx_account_email_nocase', 'account', ['email'], true, 'NOCASE'],
	['idx_email_receive_claim', 'email', ['receive_claim_key'], true],
	['idx_email_outbound_task', 'email', ['outbound_task_id'], true],
	['idx_email_user_page', 'email', ['user_id', 'email_id']],
	['idx_attachments_key', 'attachments', ['key']],
	['idx_mail_receive_claim_lease', 'mail_receive_claim', ['state', 'lease_until']],
	['idx_mail_outbound_task_state', 'mail_outbound_task', ['state', 'updated_at']],
	['idx_object_deletion_queue_due', 'object_deletion_queue', ['status', 'next_retry_at']],
];

async function verifyDatabase(db, domain, tables, indexes) {
	for (const [table, columns] of Object.entries(tables)) {
		const { results } = await db.prepare(`PRAGMA table_info('${table}')`).all();
		const names = new Set(results.map(column => column.name));
		for (const column of columns) {
			if (!names.has(column)) throw new Error(`Migration verification failed: ${domain}.${table}.${column}`);
		}
	}
	for (const [name, table, columns, unique = false, collation] of indexes) {
		const { results } = await db.prepare(`PRAGMA index_list('${table}')`).all();
		const index = results.find(row => row.name === name);
		if (!index || Boolean(index.unique) !== unique) {
			throw new Error(`Migration verification failed: ${domain}.${name}`);
		}
		const info = await db.prepare(`PRAGMA index_xinfo('${name}')`).all();
		const keys = info.results.filter(row => row.key === 1);
		if (JSON.stringify(keys.map(row => row.name)) !== JSON.stringify(columns)
			|| (collation && keys.some(row => row.coll !== collation))) {
			throw new Error(`Migration verification failed: ${domain}.${name} definition`);
		}
	}
}

export async function verifyMigrationSchema(c) {
	await verifyDatabase(getUserDb(c), 'user', USER_TABLES, USER_INDEXES);
	await verifyDatabase(getMailDb(c), 'mail', MAIL_TABLES, MAIL_INDEXES);
}
